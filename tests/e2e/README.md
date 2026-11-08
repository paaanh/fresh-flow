# FreshFlow — Kiểm thử Hệ thống Toàn diện (End-to-End Tests)

Thư mục chứa kịch bản kiểm thử quy trình nghiệp vụ xuyên suốt 4 vai trò trên nền tảng FreshFlow: **Quản trị viên (Admin)**, **Cửa hàng (Shop)**, **Khách hàng (Customer)** và **Tài xế (Shipper)**.

---

## 1. Kịch bản Quy trình Nghiệp vụ được Tự động hóa

Runner `e2e_runner.mjs` thực thi toàn bộ chu trình thực tế từ A đến Z:
1. **Kiểm tra sức khỏe hệ thống (Health check):** Xác nhận API backend và kết nối cơ sở dữ liệu hoạt động bình thường.
2. **Quản trị viên khởi tạo:** Đăng nhập tài khoản Quản trị tối cao.
3. **Đăng ký Gian hàng mới:** Tạo tài khoản Shop đối tác và đăng nhập lấy token.
4. **Nhập hàng & Quản lý tồn kho:** Shop tạo sản phẩm nông sản mới và nhập lô hàng thu hoạch theo ngày (`batch_date`, `initial_quantity`).
5. **Khách hàng đăng ký qua mã OTP:** Gửi yêu cầu sinh mã OTP, nhập OTP xác thực và hoàn tất đăng ký tài khoản khách hàng.
6. **Đặt hàng trực tuyến:** Khách hàng chọn mua sản phẩm từ lô tồn kho, chọn hình thức giao tận nơi (`HOME`) và thanh toán khi nhận hàng (`COD`).
7. **Shop xác nhận & đóng gói:** Cửa hàng tiếp nhận đơn hàng, chuyển trạng thái từ `PENDING` $\rightarrow$ `CONFIRMED` $\rightarrow$ `PREPARING` $\rightarrow$ `READY_FOR_PICKUP`.
8. **Shipper giao hàng & Thu hộ COD:** Tài xế nhận đơn (`claim`), đến lấy hàng (`pickup`), tiến hành giao (`delivering`), và xác nhận hoàn tất giao hàng kèm số tiền mặt thu hộ (`complete`).
9. **Đánh giá hai chiều:** Khách hàng gửi đánh giá sao cho sản phẩm và đánh giá thái độ/tốc độ của Shipper.
10. **Shop phản hồi đánh giá:** Cửa hàng gửi tin nhắn cảm ơn / phản hồi đánh giá của khách.
11. **Admin đối soát & Báo cáo:** Quản trị viên kiểm tra bảng điều khiển tài chính, doanh thu thực nhận và tỷ lệ giao hàng thành công.

---

## 2. Hướng dẫn Chạy Kiểm thử E2E

### Điều kiện tiên quyết:
Máy chủ Backend đang chạy tại `http://localhost:8000` (hoặc cổng cấu hình qua biến môi trường `API_URL`).

```bash
# Chạy với cổng mặc định
node tests/e2e/e2e_runner.mjs

# Hoặc tùy biến URL máy chủ
API_URL=http://localhost:8000/api/v1 node tests/e2e/e2e_runner.mjs
```
