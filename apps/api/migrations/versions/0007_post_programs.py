"""Per-post sale programmes (giá theo bài), likes and comments on Newfeed posts.

Revision ID: 0007_post_programs
Revises: 0006_post_group_discounts
"""

from alembic import op
import sqlalchemy as sa

revision = "0007_post_programs"
down_revision = "0006_post_group_discounts"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    if "post_items" not in tables:
        op.create_table(
            "post_items",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("post_id", sa.Integer(), sa.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False),
            sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=False),
            sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("quantity_limit", sa.Numeric(12, 3), nullable=True),
            sa.Column("sold_quantity", sa.Numeric(12, 3), nullable=False, server_default="0"),
            sa.Column("sale_price", sa.Numeric(12, 2), nullable=True),
            sa.UniqueConstraint("post_id", "product_id", name="uq_post_item_product"),
        )
        op.create_index("ix_post_items_post_id", "post_items", ["post_id"])
    if "post_likes" not in tables:
        op.create_table(
            "post_likes",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("post_id", sa.Integer(), sa.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint("post_id", "user_id", name="uq_post_like_user"),
        )
        op.create_index("ix_post_likes_post_id", "post_likes", ["post_id"])
        op.create_index("ix_post_likes_user_id", "post_likes", ["user_id"])
    if "post_comments" not in tables:
        op.create_table(
            "post_comments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("post_id", sa.Integer(), sa.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            # No server default on TEXT (MySQL error 1101)
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_post_comments_post_id", "post_comments", ["post_id"])
        op.create_index("ix_post_comments_user_id", "post_comments", ["user_id"])
        op.create_index("ix_post_comments_created_at", "post_comments", ["created_at"])
    item_cols = {c["name"] for c in insp.get_columns("order_items")}
    if "post_id" not in item_cols:
        op.add_column("order_items", sa.Column("post_id", sa.Integer(), nullable=True))
        op.create_index("ix_order_items_post_id", "order_items", ["post_id"])
        if bind.dialect.name != "sqlite":
            op.create_foreign_key("fk_order_items_post_id", "order_items", "posts", ["post_id"], ["id"])

    from app.db.init_db import backfill_post_items

    backfill_post_items(bind)


def downgrade():
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        op.drop_constraint("fk_order_items_post_id", "order_items", type_="foreignkey")
    op.drop_index("ix_order_items_post_id", table_name="order_items")
    op.drop_column("order_items", "post_id")
    op.drop_table("post_comments")
    op.drop_table("post_likes")
    op.drop_table("post_items")
