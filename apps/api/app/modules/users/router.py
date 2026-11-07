from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.models import User
from app.schemas import ProfileUpdateIn, UserOut
from app.api.deps import get_db, require_admin, get_current_user
from app.modules.users import service

router = APIRouter()


@router.get("/admin/users", response_model=list[UserOut])
def admin_users(search: str | None = None, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return service.admin_users(search=search, db=db, _=_)


@router.patch("/admin/users/{user_id}/status", response_model=UserOut)
def update_user_status(user_id: int, is_active: bool, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return service.update_user_status(user_id=user_id, is_active=is_active, db=db, admin=admin)


@router.get("/shippers", response_model=list[UserOut])
def list_shippers(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.scalars(select(User).where(User.role == "SHIPPER", User.is_active == True)).all()


@router.get("/shops", response_model=list[UserOut])
def list_shops(db: Session = Depends(get_db)):
    return db.scalars(select(User).where(User.role == "SHOP", User.is_active == True)).all()


@router.patch("/users/profile", response_model=UserOut)
def update_profile(
    payload: ProfileUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return service.update_profile(payload=payload, db=db, user=user)
