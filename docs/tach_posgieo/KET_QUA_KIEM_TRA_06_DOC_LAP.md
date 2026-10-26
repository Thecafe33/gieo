# Kết quả kiểm tra độc lập lượt 06 — Nội dung in và giao diện in/quét

- Ngày kiểm: 26/10/2026, giờ Việt Nam.
- Nhánh: `Phan-tach-unit-engine`; SHA kiểm: `9f5bd11a`.
- Đối chứng trước Đợt 1C: `48b0b43c`.
- Đã đọc `KIEM_TRA_06_IN_QUET_UI.md`, phản hồi lượt 02–05 và quy tắc dự án hiện hành.
- Vai trò tester: không sửa app/JS nghiệp vụ, không deploy, không ghi sổ phát hành.

## Kết luận

**Đạt phần chuyển mã R đã kiểm ở mức phần mềm. Không phát hiện lỗi mới cần chặn lượt 06.** Hai lỗi cache P1/P2 của lượt 05 đã được kiểm lại và không còn tái hiện ở bản này.

Chưa nghiệm thu in bill/tem và quét trên APK/WebView cùng thiết bị Bluetooth/LAN thật. Không coi báo cáo này là phê duyệt deploy hoặc chứng nhận phần thiết bị. Chủ dự án đã chọn giữ H1 dạng lớp phủ, nên không mở lại yêu cầu thêm guard nghiệp vụ trong lượt R này.

## Kết quả chạy lại

| Kiểm tra | Kết quả |
| --- | --- |
| `sh tools/sinh_lai_tat_ca.sh` | TẤT CẢ ĐẠT; 149 file test trong bộ hiện tại |
| `node tools/check_boundaries.js` | RANH GIỚI SẠCH |
| `node tools/check_paths.js` | ĐƯỜNG DẪN SẠCH: 109 tên, 875 lời gọi, 54 động đã duyệt |
| `node tools/kiem_tra_xuyen_app.js --assert-clean` | 0 trường hợp lỗi; 9 kiểm tra đạt |
| `node --check` cho 5 JS riêng POS | Đạt |
| Checksum 5 JS riêng trong ba bộ mùa | Mỗi file giống nhau giữa thường/Giáng sinh/Tết |
| BTP PC/mobile | ALL PASS |
| FIFO | 28/28 |
| Nhận hàng | 80/80 |
| Engine 2 POS | Đạt ở 1366px và 390px |
| Gấu Noel | 71/72 toàn bài; Gieo G1–G14 đạt, lỗi kiosk K3 `null.style` như nền |
| `e2e_0d.js` | 20/21 assertion đạt; chỉ `file://` thất bại do môi trường chặn |

Gấu Noel chạy bằng bản test tạm đổi executable Chromium sang `/usr/bin/chromium` và phục vụ HTTP localhost thay `file://`, không thay assertion. Browser môi trường đã được xác nhận chặn `file://` bằng `ERR_BLOCKED_BY_ADMINISTRATOR`. Không coi phép chạy HTTP thay thế là nghiệm thu file://.

Sinh lại không làm đổi file tracked trong worktree kiểm tra; file `e2e_gau.tester.js` là bản tạm untracked, không thuộc bộ bàn giao.

## Đối chiếu phần mã di chuyển

Đọc script chính của `48b0b43c:posgieo.html` bằng AST và so nguyên văn từng statement khai báo với hai file hiện tại:

- `pos_print_content.v1.js`: **12/12 giống nguyên văn**.
- `pos_print_ui.v1.js`: **45/45 giống nguyên văn**.
- Tổng 57 tên duy nhất. Không tìm thấy phép gán trực tiếp vào 57 tên này trong AST script chính mới.
- `_temDiagOpen` và `_temPollTimer` chỉ được khai báo/sử dụng trong file UI mới; script chính không gán lại chúng. Thay thời điểm khởi tạo literal `false`/`null` không gây đọc cache như lỗi máy in trước đó.
- `POSPrinter` ở lại main, sau cài chế độ thử và dọn dữ liệu theo cửa hàng. Các tên đọc runtime như `REPRINT_LOG_COLL`, `_scanPending`, `_scanSeq` và callback native vẫn tồn tại ở main; hàm file ngoài chỉ đọc chúng khi được gọi sau khởi tạo.

## Kiểm thêm ngoài các bài đã có

### 1. Thiếu/chạy dở từng module mới

Chạy trên HTML thật qua HTTP và Firebase/CDN giả; lần lượt thay phản hồi cho `pos_print_content.v1.js` và `pos_print_ui.v1.js`:

- 404 cả lần đầu và retry: yêu cầu đúng 2 lần, hiện `#posModThieu`, không vào màn nhập mã.
- Script đặt marker `'dang'`, khai báo một const rồi throw: yêu cầu đúng 1 lần, hiện màn lỗi, không vào màn nhập mã và không có lỗi khai báo const lần hai.

Cả 4 trường hợp đạt. Đây là bằng chứng chốt module bao phủ cả hai file mới, không chỉ file UI pilot cũ.

### 2. Máy quét và callback native giả

Sau khi main khởi tạo ở scope GG02:

- Không có `AndroidScanner`: `posScan()` trả `error: 'no-scanner'`.
- Cài mock `getScannerVersion() = 1`, `scan(id)` trả qua `__androidScanResult`: Promise nhận đúng mã `SCAN-06`, format QR.
- `_scanPending` được dọn về 0 sau khi nhận kết quả.
- Gọi lại callback cùng ID với mã khác không phát sinh lượt chờ mới.

Đạt trong Chromium. Mock này kiểm liên kết hàm/file và giao thức callback, không thay thử APK thật.

### 3. Nhật ký in lại đúng quán

Mock Firebase ghi lại path khi `.add()`, gắn POS với GG02 rồi gọi `logReprint` trong file UI mới. Quan sát ghi đúng:

```text
label_reprints_gieogieo__gg02
```

Không ghi vào tên GG01 không hậu tố. Field order/kind/scope/detail được truyền qua. `renderTemCanvas` cũng chạy được qua liên kết với các tên ở file máy in/main và tạo canvas 320×240 trong fixture.

Đây là kiểm một lượt ghi nhật ký ở GG02, không chứng nhận mọi thao tác nhiều cửa hàng hay Firebase Security Rules.

### 4. Cài lỗi vào JS mới để kiểm ba bài cấm mẫu mã

Tạo worktree âm riêng, thêm hàm không được gọi vào `pos_print_ui.v1.js` chứa:

```js
function testerForbidden() {
  fstore.collection('rewards');
  fstore.collection('stock_transactions_gieogieo').add({});
  setTimeout(fetchAllCustomersCache, 1);
}
```

Chạy riêng ba test: `stamp_free`, `ledger_once`, `khach_goi_y` — cả ba **thất bại đúng mẫu cấm**. Nguồn sạch của ba bài đạt trong suite. Không đưa hàm thử vào nguồn release.

### 5. Kiểm lại P1/P2 lượt 05

Chạy lại e2e mới và probe độc lập từ lần kiểm trước:

- Binding GG02, dấu cache cũ GG01, cache chứa footer `REAL-GG01`/MAC `REAL-MAC`: sau main, cache bị dọn; object in dùng footer rỗng/MAC null. Đạt.
- Bản thử, cache thật và cache `__thu__` khác nhau: object in dùng footer `TEST-ONLY`, MAC null, auto-print true của vùng thử. Đạt.

Như vậy sửa đưa `POSPrinter` về vị trí cũ đã giải quyết hai hồi quy đã báo. Không phát hiện initializer đọc storage tương tự trong hai file mới.

## Trả lời các điểm cần phản biện

1. Không tìm thấy đường chạy app trước hai thẻ mới gọi một trong 57 tên đã chuyển. Màn nhập mã/khởi động vẫn theo chốt main; thiếu module được phát hiện trước khi dùng các hàm đó. Cần giữ đúng vị trí thẻ nếu sửa HTML về sau.
2. Không có gán trực tiếp 57 tên trong main. Gấu Noel vẫn bọc hàm global qua `window`; bài Gieo có dựng bill/QR đạt. Không dùng kết quả này để tuyên bố đã chụp đầy đủ chuỗi hook của mọi nhánh async — bài chuỗi hook và bán có trợ lý đầy đủ vẫn thuộc nghiệm thu tiếp theo như phản hồi lượt 04.
3. `logReprint` ra file ngoài không làm đổi lớp `fstore` đã được GieoData cài. Checker vẫn đọc được hằng ở main; probe ghi đúng hậu tố GG02 như trên.
4. Hai biến `let` UI không bị main gán; đọc/ghi giữa script thường cùng global lexical environment hợp lệ. Probe máy quét cũng xác nhận hàm file ngoài làm việc với map/sequence/callback còn trong main.

## Giới hạn còn giữ

- Chưa APK/WebView, in Bluetooth/LAN hay quét camera thật.
- Chưa xác nhận file:// trong môi trường tester.
- Cloud/network/backend được giả; không thử lỗi trên dữ liệu thật.
- H1 chỉ lớp phủ theo lựa chọn A của chủ dự án, không đổi thành guard giao dịch trong lượt này.
- Sổ phát hành còn chờ bước giao file. Nếu file đã từng được giao/deploy ngoài trạng thái ghi trong tài liệu thì phải đối chiếu version/checksum trước khi sửa cùng tên.

## Bằng chứng và chạy lại

Worktree nguồn sạch: `/workspace/work/review06` tại `9f5bd11a`. Worktree cài lỗi riêng: `/workspace/work/review06-negative`.

Logs: `/workspace/work/review06-suite.log`, `review06-boundaries.log`, `review06-paths.log`, `review06-cross.log`, `review06-0d.log`, `review06-btp.log`, `review06-fifo.log`, `review06-receiving.log`, `review06-e2.log`, `review06-gau.log`, `review06-probes.log`, `review06-extra.log`, `review06-negative-*.log`.

Probe bổ sung: `/workspace/work/review06-extra.cjs`; probe cache dùng lại `/workspace/work/review-probes.cjs` với worktree mới. Các đường workspace là bằng chứng của phiên kiểm tra, không là file cần upload Hosting.

Lệnh chuẩn lấy nguyên từ mục 3 của `KIEM_TRA_06_IN_QUET_UI.md`, cộng `node tools/kiem_tra_xuyen_app.js --assert-clean` và `node tools/automation/engine2_e2e.js`. Chưa thực hiện bước tách tiếp theo.
