import logging
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from sqlalchemy import inspect, text, select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.db.session import engine, SessionLocal
from app.core.security import hash_password, verify_password
import app.models as models

logger = logging.getLogger("freshflow.db_init")


def init_database():
    """Ensure all tables exist and missing columns are migrated safely."""
    # 1. Create any missing tables
    Base.metadata.create_all(bind=engine)

    # 2. Check and alter missing columns for SQLite/MySQL
    with engine.connect() as conn:
        inspector = inspect(conn)

        # Users columns
        user_cols = {col["name"] for col in inspector.get_columns("users")}
        if "shop_name" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN shop_name VARCHAR(150)"))
        if "shop_description" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN shop_description TEXT"))
        if "shop_address" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN shop_address VARCHAR(255) DEFAULT ''"))
        if "avatar_url" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500)"))
        if "vehicle_info" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN vehicle_info VARCHAR(100) DEFAULT ''"))

        # Categories columns
        cat_cols = {col["name"] for col in inspector.get_columns("categories")}
        if "parent_id" not in cat_cols:
            conn.execute(text("ALTER TABLE categories ADD COLUMN parent_id INTEGER"))
        if "description" not in cat_cols:
            conn.execute(text("ALTER TABLE categories ADD COLUMN description TEXT"))
        if "icon" not in cat_cols:
            conn.execute(text("ALTER TABLE categories ADD COLUMN icon VARCHAR(100) DEFAULT ''"))

        # Products columns
        prod_cols = {col["name"] for col in inspector.get_columns("products")}
        if "shop_id" not in prod_cols:
            conn.execute(text("ALTER TABLE products ADD COLUMN shop_id INTEGER"))
        if "images" not in prod_cols:
            conn.execute(text("ALTER TABLE products ADD COLUMN images TEXT"))
        if "attached_services" not in prod_cols:
            conn.execute(text("ALTER TABLE products ADD COLUMN attached_services TEXT"))

        # Orders columns
        order_cols = {col["name"] for col in inspector.get_columns("orders")}
        if "shop_id" not in order_cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN shop_id INTEGER"))
        if "shipper_id" not in order_cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN shipper_id INTEGER"))
        if "recipient_name" not in order_cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN recipient_name VARCHAR(120) DEFAULT ''"))
        if "recipient_phone" not in order_cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN recipient_phone VARCHAR(30) DEFAULT ''"))
        if "expected_delivery_time" not in order_cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN expected_delivery_time VARCHAR(100) DEFAULT ''"))
        if "vat_rate" not in order_cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN vat_rate NUMERIC(5, 4) DEFAULT 0.08"))
        if "vat_amount" not in order_cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN vat_amount NUMERIC(12, 2) DEFAULT 0"))
        if "discount_amount" not in order_cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN discount_amount NUMERIC(12, 2) DEFAULT 0"))
        if "paid_amount" not in order_cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN paid_amount NUMERIC(12, 2) DEFAULT 0"))
        if "debt_amount" not in order_cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN debt_amount NUMERIC(12, 2) DEFAULT 0"))
        if "payment_status" not in order_cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN payment_status VARCHAR(30) DEFAULT 'UNPAID'"))
        if "payment_method" not in order_cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN payment_method VARCHAR(30) DEFAULT 'COD'"))
        if "cash_collected_by_shipper" not in order_cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN cash_collected_by_shipper NUMERIC(12, 2) DEFAULT 0"))

        conn.commit()

    # 3. Seed foundational data if empty or missing
    with SessionLocal() as db:
        seed_core_configuration(db)


def seed_core_configuration(db: Session):
    # Customer groups
    groups = [
        ("STUDENT", "Sinh viên", "Ưu đãi đặc biệt dành cho sinh viên các trường", Decimal("10.00")),
        ("WORKING", "Người đi làm", "Nhóm khách hàng cá nhân đi làm văn phòng", Decimal("5.00")),
        ("GROUP_A", "Nhóm cư dân Khu đô thị A", "Nhóm mua chung giảm giá sỉ", Decimal("12.00")),
        ("GROUP_B", "Nhóm trường học / Cơ quan B", "Hợp đồng cung cấp định kỳ", Decimal("15.00")),
        ("COLLECTIVE", "Khách hàng tập thể", "Giá thỏa thuận theo số lượng lớn", Decimal("18.00")),
    ]
    for code, name, desc, disc in groups:
        grp = db.scalar(select(models.CustomerGroup).where(models.CustomerGroup.code == code))
        if not grp:
            db.add(models.CustomerGroup(code=code, name=name, description=desc, discount_percent=disc))

    # VAT config
    vat = db.scalar(select(models.VatConfig).where(models.VatConfig.tax_name == "VAT"))
    if not vat:
        db.add(models.VatConfig(tax_name="VAT", rate=Decimal("0.0800"), is_active=True))

    db.commit()
