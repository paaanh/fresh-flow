"""Inventory reservation, stock conflicts between orders, Sale pricing and shipper hand-over."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.core.security import hash_password
from app.models import User
from app.tests.test_api_flow import bearer, client  # noqa: F401  (pytest fixture)

API = "/api/v1"


def _register(client: TestClient, email: str) -> dict[str, str]:
    res = client.post(f"{API}/auth/register", json={"email": email, "full_name": "Khách Test", "password": "CustomerPass123!"})
    assert res.status_code == 201, res.text
    return bearer(client, email, "CustomerPass123!")


def _make_shipper(client: TestClient) -> dict[str, str]:
    from app.db import get_db
    from app.main import app

    gen = app.dependency_overrides[get_db]()
    db = next(gen)
    db.add(User(email="shipper@test.example", full_name="Shipper Test", password_hash=hash_password("ShipperPass123!"),
                role="SHIPPER", customer_group="STUDENT", phone="0900111222", is_active=True))
    db.commit()
    db.close()
    return bearer(client, "shipper@test.example", "ShipperPass123!")


def _groups(client, admin, discounts: dict[str, int]):
    for code, pct in discounts.items():
        res = client.post(f"{API}/admin/customer-groups", headers=admin, json={"code": code, "name": f"Nhóm {code}", "discount_percent": pct})
        assert res.status_code in (200, 201), res.text


def _order(client, headers, batch_id, qty, delivery="HOME"):
    res = client.post(f"{API}/orders", headers=headers, json={
        "items": [{"batch_id": batch_id, "quantity": str(qty)}],
        "delivery_type": delivery,
        "delivery_address": "12 Nguyễn Trãi, Hà Nội" if delivery == "HOME" else "",
        "recipient_name": "Người nhận", "recipient_phone": "0911222333",
    })
    assert res.status_code == 201, res.text
    return res.json()


def _product(client, admin):
    return client.get(f"{API}/products", headers=admin).json()[0]


def test_two_orders_cannot_overbook_and_shortage_options(client: TestClient):
    admin = bearer(client, "admin@test.example", "TestPassword123!")
    c1 = _register(client, "c1@test.example")
    c2 = _register(client, "c2@test.example")
    batch_id = client.get(f"{API}/admin/products/1/batches", headers=admin).json()[0]["id"]

    # Kho có 10, đơn 1 đặt 7, đơn 2 đặt 6 (tổng 13 > 10)
    o1 = _order(client, c1, batch_id, 7)
    o2 = _order(client, c2, batch_id, 6)

    overview = client.get(f"{API}/admin/inventory/overview", headers=admin).json()[0]
    assert Decimal(str(overview["pending_quantity"])) == Decimal("13")
    assert Decimal(str(overview["shortage_quantity"])) == Decimal("3")

    ok = client.patch(f"{API}/orders/{o1['id']}/status", headers=admin, json={"status": "CONFIRMED"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["inventory_state"] == "RESERVED"

    blocked = client.patch(f"{API}/orders/{o2['id']}/status", headers=admin, json={"status": "CONFIRMED"})
    assert blocked.status_code == 409
    assert client.get(f"{API}/orders/{o2['id']}", headers=admin).json()["status"] == "PENDING"

    product = _product(client, admin)
    assert Decimal(str(product["stock_quantity"])) == Decimal("10")
    assert Decimal(str(product["reserved_quantity"])) == Decimal("7")
    assert Decimal(str(product["available_quantity"])) == Decimal("3")

    check = client.get(f"{API}/orders/{o2['id']}/stock-check", headers=admin).json()
    assert check["can_fulfill"] is False
    assert Decimal(str(check["lines"][0]["shortage_quantity"])) == Decimal("3")

    # Chờ nhập hàng: đơn vẫn PENDING
    wait = client.post(f"{API}/orders/{o2['id']}/resolve-shortage", headers=admin, json={"action": "WAIT"})
    assert wait.status_code == 200 and wait.json()["status"] == "PENDING"

    # Giao một phần: 6 -> 3, tổng tiền tính lại
    partial = client.post(f"{API}/orders/{o2['id']}/resolve-shortage", headers=admin, json={"action": "PARTIAL"})
    assert partial.status_code == 200, partial.text
    body = partial.json()
    assert body["status"] == "CONFIRMED"
    assert Decimal(str(body["items"][0]["quantity"])) == Decimal("3")
    assert Decimal(str(body["subtotal"])) == Decimal("30.00")
    assert Decimal(str(_product(client, admin)["available_quantity"])) == Decimal("0")

    # Hủy đơn 1 => hoàn trả 7 giữ chỗ
    cancel = client.patch(f"{API}/orders/{o1['id']}/status", headers=admin, json={"status": "CANCELLED"})
    assert cancel.status_code == 200 and cancel.json()["inventory_state"] == "RELEASED"
    product = _product(client, admin)
    assert Decimal(str(product["reserved_quantity"])) == Decimal("3")
    assert Decimal(str(product["available_quantity"])) == Decimal("7")

    # Hủy lại lần nữa không được hoàn trả hai lần
    again = client.patch(f"{API}/orders/{o1['id']}/status", headers=admin, json={"status": "CANCELLED"})
    assert Decimal(str(_product(client, admin)["available_quantity"])) == Decimal("7")
    assert again.status_code in {200, 409}


def test_out_of_stock_resolution_cancels_order(client: TestClient):
    admin = bearer(client, "admin@test.example", "TestPassword123!")
    c1 = _register(client, "c1@test.example")
    batch_id = client.get(f"{API}/admin/products/1/batches", headers=admin).json()[0]["id"]
    order = _order(client, c1, batch_id, 4)
    res = client.post(f"{API}/orders/{order['id']}/resolve-shortage", headers=admin, json={"action": "OUT_OF_STOCK"})
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "CANCELLED"
    assert Decimal(str(_product(client, admin)["available_quantity"])) == Decimal("10")


@pytest.fixture
def file_db(monkeypatch, tmp_path):
    """Concurrency needs one DB connection per request (like production); the default
    fixture shares a single in-memory connection, which is not thread-safe."""
    monkeypatch.setenv("FRESHFLOW_TEST_DATABASE_URL", f"sqlite:///{tmp_path / 'concurrency.db'}")


def test_concurrent_confirmations_never_exceed_stock(file_db, client: TestClient):
    admin = bearer(client, "admin@test.example", "TestPassword123!")
    batch_id = client.get(f"{API}/admin/products/1/batches", headers=admin).json()[0]["id"]
    orders = [_order(client, _register(client, f"r{i}@test.example"), batch_id, 4) for i in range(4)]

    def confirm(order_id):
        return client.patch(f"{API}/orders/{order_id}/status", headers=admin, json={"status": "CONFIRMED"}).status_code

    with ThreadPoolExecutor(max_workers=4) as pool:
        codes = list(pool.map(confirm, [o["id"] for o in orders]))
    assert codes.count(200) == 2  # 2 x 4 = 8 <= 10, đơn thứ 3 sẽ vượt
    product = _product(client, admin)
    assert Decimal(str(product["reserved_quantity"])) == Decimal("8")
    assert Decimal(str(product["available_quantity"])) == Decimal("2")


def test_shipping_reduces_physical_stock_and_shipper_receives_central_orders(client: TestClient):
    admin = bearer(client, "admin@test.example", "TestPassword123!")
    shipper = _make_shipper(client)
    customer = _register(client, "c1@test.example")
    batch_id = client.get(f"{API}/admin/products/1/batches", headers=admin).json()[0]["id"]

    # Đơn giao tới điểm nhận tập trung (CENTRAL) – trước đây Shipper bị từ chối nhận
    order = _order(client, customer, batch_id, 3, delivery="PICKUP")
    assert order["delivery_type"] == "CENTRAL"

    # Chưa xác nhận thì không phân công được
    early = client.patch(f"{API}/orders/{order['id']}/assign-shipper", headers=admin, json={"shipper_id": 2})
    assert early.status_code in {409, 422}

    client.patch(f"{API}/orders/{order['id']}/status", headers=admin, json={"status": "CONFIRMED"})
    ready = client.patch(f"{API}/orders/{order['id']}/status", headers=admin, json={"status": "READY_FOR_PICKUP"})
    assert ready.status_code == 200, ready.text

    available = client.get(f"{API}/shipper/orders?available_only=true", headers=shipper).json()
    assert [o["id"] for o in available] == [order["id"]]
    assert available[0]["items"][0]["product_name_snapshot"] == "Táo"

    claim = client.patch(f"{API}/shipper/orders/{order['id']}/claim", headers=shipper)
    assert claim.status_code == 200, claim.text
    data = claim.json()
    assert data["shipper_name"] == "Shipper Test"
    assert data["recipient_phone"] == "0911222333"
    assert data["payment_method"] == "COD"

    picked = client.patch(f"{API}/shipper/orders/{order['id']}/pickup", headers=shipper)
    assert picked.status_code == 200, picked.text
    assert picked.json()["inventory_state"] == "SHIPPED"
    product = _product(client, admin)
    assert Decimal(str(product["stock_quantity"])) == Decimal("7")
    assert Decimal(str(product["reserved_quantity"])) == Decimal("0")
    assert Decimal(str(product["available_quantity"])) == Decimal("7")

    client.patch(f"{API}/shipper/orders/{order['id']}/delivering", headers=shipper)
    done = client.patch(f"{API}/shipper/orders/{order['id']}/complete", headers=shipper)
    assert done.status_code == 200 and done.json()["status"] == "COMPLETED"
    assert Decimal(str(_product(client, admin)["stock_quantity"])) == Decimal("7")


def test_sale_price_applies_to_new_orders_only(client: TestClient):
    admin = bearer(client, "admin@test.example", "TestPassword123!")
    customer = _register(client, "c1@test.example")
    batch_id = client.get(f"{API}/admin/products/1/batches", headers=admin).json()[0]["id"]
    before = _order(client, customer, batch_id, 1)
    client.patch(f"{API}/orders/{before['id']}/status", headers=admin, json={"status": "CONFIRMED"})

    bad = client.patch(f"{API}/admin/products/1", headers=admin, json={"sale_price": "12.00"})
    assert bad.status_code == 422  # Sale phải thấp hơn giá gốc

    now = datetime.now(timezone.utc)
    res = client.patch(f"{API}/admin/products/1", headers=admin, json={
        "sale_price": "6.00",
        "sale_start_at": (now - timedelta(hours=1)).isoformat(),
        "sale_end_at": (now + timedelta(days=1)).isoformat(),
    })
    assert res.status_code == 200, res.text
    assert res.json()["sale_status"] == "ACTIVE"

    catalog = client.get(f"{API}/catalog/me", headers=customer).json()[0]
    assert Decimal(str(catalog["customer_price"])) == Decimal("6.00")
    after = _order(client, customer, batch_id, 1)
    assert Decimal(str(after["items"][0]["unit_price"])) == Decimal("6.00")
    # Đơn đã xác nhận trước đó giữ nguyên giá
    assert Decimal(str(client.get(f"{API}/orders/{before['id']}", headers=admin).json()["items"][0]["unit_price"])) == Decimal("10.00")

    # Sale đã hết hạn thì quay về giá gốc
    client.patch(f"{API}/admin/products/1", headers=admin, json={
        "sale_start_at": (now - timedelta(days=3)).isoformat(),
        "sale_end_at": (now - timedelta(days=1)).isoformat(),
    })
    catalog = client.get(f"{API}/catalog/me", headers=customer).json()[0]
    assert catalog["sale_status"] == "EXPIRED"
    assert Decimal(str(catalog["customer_price"])) == Decimal("10.00")

    ended = client.patch(f"{API}/admin/products/1", headers=admin, json={"sale_price": None})
    assert ended.json()["sale_status"] == "NONE"


def test_fulfilled_request_puts_product_on_shelf(client: TestClient):
    admin = bearer(client, "admin@test.example", "TestPassword123!")
    customer = _register(client, "c1@test.example")
    req = client.post(f"{API}/product-requests", headers=customer, json={"product_name": "Bí xanh", "description": "2 kg"}).json()

    no_price = client.patch(f"{API}/admin/product-requests/{req['id']}", headers=admin, json={"status": "QUOTED"})
    assert no_price.status_code == 422
    quoted = client.patch(f"{API}/admin/product-requests/{req['id']}", headers=admin, json={"status": "QUOTED", "quoted_price": "50000"})
    assert quoted.status_code == 200
    accepted = client.patch(f"{API}/product-requests/{req['id']}", headers=customer, json={"status": "ACCEPTED"})
    assert accepted.status_code == 200, accepted.text
    done = client.patch(f"{API}/admin/product-requests/{req['id']}", headers=admin, json={"status": "FULFILLED", "stock_quantity": "20", "unit": "kg"})
    assert done.status_code == 200, done.text
    assert done.json()["linked_product_name"] == "Bí xanh"
    assert Decimal(str(done.json()["linked_product_available"])) == Decimal("20")

    reopened = client.patch(f"{API}/admin/product-requests/{req['id']}", headers=admin, json={"status": "REJECTED"})
    assert reopened.status_code == 409


def _ready_home_order(client, admin, customer, qty):
    batch_id = client.get(f"{API}/admin/products/1/batches", headers=admin).json()[0]["id"]
    order = _order(client, customer, batch_id, qty)
    client.patch(f"{API}/orders/{order['id']}/status", headers=admin, json={"status": "CONFIRMED"})
    client.patch(f"{API}/orders/{order['id']}/status", headers=admin, json={"status": "READY_FOR_PICKUP"})
    return order


def test_cancel_in_transit_returns_stock_but_not_after_delivery(client: TestClient):
    admin = bearer(client, "admin@test.example", "TestPassword123!")
    shipper = _make_shipper(client)
    customer = _register(client, "c1@test.example")

    o1 = _ready_home_order(client, admin, customer, 4)
    client.patch(f"{API}/shipper/orders/{o1['id']}/claim", headers=shipper)
    client.patch(f"{API}/shipper/orders/{o1['id']}/pickup", headers=shipper)
    assert Decimal(str(_product(client, admin)["stock_quantity"])) == Decimal("6")

    cancelled = client.patch(f"{API}/orders/{o1['id']}/status", headers=admin, json={"status": "CANCELLED", "note": "Khách từ chối nhận"})
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["inventory_state"] == "RETURNED"
    product = _product(client, admin)
    assert Decimal(str(product["stock_quantity"])) == Decimal("10")
    assert Decimal(str(product["available_quantity"])) == Decimal("10")

    # Đã giao thành công rồi mới hủy: hàng đang ở chỗ khách, không cộng lại tồn
    o2 = _ready_home_order(client, admin, customer, 3)
    client.patch(f"{API}/shipper/orders/{o2['id']}/claim", headers=shipper)
    client.patch(f"{API}/shipper/orders/{o2['id']}/pickup", headers=shipper)
    client.patch(f"{API}/shipper/orders/{o2['id']}/delivering", headers=shipper)
    client.patch(f"{API}/shipper/orders/{o2['id']}/complete", headers=shipper)
    client.patch(f"{API}/orders/{o2['id']}/status", headers=admin, json={"status": "CANCELLED"})
    assert Decimal(str(_product(client, admin)["stock_quantity"])) == Decimal("7")


def test_partial_prepaid_cod_is_not_overwritten_by_shipper(client: TestClient):
    admin = bearer(client, "admin@test.example", "TestPassword123!")
    shipper = _make_shipper(client)
    customer = _register(client, "c1@test.example")
    order = _ready_home_order(client, admin, customer, 2)
    total = Decimal(str(order["total"]))

    # Khách chuyển khoản trước 10.00
    pre = client.patch(f"{API}/orders/{order['id']}/payment", headers=admin, json={"paid_amount": "10.00", "payment_status": "PARTIAL"})
    assert pre.status_code == 200, pre.text

    client.patch(f"{API}/shipper/orders/{order['id']}/claim", headers=shipper)
    client.patch(f"{API}/shipper/orders/{order['id']}/pickup", headers=shipper)
    client.patch(f"{API}/shipper/orders/{order['id']}/delivering", headers=shipper)
    remaining = total - Decimal("10.00")
    done = client.patch(f"{API}/shipper/orders/{order['id']}/complete?paid_amount={remaining}", headers=shipper)
    assert done.status_code == 200, done.text
    body = done.json()
    assert Decimal(str(body["paid_amount"])) == total
    assert body["payment_status"] == "PAID"
    assert Decimal(str(body["debt_amount"])) == Decimal("0")
    assert Decimal(str(body["cash_collected_by_shipper"])) == remaining

    # Shipper thu thiếu: phần còn lại vẫn là công nợ, không mất khoản trả trước
    order2 = _ready_home_order(client, admin, customer, 1)
    client.patch(f"{API}/orders/{order2['id']}/payment", headers=admin, json={"paid_amount": "3.00", "payment_status": "PARTIAL"})
    for step in ("claim", "pickup", "delivering"):
        client.patch(f"{API}/shipper/orders/{order2['id']}/{step}", headers=shipper)
    short = client.patch(f"{API}/shipper/orders/{order2['id']}/complete?paid_amount=2.00", headers=shipper).json()
    assert Decimal(str(short["paid_amount"])) == Decimal("5.00")
    assert short["payment_status"] == "PARTIAL"
    assert Decimal(str(short["debt_amount"])) == Decimal(str(short["total"])) - Decimal("5.00")
    assert Decimal(str(short["cash_collected_by_shipper"])) == Decimal("2.00")
