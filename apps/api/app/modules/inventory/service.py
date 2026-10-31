from app.core.audit import write_audit
from app.modules.inventory import repository
from app.schemas import BatchIn
from decimal import Decimal
from fastapi import HTTPException
from app.models import InventoryBatch, Product, User
from sqlalchemy.orm import Session
from app.realtime import event, manager


def close_batches_for_product(db: Session, product_id: int) -> None:
    repository.close_for_product(db, product_id)

async def create_batch(db: Session, product_id: int, payload: BatchIn, admin: User):
    if not db.get(Product, product_id):
        raise HTTPException(404, 'KhÃ´ng tÃ¬m tháº¥y sáº£n pháº©m')
    batch = InventoryBatch(product_id=product_id, **payload.model_dump())
    db.add(batch)
    db.flush()
    write_audit(db, admin.id, 'inventory.batch_created', 'inventory_batch', batch.id)
    db.commit()
    db.refresh(batch)
    await manager.broadcast(event('inventory.updated', {'product_id': product_id, 'batch_id': batch.id}))
    return batch

def list_batches(db: Session, product_id: int):
    return repository.list_for_product(db, product_id)

def lock_batches(db: Session, batch_ids: list[int]):
    return repository.lock_batches(db, batch_ids)

def approve_quantities(db: Session, demand: dict[int, Decimal]):
    batches = {batch.id: batch for batch in repository.lock_batches(db, sorted(demand))}
    for batch_id, quantity in demand.items():
        batch = batches.get(batch_id)
        if not batch or not batch.is_open or batch.available_quantity < quantity:
            raise HTTPException(409, 'KhÃ´ng Ä‘á»§ tá»“n kho Ä‘á»ƒ duyá»‡t Ä‘Æ¡n')
    for batch_id, quantity in demand.items():
        batches[batch_id].approved_quantity += quantity
    return batches

def release_quantities(db: Session, demand: dict[int, Decimal]) -> None:
    batches = {batch.id: batch for batch in repository.lock_batches(db, sorted(demand))}
    for batch_id, quantity in demand.items():
        batch = batches.get(batch_id)
        if batch:
            batch.approved_quantity = max(Decimal('0'), batch.approved_quantity - quantity)

def available_quantity(db: Session, product_id: int) -> Decimal:
    return sum((batch.available_quantity for batch in repository.open_batches_for_product(db, product_id)), Decimal('0'))

