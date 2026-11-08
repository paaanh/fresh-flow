from sqlalchemy import select, or_
from sqlalchemy.orm import Session, joinedload

from app.models import DeliverySlot, Order, OrderStatusHistory, Product, User


def get_delivery_slot(db: Session, slot_id: int):
    return db.get(DeliverySlot, slot_id)


def get_product(db: Session, product_id: int):
    return db.get(Product, product_id)


def get_order(db: Session, order_id: int, *, lock: bool = False):
    query = select(Order).where(Order.id == order_id)
    if lock:
        return db.scalar(query.with_for_update())
    return db.scalar(query.options(joinedload(Order.items)))


def list_orders(
    db: Session,
    user: User,
    status: str | None = None,
    search: str | None = None,
    shop_id: int | None = None,
    shipper_id: int | None = None,
):
    query = select(Order).options(joinedload(Order.items)).order_by(Order.created_at.desc())

    if user.role == "CUSTOMER":
        query = query.where(Order.user_id == user.id)
    elif user.role == "SHOP":
        query = query.where(Order.shop_id == user.id)
    elif user.role == "SHIPPER":
        query = query.where(or_(Order.shipper_id == user.id, Order.status.in_(["READY_FOR_PICKUP", "PICKED_UP", "DELIVERING"])))

    if status:
        query = query.where(Order.status == status)

    if shop_id:
        query = query.where(Order.shop_id == shop_id)

    if shipper_id:
        query = query.where(Order.shipper_id == shipper_id)

    if search:
        kw = f"%{search.strip()}%"
        query = query.where(
            or_(
                Order.order_number.ilike(kw),
                Order.recipient_name.ilike(kw),
                Order.recipient_phone.ilike(kw),
                Order.delivery_address.ilike(kw),
            )
        )

    orders = db.scalars(query).unique().all()
    # Enrich with names
    for o in orders:
        enrich_order_names(db, o)
    return orders


def enrich_order_names(db: Session, order: Order):
    if order.user_id:
        cust = db.get(User, order.user_id)
        order.customer_name = cust.full_name if cust else None
    if order.shop_id:
        shop = db.get(User, order.shop_id)
        order.shop_name = shop.shop_name or shop.full_name if shop else None
    if order.shipper_id:
        shipper = db.get(User, order.shipper_id)
        order.shipper_name = shipper.full_name if shipper else None


def get_order_history(db: Session, order_id: int):
    return db.scalars(
        select(OrderStatusHistory)
        .where(OrderStatusHistory.order_id == order_id)
        .order_by(OrderStatusHistory.created_at)
    ).all()
