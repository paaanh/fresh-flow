# FreshFlow — Chính sách & Tiêu chuẩn Bảo mật (Security Standards)

Tài liệu quy định các nguyên tắc, kiến trúc phòng thủ và kiểm soát bảo mật trên hệ thống FreshFlow.

---

## 1. Xác thực & Phân quyền Đa tầng (RBAC & Multi-Role)

1. **Cơ chế Token JWT:**
   - Hệ thống phát hành JSON Web Token (JWT) có chữ ký số bí mật thuật toán `HS256`, thời hạn 60 phút.
   - Token chứa thông tin định danh: `sub` (User ID), `role` (`ADMIN`, `SHOP`, `SHIPPER`, `CUSTOMER`), `customer_group`.
   - Kết nối WebSocket cũng bắt buộc phải truyền token qua query string `/ws?token=...` và được giải mã xác thực ngay tại handshake.

2. **Phân quyền vai trò nghiêm ngặt ở Backend:**
   - Mọi endpoint nhạy cảm đều được bảo vệ bằng các Dependency tiêm vào FastAPI:
     - `require_admin`: Chỉ Quản trị viên tối cao mới được chỉnh sửa cấu hình toàn sàn, duyệt người dùng, đổi thuế VAT hay xem báo cáo toàn hệ thống.
     - `require_shop`: Chỉ Cửa hàng mới được quản lý sản phẩm, lô hàng và trả lời đánh giá của gian hàng mình.
     - `require_shipper`: Chỉ Tài xế mới được nhận đơn giao và cập nhật trạng thái vận chuyển.
     - `require_admin_or_shop`: Cho phép cả Admin và Shop thao tác trong phạm vi quyền hạn.
   - Tuyệt đối không tin tưởng client-side: Mọi yêu cầu đều được xác thực lại tại tầng Service/Repository của Backend.

---

## 2. Cách ly Dữ liệu Đa Gian hàng (Multi-tenant Shop Isolation)

- **Ngăn chặn rò rỉ dữ liệu chéo:** Mỗi truy vấn lấy đơn hàng (`/orders`) của tài khoản Shop đều áp dụng điều kiện cứng `Order.shop_id == user.id`. Shop mới tạo hoặc shop đối tác không thể xem hoặc thống kê doanh thu của shop khác.
- **Bảo vệ quyền thao tác:** API cập nhật trạng thái đơn hàng và phân công tài xế kiểm tra quyền sở hữu: nếu `order.shop_id != operator.id`, hệ thống lập tức từ chối và phản hồi lỗi `403 Forbidden`.
- **Phản hồi đánh giá:** Shop chỉ có quyền phản hồi đánh giá (`replyReview`) cho các sản phẩm do chính shop mình tạo ra.

---

## 3. Xác thực OTP (One-Time Password)

- Mã xác thực OTP gồm 6 chữ số ngẫu nhiên an toàn, có thời hạn hiệu lực chính xác trong **5 phút**.
- Mã OTP chỉ được sử dụng đúng một lần (`single-use`), sau khi xác minh thành công hệ thống sẽ thu hồi hoặc xóa bỏ.
- Hỗ trợ xác thực độc lập cho cả Số điện thoại và Email trong các luồng: Đăng ký thành viên, Kích hoạt huy hiệu tài khoản đã xác minh, và Đặt lại mật khẩu khi quên.

---

## 4. Kiểm duyệt Nội dung & Lọc từ khóa Nhạy cảm (Content Moderation)

- Tích hợp bộ máy kiểm duyệt từ khóa tự động trước khi ghi nhận bài đăng Newfeed hoặc tin nhắn chat.
- Mọi nội dung chứa từ ngữ nằm trong danh sách đen (`ModerationTerm`) sẽ bị chặn tức thì với mã lỗi `400 Bad Request`.
- Hành vi vi phạm sẽ được tự động ghi nhận vào bảng `ModerationViolation` kèm User ID và từ khóa vi phạm để phục vụ Quản trị viên rà soát và xử lý tài khoản.

---

## 5. Quản lý Mật khẩu & Bí mật Hệ thống

- **Mật khẩu an toàn:** Mật khẩu người dùng được băm một chiều an toàn bằng thuật toán **Argon2** (kèm hỗ trợ Bcrypt/PBKDF2), không thể đảo ngược và không bao giờ lưu trữ dạng văn bản thuần (plaintext).
- **Phòng chống SQL Injection:** Sử dụng 100% SQLAlchemy 2.0 ORM với câu truy vấn tham số hóa (Parameterized queries).
- **Phòng chống XSS & Dữ liệu rác:** Toàn bộ dữ liệu đầu vào đều được kiểm tra chặt chẽ bởi các Pydantic Schemas với ràng buộc kiểu dữ liệu, độ dài và regex hợp lệ.
- **Nhật ký kiểm toán (Audit Trail):** Mọi hành vi quản trị quan trọng (tạo/sửa sản phẩm, chỉnh biểu thuế VAT, duyệt yêu cầu, tạo đợt tồn kho) đều được lưu vết chi tiết trong bảng `AuditLog`.
