"""Posts for several customer groups; per-product price per group inside a post.

Revision ID: 0008_multi_group_prices
Revises: 0007_post_programs
"""

from alembic import op
import sqlalchemy as sa

revision = "0008_multi_group_prices"
down_revision = "0007_post_programs"
branch_labels = None
depends_on = None


def upgrade():
    insp = sa.inspect(op.get_bind())
    post_cols = {c["name"] for c in insp.get_columns("posts")}
    if "target_groups" not in post_cols:
        # TEXT columns cannot have a DEFAULT on MySQL (error 1101)
        op.add_column("posts", sa.Column("target_groups", sa.Text(), nullable=True))
        op.execute("UPDATE posts SET target_groups = '' WHERE target_groups IS NULL")
    item_cols = {c["name"] for c in insp.get_columns("post_items")}
    if "group_prices" not in item_cols:
        op.add_column("post_items", sa.Column("group_prices", sa.Text(), nullable=True))
        op.execute("UPDATE post_items SET group_prices = '' WHERE group_prices IS NULL")


def downgrade():
    op.drop_column("post_items", "group_prices")
    op.drop_column("posts", "target_groups")
