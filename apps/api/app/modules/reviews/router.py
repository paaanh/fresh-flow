from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, and_

from app.api.deps import get_db, get_current_user, require_admin, require_shop
from app.models import ProductReview, ShipperReview, Order, OrderItem, Product, User
from app.schemas import (
    ProductReviewIn,
    ProductReviewOut,
    ReviewReplyIn,
    ShipperReviewIn,
    ShipperReviewOut,
)

router = APIRouter(tags=["Reviews & Ratings"])


def enrich_review(db: Session, rev: ProductReview) -> ProductReviewOut:
    user = db.get(User, rev.user_id)
    return ProductReviewOut(
        id=rev.id,
        product_id=rev.product_id,
        user_id=rev.user_id,
        user_name=user.full_name if user else "Khách hàng",
        order_id=rev.order_id,
        rating=rev.rating,
        comment=rev.comment,
        images=rev.images,
        shop_reply=rev.shop_reply,
        is_hidden=rev.is_hidden,
        created_at=rev.created_at,
    )


@router.get("/shop/reviews", response_model=list[ProductReviewOut])
def list_shop_reviews(db: Session = Depends(get_db), shop: User = Depends(require_shop)):
    reviews = db.scalars(
        select(ProductReview)
        .join(Product, Product.id == ProductReview.product_id)
        .where(Product.shop_id == shop.id, ProductReview.is_hidden == False)
        .order_by(ProductReview.created_at.desc())
    ).all()
    return [enrich_review(db, review) for review in reviews]


@router.get("/products/{product_id}/reviews", response_model=list[ProductReviewOut])
def get_product_reviews(product_id: int, db: Session = Depends(get_db)):
    reviews = db.scalars(
        select(ProductReview)
        .where(ProductReview.product_id == product_id, ProductReview.is_hidden == False)
        .order_by(ProductReview.created_at.desc())
    ).all()
    return [enrich_review(db, r) for r in reviews]


@router.post("/products/{product_id}/reviews", response_model=ProductReviewOut, status_code=201)
def create_product_review(
    product_id: int,
    payload: ProductReviewIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Verify user has purchased this product in a completed order
    has_purchased = db.scalar(
        select(OrderItem.id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            Order.user_id == user.id,
            Order.status == "COMPLETED",
            OrderItem.product_id == product_id,
        )
    )
    if not has_purchased and user.role == "CUSTOMER":
        raise HTTPException(403, "Bạn chỉ có thể đánh giá sản phẩm sau khi đã mua và nhận hàng thành công")

    rev = ProductReview(
        product_id=product_id,
        user_id=user.id,
        order_id=payload.order_id,
        rating=payload.rating,
        comment=payload.comment,
        images=payload.images,
        is_hidden=False,
    )
    db.add(rev)
    db.commit()
    db.refresh(rev)
    return enrich_review(db, rev)


@router.post("/reviews/{review_id}/reply", response_model=ProductReviewOut)
def reply_to_review(
    review_id: int,
    payload: ReviewReplyIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_shop),
):
    rev = db.get(ProductReview, review_id)
    if not rev:
        raise HTTPException(404, "Không tìm thấy đánh giá")

    product = db.get(Product, rev.product_id)
    if product and product.shop_id != user.id:
        raise HTTPException(403, "Bạn không có quyền trả lời đánh giá của Shop khác")

    rev.shop_reply = payload.reply
    db.commit()
    db.refresh(rev)
    return enrich_review(db, rev)


@router.post("/orders/{order_id}/shipper-review", response_model=ShipperReviewOut, status_code=201)
def review_shipper(
    order_id: int,
    payload: ShipperReviewIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(404, "Không tìm thấy đơn hàng")
    if order.user_id != user.id:
        raise HTTPException(403, "Bạn không phải chủ đơn hàng này")
    if not order.shipper_id:
        raise HTTPException(400, "Đơn hàng chưa có Shipper")

    rev = ShipperReview(
        shipper_id=order.shipper_id,
        user_id=user.id,
        order_id=order.id,
        rating=payload.rating,
        attitude_rating=payload.attitude_rating,
        speed_rating=payload.speed_rating,
        comment=payload.comment,
    )
    db.add(rev)
    db.commit()
    db.refresh(rev)
    return rev


@router.get("/admin/reviews")
def list_admin_reviews(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    prod_revs = db.scalars(select(ProductReview).order_by(ProductReview.created_at.desc())).all()
    ship_revs = db.scalars(select(ShipperReview).order_by(ShipperReview.created_at.desc())).all()
    return {
        "product_reviews": [enrich_review(db, r) for r in prod_revs],
        "shipper_reviews": [
            {
                "id": s.id,
                "shipper_id": s.shipper_id,
                "shipper_name": db.get(User, s.shipper_id).full_name if db.get(User, s.shipper_id) else None,
                "customer_name": db.get(User, s.user_id).full_name if db.get(User, s.user_id) else None,
                "order_id": s.order_id,
                "rating": s.rating,
                "attitude_rating": s.attitude_rating,
                "speed_rating": s.speed_rating,
                "comment": s.comment,
                "created_at": s.created_at,
            }
            for s in ship_revs
        ],
    }


@router.patch("/admin/reviews/{review_id}/hide")
def toggle_hide_review(
    review_id: int,
    hidden: bool = Query(default=True),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    rev = db.get(ProductReview, review_id)
    if not rev:
        raise HTTPException(404, "Không tìm thấy đánh giá")
    rev.is_hidden = hidden
    db.commit()
    return {"id": rev.id, "is_hidden": rev.is_hidden}
