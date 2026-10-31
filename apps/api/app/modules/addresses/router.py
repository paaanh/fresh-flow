from fastapi import APIRouter
from app.schemas import AddressIn
from fastapi import Depends
from sqlalchemy.orm import Session
from app.models import User
from app.core.security import get_current_user
from app.db import get_db
from app.api.deps import get_current_user, get_db
from app.modules.addresses import service

router = APIRouter()

@router.get('/addresses')
def list_addresses(db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    return service.list_addresses(db=db, user=user)

@router.post('/addresses', status_code=201)
def create_address(payload: AddressIn, db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    return service.create_address(payload=payload, db=db, user=user)

@router.delete('/addresses/{address_id}', status_code=204)
def delete_address(address_id: int, db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    return service.delete_address(address_id=address_id, db=db, user=user)

@router.patch('/addresses/{address_id}')
def update_address(address_id: int, payload: AddressIn, db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    return service.update_address(address_id=address_id, payload=payload, db=db, user=user)
