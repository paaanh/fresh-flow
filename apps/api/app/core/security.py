from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import get_db
from app.models import User

password_hash = PasswordHash.recommended()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_v1_prefix}/auth/login")
oauth2_optional_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_v1_prefix}/auth/login", auto_error=False)


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return password_hash.verify(password, hashed)


def create_access_token(user: User) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    return jwt.encode(
        {"sub": str(user.id), "role": user.role, "exp": expires},
        settings.jwt_secret,
        algorithm="HS256",
    )


def decode_user_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        return None


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Thông tin đăng nhập không hợp lệ hoặc đã hết hạn",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        user_id = decode_user_token(token)
        if user_id is None:
            raise unauthorized
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        raise unauthorized
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise unauthorized
    return user


def get_optional_current_user(token: str | None = Depends(oauth2_optional_scheme), db: Session = Depends(get_db)) -> User | None:
    if not token:
        return None
    user_id = decode_user_token(token)
    if user_id:
        u = db.get(User, user_id)
        if u and u.is_active:
            return u
    return None


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Cần quyền quản trị viên (Admin)")
    return user


def require_shop(user: User = Depends(get_current_user)) -> User:
    if user.role not in {"SHOP", "ADMIN"}:
        raise HTTPException(status_code=403, detail="Cần quyền Cửa hàng (Shop)")
    return user


def require_shipper(user: User = Depends(get_current_user)) -> User:
    if user.role not in {"SHIPPER", "ADMIN"}:
        raise HTTPException(status_code=403, detail="Cần quyền Giao hàng (Shipper)")
    return user


def require_admin_or_shop(user: User = Depends(get_current_user)) -> User:
    if user.role not in {"ADMIN", "SHOP"}:
        raise HTTPException(status_code=403, detail="Cần quyền Quản trị viên hoặc Cửa hàng")
    return user
