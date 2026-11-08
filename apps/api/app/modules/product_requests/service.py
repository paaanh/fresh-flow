from app.core.notifications import add_notification
from fastapi import HTTPException
from app.models import ProductRequest, User
from app.schemas import ProductRequestIn, ProductRequestResponseIn
from sqlalchemy.orm import Session
from app.realtime import event, manager
from sqlalchemy import select


def serialize_request(db: Session, req: ProductRequest) -> dict:
    customer = db.get(User, req.user_id)
    return {
        "id": req.id,
        "user_id": req.user_id,
        "customer_name": customer.full_name if customer else "Khách hàng",
        "product_name": req.product_name,
        "description": req.description or "",
        "status": req.status,
        "admin_response": req.admin_response or "",
        "quoted_price": req.quoted_price,
        "created_at": req.created_at,
    }


def create_product_request(payload: ProductRequestIn, db: Session=None, user: User=None):
    request = ProductRequest(user_id=user.id, **payload.model_dump())
    db.add(request)
    db.commit()
    db.refresh(request)
    return serialize_request(db, request)


def list_product_requests(db: Session=None, user: User=None):
    query = select(ProductRequest).order_by(ProductRequest.created_at.desc())
    if user.role not in {'ADMIN', 'SHOP'}:
        query = query.where(ProductRequest.user_id == user.id)
    items = db.scalars(query).all()
    return [serialize_request(db, item) for item in items]


async def respond_product_request(request_id: int, payload: ProductRequestResponseIn, db: Session=None, admin: User=None):
    request = db.get(ProductRequest, request_id)
    if not request:
        raise HTTPException(404, 'Không tìm thấy yêu cầu')
    if admin.role not in {'ADMIN', 'SHOP'}:
        if request.user_id != admin.id or payload.status not in {'ACCEPTED', 'REJECTED'}:
            raise HTTPException(403, 'Bạn không có quyền xử lý yêu cầu mặt hàng này')
    request.status = payload.status
    if payload.admin_response:
        request.admin_response = payload.admin_response
    if payload.quoted_price is not None:
        request.quoted_price = payload.quoted_price
    if admin.role in {'ADMIN', 'SHOP'}:
        add_notification(
            db,
            request.user_id,
            'Yêu cầu mặt hàng được cập nhật',
            payload.admin_response or f'Yêu cầu "{request.product_name}" đã chuyển sang trạng thái {payload.status}.',
            'product_request.updated',
        )
        db.commit()
        await manager.send_user(request.user_id, event('notification.created', {'type': 'product_request.updated', 'request_id': request.id}))
    else:
        db.commit()
    return serialize_request(db, request)
