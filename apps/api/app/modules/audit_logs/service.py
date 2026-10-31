from app.models import AuditLog, User
from sqlalchemy.orm import Session
from sqlalchemy import select


def admin_audit_logs(limit: int=None, db: Session=None, _: User=None):
    return db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)).all()
