# Kế hoạch sửa lỗ hổng trừ kho / hao hụt ở posgieo (12/11/2026)

> **Tài liệu bàn giao cho phiên làm việc mới.** Đọc file này + `CLAUDE.md` là đủ để bắt đầu; không cần lịch sử trò chuyện.
> Nhánh: `Phan-tach-unit-engine`. Mốc mã lúc lập: `83ec3c8`.
> Nguồn phát hiện: [RA_SOAT_TRU_KHO_HAO_HUT_12-11.md](RA_SOAT_TRU_KHO_HAO_HUT_12-11.md) (báo cáo rà soát, đã tái hiện bằng mã thật).
> Trạng thái: **ĐÃ LÀM F1–F4 (12/11), CHƯA deploy.** Chủ dự án duyệt mục 6: câu 1–2 mặc định (3 ngày), câu 3 có, câu 4 tự chạy nốt, câu 5 bỏ qua (không công cụ rà dữ liệu cũ). Chỗ làm khác kế hoạch: mục 8.

## 1. Bối cảnh cần biết (2 phút)

- **Tem = sự thật.** Tồn NL có tem = Σ tem còn seal + Σ `unitBase` các tem đang mở (RT `active_units_gieogieo/{itemId}/{containerId}`). Khoản trừ không gắn được vào tem nào thì **không đổi tồn**, chỉ ghi sổ `outsideTem:true` + một dòng **Sổ lệch** (`stock_anomalies_gieogieo`, id `tx_<mã dòng sổ>`, `status:'open'`, `kind`).
- **Hao hụt** = dòng sổ `WASTE` trong `stock_transactions_gieogieo`. Hai nguồn chính: **báo hết còn dư** (id `finish_<tem>_WASTE`, lượng = `unitBase` còn lại lúc báo hết) và **cân cuối ca** (id `<opId>_<tem>`, lượng = sổ − số cân).
- **Engine 2** (mặc định TẮT) đọc đúng hai loại dòng đó để quy trách nhiệm cho nhóm pha chế và nâng mức kiểm soát: `unit_engine2_store_v5.js` › `finish()` (báo hết) và `measure()` (cân), luật ở `unit_engine2_v1.js` › `decision()` / `measuredDecision()`.
- Phiên bản: kho `unit_engine.v21.js` **đã phát hành** (không sửa — tạo `v22`). Engine 2 `unit_engine2_store_v5.js` + `gieo_engine2_pos_v5.js` **chưa deploy** (sửa tại chỗ được). Gói chờ deploy: `giao_file/dot_11-11_engine2_v5/`.
- Bốn ưu tiên của chủ dự án (bắt buộc giữ): ① không đổi luồng bán, khách / nhân viên không chờ vô nghĩa; ② nhân viên không làm một việc hai lần; ③ không tạo luồng riêng; ④ không giải thích cho nhân viên.

## 2. Ba lỗ hổng (đã tái hiện)

Chạy lại bất cứ lúc nào:

```bash
node tools/ra_soat/ban_khi_chua_mo_tem.js
```

```bash
node tools/ra_soat/tru_kho_luc_ban.js
```

| Mã | Lỗ hổng | Tái hiện | Hậu quả |
|---|---|---|---|
| **L1** | Bán khi món có tem nhưng **chưa có tem nào đang mở** → sổ ghi tiêu hao ngoài tem + Sổ lệch `no_open_tem −50`. Quét mở tem sau đó: tem nhận đủ dung tích, **không trừ** 50 đã bán. Báo hết (hộp thật đã cạn): tem còn «thừa 50» → ghi `WASTE −50` | `ban_khi_chua_mo_tem.js` tình huống A (B, C là đối chứng đúng) | Hộp 1000 ml, sổ ghi ra 1050 (tính tiền hai lần). Engine 2 quy 50 đó cho pha chế + nâng mức. Cùng lượng hàng nằm ở cả Sổ lệch lẫn hao hụt. Cân cuối ca cũng không đối trừ |
| **L2** | Lệnh trừ tem (RT) **lỗi đúng lúc bán** dù tem đang mở → `unitEngineAllocateConsumption` nuốt lỗi, trả `[]` → y như L1; Sổ lệch gắn nhãn sai `no_open_tem` («chưa quét mở tem»). Không thử lại | `tru_kho_luc_ban.js` tình huống 2, 3, 3b | Như L1, lại chỉ sai nguyên nhân. Trong lần thử **không thấy** cảnh báo `allocate_rtdb_error` được ghi dù mã có `_ueWarnAllocateRtdbError` — phải kiểm vì sao (xem F3) |
| **L3** | Trừ kho của **bill chính** chạy nền, chỉ theo dõi trong bộ nhớ (`trackConsumptionPOS`). App tắt giữa chừng → không ai chạy lại | `tru_kho_luc_ban.js` tình huống 5 (tắt sau khi tem đã trừ, trước khi ghi sổ) | Mất dòng tiêu hao của bill (giá vốn thiếu), không cảnh báo; xoá bill sau đó không có gì để hoàn. Nếu tắt **trước** khi tem kịp trừ: không dấu vết nào, lộ ra về sau thành hao hụt (chuỗi L1) |

Đã kiểm và **đúng** (không sửa): gọi trừ kho hai lần cho một bill; nợ FIFO (bán vượt tem đang mở rồi mở tem mới — tem mới gánh nợ); xoá bill hoàn về tem; báo hết / cân bấm lại không ghi đôi; đua POS ↔ worker lúc cân cuối ca ở bản v5.

## 3. Bốn việc sửa

### F1 — Engine 2 không quy trách nhiệm cho phần hao hụt đã có Sổ lệch giải thích

**Làm được ngay, không đụng kho, không cần duyệt thêm** (Engine 2 v5 chưa deploy; đây là sửa lỗi quy sai người, không đổi tiền / tồn).

- **Sửa ở:** `unit_engine2_store_v5.js` (rồi `node tools/automation/sync.js` để chép sang `functions/automation/shared/`), luật thuần đặt ở lõi nếu cần → **không sửa `unit_engine2_v1.js` đã phát hành**; viết hàm mới trong store hoặc tạo `unit_engine2_v2.js` nếu buộc phải đổi `decision()`. Ưu tiên: store tính «lượng đã có Sổ lệch giải thích» rồi truyền vào như một trường đầu vào mà `decision()` hiện có đã hiểu (xem cách `finish()` đang xử lý `specCheck` / `specOutcome` làm mẫu — hồ sơ `checking` không phân bổ, không nâng mức).
- **Luật đề xuất:**
  1. Khi `finish()` xét dòng `finish_<tem>_WASTE` (và `measure()` xét dòng hụt cân): đọc Sổ lệch của **cùng món**, `status:'open'`, `kind ∈ {no_open_tem, rt_error (F3)}`, `qty < 0`, phát sinh trong khoảng `[mốc đầu khoảng của hồ sơ, lúc báo hết / cân]`. Một truy vấn có giới hạn (≤ 50), dùng chỉ mục đơn trường `itemId` rồi lọc trên máy — **không thêm chỉ mục ghép**.
  2. `explained = min(lượng hao hụt, Σ |qty| các dòng đó)`. Phần `explained` **không phân bổ, không tính vào căn cứ nâng mức**; ghi trên hồ sơ: `explainedByAnomaly:{qty, anomalyIds}`, `basis:'anomaly_explained'` khi giải thích hết. Phần còn lại (nếu > ngưỡng nhiễu hiện có) phân bổ như cũ.
  3. Giải thích **hết** → hồ sơ `decided` với `allocations:[]`, **không** `E.control(... 'PHYSICAL_LOSS')`, không thêm món vào `controlledItemIds`. Quan sát học (`obs`) của khoảng đó gắn `verified:false, reason:'Có Sổ lệch chưa đối trừ'` để không học nhầm thành mức thường.
  4. Engine 2 **không tự đóng** dòng Sổ lệch (việc của quản lý / của F2) — chỉ đọc.
  5. Dòng Sổ lệch đổi trạng thái sau đó (quản lý đóng, F2 đối trừ) → hồ sơ phải tính lại: thêm trigger nhẹ hoặc để lượt quét hằng ngày lo; **đừng** thêm trigger Firestore mới nếu lượt quét đủ (giữ «cổng tín hiệu»).
- **Kiểm toán độc lập** `unit_engine2_audit_v1.js` tự suy lại quyết định từ sổ gốc → phải dạy nó cùng luật (thêm mã vi phạm kiểu `ANOMALY_EXPLAINED_BUT_ALLOCATED`), nếu không `tests/unit_engine2_audit.test.js` sẽ báo lệch. File này chưa nằm trong gói deploy nào — kiểm `tools/js_da_phat_hanh.json` trước khi sửa tại chỗ.
- **Test phải có** (`tests/unit_engine2_anomaly.test.js`): (a) tình huống A của `ban_khi_chua_mo_tem.js` qua `finish()` → 0 phân bổ, mức kiểm soát không đổi; (b) hao hụt 80 có Sổ lệch 50 → chỉ 30 được phân bổ; (c) Sổ lệch ngoài khoảng / món khác / đã đóng → không trừ; (d) cân cuối ca hụt có Sổ lệch → như (a); (e) không có Sổ lệch → kết quả **giống hệt** hiện tại (chạy lại `unit_engine2_store_v5.test.js`, `unit_engine2_runtime.test.js`, `unit_engine2_replay.test.js`).
- **Giới hạn phải ghi rõ khi báo cáo:** F1 chỉ sửa việc quy trách nhiệm; sổ vẫn có dòng `WASTE` thừa (tính tiền hai lần) cho tới khi làm F2.

### F2 — Mở tem gánh luôn phần «bán khi chưa có tem mở» (sửa gốc L1)

**Đổi hành vi kho → cần duyệt (mục 6, câu 1–2).** Engine kho mới `unit_engine.v22.js`.

- **Ý tưởng:** làm đúng như kho đang làm với **nợ FIFO** (`unitEngineOnOpen` gỡ các tem âm và trừ tổng nợ vào tem mới — bất biến B5). Khi quét mở một tem, các dòng Sổ lệch `no_open_tem` / `rt_error` còn mở của cùng món cũng là «hàng đã bán từ chính lô này trước khi quét» → trừ vào tem mới và đóng các dòng đó.
- **Sửa ở:** `unit_engine.v22.js` › `unitEngineOnOpen` (+ bước ghi Firestore sau transaction RT, theo mẫu hai pha `_fifoCarry` / `_ueSettleFifoCarry` sẵn có để mất mạng giữa chừng vẫn hoàn tất được, không trừ hai lần).
- **Thiết kế bắt buộc giữ:**
  1. **Chống trừ đôi:** mỗi dòng Sổ lệch chỉ được gánh một lần — đóng dấu trên dòng (`status:'absorbed'`, `absorbedBy:<containerId>`, `absorbedAt`) trong **transaction Firestore đọc-rồi-ghi**; RT ghi dấu `_anomCarry:{id, anomalyIds, qty}` cùng transaction đổi `unitBase` (như `_fifoCarry`), bước Firestore dọn dấu sau. Mở lại / thử lại thấy dấu thì chạy nốt, không trừ thêm.
  2. **Trần:** tổng gánh ≤ dung tích tem mới (phần vượt để lại Sổ lệch — có thể thuộc tem khác / sai định mức).
  3. **Cửa sổ thời gian:** chỉ gánh dòng phát sinh **sau lần báo hết gần nhất của món** (hoặc ≤ N ngày — hỏi chủ dự án, mặc định 3 ngày) — dòng cũ hơn không chắc thuộc lô này.
  4. **Chỉ NL có tem theo lượng** (`isTemTrackedNL`); tem «cái rời» (`isAtomicUnitItem`, `atomic_unscanned`) và BTP **không** áp dụng.
  5. Sổ: không ghi thêm dòng tiêu hao (dòng `CONSUMPTION outsideTem` đã có) — chỉ nối vết: cập nhật dòng sổ gốc `absorbedIntoContainerId` qua `ledger.annotate` (kiểm danh sách trường được phép `ANNOTATABLE`).
  6. Tồn: sau khi gánh, `_ueRecomputeCurrentStock` → tồn = Σ tem (đã thấp hơn đúng bằng lượng bán trước khi mở).
  7. B1–B15 giữ nguyên; thêm bất biến mới vào `docs/KE_HOACH_UNIT_ENGINE_DA_CUA_HANG.md` mục 2.1 (đề xuất **B16**: «Mở tem gánh khoản bán ngoài tem còn mở của món»).
- **Tạo v22 đúng quy trình:** chép `unit_engine.v21.js` → `unit_engine.v22.js`, sửa `VERSION`; trỏ `posgieo.html`, `quanlygieo.html` (→ `quanlygieo2` sinh lại), `functions/automation/engine.js` + `tools/automation/sync.js` (bản shared), `tools/automation/build_page.js`, `tools/tach_posgieo/ban_do.js`, các test đang nêu tên file v21 (`grep -rl "unit_engine\\.v21\\.js" --include=*.js --include=*.html .`), `docs/UNIT_ENGINE.md`, `CLAUDE.md`. `tests/lib/engine_file.js` tự lấy bản posgieo đang trỏ. Engine 2 `measure()` đòi adapter kho ≥ 21 — v22 thoả.
- **Test phải có** (`tests/mo_tem_ganh_ngoai_tem.test.js`, dùng `tests/lib/wrap_harness.js` + `functions/automation/engine.js` như các kịch bản `tools/ra_soat/`): tình huống A → tem mở ra 950, báo hết lúc cạn → **0 dòng WASTE**, Sổ lệch đóng, tổng sổ ra = 1000; mở tem hai lần / mất mạng giữa hai pha → vẫn 950; Sổ lệch vượt dung tích → gánh tới trần; dòng cũ ngoài cửa sổ → không gánh; nợ FIFO + Sổ lệch cùng lúc → cộng đúng; tem cái rời / BTP → không đổi; xoá bill đã được gánh (hoàn `reversal_outside_tem`) → hoàn đúng về tem đã gánh, không lệch.
- Sau F2, luật F1 vẫn giữ (phòng dòng Sổ lệch chưa kịp gánh), nhưng phải đếm cả `status:'absorbed'` là «đã giải thích xong» để không trừ hai lần ở Engine 2.

### F3 — Trừ tem lúc bán: thử lại khi RT lỗi, ghi đúng lý do (sửa gốc L2)

**Cùng bản `v22` với F2. Cần duyệt câu 3.**

- **Sửa ở:** `unit_engine.v22.js` › `unitEngineAllocateConsumption`.
  1. Bọc transaction RT bằng `_ueRetryAsync` (đã có, đang dùng ở `unitEngineOnOpen`) — nhưng **giới hạn thời gian**: tối đa 2 lần thử, tổng ≤ ~1 giây, vì hàm này nằm trên đường trừ kho của bill (chạy nền, không chặn thanh toán, nhưng nút xoá bill chờ nó). Lỗi nghiệp vụ `prepLocked` **không** thử lại.
  2. **An toàn khi thử lại:** transaction RT bị lỗi có thể **đã ghi ở máy chủ** (mất ACK). Trừ tem không có mã lượt → thử lại mù có thể trừ đôi. Bắt buộc thêm dấu chống lặp ngay trên tem trong cùng transaction: `lastConsumeOps` (vòng ≤ 20 mã `ref.id + '|' + itemId`), thấy mã đã có thì trả lại phân bổ cũ, không trừ nữa. Kiểm `shiftWeighAbsSig` **không** đổi vì trường mới (nó chỉ đọc `shiftWeigh.op`, `lastPrepReconOp`, `lastMgrAdjustOp`).
  3. Vẫn lỗi sau khi thử: giữ hành vi «không chặn bán», nhưng nơi gọi phải biết đây là **lỗi kết nối**: trả cờ (vd `allocations.rtError = true`) để `applyStockTransactionPOS` ghi Sổ lệch `kind:'rt_error'` thay vì `no_open_tem`. Thêm nhãn cho loại mới ở `quanlygieo.html` (bảng nhãn có `no_open_tem`, `reversal_outside_tem` — tìm `no_open_tem:`).
  4. **Điều tra trước khi sửa:** vì sao `_ueWarnAllocateRtdbError` không để lại `alerts_gieogieo/allocate_rtdb_error_*` trong `tools/ra_soat/tru_kho_luc_ban.js` (tình huống 2). Khả năng: `C.getItems()` không có trong môi trường thử → ném trong `try` → chỉ `console.warn`. Nếu trên app thật cũng không ghi được thì đó là lỗi thứ tư, sửa luôn.
- **Điều phối ở POS** (`posgieo.html` › `_applySalesConsumptionCorePOS`, `js/posgieo/pos_orders.v1.js` › `_addonConsumeIngredientPOS`, `js/posgieo/pos_kho.v2.js` › huỷ đồ uống, `js/posgieo/pos_prep.v2.js` › bắt đầu mẻ): các chỗ `.catch(() => [])` quanh `consume.allocate` phải truyền cờ lỗi xuống `ledger.apply`. File `js/posgieo/*.vN.js` đã phát hành → tạo bản `vN+1` (xem `tools/js_da_phat_hanh.json`).
- **Test:** RT lỗi 1 lần rồi được → tem trừ đúng 1 lần, không Sổ lệch; RT «lỗi nhưng thật ra đã ghi» → không trừ đôi; lỗi liên tục → Sổ lệch `rt_error` + cảnh báo `allocate_rtdb_error` có thật; thời gian thêm vào ≤ trần.

### F4 — Bill chính có việc trừ kho bền, mở app / kết ca chạy nốt (sửa L3)

**Đổi luồng lưu bill (thêm một trường) → cần duyệt câu 4.** Không đổi thao tác của nhân viên.

- **Mẫu có sẵn để làm theo:** thêm topping đã có việc bền `consumeJobs` ngay trên bill RT (`js/posgieo/pos_orders.v1.js`: `_addonJobStartPOS`, `_addonJobUpdatePOS`, trạng thái `pending → running → done`, có «thuê» theo thời gian). Bill chính dùng **cùng cấu trúc**, khoá `main`.
- **Sửa ở:** `js/posgieo/pos_thanh_toan.v1.js` (hai chỗ gọi `applySalesConsumptionPOS` trong `confirmPay` / `finalizeSplitPay` → bản `v2`), `posgieo.html` › `applySalesConsumptionPOS`.
  1. Ghi `consumeJobs.main = {status:'pending', at}` **trong chính lần ghi bill** (cùng `set` / transaction RT đang lưu bill — không thêm vòng mạng nào vào đường thanh toán; ưu tiên ①).
  2. Trừ kho xong → `done` (ghi nền, lỗi ghi không ảnh hưởng bill).
  3. **Chạy nốt:** lúc mở app sau đăng nhập và lúc vào bước kết ca, quét bill **của ngày đang mở** có `consumeJobs.main.status ≠ 'done'` quá ~2 phút → gọi lại `applySalesConsumptionPOS` (đã an toàn khi gọi lại: mã dòng sổ cố định `orderId_ing_<món>`, kiểm sổ trước khi trừ tem). Bill đã nằm sẵn trong bộ nhớ POS (danh sách đơn trong ngày) → **không thêm lượt đọc**.
  4. Trường hợp «tem đã trừ nhưng chưa ghi sổ» (tình huống 5): chạy lại sẽ trừ tem **lần hai** vì kiểm sổ thấy chưa có. Phải đóng bằng dấu chống lặp của F3 (`lastConsumeOps`) → **F4 phụ thuộc F3**. Nếu F3 chưa làm thì F4 chỉ được phép **cảnh báo** (ghi `alerts_gieogieo` loại mới «bill chưa trừ kho xong») chứ không tự chạy lại.
  5. Bill bổ sung sau kết ca (`_backfillMode`) và bill xoá dở (`deletionPending`) → bỏ qua, giữ luồng hiện có.
- **Test** (`tests/bill_tru_kho_ben.test.js`, theo mẫu `tests/chuoi_bill.test.js`): tắt trước khi trừ → mở lại chạy nốt, tem + sổ đúng một lần; tắt giữa tem và sổ → chạy nốt không trừ đôi (cần F3); bill đã `done` không chạy lại; bán một bill bình thường **không tốn thêm vòng mạng** (so số lần ghi RT trước / sau).

## 4. Thứ tự và phụ thuộc

| Bước | Việc | Phụ thuộc | Deploy |
|---|---|---|---|
| 1 | **F1** | không | Functions, đi cùng gói `dot_11-11_engine2_v5` (cập nhật gói) |
| 2 | **F3** (dấu chống lặp + thử lại + nhãn đúng) | duyệt câu 3 | Hosting + Functions (kho v22) |
| 3 | **F2** (mở tem gánh Sổ lệch) | F3 cùng bản v22; duyệt câu 1–2 | cùng gói với bước 2 |
| 4 | **F4** (việc bền cho bill chính) | F3 | Hosting |

F2 + F3 nên ra **một** bản `unit_engine.v22.js` (một lần đổi engine, một lần chủ dự án deploy).

## 5. Quy tắc bắt buộc khi làm (trích `CLAUDE.md` — đọc bản đầy đủ)

- Trả lời tiếng Việt. Phản biện trước khi sửa: tìm cơ chế đã có (`[FIX]`, `[TEM = SỰ THẬT]`, `_fifoCarry`, `consumeJobs`…) rồi mới viết.
- JS / engine đã phát hành không sửa → `vN+1`, trỏ app sang. Sổ phát hành: `tools/js_da_phat_hanh.json`.
- Sau mọi sửa file gốc: `sh tools/sinh_lai_tat_ca.sh`, commit cả file sinh ra. **Mốc test: 6 FAIL có sẵn ở `tach_posgieo_chuyen` (test 8, 11)** — số / danh sách khác mốc là có lỗi mới.
- `node tools/check_boundaries.js` → «RANH GIỚI SẠCH»; `node tools/check_paths.js` → «ĐƯỜNG DẪN SẠCH». App không ghi thẳng dữ liệu kho — gọi `UnitEngine.*`.
- Claude không bao giờ deploy. Giao file từ `ban_deploy/giangsinh/`, gói ở `giao_file/<tên đợt>/` kèm `HUONG_DAN.txt` có lệnh `cp` (mẫu: `giao_file/dot_11-11_engine2_v5/HUONG_DAN.txt`).
- Không thêm màn, bước, chữ nào cho nhân viên ở POS. Không thêm vòng mạng vào đường thanh toán.
- Mỗi việc xong: cập nhật `docs/TRANG_THAI.md` (thêm mục đầu file) và file này (mục 7).

## 6. Cần chủ dự án quyết trước khi code F2–F4

| # | Câu hỏi | Đề xuất mặc định |
|---|---|---|
| 1 | F2: đồng ý cho tem mới mở **gánh** phần «bán khi chưa có tem mở» của món (giống gánh nợ FIFO)? | Có |
| 2 | F2: gánh dòng Sổ lệch trong phạm vi nào? | Từ lần báo hết gần nhất của món, tối đa 3 ngày, không vượt dung tích tem |
| 3 | F3: cho trừ tem lúc bán thử lại tối đa 2 lần (~1 giây, chạy nền) khi lỗi kết nối? | Có |
| 4 | F4: bill chưa trừ kho xong thì **tự chạy nốt** lúc mở app / kết ca, hay chỉ cảnh báo quản lý? | Tự chạy nốt (sau khi có F3); trước đó chỉ cảnh báo |
| 5 | Dữ liệu cũ: các dòng `WASTE` giả đã ghi trước đây có cần rà lại không? | Không tự sửa sổ cũ. Viết công cụ **chỉ đọc** liệt kê cặp «Sổ lệch `no_open_tem` còn mở ↔ báo hết còn dư cùng món» trên bản xuất kho (`tools/automation/engine2_audit.js` đọc được bản xuất) để chủ dự án xem quy mô |

## 7. Nhật ký thực hiện

| Ngày | Việc | Kết quả | Commit |
|---|---|---|---|
| 12/11 | Rà soát + lập kế hoạch | Báo cáo + 3 kịch bản thử; chưa sửa | `83ec3c8` |
| 12/11 | F1 Engine 2 không quy phần hao hụt có Sổ lệch giải thích | `unit_engine2_store_v5.js` (finish / measure), kiểm toán thêm 4 mã; test `unit_engine2_anomaly` | `a337e29` |
| 12/11 | F3 + F2 kho `unit_engine.v22.js`; F4 việc bền bill chính (`pos_thanh_toan.v2.js` + `posgieo.html`); nhãn `rt_error` ở quanlygieo | test `tru_tem_thu_lai`, `mo_tem_ganh_ngoai_tem`, `bill_tru_kho_ben`; mốc test giữ 6 FAIL có sẵn | (commit này) |

## 8. Chỗ làm khác kế hoạch / giới hạn còn lại (12/11)

1. **F2 chỉ gánh `no_open_tem`, không gánh `rt_error`.** `rt_error` = lúc bán CÓ tem đang mở (hàng ra từ tem đó) → tem mở sau gánh là sai (tem cũ sẽ báo hết dư đúng lượng đó → tính hai lần). `rt_error` để Engine 2 F1 giải thích + quản lý xử lý.
2. **Cửa sổ F2 = «dòng chưa lần mở tem nào xét»** thay cho «sau lần báo hết gần nhất»: đúng nghĩa «tem mở ĐẦU TIÊN sau lúc bán là tem gánh». Lần mở tem nào đọc thấy dòng mà không gánh (đang có tem khác mở / vượt dung tích) thì đánh dấu `absorbSkippedBy` trên dòng đó → tem mở sau không gánh lại. Không cần truy vấn tem đã báo hết (không giới hạn được) và KHÔNG ghi lên doc món (thử ghi mốc trên doc món thì lớp đồng bộ danh mục đa cửa hàng chép sang quán khác — test `da_cua_hang_b2` bắt được). Kèm: chỉ gánh khi không còn tem khác đang mở; ≤ 3 ngày; chỉ dòng `no_open_tem` ghi từ v22 (`ue:22` — dữ liệu cũ không tự sửa, đúng câu 5).
3. **F3 ở POS: chỉ bán bill chính truyền `opId`** (thử lại + chống lặp). Thêm topping / đổ ly / bắt đầu mẻ / bù BTP chưa truyền `opId` (sẽ cần `pos_orders.v2`, `pos_kho.v3`, `pos_prep.v3` — chưa làm để không phát hành thêm 3 module): các đường này KHÔNG thử lại (như v21), nhưng nhãn Sổ lệch vẫn đúng `rt_error` nhờ engine tự nhận «món vừa lỗi kết nối ≤ 15 giây». Bán BTP trong engine đã dùng `opId = txId`.
4. **F3.4 (vì sao không thấy cảnh báo):** trên app thật cảnh báo vẫn ghi (bộ nhớ đệm `KHO_ITEMS_CACHE` có sẵn); môi trường thử thiếu biến đó → `C.getItems()` ném NGOÀI `try` → cảnh báo bị nuốt. v22 tra an toàn + đọc doc món khi thiếu đệm.
5. **F1 không thêm trigger** khi dòng Sổ lệch đổi trạng thái sau khi hồ sơ đã chốt; hồ sơ chỉ tính lại khi có tín hiệu sẵn có (nguồn đổi, giá đổi…). Một dòng Sổ lệch chỉ giải thích MỘT hồ sơ (truy vấn `explainedByAnomaly.anomalyIds array-contains`, chỉ mục đơn trường tự có). Cửa sổ F1: từ mốc cân hợp lệ, hoặc từ lúc mở tem − 3 ngày (bán trước khi quét mở).
6. **F4 / dấu chống lặp:** vòng 30 lượt / tem. Chạy nốt bill dở chỉ chắc chắn không trừ đôi khi tem đó chưa bị báo hết và chưa quá 30 lượt bán sau lúc app tắt — vì vậy chạy nốt ngay khi mở app (sau khi tải đơn) và ở kết ca, chỉ bill của ngày đang mở, việc chưa xong > 2 phút. Bill bổ sung (`_backfillMode`) không có việc; xoá bill hủy việc `pending` như việc thêm topping.
7. **Deploy:** cần CẢ Hosting (posgieo, quanlygieo, quanlygieo2, `unit_engine.v22.js`, `pos_thanh_toan.v2.js`, store v5) lẫn Functions (`engine.js` + `shared/unit_engine.v22.js` + store v5). Máy còn chạy v21 vẫn đúng như trước (dòng Sổ lệch của v21 không có `ue:22` nên không bị gánh).
