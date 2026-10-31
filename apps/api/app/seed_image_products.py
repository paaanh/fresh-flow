"""Idempotently import the bundled product photos into the local catalog."""

import re
import unicodedata
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from urllib.parse import quote

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Category, InventoryBatch, Product


PRODUCTS_DIR = Path(__file__).resolve().parent / "media" / "products"
CATEGORY_BY_FOLDER = {
    "rau": "Rau củ",
    "hoa qua": "Trái cây",
    "cac loai hat": "Các loại hạt",
    "thit ca": "Thực phẩm",
}
ROOT_FRUIT_NAMES = {
    "dao", "dua hau", "dua", "dua luoi", "dua du", "hong", "kiwwi", "kiwi",
    "le", "man", "mang cut", "mit", "mia", "nho", "oi", "quyt", "tao xanh",
    "vai", "xoai", "bo", "chanh xanh", "chanh vang",
}
EXISTING_PRODUCT_IMAGE_ALIASES = {
    "rau cai kale": "Rau/cải xanh.jfif",
    "bo sap": "Hoa quả/bơ.jfif",
    "chuoi tieu": "Hoa quả/chuối.jpg",
        "trung ga sach": "Thịt cá/khay trứng gà.jfif",
}


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFD", value.lower().replace("đ", "d"))
    value = "".join(char for char in value if not unicodedata.combining(char))
    value = re.sub(r"^\d+[-\s]+", "", value)
    return " ".join(re.sub(r"[^a-z0-9]+", " ", value).split())


def display_name(stem: str) -> str:
    name = re.sub(r"^\d+[-\s]+", "", stem).replace("-", " ").strip()
    aliases = {
        "kiwwi": "Kiwi", "ra má": "Rau má", "susu": "Su su",
        "mang tre": "Măng tre", "bap ngo": "Bắp ngô",
    }
    normalized = normalize(name)
    if normalized in {normalize(key) for key in aliases}:
        return next(value for key, value in aliases.items() if normalize(key) == normalized)
    return name[:1].upper() + name[1:]


def category_for(relative_path: Path, name_key: str) -> str:
    if len(relative_path.parts) > 1:
        return CATEGORY_BY_FOLDER[normalize(relative_path.parts[0])]
    if name_key in {"hat oc cho", "lac"}:
        return "Các loại hạt"
    if name_key in ROOT_FRUIT_NAMES:
        return "Trái cây"
    return "Rau củ"


def price_and_unit(name: str, category: str) -> tuple[Decimal, str]:
    key = normalize(name)
    if category == "Các loại hạt":
        prices = {
            "hanh nhan": 35000, "hat de cuoi": 45000, "hat dieu": 30000,
            "hat ho dao": 50000, "hat huong duong": 18000, "hat lanh": 25000,
            "hat phi": 45000, "me den": 15000, "hat oc cho": 40000,
        }
        if "dau nanh" in key or "dau xanh" in key:
            return Decimal("18000"), "500 g"
        return Decimal(str(prices.get(key, 30000))), "100 g"

    if category == "Thực phẩm":
        if "trung" in key:
            return Decimal("30000" if "khay" in key else "25000"), "vỉ"
        if "bo" in key:
            return Decimal("320000"), "kg"
        if "cuu" in key:
            return Decimal("280000"), "kg"
        if "ga" in key:
            return Decimal("115000"), "kg"
        if any(word in key for word in ("heo", "suon")):
            return Decimal("165000"), "kg"
        return Decimal("135000"), "kg"

    if category == "Trái cây":
        prices = {
            "bo": 65000, "chuoi": 30000, "chanh xanh": 30000, "chanh vang": 35000,
            "cherry": 180000, "dao": 70000, "dau tay": 120000, "du du": 35000,
            "dua hau": 25000, "dua luoi": 45000, "dua": 30000, "dua dua": 45000,
            "hong": 50000, "kiwi": 95000, "kiwwi": 95000, "le": 65000,
            "mang cut": 75000, "mit": 45000, "nho tim": 95000, "nho xanh": 85000,
            "oi": 35000, "sau rieng": 120000, "tao": 65000, "tao xanh": 55000,
            "thanh long": 35000, "vai": 65000, "viet quat": 180000, "xoai": 45000,
            "quyt": 40000, "man": 60000, "mia": 20000,
        }
        return Decimal(str(prices.get(key, 50000))), "kg"

    prices = {
        "ca rot": 30000, "ca tim": 35000, "khoai lang": 30000, "khoai tay": 35000,
        "nam huong": 100000, "nam kim cham": 65000, "nam dui ga": 85000,
        "mang tay": 90000, "ot chuong": 65000, "xa lach": 40000, "ca chua": 40000,
        "dua chuot": 30000, "hanh tay": 35000, "hanh ta": 45000,
    }
    return Decimal(str(prices.get(key, 35000))), "kg"


def image_url(relative_path: Path) -> str:
    encoded = quote(relative_path.as_posix(), safe="/")
    return f"/media/products/{encoded}"


def import_products() -> tuple[int, int, int]:
    if not PRODUCTS_DIR.is_dir():
        raise FileNotFoundError(f"Product images folder not found: {PRODUCTS_DIR}")

    with SessionLocal() as db:
        categories = {category.name: category for category in db.scalars(select(Category)).all()}
        food_category = categories.get("Thực phẩm") or categories.get("Thực phẩm thiết yếu")
        legacy_meat_category = categories.get("Thịt cá")
        if food_category is None:
            food_category = Category(name="Thực phẩm", is_active=True)
            db.add(food_category)
            db.flush()
        elif food_category.name != "Thực phẩm":
            food_category.name = "Thực phẩm"
        if legacy_meat_category is not None:
            db.query(Product).filter(Product.category_id == legacy_meat_category.id).update(
                {Product.category_id: food_category.id}, synchronize_session=False
            )
            db.delete(legacy_meat_category)
        categories.pop("Thực phẩm thiết yếu", None)
        categories.pop("Thịt cá", None)
        categories["Thực phẩm"] = food_category
        for name in set(CATEGORY_BY_FOLDER.values()):
            if name not in categories:
                categories[name] = Category(name=name, is_active=True)
                db.add(categories[name])
        db.flush()

        products = db.scalars(select(Product)).all()
        products_by_name = {normalize(product.name): product for product in products}
        represented_assets: set[str] = set()
        for product_key, relative in EXISTING_PRODUCT_IMAGE_ALIASES.items():
            product = products_by_name.get(product_key)
            if product:
                product.image_url = image_url(Path(relative))
                represented_assets.add(Path(relative).as_posix().casefold())

        added = updated = skipped = 0
        seen_assets: set[str] = set()
        assets = sorted(
            (path for path in PRODUCTS_DIR.rglob("*") if path.is_file()),
            key=lambda path: (len(path.relative_to(PRODUCTS_DIR).parts) == 1, path.as_posix().lower()),
        )
        for path in assets:
            relative = path.relative_to(PRODUCTS_DIR)
            if relative.as_posix().casefold() in represented_assets:
                skipped += 1
                continue
            name = display_name(path.stem)
            key = normalize(name)
            if not key or key in seen_assets:
                skipped += 1
                continue
            seen_assets.add(key)
            category_name = category_for(relative, key)
            url = image_url(relative)

            product = products_by_name.get(key)
            if product is not None:
                if product.image_url != url or product.name != name:
                    product.name = name
                    product.image_url = url
                    updated += 1
                else:
                    skipped += 1
                continue

            price, unit = price_and_unit(name, category_name)
            product = Product(
                name=name,
                category_id=categories[category_name].id,
                description="Giá tham khảo ước tính tự động; vui lòng điều chỉnh theo giá bán thực tế.",
                unit=unit,
                image_url=url,
                base_price=price,
                is_active=True,
            )
            db.add(product)
            db.flush()
            db.add(
                InventoryBatch(
                    product_id=product.id,
                    batch_date=datetime.now(timezone.utc),
                    initial_quantity=Decimal("50.000"),
                    approved_quantity=Decimal("0.000"),
                    is_open=True,
                )
            )
            products_by_name[key] = product
            added += 1

        db.commit()
        return added, updated, skipped


if __name__ == "__main__":
    added, updated, skipped = import_products()
    print(f"Products added: {added}; image links updated: {updated}; already current/duplicates: {skipped}")
