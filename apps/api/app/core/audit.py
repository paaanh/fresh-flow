from sqlalchemy.orm import Session

from app.models import AuditLog


def write_audit(db: Session, actor_id: int | None, action: str, entity: str, entity_id: int, details: str = "") -> None:
    db.add(AuditLog(actor_id=actor_id, action=action, entity_type=entity, entity_id=str(entity_id), details=details))
