"""Remove chat tables and detach moderation violations from conversations.

Revision ID: 0002_remove_chat
Revises: 0001_initial
"""
from alembic import op
import sqlalchemy as sa


revision = "0002_remove_chat"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_table("messages")
    op.drop_table("conversation_members")
    bind = op.get_bind()
    foreign_keys = sa.inspect(bind).get_foreign_keys("moderation_violations")
    with op.batch_alter_table("moderation_violations") as batch_op:
        if bind.dialect.name != "sqlite":
            for foreign_key in foreign_keys:
                if "conversation_id" in foreign_key["constrained_columns"] and foreign_key["name"]:
                    batch_op.drop_constraint(foreign_key["name"], type_="foreignkey")
        batch_op.drop_column("conversation_id")
    op.drop_table("conversations")


def downgrade():
    op.create_table(
        "conversations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("moderation_violations") as batch_op:
        batch_op.add_column(sa.Column("conversation_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "moderation_violations_conversation_id_fkey", "conversations", ["conversation_id"], ["id"]
        )
    op.create_table(
        "conversation_members",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("conversation_id", "user_id", name="uq_conversation_member"),
    )
    op.create_index("ix_conversation_members_user_id", "conversation_members", ["user_id"], unique=False)
    op.create_table(
        "messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=False),
        sa.Column("sender_id", sa.Integer(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sender_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_messages_conversation_id", "messages", ["conversation_id"], unique=False)
