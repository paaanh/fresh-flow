from app.core.audit import write_audit
from app.modules.pricing import repository
from fastapi import HTTPException
from app.schemas import PriceRuleIn
from app.models import Product, User
from sqlalchemy.orm import Session


def unit_price(db: Session, product, customer_group: str):
    rule = repository.get_price_rule(db, product.id, customer_group)
    return rule.unit_price if rule else product.base_price


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