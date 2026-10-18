# Giao diện `quanlygieo.html` — hình dáng theo `manage.html`, nền hồng theo thương hiệu (17/10/2026)

Màu chủ đạo của quanlygieo vẫn là **hồng `#E23A5D`**. **Chủ dự án yêu cầu thêm 17/10: đổi nền xám sang hồng theo cách manage tạo nền xanh.** Nền cơ sở `--bg:#F8EFF2` + hai quầng radial hồng nhẹ ở góc trên trái/dưới phải (`body::before`, fixed, không bắt thao tác; `isolation:isolate` giữ nền dưới nội dung). Thanh tiêu đề trong mờ dùng cùng màu qua `--bg-rgb`; meta theme-color cũng đồng bộ. Chữ, đường kẻ, màu ngữ nghĩa, thẻ doanh thu, icon menu và «Truy cập nhanh» giữ nguyên.
(Bản đầu tiên trong ngày đổi nhầm sang xanh manage → chủ dự án phản hồi → hoàn lại. **Đừng đổi màu app khi chỉ được yêu cầu «giao diện».** Đổi màu = hỏi chủ dự án trước.)

## Đã lấy từ manage (hình dáng)
| Hạng mục | Cách làm |
|---|---|
| Bo góc | `--r-md:20px`, `--r-lg:24px` ở `:root` (trước 18/22); thẻ, thẻ doanh thu, nút, tab, chip đều bo tròn hơn. |
| Font | Inter nhúng sẵn (3 khối `@font-face` chép từ manage, đầu `<style>`); `--font` / `--font-disp` dùng `"Inter Local"`. |
| Khung máy tính | Sidebar kính nổi bo 34px (`html.tab-ui`), mục menu viên thuốc, icon tròn (màu `SB_TILE` giữ gốc), nút chọn quán `.sb-store` (viên, giữ hồng nhạt), tiêu đề trang đậm. Mục đang chọn = nền hồng nhạt `--gl` + chữ `--gm` (trước: hồng đặc chữ trắng). Huy hiệu «Ca hiện tại» luôn nằm cạnh «đã cập nhật» trên PC, kể cả khi cửa sổ hẹp. |
| Điện thoại | **Thanh điều hướng nổi dưới đáy** `#bottomNav` (Hôm nay · Vận hành · Báo cáo · Thêm = mở menu) — `renderBottomNav()` gọi trong `renderSidebarNav()`; chỉ hiện ở `html.phone-ui`. Menu kéo ra là tấm bo tròn nổi. |
| Thành phần | Nút / tab `.seg` `.k2-nav` / chip `.ftag` bo tròn hẳn, tiêu đề nhóm `.sec-title` đậm (bỏ chữ hoa xám), nhãn thẻ KPI chữ thường, bảng `table.kt` đầu bảng nền nhạt, popup nền mờ. |

## Widget màn Hôm nay (17/10/2026)
Ba khối **Bill bán hàng** (`#todayBills`), **Hoạt động kho hôm nay** (`#todayKhoFeed`), **Hoạt động BTP hôm nay** (`#todayPrepFeed`) và **biểu đồ theo giờ** (`.wdg-hour`) là *widget* theo `.outlet-widget` / `.bill-widget` của manage: khung kính nhuốm màu (biến `--wc`: bill/biểu đồ = hồng của app, kho = xanh lam `--bi`, BTP = chàm `#5856D6`), ô biểu tượng `.wdg-mark`, đầu widget `wdgHeadHTML()`, hàng trắng mờ bo tròn. Hàng bill: ô màu theo phương thức thanh toán (`bfMarkMau`) · giờ + số món · món · nhãn thanh toán · tiền.
**Chỉ đổi giao diện, chức năng giữ nguyên** (khác manage mở popup): bấm hàng bill → bung chi tiết NGAY TẠI CHỖ (`bfToggle` + `bfChiTiet`), «Xem tất cả» → `goBills()`, kho/BTP giữ nút «Mở rộng» (popup đầy đủ + lật ngày), gập/mở trên điện thoại, bấm dòng BTP mở chi tiết lô. Widget rỗng thì ẩn (`.wdg:empty`). Thêm widget mới: gắn `class="wdg"` + `--wc`, dùng `wdgHeadHTML(icon, tiêu đề, dòng phụ, bên phải)`.

Kho và BTP cùng xem nhanh **6 lượt gần nhất** (thay 8). Danh sách nguồn vẫn đủ và giữ thứ tự thời gian giảm dần; số tổng/lượt còn lại vẫn theo toàn bộ dữ liệu. «Mở rộng» hôm nay dùng cache sẵn có, không đọc lại Firebase; lật ngày giữ cơ chế cũ.

## Hộp thông báo màn Hôm nay (17/10, tinh gọn theo phản hồi)

- `#todayNotifications` là chuông trên header cố định, thay tiêu đề trùng sidebar trên màn Hôm nay của từng quán; bỏ nút thông báo trong nội dung. Các màn khác giữ tiêu đề; Menu/Khuyến mãi giữ header cũ. `#todayHealth` nằm trực tiếp dưới body, ngoài lớp backdrop-filter của header, tối đa 440px và co theo viewport điện thoại. Khung hồng nhẹ, cuộn riêng, không đẩy dashboard; vị trí bám theo chuông khi mở và đổi kích thước.
- Lọc Tất cả / Cần xử lý / Nên xem, giữ đủ nội dung, số lượng và hành động do `computeStoreHealth` trả về. Không tự đánh dấu đã xem/đã xử lý. Nút cuối mở hộp thư cảnh báo đầy đủ như cũ.
- Không có nút X. Đóng bằng bấm lại chuông, Escape, click/tap bên ngoài, chọn thông báo hoặc rời màn. Cuộn ngoài/trong, vuốt cảm ứng và đổi focus đều không tự đóng; dùng click thay pointerdown để không nhầm thao tác vuốt thành tap. Escape trả focus về chuông. Mặc định đóng khi tải trang, không nhớ mở từ bố cục cũ.
- Vẽ lại giữ bộ lọc, vị trí cuộn và focus đang có trong hộp. Dùng kết quả sức khoẻ đã nạp; mở/lọc/đóng không gọi Firebase. Không sửa bộ tính, Menu/Khuyến mãi hay giao diện manage.
- Hộp thư chi tiết lấy **toàn bộ `status:new`**, gộp với 40 bản gần nhất cho lịch sử, khử trùng theo id tài liệu thật. Trước đây chỉ lấy 40 bản gần nhất nên cảnh báo cũ vẫn được bộ đếm tính nhưng không có trong danh sách để xử lý. `loadNewAlerts` dùng chung truy vấn đang chạy; không gắn listener mới hay polling.
- Sau khi ghi trạng thái thành công, cập nhật danh sách chưa xem, lịch sử, nhóm cảnh báo và số trên chuông ngay trong máy, không tải lại toàn bộ sức khoẻ/hộp thư. Trạng thái riêng từng quán; lượt đọc khởi chạy trước lúc lưu không hồi sinh mục vừa xử lý. Ghi lỗi giữ nguyên cảnh báo. BTP `seen` có nhãn Đã xem và vẫn chuyển tiếp được sang Đã xử lý; không tự sửa tồn hoặc xoá cảnh báo cũ.
- `node tools/ql_giao_dien/e2e_thong_bao.js`: kiểm 1366/853/390/320px bằng Firebase giả, chặn mạng ngoài; 6 lượt, mở rộng đủ danh sách, chuông/header, cuộn chuột/cảm ứng, click/tap ngoài, trạng thái/focus, đường điều hướng và nút trạng thái thật. `tests/thong_bao_canh_bao.test.js` kiểm cửa sổ 40 bản, trạng thái, lỗi ghi, trả kết quả muộn, gộp truy vấn, cách ly từng quán và không đọc lại sau lưu.
- Kết quả lượt chuông: 182 kiểm tra trình duyệt riêng, 540 widget toàn app, 207 bill realtime và 56 khung điều hướng đạt; 18 kiểm tra trạng thái nằm trong bộ 88 file unit/regression. Bộ tính dùng chung khớp nguyên bản. Sinh lại bản thử và ba bộ deploy; gói tải riêng chỉ có `quanlygieo.html` và `quanlygieo_thu.html`.

## Chỉ số & lãi/lỗ màn Hôm nay (17/10, lượt widget)

- `#todayMini` có đúng **hai widget**, mỗi widget lưới **2×2**: Bán hàng (Số bill, Ly bán ra, AOV, IPT); Vận hành (Hao hụt, DT/giờ công, Giờ công, Vốn trong kho). PC đặt cạnh nhau, điện thoại xếp dọc. Giờ công là số đã có trong `computeStaffHoursByHour`, không thêm truy vấn hay cách tính mới.
- Lãi/lỗ là widget riêng `.today-pl-widget` **tím nhạt `#7554AF`** theo yêu cầu chủ dự án; số tiền vẫn xanh khi lãi, đỏ khi lỗ. Bên trái số lãi/lỗ + trước khấu hao/biên lãi, bên phải điểm hoà vốn + đã bán + còn thiếu/trên ngưỡng.
- «Xem tách từng dòng» mở ngay trong widget: bảng thu chi rõ số tiền, ghi chú hoà vốn bên cạnh trên PC, xếp dọc trên điện thoại. Giữ toàn bộ khoản, chú thích và nút chi tiết hao hụt. Nút có `aria-controls`/`aria-expanded`, giữ trạng thái mở khi bill realtime vẽ lại.
- `miniSPLH`, `miniStaffHours`, `miniKho` là host cập nhật bất đồng bộ; vốn kho giữ số đã nạp khi RT vẽ lại. Không đổi công thức lãi/lỗ hay file JS dùng chung; không đọc thêm Firebase cho ô mới.
- Kiểm tra trình duyệt trong `tools/ql_giao_dien/e2e_bill_realtime.js`: đúng 8 ô/2×2, bố cục 1366/853/390px, không tràn ngang, mở/gập, lãi/lỗ/chưa bán/không thể hoà vốn, bill mới giữ mở và cập nhật số mà không thêm lượt đọc.

## Tab Tiền mặt + Chi phí (17/10/2026)
Mỗi nhóm là một widget có màu (`wdg-blue/amber/green/violet/teal/red/pink`), đầu widget `wdgHeadHTML()`. Đầu màn có **hàng ô tổng hợp** `.wkpi-row` / `.wkpi` (như thẻ số liệu của manage): Tiền mặt = Expected · Thực đếm · Chênh lệch · Bill tiền mặt (`cashKpiHTML(detail)` — chỉ đọc lại số đã có trong «Đối soát cả ngày»); Chi phí = chi phí tháng này (`filterExpenses` + `splitExpensesByCostType`, cùng hàm lãi/lỗ) · Cố định · Biến đổi · Chưa trả tiền · Chờ duyệt · Chờ số thật. Form «Thêm chi phí» 2 cột ở máy tính (`.wdg-form`, mục dài gắn `.wide`). Bên trong widget `.card` = tấm trắng mờ, `.litem` = hàng trắng mờ. **Mọi id / hàm cũ giữ nguyên** (test khoá). Các tab Nhân viên / Lịch / Chấm công / Lương cũng dùng widget — xem mục dưới.

## Biểu mẫu và nhân sự (17/10/2026, lượt tiếp theo)

**Cập nhật 18/10 — nền trắng và tìm sidebar:** ô nhập/chọn/lý do đang dùng trong các màn quản lý và popup dùng `--ui-control-bg:#fff`, gồm ngày/giờ/tháng/ngày-giờ. Ô thật sự disabled giữ nền/độ mờ riêng; không thay type, giá trị, showPicker hay trạng thái disabled. Không truyền biến nền mới vào tab Menu/Khuyến mãi và popup riêng của chúng. Thẻ nhân viên và đầu bảng trong nhóm nhân sự dùng trắng; viền ngày nghỉ đổi từ xám sang cam theo nhãn Nghỉ, vẫn giữ màu phân biệt chưa xếp/đã xếp/nghỉ.

Ô `#navSearch` có nền trắng, padding riêng đủ chỗ icon và Ctrl K, tắt native search decoration để tránh biểu tượng trùng; icon/nhãn phím tắt căn giữa theo ô. Điện thoại bỏ khoảng trống phím tắt khi nhãn ẩn. Giữ một viền focus hồng, Ctrl K, gõ lọc và Enter mở đúng mục. Đã kiểm trình duyệt ở 1366/853/390px với ba trạng thái lịch, không có kết nối Firebase thật.

- Ô nhập / select / textarea dùng cùng hình dáng manage (bo 14px, cao tối thiểu 46px, nền nhẹ, focus rõ), áp dụng cả ô ngày/giờ/tháng, quy trách nhiệm và lý do ngoài `.field`, trong popup. Giữ type/id/value và cơ chế bấm cả ô mở bảng chọn; loại trừ checkbox/radio/range/color/file/hidden/nút khỏi rule ô nhập. Không thêm bộ chọn ngày riêng.
- Khối «Xuất dữ liệu phân tích mẻ» là widget, hai ngày có nhãn Từ ngày / Đến ngày; giữ hàm xuất và giới hạn 62 ngày.
- **Nhân viên**: widget tạo hồ sơ, form 2 cột trên máy tính, popup sửa cùng widget; tìm tên không đọc lại Firebase. Danh sách gom mỗi điểm bán Gieo thành một widget; máy tính hiển thị bảng, điện thoại thành thẻ hồ sơ. Giữ PIN/chức năng/lương/OT, thao tác Sửa / Tắt-Bật / Xoá và lịch sử lương. Đổi hình thức lương giữ thông tin đang nhập.
- **Điểm bán làm việc**: `employees_gieogieo.storeTags` = mảng mã Gieo (`gg01`, `gg02`…), chọn nhiều; luôn hiện kể cả mới có một điểm. Thiếu/rỗng ở hồ sơ cũ → phân nhóm theo `homeStore`, thiếu quán chính → GG01; chỉ là cách đọc, không tự ghi chuyển dữ liệu. Giữ điểm đã gắn dù quán ngừng hoạt động. Danh sách lựa chọn lấy từ danh sách quán đã nạp, không truy vấn thêm.
- **Chốt với chủ dự án trong phiên này**: storeTags CHỈ phân nhóm hồ sơ. Không lọc/chặn check-in, không lọc lịch/chấm công và không thay cách tính lương. `homeStore` vẫn riêng cho phân bổ lương cứng, nay hiện cả khi chỉ có một quán. Không thay `workStores` dùng chung với TC33/XOFA.
- **Lịch**: widget xếp nhiều ngày và widget lịch từng ngày, thẻ từng nhân viên; giữ thao tác và đường dẫn ghi lịch của quán đang xem.
- **Chấm công**: widget chọn ngày, đang trong ca, ca quên giờ ra, chi tiết từng người, thêm ca bù và cấu hình đi trễ. Không thay cách nhận biết ca treo/tạm tính/sửa/xoá.
- **Lương**: tổng hợp số đã tính + widget cấu hình, kỳ lương và bảng lương; không có công thức tính mới.
- Helper giao diện: `hrWidget`, `hrStoreScope`, `nvRenderGroups`; helper hồ sơ: `nvStoreIds`, `nvStoreOptions`, `nvWorkStoresField`; CSS mới vẫn trong khối MANAGE-SKIN.

Kiểm tra: `tests/nhan_su_diem_ban.test.js` kiểm tương thích hồ sơ cũ, phân nhiều điểm, từ chối thiếu/sai điểm, chỉ đổi phân nhóm không đổi lịch sử lương. `node tools/ql_giao_dien/e2e_nhan_su.js` chạy trình duyệt với Firebase giả ở 1366 / 853 / 390px: tạo/lưu/sửa/tìm hồ sơ, giữ draft khi đổi hình thức, lưu lịch, ca bù, lương, form xuất mẻ, ô nhập ngoài `.field`, không tràn ngang/không lỗi JS. Ảnh nằm trong `work/nhan_su/`. Hai tool e2e hỗ trợ `CHROMIUM_PATH`, phục vụ file trên loopback và chặn mạng ngoài.

## Huy hiệu «Ca hiện tại» (thanh tiêu đề)
Ở máy tính luôn nằm **cạnh «đã cập nhật», cùng hàng với tiêu đề**, kể cả cửa sổ 853–1024px và trình duyệt/WebView không hỗ trợ container query. PC dùng `flex-wrap:nowrap`, huy hiệu một dòng gọn; tiêu đề/huy hiệu dài thu bằng dấu …, bấm huy hiệu vẫn mở chi tiết. Chỉ `html.phone-ui` mới tách huy hiệu sang dòng riêng. Không dùng ngưỡng container/màn hình để đẩy huy hiệu PC xuống hàng (đã từng gây lãng phí chiều cao như ảnh chủ dự án phản hồi).

## Kế hoạch hoàn thiện các màn còn lại

Đã rà điều hướng PC/mobile và các form NL/BTP ngày 17/10. Kế hoạch chi tiết: [KE_HOACH_UI_WIDGET_QUANLY.md](KE_HOACH_UI_WIDGET_QUANLY.md). Đã triển khai P0–P5: widget opt-in theo `UI_WIDGET_PAGES`, giữ node/id và các hàm nghiệp vụ, observer childList gom qua rAF, không đọc Firebase. Giữ nguyên Menu/Khuyến mãi và popup của chúng; danh mục NL giữ thẻ/sheet, BTP chia sáu nhóm và gập riêng hướng dẫn dài. Chi tiết mã, phạm vi và kiểm tra xem phần Triển khai trong kế hoạch.

## Quy tắc khi sửa tiếp
1. **Mọi rule giao diện chung nằm trong khối `/* [MANAGE-SKIN:BEGIN] */ … /* [MANAGE-SKIN:END] */`** — khối này là CUỐI `<style>` chính nên thắng mọi khối trên. Sửa nét chung → sửa **trong khối đó**. Test `tests/ql_giao_dien.test.js` báo nếu khối không còn ở cuối hoặc nếu có màu xanh manage lọt vào.
2. Giữ bảng màu thương hiệu. Ngoại lệ chủ dự án đã yêu cầu 17/10: nền hồng/hai quầng radial, widget lãi/lỗ tím riêng và nhóm vận hành xanh ngọc; không lấy nền xanh của manage.
3. Sau mỗi sửa: `sh tools/sinh_lai_tat_ca.sh` (quy tắc 7 của CLAUDE.md) — `quanlygieo_thu.html` và `ban_deploy/*/quanlygieo.html` sinh lại từ file gốc.

## Chưa làm (cố ý)
- **Chế độ tối** (manage có nút ☾): quanlygieo chưa có, JS có nhiều màu cứng → làm đợt riêng nếu cần.
- Các màn chưa được chủ dự án yêu cầu bố cục mới vẫn giữ cấu trúc cũ. Màn Hôm nay đã có hai widget chỉ số và widget lãi/lỗ riêng như mô tả ở trên.

## Kiểm tra
- `node tests/ql_giao_dien.test.js` (node thuần, nằm trong `tests/run_all.sh`).
- Trình duyệt thật: `node tools/ql_giao_dien/e2e_khung.js` — Firebase giả (`tools/tet/e2e/mockfb.js`), kiểm thanh dưới / menu / ☰ / Ctrl+K / chọn quán / popup, 24 mục.
- Chụp ảnh: nạp `quanlygieo.html` với `mockfb.js` + bổ sung `firestore().batch/doc/collectionGroup` (xem đầu `e2e_khung.js`), viewport 1366×820 (máy tính), 853×1100 / 1024×768 (tablet), 390×844 (điện thoại).

## 18/10 — Độ tương phản tab Khách hàng

Lỗi: `.ui-metrics-grid > .kcard` đặt nền trắng lên cả `.kcard-wide`, trong khi nhãn/số/mô tả/thanh tỷ lệ của thẻ nổi bật vẫn trắng. Nền sáng widget nay chỉ áp cho thẻ thường; thẻ Khách quay lại dùng gradient hồng đậm và chữ trắng đủ tương phản. Chỉ CSS, không đổi cách nhóm khách/tỷ lệ hay đọc Firebase. Kiểm Chromium với bill giả có khách quay lại trên ba chiều ngang 1366/853/390: đo độ tương phản chữ/nền ít nhất 4,5:1 và kiểm số/thanh tỷ lệ; giữ các kiểm widget/Menu/Khuyến mãi cũ. Gói `tai_ve/fix_mau_tab_khach_hang_18-10.zip` chỉ hai HTML quản lý đã sinh. Chủ dự án tự deploy.
