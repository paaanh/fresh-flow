# FreshFlow frontend API integration

`../../docs/database.md` is the source of truth. REST uses `/api/v1` and Bearer JWT, not session cookies. Configure `.env.local` from `.env.example`.

## Authentication

Registration sends `email`, `full_name`, `password`, optional `phone`, and `STUDENT`/`WORKING`. Login sends `username` and `password`, stores `access_token` in sessionStorage for the current tab, then reads `/auth/me` for the role. REST attaches Authorization and omits cookies; WebSocket connects to `/api/v1/ws?token=...`. Logout clears local credentials because the backend has no logout endpoint. HTTP 401 clears the current token and redirects to login; HTTP 403 keeps the session. Session storage is accessible to JavaScript; deployments must prevent script injection.

## Implemented resources

`src/lib/api.ts` exports `freshflow` operations for every documented REST resource: health, auth, users/status, addresses, categories, products/catalog, batches, price rules (PUT), delivery slots, orders/history/status, requests/responses, notifications/read, moderation terms, reports, and audit logs. The root metadata endpoint is outside the versioned REST base and can be requested directly from the server origin.

The UI uses admin paths for mutations, query `is_active` for user status, ISO `date_from`/`date_to` for reports, and per-notification read updates. Reports use Vietnam calendar boundaries and an inclusive last millisecond of the month. Product creation creates a category when necessary and a separate inventory batch. Stock can be reduced through `POST /admin/products/{id}/adjustments`; the API removes available stock from oldest batches first and refuses reductions that would touch reserved quantities. Order display numbers are separate from backend order IDs; `APPROVED` is distinct from `PREPARING`. Order item names and units use snapshot fields. Live profile reads `/auth/me`; address default updates send the complete AddressIn. Pricing saves only edited product/group cells through PUT; it does not submit persisted demo prices. Live checkout loads delivery slots and sends the selected `delivery_slot_id`; fee settings on the pricing screen are disabled in live mode.

## Backend contract gaps

- Order creation requires `batch_id`. `GET /api/v1/catalog/me` returns `batches` for open batches with stock; each entry includes `id` (the order `batch_id`), `batch_date`, `is_open`, and `available_quantity`. Checkout allocates cart quantities across those batches and refuses submission if usable batch IDs or enough quantity are absent. Public product listings do not expose batch IDs.
- OTP verification, password recovery, profile editing, store settings, notification broadcast, and moderation alert actions have no documented endpoints. Their live actions report that they are unavailable.
- No GET/DELETE moderation terms or GET price rules endpoint is documented. Those lists cannot be restored from an authoritative backend API yet.
- Several response schemas (including reports, catalog group prices and batch details) are not specified fully. `DELIVERY` for delivery_type and the scope of admin order/request lists also require confirmation. See [BACKEND_HANDOFF.md](../../docs/backend-handoff.md) before deployment.

## Preview and verification

Without a token the UI uses preview data. Live business lists are held in memory. A signed-in data-load failure shows an error/retry screen, so mutations cannot silently become demo writes. Reports/audit logs clear demo rows on live errors. The live dashboard counts loaded records; it does not display static demo statistics. Existing preview settings are held locally and are not shared between devices. `npm run typecheck`, `npm run test:api`, and `npm run build` run without the backend; end-to-end behavior needs the FastAPI server and test credentials.
