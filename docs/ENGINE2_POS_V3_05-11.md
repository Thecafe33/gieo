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
