from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user, require_admin
from app.models import User
from app.schemas import OrderCreateIn, OrderOut, OrderStatusIn
from app.modules.orders import repository, service

router = APIRouter()


@router.post("/orders", response_model=OrderOut, status_code=201)
def create_order(payload: OrderCreateIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.create_order(db, payload, user)


@router.get("/orders", response_model=list[OrderOut])
def list_orders(status_filter: str | None = Query(default=None, alias="status"), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.list_user_orders(db, user, status_filter)


@router.get("/orders/{order_id}", response_model=OrderOut)
def get_order(order_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.get_order_for_user(db, order_id, user)


@router.patch("/admin/orders/{order_id}/status", response_model=OrderOut)
async def update_order_status(order_id: int, payload: OrderStatusIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return await service.change_order_status(db, order_id, payload, admin)


@router.get("/orders/{order_id}/history")
def order_history(order_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.order_history_for_user(db, order_id, user)
