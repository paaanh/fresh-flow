"""Own original price (list price) of a product inside a post.

Revision ID: 0009_post_item_list_price
Revises: 0008_multi_group_prices
"""

from alembic import op
import sqlalchemy as sa

revision = "0009_post_item_list_price"
down_revision = "0008_multi_group_prices"
branch_labels = None
depends_on = None


def upgrade():
    cols = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("post_items")}
    if "list_price" not in cols:
        op.add_column("post_items", sa.Column("list_price", sa.Numeric(12, 2), nullable=True))


def downgrade():
    op.drop_column("post_items", "list_price")
