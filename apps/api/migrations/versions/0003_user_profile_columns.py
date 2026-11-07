"""Add profile fields required by the current User model.

Revision ID: 0003_user_profile_columns
Revises: 0002_remove_chat
"""
from alembic import op
import sqlalchemy as sa


revision = "0003_user_profile_columns"
down_revision = "0002_remove_chat"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    existing = {column["name"] for column in sa.inspect(bind).get_columns("users")}
    columns = (
        ("shop_name", sa.String(length=150), True),
        ("shop_description", sa.Text(), True),
        ("shop_address", sa.String(length=255), False),
        ("avatar_url", sa.String(length=500), True),
        ("vehicle_info", sa.String(length=100), False),
    )
    for name, column_type, nullable in columns:
        if name not in existing:
            op.add_column(
                "users",
                sa.Column(name, column_type, nullable=nullable, server_default="" if not nullable else None),
            )


def downgrade():
    bind = op.get_bind()
    existing = {column["name"] for column in sa.inspect(bind).get_columns("users")}
    for name in ("vehicle_info", "avatar_url", "shop_address", "shop_description", "shop_name"):
        if name in existing:
            op.drop_column("users", name)
