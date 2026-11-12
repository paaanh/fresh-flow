from app.core.audit import write_audit
from app.modules.inventory import repository
from app.schemas import BatchIn
from decimal import Decimal
from fastapi import HTTPException
from app.models import InventoryBatch, Product, User
from sqlalchemy import case, select, update
from sqlalchemy.orm import Session
from app.realtime import event, manager


def _owned_product(db: Session, product_id: int, operator: User) -> Product:
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, 'Không tìm thấy sản phẩm')
    if operator.role == 'SHOP' and product.shop_id != operator.id:
        raise HTTPException(403, 'Bạn không có quyền quản lý tồn kho của sản phẩm này')
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


async def receive_bulk(db: Session, payload, operator: User):
    """All lines are checked first, then one batch per product is created — all or nothing."""
    from datetime import datetime, timezone
    totals: dict[int, Decimal] = {}
    for line in payload.items:
        totals[line.product_id] = totals.get(line.product_id, Decimal("0")) + line.quantity
    for product_id in totals:
        _owned_product(db, product_id, operator)
    now = datetime.now(timezone.utc)
    batches = []
    for product_id, quantity in totals.items():
        batch = InventoryBatch(product_id=product_id, batch_date=now, initial_quantity=quantity, approved_quantity=Decimal("0"), is_open=True)
        db.add(batch)
        db.flush()
        batches.append(batch)
    write_audit(db, operator.id, 'inventory.bulk_received', 'inventory_batch', ','.join(str(b.id) for b in batches))
    db.commit()
    await manager.broadcast(event('inventory.updated', {'product_ids': list(totals)}))
    return {"received": len(batches), "product_ids": list(totals), "total_quantity": float(sum(totals.values()))}


def list_batches(db: Session, product_id: int, operator: User | None = None):
    if operator:
        _owned_product(db, product_id, operator)
    return repository.list_for_product(db, product_id)


async def remove_stock(db: Session, product_id: int, quantity: Decimal, admin: User):
    """Remove physical stock (hư hỏng, hao hụt...). Reserved quantities are never touched."""
    _owned_product(db, product_id, admin)

    batches = repository.lock_open_batches_for_product(db, product_id)
    remaining = quantity

    for batch in batches:
        reduction = min(batch.available_quantity, remaining)
        if reduction <= 0:
            continue
        result = db.execute(
            update(InventoryBatch)
            .where(
                InventoryBatch.id == batch.id,
                InventoryBatch.initial_quantity - InventoryBatch.approved_quantity >= reduction,
            )
            .values(initial_quantity=InventoryBatch.initial_quantity - reduction)
            .execution_options(synchronize_session=False)
        )
        if result.rowcount != 1:
            continue
        remaining -= reduction
        if remaining <= 0:
            break

    if remaining > 0:
        db.rollback()
        raise HTTPException(409, 'Số lượng giảm vượt quá tồn kho khả dụng (không thể giảm phần hàng đang giữ cho đơn đã xác nhận)')

    write_audit(db, admin.id, 'inventory.stock_removed', 'product', product_id)

    db.commit()
    db.expire_all()

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


def try_reserve(db: Session, batch_id: int, quantity: Decimal) -> bool:
    """Atomically reserve stock on one batch.

    A single conditional UPDATE is used instead of read-check-write so two
    transactions confirming orders at the same time can never both succeed on
    the same remaining quantity (works on MySQL row locks and SQLite's write lock).
    """
    result = db.execute(
        update(InventoryBatch)
        .where(
            InventoryBatch.id == batch_id,
            InventoryBatch.is_open.is_(True),
            InventoryBatch.initial_quantity - InventoryBatch.approved_quantity >= quantity,
        )
        .values(approved_quantity=InventoryBatch.approved_quantity + quantity)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount == 1


def approve_quantities(db: Session, demand: dict[int, Decimal]):
    """Reserve every batch in `demand` or raise 409 without reserving anything."""
    for batch_id in sorted(demand):
        if not try_reserve(db, batch_id, demand[batch_id]):
            db.rollback()
            raise HTTPException(409, 'Không đủ tồn kho khả dụng để giữ hàng cho đơn này')
    db.expire_all()
    return {batch.id: batch for batch in repository.lock_batches(db, sorted(demand))}


def reserve_order_items(db: Session, items) -> None:
    """Reserve stock for order lines, moving a line to another open batch of the
    same product when its original batch has been sold out by other orders."""
    shortages = []
    for item in sorted(items, key=lambda line: line.batch_id):
        if try_reserve(db, item.batch_id, item.quantity):
            continue
        alternatives = db.scalars(
            select(InventoryBatch.id)
            .where(
                InventoryBatch.product_id == item.product_id,
                InventoryBatch.is_open.is_(True),
                InventoryBatch.id != item.batch_id,
            )
            .order_by(InventoryBatch.batch_date, InventoryBatch.id)
        ).all()
        moved = False
        for alt_id in alternatives:
            if try_reserve(db, alt_id, item.quantity):
                item.batch_id = alt_id
                moved = True
                break
        if not moved:
            shortages.append(item)
    if shortages:
        db.rollback()
        names = ", ".join(sorted({line.product_name_snapshot for line in shortages}))
        raise HTTPException(409, f'Không đủ tồn kho khả dụng để xác nhận đơn: {names}. Vui lòng chọn phương án xử lý thiếu hàng.')
    db.flush()
    db.expire_all()


def release_quantities(db: Session, demand: dict[int, Decimal]) -> None:
    """Return reserved (not yet shipped) quantities to the available pool."""
    for batch_id, quantity in demand.items():
        db.execute(
            update(InventoryBatch)
            .where(InventoryBatch.id == batch_id)
            .values(
                approved_quantity=case(
                    (InventoryBatch.approved_quantity >= quantity, InventoryBatch.approved_quantity - quantity),
                    else_=Decimal('0'),
                )
            )
            .execution_options(synchronize_session=False)
        )
    db.expire_all()


def restock_quantities(db: Session, demand: dict[int, Decimal]) -> None:
    """Goods that already left the warehouse come back (order cancelled in transit)."""
    for batch_id, quantity in demand.items():
        db.execute(
            update(InventoryBatch)
            .where(InventoryBatch.id == batch_id)
            .values(initial_quantity=InventoryBatch.initial_quantity + quantity)
            .execution_options(synchronize_session=False)
        )
    db.expire_all()


def ship_quantities(db: Session, demand: dict[int, Decimal]) -> None:
    """Goods leave the warehouse: reduce both the physical stock and the reservation."""
    for batch_id, quantity in demand.items():
        db.execute(
            update(InventoryBatch)
            .where(InventoryBatch.id == batch_id)
            .values(
                initial_quantity=case(
                    (InventoryBatch.initial_quantity >= quantity, InventoryBatch.initial_quantity - quantity),
                    else_=Decimal('0'),
                ),
                approved_quantity=case(
                    (InventoryBatch.approved_quantity >= quantity, InventoryBatch.approved_quantity - quantity),
                    else_=Decimal('0'),
                ),
            )
            .execution_options(synchronize_session=False)
        )
    db.expire_all()


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


def inventory_overview(db: Session, operator: User) -> list[dict]:
    """Stock board per product: physical, reserved, available and the demand of
    orders still waiting for confirmation (to warn about upcoming shortages)."""
    from app.models import Order, OrderItem, Category

    query = select(Product).where(Product.is_active.is_(True)).order_by(Product.name)
    if operator.role == 'SHOP':
        query = query.where(Product.shop_id == operator.id)
    products = db.scalars(query).all()
    if not products:
        return []
    ids = [p.id for p in products]
    batches: dict[int, list[InventoryBatch]] = {}
    for batch in db.scalars(
        select(InventoryBatch)
        .where(InventoryBatch.product_id.in_(ids), InventoryBatch.is_open.is_(True))
        .order_by(InventoryBatch.batch_date, InventoryBatch.id)
    ).all():
        batches.setdefault(batch.product_id, []).append(batch)

    pending_rows = db.execute(
        select(OrderItem.product_id, OrderItem.quantity, Order.id, Order.order_number, Order.created_at)
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.status == 'PENDING', OrderItem.product_id.in_(ids))
        .order_by(Order.created_at)
    ).all()
    pending: dict[int, list[dict]] = {}
    for product_id, qty, order_id, number, created in pending_rows:
        pending.setdefault(product_id, []).append(
            {'order_id': order_id, 'order_number': number, 'quantity': qty, 'created_at': created}
        )
    categories = {c.id: c.name for c in db.scalars(select(Category)).all()}

    out = []
    for product in products:
        open_batches = batches.get(product.id, [])
        stock = sum((b.initial_quantity for b in open_batches), Decimal('0'))
        reserved = sum((b.approved_quantity for b in open_batches), Decimal('0'))
        available = max(Decimal('0'), stock - reserved)
        waiting = pending.get(product.id, [])
        pending_qty = sum((w['quantity'] for w in waiting), Decimal('0'))
        out.append({
            'product_id': product.id,
            'name': product.name,
            'unit': product.unit,
            'category': categories.get(product.category_id, 'Khác'),
            'shop_id': product.shop_id,
            'stock_quantity': stock,
            'reserved_quantity': reserved,
            'available_quantity': available,
            'pending_quantity': pending_qty,
            'shortage_quantity': max(Decimal('0'), pending_qty - available),
            'pending_orders': waiting,
            'batches': [
                {
                    'id': b.id,
                    'batch_date': b.batch_date,
                    'stock_quantity': b.initial_quantity,
                    'reserved_quantity': b.approved_quantity,
                    'available_quantity': b.available_quantity,
                }
                for b in open_batches
            ],
        })
    return out
