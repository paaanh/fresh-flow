from fastapi import APIRouter, Depends
from app.schemas import ProductRequestIn, ProductRequestResponseIn
from sqlalchemy.orm import Session
from app.models import User
from app.api.deps import get_current_user, get_db
from app.modules.product_requests import service

router = APIRouter()

@router.post('/product-requests', status_code=201)
def create_product_request(payload: ProductRequestIn, db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    return service.create_product_request(payload=payload, db=db, user=user)

@router.get('/product-requests')
def list_product_requests(db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    return service.list_product_requests(db=db, user=user)

@router.patch('/admin/product-requests/{request_id}')
@router.patch('/product-requests/{request_id}')
async def respond_product_request(request_id: int, payload: ProductRequestResponseIn, db: Session=Depends(get_db), operator: User=Depends(get_current_user)):
    return await service.respond_product_request(request_id=request_id, payload=payload, db=db, admin=operator)
