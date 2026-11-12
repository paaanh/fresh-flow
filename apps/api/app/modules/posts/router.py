"""Newfeed: bài đăng là một chương trình bán (giá theo bài), cùng thích, bình luận và cột phụ.

Giá được tính trong app.modules.posts.pricing — module dùng chung với tạo đơn hàng.
Bài đăng không ghi giá chuẩn, quy tắc giá nhóm hay Sale vào mặt hàng.
"""
import html as html_lib
import re
from urllib.parse import unquote
import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_admin_or_shop
from app.core.notifications import add_notification
from app.models import (
    Category,
    CustomerGroup,
    InventoryBatch,
    ModerationTerm,
    ModerationViolation,
    Order,
    OrderItem,
    Post,
    PostComment,
    PostItem,
    PostLike,
    Product,
    ProductReview,
    User,
)
from app.modules.posts import pricing
from app.modules.pricing.service import sale_status
from app.realtime import event, manager
from app.schemas import PostCommentIn, PostIn, PostItemIn, PostOut

router = APIRouter(prefix="/posts", tags=["Posts & Newfeed"])

MAX_POST_IMAGES = 10
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "media"
VN_TZ = timezone(timedelta(hours=7))


# --------------------------------------------------------------------------- validation
def _clean_image_urls(raw: str) -> str:
    """Keep only http(s) links and files that really exist in our media storage."""
    out: list[str] = []
    for url in (raw or "").replace("\n", ",").split(","):
        url = url.strip()
        if not url or url in out:
            continue
        if url.startswith("/media/"):
            # product photos come URL-encoded ("Hoa%20qu%E1%BA%A3/b%C6%A1.jfif"): check the real file name
            local = (UPLOAD_DIR / unquote(url[len("/media/"):].split("?")[0])).resolve()
            if UPLOAD_DIR.resolve() not in local.parents or not local.is_file():
                raise HTTPException(422, f"Ảnh {url} không tồn tại trên máy chủ, vui lòng tải lại")
        elif not (url.startswith("https://") or url.startswith("http://")):
            raise HTTPException(422, "Đường dẫn ảnh phải là http(s) hoặc ảnh đã tải lên hệ thống")
        if len(url) > 500:
            raise HTTPException(422, "Đường dẫn ảnh quá dài")
        out.append(url)
    if len(out) > MAX_POST_IMAGES:
        raise HTTPException(422, f"Mỗi bài đăng tối đa {MAX_POST_IMAGES} ảnh")
    return ",".join(out)


def _active_groups(db: Session) -> dict[str, CustomerGroup]:
    return {g.code: g for g in db.scalars(select(CustomerGroup).where(CustomerGroup.is_active == True)).all()}


_SCRIPT_RE = re.compile(r"<\s*(script|style|iframe|object|embed)\b[^>]*>.*?<\s*/\s*\1\s*>", re.I | re.S)
_TAG_RE = re.compile(r"<\s*/?\s*(script|style|iframe|object|embed|link|meta|img|svg)\b[^>]*>", re.I)
_EVENT_RE = re.compile(r"\s+on[a-z]+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", re.I)
_JS_URL_RE = re.compile(r"(href|src)\s*=\s*([\"']?)\s*(javascript|data|vbscript):[^\"'>\s]*\2", re.I)


def clean_post_html(html: str) -> str:
    """Defence in depth for the rich-text description (the web app also sanitises when displaying)."""
    html = _SCRIPT_RE.sub("", html or "")
    html = _TAG_RE.sub("", html)
    html = _EVENT_RE.sub("", html)
    return _JS_URL_RE.sub(r'\1="#"', html)


def _normalize_payload(db: Session, payload: PostIn) -> dict[str, Decimal]:
    """Chuẩn hóa đối tượng, ảnh, thời gian; trả về % chiết khấu theo nhóm hợp lệ của bài."""
    payload.content = clean_post_html(payload.content)
    # Mục "Bếp ăn / Tập thể" đã bỏ khỏi Newfeed: quy về ưu đãi riêng cho nhóm khách hàng
    if payload.target_audience == "COLLECTIVE":
        payload.target_audience = "GROUP"
        payload.target_customer_group = payload.target_customer_group or "COLLECTIVE"
    if payload.target_audience not in {"ALL", "GROUP", "INDIVIDUAL", "CUSTOM_GROUP"}:
        raise HTTPException(422, "Đối tượng khách hàng không hợp lệ")
    if payload.target_audience == "ALL":
        payload.target_customer_group = None
        payload.target_groups = []
    else:
        chosen = [g for g in (payload.target_groups or []) if g] or ([payload.target_customer_group] if payload.target_customer_group else [])
        payload.target_groups = list(dict.fromkeys(chosen))
        payload.target_customer_group = payload.target_groups[0] if payload.target_groups else None
    payload.image_urls = _clean_image_urls(payload.image_urls)

    start, end = pricing._utc(payload.order_start_at), pricing._utc(payload.order_end_at)
    if start and end and end <= start:
        raise HTTPException(422, "Thời gian kết thúc chương trình phải sau thời gian bắt đầu")

    groups = _active_groups(db)
    if payload.target_audience != "ALL":
        if not payload.target_groups:
            raise HTTPException(422, "Vui lòng chọn ít nhất một nhóm khách hàng cho bài đăng")
        unknown_targets = [g for g in payload.target_groups if g not in groups]
        if unknown_targets:
            raise HTTPException(422, f"Nhóm khách hàng không tồn tại: {', '.join(unknown_targets)}")
    if not payload.group_discounts:
        return {}
    unknown = [code for code in payload.group_discounts if code not in groups]
    if unknown:
        raise HTTPException(422, f"Nhóm khách hàng không tồn tại: {', '.join(unknown)}")
    if payload.target_audience != "ALL":
        return {g: payload.group_discounts[g] for g in payload.target_groups if g in payload.group_discounts}
    return dict(payload.group_discounts)


def _visible_text(text: str) -> str:
    """What a reader sees: HTML tags removed and entities decoded (&agrave; → à)."""
    return html_lib.unescape(re.sub(r"<[^>]+>", " ", text or ""))


def _check_moderation(db: Session, user: User, *texts: str) -> None:
    plain = [_visible_text(t).lower() for t in texts]
    for term in db.scalars(select(ModerationTerm.term).where(ModerationTerm.is_active == True)).all():
        if term and any(term.lower() in t for t in plain):
            db.add(ModerationViolation(user_id=user.id, matched_term=term))
            db.commit()
            raise HTTPException(400, f"Nội dung chứa từ khóa vi phạm tiêu chuẩn cộng đồng: {term}")


# --------------------------------------------------------------------------- products of a post
def _create_inline_products(db: Session, payload: PostIn, user: User) -> list[int]:
    """Mặt hàng mới tạo kèm bài (giữ cho client cũ). Chỉ tạo mặt hàng + lô tồn, không đặt giá nhóm."""
    created: list[int] = []
    first_image = next((u.strip() for u in (payload.image_urls or "").split(",") if u.strip()), None)
    for np in payload.new_products or []:
        name = str(np.get("name") or "").strip()
        if len(name) < 2:
            continue
        cat_name = str(np.get("category") or np.get("category_name") or "Nông sản").strip() or "Nông sản"
        cat = db.get(Category, int(np["category_id"])) if np.get("category_id") else None
        cat = cat or db.scalar(select(Category).where(Category.name == cat_name))
        if not cat:
            cat = Category(name=cat_name, is_active=True)
            db.add(cat)
            db.flush()
        prod = Product(
            category_id=cat.id,
            shop_id=user.id if user.role == "SHOP" else np.get("shop_id"),
            name=name,
            description=str(np.get("description") or payload.title).strip(),
            unit=str(np.get("unit") or "kg").strip() or "kg",
            base_price=Decimal(str(np.get("base_price") or np.get("price") or 35000)),
            image_url=str(np.get("image_url") or "").strip() or first_image,
            is_active=True,
        )
        db.add(prod)
        db.flush()
        stock = Decimal(str(np.get("initial_stock") or np.get("stock") or 0))
        if stock > 0:
            db.add(InventoryBatch(product_id=prod.id, batch_date=datetime.now(timezone.utc), initial_quantity=stock,
                                  approved_quantity=Decimal("0"), is_open=True))
        created.append(prod.id)
    db.flush()
    return created


def _save_items(db: Session, post: Post, payload: PostIn, user: User, created_ids: list[int]) -> list[int]:
    """Lưu danh sách mặt hàng của chương trình (hạn mức, giá Sale trong bài, thứ tự)."""
    specs: list[PostItemIn] = list(payload.items) or [
        PostItemIn(product_id=int(pid)) for pid in ([payload.product_id] if payload.product_id else []) + list(payload.product_ids or []) if pid
    ]
    specs += [PostItemIn(product_id=pid) for pid in created_ids]
    seen: set[int] = set()
    specs = [s for s in specs if not (s.product_id in seen or seen.add(s.product_id))]

    existing = {it.product_id: it for it in db.scalars(select(PostItem).where(PostItem.post_id == post.id)).all()} if post.id else {}
    ordered: list[int] = []
    for position, spec in enumerate(specs):
        product = db.get(Product, spec.product_id)
        if not product or not product.is_active:
            raise HTTPException(422, f"Mặt hàng #{spec.product_id} không tồn tại hoặc đã ngừng bán")
        if user.role == "SHOP" and product.shop_id not in (None, user.id):
            raise HTTPException(403, f"Không thể đăng mặt hàng của Shop khác: {product.name}")
        list_price = spec.list_price or product.base_price
        if spec.sale_price is not None and spec.sale_price >= list_price:
            raise HTTPException(422, f"Giá Sale của {product.name} phải thấp hơn giá gốc {list_price:,.0f}đ")
        allowed_groups = set(payload.target_groups) if payload.target_audience != "ALL" else set(_active_groups(db))
        for code, price in (spec.group_prices or {}).items():
            if code not in allowed_groups:
                raise HTTPException(422, f"{product.name}: nhóm {code} không thuộc đối tượng của bài")
            if price > list_price:
                raise HTTPException(422, f"{product.name}: giá cho nhóm {code} không được cao hơn giá gốc {list_price:,.0f}đ")
        item = existing.pop(product.id, None) or PostItem(post_id=post.id, product_id=product.id, sold_quantity=Decimal("0"))
        sold = Decimal(item.sold_quantity or 0)
        if spec.quantity_limit is not None:
            if spec.quantity_limit < sold:
                raise HTTPException(422, f"{product.name}: hạn mức không thể thấp hơn số đã bán qua bài ({sold:g})")
            stock = pricing.available_stock(db, product.id)
            if spec.quantity_limit - sold > stock:
                raise HTTPException(409, f"{product.name}: mở bán thêm {spec.quantity_limit - sold:g} vượt tồn kho khả dụng ({stock:g})")
        item.quantity_limit = spec.quantity_limit
        item.sale_price = spec.sale_price
        item.group_prices = json.dumps({k: float(v) for k, v in spec.group_prices.items()}) if spec.group_prices else ""
        item.list_price = spec.list_price
        item.position = position
        if item.id is None:
            db.add(item)
        ordered.append(product.id)
    for leftover in existing.values():
        db.delete(leftover)
    db.flush()

    post.product_ids = json.dumps(ordered) if ordered else ""
    post.product_id = ordered[0] if ordered else None
    limits = [s.quantity_limit for s in specs]
    post.quantity_limit = sum(limits, Decimal("0")) if limits and all(l is not None for l in limits) else None
    return ordered


# --------------------------------------------------------------------------- serialization
def _legacy_ids(post: Post) -> list[int]:
    ids: list[int] = []
    try:
        for x in json.loads(post.product_ids or "[]"):
            if int(x) > 0 and int(x) not in ids:
                ids.append(int(x))
    except Exception:
        pass
    if post.product_id and post.product_id not in ids:
        ids.insert(0, post.product_id)
    return ids


def serialize_posts(db: Session, posts: list[Post], user: User | None) -> list[PostOut]:
    """Serialize many posts with a constant number of queries."""
    if not posts:
        return []
    post_ids = [p.id for p in posts]
    items_by_post: dict[int, list[PostItem]] = {}
    for it in db.scalars(select(PostItem).where(PostItem.post_id.in_(post_ids)).order_by(PostItem.position, PostItem.id)).all():
        items_by_post.setdefault(it.post_id, []).append(it)
    for p in posts:  # bài cũ chưa có post_items: hiển thị theo product_ids (không hạn mức)
        if p.id not in items_by_post:
            items_by_post[p.id] = [PostItem(post_id=p.id, product_id=pid, sold_quantity=Decimal("0")) for pid in _legacy_ids(p)]

    product_ids = {it.product_id for items in items_by_post.values() for it in items}
    products = {p.id: p for p in db.scalars(select(Product).where(Product.id.in_(product_ids))).all()} if product_ids else {}
    categories = {c.id: c.name for c in db.scalars(select(Category)).all()}
    stock: dict[int, Decimal] = {}
    if product_ids:
        for b in db.scalars(select(InventoryBatch).where(InventoryBatch.product_id.in_(product_ids), InventoryBatch.is_open == True)).all():
            stock[b.product_id] = stock.get(b.product_id, Decimal("0")) + b.available_quantity
    authors = {u.id: u for u in db.scalars(select(User).where(User.id.in_({p.author_id for p in posts}))).all()}
    likes = dict(db.execute(select(PostLike.post_id, func.count()).where(PostLike.post_id.in_(post_ids)).group_by(PostLike.post_id)).all())
    comments = dict(db.execute(select(PostComment.post_id, func.count()).where(PostComment.post_id.in_(post_ids)).group_by(PostComment.post_id)).all())
    mine = set(db.scalars(select(PostLike.post_id).where(PostLike.post_id.in_(post_ids), PostLike.user_id == user.id)).all()) if user else set()
    # 2 bình luận mới nhất mỗi bài (trang chỉ có ~10 bài nên 1 truy vấn nhỏ / bài)
    recent: dict[int, list[PostComment]] = {}
    for pid in post_ids:
        if comments.get(pid):
            rows = db.scalars(
                select(PostComment).where(PostComment.post_id == pid).order_by(PostComment.created_at.desc(), PostComment.id.desc()).limit(2)
            ).all()
            recent[pid] = list(reversed(rows))
    commenter_ids = {c.user_id for rows in recent.values() for c in rows}
    commenters = {u.id: u for u in db.scalars(select(User).where(User.id.in_(commenter_ids))).all()} if commenter_ids else {}
    defaults = pricing.active_group_defaults(db)
    is_customer = bool(user and user.role == "CUSTOMER")

    out: list[PostOut] = []
    for post in posts:
        groups_of_post = pricing.post_groups(post)
        single = len(groups_of_post) == 1
        viewer_group = user.customer_group if is_customer else (groups_of_post[0] if single else None)
        manager_groups = groups_of_post if post.target_audience != "ALL" else list(defaults)
        discounts = pricing.parse_discounts(post.group_discounts)
        info: list[dict] = []
        for it in items_by_post.get(post.id, []):
            prod = products.get(it.product_id)
            if not prod:
                continue
            price = pricing.item_price(post, it, prod, viewer_group, defaults)
            remaining = pricing.remaining_quota(it)
            in_stock = stock.get(prod.id, Decimal("0"))
            buyable = in_stock if remaining is None else min(in_stock, remaining)
            row = {
                "id": prod.id,
                "name": prod.name,
                "unit": prod.unit,
                "category_name": categories.get(prod.category_id, "Nông sản"),
                "image_url": prod.image_url or "",
                "base_price": float(price["base_price"]),
                "list_price": float(price["group_price"]),
                "effective_price": float(price["final_price"]),
                "sale_price": float(price["final_price"]),
                "price_source": price["source"],
                "on_sale": price["on_sale"],
                "sale_percent": price["saving_percent"],
                "group_discount": float(price["group_discount"]),
                "post_sale_price": float(it.sale_price) if it.sale_price is not None else None,
                "product_sale_price": float(prod.sale_price) if prod.sale_price is not None else None,
                "sale_status": sale_status(prod),
                "quantity_limit": float(it.quantity_limit) if it.quantity_limit is not None else None,
                "sold_quantity": float(it.sold_quantity or 0),
                "remaining_quantity": float(remaining) if remaining is not None else None,
                "stock_quantity": float(in_stock),
                "available_quantity": float(max(Decimal("0"), buyable)),
            }
            if is_customer:
                row["group_prices"] = {viewer_group: float(price["final_price"])}
            else:
                row["group_prices"] = {
                    code: float(pricing.item_price(post, it, prod, code, defaults)["final_price"]) for code in manager_groups if code
                }
                # Giá đặt tay theo nhóm (để mở lại form sửa bài)
                row["item_group_prices"] = {k: float(v) for k, v in pricing.item_group_prices(it).items()}
                row["item_list_price"] = float(it.list_price) if getattr(it, "list_price", None) else None
                row["product_base_price"] = float(prod.base_price)
            info.append(row)

        author = authors.get(post.author_id)
        out.append(PostOut(
            id=post.id,
            author_id=post.author_id,
            author_name=author.full_name if author else None,
            author_avatar_url=author.avatar_url if author else None,
            shop_name=(author.shop_name or author.full_name) if author else None,
            title=post.title,
            content=post.content,
            post_type=post.post_type,
            product_id=info[0]["id"] if info else post.product_id,
            product_ids=[r["id"] for r in info],
            products_info=info,
            product_name=info[0]["name"] if info else None,
            image_urls=post.image_urls,
            quantity_limit=post.quantity_limit,
            target_audience=post.target_audience,
            target_customer_group=post.target_customer_group,
            target_groups=([user.customer_group] if is_customer and user.customer_group in groups_of_post else ([] if is_customer else groups_of_post)),
            original_price=None,
            sale_price=post.sale_price,
            effective_price=min((Decimal(str(r["effective_price"])) for r in info), default=None),
            # Khách hàng không nhận bảng giá cũ hay chiết khấu của nhóm khác
            group_prices="" if is_customer else (post.group_prices or ""),
            group_discounts=(
                ({user.customer_group: float(discounts[user.customer_group])} if user.customer_group in discounts else {})
                if is_customer
                else {k: float(v) for k, v in discounts.items()}
            ),
            order_start_at=post.order_start_at,
            order_end_at=post.order_end_at,
            delivery_time_text=post.delivery_time_text,
            is_active=post.is_active,
            created_at=post.created_at,
            program_status=pricing.program_status(post),
            like_count=int(likes.get(post.id, 0)),
            liked_by_me=post.id in mine,
            comment_count=int(comments.get(post.id, 0)),
            recent_comments=[_comment_out(c, commenters.get(c.user_id)) for c in recent.get(post.id, [])],
        ))
    return out


def to_post_out(post: Post, db: Session, user: User | None = None) -> PostOut:
    return serialize_posts(db, [post], user)[0]


def _visible_post(db: Session, post_id: int, user: User) -> Post:
    post = db.get(Post, post_id)
    if not post or not post.is_active:
        raise HTTPException(404, "Không tìm thấy bài đăng")
    if user.role == "CUSTOMER" and not pricing.audience_allows(post, user.customer_group):
        raise HTTPException(404, "Không tìm thấy bài đăng")
    return post


# --------------------------------------------------------------------------- feed
@router.get("", response_model=list[PostOut])
def list_posts(
    response: Response,
    category_id: int | None = Query(default=None),
    shop_id: int | None = Query(default=None),
    post_type: str | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = select(Post).where(Post.is_active == True).order_by(Post.created_at.desc(), Post.id.desc())
    if post_type:
        query = query.where(Post.post_type == post_type)
    if shop_id:
        query = query.where(Post.author_id == shop_id)
    if category_id:
        query = query.join(Product, Post.product_id == Product.id).where(Product.category_id == category_id)
    posts = db.scalars(query).all()
    if user.role == "CUSTOMER":
        posts = [p for p in posts if pricing.audience_allows(p, user.customer_group)]
    response.headers["X-Total-Count"] = str(len(posts))
    page = posts[offset: offset + limit] if limit else posts[offset:]
    return serialize_posts(db, page, user)


@router.get("/sidebar")
def feed_sidebar(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Cột phụ Newfeed: bán chạy, ưu đãi dành cho bạn, cửa hàng uy tín — tính từ dữ liệu thật."""
    now_vn = datetime.now(VN_TZ)
    day_start = now_vn.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)

    def best_sellers(since: datetime):
        rows = db.execute(
            select(OrderItem.product_id, func.sum(OrderItem.quantity).label("qty"))
            .join(Order, Order.id == OrderItem.order_id)
            .where(Order.created_at >= since, Order.status.notin_(["CANCELLED", "REJECTED"]))
            .group_by(OrderItem.product_id)
            .order_by(func.sum(OrderItem.quantity).desc())
            .limit(5)
        ).all()
        return rows

    period = "TODAY"
    rows = best_sellers(day_start)
    if not rows:
        period = "7_DAYS"
        rows = best_sellers(day_start - timedelta(days=7))
    prods = {p.id: p for p in db.scalars(select(Product).where(Product.id.in_([r[0] for r in rows]))).all()} if rows else {}
    best = [
        {"product_id": pid, "name": prods[pid].name, "unit": prods[pid].unit, "image_url": prods[pid].image_url or "", "sold": float(qty)}
        for pid, qty in rows
        if pid in prods and prods[pid].is_active
    ]

    # Ưu đãi dành cho bạn: mặt hàng trong các bài đang chạy mà người xem mua được rẻ hơn giá chuẩn
    visible = [p for p in db.scalars(select(Post).where(Post.is_active == True).order_by(Post.created_at.desc()).limit(50)).all()
               if pricing.program_status(p) == "ACTIVE" and (user.role != "CUSTOMER" or pricing.audience_allows(p, user.customer_group))]
    deals: list[dict] = []
    for post_out in serialize_posts(db, visible, user):
        for info in post_out.products_info:
            if info["sale_percent"] > 0 and info["available_quantity"] > 0:
                deals.append({"post_id": post_out.id, "post_title": post_out.title, "product_id": info["id"], "name": info["name"],
                              "unit": info["unit"], "image_url": info["image_url"], "price": info["effective_price"],
                              "base_price": info["base_price"], "saving_percent": info["sale_percent"], "on_sale": info["on_sale"]})
    best_deal: dict[int, dict] = {}
    for d in deals:
        if d["product_id"] not in best_deal or d["price"] < best_deal[d["product_id"]]["price"]:
            best_deal[d["product_id"]] = d
    deals = sorted(best_deal.values(), key=lambda d: d["saving_percent"], reverse=True)[:5]

    # Cửa hàng uy tín: nhiều đơn hoàn thành, điểm đánh giá trung bình cao
    completed = dict(db.execute(
        select(Order.shop_id, func.count()).where(Order.status == "COMPLETED", Order.shop_id.isnot(None)).group_by(Order.shop_id)
    ).all())
    ratings = {
        shop_id: (float(avg), int(cnt))
        for shop_id, avg, cnt in db.execute(
            select(Product.shop_id, func.avg(ProductReview.rating), func.count(ProductReview.id))
            .join(Product, Product.id == ProductReview.product_id)
            .where(ProductReview.is_hidden == False, Product.shop_id.isnot(None))
            .group_by(Product.shop_id)
        ).all()
    }
    shops = db.scalars(select(User).where(User.role == "SHOP", User.is_active == True)).all()
    top_shops = sorted(
        (
            {"shop_id": s.id, "name": s.shop_name or s.full_name, "avatar_url": s.avatar_url,
             "completed_orders": int(completed.get(s.id, 0)),
             "rating": round(ratings.get(s.id, (0.0, 0))[0], 1), "review_count": ratings.get(s.id, (0.0, 0))[1]}
            for s in shops
        ),
        key=lambda s: (s["completed_orders"], s["rating"]),
        reverse=True,
    )[:5]
    return {"best_sellers": best, "best_sellers_period": period, "deals_for_you": deals, "top_shops": top_shops}


@router.post("", response_model=PostOut, status_code=201)
async def create_post(payload: PostIn, db: Session = Depends(get_db), user: User = Depends(require_admin_or_shop)):
    _check_moderation(db, user, payload.title, payload.content)
    discounts = _normalize_payload(db, payload)
    post = Post(
        author_id=user.id,
        title=payload.title,
        content=payload.content,
        post_type=payload.post_type,
        image_urls=payload.image_urls,
        target_audience=payload.target_audience,
        target_customer_group=payload.target_customer_group,
        target_groups=json.dumps(payload.target_groups) if payload.target_groups else "",
        sale_price=payload.sale_price,
        group_prices=payload.group_prices,
        group_discounts=json.dumps({k: float(v) for k, v in discounts.items()}) if discounts else "",
        order_start_at=payload.order_start_at,
        order_end_at=payload.order_end_at,
        delivery_time_text=payload.delivery_time_text,
        is_active=True,
    )
    db.add(post)
    db.flush()
    created = _create_inline_products(db, payload, user)
    ids = _save_items(db, post, payload, user, created)
    db.commit()
    db.refresh(post)
    await manager.broadcast(event("post.created", {"post_id": post.id, "product_ids": ids}))
    if created:
        await manager.broadcast(event("inventory.updated", {"product_ids": created}))
    return to_post_out(post, db, user)


@router.patch("/{post_id}", response_model=PostOut)
async def update_post(post_id: int, payload: PostIn, db: Session = Depends(get_db), user: User = Depends(require_admin_or_shop)):
    post = db.get(Post, post_id)
    if not post or not post.is_active:
        raise HTTPException(404, "Không tìm thấy bài đăng")
    if user.role != "ADMIN" and post.author_id != user.id:
        raise HTTPException(403, "Bạn không có quyền sửa bài đăng này")
    _check_moderation(db, user, payload.title, payload.content)
    discounts = _normalize_payload(db, payload)
    created = _create_inline_products(db, payload, user)
    ids = _save_items(db, post, payload, user, created)
    post.title = payload.title
    post.content = payload.content
    post.post_type = payload.post_type
    post.image_urls = payload.image_urls
    post.target_audience = payload.target_audience
    post.target_customer_group = payload.target_customer_group
    post.target_groups = json.dumps(payload.target_groups) if payload.target_groups else ""
    if payload.sale_price is not None:
        post.sale_price = payload.sale_price
    if payload.group_prices:
        post.group_prices = payload.group_prices
    post.group_discounts = json.dumps({k: float(v) for k, v in discounts.items()}) if discounts else ""
    post.order_start_at = payload.order_start_at
    post.order_end_at = payload.order_end_at
    post.delivery_time_text = payload.delivery_time_text
    db.commit()
    db.refresh(post)
    await manager.broadcast(event("post.updated", {"post_id": post.id, "product_ids": ids}))
    return to_post_out(post, db, user)


@router.delete("/{post_id}", status_code=204)
def delete_post(post_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin_or_shop)):
    post = db.get(Post, post_id)
    if not post or not post.is_active:
        raise HTTPException(404, "Không tìm thấy bài đăng")
    if user.role != "ADMIN" and post.author_id != user.id:
        raise HTTPException(403, "Bạn không có quyền xóa bài đăng này")
    # Ẩn bài thay vì xóa cứng: đơn hàng đã mua qua bài vẫn giữ liên kết tới chương trình
    post.is_active = False
    db.commit()


# --------------------------------------------------------------------------- likes & comments
@router.post("/{post_id}/like")
async def toggle_like(post_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    post = _visible_post(db, post_id, user)
    existing = db.scalar(select(PostLike).where(PostLike.post_id == post.id, PostLike.user_id == user.id))
    if existing:
        db.delete(existing)
        liked = False
    else:
        db.add(PostLike(post_id=post.id, user_id=user.id))
        liked = True
    db.commit()
    count = db.scalar(select(func.count()).select_from(PostLike).where(PostLike.post_id == post.id)) or 0
    await manager.broadcast(event("post.updated", {"post_id": post.id}))
    return {"liked": liked, "like_count": int(count)}


def _comment_out(c: PostComment, author: User | None) -> dict:
    return {
        "id": c.id,
        "post_id": c.post_id,
        "user_id": c.user_id,
        "author_name": (author.shop_name or author.full_name) if author else "Người dùng",
        "author_role": author.role if author else None,
        # Customers' group is shown next to their name, so a seller knows which price tier is asking
        "author_group": author.customer_group if author and author.role == "CUSTOMER" else None,
        "author_avatar_url": author.avatar_url if author else None,
        "content": c.content,
        "created_at": c.created_at,
    }


@router.get("/{post_id}/comments")
def list_comments(post_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    post = _visible_post(db, post_id, user)
    rows = db.scalars(select(PostComment).where(PostComment.post_id == post.id).order_by(PostComment.created_at, PostComment.id)).all()
    authors = {u.id: u for u in db.scalars(select(User).where(User.id.in_({c.user_id for c in rows}))).all()} if rows else {}
    return [_comment_out(c, authors.get(c.user_id)) for c in rows]


@router.post("/{post_id}/comments", status_code=201)
async def add_comment(post_id: int, payload: PostCommentIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    post = _visible_post(db, post_id, user)
    content = payload.content.strip()
    if not content:
        raise HTTPException(422, "Nội dung bình luận không được để trống")
    _check_moderation(db, user, content)
    comment = PostComment(post_id=post.id, user_id=user.id, content=content)
    db.add(comment)
    if post.author_id != user.id:
        add_notification(db, post.author_id, f"Bình luận mới: {post.title}", f"{user.full_name}: {content[:140]}", "post.comment", link="/newfeed")
    db.commit()
    db.refresh(comment)
    await manager.send_user(post.author_id, event("notification.created", {"event_type": "post.comment", "post_id": post.id}))
    await manager.broadcast(event("post.updated", {"post_id": post.id}))
    return _comment_out(comment, user)


@router.delete("/{post_id}/comments/{comment_id}", status_code=204)
async def delete_comment(post_id: int, comment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    comment = db.get(PostComment, comment_id)
    if not comment or comment.post_id != post_id:
        raise HTTPException(404, "Không tìm thấy bình luận")
    post = db.get(Post, post_id)
    if not (user.role == "ADMIN" or comment.user_id == user.id or (post and post.author_id == user.id)):
        raise HTTPException(403, "Bạn không có quyền xóa bình luận này")
    db.delete(comment)
    db.commit()
    await manager.broadcast(event("post.updated", {"post_id": post_id}))
