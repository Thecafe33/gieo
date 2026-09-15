# GIEO — hệ thống mới

Thay thế `posgieo.html` / `quanlygieo.html`, lấy **FIFO làm gốc** (traceability backbone của toàn hệ thống, không phải một feature của kho).

> **Hệ thống cũ vẫn đang chạy production.** Mọi thứ trong repo này chạy READ-ONLY cho tới khi cutover (Phase 13). 2 file HTML cũ chỉ dùng để tra cứu nghiệp vụ thật, **không** phải kiến trúc chuẩn để copy.

---

## Bắt đầu từ đâu

**Điểm vào duy nhất: [`GIEO-REBUILD-HANDOFF-V2.md`](GIEO-REBUILD-HANDOFF-V2.md)** — mục §1 có bản đồ đọc toàn bộ tài liệu còn lại theo đúng thứ tự. Đừng nhảy thẳng vào code.

Cặp contract bắt buộc trước khi viết Ledger/Unit persistence:
- [`FIFO-COMPACTION-CONTRACT-V1.md`](FIFO-COMPACTION-CONTRACT-V1.md) — gồm cơ chế versioning **dùng chung** cho 7 domain (HANDOFF-V2 §3)
- [`UNIFIED-READ-LAYER-CONTRACT-V1.md`](UNIFIED-READ-LAYER-CONTRACT-V1.md)

---

## Lệnh

```bash
node tools/check-import-direction.js   # kiểm tra ranh giới layer — exit 1 nếu vi phạm
node tools/build-html.js               # sinh dist/posgieo-new.html + dist/quanlygieo-new.html
```

Không cần cài gì. Không npm, không pnpm, không TypeScript, không bundler.

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
| P1 Foundation | 🔨 `shared-kernel` xong — ids / result / clock / operation-state |
| P2→P13 | ⬜ chưa bắt đầu |

Build order theo `FEATURE-TREE-V1.md` §3:
`[0] Identity → [1] Catalog + [2] FIFO Core → [3] Sales → [4] Loyalty + [5] Shift + [6] Payroll → [7] Finance → [8] Alerts → [9] Reporting`

### Điểm còn treo, cần chủ quán xác nhận

- **Ranh giới ngày làm việc** (`src/layers/shared-kernel/clock.js`) — đang mặc định 0h. Chưa có bằng chứng trong audit về việc quán chốt ngày ở giờ khác. Đổi giá trị này làm đổi mọi báo cáo theo ngày.
- `FIFO-CORE-ARCHITECTURE-V2.md` §11 OQ#3 (ưu tiên sửa QUANLY reversal race) và OQ#4 (có cần xem lại snapshot v1 sau khi mở lại sổ) — sẽ hỏi khi tới Phase 6.

### Đã chốt trong phiên code

- FIFO cấp phát theo `openedAt` (giữ hành vi production nhiều năm)
- `FINISH_REVIEW_RATIO`: **có** xây — gắn `needsReview` + đẩy Alerts
- Multi-store: `storeId` có mặt mọi nơi, chỉ 1 giá trị thật, **không** xây `ALL_STORES`
