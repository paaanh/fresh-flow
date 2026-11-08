from decimal import Decimal
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.api.deps import get_db, require_admin
from app.models import VatConfig, VatHistory, User
from app.schemas import VatConfigIn, VatConfigOut

router = APIRouter(prefix="/admin/vat", tags=["Admin VAT Management"])
active_vat_router = APIRouter(prefix="/vat", tags=["VAT"])


@active_vat_router.get("/configs", response_model=list[VatConfigOut])
def list_active_vat_configs(db: Session = Depends(get_db)):
    return db.scalars(select(VatConfig).where(VatConfig.is_active == True).order_by(VatConfig.id.asc())).all()


@router.get("", response_model=list[VatConfigOut])
def list_vat_configs(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return db.scalars(select(VatConfig).order_by(VatConfig.id.asc())).all()


@router.get("/history")
def list_vat_history(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    history = db.scalars(select(VatHistory).order_by(VatHistory.created_at.desc())).all()
    res = []
    for h in history:
        user = db.get(User, h.changed_by)
        res.append({
            "id": h.id,
            "vat_config_id": h.vat_config_id,
            "old_rate": float(h.old_rate),
            "new_rate": float(h.new_rate),
            "changed_by_name": user.full_name if user else "Hệ thống",
            "note": h.note,
            "created_at": h.created_at,
        })
    return res


@router.post("", response_model=VatConfigOut, status_code=201)
def create_vat_config(
    payload: VatConfigIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    cfg = VatConfig(
        tax_name=payload.tax_name,
        rate=payload.rate,
        category_id=payload.category_id,
        updated_by=admin.id,
        is_active=True,
    )
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return cfg


@router.put("/{config_id}", response_model=VatConfigOut)
def update_vat_config(
    config_id: int,
    payload: VatConfigIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    cfg = db.get(VatConfig, config_id)
    if not cfg:
        raise HTTPException(404, "Không tìm thấy cấu hình VAT")

    old_rate = cfg.rate
    cfg.tax_name = payload.tax_name
    cfg.rate = payload.rate
    cfg.category_id = payload.category_id
    cfg.updated_at = datetime.now(timezone.utc)
    cfg.updated_by = admin.id

    # Record history
    db.add(
        VatHistory(
            vat_config_id=cfg.id,
            old_rate=old_rate,
            new_rate=payload.rate,
            changed_by=admin.id,
            note=payload.note or f"Admin cập nhật thuế suất từ {float(old_rate)*100:.1f}% sang {float(payload.rate)*100:.1f}%",
        )
    )

    db.commit()
    db.refresh(cfg)
    return cfg
