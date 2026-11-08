import unicodedata
from pathlib import Path
from urllib.parse import quote
from decimal import Decimal
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.audit import write_audit
from app.modules.catalog import repository
from app.modules.inventory.service import close_batches_for_product, available_batches, available_quantity
from app.models import Category, Product, User
from app.schemas import CategoryIn, ProductIn, ProductUpdateIn
from app.modules.pricing.service import unit_price

PRODUCT_MEDIA_DIR = Path(__file__).resolve().parents[2] / "media" / "products"


def product_image_url(product: Product) -> str | None:
    if product.image_url and not ("localhost:3000/images/" in product.image_url):
        return product.image_url
    if not PRODUCT_MEDIA_DIR.is_dir():
        return None

    def normalize(value: str) -> str:
        value = unicodedata.normalize("NFD", value.lower().replace("đ", "d"))
        return " ".join("".join(char for char in value if not unicodedata.combining(char)).replace("-", " ").split())

    name = normalize(product.name)
    candidates = [(path, normalize(path.stem)) for path in PRODUCT_MEDIA_DIR.rglob("*") if path.is_file()]
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
        match = next(((path, value) for path, value in candidates if value == stem and normalize(path.parent.name) == folder), None)
        if match:
            relative = match[0].relative_to(PRODUCT_MEDIA_DIR).as_posix()
            return "/media/products/" + quote(relative, safe="/")

    match = next(((path, stem) for path, stem in candidates if stem == name), None)
    if match is None:
        match = next(((path, stem) for path, stem in candidates if stem and name.startswith(stem + " ")), None)
    if match is None:
        first_word = name.split(" ", 1)[0]
        match = next(((path, stem) for path, stem in candidates if stem == first_word or stem.startswith(first_word + " ")), None)
    if match is None:
        return None

    relative = match[0].relative_to(PRODUCT_MEDIA_DIR).as_posix()
    return "/media/products/" + quote(relative, safe="/")


def product_out(db: Session, product: Product, user: User | None = None) -> dict:
    shop = db.get(User, product.shop_id) if product.shop_id else None
    price_for_user = unit_price(db, product, user.customer_group) if user else product.base_price

    result = {
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
        "is_active": product.is_active,
        "shop_id": product.shop_id,
        "shop_name": shop.shop_name or shop.full_name if shop else None,
        "available_quantity": available_quantity(db, product.id),
        "batches": [],
    }

    if user:
        result["batches"] = available_batches(db, product.id)

    return result


def list_categories(db: Session):
    return repository.list_categories(db)


def create_category(db: Session, payload: CategoryIn | str, admin: User):
    if isinstance(payload, str):
        cat_data = {"name": payload.strip()}
    else:
        cat_data = payload.model_dump()
        cat_data["name"] = cat_data["name"].strip()
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


def list_products(db: Session, category_id: int | None = None, shop_id: int | None = None):
    prods = repository.list_products(db, category_id)
    if shop_id:
        prods = [p for p in prods if p.shop_id == shop_id]
    return [product_out(db, product) for product in prods]


def customer_catalog(db: Session, category_id: int | None, user: User, shop_id: int | None = None):
    prods = repository.list_products(db, category_id)
    if shop_id:
        prods = [p for p in prods if p.shop_id == shop_id]
    return [product_out(db, product, user) for product in prods]


def create_product(db: Session, payload: ProductIn, operator: User):
    if payload.category_id and repository.get_category(db, payload.category_id) is None:
        raise HTTPException(404, "Không tìm thấy danh mục")

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
