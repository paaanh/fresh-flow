from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RegisterIn(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=10, max_length=128)
    phone: str | None = Field(default=None, max_length=30)
    customer_group: str = "STUDENT"


class LoginIn(BaseModel):
    username: str
    password: str


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


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class CategoryOut(ORMModel):
    id: int
    name: str
    is_active: bool


class ProductIn(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    description: str = ""
    category_id: int | None = None
    unit: str = Field(default="phần", max_length=30)
    image_url: str | None = None
    base_price: Decimal = Field(ge=0, decimal_places=2)


class ProductUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=180)
    description: str | None = None
    category_id: int | None = None
    unit: str | None = Field(default=None, max_length=30)
    image_url: str | None = None
    base_price: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    is_active: bool | None = None


class ProductOut(BaseModel):
    id: int
    name: str
    description: str
    category_id: int | None
    unit: str
    image_url: str | None
    base_price: Decimal
    is_active: bool
    available_quantity: Decimal = Decimal("0")


class BatchIn(BaseModel):
    batch_date: datetime
    initial_quantity: Decimal = Field(gt=0, decimal_places=3)
    is_open: bool = True


class BatchOut(ORMModel):
    id: int
    product_id: int
    batch_date: datetime
    initial_quantity: Decimal
    approved_quantity: Decimal
    is_open: bool


class PriceRuleIn(BaseModel):
    customer_group: str = Field(pattern="^(STUDENT|WORKING)$")
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
    delivery_type: str = "PICKUP"
    delivery_address: str = ""
    delivery_slot_id: int | None = None
    note: str = Field(default="", max_length=1000)


class OrderStatusIn(BaseModel):
    status: str = Field(pattern="^(APPROVED|REJECTED|PREPARING|DELIVERING|COMPLETED|CANCELLED)$")
    note: str = Field(default="", max_length=1000)


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
    status: str
    delivery_type: str
    delivery_address: str
    subtotal: Decimal
    delivery_fee: Decimal
    total: Decimal
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
    is_read: bool
    created_at: datetime


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class ConversationIn(BaseModel):
    participant_id: int | None = None
