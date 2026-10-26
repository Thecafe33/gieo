# Phản hồi kết quả kiểm tra độc lập lượt 02–05

Báo cáo gốc: `KET_QUA_KIEM_TRA_02_05_DOC_LAP.md` (commit `e104057`). Kết luận: **đồng ý toàn bộ**. Lượt 05 CHƯA ĐẠT là đúng — đã tái hiện y số liệu của người kiểm và sửa. Phân công: Claude sửa P1/P2 + test hồi quy; subagent Sonnet làm các điểm công cụ nhẹ (đã xem lại, chạy lại).

## Lượt 05 — P1/P2 (đã sửa)

| | Trước sửa (`44bc333`) | Sau sửa |
| --- | --- | --- |
| P1: máy đổi GG01 → GG02, cache máy in GG01 còn | `POSPrinter.layout` = footer `REAL-GG01`, MAC `REAL-MAC` | mặc định (footer rỗng, MAC null) — như trước khi tách |
| P2: bản thử, cache thật ≠ cache vùng thử | footer `REAL-GG01`, MAC `REAL-MAC`, auto `false` (cấu hình THẬT) | footer `TEST-ONLY`, auto `true` (cấu hình VÙNG THỬ) |

**Nguyên nhân:** `const POSPrinter = { autoPrintEnabled: localStorage.getItem(…), layout: loadPrinterLayout() … }` đọc localStorage NGAY lúc tạo; khi chuyển ra file nạp trước script chính, nó chạy trước bước cài chế độ thử và trước bước dọn cache theo quán.

**Sửa (R, khôi phục đúng thời điểm cũ):** khai báo `POSPrinter` trả về script chính ĐÚNG CHỖ CŨ (nguyên văn, kèm chú thích lý do); class máy in, `loadPrinterLayout`, hàm kết nối, `POSTemPrinter` vẫn ở `js/posgieo/pos_printer.v1.js` (chưa phát hành nên sửa thẳng, không cần v2). Đã rà mọi giá trị đầu trong 3 file `js/posgieo` (kể cả lời gọi dạng `obj.method()`): chỉ `POSPrinter` đọc trạng thái máy lúc nạp; `POSTemPrinter` chỉ `Promise.resolve`; trợ lý chỉ `JSON`/`Set`.

**Test hồi quy** (`tools/tach_posgieo/e2e_0d.js` ca 9, 10 — đúng cách tái hiện của báo cáo): chạy trên bản sửa ĐẠT; chạy cùng e2e trên `44bc333` → FAIL với đúng `REAL-GG01`/`REAL-MAC`. Firebase giả của e2e nâng lên nhớ đường dẫn để bản thử chạy qua được bước tự kiểm của `che_do_thu`.

**Chặn tái phát ở công cụ** (Sonnet): `chuyen.js` thêm kiểm **(e)** — phần chạy ngay lúc nạp của giá trị đầu đọc `localStorage`/`sessionStorage`/`indexedDB`/`navigator`/`location`/`document.cookie` (cả qua `window.`), kể cả bắc cầu qua hàm chuyển cùng (≤ 4 tầng, chống vòng) → dừng. Ca 11 (dải máy in trên `481450b`) nay báo đúng lỗi (e) cho `POSPrinter`.

Mô tả phạm vi file máy in sửa theo nhận xét: file chứa kết nối + `POSTemPrinter` (có cả phương thức dựng nội dung tem), không «chỉ transport».

## Lượt 02 — các điểm công cụ (đã làm)

1. `nguon.js` nay THROW khi gặp cú pháp chưa hỗ trợ có thể bỏ sót mã: thẻ có thuộc tính, không `src`, có nội dung, không `id` (vd `type="module"`); `src='…'`/không nháy trỏ `js/`. 7 HTML hiện hành không bị chặn (thẻ có `id` — `#gdRetry`, `#ueRetry`, `#pg*Retry` — được miễn).
2. JS riêng đặt ở gốc: `tests/tach_posgieo_goc.test.js` — mọi `src` ngoài `js/` của posgieo/posgieo_thu/quanlygieo phải khớp danh sách mẫu tên thư viện gốc (thêm `bill_live.vN.js` theo thực tế quanlygieo).
3. `predeploy_check` dùng `fs.realpathSync` (đường symlink Termux) + ca T10b symlink (gỡ sửa → FAIL, đặt lại → PASS).
4. Sổ phát hành: giữ nguyên ý — ghi sổ gắn với bước giao file (`file_thay_doi.js --ghi`), không tự ghi khi sinh bộ.
5–6. Ghi nhận (không đổi): kiểm một-định-nghĩa chỉ bảo vệ tìm tên; rà test đọc thô phải dò cả chuỗi — đã vào quy tắc.

## Lượt 03 — H1 (CẦN CHỦ DỰ ÁN QUYẾT)

Người kiểm đúng: H1 hiện chỉ phủ màn; hàm nghiệp vụ gọi trực tiếp (bàn phím đang focus, callback máy quét native, đường gọi thẳng) vẫn chạy — ví dụ `cartAdj` vẫn đổi số lượng sau khi phủ. Hai hướng:
- **A — giữ lớp phủ, ghi rõ giới hạn** (máy bán hàng chạy APK một cửa sổ; nhiều tab chủ yếu khi mở bằng Chrome).
- **B — thêm cờ chặn ở cửa vào nghiệp vụ** (bắt đầu đơn / thanh toán / thanh toán tách / ghi kho / callback máy quét): cờ bật thì báo «Máy đã đổi cửa hàng — tải lại», không ghi; việc đang chạy dở hoàn tất theo quán gốc. Đổi mã thanh toán/kho (H) — cần chủ dự án duyệt và test focus/Enter, native, pending checkout, visibilitychange.
Chưa làm B tới khi có quyết định.

## Lượt 04

Đồng ý; còn thiếu bài bán hàng hoàn chỉnh có trợ lý (khách / topping / quyền lợi) + chụp chuỗi bọc — đưa vào 1D (kiểm hook theo mùa) trước phát hành rộng.

## Ghi chú môi trường

`file://` bị chặn ở môi trường người kiểm (ERR_BLOCKED_BY_ADMINISTRATOR) — ca (5) chưa nghiệm thu ở đó; ở môi trường này đạt. Không coi là nghiệm thu APK.
