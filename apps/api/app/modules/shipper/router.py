from decimal import Decimal
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, or_

from app.api.deps import get_db, require_shipper
from app.models import Order, User
from app.schemas import OrderOut, OrderStatusIn, OrderPaymentIn
from app.modules.orders import service as order_service, repository as order_repo
from app.core.notifications import add_notification
from app.realtime import event, manager

router = APIRouter(prefix="/shipper", tags=["Shipper"])


@router.get("/orders", response_model=list[OrderOut])
def list_shipper_orders(
    status: str | None = Query(default=None),
    available_only: bool = Query(default=False),
    db: Session = Depends(get_db),
    shipper: User = Depends(require_shipper),
):
    """Get orders assigned to shipper or open orders ready for pickup."""
    query = select(Order).order_by(Order.created_at.desc())
    if available_only:
        # Orders ready for pickup without assigned shipper
        query = query.where(Order.status == "READY_FOR_PICKUP", Order.shipper_id.is_(None))
    else:
        # Orders assigned to this shipper
        query = query.where(Order.shipper_id == shipper.id)
        if status:
            query = query.where(Order.status == status)

    orders = db.scalars(query).all()
    for o in orders:
        order_repo.enrich_order_names(db, o)
    return orders


@router.patch("/orders/{order_id}/claim", response_model=OrderOut)
async def claim_order(
    order_id: int,
    db: Session = Depends(get_db),
    shipper: User = Depends(require_shipper),
):
    """Shipper claims an available order."""
    order = order_repo.get_order(db, order_id, lock=True)
    if not order:
        raise HTTPException(404, "Không tìm thấy đơn hàng")
    if order.shipper_id and order.shipper_id != shipper.id:
        raise HTTPException(409, "Đơn hàng đã có Shipper khác phụ trách")

    order.shipper_id = shipper.id
    if order.status == "PREPARING":
        order.status = "READY_FOR_PICKUP"
    if order.shop_id:
        add_notification(db, order.shop_id, "Shipper đã nhận đơn", f"Shipper {shipper.full_name} đang đến lấy đơn {order.order_number}.", "order.assigned")
    db.commit()
    db.refresh(order)
    order_repo.enrich_order_names(db, order)
    if order.shop_id:
        await manager.send_user(order.shop_id, event("notification.created", {"event_type": "order.assigned", "order_id": order.id, "shipper_id": shipper.id}))
    return order


@router.patch("/orders/{order_id}/pickup", response_model=OrderOut)
async def mark_picked_up(
    order_id: int,
    note: str = Query(default="Shipper đã nhận hàng từ Shop"),
    db: Session = Depends(get_db),
    shipper: User = Depends(require_shipper),
):
    """Shipper marks order as picked up."""
    return await order_service.change_order_status(
        db, order_id, OrderStatusIn(status="PICKED_UP", note=note), shipper
    )


@router.patch("/orders/{order_id}/delivering", response_model=OrderOut)
async def mark_delivering(
    order_id: int,
    note: str = Query(default="Shipper đang trên đường giao đến bạn"),
    db: Session = Depends(get_db),
    shipper: User = Depends(require_shipper),
):
    """Shipper marks order as delivering."""
    return await order_service.change_order_status(
        db, order_id, OrderStatusIn(status="DELIVERING", note=note), shipper
    )


@router.patch("/orders/{order_id}/complete", response_model=OrderOut)
async def mark_completed(
    order_id: int,
    paid_amount: Decimal | None = Query(default=None),
    note: str = Query(default="Giao hàng thành công"),
    db: Session = Depends(get_db),
    shipper: User = Depends(require_shipper),
):
    """Shipper marks order completed and updates COD money collected."""
    order = await order_service.change_order_status(
        db, order_id, OrderStatusIn(status="COMPLETED", note=note), shipper
    )
    if paid_amount is not None:
        payment_in = OrderPaymentIn(
            paid_amount=paid_amount,
            payment_status="PAID" if paid_amount >= order.total else "PARTIAL",
            cash_collected=paid_amount,
            note="Shipper thu tiền khi giao thành công",
        )
        order = order_service.update_order_payment(db, order.id, payment_in, shipper)
    return order


@router.get("/summary")
def get_shipper_summary(
    db: Session = Depends(get_db),
    shipper: User = Depends(require_shipper),
):
    """Summary of completed deliveries, money collected, and pending deliveries."""
    orders = db.scalars(select(Order).where(Order.shipper_id == shipper.id)).all()
    completed = [o for o in orders if o.status == "COMPLETED"]
    delivering = [o for o in orders if o.status in {"READY_FOR_PICKUP", "PICKED_UP", "DELIVERING"}]
    total_collected = sum((o.cash_collected_by_shipper for o in completed), Decimal("0"))

    return {
        "total_assigned": len(orders),
        "total_completed": len(completed),
        "delivering_count": len(delivering),
        "total_cash_collected": total_collected,
        "vehicle_info": shipper.vehicle_info,
    }
