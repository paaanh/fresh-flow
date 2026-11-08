from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.models import User
from app.api.deps import get_current_user, get_db, get_optional_current_user
from app.schemas import LoginIn, RegisterIn, TokenOut, UserOut, RequestOtpIn, VerifyOtpIn, ResetPasswordIn
from app.modules.auth import service

router = APIRouter()

@router.get('/health')
def health(db: Session=Depends(get_db)):
    return service.health(db=db)

@router.post('/auth/register', response_model=UserOut, status_code=201)
def register(payload: RegisterIn, db: Session=Depends(get_db)):
    return service.register(payload=payload, db=db)

@router.post('/auth/request-otp')
def request_otp(payload: RequestOtpIn, db: Session=Depends(get_db)):
    return service.request_otp(payload=payload, db=db)

@router.post('/auth/verify-otp')
def verify_otp(payload: VerifyOtpIn, user: User | None = Depends(get_optional_current_user), db: Session=Depends(get_db)):
    return service.verify_otp(payload=payload, user=user, db=db)

@router.post('/auth/reset-password')
def reset_password(payload: ResetPasswordIn, db: Session=Depends(get_db)):
    return service.reset_password(payload=payload, db=db)

@router.post('/auth/login', response_model=TokenOut)
def login(payload: LoginIn, db: Session=Depends(get_db)):
    return service.login(payload=payload, db=db)

@router.get('/auth/me', response_model=UserOut)
def me(user: User=Depends(get_current_user)):
    return service.me(user=user)
