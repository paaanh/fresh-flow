# FreshFlow — Kế hoạch & Kết quả Kiểm thử (Testing Plan & Report)

Tài liệu quy định chiến lược kiểm thử đa tầng đảm bảo tính ổn định, toàn vẹn dữ liệu và an toàn nghiệp vụ trên toàn bộ hệ thống FreshFlow.

---

## 1. Các Tầng Kiểm thử (Testing Pyramid)

| Lớp kiểm thử | Công cụ / Thư viện | Phạm vi & Trách nhiệm | Lệnh thực thi |
|---|---|---|---|
| **Backend Unit & Integration** | `pytest`, `pytest-anyio`, `FastAPI TestClient` | Kiểm thử toàn bộ API backend, bảo mật phân quyền RBAC, kiểm duyệt nội dung, cách ly dữ liệu đa shop, logic tồn kho và tính toán thuế VAT. | `python -m pytest apps/api/app/tests -v` |
| **Frontend API Integration** | Node.js Test Harness, `check-integration.cjs` | Kiểm tra tính tương thích giữa Frontend Client (`freshflow` SDK) và 68 endpoints REST API được đặc tả trong `docs/api-spec.md`. | `npm --prefix apps/web run test:api` |
| **Kiểm tra Kiểu dữ liệu tĩnh** | TypeScript Compiler (`tsc`) | Kiểm tra tính nhất quán kiểu dữ liệu giữa schemas Backend và domain types Frontend, đảm bảo không có lỗi type. | `npm --prefix apps/web run typecheck` |
| **Production Build Test** | Next.js Compiler (`next build`) | Biên dịch tối ưu hóa toàn bộ các trang tĩnh và dynamic routes của ứng dụng Web. | `npm --prefix apps/web run build` |
| **End-to-End System Test** | Automated E2E Runner (`tests/e2e`) | Kịch bản xuyên suốt 4 vai trò: Admin, Shop, Customer, Shipper trên toàn bộ luồng nghiệp vụ. | `node tests/e2e/e2e_runner.mjs` |

---

## 2. Kịch bản Kiểm thử Nghiệp vụ Trọng yếu

### 2.1. Xác thực & Xác minh OTP (Authentication & OTP)
- Đăng ký tài khoản với mã OTP hợp lệ $\rightarrow$ Kích hoạt thành công, trạng thái `is_email_verified = True`.
- Đăng ký tài khoản với mã OTP sai hoặc hết hạn $\rightarrow$ Trả về lỗi `400 Bad Request`.
- Đặt lại mật khẩu bằng mã OTP (`/auth/reset-password`) $\rightarrow$ Cập nhật mật khẩu mới và đăng nhập thành công.

### 2.2. Cách ly Dữ liệu Đa Gian hàng (Multi-tenant Shop Isolation)
- Shop A tạo sản phẩm A; Shop B tạo sản phẩm B.
- Khách hàng tạo 2 đơn hàng riêng biệt cho 2 sản phẩm trên.
- **Xác thực:** Shop A chỉ nhìn thấy đơn hàng chứa sản phẩm của mình; Shop B chỉ thấy đơn của mình.
- Shop B cố tình can thiệp chuyển trạng thái đơn hàng của Shop A $\rightarrow$ Trả về lỗi `403 Forbidden`.
- Shop B cố tình trả lời đánh giá đối với sản phẩm của Shop A $\rightarrow$ Trả về lỗi `403 Forbidden`.

### 2.3. Quy trình Điểm giao tập trung & Tự hủy hoàn kho (Pickup & Cancellation)
- Khách đặt đơn nhận tại Điểm giao tập trung (`delivery_type: PICKUP`).
- Shop chủ động: Xác nhận đơn $\rightarrow$ Chuẩn bị hàng $\rightarrow$ Sẵn sàng tại điểm tập kết $\rightarrow$ Bàn giao hoàn tất cho khách không qua Shipper.
- Khách hủy đơn hàng khi chưa duyệt $\rightarrow$ Hệ thống cập nhật trạng thái `CANCELLED` và tự động hoàn trả số lượng khả dụng vào lô tồn kho ban đầu.

### 2.4. Quy trình Shipper Giao tận nơi & Thu hộ COD
- Khách đặt đơn giao tận nơi (`delivery_type: HOME`, `payment_method: COD`).
- Shipper nhận đơn (`claim`) $\rightarrow$ Đến shop lấy hàng (`pickup`) $\rightarrow$ Đang giao hàng (`delivering`) $\rightarrow$ Giao thành công và thu đủ tiền mặt COD (`complete?paid_amount=...`).
- Khách gửi đánh giá chất lượng sản phẩm cho Shop và đánh giá thái độ/tốc độ của Shipper.

### 2.5. Kiểm duyệt Nội dung & Yêu cầu Mặt hàng
- Khách gửi tin nhắn chat chứa từ khóa nhạy cảm nằm trong danh sách đen $\rightarrow$ Hệ thống chặn gửi và ghi nhận vi phạm vào `ModerationViolation`.
- Khách gửi yêu cầu mặt hàng chưa có sẵn $\rightarrow$ Admin báo giá $\rightarrow$ Khách đồng ý mua $\rightarrow$ Chuyển trạng thái sang `ACCEPTED`.

---

## 3. Kết quả Kiểm thử Hiện tại

- **Backend Pytest:** **7 / 7 test suites PASSED** (100%).
- **Frontend Typecheck:** **0 lỗi** (`tsc --noEmit`).
- **REST Routes Integration:** **68 / 68 endpoints PASSED**.
- **Production Build:** Biên dịch thành công 100% tất cả các route.
