from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from app.schemas import LoginIn, RegisterIn, TokenOut
from sqlalchemy.orm import Session
from app.models import User
from app.core.security import create_access_token, hash_password, verify_password
from sqlalchemy import func, or_, select
from app.core.config import settings


def health(db: Session = None):
    from sqlalchemy import text
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok"}


def register(payload: RegisterIn, db: Session = None):
    if settings.environment == "production":
        raise HTTPException(503, "Đăng ký cần tích hợp và xác minh email/OTP trước khi bật production")

    valid_roles = {"CUSTOMER", "SHOP", "SHIPPER"}
    role = payload.role.upper() if payload.role and payload.role.upper() in valid_roles else "CUSTOMER"

    user = User(
        email=payload.email.lower(),
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        phone=payload.phone,
        role=role,
        customer_group=payload.customer_group or "STUDENT",
        shop_name=f"Shop {payload.full_name}" if role == "SHOP" else None,
        vehicle_info="Xe máy" if role == "SHIPPER" else "",
        is_active=True,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Email hoặc số điện thoại đã được đăng ký")
    db.refresh(user)
    return user


def login(payload: LoginIn, db: Session = None):
    user = db.scalar(
        select(User).where(
            or_(func.lower(User.email) == payload.username.lower(), User.phone == payload.username)
        )
    )
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Email hoặc mật khẩu không đúng", headers={"WWW-Authenticate": "Bearer"})
    return TokenOut(access_token=create_access_token(user))


def me(user: User = None):
    return user
