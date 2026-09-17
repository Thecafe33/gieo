# BÀN GIAO — TRẠNG THÁI THẬT

Branch: `claude/confident-wozniak-i81oc8`
Kiểm chứng: `771/771 test pass · 78 module · 0 vi phạm import-direction`

```bash
node tools/run-tests.js              # chạy toàn bộ test
node tools/check-import-direction.js # kiểm luật kiến trúc
node tools/build-html.js             # sinh dist/posgieo-new.html, quanlygieo-new.html
```

---

# 1. ĐÃ XONG

## 1.1 Nền tảng — FIFO làm gốc

| Phần | Nơi | Điểm đáng nhớ |
|---|---|---|
| Unit / vòng đời lô | `fifo-core/unit` | `costBasis` bắt buộc ở đường nhận hàng; `debt` là field tường minh chứ không phải số âm ẩn |
| Ledger | `fifo-core/ledger` | `untrackedPendingDelta` được TÍNH, không nhận làm tham số — chặn đứng lớp bug #1/#11/#14/#17/#18 |
| Engine FIFO | `fifo-core/allocation` | Một implementation duy nhất, sắp theo `openedAt` |
| Đối chiếu / dựng lại | `fifo-core/reconciliation` | `rebuildUnitState` từ sổ thuần; reversal bù đúng allocation gốc, không chạy lại FIFO |
| Projection | `fifo-core/projection` | Công thức `currentStock` đúng một nơi |

## 1.2 Cơ chế dùng chung

- `compaction/versioned-input` — MỘT cơ chế versioning cho 7 domain (Recipe/Cost/Packaging/BTP-yield/PayTerms/KPI/Config). Resolve **từng ngày**, không lấy một điểm đại diện cho cả khoảng.
- `commands/pipeline` — một IdempotencyGuard, `operationId` xác định, không id ngẫu nhiên.
- `store-context/access` — sổ quyền fail-closed, dùng chung cho cả lệnh ghi lẫn truy vấn đọc.
- `store-context/business-day` — businessDate là **trạng thái vận hành**, không phải phép tính từ đồng hồ.

## 1.3 Domain

Catalog · Sales/COGS · Loyalty · Shift/Cash · Payroll · Finance · Alerts · BTP ·
Traceability · Compaction (snapshot/verifier/purge/archive) · Read layer · Reporting.

COGS luôn **hai vế** (lý thuyết / thực tế). Thiếu vế thực tế thì báo "chưa đủ",
không bao giờ lấy lý thuyết đắp vào.

## 1.4 Adapter

| | |
|---|---|
| `legacy-firebase-adapter` | CHỈ ĐỌC schema cũ, có `assertReadOnly`. `bank_confirmations` giữ nguyên path — đổi là phá webhook đang chạy |
| `persistence-firebase/canonical-paths` | Namespace mới `orgs/{org}/stores/{store}/…`, mọi path mang `storeId` |
| `persistence-firebase/atomic-commit` | MutationPlan vào trọn hoặc không vào gì |
| `persistence-firebase/firestore-runner` | **Adapter ghi thật.** WriteBatch Firestore = ranh giới nguyên tử; RTDB chiếu lại sau. Vượt trần 500 op thì TỪ CHỐI, không cắt nhỏ |
| `protected-adapters` | Máy in bill/tem, scanner, bank. Hàng đợi in tự phục hồi sau lỗi |

## 1.5 Tiếp nhận dữ liệu cũ

Hệ mới **tự** đọc hệ cũ khi chạy — không export tay, không file trung gian.

```
bootstrap/startup  →  bootstrap/legacy-takeover  →  commands/takeover  →  atomic-commit
```

Luật (mỗi điều đều có test):
- Tồn đầu = `unitBase` hiện tại.
- **`costBasis` (sửa 2026-09-17, xem `SEED-CONTRACT-V1.md` §3.5):** lấy giá
  hiệu lực gần nhất (≤ cutoverDate) từ `price_history_gieogieo` của item,
  `source: 'LEGACY_PRICE_HISTORY'`. Chỉ để trống + `needsReview:
  SEEDED_WITHOUT_COST` khi item đó không có entry nào trong price history.
  KHÔNG dùng `inventory_items.costPerUnit` (field phẳng, không mốc thời
  gian) làm costBasis — đó vẫn là lỗi "quy hết về giá scalar gần nhất".
- Lô đang mở dở giữ nguyên `openedAt` → FIFO khớp kệ thật.
- Lô đã hết và lô lượng ≤ 0: **không** mang sang.
- Mọi lô mang `origin: LEGACY_SEED`.
- **PIN 4 số mang sang nguyên vẹn** — nhân viên đăng nhập như cũ.
- Không sinh bút toán nhập giả cho tồn đầu.
- Công thức và điều khoản lương hiệu lực **từ** mốc cutover.
- Doanh thu đã chốt đóng băng nguyên trạng.
- `costPerUnit` hệ cũ → `suggestedCostPerUnit`, **không** thành giá vốn lô
  (vai trò riêng, không thay thế `price_history_gieogieo`).
- Đọc hụt một nguồn thì **dừng** — không tiếp nhận một phần.
- Chạy đúng **một lần**, kiểm bằng bản ghi operation trong kho.

**Ranh giới truy vết:** lô seed trả `traceability.complete = false` kèm mốc —
truy vết ĐẦY ĐỦ chỉ bắt buộc từ mốc cutover trở đi; không có nghĩa vụ dựng lại
chuỗi FIFO/nguồn gốc của lô đó trước cutover. Trace nói ra ranh giới thay vì
hiện một lịch sử cụt trông như đầy đủ.

**Việc cần làm — chưa code:** `mapUnit`/`commands/takeover.js` hiện chưa join
`price_history_gieogieo`; đang rơi vào nhánh `NO_COST_BASIS`/`costBasis: null`
cho toàn bộ lô (xem §1.7). Cần sửa trước khi coi phần "tiếp nhận" là xong.

## 1.6 Cutover (P13)

`bootstrap/cutover` — trình tự `OLD STOP → RECONCILE → NEW SOLE WRITER → ROLLBACK WINDOW`.

- Dual-writer **không biểu diễn được**: `writer` là một trường nhận đúng `OLD | NONE | NEW`.
- Cutover chạy một lần; rollback là đường riêng, có cửa sổ, bắt buộc lý do.
- P0..P12 phải PASS **kèm bằng chứng** — ô tick trần bị từ chối.
- Trạng thái lưu trong kho (`system/cutover`), nên F5 không reset quyền ghi.
- Runtime lấy quyền ghi **từ** cutover, không hardcode.

## 1.7 Shadow (P12) — PHẠM VI ĐƯỢC THU HẸP (quyết định 2026-09-17)

`bootstrap/shadow-compare` hiện implement ma trận 11 domain × 11 lớp kịch
bản, đối chiếu TOÀN BỘ lịch sử hệ cũ so với hệ mới. Chủ quán đã quyết định
**thu hẹp phạm vi gate**: chỉ cần đối chiếu đúng **SỐ DƯ MỞ ĐẦU** (opening
balance — tồn theo lô, theo item, và costBasis đã seed) tại đúng mốc
cutover khớp giữa hệ cũ và hệ mới. Không đòi giải thích lệch của từng bút
toán lịch sử trước cutover — biên đó đã được chốt ở `SEED-CONTRACT-V1.md`
("tuyệt đối không truy ngược vào hệ cũ").

Cổng vẫn mặc định ĐÓNG (ô/khoản mục chưa đối chiếu = FAIL), chỉ đổi ĐỐI
TƯỢNG đối chiếu: từ ma trận 121 ô lịch sử → một bảng khớp số dư mở đầu theo
item/lô. **`bootstrap/shadow-compare` cần được thiết kế lại theo scope mới
này** (chưa code) — matrix 11×11 cũ không còn là gate bắt buộc, có thể giữ
làm công cụ chẩn đoán chất lượng dữ liệu cũ nhưng không chặn cutover.

Lần chạy thật đầu tiên trên export production (theo scope CŨ, 121 ô) →
`SHADOW-FINDINGS-V1.md`. Các phát hiện dữ liệu ở đó (thiếu costBasis, thiếu
actorId, lệch Firestore/RTDB...) vẫn có giá trị tham khảo chất lượng dữ liệu,
nhưng **không còn là điều kiện chặn cổng** theo scope mới — trừ phần liên
quan trực tiếp đến chính số dư mở đầu (costBasis nay tiếp nhận được qua
`price_history_gieogieo`, xem §1.5; phần "74,5% consumption không quy được
về lô" là lịch sử tiêu thụ, ngoài phạm vi số dư mở đầu, không chặn).

## 1.8 Kết nối Firebase

Build trích config/tài khoản/phiên bản SDK thẳng từ `posgieo.html` — không chép
bản thứ hai của bí mật vào `src/`. Đăng nhập hỏng thì **không** trao handle
quyền rỗng (rỗng trông y hệt "không có dữ liệu").

---

# 2. CÒN LẠI ĐỂ CHẠY THẬT

## 2.1 CHẶN — không có thì không mở được app

### (a) Đăng nhập + StoreContext — ĐÃ XONG

`bootstrap/startup.prepareAuth` đọc nhân viên/PIN; `pinAuth.authenticate` dựng
`actor`/`context`; runtime chỉ dựng sau khi có context. Màn PIN 4 số đã có
trong QUANLY thin client (`src/apps/quanly/main.js`). Ghi chú (a) cũ trong bản
này bị stale — không còn đúng.

### (b) Năm command ca — ĐÃ XONG, đều đăng ký trong `bootstrap/runtime.js`

| Command | Trạng thái |
|---|---|
| `OpenBusinessDay` | Đã đăng ký |
| `CloseBusinessDay` | Đã đăng ký |
| `OpenCashSegment` | Đã đăng ký |
| `CheckIn` / `CheckOut` | Đã đăng ký |
| `CloseCashSegment` | Đã đăng ký |

Runtime hiện có 20 command, 16 query đăng ký (đếm máy tại
`bootstrap/runtime.js`, không dựa số cũ trong tài liệu này).

## 2.2 UI — ĐÃ CHỐT (2026-09-17), chưa thực hiện

Hai file `src/apps/pos/main.js` và `src/apps/quanly/main.js` là màn hình dựng
mới hoàn toàn — đi lệch hướng đã bàn từ đầu. **Quyết định của chủ quán: dừng
hướng này.**

Hướng đúng, đã chốt: giữ nguyên markup + CSS + luồng màn hình của
`posgieo.html`/`quanlygieo.html`, chỉ thay JS nghiệp vụ bên dưới bằng lời gọi
`runtime.command(...)`/`runtime.query(...)` (qua cùng lớp `controller.js` hiện
có). Ẩn dụ chủ quán dùng: hai file cũ là "cái công ty" (giữ nguyên), các hàm
JS nghiệp vụ cũ là "nhân viên cũ" (sa thải hết, không giữ lại bất kỳ hàm nào
"phòng khi cần"). Chi tiết quy trình: `UI-LEGACY-MIGRATION-PLAN-V1.md` §1a.

`tools/build-html.js` (dựng `dist/*_new.html` từ shell riêng) không còn là
đường release. `src/apps/*/main.js` không phát triển tiếp — phần đã port có
thể tham khảo khi viết lại hàm trong file cũ.

## 2.3 Quyết định của chủ quán

1. ~~**UI: dựng shell mới hay sửa file cũ tại chỗ?**~~ — ĐÃ CHỐT: sửa file cũ
   tại chỗ (xem §2.2).
2. ~~**Phạm vi gate P12/shadow-compare?**~~ — ĐÃ CHỐT: chỉ khớp số dư mở đầu
   tại mốc cutover, không đòi giải thích toàn bộ lịch sử (xem §1.7).
3. ~~**Nguồn costBasis cho lô seed?**~~ — ĐÃ CHỐT: `price_history_gieogieo`,
   không để trống, không dùng `costPerUnit` phẳng (xem §1.5, `SEED-CONTRACT-V1.md` §3.5).
4. **Cửa sổ rollback bao lâu?** (đề xuất 24h, CHƯA CHỐT). Quá hạn thì chỉ sửa
   bằng correction có audit, không quay lui hàng loạt.
5. **Ghi nhận P0..P12 kèm bằng chứng** vào cổng cutover (CHƯA CHỐT) — cổng từ
   chối ô tick trần. P12 tự nó đã thu hẹp phạm vi (mục 2 trên), nhưng cơ chế
   "bằng chứng cho từng phase" vẫn cần chốt riêng.
6. **Ngưỡng `targetPct` giá vốn** cho cảnh báo COGS (CHƯA CHỐT).

## 2.4 Việc phải làm đúng ngày cutover

Tồn đầu chụp tại **mốc dừng hệ cũ**, không phải trước đó. Hệ mới tự đọc nên
không cần export tay — nhưng phải bật app **sau khi** hệ cũ ngừng ghi, nếu không
tồn đầu sẽ lệch số ca bán hàng ở giữa.

---

# 3. ĐIỀU CẦN BIẾT VỀ DỮ LIỆU CŨ

Từ lần chạy shadow thật (`SHADOW-FINDINGS-V1.md`), trên 1.165 bút toán và 172 lô:

- **172/172 lô không có giá vốn.** → COGS **thực tế** sẽ là "chưa đủ" cho toàn
  bộ hàng tiếp nhận, cho tới khi dùng hết và nhập lô mới. Vế **lý thuyết** chạy
  bình thường ngay từ ngày đầu. Đây là hệ quả đã biết của quyết định đã chốt.
- **74,5% tiêu thụ ở hệ cũ không quy được về lô nào.** Không ảnh hưởng hệ mới —
  dòng chảy cũ không mang sang.
- **89,7% bút toán cũ không có người thực hiện.** Cũng không mang sang.
- 7 lô lệch Firestore/RTDB, 5 lô số dư âm → 3 lô lượng ≤ 0 sẽ bị loại khi tiếp nhận.

---

# 4. TÀI LIỆU ĐI KÈM

| File | Nội dung |
|---|---|
| `SEED-CONTRACT-V1.md` | Hợp đồng tiếp nhận dữ liệu cũ |
| `SHADOW-FINDINGS-V1.md` | Kết quả chạy shadow trên dữ liệu thật |
| `GAP-COVERAGE-V1.md` | Từng gap §4 → module → tên test |
| `FIFO-COMPACTION-CONTRACT-V1.md` | Versioning dùng chung + snapshot + purge |
| `UNIFIED-READ-LAYER-CONTRACT-V1.md` | Cổng đọc duy nhất, phân quyền đọc |
| `src/layer-rules.json` | Luật import-direction, máy kiểm được |

Công cụ: `tools/read-firestore-export.js` đọc bản export gốc của Firestore
(EntityProto trong khung LevelDB — không công cụ sẵn nào đọc được).

---

# 5. DỮ LIỆU PRODUCTION — CỐ Ý KHÔNG COMMIT

Tôi đang giữ ngoài repo, và **không** đưa lên git:

```
bản export Firestore đã giải mã   (11.309 entity)
fs-subset.json, rtdb-subset.json  (1.489 doc đã trích)
seed-2026-09-20.json              (bản seed dựng thử)
```

`.gitignore` chặn sẵn `*-subset.json`, `*export*`, `data/`. Chúng nằm trong thư
mục tạm của phiên làm việc và sẽ mất khi phiên kết thúc — đó là chủ đích. Cần
lại thì chạy `tools/read-firestore-export.js` trên bản export của bạn.
