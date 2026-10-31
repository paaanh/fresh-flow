from fastapi import APIRouter
from fastapi import Depends
from sqlalchemy.orm import Session
from app.models import User
from app.db import get_db
from app.core.security import require_admin
from app.api.deps import get_db, require_admin
from app.modules.moderation import service

router = APIRouter()

@router.post('/admin/moderation/terms', status_code=201)
def add_moderation_term(term: str, db: Session=Depends(get_db), admin: User=Depends(require_admin)):
    return service.add_moderation_term(term=term, db=db, admin=admin)
