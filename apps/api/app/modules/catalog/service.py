from app.core.audit import write_audit
from app.modules.catalog import repository
from app.modules.inventory.service import close_batches_for_product
from app.modules.inventory.service import available_quantity
from app.models import Category, Product, User
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from app.schemas import ProductIn, ProductUpdateIn
from sqlalchemy.orm import Session
import unicodedata
from pathlib import Path
from urllib.parse import quote
from app.modules.pricing.service import unit_price


PRODUCT_MEDIA_DIR = Path(__file__).resolve().parents[2] / "media" / "products"


def product_image_url(product: Product) -> str | None:
    if product.image_url and not ("localhost:3000/images/" in product.image_url):
        return product.image_url
    if not PRODUCT_MEDIA_DIR.is_dir():
        return None

    def normalize(value: str) -> str:
        value = unicodedata.normalize("NFD", value.lower().replace("đ", "d"))
        return " ".join("".join(char for char in value if not unicodedata.combining(char)).replace("-", " ").split())

    name = normalize(product.name)
    candidates = [(path, normalize(path.stem)) for path in PRODUCT_MEDIA_DIR.rglob("*") if path.is_file()]
    legacy_images = {
        "kale.jpg": ("cai xanh", "rau"),
        "avocado.jpg": ("bo", "hoa qua"),
        "banana.jpg": ("chuoi", "hoa qua"),
        "eggs.jpg": ("khay trung ga", "thit ca"),
    }
    aliases = {
        "rau cai kale": ("cai xanh", "rau"),
        "bo sap": ("bo", "hoa qua"),
        "chuoi tieu": ("chuoi", "hoa qua"),
        "trung ga sach": ("khay trung ga", "thit ca"),
    }
    legacy_name = Path(product.image_url).name if product.image_url else ""
    alias = legacy_images.get(legacy_name) or aliases.get(name)
    if alias:
        stem, folder = alias
        match = next(((path, value) for path, value in candidates if value == stem and normalize(path.parent.name) == folder), None)
        if match:
            relative = match[0].relative_to(PRODUCT_MEDIA_DIR).as_posix()
            return "/media/products/" + quote(relative, safe="/")
    match = next(((path, stem) for path, stem in candidates if stem == name), None)
    if match is None:
        match = next(((path, stem) for path, stem in candidates if stem and name.startswith(stem + " ")), None)
    if match is None:
        first_word = name.split(" ", 1)[0]
        match = next(((path, stem) for path, stem in candidates if stem == first_word or stem.startswith(first_word + " ")), None)
    if match is None:
        return None
    relative = match[0].relative_to(PRODUCT_MEDIA_DIR).as_posix()
    return "/media/products/" + quote(relative, safe="/")


def product_out(db: Session, product: Product, user: User | None=None) -> dict:
    return {'id': product.id, 'name': product.name, 'description': product.description, 'category_id': product.category_id, 'unit': product.unit, 'image_url': product_image_url(product), 'base_price': unit_price(db, product, user.customer_group) if user else product.base_price, 'is_active': product.is_active, 'available_quantity': available_quantity(db, product.id)}

def list_categories(db: Session):
    return repository.list_categories(db)

def create_category(db: Session, name: str, admin: User):
    category = Category(name=name.strip())
    repository.create_category(db, category)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, 'Danh má»¥c Ä‘Ã£ tá»“n táº¡i') from exc
    db.refresh(category)
    write_audit(db, admin.id, 'category.created', 'category', category.id)
    db.commit()
    return category

def list_products(db: Session, category_id: int | None=None):
    return [product_out(db, product) for product in repository.list_products(db, category_id)]

def customer_catalog(db: Session, category_id: int | None, user: User):
    return [product_out(db, product, user) for product in repository.list_products(db, category_id)]

def create_product(db: Session, payload: ProductIn, admin: User):
    if payload.category_id and repository.get_category(db, payload.category_id) is None:
        raise HTTPException(404, 'KhÃ´ng tÃ¬m tháº¥y danh má»¥c')
    product = repository.create_product(db, Product(**payload.model_dump()))
    write_audit(db, admin.id, 'product.created', 'product', product.id)
    db.commit()
    db.refresh(product)
    return product_out(db, product)

def update_product(db: Session, product_id: int, payload: ProductUpdateIn, admin: User):
    product = repository.get_product(db, product_id)
    if not product:
        raise HTTPException(404, 'KhÃ´ng tÃ¬m tháº¥y sáº£n pháº©m')
    for key, value in payload.model_dump(exclude_unset=True).items():
        if key == 'category_id' and value is not None and (repository.get_category(db, value) is None):
            raise HTTPException(404, 'KhÃ´ng tÃ¬m tháº¥y danh má»¥c')
        setattr(product, key, value)
    write_audit(db, admin.id, 'product.updated', 'product', product.id)
    db.commit()
    db.refresh(product)
    return product_out(db, product)

def deactivate_product(db: Session, product_id: int, admin: User):
    product = repository.get_product(db, product_id)
    if not product:
        raise HTTPException(404, 'KhÃ´ng tÃ¬m tháº¥y sáº£n pháº©m')
    product.is_active = False
    close_batches_for_product(db, product_id)
    write_audit(db, admin.id, 'product.deactivated', 'product', product.id)
    db.commit()

