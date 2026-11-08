# FreshFlow — Đồng bộ Thời gian thực (Real-time Events & WebSockets)

Tài liệu đặc tả kiến trúc kết nối và các gói tin sự kiện truyền phát qua giao thức WebSocket trên nền tảng FreshFlow.

---

## 1. Giao thức & Kết nối

- **Endpoint kết nối:** `ws://localhost:8000/api/v1/ws?token={access_token}` (hoặc `wss://...` trên production).
- **Yêu cầu bảo mật:** Kết nối bắt buộc phải đính kèm JWT Bearer token hợp lệ tại tham số `token` trên URL. Máy chủ sẽ từ chối kết nối (`403 Forbidden`) nếu thiếu hoặc token không hợp lệ.
- **Quản lý phiên kết nối (Connection Manager):**
  - Backend duy trì danh sách các kết nối đang hoạt động theo `user_id`.
  - Hỗ trợ gửi tin nhắn trực tiếp tới cá nhân (`send_user(user_id, event)`), gửi tới nhóm vai trò, hoặc phát sóng toàn sàn (`broadcast(event)`).

---

## 2. Cấu trúc Gói tin Sự kiện (Event Envelope)

Mọi sự kiện truyền qua WebSocket đều tuân thủ định dạng chuẩn sau:

```json
{
  "event_id": "c1f7b029-7928-444a-9ef8-e1a5f6a911a3",
  "type": "order.status_changed",
  "occurred_at": "2026-11-08T22:30:00.123456Z",
  "data": {
    "order_id": 105,
    "status": "DELIVERING"
  }
}
```

---

## 3. Danh sách các Sự kiện Realtime được Hỗ trợ

| Tên Sự kiện (`type`) | Phạm vi gửi | Dữ liệu kèm theo (`data`) | Mô tả & Tác vụ Client |
|---|---|---|---|
| `connection.ready` | Cá nhân | `{ "user_id": 12, "role": "CUSTOMER" }` | Máy chủ gửi ngay khi kết nối WebSocket thành công. |
| `inventory.updated` | Toàn sàn (Broadcast) | `{ "product_id": 4, "batch_id": 10 }` | Số lượng tồn kho thay đổi do có đơn mua mới hoặc nhập kho; Client tự động làm mới số lượng khả dụng trên giao diện. |
| `order.new` | Chủ Shop | `{ "order_id": 108, "order_number": "FF-261108-..." }` | Có đơn hàng mới phát sinh thuộc gian hàng của Shop; Shop phát chuông báo và cập nhật danh sách đơn cần chuẩn bị. |
| `order.status_changed` | Khách hàng, Shop, Shipper | `{ "order_id": 108, "status": "CONFIRMED" }` | Đơn hàng chuyển trạng thái; cập nhật badge tiến độ và dòng thời gian của đơn. |
| `order.assigned` | Shipper & Shop | `{ "order_id": 108, "shipper_id": 3 }` | Đơn hàng đã được chỉ định Shipper giao; Shipper nhận thông báo đơn mới cần đi lấy. |
| `notification.created` | Cá nhân | `{ "id": 45, "title": "...", "body": "...", "event_type": "..." }` | Có thông báo mới gửi tới tài khoản; tăng số đếm badge chuông thông báo trên thanh header. |
| `chat.message` | Người nhận tin nhắn | `{ "id": 89, "sender_id": 2, "order_id": 108, "content": "..." }` | Tin nhắn trao đổi mới trong cuộc hội thoại hoặc đơn hàng; cuộn tin nhắn xuống dưới cùng. |

---

## 4. Xử lý Mất kết nối & Đồng bộ lại (Reconnection Strategy)

- **Cơ chế tại Frontend ([RealtimeClient](file:///c:/Users/LEGION/Downloads/FreshFlow/apps/web/src/lib/realtime.ts)):**
  - Khi phát hiện sự cố đứt kết nối mạng hoặc server khởi động lại (`onclose` / `onerror`), client sẽ tự động thử kết nối lại theo thuật toán lũy thừa (Exponential Backoff: 1s, 2s, 4s, tối đa 10s).
  - Ngay khi kết nối lại thành công, client chủ động gọi lại các REST API tương ứng (`freshflow.orders()`, `freshflow.notifications()`, `freshflow.catalog()`) để bù đắp bất kỳ sự kiện nào có thể đã bị lỡ trong thời gian gián đoạn.
