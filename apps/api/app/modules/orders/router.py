from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user, require_admin, require_admin_or_shop
from app.models import User
from app.schemas import OrderCreateIn, OrderOut, OrderStatusIn, ShipperAssignIn, OrderPaymentIn
from app.modules.orders import service

router = APIRouter()


@router.post("/orders", response_model=OrderOut, status_code=201)
async def create_order(payload: OrderCreateIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return await service.create_order(db, payload, user)


@router.get("/orders", response_model=list[OrderOut])
def list_orders(
    status_filter: str | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None),
    shop_id: int | None = Query(default=None),
    shipper_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return service.list_user_orders(
        db, user, status=status_filter, search=search, shop_id=shop_id, shipper_id=shipper_id
    )


@router.get("/orders/{order_id}", response_model=OrderOut)
def get_order(order_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.get_order_for_user(db, order_id, user)


@router.patch("/admin/orders/{order_id}/status", response_model=OrderOut)
@router.patch("/orders/{order_id}/status", response_model=OrderOut)
async def update_order_status(
    order_id: int,
    payload: OrderStatusIn,
    db: Session = Depends(get_db),
    operator: User = Depends(get_current_user),
):
    # Allow Admin, Shop, and Shipper depending on state
    return await service.change_order_status(db, order_id, payload, operator)


@router.patch("/orders/{order_id}/assign-shipper", response_model=OrderOut)
async def assign_shipper(
    order_id: int,
    payload: ShipperAssignIn,
    db: Session = Depends(get_db),
    operator: User = Depends(require_admin_or_shop),
):
    return await service.assign_shipper_to_order(db, order_id, payload, operator)


@router.patch("/orders/{order_id}/payment", response_model=OrderOut)
def update_payment(
    order_id: int,
    payload: OrderPaymentIn,
    db: Session = Depends(get_db),
    operator: User = Depends(get_current_user),
):
    return service.update_order_payment(db, order_id, payload, operator)


@router.get("/orders/{order_id}/history")
def order_history(order_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.order_history_for_user(db, order_id, user)
