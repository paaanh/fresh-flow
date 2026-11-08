# FreshFlow - Đặc tả API (API Specification)

Tài liệu đặc tả toàn bộ API REST và WebSocket của nền tảng FreshFlow.

- **Framework:** FastAPI (Python 3.11+)
- **Base Path:** `/api/v1`
- **Tài liệu trực quan:** `/docs` (Swagger UI) và `/redoc` (ReDoc)
- **Database:** SQLite local development (`freshflow.db`) / MySQL 8.x production
- **Cơ chế xác thực:** Bearer JWT Token
- **Quy ước phân quyền (RBAC):**
  - `PUBLIC`: Không yêu cầu đăng nhập.
  - `USER`: Đã đăng nhập với tài khoản hợp lệ (`CUSTOMER`, `SHOP`, `SHIPPER`, hoặc `ADMIN`).
  - `CUSTOMER`: Khách hàng mua sắm, nhận hàng và đánh giá.
  - `SHOP`: Đối tác gian hàng (quản lý sản phẩm, đơn hàng, phản hồi đánh giá của shop).
  - `SHIPPER`: Tài xế giao vận (nhận đơn, cập nhật lộ trình, thu hộ COD).
  - `ADMIN`: Quản trị viên hệ thống (toàn quyền quản lý và kiểm duyệt).

---

## 1. Danh sách API Endpoints

### 1.1. Hệ thống & Xác thực (Authentication & OTP)

| Method | Path | Quyền | Mô tả | Request Body / Query | Phản hồi |
|---|---|---|---|---|---|
| `GET` | `/` | PUBLIC | Thông tin dịch vụ & trạng thái hệ thống | — | JSON tên app, version, link docs |
| `GET` | `/api/v1/health` | PUBLIC | Kiểm tra tình trạng kết nối DB | — | `{ "status": "ok", "database": "connected" }` |
| `POST` | `/api/v1/auth/register` | PUBLIC | Đăng ký tài khoản (Khách/Shop/Shipper) | JSON `RegisterIn`: `email`, `full_name`, `password`, `phone?`, `role?`, `customer_group?`, `otp_code?` | `UserOut` (201) |
| `POST` | `/api/v1/auth/login` | PUBLIC | Đăng nhập hệ thống | JSON `LoginIn`: `username` (email/sđt), `password` | `TokenOut`: `access_token`, `token_type` |
| `GET` | `/api/v1/auth/me` | USER | Lấy thông tin tài khoản đang đăng nhập | Bearer Token | `UserOut` |
| `POST` | `/api/v1/auth/request-otp` | PUBLIC | Gửi mã OTP xác thực qua Email/SĐT | JSON `RequestOtpIn`: `target`, `purpose` | `{ "message": "string", "otp_code?": "string" }` |
| `POST` | `/api/v1/auth/verify-otp` | PUBLIC | Xác thực mã OTP | JSON `VerifyOtpIn`: `target`, `code`, `purpose` | `{ "verified": true, "message": "string" }` |
| `POST` | `/api/v1/auth/reset-password` | PUBLIC | Đặt lại mật khẩu bằng OTP | JSON `ResetPasswordIn`: `target`, `code`, `new_password` | `{ "message": "Đặt lại mật khẩu thành công" }` |

---

### 1.2. Người dùng, Hồ sơ & Đối tác (Users & Profiles)

| Method | Path | Quyền | Mô tả | Request Body / Query | Phản hồi |
|---|---|---|---|---|---|
| `GET` | `/api/v1/admin/users` | ADMIN | Tìm kiếm & danh sách người dùng | Query `search?`, `role?` | Danh sách `UserOut` |
| `PATCH` | `/api/v1/admin/users/{user_id}/status` | ADMIN | Khóa hoặc kích hoạt người dùng | Query `is_active: bool` | `UserOut` |
| `PATCH` | `/api/v1/users/profile` | USER | Cập nhật hồ sơ tài khoản / shop / xe | JSON: `full_name?`, `phone?`, `shop_name?`, `shop_description?`, `shop_address?`, `vehicle_info?` | `UserOut` |
| `GET` | `/api/v1/shops` | PUBLIC | Danh sách các cửa hàng đối tác trên sàn | — | Danh sách `UserOut` (role SHOP) |
| `GET` | `/api/v1/shippers` | USER | Danh sách tài xế giao hàng | — | Danh sách `UserOut` (role SHIPPER) |

---

### 1.3. Sổ địa chỉ giao hàng (Addresses)

| Method | Path | Quyền | Mô tả | Request Body / Query | Phản hồi |
|---|---|---|---|---|---|
| `GET` | `/api/v1/addresses` | USER | Danh sách địa chỉ nhận hàng của user | — | Danh sách `AddressOut` |
| `POST` | `/api/v1/addresses` | USER | Thêm địa chỉ mới | JSON `AddressIn`: `recipient`, `phone`, `line1`, `ward?`, `district?`, `city`, `is_default?` | `AddressOut` (201) |
| `PATCH` | `/api/v1/addresses/{address_id}` | USER | Cập nhật địa chỉ nhận hàng | JSON `AddressIn` | `AddressOut` |
| `DELETE` | `/api/v1/addresses/{address_id}` | USER | Xóa địa chỉ | — | 204 No Content |

---

### 1.4. Danh mục, Sản phẩm, Tồn kho & Khung giờ giao hàng

| Method | Path | Quyền | Mô tả | Request Body / Query | Phản hồi |
|---|---|---|---|---|---|
| `GET` | `/api/v1/categories` | PUBLIC | Lấy danh mục sản phẩm | — | Danh sách `CategoryOut` |
| `POST` | `/api/v1/admin/categories` | ADMIN | Tạo danh mục mới | JSON `CategoryIn`: `name` | `CategoryOut` (201) |
| `GET` | `/api/v1/products` | PUBLIC | Danh sách sản phẩm khả dụng | Query `category_id?`, `shop_id?` | Danh sách `ProductOut` |
| `GET` | `/api/v1/catalog/me` | USER | Danh mục kèm giá theo nhóm khách & đợt hàng | Query `category_id?`, `shop_id?` | Danh sách `ProductOut` (kèm batches) |
| `POST` | `/api/v1/admin/products` | ADMIN/SHOP | Tạo sản phẩm mới | JSON `ProductIn`: `name`, `category_id`, `base_price`, `unit`, `shop_id?` | `ProductOut` (201) |
| `PATCH` | `/api/v1/admin/products/{product_id}` | ADMIN/SHOP | Cập nhật thông tin sản phẩm | JSON `ProductUpdateIn` | `ProductOut` |
| `DELETE` | `/api/v1/admin/products/{product_id}` | ADMIN/SHOP | Vô hiệu hóa (ẩn) sản phẩm | — | 204 No Content |
| `POST` | `/api/v1/admin/products/{product_id}/batches` | ADMIN/SHOP | Nhập lô hàng tồn kho mới | JSON `BatchIn`: `batch_date`, `initial_quantity`, `is_open?` | `BatchOut` (201) |
| `GET` | `/api/v1/admin/products/{product_id}/batches` | ADMIN/SHOP | Xem lịch sử các lô tồn kho của sản phẩm | — | Danh sách `BatchOut` |
| `PUT` | `/api/v1/admin/products/{product_id}/prices/{customer_group}` | ADMIN | Thiết lập chính sách giá theo nhóm khách | JSON `PriceRuleIn`: `unit_price` | `PriceRuleOut` |
| `GET` | `/api/v1/delivery-slots` | USER | Danh sách khung giờ giao hàng đang kích hoạt | — | Danh sách `DeliverySlotOut` |
| `POST` | `/api/v1/admin/delivery-slots` | ADMIN | Tạo khung giờ giao hàng mới | JSON `DeliverySlotIn`: `name`, `fee`, `customer_group?` | `DeliverySlotOut` (201) |
| `DELETE` | `/api/v1/admin/delivery-slots/{slot_id}` | ADMIN | Xóa khung giờ giao hàng | — | `{ "message": "Đã xóa khung giờ" }` |

---

### 1.5. Đơn hàng & Điều phối (Orders & Logistics)

| Method | Path | Quyền | Mô tả | Request Body / Query | Phản hồi |
|---|---|---|---|---|---|
| `POST` | `/api/v1/orders` | USER | Tạo đơn hàng mới | JSON `OrderCreateIn`: `items`, `delivery_type`, `delivery_address?`, `delivery_slot_id?`, `payment_method?` | `OrderOut` (201) |
| `GET` | `/api/v1/orders` | USER | Danh sách đơn hàng (tự động cách ly theo role) | Query `status?`, `search?`, `shop_id?`, `shipper_id?` | Danh sách `OrderOut` |
| `GET` | `/api/v1/orders/{order_id}` | USER | Xem chi tiết đơn hàng | — | `OrderOut` (kèm danh sách món, shipper, shop) |
| `GET` | `/api/v1/orders/{order_id}/history` | USER | Xem lịch sử chuyển đổi trạng thái đơn | — | Danh sách `OrderStatusHistoryOut` |
| `PATCH` | `/api/v1/admin/orders/{order_id}/status` | USER | Cập nhật trạng thái (Admin, Shop xác nhận/hủy, Khách hủy đơn chờ) | JSON `OrderStatusIn`: `status`, `note?` | `OrderOut` |
| `PATCH` | `/api/v1/orders/{order_id}/assign-shipper` | ADMIN/SHOP | Điều phối gán Shipper cho đơn hàng | JSON: `shipper_id` | `OrderOut` |

---

### 1.6. Nghiệp vụ Shipper Giao vận (Shipper Dedicated)

| Method | Path | Quyền | Mô tả | Request Body / Query | Phản hồi |
|---|---|---|---|---|---|
| `GET` | `/api/v1/shipper/orders` | SHIPPER | Danh sách đơn hàng được gán hoặc chờ nhận | Query `status?`, `available_only: bool` | Danh sách `OrderOut` |
| `PATCH` | `/api/v1/shipper/orders/{order_id}/claim` | SHIPPER | Shipper chủ động nhận đơn giao | — | `OrderOut` |
| `PATCH` | `/api/v1/shipper/orders/{order_id}/pickup` | SHIPPER | Xác nhận đã lấy hàng từ Shop/Kho | Query `note?` | `OrderOut` |
| `PATCH` | `/api/v1/shipper/orders/{order_id}/delivering` | SHIPPER | Bắt đầu di chuyển giao hàng cho khách | Query `note?` | `OrderOut` |
| `PATCH` | `/api/v1/shipper/orders/{order_id}/complete` | SHIPPER | Hoàn thành giao hàng & xác nhận tiền COD | Query `paid_amount?`, `note?` | `OrderOut` |

---

### 1.7. Bảng tin Quảng bá & Món ngon (Posts / Newsfeed)

| Method | Path | Quyền | Mô tả | Request Body / Query | Phản hồi |
|---|---|---|---|---|---|
| `GET` | `/api/v1/posts` | PUBLIC | Lấy danh sách bài đăng Newfeed | Query `category_id?`, `shop_id?`, `post_type?` | Danh sách `PostOut` |
| `POST` | `/api/v1/posts` | ADMIN/SHOP | Tạo bài đăng quảng bá / món trong ngày | JSON `PostIn`: `title`, `content`, `product_id?`, `sale_price?`, `group_prices?` | `PostOut` (201) |
| `PATCH` | `/api/v1/posts/{post_id}` | ADMIN/SHOP | Cập nhật bài đăng (chỉ tác giả hoặc admin) | JSON `PostIn` | `PostOut` |
| `DELETE` | `/api/v1/posts/{post_id}` | ADMIN/SHOP | Xóa bài đăng | — | 204 No Content |

---

### 1.8. Đánh giá & Phản hồi (Reviews & Ratings)

| Method | Path | Quyền | Mô tả | Request Body / Query | Phản hồi |
|---|---|---|---|---|---|
| `GET` | `/api/v1/products/{product_id}/reviews` | PUBLIC | Xem danh sách đánh giá của sản phẩm | — | Danh sách `ProductReviewOut` |
| `POST` | `/api/v1/products/{product_id}/reviews` | CUSTOMER | Đánh giá sản phẩm đã mua hoàn tất | JSON `ProductReviewIn`: `rating`, `comment?`, `order_id?` | `ProductReviewOut` (201) |
| `GET` | `/api/v1/shop/reviews` | SHOP | Xem đánh giá đối với các sản phẩm của shop mình | — | Danh sách `ProductReviewOut` |
| `POST` | `/api/v1/reviews/{review_id}/reply` | ADMIN/SHOP | Cửa hàng phản hồi đánh giá của khách | JSON `ReviewReplyIn`: `reply` | `ProductReviewOut` |
| `POST` | `/api/v1/orders/{order_id}/shipper-review` | CUSTOMER | Đánh giá thái độ & tốc độ của Shipper | JSON `ShipperReviewIn`: `rating`, `attitude_rating`, `speed_rating`, `comment?` | `ShipperReviewOut` (201) |
| `GET` | `/api/v1/admin/reviews` | ADMIN | Toàn bộ đánh giá trên sàn để kiểm duyệt | — | `{ "product_reviews": [], "shipper_reviews": [] }` |

---

### 1.9. Tin nhắn Realtime Chat

| Method | Path | Quyền | Mô tả | Request Body / Query | Phản hồi |
|---|---|---|---|---|---|
| `GET` | `/api/v1/chat/messages` | USER | Lấy tin nhắn trao đổi (theo đơn hoặc người nhận) | Query `peer_id?`, `order_id?` | Danh sách `ChatMessageOut` |
| `POST` | `/api/v1/chat/messages` | USER | Gửi tin nhắn chat (có kiểm duyệt từ khóa tự động) | JSON `ChatMessageIn`: `content`, `receiver_id?`, `order_id?` | `ChatMessageOut` (201) |
| `GET` | `/api/v1/chat/users` | USER | Danh bạ người dùng có thể nhắn tin | Query `search?`, `role?` | Danh sách `ChatUserOut` |

---

### 1.10. Nhóm khách hàng & Cấu hình Thuế VAT

| Method | Path | Quyền | Mô tả | Request Body / Query | Phản hồi |
|---|---|---|---|---|---|
| `GET` | `/api/v1/customer-groups` | PUBLIC | Danh sách nhóm khách hàng (Sinh viên, Người đi làm...) | — | Danh sách `CustomerGroupOut` |
| `POST` | `/api/v1/admin/customer-groups` | ADMIN | Tạo nhóm khách hàng mới | JSON: `code`, `name`, `discount_percent` | `CustomerGroupOut` (201) |
| `GET` | `/api/v1/admin/vat` | USER | Danh sách các cấu hình thuế VAT hiện tại | — | Danh sách `VatConfigOut` |
| `GET` | `/api/v1/admin/vat/history` | ADMIN | Lịch sử các lần thay đổi biểu thuế VAT | — | Danh sách `VatHistoryOut` |

---

### 1.11. Yêu cầu sản phẩm, Thông báo & Kiểm duyệt nội dung

| Method | Path | Quyền | Mô tả | Request Body / Query | Phản hồi |
|---|---|---|---|---|---|
| `POST` | `/api/v1/product-requests` | USER | Gửi yêu cầu tìm mặt hàng đặc thù | JSON `ProductRequestIn`: `product_name`, `description?` | `ProductRequestOut` (201) |
| `GET` | `/api/v1/product-requests` | USER | Danh sách yêu cầu mặt hàng của tôi / của khách | — | Danh sách `ProductRequestOut` |
| `PATCH` | `/api/v1/admin/product-requests/{request_id}` | USER | Xử lý báo giá / chấp nhận yêu cầu | JSON `ProductRequestResponseIn`: `status`, `quoted_price?`, `admin_response?` | `ProductRequestOut` |
| `GET` | `/api/v1/notifications` | USER | Lấy danh sách thông báo của tài khoản | — | Danh sách `NotificationOut` |
| `PATCH` | `/api/v1/notifications/{notification_id}/read` | USER | Đánh dấu đã đọc thông báo | — | 204 No Content |
| `POST` | `/api/v1/admin/notifications/broadcast` | ADMIN | Phát thông báo chung tới toàn bộ người dùng | JSON `BroadcastNotificationIn`: `title`, `body`, `target_role?` | `{ "notified_count": int }` |
| `POST` | `/api/v1/admin/moderation/terms` | ADMIN | Thêm từ khóa nhạy cảm / spam vào danh sách đen | Query `term: string` | `ModerationTermOut` (201) |
| `DELETE` | `/api/v1/admin/moderation/terms/{term_id}` | ADMIN | Xóa từ khóa kiểm duyệt | — | 204 No Content |
| `GET` | `/api/v1/admin/moderation/violations` | ADMIN | Xem nhật ký các vi phạm tiêu chuẩn cộng đồng | — | Danh sách `ModerationViolationOut` |

---

### 1.12. Báo cáo, Thống kê & Nhật ký kiểm toán (Reports & Audit)

| Method | Path | Quyền | Mô tả | Request Body / Query | Phản hồi |
|---|---|---|---|---|---|
| `GET` | `/api/v1/admin/reports/summary` | ADMIN | Báo cáo tài chính & vận hành theo khoảng thời gian | Query `date_from`, `date_to` (ISO 8601) | `FinancialSummaryOut` |
| `GET` | `/api/v1/admin/audit-logs` | ADMIN | Xem nhật ký thao tác kiểm toán của hệ thống | Query `limit?` (mặc định 100) | Danh sách `AuditLogOut` |

---

### 1.13. Kết nối Realtime WebSocket

| Giao thức | Path | Quyền | Mô tả |
|---|---|---|---|
| `WS` | `/api/v1/ws?token={access_token}` | USER | Kết nối 2 chiều duy trì trạng thái realtime |

- **Event Envelope:**
```json
{
  "event_id": "uuid-string",
  "type": "order.status_changed",
  "occurred_at": "2026-11-08T22:00:00Z",
  "data": { "order_id": 105, "status": "DELIVERING" }
}
```
- **Các sự kiện chính:**
  - `connection.ready`: Xác lập kết nối thành công.
  - `inventory.updated`: Tồn kho sản phẩm thay đổi.
  - `order.new`: Có đơn hàng mới phát sinh cần chuẩn bị.
  - `order.status_changed`: Trạng thái đơn hàng cập nhật.
  - `order.assigned`: Đơn hàng đã được chỉ định Shipper.
  - `notification.created`: Có thông báo mới cho người dùng.
  - `chat.message`: Tin nhắn trò chuyện mới được gửi tới.
