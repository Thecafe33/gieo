# GIEO — hệ thống mới

Thay thế `posgieo.html` / `quanlygieo.html`, lấy **FIFO làm gốc** (traceability backbone của toàn hệ thống, không phải một feature của kho).

> **Hệ thống cũ vẫn đang chạy production.** Mọi thứ trong repo này chạy READ-ONLY cho tới khi cutover (Phase 13). 2 file HTML cũ chỉ dùng để tra cứu nghiệp vụ thật, **không** phải kiến trúc chuẩn để copy.

---

## Bắt đầu từ đâu

**Điểm vào duy nhất: [`GIEO-REBUILD-HANDOFF-V2.md`](GIEO-REBUILD-HANDOFF-V2.md)** — mục §1 có bản đồ đọc toàn bộ tài liệu còn lại theo đúng thứ tự. Đừng nhảy thẳng vào code.

**[`GAP-COVERAGE-V1.md`](GAP-COVERAGE-V1.md)** — bảng đối chiếu từng gap ở HANDOFF-V2 §4 → code đã giải quyết ở đâu → test nào chứng minh. Đây là cách kiểm được quy tắc "mọi gap là yêu cầu, không phải ghi chú".

Cặp contract bắt buộc trước khi viết Ledger/Unit persistence:
- [`FIFO-COMPACTION-CONTRACT-V1.md`](FIFO-COMPACTION-CONTRACT-V1.md) — gồm cơ chế versioning **dùng chung** cho 7 domain (HANDOFF-V2 §3)
- [`UNIFIED-READ-LAYER-CONTRACT-V1.md`](UNIFIED-READ-LAYER-CONTRACT-V1.md)

---

## Lệnh

```bash
node tools/run-tests.js                # chạy test  (thêm tham số để lọc theo tên)
node tools/check-import-direction.js   # kiểm tra ranh giới layer — exit 1 nếu vi phạm
node tools/build-html.js               # sinh dist/posgieo-new.html + dist/quanlygieo-new.html
```

Không cần cài gì. Không npm, không pnpm, không TypeScript, không bundler, không Vitest.

---

## Stack — đã chốt

| | |
|---|---|
| Ngôn ngữ | **JS thuần trong HTML**, không TypeScript |
| Đóng gói | **2 file HTML tự chứa** — APK WebView nạp y như hiện tại, không rủi ro CORS |
| Build | 1 script Node nối file, **không phải bundler** |
| Dữ liệu | Firebase (giữ nguyên hạ tầng, chỉ đổi cách tổ chức đọc/ghi) |

`tools/build-html.js` tồn tại vì domain core phải được sinh vào **cả hai** file từ **một** nguồn. Chép tay 2 bản thì sớm muộn 2 bản lệch nhau — đúng lớp bug "2 app 2 công thức độc lập" của legacy (`LEGACY-FIFO-AUDIT.md` §16.3).

---

## Cấu trúc

```
src/
  layer-rules.json      # bộ luật import-direction — MỘT nguồn cho cả runtime lẫn CI
  runtime/registry.js   # module registry, enforce luật ngay lúc nạp trang
  layers/<layer>/       # domain, mỗi layer 1 thư mục
  apps/pos|quanly/      # UI mỏng
tools/                  # checker + build
dist/                   # 2 file HTML sinh ra (không sửa tay)
```

Tài liệu `.md` và `posgieo.html`/`quanlygieo.html` hiện để ở gốc repo. Blueprint §3 dự kiến dời vào `docs/` + `legacy/` — đó là bước dọn repo, cố ý hoãn để tránh xung đột với nhánh tài liệu.

### Import-direction

Blueprint §2 quy tắc 5 nói vi phạm ranh giới layer phải **FAIL**, không phải "review sau". Không có build step nên không có `dependency-cruiser`; thay bằng:

1. **Runtime** — `GIEO.define()` từ chối dependency sai luật, trang không nạp được.
2. **Offline** — `tools/check-import-direction.js` quét toàn nguồn, exit 1.

Cả hai đọc chung `src/layer-rules.json`, nên CI và trình duyệt không bao giờ hiểu luật khác nhau.

Luật cứng: `apps` không bao giờ chạm thẳng `fifo-core` / `compaction` / adapter Firebase — chỉ qua `commands` (ghi), `read-layer` (đọc), `bootstrap` (nối port). `read-layer` là nơi **duy nhất** biết cả LIVE lẫn COMPACT.

---

## Trạng thái

| Phase | |
|---|---|
| P0 Audit | ✅ xong (nhánh tài liệu) |
| P1 Foundation | ✅ `shared-kernel` + `store-context` + `VersionedInput` |
| `[0]` Identity | ✅ Employee + Shift + PayTerms versioned |
| `[2]` FIFO Core | ✅ Unit + Ledger + Projection + Allocation + Reconciliation |
| `[1]` Catalog | ✅ Menu + Category + Promotion + Packaging |
| `[3]` Sales | ✅ Bill + Recipe/Cost versioned + COGS 2 vế + pipeline |
| `[4]` Loyalty | ✅ Customer + LoyaltyLedger + Accrual |
| `[5]` Shift/Cash | ✅ Đoạn ca + đối soát két + blockingClose |
| `[6]` Payroll | ✅ Work schedule + ComputePayroll + PayrollClosing |
| `[7]` Finance | ✅ Expense + Config versioned |
| `[8]` Alerts | ✅ Route theo (type, severity), tự đóng khi điều kiện hết |
| `[9]` Reporting | ✅ Định giá FIFO thật + variance + export CSV |
| P4 Traceability | ✅ Trace 2 chiều + dependency registry |
| P7 Read layer | ✅ Cổng đọc duy nhất, enforce quyền đọc |
| P5 BTP | ✅ PrepBatch + yield versioned + actual-vs-theoretical + báo cáo ngày |
| Protected adapters | ✅ Bill/label printer + scanner + bank, kèm **fix** queue bị đầu độc |
| Adapter Firebase | ✅ `legacy-firebase-adapter` (chỉ đọc) + `persistence-firebase` (ghi nguyên tử) |
| P6 Compaction | ✅ `VersionedInput` + Unit/Book snapshot + verifier + lifecycle + archive registry + purge gate |
| P9-P10 UI | 🔨 shell/controller, legacy read port, Firebase SDK read bridge, Catalog realtime và Reporting READ_ONLY đã xong; chờ cấp Firebase config/handles thật |
| P12-P13 Shadow + Cutover | ⬜ chưa bắt đầu |

**654 test pass, 69 module, 0 vi phạm import-direction.**

Build order theo `FEATURE-TREE-V1.md` §3:
`[0] Identity → [1] Catalog + [2] FIFO Core → [3] Sales → [4] Loyalty + [5] Shift + [6] Payroll → [7] Finance → [8] Alerts → [9] Reporting`

### Đã chốt trong phiên code

- FIFO cấp phát theo `openedAt` (giữ hành vi production nhiều năm)
- Multi-store: `storeId` có mặt mọi nơi, chỉ 1 giá trị thật, **không** xây `ALL_STORES`
- **Ngày làm việc chốt bằng thao tác ở QUANLY sau khi kết ca**, không theo mốc giờ. Nên `businessDate` là trạng thái vận hành (`store-context/business-day`), và `clock` cố ý **không có** `businessDate()` — chỉ có `calendarDate()`. Đơn lúc 0h30 vẫn thuộc ngày chưa chốt.
- `FINISH_REVIEW_RATIO`: **cấu hình ở QUANLY**, không hard-code — đi qua `VersionedInput` kind `config`
- Lương cứng: **trừ theo `work_schedule`** — Work schedule từ optional thành **bắt buộc** cho payroll; có lương cứng mà chưa xếp lịch thì từ chối tính, không đoán ngày vắng
- Mở lại kỳ đã chốt: **giữ v1 vĩnh viễn, tạo v2** có `supersedesSnapshotId`, actor/lý do/phạm vi; persistence tách head khỏi từng revision và read-layer đọc snapshot được chọn mà không tính lại.
- Race 2 QUANLY hoàn cùng giao dịch: **release gate bắt buộc trước shadow/cutover**. `runAndCommit` giữ atomic claim ở `RUNNING` đến khi commit thật hoàn tất; test đồng thời bắt buộc đúng 1 winner/commit.
