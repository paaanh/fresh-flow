from decimal import ROUND_HALF_UP, Decimal
from datetime import datetime, timezone
from uuid import uuid4
from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, update

from app.core.audit import write_audit
from app.core.notifications import add_notification
from app.models import InventoryBatch, Order, OrderItem, OrderStatusHistory, User, VatConfig
from app.schemas import OrderCreateIn, OrderStatusIn, ShipperAssignIn, OrderPaymentIn, ShortageResolutionIn
from app.modules.orders import repository
from app.modules.inventory import service as inventory_service
from app.modules.pricing.service import unit_price as get_unit_price
from app.modules.posts import pricing as post_pricing
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

        if line.post_id:
            # Giá theo chương trình của bài + giữ hạn mức mở bán của bài (nguyên tử)
            line_unit_price, _ = post_pricing.price_for_order_line(db, line.post_id, product, line.quantity, user)
        else:
            line_unit_price = get_unit_price(db, product, user.customer_group)
        line_total = (line.quantity * line_unit_price).quantize(Decimal("1"), rounding=ROUND_HALF_UP)  # whole dong (decimal quantities)
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
                post_id=line.post_id,
            )
        )

    # Financial calculation
    vat_rate = get_current_vat_rate(db)
    vat_amount = (subtotal * vat_rate).quantize(Decimal("1"), rounding=ROUND_HALF_UP)  # VND has no fractions
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
    order_link = f"/orders/{order.order_number}"
    if detected_shop_id:
        add_notification(
            db,
            detected_shop_id,
            "Có đơn hàng mới!",
            f"Đơn hàng {order.order_number} vừa được đặt, tổng tiền: {total:,.0f}đ",
            "order.new",
            link=order_link,
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
            link=f"/admin/orders/{order.order_number}",
        )

    db.commit()
    db.refresh(order)
    repository.enrich_order_names(db, order)
    if detected_shop_id:
        await manager.send_user(detected_shop_id, event("notification.created", {"event_type": "order.new", "order_id": order.id}))
    for admin in admins:
        await manager.send_user(admin.id, event("notification.created", {"event_type": "order.new", "order_id": order.id}))
    await manager.broadcast(
        event(
            "order.new",
            {
                "order_id": order.id,
                "order_number": order.order_number,
                "status": order.status,
                "shop_id": order.shop_id,
                "user_id": order.user_id,
            },
        )
    )
    for item in order.items:
        await manager.broadcast(event("inventory.updated", {"product_id": item.product_id}))
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

    apply_inventory_transition(db, order, new_status)
    if new_status in {"CANCELLED", "REJECTED"}:
        order.debt_amount = Decimal("0")
        if old_status not in {"CANCELLED", "REJECTED"}:
            for item in order.items:
                post_pricing.release_quota(db, item.post_id, item.product_id, item.quantity)

    # When completed, ensure payment status is updated if it was COD
    if new_status == "COMPLETED":
        # COD: khách trả nốt phần còn nợ khi nhận hàng (giữ nguyên phần đã trả trước)
        if order.payment_method == "COD" and order.payment_status not in {"PAID", "PREPAID"}:
            outstanding = max(Decimal("0"), order.total - order.paid_amount)
            order.paid_amount = order.total
            order.debt_amount = Decimal("0")
            order.payment_status = "PAID"
            order.cash_collected_by_shipper = (order.cash_collected_by_shipper or Decimal("0")) + outstanding

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
    order_link = f"/orders/{order.order_number}"
    add_notification(
        db,
        order.user_id,
        f"Đơn hàng {order.order_number}: {vn_status}",
        f"Đơn hàng của bạn hiện đang ở trạng thái: {vn_status}. {payload.note}",
        "order.status_changed",
        link=order_link,
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
                link=order_link,
            )
        admins = db.scalars(select(User).where(User.role == "ADMIN")).all()
        for adm in admins:
            add_notification(
                db,
                adm.id,
                f"Đơn hàng {order.order_number} giao thành công",
                f"Shipper đã hoàn tất giao đơn {order.order_number}",
                "order.completed",
                link=f"/admin/orders/{order.order_number}",
            )

    product_ids = {item.product_id for item in order.items}
    db.commit()
    db.refresh(order)
    repository.enrich_order_names(db, order)

    # WebSocket events
    await manager.send_user(
        order.user_id,
        event("order.status_changed", {"order_id": order.id, "order_number": order.order_number, "status": order.status, "status_text": vn_status}),
    )
    if order.shop_id:
        await manager.send_user(order.shop_id, event("notification.created", {"event_type": "order.status_changed", "order_id": order.id, "status": order.status}))
    if order.shipper_id:
        await manager.send_user(order.shipper_id, event("order.status_changed", {"order_id": order.id, "order_number": order.order_number, "status": order.status, "status_text": vn_status}))

    await manager.broadcast(
        event(
            "order.status_changed",
            {
                "order_id": order.id,
                "order_number": order.order_number,
                "status": order.status,
                "status_text": vn_status,
                "actor_role": operator.role,
            },
        )
    )

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
    if not shipper or shipper.role != "SHIPPER" or not shipper.is_active:
        raise HTTPException(422, "Người dùng này không phải là Shipper đang hoạt động")
    if order.status == "PENDING":
        raise HTTPException(409, "Cần xác nhận đơn (giữ hàng trong kho) trước khi phân công Shipper")
    if order.status not in {"CONFIRMED", "PREPARING", "READY_FOR_PICKUP"}:
        raise HTTPException(409, "Đơn hàng đã được lấy/giao hoặc đã hủy, không thể phân công lại Shipper")

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
        f"Đơn {order.order_number} ({len(order.items)} mặt hàng, {'thu COD ' + format(order.debt_amount, ',.0f') + 'đ' if order.payment_method == 'COD' else 'đã thanh toán'}) đã được phân công cho bạn. "
        f"Người nhận: {order.recipient_name} {order.recipient_phone}. Điểm giao: {order.delivery_address or 'Điểm giao tập trung'}",
        "order.assigned",
        link="/shipper",
    )
    add_notification(
        db,
        order.user_id,
        f"Đơn hàng {order.order_number} đã có Shipper nhận giao",
        f"Tài xế {shipper.full_name} ({shipper.phone or 'Đang cập nhật'}) đã nhận giao đơn của bạn.",
        "order.assigned",
        link=f"/orders/{order.order_number}",
    )

    db.commit()
    db.refresh(order)
    repository.enrich_order_names(db, order)
    await manager.send_user(shipper.id, event("order.assigned", {"order_id": order.id, "order_number": order.order_number, "status": order.status, "shipper_id": shipper.id}))
    await manager.send_user(shipper.id, event("notification.created", {"event_type": "order.assigned", "order_id": order.id}))
    await manager.send_user(order.user_id, event("order.status_changed", {"order_id": order.id, "order_number": order.order_number, "status": order.status}))
    if order.shop_id:
        await manager.send_user(order.shop_id, event("notification.created", {"event_type": "order.assigned", "order_id": order.id}))
    await manager.broadcast(
        event(
            "order.assigned",
            {
                "order_id": order.id,
                "order_number": order.order_number,
                "shipper_id": shipper.id,
                "shipper_name": shipper.full_name,
                "status": order.status,
            },
        )
    )
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
    if payload.cash_collected > Decimal("0") or operator.role == "SHIPPER":
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


# ---------------------------------------------------------------------------
# Inventory lifecycle: NONE -> RESERVED (xác nhận) -> SHIPPED (xuất kho)
#                      RESERVED -> RELEASED (hủy đơn, hoàn trả giữ chỗ)
# ---------------------------------------------------------------------------
RESERVING_STATUSES = {"CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "PICKED_UP", "DELIVERING", "COMPLETED"}
SHIPPING_STATUSES = {"PICKED_UP", "DELIVERING", "COMPLETED"}
TERMINATING_STATUSES = {"CANCELLED", "REJECTED"}


def _claim_inventory_state(db: Session, order_id: int, from_state: str, to_state: str) -> bool:
    """Compare-and-set on orders.inventory_state so concurrent requests on the same
    order (double click, admin + shop at once) can only apply a transition once."""
    result = db.execute(
        update(Order)
        .where(Order.id == order_id, Order.inventory_state == from_state)
        .values(inventory_state=to_state)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount == 1


def _batch_demand(order: Order) -> dict[int, Decimal]:
    demand: dict[int, Decimal] = {}
    for item in order.items:
        demand[item.batch_id] = demand.get(item.batch_id, Decimal("0")) + item.quantity
    return demand


def _reserve_order_items(db: Session, order: Order) -> None:
    """Reserve stock for every line. A line may be served from several open batches
    of the same product (FIFO); it is split into several order lines in that case.
    Raises 409 and reserves nothing when the total available stock is insufficient."""
    plan: list[tuple[OrderItem, list[tuple[int, Decimal]]]] = []
    shortages: list[str] = []
    for item in sorted(order.items, key=lambda line: (line.product_id, line.batch_id)):
        remaining = item.quantity
        allocations: list[tuple[int, Decimal]] = []
        candidate_ids = [item.batch_id] + list(
            db.scalars(
                select(InventoryBatch.id)
                .where(
                    InventoryBatch.product_id == item.product_id,
                    InventoryBatch.is_open.is_(True),
                    InventoryBatch.id != item.batch_id,
                )
                .order_by(InventoryBatch.batch_date, InventoryBatch.id)
            ).all()
        )
        for batch_id in candidate_ids:
            if remaining <= 0:
                break
            batch = db.get(InventoryBatch, batch_id, populate_existing=True)
            if not batch or not batch.is_open:
                continue
            take = min(batch.available_quantity, remaining)
            if take <= 0:
                continue
            if inventory_service.try_reserve(db, batch_id, take):
                allocations.append((batch_id, take))
                remaining -= take
        if remaining > 0:
            shortages.append(item.product_name_snapshot)
        plan.append((item, allocations))

    if shortages:
        db.rollback()
        raise HTTPException(
            409,
            "Không đủ tồn kho khả dụng để xác nhận đơn ("
            + ", ".join(sorted(set(shortages)))
            + "). Hãy chọn phương án xử lý: giao một phần, chờ nhập thêm hàng hoặc báo hết hàng.",
        )

    for item, allocations in plan:
        first_batch, first_qty = allocations[0]
        extra_total = Decimal("0")
        for batch_id, qty in allocations[1:]:
            line_total = (qty * item.unit_price).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
            extra_total += line_total
            order.items.append(
                OrderItem(
                    product_id=item.product_id,
                    batch_id=batch_id,
                    product_name_snapshot=item.product_name_snapshot,
                    unit_snapshot=item.unit_snapshot,
                    quantity=qty,
                    unit_price=item.unit_price,
                    line_total=line_total,
                    post_id=item.post_id,
                )
            )
        item.batch_id = first_batch
        item.quantity = first_qty
        item.line_total = item.line_total - extra_total
    db.flush()


def apply_inventory_transition(db: Session, order: Order, new_status: str) -> None:
    state = order.inventory_state or "NONE"
    if new_status in RESERVING_STATUSES and state == "NONE":
        if not _claim_inventory_state(db, order.id, "NONE", "RESERVED"):
            raise HTTPException(409, "Đơn hàng đang được xử lý giữ hàng bởi thao tác khác, vui lòng tải lại")
        _reserve_order_items(db, order)
        state = "RESERVED"
    if new_status in SHIPPING_STATUSES and state == "RESERVED":
        if _claim_inventory_state(db, order.id, "RESERVED", "SHIPPED"):
            inventory_service.ship_quantities(db, _batch_demand(order))
    elif new_status in TERMINATING_STATUSES and state == "RESERVED":
        if _claim_inventory_state(db, order.id, "RESERVED", "RELEASED"):
            inventory_service.release_quantities(db, _batch_demand(order))
    elif new_status in TERMINATING_STATUSES and state == "SHIPPED" and order.status != "COMPLETED":
        # Hủy khi hàng đang trên đường (đã lấy/đang giao): hàng được hoàn về kho.
        # Đơn đã giao thành công thì hàng đã ở chỗ khách, không tự cộng lại tồn.
        if _claim_inventory_state(db, order.id, "SHIPPED", "RETURNED"):
            inventory_service.restock_quantities(db, _batch_demand(order))
    db.flush()
    db.refresh(order)


def _recalculate_totals(order: Order) -> None:
    subtotal = sum((item.line_total for item in order.items), Decimal("0"))
    order.subtotal = subtotal
    order.vat_amount = (subtotal * order.vat_rate).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    order.total = (subtotal + order.vat_amount + order.delivery_fee - order.discount_amount).quantize(Decimal("0.01"))
    order.debt_amount = max(Decimal("0"), order.total - order.paid_amount)


def _require_order_manager(order: Order, operator: User) -> None:
    if operator.role not in {"ADMIN", "SHOP"}:
        raise HTTPException(403, "Bạn không có quyền xử lý tồn kho của đơn hàng")
    if operator.role == "SHOP" and order.shop_id != operator.id:
        raise HTTPException(403, "Đơn hàng này thuộc về Shop khác")


def stock_check(db: Session, order_id: int, operator: User) -> dict:
    order = repository.get_order(db, order_id)
    if not order:
        raise HTTPException(404, "Không tìm thấy đơn hàng")
    _require_order_manager(order, operator)

    requested: dict[int, Decimal] = {}
    names: dict[int, tuple[str, str]] = {}
    for item in order.items:
        requested[item.product_id] = requested.get(item.product_id, Decimal("0")) + item.quantity
        names[item.product_id] = (item.product_name_snapshot, item.unit_snapshot)

    needs_reservation = (order.inventory_state or "NONE") == "NONE"
    lines = []
    for product_id, qty in requested.items():
        available = inventory_service.available_quantity(db, product_id)
        competing = db.execute(
            select(Order.id, Order.order_number, Order.created_at, OrderItem.quantity)
            .join(OrderItem, OrderItem.order_id == Order.id)
            .where(Order.status == "PENDING", Order.id != order.id, OrderItem.product_id == product_id)
            .order_by(Order.created_at)
        ).all()
        lines.append({
            "product_id": product_id,
            "product_name": names[product_id][0],
            "unit": names[product_id][1],
            "requested_quantity": qty,
            "available_quantity": available,
            "shortage_quantity": max(Decimal("0"), qty - available) if needs_reservation else Decimal("0"),
            "competing_pending_orders": [
                {"order_id": oid, "order_number": num, "created_at": created, "quantity": q}
                for oid, num, created, q in competing
            ],
        })
    return {
        "order_id": order.id,
        "order_number": order.order_number,
        "status": order.status,
        "inventory_state": order.inventory_state,
        "can_fulfill": all(line["shortage_quantity"] <= 0 for line in lines),
        "lines": lines,
    }


async def resolve_shortage(db: Session, order_id: int, payload: ShortageResolutionIn, operator: User) -> Order:
    order = repository.get_order(db, order_id, lock=True)
    if not order:
        raise HTTPException(404, "Không tìm thấy đơn hàng")
    _require_order_manager(order, operator)
    if order.status != "PENDING" or (order.inventory_state or "NONE") != "NONE":
        raise HTTPException(409, "Chỉ xử lý thiếu hàng cho đơn đang chờ xác nhận")

    if payload.action == "OUT_OF_STOCK":
        note = payload.note or "Rất tiếc, mặt hàng trong đơn đã hết. Đơn hàng được hủy và không phát sinh chi phí."
        return await change_order_status(db, order.id, OrderStatusIn(status="CANCELLED", note=note), operator)

    if payload.action == "WAIT":
        note = payload.note or "Đơn hàng đang chờ nhập thêm hàng, chúng tôi sẽ xác nhận ngay khi đủ hàng."
        db.add(OrderStatusHistory(order_id=order.id, changed_by=operator.id, old_status="PENDING", new_status="PENDING", note=f"[Chờ nhập hàng] {note}"))
        add_notification(db, order.user_id, f"Đơn {order.order_number} đang chờ nhập thêm hàng", note, "order.status_changed", link=f"/orders/{order.order_number}")
        write_audit(db, operator.id, "order.backorder", "order", str(order.id), note)
        db.commit()
        db.refresh(order)
        repository.enrich_order_names(db, order)
        await manager.send_user(order.user_id, event("notification.created", {"event_type": "order.status_changed", "order_id": order.id}))
        return order

    # PARTIAL: giảm số lượng từng dòng về mức còn khả dụng (theo thứ tự dòng) rồi xác nhận đơn
    available: dict[int, Decimal] = {}
    adjustments: list[str] = []
    for item in list(order.items):
        if item.product_id not in available:
            available[item.product_id] = inventory_service.available_quantity(db, item.product_id)
        take = min(item.quantity, available[item.product_id])
        if take < item.quantity:
            adjustments.append(f"{item.product_name_snapshot}: {item.quantity.normalize():f} -> {take.normalize():f} {item.unit_snapshot}")
        available[item.product_id] -= take
        post_pricing.release_quota(db, item.post_id, item.product_id, item.quantity - take)
        if take <= 0:
            order.items.remove(item)
        else:
            item.quantity = take
            item.line_total = (take * item.unit_price).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    if not order.items:
        db.rollback()
        raise HTTPException(409, "Không còn mặt hàng nào khả dụng để giao một phần. Hãy chọn 'Báo hết hàng' hoặc 'Chờ nhập hàng'.")
    _recalculate_totals(order)
    db.flush()
    if adjustments:
        add_notification(db, order.user_id, f"Đơn {order.order_number} được giao một phần", "Do thiếu hàng, số lượng đã điều chỉnh: " + "; ".join(adjustments), "order.status_changed", link=f"/orders/{order.order_number}")
    note = payload.note or ("Giao một phần do thiếu hàng: " + "; ".join(adjustments) if adjustments else "Xác nhận đơn")
    return await change_order_status(db, order.id, OrderStatusIn(status="CONFIRMED", note=note[:1000]), operator)
