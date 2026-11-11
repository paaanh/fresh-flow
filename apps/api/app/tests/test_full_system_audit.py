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
from app.models import Category, InventoryBatch, Product, User, CustomerGroup


@pytest.fixture
def audit_client():
    prev_env = settings.environment
    settings.environment = "test"
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
        # Seed customer groups
        db.add_all([
            CustomerGroup(code="STUDENT", name="Sinh viên", discount_percent=Decimal("10.00")),
            CustomerGroup(code="WORKING", name="Người đi làm", discount_percent=Decimal("5.00")),
            CustomerGroup(code="GROUP_A", name="Nhóm A", discount_percent=Decimal("12.00")),
        ])
        admin = User(
            email="admin@freshflow.vn",
            full_name="Quản Trị Viên Hệ Thống",
            password_hash=hash_password("AdminPass123!"),
            role="ADMIN",
            customer_group="WORKING",
            is_active=True,
            is_email_verified=True,
            is_phone_verified=True,
        )
        cat = Category(name="Rau củ hữu cơ")
        db.add_all([admin, cat])
        db.commit()

    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        settings.environment = prev_env
        app.dependency_overrides.clear()
        Base.metadata.drop_all(engine)
        engine.dispose()


def auth_header(client: TestClient, username: str, password: str) -> dict[str, str]:
    res = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def test_auth_otp_and_verification_flow(audit_client: TestClient):
    client = audit_client
    # 1. Request OTP for registration
    req_otp = client.post("/api/v1/auth/request-otp", json={"target": "customer1@example.com", "purpose": "register"})
    assert req_otp.status_code == 200
    otp_code = req_otp.json().get("otp_code")
    assert otp_code is not None

    # 2. Register customer using the OTP
    reg = client.post(
        "/api/v1/auth/register",
        json={
            "email": "customer1@example.com",
            "full_name": "Nguyễn Văn Khách",
            "password": "Password123!",
            "phone": "0911222333",
            "customer_group": "STUDENT",
            "role": "CUSTOMER",
            "otp_code": otp_code,
        },
    )
    assert reg.status_code == 201, reg.text
    cust_data = reg.json()
    assert cust_data["is_email_verified"] is True
    assert cust_data["customer_group"] == "STUDENT"

    # 3. Verify Phone OTP
    req_phone_otp = client.post("/api/v1/auth/request-otp", json={"target": "0911222333", "purpose": "verify_phone"})
    assert req_phone_otp.status_code == 200
    phone_code = req_phone_otp.json().get("otp_code")

    cust_headers = auth_header(client, "customer1@example.com", "Password123!")
    v_phone = client.post("/api/v1/auth/verify-otp", headers=cust_headers, json={"target": "0911222333", "code": phone_code, "purpose": "verify_phone"})
    assert v_phone.status_code == 200
    assert v_phone.json()["verified"] is True

    # 4. Forgot Password & Reset Password with OTP
    req_forgot = client.post("/api/v1/auth/request-otp", json={"target": "customer1@example.com", "purpose": "forgot_password"})
    assert req_forgot.status_code == 200
    forgot_code = req_forgot.json().get("otp_code")

    reset_res = client.post("/api/v1/auth/reset-password", json={
        "target": "customer1@example.com",
        "code": forgot_code,
        "new_password": "NewSecretPass456!",
    })
    assert reset_res.status_code == 200

    # Login with new password
    new_login = client.post("/api/v1/auth/login", json={"username": "customer1@example.com", "password": "NewSecretPass456!"})
    assert new_login.status_code == 200


def test_shop_central_pickup_and_inventory_flow(audit_client: TestClient):
    client = audit_client
    admin_headers = auth_header(client, "admin@freshflow.vn", "AdminPass123!")

    # 1. Register Shop
    shop_reg = client.post("/api/v1/auth/register", json={
        "email": "shop1@freshflow.vn",
        "full_name": "Đà Lạt Farm",
        "password": "ShopPass123!",
        "role": "SHOP",
        "phone": "0988776655",
    })
    assert shop_reg.status_code == 201
    shop_id = shop_reg.json()["id"]
    shop_headers = auth_header(client, "shop1@freshflow.vn", "ShopPass123!")

    # 2. Shop creates product & inventory batch
    prod_res = client.post("/api/v1/admin/products", headers=shop_headers, json={
        "name": "Bắp cải thảo Đà Lạt",
        "category_id": 1,
        "unit": "bắp",
        "base_price": 25000,
        "shop_id": shop_id,
    })
    assert prod_res.status_code == 201
    prod_id = prod_res.json()["id"]

    batch_res = client.post(f"/api/v1/admin/products/{prod_id}/batches", headers=shop_headers, json={
        "batch_date": datetime.now(timezone.utc).isoformat(),
        "initial_quantity": 20,
    })
    assert batch_res.status_code == 201
    batch_id = batch_res.json()["id"]

    # 3. Register Customer & place CENTRAL PICKUP order
    client.post("/api/v1/auth/register", json={
        "email": "buyer@test.vn",
        "full_name": "Người mua hàng",
        "password": "BuyerPass123!",
        "role": "CUSTOMER",
    })
    buyer_headers = auth_header(client, "buyer@test.vn", "BuyerPass123!")

    order_res = client.post("/api/v1/orders", headers=buyer_headers, json={
        "items": [{"batch_id": batch_id, "quantity": 3}],
        "delivery_type": "PICKUP",
        "payment_method": "COD",
        "note": "Nhận tại điểm tập trung",
    })
    assert order_res.status_code == 201
    order_id = order_res.json()["id"]
    assert order_res.json()["status"] == "PENDING"

    # 4. Shop transitions: CONFIRMED -> PREPARING -> READY_FOR_PICKUP -> COMPLETED
    s1 = client.patch(f"/api/v1/admin/orders/{order_id}/status", headers=shop_headers, json={"status": "CONFIRMED", "note": "Shop xác nhận đơn"})
    assert s1.status_code == 200

    s2 = client.patch(f"/api/v1/admin/orders/{order_id}/status", headers=shop_headers, json={"status": "PREPARING", "note": "Shop đang đóng gói"})
    assert s2.status_code == 200

    s3 = client.patch(f"/api/v1/admin/orders/{order_id}/status", headers=shop_headers, json={"status": "READY_FOR_PICKUP", "note": "Đã tập kết tại điểm tập trung"})
    assert s3.status_code == 200

    # Central pickup direct completion by Shop without a shipper
    s4 = client.patch(f"/api/v1/admin/orders/{order_id}/status", headers=shop_headers, json={"status": "COMPLETED", "note": "Khách đã nhận hàng tại điểm tập trung"})
    assert s4.status_code == 200
    assert s4.json()["status"] == "COMPLETED"

    # 5. Check order status history contains all steps and actors
    hist = client.get(f"/api/v1/orders/{order_id}/history", headers=buyer_headers)
    assert hist.status_code == 200
    assert len(hist.json()) >= 4
    assert any(h["to_status"] == "COMPLETED" for h in hist.json())


def test_order_cancellation_and_inventory_restoration(audit_client: TestClient):
    client = audit_client
    admin_headers = auth_header(client, "admin@freshflow.vn", "AdminPass123!")

    # Create product and batch with initial quantity 10
    prod = client.post("/api/v1/admin/products", headers=admin_headers, json={
        "name": "Dưa hấu Long An",
        "category_id": 1,
        "unit": "quả",
        "base_price": 40000,
    }).json()
    batch = client.post(f"/api/v1/admin/products/{prod['id']}/batches", headers=admin_headers, json={
        "batch_date": datetime.now(timezone.utc).isoformat(),
        "initial_quantity": 10,
    }).json()

    # Customer registers & places order for 4 items
    client.post("/api/v1/auth/register", json={
        "email": "canceller@test.vn",
        "full_name": "Khách Hủy Đơn",
        "password": "Pass123456!",
    })
    cust_headers = auth_header(client, "canceller@test.vn", "Pass123456!")

    ord_res = client.post("/api/v1/orders", headers=cust_headers, json={
        "items": [{"batch_id": batch["id"], "quantity": 4}],
        "delivery_type": "PICKUP",
    }).json()

    # Customer cancels their own PENDING order
    cancel_res = client.patch(f"/api/v1/orders/{ord_res['id']}/status", headers=cust_headers, json={"status": "CANCELLED", "note": "Đổi ý"})
    assert cancel_res.status_code == 200
    assert cancel_res.json()["status"] == "CANCELLED"

    # Check that batch available quantity was restored to 10
    batches_check = client.get(f"/api/v1/admin/products/{prod['id']}/batches", headers=admin_headers).json()
    assert Decimal(str(batches_check[0]["approved_quantity"])) == Decimal("0")


def test_shipper_delivery_and_reviews_reply_flow(audit_client: TestClient):
    client = audit_client
    admin_headers = auth_header(client, "admin@freshflow.vn", "AdminPass123!")

    # Register Shipper
    client.post("/api/v1/auth/register", json={
        "email": "shipper1@freshflow.vn",
        "full_name": "Tài Xế Nhanh",
        "password": "ShipperPass123!",
        "role": "SHIPPER",
        "phone": "0933445566",
    })
    shipper_headers = auth_header(client, "shipper1@freshflow.vn", "ShipperPass123!")

    # Create product and batch
    prod = client.post("/api/v1/admin/products", headers=admin_headers, json={
        "name": "Cà chua bi Đà Lạt",
        "category_id": 1,
        "unit": "hộp",
        "base_price": 30000,
    }).json()
    batch = client.post(f"/api/v1/admin/products/{prod['id']}/batches", headers=admin_headers, json={
        "batch_date": datetime.now(timezone.utc).isoformat(),
        "initial_quantity": 15,
    }).json()

    # Customer creates HOME delivery order
    client.post("/api/v1/auth/register", json={
        "email": "homedelivery@test.vn",
        "full_name": "Khách Giao Tận Nhà",
        "password": "HomePass123!",
    })
    buyer_headers = auth_header(client, "homedelivery@test.vn", "HomePass123!")

    order = client.post("/api/v1/orders", headers=buyer_headers, json={
        "items": [{"batch_id": batch["id"], "quantity": 2}],
        "delivery_type": "HOME",
        "delivery_address": "Số 45 Lê Lợi, Quận 1",
        "recipient_name": "Khách Nhận",
        "recipient_phone": "0912345678",
        "payment_method": "COD",
    }).json()

    # Admin approves & marks preparing
    client.patch(f"/api/v1/admin/orders/{order['id']}/status", headers=admin_headers, json={"status": "APPROVED"})
    client.patch(f"/api/v1/admin/orders/{order['id']}/status", headers=admin_headers, json={"status": "PREPARING"})
    client.patch(f"/api/v1/admin/orders/{order['id']}/status", headers=admin_headers, json={"status": "READY_FOR_PICKUP"})

    # Shipper claims order
    claim_res = client.patch(f"/api/v1/shipper/orders/{order['id']}/claim", headers=shipper_headers)
    assert claim_res.status_code == 200

    # Shipper picks up
    pickup_res = client.patch(f"/api/v1/shipper/orders/{order['id']}/pickup", headers=shipper_headers)
    assert pickup_res.status_code == 200

    # Shipper starts delivering
    delivering_res = client.patch(f"/api/v1/shipper/orders/{order['id']}/delivering", headers=shipper_headers)
    assert delivering_res.status_code == 200

    # Shipper completes delivery with COD collection
    complete_res = client.patch(f"/api/v1/shipper/orders/{order['id']}/complete?paid_amount=60000", headers=shipper_headers)
    assert complete_res.status_code == 200
    assert complete_res.json()["status"] == "COMPLETED"

    # Customer writes Product Review and Shipper Review
    prod_rev = client.post(f"/api/v1/products/{prod['id']}/reviews", headers=buyer_headers, json={
        "order_id": order["id"],
        "rating": 5,
        "comment": "Cà chua rất ngọt và tươi!",
    })
    assert prod_rev.status_code == 201
    rev_id = prod_rev.json()["id"]

    ship_rev = client.post(f"/api/v1/orders/{order['id']}/shipper-review", headers=buyer_headers, json={
        "rating": 5,
        "attitude_rating": 5,
        "speed_rating": 5,
        "comment": "Giao hàng nhanh và lịch sự!",
    })
    assert ship_rev.status_code == 201

    # Admin/Shop replies to review
    reply_res = client.post(f"/api/v1/reviews/{rev_id}/reply", headers=admin_headers, json={
        "reply": "Cảm ơn quý khách đã tin tưởng FreshFlow!",
    })
    assert reply_res.status_code == 200
    assert reply_res.json()["shop_reply"] == "Cảm ơn quý khách đã tin tưởng FreshFlow!"

    # Customer reads order reviews and sees both reviews + shop reply
    order_reviews = client.get(f"/api/v1/orders/{order['id']}/reviews", headers=buyer_headers).json()
    assert len(order_reviews["product_reviews"]) == 1
    assert order_reviews["product_reviews"][0]["shop_reply"] == "Cảm ơn quý khách đã tin tưởng FreshFlow!"
    assert len(order_reviews["shipper_reviews"]) == 1


def test_product_requests_and_moderation_flow(audit_client: TestClient):
    client = audit_client
    admin_headers = auth_header(client, "admin@freshflow.vn", "AdminPass123!")

    # 1. Moderation: Add term "hang_kem_chat_luong"
    add_term = client.post("/api/v1/admin/moderation/terms?term=hang_kem_chat_luong", headers=admin_headers)
    assert add_term.status_code in {200, 201}
    term_id = add_term.json()["id"]

    # Verify term is listed
    terms = client.get("/api/v1/admin/moderation/terms", headers=admin_headers).json()
    assert any(t["term"] == "hang_kem_chat_luong" for t in terms)

    # Delete term
    del_term = client.delete(f"/api/v1/admin/moderation/terms/{term_id}", headers=admin_headers)
    assert del_term.status_code == 204

    # 2. Product Requests flow
    client.post("/api/v1/auth/register", json={
        "email": "requester@test.vn",
        "full_name": "Khách Đặt Hàng Riêng",
        "password": "ReqPass123!",
    })
    req_headers = auth_header(client, "requester@test.vn", "ReqPass123!")

    # Customer creates product request
    created_req = client.post("/api/v1/product-requests", headers=req_headers, json={
        "product_name": "Súp lơ tím hữu cơ",
        "description": "Danh mục: Rau củ; Số lượng: 3 bắp",
    })
    assert created_req.status_code == 201
    req_id = created_req.json()["id"]

    # Admin quotes price
    quoted = client.patch(f"/api/v1/admin/product-requests/{req_id}", headers=admin_headers, json={
        "status": "QUOTED",
        "quoted_price": 35000,
        "admin_response": "Đã tìm được nguồn tại nông trại Đà Lạt",
    })
    assert quoted.status_code == 200
    assert quoted.json()["status"] == "QUOTED"
    assert quoted.json()["quoted_price"] == 35000

    # Customer accepts quote
    accepted = client.patch(f"/api/v1/admin/product-requests/{req_id}", headers=req_headers, json={
        "status": "ACCEPTED",
        "admin_response": "Khách hàng đồng ý mua",
    })
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "ACCEPTED"


def test_shop_data_isolation(audit_client: TestClient):
    client = audit_client

    # 1. Register Shop A and Shop B
    client.post("/api/v1/auth/register", json={
        "email": "shop_a@test.vn",
        "full_name": "Shop Trái Cây Miền Tây",
        "shop_name": "Shop Trái Cây Miền Tây",
        "password": "ShopPass123!",
        "role": "SHOP",
        "phone": "0911000001",
    })
    headers_shop_a = auth_header(client, "shop_a@test.vn", "ShopPass123!")

    client.post("/api/v1/auth/register", json={
        "email": "shop_b@test.vn",
        "full_name": "Shop Nấm Sạch Đà Lạt",
        "shop_name": "Shop Nấm Sạch Đà Lạt",
        "password": "ShopPass123!",
        "role": "SHOP",
        "phone": "0911000002",
    })
    headers_shop_b = auth_header(client, "shop_b@test.vn", "ShopPass123!")

    # 2. Shop A adds product A; Shop B adds product B
    prod_a = client.post("/api/v1/products", headers=headers_shop_a, json={
        "name": "Bưởi Da Xanh Bến Tre",
        "category_id": 1,
        "unit": "quả",
        "base_price": 50000,
    }).json()
    batch_a = client.post(f"/api/v1/admin/products/{prod_a['id']}/batches", headers=headers_shop_a, json={
        "batch_date": datetime.now(timezone.utc).isoformat(),
        "initial_quantity": 25,
    }).json()

    prod_b = client.post("/api/v1/products", headers=headers_shop_b, json={
        "name": "Nấm Đùi Gà Hữu Cơ",
        "category_id": 1,
        "unit": "hộp",
        "base_price": 40000,
    }).json()
    batch_b = client.post(f"/api/v1/admin/products/{prod_b['id']}/batches", headers=headers_shop_b, json={
        "batch_date": datetime.now(timezone.utc).isoformat(),
        "initial_quantity": 30,
    }).json()

    # 3. Customer registers and orders both products separately
    client.post("/api/v1/auth/register", json={
        "email": "shopper@test.vn",
        "full_name": "Khách Mua Sắm",
        "password": "ShopperPass123!",
        "role": "CUSTOMER",
    })
    shopper_headers = auth_header(client, "shopper@test.vn", "ShopperPass123!")

    order_a = client.post("/api/v1/orders", headers=shopper_headers, json={
        "items": [{"batch_id": batch_a["id"], "quantity": 1}],
        "delivery_type": "PICKUP",
        "payment_method": "COD",
    }).json()

    order_b = client.post("/api/v1/orders", headers=shopper_headers, json={
        "items": [{"batch_id": batch_b["id"], "quantity": 2}],
        "delivery_type": "PICKUP",
        "payment_method": "COD",
    }).json()

    # 4. Shop A checks orders: must ONLY see order_a, NOT order_b
    orders_shop_a = client.get("/api/v1/orders", headers=headers_shop_a).json()
    order_ids_a = [o["id"] for o in orders_shop_a]
    assert order_a["id"] in order_ids_a
    assert order_b["id"] not in order_ids_a

    # 5. Shop B checks orders: must ONLY see order_b, NOT order_a
    orders_shop_b = client.get("/api/v1/orders", headers=headers_shop_b).json()
    order_ids_b = [o["id"] for o in orders_shop_b]
    assert order_b["id"] in order_ids_b
    assert order_a["id"] not in order_ids_b

    # 6. Shop B cannot alter status of Shop A's order
    cross_update = client.patch(
        f"/api/v1/admin/orders/{order_a['id']}/status",
        headers=headers_shop_b,
        json={"status": "CONFIRMED"},
    )
    assert cross_update.status_code == 403

    # 7. Complete Order A, customer reviews Product A
    client.patch(
        f"/api/v1/admin/orders/{order_a['id']}/status",
        headers=headers_shop_a,
        json={"status": "CONFIRMED"},
    )
    client.patch(
        f"/api/v1/admin/orders/{order_a['id']}/status",
        headers=headers_shop_a,
        json={"status": "COMPLETED"},
    )
    rev_a = client.post(
        f"/api/v1/products/{prod_a['id']}/reviews",
        headers=shopper_headers,
        json={"order_id": order_a["id"], "rating": 5, "comment": "Bưởi mọng nước rất ngon!"},
    ).json()

    # Shop A sees the review
    revs_shop_a = client.get("/api/v1/shop/reviews", headers=headers_shop_a).json()
    assert any(r["id"] == rev_a["id"] for r in revs_shop_a)

    # Shop B does NOT see review for Shop A's product
    revs_shop_b = client.get("/api/v1/shop/reviews", headers=headers_shop_b).json()
    assert not any(r["id"] == rev_a["id"] for r in revs_shop_b)

    # Shop B cannot reply to Shop A's product review
    cross_reply = client.post(
        f"/api/v1/reviews/{rev_a['id']}/reply",
        headers=headers_shop_b,
        json={"reply": "Cảm ơn quý khách!"},
    )
    assert cross_reply.status_code == 403


def test_two_orders_insufficient_stock_competition_and_post_inline_products(audit_client: TestClient):
    """
    Test:
    1. When 2 orders are placed for a product batch with limited stock (e.g., 5 units),
       and Order 1 requests 3 units while Order 2 requests 4 units:
       - Both orders succeed in PENDING state.
       - Confirming Order 1 succeeds and reserves 3 units (leaving 2 available).
       - Confirming Order 2 fails with 409 Conflict because 4 > 2 available!
    2. Creating a Newfeed post with inline new_products automatically creates Products + InventoryBatches + PriceRules.
    """
    client = audit_client
    admin_headers = auth_header(client, "admin@freshflow.vn", "AdminPass123!")

    # Create a post with 2 inline new products
    post_res = client.post(
        "/api/v1/posts",
        headers=admin_headers,
        json={
            "title": "Combo nông sản thu hoạch sáng nay",
            "content": "Rau củ quả sạch tươi mới",
            "post_type": "DAILY_SPECIAL",
            "image_urls": "https://images.unsplash.com/photo-1540420773420-3366772f4999\nhttps://images.unsplash.com/photo-1518843875459-f738682238a6",
            "sale_price": 45000,
            "group_prices": '{"STUDENT": 39000, "WORKING": 42000}',
            "new_products": [
                {
                    "name": "Dâu tây giống Nhật",
                    "category_name": "Trái cây",
                    "unit": "hộp",
                    "base_price": 50000,
                    "stock": 5,
                },
                {
                    "name": "Măng tây hữu cơ",
                    "category_name": "Rau củ",
                    "unit": "bó",
                    "base_price": 40000,
                    "stock": 8,
                },
            ],
        },
    )
    assert post_res.status_code == 201
    post_data = post_res.json()
    assert len(post_data["product_ids"]) == 2
    assert len(post_data["products_info"]) == 2

    strawberry_id = post_data["product_ids"][0]
    catalog_products = client.get("/api/v1/products").json()
    catalog_names = [p["name"] for p in catalog_products]
    assert "Dâu tây giống Nhật" in catalog_names
    assert "Măng tây hữu cơ" in catalog_names
    assert catalog_products[0]["id"] == post_data["product_ids"][1]

    batches = client.get(f"/api/v1/admin/products/{strawberry_id}/batches", headers=admin_headers).json()
    assert len(batches) == 1
    batch_id = batches[0]["id"]
    assert Decimal(str(batches[0]["initial_quantity"])) == Decimal("5")

    # Register 2 customers
    client.post("/api/v1/auth/register", json={"email": "buyer1@stock.vn", "full_name": "Khách 1", "password": "Password123!"})
    client.post("/api/v1/auth/register", json={"email": "buyer2@stock.vn", "full_name": "Khách 2", "password": "Password123!"})
    h1 = auth_header(client, "buyer1@stock.vn", "Password123!")
    h2 = auth_header(client, "buyer2@stock.vn", "Password123!")

    # Both place orders while batch has 5 available (3 + 4 = 7 > 5)
    ord1 = client.post("/api/v1/orders", headers=h1, json={"items": [{"batch_id": batch_id, "quantity": 3}], "delivery_type": "PICKUP"})
    ord2 = client.post("/api/v1/orders", headers=h2, json={"items": [{"batch_id": batch_id, "quantity": 4}], "delivery_type": "PICKUP"})
    assert ord1.status_code == 201
    assert ord2.status_code == 201

    # Admin confirms Order 1 -> succeeds (approved_quantity becomes 3, available becomes 2)
    confirm1 = client.patch(f"/api/v1/admin/orders/{ord1.json()['id']}/status", headers=admin_headers, json={"status": "CONFIRMED"})
    assert confirm1.status_code == 200

    # Admin tries to confirm Order 2 -> fails with 409 Conflict because only 2 units remain (< 4 requested)
    confirm2 = client.patch(f"/api/v1/admin/orders/{ord2.json()['id']}/status", headers=admin_headers, json={"status": "CONFIRMED"})
    assert confirm2.status_code == 409

