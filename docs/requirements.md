# FreshFlow — Yêu cầu Hệ thống (System Requirements)

Tài liệu xác định phạm vi chức năng và phi chức năng của nền tảng FreshFlow.

---

## 1. Các Vai trò Người dùng (4 Roles)

1. **Khách hàng (Customer):**
   - Đăng ký tài khoản và xác thực 2 bước bằng OTP (Email/SĐT).
   - Xem bảng tin Newfeed món ngon theo ngày, khám phá danh mục nông sản, xem giá ưu đãi theo nhóm khách hàng (Sinh viên, Người đi làm...).
   - Đặt hàng nhiều sản phẩm, chọn hình thức giao (Điểm tập trung hoặc Giao tận nơi), chọn khung giờ giao và phương thức thanh toán.
   - Hủy đơn hàng khi còn ở trạng thái chờ duyệt.
   - Theo dõi lộ trình đơn hàng thời gian thực và lịch sử đơn hàng.
   - Gửi yêu cầu tìm mặt hàng đặc thù khi chưa có sẵn trên sàn.
   - Đánh giá sản phẩm đã mua và đánh giá thái độ / tốc độ của Shipper.
   - Trò chuyện trực tiếp (Chat Realtime) với Cửa hàng và Shipper.

2. **Chủ Cửa hàng (Shop):**
   - Đăng ký và quản lý hồ sơ gian hàng (tên shop, hotline, địa chỉ kho).
   - Đăng và quản lý danh mục sản phẩm của riêng shop, nhập lô tồn kho theo ngày.
   - Đăng bài Newfeed quảng bá món ăn trong ngày kèm chính sách giá ưu đãi theo nhóm.
   - Tiếp nhận, xác nhận đơn hàng, đóng gói và xác nhận tại điểm giao tập trung hoặc chỉ định Shipper.
   - Xem và phản hồi các đánh giá của khách hàng đối với sản phẩm của shop.
   - Bảng điều khiển tài chính riêng biệt: xem doanh thu, số đơn đã hoàn thành và danh sách đơn phát sinh thuộc shop.
   - Cách ly dữ liệu độc lập, không thấy hoặc can thiệp đơn của shop khác.

3. **Tài xế Giao vận (Shipper):**
   - Nhận đơn hàng được gán hoặc chủ động nhận đơn đang chờ lấy hàng.
   - Cập nhật tiến độ giao hàng: Đã lấy hàng -> Đang giao -> Giao thành công.
   - Thu tiền mặt COD khi giao hàng thành công và ghi nhận vào hệ thống.
   - Xem thống kê ca giao: Số đơn đã giao, tổng tiền COD đã thu hộ.
   - Trò chuyện trực tiếp với Khách hàng để hướng dẫn nhận hàng.

4. **Quản trị viên (Admin):**
   - Giám sát toàn diện bảng điều khiển: doanh thu toàn sàn, tỷ lệ giao thành công, tăng trưởng khách hàng, số lượng shop và shipper.
   - Quản lý người dùng: tìm kiếm, duyệt, khóa/mở tài khoản, quản lý nhóm khách hàng và chiết khấu.
   - Quản lý sản phẩm, tồn kho và cấu hình khung giờ giao hàng / điểm giao tập trung toàn sàn.
   - Quản lý đơn hàng: xem lịch sử đơn, can thiệp điều phối hoặc xử lý đơn ngoại lệ.
   - Cấu hình biểu thuế VAT theo ngành hàng và theo dõi lịch sử điều chỉnh thuế.
   - Phát thông báo Broadcast tới toàn bộ người dùng hoặc theo vai trò cụ thể.
   - Kiểm duyệt nội dung: quản lý danh sách đen từ khóa nhạy cảm, tra cứu vi phạm tiêu chuẩn cộng đồng.
   - Xem nhật ký kiểm toán (Audit Logs) và xuất báo cáo dữ liệu.

---

## 2. Yêu cầu Chức năng Chính

1. **Xác thực & Bảo mật OTP:**
   - Hỗ trợ đăng nhập bằng Email/SĐT và mật khẩu bảo mật băm Argon2/Bcrypt.
   - Sinh và gửi mã OTP 6 số ngẫu nhiên thời hạn 5 phút cho các luồng đăng ký, xác thực hồ sơ và quên mật khẩu.
2. **Quản lý Tồn kho & Đặt hàng Nhất quán:**
   - Tồn kho quản lý theo từng đợt hàng (Batch) theo ngày thu hoạch.
   - Khi đặt hàng, hệ thống kiểm tra tồn kho khóa dòng (Row-level lock / Transaction) để ngăn chặn over-selling.
   - Khách hủy đơn hoặc Shop hủy đơn sẽ tự động hoàn trả số lượng khả dụng vào lô hàng tương ứng.
3. **Chính sách Giá theo Nhóm & Thuế VAT:**
   - Hệ thống tự động tính giá bán phù hợp theo nhóm tài khoản (`STUDENT`, `WORKING`, `GROUP_A`...).
   - Thuế VAT được tính toán tự động dựa trên biểu thuế hiện hành và lưu snapshot vào đơn hàng.
4. **Phân phối & Giao vận Linh hoạt:**
   - Hỗ trợ cả 2 mô hình: Giao tận nơi (Shipper giao cửa) và Điểm giao tập trung (Shop tự tập kết giao cho khách nhận).
5. **Giao tiếp Realtime & Kiểm duyệt Tự động:**
   - Hệ thống WebSocket truyền phát tức thì trạng thái đơn hàng, tin nhắn chat và thông báo.
   - Tự động quét từ khóa nhạy cảm khi người dùng đăng bài Newfeed hoặc gửi tin nhắn chat, chặn vi phạm và lưu nhật ký.

---

## 3. Yêu cầu Phi Chức năng

- **Bảo mật:** Kiểm tra phân quyền đa tầng tại Backend. Không tin cậy dữ liệu giá hay quyền từ client gửi lên.
- **Tính toàn vẹn dữ liệu:** Toàn bộ giao dịch đặt đơn, duyệt đơn và trừ tồn kho thực thi trong Transaction của SQLAlchemy / MySQL.
- **Tính khả dụng:** Frontend đáp ứng mượt mà trên cả trình duyệt Desktop và Thiết bị di động (Mobile Responsive).
- **Khả năng mở rộng:** Kiến trúc phân lớp cho phép dễ dàng phân tách dịch vụ WebSocket Gateway hoặc chuyển đổi sang cơ sở dữ liệu phân tán khi cần.
