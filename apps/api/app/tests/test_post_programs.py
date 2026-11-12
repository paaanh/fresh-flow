"""Newfeed — giá theo bài (phương án B), hạn mức mở bán, thích / bình luận, cột phụ."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi.testclient import TestClient

from app.tests.test_api_flow import bearer, client  # noqa: F401  (pytest fixture)
from app.tests.test_inventory_conflicts import _groups, _register

API = "/api/v1"


def _admin(client):
    return bearer(client, "admin@test.example", "TestPassword123!")


def _add_product(client, admin, name, price, stock="20"):
    prod = client.post(f"{API}/admin/products", headers=admin, json={"name": name, "unit": "kg", "base_price": price, "category_id": 1})
    assert prod.status_code == 201, prod.text
    pid = prod.json()["id"]
    client.post(f"{API}/admin/products/{pid}/batches", headers=admin, json={"batch_date": datetime.now(timezone.utc).isoformat(), "initial_quantity": stock})
    return pid


def _customer_in(client, admin, email, group):
    headers = _register(client, email)
    me = client.get(f"{API}/auth/me", headers=headers).json()
    client.patch(f"{API}/admin/users/{me['id']}", headers=admin, json={"customer_group": group})
    return headers


def _batch(client, admin, pid):
    return client.get(f"{API}/admin/products/{pid}/batches", headers=admin).json()[0]["id"]


def _buy(client, headers, batch, qty, post_id=None):
    line = {"batch_id": batch, "quantity": str(qty)}
    if post_id:
        line["post_id"] = post_id
    return client.post(f"{API}/orders", headers=headers, json={"items": [line], "delivery_type": "PICKUP"})


def _info(client, headers, post_id, product_id):
    post = next(p for p in client.get(f"{API}/posts", headers=headers).json() if p["id"] == post_id)
    return next(i for i in post["products_info"] if i["id"] == product_id)


def test_two_posts_sell_same_product_at_their_own_price(client: TestClient):
    admin = _admin(client)
    _groups(client, admin, {"STUDENT": 5, "ROYAL": 0})
    avocado = _add_product(client, admin, "Bơ sáp", "68000")
    student = _customer_in(client, admin, "sv@test.example", "STUDENT")
    royal = _customer_in(client, admin, "rc@test.example", "ROYAL")

    a = client.post(f"{API}/posts", headers=admin, json={
        "title": "Bài A", "content": "x", "target_audience": "ALL",
        "items": [{"product_id": avocado}], "group_discounts": {"STUDENT": 10, "ROYAL": 20},
    })
    b = client.post(f"{API}/posts", headers=admin, json={
        "title": "Bài B", "content": "x", "target_audience": "ALL",
        "items": [{"product_id": avocado, "sale_price": "50000"}], "group_discounts": {"STUDENT": 0, "ROYAL": 0},
    })
    assert a.status_code == 201 and b.status_code == 201, (a.text, b.text)
    a_id, b_id = a.json()["id"], b.json()["id"]

    # Mỗi bài giữ giá riêng — bài B không ghi đè bài A
    assert _info(client, student, a_id, avocado)["effective_price"] == 61200.0   # 68.000 × 0,9
    assert _info(client, royal, a_id, avocado)["effective_price"] == 54400.0     # 68.000 × 0,8
    assert _info(client, student, b_id, avocado)["effective_price"] == 50000.0   # Sale trong bài B
    assert _info(client, student, b_id, avocado)["on_sale"] is True

    # Bài đăng không ghi vào mặt hàng: catalog vẫn theo chính sách mặc định (-5% Sinh viên), không Sale
    cat = {p["id"]: p for p in client.get(f"{API}/catalog/me", headers=student).json()}[avocado]
    assert Decimal(str(cat["customer_price"])) == Decimal("64600.00") and cat["sale_status"] == "NONE"

    # Đơn qua bài tính đúng giá của bài; đơn từ cửa hàng tính giá catalog
    batch = _batch(client, admin, avocado)
    via_a = _buy(client, student, batch, 1, a_id).json()
    via_b = _buy(client, student, batch, 1, b_id).json()
    direct = _buy(client, student, batch, 1).json()
    assert Decimal(str(via_a["items"][0]["unit_price"])) == Decimal("61200")
    assert via_a["items"][0]["post_id"] == a_id
    assert Decimal(str(via_b["items"][0]["unit_price"])) == Decimal("50000")
    assert Decimal(str(direct["items"][0]["unit_price"])) == Decimal("64600.00")

    # Manager thấy giá từng nhóm của từng bài
    mgr = _info(client, admin, a_id, avocado)
    assert mgr["group_prices"]["STUDENT"] == 61200.0 and mgr["group_prices"]["ROYAL"] == 54400.0

    # Sửa % bài A không ảnh hưởng bài B
    client.patch(f"{API}/posts/{a_id}", headers=admin, json={
        "title": "Bài A", "content": "x", "target_audience": "ALL",
        "items": [{"product_id": avocado}], "group_discounts": {"STUDENT": 25, "ROYAL": 20},
    })
    assert _info(client, student, a_id, avocado)["effective_price"] == 51000.0
    assert _info(client, student, b_id, avocado)["effective_price"] == 50000.0


def test_post_quantity_limit_is_enforced_and_released(client: TestClient):
    admin = _admin(client)
    _groups(client, admin, {"STUDENT": 0})
    kale = _add_product(client, admin, "Cải kale", "39000", stock="50")
    student = _customer_in(client, admin, "sv@test.example", "STUDENT")

    too_many = client.post(f"{API}/posts", headers=admin, json={"title": "Kale", "content": "x", "items": [{"product_id": kale, "quantity_limit": "60"}]})
    assert too_many.status_code == 409  # vượt tồn kho
    bad_sale = client.post(f"{API}/posts", headers=admin, json={"title": "Kale", "content": "x", "items": [{"product_id": kale, "sale_price": "39000"}]})
    assert bad_sale.status_code == 422  # Sale phải thấp hơn giá chuẩn

    post = client.post(f"{API}/posts", headers=admin, json={"title": "Kale", "content": "x", "items": [{"product_id": kale, "quantity_limit": "5"}]}).json()
    batch = _batch(client, admin, kale)
    first = _buy(client, student, batch, 3, post["id"])
    assert first.status_code == 201, first.text
    info = _info(client, student, post["id"], kale)
    assert info["remaining_quantity"] == 2.0 and info["available_quantity"] == 2.0

    over = _buy(client, student, batch, 3, post["id"])
    assert over.status_code == 409 and "còn mở bán 2" in over.json()["detail"]

    # Hủy đơn -> trả hạn mức
    client.patch(f"{API}/orders/{first.json()['id']}/status", headers=admin, json={"status": "CANCELLED"})
    assert _info(client, student, post["id"], kale)["remaining_quantity"] == 5.0
    assert _buy(client, student, batch, 5, post["id"]).status_code == 201

    # Không thể hạ hạn mức xuống dưới số đã bán
    lower = client.patch(f"{API}/posts/{post['id']}", headers=admin, json={"title": "Kale", "content": "x", "items": [{"product_id": kale, "quantity_limit": "4"}]})
    assert lower.status_code == 422


def test_program_window_and_audience_apply_to_orders(client: TestClient):
    admin = _admin(client)
    _groups(client, admin, {"STUDENT": 0, "ROYAL": 0})
    kale = _add_product(client, admin, "Cải kale", "39000")
    student = _customer_in(client, admin, "sv@test.example", "STUDENT")
    royal = _customer_in(client, admin, "rc@test.example", "ROYAL")
    batch = _batch(client, admin, kale)
    now = datetime.now(timezone.utc)

    bad_window = client.post(f"{API}/posts", headers=admin, json={
        "title": "Sai giờ", "content": "x", "items": [{"product_id": kale}],
        "order_start_at": now.isoformat(), "order_end_at": (now - timedelta(hours=1)).isoformat(),
    })
    assert bad_window.status_code == 422

    upcoming = client.post(f"{API}/posts", headers=admin, json={
        "title": "Sắp mở", "content": "x", "items": [{"product_id": kale}],
        "order_start_at": (now + timedelta(days=1)).isoformat(),
    }).json()
    assert upcoming["program_status"] == "UPCOMING"
    assert _buy(client, student, batch, 1, upcoming["id"]).status_code == 409

    royal_only = client.post(f"{API}/posts", headers=admin, json={
        "title": "Chỉ Royal", "content": "x", "target_audience": "GROUP", "target_customer_group": "ROYAL",
        "items": [{"product_id": kale}], "group_discounts": {"ROYAL": 15},
    }).json()
    assert royal_only["id"] not in [p["id"] for p in client.get(f"{API}/posts", headers=student).json()]
    assert _buy(client, student, batch, 1, royal_only["id"]).status_code == 403
    ok = _buy(client, royal, batch, 1, royal_only["id"])
    assert ok.status_code == 201 and Decimal(str(ok.json()["items"][0]["unit_price"])) == Decimal("33150")  # 39.000 × 0,85

    # Ẩn bài: không mua qua bài được nữa, đơn cũ vẫn giữ liên kết
    assert client.delete(f"{API}/posts/{royal_only['id']}", headers=admin).status_code == 204
    assert _buy(client, royal, batch, 1, royal_only["id"]).status_code == 409


def test_likes_comments_pagination_and_sidebar(client: TestClient):
    admin = _admin(client)
    _groups(client, admin, {"STUDENT": 0})
    kale = _add_product(client, admin, "Cải kale", "39000")
    student = _customer_in(client, admin, "sv@test.example", "STUDENT")
    ids = [client.post(f"{API}/posts", headers=admin, json={"title": f"Bài {i}", "content": "x", "items": [{"product_id": kale, "sale_price": "30000"}]}).json()["id"] for i in range(3)]

    page = client.get(f"{API}/posts?limit=2&offset=0", headers=student)
    assert [p["id"] for p in page.json()] == ids[::-1][:2] and page.headers["X-Total-Count"] == "3"
    assert [p["id"] for p in client.get(f"{API}/posts?limit=2&offset=2", headers=student).json()] == [ids[0]]

    liked = client.post(f"{API}/posts/{ids[0]}/like", headers=student).json()
    assert liked == {"liked": True, "like_count": 1}
    post = next(p for p in client.get(f"{API}/posts", headers=student).json() if p["id"] == ids[0])
    assert post["like_count"] == 1 and post["liked_by_me"] is True
    assert client.post(f"{API}/posts/{ids[0]}/like", headers=student).json() == {"liked": False, "like_count": 0}

    c = client.post(f"{API}/posts/{ids[0]}/comments", headers=student, json={"content": "Hàng có tươi không shop?"})
    assert c.status_code == 201
    client.post(f"{API}/admin/moderation/terms?term=lừa đảo", headers=admin)
    assert client.post(f"{API}/posts/{ids[0]}/comments", headers=student, json={"content": "shop lừa đảo"}).status_code == 400
    comments = client.get(f"{API}/posts/{ids[0]}/comments", headers=student).json()
    assert [x["content"] for x in comments] == ["Hàng có tươi không shop?"]
    for i in range(2):
        client.post(f"{API}/posts/{ids[0]}/comments", headers=student, json={"content": f"Bình luận {i}"})
    feed_post = next(p for p in client.get(f"{API}/posts", headers=student).json() if p["id"] == ids[0])
    assert feed_post["comment_count"] == 3
    # 2 bình luận mới nhất hiện ngay dưới bài, theo thứ tự thời gian
    assert [c["content"] for c in feed_post["recent_comments"]] == ["Bình luận 0", "Bình luận 1"]
    other = _register(client, "other@test.example")
    assert client.delete(f"{API}/posts/{ids[0]}/comments/{c.json()['id']}", headers=other).status_code == 403
    assert client.delete(f"{API}/posts/{ids[0]}/comments/{c.json()['id']}", headers=student).status_code == 204

    batch = _batch(client, admin, kale)
    _buy(client, student, batch, 4, ids[1])
    side = client.get(f"{API}/posts/sidebar", headers=student).json()
    assert side["best_sellers"][0]["product_id"] == kale and side["best_sellers"][0]["sold"] == 4.0
    assert side["deals_for_you"][0]["product_id"] == kale and side["deals_for_you"][0]["price"] == 30000.0
    assert isinstance(side["top_shops"], list)


def test_upload_image_into_post(client: TestClient):
    admin = _admin(client)
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
    up = client.post(f"{API}/admin/products/images", headers=admin, files={"file": ("a.png", png, "image/png")})
    assert up.status_code == 201, up.text
    stored = up.json()["image_url"]
    try:
        bogus = client.post(f"{API}/posts", headers=admin, json={"title": "Ảnh", "content": "x", "product_ids": [1], "image_urls": "/media/products/uploads/khong-co.png"})
        assert bogus.status_code == 422
        ok = client.post(f"{API}/posts", headers=admin, json={"title": "Ảnh", "content": "x", "product_ids": [1], "image_urls": f"{stored},https://example.com/x.jpg"})
        assert ok.status_code == 201, ok.text
        assert ok.json()["image_urls"].split(",")[0] == stored
        assert ok.json()["product_ids"] == [1]  # product_ids cũ vẫn được nhận
        assert client.get(stored).status_code == 200
    finally:
        from pathlib import Path
        import app.main as main_module
        (Path(main_module.__file__).parent / stored.lstrip("/")).unlink(missing_ok=True)
