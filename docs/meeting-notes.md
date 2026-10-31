# PHÂN CÔNG CÔNG VIỆC — FRESHFLOW

**Học phần:** Lập trình mạng, năm học 2026–2027  
**Dự án:** FreshFlow — Hệ thống quản lý tồn kho và đặt hàng theo thời gian thực  
**Định hướng topic:** Chủ đề 3 — Ứng dụng mạng (Client–Server). Trọng tâm trình bày là giao tiếp REST/WebSocket, quản lý nhiều client, đồng bộ trạng thái, xử lý lỗi và đo kiểm; đây không chỉ là một ứng dụng giao diện và cơ sở dữ liệu.

## Ngôn ngữ và công nghệ thống nhất

| Phần | Lựa chọn | Dùng để |
|---|---|---|
| Frontend (người 2, 3) | **TypeScript** với Next.js | Giao diện khách hàng và quản trị; type dữ liệu dùng chung giữa các màn hình. |
| Backend (người 4) | **Python 3** với FastAPI | REST API, nghiệp vụ, xác thực/phân quyền và endpoint WebSocket. |
| Giao tiếp | **HTTP/HTTPS + REST/JSON** và **WebSocket/WSS** | REST cho request/response; WebSocket cho cập nhật tồn kho, trạng thái đơn và sự kiện realtime. |
| Database | **MySQL 8**; SQLAlchemy 2.x + Alembic | Lưu dữ liệu nghiệp vụ, transaction và migration schema. |
| Giao diện | Tailwind CSS; Font Awesome | Responsive layout và biểu tượng cho ứng dụng web. |
| Kiểm tra | Pytest/HTTPX cho API; Playwright cho luồng trình duyệt | Kiểm tra nghiệp vụ backend và các luồng chính end-to-end. |

**Quy ước:** Frontend không dùng JavaScript thuần cho mã ứng dụng mới; viết TypeScript (`.ts`/`.tsx`). Backend viết Python (`.py`). JSON là định dạng payload thống nhất cho REST và WebSocket. SQL dùng để định nghĩa/truy vấn dữ liệu MySQL thông qua SQLAlchemy; thay đổi schema được quản lý bằng Alembic. Không bổ sung ngôn ngữ/framework khác nếu chưa thống nhất trong nhóm và cập nhật tài liệu.

> Điền tên, mã số sinh viên và email sau khi nhóm thống nhất. Tỷ lệ đóng góp dưới đây là mức dự kiến để bắt đầu; nhóm cập nhật theo phần việc thực tế và quy định của giảng viên.

## 1. Thành viên và trách nhiệm chính

| Người | Thành viên | Trách nhiệm chính | Phần đóng góp dự kiến |
|---|---|---|---:|
| 1 | `[Họ tên — MSSV]` | Viết báo cáo kỹ thuật, thiết kế/thực hiện thực nghiệm và tổng hợp tài liệu bàn giao | 25% |
| 2 | `[Họ tên — MSSV]` | Frontend khách hàng: trang danh mục, tồn kho, giỏ hàng/đặt hàng và cập nhật realtime | 25% |
| 3 | `[Họ tên — MSSV]` | Frontend quản trị: dashboard, quản lý sản phẩm/tồn kho, xử lý đơn và trạng thái realtime | 25% |
| 4 | `[Họ tên — MSSV]` | Backend: API, dữ liệu, nghiệp vụ đơn/tồn kho, WebSocket và xử lý nhiều kết nối | 25% |
|  |  | **Tổng** | **100%** |

## 2. Đầu việc chi tiết

### Người 1 — Báo cáo, thiết kế mạng và thực nghiệm

- Lập dàn ý theo `Instruction.md`: abstract, introduction, background/related work, problem definition, proposed approach, architecture, communication design, implementation, experimental setup/results, discussion, novelty/contributions, limitations, future work, conclusion và references.
- Chốt mô tả bài toán, mục tiêu, phạm vi MVP, luồng dữ liệu và sơ đồ kiến trúc cùng các thành viên kỹ thuật; lưu sơ đồ tại `statics/architecture.png`.
- Viết đặc tả giao tiếp REST và WebSocket: endpoint/sự kiện, định dạng JSON, thứ tự trao đổi, xác thực/phân quyền, lỗi, timeout, mất kết nối và reconnect; lưu sơ đồ/đặc tả tại `statics/` hoặc `docs/`.
- Chuẩn bị kịch bản kiểm thử mạng: một client, nhiều client đồng thời, cập nhật tồn kho/đơn, dữ liệu sai, ngắt kết nối và kết nối lại. Ghi lại môi trường, cách chạy, log và số đo thực tế.
- Tổng hợp kết quả từ người 2–4; chỉ đưa vào báo cáo số liệu đã chạy và có thể lặp lại. Không tự tạo kết quả, biểu đồ, trích dẫn hoặc tuyên bố tính năng chưa triển khai.
- Hoàn thiện `README.md` hướng dẫn cài đặt/chạy/test, thực nghiệm, novelty, giới hạn và tài liệu tham khảo; rà soát tên file nộp theo `Instruction.md`/`Submission.md`.
- Kiểm tra Compilatio và sửa báo cáo để đáp ứng ngưỡng môn học; chuẩn bị bản `.docx` theo mẫu tên `NhomXX_FreshFlow_Report.docx`.

**Bàn giao:** báo cáo `.docx`, sơ đồ kiến trúc và giao tiếp, kịch bản/kết quả thực nghiệm, README hướng dẫn chạy, danh mục nguồn trích dẫn.

### Người 2 — Frontend khách hàng

- Phụ trách giao diện trong `apps/web/src/app/(public)` và `apps/web/src/app/(customer)`: trang giới thiệu/đăng nhập, trang khách hàng, hồ sơ và các luồng mua hàng.
- Theo phạm vi README, triển khai lần lượt: đăng nhập/đăng ký theo khả năng backend; danh mục và chi tiết sản phẩm; giá theo nhóm; giỏ hàng/đặt đơn nhiều mặt hàng; lịch sử/trạng thái đơn; quản lý tối đa ba địa chỉ; yêu cầu mặt hàng; thông báo; chat nếu backend đã có.
- Tập trung trước vào luồng MVP: xem sản phẩm/tồn kho → gửi đơn → theo dõi đơn và nhận cập nhật. Những màn hình phụ chỉ làm sau khi luồng này tích hợp ổn định.
- Tích hợp API backend theo hợp đồng thống nhất; không tự quyết định giá cuối, quyền truy cập hay tồn kho có thẩm quyền.
- Kết nối WebSocket để hiển thị cập nhật tồn kho/trạng thái đơn; có trạng thái đang kết nối, mất kết nối, reconnect và tải lại dữ liệu chuẩn.
- Xử lý trạng thái tải/rỗng/lỗi, dữ liệu không hợp lệ, phiên hết hạn và phản hồi nghiệp vụ như hết hàng; không để lỗi mạng làm giao diện treo.
- Dùng component chung, type và API client thống nhất; không lưu secret ở frontend. Nếu có xác thực, làm theo cơ chế session/token đã thống nhất với backend.
- Viết/chạy kiểm tra các luồng chính trên trình duyệt; cung cấp ảnh chụp và bước tái hiện lỗi cho người viết báo cáo.

**Bàn giao:** mã nguồn frontend khách hàng, danh sách endpoint/sự kiện sử dụng, hướng dẫn chạy, bằng chứng chạy các luồng và lỗi đã biết.

### Người 3 — Frontend quản trị

- Phụ trách giao diện trong `apps/web/src/app/admin`: dashboard, điều hướng quản trị và các màn hình theo vai trò admin.
- Theo phạm vi README, triển khai lần lượt: danh mục/sản phẩm/đơn vị tính; đợt hàng và tồn kho; giá/phí theo nhóm; tài khoản khách hàng; duyệt đơn và giao hàng; yêu cầu mặt hàng; thông báo; chat/cảnh báo kiểm duyệt; báo cáo ngày/tháng nếu backend hỗ trợ.
- Tập trung trước vào luồng MVP: tạo/cập nhật sản phẩm và lượng hàng → nhận danh sách đơn → duyệt/từ chối → theo dõi trạng thái giao.
- Tích hợp API và WebSocket theo cùng hợp đồng với người 2; giao diện không tự xác nhận thao tác nếu backend trả lỗi.
- Hiển thị rõ số lượng ban đầu, đã duyệt, đang chờ và khả dụng theo dữ liệu backend; thêm xác nhận cho thao tác quản trị quan trọng.
- Xử lý tải/rỗng/lỗi, mất kết nối/reconnect, phiên không đủ quyền và phân trang/tìm kiếm nếu phạm vi MVP cần.
- Không tự tính lại doanh thu, giá hoặc tính sẵn có bằng dữ liệu suy đoán; dùng kết quả backend và ghi rõ các trạng thái.
- Kiểm tra luồng quản trị; cung cấp ảnh chụp, dữ liệu/kịch bản demo và bước tái hiện lỗi cho báo cáo.

**Bàn giao:** mã nguồn frontend quản trị, danh sách endpoint/sự kiện sử dụng, hướng dẫn chạy, bằng chứng chạy các luồng và lỗi đã biết.

### Người 4 — Backend và giao tiếp mạng

- Khởi tạo FastAPI theo cấu trúc modular monolith trong README; cấu hình môi trường, health check, logging và định dạng lỗi nhất quán.
- Thiết kế MySQL/SQLAlchemy/Alembic và API theo module README: auth/users/roles, customer groups/addresses, catalog/inventory/pricing, orders/delivery, product requests, chat/notifications/moderation/reports/audit logs. Triển khai theo ưu tiên bên dưới, không cần giả vờ mọi module đều hoàn thành cùng lúc.
- Với MVP, hoàn thiện trước API danh mục/sản phẩm, tồn kho theo đợt, giá cơ bản, tạo đơn nhiều mặt hàng, danh sách đơn và thao tác duyệt/từ chối/cập nhật trạng thái.
- Triển khai WebSocket có quản lý kết nối/phòng hoặc nhóm phát sự kiện phù hợp; xác thực/phân quyền sự kiện, xử lý disconnect và phát sự kiện sau khi thay đổi dữ liệu thành công.
- Bảo đảm nghiệp vụ duyệt đơn không duyệt vượt tồn kho khi nhiều yêu cầu cạnh tranh: transaction và khóa/cập nhật có điều kiện ở database; không dựa vào kiểm tra phía trình duyệt.
- Tính giá/phí ở backend và lưu snapshot tại thời điểm đặt; lưu lịch sử trạng thái. Chốt công thức khả dụng/đặt chờ duyệt cùng nhóm, thể hiện rõ trong API và README.
- Bảo vệ quyền truy cập theo vai trò/tài nguyên; kiểm tra đầu vào, unique constraint, tiền dạng decimal, giới hạn địa chỉ; không ghi mật khẩu/OTP/token ra log. OTP/SMS thật cần nhà cung cấp nên chỉ cấu hình interface/mock nếu chưa có dịch vụ.
- Nếu mở rộng chat/ảnh, kiểm tra thành viên hội thoại, lưu tin nhắn trước khi báo thành công và giới hạn metadata/file; không nhận ảnh tùy tiện nếu chưa có lưu trữ an toàn. Nếu làm kiểm duyệt, lưu vi phạm và phát cảnh báo theo quyền.
- Cung cấp dữ liệu mẫu và cấu hình chạy local/Docker; viết kiểm tra API/nghiệp vụ cho luồng quan trọng và kịch bản nhiều request/kết nối.
- Công bố hợp đồng API/WebSocket sớm cho người 2–3, thông báo thay đổi trước khi merge và phối hợp xử lý tích hợp.

**Bàn giao:** backend chạy được, schema/migration hoặc script database, `.env.example`, API/WebSocket spec, dữ liệu mẫu, kiểm tra luồng trọng yếu và hướng dẫn chạy.

## 3. Hướng dẫn triển khai theo README FreshFlow

README mô tả toàn bộ sản phẩm mục tiêu; các giai đoạn dưới đây biến nó thành thứ tự công việc cho nhóm. Hoàn tất MVP trước, rồi mới mở rộng theo thời gian còn lại. Với mỗi tính năng, cập nhật trạng thái `Chưa làm / Đang làm / Đã làm và đã kiểm tra` trong README; không coi tài liệu thiết kế là bằng chứng tính năng đã chạy.

| Giai đoạn trong README | Người phụ trách chính | Việc cần làm và đầu ra |
|---|---|---|
| 1 — Phân tích, thiết kế | Người 1 điều phối; người 2–4 cung cấp thiết kế phần mình | Chốt vai trò, vòng đời đơn, quy tắc tồn kho/khả dụng, nhóm khách hàng, giao hàng và phạm vi MVP. Tạo `docs/requirements.md`, `architecture.md`, `database.md`, `api-spec.md`, `realtime-events.md`, `security.md`, `testing-plan.md`; người 2/3 cung cấp wireframe khách hàng/admin; người 4 xác nhận schema và hợp đồng API/event. |
| 2 — Nền tảng | Người 4 backend; người 2/3 frontend; người 1 tài liệu | Tạo monorepo, Next.js/TypeScript/Tailwind, FastAPI, MySQL, SQLAlchemy/Alembic, `.env.example`, Compose, health check và định dạng lỗi. Đảm bảo có thể chạy web/API/DB theo hướng dẫn. |
| 3 — Tài khoản, quyền | Người 4; UI người 2/3 | MVP có đăng nhập/role cơ bản nếu đủ thời gian. Mở rộng sau: OTP thật, rate limit, khôi phục tài khoản, khóa/mở, audit, hồ sơ và tối đa 3 địa chỉ. Không tuyên bố OTP SMS thật khi chưa nối nhà cung cấp. |
| 4 — Sản phẩm, giá, tồn | Người 4 và người 3; hiển thị người 2 | CRUD danh mục/sản phẩm/đơn vị, đợt hàng theo ngày, nhóm khách, giá/phí; khách xem đúng giá và lượng khả dụng. Backend là nguồn quyết định; lưu snapshot giá khi tạo đơn. |
| 5 — Đơn, giao hàng | Người 4; màn hình người 2/3 | Giỏ/đơn nhiều sản phẩm, chờ duyệt, duyệt/từ chối, transaction tồn kho, lịch sử trạng thái, điểm/khung giờ giao. Quy tắc hủy/hoàn kho phải được định nghĩa trước khi triển khai. |
| 6 — Realtime, thông báo, chat | Người 4; khách/admin người 2/3; đặc tả người 1 | WebSocket xác thực, `connection.ready`, `inventory.updated`, `order.status_changed`; client reconnect và tải lại trạng thái chuẩn. Mở rộng notification/chat/moderation sau MVP; kiểm tra quyền phòng/hội thoại. |
| 7 — Yêu cầu hàng, báo cáo | Người 4 API; admin người 3; khách người 2; người 1 đặc tả/đối chiếu | Tạo/theo dõi yêu cầu, admin phản hồi; báo cáo ngày/tháng đối chiếu được với đơn. Định nghĩa doanh thu trước khi đưa số liệu lên giao diện/báo cáo. |
| 8 — Kiểm tra, triển khai, nghiệm thu | Cả nhóm; người 1 tổng hợp | Unit/integration/browser checks, kiểm tra lỗi và quyền, thử nhiều client, ghi cấu hình máy và số liệu thực. Hướng dẫn cài đặt, backup/restore nếu có DB cần bàn giao; chỉ nêu kết quả đã kiểm chứng. |

### Phân chia module mục tiêu theo người

| Module trong README | Owner | Phối hợp / lưu ý |
|---|---|---|
| Báo cáo, tài liệu, kiến trúc, API/event diagrams, test plan, kết quả | Người 1 | Các thành viên kỹ thuật cung cấp sơ đồ/code path, ảnh và log; người 1 không tự suy diễn tính năng. |
| Khu khách hàng: auth UI, hồ sơ/địa chỉ, catalog, giá, giỏ/đơn, product requests, notifications, chat | Người 2 | Backend người 4 cung cấp API; làm theo ưu tiên MVP; không tự quyết định giá/tồn/quyền. |
| Khu admin: dashboard, catalog/inventory/pricing UI, users, orders/delivery, product requests, moderation, reports, notifications/chat | Người 3 | Backend người 4 cung cấp API; triển khai từng màn hình theo module đã có API. |
| Backend modules, database/migrations, API, authorization, REST/WebSocket, nghiệp vụ, event publishing | Người 4 | Người 2/3 tích hợp; người 1 ghi lại protocol và thực nghiệm. |

## 4. Phạm vi MVP để chia việc không chồng chéo

Ưu tiên hoàn tất một luồng có thể demo từ đầu đến cuối:

1. Quản trị tạo sản phẩm và lượng hàng có thể cung cấp.
2. Khách hàng tải danh mục và xem giá/tồn khả dụng.
3. Khách hàng gửi một đơn gồm nhiều sản phẩm.
4. Quản trị xem, duyệt hoặc từ chối; backend bảo toàn tồn kho trong xử lý đồng thời.
5. Các client đang mở nhận thay đổi tồn kho/trạng thái qua WebSocket; client kết nối lại tải trạng thái hiện tại.
6. Có xử lý lỗi đầu vào, lỗi nghiệp vụ, lỗi kết nối và database; có kịch bản đo/ghi nhận hoạt động nhiều client.

Đăng ký OTP SMS, thanh toán, chat/ảnh, triển khai production, kiểm thử tải 1.000–2.000 người đồng thời và các module phụ chỉ đưa vào khi luồng MVP hoàn thành và có đủ thời gian. Không mô tả các mục này như tính năng đã hoàn tất nếu chưa triển khai/đo kiểm. Novelty cần thống nhất và chứng minh bằng code/kết quả, ví dụ cơ chế đồng bộ trạng thái đa client và xử lý duyệt đơn cạnh tranh an toàn.

## 5. Quy tắc phối hợp và tích hợp

- Người 4 công bố API/event contract trước; người 2 và 3 cùng dùng một kiểu dữ liệu, tên trạng thái và quy ước lỗi.
- Frontend tách phần khách hàng và quản trị theo route/module; thống nhất component dùng chung, màu sắc, trạng thái đơn và cấu hình API trước khi nhân bản.
- Mỗi thay đổi có commit riêng, mô tả cách chạy và phần đã kiểm tra. Không ghi nhận tính năng là hoàn thành chỉ vì đã có giao diện.
- Người viết báo cáo làm việc xuyên suốt: ghi lại thiết kế ban đầu, thay đổi, ảnh demo, cấu hình và số liệu khi các phần được tích hợp; không đợi đến cuối mới thu thập.
- Cả bốn thành viên cùng review luồng tích hợp và chuẩn bị giải thích kiến trúc, protocol, phần code của mình và kết quả thực nghiệm khi bảo vệ.

## 6. Mốc công việc đề xuất

Hạn nộp theo `Submission.md`: **23:59 ngày 31/10/2026**. Nhóm cần xác nhận lịch với giảng viên và hoàn thành sớm để có thời gian tích hợp.

| Mốc | Kết quả cần có | Chủ trì |
|---|---|---|
| M1 — Chốt phạm vi và hợp đồng | MVP, kiến trúc, luồng mạng, API/event contract, phân công tên thật | Cả nhóm; người 1 ghi biên bản, người 4 chốt contract |
| M2 — Bản chạy từng phần | API/data mẫu; hai khu vực frontend; dàn ý báo cáo và sơ đồ | Người 2, 3, 4; người 1 |
| M3 — Tích hợp luồng chính | Tạo sản phẩm → đặt đơn → duyệt đơn → cập nhật realtime | Người 2, 3, 4 |
| M4 — Kiểm tra và thực nghiệm | Test lỗi/mất kết nối/nhiều client; ghi số đo và môi trường thực tế | Người 4 tổ chức kỹ thuật; cả nhóm chạy; người 1 ghi nhận |
| M5 — Đóng gói và nộp | Sửa lỗi, README, báo cáo `.docx`, kiểm tra Compilatio, source hoàn chỉnh và demo | Cả nhóm; người 1 điều phối tài liệu |

## 7. Thông tin cần nhóm điền

- Tên nhóm và số nhóm (`NhomXX`): `...`
- Thành viên 1–4 (họ tên, MSSV, email): `...`
- Giảng viên: `...`
- Repository/nhánh làm việc: `...`
- Ngày cụ thể cho các mốc M1–M5: `...`
- Tỷ lệ đóng góp cuối cùng sau khi đối chiếu commit, tài liệu, kiểm tra và biên bản làm việc: `...`
