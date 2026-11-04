# FreshFlow — Yêu cầu hệ thống

Tài liệu tóm tắt phạm vi sản phẩm hiện tại. Đối chiếu thêm `project-overview.md` và `api-spec.md` trước khi thay đổi yêu cầu.

## Vai trò

- **Khách hàng:** đăng ký/đăng nhập, xem catalog và lượng hàng, quản lý địa chỉ, đặt và theo dõi đơn, gửi yêu cầu mặt hàng, nhận thông báo.
- **Quản trị viên:** quản lý người dùng, danh mục, sản phẩm, đợt hàng, giá, khung giao hàng, đơn, yêu cầu mặt hàng, kiểm duyệt và báo cáo.

## Yêu cầu chức năng

1. Xác thực người dùng bằng thông tin đăng nhập và phân quyền khách hàng/quản trị viên.
2. Hiển thị sản phẩm, giá theo nhóm khách hàng và số lượng khả dụng.
3. Quản trị viên quản lý sản phẩm, đợt hàng, giá và khung giao hàng.
4. Khách hàng tạo đơn nhiều mặt hàng; máy chủ xác thực dữ liệu và tồn kho trước khi ghi nhận.
5. Quản trị viên cập nhật trạng thái đơn; khách hàng xem đơn và lịch sử trạng thái.
6. Hỗ trợ địa chỉ, yêu cầu mặt hàng, hội thoại/tin nhắn và thông báo trong ứng dụng.
7. Cung cấp báo cáo tổng hợp và nhật ký thao tác quản trị.
8. Phát sự kiện realtime cho thay đổi liên quan; client tải lại trạng thái từ REST API khi kết nối lại.

## Yêu cầu phi chức năng

- Kiểm tra quyền ở backend; không tin giá hoặc quyền do client gửi lên.
- Các thao tác đặt hàng và điều chỉnh tồn kho phải giữ dữ liệu nhất quán.
- Cấu hình bí mật qua biến môi trường; không commit thông tin xác thực.
- Giao diện và API cần xử lý lỗi rõ ràng, hỗ trợ triển khai qua Docker Compose.
- Mục tiêu 1.000–2.000 người dùng đồng thời là mục tiêu cần đo bằng kiểm thử tải trên cấu hình đã chọn, chưa phải cam kết đã xác minh.

## Ngoài phạm vi hiện tại

Thanh toán trực tuyến, nhà cung cấp SMS OTP, lưu trữ ảnh ngoài, sao lưu tự động và triển khai nhiều instance chưa được xác nhận là chức năng bàn giao. Xem `project-overview.md` để biết phạm vi chi tiết.
