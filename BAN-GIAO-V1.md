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
- Tồn đầu = `unitBase` hiện tại. `costBasis` để **trống**, không bịa.
- Lô đang mở dở giữ nguyên `openedAt` → FIFO khớp kệ thật.
- Lô đã hết và lô lượng ≤ 0: **không** mang sang.
- Mọi lô mang `origin: LEGACY_SEED`, cờ `SEEDED_WITHOUT_COST`.
- **PIN 4 số mang sang nguyên vẹn** — nhân viên đăng nhập như cũ.
- Không sinh bút toán nhập giả cho tồn đầu.
- Công thức và điều khoản lương hiệu lực **từ** mốc cutover.
- Doanh thu đã chốt đóng băng nguyên trạng.
- `costPerUnit` hệ cũ → `suggestedCostPerUnit`, **không** thành giá vốn lô.
- Đọc hụt một nguồn thì **dừng** — không tiếp nhận một phần.
- Chạy đúng **một lần**, kiểm bằng bản ghi operation trong kho.

**Ranh giới truy vết:** lô seed trả `traceability.complete = false` kèm mốc.
Trace nói ra ranh giới thay vì hiện một lịch sử cụt trông như đầy đủ.

## 1.6 Cutover (P13)

`bootstrap/cutover` — trình tự `OLD STOP → RECONCILE → NEW SOLE WRITER → ROLLBACK WINDOW`.

- Dual-writer **không biểu diễn được**: `writer` là một trường nhận đúng `OLD | NONE | NEW`.
- Cutover chạy một lần; rollback là đường riêng, có cửa sổ, bắt buộc lý do.
- P0..P12 phải PASS **kèm bằng chứng** — ô tick trần bị từ chối.
- Trạng thái lưu trong kho (`system/cutover`), nên F5 không reset quyền ghi.
- Runtime lấy quyền ghi **từ** cutover, không hardcode.

## 1.7 Shadow (P12)

`bootstrap/shadow-compare` — ma trận 11 domain × 11 lớp kịch bản. Cổng mặc định ĐÓNG.
Đã chạy thật một lần trên export production → `SHADOW-FINDINGS-V1.md`.

## 1.8 Kết nối Firebase

Build trích config/tài khoản/phiên bản SDK thẳng từ `posgieo.html` — không chép
bản thứ hai của bí mật vào `src/`. Đăng nhập hỏng thì **không** trao handle
quyền rỗng (rỗng trông y hệt "không có dữ liệu").

---

# 2. CÒN LẠI ĐỂ CHẠY THẬT

## 2.1 CHẶN — không có thì không mở được app

### (a) Đăng nhập + StoreContext
`globalThis.GIEO_CONTEXT` hiện **không ai đặt**. Mở `dist/*.html` lên sẽ báo
*"chưa có StoreContext để khởi động"*.

Cần màn nhập **PIN 4 số** (đã có sẵn trong dữ liệu tiếp nhận) → dựng `actor` →
`createContext`. Xem `store-context/access.createActor` và `store-context/context`.

Vai trò hợp lệ: `POS_OPERATOR`, `STORE_MANAGER`, `QUANLY_OPERATOR`,
`QUANLY_ADMIN`, `SYSTEM_ADMIN`.

### (b) Bốn command ca còn thiếu
Logic **đã có**, chưa bọc thành command và chưa đăng ký trong `bootstrap/runtime`:

| Cần tạo | Logic sẵn ở |
|---|---|
| `OpenBusinessDay` | `store-context/business-day.openDay` |
| `CloseBusinessDay` | `business-day.closeDay` + `commands/shift.closeDayBlockers` |
| `OpenCashSegment` | `commands/shift.openSegment` |
| `CheckIn` / `CheckOut` | `hr/shift.checkIn` / `.checkOut` |

Đã đăng ký sẵn: `CloseCashSegment`.

## 2.2 UI — quyết định lớn chưa chốt

Hai file `src/apps/pos/main.js` và `src/apps/quanly/main.js` là màn hình **tôi tự
dựng**. Đó là việc bạn không yêu cầu, và nó chỉ phủ được lát mỏng.

Hướng đúng đã bàn nhưng **chưa làm**: giữ nguyên markup + CSS + luồng màn hình
của `posgieo.html`/`quanlygieo.html` (~4.500 dòng), chỉ thay phần JS bên dưới
(~45.000 dòng) bằng lời gọi `runtime.command(...)` / `runtime.query(...)`.

Độ phủ hiện tại, đo bằng máy:

```
COMMAND đăng ký: 15  →  9 có đường gọi trong controller
QUERY   đăng ký: 16  → 15 có đường gọi
Hàm controller không có nút nào bấm: 21
```

Chưa có UI: mở/chốt ngày, mở két, vào/ra ca, đăng nhập, màn BTP (nấu mẻ, sửa
yield), `RecordAddon`, `ReviseState`, `CorrectLedgerEntry`, `RestoreFoundContainer`,
và các nút duyệt/điều chỉnh/hoàn đơn của QUANLY.

## 2.3 Ba quyết định của chủ quán

1. **Cửa sổ rollback bao lâu?** (đề xuất 24h). Quá hạn thì chỉ sửa bằng
   correction có audit, không quay lui hàng loạt.
2. **Ghi nhận P0..P12 kèm bằng chứng** vào cổng cutover — cổng từ chối ô tick trần.
3. **Ngưỡng `targetPct` giá vốn** cho cảnh báo COGS.

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
