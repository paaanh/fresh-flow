from app.core.audit import write_audit
from app.modules.inventory import repository
from app.schemas import BatchIn
from decimal import Decimal
from fastapi import HTTPException
from app.models import InventoryBatch, Product, User
from sqlalchemy.orm import Session
from app.realtime import event, manager


def _owned_product(db: Session, product_id: int, operator: User) -> Product:
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, 'Không tìm thấy sản phẩm')
    if operator.role == 'SHOP' and product.shop_id not in (None, operator.id):
        raise HTTPException(403, 'Bạn không có quyền quản lý tồn kho của Shop khác')
    if operator.role == 'SHOP' and product.shop_id is None:
        product.shop_id = operator.id
    return product


def close_batches_for_product(db: Session, product_id: int) -> None:
    repository.close_for_product(db, product_id)


async def create_batch(db: Session, product_id: int, payload: BatchIn, admin: User):
    _owned_product(db, product_id, admin)

    batch = InventoryBatch(product_id=product_id, **payload.model_dump())
    db.add(batch)
    db.flush()

    write_audit(db, admin.id, 'inventory.batch_created', 'inventory_batch', batch.id)

    db.commit()
    db.refresh(batch)

    await manager.broadcast(
        event('inventory.updated', {
            'product_id': product_id,
            'batch_id': batch.id
        })
    )

    return batch


def list_batches(db: Session, product_id: int):
    return repository.list_for_product(db, product_id)


async def remove_stock(db: Session, product_id: int, quantity: Decimal, admin: User):
    _owned_product(db, product_id, admin)

    batches = repository.lock_open_batches_for_product(db, product_id)
    remaining = quantity

    for batch in batches:
        reduction = min(batch.available_quantity, remaining)
        batch.initial_quantity -= reduction
        remaining -= reduction

        if remaining <= 0:
            break

    if remaining > 0:
        db.rollback()
        raise HTTPException(409, 'Số lượng giảm vượt quá tồn kho khả dụng')

    write_audit(db, admin.id, 'inventory.stock_removed', 'product', product_id)

    db.commit()

    await manager.broadcast(
        event('inventory.updated', {'product_id': product_id})
    )

    return {
        'product_id': product_id,
        'removed_quantity': quantity,
        'available_quantity': available_quantity(db, product_id)
    }


def lock_batches(db: Session, batch_ids: list[int]):
    return repository.lock_batches(db, batch_ids)


def approve_quantities(db: Session, demand: dict[int, Decimal]):
    batches = {
        batch.id: batch
        for batch in repository.lock_batches(db, sorted(demand))
    }

    for batch_id, quantity in demand.items():
        batch = batches.get(batch_id)

        if not batch or not batch.is_open or batch.available_quantity < quantity:
            raise HTTPException(409, 'Không đủ tồn kho để duyệt đơn')

    for batch_id, quantity in demand.items():
        batches[batch_id].approved_quantity += quantity

    return batches


def release_quantities(db: Session, demand: dict[int, Decimal]) -> None:
    batches = {
        batch.id: batch
        for batch in repository.lock_batches(db, sorted(demand))
    }

    for batch_id, quantity in demand.items():
        batch = batches.get(batch_id)

        if batch:
            batch.approved_quantity = max(
                Decimal('0'),
                batch.approved_quantity - quantity
            )


def available_quantity(db: Session, product_id: int) -> Decimal:
    return sum(
        (
            batch.available_quantity
            for batch in repository.open_batches_for_product(db, product_id)
        ),
        Decimal('0')
    )


def available_batches(db: Session, product_id: int) -> list[dict]:
    return [
        {
            'id': batch.id,
            'batch_date': batch.batch_date,
            'is_open': batch.is_open,
            'available_quantity': batch.available_quantity,
        }
        for batch in repository.open_batches_for_product(db, product_id)
        if batch.available_quantity > 0
    ]
