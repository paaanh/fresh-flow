from app.core.notifications import add_notification
from fastapi import HTTPException
from app.models import ProductRequest, User
from app.schemas import ProductRequestIn, ProductRequestResponseIn
from sqlalchemy.orm import Session
from app.realtime import event, manager
from sqlalchemy import select


def create_product_request(payload: ProductRequestIn, db: Session=None, user: User=None):
    request = ProductRequest(user_id=user.id, **payload.model_dump())
    db.add(request)
    db.commit()
    db.refresh(request)
    return request

def list_product_requests(db: Session=None, user: User=None):
    query = select(ProductRequest).order_by(ProductRequest.created_at.desc())
    if user.role != 'ADMIN':
        query = query.where(ProductRequest.user_id == user.id)
    return db.scalars(query).all()

async def respond_product_request(request_id: int, payload: ProductRequestResponseIn, db: Session=None, admin: User=None):
    request = db.get(ProductRequest, request_id)
    if not request:
        raise HTTPException(404, 'Không tìm thấy yêu cầu')
    request.status = payload.status
    request.admin_response = payload.admin_response
    request.quoted_price = payload.quoted_price
    add_notification(db, request.user_id, 'Yêu cầu mặt hàng được cập nhật', payload.admin_response, 'product_request.updated')
    db.commit()
    await manager.send_user(request.user_id, event('notification.created', {'type': 'product_request.updated', 'request_id': request.id}))
    return request
