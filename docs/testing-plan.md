# FreshFlow — Kế hoạch kiểm thử

## Phạm vi kiểm thử

| Lớp | Công cụ/điểm bắt đầu | Mục tiêu |
|---|---|---|
| Backend | Pytest tại `apps/api/app/tests` | Nghiệp vụ, quyền, xác thực và tính nhất quán dữ liệu |
| Web/API integration | `npm run test:api` tại `apps/web` | Tương tác frontend với API đang chạy |
| Frontend | `npm run typecheck`, `npm run build` | Kiểm tra kiểu và khả năng build |
| End-to-end | `tests/e2e` (thư mục chuẩn bị) | Luồng đăng nhập, catalog, đặt hàng và quản trị trên trình duyệt |

## Ca kiểm thử ưu tiên

1. Đăng ký/đăng nhập hợp lệ và từ chối thông tin sai; endpoint riêng tư từ chối token thiếu/hết hạn.
2. Khách hàng không truy cập được endpoint admin; người dùng không đọc/sửa dữ liệu của người khác.
3. Catalog trả giá theo nhóm và lượng khả dụng phù hợp.
4. Đặt đơn hợp lệ cập nhật dữ liệu nhất quán; số lượng vượt tồn bị từ chối; từ chối/hủy đơn giữ đúng quy tắc tồn kho.
5. Cập nhật trạng thái đơn, thông báo và lịch sử phản ánh cùng trạng thái.
6. WebSocket yêu cầu xác thực và client đồng bộ qua REST sau khi kết nối lại.

## Môi trường và dữ liệu

Dùng database kiểm thử riêng hoặc dữ liệu seed giả lập; không dùng dữ liệu khách hàng thật. Kiểm thử tích hợp cần API/database sẵn sàng. Không chạy kiểm thử phá hủy trên môi trường dùng chung.

## Hiệu năng

Mục tiêu đồng thời chỉ được xác nhận sau khi đo trên cấu hình triển khai cụ thể, với tải REST và WebSocket đại diện; lưu lại cấu hình, kịch bản, latency, throughput và lỗi.
