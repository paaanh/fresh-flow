from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RegisterIn(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=6, max_length=128)
    phone: str | None = Field(default=None, max_length=30)
    customer_group: str = "STUDENT"
    role: str = "CUSTOMER"  # CUSTOMER, SHOP, SHIPPER
    otp_code: str | None = None


class RequestOtpIn(BaseModel):
    target: str = Field(min_length=3, max_length=254)  # email or phone
    purpose: str = "register"  # register, verify_email, verify_phone, forgot_password


class VerifyOtpIn(BaseModel):
    target: str = Field(min_length=3, max_length=254)
    code: str = Field(min_length=4, max_length=8)
    purpose: str = "register"


class ResetPasswordIn(BaseModel):
    target: str = Field(min_length=3, max_length=254)
    code: str = Field(min_length=4, max_length=8)
    new_password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    username: str
    password: str


class ProfileUpdateIn(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    shop_name: str | None = Field(default=None, max_length=150)
    shop_description: str | None = Field(default=None, max_length=5000)
    shop_address: str | None = Field(default=None, max_length=255)
    vehicle_info: str | None = Field(default=None, max_length=100)


class AdminUserUpdateIn(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    role: str | None = Field(default=None, pattern="^(ADMIN|SHOP|CUSTOMER|SHIPPER)$")
    customer_group: str | None = Field(default=None, max_length=30)
    is_active: bool | None = None
    shop_name: str | None = Field(default=None, max_length=150)
    shop_description: str | None = Field(default=None, max_length=5000)
    shop_address: str | None = Field(default=None, max_length=255)
    vehicle_info: str | None = Field(default=None, max_length=100)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(ORMModel):
    id: int
    email: EmailStr
    full_name: str
    phone: str | None = None
    role: str
    customer_group: str
    is_active: bool
    is_email_verified: bool = False
    is_phone_verified: bool = False
    shop_name: str | None = None
    shop_description: str | None = ""
    shop_address: str | None = ""
    avatar_url: str | None = None
    vehicle_info: str | None = ""

    @field_validator("shop_description", "shop_address", "vehicle_info", mode="before")
    @classmethod
    def normalize_user_str(cls, v):
        return "" if v is None else v


class CustomerGroupIn(BaseModel):
    code: str = Field(min_length=2, max_length=50)
    name: str = Field(min_length=2, max_length=100)
    description: str = ""
    discount_percent: Decimal = Field(default=Decimal("0.00"), ge=0, le=100)
    is_active: bool = True


class CustomerGroupOut(ORMModel):
    id: int
    code: str
    name: str
    description: str = ""
    discount_percent: Decimal
    is_active: bool

    @field_validator("description", mode="before")
    @classmethod
    def normalize_description(cls, v):
        return "" if v is None else v


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    parent_id: int | None = None
    description: str = ""
    icon: str = ""


class CategoryOut(ORMModel):
    id: int
    name: str
    parent_id: int | None = None
    description: str = ""
    icon: str = ""
    is_active: bool

    @field_validator("description", "icon", mode="before")
    @classmethod
    def normalize_str(cls, v):
        return "" if v is None else v


class ProductIn(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    description: str = ""
    category_id: int | None = None
    unit: str = Field(default="phần", max_length=30)
    image_url: str | None = None
    images: str = ""
    attached_services: str = ""
    base_price: Decimal = Field(ge=0, decimal_places=2)
    shop_id: int | None = None


class ProductUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=180)
    description: str | None = None
    category_id: int | None = None
    unit: str | None = Field(default=None, max_length=30)
    image_url: str | None = None
    images: str | None = None
    attached_services: str | None = None
    base_price: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    is_active: bool | None = None


class CatalogBatchOut(BaseModel):
    id: int
    batch_date: datetime
    is_open: bool
    available_quantity: Decimal


class ProductOut(BaseModel):
    id: int
    name: str
    description: str = ""
    category_id: int | None
    unit: str
    image_url: str | None
    images: str = ""
    attached_services: str = ""
    base_price: Decimal
    customer_price: Decimal | None = None
    is_active: bool
    shop_id: int | None = None
    shop_name: str | None = None
    available_quantity: Decimal = Decimal("0")
    batches: list[CatalogBatchOut] = Field(default_factory=list)

    @field_validator("description", "images", "attached_services", mode="before")
    @classmethod
    def normalize_product_str(cls, v):
        return "" if v is None else v


class BatchIn(BaseModel):
    batch_date: datetime
    initial_quantity: Decimal = Field(gt=0, decimal_places=3)
    is_open: bool = True


class InventoryAdjustmentIn(BaseModel):
    quantity: Decimal = Field(gt=0, decimal_places=3)


class BatchOut(ORMModel):
    id: int
    product_id: int
    batch_date: datetime
    initial_quantity: Decimal
    approved_quantity: Decimal
    is_open: bool


class PriceRuleIn(BaseModel):
    customer_group: str
    unit_price: Decimal = Field(ge=0, decimal_places=2)


class DeliverySlotIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    customer_group: str = "ALL"
    fee: Decimal = Field(ge=0, decimal_places=2)
    is_active: bool = True


class OrderLineIn(BaseModel):
    batch_id: int
    quantity: Decimal = Field(gt=0, decimal_places=3)


class OrderCreateIn(BaseModel):
    items: list[OrderLineIn] = Field(min_length=1, max_length=50)
    delivery_type: str = "PICKUP"  # PICKUP hoặc HOME
    delivery_address: str = ""
    recipient_name: str = ""
    recipient_phone: str = ""
    expected_delivery_time: str = ""
    delivery_slot_id: int | None = None
    payment_method: str = "COD"  # COD, BANK_TRANSFER, WALLET
    note: str = Field(default="", max_length=1000)


class OrderStatusIn(BaseModel):
    status: str = Field(pattern="^(PENDING|CONFIRMED|APPROVED|PREPARING|READY_FOR_PICKUP|PICKED_UP|DELIVERING|COMPLETED|CANCELLED|REJECTED)$")
    note: str = Field(default="", max_length=1000)


class ShipperAssignIn(BaseModel):
    shipper_id: int


class OrderPaymentIn(BaseModel):
    paid_amount: Decimal = Field(ge=0, decimal_places=2)
    payment_status: str = Field(pattern="^(UNPAID|PREPAID|PARTIAL|PAID|DEBT)$")
    cash_collected: Decimal = Field(default=Decimal("0"), ge=0, decimal_places=2)
    note: str = ""


class OrderItemOut(ORMModel):
    id: int
    product_id: int
    batch_id: int
    product_name_snapshot: str
    unit_snapshot: str
    quantity: Decimal
    unit_price: Decimal
    line_total: Decimal


class OrderOut(BaseModel):
    id: int
    order_number: str
    user_id: int
    customer_name: str | None = None
    shop_id: int | None = None
    shop_name: str | None = None
    shipper_id: int | None = None
    shipper_name: str | None = None
    shipper_phone: str | None = None
    shipper_vehicle: str | None = None
    status: str
    delivery_type: str
    delivery_address: str
    recipient_name: str = ""
    recipient_phone: str = ""
    expected_delivery_time: str = ""
    subtotal: Decimal
    vat_rate: Decimal = Decimal("0.0800")
    vat_amount: Decimal = Decimal("0")
    delivery_fee: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    total: Decimal
    paid_amount: Decimal = Decimal("0")
    debt_amount: Decimal = Decimal("0")
    payment_status: str = "UNPAID"
    payment_method: str = "COD"
    cash_collected_by_shipper: Decimal = Decimal("0")
    note: str
    created_at: datetime
    items: list[OrderItemOut]


class AddressIn(BaseModel):
    label: str = "Nhà"
    recipient: str
    phone: str
    line1: str
    ward: str = ""
    district: str = ""
    city: str
    is_default: bool = False


class ProductRequestIn(BaseModel):
    product_name: str = Field(min_length=2, max_length=180)
    description: str = Field(default="", max_length=2000)


class ProductRequestResponseIn(BaseModel):
    status: str = Field(pattern="^(QUOTED|ACCEPTED|REJECTED|FULFILLED)$")
    admin_response: str = Field(default="", max_length=2000)
    quoted_price: Decimal | None = Field(default=None, ge=0, decimal_places=2)


class NotificationOut(ORMModel):
    id: int
    title: str
    body: str
    event_type: str
    link: str = ""
    is_read: bool
    created_at: datetime

    @field_validator("link", mode="before")
    @classmethod
    def normalize_notif_link(cls, v):
        return "" if v is None else v


class BroadcastNotificationIn(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    body: str = Field(min_length=2, max_length=2000)
    target_role: str | None = Field(default=None)
    link: str = ""


class VatConfigIn(BaseModel):
    tax_name: str = "VAT"
    rate: Decimal = Field(ge=0, le=1)  # 0.08 = 8%
    category_id: int | None = None
    note: str = ""


class VatConfigOut(ORMModel):
    id: int
    tax_name: str
    rate: Decimal
    category_id: int | None
    is_active: bool
    updated_at: datetime


class PostIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    content: str = ""
    post_type: str = "PRODUCT_INTRO"  # PRODUCT_INTRO, DAILY_SPECIAL, PROMOTION
    product_id: int | None = None
    product_ids: list[int] = Field(default_factory=list)
    new_products: list[dict] = Field(default_factory=list)
    image_urls: str = ""
    quantity_limit: Decimal | None = None
    target_audience: str = "ALL"  # ALL, INDIVIDUAL, GROUP, COLLECTIVE
    target_customer_group: str | None = None
    sale_price: Decimal | None = None
    group_prices: str = ""
    order_start_at: datetime | None = None
    order_end_at: datetime | None = None
    delivery_time_text: str = ""


class PostOut(BaseModel):
    id: int
    author_id: int
    author_name: str | None = None
    shop_name: str | None = None
    title: str
    content: str = ""
    post_type: str
    product_id: int | None = None
    product_ids: list[int] = Field(default_factory=list)
    products_info: list[dict] = Field(default_factory=list)
    product_name: str | None = None
    image_urls: str = ""
    quantity_limit: Decimal | None = None
    target_audience: str
    target_customer_group: str | None = None
    original_price: Decimal | None = None
    sale_price: Decimal | None = None
    effective_price: Decimal | None = None
    group_prices: str = ""
    order_start_at: datetime | None = None
    order_end_at: datetime | None = None
    delivery_time_text: str = ""
    is_active: bool
    created_at: datetime

    @field_validator("content", "image_urls", "group_prices", "delivery_time_text", mode="before")
    @classmethod
    def normalize_post_str(cls, v):
        return "" if v is None else v


class ProductReviewIn(BaseModel):
    product_id: int | None = None
    order_id: int | None = None
    rating: int = Field(ge=1, le=5)
    comment: str = ""
    images: str = ""


class ProductReviewOut(ORMModel):
    id: int
    product_id: int
    user_id: int
    user_name: str | None = None
    order_id: int | None
    rating: int
    comment: str = ""
    images: str = ""
    shop_reply: str = ""
    is_hidden: bool
    created_at: datetime

    @field_validator("comment", "images", "shop_reply", mode="before")
    @classmethod
    def normalize_review_str(cls, v):
        return "" if v is None else v


class ReviewReplyIn(BaseModel):
    reply: str = Field(min_length=1, max_length=2000)


class ShipperReviewIn(BaseModel):
    order_id: int | None = None
    rating: int = Field(ge=1, le=5)
    attitude_rating: int = Field(default=5, ge=1, le=5)
    speed_rating: int = Field(default=5, ge=1, le=5)
    comment: str = ""


class ShipperReviewOut(ORMModel):
    id: int
    shipper_id: int
    user_id: int
    order_id: int
    rating: int
    attitude_rating: int
    speed_rating: int
    comment: str = ""
    created_at: datetime

    @field_validator("comment", mode="before")
    @classmethod
    def normalize_shipper_comment(cls, v):
        return "" if v is None else v


class ChatMessageIn(BaseModel):
    receiver_id: int | None = None
    order_id: int | None = None
    content: str = Field(min_length=1, max_length=4000)
    image_url: str | None = None


class ChatMessageOut(ORMModel):
    id: int
    sender_id: int
    sender_name: str | None = None
    sender_role: str | None = None
    receiver_id: int | None
    order_id: int | None
    content: str = ""
    image_url: str | None
    is_read: bool
    created_at: datetime

    @field_validator("content", mode="before")
    @classmethod
    def normalize_chat_content(cls, v):
        return "" if v is None else v


class FinancialSummaryOut(BaseModel):
    total_users: int = 0
    total_shops: int = 0
    total_products: int = 0
    total_orders: int = 0
    delivery_success_rate: float = 0.0
    total_revenue: Decimal = Decimal("0")
    total_subtotal: Decimal = Decimal("0")
    total_vat: Decimal = Decimal("0")
    total_delivery_fee: Decimal = Decimal("0")
    total_paid: Decimal = Decimal("0")
    total_debt: Decimal = Decimal("0")
    total_collected_by_shipper: Decimal = Decimal("0")
    status_distribution: dict[str, int] = Field(default_factory=dict)
    orders_by_date: list[dict] = Field(default_factory=list)
    shop_breakdown: list[dict] = Field(default_factory=list)
    group_breakdown: list[dict] = Field(default_factory=list)
