from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="CUSTOMER", index=True)  # ADMIN, SHOP, CUSTOMER, SHIPPER
    customer_group: Mapped[str] = mapped_column(String(30), default="STUDENT")    # STUDENT, WORKING, GROUP_A, GROUP_B, COLLECTIVE
    phone: Mapped[str | None] = mapped_column(String(30), unique=True, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_phone_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    shop_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    shop_description: Mapped[str] = mapped_column(Text, default="")
    shop_address: Mapped[str] = mapped_column(String(255), default="")
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    vehicle_info: Mapped[str] = mapped_column(String(100), default="")  # Dành cho Shipper
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    addresses: Mapped[list["Address"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class CustomerGroup(Base):
    __tablename__ = "customer_groups"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text, default="")
    discount_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0.00"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Address(Base):
    __tablename__ = "addresses"
    __table_args__ = (Index("ix_address_user_default", "user_id", "is_default"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    label: Mapped[str] = mapped_column(String(50), default="Nhà")
    recipient: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(30))
    line1: Mapped[str] = mapped_column(String(255))
    ward: Mapped[str] = mapped_column(String(100), default="")
    district: Mapped[str] = mapped_column(String(100), default="")
    city: Mapped[str] = mapped_column(String(100))
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    user: Mapped[User] = relationship(back_populates="addresses")


class Category(Base):
    __tablename__ = "categories"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    description: Mapped[str] = mapped_column(Text, default="")
    icon: Mapped[str] = mapped_column(String(100), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(180), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    unit: Mapped[str] = mapped_column(String(30), default="phần")
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    images: Mapped[str] = mapped_column(Text, default="")  # JSON array hoặc link ảnh ngăn cách dấu phẩy
    attached_services: Mapped[str] = mapped_column(Text, default="")  # Dịch vụ kèm theo
    base_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    # Chương trình Sale: giá khuyến mãi áp dụng trong khoảng thời gian (None = không giới hạn)
    sale_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    sale_start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sale_end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class InventoryBatch(Base):
    __tablename__ = "inventory_batches"
    __table_args__ = (Index("ix_batch_product_open", "product_id", "is_open"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    batch_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    initial_quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    approved_quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), default=Decimal("0"))
    is_open: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    @property
    def available_quantity(self) -> Decimal:
        return max(Decimal("0"), self.initial_quantity - self.approved_quantity)


class PriceRule(Base):
    __tablename__ = "price_rules"
    __table_args__ = (UniqueConstraint("product_id", "customer_group", name="uq_price_product_group"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    customer_group: Mapped[str] = mapped_column(String(30))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))


class DeliverySlot(Base):
    __tablename__ = "delivery_slots"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    customer_group: Mapped[str] = mapped_column(String(30), default="ALL")
    fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class VatConfig(Base):
    __tablename__ = "vat_configs"
    id: Mapped[int] = mapped_column(primary_key=True)
    tax_name: Mapped[str] = mapped_column(String(100), default="VAT")
    rate: Mapped[Decimal] = mapped_column(Numeric(5, 4), default=Decimal("0.0800"))  # 8%
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class VatHistory(Base):
    __tablename__ = "vat_history"
    id: Mapped[int] = mapped_column(primary_key=True)
    vat_config_id: Mapped[int] = mapped_column(ForeignKey("vat_configs.id"))
    old_rate: Mapped[Decimal] = mapped_column(Numeric(5, 4))
    new_rate: Mapped[Decimal] = mapped_column(Numeric(5, 4))
    changed_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Post(Base):
    __tablename__ = "posts"
    id: Mapped[int] = mapped_column(primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text, default="")
    post_type: Mapped[str] = mapped_column(String(50), default="PRODUCT_INTRO")  # PRODUCT_INTRO, DAILY_SPECIAL, PROMOTION
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    product_ids: Mapped[str] = mapped_column(String(512), default="")
    image_urls: Mapped[str] = mapped_column(Text, default="")
    quantity_limit: Mapped[Decimal | None] = mapped_column(Numeric(12, 3), nullable=True)
    target_audience: Mapped[str] = mapped_column(String(50), default="ALL")  # ALL, INDIVIDUAL, GROUP, COLLECTIVE
    target_customer_group: Mapped[str | None] = mapped_column(String(50), nullable=True)
    sale_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    group_prices: Mapped[str] = mapped_column(Text, default="")  # (cũ) JSON giá tuyệt đối { "STUDENT": 27000 }
    # JSON chiết khấu % theo nhóm { "STUDENT": 10, "WORKING": 0 }; giá từng mặt hàng tự tính từ giá chuẩn
    group_discounts: Mapped[str] = mapped_column(Text, default="")
    # Bài dành cho nhiều nhóm: JSON ["STUDENT", "GROUP_A"]; trống = theo target_customer_group (bài cũ)
    target_groups: Mapped[str] = mapped_column(Text, default="")
    order_start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    order_end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivery_time_text: Mapped[str] = mapped_column(String(100), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class PostItem(Base):
    """Một mặt hàng trong chương trình bán của bài đăng (giá & hạn mức thuộc về bài, không ghi vào mặt hàng)."""
    __tablename__ = "post_items"
    __table_args__ = (UniqueConstraint("post_id", "product_id", name="uq_post_item_product"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    position: Mapped[int] = mapped_column(Integer, default=0)
    # Số lượng mở bán qua bài (null = không giới hạn, chỉ theo tồn kho) và số đã bán qua bài
    quantity_limit: Mapped[Decimal | None] = mapped_column(Numeric(12, 3), nullable=True)
    sold_quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), default=Decimal("0"))
    # Giá Sale riêng của bài (null = không Sale trong bài)
    sale_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    # Giá riêng theo từng nhóm khách hàng trong bài: JSON {"STUDENT": 25000}; nhóm không có = theo % của nhóm
    group_prices: Mapped[str] = mapped_column(Text, default="")
    # Giá gốc riêng trong bài (giá gạch ngang + mốc tính %); null = giá chuẩn của mặt hàng
    list_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)


class PostLike(Base):
    __tablename__ = "post_likes"
    __table_args__ = (UniqueConstraint("post_id", "user_id", name="uq_post_like_user"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PostComment(Base):
    __tablename__ = "post_comments"
    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    content: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_number: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    shop_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    shipper_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(30), default="PENDING", index=True)
    # 8 status: PENDING, CONFIRMED, PREPARING, READY_FOR_PICKUP, PICKED_UP, DELIVERING, COMPLETED, CANCELLED
    delivery_type: Mapped[str] = mapped_column(String(30), default="PICKUP")  # PICKUP / CENTRAL hoặc HOME
    delivery_address: Mapped[str] = mapped_column(Text, default="")
    recipient_name: Mapped[str] = mapped_column(String(120), default="")
    recipient_phone: Mapped[str] = mapped_column(String(30), default="")
    expected_delivery_time: Mapped[str] = mapped_column(String(100), default="")
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 4), default=Decimal("0.0800"))
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    delivery_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    debt_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    payment_status: Mapped[str] = mapped_column(String(30), default="UNPAID")  # UNPAID, PREPAID, PARTIAL, PAID, DEBT
    payment_method: Mapped[str] = mapped_column(String(30), default="COD")     # COD, BANK_TRANSFER, WALLET
    cash_collected_by_shipper: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    # Trạng thái tồn kho của đơn: NONE (chưa giữ), RESERVED (đã giữ chỗ), SHIPPED (đã xuất kho), RELEASED (đã hoàn trả)
    inventory_state: Mapped[str] = mapped_column(String(20), default="NONE")
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    batch_id: Mapped[int] = mapped_column(ForeignKey("inventory_batches.id"))
    product_name_snapshot: Mapped[str] = mapped_column(String(180))
    unit_snapshot: Mapped[str] = mapped_column(String(30))
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    # Bài đăng mà khách đã mua qua (giá theo chương trình của bài); null = mua từ cửa hàng
    post_id: Mapped[int | None] = mapped_column(ForeignKey("posts.id"), nullable=True, index=True)
    order: Mapped[Order] = relationship(back_populates="items")


class OrderStatusHistory(Base):
    __tablename__ = "order_status_history"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    changed_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    old_status: Mapped[str] = mapped_column(String(30))
    new_status: Mapped[str] = mapped_column(String(30))
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ProductReview(Base):
    __tablename__ = "product_reviews"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id"), nullable=True)
    rating: Mapped[int] = mapped_column(Integer)  # 1 to 5
    comment: Mapped[str] = mapped_column(Text, default="")
    images: Mapped[str] = mapped_column(Text, default="")
    shop_reply: Mapped[str] = mapped_column(Text, default="")
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ShipperReview(Base):
    __tablename__ = "shipper_reviews"
    id: Mapped[int] = mapped_column(primary_key=True)
    shipper_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    rating: Mapped[int] = mapped_column(Integer)  # 1 to 5
    attitude_rating: Mapped[int] = mapped_column(Integer, default=5)
    speed_rating: Mapped[int] = mapped_column(Integer, default=5)
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    receiver_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id"), nullable=True, index=True)
    content: Mapped[str] = mapped_column(Text, default="")
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ProductRequest(Base):
    __tablename__ = "product_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    product_name: Mapped[str] = mapped_column(String(180))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(30), default="OPEN", index=True)
    admin_response: Mapped[str] = mapped_column(Text, default="")
    quoted_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    handled_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text, default="")
    event_type: Mapped[str] = mapped_column(String(60), default="general")
    link: Mapped[str] = mapped_column(String(255), default="")
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ModerationTerm(Base):
    __tablename__ = "moderation_terms"
    id: Mapped[int] = mapped_column(primary_key=True)
    term: Mapped[str] = mapped_column(String(100), unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class ModerationViolation(Base):
    __tablename__ = "moderation_violations"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    matched_term: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(100), index=True)
    entity_type: Mapped[str] = mapped_column(String(60))
    entity_id: Mapped[str] = mapped_column(String(60))
    details: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
