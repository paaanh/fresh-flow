from app.core.audit import write_audit
from app.modules.orders import repository
from app.modules.inventory import service as inventory_service
from app.core.notifications import add_notification
from decimal import Decimal
from fastapi import HTTPException
from app.models import Order, OrderItem, OrderStatusHistory, User
from app.schemas import OrderCreateIn, OrderStatusIn
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.realtime import event, manager
from app.modules.pricing.service import unit_price as get_unit_price
from uuid import uuid4


def create_order(db: Session, payload: OrderCreateIn, user: User) -> Order:
    if payload.delivery_type not in {'PICKUP', 'HOME'}:
        raise HTTPException(422, 'delivery_type phải là PICKUP hoặc HOME')

    if payload.delivery_type == 'HOME' and (not payload.delivery_address.strip()):
        raise HTTPException(422, 'Cần địa chỉ giao hàng')

    fee = Decimal('0')

    if payload.delivery_slot_id:
        slot = repository.get_delivery_slot(db, payload.delivery_slot_id)
        if not slot or not slot.is_active or slot.customer_group not in {'ALL', user.customer_group}:
            raise HTTPException(422, 'Khung giao hàng không áp dụng')
        fee = slot.fee

    batch_ids = sorted({line.batch_id for line in payload.items})
    batches = inventory_service.lock_batches(db, batch_ids)
    by_id = {batch.id: batch for batch in batches}

    if len(by_id) != len(batch_ids):
        raise HTTPException(404, 'Không tìm thấy đợt hàng')

    line_items = []
    subtotal = Decimal('0')

    for line in payload.items:
        batch = by_id[line.batch_id]
        product = repository.get_product(db, batch.product_id)

        if not batch.is_open or not product or (not product.is_active):
            raise HTTPException(409, 'Sản phẩm hoặc đợt hàng đã đóng')

        if line.quantity > batch.available_quantity:
            raise HTTPException(409, f'Không đủ hàng cho {product.name}')

        line_unit_price = get_unit_price(db, product, user.customer_group)
        line_total = (line.quantity * line_unit_price).quantize(Decimal('0.01'))
        subtotal += line_total

        line_items.append(
            OrderItem(
                product_id=product.id,
                batch_id=batch.id,
                product_name_snapshot=product.name,
                unit_snapshot=product.unit,
                quantity=line.quantity,
                unit_price=line_unit_price,
                line_total=line_total
            )
        )

    order = Order(
        order_number=f'FF-{datetime.now(timezone.utc):%y%m%d}-{uuid4().hex[:8].upper()}',
        user_id=user.id,
        status='PENDING',
        delivery_type=payload.delivery_type,
        delivery_address=payload.delivery_address,
        delivery_fee=fee,
        subtotal=subtotal,
        total=subtotal + fee,
        note=payload.note,
        items=line_items
    )

    db.add(order)
    db.flush()

    db.add(
        OrderStatusHistory(
            order_id=order.id,
            changed_by=user.id,
            old_status='',
            new_status='PENDING',
            note='Đơn mới'
        )
    )

    db.commit()
    db.refresh(order)
    return order


def get_order_for_user(db: Session, order_id: int, user: User) -> Order:
    order = repository.get_order(db, order_id)

    if not order or (user.role != 'ADMIN' and order.user_id != user.id):
        raise HTTPException(404, 'Không tìm thấy đơn hàng')

    return order


def list_user_orders(db: Session, user: User, status: str | None):
    return repository.list_orders(db, user.id, user.role == 'ADMIN', status)


def order_history_for_user(db: Session, order_id: int, user: User):
    order = repository.get_order(db, order_id)

    if not order or (user.role != 'ADMIN' and order.user_id != user.id):
        raise HTTPException(404, 'Không tìm thấy đơn hàng')

    return repository.get_order_history(db, order_id)


async def change_order_status(
    db: Session,
    order_id: int,
    payload: OrderStatusIn,
    admin: User
) -> Order:

    order = repository.get_order(db, order_id, lock=True)

    if not order:
        raise HTTPException(404, 'Không tìm thấy đơn hàng')

    old_status = order.status

    if old_status in {'REJECTED', 'CANCELLED', 'COMPLETED'}:
        raise HTTPException(409, 'Đơn hàng đã kết thúc')

    if old_status == 'PENDING' and payload.status == 'APPROVED':
        demand: dict[int, Decimal] = {}

        for item in order.items:
            demand[item.batch_id] = demand.get(item.batch_id, Decimal('0')) + item.quantity

        inventory_service.approve_quantities(db, demand)

    elif old_status == 'PENDING' and payload.status not in {'REJECTED', 'CANCELLED'}:
        raise HTTPException(409, 'Đơn chờ duyệt chỉ có thể được duyệt hoặc từ chối')

    elif old_status == 'APPROVED' and payload.status not in {'PREPARING', 'CANCELLED'}:
        raise HTTPException(409, 'Trạng thái đơn hàng không hợp lệ')

    elif old_status == 'PREPARING' and payload.status not in {'DELIVERING', 'COMPLETED', 'CANCELLED'}:
        raise HTTPException(409, 'Trạng thái đơn hàng không hợp lệ')

    elif old_status == 'DELIVERING' and payload.status not in {'COMPLETED', 'CANCELLED'}:
        raise HTTPException(409, 'Trạng thái đơn hàng không hợp lệ')

    if payload.status == 'CANCELLED' and old_status in {'APPROVED', 'PREPARING', 'DELIVERING'}:
        demand: dict[int, Decimal] = {}

        for item in order.items:
            demand[item.batch_id] = demand.get(item.batch_id, Decimal('0')) + item.quantity

        inventory_service.release_quantities(db, demand)

    order.status = payload.status
    order.updated_at = datetime.now(timezone.utc)

    db.add(
        OrderStatusHistory(
            order_id=order.id,
            changed_by=admin.id,
            old_status=old_status,
            new_status=payload.status,
            note=payload.note
        )
    )

    write_audit(
        db,
        admin.id,
        'order.status_changed',
        'order',
        order.id,
        f'{old_status}->{payload.status}'
    )

    add_notification(
        db,
        order.user_id,
        'Cập nhật đơn hàng',
        f'Đơn {order.order_number}: {payload.status}',
        'order.status_changed'
    )

    product_ids = {item.product_id for item in order.items}

    db.commit()
    db.refresh(order)

    await manager.send_user(
        order.user_id,
        event('order.status_changed', {
            'order_id': order.id,
            'status': order.status
        })
    )

    for product_id in product_ids:
        await manager.broadcast(
            event('inventory.updated', {'product_id': product_id})
        )

    return order