from sqlalchemy.orm import Session

from app.models import Notification


def add_notification(db: Session, user_id: int, title: str, body: str, event_type: str) -> Notification:
    notification = Notification(user_id=user_id, title=title, body=body, event_type=event_type)
    db.add(notification)
    return notification
