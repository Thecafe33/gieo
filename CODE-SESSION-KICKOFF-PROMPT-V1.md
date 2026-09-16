# PROMPT KHỞI ĐỘNG CHO SESSION CODE (dán nguyên văn vào session mới)

```
Bạn sẽ code hệ thống mới cho quán "gieo gieo" — thay thế posgieo.html/quanlygieo.html
bằng 1 hệ thống lấy FIFO làm gốc (FIFO = traceability backbone, không phải 1 feature
của kho). Đây là track THỰC THI CODE — có 1 track khác đã làm xong toàn bộ
plan/audit, bạn PHẢI dùng lại, không tự thiết kế lại từ đầu.

VIỆC ĐẦU TIÊN, BẮT BUỘC TRƯỚC KHI VIẾT DÒNG CODE NÀO: đọc file
GIEO-REBUILD-HANDOFF-V2.md — đây là điểm vào duy nhất, có bản đồ đọc toàn bộ tài
liệu còn lại theo đúng thứ tự (mục 1 của file đó). Đọc theo thứ tự đó, không nhảy
thẳng vào code.

3 quy tắc không được vi phạm:
1. 2 file HTML cũ (posgieo.html, quanlygieo.html) CHỈ được dùng để tra cứu "nghiệp
   vụ thật diễn ra thế nào" khi tài liệu chưa rõ — KHÔNG được copy cấu trúc code cũ,
   không được coi legacy là kiến trúc chuẩn.
2. Toàn bộ danh sách gap ở GIEO-REBUILD-HANDOFF-V2.md §4 là YÊU CẦU phải giải quyết
   trong thiết kế mới, không phải ghi chú tham khảo — mỗi domain khi code phải đối
   chiếu đúng phần gap của domain đó (đã trỏ sẵn tới đúng file chain-trace).
3. Nguyên tắc versioning ở §3 (đã xác nhận độc lập 7 lần) là bắt buộc dùng chung 1
   cơ chế cho Recipe/Cost/Packaging/BTP/Payroll/KPI-target/Reporting — không xử lý
   riêng lẻ từng domain.

Build order bắt buộc theo bảng phụ thuộc: [0] Identity → [1] Catalog + [2] FIFO Core
(song song) → [3] Sales → [4] Loyalty + [5] Shift + [6] Payroll (song song) → [7]
Finance → [8] Alerts → [9] Reporting. Khớp với Phase P0-P13 của
GIEO-SYSTEM-REBUILD-PLAN.md — dùng file đó làm lịch thi công chi tiết cho từng Phase.

Nếu gặp câu hỏi mà tài liệu để ngỏ (mục "Open Questions" trong các file thiết kế),
DỪNG LẠI và hỏi người dùng — không tự quyết định thay.

Hệ thống cũ vẫn đang chạy production — mọi thứ bạn xây ban đầu chạy READ-ONLY/
SHADOW/SIMULATE, không ghi vào dữ liệu thật cho tới khi có xác nhận rõ ràng để
cutover.

Sau mỗi giai đoạn có tiến triển thật, cập nhật 1 file trạng thái implementation
(tương tự cấu trúc GIEO-MASTER-IMPLEMENTATION-VERIFICATION-V1.md nếu đã có, hoặc
tạo mới) để track plan có thể đối chiếu lại được — không để tiến độ chỉ nằm trong
lịch sử chat.
```

---

# FILE CẦN GỬI KÈM

**Nếu session mới clone cùng repo `thecafe33/gieo` (khuyến nghị — không cần gửi tay):**
Không cần đính kèm gì — toàn bộ 22 file dưới đây đã nằm sẵn trên branch `claude/vibrant-knuth-rjvz4x`. Chỉ cần trỏ session vào đúng repo/branch đó, prompt ở trên đã đủ.

**Nếu session mới KHÔNG có quyền truy cập repo (dán tay vào cửa sổ chat khác):**

Bắt buộc gửi (đọc trước khi code bất kỳ dòng nào):
1. `GIEO-REBUILD-HANDOFF-V2.md` — điểm vào
2. `GIEO-SYSTEM-REBUILD-PLAN.md` — lịch Phase P0-P13
3. `GIEO-CODE-STRUCTURE-BLUEPRINT-V1.md` — cây thư mục monorepo
4. `FEATURE-TREE-V1.md` — cây tính năng + toàn bộ gap §4
5. `FIFO-CORE-ARCHITECTURE-V2.md` — thiết kế FIFO Engine chi tiết
6. `POS-QUANLY-PERMISSION-CONTRACT-V1.md` — ma trận quyền

Gửi kèm theo đúng Phase đang code (không cần gửi hết ngay từ đầu):
- Phase FIFO Core: `LEGACY-FIFO-AUDIT.md`, `LEGACY-FIREBASE-PATH-MAP-V1.md`, `FIFO-CHAIN-TRACE-RAW-MATERIAL-V1.md`, `FIFO-CHAIN-TRACE-BTP-V1.md`, `FIFO-CHAIN-TRACE-STOCK-COUNT-V1.md`
- Phase Sales/COGS: `FIFO-CHAIN-TRACE-SALES-COGS-PL-V1.md`
- Phase Reversal/Correction: `FIFO-CHAIN-TRACE-REVERSAL-CORRECTION-V1.md`
- Phase Loyalty/Alerts/Catalog/Reporting: `FIFO-CHAIN-TRACE-LOYALTY-V1.md`, `FIFO-CHAIN-TRACE-ALERTS-V1.md`, `FIFO-CHAIN-TRACE-CATALOG-PROMOTION-V1.md`, `FIFO-CHAIN-TRACE-REPORTING-V1.md`
- Phase Payroll: `FIFO-CHAIN-TRACE-PAYROLL-V1.md`
- Phase Compaction: `LEGACY-SNAPSHOT-COMPACTION-AUDIT-V1.md`
- Phase Protected Infra: `PROTECTED-INFRASTRUCTURE-ADAPTER-CONTRACT-V1.md`
- Trước khi xoá/migrate dữ liệu cũ: `DEAD-FEATURE-PRUNING-V1.md`

**Không cần gửi** `posgieo.html`/`quanlygieo.html` (quá lớn, ~50k dòng) trừ khi session code cần tự tra cứu 1 đoạn cụ thể ngoài phạm vi các chain-trace đã có — khi đó chỉ cần copy đúng đoạn theo `file:line` đã trích dẫn sẵn trong các file audit, không cần gửi nguyên file.
