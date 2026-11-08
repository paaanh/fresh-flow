from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.audit import write_audit
from app.models import ModerationTerm, ModerationViolation, User


def list_moderation_terms(db: Session):
    terms = db.scalars(select(ModerationTerm).where(ModerationTerm.is_active == True).order_by(ModerationTerm.id.desc())).all()
    return [{"id": t.id, "term": t.term, "is_active": t.is_active} for t in terms]


def add_moderation_term(term: str, db: Session = None, admin: User = None):
    value = term.strip().casefold()
    if not value:
        raise HTTPException(422, 'Từ khóa không được để trống')
    existing = db.scalar(select(ModerationTerm).where(ModerationTerm.term == value))
    if existing:
        if not existing.is_active:
            existing.is_active = True
            db.commit()
            db.refresh(existing)
            return existing
        raise HTTPException(409, 'Từ khóa đã tồn tại')
    item = ModerationTerm(term=value, is_active=True)
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'Từ khóa đã tồn tại')
    write_audit(db, admin.id, 'moderation.term_created', 'moderation_term', str(item.id), value)
    db.commit()
    return item


def delete_moderation_term(term_id: int, db: Session, admin: User):
    item = db.get(ModerationTerm, term_id)
    if not item:
        raise HTTPException(404, 'Không tìm thấy từ khóa')
    term_val = item.term
    db.delete(item)
    write_audit(db, admin.id, 'moderation.term_deleted', 'moderation_term', str(term_id), term_val)
    db.commit()


def list_moderation_violations(db: Session):
    violations = db.scalars(select(ModerationViolation).order_by(ModerationViolation.created_at.desc()).limit(100)).all()
    out = []
    for v in violations:
        user = db.get(User, v.user_id)
        out.append({
            "id": v.id,
            "user_id": v.user_id,
            "user_name": user.full_name if user else f"User #{v.user_id}",
            "user_email": user.email if user else "",
            "matched_term": v.matched_term,
            "created_at": v.created_at,
        })
    return out
