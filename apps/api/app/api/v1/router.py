from fastapi import APIRouter
from app.modules.auth.router import router as auth_router
from app.modules.users.router import router as users_router
from app.modules.audit_logs.router import router as audit_router
from app.modules.catalog.router import router as catalog_router
from app.modules.inventory.router import router as inventory_router
from app.modules.pricing.router import router as pricing_router
from app.modules.delivery.router import router as delivery_router
from app.modules.addresses.router import router as addresses_router
from app.modules.orders.router import router as orders_router
from app.modules.product_requests.router import router as product_requests_router
from app.modules.notifications.router import router as notifications_router
from app.modules.moderation.router import router as moderation_router
from app.modules.reports.router import router as reports_router
from app.realtime.router import router as realtime_router

router = APIRouter()
router.include_router(auth_router)
router.include_router(users_router)
router.include_router(audit_router)
router.include_router(catalog_router)
router.include_router(inventory_router)
router.include_router(pricing_router)
router.include_router(delivery_router)
router.include_router(addresses_router)
router.include_router(orders_router)
router.include_router(product_requests_router)
router.include_router(notifications_router)
router.include_router(moderation_router)
router.include_router(reports_router)
router.include_router(realtime_router)
