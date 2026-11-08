from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin, require_admin_or_shop
from app.models import User
from app.schemas import FinancialSummaryOut
from app.modules.reports import service

router = APIRouter(tags=["Reports & Analytics"])


@router.get("/admin/reports/summary")
def report_summary(
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return service.get_dashboard_summary(db=db, date_from=date_from, date_to=date_to)


@router.get("/admin/reports/dashboard", response_model=FinancialSummaryOut)
def admin_dashboard_summary(
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return service.get_dashboard_summary(db, shop_id=None, days=days)


@router.get("/shop/reports/dashboard", response_model=FinancialSummaryOut)
def shop_dashboard_summary(
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
    shop: User = Depends(require_admin_or_shop),
):
    target_shop_id = shop.id if shop.role == "SHOP" else None
    return service.get_dashboard_summary(db, shop_id=target_shop_id, days=days)


@router.get("/admin/reports/export-csv")
def export_admin_csv(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return service.export_orders_csv(db)


@router.get("/shop/reports/export-csv")
def export_shop_csv(
    db: Session = Depends(get_db),
    shop: User = Depends(require_admin_or_shop),
):
    target_shop_id = shop.id if shop.role == "SHOP" else None
    return service.export_orders_csv(db, shop_id=target_shop_id)
