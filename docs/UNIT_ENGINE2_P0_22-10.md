# Engine 2 — luồng đầu đã triển khai, 22/10/2026

Đã có runtime và kiểm thử cục bộ cho **báo hết còn dư → phân bổ nhóm pha chế → bật cân theo nguyên liệu → đo tại POS → tạo mốc cho khoảng tiếp theo**. Chưa deploy Hosting/Functions, chưa bật cấu hình hoặc ghi Firebase thật. Đây là P0, chưa phải nghiệm thu toàn bộ Engine 2 cấp 6.

## Cách dùng

Trong `quanlygieo2.html`, chọn một điểm bán → **Hôm nay · Sức khoẻ quán** → **Engine 2 · Kiểm soát hao hụt** → **Xem kết quả / thiết lập**. Có chế độ **Đối chiếu thử** và **Tự động phân bổ và giao cân**, cùng ngày bắt đầu. Chưa có cấu hình thì mặc định tắt.

Đối chiếu thử chỉ tạo đề xuất/audit, không bật cân có hiệu lực. Chỉ bật tự động sau khi cập nhật các POS của điểm bán và bộ xử lý nền. Nút **POS / việc đang xử lý** phân biệt yêu cầu đã phát, máy POS đã nhận phiên bản nào, số cân đang đối soát, sự cố còn bàn giao và lỗi tác vụ nền. Dữ liệu chi tiết chỉ tải khi bấm.

Tại POS, mở **Ca làm việc → Kiểm soát nguyên liệu → Xem việc cân**. Trong việc cân có phần mở rộng giải thích khoản gốc và nhóm đã được phân bổ; nhận việc đo không nhận thay khoản mất lịch sử. Căn cứ này chỉ đọc khi mở việc. Nhân viên pha chế chọn đúng dụng cụ/bì và nhập số tổng trên cân cho từng mã; hệ thống tính ròng. Chưa gắn dụng cụ vẫn chọn được toàn bộ dụng cụ hợp lệ trong thư viện. Chưa có dụng cụ đúng thì cân bì rỗng và thêm ngay tại đây. Nguyên liệu ml/l thiếu tỷ trọng phải nhập khối lượng ròng và thể tích của mẫu thực đo, không tự lấy tỷ trọng 1. Lệch lớn yêu cầu nhập lại số cân, không điền sẵn số cũ.

Khi đóng ngày, các món đã được bật kiểm soát đi qua nhiệm vụ Engine 2. Nhân viên có thể ghi tình trạng thực tế để tiếp tục bàn giao; nhiệm vụ vẫn pending, không giả là cân xong. Lệnh ngoại lệ được lưu bền tại máy trước khi tiếp tục, đồng bộ khi có mạng. Việc dở thuộc nhóm pha chế ca sau; khoản mất đã phân bổ vẫn thuộc nhóm trong khoảng lịch sử. Check-out, gọi món và thanh toán không chờ worker.

## Phép tính và nguồn ghi

Case mẫu: tem 500 g, dùng hợp lệ 200 g, báo hết còn sổ 300 g. Engine kho đã ghi đúng một WASTE 300 g; Engine 2 tham chiếu dòng đó, chia đều bốn pha chế thực tế giao với khoảng mở/mốc cân → báo hết, mỗi người 75 g. Giá trị lấy từ khoản gốc hoặc lịch sử giá có hiệu lực; chưa có căn cứ giá thì hiện chưa đủ giá, không coi là 0đ.

Phân bổ là trách nhiệm theo chính sách, không là kết luận hành vi cá nhân và không tự thu tiền/trừ lương. Quyết định tay trên nguồn được giữ nguyên; không chia lại. Void/sửa nguồn có lịch sử quyết định mới, không sinh dòng tài chính hoặc ghi kho lần hai.

- `unit_engine2_v1.js`: quyết định, phân bổ, kiểm toán tổng, mức kiểm soát, trạng thái và outbox.
- `unit_engine2_store_v1.js`: phạm vi quán cố định, queue/lease/revision, nguồn và mốc cân, nhiệm vụ, phục hồi.
- `functions/automation/engine2.js`: nối sự kiện kho/ca/giá với lõi dùng chung. Không nhận bill tiêu thụ thông thường làm việc Engine 2.
- `gieo_engine2_pos_v1.js`: nhận yêu cầu, xác nhận thiết bị, nhập số cân và ghi lệnh bền. Trình duyệt không ghi trực tiếp tồn trong luồng mới.
- `unit_engine.v21.js`: adapter kho kế thừa v20; chỉ thêm mã thao tác Engine 2, receipt phục hồi và tách writer trách nhiệm cho lượt cân Engine 2. Luồng kho cũ vẫn dùng cùng thuật toán. v20 và các bản cũ giữ nguyên.
- Quanlygieo2 được sinh từ nguồn hiện tại và `tools/automation/engine2_ui.js`, không sửa tay file sinh.

Các bản ghi Engine 2 nằm dưới `duty_digests_gieogieo[__ggNN]/_engine2`: cases, decisions, audits, controls, tasks, measurements, operations, checkpoints, unit_checkpoints, requests, devices và các chỉ mục phụ thuộc ca/nguyên liệu. Không tạo hệ thống tồn/P&L thứ hai.

Inventory adapter là writer duy nhất của thay đổi tồn và WASTE khi cân. Engine 2 sở hữu trách nhiệm/mốc của lượt cân đó; nhánh duty cũ không chạy thêm. Receipt được lưu trước bước sổ, retry sau mất ACK không cân lại từ số tồn mới. Khóa đo theo món ngăn hai lệnh cân khác nhau cùng thắng. Sửa nguồn của phép cân đã hoàn tất chỉ tính lại phân bổ, không áp tồn lại hoặc lùi mốc mới.

Tem đã finished giữ finished. Kiểm soát M2 tồn tại theo món/quán: có việc cân khi mở mã mới, thay nhóm pha chế và đóng ngày. Mốc cân mới thu hẹp khoảng cho lần sau. Tự hạ mức chưa bật mặc định; vài lần không lệch chưa phải chứng cứ đủ.

Hộp thư cũ tham chiếu quyết định Engine 2 đã có hiệu lực để không tiếp tục yêu cầu chủ xử lý cùng tem. Chứng từ nguồn và cờ needsReview không bị sửa để làm mất lịch sử. Duyệt chi vẫn thuộc chủ quán. Các nhóm nghiệp vụ BTP/khác chưa chuyển vẫn qua automation/Engine hiện hành.

## Lượt đọc và phục hồi

- Một listener tài liệu cấu hình/kiểm soát nhỏ trên mỗi POS đã gắn quán; ACK chỉ khi phiên bản yêu cầu đổi.
- Không thêm hook query vào gọi món/thanh toán. Test 100 dòng CONSUMPTION: 0 lượt đọc Engine 2.
- Đọc ca trong đúng khoảng và giá đúng món khi xử lý sự kiện; không đọc bill toàn kỳ để chia đều.
- Nhiệm vụ POS chỉ đọc khi mở công việc; bảng quản lý đọc chi tiết khi bấm. Có giới hạn trang, cursor cho bootstrap và dependency.
- Lỗi kỹ thuật giữ dirty/nextTryAt và tự retry. Lỗi đọc nhóm là lỗi truy xuất; không yêu cầu chủ gán nhóm pha chế mới. Công việc đã nhận vẫn được phục hồi khi tắt nhận việc mới.
- Giới hạn P0: một khoảng tối đa 500 bản ghi ca, 500 món kiểm soát/quán, 40 việc mới nhất tại POS; vượt giới hạn không chốt âm thầm. Thư viện dụng cụ chỉ tải khi mở việc cân.

## Kiểm thử

- `node tests/unit_engine2.test.js`: case 300 g/4 người, mốc thu hẹp nhóm, hai quán, shadow, manual, void, outbox đầy, lease cũ; adapter Node/kho thật với Firebase giả; 20 g bill xen giữa vẫn giữ, 50 g chia hai người, lần cân sau 30 g chỉ thuộc khoảng mới; mất ACK không ghi RT lần hai; sửa nguồn không áp kho lại.
- `node tests/unit_engine2_queue.test.js`: bootstrap 123 nguồn/3 trang; mã mới mở nhận cân đúng một lần; ca thêm mới tìm khoảng liên quan; 100 tiêu thụ không query; hộp thư tham chiếu E2 và rút liên kết khi nguồn đổi.
- `node tools/automation/engine2_e2e.js`: POS styles thật, 1366px/390px, chọn dụng cụ chưa gắn, cân lại, ô trắng, journal bất biến, thoát đóng ca có ngoại lệ mất mạng rồi đồng bộ.
- `node tools/automation/role_full_e2e.js`: HTML quanlygieo2 thật, PC/mobile, hộp thư cũ/duyệt chi/căn cứ E2/ACK/thông tin chưa hoàn tất/thiết lập.
- B0 (sau P0): `node tests/unit_engine2_audit.test.js` (bộ kiểm độc lập, 40 lỗi cài) và `node tests/unit_engine2_fsm.test.js` (335 cặp FSM, 33 lệch đã biết) — xem [lộ trình](LO_TRINH_ENGINE2_CAP6.md) B0.
- Bộ test cũ và công cụ ranh giới/đường dẫn tiếp tục chạy. Tool sinh lại nay trả exit khác 0 nếu test thất bại, không để pipeline `tail` che lỗi.

Các phép thử trên dùng dữ liệu giả, không nối Firebase production. File rút gọn 1/9–18/10 thiếu ledger kho/prep đầy đủ, snapshot RT và ID tem nguồn nên chưa chứng nhận replay tài chính/FIFO 30–60 ngày thật.

## Còn lại để hoàn thiện cấp 6

> Thứ tự và phạm vi hiện hành: [lộ trình](LO_TRINH_ENGINE2_CAP6.md). Quy mô 10.000 quán là trục riêng, không thuộc điều kiện cấp 6.

P0 chưa triển khai mô hình baseline học theo món/ca, suy luận nguyên nhân có hiệu chuẩn, tự thay đổi tiêu chí trong biên đã kiểm định, auditor độc lập toàn sổ, mapper/replay raw đủ, chuyển toàn bộ family BTP/FIFO/nhận hàng và phân vùng worker cho quy mô 10.000 quán. FSM/core hiện có không được coi là chứng minh mọi cặp trạng thái/sự kiện của toàn đặc tả. Lịch chạy hiện dùng danh sách quán đăng ký và query việc đến hạn có giới hạn, chưa phải kiến trúc phân vùng chuỗi lớn.

## Cập nhật / quay lui

Gói Hosting theo mùa chỉ chứa các file thay đổi của Gieo; không thay file manage/TC33/XOFA. Cần thay **cùng lúc** `posgieo.html`, `quanlygieo.html`, `quanlygieo2.html` và bốn JS mới trong gói. Bản thử thêm hai file `_thu` theo cơ chế bản sao hiện có; worker này chỉ nghe các quán thực đăng ký, chưa có worker riêng cho tiền tố dữ liệu thử. Giữ những JS cũ còn được các trang khác tham chiếu.

Bộ Functions đi kèm là codebase `gieo-automation` hiện có. Giữ `stores.json` đúng các quán thực có; sinh fragment indexes cho các mã đó bằng `node tools/automation/indexes.js gg01 gg02 ...` và **gộp** vào indexes dự án, không ghi đè các indexes hiện có. `tools/automation/firebase_config.fragment.json` là mẫu ghép cấu hình, không thay firebase.json của dự án. Gộp thêm mẫu header cho các JS Engine 2 và no-cache cho quanlygieo2 từ `tools/firebase_headers_gieogieo.json`. Chủ dự án tự triển khai Hosting/Functions/indexes; lượt này không chạy deploy.

Bộ file export không kèm firebase.json triển khai của chủ, nên công cụ predeploy đầy đủ chưa thể chứng nhận cấu hình Hosting tại đây. Kiểm tra lại trên thư mục deploy thực tế của bạn; các gói ZIP bên dưới là bản cập nhật file, không phải toàn bộ site.

Quay lui: tắt nhận việc mới/chuyển đối chiếu, để worker hoàn tất các phép cân đã accepted; giữ journal, receipt, ledger, quyết định và checkpoints. Không quay POS/worker về v20 khi còn phép cân Engine 2 chưa phục hồi. Không xóa dữ liệu Engine 2 để giảm badge hoặc reset trách nhiệm.
