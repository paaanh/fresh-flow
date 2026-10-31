from fastapi import APIRouter
from fastapi import Depends
from sqlalchemy.orm import Session
from app.models import User
from datetime import datetime
from app.db import get_db
from app.core.security import require_admin
from app.api.deps import get_db, require_admin
from app.modules.reports import service

router = APIRouter()

@router.get('/admin/reports/summary')
def report_summary(date_from: datetime, date_to: datetime, db: Session=Depends(get_db), _: User=Depends(require_admin)):
    return service.report_summary(date_from=date_from, date_to=date_to, db=db, _=_)
