from fastapi import HTTPException
from app.models import Notification, User
from app.schemas import BroadcastNotificationIn
from app.realtime import manager, event
from app.core.audit import write_audit
from sqlalchemy.orm import Session
from sqlalchemy import select


def list_notifications(db: Session = None, user: User = None):
    return db.scalars(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(100)
    ).all()


def mark_notification_read(notification_id: int, db: Session = None, user: User = None):
    note = db.get(Notification, notification_id)
    if not note or note.user_id != user.id:
        raise HTTPException(404, 'Không tìm thấy thông báo')
    note.is_read = True
    db.commit()


async def broadcast_notification(payload: BroadcastNotificationIn, db: Session, admin: User):
    query = select(User).where(User.is_active == True)
    if payload.target_role:
        query = query.where(User.role == payload.target_role.upper())
    users = db.scalars(query).all()

    notifications = [
        Notification(
            user_id=u.id,
            title=payload.title,
            body=payload.body,
            event_type="system.broadcast",
        )
        for u in users
    ]
    if notifications:
        db.add_all(notifications)
        db.commit()

    await manager.broadcast(
        event(
            "notification.created",
            {
                "title": payload.title,
                "body": payload.body,
                "event_type": "system.broadcast",
                "target_role": payload.target_role,
            },
        )
    )

    write_audit(
        db,
        admin.id,
        "notification.broadcast",
        "notification",
        f"title={payload.title}; recipients={len(users)}",
    )

    return {
        "success": True,
        "recipients_count": len(users),
        "message": f"Đã gửi thông báo thành công đến {len(users)} người dùng.",
    }
