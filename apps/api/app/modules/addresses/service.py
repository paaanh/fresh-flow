from app.models import Address, User
from app.schemas import AddressIn
from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, select


def list_addresses(db: Session=None, user: User=None):
    return db.scalars(select(Address).where(Address.user_id == user.id).order_by(Address.is_default.desc(), Address.id)).all()

def create_address(payload: AddressIn, db: Session=None, user: User=None):
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    count = db.scalar(select(func.count(Address.id)).where(Address.user_id == user.id)) or 0
    if count >= 3:
        raise HTTPException(409, 'Mỗi tài khoản tối đa 3 địa chỉ')
    if payload.is_default:
        db.query(Address).filter(Address.user_id == user.id).update({Address.is_default: False})
    address = Address(user_id=user.id, **payload.model_dump())
    db.add(address)
    db.commit()
    db.refresh(address)
    return address

def delete_address(address_id: int, db: Session=None, user: User=None):
    address = db.get(Address, address_id)
    if not address or address.user_id != user.id:
        raise HTTPException(404, 'Không tìm thấy địa chỉ')
    db.delete(address)
    db.commit()

def update_address(address_id: int, payload: AddressIn, db: Session=None, user: User=None):
    address = db.get(Address, address_id)
    if not address or address.user_id != user.id:
        raise HTTPException(404, 'Không tìm thấy địa chỉ')
    if payload.is_default:
        db.query(Address).filter(Address.user_id == user.id).update({Address.is_default: False})
    for key, value in payload.model_dump().items():
        setattr(address, key, value)
    db.commit()
    db.refresh(address)
    return address
