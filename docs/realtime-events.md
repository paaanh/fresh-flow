# FreshFlow — Realtime events

## Kết nối

- WebSocket: `/api/v1/ws?token={access_token}` (theo endpoint backend hiện tại).
- Client phải có token hợp lệ; máy chủ kiểm tra nguồn kết nối theo cấu hình.
- Khi mất kết nối, client nên kết nối lại có backoff và tải dữ liệu mới nhất qua REST API.

## Nguyên tắc payload

Các sự kiện nên dùng JSON có `type`, `data` và thời điểm phát nếu backend cung cấp. Không xem WebSocket là nguồn dữ liệu duy nhất; phân quyền và trạng thái chuẩn luôn do API/database quyết định.

| Miền | Thay đổi cần thông báo | Client đồng bộ lại |
|---|---|---|
| Inventory/catalog | Số lượng khả dụng hoặc sản phẩm thay đổi | Danh sách sản phẩm/catalog |
| Orders | Trạng thái đơn thay đổi | Chi tiết đơn và lịch sử |
| Chat | Có tin nhắn mới | Danh sách tin nhắn hội thoại |
| Notifications | Có thông báo hoặc trạng thái đọc đổi | Danh sách thông báo |

Tên event và schema cụ thể cần được đồng bộ với `packages/contracts/api-contract.md` và mã backend. Tài liệu này không giả định event type chưa được xác nhận trong triển khai.

## An toàn và độ tin cậy

Không gửi bí mật hoặc dữ liệu người dùng không cần thiết trong event. Chỉ phát dữ liệu tới người dùng/phòng có quyền. Client cần xử lý event trùng hoặc đến trễ một cách an toàn và đối chiếu trạng thái qua REST.
