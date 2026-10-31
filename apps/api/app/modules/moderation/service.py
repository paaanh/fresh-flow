from app.core.audit import write_audit
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from app.models import ModerationTerm, User
from sqlalchemy.orm import Session
from app.core.audit import write_audit


def add_moderation_term(term: str, db: Session=None, admin: User=None):
    value = term.strip().casefold()
    if not value:
        raise HTTPException(422, 'Từ khóa không được để trống')
    item = ModerationTerm(term=value)
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'Từ khóa đã tồn tại')
    write_audit(db, admin.id, 'moderation.term_created', 'moderation_term', item.id)
    db.commit()
    return item
