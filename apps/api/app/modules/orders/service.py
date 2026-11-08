from decimal import Decimal
from datetime import datetime, timezone
from uuid import uuid4
from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.audit import write_audit
from app.core.notifications import add_notification
from app.models import Order, OrderItem, OrderStatusHistory, User, VatConfig
from app.schemas import OrderCreateIn, OrderStatusIn, ShipperAssignIn, OrderPaymentIn
from app.modules.orders import repository
from app.modules.inventory import service as inventory_service
from app.modules.pricing.service import unit_price as get_unit_price
from app.realtime import event, manager


def get_current_vat_rate(db: Session, category_id: int | None = None) -> Decimal:
    if category_id:
        vat = db.scalar(
            select(VatConfig)
            .where(VatConfig.is_active == True, VatConfig.category_id == category_id)
            .order_by(VatConfig.id.desc())
        )
        if vat:
            return vat.rate
    global_vat = db.scalar(
        select(VatConfig)
        .where(VatConfig.is_active == True, VatConfig.category_id.is_(None))
        .order_by(VatConfig.id.desc())
    )
    if global_vat:
        return global_vat.rate
    return Decimal("0.0800")


async def create_order(db: Session, payload: OrderCreateIn, user: User) -> Order:
    if payload.delivery_type not in {"PICKUP", "HOME", "CENTRAL"}:
        raise HTTPException(422, "delivery_type phải là PICKUP, CENTRAL hoặc HOME")

    if payload.delivery_type == "HOME" and not payload.delivery_address.strip():
        raise HTTPException(422, "Cần địa chỉ giao hàng khi chọn giao tận nơi")

    fee = Decimal("0")
    if payload.delivery_slot_id:
        slot = repository.get_delivery_slot(db, payload.delivery_slot_id)
        if not slot or not slot.is_active or slot.customer_group not in {"ALL", user.customer_group}:
            raise HTTPException(422, "Khung giao hàng không áp dụng")
        fee = slot.fee
    elif payload.delivery_type == "HOME":
        fee = Decimal("20000.00")

    batch_ids = sorted({line.batch_id for line in payload.items})
    batches = inventory_service.lock_batches(db, batch_ids)
    by_id = {batch.id: batch for batch in batches}

    if len(by_id) != len(batch_ids):
        raise HTTPException(404, "Không tìm thấy đợt hàng")

    demands_per_batch: dict[int, Decimal] = {}
    for line in payload.items:
        demands_per_batch[line.batch_id] = demands_per_batch.get(line.batch_id, Decimal("0")) + line.quantity

    for b_id, req_qty in demands_per_batch.items():
        b = by_id[b_id]
        if req_qty > b.available_quantity:
            prod = repository.get_product(db, b.product_id)
            raise HTTPException(409, f"Không đủ hàng cho {prod.name if prod else 'sản phẩm'}")

    line_items = []
    subtotal = Decimal("0")
    detected_shop_id = None

    for line in payload.items:
        batch = by_id[line.batch_id]
        product = repository.get_product(db, batch.product_id)

        if not batch.is_open or not product or not product.is_active:
            raise HTTPException(409, "Sản phẩm hoặc đợt hàng đã đóng")

        if product.shop_id and not detected_shop_id:
            detected_shop_id = product.shop_id

        line_unit_price = get_unit_price(db, product, user.customer_group)
        line_total = (line.quantity * line_unit_price).quantize(Decimal("0.01"))
        subtotal += line_total

        line_items.append(
            OrderItem(
                product_id=product.id,
                batch_id=batch.id,
                product_name_snapshot=product.name,
                unit_snapshot=product.unit,
                quantity=line.quantity,
                unit_price=line_unit_price,
                line_total=line_total,
            )
        )

    # Financial calculation
    vat_rate = get_current_vat_rate(db)
    vat_amount = (subtotal * vat_rate).quantize(Decimal("0.01"))
    discount = Decimal("0")
    total = (subtotal + vat_amount + fee - discount).quantize(Decimal("0.01"))

    paid_amount = Decimal("0")
    payment_status = "UNPAID"
    if payload.payment_method in {"BANK_TRANSFER", "WALLET"}:
        paid_amount = total
        payment_status = "PAID"

    debt_amount = total - paid_amount

    recipient = payload.recipient_name.strip() or user.full_name
    phone = payload.recipient_phone.strip() or user.phone or ""

    order = Order(
        order_number=f"FF-{datetime.now(timezone.utc):%y%m%d}-{uuid4().hex[:6].upper()}",
        user_id=user.id,
        shop_id=detected_shop_id,
        status="PENDING",
        delivery_type="CENTRAL" if payload.delivery_type in {"PICKUP", "CENTRAL"} else "HOME",
        delivery_address=payload.delivery_address,
        recipient_name=recipient,
        recipient_phone=phone,
        expected_delivery_time=payload.expected_delivery_time or "Trong ngày",
        subtotal=subtotal,
        vat_rate=vat_rate,
        vat_amount=vat_amount,
        delivery_fee=fee,
        discount_amount=discount,
        total=total,
        paid_amount=paid_amount,
        debt_amount=debt_amount,
        payment_status=payment_status,
        payment_method=payload.payment_method,
        note=payload.note,
        items=line_items,
    )

    db.add(order)
    db.flush()

    db.add(
        OrderStatusHistory(
            order_id=order.id,
            changed_by=user.id,
            old_status="",
            new_status="PENDING",
            note="Khách hàng đặt đơn mới",
        )
    )

    # Notify Shop and Admin
    if detected_shop_id:
        add_notification(
            db,
            detected_shop_id,
            "Có đơn hàng mới!",
            f"Đơn hàng {order.order_number} vừa được đặt, tổng tiền: {total:,.0f}đ",
            "order.new",
        )

    # Notify Admins
    admins = db.scalars(select(User).where(User.role == "ADMIN")).all()
    for adm in admins:
        add_notification(
            db,
            adm.id,
            "Đơn hàng mới trên hệ thống",
            f"Đơn {order.order_number} từ {user.full_name} trị giá {total:,.0f}đ",
            "order.new",
        )

    db.commit()
    db.refresh(order)
    repository.enrich_order_names(db, order)
    if detected_shop_id:
        await manager.send_user(detected_shop_id, event("notification.created", {"event_type": "order.new", "order_id": order.id}))
    for admin in admins:
        await manager.send_user(admin.id, event("notification.created", {"event_type": "order.new", "order_id": order.id}))
    return order


def check_order_access(order: Order, user: User):
    if user.role == "ADMIN":
        return
    if user.role == "CUSTOMER" and order.user_id != user.id:
        raise HTTPException(403, "Bạn không có quyền xem đơn hàng này")
    if user.role == "SHOP":
        if order.shop_id is not None and order.shop_id != user.id:
            raise HTTPException(403, "Đơn hàng này thuộc về Shop khác")
    if user.role == "SHIPPER":
        if order.shipper_id != user.id and not (order.shipper_id is None and order.status == "READY_FOR_PICKUP"):
            raise HTTPException(403, "Bạn không có quyền xem đơn hàng này")


def get_order_for_user(db: Session, order_id: int, user: User) -> Order:
    order = repository.get_order(db, order_id)
    if not order:
        raise HTTPException(404, "Không tìm thấy đơn hàng")

    check_order_access(order, user)
    repository.enrich_order_names(db, order)
    return order


def list_user_orders(
    db: Session,
    user: User,
    status: str | None = None,
    search: str | None = None,
    shop_id: int | None = None,
    shipper_id: int | None = None,
):
    return repository.list_orders(
        db, user, status=status, search=search, shop_id=shop_id, shipper_id=shipper_id
    )


def order_history_for_user(db: Session, order_id: int, user: User):
    order = repository.get_order(db, order_id)
    if not order:
        raise HTTPException(404, "Không tìm thấy đơn hàng")

    check_order_access(order, user)
    history = repository.get_order_history(db, order_id)
    out = []
    for item in history:
        actor = db.get(User, item.changed_by) if item.changed_by else None
        out.append({
            "id": item.id,
            "order_id": item.order_id,
            "changed_by": item.changed_by,
            "actor_name": (actor.shop_name or actor.full_name) if actor else "Hệ thống",
            "actor_role": actor.role if actor else "SYSTEM",
            "old_status": item.old_status,
            "new_status": item.new_status,
            "from_status": item.old_status,
            "to_status": item.new_status,
            "note": item.note,
            "created_at": item.created_at,
        })
    return out


async def change_order_status(
    db: Session, order_id: int, payload: OrderStatusIn, operator: User
) -> Order:
    order = repository.get_order(db, order_id, lock=True)
    if not order:
        raise HTTPException(404, "Không tìm thấy đơn hàng")

    old_status = order.status
    new_status = payload.status
    if new_status == "APPROVED":
        new_status = "CONFIRMED"

    if operator.role == "SHOP":
        if order.shop_id != operator.id:
            raise HTTPException(403, "Bạn không có quyền cập nhật đơn hàng của Shop khác hoặc đơn hàng của sàn")
        allowed = {
            "PENDING": {"CONFIRMED", "PREPARING", "CANCELLED", "REJECTED"},
            "CONFIRMED": {"PREPARING", "READY_FOR_PICKUP", "CANCELLED"},
            "PREPARING": {"READY_FOR_PICKUP", "CANCELLED"},
            "READY_FOR_PICKUP": {"CANCELLED"},
        }
        if order.delivery_type in {"PICKUP", "CENTRAL"}:
            allowed["CONFIRMED"].add("COMPLETED")
            allowed["PREPARING"].add("COMPLETED")
            allowed["READY_FOR_PICKUP"].add("COMPLETED")
        if new_status not in allowed.get(old_status, set()):
            raise HTTPException(409, "Trạng thái đơn hàng không thể được Shop cập nhật theo bước này")
    elif operator.role == "SHIPPER":
        if order.shipper_id != operator.id:
            raise HTTPException(403, "Đơn hàng này chưa được giao cho bạn")
        allowed = {"READY_FOR_PICKUP": {"PICKED_UP"}, "PICKED_UP": {"DELIVERING"}, "DELIVERING": {"COMPLETED"}}
        if new_status not in allowed.get(old_status, set()):
            raise HTTPException(409, "Trạng thái giao hàng không hợp lệ")
    elif operator.role == "CUSTOMER":
        if order.user_id != operator.id or (old_status != "PENDING" or new_status != "CANCELLED"):
            raise HTTPException(403, "Bạn không có quyền cập nhật trạng thái đơn hàng này")

    if old_status in {"CANCELLED", "REJECTED"} and new_status != old_status:
        raise HTTPException(409, "Đơn hàng đã hủy hoặc bị từ chối, không thể đổi trạng thái")

    RESERVED_STATUSES = {"CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "PICKED_UP", "DELIVERING", "COMPLETED"}

    # Inventory quantity management
    if old_status == "PENDING" and new_status in RESERVED_STATUSES:
        demand: dict[int, Decimal] = {}
        for item in order.items:
            demand[item.batch_id] = demand.get(item.batch_id, Decimal("0")) + item.quantity
        inventory_service.approve_quantities(db, demand)

    if new_status in {"CANCELLED", "REJECTED"} and old_status in RESERVED_STATUSES:
        demand: dict[int, Decimal] = {}
        for item in order.items:
            demand[item.batch_id] = demand.get(item.batch_id, Decimal("0")) + item.quantity
        inventory_service.release_quantities(db, demand)
        order.debt_amount = Decimal("0")

    # When completed, ensure payment status is updated if it was COD
    if new_status == "COMPLETED":
        if order.payment_method == "COD" and order.payment_status in {"UNPAID", "DEBT"}:
            order.paid_amount = order.total
            order.debt_amount = Decimal("0")
            order.payment_status = "PAID"
            order.cash_collected_by_shipper = order.total

    order.status = new_status
    order.updated_at = datetime.now(timezone.utc)

    db.add(
        OrderStatusHistory(
            order_id=order.id,
            changed_by=operator.id,
            old_status=old_status,
            new_status=new_status,
            note=payload.note or f"Trạng thái cập nhật bởi {operator.full_name} ({operator.role})",
        )
    )

    write_audit(
        db,
        operator.id,
        "order.status_changed",
        "order",
        str(order.id),
        f"{old_status}->{new_status}",
    )

    status_vn_map = {
        "PENDING": "Chờ xác nhận",
        "CONFIRMED": "Đã xác nhận",
        "PREPARING": "Đang chuẩn bị hàng",
        "READY_FOR_PICKUP": "Chờ Shipper lấy hàng",
        "PICKED_UP": "Shipper đã lấy hàng",
        "DELIVERING": "Đang giao hàng",
        "COMPLETED": "Giao hàng thành công",
        "CANCELLED": "Đã hủy",
        "REJECTED": "Đã từ chối",
    }
    vn_status = status_vn_map.get(new_status, new_status)

    # Notification to customer
    add_notification(
        db,
        order.user_id,
        f"Đơn hàng {order.order_number}: {vn_status}",
        f"Đơn hàng của bạn hiện đang ở trạng thái: {vn_status}. {payload.note}",
        "order.status_changed",
    )

    # If completed, notify Shop and Admin
    if new_status == "COMPLETED":
        if order.shop_id:
            add_notification(
                db,
                order.shop_id,
                f"Đơn hàng {order.order_number} đã giao thành công!",
                f"Khách hàng đã nhận hàng và hoàn tất thanh toán {order.total:,.0f}đ",
                "order.completed",
            )
        admins = db.scalars(select(User).where(User.role == "ADMIN")).all()
        for adm in admins:
            add_notification(
                db,
                adm.id,
                f"Đơn hàng {order.order_number} giao thành công",
                f"Shipper đã hoàn tất giao đơn {order.order_number}",
                "order.completed",
            )

    product_ids = {item.product_id for item in order.items}
    db.commit()
    db.refresh(order)
    repository.enrich_order_names(db, order)

    # WebSocket events
    await manager.send_user(
        order.user_id,
        event("order.status_changed", {"order_id": order.id, "status": order.status, "status_text": vn_status}),
    )
    if order.shop_id:
        await manager.send_user(order.shop_id, event("notification.created", {"event_type": "order.status_changed", "order_id": order.id, "status": order.status}))
    if order.shipper_id:
        await manager.send_user(order.shipper_id, event("order.status_changed", {"order_id": order.id, "status": order.status, "status_text": vn_status}))

    for pid in product_ids:
        await manager.broadcast(event("inventory.updated", {"product_id": pid}))

    return order


async def assign_shipper_to_order(
    db: Session, order_id: int, payload: ShipperAssignIn, operator: User
) -> Order:
    order = repository.get_order(db, order_id, lock=True)
    if not order:
        raise HTTPException(404, "Không tìm thấy đơn hàng")

    if operator.role == "SHOP":
        if order.shop_id != operator.id:
            raise HTTPException(403, "Bạn không có quyền phân công đơn hàng của Shop khác hoặc đơn hàng của sàn")
    if operator.role == "SHIPPER":
        raise HTTPException(403, "Shipper không thể tự phân công đơn hàng")

    shipper = db.get(User, payload.shipper_id)
    if not shipper or shipper.role != "SHIPPER":
        raise HTTPException(422, "Người dùng này không phải là Shipper")

    old_status = order.status
    order.shipper_id = shipper.id
    if order.status in {"CONFIRMED", "PREPARING"}:
        order.status = "READY_FOR_PICKUP"

    db.add(
        OrderStatusHistory(
            order_id=order.id,
            changed_by=operator.id,
            old_status=old_status,
            new_status=order.status,
            note=f"Phân công Shipper phụ trách: {shipper.full_name}",
        )
    )

    add_notification(
        db,
        shipper.id,
        "Bạn có đơn hàng mới cần giao!",
        f"Đơn {order.order_number} đã được phân công cho bạn. Điểm giao: {order.delivery_address}",
        "order.assigned",
    )

    db.commit()
    db.refresh(order)
    repository.enrich_order_names(db, order)
    await manager.send_user(shipper.id, event("order.assigned", {"order_id": order.id, "status": order.status}))
    if order.shop_id:
        await manager.send_user(order.shop_id, event("notification.created", {"event_type": "order.assigned", "order_id": order.id}))
    return order


def update_order_payment(
    db: Session, order_id: int, payload: OrderPaymentIn, operator: User
) -> Order:
    order = repository.get_order(db, order_id, lock=True)
    if not order:
        raise HTTPException(404, "Không tìm thấy đơn hàng")

    if operator.role == "SHIPPER":
        if order.shipper_id != operator.id or order.status != "COMPLETED":
            raise HTTPException(403, "Bạn chỉ có thể ghi nhận COD của đơn đã giao cho mình")
    elif operator.role != "ADMIN":
        raise HTTPException(403, "Bạn không có quyền cập nhật thanh toán đơn hàng")

    order.paid_amount = payload.paid_amount
    order.debt_amount = max(Decimal("0"), order.total - payload.paid_amount)
    order.payment_status = payload.payment_status
    if payload.cash_collected > Decimal("0"):
        order.cash_collected_by_shipper = payload.cash_collected

    write_audit(
        db,
        operator.id,
        "order.payment_updated",
        "order",
        str(order.id),
        f"Paid: {order.paid_amount}, Debt: {order.debt_amount}, Status: {order.payment_status}",
    )

    db.commit()
    db.refresh(order)
    repository.enrich_order_names(db, order)
    return order
