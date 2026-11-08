# FreshFlow - API và cấu trúc database

Tài liệu này được tổng hợp từ mã nguồn backend hiện tại.

- **API framework:** FastAPI
- **REST base path:** `/api/v1`
- **Swagger/OpenAPI:** `/docs`
- **Database local mặc định:** SQLite (`freshflow.db`)
- **Database production:** MySQL 8
- **Xác thực:** Bearer JWT
- **Quy ước quyền:** `PUBLIC` = không cần đăng nhập, `USER` = cần Bearer token, `ADMIN` = cần Bearer token với role `ADMIN`

## 1. API endpoints

### 1.1. System và authentication

| Method | Path | Quyền | Request/query chính | Response |
|---|---|---|---|---|
| `GET` | `/` | PUBLIC | — | Tên ứng dụng, link docs và health |
| `GET` | `/api/v1/health` | PUBLIC | — | Trạng thái kết nối database |
| `POST` | `/api/v1/auth/register` | PUBLIC | JSON `RegisterIn`: `email`, `full_name`, `password`, `phone?`, `customer_group?` | `UserOut` (201) |
| `POST` | `/api/v1/auth/login` | PUBLIC | JSON `LoginIn`: `username`, `password` | `TokenOut` |
| `GET` | `/api/v1/auth/me` | USER | Bearer token | `UserOut` |

`TokenOut` gồm: `access_token`, `token_type` (`bearer`).

### 1.2. User và địa chỉ

| Method | Path | Quyền | Request/query chính | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/admin/users` | ADMIN | Query `search?` | Danh sách `UserOut` |
| `PATCH` | `/api/v1/admin/users/{user_id}/status` | ADMIN | Query `is_active: bool` | `UserOut` |
| `GET` | `/api/v1/addresses` | USER | — | Danh sách địa chỉ |
| `POST` | `/api/v1/addresses` | USER | JSON `AddressIn` | Địa chỉ (201) |
| `PATCH` | `/api/v1/addresses/{address_id}` | USER | JSON `AddressIn` | Địa chỉ |
| `DELETE` | `/api/v1/addresses/{address_id}` | USER | — | Không có nội dung (204) |

`AddressIn` gồm: `label?`, `recipient`, `phone`, `line1`, `ward?`, `district?`, `city`, `is_default?`.

### 1.3. Catalog, sản phẩm và tồn kho

| Method | Path | Quyền | Request/query chính | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/categories` | PUBLIC | — | Danh sách category |
| `POST` | `/api/v1/admin/categories` | ADMIN | JSON `CategoryIn`: `name` | Category (201) |
| `GET` | `/api/v1/products` | PUBLIC | Query `category_id?` | Danh sách `ProductOut` |
| `GET` | `/api/v1/catalog/me` | USER | Query `category_id?` | Catalog theo nhóm khách hàng |
| `POST` | `/api/v1/admin/products` | ADMIN | JSON `ProductIn` | `ProductOut` (201) |
| `PATCH` | `/api/v1/admin/products/{product_id}` | ADMIN | JSON `ProductUpdateIn` | `ProductOut` |
| `DELETE` | `/api/v1/admin/products/{product_id}` | ADMIN | — | Vô hiệu hóa sản phẩm (204) |
| `POST` | `/api/v1/admin/products/{product_id}/batches` | ADMIN | JSON `BatchIn` | Batch (201) |
| `GET` | `/api/v1/admin/products/{product_id}/batches` | ADMIN | — | Danh sách batch |
| `PUT` | `/api/v1/admin/products/{product_id}/prices/{customer_group}` | ADMIN | JSON `PriceRuleIn` | Price rule |
| `POST` | `/api/v1/admin/delivery-slots` | ADMIN | JSON `DeliverySlotIn` | Delivery slot (201) |
| `GET` | `/api/v1/delivery-slots` | USER | — | Danh sách delivery slot |

Các input chính:

- `ProductIn`: `name`, `description?`, `category_id?`, `unit?`, `image_url?`, `base_price`.
- `ProductUpdateIn`: các trường của sản phẩm đều tùy chọn.
- `BatchIn`: `batch_date`, `initial_quantity`, `is_open?`.
- `PriceRuleIn`: `customer_group` (`STUDENT` hoặc `WORKING`), `unit_price`.
- `DeliverySlotIn`: `name`, `customer_group?`, `fee`, `is_active?`.
- `ProductOut` có `available_quantity`. Catalog khách hàng (`GET /api/v1/catalog/me`) trả thêm `batches` đang mở và còn hàng, gồm `id` (dùng làm `batch_id` khi đặt đơn), `batch_date`, `is_open` và `available_quantity`.

### 1.4. Orders

| Method | Path | Quyền | Request/query chính | Response |
|---|---|---|---|---|
| `POST` | `/api/v1/orders` | USER | JSON `OrderCreateIn` | `OrderOut` (201) |
| `GET` | `/api/v1/orders` | USER | Query `status?` | Danh sách `OrderOut` |
| `GET` | `/api/v1/orders/{order_id}` | USER | — | `OrderOut` |
| `GET` | `/api/v1/orders/{order_id}/history` | USER | — | Lịch sử trạng thái |
| `PATCH` | `/api/v1/admin/orders/{order_id}/status` | ADMIN | JSON `OrderStatusIn` | `OrderOut` |

`OrderCreateIn` gồm:

```json
{
  "items": [
    { "batch_id": 1, "quantity": 1 }
  ],
  "delivery_type": "PICKUP",
  "delivery_address": "",
  "delivery_slot_id": null,
  "note": ""
}
```

`OrderStatusIn.status` nhận một trong: `APPROVED`, `REJECTED`, `PREPARING`, `DELIVERING`, `COMPLETED`, `CANCELLED`.

### 1.5. Product requests and notifications

| Method | Path | Quyền | Request/query chính | Response |
|---|---|---|---|---|
| `POST` | `/api/v1/product-requests` | USER | JSON `ProductRequestIn` | Product request (201) |
| `GET` | `/api/v1/product-requests` | USER | — | Danh sách product request |
| `PATCH` | `/api/v1/admin/product-requests/{request_id}` | ADMIN | JSON `ProductRequestResponseIn` | Product request đã xử lý |
| `GET` | `/api/v1/notifications` | USER | — | Danh sách `NotificationOut` |
| `PATCH` | `/api/v1/notifications/{notification_id}/read` | USER | — | Không có nội dung (204) |

`ProductRequestIn` gồm `product_name`, `description?`.
`ProductRequestResponseIn.status` nhận một trong: `QUOTED`, `ACCEPTED`, `REJECTED`, `FULFILLED`; ngoài ra có `admin_response?`, `quoted_price?`.

### 1.6. Admin, moderation và reports

| Method | Path | Quyền | Request/query chính | Response |
|---|---|---|---|---|
| `POST` | `/api/v1/admin/moderation/terms` | ADMIN | Query `term` | Moderation term (201) |
| `GET` | `/api/v1/admin/reports/summary` | ADMIN | Query bắt buộc `date_from`, `date_to` (ISO datetime) | Báo cáo tổng hợp |
| `GET` | `/api/v1/admin/audit-logs` | ADMIN | Query `limit` (mặc định 100, 1-500) | Danh sách audit log |

### 1.7. WebSocket realtime

| Protocol | Path | Quyền | Mô tả |
|---|---|---|---|
| `WS` | `/api/v1/ws?token={access_token}` | USER | Kết nối realtime; token được truyền qua query string |

Server event có envelope:

```json
{
  "event_id": "string",
  "type": "connection.ready",
  "occurred_at": "datetime",
  "data": {}
}
```

Các event chính: `connection.ready`, `inventory.updated`, `order.status_changed`, `notification.created`.

## 2. Database schema

Ký hiệu: `PK` = khóa chính, `FK` = khóa ngoại, `UQ` = unique, `NULL` = cho phép rỗng. Kiểu `NUMERIC(p,s)` dùng cho số tiền/số lượng chính xác.

### 2.1. Bảng người dùng và địa chỉ

#### `users`

| Cột | Kiểu | Ràng buộc / mặc định |
|---|---|---|
| `id` | INTEGER | PK |
| `email` | VARCHAR(254) | NOT NULL, UQ, index |
| `full_name` | VARCHAR(120) | NOT NULL |
| `password_hash` | VARCHAR(255) | NOT NULL |
| `role` | VARCHAR(20) | NOT NULL, mặc định `CUSTOMER`, index |
| `customer_group` | VARCHAR(30) | NOT NULL, mặc định `STUDENT` |
| `phone` | VARCHAR(30) | NULL, UQ |
| `is_active` | BOOLEAN | NOT NULL, mặc định `true` |
| `created_at` | DATETIME WITH TIME ZONE | NOT NULL |

#### `addresses`

| Cột | Kiểu | Ràng buộc / mặc định |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | FK `users.id`, ON DELETE CASCADE |
| `label` | VARCHAR(50) | NOT NULL, mặc định `Nhà` |
| `recipient` | VARCHAR(120) | NOT NULL |
| `phone` | VARCHAR(30) | NOT NULL |
| `line1` | VARCHAR(255) | NOT NULL |
| `ward` | VARCHAR(100) | NOT NULL, mặc định rỗng |
| `district` | VARCHAR(100) | NOT NULL, mặc định rỗng |
| `city` | VARCHAR(100) | NOT NULL |
| `is_default` | BOOLEAN | NOT NULL, mặc định `false` |

Index: `ix_address_user_default(user_id, is_default)`.

### 2.2. Bảng catalog, giá và tồn kho

#### `categories`

| Cột | Kiểu | Ràng buộc / mặc định |
|---|---|---|
| `id` | INTEGER | PK |
| `name` | VARCHAR(100) | NOT NULL, UQ |
| `is_active` | BOOLEAN | NOT NULL, mặc định `true` |

#### `products`

| Cột | Kiểu | Ràng buộc / mặc định |
|---|---|---|
| `id` | INTEGER | PK |
| `category_id` | INTEGER | NULL, FK `categories.id` |
| `name` | VARCHAR(180) | NOT NULL, index |
| `description` | TEXT | NOT NULL, mặc định rỗng |
| `unit` | VARCHAR(30) | NOT NULL, mặc định `phần` |
| `image_url` | VARCHAR(500) | NULL |
| `base_price` | NUMERIC(12,2) | NOT NULL, mặc định `0` |
| `is_active` | BOOLEAN | NOT NULL, mặc định `true`, index |
| `created_at` | DATETIME WITH TIME ZONE | NOT NULL |

#### `inventory_batches`

| Cột | Kiểu | Ràng buộc / mặc định |
|---|---|---|
| `id` | INTEGER | PK |
| `product_id` | INTEGER | FK `products.id` |
| `batch_date` | DATETIME WITH TIME ZONE | NOT NULL, index |
| `initial_quantity` | NUMERIC(12,3) | NOT NULL |
| `approved_quantity` | NUMERIC(12,3) | NOT NULL, mặc định `0` |
| `is_open` | BOOLEAN | NOT NULL, mặc định `true` |
| `updated_at` | DATETIME WITH TIME ZONE | NOT NULL |

Index: `ix_batch_product_open(product_id, is_open)`.
`available_quantity = initial_quantity - approved_quantity`, tối thiểu bằng `0`.

#### `price_rules`

| Cột | Kiểu | Ràng buộc / mặc định |
|---|---|---|
| `id` | INTEGER | PK |
| `product_id` | INTEGER | FK `products.id` ON DELETE CASCADE |
| `customer_group` | VARCHAR(30) | NOT NULL |
| `unit_price` | NUMERIC(12,2) | NOT NULL |

Unique constraint: `(product_id, customer_group)`.

#### `delivery_slots`

| Cột | Kiểu | Ràng buộc / mặc định |
|---|---|---|
| `id` | INTEGER | PK |
| `name` | VARCHAR(100) | NOT NULL |
| `customer_group` | VARCHAR(30) | NOT NULL, mặc định `ALL` |
| `fee` | NUMERIC(12,2) | NOT NULL, mặc định `0` |
| `is_active` | BOOLEAN | NOT NULL, mặc định `true` |

### 2.3. Bảng đơn hàng

#### `orders`

| Cột | Kiểu | Ràng buộc / mặc định |
|---|---|---|
| `id` | INTEGER | PK |
| `order_number` | VARCHAR(30) | NOT NULL, UQ, index |
| `user_id` | INTEGER | FK `users.id`, index |
| `status` | VARCHAR(30) | NOT NULL, mặc định `PENDING`, index |
| `delivery_type` | VARCHAR(30) | NOT NULL, mặc định `PICKUP` |
| `delivery_address` | TEXT | NOT NULL, mặc định rỗng |
| `delivery_fee` | NUMERIC(12,2) | NOT NULL, mặc định `0` |
| `subtotal` | NUMERIC(12,2) | NOT NULL, mặc định `0` |
| `total` | NUMERIC(12,2) | NOT NULL, mặc định `0` |
| `note` | TEXT | NOT NULL, mặc định rỗng |
| `created_at` | DATETIME WITH TIME ZONE | NOT NULL, index |
| `updated_at` | DATETIME WITH TIME ZONE | NOT NULL |

#### `order_items`

| Cột | Kiểu | Ràng buộc / mặc định |
|---|---|---|
| `id` | INTEGER | PK |
| `order_id` | INTEGER | FK `orders.id` ON DELETE CASCADE, index |
| `product_id` | INTEGER | FK `products.id` |
| `batch_id` | INTEGER | FK `inventory_batches.id` |
| `product_name_snapshot` | VARCHAR(180) | NOT NULL |
| `unit_snapshot` | VARCHAR(30) | NOT NULL |
| `quantity` | NUMERIC(12,3) | NOT NULL |
| `unit_price` | NUMERIC(12,2) | NOT NULL |
| `line_total` | NUMERIC(12,2) | NOT NULL |

#### `order_status_history`

| Cột | Kiểu | Ràng buộc / mặc định |
|---|---|---|
| `id` | INTEGER | PK |
| `order_id` | INTEGER | FK `orders.id` ON DELETE CASCADE, index |
| `changed_by` | INTEGER | FK `users.id` |
| `old_status` | VARCHAR(30) | NOT NULL |
| `new_status` | VARCHAR(30) | NOT NULL |
| `note` | TEXT | NOT NULL, mặc định rỗng |
| `created_at` | DATETIME WITH TIME ZONE | NOT NULL |

### 2.4. Bảng yêu cầu sản phẩm và thông báo

#### `product_requests`

| Cột | Kiểu | Ràng buộc / mặc định |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | FK `users.id`, index |
| `product_name` | VARCHAR(180) | NOT NULL |
| `description` | TEXT | NOT NULL, mặc định rỗng |
| `status` | VARCHAR(30) | NOT NULL, mặc định `OPEN`, index |
| `admin_response` | TEXT | NOT NULL, mặc định rỗng |
| `quoted_price` | NUMERIC(12,2) | NULL |
| `created_at` | DATETIME WITH TIME ZONE | NOT NULL |

#### `notifications`

| Cột | Kiểu | Ràng buộc / mặc định |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | FK `users.id`, index |
| `title` | VARCHAR(160) | NOT NULL |
| `body` | TEXT | NOT NULL, mặc định rỗng |
| `event_type` | VARCHAR(60) | NOT NULL, mặc định `general` |
| `is_read` | BOOLEAN | NOT NULL, mặc định `false` |
| `created_at` | DATETIME WITH TIME ZONE | NOT NULL |

### 2.5. Moderation

#### `moderation_terms`

| Cột | Kiểu | Ràng buộc / mặc định |
|---|---|---|
| `id` | INTEGER | PK |
| `term` | VARCHAR(100) | NOT NULL, UQ |
| `is_active` | BOOLEAN | NOT NULL, mặc định `true` |

#### `moderation_violations`

| Cột | Kiểu | Ràng buộc / mặc định |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | FK `users.id`, index |
| `matched_term` | VARCHAR(100) | NOT NULL |
| `created_at` | DATETIME WITH TIME ZONE | NOT NULL |

### 2.6. Bảng audit

#### `audit_logs`

| Cột | Kiểu | Ràng buộc / mặc định |
|---|---|---|
| `id` | INTEGER | PK |
| `actor_id` | INTEGER | NULL, FK `users.id` |
| `action` | VARCHAR(100) | NOT NULL, index |
| `entity_type` | VARCHAR(60) | NOT NULL |
| `entity_id` | VARCHAR(60) | NOT NULL |
| `details` | TEXT | NOT NULL, mặc định rỗng |
| `created_at` | DATETIME WITH TIME ZONE | NOT NULL |

## 3. Quan hệ chính

```text
users 1--N addresses
users 1--N orders
users 1--N product_requests
users 1--N notifications
users 1--N moderation_violations
users 1--N audit_logs

categories 1--N products
products 1--N inventory_batches
products 1--N price_rules
products 1--N order_items

orders 1--N order_items
orders 1--N order_status_history
inventory_batches 1--N order_items
```

## 4. Ghi chú triển khai

- Tất cả endpoint REST được mount dưới `/api/v1`, trừ endpoint root `/`.
- Endpoint `/admin/*` yêu cầu role `ADMIN`.
- Không đưa file database `freshflow.db` hoặc dữ liệu thật vào tài liệu gửi ra ngoài nếu không cần thiết; file này chỉ chứa cấu trúc và hợp đồng API.
- Migration hiện tại: `0001_initial`.


## 5. Nâng cấp toàn diện hệ thống (RBAC, Newfeed, VAT, Giao nhận, Reviews, Chat)

### 5.1. Bảng cấu hình VAT và Lịch sử

#### `vat_configs`
| Cột | Kiểu | Ràng buộc / mặc định |
|---|---|---|
| `id` | INTEGER | PK |
| `tax_name` | VARCHAR(100) | NOT NULL, mặc định `VAT` |
| `rate` | NUMERIC(5,4) | NOT NULL, mặc định `0.0800` (8%) |
| `category_id` | INTEGER | NULL, FK `categories.id` |
| `is_active` | BOOLEAN | NOT NULL, mặc định `true` |
| `updated_at` | DATETIME WITH TIME ZONE | NOT NULL |
| `updated_by` | INTEGER | NULL, FK `users.id` |

#### `vat_history`
| Cột | Kiểu | Ràng buộc / mặc định |
|---|---|---|
| `id` | INTEGER | PK |
| `vat_config_id` | INTEGER | FK `vat_configs.id` |
| `old_rate` | NUMERIC(5,4) | NOT NULL |
| `new_rate` | NUMERIC(5,4) | NOT NULL |
| `changed_by` | INTEGER | FK `users.id` |
| `note` | TEXT | NOT NULL, mặc định rỗng |
| `created_at` | DATETIME WITH TIME ZONE | NOT NULL |

### 5.2. Bảng Bài đăng & Newfeed

#### `posts`
| Cột | Kiểu | Ràng buộc / mặc định |
|---|---|---|
| `id` | INTEGER | PK |
| `author_id` | INTEGER | FK `users.id`, index |
| `title` | VARCHAR(200) | NOT NULL |
| `content` | TEXT | NOT NULL |
| `post_type` | VARCHAR(50) | NOT NULL, mặc định `PRODUCT_INTRO` |
| `product_id` | INTEGER | NULL, FK `products.id` |
| `image_urls` | TEXT | NOT NULL, mặc định rỗng |
| `quantity_limit` | NUMERIC(12,3) | NULL |
| `target_audience` | VARCHAR(50) | NOT NULL, mặc định `ALL` |
| `target_customer_group` | VARCHAR(50) | NULL |
| `sale_price` | NUMERIC(12,2) | NULL |
| `group_prices` | TEXT | NOT NULL, mặc định rỗng (JSON giá theo nhóm) |
| `order_start_at` | DATETIME WITH TIME ZONE | NULL |
| `order_end_at` | DATETIME WITH TIME ZONE | NULL |
| `delivery_time_text` | VARCHAR(100) | NOT NULL, mặc định rỗng |
| `is_active` | BOOLEAN | NOT NULL, mặc định `true` |
| `created_at` | DATETIME WITH TIME ZONE | NOT NULL, index |

### 5.3. Bảng Đánh giá & Reviews

#### `product_reviews`
| Cột | Kiểu | Ràng buộc / mặc định |
|---|---|---|
| `id` | INTEGER | PK |
| `product_id` | INTEGER | FK `products.id`, index |
| `user_id` | INTEGER | FK `users.id`, index |
| `order_id` | INTEGER | NULL, FK `orders.id` |
| `rating` | INTEGER | NOT NULL (1 đến 5 sao) |
| `comment` | TEXT | NOT NULL |
| `images` | TEXT | NOT NULL, mặc định rỗng |
| `shop_reply` | TEXT | NOT NULL, mặc định rỗng |
| `is_hidden` | BOOLEAN | NOT NULL, mặc định `false` |
| `created_at` | DATETIME WITH TIME ZONE | NOT NULL |

#### `shipper_reviews`
| Cột | Kiểu | Ràng buộc / mặc định |
|---|---|---|
| `id` | INTEGER | PK |
| `shipper_id` | INTEGER | FK `users.id`, index |
| `user_id` | INTEGER | FK `users.id`, index |
| `order_id` | INTEGER | FK `orders.id`, index |
| `rating` | INTEGER | NOT NULL (1 đến 5 sao) |
| `attitude_rating` | INTEGER | NOT NULL, mặc định `5` |
| `speed_rating` | INTEGER | NOT NULL, mặc định `5` |
| `comment` | TEXT | NOT NULL |
| `created_at` | DATETIME WITH TIME ZONE | NOT NULL |

### 5.4. Bảng Chat Realtime

#### `chat_messages`
| Cột | Kiểu | Ràng buộc / mặc định |
|---|---|---|
| `id` | INTEGER | PK |
| `sender_id` | INTEGER | FK `users.id`, index |
| `receiver_id` | INTEGER | NULL, FK `users.id`, index |
| `order_id` | INTEGER | NULL, FK `orders.id`, index |
| `content` | TEXT | NOT NULL |
| `image_url` | VARCHAR(500) | NULL |
| `is_read` | BOOLEAN | NOT NULL, mặc định `false` |
| `created_at` | DATETIME WITH TIME ZONE | NOT NULL |


### 5.5. Bảng Nhóm khách hàng

#### `customer_groups`
| Cột | Kiểu | Ràng buộc / mặc định |
|---|---|---|
| `id` | INTEGER | PK |
| `code` | VARCHAR(50) | NOT NULL, UQ, index |
| `name` | VARCHAR(100) | NOT NULL |
| `description` | TEXT | NULL |
| `discount_percent` | NUMERIC(5, 2) | NOT NULL, mặc định `0.00` |
| `is_active` | BOOLEAN | NOT NULL, mặc định `true` |

---

> Chi tiết danh sách đầy đủ tất cả bảng, cột mới và toàn bộ API Endpoints mới đã được tổng hợp riêng tại tài liệu: [docs/upgrade-api-and-db.md](file:///c:/Users/LEGION/Downloads/FreshFlow/docs/upgrade-api-and-db.md)
