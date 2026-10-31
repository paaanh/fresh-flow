from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin
from app.models import User
from app.schemas import PriceRuleIn
from app.modules.pricing import service

router = APIRouter()


@router.put("/admin/products/{product_id}/prices/{customer_group}")
def set_price(product_id: int, customer_group: str, payload: PriceRuleIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return service.set_product_price(db, product_id, customer_group, payload, admin)
