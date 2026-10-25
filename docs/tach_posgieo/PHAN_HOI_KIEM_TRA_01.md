# Phản hồi kết quả kiểm tra độc lập — lượt 01

Báo cáo gốc: `KET_QUA_KIEM_TRA_01_DOC_LAP.md`. File được kiểm: `KIEM_TRA_01_NEN_VA_BAN_DO.md`.
Kết luận: **đồng ý cả 5 điểm + nguyên nhân lỗi test manage**, đã đối chiếu lại bằng mã và xử lý như dưới. Không có thay đổi nào vào app (`posgieo.html`, JS runtime giữ nguyên).

| # | Điểm | Đối chiếu | Đã làm |
| --- | --- | --- | --- |
| 1 | Mẫu nạp lại không phân biệt "tải hỏng" với "chạy dở" | Đúng. Bản cũ chỉ có dấu cuối file → file ném lỗi giữa chừng cũng bị nạp lại, `let/const` khai báo lần hai lỗi | Kế hoạch 5.3 viết lại: hai dấu `'dang'` (câu đầu) / `true` (câu cuối); chỉ nạp lại khi dấu `undefined` (chưa từng chạy — lỗi mạng/404/HTML/cú pháp không tạo khai báo nào); `'dang'` → không nạp lại, màn lỗi + Tải lại trang. Lý do kỹ thuật: khởi tạo khai báo toàn cục tạo mọi `let/const/class/function` của file TRƯỚC câu lệnh đầu. 0E có test cho ba nhánh |
| 2 | Bản đồ bỏ sót phụ thuộc khi phạm vi con trùng tên | Đúng — bản cũ gom MỌI tên khai báo trong cả hàm (kể cả khối con) rồi bỏ qua. Tái hiện: `function f(){ if(x){ let cart=1 } return cart.length }` → bản cũ `deps: []` | Viết `tools/tach_posgieo/scope.js` (phân giải phạm vi đúng: hàm/khối/for/catch/switch/class, hoisting var + function, vế trái phép gán, mẫu). `ban_do.js` dùng nó. Chạy lại trên posgieo: **không phụ thuộc nào bị thiếu so với bản cũ** (lỗi có thật nhưng chưa xảy ra ở posgieo hiện tại). `tools/free_idents.js` có cùng lỗi → đưa vào T7 |
| 3 | Bỏ sót handler gián tiếp `setBatchUnitIce`, `setBatchItemIce` | Đúng — tên nằm trong template `m => \`setBatchUnitIce(…)\`` truyền vào `optsHtml`, chỗ ghép `onclick=` ở hàm khác | Thêm lượt quét: mọi `tenHam(` trong literal chuỗi/template → nhãn `js-chuỗi-gọi` (có thể dư, không thiếu). Số tên có handler: **362 → 400** (+38) |
| 4 | Thứ tự bọc hàm sai trong kế hoạch | Đúng — `gau_noel_giangsinh.v2.js` bọc đồng bộ ngay khi thẻ chạy; automation / Engine 2 `install` lúc DOMContentLoaded | Kế hoạch 5.2: trợ lý → Gấu Noel (lớp ngoài của `renderCustomerInfo`/`clearCustomer`) → automation → Engine 2; test tích hợp phải chụp chuỗi bọc trước/sau tách |
| 5 | Kết luận localStorage quá rộng | Đúng — đếm lời gọi chỉ chứng minh danh sách dọn đủ trong MỘT tab. Grep: posgieo **không có** listener `storage` | Kế hoạch 4.4 ghi rõ giới hạn; 4.3 ghi bản nền chưa có → **H1**, chờ chủ dự án quyết (câu hỏi bên dưới) |
| + | `manage_duyet_gieo` hỏng | Đúng — `tests/lib/extract.js` dòng 37 tự chèn `function vnDate` thật vào mã trích khi hàm có gọi `vnDate` → khai báo này che tham số `vnDate` giả của test | Đưa vào T6 (0C): thêm cách tắt chèn; sửa test dùng cách đó. Đây là thư viện test dùng chung — T6 vốn sửa file này |

## Danh sách JS ngoài dùng tên của app — bản sửa

Bản cũ dò bằng heuristic (chuỗi, hằng VIẾT_HOA) nên vừa dư vừa thiếu. Bản mới phân giải phạm vi trên chính file JS ngoài (`tham-chiếu` = tên tự do thật; `(chuỗi)` = tên nằm trong chuỗi, vd `boc('ten')`):

| JS ngoài | Tham chiếu thật | Qua chuỗi (bọc hàm theo tên) |
| --- | --- | --- |
| `gau_noel_giangsinh.v2.js` | `db`, `fstore`, `orders`, `curOid`, `isAppSale`, `POSPrinter`, `closeSdb` | `renderReceiptCanvas`, `buildReceiptContent`, `renderCustomerInfo`, `clearCustomer`, `delOrderConfirm`, `assistFinalizeOrder` |
| `gieo_automation_pos.v3.js` | `fstore`, `toast`, `showScreen`, `openStockUseScreen`, `loadKhoScreen`, `openPrepBatchScreen`, `openPrepVerifyPOS`, `openMyDutyCasesPOS`, `openPoReceiveScreen` | `renderOpeningChecklist`, `renderDailyClosingChecklist` |
| `gieo_engine2_pos_v1.js` | `db`, `fstore`, `POS_STORE`, `toast`, `posDateKey`, `resolveStaffPinWorkedToday`, `_employeeShiftsTodayCache`, `computeShiftInventoryCountLinesPOS`, `_continueAfterPrepCount` | `openCaLamViecScreen`, `renderOpeningChecklist`, `renderShiftHandoverForm`, `renderDailyClosingChecklist` |
| `data_access.v9.js` | — | `orders`, `togoSettings` (tên bảng, không phải tham chiếu) |
| `unit_engine.v21.js` | — (các `STOCK_*` bản cũ báo là dương tính giả) | — |

Hệ quả cho việc tách: các tên trên là **giao diện công khai** của script chính với JS ngoài — giữ nguyên tên, kiểu khai báo (`let`/`const`/`function`) và thời điểm có giá trị. `curOid`, `orders`, `POS_STORE`, `_employeeShiftsTodayCache` là `let/const` của script chính → JS ngoài đọc qua môi trường từ vựng toàn cục, không qua `window`.

## Kiểm tra lại

- `node tests/tach_posgieo_ban_do.test.js` — 12 ca (5 ca phân giải phạm vi + 7 ca bản đồ trên fixture HTML/JS ngoài), ALL PASS.
- `sh tests/run_all.sh` — 143/144 đạt (thêm test mới); vẫn chỉ `manage_duyet_gieo` hỏng như nền — sửa ở 0C/T6.

## Câu hỏi cho chủ dự án

**H1 — nhiều tab đổi quán:** hiện tab POS đang mở không biết khi một tab khác (cùng trình duyệt) đổi quán. Có làm H1 (tab đang mở thấy binding đổi → ngừng nhận đơn mới, hiện "Máy đã đổi cửa hàng — tải lại") trong kế hoạch này không? Máy bán hàng chạy APK một cửa sổ nên rủi ro thấp; mặc định **chưa làm**, chỉ ghi nhận.
