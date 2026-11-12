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
            conn.execute(text("ALTER TABLE users ADD COLUMN shop_description TEXT DEFAULT ''"))
        if "shop_address" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN shop_address VARCHAR(255) DEFAULT ''"))
        if "avatar_url" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500)"))
        if "vehicle_info" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN vehicle_info VARCHAR(100) DEFAULT ''"))
        if "is_email_verified" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN is_email_verified BOOLEAN DEFAULT 0"))
        if "is_phone_verified" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN is_phone_verified BOOLEAN DEFAULT 0"))
        conn.execute(text("UPDATE users SET is_email_verified = 1, is_phone_verified = 1 WHERE is_email_verified = 0 OR is_phone_verified = 0"))

        # Categories columns
        cat_cols = {col["name"] for col in inspector.get_columns("categories")}
        if "parent_id" not in cat_cols:
            conn.execute(text("ALTER TABLE categories ADD COLUMN parent_id INTEGER"))
        if "description" not in cat_cols:
            conn.execute(text("ALTER TABLE categories ADD COLUMN description TEXT DEFAULT ''"))
        if "icon" not in cat_cols:
            conn.execute(text("ALTER TABLE categories ADD COLUMN icon VARCHAR(100) DEFAULT ''"))

        # Products columns
        prod_cols = {col["name"] for col in inspector.get_columns("products")}
        if "shop_id" not in prod_cols:
            conn.execute(text("ALTER TABLE products ADD COLUMN shop_id INTEGER"))
        if "images" not in prod_cols:
            conn.execute(text("ALTER TABLE products ADD COLUMN images TEXT DEFAULT ''"))
        if "attached_services" not in prod_cols:
            conn.execute(text("ALTER TABLE products ADD COLUMN attached_services TEXT DEFAULT ''"))
        if "sale_price" not in prod_cols:
            conn.execute(text("ALTER TABLE products ADD COLUMN sale_price NUMERIC(12, 2)"))
        if "sale_start_at" not in prod_cols:
            conn.execute(text("ALTER TABLE products ADD COLUMN sale_start_at DATETIME"))
        if "sale_end_at" not in prod_cols:
            conn.execute(text("ALTER TABLE products ADD COLUMN sale_end_at DATETIME"))

        # Product requests columns
        req_cols = {col["name"] for col in inspector.get_columns("product_requests")}
        if "product_id" not in req_cols:
            conn.execute(text("ALTER TABLE product_requests ADD COLUMN product_id INTEGER"))
        if "handled_by" not in req_cols:
            conn.execute(text("ALTER TABLE product_requests ADD COLUMN handled_by INTEGER"))
        if "updated_at" not in req_cols:
            conn.execute(text("ALTER TABLE product_requests ADD COLUMN updated_at DATETIME"))

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
        if "inventory_state" not in order_cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN inventory_state VARCHAR(20) DEFAULT 'NONE'"))
            backfill_order_inventory_state(conn)

        # Posts columns
        post_cols = {col["name"] for col in inspector.get_columns("posts")}
        if "product_ids" not in post_cols:
            conn.execute(text("ALTER TABLE posts ADD COLUMN product_ids VARCHAR(512) DEFAULT ''"))
        if "group_discounts" not in post_cols:
            # No DEFAULT on TEXT: MySQL rejects it (error 1101)
            conn.execute(text("ALTER TABLE posts ADD COLUMN group_discounts TEXT"))
            conn.execute(text("UPDATE posts SET group_discounts = '' WHERE group_discounts IS NULL"))
        if "target_groups" not in post_cols:
            conn.execute(text("ALTER TABLE posts ADD COLUMN target_groups TEXT"))
            conn.execute(text("UPDATE posts SET target_groups = '' WHERE target_groups IS NULL"))
        post_item_cols = {col["name"] for col in inspector.get_columns("post_items")}
        if "group_prices" not in post_item_cols:
            conn.execute(text("ALTER TABLE post_items ADD COLUMN group_prices TEXT"))
            conn.execute(text("UPDATE post_items SET group_prices = '' WHERE group_prices IS NULL"))
        if "list_price" not in post_item_cols:
            conn.execute(text("ALTER TABLE post_items ADD COLUMN list_price NUMERIC(12, 2)"))

        # Notifications columns
        notif_cols = {col["name"] for col in inspector.get_columns("notifications")}
        if "link" not in notif_cols:
            conn.execute(text("ALTER TABLE notifications ADD COLUMN link VARCHAR(255) DEFAULT ''"))

        # Order lines bought through a Newfeed post (giá theo bài)
        item_cols = {col["name"] for col in inspector.get_columns("order_items")}
        if "post_id" not in item_cols:
            conn.execute(text("ALTER TABLE order_items ADD COLUMN post_id INTEGER"))
        backfill_post_items(conn)

        if not inspector.has_table("alembic_version"):
            conn.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL, CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))"))
            conn.execute(text("INSERT INTO alembic_version (version_num) VALUES ('0009_post_item_list_price')"))

        conn.commit()

    # 3. Seed foundational data if empty or missing
    with SessionLocal() as db:
        seed_core_configuration(db)


def backfill_post_items(conn) -> None:
    """Posts created before per-post programs only had a product_ids JSON list: give each of
    them post_items rows (no quantity limit, no post Sale) so they can be bought through."""
    import json as _json

    have_items = {row[0] for row in conn.execute(text("SELECT DISTINCT post_id FROM post_items")).all()}
    products = {row[0] for row in conn.execute(text("SELECT id FROM products")).all()}
    post_cols = {c["name"] for c in inspect(conn).get_columns("posts")}
    # product_ids / quantity_limit may be missing on databases built only from migrations
    ids_col = "product_ids" if "product_ids" in post_cols else "NULL"
    limit_col = "quantity_limit" if "quantity_limit" in post_cols else "NULL"
    posts = conn.execute(text(f"SELECT id, product_id, {ids_col}, {limit_col} FROM posts")).all()
    for post_id, primary, raw_ids, limit in posts:
        if post_id in have_items:
            continue
        ids: list[int] = []
        if primary:
            ids.append(int(primary))
        try:
            for x in _json.loads(raw_ids or "[]"):
                if int(x) not in ids:
                    ids.append(int(x))
        except Exception:
            pass
        ids = [pid for pid in ids if pid in products]
        for position, pid in enumerate(ids):
            conn.execute(
                text("INSERT INTO post_items (post_id, product_id, position, quantity_limit, sold_quantity, sale_price) "
                     "VALUES (:post, :product, :pos, :limit, 0, NULL)"),
                {"post": post_id, "product": pid, "pos": position, "limit": limit if len(ids) == 1 else None},
            )
    logger.info("Backfilled post_items for %s legacy posts", len([p for p in posts if p[0] not in have_items]))


def backfill_order_inventory_state(conn) -> None:
    """One-time migration of legacy orders to the reserved/shipped inventory model.

    Before inventory_state existed, every confirmed order stayed counted in
    inventory_batches.approved_quantity forever. Orders still waiting in the warehouse
    become RESERVED; orders that already left the warehouse become SHIPPED and their
    quantity is removed from both the reserved and the physical stock counters.
    """
    conn.execute(text(
        "UPDATE orders SET inventory_state = 'RESERVED' WHERE status IN ('CONFIRMED','PREPARING','READY_FOR_PICKUP')"
    ))
    rows = conn.execute(text(
        "SELECT oi.batch_id, SUM(oi.quantity) FROM order_items oi JOIN orders o ON o.id = oi.order_id "
        "WHERE o.status IN ('PICKED_UP','DELIVERING','COMPLETED') GROUP BY oi.batch_id"
    )).all()
    for batch_id, qty in rows:
        conn.execute(
            text(
                "UPDATE inventory_batches SET "
                "initial_quantity = CASE WHEN initial_quantity >= :q THEN initial_quantity - :q ELSE 0 END, "
                "approved_quantity = CASE WHEN approved_quantity >= :q THEN approved_quantity - :q ELSE 0 END "
                "WHERE id = :id"
            ),
            {"q": qty, "id": batch_id},
        )
    conn.execute(text(
        "UPDATE orders SET inventory_state = 'SHIPPED' WHERE status IN ('PICKED_UP','DELIVERING','COMPLETED')"
    ))
    logger.info("Backfilled orders.inventory_state for %s shipped batches", len(rows))


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

    # Delivery slots
    default_slots = [
        ("Điểm giao tập trung KTX Khu A · 11:30 - 12:30", "ALL", Decimal("0.00")),
        ("Điểm giao tập trung KTX Khu B · 17:00 - 18:30", "ALL", Decimal("0.00")),
        ("Giao tận nơi buổi sáng · 07:30 - 09:30", "ALL", Decimal("15000.00")),
        ("Giao tận nơi buổi trưa · 11:30 - 13:00", "ALL", Decimal("15000.00")),
        ("Giao tận nơi buổi chiều · 16:30 - 18:30", "ALL", Decimal("15000.00")),
        ("Giao tận nơi buổi tối · 19:00 - 20:30", "ALL", Decimal("20000.00")),
        ("Giao định kỳ Văn phòng / Công sở · 08:30 - 09:30", "WORKING", Decimal("0.00")),
    ]
    for s_name, s_group, s_fee in default_slots:
        slot = db.scalar(select(models.DeliverySlot).where(models.DeliverySlot.name == s_name))
        if not slot:
            db.add(models.DeliverySlot(name=s_name, customer_group=s_group, fee=s_fee, is_active=True))

    db.commit()
