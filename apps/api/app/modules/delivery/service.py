from fastapi import HTTPException
from app.core.audit import write_audit
from app.models import DeliverySlot, User
from app.schemas import DeliverySlotIn
from sqlalchemy.orm import Session
from sqlalchemy import select


def create_delivery_slot(payload: DeliverySlotIn, db: Session = None, admin: User = None):
    slot = DeliverySlot(**payload.model_dump())
    db.add(slot)
    db.commit()
    db.refresh(slot)
    write_audit(db, admin.id, 'delivery_slot.created', 'delivery_slot', slot.id)
    db.commit()
    return slot


def list_delivery_slots(db: Session = None, _: User = None):
    return db.scalars(select(DeliverySlot).where(DeliverySlot.is_active.is_(True))).all()


def delete_delivery_slot(slot_id: int, db: Session, admin: User):
    slot = db.get(DeliverySlot, slot_id)
    if not slot:
        raise HTTPException(404, "Không tìm thấy khung giờ giao hàng")
    db.delete(slot)
    write_audit(db, admin.id, 'delivery_slot.deleted', 'delivery_slot', slot.id)
    db.commit()
    return {"message": "Đã xóa khung giờ"}
