# FreshFlow

Ứng dụng quản lý hàng hóa và đặt hàng gồm frontend Next.js, REST/WebSocket API FastAPI và cơ sở dữ liệu. README này hướng dẫn chạy bản hiện có trên máy local. Docker Compose là cách đơn giản nhất để chạy đủ web, API và MySQL.

## Chức năng hiện có

- Đăng ký, đăng nhập bằng email/mật khẩu và phân quyền khách hàng/quản trị viên.
- Xem danh mục, sản phẩm, giá theo nhóm khách hàng và lượng hàng khả dụng.
- Quản trị sản phẩm, danh mục, đợt hàng, giá, tài khoản và khung giao hàng.
- Quản lý địa chỉ; khách hàng tạo và theo dõi đơn nhiều sản phẩm; quản trị viên cập nhật trạng thái đơn.
- Gửi yêu cầu mặt hàng, xem thông báo, báo cáo và nhật ký quản trị.
- Nhận một số cập nhật qua WebSocket khi client đang kết nối.

Đăng ký hiện chưa xác minh OTP qua SMS/email. Các mục như cổng thanh toán, gửi SMS/email thật, lưu ảnh bên ngoài, backup tự động, triển khai nhiều instance và mục tiêu tải production chưa được cấu hình hoặc xác minh trong repo này.

## Yêu cầu

### Chạy bằng Docker Compose (khuyến nghị)

- Git để lấy mã nguồn.
- Docker Desktop đang chạy, có Docker Compose v2.

### Chạy thủ công trên Windows

- Python 3.11 trở lên.
- Node.js 20 trở lên và npm.

## 1. Lấy mã nguồn

Clone repo hoặc giải nén source bàn giao, sau đó mở PowerShell tại thư mục `FreshFlow` có file `compose.yaml`.

```powershell
git clone https://github.com/paaanh/fresh-flow.git
cd fresh-flow
```

## 2. Chạy toàn bộ bằng Docker Compose

Tùy chọn tạo file cấu hình local từ mẫu (Compose cũng có mặc định để chạy local nếu bỏ qua bước này):

```powershell
Copy-Item .env.example .env
```

Khởi động MySQL, API và web:

```powershell
docker compose up --build
```

Lần đầu Docker tải image và cài thư viện nên có thể mất vài phút. API tự chạy Alembic migration khi khởi động. Khi các dịch vụ sẵn sàng, mở:

- Web: <http://localhost:3000>
- Trang đăng nhập: <http://localhost:3000/login>
- Tài liệu API Swagger: <http://localhost:8000/docs>
- Trạng thái API/database: <http://localhost:8000/api/v1/health>

Nạp dữ liệu mẫu trong terminal thứ hai:

```powershell
docker compose exec api python -m app.seed_demo
```

Đăng nhập tại trang web bằng tài khoản local:

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Quản trị viên | `admin@freshflow.example.com` | `FreshFlowAdmin123!` |
| Khách hàng sinh viên | `student@freshflow.example.com` | `FreshFlowDemo123!` |
| Khách hàng người đi làm | `worker@freshflow.example.com` | `FreshFlowDemo123!` |

Các tài khoản này chỉ dành cho database local. Dừng dịch vụ bằng `Ctrl+C` hoặc `docker compose down`; dữ liệu MySQL vẫn được giữ trong volume. Xóa cả dữ liệu local bằng `docker compose down -v`.

## 3. Chạy không dùng Docker (SQLite)

Mở hai cửa sổ PowerShell tại thư mục gốc repo.

### Cửa sổ 1: API

```powershell
cd apps/api
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -e .
$env:DATABASE_URL = "sqlite:///./freshflow.db"
python -m alembic upgrade head
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Giữ cửa sổ này mở. API docs ở <http://127.0.0.1:8000/docs>.

### Cửa sổ 2: web

```powershell
cd apps/web
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm ci
npm run dev
```

Mở <http://localhost:3000>. File `.env.example` đặt URL REST và WebSocket về API local ở cổng `8000`. Nếu đổi biến môi trường, khởi động lại dev server.

### Nạp dữ liệu mẫu cho SQLite

Trong cửa sổ PowerShell thứ ba:

```powershell
cd apps/api
$env:DATABASE_URL = "sqlite:///./freshflow.db"
.\.venv\Scripts\python.exe -m app.seed_demo
```

Dừng web và API bằng `Ctrl+C` tại từng cửa sổ. Database SQLite được lưu tại `apps/api/freshflow.db`.

## Kiểm tra và xử lý lỗi thường gặp

- Nếu trang web không tải dữ liệu, kiểm tra API tại <http://localhost:8000/api/v1/health> và xác nhận web đang dùng `NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1`.
- Nếu Docker báo cổng `3000`, `8000` hoặc `3307` đang được sử dụng, dừng ứng dụng đang chiếm cổng đó rồi chạy lại.
- Xem log Docker bằng `docker compose logs -f`; xem riêng API bằng `docker compose logs -f api`.
- Nếu migration hoặc cấu hình database lỗi trong môi trường Docker local, dừng stack bằng `docker compose down`; để tạo database local mới và xóa dữ liệu cũ, chạy `docker compose down -v` rồi khởi động lại.
- Nếu không đăng nhập được sau khi chạy lần đầu, xác nhận đã chạy lệnh `seed_demo` và dùng đúng tài khoản ở bảng trên.

Các lệnh kiểm tra mã nguồn hiện có:

```powershell
cd apps/web
npm run typecheck
npm run test:api
npm run build
```

`npm run test:api` kiểm tra tích hợp bằng HTTP/WebSocket mock; nó không thay cho kiểm thử E2E trên trình duyệt. Backend test chạy từ `apps/api` sau khi cài dependency dev bằng `python -m pip install -e ".[dev]"`, rồi `python -m pytest app/tests`.

## Cấu trúc chính

- `apps/web/`: giao diện Next.js.
- `apps/api/`: FastAPI, module nghiệp vụ và Alembic migrations.
- `packages/contracts/`: ghi chú hợp đồng frontend/backend.
- `docs/`: tài liệu API, database và bàn giao.
- `compose.yaml`: cấu hình dịch vụ local.

Không dùng secrets hoặc tài khoản demo cho môi trường production. Thay secret, mật khẩu database, cấu hình HTTPS/WSS và bổ sung quy trình backup trước khi triển khai.
