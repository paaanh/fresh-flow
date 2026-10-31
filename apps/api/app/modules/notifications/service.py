from fastapi import HTTPException
from app.models import Notification, User
from sqlalchemy.orm import Session
from sqlalchemy import select


def list_notifications(db: Session=None, user: User=None):
    return db.scalars(select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at.desc()).limit(100)).all()

def mark_notification_read(notification_id: int, db: Session=None, user: User=None):
    note = db.get(Notification, notification_id)
    if not note or note.user_id != user.id:
        raise HTTPException(404, 'Không tìm thấy thông báo')
    note.is_read = True
    db.commit()
