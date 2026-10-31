from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Category, Product


def list_categories(db: Session):
    return db.scalars(select(Category).where(Category.is_active.is_(True)).order_by(Category.name)).all()


def get_category(db: Session, category_id: int):
    return db.get(Category, category_id)


def create_category(db: Session, category: Category):
    db.add(category)
    return category


def list_products(db: Session, category_id: int | None = None):
    query = select(Product).where(Product.is_active.is_(True)).order_by(Product.name)
    if category_id is not None:
        query = query.where(Product.category_id == category_id)
    return db.scalars(query).all()


def get_product(db: Session, product_id: int):
    return db.get(Product, product_id)


def create_product(db: Session, product: Product):
    db.add(product)
    db.flush()
    return product
