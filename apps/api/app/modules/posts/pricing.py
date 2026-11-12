"""Giá theo chương trình của bài đăng (phương án B: giá thuộc về từng bài).

Một bài đăng là một chương trình bán:
  - danh sách mặt hàng (PostItem) với hạn mức mở bán và giá Sale riêng của bài,
  - % chiết khấu theo nhóm khách hàng,
  - thời gian chương trình (order_start_at / order_end_at).

Giá khách trả khi mua qua bài:
  Giá theo nhóm = Giá chuẩn của mặt hàng × (1 − % chiết khấu của nhóm trong bài), làm tròn đến đồng
  Giá cuối cùng = MIN(Giá theo nhóm, Giá Sale trong bài, Sale chung đang chạy của mặt hàng)

Bài đăng KHÔNG ghi gì vào mặt hàng (giá chuẩn, quy tắc giá nhóm, Sale) — hai bài có thể bán cùng
một mặt hàng với giá khác nhau. Module này được dùng chung bởi Newfeed và khi tạo đơn hàng, nên giá
hiển thị luôn bằng giá tính tiền.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from app.models import CustomerGroup, InventoryBatch, Post, PostItem, Product, User
from app.modules.pricing.service import discounted_price, sale_status

TERMINATING = {"CANCELLED", "REJECTED"}


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def program_status(post: Post, now: datetime | None = None) -> str:
    """UPCOMING (chưa bắt đầu), ACTIVE, ENDED (đã kết thúc) theo thời gian chương trình của bài."""
    now = now or datetime.now(timezone.utc)
    start, end = _utc(post.order_start_at), _utc(post.order_end_at)
    if start and now < start:
        return "UPCOMING"
    if end and now > end:
        return "ENDED"
    return "ACTIVE"


def parse_discounts(raw: str | None) -> dict[str, Decimal]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except Exception:
        return {}
    if not isinstance(data, dict):
        return {}
    return {str(k): Decimal(str(v)) for k, v in data.items() if v is not None and str(v).strip() != ""}


def active_group_defaults(db: Session) -> dict[str, Decimal]:
    """Chiết khấu mặc định của các nhóm khách hàng đang hoạt động."""
    return {
        g.code: (g.discount_percent or Decimal("0"))
        for g in db.scalars(select(CustomerGroup).where(CustomerGroup.is_active == True)).all()
    }


def post_groups(post: Post) -> list[str]:
    """Nhóm khách hàng của bài (bài nhiều nhóm, hoặc bài cũ 1 nhóm). [] = mọi nhóm."""
    if post.target_audience == "ALL":
        return []
    try:
        groups = [str(g) for g in json.loads(post.target_groups or "[]") if g]
    except Exception:
        groups = []
    if not groups and post.target_customer_group:
        groups = [post.target_customer_group]
    return groups


def item_group_prices(item: PostItem) -> dict[str, Decimal]:
    """Giá riêng theo nhóm của một mặt hàng trong bài."""
    return parse_discounts(getattr(item, "group_prices", "") or "")


def audience_allows(post: Post, group_code: str | None) -> bool:
    if post.target_audience == "ALL":
        return True
    return bool(group_code) and group_code in post_groups(post)


def group_discount(post: Post, group_code: str | None, defaults: dict[str, Decimal]) -> Decimal:
    """% chiết khấu của nhóm trong bài; nhóm không có trong bài thì theo mặc định của nhóm."""
    if not group_code:
        return Decimal("0")
    discounts = parse_discounts(post.group_discounts)
    if group_code in discounts:
        return discounts[group_code]
    return defaults.get(group_code, Decimal("0"))


def item_price(post: Post, item: PostItem, product: Product, group_code: str | None, defaults: dict[str, Decimal]) -> dict:
    """Giá của một mặt hàng trong bài cho một nhóm khách hàng (None = giá chuẩn của bài)."""
    base = Decimal(item.list_price) if getattr(item, "list_price", None) else Decimal(product.base_price)
    pct = group_discount(post, group_code, defaults)
    own = item_group_prices(item).get(group_code or "")
    if own is not None:
        # Giá đặt riêng cho nhóm này trong bài
        group_price = min(Decimal(own), base)
        pct = Decimal(int(round((1 - group_price / base) * 100))) if base > 0 else Decimal("0")
        candidates = [("GROUP" if group_price < base else "BASE", group_price)]
    else:
        group_price = discounted_price(base, pct)
        candidates = [("GROUP" if pct > 0 else "BASE", group_price)]
    if item.sale_price is not None:
        candidates.append(("POST_SALE", Decimal(item.sale_price)))
    if product.sale_price is not None and sale_status(product) == "ACTIVE":
        candidates.append(("PRODUCT_SALE", Decimal(product.sale_price)))
    source, final = min(candidates, key=lambda c: c[1])
    return {
        "base_price": base,
        "group_price": group_price,
        "group_discount": pct,
        "final_price": final,
        "source": source,  # BASE / GROUP / POST_SALE / PRODUCT_SALE
        "on_sale": source in {"POST_SALE", "PRODUCT_SALE"},
        "saving_percent": int(round((1 - final / base) * 100)) if base > 0 and final < base else 0,
    }


def available_stock(db: Session, product_id: int) -> Decimal:
    return sum(
        (b.available_quantity for b in db.scalars(
            select(InventoryBatch).where(InventoryBatch.product_id == product_id, InventoryBatch.is_open == True)
        ).all()),
        Decimal("0"),
    )


def remaining_quota(item: PostItem) -> Decimal | None:
    if item.quantity_limit is None:
        return None
    return max(Decimal("0"), Decimal(item.quantity_limit) - Decimal(item.sold_quantity or 0))


def price_for_order_line(db: Session, post_id: int, product: Product, quantity: Decimal, user: User) -> tuple[Decimal, PostItem]:
    """Kiểm tra quyền mua qua bài, giữ hạn mức (nguyên tử) và trả về đơn giá theo bài."""
    post = db.get(Post, post_id)
    if not post or not post.is_active:
        raise HTTPException(409, "Bài đăng không còn mở bán")
    if not audience_allows(post, user.customer_group):
        raise HTTPException(403, "Bài đăng này không dành cho nhóm khách hàng của bạn")
    status = program_status(post)
    if status == "UPCOMING":
        raise HTTPException(409, f"Chương trình \"{post.title}\" chưa bắt đầu")
    if status == "ENDED":
        raise HTTPException(409, f"Chương trình \"{post.title}\" đã kết thúc")
    item = db.scalar(select(PostItem).where(PostItem.post_id == post.id, PostItem.product_id == product.id))
    if not item:
        raise HTTPException(409, f"{product.name} không có trong bài đăng \"{post.title}\"")
    reserved = db.execute(
        update(PostItem)
        .where(
            PostItem.id == item.id,
            or_(PostItem.quantity_limit.is_(None), PostItem.sold_quantity + quantity <= PostItem.quantity_limit),
        )
        .values(sold_quantity=PostItem.sold_quantity + quantity)
        .execution_options(synchronize_session=False)
    )
    if reserved.rowcount != 1:
        left = remaining_quota(item)
        raise HTTPException(409, f"{product.name}: bài chỉ còn mở bán {left:g} {product.unit}")
    price = item_price(post, item, product, user.customer_group, active_group_defaults(db))["final_price"]
    return price, item


def release_quota(db: Session, post_id: int | None, product_id: int, quantity: Decimal) -> None:
    """Trả lại hạn mức của bài khi đơn bị hủy / giảm số lượng."""
    if not post_id or quantity <= 0:
        return
    db.execute(
        update(PostItem)
        .where(PostItem.post_id == post_id, PostItem.product_id == product_id)
        .values(sold_quantity=PostItem.sold_quantity - quantity)
        .execution_options(synchronize_session=False)
    )
    db.execute(
        update(PostItem)
        .where(PostItem.post_id == post_id, PostItem.product_id == product_id, PostItem.sold_quantity < 0)
        .values(sold_quantity=Decimal("0"))
        .execution_options(synchronize_session=False)
    )
