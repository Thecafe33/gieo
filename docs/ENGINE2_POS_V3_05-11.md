# Engine 2 — giao tiếp POS v3 (05/11/2026): rà soát + sửa A / B / C

Chủ quán yêu cầu rà soát giao tiếp posgieo ↔ Engine 2 («không muốn lỗi ngớ ngẩn»), duyệt cả A + B + C. Trạng thái: **ĐÃ deploy 05/11/2026** (Hosting + Functions codebase `gieo-automation`, chủ dự án xác nhận). v2 (`gieo_engine2_pos_v2.js`, `unit_engine2_store_v2.js`) giữ nguyên để quay lui.

## Đã kiểm, không lỗi
- Không ghi kho đôi: POS và worker dùng chung `engine2OpId`; RT kiểm «lượt này đã áp» trong transaction; dòng sổ txId cố định + kiểm tồn tại trong transaction.
- Đường dẫn theo quán: biên nhận kho (`duty_digests_gieogieo/_engine2/operations`, qua fstore bọc) = `E.rootPath(store)`; store dùng `GieoData.collFor` (tham chiếu gốc, không gắn hậu tố hai lần).
- Store v1 (POS cũ) / v2 (worker): ensureCloseTasks / requestMeasurement / exception / submitEvidence giống hệt. Worker dùng đúng `unit_engine.v21.js` (shared khớp gốc).
- Tên trường bàn cân khớp `E.measurement`; `countedAt` đúng giờ thật (vnDate giữ epoch); ngưỡng lệch lớn 25% hai bên.

## Lỗi + sửa
| | Lỗi | Sửa |
|---|---|---|
| A | Bàn cân POS cho cân trong **bao gói gốc** (`original:<gói>`) / gói gốc + dụng cụ (`original:<gói>+vessel:<dụng cụ>`), Engine 2 chỉ tra `prep_vessels` → lượt bị bỏ qua lặng lẽ | `tareOf()` (store v3, dùng chung POS + worker) tra cả `ingredient_original_packs_gieogieo` (bảng G); worker `measure()` kiểm bì qua `tareOf` |
| B | POS không giao được lượt (gõ tay, mã thiếu, không ca pha chế, bì lạ…) → POS ghi kho như thường nhưng việc Engine 2 **nằm chờ mãi**; việc cân ngẫu nhiên M0 bị thêm vào danh sách **mỗi ngày** | `store.posFallback(taskId, staff, code, detail)`: VALID_VOID → `cancelled`, `pending:false`, `posFallback` trên việc; 20 lượt gần nhất `posFallbacks` trên tài liệu điều khiển (không tăng revision). Cầu nối v3 gửi sau khi kho ghi xong, qua hộp thư riêng `gieo_engine2_fallback_v3_<quán>` (mất mạng gửi bù; `E.outbox` v1 chỉ nhận loại lệnh cũ) |
| C | Giao lượt = kho bỏ ghi trách nhiệm + bỏ tự hồi phục (để worker làm); POS không kiểm worker còn chạy | Worker ghi `workerHeartbeatAt` mỗi nhịp đồng hồ (15 phút) SAU khi chạy lại hàng đợi; POS chỉ giao lượt khi nhịp < 45 phút, không thì POS tự ghi trách nhiệm (lý do `worker_stale`) |

Mã lý do: `manual_entry, missing_unit, no_open_units, unknown_tare, net_mismatch, over_capacity, no_density, no_item, baseline_pending,
large_unconfirmed, worker_stale, not_active, rejected, request_failed`. quanlygieo2 › Engine 2 › Kết quả thực thi: mục «4. POS tự ghi» +
trạng thái bộ xử lý nền (đọc từ `config()` sẵn có, không thêm truy vấn).

Thứ tự deploy an toàn cả hai chiều: POS v3 trước Functions → chưa có nhịp → POS tự ghi (như chưa bật). Functions trước POS → POS v2 không đọc nhịp, hành vi cũ.

## File
`gieo_engine2_pos_v3.js`, `unit_engine2_store_v3.js` (+ `functions/automation/shared/` qua `tools/automation/sync.js`), `functions/automation/engine2.js`
(store v3 + heartbeat), `tools/automation/engine2_ui.js` (→ quanlygieo2), posgieo nạp staffing → store v3 → cầu nối v3.
Test: `tests/engine2_pos_v3.test.js` (chạy lại toàn bộ kịch bản v2 trên v3 + A/B/C), `tests/unit_engine2_store_v3.test.js` (9 bộ test store v1 + nhân sự v2 trên v3).

## Cần chủ quán xác nhận
Chỉ mục ghép Firestore `tasks (pending, createdAt↓)` và `employee_shifts_gieogieo (employeeId, checkedInAt)` đã có trên máy chủ
(`tools/automation/firestore.indexes.fragment.json`, `node tools/automation/indexes.js gg01`). Thiếu → Engine 2 không nhận lượt nào; nay
quanlygieo2 thấy được qua mục «POS tự ghi» (lý do `request_failed`).

## Lượt 2 (05/11): store v4 cho worker — F1 + F2 + giảm lượt đọc (chủ quán duyệt; **ĐÃ deploy 05/11** cùng gói v4)
Rà tiếp phía worker: tái hiện (store v3 thật + Firebase giả) — cân cuối ngày xong, đóng ngày tự check-out → worker tạo việc `handover~`
cho mỗi món kiểm soát; POS (từ v2 bỏ popup) không có chỗ làm việc `handover~` / `opened~` / `baseline~` → nằm chờ → lượt học 00:xx thấy
«món còn việc chờ» (`controlAdvice`: `!(pending>0)`) → **không bao giờ hạ mức kiểm soát**; việc treo còn chiếm cửa sổ 40 việc POS đọc
(M0 / M3 có thể biến mất); M3 kẹt khi người thứ hai nghỉ.

`unit_engine2_store_v4.js` (worker; POS vẫn store v3 — hàm POS gọi giống hệt):
- **F1** không tạo `baseline~` / `handover~` / `opened~` (bật lại: `cfg.legacyWeighTasks=true`); món kiểm soát vẫn cân mỗi tối qua `day_close`.
  `opened()` kiểm công tắc trước khi đọc mã (1 lượt đọc).
- **F2** lượt học (1 lần / ngày) dọn việc treo TRƯỚC khi xét hạ mức: một truy vấn `pending==true` (giới hạn 300), ghi gộp một batch:
  việc mồ côi (F1; việc chẩn đoán khi `diagTasks` tắt) + mọi việc quá hạn 3 ngày → `cancelled`, `expired.reason`. Bỏ qua `in_progress`.
- **Giảm đọc**: nhịp «còn sống» ghi thẳng (`update`, 0 lượt đọc, không tự tạo tài liệu điều khiển); hàng đợi thử lại giãn dần
  1 → 2 → 4 … phút, tối đa 6 giờ (trước: mỗi phút, mãi mãi).

Test `tests/unit_engine2_store_v4.test.js`: 10 bộ cũ trên v4 khi bật lại việc cũ (giống hệt), bộ POS v3 trên v4, hành vi mặc định + đếm
lượt đọc. Giao: `giao_file/dot_05-11_engine2_v4/` (chỉ Functions).

Ghi nhận, chưa sửa (rủi ro thấp): worker xử lý lượt cân trước khi POS kịp ghi kho (~1 giây) đúng lúc quản lý vừa đổi bì → lượt bị từ chối
sau khi kho đã bỏ ghi trách nhiệm. Hai bên kiểm cùng điều kiện nên rất hiếm.

## Lượt 3 (05/11): rà mức hệ thống — học dồn, bộ đếm, phiên bản máy POS, giảm đọc (chủ quán chọn 1a + 4 «chỉ đếm»; **ĐÃ deploy 05/11**, gói v4 — Hosting + Functions)
Phát hiện: (1) lượt học đọc lại toàn bộ quan sát 90 ngày mỗi đêm và **quá 3000 thì ném lỗi, dừng học** (~33 quan sát/ngày — quán 15 món kiểm
soát chạm sau ~75 ngày); (2) mỗi lượt cân bị xếp hàng hai lần (POS + trigger) → xử lý lại tốn ~20 lượt đọc / mã, không đổi kết quả (đo
bằng store thật); (3) `fleetConfirmed` là ô tick tay, xác nhận máy POS không ghi phiên bản cầu nối → không biết máy nào còn bản cũ; (4) Engine 2
chỉ học từ lượt cân qua bàn cân — chưa đo được tỉ lệ; (5) Engine 2 lỗi trong nhịp đồng hồ làm bỏ nhịp của hàng đợi / worker tự động hoá.

Sửa (store v4 — chưa phát hành nên sửa thẳng; `gieo_engine2_pos_v4.js`; `functions/automation/index.js`; `tools/automation/engine2_ui.js`):
- **1a học dồn**: quan sát đóng dấu `updatedAt` khi worker ghi; gói tuần `obs_weeks/<thứ Hai>~<phần>` (≤ 400 quan sát / ≤ 700 KB) + mốc
  `models/obs_sync`. Đêm: mốc + gói (~14) + quan sát đổi từ mốc (lùi 10 phút) + `count()` đối chiếu số lượng (lệch → đọc toàn bộ). Đọc toàn
  bộ theo trang (không ném lỗi): lần đầu, cứ 7 ngày, khi mốc `dirty` (lượt học chết giữa lúc ghi nhãn / gói). Nhãn do chính lượt học ghi
  không đóng dấu (gói ghi ngay sau). Chặn an toàn 20 000. Ý tưởng: tài liệu tổng hợp cập nhật thưa (Google Cloud — Firestore distributed
  counters / roll-up document), không chép mã.
- **4 bộ đếm** `e2Daily` (14 ngày) trên tài liệu điều khiển: «Engine 2 nhận» (worker hoàn tất lượt cân, không đếm khi xử lý lại) / «POS tự
  ghi» theo mã lý do — trong transaction vốn đã đọc tài liệu đó, 0 lượt đọc thêm; quanlygieo2 bảng 7 ngày (tỉ lệ nhận, lý do chính).
- **2** `enqueue(kind,id,resume,onlyNew)` — trigger `_engine2_measurement` chỉ xếp khi chưa có. **5** nhịp đồng hồ: mỗi phần một khối lỗi (`errorPart`).
- **3** cầu nối v4 = v3 + xác nhận ghi `bridgeVersion` / `storeVersion`; quanlygieo2 hiện phiên bản từng máy + cảnh báo máy chạy bản cũ trong 7 ngày.

Đo (2 thế giới giống hệt, 4 đêm, có quan sát mới + nhãn muộn): kết quả học **giống hệt** cách đọc toàn bộ; lượt đọc mỗi đêm học dồn 52–86 so với
282–312. Store v3 dừng học khi > 3000 quan sát; v4 học bình thường. Test: `unit_engine2_store_v4.test.js`, `engine2_pos_v4.test.js`,
`engine2_ui_v4.test.js`; Firebase giả thêm `count()` (Admin SDK có) — `gieo_automation_review.test.js` nay kiểm đúng nhánh `count()` chạy thật.
Giao: `giao_file/dot_05-11_engine2_v4/` (thay gói «chỉ Functions» của lượt 2).

## Lượt 4 (05/11): chặn nhập sai số còn lại khi nấu mẻ (vụ trà ô long) — **ĐÃ deploy 05/11**, gói `dot_05-11_engine2_v4`
Vụ: Vỹ nấu trà ô long dùng 5 túi, mở hộp mới 25 → còn 20, nhưng nhập «còn 2» → sổ ghi mất 18 (Vỹ chịu). Hôm sau A «Cân trước khi lấy NL»
đếm 20 → POS v1 ghi khoản +18 với trách nhiệm **A** («người chốt cân và giải trình»); Engine 2 cũng quy A và theo dõi dồn A. Quán không mất gì.
Phản biện: màn hoàn thành chỉ bắt chọn nguyên nhân + ghi lý do, **không hỏi lại số**; nhánh «cân ra nhiều hơn sổ» lúc HOÀN THÀNH mẻ (engine v21
`book_understated`) đã đánh dấu lượt trước nhập sai, còn ở bước CÂN TRƯỚC thì không; Engine 2 không đọc dấu «đã xác minh nhập sai».

Sửa (chủ quán 05/11: «hỏi xác nhận lại 1 lần … cần nhiệm vụ ngăn chặn», «giảm trách nhiệm cho A»):
- **POS `js/posgieo/pos_prep.v2.js`** (v1 giữ quay lui; posgieo trỏ v2):
  1. Hoàn thành mẻ: lệch định mức ≥ 25% lượng mẻ cần (tối thiểu 1 cái / 15 g·ml) → hỏi lại MỘT lần: «Bạn nhập còn 2. Mẻ này theo định mức
     dùng 5 → lẽ ra còn khoảng 20. Nếu đúng, 18 bị ghi là DÙNG VƯỢT / MẤT — trách nhiệm ghi cho Vỹ.» [Đếm lại] / [Đúng, tôi chắc chắn].
     «Đếm lại» = chưa ghi gì.
  2. Cân trước khi lấy NL: lệch sổ lớn → hỏi lại; dư → nêu người ghi lần trước + giờ, «bạn KHÔNG chịu phần chênh»; thiếu → «phần thiếu ghi
     trách nhiệm cho BẠN». «Đếm lại / Cân lại» xoá số vừa ghi (giữ lý do). Dòng chênh dưới mã ghi rõ hai trường hợp.
  3. Bắt đầu mẻ: dư ở cân trước → dòng `prep_pre_…` quy **người ghi lần trước** (lần ghi gần nhất: mốc mẻ trước / cân cuối ca / Quản lý sửa
     tồn / người mở mã), `responsibility.discoveredBy*` = người phát hiện; lệch lớn → đánh dấu dòng sổ của lần ghi đó «đã xác minh nhập sai»
     (`ledger.annotate`, chạy nền) + báo Quản lý `prep_entry_error`. Thiếu so với sổ: giữ như cũ.
- **Engine 2 store v4 — chính sách `prep_review_v2`**: dòng đã đánh dấu nhập sai chỉ còn phần lệch thật (lệch − `entryErrorQty`) → hết lệch =
  «entry_error» (gỡ khỏi theo dõi dồn, đóng thông báo lệch lớn cũ); dòng «sổ ghi thấp» (cân trước dư / `prep_surplus`) quy người ghi lần
  trước, «entry_error_found», không theo dõi dồn; chạy thật thì tự đánh dấu dòng lần trước nếu chưa ai đánh dấu (dòng POS cũ); dòng đã duyệt
  chỉ xét lại khi Engine 2 đã có hồ sơ. Nâng chính sách MỘT lần cho hồ sơ cũ (mốc `models/prep_policy`) → vụ Vỹ / A cũ được sửa sau deploy
  nếu Engine 2 đã có hồ sơ của nó. Worker: dòng vừa được đánh dấu nhập sai → xếp xét lại. `unit_engine2_audit_v1.js` tính lại cùng quy tắc.
- Test: `chan_nhap_sai_pos.test.js` (hàm POS thật + engine thật trên Firebase giả: hỏi lại, «Đếm lại», quy người ghi trước, đánh dấu, báo),
  `unit_engine2_prep_entry_error.test.js` (8 kịch bản + kiểm toán 0 vi phạm); `snapshot_wrap` / `ban_trong_luc_can` nạp thêm hàm hỏi lại.

**Còn mở — cần chủ quán quyết (đổi hành vi báo cáo):** báo cáo tháng quanlygieo (`thangKetTrachNhiemNL`) vẫn cộng 18 túi vào «thiếu» của Vỹ
dù dòng đã đánh dấu nhập sai (chỉ hiện ghi chú «đã xác minh nhập sai số»). Đề xuất: dòng đã xác minh nhập sai → «nhập sai, không tính tiền»
(vẫn đếm số lần nhập sai theo người).
