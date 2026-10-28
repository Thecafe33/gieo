# Engine 2 — cầu nối POS v2 (28/10/2026): bỏ popup, việc cân nằm trong danh sách cân cuối ca

Chủ quán chốt (28/10): Engine 2 là một phần của hệ thống, **âm thầm** — nhân viên chỉ làm việc, **không** được hỏi / giải thích; việc cân Engine 2 điều phối nằm
**trong danh sách cân cuối ca sẵn có** (cùng giao diện, cùng thao tác); món đã bắt buộc cân thì **ghi nhận từ chính lượt cân đó**, không tạo thêm lượt nào.
Trạng thái: đợt 1 xong, **chưa deploy**. `gieo_engine2_pos_v1.js` (popup) giữ để quay lui; `posgieo.html` nạp `gieo_engine2_pos_v2.js`.

## Đợt 1 — đã làm (`gieo_engine2_pos_v2.js`, test `tests/engine2_pos_v2.test.js`)
Bọc 3 chỗ, KHÔNG sửa `js/posgieo/pos_shift_closing.v1.js` (đã phát hành):
1. `computeShiftInventoryCountLinesPOS('close')` — gộp món Engine 2 điều phối (kiểm soát `controlledItemIds` + việc cân ngẫu nhiên M0 đang chờ) vào danh sách.
   Món đã có sẵn (bắt buộc / bất thường) chỉ được gắn dấu ngầm `l.e2 = {taskId}`; món chưa có thì thêm một dòng (chỉ khi còn mã mở và hôm nay chưa cân; lý do rỗng).
   Món kiểm soát không còn mã mở: không dòng, không tạo việc.
2. `UnitEngine.shift.applyLine` — dòng có `l.e2`: xin `requestMeasurement` TRƯỚC (lấy `operationId = e2sw_…`), rồi POS tự áp kho đồng bộ như mọi dòng với
   `engine2Owner` + `engine2OpId`. Kho ghi MỘT lần theo mã lượt và KHÔNG tự ghi hồ sơ trách nhiệm (`dutyOnNlWeigh` bị bỏ khi `engine2Owner`); tiến trình nền
   (`measure()`) thấy phiếu `inventoryResult` ⇒ chỉ ghi nốt trách nhiệm (cases / decisions), mốc cân (`unit_checkpoints`) và quan sát — không áp kho lần hai.
3. `shiftWeighLineHTML` — bỏ dòng «Cần cân hôm nay vì …» (dữ liệu `reasons` vẫn còn trong dòng, chỉ không hiển thị).

Điều kiện không chắc chắn → **không cờ `engine2Owner`**, POS ghi như thường (người ghi trách nhiệm cũ của kho), **không bao giờ chặn kết ca**:
số gõ tay không dụng cụ; bì khác thư viện dụng cụ; ml/l thiếu tỷ trọng; lệch lớn chưa được nhân viên xác nhận (POS hỏi như cũ, sau xác nhận mới xin Engine 2);
mã thiếu / không còn mở; người cân không có ca pha chế trong ngày; Engine 2 từ chối lượt. Khi `SW_RELOAD` (sổ đổi giữa lúc cân và lúc ghi) bỏ cờ + phiên đo để xin lại.

Hệ quả cần biết: các việc **M3 (cân độc lập), chẩn đoán, nhóm dễ nhầm** hiện không còn nơi hiển thị — chúng nằm ở trạng thái chờ cho tới đợt 2.
`tools/tach_posgieo/e2e_hook.js` (so chuỗi bọc với mốc `0bd95a7`) sẽ báo Engine 2 v2 khác v1: không còn bọc 4 hàm render + `_continueAfterPrepCount`, thêm
`shiftWeighLineHTML` — chủ ý.

## Đợt 2 — nhân sự & «không làm việc gì hai lần» (28/10, đã làm, chưa deploy)
Thành phần: `unit_engine2_staffing_v1.js` (hàm thuần, POS + worker cùng byte), `unit_engine2_store_v2.js` (= store v1 + nhân sự; worker `functions/automation/engine2.js` dùng v2,
`tools/automation/sync.js` chép sang `functions/automation/shared/`), bridge `gieo_engine2_pos_v2.js` (đợt 1 + đầu ca), dòng nhãn trung tính ở quanlygieo2
(`tools/automation/engine2_ui.js`, «Mô hình vận hành»). Test: `tests/unit_engine2_staffing.test.js` (hàm thuần + store v2 + chạy lại 9 bộ test của store v1 trên v2 qua
`tests/lib/alias_store_v2.js`), `tests/engine2_pos_v2.test.js` (đầu ca, M3). **Cần deploy cả Hosting (posgieo + file JS mới) lẫn Functions** (worker đổi sang store v2).

- **Mô hình vận hành theo ca thật** (`operatingModel`, mỗi lượt học một truy vấn `employee_shifts` 28 ngày): `single` = trong 14 ngày gần nhất chỉ MỘT pha chế làm việc,
  `multi` = từ hai người, `unknown` = chưa có ca pha chế. Quán một người xuyên suốt là **mô hình chủ đích** — không nhãn «thiếu», không cảnh báo; người mới làm một ca là chuyển
  sang `multi` ngay, người đã nghỉ quá 14 ngày không giữ quán ở `multi`. Ghi ở `models/current.operating`; quanlygieo2 hiện một dòng trung tính.
- **Không việc cân độc lập (M3) bất khả thi:** quán `single` mà đáng lên mức 3 → giữ mức hiện tại, không tạo việc (trước đây việc bị từ chối mãi vì «cần người khác người cân trước»),
  ghi `models/current.independentWanted` (trung tính, để quản lý biết). `multi` / `unknown` → như cũ. Giả thuyết của Engine 2 vốn không có giả thuyết theo người
  (tare, density, recipe, unrecorded, sync, spec, scale) nên không phải bỏ gì; trách nhiệm một người = 100% cho người đó.
- **Cân độc lập = số cân của người nhận ca ở đầu ca:** việc M3 chỉ hiện trong danh sách kiểm kê đầu ca sẵn có, chỉ khi có người KHÁC người cân trước đang mở ca
  (`independentPossible`); chính người cân trước làm thì POS ghi như thường, Engine 2 không nhận. Không bao giờ ở cuối ca.
- **Đầu ca không làm việc thừa:** người mở ca duy nhất (`openBaristas` = ca đang mở hôm nay, làm được pha chế) = người kết ca hôm trước (`lastCloser` = pha chế ra muộn nhất của
  ngày làm việc gần nhất có ca, lùi ≤ 7 ngày) ⇒ **không kiểm kê đầu ca và không đếm giao ca đầu ca** (cả danh sách chủ quán cấu hình `shiftCountTiming`, `countTiming` của quy tắc
  refill). Không phụ thuộc Engine 2 có bật hay không. Thận trọng: chưa ai check-in / từ hai người đang làm / không biết người kết ca ⇒ hỏi như thường.
- **M0 ưu tiên món đã nằm trong danh sách cân bắt buộc cuối ca** (`pickM0`): lấy mẫu mà không thêm lần cân; chỉ khi không món nào như vậy mới thêm tối đa 1 món ngoài danh sách
  (trước: 2 món/ngày bất kể). Việc «Đếm/cân lại để đồng bộ sổ» (`resync`) cũng vào danh sách cuối ca như M0.
- **Việc chẩn đoán dạng nhập riêng** (kiểm bì, tỷ trọng, định mức, rà mã, vật mẫu) và **nhóm dễ nhầm**: CHƯA có chỗ hiển thị trong danh sách cân. Mỗi loại cần ô nhập riêng
  (hai số, danh sách tick…) nên phải dựng thêm nhiều kiểu dòng trong màn kiểm kê — rủi ro cao cho luồng kết ca, tần suất thấp, và nguyên tắc «chỉ khi có nghi vấn» — nên đợt này
  store v2 **không tạo** các việc đó (`cfg.diagTasks !== true`; việc dở còn chặn hạ mức). Bật lại bằng `cfg.diagTasks=true` khi POS có dòng tương ứng. Hệ quả: giả thuyết chưa có nhãn
  nên chưa in % (đúng với tình trạng hiện tại, chưa tệ hơn).
- **Bill bổ sung:** không đổi. `_recheckCloseAfterSalesImplPOS` chỉ đánh dấu cân lại các món bill dùng; tem đã chốt theo mã không cân lại; bill «bổ sung TRƯỚC kết ca»
  (`backfillMode:'before_close'`, `skipConsumption`) không trừ kho vì số cân đã phản ánh, «SAU kết ca» trừ tem; kho có `reclassToConsumption` chuyển hao hụt giả thành tiêu hao và
  worker (`source()` ở `functions/automation/engine2.js`) tính lại lượt cân khi dòng sổ mang cờ `engine2Owner` bị đổi. Engine 2 không thêm lượt cân nào ở các thời điểm này.
- Tham khảo nguồn mở (quy tắc 3b): không tìm thấy dự án nào làm giám sát theo mô hình nhân sự — chỉ có mô-đun kiểm kê theo luật cố định như OCA `stock_cycle_count` (Odoo, AGPL-3,
  [apps.odoo.com](https://apps.odoo.com/apps/modules/16.0/inventory_cycle_count_schedule)) và kỹ năng `cycle-count-scheduler` của a5c-ai/babysitter (ABC + lấy mẫu thống kê). Chỉ lấy ý tưởng
  (ưu tiên lấy mẫu theo nhóm, không chép mã).

## Còn lại (chưa làm)
- Dòng cân cho việc chẩn đoán / nhóm dễ nhầm (xem trên), rồi bật `cfg.diagTasks`.
- Cân độc lập ở **giao ca** (hiện chỉ đầu ca).
