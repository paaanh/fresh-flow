from fastapi import APIRouter
from fastapi import Depends, Query
from sqlalchemy.orm import Session
from app.models import User
from app.db import get_db
from app.core.security import require_admin
from app.api.deps import get_db, require_admin
from app.modules.audit_logs import service

router = APIRouter()

@router.get('/admin/audit-logs')
def admin_audit_logs(limit: int=Query(default=100, ge=1, le=500), db: Session=Depends(get_db), _: User=Depends(require_admin)):
    return service.admin_audit_logs(limit=limit, db=db, _=_)
