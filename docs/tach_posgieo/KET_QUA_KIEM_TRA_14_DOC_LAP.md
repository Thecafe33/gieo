# Kết quả kiểm tra độc lập lượt 14 — quỹ tiền mặt / mở két

- Ngày: 27/10/2026, giờ Việt Nam.
- Nhánh: `Phan-tach-unit-engine`.
- SHA kiểm: `0dd3b6bf9be68c4656d20bd0d3ee1143a706e03a`; cha trước tách: `c8b6e8fcdd277a2c5ab1a0dade36fce714f672a1`.
- So hành vi với bộ Giáng sinh đã deploy `0bd95a7`.
- Đọc `KIEM_TRA_14_QUY.md`, đối chiếu kết quả kiểm lại lượt 13. Worktree detached riêng `/workspace/work/review14`.
- Không sửa app/JS phát hành, không deploy, không ghi sổ phát hành. Các lỗi giả chỉ cài vào bản sao deploy tạm.

## 1. Kết luận

**ĐẠT việc chuyển mã R của lượt 14 trong phạm vi đã kiểm.** Không phát hiện lỗi hồi quy do tách file. Toàn bộ 35 kịch bản ở hai cửa hàng khớp bản nền, 14 tự kiểm cài lỗi đều bắt được sai lệch. Không có finding sản phẩm mới; các giới hạn mock/thiết bị được ghi riêng bên dưới.

Màn Quỹ tiền mặt vẫn bị ẩn như bản cũ; không xem các ca mở trực tiếp màn này là bằng chứng tính năng đã được bật lại. Lưới mệnh giá và nút mở két vẫn là phần đang dùng.

## 2. Chuyển mã và thứ tự nạp

- AST độc lập so với commit cha: **34/34 tên khai báo nguyên văn**, không còn khai báo trùng trong main.
- Các khai báo còn ở main giữ nguyên, trừ `POS_MODS_THIET_YEU` bổ sung `cashfund`. Toàn bộ câu lệnh cấp cao không phải khai báo giữ nguyên văn và thứ tự.
- Bốn giá trị đầu gọi `cfEmptyDenoms()` chỉ tạo đối tượng mệnh giá mới. Hàm được hoist trong cùng script; `CASH_DENOMS` được khởi tạo trước các lời gọi. Không đọc cache máy, Firebase hoặc DOM lúc khởi tạo.
- Các chỗ dùng `cfEmptyDenoms`, `cfRenderDenomGrid`, `cfDenomTotal` trong `pos_shift`, `pos_shift_closing`, `pos_handover` nằm trong thân hàm, không chạy trước khi module quỹ nạp. Hai biến `_shiftOpenDenoms`/`_shiftCloseDenoms` vẫn ở main, sau chốt module thiết yếu.
- Probe riêng GG02: module đầy đủ → qua chốt, một timer hạn dùng; 404 hoặc ném lỗi sau dấu `dang` → màn đỏ, không khởi động timer, không khai báo lexical lần hai. **3/3 PASS**.
- Sinh lại bộ thường/Giáng sinh/Tết giữ đường `js/posgieo/pos_cashfund.v1.js`; kiểm bằng bộ test và diff tracked sau sinh.

## 3. Bài đã chạy

Đã cài dependency bằng `npm install --ignore-scripts`. Sinh xong bộ deploy trước khi E2E đọc chúng. Chromium `/usr/bin/chromium`; HTTP cục bộ với Firebase giả, không gửi nghiệp vụ vào Firebase thật.

| Bài | Kết quả |
| --- | --- |
| `sh tools/sinh_lai_tat_ca.sh` | **TẤT CẢ ĐẠT**, 151 file test; sinh lại không có diff tracked |
| `node tools/check_boundaries.js` | RANH GIỚI SẠCH |
| `node tools/check_paths.js` | ĐƯỜNG DẪN SẠCH: 109 tên, 875 lời gọi, 54 động đã duyệt |
| `node tools/tach_posgieo/e2e_kho.js` | **910 khẳng định, ALL PASS**: 35 kịch bản × GG01/GG02 + 14 tự kiểm; 70 dump khớp ghi/toast/trạng thái/lỗi |
| `node tools/tach_posgieo/e2e_ban.js` | 36 khẳng định, ALL PASS |
| `node tools/tach_posgieo/e2e_hook.js` | 13 khẳng định, ALL PASS; 25 chuỗi hàm khớp; cài lỗi bắt đúng 4 tên |
| `node tools/tach_posgieo/e2e_0d.js` | 47 PASS, 1 FAIL ca file://; không báo ALL PASS |
| `node tools/btp_am/e2e_btp_am.js` | ALL PASS, 4 nhóm ca × 1366/390 px; đây là test trích hàm kiểm hạn/check-out |
| `node tools/automation/e2e_shift_work.js` | PASS 1366/390 px; khung giao diện với render giả, không phải toàn POS |

Ca file:// tái hiện `net::ERR_BLOCKED_BY_ADMINISTRATOR` khi mở trực tiếp `/workspace/work/review14/posgieo.html`; các ca HTTP, bản thử `?b=`, module thiếu/chạy dở và cache cửa hàng đều qua. Không coi giới hạn này đã được khắc phục bởi việc tách file.

## 4. Probe độc lập mở két

Runner tạm dùng cùng helper hai bản, cùng dữ liệu giả và giờ cố định, chạy cả GG01/GG02; không sửa công cụ/app được phát hành.

### 4.1 Hai người trong ca, nhập PIN

- Mồi e1/e2 cùng đang check-in để không tự chọn một nhân viên.
- Máy in giả đếm số lần `openDrawer()`.
- Mở tấm thật, chọn «Kiểm đếm két»; nhập PIN sai → không gửi lệnh, không ghi nhật ký.
- Nhập PIN đúng của e2 → đúng một lệnh, tấm đóng, nhật ký mang e2 và đúng quán. So cả lượt ghi, toast, trạng thái, lỗi với mốc.
- Cài lỗi vào bản sao module: thay `await POSPrinter.engine.openDrawer();` thành hai lần gọi. **Bộ so sánh bắt lệch mục `sau`**, số lệnh tăng lên 2; không cần dựa vào việc log có đổi hay không.

### 4.2 Lệnh két thành công nhưng ghi nhật ký thất bại

- Cùng luồng PIN trên; thay riêng `add()` của collection nhật ký bằng Promise reject ở cả mốc và bản tách.
- Cả hai cửa hàng: đúng một lệnh két, tấm đóng, có cảnh báo «Két đã mở nhưng CHƯA ghi được nhật ký — báo Quản lý»; trạng thái/toast/lượt ghi lỗi khớp mốc.
- Hiện cả thông báo thành công trước khi Promise ghi bị reject rồi cảnh báo thất bại. Đây là hành vi có sẵn, nguyên văn ở mốc; không báo thành lỗi do tách. Probe không chứng minh cơ chế xếp hàng offline/retry của SDK thật.

**47 khẳng định, ALL PASS** cho hai ca × hai quán và tự kiểm nhân đôi lệnh.

Lần thử đầu dùng `__HONG` với `op:'add'` không kích hoạt được lỗi: `fb_gia.js` chỉ gọi bộ cài lỗi ở một số phương thức, `add()` hiện không gọi `hong()`. Probe đã báo FAIL đúng điều kiện «lỗi phải thực sự được cài» và thiếu toast cảnh báo. Tester thay bằng Promise reject trực tiếp, chạy lại hai ca/tự kiểm và đạt. Không dùng lần đầu đó làm bằng chứng thử mất mạng thành công. Đây là giới hạn công cụ, không phải lỗi hồi quy của app. Nếu bổ sung ca này vào runner chính, nên thêm hỗ trợ cài lỗi `add()` hoặc giữ stub có kiểm chứng.

## 5. Firebase giả và ý nghĩa kiểm tra quỹ

- Ca chi tiêu kiểm đúng **lệnh ghi**: expenses arrayUnion, lấy 100.000, thối 20.000, netAmount 80.000; cập nhật hai đường mệnh giá với số gia −1/+1.
- `increment` của mock trả số gia, không thực hiện đầy đủ phép cộng SDK. Do đó không kết luận từ fixture rằng số dư từng mệnh giá sau nhiều giao dịch đã được nghiệm thu. Hạn chế được tài liệu lượt 14 công khai; không phải lỗi mới do lần tách này.
- Chạy thêm sáu probe Node VM độc lập: union/remove map đảo khóa; set không merge với arrayUnion; update đường lồng; transaction lỗi phải rollback; retry transform đúng một lần. **6/6 PASS**; F12-1 vẫn đóng.
- Query orderBy/limit và listener nhiều ảnh vẫn chưa mô phỏng đầy đủ. Chưa kiểm hai cửa hàng production đồng thời.

## 6. Trả lời phản biện

1. **Giữ một file trong lượt R này là chấp nhận được.** Có thể tách helper mệnh giá và mở két ra khỏi phần quỹ ẩn ở lượt R riêng nếu muốn tên/phạm vi rõ hơn. Không cần đổi lúc này để app chạy đúng. Chưa có số đo cho thấy chia thêm file giúp giảm CPU/RAM; các thẻ hiện vẫn tải toàn bộ module.
2. **Giữ `cashfund` là module thiết yếu.** Mở/kết/giao ca phụ thuộc trực tiếp helper mệnh giá. Không thấy lời gọi sớm bị sót trong ba module nạp trước; AST, startup và các ca ca/kết ca trong bộ E2E kiểm lại việc nối dây này.
3. **Mức công khai của `CF_PASSWORD` không đổi.** Giá trị và logic so sánh giữ nguyên, trước ở HTML công khai, nay ở JS công khai. Chuyển file không tạo kiểm soát truy cập phía server. Không chép giá trị vào báo cáo; thay cơ chế xác thực là việc H/backend riêng, ngoài phạm vi R.

## 7. Giới hạn và bước tiếp

- Máy in/két giả, chưa APK hoặc thiết bị thật. Probe lỗi add là từ chối Promise, không phải mô phỏng offline persistence của Firestore.
- Chưa phủ quỹ giữa ca, override số đầu ca, kết ca không bill, chuỗi nhiều giao dịch để đối chiếu tồn mệnh giá thật.
- Toàn bộ 8 bước kết ca liền nhau vẫn chưa được chứng nhận; phạm vi mới là quỹ/mở két. Các giới hạn đã ghi ở lượt 13 không tự biến mất khi E2E cũ chạy lại đạt.
- Có thể đưa hai probe mở két vào bộ chính; không yêu cầu sửa hành vi sản phẩm trong lần tách.

Log ở `/workspace/work/review14-*.log`, dump đầy đủ `review14-dump/`, probe `review14-extra-dump/`; script tạm trong `review14/tools/tach_posgieo/*.tester.js`. Chỉ báo cáo được đưa lên nhánh.
