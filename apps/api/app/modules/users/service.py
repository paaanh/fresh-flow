from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.core.audit import write_audit
from app.models import User
from app.schemas import AdminUserUpdateIn, ProfileUpdateIn


def admin_users(search: str | None=None, db: Session=None, _: User=None):
    query = select(User).order_by(User.created_at.desc())
    if search:
        pattern = f'%{search.strip()}%'
        query = query.where(or_(User.email.ilike(pattern), User.full_name.ilike(pattern), User.phone.ilike(pattern), User.shop_name.ilike(pattern)))
    return db.scalars(query.limit(200)).all()


def admin_update_user(user_id: int, payload: AdminUserUpdateIn, db: Session, admin: User) -> User:
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, 'Không tìm thấy tài khoản')

    fields = payload.model_dump(exclude_unset=True)
    if target.id == admin.id:
        if fields.get('is_active') is False:
            raise HTTPException(409, 'Không thể tự khóa tài khoản đang sử dụng')
        if 'role' in fields and fields['role'] != 'ADMIN':
            raise HTTPException(409, 'Không thể tự hạ quyền quản trị viên đang sử dụng')

    if 'full_name' in fields and fields['full_name'] is not None:
        clean_name = fields['full_name'].strip()
        if len(clean_name) < 2:
            raise HTTPException(422, 'Họ và tên phải có ít nhất 2 ký tự')
        target.full_name = clean_name
    if 'phone' in fields:
        target.phone = (fields['phone'] or '').strip() or None
    if 'role' in fields and fields['role'] is not None:
        target.role = fields['role'].upper()
    if 'customer_group' in fields and fields['customer_group'] is not None:
        target.customer_group = fields['customer_group'].strip()
    if 'is_active' in fields and fields['is_active'] is not None:
        target.is_active = bool(fields['is_active'])
    if 'shop_name' in fields:
        target.shop_name = (fields['shop_name'] or '').strip() or None
    if 'shop_description' in fields:
        target.shop_description = (fields['shop_description'] or '').strip()
    if 'shop_address' in fields:
        target.shop_address = (fields['shop_address'] or '').strip()
    if 'vehicle_info' in fields:
        target.vehicle_info = (fields['vehicle_info'] or '').strip()

    try:
        write_audit(db, admin.id, 'user.admin_updated', 'user', str(target.id), f'role={target.role}, group={target.customer_group}, active={target.is_active}')
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'Số điện thoại hoặc thông tin đã được sử dụng bởi tài khoản khác')
    db.refresh(target)
    return target

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
        if value is None and key in {"shop_address", "shop_description", "vehicle_info"}:
            value = ""
        setattr(user, key, value.strip() if isinstance(value, str) else value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Số điện thoại đã được sử dụng bởi tài khoản khác")
    db.refresh(user)
    return user
