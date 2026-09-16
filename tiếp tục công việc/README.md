# Tiếp tục công việc

## Bước hiện tại

Đang thực hiện **Phase P9/P10 — POS và QUANLY thin client ở chế độ READ_ONLY**.
Hệ thống production cũ vẫn là sole writer; code mới chưa được phép ghi dữ liệu production.

## Đã hoàn thành tại checkpoint này

- `legacy-firebase-adapter` chỉ đọc, gồm path registry, mapper canonical và read port.
- Firebase SDK read bridge được inject từ bên ngoài, không chứa credential và không phơi API ghi.
- POS đọc Catalog qua `GetMenu`; menu/giá được cập nhật realtime từ RTDB và có unsubscribe.
- QUANLY đọc báo cáo doanh thu qua Unified Read Layer.
- Hai thin client không chứa FIFO/business inventory logic riêng.
- Race hoàn đơn đồng thời vẫn là release gate bắt buộc trước shadow/cutover.

## Kiểm chứng

- `691/691` test pass.
- `71` module, `0` vi phạm import-direction.
- Build thành công `dist/posgieo-new.html` và `dist/quanlygieo-new.html`.

## Bổ sung ở lượt này — hoàn thiện màn P9/P10 còn lại

Ba query mới trong Read Layer, vì trước đó màn Ca / Tổng quan / Duyệt chỉ là ô
trống hard-code — mà ô trống hard-code chính là chỗ người ta sẽ nối thẳng
Firebase vào UI:

- `GetShiftStatus` — ngày làm việc, két đang mở, người đang trong ca.
- `GetAlerts` — lọc theo `audience`, đếm tách DANGER/WARNING/INFO.
- `GetPendingApprovals` — gắn sẵn tên command cho từng việc.

POS:
- Giỏ hàng thật + thanh toán gọi `RecordSale`. Giỏ là trạng thái CHỌN của màn
  hình; giá chỉ nhận từ `GetMenu`, số hiển thị gọi là "tạm tính", tổng chính
  thức lấy từ kết quả command. Command hỏng thì giỏ được giữ nguyên.
- Màn Kho hiện tồn theo `GetInventoryLevel`, phần chưa gắn Unit để riêng.
- Màn Ca đọc dữ liệu thật; ngày chưa mở thì nói thẳng là không bán được.

QUANLY:
- Tổng quan: doanh thu, cảnh báo (tách 2 mức nặng), trạng thái ngày, người trong ca.
- Duyệt: danh sách thật, duyệt theo command mà query gắn sẵn, loại chưa khai thì
  KHÔNG dựng nút mà báo ra.
- Báo cáo: thêm COGS hai vế và P&L; thiếu vế thực tế thì hiện "chưa đủ", không
  lấy lý thuyết đắp vào.

Hai điểm đáng ghi:
- `legacy-data-source` nay TỪ CHỐI query chưa có nguồn cũ thay vì trả rỗng.
  Rỗng và "chưa đọc được" trông giống nhau trên màn hình nhưng nghĩa ngược nhau.
- Test bắt được lỗi quyền thật: `GetAlerts`/`GetShiftStatus` khai độc quyền
  EXECUTE nên QUANLY_ADMIN bị khoá khỏi chính màn Tổng quan của mình. Đã sửa ở
  nguồn thành any-of, không sửa test.

`src/layer-rules.json` thêm `read-layer → alerts` kèm ghi chú lý do: R1 buộc mọi
đường đọc đi qua read-layer, và dùng lại `bucketize` để không viết bản thứ hai
của thứ tự ưu tiên cảnh báo (vi phạm R3).

## Bổ sung ở lượt này — P11 Reporting

Tầng `reporting` đã có 4 module từ trước nhưng runtime chỉ mở cổng `read-layer`,
nên không app nào với tới được. Đã nối:

- `reporting/report-queries` — đăng ký `GetUsageReport`, `GetLossReport`,
  `GetInventoryValuation`, `GetVarianceReport`, `GetBTPReport`, `ExportReport`
  qua ĐÚNG sổ quyền của read-layer (`guardRead`), không có sổ quyền thứ hai.
  Xuất file để ở tầng `MASTER_CONFIGURE`.
- `reporting/usage-report` — Waste / Lost / Usage là ba lát cắt của MỘT lần đọc
  ledger. Legacy có ba đường đếm hao hụt riêng và chúng không khớp nhau.
  Mất và tìm-lại hiện cùng nhau; phần không gắn được Unit để riêng.
- QUANLY màn Báo cáo: thêm bảng tiêu thụ/hao hụt, giá trị tồn kho, và nút xuất
  file. File bắt buộc mang `meta` của chính truy vấn đã dựng ra các dòng đó.

Test lại bắt được một lỗi thật: `export-payload.toCsv` nhận cột dạng chuỗi trần
rồi sinh header `undefined` mà vẫn xuất file bình thường. Đã siết ở nguồn —
cột phải khai `{label, key}` hoặc `{label, value}`.

`legacy-data-source` bổ sung các báo cáo kỳ vào danh sách chưa-nối-nguồn: ledger
cũ chỉ tra được theo `containerCode`, không theo khoảng ngày. Trả lỗi thay vì
dựng báo cáo rỗng trông như "kỳ này không hao hụt gì".

## Việc tiếp theo

1. Cấp Firebase config/handles thật cho composition root, không đưa credential vào source.
2. Hoàn thiện các màn nghiệp vụ P9/P10 còn lại qua Runtime/Read Layer/Commands.
3. Giữ READ_ONLY cho tới khi hoàn tất P12 shadow comparison và đủ điều kiện cutover.

## Commit liên quan

- `7da5a48` — Nối Catalog và Firebase read bridge vào UI.
- `becece6` — Đồng bộ menu realtime vào POS chỉ đọc.
