"""Full schema upgrade: new tables and columns added in the v2 feature set.

Revision ID: 0004_full_upgrade
Revises: 0003_user_profile_columns
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_full_upgrade"
down_revision = "0003_user_profile_columns"
branch_labels = None
depends_on = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _existing_tables(bind) -> set:
    return set(sa.inspect(bind).get_table_names())


def _existing_cols(bind, table: str) -> set:
    return {c["name"] for c in sa.inspect(bind).get_columns(table)}


# ---------------------------------------------------------------------------
# upgrade
# ---------------------------------------------------------------------------

def upgrade():
    bind = op.get_bind()
    tables = _existing_tables(bind)

    # ------------------------------------------------------------------
    # 1. customer_groups
    # ------------------------------------------------------------------
    if "customer_groups" not in tables:
        op.create_table(
            "customer_groups",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("code", sa.String(50), nullable=False, unique=True),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("discount_percent", sa.Numeric(5, 2), nullable=False, server_default="0.00"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        )
        op.create_index("ix_customer_groups_code", "customer_groups", ["code"], unique=True)

    # ------------------------------------------------------------------
    # 2. vat_configs
    # ------------------------------------------------------------------
    if "vat_configs" not in tables:
        op.create_table(
            "vat_configs",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("tax_name", sa.String(100), nullable=False, server_default="VAT"),
            sa.Column("rate", sa.Numeric(5, 4), nullable=False, server_default="0.0800"),
            sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                      server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        )

    # ------------------------------------------------------------------
    # 3. vat_history
    # ------------------------------------------------------------------
    if "vat_history" not in tables:
        op.create_table(
            "vat_history",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("vat_config_id", sa.Integer(), sa.ForeignKey("vat_configs.id"), nullable=False),
            sa.Column("old_rate", sa.Numeric(5, 4), nullable=False),
            sa.Column("new_rate", sa.Numeric(5, 4), nullable=False),
            sa.Column("changed_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                      server_default=sa.text("CURRENT_TIMESTAMP")),
        )

    # ------------------------------------------------------------------
    # 4. posts
    # ------------------------------------------------------------------
    if "posts" not in tables:
        op.create_table(
            "posts",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("title", sa.String(200), nullable=False),
            sa.Column("content", sa.Text(), nullable=True),
            sa.Column("post_type", sa.String(50), nullable=False, server_default="PRODUCT_INTRO"),
            sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=True),
            sa.Column("image_urls", sa.Text(), nullable=True),
            sa.Column("quantity_limit", sa.Numeric(12, 3), nullable=True),
            sa.Column("target_audience", sa.String(50), nullable=False, server_default="ALL"),
            sa.Column("target_customer_group", sa.String(50), nullable=True),
            sa.Column("sale_price", sa.Numeric(12, 2), nullable=True),
            sa.Column("group_prices", sa.Text(), nullable=True),
            sa.Column("order_start_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("order_end_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("delivery_time_text", sa.String(100), nullable=False, server_default=""),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                      server_default=sa.text("CURRENT_TIMESTAMP")),
        )
        op.create_index("ix_posts_author_id", "posts", ["author_id"])
        op.create_index("ix_posts_is_active", "posts", ["is_active"])
        op.create_index("ix_posts_created_at", "posts", ["created_at"])

    # ------------------------------------------------------------------
    # 5. product_reviews
    # ------------------------------------------------------------------
    if "product_reviews" not in tables:
        op.create_table(
            "product_reviews",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id"), nullable=True),
            sa.Column("rating", sa.Integer(), nullable=False),
            sa.Column("comment", sa.Text(), nullable=True),
            sa.Column("images", sa.Text(), nullable=True),
            sa.Column("shop_reply", sa.Text(), nullable=True),
            sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                      server_default=sa.text("CURRENT_TIMESTAMP")),
        )
        op.create_index("ix_product_reviews_product_id", "product_reviews", ["product_id"])
        op.create_index("ix_product_reviews_user_id", "product_reviews", ["user_id"])

    # ------------------------------------------------------------------
    # 6. shipper_reviews
    # ------------------------------------------------------------------
    if "shipper_reviews" not in tables:
        op.create_table(
            "shipper_reviews",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("shipper_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id"), nullable=False),
            sa.Column("rating", sa.Integer(), nullable=False),
            sa.Column("attitude_rating", sa.Integer(), nullable=False, server_default="5"),
            sa.Column("speed_rating", sa.Integer(), nullable=False, server_default="5"),
            sa.Column("comment", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                      server_default=sa.text("CURRENT_TIMESTAMP")),
        )
        op.create_index("ix_shipper_reviews_shipper_id", "shipper_reviews", ["shipper_id"])
        op.create_index("ix_shipper_reviews_user_id", "shipper_reviews", ["user_id"])
        op.create_index("ix_shipper_reviews_order_id", "shipper_reviews", ["order_id"])

    # ------------------------------------------------------------------
    # 7. chat_messages
    # ------------------------------------------------------------------
    if "chat_messages" not in tables:
        op.create_table(
            "chat_messages",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("sender_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("receiver_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id"), nullable=True),
            sa.Column("content", sa.Text(), nullable=True),
            sa.Column("image_url", sa.String(500), nullable=True),
            sa.Column("is_read", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                      server_default=sa.text("CURRENT_TIMESTAMP")),
        )
        op.create_index("ix_chat_messages_sender_id", "chat_messages", ["sender_id"])
        op.create_index("ix_chat_messages_receiver_id", "chat_messages", ["receiver_id"])
        op.create_index("ix_chat_messages_order_id", "chat_messages", ["order_id"])

    # ------------------------------------------------------------------
    # 8. product_requests
    # ------------------------------------------------------------------
    if "product_requests" not in tables:
        op.create_table(
            "product_requests",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("product_name", sa.String(180), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("status", sa.String(30), nullable=False, server_default="OPEN"),
            sa.Column("admin_response", sa.Text(), nullable=True),
            sa.Column("quoted_price", sa.Numeric(12, 2), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                      server_default=sa.text("CURRENT_TIMESTAMP")),
        )
        op.create_index("ix_product_requests_user_id", "product_requests", ["user_id"])
        op.create_index("ix_product_requests_status", "product_requests", ["status"])

    # ------------------------------------------------------------------
    # 9. notifications
    # ------------------------------------------------------------------
    if "notifications" not in tables:
        op.create_table(
            "notifications",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("title", sa.String(160), nullable=False),
            sa.Column("body", sa.Text(), nullable=True),
            sa.Column("event_type", sa.String(60), nullable=False, server_default="general"),
            sa.Column("is_read", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                      server_default=sa.text("CURRENT_TIMESTAMP")),
        )
        op.create_index("ix_notifications_user_id", "notifications", ["user_id"])

    # ------------------------------------------------------------------
    # 10. moderation_terms
    # ------------------------------------------------------------------
    if "moderation_terms" not in tables:
        op.create_table(
            "moderation_terms",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("term", sa.String(100), nullable=False, unique=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        )

    # ------------------------------------------------------------------
    # 11. moderation_violations
    # ------------------------------------------------------------------
    if "moderation_violations" not in tables:
        op.create_table(
            "moderation_violations",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("matched_term", sa.String(100), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                      server_default=sa.text("CURRENT_TIMESTAMP")),
        )
        op.create_index("ix_moderation_violations_user_id", "moderation_violations", ["user_id"])

    # ------------------------------------------------------------------
    # 12. audit_logs
    # ------------------------------------------------------------------
    if "audit_logs" not in tables:
        op.create_table(
            "audit_logs",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("action", sa.String(100), nullable=False),
            sa.Column("entity_type", sa.String(60), nullable=False),
            sa.Column("entity_id", sa.String(60), nullable=False),
            sa.Column("details", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                      server_default=sa.text("CURRENT_TIMESTAMP")),
        )
        op.create_index("ix_audit_logs_action", "audit_logs", ["action"])

    # ------------------------------------------------------------------
    # 13. ALTER existing tables — add missing columns
    # ------------------------------------------------------------------

    # categories
    cats = _existing_cols(bind, "categories")
    if "parent_id" not in cats:
        if bind.dialect.name == "sqlite":
            op.add_column("categories", sa.Column("parent_id", sa.Integer(), nullable=True))
        else:
            op.add_column("categories", sa.Column("parent_id", sa.Integer(),
                          sa.ForeignKey("categories.id"), nullable=True))
    if "description" not in cats:
        # MySQL rejects DEFAULT on TEXT columns (error 1101): add, then backfill
        op.add_column("categories", sa.Column("description", sa.Text(), nullable=True))
        op.execute("UPDATE categories SET description = '' WHERE description IS NULL")
    if "icon" not in cats:
        op.add_column("categories", sa.Column("icon", sa.String(100),
                      nullable=False, server_default=""))

    # products
    prods = _existing_cols(bind, "products")
    if "shop_id" not in prods:
        if bind.dialect.name == "sqlite":
            op.add_column("products", sa.Column("shop_id", sa.Integer(), nullable=True))
        else:
            op.add_column("products", sa.Column("shop_id", sa.Integer(),
                          sa.ForeignKey("users.id"), nullable=True))
        op.create_index("ix_products_shop_id", "products", ["shop_id"])
    if "images" not in prods:
        # MySQL rejects DEFAULT on TEXT columns (error 1101): add, then backfill
        op.add_column("products", sa.Column("images", sa.Text(), nullable=True))
        op.execute("UPDATE products SET images = '' WHERE images IS NULL")
    if "attached_services" not in prods:
        # MySQL rejects DEFAULT on TEXT columns (error 1101): add, then backfill
        op.add_column("products", sa.Column("attached_services", sa.Text(), nullable=True))
        op.execute("UPDATE products SET attached_services = '' WHERE attached_services IS NULL")

    # orders — new financial & delivery columns
    ords = _existing_cols(bind, "orders")

    order_new_cols = [
        ("shop_id",                   sa.Integer(),         True,  None),
        ("shipper_id",                sa.Integer(),         True,  None),
        ("recipient_name",            sa.String(120),       False, ""),
        ("recipient_phone",           sa.String(30),        False, ""),
        ("expected_delivery_time",    sa.String(100),       False, ""),
        ("vat_rate",                  sa.Numeric(5, 4),     False, "0.0800"),
        ("vat_amount",                sa.Numeric(12, 2),    False, "0.00"),
        ("discount_amount",           sa.Numeric(12, 2),    False, "0.00"),
        ("paid_amount",               sa.Numeric(12, 2),    False, "0.00"),
        ("debt_amount",               sa.Numeric(12, 2),    False, "0.00"),
        ("payment_status",            sa.String(30),        False, "UNPAID"),
        ("payment_method",            sa.String(30),        False, "COD"),
        ("cash_collected_by_shipper", sa.Numeric(12, 2),    False, "0.00"),
    ]
    for col_name, col_type, nullable, default in order_new_cols:
        if col_name not in ords:
            op.add_column(
                "orders",
                sa.Column(col_name, col_type, nullable=nullable,
                          server_default=default if not nullable else None)
            )

    # Add FK indexes for orders if columns were just created
    if "shop_id" not in ords:
        op.create_index("ix_orders_shop_id", "orders", ["shop_id"])
        if bind.dialect.name != "sqlite":
            op.create_foreign_key("fk_orders_shop_id", "orders", "users", ["shop_id"], ["id"])
    if "shipper_id" not in ords:
        op.create_index("ix_orders_shipper_id", "orders", ["shipper_id"])
        if bind.dialect.name != "sqlite":
            op.create_foreign_key("fk_orders_shipper_id", "orders", "users", ["shipper_id"], ["id"])


# ---------------------------------------------------------------------------
# downgrade
# ---------------------------------------------------------------------------

def downgrade():
    bind = op.get_bind()
    tables = _existing_tables(bind)

    for tbl in ("chat_messages", "shipper_reviews", "product_reviews", "posts",
                "vat_history", "vat_configs", "customer_groups"):
        if tbl in tables:
            op.drop_table(tbl)
