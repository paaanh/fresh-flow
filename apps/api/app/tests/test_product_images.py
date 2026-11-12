"""Automatic product photos: accents matter, a wrong photo is worse than none."""
from app.models import Product
from app.modules.catalog import service


def _fake_library(monkeypatch, names):
    rows = [(f"/media/products/{n}.jpg", service._normalize_media_name(n), "products", service._accented_name(n)) for n in names]
    monkeypatch.setattr(service, "_get_media_candidates", lambda: rows)


def _photo(name):
    return service.product_image_url(Product(name=name, image_url=None))


def test_accents_and_compound_words(monkeypatch):
    _fake_library(monkeypatch, ["dứa", "dưa chuột", "cà rốt", "bí đỏ", "cam", "đậu hà lan"])
    assert _photo("Dứa") == "/media/products/dứa.jpg"
    assert _photo("Dưa leo") == "/media/products/dưa chuột.jpg"     # synonym, not "dứa"
    assert _photo("Bi do") == "/media/products/bí đỏ.jpg"           # typed without accents
    assert _photo("Bí đỏ hồ lô") == "/media/products/bí đỏ.jpg"
    assert _photo("Cam sành") == "/media/products/cam.jpg"          # one-syllable photo is safe
    assert _photo("Cà chua bi") is None                              # not "cà rốt"
    assert _photo("Đậu bắp") is None                                 # not "đậu hà lan"
