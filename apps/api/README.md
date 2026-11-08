# FreshFlow API Backend

Backend REST API và WebSocket cho nền tảng **FreshFlow**, được xây dựng trên nền tảng **FastAPI**, **SQLAlchemy 2.x**, **Pydantic v2**, hỗ trợ đồng thời cả **MySQL 8** (cho môi trường Production/Staging) và **SQLite** (cho môi trường phát triển cục bộ).

---

## 🏗 Kiến trúc & Các Phân hệ Nghiệp vụ

Backend tổ chức theo kiến trúc module hướng dịch vụ (Service-Repository Pattern):

| Module | Thư mục | Chức năng chính |
|---|---|---|
| **auth** | `app/modules/auth` | Đăng ký, đăng nhập JWT, giải mã phiên, xác minh OTP qua số điện thoại/email (hỗ trợ mô phỏng test), phân quyền 4 vai trò: `ADMIN`, `SHOP`, `SHIPPER`, `CUSTOMER`. |
| **catalog** | `app/modules/catalog` | Quản lý danh mục hàng hóa, thông tin sản phẩm, hỗ trợ lọc theo gian hàng bán lẻ (`shop_id`). |
| **inventory** | `app/modules/inventory` | Quản lý đợt hàng (batches), hạn sử dụng, cơ chế trừ tồn kho an toàn với khóa dòng `SELECT ... FOR UPDATE` theo thứ tự ID để triệt tiêu deadlock và race conditions. |
| **pricing** | `app/modules/pricing` | Cấu hình bảng giá linh hoạt theo nhóm khách hàng: Sinh viên, Người đi làm, Hộ gia đình. |
| **orders** | `app/modules/orders` | Tạo đơn hàng, tính thuế VAT động, chụp dữ liệu (snapshot) đơn giá/VAT tại thời điểm đặt, quy trình chuyển trạng thái đơn và **cách ly dữ liệu đơn hàng giữa các Shop** (Shop Data Isolation). |
| **delivery** | `app/modules/delivery` | Quản lý khung giờ giao hàng (`delivery_slots`) kèm phụ phí và nhóm áp dụng, điều phối Shipper, hỗ trợ giao tận nơi hoặc điểm nhận tập trung (Hub). |
| **reviews** | `app/modules/reviews` | Đánh giá và xếp hạng sản phẩm (1-5 sao, nhận xét), hỗ trợ Shop phản hồi đánh giá và kiểm tra dữ liệu đánh giá theo Shop. |
| **moderation** | `app/modules/moderation` | Kiểm duyệt từ ngữ cấm (Banned Keywords) tự động trong mô tả sản phẩm, yêu cầu mặt hàng và đánh giá. |
| **chat** | `app/modules/chat` | Phòng chat trực tiếp giữa Shop, Khách hàng, Shipper và Quản trị viên, hỗ trợ lưu trữ tin nhắn và đẩy sự kiện realtime. |
| **notifications** | `app/modules/notifications` | Quản lý thông báo cá nhân, cập nhật trạng thái đã đọc và phát qua WebSocket. |
| **reports & audit** | `app/modules/reports`, `app/modules/audit` | Thống kê doanh thu toàn sàn/từng shop, báo cáo mặt hàng bán chạy và nhật ký kiểm toán hệ thống. |

---

## 🚀 Hướng dẫn Chạy Backend

### 1. Chạy bằng Docker Compose (Khuyến nghị)
Từ thư mục gốc repository `FreshFlow`:
```bash
docker compose up --build api
```
- API Endpoint: `http://localhost:8000`
- Tài liệu Swagger UI: `http://localhost:8000/docs`
- Health Check: `http://localhost:8000/api/v1/health`

### 2. Chạy trên máy cục bộ với Python venv (SQLite)
Từ thư mục `apps/api`:
```powershell
# Kích hoạt virtualenv
.\.venv\Scripts\Activate.ps1

# Cài đặt thư viện
pip install -e .

# Thiết lập biến môi trường SQLite
$env:DATABASE_URL = "sqlite:///./freshflow.db"

# Thực hiện migration database
python -m alembic upgrade head

# Khởi chạy server Uvicorn
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 3. Nạp Dữ liệu Mẫu (Seed Demo)
Để nạp dữ liệu đầy đủ bao gồm 5 tài khoản mẫu cho 4 vai trò, danh mục, sản phẩm, các đợt hàng, khung giờ giao hàng và các bài viết bảng tin:
```powershell
# Với Docker:
docker compose exec api python -m app.seed_demo

# Với máy cục bộ:
.\.venv\Scripts\python.exe -m app.seed_demo
```

---

## 👥 Tài khoản Mẫu Kiểm thử

| Vai trò | Email | Mật khẩu mặc định |
|---|---|---|
| **ADMIN** | `admin@freshflow.example.com` | `FreshFlowAdmin123!` |
| **SHOP** | `shop@freshflow.example.com` | `FreshFlowShop123!` |
| **SHIPPER** | `shipper@freshflow.example.com` | `FreshFlowDemo123!` |
| **CUSTOMER (Sinh viên)** | `student@freshflow.example.com` | `FreshFlowDemo123!` |
| **CUSTOMER (Người đi làm)** | `worker@freshflow.example.com` | `FreshFlowDemo123!` |

---

## 🧪 Kiểm thử Backend (Pytest)

Bộ kiểm thử của API bao gồm 7 test suite chính, bao quát từ kiểm thử luồng xác thực, kiểm soát tồn kho, phân quyền, cho tới kiểm tra cách ly dữ liệu giữa các shop:
```powershell
cd apps/api
.\.venv\Scripts\python.exe -m pytest app/tests -v
```

Danh sách các bài test:
- `test_auth_and_roles.py`: Kiểm thử luồng đăng ký, đăng nhập JWT, phân quyền 4 role.
- `test_catalog_and_inventory.py`: Kiểm thử quản lý danh mục, đợt hàng và cơ chế khóa kho.
- `test_orders_and_checkout.py`: Kiểm thử đặt hàng, tính giá nhóm khách hàng, chụp thuế VAT.
- `test_delivery_and_shipper.py`: Kiểm thử khung giờ giao hàng, gán shipper, cập nhật COD.
- `test_reviews_and_ratings.py`: Kiểm thử tạo đánh giá, tính điểm trung bình sản phẩm.
- `test_moderation_and_audit.py`: Kiểm thử từ khóa cấm và ghi nhận nhật ký kiểm toán.
- `test_full_system_audit.py`: Kiểm thử audit toàn hệ thống và kiểm tra cách ly dữ liệu Shop (`test_shop_data_isolation`).

---

## 📡 Giao thức Thời gian thực WebSocket

- **Endpoint kết nối**: `WS /api/v1/ws?token={access_token}`
- Cấu trúc tin nhắn tiêu chuẩn:
  ```json
  {
    "event_id": "evt_abc123",
    "type": "order.status_changed",
    "occurred_at": "2026-11-08T10:00:00Z",
    "data": {
      "order_id": 1,
      "previous_status": "PENDING",
      "new_status": "APPROVED"
    }
  }
  ```
- Các sự kiện chính: `connection.ready`, `inventory.updated`, `order.status_changed`, `notification.created`, `chat.message_sent`.
