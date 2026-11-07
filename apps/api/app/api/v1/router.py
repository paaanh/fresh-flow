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

# New modules
from app.modules.shipper.router import router as shipper_router
from app.modules.posts.router import router as posts_router
from app.modules.vat.router import router as vat_router
from app.modules.customer_groups.router import router as customer_groups_router
from app.modules.reviews.router import router as reviews_router
from app.modules.chat.router import router as chat_router

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

# Include newly created modules
router.include_router(shipper_router)
router.include_router(posts_router)
router.include_router(vat_router)
router.include_router(customer_groups_router)
router.include_router(reviews_router)
router.include_router(chat_router)
