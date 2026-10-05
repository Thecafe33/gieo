# Gieo Gieo — Kế hoạch tối ưu lượt đọc & xử lý (T0 → T6)

> Lập ngày 05/10/2026, sau khi Firestore vượt hạn mức miễn phí ngày 04/10 (52K lượt đọc / 50K).
> Áp dụng cho `posgieo.html`, `quanlygieo.html`, `unit_engine.v18.js`. Số dòng trong file sẽ trôi — **luôn tìm theo tên hàm**.
> Hạn mức Firestore là **của cả project `the-cafe-33`** — XOFA & The Cafe 33 dùng chung.

---

## 0. Cách dùng file này

**Câu mở đầu gợi ý cho phiên Claude mới:**
> Đọc CLAUDE.md, docs/TRANG_THAI.md, docs/KE_HOACH_TOI_UU_DOC.md. Chạy `sh tests/run_all.sh` và `node tools/check_boundaries.js`. Làm giai đoạn T… — phản biện trước, báo tôi rồi mới sửa. Không deploy.

Mỗi giai đoạn một phiên, một lần deploy. Mức model gợi ý: T1, T3 → Sonnet, medium · T2, T4 → Opus, high · T5 (engine) → Opus, xhigh · T6 → Sonnet, medium.

---

## 1. Ba nguyên tắc → quy tắc kiểm được

| # | Nguyên tắc | Quy tắc cụ thể trong code |
|---|---|---|
| **N1** | Mỗi nghiệp vụ chỉ xử lý **một lần** | Số liệu của **ngày đã qua** được tổng hợp một lần, lưu lại (`ledger_day_summaries_gieogieo`) và từ đó chỉ đọc bản tổng hợp; chỉ **hôm nay** mới đọc sổ gốc. Hai màn/hàm cùng cần một khối dữ liệu trong cùng lúc → dùng chung một lời gọi đang chạy (gộp lời gọi trùng). |
| **N2** | Chỉ đọc **trong phạm vi cần dùng** | Không `.get()` cả collection **lớn dần** (sổ kho, bill, ca, khách, vụ lệch…) rồi lọc ở máy — phải có `where` theo ngày / mã hoặc `limit`. Tra theo khoá → `doc(id).get()`. Khoảng ngày đọc đúng khoảng cần, không đệm thêm. |
| **N3** | Các màn hình **dùng chung** kết quả đã tải | Dữ liệu danh mục (nguyên liệu, BTP, nhân viên, công thức, cấu hình…) có **một** chỗ giữ trong mỗi app; mọi màn đọc từ đó. Làm mới bằng listener (chỉ trả tiền tài liệu đổi) hoặc xoá đệm **khi ghi**, không đọc lại theo đồng hồ. |

Giữ nguyên: bất biến B1–B15, **con số hiển thị không đổi** (tối ưu ≠ đổi nghiệp vụ), D17 (không chặn bán khi lỗi đọc — lỗi thì lui về cách đọc cũ).

---

## 2. Hiện trạng (quét AST ngày 05/10)

- ~500 điểm gọi `.get()` / `.onSnapshot()` (POS + Quản lý + engine); **225** điểm không có `doc()` và không có `limit()`.
- Đọc nhiều nơi nhất (số điểm gọi: tổng · POS · QL · engine):

| Collection | Tổng | POS | QL | Engine | Ghi chú |
|---|---|---|---|---|---|
| `prep_batches_gieogieo` | 40 | 18 | 18 | 4 | |
| `stock_transactions_gieogieo` | 28 | 10 | 13 | 5 | **lớn nhất** — 1 dòng / nguyên liệu / bill |
| `inventory_items_gieogieo` | 26 | 19 | 4 | 3 | 16 chỗ đọc **cả collection**; POS có `KHO_ITEMS_CACHE` nhưng **13 chỗ** vẫn đọc thẳng |
| `daily_closings_gieogieo` | 21 | 14 | 7 | 0 | |
| `prep_transactions_gieogieo` | 17 | 2 | 11 | 4 | sổ BTP, lớn dần |
| `employee_shifts_gieogieo` | 15 | 3 | 11 | 1 | |
| `prep_items_gieogieo` | 11 | 7 | 1 | 3 | POS có `PREP_ITEMS_CACHE_POS` nhưng **7 chỗ** đọc thẳng |

- Đã tối ưu từ trước (giữ, không làm lại): bộ đệm sống `_posLiveSubscribe` (công thức, topping, bao bì, nhân viên, check-in, refill rules), cổng checklist đầu ca, chấm FIFO qua RT, gợi ý mẻ, bản tổng hợp tiêu hao 30 ngày (`ledgerConsumptionStats`), danh sách lô 80 dòng — tìm chú thích `[GIẢM-ĐỌC]`.
- Quản lý: bộ nhớ đệm `_memo` chỉ sống **20 giây** (`MEMO_TTL`) — gần như mỗi lần chuyển màn đều đọc lại.

---

## 3. Thủ phạm (xếp theo mức nghi ngờ — ước lượng, chưa đo)

Chủ dự án xác nhận 05/10: **1 máy POS, < 60 bill/ngày** → ~60 × ~8 dòng sổ/bill ≈ **500 dòng sổ kho/ngày**. Các ước lượng dưới đây theo mức đó.

| # | Ở đâu | Vì sao tốn | Ước lượng |
|---|---|---|---|
| **P1** | **Thiếu composite index** → các cơ chế giảm-đọc **âm thầm lui về đọc sổ gốc** (chỉ `console.warn`) | `ledgerConsumptionStats` (Vốn trong kho, chạy nền ở màn **Hôm nay** và Sức khoẻ) cần index `stock_transactions (businessDate, createdAt)`; thiếu → đọc **30 ngày sổ gốc** mỗi lần (đệm 5 phút) | ~15.000 / lần mở Quản lý |
| **P2** | QL `computeLedgerRealMetrics` — gọi từ Hôm nay, Sức khoẻ, Báo cáo (2 kỳ), Tháng kết, NL-BTP | Đọc **mọi dòng** sổ NL + sổ BTP trong khoảng ngày, không đệm, không tổng hợp | Hôm nay ~500/lần; tháng ~15.000/lần; năm: lớn hơn nhiều |
| **P3** | POS `fetchAllCustomersCache` (5 giây sau khi mở app) + màn Khách hàng `_custFetchAll` | Đọc **toàn bộ** `customers` (dùng chung 3 thương hiệu) | số khách × số lần mở POS × số máy |
| **P4** | Engine `dutyCompute` (cân cuối ca / đếm BTP có lệch) | Đọc sổ của món trong **3 ngày** (khoảng đo ± 1 ngày đệm); `dutyLoadHistory` đọc mọi vụ lệch của món | ~180 / món hay bán; ~2.500 / lần cân 15 món |
| **P5** | POS đọc cả `inventory_items` / `prep_items` ở 20 chỗ (mở màn Kho, Hao hụt, Nhận hàng, Kiểm kê, Chế biến, checklist…) | Bỏ qua bộ đệm có sẵn | ~100–200 / lần mở màn |
| **P6** | QL đọc cả lịch sử: `loadExpensesAll`, `loadAssetsAll` (không đệm), `ensurePriceHistory`, `ensureRecipeHistory`, `ensurePrepRecipeHistory`, `loadDailyOpsAll`, `loadBookClosings`, `config_history` (không `limit`) | Collection lớn dần, đệm 20 giây – 5 phút | tăng dần theo tháng |

Các index các fallback khác đang chờ (thiếu thì đọc nhiều hơn, số liệu vẫn đúng):

| Collection | Trường (thứ tự) | Dùng ở |
|---|---|---|
| `stock_transactions_gieogieo` | `businessDate` ↑, `createdAt` ↑ | `_ledgerSumFresh` (P1) |
| `prep_transactions_gieogieo` | `businessDate` ↑, `createdAt` ↑ | `prepDaySummaries` (kiểm ngày cũ bị ghi thêm) |
| `stock_transactions_gieogieo` | `type` ↑, `businessDate` ↑ | `_ledgerWasteRows` (hao hụt theo khoảng) |
| `prep_transactions_gieogieo` | `type` ↑, `businessDate` ↑ | `_ledgerWasteRows` |
| `stock_transactions_gieogieo` | `itemId` ↑, `createdAt` ↓ | `_histLoad` (lịch sử 1 nguyên liệu; thiếu → quét 1.500 dòng) |
| `prep_transactions_gieogieo` | `prepId` ↑, `createdAt` ↓ | `_histLoad` (lịch sử 1 BTP) |

> `customers` **không** cần index thêm: tra theo số điện thoại là `doc(sđt)` (1 lượt); gợi ý theo đầu số dùng index mã tài liệu có sẵn.

---

## 4. Lộ trình

Mỗi bước: **phản biện → báo → sửa → test → tạo bản `_thu` → chủ dự án deploy & thử máy thật → so lượt đọc với mốc**.

### T0 — Không sửa code (chủ dự án làm ngay)
1. Firebase Console → Firestore → **Indexes → Composite**: tạo 6 index ở bảng mục 3 (hoặc mở Quản lý trên trình duyệt có Console, bấm đường link tạo index trong các dòng cảnh báo `Cần tạo composite index…`). Chờ trạng thái **Enabled**.
2. Firestore → **Usage**: chụp biểu đồ lượt đọc theo giờ của 2–3 ngày gần nhất làm **mốc**; ghi lại giờ vọt lên trùng với việc gì (mở Quản lý xem báo cáo / cân cuối ca / bật máy POS).
3. Ghi số máy POS, số bill/ngày, XOFA & The Cafe 33 còn chạy trên project này không.

**Xong khi**: 6 index Enabled; có mốc lượt đọc/ngày. Kỳ vọng P1 giảm ngay.

### T1 — Đo chính xác (công cụ dán vào Console, không deploy)
- `tools/dem_luot_doc.js` (cùng kiểu `tools/don_myGifts_free_stamp.js`): dán vào Console của POS / Quản lý → bọc `get` / `onSnapshot` / `runTransaction` ở tầng SDK, đếm **số tài liệu trả về** theo collection + hàm gọi (lấy từ stack) + màn đang đứng; lệnh `demLuotDoc.bang()` in bảng xếp hạng.
- Đo một vòng chuẩn: mở Quản lý → Hôm nay → Sức khoẻ (tuần, tháng) → Báo cáo → Tháng kết; POS: mở app → bán 5 bill → kiểm kê → cân cuối ca.

**Xong khi**: có bảng lượt đọc theo hành động, xác nhận (hoặc sửa) thứ tự P1–P6.

### T2 — Quản lý: sổ kho theo ngày (N1) — lợi nhất
- Mở rộng bản tổng hợp `ledger_day_summaries_gieogieo` (cùng cơ chế `ledgerConsumptionStats`: ngày đã qua tính một lần, kiểm "ngày cũ bị ghi thêm" bằng 1 lượt đọc `limit(1)`, giá **không** lưu — nhân `itemCostOn` lúc đọc) cho mọi khối mà `computeLedgerRealMetrics` và `computeThangKetKhoExtra` cần: hao hụt (theo ngày, theo sự kiện đổ ly), tiêu hao, điều chỉnh, nhập; sổ BTP cùng cách.
- Phiên bản tổng hợp tăng `LEDGER_SUM_V` (bản cũ tự dựng lại).
- Hôm nay vẫn đọc sổ gốc nhưng **một lần cho cả màn** (Hôm nay + Vốn trong kho + Sức khoẻ "hôm nay" dùng chung), đệm tới khi có ghi mới hoặc người dùng bấm Tải lại.
- Test: với cùng dữ liệu giả, số liệu trước/sau **bằng nhau tuyệt đối** (Hôm nay, tuần, tháng, Tháng kết, ngày có bill bổ sung sau đóng ngày, ngày có hoàn bill).

**Xong khi**: mở Sức khoẻ tháng / Tháng kết tốn ≈ số ngày + sổ hôm nay, không còn ≈ số dòng sổ cả tháng.

### T3 — POS: khách hàng (N1 + N2) — giữ nguyên cách gợi ý (chủ dự án chốt 05/10)
- **Không** đổi cách gợi ý số điện thoại (vẫn lọc cả "bắt đầu bằng" lẫn "chứa" trên danh sách đầy đủ).
- Bỏ `setTimeout(fetchAllCustomersCache, 5000)` lúc mở app. Danh sách chỉ nạp khi **vào màn thanh toán** (`#sc`) lần đầu — ý của chủ dự án.
- Danh sách giữ trong máy (localStorage, đọc/ghi bọc try/catch) kèm ngày nạp; **mỗi ngày làm mới tối đa 1 lần** (lần vào màn thanh toán đầu tiên trong ngày). Tải lại app trong ngày → dùng bản trong máy, không đọc Firestore.
- Khách vừa tạo ở POS: đã được thêm vào danh sách trong máy sẵn (`allCustomersCache.unshift` trong luồng tạo khách) → ghi luôn vào bản lưu.
- **Tem / ly miễn phí KHÔNG BAO GIỜ lấy từ danh sách gợi ý** (đã kiểm 05/10): bấm dòng gợi ý → `selectPhone` → `lookupCustomer`; gõ đủ 10 số → `lookupCustomer`. Cả hai đọc thẳng `doc(sđt)` từ máy chủ rồi `renderCustomerInfo` hiện tem / ly miễn phí; đổi ly (`consumeFreeToGoDrink`) và cộng tem (`loyaltyAddStamps`) đọc lại trong transaction. Danh sách gợi ý chỉ dùng để tìm số (SĐT, tên, điểm The Cafe 33).
- Gõ đủ 10 số → vẫn `lookupCustomer` đọc thẳng `doc(sđt)` → điểm / tem / ly miễn phí luôn đúng. Chỉ số điểm hiện trong dòng gợi ý có thể cũ tối đa 1 ngày; khách XOFA / The Cafe 33 tạo trong ngày chưa hiện trong gợi ý (gõ đủ số vẫn tra ra).
- Màn Khách hàng (`_custFetchAll`): dùng lại cùng danh sách trong máy nếu đã có trong ngày, thay vì tải lại toàn bộ.
- Không ghi, không đổi cấu trúc `customers` (dùng chung XOFA / The Cafe 33).
- Lượt đọc: từ "số khách × số lần mở app" còn "số khách × 1 lần/ngày".

### T4 — Lớp dữ liệu dùng chung (N3)
- POS: một chỗ giữ `inventory_items` + `prep_items` bằng listener (cùng mẫu `_posLiveSubscribe`) — 20 chỗ đọc thẳng chuyển sang đọc từ đó; engine vẫn nhận qua `getItems` / `getPreps` như cũ. Màn nào **cần số tồn chính xác tại thời điểm ghi** thì vẫn đọc trong transaction của engine (không đổi).
- Quản lý: thay `MEMO_TTL` 20 giây bằng đệm sống tới khi **chính app ghi** (đã có `memoDropItems` / `memoDropPreps` / `memoDropExpenses` ở các hàm ghi) hoặc bấm Tải lại; thêm đệm cho `loadAssetsAll`, `loadDailyOpsAll`, `loadBookClosings`; `config_history` có `limit`.
- **Gộp với M1 của `docs/KE_HOACH_DA_CUA_HANG.md`**: lớp này viết thành file dùng chung (`data_access.v1.js`) — để M1 chỉ cần thêm `storeId`, không làm hai lần. Chế độ thử tráo ở tầng `fstore`/`db` nên lớp mới không cần biết.

### T5 — Engine v19 (N2) — sửa engine = tạo `unit_engine.v19.js`, 2 HTML trỏ tới
- `dutyCompute` (`_dutyDays`): phản biện lý do đệm ±1 ngày (dòng sổ ghi lệch ngày: bill sát nửa đêm, bổ sung sau đóng ngày, máy lệch giờ). Chỉ thu hẹp khi chứng minh được không sót dòng — vd đọc theo `createdAt` trong khoảng đo thay vì 3 ngày `businessDate`; không chứng minh được thì giữ nguyên. `dutyLoadHistory` thêm `limit` (chỉ dùng 10 vụ gần nhất).
- Rà lượt đọc trong transaction bán hàng (mỗi món: tài liệu món + dòng sổ + dấu huỷ bill) — chỉ bỏ lượt đọc trùng, **không** bỏ lượt đọc giữ bất biến (B1–B15, chống trừ trùng).
- Test duty / chuỗi bill hiện có phải xanh nguyên.

### T6 — Chốt chặn để không tái phát
- `tools/check_reads.js` (gọi trong `predeploy_check.sh`): báo lỗi khi có `.get()` / `.onSnapshot()` mới trên collection lớn dần (danh sách: sổ kho, sổ BTP, bill lưu trữ, ca, khách, vụ lệch, cảnh báo, chi phí…) mà không có `where` / `limit` / `doc`; ngoại lệ ghi trong `tools/reads_allow.json` kèm lý do.
- Thêm vào `docs/TRANG_THAI.md`: lượt đọc/ngày sau mỗi giai đoạn.

---

## 5. Câu hỏi cần chủ dự án trả lời

| # | Câu hỏi | Cần trước |
|---|---|---|
| Q1 | ~~Số máy POS, số bill/ngày~~ → **1 máy POS, < 60 bill/ngày** (05/10). Còn hỏi: Quản lý mở trên máy nào, khoảng bao nhiêu lần/ngày? | T1 |
| Q2 | ~~XOFA & The Cafe 33 còn chạy?~~ → **Có, cùng project** (05/10). Lượt đọc của họ tính chung hạn mức nhưng không nằm trong kế hoạch này → T0/T1 phải tách được phần của Gieo Gieo để biết còn bao nhiêu chỗ | T1 |
| Q3 | ~~Đổi cách gợi ý SĐT?~~ → **Không đổi**; nạp khách khi vào màn thanh toán (05/10) — xem T3 | — |
| Q4 | Nút "Tải lại" ở Quản lý là cách duy nhất để lấy số mới khi máy khác vừa ghi (thay cho tự đọc lại sau 20 giây) — đồng ý, hay cần listener cho màn nào? | T4 |
| Q5 | ~~Mục tiêu?~~ → **Cả project < 50K lượt đọc/ngày** (hạn mức miễn phí) (05/10). Vì XOFA & The Cafe 33 dùng chung, phần của Gieo Gieo phải nhỏ hơn 50K trừ phần của họ — đo ở T0/T1 | — |
