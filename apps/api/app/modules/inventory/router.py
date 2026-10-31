from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin
from app.models import User
from app.schemas import BatchIn
from app.modules.inventory import service

router = APIRouter()


@router.post("/admin/products/{product_id}/batches", status_code=201)
async def create_batch(product_id: int, payload: BatchIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return await service.create_batch(db, product_id, payload, admin)


@router.get("/admin/products/{product_id}/batches")
def list_batches(product_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return service.list_batches(db, product_id)
