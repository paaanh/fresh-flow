from fastapi import APIRouter
from fastapi import Depends
from app.schemas import NotificationOut
from sqlalchemy.orm import Session
from app.models import User
from app.core.security import get_current_user
from app.db import get_db
from app.api.deps import get_current_user, get_db
from app.modules.notifications import service

router = APIRouter()

@router.get('/notifications', response_model=list[NotificationOut])
def list_notifications(db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    return service.list_notifications(db=db, user=user)

@router.patch('/notifications/{notification_id}/read', status_code=204)
def mark_notification_read(notification_id: int, db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    return service.mark_notification_read(notification_id=notification_id, db=db, user=user)
