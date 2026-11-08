from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.models import User
from app.api.deps import get_db, require_admin
from app.modules.moderation import service

router = APIRouter()


@router.get('/admin/moderation/terms')
def list_moderation_terms(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return service.list_moderation_terms(db=db)


@router.post('/admin/moderation/terms', status_code=201)
def add_moderation_term(term: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return service.add_moderation_term(term=term, db=db, admin=admin)


@router.delete('/admin/moderation/terms/{term_id}', status_code=204)
def delete_moderation_term(term_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    service.delete_moderation_term(term_id=term_id, db=db, admin=admin)


@router.get('/admin/moderation/violations')
def list_moderation_violations(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return service.list_moderation_violations(db=db)
