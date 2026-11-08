# FreshFlow Web Frontend

Frontend hiện đại cho nền tảng thương mại điện tử nông sản **FreshFlow**, được xây dựng bằng **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS** và **Font Awesome**. Ứng dụng cung cấp giao diện phản hồi nhanh (Responsive UI) tối ưu cho cả 4 vai trò người dùng trong hệ sinh thái.

---

## 💻 Các Phân hệ Giao diện & Định tuyến (Routing)

Giao diện được module hóa theo từng vai trò cụ thể:

### 1. Phân hệ Quản trị viên (Admin Portal)
- `/dashboard`: Tổng quan chỉ số vận hành toàn sàn (doanh thu, đơn hàng, mặt hàng cần duyệt).
- `/products`, `/inventory`: Quản lý danh mục, thông tin sản phẩm và quản lý các đợt hàng (lô, hạn sử dụng, số lượng).
- `/orders`, `/orders/[id]`: Theo dõi đơn hàng toàn sàn, duyệt đơn và điều phối gán Shipper.
- `/deliveries`: Điều phối vận chuyển và **Quản lý cấu hình khung giờ giao hàng** (`Delivery Time Slots` - thêm/xóa khung giờ, phụ phí, nhóm áp dụng).
- `/pricing`: Thiết lập bảng giá theo nhóm đối tượng khách hàng (Sinh viên, Người đi làm, Hộ gia đình).
- `/reports`: Báo cáo biểu đồ doanh thu theo thời gian và top sản phẩm bán chạy.
- `/moderation`, `/audit-logs`: Quản lý danh sách từ khóa cấm và theo dõi lịch sử thao tác hệ thống.

### 2. Phân hệ Gian hàng (Shop Portal)
- `/shop`: **Cổng quản lý gian hàng độc lập** (Multi-tenant) với cơ chế cách ly dữ liệu:
  - *Tổng quan cửa hàng*: Thống kê doanh thu shop, đơn cần chuẩn bị, sản phẩm đang bán.
  - *Gian hàng sản phẩm*: Thêm, sửa, xóa sản phẩm thuộc sở hữu của shop.
  - *Đơn hàng phát sinh*: Tiếp nhận và chuẩn bị các đơn hàng khách đặt từ shop.
  - *Đánh giá & Phản hồi*: Xem phản hồi và điểm đánh giá của khách hàng dành riêng cho sản phẩm của shop.
- `/newfeed`: Bảng tin nông nghiệp để các shop đăng bài viết, hình ảnh giới thiệu nông sản sạch.

### 3. Phân hệ Vận chuyển (Shipper Portal)
- `/shipper`: Giao diện dành riêng cho tài xế giao hàng:
  - Danh sách đơn hàng được điều phối.
  - Phân loại hình thức giao: **Giao tận nơi** hoặc **Điểm nhận hàng tập trung (Hub)**.
  - Cập nhật tiến độ giao: Nhận đơn -> Đang giao -> Đã giao thành công / Hủy giao.
  - Xác nhận thu tiền mặt khi nhận hàng (Thu hộ COD).

### 4. Phân hệ Khách hàng (Customer Experience)
- `/`: Trang chủ khám phá nông sản theo danh mục và gợi ý.
- `/products`, `/products/[id]`: Chi tiết sản phẩm, nguồn gốc xuất xứ, số lượng khả dụng và xem/viết đánh giá (Reviews).
- `/cart`, `/checkout`: Giỏ hàng thông minh, hỗ trợ chọn hình thức nhận hàng (Giao tận nơi / Điểm tập trung), lựa chọn **Khung giờ giao hàng** mong muốn, áp dụng thuế VAT minh bạch.
- `/orders`, `/orders/[id]`: Theo dõi hành trình đơn hàng và lịch sử mua sắm.
- `/requests`: Gửi yêu cầu mặt hàng nông sản mới mà sàn chưa có.
- `/notifications`: Hộp thư thông báo cập nhật đơn hàng theo thời gian thực.
- `/chat`: Khung chat trực tiếp kết nối khách hàng với Shop hoặc Hỗ trợ viên.

---

## 🚀 Hướng dẫn Cài đặt & Khởi chạy

### 1. Cài đặt dependencies
```powershell
cd apps/web
npm install
```

### 2. Cấu hình biến môi trường
Tạo file `.env.local` từ mẫu:
```powershell
Copy-Item .env.example .env.local
```

Nội dung `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8000/api/v1/ws
```

### 3. Khởi động môi trường phát triển
```powershell
npm run dev
```
Truy cập ứng dụng tại: <http://localhost:3000>

---

## 🧪 Các Lệnh Kiểm tra & Build

```powershell
# 1. Kiểm tra kiểu dữ liệu TypeScript (Zero errors)
npm run typecheck

# 2. Kiểm thử tích hợp toàn bộ 68 routes REST API
npm run test:api

# 3. Chạy kịch bản kiểm thử E2E xuyên suốt 4 vai trò
npm run test:e2e

# 4. Build phiên bản triển khai production
npm run build
```

---

## 👥 Tài khoản Mẫu Đăng nhập

Đăng nhập nhanh tại <http://localhost:3000/login>:
- **Admin**: `admin@freshflow.example.com` / `FreshFlowAdmin123!`
- **Shop**: `shop@freshflow.example.com` / `FreshFlowShop123!`
- **Shipper**: `shipper@freshflow.example.com` / `FreshFlowDemo123!`
- **Khách hàng**: `student@freshflow.example.com` hoặc `worker@freshflow.example.com` / `FreshFlowDemo123!`
