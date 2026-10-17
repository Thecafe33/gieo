# Giao diện `quanlygieo.html` — hình dáng theo `manage.html`, MÀU GIỮ NGUYÊN (17/10/2026)

**Chỉ đổi UI (hình dáng / bố cục), KHÔNG đổi màu.** Màu chủ đạo của quanlygieo vẫn là **hồng `#E23A5D`**; nền, chữ, đường kẻ, màu ngữ nghĩa, thẻ doanh thu, icon menu, «Truy cập nhanh» giữ y bản trước.
(Bản đầu tiên trong ngày đổi nhầm sang xanh manage → chủ dự án phản hồi → hoàn lại. **Đừng đổi màu app khi chỉ được yêu cầu «giao diện».** Đổi màu = hỏi chủ dự án trước.)

## Đã lấy từ manage (hình dáng)
| Hạng mục | Cách làm |
|---|---|
| Bo góc | `--r-md:20px`, `--r-lg:24px` ở `:root` (trước 18/22); thẻ, thẻ doanh thu, nút, tab, chip đều bo tròn hơn. |
| Font | Inter nhúng sẵn (3 khối `@font-face` chép từ manage, đầu `<style>`); `--font` / `--font-disp` dùng `"Inter Local"`. |
| Khung máy tính | Sidebar kính nổi bo 34px (`html.tab-ui`), mục menu viên thuốc, icon tròn (màu `SB_TILE` giữ gốc), nút chọn quán `.sb-store` (viên, giữ hồng nhạt), tiêu đề trang đậm. Mục đang chọn = nền hồng nhạt `--gl` + chữ `--gm` (trước: hồng đặc chữ trắng). Huy hiệu «Ca hiện tại» tự xuống hàng riêng khi màn < 1180px. |
| Điện thoại | **Thanh điều hướng nổi dưới đáy** `#bottomNav` (Hôm nay · Vận hành · Báo cáo · Thêm = mở menu) — `renderBottomNav()` gọi trong `renderSidebarNav()`; chỉ hiện ở `html.phone-ui`. Menu kéo ra là tấm bo tròn nổi. |
| Thành phần | Nút / tab `.seg` `.k2-nav` / chip `.ftag` bo tròn hẳn, tiêu đề nhóm `.sec-title` đậm (bỏ chữ hoa xám), nhãn thẻ KPI chữ thường, bảng `table.kt` đầu bảng nền nhạt, popup nền mờ. |

## Widget màn Hôm nay (17/10/2026)
Ba khối **Bill bán hàng** (`#todayBills`), **Hoạt động kho hôm nay** (`#todayKhoFeed`), **Hoạt động BTP hôm nay** (`#todayPrepFeed`) và **biểu đồ theo giờ** (`.wdg-hour`) là *widget* theo `.outlet-widget` / `.bill-widget` của manage: khung kính nhuốm màu (biến `--wc`: bill/biểu đồ = hồng của app, kho = xanh lam `--bi`, BTP = chàm `#5856D6`), ô biểu tượng `.wdg-mark`, đầu widget `wdgHeadHTML()`, hàng trắng mờ bo tròn. Hàng bill: ô màu theo phương thức thanh toán (`bfMarkMau`) · giờ + số món · món · nhãn thanh toán · tiền.
**Chỉ đổi giao diện, chức năng giữ nguyên** (khác manage mở popup): bấm hàng bill → bung chi tiết NGAY TẠI CHỖ (`bfToggle` + `bfChiTiet`), «Xem tất cả» → `goBills()`, kho/BTP giữ nút «Mở rộng» (popup đầy đủ + lật ngày), gập/mở trên điện thoại, bấm dòng BTP mở chi tiết lô. Widget rỗng thì ẩn (`.wdg:empty`). Thêm widget mới: gắn `class="wdg"` + `--wc`, dùng `wdgHeadHTML(icon, tiêu đề, dòng phụ, bên phải)`.

## Tab Tiền mặt + Chi phí (17/10/2026)
Mỗi nhóm là một widget có màu (`wdg-blue/amber/green/violet/teal/red/pink`), đầu widget `wdgHeadHTML()`. Đầu màn có **hàng ô tổng hợp** `.wkpi-row` / `.wkpi` (như thẻ số liệu của manage): Tiền mặt = Expected · Thực đếm · Chênh lệch · Bill tiền mặt (`cashKpiHTML(detail)` — chỉ đọc lại số đã có trong «Đối soát cả ngày»); Chi phí = chi phí tháng này (`filterExpenses` + `splitExpensesByCostType`, cùng hàm lãi/lỗ) · Cố định · Biến đổi · Chưa trả tiền · Chờ duyệt · Chờ số thật. Form «Thêm chi phí» 2 cột ở máy tính (`.wdg-form`, mục dài gắn `.wide`). Bên trong widget `.card` = tấm trắng mờ, `.litem` = hàng trắng mờ. **Mọi id / hàm cũ giữ nguyên** (test khoá). Các tab Entry khác (Nhân viên, Lịch, Lương…) chưa làm — dùng lại đúng các class trên.

## Huy hiệu «Ca hiện tại» (thanh tiêu đề)
Ở máy tính luôn nằm góc trên phải **cùng hàng** với tiêu đề. Chỉ khi thanh tiêu đề thật sự hẹp (container query `topbar` ≤ 800px — điện thoại / cửa sổ rất hẹp) mới xuống hàng riêng và gọn **một dòng**; từ ≤ 960px nút «đã cập nhật» chỉ còn chấm để nhường chỗ. Rê chuột / bấm huy hiệu xem đủ chữ (`title`).

## Quy tắc khi sửa tiếp
1. **Mọi rule giao diện chung nằm trong khối `/* [MANAGE-SKIN:BEGIN] */ … /* [MANAGE-SKIN:END] */`** — khối này là CUỐI `<style>` chính nên thắng mọi khối trên. Sửa nét chung → sửa **trong khối đó**. Test `tests/ql_giao_dien.test.js` báo nếu khối không còn ở cuối hoặc nếu có màu xanh manage lọt vào.
2. **Không đặt màu mới trong khối này** (chỉ hình dáng: bo góc, cỡ chữ, khoảng cách, đổ bóng trung tính).
3. Sau mỗi sửa: `sh tools/sinh_lai_tat_ca.sh` (quy tắc 7 của CLAUDE.md) — `quanlygieo_thu.html` và `ban_deploy/*/quanlygieo.html` sinh lại từ file gốc.

## Chưa làm (cố ý)
- **Chế độ tối** (manage có nút ☾): quanlygieo chưa có, JS có nhiều màu cứng → làm đợt riêng nếu cần.
- Bố cục riêng từng màn (vd. Hôm nay vẫn là thẻ Doanh thu + lưới chỉ số, chưa dựng lại theo «Tổng quan» của manage) — chỉ đổi hình dáng, không đổi cấu trúc nội dung.

## Kiểm tra
- `node tests/ql_giao_dien.test.js` (node thuần, nằm trong `tests/run_all.sh`).
- Trình duyệt thật: `node tools/ql_giao_dien/e2e_khung.js` — Firebase giả (`tools/tet/e2e/mockfb.js`), kiểm thanh dưới / menu / ☰ / Ctrl+K / chọn quán / popup, 24 mục.
- Chụp ảnh: nạp `quanlygieo.html` với `mockfb.js` + bổ sung `firestore().batch/doc/collectionGroup` (xem đầu `e2e_khung.js`), viewport 1366×820 (máy tính), 853×1100 / 1024×768 (tablet), 390×844 (điện thoại).
