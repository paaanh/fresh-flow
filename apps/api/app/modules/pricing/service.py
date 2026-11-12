from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from sqlalchemy import select
from app.core.audit import write_audit
from app.modules.pricing import repository
from fastapi import HTTPException
from app.schemas import PriceRuleIn
from app.models import CustomerGroup, Product, User
from sqlalchemy.orm import Session


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def sale_status(product, now: datetime | None = None) -> str:
    """NONE (no sale configured), SCHEDULED (starts later), ACTIVE, EXPIRED."""
    if getattr(product, "sale_price", None) is None:
        return "NONE"
    now = now or datetime.now(timezone.utc)
    start = _as_utc(getattr(product, "sale_start_at", None))
    end = _as_utc(getattr(product, "sale_end_at", None))
    if start and now < start:
        return "SCHEDULED"
    if end and now > end:
        return "EXPIRED"
    return "ACTIVE"


def apply_sale(product, price: Decimal, now: datetime | None = None) -> Decimal:
    """An active Sale never raises a price: customers pay the lower of their group price and the sale price."""
    if sale_status(product, now) == "ACTIVE":
        return min(Decimal(price), Decimal(product.sale_price))
    return Decimal(price)


MAX_GROUP_DISCOUNT = Decimal("90")


def discounted_price(base: Decimal, percent: Decimal) -> Decimal:
    """Giá theo nhóm = Giá chuẩn × (1 − chiết khấu/100), làm tròn đến đồng (nửa trở lên)."""
    percent = min(max(Decimal(percent), Decimal("0")), MAX_GROUP_DISCOUNT)
    return (Decimal(base) * (Decimal("100") - percent) / Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def group_price_from(product, customer_group: str | None, rule_prices: dict[str, Decimal], group_discounts: dict[str, Decimal]) -> Decimal:
    """Group price before Sale, from preloaded data: a product price rule wins, otherwise the
    customer group's default discount, otherwise the standard price."""
    if customer_group and customer_group in rule_prices:
        return rule_prices[customer_group]
    pct = group_discounts.get(customer_group or "")
    if pct and pct > Decimal("0"):
        return (product.base_price * (Decimal("100") - pct) / Decimal("100")).quantize(Decimal("1.00"))
    return product.base_price


def group_price(db: Session, product, customer_group: str) -> Decimal:
    """Price for a customer group before any Sale programme is applied."""
    rule = repository.get_price_rule(db, product.id, customer_group)
    rules = {customer_group: rule.unit_price} if rule else {}
    discounts: dict[str, Decimal] = {}
    if customer_group and not rule:
        grp = db.scalar(select(CustomerGroup).where(CustomerGroup.code == customer_group, CustomerGroup.is_active == True))
        if grp and grp.discount_percent:
            discounts[customer_group] = grp.discount_percent
    return group_price_from(product, customer_group, rules, discounts)


def unit_price(db: Session, product, customer_group: str):
    """Final unit price charged on new orders (group price, then Sale)."""
    return apply_sale(product, group_price(db, product, customer_group))


def set_product_price(db: Session, product_id: int, customer_group: str, payload: PriceRuleIn, admin: User):
    if payload.customer_group != customer_group:
        raise HTTPException(422, 'Nhóm khách hàng trong URL và body không khớp')

    if not db.get(Product, product_id):
        raise HTTPException(404, 'Không tìm thấy sản phẩm')

    repository.save_price_rule(db, product_id, customer_group, payload.unit_price)

    write_audit(db, admin.id, 'price.updated', 'product', product_id, customer_group)

    db.commit()

    return {
        'product_id': product_id,
        'customer_group': customer_group,
        'unit_price': payload.unit_price
    }