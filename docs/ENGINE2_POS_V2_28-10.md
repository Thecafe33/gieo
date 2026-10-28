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

## Đợt 2 — hướng đã chốt, CHƯA làm
- **Mô hình vận hành theo nhân sự.** Quán 1 người làm xuyên suốt (Gieo Gieo 1 hiện nay, đang tuyển thêm) là **mô hình chủ đích**, không phải «thiếu nhân sự» —
  không gắn nhãn thiếu, không cảnh báo. Engine 2 tự nhận mô hình theo quán từ ca thật (`employee_shifts`), tự chuyển khi có người thứ hai. Phân tích cho mô hình 1 người:
  trách nhiệm chỉ một địa chỉ; bỏ giả thuyết so sánh giữa người; nghiêng về nguyên nhân không gắn với người (bì, cân lệch, định mức, quy cách bao, pha nhầm);
  «độc lập» đổi nghĩa thành bằng chứng khách quan (cân vật mẫu, số học tem, phiếu nhận hàng) và baseline phải neo vào các bằng chứng đó (chống học hao hụt thói quen thành «bình thường»).
  Không tuyên bố «đã xác nhận độc lập về người» khi chỉ có một người.
- **Nguyên tắc «không làm việc gì hai lần, không làm thừa».** Người mở ca = người kết ca hôm trước ⇒ KHÔNG yêu cầu cân bất cứ thứ gì ở đầu ca (kể cả danh sách chủ quán cấu hình
  `shiftCountTiming`; cần xác định «người mở ca» sớm hơn lúc xác nhận PIN). Trước khi xếp việc, Engine 2 hỏi: đã có số cân hợp lệ phủ đúng khoảng cần chưa? việc này có thêm thông tin mới không?
- **Bill bổ sung** dùng cơ chế sẵn có `_recheckCloseAfterSalesImplPOS` (`posgieo.html`): chỉ đánh dấu cân lại các món bill đó dùng (`closeOrderUsagePOS`), món NL có tem đã chốt theo mã
  thì không (lượt bán sau tự trừ đúng mã). Engine 2 chỉ so số kỳ vọng với số đã cân; khớp thì im, lệch quá ngưỡng mới cân lại đúng món đó. (Lựa chọn «bán trước / sau khi cân» chủ quán nhắc: trong code chỉ thấy lựa chọn nơi ghi tiền của bill bổ sung — cần xác nhận màn nào.)
- **Cân độc lập (M3)** chỉ ở mở ca / giao ca và chỉ khi có người khác; số cân của người nhận ca chính là phép đo độc lập (không tạo việc riêng, không cân thêm).
- **Việc chẩn đoán / nhóm dễ nhầm** vào cùng danh sách như dòng bổ sung, chỉ khi có nghi vấn thật; **M0** chọn từ món đã nằm sẵn trong danh sách cân bắt buộc (không tốn thêm lần cân).
- Theo quy tắc 3b: phần xếp người / giám sát một người vận hành sẽ tham khảo nguồn mở và báo link trước khi viết.
