# FreshFlow API

Backend FastAPI cho FreshFlow. Dùng Python 3.11+, MySQL 8, SQLAlchemy 2.x, Alembic, REST/JSON và WebSocket.

## Chạy bằng Docker Compose (khuyến nghị)

Từ thư mục gốc repository:

```bash
docker compose up --build
```

API: `http://localhost:8000`; Swagger: `http://localhost:8000/docs`; health check: `http://localhost:8000/api/v1/health`.
Trong Compose, MySQL trong container lắng nghe cổng `3306`; cổng máy host được ánh xạ sang `3307` để không xung đột nếu máy đã có MySQL chạy ở `3306`.

Compose hiện dùng mật khẩu development. Chỉ dùng cho máy local; đặt secret riêng và cấu hình HTTPS/WSS trước khi triển khai.

Nếu PowerShell báo `docker` không được nhận diện, Docker Desktop/CLI chưa được cài hoặc chưa có trong `PATH`. Có thể chạy API local bằng SQLite theo hướng dẫn dưới đây; không cần Docker hay MySQL cho giao diện/API development cơ bản.

Nếu Docker Desktop đã cài nhưng `docker` vẫn chưa nhận diện, mở Docker Desktop và thêm CLI vào `PATH` của cửa sổ PowerShell hiện tại:

```powershell
$dockerBin = Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\resources\bin"
$env:Path = "$dockerBin;$env:Path"
docker --version
docker compose version
```

Sau đó chạy lại `docker compose up --build` từ thư mục gốc. Đóng/mở PowerShell mới để kiểm tra `PATH` sau khi cập nhật môi trường Windows.

## Chạy local bằng Python

### Windows PowerShell — dùng virtualenv đã có trong workspace

Từ thư mục gốc `FreshFlow`:

```powershell
cd apps/api
$env:DATABASE_URL = "sqlite:///./freshflow.db"
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Mở `http://127.0.0.1:8000/docs`. Giữ cửa sổ server đang chạy. SQLite được dùng cho phát triển local; để kiểm tra concurrency và khóa tồn kho như production, cần cấu hình MySQL.

Tạo tài khoản admin trong một cửa sổ PowerShell khác:

```powershell
cd apps/api
$env:DATABASE_URL = "sqlite:///./freshflow.db"
.\.venv\Scripts\python.exe -m app.seed_admin --email admin@example.com --name "FreshFlow Admin" --password "change-this-password"
```

Đăng nhập qua `POST /api/v1/auth/login` trong Swagger để lấy access token; nhấn **Authorize** và nhập token để gọi API `/admin/*`.

### Tạo môi trường Python mới

```bash
cd apps/api
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
pip install -e .
Copy-Item .env.example .env  # PowerShell; tự sao chép .env.example thành .env trên hệ điều hành khác
alembic upgrade head
uvicorn app.main:app --reload
```

Nếu tự tạo môi trường mới, đặt `DATABASE_URL=sqlite:///./freshflow.db` trong `.env` hoặc biến môi trường trước khi chạy Alembic. Không sao chép cấu hình MySQL mẫu nếu chưa có MySQL và credential đúng. SQLite chỉ phục vụ chạy local; kiểm tra transaction/khóa tồn kho cần dùng MySQL vì khóa dòng `FOR UPDATE` phụ thuộc database.

Tạo tài khoản quản trị sau khi database đã migrate:

```bash
python -m app.seed_admin --email admin@example.com --name "FreshFlow Admin" --password "change-this-password"
```

## Cấu hình

Sao chép `.env.example` thành `.env`. Các biến quan trọng:

| Biến | Ý nghĩa |
|---|---|
| `DATABASE_URL` | Chuỗi kết nối SQLAlchemy; MySQL dùng `mysql+pymysql://...` |
| `JWT_SECRET` | Secret ký access token; phải thay bằng chuỗi ngẫu nhiên dài |
| `ACCESS_TOKEN_MINUTES` | Thời hạn access token |
| `CORS_ORIGINS` | Danh sách origin frontend, phân cách bằng dấu phẩy |
| `WS_ALLOWED_ORIGINS` | Allowlist Origin cho WebSocket |
| `ENVIRONMENT` | Đặt `production` để bật kiểm tra secret production |

Không commit `.env`, password hoặc token. OTP/SMS chưa nối nhà cung cấp; API đăng ký hiện là luồng development, chưa xác minh email/điện thoại.

## API chính

Tất cả REST endpoint nằm dưới `/api/v1`. Các endpoint `/admin/*` yêu cầu bearer token với role `ADMIN`.

| Nhóm | Endpoint tiêu biểu |
|---|---|
| Xác thực | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Catalog | `GET /categories`, `GET /products`, `GET /catalog/me` |
| Admin catalog/tồn | `POST /admin/categories`, `POST/PATCH/DELETE /admin/products`, `POST /admin/products/{id}/batches`, `PUT /admin/products/{id}/prices/{group}` |
| Khách hàng | `GET/POST/PATCH/DELETE /addresses`, `POST /orders`, `GET /orders`, `GET /orders/{id}` |
| Admin đơn/giao | `PATCH /admin/orders/{id}/status`, `GET /orders/{id}/history`, `POST /admin/delivery-slots` |
| Yêu cầu mặt hàng | `POST/GET /product-requests`, `PATCH /admin/product-requests/{id}` |
| Realtime/thông báo | `WS /api/v1/ws?token={access_token}`, `GET /notifications`, `PATCH /notifications/{id}/read` |
| Chat/kiểm duyệt | `POST /conversations`, `GET/POST /conversations/{id}/messages`, `POST /admin/moderation/terms` |
| Báo cáo/quản trị | `GET /admin/reports/summary`, `GET /admin/users`, `GET /admin/audit-logs` |

WebSocket server events có envelope `{event_id, type, occurred_at, data}`. Sự kiện chính: `connection.ready`, `inventory.updated`, `order.status_changed`, `notification.created`, `chat.message_created`.

## Nghiệp vụ đơn và tồn kho

- Giá được tính lại ở backend theo nhóm khách; tên/đơn vị/đơn giá được chụp vào dòng đơn khi đặt.
- Đơn mới có trạng thái `PENDING`. Lượng chờ duyệt chưa bị trừ khỏi tồn, vì vậy có thể nhiều đơn cùng chờ trên một lượng hàng.
- Khi admin duyệt, backend khóa các dòng đợt hàng theo thứ tự ID trong transaction MySQL, kiểm tra số lượng khả dụng rồi mới tăng lượng đã duyệt. Nếu không đủ, thao tác trả lỗi `409` và không duyệt đơn.
- Khả dụng = số lượng ban đầu − số lượng đã duyệt. Hủy đơn đã duyệt hoàn lại lượng đã duyệt. Hủy đơn `COMPLETED` không được phép.
- WebSocket phát sau commit; client phải tải lại REST state khi reconnect. Chưa có transactional outbox/pub-sub cho nhiều backend instance.

## Phạm vi và phần cần cấu hình thêm

Đã có API nền cho catalog/tồn, giá, đơn, địa chỉ, role admin/customer, yêu cầu mặt hàng, thông báo, báo cáo, chat văn bản, kiểm duyệt từ khóa và audit log. Chưa có SMS/email provider, refresh-token/revoke session, rate-limit, upload ảnh/storage, transactional outbox, Redis pub/sub, đầy đủ workflow giao hàng, cấu hình backup hoặc kiểm thử tải production. Không công bố các khả năng này là đã triển khai. Kiểm thử race condition tồn kho phải chạy trên MySQL và cần được thực hiện trước khi nghiệm thu.



Compose ??c bi?n t? `.env` ? th? m?c g?c. Tr?n PowerShell, t?o file b?ng `Copy-Item .env.example .env`, thay c?c gi? tr? m?u v? kh?ng commit `.env`. M?c ??nh trong Compose ch? ph?c v? local development. Khi `ENVIRONMENT=production`, ?ng d?ng t? ch?i JWT secret m?u, SQLite v? m?t kh?u database development.

## Module structure and production configuration

REST routers call services. `orders`, `catalog`, `inventory`, and `pricing` have repositories; simpler modules still query the database in their services. The WebSocket gateway validates connections through the user service. Migration `0001_initial` declares each table and index explicitly, and its downgrade drops only objects created by that revision.

Compose reads variables from `.env` in the repository root. On PowerShell, create it with `Copy-Item .env.example .env`, replace sample values, and never commit `.env`. Compose defaults are for local development only. With `ENVIRONMENT=production`, the app rejects sample JWT secrets, SQLite, and the development database password.
