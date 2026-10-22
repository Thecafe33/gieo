# manage.html — duyệt nhanh cho các quán Gieo Gieo (kế hoạch 23/10/2026)

Chủ quán dùng manage nhiều hơn quanlygieo; mục tiêu: các việc chờ quản lý của quán Gieo xử lý được ngay ở manage, **ghi y hệt quanlygieo** (cùng bảng, cùng trường, cùng dấu lãi/lỗ), giao diện theo đúng manage (panel / pill / `.cost-pending`, `dateControl`, `openDialog`, chọn quán Gieo ở `storeSwitcher`, PC + điện thoại).

Căn cứ: lượt rà 22/10 — 20 loại việc chờ ở quanlygieo; quanlygieo2 **không tự duyệt** việc nào (chỉ phân nhóm chờ duyệt / đang xử lý / theo dõi / xong; việc rời nhóm khi dữ liệu gốc đổi). manage hiện chỉ xử lý được: nhận tiền mặt về (`ownerReceipt`), đóng/mở cửa, nhân viên/lương; chi phí Gieo chỉ xem tổng theo sổ lãi/lỗ.

## Quy tắc chung (mọi hạng mục)

- Tên bảng theo quán bằng `ggName(base, storeId)` (gg01 giữ tên cũ, quán khác `__ggNN`) — y cách manage đang đọc dữ liệu Gieo.
- manage **không bọc** `fstore` bằng data_access → mọi lượt ghi làm đổi lãi/lỗ NGÀY ĐÃ QUA phải tự ghi dấu `pl_dirty_gieogieo/{storeId}` `{m:{'từ_đến':lúc}, at}` theo đúng quy tắc `PL_DAU` của `data_access.v9.js` (quanlygieo có dấu tự động vì bọc `plDirtyLookup:true`). Ngày ≥ hôm nay không ghi dấu.
- Ghi dữ liệu kho (tem, sổ kho, BTP) **chỉ qua Unit Engine** (`UnitEngine.<nhóm>.<hàm>`) — manage hiện CHƯA nạp `unit_engine.v21.js` → đợt 2.
- Lượt đọc (N1–N3): chỉ đọc khi mở đúng tab / bấm, truy vấn có `limit`, một truy vấn mỗi quán Gieo đang mở; không listener mới.
- Đọc lại bản ghi trước khi ghi: việc đã được người khác xử lý (không còn trạng thái chờ) → báo «đã được xử lý ở nơi khác», không ghi đè.
- Mỗi hạng mục: test backend (trích hàm qua `tests/lib/extract.js` hoặc fakefb) + e2e trình duyệt PC 1366 + điện thoại 390 + `sh tools/sinh_lai_tat_ca.sh`, `check_boundaries`, `check_paths`.

## Đợt 1 — không cần Unit Engine

| # | Hạng mục | Đọc | Ghi (y quanlygieo) | Giao diện manage |
|---|---|---|---|---|
| 1.1 | **Chi phí chờ duyệt của quán Gieo** (chủ quán chốt 22/10: hiện CHUNG với TC33 / XOFA trong tab Chi phí, duyệt ở đó) | `ggName('expenses_gieogieo',id)` `where status=='pending_review'` `limit(100)` cho từng quán Gieo đang hoạt động, khi mở tab Chi phí (phạm vi Tất cả / Gieo) | Duyệt: `{status:'approved', reviewedAt}` · Từ chối: `{status:'rejected', reviewedAt, reviewNote}` (= `approveExpense`/`rejectExpense` quanlygieo) + dấu `pl_dirty` theo `PL_DAU.expenses_gieogieo` (kỳ `startDate–endDate`, một lần `date`) | Hàng trong khung «N khoản chờ duyệt» `.cost-pending` sẵn có: tên «Gieo GGxx», danh mục, tiền, ngày giờ, người ghi, phương thức trả; nút Từ chối / Duyệt (không có Sửa — sửa khoản Gieo ở Quản lý Gieo) |
| 1.2 | Hộp thư cảnh báo Gieo (đã xem / đã xử lý) | `alerts_gieogieo` `status=='new'` `limit(50)` / quán | `markAlertStatus`: `{status, resolvedAt}` | Panel trong màn «Chờ xử lý · Gieo» (1.5) |
| 1.3 | Ca chưa check-out ngày cũ | `employee_shifts` `checkedOutAt==null` + `businessDate < hôm nay` (giới hạn 62 ngày) | `ccSaveEdit`: giờ ra + `manualEdit:true`; dấu `pl_dirty` theo `PL_DAU.employee_shifts_gieogieo` | Form giờ ra (`openDialog`) |
| 1.4 | Ngày chưa đóng sổ → Đóng ngày | `daily_closings` trạng thái ≠ closed, ngày cũ | `forceCloseStaleDay`: `status:'closed'`, `forceClosedByManagement`, `forceCloseReason` + tự check-out ca còn mở (như quanlygieo) | Nhập lý do bắt buộc |
| 1.5 | Ô tổng «Chờ xử lý · Gieo» (Tổng quan) + màn danh sách | đếm từ 1.1–1.4 khi mở màn (không đếm nền) | — | Widget theo khung `.outlet-widget`, bấm mở danh sách |

**Số dự đoán → số thật** và **Ghi nhận đã trả** của Gieo: GIỮ ở quanlygieo (chủ quán chốt). manage không có lối ghi; khung chi phí Gieo giữ dòng «nhập và chốt sổ ở Quản lý Gieo». Không đọc thêm toàn bộ chi phí Gieo chỉ để đếm khoản dự đoán (tốn lượt đọc) — khi có bản tổng hợp chi phí Gieo theo tháng mới làm nhãn đếm.

## Đợt 2 — cần nạp `unit_engine.v21.js` vào manage

Điều kiện trước: manage nạp `data_access.v9.js` + `unit_engine.v21.js` đúng cách quanlygieo khởi tạo cho MỘT quán (Engine gắn `storeId`); mở rộng `tools/check_boundaries.js` quét cả manage; test ranh giới. Hạng mục: tem «báo hết khi còn nhiều» → Đã xem (`UnitEngine.containers.annotate`); phiếu kiểm kê chờ duyệt (`approveStockCount`/`rejectStockCount`, gồm báo mất hàng — `UnitEngine.lifecycle.approveLostReports`); quy trách nhiệm hao hụt / vụ lệch / «Chờ quản lý duyệt» (`UnitEngine.ledger.annotate`, `UnitEngine.duty.*`); đơn đặt hàng chưa nhận đủ (đóng / huỷ).

## Đợt 3 — BTP

Đối chiếu BTP âm (`btpAm*`), lệch đếm BTP (`UnitEngine.prep.*`).

## Phát hiện ngoài phạm vi (chỉ báo, chưa sửa)

1. `prep_batches.needsReview` không có nút xử lý ở quanlygieo → nằm mãi ở «đang xử lý» của quanlygieo2.
2. `prep_transactions.needsReview` (đối chiếu chế biến) bị đặt về false khi hiển thị → không bao giờ hiện để duyệt.
3. Báo mất hàng chỉ duyệt kèm phiếu kiểm kê (ghi chú POS nói «duyệt thẳng từ Hộp thư» nhưng quanlygieo không có).
4. Nhận tiền mặt về (`ownerReceipt`) không nằm trong theo dõi của quanlygieo2.

## Rủi ro

- Hai nơi duyệt cùng lúc (manage + quanlygieo): đọc lại trước khi ghi, chỉ ghi khi còn `pending_review`.
- Dấu `pl_dirty` thiếu → lãi/lỗ ngày cũ không tính lại: test khoá đúng khoá `từ_đến` và đúng tài liệu quán.
- Đợt 2 đưa Engine vào manage: manage là app xem nhiều quán — phải khởi tạo Engine theo đúng quán của việc đang duyệt, không lẫn quán.

## Trạng thái

| Hạng mục | Trạng thái |
|---|---|
| 1.1 Chi phí chờ duyệt Gieo | ✅ 23/10 — `readCosts` thêm khoản chờ duyệt từng quán Gieo (limit 100), `reviewGieoExpense` (transaction, dấu `pl_dirty` quán), hàng `.cost-pend-row.is-gieo`; test `tests/manage_duyet_gieo.test.js`, e2e `tools/ql_giao_dien/e2e_manage_duyet_gieo.js` (PC + điện thoại) |
| 1.2 Hộp thư cảnh báo Gieo | ✅ 23/10 — màn mới «Chờ xử lý Gieo» (`duyet`, menu sau Tiền mặt): cảnh báo `new` + `seen` từng quán đang hoạt động (2 truy vấn limit 50 / quán, chỉ khi mở màn), Đã xem / Đã xử lý = `markAlertStatus` quanlygieo (`markGieoAlert`, transaction, đã xử lý thì không ghi lại); ẩn chọn quán; test + e2e chung file 1.1 |
| 1.3 Ca chưa check-out ngày cũ | ✅ 23/10 — cùng màn «Chờ xử lý Gieo»: `checkedOutAt == null` limit 100 / quán (truy vấn một trường như quanlygieo), lọc ngày cũ; «Điền giờ ra» (`closeGieoShift`, transaction, như `ccSaveEdit` + `manualEditBy:'manage'`, giờ ra ≤ giờ vào sang ngày sau, > 16 giờ hỏi lại, > 24 giờ chặn) + dấu `pl_dirty` ngày ca |
| 1.4 Ngày chưa đóng sổ | ✅ 23/10 — cùng màn: ngày đã mở ca chưa `closed` trong 30 ngày (2 truy vấn khoảng mã tài liệu / quán như `loadStaleClosingDays`), nhãn trạng thái như quanlygieo; «Đóng ngày» (`forceCloseGieoDay`: lý do bắt buộc, transaction, ghi như `forceCloseStaleDay`, chốt ca treo ngày đó 23:59 `autoCheckOut`, dấu `pl_dirty` khi có ca được chốt, `audit_logs_gieogieo` kèm `storeId`) |
| 1.5 ô tổng trên Tổng quan | chưa — hiện vào qua menu «Chờ xử lý Gieo»; ô đếm trên Tổng quan cần thêm lượt đọc mỗi lần mở Tổng quan → chờ chủ quán quyết |
| Đợt 2, 3 | chưa — cần chủ quán xem kế hoạch Engine trong manage |
