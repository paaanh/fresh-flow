# FreshFlow Web

Frontend khởi tạo theo mô tả trong `../../docs/project-overview.md`, sử dụng Next.js App Router, TypeScript, Tailwind CSS và Font Awesome.

## Chạy ứng dụng

```bash
cd apps/web
npm install
npm run dev
```

Mở `http://localhost:3000/login` để đăng nhập backend thật. Các màn hình dùng route dạng `/dashboard`, `/products`, `/products/{id}`, `/orders`, `/orders/{id}`, `/inventory`, `/deliveries`, `/customers`, `/requests`, `/notifications`, `/profile`, `/reports`, `/pricing`, `/audit-logs`, `/moderation`, `/settings`, `/cart` và `/checkout`. Khi chưa đăng nhập, giao diện sử dụng chế độ xem trước và cho phép đổi vai trò tại sidebar. Đăng ký tại `/register`; OTP và khôi phục mật khẩu chưa có API trong tài liệu.

## Cấu hình API

Sao chép `.env.example` thành `.env.local` và đặt URL REST/WebSocket của backend. Hợp đồng gốc là [database.md](../../docs/database.md), cách ánh xạ frontend tại [api-contract.md](../../packages/contracts/api-contract.md). Frontend dùng Bearer JWT trong `sessionStorage` của tab và không gửi cookie. WebSocket truyền token qua query `/api/v1/ws?token=...`. Khi đổi cấu hình môi trường, khởi động lại dev server hoặc build lại bản production.

Xem [hướng dẫn bàn giao và kiểm thử backend](../../docs/backend-handoff.md) để cấu hình CORS, chuẩn bị tài khoản/dữ liệu và xem các điểm hợp đồng cần backend xác nhận, đặc biệt `batch_id` khi đặt hàng.

## Kiểm tra

```bash
npm run typecheck
npm run test:api
npm run build
```

Kiểm tra API sử dụng HTTP/WebSocket giả lập, không thay thế kiểm thử đầu cuối với backend thật.

## Phạm vi demo

Chế độ xem trước có dữ liệu mẫu; một số tùy chọn demo và giỏ hàng được lưu cục bộ. Sau khi đăng nhập, danh sách sản phẩm/đơn hàng/yêu cầu/thông báo được tải từ server và giữ trong bộ nhớ, không lưu bằng các khóa dữ liệu demo. Lỗi API live được hiển thị, không chuyển thao tác thành ghi demo. Những chức năng chưa có endpoint được ghi rõ trong tài liệu bàn giao.
