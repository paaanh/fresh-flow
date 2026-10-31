from fastapi import APIRouter
from fastapi import Depends
from app.schemas import LoginIn, RegisterIn, TokenOut, UserOut
from sqlalchemy.orm import Session
from app.models import User
from app.core.security import get_current_user
from app.db import get_db
from app.api.deps import get_current_user, get_db
from app.modules.auth import service

router = APIRouter()

@router.get('/health')
def health(db: Session=Depends(get_db)):
    return service.health(db=db)

@router.post('/auth/register', response_model=UserOut, status_code=201)
def register(payload: RegisterIn, db: Session=Depends(get_db)):
    return service.register(payload=payload, db=db)

@router.post('/auth/login', response_model=TokenOut)
def login(payload: LoginIn, db: Session=Depends(get_db)):
    return service.login(payload=payload, db=db)

@router.get('/auth/me', response_model=UserOut)
def me(user: User=Depends(get_current_user)):
    return service.me(user=user)
