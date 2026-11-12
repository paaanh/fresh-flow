import re
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.notifications import add_notification
from app.models import Category, InventoryBatch, Product, ProductRequest, User
from app.realtime import event, manager
from app.schemas import ProductRequestIn, ProductRequestResponseIn

# Quy trình nghiệp vụ: OPEN (mới) -> QUOTED (đã báo giá) -> ACCEPTED (đang chuẩn bị hàng) -> FULFILLED (hoàn tất lên kệ)
#                     bất kỳ bước nào chưa hoàn tất -> REJECTED (từ chối / chưa có nguồn)
STATUS_ORDER = {"OPEN": 0, "QUOTED": 1, "ACCEPTED": 2, "FULFILLED": 3, "REJECTED": 4}
MANAGER_TRANSITIONS = {
    "OPEN": {"QUOTED", "ACCEPTED", "FULFILLED", "REJECTED"},
    "QUOTED": {"QUOTED", "ACCEPTED", "FULFILLED", "REJECTED"},
    "ACCEPTED": {"QUOTED", "ACCEPTED", "FULFILLED", "REJECTED"},
    "FULFILLED": {"FULFILLED"},
    "REJECTED": {"QUOTED", "REJECTED"},
}
STATUS_LABELS = {
    "OPEN": "Mới",
    "QUOTED": "Đã báo giá",
    "ACCEPTED": "Đang chuẩn bị hàng",
    "FULFILLED": "Hoàn tất lên kệ",
    "REJECTED": "Từ chối",
}


def serialize_request(db: Session, req: ProductRequest) -> dict:
    customer = db.get(User, req.user_id)
    product = db.get(Product, req.product_id) if req.product_id else None
    handler = db.get(User, req.handled_by) if req.handled_by else None
    available = Decimal("0")
    if product:
        available = sum(
            (b.available_quantity for b in db.scalars(
                select(InventoryBatch).where(InventoryBatch.product_id == product.id, InventoryBatch.is_open.is_(True))
            ).all()),
            Decimal("0"),
        )
    return {
        "id": req.id,
        "user_id": req.user_id,
        "customer_name": customer.full_name if customer else "Khách hàng",
        "customer_phone": customer.phone if customer else None,
        "product_name": req.product_name,
        "description": req.description or "",
        "status": req.status,
        "status_label": STATUS_LABELS.get(req.status, req.status),
        "admin_response": req.admin_response or "",
        "quoted_price": req.quoted_price,
        "product_id": req.product_id,
        "linked_product_name": product.name if product else None,
        "linked_product_available": available if product else None,
        "handled_by_name": (handler.shop_name or handler.full_name) if handler else None,
        "created_at": req.created_at,
        "updated_at": req.updated_at,
    }


async def create_product_request(payload: ProductRequestIn, db: Session = None, user: User = None):
    request = ProductRequest(user_id=user.id, **payload.model_dump())
    db.add(request)
    db.flush()
    managers = db.scalars(select(User).where(User.role.in_(['ADMIN', 'SHOP']))).all()
    for m in managers:
        add_notification(
            db,
            m.id,
            f'Yêu cầu mặt hàng mới: {request.product_name}',
            f'Khách hàng {user.full_name} vừa gửi yêu cầu đặt mặt hàng "{request.product_name}".',
            'product_request.updated',
            link=f'/requests#request-{request.id}',
        )
    db.commit()
    db.refresh(request)
    serialized = serialize_request(db, request)
    await manager.broadcast(event('product_request.updated', {'request_id': request.id, 'request': serialized}))
    return serialized


def list_product_requests(db: Session = None, user: User = None):
    query = select(ProductRequest).order_by(ProductRequest.created_at.desc())
    if user.role not in {'ADMIN', 'SHOP'}:
        query = query.where(ProductRequest.user_id == user.id)
    items = db.scalars(query).all()
    return [serialize_request(db, item) for item in items]


def _stock_product_for_request(db: Session, request: ProductRequest, payload: ProductRequestResponseIn, operator: User) -> Product:
    """Link an existing product, or create a new product with an opening stock batch
    so the fulfilled request appears on the shelf (Danh sách mặt hàng & Kho hàng)."""
    linked_id = payload.product_id or request.product_id
    if linked_id:
        product = db.get(Product, linked_id)
        if not product or not product.is_active:
            raise HTTPException(404, 'Không tìm thấy mặt hàng để liên kết')
        if operator.role == 'SHOP' and product.shop_id != operator.id:
            raise HTTPException(403, 'Chỉ liên kết được mặt hàng thuộc Shop của bạn')
    else:
        price = payload.quoted_price if payload.quoted_price is not None else request.quoted_price
        if price is None:
            raise HTTPException(422, 'Cần có giá báo cho khách trước khi đưa mặt hàng lên kệ')
        category = db.get(Category, payload.category_id) if payload.category_id else None
        if category is None:
            match = re.search(r"Danh mục:\s*([^;|.]+)", request.description or "", re.I)
            if match:
                category = db.scalar(select(Category).where(Category.name == match.group(1).strip(), Category.is_active.is_(True)))
        if category is None:
            category = db.scalar(select(Category).where(Category.name == 'Nông sản theo yêu cầu'))
            if category is None:
                category = Category(name='Nông sản theo yêu cầu', is_active=True)
                db.add(category)
                db.flush()
        product = Product(
            name=request.product_name[:180],
            description=request.description or f'Nhập theo yêu cầu #{request.id}',
            category_id=category.id,
            unit=(payload.unit or 'phần').strip() or 'phần',
            base_price=price,
            image_url=(payload.image_url or '').strip() or None,
            shop_id=operator.id if operator.role == 'SHOP' else None,
            is_active=True,
        )
        db.add(product)
        db.flush()
    if payload.stock_quantity:
        db.add(InventoryBatch(
            product_id=product.id,
            batch_date=datetime.now(timezone.utc),
            initial_quantity=payload.stock_quantity,
            approved_quantity=Decimal('0'),
            is_open=True,
        ))
    return product


async def respond_product_request(request_id: int, payload: ProductRequestResponseIn, db: Session = None, admin: User = None):
    request = db.get(ProductRequest, request_id)
    if not request:
        raise HTTPException(404, 'Không tìm thấy yêu cầu')
    is_manager = admin.role in {'ADMIN', 'SHOP'}
    if not is_manager:
        if request.user_id != admin.id or payload.status not in {'ACCEPTED', 'REJECTED'}:
            raise HTTPException(403, 'Bạn không có quyền xử lý yêu cầu mặt hàng này')
        if payload.status == 'ACCEPTED' and request.status != 'QUOTED':
            raise HTTPException(409, 'Chỉ có thể đồng ý khi yêu cầu đã được báo giá')
        # The customer may withdraw a request that is new or quoted, not one already being sourced
        if payload.status == 'REJECTED' and request.status not in {'OPEN', 'QUOTED'}:
            raise HTTPException(409, 'Yêu cầu đã được chuẩn bị, không thể hủy. Vui lòng liên hệ cửa hàng.')
    else:
        # One shop handles a request at a time; the admin can always step in
        if admin.role == 'SHOP' and request.handled_by and request.handled_by != admin.id:
            owner = db.get(User, request.handled_by)
            if owner is not None and owner.role == 'SHOP':
                raise HTTPException(409, f'Yêu cầu đang do "{owner.shop_name or owner.full_name}" phụ trách')
    if is_manager and payload.status not in MANAGER_TRANSITIONS.get(request.status, set()):
        raise HTTPException(
            409,
            f'Không thể chuyển yêu cầu từ "{STATUS_LABELS.get(request.status, request.status)}" '
            f'sang "{STATUS_LABELS.get(payload.status, payload.status)}"',
        )
    if is_manager and payload.status == 'QUOTED' and payload.quoted_price is None and request.quoted_price is None:
        raise HTTPException(422, 'Vui lòng nhập giá dự kiến khi gửi báo giá')

    if is_manager and payload.status == 'FULFILLED' and not (payload.product_id or payload.stock_quantity or request.product_id):
        raise HTTPException(422, 'Để hoàn tất, hãy nhập số lượng nhập kho hoặc liên kết một mặt hàng có sẵn — khách cần có hàng để đặt mua')

    stocked_product = None
    if is_manager and payload.status == 'FULFILLED' and (payload.product_id or payload.stock_quantity):
        stocked_product = _stock_product_for_request(db, request, payload, admin)
        request.product_id = stocked_product.id

    request.status = payload.status
    request.updated_at = datetime.now(timezone.utc)
    if payload.admin_response and is_manager:
        request.admin_response = payload.admin_response
    elif not is_manager and payload.status == 'REJECTED':
        # Closed by the customer: say so (the quoted price is kept for reference)
        request.admin_response = 'Khách hàng hủy yêu cầu'
    if payload.quoted_price is not None and is_manager:
        request.quoted_price = payload.quoted_price
    if is_manager:
        request.handled_by = admin.id
    write_audit(db, admin.id, 'product_request.updated', 'product_request', str(request.id), payload.status)

    if is_manager:
        body = payload.admin_response or f'Yêu cầu "{request.product_name}" đã chuyển sang: {STATUS_LABELS.get(payload.status, payload.status)}.'
        if stocked_product is not None:
            body += f' Mặt hàng "{stocked_product.name}" đã lên kệ, bạn có thể đặt mua ngay.'
        add_notification(
            db,
            request.user_id,
            f'Yêu cầu "{request.product_name}": {STATUS_LABELS.get(payload.status, payload.status)}',
            body,
            'product_request.updated',
            link=f'/products/{stocked_product.id}' if stocked_product is not None else f'/requests#request-{request.id}',
        )
        db.commit()
        serialized = serialize_request(db, request)
        await manager.send_user(request.user_id, event('notification.created', {'type': 'product_request.updated', 'request_id': request.id, 'request': serialized}))
        await manager.broadcast(event('product_request.updated', {'request_id': request.id, 'request': serialized}))
        if stocked_product is not None:
            await manager.broadcast(event('inventory.updated', {'product_id': stocked_product.id}))
        return serialized

    managers = db.scalars(select(User).where(User.role.in_(['ADMIN', 'SHOP']))).all()
    if request.handled_by:
        managers = [m for m in managers if m.role == 'ADMIN' or m.id == request.handled_by]
    for m in managers:
        add_notification(
            db,
            m.id,
            f'Khách {"đồng ý báo giá" if payload.status == "ACCEPTED" else "hủy yêu cầu"}: {request.product_name}',
            f'{admin.full_name} đã {"đồng ý mức báo giá" if payload.status == "ACCEPTED" else "hủy yêu cầu"} "{request.product_name}".'
            + (f' Lời nhắn: {payload.admin_response}' if payload.admin_response else ''),
            'product_request.updated',
            link=f'/requests#request-{request.id}',
        )
    db.commit()
    serialized = serialize_request(db, request)
    await manager.broadcast(event('product_request.updated', {'request_id': request.id, 'request': serialized}))
    return serialized
