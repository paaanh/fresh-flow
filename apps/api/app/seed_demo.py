"""Create repeatable demo data for local FreshFlow development."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from app.core.security import hash_password, verify_password
from app.db import SessionLocal
from app.db.init_db import init_database
from app.models import (
    Address,
    AuditLog,
    Category,
    DeliverySlot,
    InventoryBatch,
    ModerationTerm,
    Notification,
    Order,
    OrderItem,
    OrderStatusHistory,
    PriceRule,
    Product,
    ProductRequest,
    User,
)


ADMIN_EMAIL = "admin@freshflow.example.com"
ADMIN_PASSWORD = "FreshFlowAdmin123!"
STUDENT_EMAIL = "student@freshflow.example.com"
STUDENT_PASSWORD = "FreshFlowDemo123!"
WORKER_EMAIL = "worker@freshflow.example.com"
WORKER_PASSWORD = "FreshFlowDemo123!"
LEGACY_EMAILS = {
    ADMIN_EMAIL: "admin@freshflow.local",
    STUDENT_EMAIL: "student@freshflow.local",
    WORKER_EMAIL: "worker@freshflow.local",
}


def get_user(db, email: str, name: str, role: str, group: str, phone: str, password: str) -> User:
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = db.scalar(select(User).where(User.email == LEGACY_EMAILS[email]))
        if user is not None:
            user.email = email
    if user is None:
        user = User(email=email)
        db.add(user)
    user.full_name = name
    user.role = role
    user.customer_group = group
    user.phone = phone
    user.is_active = True
    if not user.password_hash or not verify_password(password, user.password_hash):
        user.password_hash = hash_password(password)
    db.flush()
    return user


def get_category(db, name: str) -> Category:
    category = db.scalar(select(Category).where(Category.name == name))
    if category is None:
        category = Category(name=name, is_active=True)
        db.add(category)
        db.flush()
    return category


def get_product(db, *, name: str, category: Category, description: str, unit: str, price: str, image: str) -> Product:
    product = db.scalar(select(Product).where(Product.name == name))
    if product is None:
        product = Product(name=name)
        db.add(product)
    product.category_id = category.id
    product.description = description
    product.unit = unit
    product.base_price = Decimal(price)
    product.image_url = image
    product.is_active = True
    db.flush()
    return product


def ensure_batch(db, product: Product, batch_date: datetime, quantity: str) -> InventoryBatch:
    batch = db.scalar(
        select(InventoryBatch).where(
            InventoryBatch.product_id == product.id,
            InventoryBatch.batch_date == batch_date,
        )
    )
    if batch is None:
        batch = InventoryBatch(
            product_id=product.id,
            batch_date=batch_date,
            initial_quantity=Decimal(quantity),
            approved_quantity=Decimal("0"),
            is_open=True,
        )
        db.add(batch)
        db.flush()
    return batch


def ensure_price(db, product: Product, group: str, price: str) -> None:
    rule = db.scalar(
        select(PriceRule).where(
            PriceRule.product_id == product.id,
            PriceRule.customer_group == group,
        )
    )
    if rule is None:
        db.add(PriceRule(product_id=product.id, customer_group=group, unit_price=Decimal(price)))
    else:
        rule.unit_price = Decimal(price)


def ensure_slot(db, name: str, group: str, fee: str) -> DeliverySlot:
    slot = db.scalar(
        select(DeliverySlot).where(
            DeliverySlot.name == name,
            DeliverySlot.customer_group == group,
        )
    )
    if slot is None:
        slot = DeliverySlot(name=name, customer_group=group)
        db.add(slot)
    slot.fee = Decimal(fee)
    slot.is_active = True
    db.flush()
    return slot


def ensure_address(db, user: User, label: str, recipient: str, phone: str, line1: str) -> None:
    address = db.scalar(
        select(Address).where(Address.user_id == user.id, Address.label == label)
    )
    if address is None:
        address = Address(user_id=user.id, label=label)
        db.add(address)
    address.recipient = recipient
    address.phone = phone
    address.line1 = line1
    address.ward = "Phường Bến Nghé"
    address.district = "Quận 1"
    address.city = "TP. Hồ Chí Minh"
    address.is_default = True


def ensure_order(db, *, number: str, user: User, admin: User, status: str,
                 delivery_type: str, address: str, slot: DeliverySlot,
                 product: Product, batch: InventoryBatch, quantity: str,
                 unit_price: str, created_at: datetime) -> None:
    order = db.scalar(select(Order).where(Order.order_number == number))
    if order is not None:
        return

    qty = Decimal(quantity)
    price = Decimal(unit_price)
    subtotal = qty * price
    vat_rate = Decimal("0.0800")
    vat_amount = (subtotal * vat_rate).quantize(Decimal("0.01"))
    total = subtotal + vat_amount + slot.fee
    paid_amount = total if status == "COMPLETED" else Decimal("0.00")
    payment_status = "PAID" if status == "COMPLETED" else "UNPAID"
    order = Order(
        order_number=number,
        user_id=user.id,
        status=status,
        delivery_type=delivery_type,
        delivery_address=address,
        delivery_fee=slot.fee,
        subtotal=subtotal,
        vat_rate=vat_rate,
        vat_amount=vat_amount,
        total=total,
        paid_amount=paid_amount,
        debt_amount=Decimal("0.00"),
        payment_status=payment_status,
        payment_method="COD",
        cash_collected_by_shipper=paid_amount,
        note="Đơn hàng demo để kiểm tra giao diện và báo cáo.",
        created_at=created_at,
        updated_at=created_at,
        items=[OrderItem(
            product_id=product.id,
            batch_id=batch.id,
            product_name_snapshot=product.name,
            unit_snapshot=product.unit,
            quantity=qty,
            unit_price=price,
            line_total=subtotal,
        )],
    )
    db.add(order)
    db.flush()
    if status in {"APPROVED", "PREPARING", "DELIVERING", "COMPLETED"}:
        batch.approved_quantity += qty
    db.add(OrderStatusHistory(
        order_id=order.id,
        changed_by=admin.id,
        old_status="",
        new_status=status,
        note="Trạng thái ban đầu của dữ liệu demo.",
        created_at=created_at,
    ))


def ensure_request(db, user: User, product_name: str, description: str, status: str,
                   response: str = "", quoted_price: str | None = None) -> None:
    request = db.scalar(
        select(ProductRequest).where(
            ProductRequest.user_id == user.id,
            ProductRequest.product_name == product_name,
        )
    )
    if request is None:
        request = ProductRequest(user_id=user.id, product_name=product_name)
        db.add(request)
    request.description = description
    request.status = status
    request.admin_response = response
    request.quoted_price = Decimal(quoted_price) if quoted_price else None


def ensure_notification(db, user: User, title: str, body: str, event_type: str, is_read: bool = False) -> None:
    notification = db.scalar(
        select(Notification).where(
            Notification.user_id == user.id,
            Notification.title == title,
            Notification.event_type == event_type,
        )
    )
    if notification is None:
        db.add(Notification(
            user_id=user.id,
            title=title,
            body=body,
            event_type=event_type,
            is_read=is_read,
        ))


def ensure_moderation_term(db, term: str) -> None:
    existing = db.scalar(select(ModerationTerm).where(ModerationTerm.term == term))
    if existing is None:
        db.add(ModerationTerm(term=term, is_active=True))


def ensure_audit(db, admin: User, action: str, entity_type: str, entity_id: str, details: str) -> None:
    existing = db.scalar(
        select(AuditLog).where(
            AuditLog.actor_id == admin.id,
            AuditLog.action == action,
            AuditLog.entity_type == entity_type,
            AuditLog.entity_id == entity_id,
            AuditLog.details == details,
        )
    )
    if existing is None:
        db.add(AuditLog(
            actor_id=admin.id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details,
        ))


def main() -> None:
    init_database()
    now = datetime.now(timezone.utc).replace(microsecond=0)
    batch_date = now.replace(hour=0, minute=0, second=0)
    db = SessionLocal()
    try:
        admin = get_user(db, ADMIN_EMAIL, "FreshFlow Admin", "ADMIN", "WORKING", "0900000101", ADMIN_PASSWORD)
        student = get_user(db, STUDENT_EMAIL, "Nguyễn Minh Anh", "CUSTOMER", "STUDENT", "0900000102", STUDENT_PASSWORD)
        worker = get_user(db, WORKER_EMAIL, "Trần Hoàng Nam", "CUSTOMER", "WORKING", "0900000103", WORKER_PASSWORD)

        vegetables = get_category(db, "Rau củ")
        fruits = get_category(db, "Trái cây")
        staples = get_category(db, "Thực phẩm")
        products = [
            get_product(db, name="Rau cải kale", category=vegetables, description="Rau kale tươi thu hoạch trong ngày.", unit="bó", price="42000", image="http://localhost:3000/images/kale.jpg"),
            get_product(db, name="Bơ sáp", category=fruits, description="Bơ sáp chín tự nhiên.", unit="kg", price="68000", image="http://localhost:3000/images/avocado.jpg"),
            get_product(db, name="Chuối tiêu", category=fruits, description="Chuối tiêu chín vừa.", unit="nải", price="28000", image="http://localhost:3000/images/banana.jpg"),
            get_product(db, name="Trứng gà sạch", category=staples, description="Trứng gà đóng hộp 10 quả.", unit="hộp", price="35000", image="http://localhost:3000/images/eggs.jpg"),
        ]
        batches = {product.name: ensure_batch(db, product, batch_date, "100") for product in products}
        for product, student_price, worker_price in zip(products, ("39000", "62000", "25000", "33000"), ("42000", "68000", "28000", "35000")):
            ensure_price(db, product, "STUDENT", student_price)
            ensure_price(db, product, "WORKING", worker_price)

        student_slot = ensure_slot(db, "Điểm giao khu A · 11:30", "STUDENT", "0")
        worker_slot = ensure_slot(db, "Giao tận nơi · 17:00", "WORKING", "15000")
        ensure_address(db, student, "Ký túc xá", student.full_name, student.phone or "0900000102", "Khu A, Đại học Quốc gia")
        ensure_address(db, worker, "Nhà", worker.full_name, worker.phone or "0900000103", "12 Nguyễn Huệ")

        ensure_order(db, number="FF-DEMO-PENDING-01", user=student, admin=admin, status="PENDING", delivery_type="PICKUP", address="", slot=student_slot, product=products[0], batch=batches[products[0].name], quantity="2", unit_price="39000", created_at=now - timedelta(hours=2))
        ensure_order(db, number="FF-DEMO-PREPARING-01", user=worker, admin=admin, status="PREPARING", delivery_type="HOME", address="12 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh", slot=worker_slot, product=products[1], batch=batches[products[1].name], quantity="1", unit_price="68000", created_at=now - timedelta(days=1))
        ensure_order(db, number="FF-DEMO-COMPLETED-01", user=student, admin=admin, status="COMPLETED", delivery_type="PICKUP", address="", slot=student_slot, product=products[2], batch=batches[products[2].name], quantity="3", unit_price="25000", created_at=now - timedelta(days=3))

        ensure_request(db, student, "Sữa hạt không đường", "Danh mục: Đồ uống; số lượng: 4 hộp.", "OPEN")
        ensure_request(db, worker, "Mật ong hoa cà phê", "Đã báo giá demo.", "QUOTED", "Có thể cung cấp trong tuần này.", "125000")
        ensure_notification(db, student, "Đơn hàng đang chờ xác nhận", "Đơn FF-DEMO-PENDING-01 đã được tạo.", "order.status_changed")
        ensure_notification(db, worker, "Đơn hàng đang chuẩn bị", "Đơn FF-DEMO-PREPARING-01 đang được chuẩn bị.", "order.status_changed")
        ensure_moderation_term(db, "spam-demo")

        ensure_audit(db, admin, "demo.seeded", "workspace", "local", "Bộ dữ liệu demo FreshFlow")

        db.commit()
        print("Demo data ready (safe to run repeatedly).")
        print(f"Admin: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
        print(f"Student: {STUDENT_EMAIL} / {STUDENT_PASSWORD}")
        print(f"Worker: {WORKER_EMAIL} / {WORKER_PASSWORD}")
        print(f"Products: {len(products)}; open inventory batches: {len(batches)}; sample orders: 3")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
