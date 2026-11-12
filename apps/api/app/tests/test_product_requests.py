"""Yêu cầu mặt hàng: báo giá → khách đồng ý → nhập kho lên kệ, và các quy tắc bảo vệ luồng."""
from decimal import Decimal

from fastapi.testclient import TestClient

from app.core.security import hash_password
from app.models import Category, User
from app.tests.test_api_flow import bearer, client  # noqa: F401  (pytest fixture)
from app.tests.test_inventory_conflicts import _register

API = "/api/v1"


def _seed(client: TestClient):
    """Two shops and a 'Rau củ' category."""
    from app.db import get_db
    from app.main import app

    db = next(app.dependency_overrides[get_db]())
    for email, name in [("shop1@test.example", "Vườn Một"), ("shop2@test.example", "Vườn Hai")]:
        db.add(User(email=email, full_name=name, shop_name=name, password_hash=hash_password("ShopPass123!"),
                    role="SHOP", customer_group="WORKING", is_active=True))
    db.add(Category(name="Rau củ", is_active=True))
    db.commit()
    db.close()
    return bearer(client, "shop1@test.example", "ShopPass123!"), bearer(client, "shop2@test.example", "ShopPass123!")


def _request(client, customer, name="Bí xanh"):
    res = client.post(f"{API}/product-requests", headers=customer, json={"product_name": name, "description": "Danh mục: Rau củ; Số lượng: 2 kg. Trong 2 ngày"})
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _patch(client, headers, rid, **body):
    return client.patch(f"{API}/admin/product-requests/{rid}", headers=headers, json=body)


def test_full_flow_keeps_quote_message_and_files_product_under_requested_category(client: TestClient):
    shop1, _ = _seed(client)
    customer = _register(client, "kh@test.example")
    rid = _request(client, customer)

    quoted = _patch(client, shop1, rid, status="QUOTED", quoted_price="50000", admin_response="Hàng về sáng mai, chuẩn VietGAP.")
    assert quoted.status_code == 200, quoted.text
    agreed = client.patch(f"{API}/product-requests/{rid}", headers=customer, json={"status": "ACCEPTED", "admin_response": "Khách hàng đồng ý mức báo giá"})
    assert agreed.status_code == 200, agreed.text
    assert agreed.json()["admin_response"] == "Hàng về sáng mai, chuẩn VietGAP."  # the customer's reply does not overwrite the quote

    done = _patch(client, shop1, rid, status="FULFILLED", quoted_price="50000", stock_quantity="2", unit="kg", image_url="/media/products/uploads/bi-xanh.jpg")
    assert done.status_code == 200, done.text
    body = done.json()
    assert body["status"] == "FULFILLED" and body["linked_product_name"] == "Bí xanh"
    assert Decimal(str(body["linked_product_available"])) == Decimal("2")
    product = next(p for p in client.get(f"{API}/products", headers=customer).json() if p["id"] == body["product_id"])
    categories = {c["id"]: c["name"] for c in client.get(f"{API}/categories", headers=customer).json()}
    assert categories[product["category_id"]] == "Rau củ"
    assert Decimal(str(product["base_price"])) == Decimal("50000")
    assert product["image_url"] == "/media/products/uploads/bi-xanh.jpg"


def test_cannot_fulfil_without_anything_to_buy(client: TestClient):
    shop1, _ = _seed(client)
    customer = _register(client, "kh@test.example")
    rid = _request(client, customer)
    empty = _patch(client, shop1, rid, status="FULFILLED", quoted_price="50000")
    assert empty.status_code == 422
    assert "số lượng nhập kho" in empty.json()["detail"]


def test_one_shop_handles_a_request_admin_can_step_in(client: TestClient):
    shop1, shop2 = _seed(client)
    admin = bearer(client, "admin@test.example", "TestPassword123!")
    customer = _register(client, "kh@test.example")
    rid = _request(client, customer)
    assert _patch(client, shop1, rid, status="QUOTED", quoted_price="40000").status_code == 200
    taken = _patch(client, shop2, rid, status="QUOTED", quoted_price="35000")
    assert taken.status_code == 409 and "Vườn Một" in taken.json()["detail"]
    assert _patch(client, admin, rid, status="ACCEPTED").status_code == 200


def test_customer_can_cancel_until_sourcing_starts(client: TestClient):
    shop1, _ = _seed(client)
    customer = _register(client, "kh@test.example")
    new_one = _request(client, customer, "Măng tây")
    cancelled = client.patch(f"{API}/product-requests/{new_one}", headers=customer, json={"status": "REJECTED"})
    assert cancelled.status_code == 200 and cancelled.json()["status"] == "REJECTED"
    assert cancelled.json()["admin_response"] == "Khách hàng hủy yêu cầu"

    other = _request(client, customer, "Su hào")
    _patch(client, shop1, other, status="ACCEPTED")
    too_late = client.patch(f"{API}/product-requests/{other}", headers=customer, json={"status": "REJECTED"})
    assert too_late.status_code == 409


def test_shop_links_only_its_own_products(client: TestClient):
    shop1, shop2 = _seed(client)
    customer = _register(client, "kh@test.example")
    rid = _request(client, customer)
    created = _patch(client, shop2, _request(client, customer, "Cà rốt"), status="FULFILLED", quoted_price="20000", stock_quantity="5", unit="kg").json()
    foreign = _patch(client, shop1, rid, status="FULFILLED", product_id=created["product_id"])
    assert foreign.status_code == 403
