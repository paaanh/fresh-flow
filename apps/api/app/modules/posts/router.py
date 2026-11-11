import json
from datetime import datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.api.deps import get_db, get_current_user, require_admin_or_shop
from app.models import (
    Category,
    InventoryBatch,
    ModerationTerm,
    ModerationViolation,
    Post,
    PriceRule,
    Product,
    User,
)
from app.realtime import event, manager
from app.schemas import PostIn, PostOut

router = APIRouter(prefix="/posts", tags=["Posts & Newfeed"])


def _parse_group_prices(raw: str | dict | None) -> dict[str, Decimal]:
    if not raw:
        return {}
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
        if isinstance(data, dict):
            out: dict[str, Decimal] = {}
            for k, v in data.items():
                if v is not None and str(v).strip() != "":
                    out[str(k)] = Decimal(str(v))
            return out
    except Exception:
        pass
    return {}


def calculate_effective_price(post: Post, user: User | None, fallback_price: Decimal | None = None) -> Decimal | None:
    base = post.sale_price if post.sale_price is not None else fallback_price
    if not user or not post.group_prices:
        return base

    prices = _parse_group_prices(post.group_prices)
    if user.customer_group in prices:
        return prices[user.customer_group]

    return base


def _extract_product_ids(post: Post) -> list[int]:
    ids: list[int] = []
    if getattr(post, "product_ids", ""):
        try:
            parsed = json.loads(post.product_ids)
            if isinstance(parsed, list):
                for x in parsed:
                    val = int(x)
                    if val > 0 and val not in ids:
                        ids.append(val)
        except Exception:
            pass
    if post.product_id and post.product_id not in ids:
        ids.insert(0, post.product_id)
    return ids


def to_post_out(post: Post, db: Session, user: User | None = None) -> PostOut:
    author = db.get(User, post.author_id)
    prod_ids = _extract_product_ids(post)
    primary_product = db.get(Product, prod_ids[0]) if prod_ids else (db.get(Product, post.product_id) if post.product_id else None)
    post_gp = _parse_group_prices(post.group_prices)

    products_info: list[dict] = []
    for pid in prod_ids:
        prod = db.get(Product, pid)
        if not prod:
            continue
        cat = db.get(Category, prod.category_id) if prod.category_id else None
        batches = db.scalars(
            select(InventoryBatch).where(InventoryBatch.product_id == prod.id, InventoryBatch.is_open == True)
        ).all()
        avail = sum((b.available_quantity for b in batches), Decimal("0"))
        rules = db.scalars(select(PriceRule).where(PriceRule.product_id == prod.id)).all()
        rule_map = {r.customer_group: float(r.unit_price) for r in rules}
        for grp, val in post_gp.items():
            if grp not in rule_map:
                rule_map[grp] = float(val)

        user_grp = user.customer_group if user else "STUDENT"
        eff = rule_map.get(user_grp, float(post.sale_price if (pid == post.product_id and post.sale_price) else prod.base_price))
        products_info.append({
            "id": prod.id,
            "name": prod.name,
            "unit": prod.unit,
            "category_name": cat.name if cat else "Nông sản",
            "base_price": float(prod.base_price),
            "sale_price": float(post.sale_price) if (pid == post.product_id and post.sale_price) else eff,
            "effective_price": eff,
            "available_quantity": float(avail),
            "image_url": prod.image_url or "",
            "group_prices": {} if (user and user.role == "CUSTOMER") else rule_map,
        })

    original_price = primary_product.base_price if primary_product else post.sale_price
    effective_price = calculate_effective_price(post, user, original_price)

    return PostOut(
        id=post.id,
        author_id=post.author_id,
        author_name=author.full_name if author else None,
        shop_name=author.shop_name or author.full_name if author else None,
        title=post.title,
        content=post.content,
        post_type=post.post_type,
        product_id=primary_product.id if primary_product else post.product_id,
        product_ids=prod_ids,
        products_info=products_info,
        product_name=primary_product.name if primary_product else None,
        image_urls=post.image_urls,
        quantity_limit=post.quantity_limit,
        target_audience=post.target_audience,
        target_customer_group=post.target_customer_group,
        original_price=original_price,
        sale_price=post.sale_price or original_price,
        effective_price=effective_price,
        # Customers receive only their effective price, never the other customer groups' prices.
        group_prices="" if user and user.role == "CUSTOMER" else post.group_prices,
        order_start_at=post.order_start_at,
        order_end_at=post.order_end_at,
        delivery_time_text=post.delivery_time_text,
        is_active=post.is_active,
        created_at=post.created_at,
    )


def _materialize_post_products(db: Session, payload: PostIn, user: User) -> tuple[list[int], int]:
    collected_ids: list[int] = []
    for pid in (payload.product_ids or []):
        if pid and db.get(Product, int(pid)) and int(pid) not in collected_ids:
            collected_ids.append(int(pid))
    if payload.product_id and db.get(Product, int(payload.product_id)) and int(payload.product_id) not in collected_ids:
        collected_ids.insert(0, int(payload.product_id))

    post_gp = _parse_group_prices(payload.group_prices)
    first_post_image = next((u.strip() for u in (payload.image_urls or "").replace("\n", ",").split(",") if u.strip()), None)
    created_new_count = 0

    for np in (payload.new_products or []):
        name = str(np.get("name") or "").strip()
        if len(name) < 2:
            continue
        cat_name = str(np.get("category") or np.get("category_name") or "Nông sản").strip() or "Nông sản"
        cat_id = np.get("category_id")
        cat = db.get(Category, int(cat_id)) if cat_id else None
        if not cat:
            cat = db.scalar(select(Category).where(Category.name == cat_name))
        if not cat:
            cat = Category(name=cat_name, is_active=True)
            db.add(cat)
            db.flush()

        base_price = Decimal(str(np.get("base_price") or np.get("price") or payload.sale_price or 35000))
        stock_qty = Decimal(str(np.get("initial_stock") or np.get("stock") or np.get("quantity") or payload.quantity_limit or 50))
        unit = str(np.get("unit") or "kg").strip() or "kg"
        image_url = str(np.get("image_url") or "").strip() or first_post_image
        desc = str(np.get("description") or payload.title).strip()

        prod = Product(
            category_id=cat.id,
            shop_id=user.id if user.role == "SHOP" else np.get("shop_id"),
            name=name,
            description=desc,
            unit=unit,
            base_price=base_price,
            image_url=image_url,
            is_active=True,
        )
        db.add(prod)
        db.flush()

        if stock_qty > 0:
            db.add(
                InventoryBatch(
                    product_id=prod.id,
                    batch_date=datetime.now(timezone.utc),
                    initial_quantity=stock_qty,
                    approved_quantity=Decimal("0"),
                    is_open=True,
                )
            )

        item_gp = _parse_group_prices(np.get("group_prices")) or post_gp
        for grp_code, grp_price in item_gp.items():
            existing_rule = db.scalar(
                select(PriceRule).where(PriceRule.product_id == prod.id, PriceRule.customer_group == grp_code)
            )
            if existing_rule:
                existing_rule.unit_price = grp_price
            else:
                db.add(PriceRule(product_id=prod.id, customer_group=grp_code, unit_price=grp_price))
        db.flush()

        collected_ids.append(prod.id)
        created_new_count += 1

    # Also apply post group_prices to existing linked products if provided
    if post_gp and collected_ids:
        for pid in collected_ids:
            for grp_code, grp_price in post_gp.items():
                existing_rule = db.scalar(
                    select(PriceRule).where(PriceRule.product_id == pid, PriceRule.customer_group == grp_code)
                )
                if existing_rule:
                    existing_rule.unit_price = grp_price
                else:
                    db.add(PriceRule(product_id=pid, customer_group=grp_code, unit_price=grp_price))
            db.flush()

    return collected_ids, created_new_count


@router.get("", response_model=list[PostOut])
def list_posts(
    category_id: int | None = Query(default=None),
    shop_id: int | None = Query(default=None),
    post_type: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = select(Post).where(Post.is_active == True).order_by(Post.created_at.desc())

    if post_type:
        query = query.where(Post.post_type == post_type)
    if shop_id:
        query = query.where(Post.author_id == shop_id)
    if category_id:
        query = query.join(Product, Post.product_id == Product.id).where(Product.category_id == category_id)

    posts = db.scalars(query).all()

    # Filter based on audience if customer
    if user.role == "CUSTOMER":
        filtered = []
        for p in posts:
            if p.target_audience == "ALL":
                filtered.append(p)
            elif p.target_audience in {"GROUP", "COLLECTIVE", "CUSTOM_GROUP"}:
                if not p.target_customer_group or p.target_customer_group == user.customer_group:
                    filtered.append(p)
            elif p.target_audience == "INDIVIDUAL":
                if p.target_customer_group and p.target_customer_group == user.customer_group:
                    filtered.append(p)
        posts = filtered

    return [to_post_out(p, db, user) for p in posts]


@router.post("", response_model=PostOut, status_code=201)
async def create_post(
    payload: PostIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin_or_shop),
):
    active_terms = db.scalars(select(ModerationTerm.term).where(ModerationTerm.is_active == True)).all()
    for term in active_terms:
        if term and (term.lower() in payload.title.lower() or term.lower() in payload.content.lower()):
            violation = ModerationViolation(user_id=user.id, matched_term=term)
            db.add(violation)
            db.commit()
            raise HTTPException(status_code=400, detail=f"Nội dung bài viết chứa từ khóa vi phạm tiêu chuẩn cộng đồng: {term}")

    all_product_ids, created_new_count = _materialize_post_products(db, payload, user)
    primary_product_id = all_product_ids[0] if all_product_ids else None

    post = Post(
        author_id=user.id,
        title=payload.title,
        content=payload.content,
        post_type=payload.post_type,
        product_id=primary_product_id,
        product_ids=json.dumps(all_product_ids) if all_product_ids else "",
        image_urls=payload.image_urls,
        quantity_limit=payload.quantity_limit,
        target_audience=payload.target_audience,
        target_customer_group=payload.target_customer_group,
        sale_price=payload.sale_price,
        group_prices=payload.group_prices,
        order_start_at=payload.order_start_at,
        order_end_at=payload.order_end_at,
        delivery_time_text=payload.delivery_time_text,
        is_active=True,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    await manager.broadcast(event("post.created", {"post_id": post.id, "product_ids": all_product_ids}))
    if created_new_count > 0:
        await manager.broadcast(event("inventory.updated", {"product_ids": all_product_ids}))
    return to_post_out(post, db, user)


@router.patch("/{post_id}", response_model=PostOut)
async def update_post(
    post_id: int,
    payload: PostIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin_or_shop),
):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Không tìm thấy bài đăng")
    if user.role != "ADMIN" and post.author_id != user.id:
        raise HTTPException(403, "Bạn không có quyền sửa bài đăng này")

    all_product_ids, created_new_count = _materialize_post_products(db, payload, user)
    if not all_product_ids and post.product_id:
        all_product_ids = _extract_product_ids(post)

    post.title = payload.title
    post.content = payload.content
    post.post_type = payload.post_type
    post.product_id = all_product_ids[0] if all_product_ids else payload.product_id
    post.product_ids = json.dumps(all_product_ids) if all_product_ids else ""
    post.image_urls = payload.image_urls
    post.quantity_limit = payload.quantity_limit
    post.target_audience = payload.target_audience
    post.target_customer_group = payload.target_customer_group
    post.sale_price = payload.sale_price
    post.group_prices = payload.group_prices
    post.order_start_at = payload.order_start_at
    post.order_end_at = payload.order_end_at
    post.delivery_time_text = payload.delivery_time_text

    db.commit()
    db.refresh(post)
    await manager.broadcast(event("post.updated", {"post_id": post.id, "product_ids": all_product_ids}))
    if created_new_count > 0:
        await manager.broadcast(event("inventory.updated", {"product_ids": all_product_ids}))
    return to_post_out(post, db, user)


@router.delete("/{post_id}", status_code=204)
def delete_post(
    post_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin_or_shop),
):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Không tìm thấy bài đăng")
    if user.role != "ADMIN" and post.author_id != user.id:
        raise HTTPException(403, "Bạn không có quyền xóa bài đăng này")

    db.delete(post)
    db.commit()
