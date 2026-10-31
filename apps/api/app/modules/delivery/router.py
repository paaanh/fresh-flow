from fastapi import APIRouter
from app.schemas import DeliverySlotIn
from fastapi import Depends
from sqlalchemy.orm import Session
from app.models import User
from app.core.security import get_current_user, require_admin
from app.db import get_db
from app.api.deps import get_current_user, get_db, require_admin
from app.modules.delivery import service

router = APIRouter()

@router.post('/admin/delivery-slots', status_code=201)
def create_delivery_slot(payload: DeliverySlotIn, db: Session=Depends(get_db), admin: User=Depends(require_admin)):
    return service.create_delivery_slot(payload=payload, db=db, admin=admin)

@router.get('/delivery-slots')
def list_delivery_slots(db: Session=Depends(get_db), _: User=Depends(get_current_user)):
    return service.list_delivery_slots(db=db, _=_)
