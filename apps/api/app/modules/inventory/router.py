from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin, require_admin_or_shop
from app.models import User
from app.schemas import BatchIn, InventoryAdjustmentIn
from app.modules.inventory import service

router = APIRouter()


@router.post("/admin/products/{product_id}/batches", status_code=201)
async def create_batch(product_id: int, payload: BatchIn, db: Session = Depends(get_db), operator: User = Depends(require_admin_or_shop)):
    return await service.create_batch(db, product_id, payload, operator)


@router.get("/admin/products/{product_id}/batches")
def list_batches(product_id: int, db: Session = Depends(get_db), operator: User = Depends(require_admin_or_shop)):
    return service.list_batches(db, product_id, operator)


@router.post("/admin/products/{product_id}/adjustments")
async def remove_stock(product_id: int, payload: InventoryAdjustmentIn, db: Session = Depends(get_db), operator: User = Depends(require_admin_or_shop)):
    return await service.remove_stock(db, product_id, payload.quantity, operator)
