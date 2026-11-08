from fastapi import APIRouter, Depends
from app.schemas import NotificationOut, BroadcastNotificationIn
from sqlalchemy.orm import Session
from app.models import User
from app.api.deps import get_current_user, get_db, require_admin_or_shop
from app.modules.notifications import service

router = APIRouter()

@router.get('/notifications', response_model=list[NotificationOut])
def list_notifications(db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    return service.list_notifications(db=db, user=user)

@router.patch('/notifications/{notification_id}/read', status_code=204)
def mark_notification_read(notification_id: int, db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    return service.mark_notification_read(notification_id=notification_id, db=db, user=user)

@router.post('/admin/notifications/broadcast', status_code=201)
@router.post('/notifications/broadcast', status_code=201)
async def broadcast_notification(
    payload: BroadcastNotificationIn,
    db: Session = Depends(get_db),
    operator: User = Depends(require_admin_or_shop),
):
    return await service.broadcast_notification(payload=payload, db=db, admin=operator)
