from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.core.audit import write_audit
from app.models import User
from app.schemas import ProfileUpdateIn


def admin_users(search: str | None=None, db: Session=None, _: User=None):
    query = select(User).order_by(User.created_at.desc())
    if search:
        pattern = f'%{search.strip()}%'
        query = query.where(or_(User.email.ilike(pattern), User.full_name.ilike(pattern)))
    return db.scalars(query.limit(200)).all()

def update_user_status(user_id: int, is_active: bool, db: Session=None, admin: User=None):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, 'Không tìm thấy tài khoản')
    if target.id == admin.id and (not is_active):
        raise HTTPException(409, 'Không thể tự khóa tài khoản đang sử dụng')
    target.is_active = is_active
    write_audit(db, admin.id, 'user.status_changed', 'user', target.id, str(is_active))
    db.commit()
    db.refresh(target)
    return target



def get_active_user(db: Session, user_id: int) -> User | None:
    user = db.get(User, user_id)
    return user if user is not None and user.is_active else None


def update_profile(payload: ProfileUpdateIn, db: Session, user: User) -> User:
    fields = payload.model_dump(exclude_unset=True)
    if user.role != "SHOP":
        fields = {key: value for key, value in fields.items() if not key.startswith("shop_")}
    if user.role != "SHIPPER":
        fields.pop("vehicle_info", None)

    if "full_name" in fields:
        full_name = (fields["full_name"] or "").strip()
        if len(full_name) < 2:
            raise HTTPException(422, "Họ và tên phải có ít nhất 2 ký tự")
        fields["full_name"] = full_name
    if "phone" in fields and fields["phone"] is not None:
        fields["phone"] = fields["phone"].strip() or None

    for key, value in fields.items():
        setattr(user, key, value.strip() if isinstance(value, str) else value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Số điện thoại đã được sử dụng bởi tài khoản khác")
    db.refresh(user)
    return user
