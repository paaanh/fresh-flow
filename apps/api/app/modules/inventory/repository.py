from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import InventoryBatch


def close_for_product(db: Session, product_id: int) -> None:
    batches = db.scalars(select(InventoryBatch).where(InventoryBatch.product_id == product_id)).all()
    for batch in batches:
        batch.is_open = False


def list_for_product(db: Session, product_id: int):
    return db.scalars(
        select(InventoryBatch)
        .where(InventoryBatch.product_id == product_id)
        .order_by(InventoryBatch.batch_date.desc())
    ).all()


def lock_batches(db: Session, batch_ids: list[int]):
    if not batch_ids:
        return []
    return db.scalars(
        select(InventoryBatch)
        .where(InventoryBatch.id.in_(batch_ids))
        .order_by(InventoryBatch.id)
        .with_for_update()
    ).all()


def open_batches_for_product(db: Session, product_id: int):
    return db.scalars(select(InventoryBatch).where(InventoryBatch.product_id == product_id, InventoryBatch.is_open.is_(True))).all()


def lock_open_batches_for_product(db: Session, product_id: int):
    return db.scalars(
        select(InventoryBatch)
        .where(InventoryBatch.product_id == product_id, InventoryBatch.is_open.is_(True))
        .order_by(InventoryBatch.batch_date, InventoryBatch.id)
        .with_for_update()
    ).all()
