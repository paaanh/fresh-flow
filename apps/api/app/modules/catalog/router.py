from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user, require_admin
from app.models import User
from app.schemas import CategoryIn, ProductIn, ProductOut, ProductUpdateIn
from app.modules.catalog import service

router = APIRouter()


@router.get("/categories")
def list_categories(db: Session = Depends(get_db)):
    return service.list_categories(db)


@router.post("/admin/categories", status_code=201)
def create_category(payload: CategoryIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return service.create_category(db, payload.name, admin)


@router.get("/products", response_model=list[ProductOut])
def list_products(category_id: int | None = None, db: Session = Depends(get_db)):
    return service.list_products(db, category_id)


@router.get("/catalog/me", response_model=list[ProductOut])
def customer_catalog(category_id: int | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.customer_catalog(db, category_id, user)


@router.post("/admin/products", response_model=ProductOut, status_code=201)
def create_product(payload: ProductIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return service.create_product(db, payload, admin)


@router.patch("/admin/products/{product_id}", response_model=ProductOut)
def update_product(product_id: int, payload: ProductUpdateIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return service.update_product(db, product_id, payload, admin)


@router.delete("/admin/products/{product_id}", status_code=204)
def deactivate_product(product_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    service.deactivate_product(db, product_id, admin)
