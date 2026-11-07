from decimal import Decimal
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import func, select

from app.models import Order, OrderItem, Product, User, CustomerGroup
from app.schemas import FinancialSummaryOut


def get_dashboard_summary(
    db: Session,
    shop_id: int | None = None,
    days: int = 30,
) -> FinancialSummaryOut:
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)

    query = select(Order).where(Order.created_at >= since)
    if shop_id:
        query = query.where(Order.shop_id == shop_id)

    orders = db.scalars(query).all()

    total_users = db.scalar(select(func.count(User.id)).where(User.role == "CUSTOMER")) or 0
    total_shops = db.scalar(select(func.count(User.id)).where(User.role == "SHOP")) or 0
    total_products = db.scalar(select(func.count(Product.id)).where(Product.is_active == True)) or 0
    total_orders = len(orders)

    completed_orders = [o for o in orders if o.status == "COMPLETED"]
    delivery_success_rate = round((len(completed_orders) / total_orders * 100), 1) if total_orders > 0 else 100.0

    total_revenue = sum((o.total for o in completed_orders), Decimal("0"))
    total_subtotal = sum((o.subtotal for o in orders), Decimal("0"))
    total_vat = sum((o.vat_amount for o in orders), Decimal("0"))
    total_delivery_fee = sum((o.delivery_fee for o in orders), Decimal("0"))
    total_paid = sum((o.paid_amount for o in orders), Decimal("0"))
    total_debt = sum((o.debt_amount for o in orders), Decimal("0"))
    total_collected_by_shipper = sum((o.cash_collected_by_shipper for o in orders), Decimal("0"))

    # Status distribution
    status_distribution: dict[str, int] = {}
    for o in orders:
        status_distribution[o.status] = status_distribution.get(o.status, 0) + 1

    # Group by date for chart (last 7 or 14 days)
    daily_map: dict[str, dict] = {}
    for i in range(min(days, 14)):
        dt = (now - timedelta(days=min(days, 14) - 1 - i)).strftime("%d/%m")
        daily_map[dt] = {"date": dt, "revenue": 0, "orders": 0}

    for o in orders:
        date_str = o.created_at.strftime("%d/%m")
        if date_str in daily_map:
            daily_map[date_str]["orders"] += 1
            if o.status == "COMPLETED":
                daily_map[date_str]["revenue"] += float(o.total)

    orders_by_date = list(daily_map.values())

    # Shop breakdown
    shop_dict: dict[int, dict] = {}
    shops = db.scalars(select(User).where(User.role == "SHOP")).all()
    for s in shops:
        shop_dict[s.id] = {
            "shop_id": s.id,
            "shop_name": s.shop_name or s.full_name,
            "total_orders": 0,
            "revenue": 0,
        }

    for o in orders:
        if o.shop_id and o.shop_id in shop_dict:
            shop_dict[o.shop_id]["total_orders"] += 1
            if o.status == "COMPLETED":
                shop_dict[o.shop_id]["revenue"] += float(o.total)

    # Customer group breakdown
    group_dict: dict[str, dict] = {}
    users_by_id = {u.id: u for u in db.scalars(select(User)).all()}
    for o in orders:
        u = users_by_id.get(o.user_id)
        grp = u.customer_group if u else "STUDENT"
        if grp not in group_dict:
            group_dict[grp] = {"group": grp, "orders": 0, "revenue": 0}
        group_dict[grp]["orders"] += 1
        if o.status == "COMPLETED":
            group_dict[grp]["revenue"] += float(o.total)

    return FinancialSummaryOut(
        total_users=total_users,
        total_shops=total_shops,
        total_products=total_products,
        total_orders=total_orders,
        delivery_success_rate=delivery_success_rate,
        total_revenue=total_revenue,
        total_subtotal=total_subtotal,
        total_vat=total_vat,
        total_delivery_fee=total_delivery_fee,
        total_paid=total_paid,
        total_debt=total_debt,
        total_collected_by_shipper=total_collected_by_shipper,
        status_distribution=status_distribution,
        orders_by_date=orders_by_date,
        shop_breakdown=list(shop_dict.values()),
        group_breakdown=list(group_dict.values()),
    )


def export_orders_csv(db: Session, shop_id: int | None = None) -> Response:
    query = select(Order).order_by(Order.created_at.desc())
    if shop_id:
        query = query.where(Order.shop_id == shop_id)
    orders = db.scalars(query).all()

    lines = [
        "Mã đơn,Khách hàng,Số điện thoại,Địa chỉ,Hình thức,Trạng thái,Tiền hàng,VAT,Phí giao,Tổng tiền,Đã trả,Còn nợ,Trạng thái TT,Ngày tạo"
    ]
    for o in orders:
        cust = db.get(User, o.user_id)
        cust_name = cust.full_name if cust else ""
        date_str = o.created_at.strftime("%Y-%m-%d %H:%M:%S")
        lines.append(
            f'"{o.order_number}","{cust_name}","{o.recipient_phone}","{o.delivery_address}","{o.delivery_type}","{o.status}",{o.subtotal},{o.vat_amount},{o.delivery_fee},{o.total},{o.paid_amount},{o.debt_amount},"{o.payment_status}","{date_str}"'
        )

    content = "\ufeff" + "\n".join(lines)  # UTF-8 BOM for Excel in Vietnam
    return Response(
        content=content.encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="freshflow_bao_cao_don_hang.csv"'},
    )
