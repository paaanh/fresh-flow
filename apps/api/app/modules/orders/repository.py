from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import DeliverySlot, Order, OrderStatusHistory, Product


def get_delivery_slot(db: Session, slot_id: int):
    return db.get(DeliverySlot, slot_id)



def get_product(db: Session, product_id: int):
    return db.get(Product, product_id)



def get_order(db: Session, order_id: int, *, lock: bool = False):
    query = select(Order).where(Order.id == order_id)
    if lock:
        return db.scalar(query.with_for_update())
    return db.scalar(query.options(joinedload(Order.items)))


def list_orders(db: Session, user_id: int, is_admin: bool, status: str | None):
    query = select(Order).options(joinedload(Order.items)).order_by(Order.created_at.desc())
    if not is_admin:
        query = query.where(Order.user_id == user_id)
    if status:
        query = query.where(Order.status == status)
    return db.scalars(query).unique().all()


def get_order_history(db: Session, order_id: int):
    return db.scalars(
        select(OrderStatusHistory)
        .where(OrderStatusHistory.order_id == order_id)
        .order_by(OrderStatusHistory.created_at)
    ).all()
