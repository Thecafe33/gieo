# Tổng hợp kiểm tra độc lập lượt 02–05

Ngày: 26/10/2026, giờ Việt Nam. Tester: Codex. Nhánh Phan-tach-unit-engine, HEAD rà 44bc333. Không sửa code vận hành, không deploy, không ghi sổ phát hành.

## Kết quả từng lượt

| Lượt | Mốc kiểm riêng | Sinh lại + suite | Boundary / path / audit xuyên app | Kết luận độc lập |
| --- | --- | --- | --- | --- |
| 02 Công cụ | 6fdd956 | Đạt | Đạt | Chấp nhận phần mềm đã kiểm, giới hạn parser/Termux/sổ phát hành phải giữ rõ |
| 03 Pilot/chốt H1 | 7929eda | Đạt | Đạt | Pilot/retry HTTP đạt; H1 chỉ là lớp phủ, chưa chứng minh chặn mọi entry mới |
| 04 Trợ lý | 481450b | Đạt | Đạt | 59/59 khai báo nguyên văn; chấp nhận R đã kiểm, chưa kiểm đầy đủ bán có trợ lý/APK |
| 05 Máy in | 44bc333 | Đạt | Đạt | CHƯA ĐẠT: initializer đọc cache trước cách ly thử và dọn cache cửa hàng |

## Vấn đề quan trọng nhất

Tại lượt 05, POSPrinter khởi tạo trong file tải trước main, đọc localStorage sớm hơn bản cũ. Dọn cache theo quán trong main không làm mất bản đã lưu trong RAM. Probe GG01→GG02 cho footer/MAC cũ vẫn còn ở bản mới, trong khi bản trước trả mặc định. Bản thử cũng giữ cache thật trong object dù getItem sau install đã chuyển sang cache thử. Chi tiết, dữ liệu seed và hướng khắc phục ở phần lượt 05 bên dưới.

Đây là lỗi regression có thể tái hiện ở phần mềm, không phải yêu cầu tối ưu thêm. Suite xanh không chứng minh initializer giữ đúng thời điểm.

## Bằng chứng chạy chung ở HEAD

- BTP PC/mobile đạt; FIFO 28/28; nhận hàng 80/80; Engine 2 ở 1366/390 đạt.
- Gấu Noel dùng bản test tạm HTTP và /usr/bin/chromium: 71/72; Gieo G1–G14 đạt, kiosk K3 null.style hỏng như nền. Không đổi assertion.
- e2e_0d chạy ở mốc 03, 04, 05: chỉ assertion file:// thất bại. Đã xác nhận browser môi trường chặn file:// bằng ERR_BLOCKED_BY_ADMINISTRATOR; HTTP/retry/màn lỗi/H1 storage-event/bản thử đạt. Không coi phần file:// đã nghiệm thu.
- Toàn suite được chạy sau sinh file, trên Git worktree đúng commit; không dùng archive thiếu .git.
- Chưa APK, Bluetooth/LAN thật, Termux /sdcard thật hay Firebase production.

## Cách tái hiện probe máy in

Script dùng server HTTP phục vụ đúng HTML/JS của worktree, Playwright /usr/bin/chromium và Firebase giả; không gọi Firebase thật. Script đầy đủ ở workspace: /workspace/work/review-probes-full.cjs (probe thực thi cùng mã mock của bài Gấu Noel). Các probe tối thiểu cũng ở /workspace/work/review-probes.cjs. Không thêm script thử vào app.

Seed localStorage bằng addInitScript trước navigation: gieo_ls_store_v1='gg01'; gieo_store_v1 JSON storeId gg02; pos_printer_layout_cache JSON footerText REAL-GG01/billPrinterMac REAL-MAC. Sau load, đọc POSPrinter.layout và getItem. Chạy cùng fixture ở 481450b và 44bc333 để đối chứng. Với bản thử seed thêm __thu__pos_printer_layout_cache có TEST-ONLY, __thu__pos_auto_print=true, khóa thật auto=false; kiểm object đã cache gì trước và sau lớp install.

Lưu ý fixture Firebase dùng cho probe không chứng nhận mọi hoạt động bán của app. Kết luận P1 dựa trên đối chứng hai bản cùng fixture và source order; P2 dựa trên source order và trạng thái object/cache khác nhau quan sát được, không hứa thử toàn bộ UI bán của chế độ thử.

## Bằng chứng tệp và công cụ

Logs: /workspace/work/review02-suite.log, review03-suite.log, review04-suite.log, review02-05-suite.log; mỗi mốc có log boundaries/paths/cross. E2E/probe HEAD: /workspace/work/review02-05-*.log. Git worktree: /workspace/work/review02, review03, review04, review02-05.

Chạy: sh tools/sinh_lai_tat_ca.sh; node tools/check_boundaries.js; node tools/check_paths.js; node tools/kiem_tra_xuyen_app.js --assert-clean; các bài e2e theo tài liệu từng lượt. Sinh lại không tạo diff tracked tại các worktree. File e2e_gau.tester.js là bản tạm untracked, không thuộc release.

Không tự sửa lỗi trong lượt tester. Đề nghị xử lý P1/P2 của lượt 05, bổ sung test regression tương ứng, rồi kiểm lại; H1 phải được mô tả đúng giới hạn hoặc bổ sung guard nếu mục tiêu là ngăn mọi thao tác mới.


---

# Kết quả kiểm tra độc lập lượt 02 — Công cụ

Ngày kiểm: 26/10/2026 (VN). Mốc riêng: `6fdd956`; đối chiếu tích hợp: `44bc333`. Đọc KIEM_TRA_02 và kế hoạch hiện hành. Chỉ kiểm tra, không sửa nguồn vận hành.

## Kết luận

Chấp nhận phần công cụ đã kiểm ở mức phần mềm, kèm giới hạn bên dưới. Kết quả suite/sinh lại ở phần tổng hợp cùng lượt 03–05.

- Chạy lại tools/sinh_lai_tat_ca.sh tại chính commit lượt 02.
- Chạy check_boundaries, check_paths và kiem_tra_xuyen_app --assert-clean tại commit lượt 02 và HEAD; xem log review02-*.log.
- Bộ test cài lỗi công cụ và test nguồn được chạy trong suite; HEAD có thêm T7b cho hằng chuỗi khác đoạn nguồn.
- Không tự ghi sổ phát hành. Sổ còn rỗng phù hợp trạng thái chưa giao/chưa deploy, nhưng không cung cấp bảo vệ cho file chưa đăng ký.

## Phản biện

1. nguon.js chỉ nhận script inline trần và src nháy kép dưới js/. Chấp nhận với cú pháp HTML hiện tại, nhưng file có thuộc tính inline hoặc src nháy đơn có thể bị bỏ qua im lặng. Nên có test từ chối cú pháp chưa hỗ trợ khi sửa HTML sau này; không gọi bộ đọc là parser HTML tổng quát.
2. JS riêng đặt ở gốc sẽ thoát kiểm. Q1/Q6 có quy định nhưng chưa là hàng rào tự động. Nên dùng allowlist thư viện gốc/version đã biết hoặc test phát hiện src mới ở gốc trước đợt tiếp theo.
3. T10 path.resolve chưa chứng minh hai đường symlink ~/storage/shared và /sdcard được coi cùng thư mục. Chưa có Termux thật. Nên dùng realpath hoặc fixture symlink trước khi tuyên bố hỗ trợ đầy đủ đường Termux.
4. T9 đúng ý dùng URL version cố định cho bản thật và hash query cho bản thử. Không tự đăng ký mọi file khi sinh bộ: sinh thử không đồng nghĩa đã giao. Phải gắn ghi sổ vào bước bàn giao bắt buộc và kiểm khi phát hành.
5. Kiểm một định nghĩa và extract nối nguồn chỉ bảo vệ tìm tên. Thực thi vẫn phải kiểm từng script qua browser; không nối mã để chứng nhận hoisting.
6. Những test đọc thô HTML được nêu là việc còn lại theo từng cụm, cần rà cả nội dung chuỗi. Việc lượt 05 bắt chuỗi GIA HẠN xác nhận rủi ro này có thật.

## Điều kiện/giới hạn

Các check xanh không thay test startup với đúng mode/store và dữ liệu cache. Lượt 05 đã cho ví dụ: AST/rào đường dẫn vẫn sạch nhưng dữ liệu đọc quá sớm. Không APK/Termux thật, không Firebase production.

---

# Kết quả kiểm tra độc lập lượt 03 — 0D/0E

Ngày kiểm: 26/10/2026 (VN). Mốc riêng `7929eda`, tích hợp `44bc333`.

## Kết luận

Pilot escHtmlPos và retry UI đạt trên HTTP. H1 mới chứng minh lớp phủ giao diện, chưa chứng minh chặn mọi thao tác mới. Chưa nghiệm thu APK/file://.

## Kiểm tra

- Chạy sinh lại + suite tại commit riêng.
- Chạy e2e_0d tại 7929eda và 44bc333. Các assertion HTTP/retry/partial-evaluation/màn lỗi/storage-event/bản thử đạt. Assertion file:// thất bại do trình duyệt môi trường chặn giao thức; không phân loại là regression app và không chuyển thành PASS.
- Chốt module trước màn nhập mã là hợp lý: callback đăng nhập cần escHtmlPos.
- Dấu dang trước khai báo và retry chỉ khi undefined xử lý đúng lỗi partial-evaluate đã nêu ở lượt 01 đối với file tuân thủ mẫu.
- Bản thử có hash query, nguồn tải trước main và chế độ thử được phát hiện. Các bài này không chứng minh toàn bộ luồng bán của vùng thử.

## H1: giới hạn cần ghi rõ

posKiemDoiCuaHang chỉ thêm #posStoreDoi; không đặt cờ cấm giao dịch tại các entry ghi hoặc vô hiệu hóa native callback. Trên trang thật dùng Firebase giả, sau đổi binding GG01→GG02 và hiện lớp phủ, gọi cartAdj vẫn đổi qty 1→2; POS_STORE vẫn GG01. Đây chứng minh hàm nghiệp vụ vẫn chạy, chưa phải bằng chứng đã có bill/kho ghi chéo.

Nguy cơ còn lại: bàn phím đang focus, callback native và các đường gọi trực tiếp có thể vượt lớp phủ; tab cũ cũng có thể ghi lại queue/cache dùng khóa chung sau khi tab mới dọn cache. Không thể dùng test thấy lớp phủ để chứng nhận cách ly toàn bộ nhiều tab.

Nếu phạm vi H1 chỉ cảnh báo/chặn chạm thì mô tả rõ là hạn chế đã biết. Nếu yêu cầu chặn mọi thao tác mới, bổ sung guard tại entry và xác định riêng việc đang chạy được hoàn tất theo scope gốc. Cần test focus/Enter, native callback, pending checkout và visibilitychange; không hủy transaction đang bay tùy tiện.

Các lựa chọn đúng: đổi/xóa binding phải yêu cầu tải lại; không tự reload giữa giao dịch; màn thiếu module có nút thử lại phù hợp. Cùng nguồn document.write vẫn cần bài mạng chậm, không suy thành bảo đảm trên WebView cũ.

---

# Kết quả kiểm tra độc lập lượt 04 — Trợ lý

Ngày kiểm: 26/10/2026 (VN). Mốc riêng `481450b`, tích hợp `44bc333`.

## Kết luận

Chấp nhận bước R đã kiểm ở mức phần mềm; chưa nghiệm thu đầy đủ luồng bán có trợ lý trên APK/browser.

- Chạy sinh lại + suite và checker tại mốc riêng.
- Chạy e2e_0d ở mốc riêng: HTTP và nhận diện module đạt; file:// bị môi trường chặn.
- Đối chiếu AST và nguyên văn từng statement khai báo giữa `bbe5a97:posgieo.html` và `pos_assist.v1.js` hiện tại: **59/59 giống nguyên văn**, không tên thiếu trong tập chuyển.
- Side effect scroll/hook/cache vẫn inline. Các initializer JSON/Set chỉ dùng dữ liệu cùng module hoặc builtin, không đọc Firebase/localStorage ngay trong khai báo như máy in ở lượt 05.
- Gấu Noel ở HEAD được chạy qua bản test tạm HTTP, không đổi assertion: phần Gieo G1–G14 đạt; lỗi kiosk K3 như nền.

## Phản biện

Trợ lý hiện được gọi trực tiếp từ thanh toán, nên coi file thiết yếu là lựa chọn phù hợp cho R; đổi sang optional phải có H riêng kiểm tác dụng sau thanh toán. Chú thích chỉ đường không ảnh hưởng thực thi.

chuyen.js vẫn cần kiểm tay initializer bắc cầu. Nó phân biệt đọc trong method với đọc ngay, nhưng không tự chứng minh hàm được gọi trong initializer thuần hoặc giữ đúng mốc mode/store. Lỗi máy in lượt 05 là ví dụ giới hạn này, không có nghĩa 59 khai báo trợ lý đã sai.

Cần thêm bài bán hàng hoàn chỉnh có trợ lý, khách/topping/quyền lợi, hook thứ tự/Promise/this trước phát hành rộng. Không gọi các kiểm tra chỉ typeof/marker là kiểm toàn tính năng.

---

# Kết quả kiểm tra độc lập lượt 05 — Máy in

Ngày kiểm: 26/10/2026 (VN). SHA `44bc333`; đối chứng trước chuyển `481450b`.

## Kết luận: CHƯA ĐẠT — lỗi cách ly cache phát sinh do chuyển thời điểm khởi tạo

Mức cao, cần sửa và kiểm lại trước bàn giao/deploy. Không sửa file phát hành hoặc app trong lượt tester.

## P1 — POSPrinter đọc cache của cửa hàng cũ trước bước dọn theo quán

`js/posgieo/pos_printer.v1.js`:

- ~226 loadPrinterLayout đọc localStorage.pos_printer_layout_cache.
- ~242–243 object POSPrinter khởi tạo autoPrintEnabled và layout ngay khi tải file.
- File nay nằm trước script main; bước dọn POS_LS_THEO_QUAN theo binding nằm trong main, chạy sau đó.

Cách tái hiện độc lập bằng Chromium, HTML thật, Firebase giả không cloud trả cấu hình mới:

1. Seed gieo_ls_store_v1 = gg01.
2. Seed gieo_store_v1 = {storeId:gg02}.
3. Seed pos_printer_layout_cache = {footerText:REAL-GG01,billPrinterMac:REAL-MAC}.
4. Mở posgieo.html rồi đọc POSPrinter.layout và storage.

Kết quả:

| Mốc | Layout footer / MAC trong RAM | Cache sau main |
| --- | --- | --- |
| 481450b, trước tách máy in | rỗng / null (mặc định) | null |
| 44bc333, sau tách | REAL-GG01 / REAL-MAC | null |

Xóa cache không xóa object đã khởi tạo. Với Android, reconnect dùng MAC từ layout; trước khi cloud đồng bộ có thể dùng máy in/nội dung quán cũ. Không cần chứng minh in vật lý sai mới kết luận có regression trạng thái trong RAM.

## P2 — Bản thử đọc cache thật trước GieoThu.install

che_do_thu được tải trước module nhưng chỉ chuyển localStorage sang tiền tố __thu__ khi GieoThu.install chạy trong main. POSPrinter được tạo trước install nên đọc khóa thật.

Probe trang thử với cache thật footer REAL-GG01/MAC REAL-MAC, cache __thu__ riêng footer TEST-ONLY, auto-print thật false và thử true: sau install, getItem của trang thử trả cache TEST-ONLY, nhưng object POSPrinter vẫn footer REAL-GG01/MAC REAL-MAC, auto=false.

Đây là bằng chứng thứ tự đọc/cache RAM. Fixture Firebase không thay kiểm luồng in thử/APK hoàn chỉnh. Source order tự xác nhận phép đọc diễn ra trước lớp cách ly; module marker true không phát hiện được lỗi này.

## Hướng sửa đề nghị

Giữ class/hàm transport trước main, nhưng dời khởi tạo state đọc storage tới vị trí sau GieoThu.install và sau dọn cache theo quán, trước reconnect/hook cần object. Hoặc tách factory/init tường minh với adapter giữ API global hiện hành. Không chỉ gọi loadPrinterLayout lại sau khi reconnect đã bắt đầu. Giữ đúng var/getter _temCloudEnabled và handler đã bọc.

Bổ sung test GG01→GG02 có cache cũ, thử/thật có giá trị khác, localStorage không khả dụng, cold boot APK giả có MAC nối lại, startup trước auth/cloud chậm. Kiểm trong ba bộ mùa và bản thử.

## Các kết quả vẫn đạt

41/41 statement khai báo của module giống nguyên văn bản trước. Suite/checker có thể xanh vì không kiểm thời điểm đọc. Các e2e HTTP tải module, BTP/FIFO/nhận hàng/Engine2 và phần POS Gieo của Gấu Noel đạt ở HEAD (xem tổng hợp). Giữ nguyên văn không đủ chứng minh R nếu initializer chuyển mốc thực thi.

## Phạm vi máy in

File thực tế mang theo POSTemPrinter và các method nội dung tem, không hoàn toàn chỉ transport. Không tự xem đây là lỗi nếu dependency được kiểm; cần sửa mô tả bàn giao theo nội dung thật. _waitForTemReady/getter đọc tên ở main lúc gọi có thể giữ inline nếu chỉ gọi sau readiness. File thiết yếu hiện phù hợp vì startup gọi trực tiếp; muốn optional là H riêng.

Chưa in Bluetooth/LAN thật, chưa APK. Chưa được báo lượt 05 hoàn thành phát hành kể cả sau khi sửa P1/P2 nếu thiếu nghiệm thu thiết bị.
