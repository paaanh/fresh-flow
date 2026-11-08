from pathlib import Path
from uuid import uuid4
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user, require_admin, require_admin_or_shop
from app.models import User
from app.schemas import CategoryIn, ProductIn, ProductOut, ProductUpdateIn
from app.modules.catalog import service

router = APIRouter()

@router.post("/admin/products/images", status_code=201)
async def upload_product_image(
    file: UploadFile = File(...),
    operator: User = Depends(require_admin_or_shop),
):
    content_types = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
    extension = content_types.get(file.content_type or "")
    if not extension:
        raise HTTPException(415, "Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP")
    content = await file.read(5 * 1024 * 1024 + 1)
    if not content or len(content) > 5 * 1024 * 1024:
        raise HTTPException(413, "Ảnh phải có dung lượng tối đa 5 MB")
    signatures = {".jpg": (b"\xff\xd8\xff",), ".png": (b"\x89PNG\r\n\x1a\n",), ".webp": (b"RIFF",)}
    if not any(content.startswith(signature) for signature in signatures[extension]):
        raise HTTPException(415, "Nội dung tệp không phải ảnh hợp lệ")
    if extension == ".webp" and content[8:12] != b"WEBP":
        raise HTTPException(415, "Nội dung tệp WebP không hợp lệ")
    media_dir = Path(__file__).resolve().parents[2] / "media" / "products" / "uploads"
    media_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4().hex}{extension}"
    (media_dir / filename).write_bytes(content)
    return {"image_url": f"/media/products/uploads/{filename}"}


@router.get("/categories")
def list_categories(db: Session = Depends(get_db)):
    return service.list_categories(db)


@router.post("/admin/categories", status_code=201)
def create_category(payload: CategoryIn, db: Session = Depends(get_db), admin: User = Depends(require_admin_or_shop)):
    return service.create_category(db, payload, admin)


@router.get("/products", response_model=list[ProductOut])
def list_products(
    category_id: int | None = Query(default=None),
    shop_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return service.list_products(db, category_id=category_id, shop_id=shop_id)


@router.get("/catalog/me", response_model=list[ProductOut])
def customer_catalog(
    category_id: int | None = Query(default=None),
    shop_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return service.customer_catalog(db, category_id=category_id, user=user, shop_id=shop_id)


@router.post("/admin/products", response_model=ProductOut, status_code=201)
@router.post("/products", response_model=ProductOut, status_code=201)
def create_product(
    payload: ProductIn,
    db: Session = Depends(get_db),
    operator: User = Depends(require_admin_or_shop),
):
    return service.create_product(db, payload, operator)


@router.patch("/admin/products/{product_id}", response_model=ProductOut)
@router.patch("/products/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    payload: ProductUpdateIn,
    db: Session = Depends(get_db),
    operator: User = Depends(require_admin_or_shop),
):
    return service.update_product(db, product_id, payload, operator)


@router.delete("/admin/products/{product_id}", status_code=204)
@router.delete("/products/{product_id}", status_code=204)
def deactivate_product(
    product_id: int,
    db: Session = Depends(get_db),
    operator: User = Depends(require_admin_or_shop),
):
    service.deactivate_product(db, product_id, operator)
