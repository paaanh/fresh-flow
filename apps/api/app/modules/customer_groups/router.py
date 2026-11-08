from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.api.deps import get_db, require_admin, get_current_user
from app.models import CustomerGroup, User
from app.schemas import CustomerGroupIn, CustomerGroupOut

router = APIRouter(tags=["Customer Groups"])


@router.get("/customer-groups", response_model=list[CustomerGroupOut])
def list_customer_groups(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return db.scalars(select(CustomerGroup).where(CustomerGroup.is_active == True)).all()


@router.post("/admin/customer-groups", response_model=CustomerGroupOut, status_code=201)
def create_customer_group(
    payload: CustomerGroupIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    code_upper = payload.code.strip().upper()
    existing = db.scalar(select(CustomerGroup).where(func.upper(CustomerGroup.code) == code_upper))
    if existing:
        raise HTTPException(409, "Mã nhóm khách hàng đã tồn tại")

    grp = CustomerGroup(
        code=code_upper,
        name=payload.name,
        description=payload.description,
        discount_percent=payload.discount_percent,
        is_active=payload.is_active,
    )
    db.add(grp)
    db.commit()
    db.refresh(grp)
    return grp


@router.patch("/admin/customer-groups/{group_id}", response_model=CustomerGroupOut)
def update_customer_group(
    group_id: int,
    payload: CustomerGroupIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    grp = db.get(CustomerGroup, group_id)
    if not grp:
        raise HTTPException(404, "Không tìm thấy nhóm khách hàng")

    grp.name = payload.name
    grp.description = payload.description
    grp.discount_percent = payload.discount_percent
    grp.is_active = payload.is_active

    db.commit()
    db.refresh(grp)
    return grp
