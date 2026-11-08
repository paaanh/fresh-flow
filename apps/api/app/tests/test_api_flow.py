from datetime import datetime, timezone
from decimal import Decimal
import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.security import hash_password
from app.db import Base, get_db
from app.main import app
from app.models import Category, InventoryBatch, Product, User


@pytest.fixture
def client():
    prev_env = settings.environment
    settings.environment = "test"
    test_database_url = os.getenv("FRESHFLOW_TEST_DATABASE_URL")
    if test_database_url:
        engine = create_engine(test_database_url, pool_pre_ping=True)
    else:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    Base.metadata.create_all(engine)
    test_sessions = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        db = test_sessions()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with test_sessions() as db:
        admin = User(
            email="admin@test.example",
            full_name="Test Admin",
            password_hash=hash_password("TestPassword123!"),
            role="ADMIN",
            customer_group="STUDENT",
            is_active=True,
        )
        category = Category(name="Fresh produce")
        db.add_all([admin, category])
        db.flush()
        product = Product(
            name="Táo",
            category_id=category.id,
            description="Test product",
            unit="kg",
            base_price=Decimal("10.00"),
            is_active=True,
        )
        db.add(product)
        db.flush()
        db.add(
            InventoryBatch(
                product_id=product.id,
                batch_date=datetime.now(timezone.utc),
                initial_quantity=Decimal("10.000"),
                approved_quantity=Decimal("0.000"),
                is_open=True,
            )
        )
        db.commit()

    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        settings.environment = prev_env
        app.dependency_overrides.clear()
        Base.metadata.drop_all(engine)
        engine.dispose()


def bearer(client: TestClient, username: str, password: str) -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_auth_catalog_backend_image_and_order_approval(client: TestClient):
    assert client.get("/api/v1/health").json() == {"status": "ok", "database": "ok"}

    admin_headers = bearer(client, "admin@test.example", "TestPassword123!")
    registration = client.post(
        "/api/v1/auth/register",
        json={
            "email": "customer@test.example",
            "full_name": "Test Customer",
            "password": "CustomerPass123!",
        },
    )
    assert registration.status_code == 201, registration.text
    customer_headers = bearer(client, "customer@test.example", "CustomerPass123!")

    products = client.get("/api/v1/products").json()
    assert len(products) == 1
    assert products[0]["image_url"].startswith("/media/products/")
    image = client.get(products[0]["image_url"])
    assert image.status_code == 200
    assert image.headers["content-type"].startswith("image/")

    batches = client.get("/api/v1/admin/products/1/batches", headers=admin_headers)
    assert batches.status_code == 200, batches.text
    batch_id = batches.json()[0]["id"]
    order = client.post(
        "/api/v1/orders",
        headers=customer_headers,
        json={"items": [{"batch_id": batch_id, "quantity": "2"}], "delivery_type": "PICKUP"},
    )
    assert order.status_code == 201, order.text
    assert order.json()["status"] == "PENDING"

    approved = client.patch(
        f"/api/v1/admin/orders/{order.json()['id']}/status",
        headers=admin_headers,
        json={"status": "APPROVED", "note": "Test approval"},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] in {"APPROVED", "CONFIRMED"}

    catalog = client.get("/api/v1/catalog/me", headers=customer_headers)
    assert catalog.status_code == 200, catalog.text
    assert Decimal(str(catalog.json()[0]["available_quantity"])) == Decimal("8.000")

    # Broadcast notification test
    forbidden = client.post(
        "/api/v1/admin/notifications/broadcast",
        headers=customer_headers,
        json={"title": "Hack Attempt", "body": "Unauthorized broadcast"},
    )
    assert forbidden.status_code == 403

    broadcast = client.post(
        "/api/v1/admin/notifications/broadcast",
        headers=admin_headers,
        json={"title": "Thông báo toàn sàn", "body": "Chào mừng quý khách đến với FreshFlow!"},
    )
    assert broadcast.status_code == 201
    assert broadcast.json()["success"] is True
    assert broadcast.json()["recipients_count"] >= 2

    customer_notices = client.get("/api/v1/notifications", headers=customer_headers)
    assert customer_notices.status_code == 200
    assert any(n["title"] == "Thông báo toàn sàn" for n in customer_notices.json())

    # Chat available users test
    admin_chat_users = client.get("/api/v1/chat/users", headers=admin_headers)
    assert admin_chat_users.status_code == 200
    assert len(admin_chat_users.json()) >= 1
    assert any(u["role"] == "CUSTOMER" for u in admin_chat_users.json())

    # Customer can only chat with SHOP / ADMIN
    customer_chat_users = client.get("/api/v1/chat/users", headers=customer_headers)
    assert customer_chat_users.status_code == 200
    assert len(customer_chat_users.json()) >= 1
    assert all(u["role"] in {"SHOP", "ADMIN"} for u in customer_chat_users.json())
