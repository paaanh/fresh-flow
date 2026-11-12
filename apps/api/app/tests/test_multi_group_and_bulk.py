"""Bài cho nhiều nhóm + giá theo từng nhóm; danh mục cha/con, xóa danh mục; thêm & nhập kho hàng loạt."""
from decimal import Decimal

from fastapi.testclient import TestClient

from app.tests.test_api_flow import bearer, client  # noqa: F401  (pytest fixture)
from app.tests.test_inventory_conflicts import _groups
from app.tests.test_post_programs import _add_product, _customer_in, _info, _batch, _buy

API = "/api/v1"


def _admin(client):
    return bearer(client, "admin@test.example", "TestPassword123!")


def test_post_for_several_groups_with_price_per_group(client: TestClient):
    admin = _admin(client)
    _groups(client, admin, {"STUDENT": 5, "WORKING": 0, "ROYAL": 0})
    kale = _add_product(client, admin, "Cải kale", "40000", stock="50")
    student = _customer_in(client, admin, "sv@test.example", "STUDENT")
    worker = _customer_in(client, admin, "wk@test.example", "WORKING")
    royal = _customer_in(client, admin, "rc@test.example", "ROYAL")

    res = client.post(f"{API}/posts", headers=admin, json={
        "title": "Kale cho SV và người đi làm", "content": "x", "target_audience": "GROUP",
        "target_groups": ["STUDENT", "WORKING"],
        "items": [{"product_id": kale, "group_prices": {"STUDENT": "30000", "WORKING": "36000"}}],
    })
    assert res.status_code == 201, res.text
    post = res.json()
    assert post["target_groups"] == ["STUDENT", "WORKING"]

    # each group sees (and pays) its own price; other groups do not see the post
    assert Decimal(str(_info(client, student, post["id"], kale)["effective_price"])) == Decimal("30000")
    assert Decimal(str(_info(client, worker, post["id"], kale)["effective_price"])) == Decimal("36000")
    assert all(p["id"] != post["id"] for p in client.get(f"{API}/posts", headers=royal).json())
    order = _buy(client, student, _batch(client, admin, kale), 2, post["id"])
    assert order.status_code == 201, order.text
    assert Decimal(str(order.json()["items"][0]["unit_price"])) == Decimal("30000")
    assert _buy(client, royal, _batch(client, admin, kale), 1, post["id"]).status_code == 403

    # the manager gets the prices back to edit the post
    managed = next(p for p in client.get(f"{API}/posts", headers=admin).json() if p["id"] == post["id"])
    row = managed["products_info"][0]
    assert row["item_group_prices"] == {"STUDENT": 30000.0, "WORKING": 36000.0}
    assert row["group_prices"] == {"STUDENT": 30000.0, "WORKING": 36000.0}


def test_group_price_rules(client: TestClient):
    admin = _admin(client)
    _groups(client, admin, {"STUDENT": 5, "WORKING": 0})
    kale = _add_product(client, admin, "Cải kale", "40000")
    base = {"title": "Bài", "content": "x", "target_audience": "GROUP", "target_groups": ["STUDENT"]}
    too_high = client.post(f"{API}/posts", headers=admin, json={**base, "items": [{"product_id": kale, "group_prices": {"STUDENT": "45000"}}]})
    assert too_high.status_code == 422 and "giá gốc" in too_high.json()["detail"]
    outsider = client.post(f"{API}/posts", headers=admin, json={**base, "items": [{"product_id": kale, "group_prices": {"WORKING": "30000"}}]})
    assert outsider.status_code == 422
    none = client.post(f"{API}/posts", headers=admin, json={**base, "target_groups": [], "items": [{"product_id": kale}]})
    assert none.status_code == 422
    # "giảm tất cả theo %": no per-item price, the group % applies
    pct = client.post(f"{API}/posts", headers=admin, json={**base, "group_discounts": {"STUDENT": 20}, "items": [{"product_id": kale}]})
    assert pct.status_code == 201
    student = _customer_in(client, admin, "sv@test.example", "STUDENT")
    assert Decimal(str(_info(client, student, pct.json()["id"], kale)["effective_price"])) == Decimal("32000")


def test_category_tree_and_delete(client: TestClient):
    admin = _admin(client)
    veg = client.post(f"{API}/admin/categories", headers=admin, json={"name": "Rau củ"}).json()
    leafy = client.post(f"{API}/admin/categories", headers=admin, json={"name": "Rau lá", "parent_id": veg["id"]})
    assert leafy.status_code == 201 and leafy.json()["parent_id"] == veg["id"]
    leafy = leafy.json()
    herbs = client.post(f"{API}/admin/categories", headers=admin, json={"name": "Rau thơm", "parent_id": leafy["id"]}).json()
    # no cycles
    assert client.patch(f"{API}/admin/categories/{veg['id']}", headers=admin, json={"parent_id": herbs["id"]}).status_code == 422
    # a product in "Rau lá"; deleting "Rau lá" moves it and "Rau thơm" up to "Rau củ"
    prod = client.post(f"{API}/admin/products", headers=admin, json={"name": "Cải ngọt", "unit": "kg", "base_price": "20000", "category_id": leafy["id"]}).json()
    gone = client.delete(f"{API}/admin/categories/{leafy['id']}", headers=admin)
    assert gone.status_code == 200 and gone.json()["moved_products"] == 1
    cats = {c["id"]: c for c in client.get(f"{API}/categories").json()}
    assert leafy["id"] not in cats and cats[herbs["id"]]["parent_id"] == veg["id"]
    moved = next(p for p in client.get(f"{API}/products", headers=admin).json() if p["id"] == prod["id"])
    assert moved["category_id"] == veg["id"]
    # a top-level category that still has products is protected
    blocked = client.delete(f"{API}/admin/categories/{veg['id']}", headers=admin)
    assert blocked.status_code == 409 and "1 sản phẩm" in blocked.json()["detail"]
    # re-creating a deleted name brings it back
    again = client.post(f"{API}/admin/categories", headers=admin, json={"name": "Rau lá", "parent_id": veg["id"]})
    assert again.status_code == 201 and again.json()["id"] == leafy["id"]


def test_bulk_create_and_bulk_receive(client: TestClient):
    admin = _admin(client)
    res = client.post(f"{API}/admin/products/bulk", headers=admin, json={"items": [
        {"name": "Dưa leo", "unit": "kg", "base_price": "18000", "initial_stock": "40", "category_id": 1},
        {"name": "Bí đỏ", "unit": "kg", "base_price": "22000", "initial_stock": "0"},
        {"name": "Ớt chuông", "unit": "kg", "base_price": "60000", "initial_stock": "12.5"},
    ]})
    assert res.status_code == 201, res.text
    made = {p["name"]: p for p in res.json()}
    assert Decimal(str(made["Dưa leo"]["available_quantity"])) == Decimal("40")
    # duplicates are refused and nothing is created
    dup = client.post(f"{API}/admin/products/bulk", headers=admin, json={"items": [
        {"name": "Su su", "base_price": "10000"}, {"name": "su su", "base_price": "10000"}]})
    assert dup.status_code == 422
    assert all(p["name"] != "Su su" for p in client.get(f"{API}/products", headers=admin).json())

    rec = client.post(f"{API}/admin/inventory/receive", headers=admin, json={"items": [
        {"product_id": made["Dưa leo"]["id"], "quantity": "10"},
        {"product_id": made["Bí đỏ"]["id"], "quantity": "25"},
    ]})
    assert rec.status_code == 201 and rec.json()["received"] == 2
    after = {p["id"]: p for p in client.get(f"{API}/products", headers=admin).json()}
    assert Decimal(str(after[made["Dưa leo"]["id"]]["available_quantity"])) == Decimal("50")
    assert Decimal(str(after[made["Bí đỏ"]["id"]]["available_quantity"])) == Decimal("25")


def test_post_description_html_is_cleaned(client: TestClient):
    admin = _admin(client)
    res = client.post(f"{API}/posts", headers=admin, json={
        "title": "Mô tả có định dạng",
        "content": '<p onclick="x()">Rau <strong>tươi</strong></p><script>alert(1)</script><a href="javascript:alert(1)">x</a><ul><li>Sạch</li></ul>',
    })
    assert res.status_code == 201, res.text
    html = res.json()["content"]
    assert "<strong>tươi</strong>" in html and "<ul><li>Sạch</li></ul>" in html
    assert "script" not in html and "onclick" not in html and "javascript:" not in html


def test_post_accepts_url_encoded_product_photo(client: TestClient, tmp_path, monkeypatch):
    """Product photos are served URL-encoded (Vietnamese folder names); a post must accept them."""
    from app.modules.posts import router as posts_router

    folder = tmp_path / "products" / "Hoa quả"
    folder.mkdir(parents=True)
    (folder / "bơ.jfif").write_bytes(b"\xff\xd8\xff test")
    monkeypatch.setattr(posts_router, "UPLOAD_DIR", tmp_path)
    admin = _admin(client)
    res = client.post(f"{API}/posts", headers=admin, json={
        "title": "Ảnh mặt hàng", "content": "x", "image_urls": "/media/products/Hoa%20qu%E1%BA%A3/b%C6%A1.jfif",
    })
    assert res.status_code == 201, res.text
    missing = client.post(f"{API}/posts", headers=admin, json={"title": "Ảnh mất", "content": "x", "image_urls": "/media/products/kh%C3%B4ng-c%C3%B3.jpg"})
    assert missing.status_code == 422


def test_post_has_its_own_original_price(client: TestClient):
    admin = _admin(client)
    _groups(client, admin, {"STUDENT": 0})
    kale = _add_product(client, admin, "Cải kale", "40000", stock="20")
    student = _customer_in(client, admin, "sv@test.example", "STUDENT")
    res = client.post(f"{API}/posts", headers=admin, json={
        "title": "Giá gốc riêng", "content": "x", "target_audience": "GROUP", "target_groups": ["STUDENT"],
        "group_discounts": {"STUDENT": 10},
        "items": [{"product_id": kale, "list_price": "50000"}],
    })
    assert res.status_code == 201, res.text
    info = _info(client, student, res.json()["id"], kale)
    assert Decimal(str(info["base_price"])) == Decimal("50000")          # struck-through price in the post
    assert Decimal(str(info["effective_price"])) == Decimal("45000")     # 10% off the post's own original price
    # the product itself keeps its price
    product = next(p for p in client.get(f"{API}/products", headers=admin).json() if p["id"] == kale)
    assert Decimal(str(product["base_price"])) == Decimal("40000")
    # a group price above the post's original price is refused
    bad = client.post(f"{API}/posts", headers=admin, json={
        "title": "Sai", "content": "x", "target_audience": "GROUP", "target_groups": ["STUDENT"],
        "items": [{"product_id": kale, "list_price": "30000", "group_prices": {"STUDENT": "35000"}}],
    })
    assert bad.status_code == 422
