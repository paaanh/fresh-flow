from fastapi import APIRouter
from fastapi import Depends
from sqlalchemy.orm import Session
from app.models import User
from app.schemas import UserOut
from app.db import get_db
from app.core.security import require_admin
from app.api.deps import get_db, require_admin
from app.modules.users import service

router = APIRouter()

@router.get('/admin/users', response_model=list[UserOut])
def admin_users(search: str | None=None, db: Session=Depends(get_db), _: User=Depends(require_admin)):
    return service.admin_users(search=search, db=db, _=_)

@router.patch('/admin/users/{user_id}/status', response_model=UserOut)
def update_user_status(user_id: int, is_active: bool, db: Session=Depends(get_db), admin: User=Depends(require_admin)):
    return service.update_user_status(user_id=user_id, is_active=is_active, db=db, admin=admin)
