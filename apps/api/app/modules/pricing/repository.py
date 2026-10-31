from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PriceRule


def get_price_rule(db: Session, product_id: int, customer_group: str):
    return db.scalar(select(PriceRule).where(PriceRule.product_id == product_id, PriceRule.customer_group == customer_group))


def save_price_rule(db: Session, product_id: int, customer_group: str, unit_price):
    rule = get_price_rule(db, product_id, customer_group)
    if rule is None:
        rule = PriceRule(product_id=product_id, customer_group=customer_group, unit_price=unit_price)
        db.add(rule)
    else:
        rule.unit_price = unit_price
    return rule
