# FreshFlow — Ghi chú bảo mật

## Xác thực và phân quyền

- API dùng Bearer JWT cho endpoint yêu cầu đăng nhập; endpoint quản trị yêu cầu vai trò ADMIN.
- Mọi kiểm tra quyền phải diễn ra ở backend, kể cả khi giao diện đã ẩn chức năng.
- WebSocket cũng cần xác thực token và giới hạn dữ liệu theo người dùng được phép.

## Secrets và cấu hình

- Không commit `.env`, JWT secret, mật khẩu database, token hoặc dữ liệu cá nhân thật.
- Giá trị mặc định trong `compose.yaml` chỉ phù hợp chạy local; cung cấp secrets riêng khi triển khai.
- Chỉ bật CORS cho các origin cần thiết.

## Dữ liệu và đầu vào

- Xác thực đầu vào bằng schema; kiểm tra quyền sở hữu địa chỉ, đơn và hội thoại trước khi đọc/ghi.
- Dùng ORM/query parameterization; không nối chuỗi đầu vào vào SQL.
- Chỉ lưu và phát dữ liệu cần thiết; không ghi mật khẩu/token vào log.
- Kiểm soát truy cập nhật ký audit và dữ liệu khách hàng.

## Vận hành

- Production cần HTTPS/WSS, secrets an toàn, cập nhật dependency, backup và quy trình khôi phục được kiểm chứng.
- Chưa có đánh giá bảo mật hoặc kiểm thử xâm nhập được ghi nhận trong tài liệu này; các việc đó cần được thực hiện trước triển khai thực tế.
