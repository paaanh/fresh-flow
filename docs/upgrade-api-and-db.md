# Tài liệu Nâng cấp Toàn diện: Database & API Endpoints - FreshFlow

> **Phiên bản:** v2.0 - Multi-Role E-Commerce & Logistics Upgrade  
> **Cập nhật:** 2026-11-08  
> **Tương thích:** SQLite (Local Dev) & MySQL 8.4+ (Docker / Production)

---

## I. TỔNG HỢP CẤU TRÚC DATABASE (DATABASE SCHEMA)

### 1. Danh sách các bảng mới tạo (12 bảng)

#### 1.1. `customer_groups` (Nhóm khách hàng)
Quản lý các nhóm khách hàng phục vụ chính sách giá và chiết khấu theo đối tượng (Sinh viên, Ngư�?i đi làm, Nhóm A, Khách tập thể).
| Tên cột | Kiểu dữ liệu | Thuộc tính / Ràng buộc | Diễn giải |
|---|---|---|---|
| `id` | INTEGER | PK, Auto Increment | Khóa chính |
| `code` | VARCHAR(50) | NOT NULL, UNIQUE, Index | Mã nhóm (`STUDENT`, `WORKING`, `GROUP_A`, `COLLECTIVE`) |
| `name` | VARCHAR(100) | NOT NULL | Tên hiển thị nhóm |
| `description` | TEXT | NULL | Mô tả chi tiết chính sách nhóm |
| `discount_percent` | NUMERIC(5, 2) | NOT NULL, Default `0.00` | Tỷ lệ giảm giá (%) cho nhóm |
| `is_active` | BOOLEAN | NOT NULL, Default `true` | Trạng thái kích hoạt |

#### 1.2. `vat_configs` (Cấu hình thuế VAT)
Lưu trữ tỷ lệ thuế suất VAT áp dụng cho hệ thống hoặc theo từng danh mục hàng hóa.
| Tên cột | Kiểu dữ liệu | Thuộc tính / Ràng buộc | Diễn giải |
|---|---|---|---|
| `id` | INTEGER | PK, Auto Increment | Khóa chính |
| `tax_name` | VARCHAR(100) | NOT NULL, Default `'VAT'` | Tên thuế suất |
| `rate` | NUMERIC(5, 4) | NOT NULL, Default `0.0800` | Thuế suất (0.08 = 8%) |
| `category_id` | INTEGER | NULL, FK `categories.id` | �?p dụng theo danh mục (hoặc toàn sàn nếu null) |
| `is_active` | BOOLEAN | NOT NULL, Default `true` | �?ang áp dụng |
| `updated_at` | DATETIME WITH TZ | NOT NULL, Default `CURRENT_TIMESTAMP` | Th�?i gian cập nhật |
| `updated_by` | INTEGER | NULL, FK `users.id` | Ngư�?i cập nhật gần nhất |

#### 1.3. `vat_history` (Lịch sử biến động thuế VAT)
Ghi nhận m�?i lần đi�?u chỉnh thuế suất để phục vụ thanh tra, kế toán đối soát.
| Tên cột | Kiểu dữ liệu | Thuộc tính / Ràng buộc | Diễn giải |
|---|---|---|---|
| `id` | INTEGER | PK, Auto Increment | Khóa chính |
| `vat_config_id` | INTEGER | NOT NULL, FK `vat_configs.id` | Mã cấu hình thuế |
| `old_rate` | NUMERIC(5, 4) | NOT NULL | Mức thuế cũ |
| `new_rate` | NUMERIC(5, 4) | NOT NULL | Mức thuế mới |
| `changed_by` | INTEGER | NOT NULL, FK `users.id` | Admin thực hiện thay đổi |
| `note` | TEXT | NULL | Căn cứ đi�?u chỉnh hoặc ghi chú |
| `created_at` | DATETIME WITH TZ | NOT NULL, Default `CURRENT_TIMESTAMP` | Th�?i điểm thay đổi |

#### 1.4. `posts` (Bài đăng quảng bá & Bảng tin Newfeed)
Quản lý các bài đăng bán hàng, món ngon trong ngày, khuyến mãi với chính sách giá theo nhóm khách hàng.
| Tên cột | Kiểu dữ liệu | Thuộc tính / Ràng buộc | Diễn giải |
|---|---|---|---|
| `id` | INTEGER | PK, Auto Increment | Khóa chính |
| `author_id` | INTEGER | NOT NULL, FK `users.id`, Index | Ngư�?i đăng (Admin hoặc Shop) |
| `title` | VARCHAR(200) | NOT NULL | Tiêu đ�? bài đăng |
| `content` | TEXT | NULL | Nội dung chi tiết bài viết |
| `post_type` | VARCHAR(50) | NOT NULL, Default `'PRODUCT_INTRO'` | `PRODUCT_INTRO`, `DAILY_SPECIAL`, `PROMOTION` |
| `product_id` | INTEGER | NULL, FK `products.id` | Sản phẩm liên kết (nếu có) |
| `image_urls` | TEXT | NULL | Danh sách link hình ảnh bài đăng |
| `quantity_limit` | NUMERIC(12, 3) | NULL | Giới hạn số lượng mở bán |
| `target_audience`| VARCHAR(50) | NOT NULL, Default `'ALL'` | `ALL`, `INDIVIDUAL`, `GROUP`, `COLLECTIVE` |
| `target_customer_group` | VARCHAR(50) | NULL | Mã nhóm khách hàng được xem |
| `sale_price` | NUMERIC(12, 2) | NULL | Giá bán gốc hiển thị |
| `group_prices` | TEXT | NULL | JSON lưu giá theo nhóm (VD: `{"STUDENT":27000}`) |
| `order_start_at` | DATETIME WITH TZ | NULL | Gi�? bắt đầu nhận đơn |
| `order_end_at` | DATETIME WITH TZ | NULL | Gi�? chốt nhận đơn |
| `delivery_time_text` | VARCHAR(100) | NOT NULL, Default `''` | Khung gi�? giao hàng dự kiến |
| `is_active` | BOOLEAN | NOT NULL, Default `true`, Index | Hiển thị trên Newfeed |
| `created_at` | DATETIME WITH TZ | NOT NULL, Default `CURRENT_TIMESTAMP`, Index | Th�?i điểm đăng |

#### 1.5. `product_reviews` (�?ánh giá sản phẩm)
Khách hàng đánh giá sản phẩm sau khi đơn hàng hoàn thành (`COMPLETED`).
| Tên cột | Kiểu dữ liệu | Thuộc tính / Ràng buộc | Diễn giải |
|---|---|---|---|
| `id` | INTEGER | PK, Auto Increment | Khóa chính |
| `product_id` | INTEGER | NOT NULL, FK `products.id`, Index | Sản phẩm được đánh giá |
| `user_id` | INTEGER | NOT NULL, FK `users.id`, Index | Khách hàng đánh giá |
| `order_id` | INTEGER | NULL, FK `orders.id` | �?ơn hàng mua sản phẩm |
| `rating` | INTEGER | NOT NULL | �?iểm số (1 đến 5 sao) |
| `comment` | TEXT | NULL | Nhận xét chi tiết |
| `images` | TEXT | NULL | Link ảnh thực tế chụp sản phẩm |
| `shop_reply` | TEXT | NULL | Phản hồi từ chủ Shop |
| `is_hidden` | BOOLEAN | NOT NULL, Default `false` | Trạng thái ẩn vi phạm (bởi Admin) |
| `created_at` | DATETIME WITH TZ | NOT NULL, Default `CURRENT_TIMESTAMP` | Th�?i điểm đánh giá |

#### 1.6. `shipper_reviews` (�?ánh giá Shipper)
�?ánh giá chất lượng phục vụ và tốc độ giao hàng của tài xế.
| Tên cột | Kiểu dữ liệu | Thuộc tính / Ràng buộc | Diễn giải |
|---|---|---|---|
| `id` | INTEGER | PK, Auto Increment | Khóa chính |
| `shipper_id` | INTEGER | NOT NULL, FK `users.id`, Index | Shipper được đánh giá |
| `user_id` | INTEGER | NOT NULL, FK `users.id`, Index | Khách hàng đánh giá |
| `order_id` | INTEGER | NOT NULL, FK `orders.id`, Index | �?ơn hàng giao nhận |
| `rating` | INTEGER | NOT NULL | �?iểm đánh giá chung (1-5 sao) |
| `attitude_rating` | INTEGER | NOT NULL, Default `5` | �?iểm thái độ phục vụ |
| `speed_rating` | INTEGER | NOT NULL, Default `5` | �?iểm tốc độ giao hàng |
| `comment` | TEXT | NULL | L�?i nhận xét |
| `created_at` | DATETIME WITH TZ | NOT NULL, Default `CURRENT_TIMESTAMP` | Th�?i điểm đánh giá |

#### 1.7. `chat_messages` (Tin nhắn Chat Realtime)
Lưu trữ tin nhắn trao đổi giữa khách hàng, shop, shipper và admin.
| Tên cột | Kiểu dữ liệu | Thuộc tính / Ràng buộc | Diễn giải |
|---|---|---|---|
| `id` | INTEGER | PK, Auto Increment | Khóa chính |
| `sender_id` | INTEGER | NOT NULL, FK `users.id`, Index | Ngư�?i gửi tin nhắn |
| `receiver_id` | INTEGER | NULL, FK `users.id`, Index | Ngư�?i nhận tin nhắn |
| `order_id` | INTEGER | NULL, FK `orders.id`, Index | �?ơn hàng liên quan (nếu có) |
| `content` | TEXT | NULL | Nội dung tin nhắn văn bản |
| `image_url` | VARCHAR(500) | NULL | Link hình ảnh gửi kèm |
| `is_read` | BOOLEAN | NOT NULL, Default `false` | �?ã đ�?c hay chưa |
| `created_at` | DATETIME WITH TZ | NOT NULL, Default `CURRENT_TIMESTAMP` | Th�?i điểm gửi |

#### 1.8. `product_requests` (Yêu cầu nhập sản phẩm)
| Tên cột | Kiểu dữ liệu | Thuộc tính / Ràng buộc | Diễn giải |
|---|---|---|---|
| `id` | INTEGER | PK, Auto Increment | Khóa chính |
| `user_id` | INTEGER | NOT NULL, FK `users.id`, Index | Ngư�?i yêu cầu |
| `product_name` | VARCHAR(180) | NOT NULL | Tên sản phẩm muốn nhập |
| `description` | TEXT | NULL | Chi tiết yêu cầu |
| `status` | VARCHAR(30) | NOT NULL, Default `'OPEN'`, Index | `OPEN`, `QUOTED`, `FULFILLED`, `REJECTED` |
| `admin_response` | TEXT | NULL | Phản hồi của Admin/Shop |
| `quoted_price` | NUMERIC(12, 2) | NULL | Báo giá đ�? xuất |
| `created_at` | DATETIME WITH TZ | NOT NULL, Default `CURRENT_TIMESTAMP` | Th�?i điểm tạo |

#### 1.9. `notifications` (Thông báo hệ thống)
| Tên cột | Kiểu dữ liệu | Thuộc tính / Ràng buộc | Diễn giải |
|---|---|---|---|
| `id` | INTEGER | PK, Auto Increment | Khóa chính |
| `user_id` | INTEGER | NOT NULL, FK `users.id`, Index | Ngư�?i nhận thông báo |
| `title` | VARCHAR(160) | NOT NULL | Tiêu đ�? thông báo |
| `body` | TEXT | NULL | Nội dung chi tiết |
| `event_type` | VARCHAR(60) | NOT NULL, Default `'general'` | `order.status`, `order.assigned`, `chat.message`... |
| `is_read` | BOOLEAN | NOT NULL, Default `false` | Trạng thái đã xem |
| `created_at` | DATETIME WITH TZ | NOT NULL, Default `CURRENT_TIMESTAMP` | Th�?i điểm gửi |

#### 1.10. `moderation_terms` & `moderation_violations`
- `moderation_terms`: `id`, `term` (UNIQUE), `is_active`.
- `moderation_violations`: `id`, `user_id`, `matched_term`, `created_at`.

#### 1.11. `audit_logs`
- `audit_logs`: `id`, `actor_id`, `action`, `entity_type`, `entity_id`, `details`, `created_at`.

---

### 2. Các cột mới bổ sung vào bảng hiện có (ALTER TABLE)

#### Bảng `users`
- `role`: VARCHAR(20), Default `'CUSTOMER'` (Hỗ trợ 4 quy�?n: `ADMIN`, `SHOP`, `CUSTOMER`, `SHIPPER`).
- `customer_group`: VARCHAR(30), Default `'STUDENT'` (Nhóm khách hàng).
- `phone`: VARCHAR(30), UNIQUE, NULL.
- `shop_name`: VARCHAR(150), NULL.
- `shop_description`: TEXT, NULL.
- `shop_address`: VARCHAR(255), Default `''`.
- `avatar_url`: VARCHAR(500), NULL.
- `vehicle_info`: VARCHAR(100), Default `''` (Dành cho Shipper: loại xe, biển số).

#### Bảng `categories`
- `parent_id`: INTEGER, NULL, FK `categories.id` (Hỗ trợ danh mục cha - con).
- `description`: TEXT, NULL.
- `icon`: VARCHAR(100), Default `''`.

#### Bảng `products`
- `shop_id`: INTEGER, NULL, FK `users.id`, Index (Liên kết sản phẩm của Shop).
- `images`: TEXT, NULL (Danh sách link hình ảnh).
- `attached_services`: TEXT, NULL (Dịch vụ kèm theo: rửa sạch, hút chân không...).

#### Bảng `orders`
- `shop_id`: INTEGER, NULL, FK `users.id`, Index.
- `shipper_id`: INTEGER, NULL, FK `users.id`, Index.
- `recipient_name`: VARCHAR(120), Default `''`.
- `recipient_phone`: VARCHAR(30), Default `''`.
- `expected_delivery_time`: VARCHAR(100), Default `''`.
- `vat_rate`: NUMERIC(5, 4), Default `0.0800` (Thuế 8%).
- `vat_amount`: NUMERIC(12, 2), Default `0.00`.
- `discount_amount`: NUMERIC(12, 2), Default `0.00`.
- `paid_amount`: NUMERIC(12, 2), Default `0.00`.
- `debt_amount`: NUMERIC(12, 2), Default `0.00`.
- `payment_status`: VARCHAR(30), Default `'UNPAID'` (`UNPAID`, `PREPAID`, `PARTIAL`, `PAID`, `DEBT`).
- `payment_method`: VARCHAR(30), Default `'COD'` (`COD`, `BANK_TRANSFER`, `WALLET`).
- `cash_collected_by_shipper`: NUMERIC(12, 2), Default `0.00`.

---

## II. DANH S�?CH TOÀN BỘ API ENDPOINTS (API SPECIFICATION)

Base URL: `/api/v1`

### 1. Phân hệ Shipper (`/shipper`)
| Method | Endpoint | Quy�?n hạn | Input chính | Mô tả chức năng |
|---|---|---|---|---|
| `GET` | `/shipper/orders` | SHIPPER | `status?`, `available_only: bool?` | Lấy danh sách đơn được phân công hoặc đơn ch�? nhận |
| `PATCH` | `/shipper/orders/{id}/claim` | SHIPPER | `id: int` | Shipper nhận phụ trách giao đơn hàng |
| `PATCH` | `/shipper/orders/{id}/pickup` | SHIPPER | `id: int`, `note?` | Xác nhận đã lấy hàng từ Shop (`PICKED_UP`) |
| `PATCH` | `/shipper/orders/{id}/delivering`| SHIPPER | `id: int`, `note?` | Cập nhật bắt đầu đi giao hàng (`DELIVERING`) |
| `PATCH` | `/shipper/orders/{id}/complete` | SHIPPER | `id: int`, `paid_amount?`, `note?` | Xác nhận giao thành công (`COMPLETED`) và thu COD |
| `GET` | `/shipper/summary` | SHIPPER | — | Báo cáo số đơn đã giao, tổng ti�?n COD đã thu hộ |

### 2. Phân hệ Bài đăng Newfeed (`/posts`)
| Method | Endpoint | Quy�?n hạn | Input chính | Mô tả chức năng |
|---|---|---|---|---|
| `GET` | `/posts` | USER | `category_id?`, `shop_id?`, `post_type?` | Bảng tin Newfeed, tự động tính giá theo nhóm khách hàng |
| `POST` | `/posts` | ADMIN, SHOP | JSON `PostIn` | �?ăng bài viết quảng bá, cài giá theo nhóm, gi�? giao |
| `PATCH` | `/posts/{id}` | ADMIN, SHOP | JSON `PostIn` | Sửa nội dung bài viết, cập nhật giá |
| `DELETE` | `/posts/{id}` | ADMIN, SHOP | — | Xóa bài đăng |

### 3. Phân hệ Thuế VAT & Nhóm khách hàng
| Method | Endpoint | Quy�?n hạn | Input chính | Mô tả chức năng |
|---|---|---|---|---|
| `GET` | `/vat/configs` | PUBLIC | — | Danh sách cấu hình thuế VAT đang áp dụng |
| `GET` | `/admin/vat` | ADMIN | — | Danh sách toàn bộ cấu hình thuế |
| `POST` | `/admin/vat` | ADMIN | JSON `VatConfigIn` | Thêm mức thuế VAT mới |
| `PUT` | `/admin/vat/{id}` | ADMIN | JSON `VatConfigIn` | Cập nhật thuế suất và tự động ghi lịch sử `vat_history` |
| `GET` | `/admin/vat/history` | ADMIN | — | Xem lịch sử thay đổi mức thuế suất |
| `GET` | `/customer-groups` | USER | — | Danh sách các nhóm khách hàng |
| `POST` | `/admin/customer-groups` | ADMIN | JSON `CustomerGroupIn` | Tạo nhóm khách hàng mới (% giảm giá) |
| `PATCH`| `/admin/customer-groups/{id}` | ADMIN | JSON `CustomerGroupIn` | Chỉnh sửa tên, mô tả, mức giảm giá nhóm |

### 4. Phân hệ �?ánh giá & Reviews
| Method | Endpoint | Quy�?n hạn | Input chính | Mô tả chức năng |
|---|---|---|---|---|
| `GET` | `/products/{id}/reviews` | PUBLIC | — | Danh sách đánh giá của 1 sản phẩm |
| `POST` | `/products/{id}/reviews` | CUSTOMER | JSON `ProductReviewIn` | �?ánh giá 1-5 sao kèm ảnh chụp sản phẩm thực tế |
| `GET` | `/shop/reviews` | SHOP | — | Shop xem toàn bộ đánh giá sản phẩm của cửa hàng |
| `POST` | `/reviews/{id}/reply` | SHOP, ADMIN | JSON `ReviewReplyIn` | Shop phản hồi bình luận của khách hàng |
| `POST` | `/orders/{id}/shipper-review` | CUSTOMER | JSON `ShipperReviewIn` | �?ánh giá thái độ và tốc độ của Shipper |
| `GET` | `/admin/reviews` | ADMIN | — | Admin xem toàn bộ đánh giá sản phẩm & shipper |
| `PATCH`| `/admin/reviews/{id}/hide` | ADMIN | Query `hidden: bool` | Ẩn/Hiện đánh giá có nội dung không phù hợp |

### 5. Phân hệ Chat Realtime (`/chat`)
| Method | Endpoint | Quy�?n hạn | Input chính | Mô tả chức năng |
|---|---|---|---|---|
| `GET` | `/chat/conversations` | USER | — | Danh sách hội thoại gần nhất, tin nhắn chưa đ�?c |
| `GET` | `/chat/messages` | USER | `peer_id?`, `order_id?` | Lịch sử tin nhắn trao đổi giữa 2 ngư�?i hoặc theo đơn |
| `POST` | `/chat/messages` | USER | JSON `ChatMessageIn` | Gửi tin nhắn và push sự kiện WebSocket `chat.message` |

### 6. Phân hệ Báo cáo Tài chính & Dashboard (`/reports`)
| Method | Endpoint | Quy�?n hạn | Input chính | Mô tả chức năng |
|---|---|---|---|---|
| `GET` | `/admin/reports/dashboard` | ADMIN | `days: int = 30` | Lấy 8 thẻ thống kê tài chính, biểu đồ doanh thu, VAT |
| `GET` | `/shop/reports/dashboard` | SHOP | `days: int = 30` | Lấy doanh thu, số đơn, thống kê riêng của Shop |
| `GET` | `/admin/reports/export-csv` | ADMIN | — | Xuất file CSV báo cáo tài chính đối soát (UTF-8 BOM) |
| `GET` | `/shop/reports/export-csv` | SHOP | — | Xuất file CSV doanh thu bán hàng của Shop |

### 7. Phân hệ �?ơn hàng & Ngư�?i dùng nâng cấp
| Method | Endpoint | Quy�?n hạn | Input chính | Mô tả chức năng |
|---|---|---|---|---|
| `PATCH`| `/orders/{id}/assign-shipper`| ADMIN, SHOP | Query `shipper_id: int` | Gán tài xế giao đơn hàng |
| `PATCH`| `/orders/{id}/payment` | ADMIN, SHIPPER| JSON `OrderPaymentIn` | Cập nhật số ti�?n thanh toán, ti�?n COD, tình trạng nợ |
| `PATCH`| `/orders/{id}/status` | USER | JSON `OrderStatusIn` | �?ổi trạng thái trong 8 bước quy trình |
| `GET` | `/shippers` | USER | — | Danh sách các tài xế đang hoạt động |
| `GET` | `/shops` | PUBLIC | — | Danh sách các cửa hàng đối tác trên hệ thống |
| `PATCH`| `/users/profile` | USER | JSON `ProfileUpdateIn` | Cập nhật thông tin Shop hoặc xe của Shipper |

---

## III. TÀI KHOẢN MẪU KIỂM THỬ (DEMO ACCOUNTS)

| Vai trò | Email đăng nhập | Mật khẩu | Thông tin chi tiết |
|---|---|---|---|
| **ADMIN** | `admin@freshflow.example.com` | `FreshFlowAdmin123!` | Quản trị viên tối cao |
| **SHOP** | `shop@freshflow.example.com` | `FreshFlowShop123!` | Cửa hàng: �?à Lạt Green Farm |
| **SHIPPER** | `shipper@freshflow.example.com` | `<SHIPPER_PASSWORD>` | Tài xế: Nguyễn Văn Giao (49B1-88992) |
| **CUSTOMER** | `student@freshflow.example.com` | `FreshFlowDemo123!` | Khách hàng: Nguyễn Ng�?c Anh (Nhóm Sinh viên) |
