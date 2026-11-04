# Bàn giao frontend FreshFlow cho backend

Rà soát ngày 25/10/2026. Hợp đồng gốc: [database.md](database.md). Cách ánh xạ frontend: [api-contract.md](../packages/contracts/api-contract.md).

## Chạy frontend

Trong thư mục `apps/web`:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Mở `http://localhost:3000/login`. Đăng nhập bằng tài khoản backend thật để thử API. Khi chưa có token, giao diện sử dụng chế độ xem trước; chuyển vai trò trong chế độ này không tạo phiên đăng nhập backend.

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8000/api/v1/ws
```

Có thể bỏ `NEXT_PUBLIC_WS_URL` để suy ra từ REST base. Dùng `https://` và `wss://` khi triển khai HTTPS. Đổi biến môi trường cần khởi động lại dev server; bản production cần build lại.

## Cấu hình backend để nối

- Cho phép origin chính xác của frontend, ví dụ `http://localhost:3000`; `127.0.0.1` là origin khác.
- CORS cho phép header `Authorization`, `Content-Type` và method `GET`, `POST`, `PATCH`, `PUT`, `DELETE`, `OPTIONS`.
- Frontend dùng `Authorization: Bearer <access_token>`, không gửi cookie (`credentials: omit`). Không cần cookie session để nối bản này.
- WebSocket: `/api/v1/ws?token=<access_token>`. Gateway/proxy cần chuyển tiếp WebSocket Upgrade, kiểm tra token và origin.
- Login gửi JSON `{ "username": "...", "password": "..." }`, nhận `access_token`, `token_type: "bearer"`, sau đó gọi `/auth/me` lấy role. Không phải OAuth2 form-data.
- Chuẩn bị tài khoản `ADMIN`, khách `STUDENT`, khách `WORKING`; một tài khoản bị khóa; category, product, lô đang mở còn hàng và delivery slot cho từng nhóm.

## Điểm cần xác nhận trước khi kiểm thử đầy đủ

| Điểm | Frontend hiện tại | Backend cần xác nhận/bổ sung |
|---|---|---|
| Lô hàng cho khách | Tạo đơn bằng `items[].batch_id`, không thay bằng product ID | `/catalog/me` cần trả `batches` hoặc `inventory_batches` với `id`, `is_open`, `available_quantity`; hoặc thống nhất một endpoint phân bổ lô phía server. Đây là điểm chặn checkout theo tài liệu hiện tại. |
| Phương thức giao | Gửi `PICKUP` hoặc `DELIVERY` | Tài liệu chỉ minh họa `PICKUP`, chưa liệt kê enum giao riêng. Xác nhận `DELIVERY` có hợp lệ không. |
| Giá theo nhóm | Ưu tiên `customer_price`, `price`, `unit_price`, rồi `base_price` trong catalog | Xác nhận field giá thực tế của `/catalog/me` để giỏ hàng hiển thị đúng giá nhóm. Backend luôn tính lại tổng tiền. |
| Danh sách cho admin | Dùng `GET /orders` và `GET /product-requests` | Xác nhận hai endpoint này trả toàn bộ dữ liệu được admin phép xem hay chỉ dữ liệu của tài khoản đang đăng nhập. Tài liệu chưa nói rõ phạm vi theo role. |
| Báo cáo | Gửi ISO `date_from`, `date_to`, tính theo tháng ở Việt Nam; cuối kỳ là mili giây cuối tháng | Xác nhận cách so sánh giới hạn cuối kỳ và JSON tổng hợp. Frontend đọc `revenue`/`total_revenue`, `completed_orders`/`orders_completed`, `average_order_value`, `completion_rate`. |
| Tồn kho | `available_quantity` được hỗ trợ; nhập thêm tạo một batch mới, không giảm kho qua API giả | Tổng đã duyệt/chờ duyệt chỉ chính xác nếu response bổ sung `approved_quantity`/`pending_quantity`; tài liệu `ProductOut` chưa bảo đảm hai field này. |
| Giá đã lưu và từ khóa cũ | Có PUT giá theo nhóm và POST từ khóa; không giả lập GET giá/từ khóa | Chưa có GET price rules, GET/DELETE moderation terms. Màn hình giá live chỉ gửi các ô vừa nhập, không ghi đè bằng giá demo. |
| Màn hình còn thiếu API | OTP, quên mật khẩu, sửa hồ sơ, cấu hình cửa hàng, broadcast, xử lý cảnh báo kiểm duyệt | Các thao tác live báo chưa hỗ trợ. Cần bổ sung hợp đồng trước khi nối. |

Ví dụ phần mở rộng catalog để hai bên thống nhất (chưa được bảo đảm bởi tài liệu gốc):

```json
[
  {
    "id": 1,
    "name": "Sản phẩm thử",
    "base_price": "12000.00",
    "available_quantity": "5.000",
    "batches": [
      { "id": 10, "is_open": true, "available_quantity": "5.000" }
    ]
  }
]
```

## Kịch bản kiểm thử với backend thật

1. Health trả thành công. Đăng ký bằng email, mật khẩu, nhóm `STUDENT`/`WORKING`; thử email trùng và lỗi validation.
2. Login đúng/sai mật khẩu; `/auth/me` trả đúng role, nhóm, tên. Đăng xuất xóa token ở frontend; backend chưa có API thu hồi token. Token hết hạn/401 đưa về đăng nhập; 403 không tự xóa phiên.
3. Admin tạo sản phẩm với `base_price`, `category_id`; thêm batch riêng. Sửa và vô hiệu hóa sản phẩm. Kiểm tra ảnh là URL tối đa 500 ký tự, không phải data URI.
4. PUT giá cho từng nhóm; đăng nhập lại bằng từng nhóm để đối chiếu catalog. Giá nhóm cũ cần kiểm tra bằng API/backend vì chưa có GET price rules.
5. Thêm địa chỉ đủ người nhận, điện thoại, đường, thành phố; đặt mặc định, xóa; tải lại để xác nhận dữ liệu server. Hồ sơ live lấy `/auth/me`, không dùng tên mẫu.
6. Checkout nhận tại điểm không bắt buộc địa chỉ; giao riêng phải chọn địa chỉ thật. Chọn delivery slot và đối chiếu phí, tổng tiền với response tạo đơn. Thử hết hàng, lô đóng, thiếu batch ID và đặt nhiều người đồng thời.
7. Cập nhật đơn bằng ID số backend, không dùng `order_number`. Thử `APPROVED`, `PREPARING`, `DELIVERING`, `COMPLETED`, `REJECTED`, `CANCELLED`; kiểm tra transition sai và lịch sử trạng thái. UI có API service đọc lịch sử, chưa có màn hình timeline riêng.
8. Tạo yêu cầu mặt hàng, admin chuyển `QUOTED`; tải lại và kiểm tra trạng thái. Category/số lượng/ghi chú được gộp trong `description` vì input gốc chỉ có `product_name`, `description`.
9. Thông báo chỉ hiển thị chưa đọc; đánh dấu đọc gọi từng `/notifications/{id}/read`. Kiểm tra không xuất hiện lại sau khi tải trang.
10. Tạo/mở hội thoại bằng ID, gửi tin văn bản; kiểm tra quyền người tham gia và realtime giữa hai phiên. Lỗi gửi phải giữ lại bản nháp.
11. Kiểm tra WebSocket `inventory.updated`, `order.status_changed`, `notification.created`; ngắt/kết nối lại để kiểm tra đồng bộ. Payload event chi tiết chưa có schema nên frontend tải lại danh sách qua REST.
12. Báo cáo tháng và audit log: thử có dữ liệu, rỗng, lỗi API. Khi lỗi không dùng số liệu demo gắn nhãn backend. Biểu đồ doanh thu theo ngày vẫn ghi rõ là minh họa do chưa có API chuỗi ngày.
13. Dùng token khách gọi trực tiếp admin API phải bị backend từ chối. Các số liệu dashboard live là số liệu trong danh sách đã tải, không mặc định coi là báo cáo toàn hệ thống.

## Kiểm tra tự động trước khi gửi

```powershell
npm run typecheck
npm run test:api
npm run build
```

`test:api` dùng HTTP/WebSocket giả lập, đối chiếu 38 REST endpoint phiên bản `/api/v1` với tài liệu gốc, kiểm tra auth/lỗi, URL WebSocket, phân bổ lô và mốc kỳ báo cáo. Không thay thế kiểm thử tích hợp với FastAPI và database. Endpoint metadata `/` không được gọi qua REST base `/api/v1`.

Kết quả trên source bàn giao:

| Kiểm tra | Kết quả |
|---|---|
| `npm run typecheck` | Đạt |
| `npm run test:api` | Đạt: 38 REST endpoint, JWT/lỗi, WebSocket, lô hàng, kỳ báo cáo |
| `npm run build` | Đạt: production build hoàn tất |
| HTTP smoke trên production server | Đạt: 23 route chính trả HTTP 200 và HTML đầy đủ |
| Tương tác trình duyệt và backend/database thật | Chưa thực hiện |

Ở lần rà soát này, `http://localhost:8000/api/v1/health` từ chối kết nối: chưa xác nhận được server thật, CORS, schema response hay nghiệp vụ database. Chưa chạy kiểm thử tương tác trình duyệt.

Khi gửi source, giữ `src`, `public`, `scripts`, `docs`, file tài liệu API, `.env.example`, `package.json`, `package-lock.json`, các file cấu hình và README. Bỏ `node_modules`, `.next`, `tsconfig.tsbuildinfo` và `.env.local`; bên nhận chạy `npm ci`.
