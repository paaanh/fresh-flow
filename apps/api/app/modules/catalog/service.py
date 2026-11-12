from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote
from decimal import Decimal
import unicodedata
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.audit import write_audit
from app.modules.catalog import repository
from app.modules.inventory.service import close_batches_for_product
from app.modules.pricing.service import apply_sale, sale_status
from app.models import Category, CustomerGroup, InventoryBatch, PriceRule, Product, User
from app.schemas import CategoryIn, ProductIn, ProductUpdateIn

PRODUCT_MEDIA_DIR = Path(__file__).resolve().parents[2] / "media" / "products"

_MEDIA_CANDIDATES_CACHE: list[tuple[str, str, str]] | None = None
_MEDIA_CACHE_MTIME: float | None = None


def _accented_name(value: str) -> str:
    """Lower-case name that keeps Vietnamese accents ("dưa" and "dứa" stay different)."""
    return " ".join(unicodedata.normalize("NFC", value.lower()).replace("-", " ").split())


def _normalize_media_name(value: str) -> str:
    value = unicodedata.normalize("NFD", value.lower().replace("đ", "d"))
    return " ".join("".join(char for char in value if not unicodedata.combining(char)).replace("-", " ").split())


def _get_media_candidates() -> list[tuple[str, str, str, str]]:
    """Cache normalized media file metadata to avoid repeated recursive disk walks per product."""
    global _MEDIA_CANDIDATES_CACHE, _MEDIA_CACHE_MTIME
    if not PRODUCT_MEDIA_DIR.is_dir():
        return []
    try:
        current_mtime = PRODUCT_MEDIA_DIR.stat().st_mtime
    except OSError:
        current_mtime = None
    if _MEDIA_CANDIDATES_CACHE is not None and _MEDIA_CACHE_MTIME == current_mtime:
        return _MEDIA_CANDIDATES_CACHE

    items: list[tuple[str, str, str, str]] = []
    for path in PRODUCT_MEDIA_DIR.rglob("*"):
        if path.is_file():
            rel = "/media/products/" + quote(path.relative_to(PRODUCT_MEDIA_DIR).as_posix(), safe="/")
            items.append((rel, _normalize_media_name(path.stem), _normalize_media_name(path.parent.name), _accented_name(path.stem)))
    _MEDIA_CANDIDATES_CACHE = items
    _MEDIA_CACHE_MTIME = current_mtime
    return items


def product_image_url(product: Product) -> str | None:
    if product.image_url and not ("localhost:3000/images/" in product.image_url):
        return product.image_url
    candidates = _get_media_candidates()
    if not candidates:
        return None

    name = _normalize_media_name(product.name)
    legacy_images = {
        "kale.jpg": ("cai xanh", "rau"),
        "avocado.jpg": ("bo", "hoa qua"),
        "banana.jpg": ("chuoi", "hoa qua"),
        "eggs.jpg": ("khay trung ga", "thit ca"),
    }
    aliases = {
        "rau cai kale": ("cai xanh", "rau"),
        "bo sap": ("bo", "hoa qua"),
        "chuoi tieu": ("chuoi", "hoa qua"),
        "trung ga sach": ("khay trung ga", "thit ca"),
    }
    legacy_name = Path(product.image_url).name if product.image_url else ""
    alias = legacy_images.get(legacy_name) or aliases.get(name)

    if alias:
        stem, folder = alias
        match_url = next((url for url, s, p_dir, _ in candidates if s == stem and p_dir == folder), None)
        if match_url:
            return match_url

    # Accents matter: "Dưa leo" (cucumber) must not get "dứa" (pineapple).
    # Accent-free matching is only used for the whole name (a name typed without accents).
    accented = _accented_name(product.name)
    match_url = next((url for url, _, __, a in candidates if a == accented), None)
    if match_url is None:
        match_url = next((url for url, s, _, __ in candidates if s == name), None)
    if match_url is None:
        match_url = next((url for url, _, __, a in candidates if a and accented.startswith(a + " ")), None)
    if match_url is None:
        # Vietnamese words are mostly two syllables: "cà chua" ≠ "cà rốt", "đậu bắp" ≠ "đậu hà lan".
        # No photo is better than a wrong one (the app then shows its default picture).
        head = " ".join(accented.split()[:2])
        match_url = next((url for url, _, __, a in candidates if a == head or a.startswith(head + " ")), None)
    if match_url is None:
        # a one-syllable photo name is still safe: "cam sành" → "cam", but never "cà chua" → "cà rốt"
        first = accented.split(" ", 1)[0]
        match_url = next((url for url, _, __, a in candidates if a == first), None)
    if match_url is None:
        # common synonyms in the photo library
        synonyms = {"dưa leo": "dưa chuột", "dưa chuột": "dưa leo", "khoai mì": "sắn", "trái thơm": "dứa", "thơm": "dứa", "bắp": "ngô", "ngô": "bắp"}
        other = next((v for k, v in synonyms.items() if accented == k or accented.startswith(k + " ")), None)
        if other:
            match_url = next((url for url, _, __, a in candidates if a == other or a.startswith(other + " ")), None)
    return match_url


def _products_out_batch(db: Session, prods: list[Product], user: User | None = None) -> list[dict]:
    """Serialize a list of products in constant queries (no N+1 per-product queries)."""
    if not prods:
        return []

    product_ids = [p.id for p in prods if p.id is not None]
    shop_ids = {p.shop_id for p in prods if p.shop_id}
    shops_map: dict[int, User] = (
        {u.id: u for u in db.scalars(select(User).where(User.id.in_(shop_ids))).all()}
        if shop_ids
        else {}
    )

    batches_by_product: dict[int, list[InventoryBatch]] = {}
    if product_ids:
        all_batches = db.scalars(
            select(InventoryBatch)
            .where(InventoryBatch.product_id.in_(product_ids), InventoryBatch.is_open.is_(True))
            .order_by(InventoryBatch.batch_date.asc(), InventoryBatch.id.asc())
        ).all()
        for batch in all_batches:
            batches_by_product.setdefault(batch.product_id, []).append(batch)

    rule_map: dict[int, Decimal] = {}
    group_discount_mult: Decimal | None = None
    if user and user.customer_group and product_ids:
        rules = db.scalars(
            select(PriceRule).where(
                PriceRule.product_id.in_(product_ids),
                PriceRule.customer_group == user.customer_group,
            )
        ).all()
        rule_map = {r.product_id: r.unit_price for r in rules}
        grp = db.scalar(
            select(CustomerGroup).where(
                CustomerGroup.code == user.customer_group,
                CustomerGroup.is_active.is_(True),
            )
        )
        if grp and grp.discount_percent and grp.discount_percent > Decimal("0"):
            group_discount_mult = (Decimal("100") - grp.discount_percent) / Decimal("100")

    results: list[dict] = []
    for product in prods:
        shop = shops_map.get(product.shop_id) if product.shop_id else None
        if user:
            if product.id in rule_map:
                list_price = rule_map[product.id]
            elif group_discount_mult is not None:
                list_price = (product.base_price * group_discount_mult).quantize(Decimal("1.00"))
            else:
                list_price = product.base_price
        else:
            list_price = product.base_price
        price_for_user = apply_sale(product, list_price)

        open_batches = batches_by_product.get(product.id, [])
        avail_qty = sum((b.available_quantity for b in open_batches), Decimal("0"))
        stock_qty = sum((b.initial_quantity for b in open_batches), Decimal("0"))
        reserved_qty = sum((b.approved_quantity for b in open_batches), Decimal("0"))
        batch_list = (
            [
                {
                    "id": b.id,
                    "batch_date": b.batch_date,
                    "is_open": b.is_open,
                    "available_quantity": b.available_quantity,
                }
                for b in open_batches
                if b.available_quantity > 0
            ]
            if user
            else []
        )

        results.append(
            {
                "id": product.id,
                "name": product.name,
                "description": product.description or "",
                "category_id": product.category_id,
                "unit": product.unit,
                "image_url": product_image_url(product),
                "images": product.images or "",
                "attached_services": product.attached_services or "",
                "base_price": product.base_price,
                "customer_price": price_for_user,
                "list_price": list_price,
                "sale_price": product.sale_price,
                "sale_start_at": product.sale_start_at,
                "sale_end_at": product.sale_end_at,
                "sale_status": sale_status(product),
                "is_active": product.is_active,
                "shop_id": product.shop_id,
                "shop_name": (shop.shop_name or shop.full_name) if shop else None,
                "available_quantity": avail_qty,
                "stock_quantity": stock_qty,
                "reserved_quantity": reserved_qty,
                "batches": batch_list,
            }
        )
    return results


def product_out(db: Session, product: Product, user: User | None = None) -> dict:
    return _products_out_batch(db, [product], user)[0]


def list_categories(db: Session):
    return repository.list_categories(db)


def _check_parent(db: Session, category_id: int | None, parent_id: int | None) -> None:
    """The parent must exist, be active, and not be the category itself or one of its children."""
    if parent_id is None:
        return
    parent = db.get(Category, parent_id)
    if not parent or not parent.is_active:
        raise HTTPException(404, "Không tìm thấy danh mục cha")
    seen = set()
    node = parent
    while node is not None and node.id not in seen:
        if category_id is not None and node.id == category_id:
            raise HTTPException(422, "Không thể đặt danh mục làm con của chính nó hoặc danh mục con của nó")
        seen.add(node.id)
        node = db.get(Category, node.parent_id) if node.parent_id else None


def create_category(db: Session, payload: CategoryIn | str, admin: User):
    if isinstance(payload, str):
        cat_data = {"name": payload.strip()}
    else:
        cat_data = payload.model_dump()
        cat_data["name"] = cat_data["name"].strip()
    _check_parent(db, None, cat_data.get("parent_id"))
    # A deleted category keeps its (unique) name: bring it back instead of failing
    old = db.scalar(select(Category).where(Category.name == cat_data["name"]))
    if old is not None and not old.is_active:
        old.is_active = True
        old.parent_id = cat_data.get("parent_id")
        if cat_data.get("description") is not None:
            old.description = cat_data.get("description") or ""
        write_audit(db, admin.id, "category.restored", "category", str(old.id))
        db.commit()
        db.refresh(old)
        return old
    category = Category(**cat_data)
    repository.create_category(db, category)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Danh mục đã tồn tại") from exc

    db.refresh(category)
    write_audit(db, admin.id, "category.created", "category", str(category.id))
    db.commit()
    return category


def update_category(db: Session, category_id: int, payload, admin: User):
    category = db.get(Category, category_id)
    if not category or not category.is_active:
        raise HTTPException(404, "Không tìm thấy danh mục")
    data = payload.model_dump(exclude_unset=True)
    if "parent_id" in data:
        _check_parent(db, category.id, data["parent_id"])
        category.parent_id = data["parent_id"]
    if data.get("name"):
        category.name = data["name"].strip()
    if data.get("description") is not None:
        category.description = data["description"]
    try:
        write_audit(db, admin.id, "category.updated", "category", str(category.id))
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Tên danh mục đã tồn tại") from exc
    db.refresh(category)
    return category


def delete_category(db: Session, category_id: int, admin: User):
    """Hide a category. Its sub-categories and products move up to its parent;
    a top-level category that still holds products cannot be deleted."""
    category = db.get(Category, category_id)
    if not category or not category.is_active:
        raise HTTPException(404, "Không tìm thấy danh mục")
    products = db.scalars(select(Product).where(Product.category_id == category.id, Product.is_active.is_(True))).all()
    if products and category.parent_id is None:
        raise HTTPException(
            409,
            f'Danh mục "{category.name}" còn {len(products)} sản phẩm. Chuyển các sản phẩm sang danh mục khác (hoặc đặt danh mục này làm danh mục con) rồi xóa lại.',
        )
    if admin.role == "SHOP" and any(p.shop_id not in (None, admin.id) for p in products):
        raise HTTPException(403, "Danh mục đang chứa sản phẩm của Shop khác — vui lòng liên hệ Quản trị viên")
    for product in products:
        product.category_id = category.parent_id
    for child in db.scalars(select(Category).where(Category.parent_id == category.id)).all():
        child.parent_id = category.parent_id
    category.is_active = False
    write_audit(db, admin.id, "category.deleted", "category", str(category.id), f"moved {len(products)} products")
    db.commit()
    return {"deleted": category.id, "moved_products": len(products), "moved_to": category.parent_id}


def create_products_bulk(db: Session, payload, operator: User):
    """Create many products (and their opening stock) in one go — all or nothing."""
    names = [i.name.strip().lower() for i in payload.items]
    dupes = sorted({n for n in names if names.count(n) > 1})
    if dupes:
        raise HTTPException(422, f"Tên bị trùng trong danh sách: {', '.join(dupes)}")
    created = []
    for index, item in enumerate(payload.items, start=1):
        if item.category_id is not None:
            cat = db.get(Category, item.category_id)
            if not cat or not cat.is_active:
                raise HTTPException(422, f"Dòng {index}: danh mục không tồn tại")
        product = Product(
            name=item.name.strip(),
            description=item.description or "",
            category_id=item.category_id,
            unit=(item.unit or "kg").strip() or "kg",
            base_price=item.base_price,
            image_url=(item.image_url or "").strip() or None,
            shop_id=operator.id if operator.role == "SHOP" else None,
            is_active=True,
        )
        db.add(product)
        db.flush()
        if item.initial_stock and item.initial_stock > 0:
            db.add(InventoryBatch(
                product_id=product.id,
                batch_date=datetime.now(timezone.utc),
                initial_quantity=item.initial_stock,
                approved_quantity=Decimal("0"),
                is_open=True,
            ))
        created.append(product)
    write_audit(db, operator.id, "product.bulk_created", "product", ",".join(str(p.id) for p in created))
    db.commit()
    return [product_out(db, p) for p in created]


def list_products(db: Session, category_id: int | None = None, shop_id: int | None = None):
    prods = repository.list_products(db, category_id)
    if shop_id:
        prods = [p for p in prods if p.shop_id == shop_id]
    return _products_out_batch(db, prods)


def customer_catalog(db: Session, category_id: int | None, user: User, shop_id: int | None = None):
    prods = repository.list_products(db, category_id)
    if shop_id:
        prods = [p for p in prods if p.shop_id == shop_id]
    return _products_out_batch(db, prods, user)


def _validate_sale(product: Product) -> None:
    if product.sale_price is None:
        return
    if product.sale_price >= product.base_price:
        raise HTTPException(422, "Giá Sale phải thấp hơn giá gốc")
    start, end = product.sale_start_at, product.sale_end_at
    if start and end:
        # SQLite trả về datetime không có múi giờ — so sánh trên cùng một chuẩn
        s_cmp = start.replace(tzinfo=None) if start.tzinfo is None or end.tzinfo is None else start
        e_cmp = end.replace(tzinfo=None) if start.tzinfo is None or end.tzinfo is None else end
        if e_cmp <= s_cmp:
            raise HTTPException(422, "Thời gian kết thúc Sale phải sau thời gian bắt đầu")


def create_product(db: Session, payload: ProductIn, operator: User):
    if payload.category_id and repository.get_category(db, payload.category_id) is None:
        raise HTTPException(404, "Không tìm thấy danh mục")
    _validate_sale(Product(**payload.model_dump(exclude={"shop_id"})))

    prod_data = payload.model_dump()
    if operator.role == "SHOP":
        prod_data["shop_id"] = operator.id

    product = repository.create_product(db, Product(**prod_data))
    write_audit(db, operator.id, "product.created", "product", str(product.id))
    db.commit()
    db.refresh(product)
    return product_out(db, product)


def update_product(db: Session, product_id: int, payload: ProductUpdateIn, operator: User):
    product = repository.get_product(db, product_id)
    if not product:
        raise HTTPException(404, "Không tìm thấy sản phẩm")

    if operator.role == "SHOP" and product.shop_id != operator.id:
        raise HTTPException(403, "Bạn chỉ có thể chỉnh sửa sản phẩm do Shop của bạn tạo")

    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is None and key in {"name", "unit", "base_price", "is_active", "description", "images", "attached_services"}:
            continue
        if key == "category_id" and value is not None and (repository.get_category(db, value) is None):
            raise HTTPException(404, "Không tìm thấy danh mục")
        setattr(product, key, value)
    if product.sale_price is None:
        product.sale_start_at = None
        product.sale_end_at = None
    _validate_sale(product)

    write_audit(db, operator.id, "product.updated", "product", str(product.id))
    db.commit()
    db.refresh(product)
    return product_out(db, product)


def deactivate_product(db: Session, product_id: int, operator: User):
    product = repository.get_product(db, product_id)
    if not product:
        raise HTTPException(404, "Không tìm thấy sản phẩm")

    if operator.role == "SHOP" and product.shop_id != operator.id:
        raise HTTPException(403, "Bạn không có quyền sửa sản phẩm của Shop khác")

    product.is_active = False
    close_batches_for_product(db, product_id)
    write_audit(db, operator.id, "product.deactivated", "product", str(product.id))
    db.commit()
