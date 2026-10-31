from decimal import Decimal
from fastapi import HTTPException
from app.models import Order, User
from sqlalchemy.orm import Session
from datetime import datetime
from sqlalchemy import func, select


def report_summary(date_from: datetime, date_to: datetime, db: Session=None, _: User=None):
    if date_to < date_from:
        raise HTTPException(422, 'date_to phải sau date_from')
    rows = db.execute(select(Order.status, func.count(Order.id), func.coalesce(func.sum(Order.total), 0)).where(Order.created_at >= date_from, Order.created_at <= date_to).group_by(Order.status)).all()
    return {'from': date_from, 'to': date_to, 'orders_by_status': [{'status': row[0], 'count': row[1], 'total': row[2]} for row in rows], 'revenue_definition': 'Tổng tiền của đơn COMPLETED trong khoảng thời gian; đối chiếu từ dữ liệu đơn gốc.', 'completed_revenue': sum((row[2] for row in rows if row[0] == 'COMPLETED'), Decimal('0'))}
