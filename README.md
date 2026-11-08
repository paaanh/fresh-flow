# FreshFlow - Nền tảng Phân phối Nông sản Tươi sống Đa vai trò

**FreshFlow** là hệ thống thương mại điện tử và phân phối nông sản tươi sống toàn diện, kết nối trực tiếp Nhà vườn/Cửa hàng nông sản (Shop), Đơn vị vận chuyển (Shipper), Người tiêu dùng (Customer) dưới sự kiểm soát và điều phối tập trung của Quản trị viên (Admin).

Hệ thống được xây dựng theo kiến trúc hiện đại với **FastAPI** (Python 3.11+) ở backend và **Next.js 14 App Router** (TypeScript, Tailwind CSS) ở frontend, hỗ trợ đồng thời REST API và giao thức thời gian thực WebSocket.

---

## 🌟 Tính năng nổi bật & 4 Phân hệ Người dùng

Hệ thống phân quyền nghiêm ngặt theo 4 vai trò (**ADMIN**, **SHOP**, **SHIPPER**, **CUSTOMER**):

| Vai trò | Đường dẫn Portal | Chức năng chính |
|---|---|---|
| **ADMIN** | `/dashboard`, `/admin/*` | • Quản lý danh mục, sản phẩm, đợt hàng và kiểm soát tồn kho (khóa dòng theo ID FIFO).<br>• Cấu hình khung giá linh hoạt theo từng nhóm đối tượng khách hàng.<br>• Quản trị đơn hàng toàn sàn, phân bổ Shipper cho đơn giao tận nơi hoặc điểm nhận tập trung.<br>• Quản lý danh sách khung giờ giao hàng (`delivery_slots`) kèm phụ phí và nhóm áp dụng.<br>• Cấu hình thuế suất VAT động toàn sàn (mặc định 8%).<br>• Kiểm duyệt từ ngữ cấm (Content Moderation), theo dõi báo cáo doanh thu và nhật ký kiểm toán (Audit Logs). |
| **SHOP** | `/shop` | • **Shop Portal độc lập**: Cách ly dữ liệu hoàn toàn giữa các nhà bán hàng (Multi-tenant Data Isolation).<br>• Đăng bán và quản lý danh mục/sản phẩm của riêng gian hàng.<br>• Quản lý đơn hàng phát sinh thuộc gian hàng mình, đóng gói và bàn giao hàng cho Shipper.<br>• Thống kê doanh thu, tỷ lệ đơn hoàn thành và quản lý phản hồi/đánh giá của khách hàng.<br>• Đăng bài chia sẻ nông sản sạch trên Bảng tin (Newfeed). |
| **SHIPPER** | `/shipper` | • **Shipper Portal chuyên biệt**: Tiếp nhận đơn hàng được điều phối từ Admin hoặc Shop.<br>• Xem lộ trình giao hàng tận nơi hoặc giao đến các Điểm nhận hàng tập trung (Hub).<br>• Cập nhật trạng thái giao vận theo thời gian thực (`OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`).<br>• Xác nhận thu tiền mặt khi nhận hàng (COD) và đối soát tiền thu hộ. |
| **CUSTOMER** | `/products`, `/cart`, `/checkout`, `/orders` | • Mua sắm theo danh mục nông sản sạch, hiển thị giá ưu đãi theo nhóm (Sinh viên, Người đi làm, Hộ gia đình).<br>• Đặt hàng hỗ trợ chọn linh hoạt: **Giao tận nơi** hoặc **Điểm nhận hàng tập trung** kèm lựa chọn **Khung giờ giao hàng** phù hợp.<br>• Theo dõi tiến trình đơn hàng và lịch sử đơn hàng trực quan.<br>• Đánh giá chất lượng sản phẩm (Reviews kèm xếp hạng sao).<br>• Yêu cầu mặt hàng mới và nhận thông báo biến động đơn hàng realtime. |

### Các module hệ thống nâng cao
- **Đồng bộ Thời gian thực (WebSocket)**: Sự kiện trạng thái đơn hàng (`order.status_changed`), cập nhật tồn kho (`inventory.updated`), thông báo cá nhân (`notification.created`) và Chat trực tiếp giữa các bên.
- **Xác thực & Bảo mật (OTP & RBAC)**: Xác thực JWT token, cấp mã OTP xác minh số điện thoại/email (hỗ trợ mô phỏng test), kiểm tra quyền hạn (Role-based Access Control) tại tất cả các endpoint API.
- **Khóa tồn kho an toàn**: Thuật toán trừ kho theo thứ tự đợt hàng, khóa dòng `FOR UPDATE` trong giao dịch database ngăn ngừa triệt để race-condition đặt vượt tồn.

---

## 🛠 Yêu cầu hệ thống

- **Cách 1: Chạy bằng Docker Compose (Khuyến nghị cho Production/Staging)**
  - Docker Desktop (hỗ trợ Docker Compose v2).
- **Cách 2: Chạy trực tiếp trên máy cục bộ (Windows / Linux / macOS)**
  - Python 3.11 trở lên.
  - Node.js 20 trở lên và npm.
  - SQLite (mặc định cho dev local) hoặc MySQL 8.x.

---

## 🚀 Hướng dẫn khởi chạy

### Cách 1: Khởi chạy toàn bộ bằng Docker Compose (Khuyến nghị)

1. Sao chép file cấu hình môi trường:
   ```powershell
   Copy-Item .env.example .env
   ```

2. Khởi động các container (MySQL 8, FastAPI backend, Next.js web):
   ```powershell
   docker compose up --build
   ```

3. Nạp dữ liệu mẫu ban đầu (chạy ở một terminal mới):
   ```powershell
   docker compose exec api python -m app.seed_demo
   ```

4. Truy cập hệ thống:
   - **Giao diện Web**: <http://localhost:3000>
   - **Tài liệu API Swagger**: <http://localhost:8000/docs>
   - **API Health Check**: <http://localhost:8000/api/v1/health>

---

### Cách 2: Khởi chạy thủ công trên máy cục bộ (Sử dụng SQLite)

Mở 2 cửa sổ terminal tại thư mục gốc của repository:

#### Cửa sổ 1: Khởi chạy FastAPI Backend
```powershell
cd apps/api
# Kích hoạt venv (nếu đã tạo sẵn) hoặc tạo mới:
# py -3.11 -m venv .venv; .\.venv\Scripts\Activate.ps1
.\.venv\Scripts\Activate.ps1
pip install -e .
$env:DATABASE_URL = "sqlite:///./freshflow.db"

# Chạy migration database và khởi động uvicorn server
python -m alembic upgrade head
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

#### Cửa sổ 2: Khởi chạy Next.js Frontend
```powershell
cd apps/web
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm install
npm run dev
```

#### Nạp dữ liệu mẫu cho cơ sở dữ liệu SQLite
Mở terminal thứ 3 tại thư mục `apps/api`:
```powershell
cd apps/api
$env:DATABASE_URL = "sqlite:///./freshflow.db"
.\.venv\Scripts\python.exe -m app.seed_demo
```

---

## 👥 Danh sách Tài khoản Kiểm thử Mặc định

Sau khi chạy lệnh `seed_demo`, hệ thống được nạp sẵn 5 tài khoản đại diện cho 4 phân hệ người dùng:

| Vai trò | Tên người dùng | Email | Mật khẩu mặc định | Ghi chú |
|---|---|---|---|---|
| **Quản trị viên (ADMIN)** | Platform Admin | `admin@freshflow.example.com` | `FreshFlowAdmin123!` | Toàn quyền kiểm soát hệ thống, duyệt đơn, tạo khung giờ, cấu hình VAT |
| **Cửa hàng (SHOP)** | Đà Lạt Green Farm | `shop@freshflow.example.com` | `FreshFlowShop123!` | Shop Portal, quản lý kho hàng và đơn hàng của riêng shop |
| **Tài xế giao hàng (SHIPPER)** | Shipper Minh Long | `shipper@freshflow.example.com` | `FreshFlowDemo123!` | Shipper Portal, cập nhật tiến độ giao vận và thu tiền COD |
| **Khách hàng (CUSTOMER)** | Nguyễn Văn A | `student@freshflow.example.com` | `FreshFlowDemo123!` | Nhóm khách hàng: **Sinh viên** (áp dụng chính sách giá sinh viên) |
| **Khách hàng (CUSTOMER)** | Trần Thị B | `worker@freshflow.example.com` | `FreshFlowDemo123!` | Nhóm khách hàng: **Người đi làm** (chính sách giá người đi làm) |

---

## 🧪 Kiểm thử Hệ thống (Test Suites)

FreshFlow trang bị hệ thống kiểm thử toàn diện từ Unit test, Backend Integration test đến Frontend Integration test và End-to-End (E2E) test:

### 1. Backend Test Suite (Pytest)
Kiểm thử toàn diện 18 bảng dữ liệu, phân quyền 4 role, xử lý transaction, khóa tồn kho, tính năng đánh giá và cách ly dữ liệu shop:
```powershell
cd apps/api
.\.venv\Scripts\python.exe -m pytest app/tests -v
```

### 2. Frontend Typecheck (TypeScript)
Xác thực tính toàn vẹn kiểu dữ liệu của toàn bộ ứng dụng Next.js:
```powershell
cd apps/web
npm run typecheck
```

### 3. API Contract Integration Test
Kiểm thử kiểm tra khớp 100% hợp đồng tài liệu `docs/api-spec.md` với 68 route REST và WebSocket:
```powershell
cd apps/web
npm run test:api
```

### 4. End-to-End Test Suite (E2E Runner)
Kiểm thử luồng nghiệp vụ khép kín xuyên suốt 4 vai trò (Đăng ký/Đăng nhập -> Shop tạo sản phẩm -> Khách mua hàng & chọn khung giờ -> Admin duyệt & điều phối -> Shipper giao hàng & thu COD -> Khách đánh giá):
```powershell
cd apps/web
npm run test:e2e
```

---

## 📁 Cấu trúc Thư mục Dự án

```
FreshFlow/
├── apps/
│   ├── api/                       # Backend FastAPI (REST API, WebSockets, SQLAlchemy Models)
│   │   ├── app/
│   │   │   ├── modules/           # Module nghiệp vụ: auth, catalog, orders, delivery, reviews, etc.
│   │   │   ├── core/              # Config, security JWT, database engine, WebSocket manager
│   │   │   ├── db/                # Khởi tạo DB, migrations Alembic
│   │   │   ├── tests/             # Bộ kiểm thử Pytest tự động
│   │   │   └── seed_demo.py       # Script nạp dữ liệu demo mẫu
│   │   └── pyproject.toml
│   └── web/                       # Frontend Next.js 14 (App Router)
│       ├── src/
│       │   ├── app/               # Next.js App Router pages & layouts
│       │   ├── components/        # UI components: Shop Portal, Shipper Portal, Newfeed, Chat...
│       │   ├── features/          # Giao diện chức năng: Admin, Customer, Shipper...
│       │   └── lib/               # Client API REST (`api.ts`), WebSocket client, State Store
│       ├── tests/                 # Script kiểm thử tích hợp REST routes
│       └── package.json
├── docs/                          # Tài liệu kỹ thuật chi tiết
│   ├── api-spec.md                # Đặc tả 68 routes REST API chi tiết
│   ├── database.md                # Thiết kế 18 bảng quan hệ cơ sở dữ liệu
│   ├── architecture.md            # Thiết kế kiến trúc tổng thể hệ thống
│   ├── requirements.md            # Yêu cầu nghiệp vụ chi tiết
│   ├── security.md                # Chính sách bảo mật & phân quyền
│   ├── realtime-events.md         # Quy chuẩn envelope và danh mục sự kiện WebSocket
│   └── testing-plan.md            # Kế hoạch và kịch bản kiểm thử nghiệm thu
├── tests/
│   └── e2e/                       # Kịch bản E2E kiểm thử đa vai trò
├── compose.yaml                   # Cấu hình Docker Compose cho toàn bộ dịch vụ
└── README.md                      # Tài liệu hướng dẫn chính
```

---

## 🔒 Khuyến cáo Bảo mật & Triển khai Production

1. **Bí mật & Khóa ký**: Thay đổi ngay `JWT_SECRET`, mật khẩu MySQL, và cấu hình `ENVIRONMENT=production` trước khi triển khai môi trường công cộng.
2. **Giao thức bảo mật**: Bắt buộc cấu hình SSL/TLS (HTTPS) cho REST API và WSS cho WebSocket.
3. **Dịch vụ bên thứ ba**: Cấu hình nhà cung cấp dịch vụ SMS/Email thực tế (Twilio, AWS SES, SendGrid) cho chức năng gửi OTP trong môi trường thực tế.
