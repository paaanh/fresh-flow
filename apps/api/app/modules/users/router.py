from pathlib import Path
from uuid import uuid4
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.models import User
from app.realtime import event, manager
from app.schemas import AdminUserUpdateIn, CustomerGroupAssignIn, ProfileUpdateIn, UserOut
from app.api.deps import get_db, require_admin, require_admin_or_shop, get_current_user
from app.modules.users import service

router = APIRouter()


@router.get("/admin/users", response_model=list[UserOut])
def admin_users(search: str | None = None, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return service.admin_users(search=search, db=db, _=_)


@router.patch("/admin/users/{user_id}", response_model=UserOut)
def admin_update_user(
    user_id: int,
    payload: AdminUserUpdateIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return service.admin_update_user(user_id=user_id, payload=payload, db=db, admin=admin)


@router.patch("/admin/users/{user_id}/status", response_model=UserOut)
def update_user_status(user_id: int, is_active: bool, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return service.update_user_status(user_id=user_id, is_active=is_active, db=db, admin=admin)


@router.get("/shippers", response_model=list[UserOut])
def list_shippers(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.scalars(select(User).where(User.role == "SHIPPER", User.is_active == True)).all()


@router.get("/shops", response_model=list[UserOut])
def list_shops(db: Session = Depends(get_db)):
    return db.scalars(select(User).where(User.role == "SHOP", User.is_active == True)).all()


@router.patch("/users/profile", response_model=UserOut)
def update_profile(
    payload: ProfileUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return service.update_profile(payload=payload, db=db, user=user)


@router.post("/users/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    content_types = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
    extension = content_types.get(file.content_type or "")
    if not extension:
        raise HTTPException(415, "Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP")
    content = await file.read(5 * 1024 * 1024 + 1)
    if not content or len(content) > 5 * 1024 * 1024:
        raise HTTPException(413, "Ảnh đại diện tối đa 5 MB")
    signatures = {".jpg": (b"\xff\xd8\xff",), ".png": (b"\x89PNG\r\n\x1a\n",), ".webp": (b"RIFF",)}
    if not any(content.startswith(signature) for signature in signatures[extension]):
        raise HTTPException(415, "Nội dung tệp không phải ảnh hợp lệ")
    if extension == ".webp" and content[8:12] != b"WEBP":
        raise HTTPException(415, "Nội dung tệp WebP không hợp lệ")

    media_dir = Path(__file__).resolve().parents[2] / "media" / "avatars" / "uploads"
    media_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4().hex}{extension}"
    (media_dir / filename).write_bytes(content)

    user.avatar_url = f"/media/avatars/uploads/{filename}"
    db.commit()
    db.refresh(user)
    return user


@router.get("/customers", response_model=list[UserOut])
def list_customers(
    search: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_or_shop),
):
    return service.list_customers_for_operator(search=search, db=db)


@router.patch("/customers/{user_id}/group", response_model=UserOut)
async def assign_customer_to_group(
    user_id: int,
    payload: CustomerGroupAssignIn,
    db: Session = Depends(get_db),
    operator: User = Depends(require_admin_or_shop),
):
    updated = service.assign_customer_group(user_id=user_id, group_code=payload.customer_group, db=db, operator=operator)
    await manager.send_user(updated.id, event("customer_group.updated", {"user_id": updated.id, "customer_group": updated.customer_group}))
    await manager.broadcast(event("customer_group.updated", {"user_id": updated.id, "customer_group": updated.customer_group}))
    return updated
