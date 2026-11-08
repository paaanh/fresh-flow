import json
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.api.deps import get_db, get_current_user, require_admin_or_shop
from app.models import Post, Product, User, ModerationTerm, ModerationViolation
from app.schemas import PostIn, PostOut

router = APIRouter(prefix="/posts", tags=["Posts & Newfeed"])


def calculate_effective_price(post: Post, user: User | None) -> Decimal | None:
    if not user or not post.group_prices:
        return post.sale_price

    try:
        prices = json.loads(post.group_prices)
        if isinstance(prices, dict) and user.customer_group in prices:
            return Decimal(str(prices[user.customer_group]))
    except Exception:
        pass

    return post.sale_price


def to_post_out(post: Post, db: Session, user: User | None = None) -> PostOut:
    author = db.get(User, post.author_id)
    product = db.get(Product, post.product_id) if post.product_id else None

    effective_price = calculate_effective_price(post, user)

    return PostOut(
        id=post.id,
        author_id=post.author_id,
        author_name=author.full_name if author else None,
        shop_name=author.shop_name or author.full_name if author else None,
        title=post.title,
        content=post.content,
        post_type=post.post_type,
        product_id=post.product_id,
        product_name=product.name if product else None,
        image_urls=post.image_urls,
        quantity_limit=post.quantity_limit,
        target_audience=post.target_audience,
        target_customer_group=post.target_customer_group,
        sale_price=post.sale_price,
        effective_price=effective_price,
        # Customers receive only their effective price, never the other customer groups' prices.
        group_prices="" if user and user.role == "CUSTOMER" else post.group_prices,
        order_start_at=post.order_start_at,
        order_end_at=post.order_end_at,
        delivery_time_text=post.delivery_time_text,
        is_active=post.is_active,
        created_at=post.created_at,
    )


@router.get("", response_model=list[PostOut])
def list_posts(
    category_id: int | None = Query(default=None),
    shop_id: int | None = Query(default=None),
    post_type: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = select(Post).where(Post.is_active == True).order_by(Post.created_at.desc())

    if post_type:
        query = query.where(Post.post_type == post_type)
    if shop_id:
        query = query.where(Post.author_id == shop_id)
    if category_id:
        query = query.join(Product, Post.product_id == Product.id).where(Product.category_id == category_id)

    posts = db.scalars(query).all()

    # Filter based on audience if customer
    if user.role == "CUSTOMER":
        filtered = []
        for p in posts:
            if p.target_audience == "ALL":
                filtered.append(p)
            elif p.target_audience in {"GROUP", "COLLECTIVE", "CUSTOM_GROUP"}:
                if not p.target_customer_group or p.target_customer_group == user.customer_group:
                    filtered.append(p)
            elif p.target_audience == "INDIVIDUAL":
                # Individual targeting requires an explicit matching group until a customer id is configured.
                if p.target_customer_group and p.target_customer_group == user.customer_group:
                    filtered.append(p)
        posts = filtered

    return [to_post_out(p, db, user) for p in posts]


@router.post("", response_model=PostOut, status_code=201)
def create_post(
    payload: PostIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin_or_shop),
):
    active_terms = db.scalars(select(ModerationTerm.term).where(ModerationTerm.is_active == True)).all()
    for term in active_terms:
        if term and (term.lower() in payload.title.lower() or term.lower() in payload.content.lower()):
            violation = ModerationViolation(user_id=user.id, matched_term=term)
            db.add(violation)
            db.commit()
            raise HTTPException(status_code=400, detail=f"Nội dung bài viết chứa từ khóa vi phạm tiêu chuẩn cộng đồng: {term}")

    product_id = payload.product_id
    if product_id:
        prod = db.get(Product, product_id)
        if not prod:
            product_id = None

    post = Post(
        author_id=user.id,
        title=payload.title,
        content=payload.content,
        post_type=payload.post_type,
        product_id=product_id,
        image_urls=payload.image_urls,
        quantity_limit=payload.quantity_limit,
        target_audience=payload.target_audience,
        target_customer_group=payload.target_customer_group,
        sale_price=payload.sale_price,
        group_prices=payload.group_prices,
        order_start_at=payload.order_start_at,
        order_end_at=payload.order_end_at,
        delivery_time_text=payload.delivery_time_text,
        is_active=True,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return to_post_out(post, db, user)


@router.patch("/{post_id}", response_model=PostOut)
def update_post(
    post_id: int,
    payload: PostIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin_or_shop),
):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Không tìm thấy bài đăng")
    if user.role != "ADMIN" and post.author_id != user.id:
        raise HTTPException(403, "Bạn không có quyền sửa bài đăng này")

    post.title = payload.title
    post.content = payload.content
    post.post_type = payload.post_type
    post.product_id = payload.product_id
    post.image_urls = payload.image_urls
    post.quantity_limit = payload.quantity_limit
    post.target_audience = payload.target_audience
    post.target_customer_group = payload.target_customer_group
    post.sale_price = payload.sale_price
    post.group_prices = payload.group_prices
    post.order_start_at = payload.order_start_at
    post.order_end_at = payload.order_end_at
    post.delivery_time_text = payload.delivery_time_text

    db.commit()
    db.refresh(post)
    return to_post_out(post, db, user)


@router.delete("/{post_id}", status_code=204)
def delete_post(
    post_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin_or_shop),
):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Không tìm thấy bài đăng")
    if user.role != "ADMIN" and post.author_id != user.id:
        raise HTTPException(403, "Bạn không có quyền xóa bài đăng này")

    db.delete(post)
    db.commit()
