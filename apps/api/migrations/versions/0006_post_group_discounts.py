"""Per-group discount percentages on Newfeed posts.

Revision ID: 0006_post_group_discounts
Revises: 0005_inventory_sale_requests
"""

from alembic import op
import sqlalchemy as sa

revision = "0006_post_group_discounts"
down_revision = "0005_inventory_sale_requests"
branch_labels = None
depends_on = None


def upgrade():
    cols = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("posts")}
    if "group_discounts" not in cols:
        # MySQL does not allow a DEFAULT on TEXT columns: add it nullable, then backfill existing rows.
        op.add_column("posts", sa.Column("group_discounts", sa.Text(), nullable=True))
        op.execute("UPDATE posts SET group_discounts = '' WHERE group_discounts IS NULL")


def downgrade():
    op.drop_column("posts", "group_discounts")
