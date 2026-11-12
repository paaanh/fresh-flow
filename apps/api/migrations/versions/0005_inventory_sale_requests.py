"""Inventory reservation state, product sale pricing and sourcing-request links.

Revision ID: 0005_inventory_sale_requests
Revises: 0004_full_upgrade
"""

from alembic import op
import sqlalchemy as sa

revision = "0005_inventory_sale_requests"
down_revision = "0004_full_upgrade"
branch_labels = None
depends_on = None


def _cols(bind, table: str) -> set:
    return {c["name"] for c in sa.inspect(bind).get_columns(table)}


def upgrade():
    bind = op.get_bind()
    prod = _cols(bind, "products")
    if "sale_price" not in prod:
        op.add_column("products", sa.Column("sale_price", sa.Numeric(12, 2), nullable=True))
    if "sale_start_at" not in prod:
        op.add_column("products", sa.Column("sale_start_at", sa.DateTime(timezone=True), nullable=True))
    if "sale_end_at" not in prod:
        op.add_column("products", sa.Column("sale_end_at", sa.DateTime(timezone=True), nullable=True))

    orders = _cols(bind, "orders")
    if "inventory_state" not in orders:
        op.add_column("orders", sa.Column("inventory_state", sa.String(20), nullable=False, server_default="NONE"))
        from app.db.init_db import backfill_order_inventory_state

        backfill_order_inventory_state(bind)

    reqs = _cols(bind, "product_requests")
    if "product_id" not in reqs:
        op.add_column("product_requests", sa.Column("product_id", sa.Integer(), nullable=True))
    if "handled_by" not in reqs:
        op.add_column("product_requests", sa.Column("handled_by", sa.Integer(), nullable=True))
    if "updated_at" not in reqs:
        op.add_column("product_requests", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    for table, col in (
        ("product_requests", "updated_at"),
        ("product_requests", "handled_by"),
        ("product_requests", "product_id"),
        ("orders", "inventory_state"),
        ("products", "sale_end_at"),
        ("products", "sale_start_at"),
        ("products", "sale_price"),
    ):
        op.drop_column(table, col)
