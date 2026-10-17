# Giao diện `quanlygieo.html` — đồng bộ với `manage.html` (17/10/2026)

Mục tiêu: hai app quản lý cùng một ngôn ngữ thiết kế. **Không đổi logic, id, class** — chỉ đổi giá trị biến, thêm một khối CSS cuối và một thanh điều hướng.

## Đã đồng bộ
| Hạng mục | Cách làm |
|---|---|
| Bảng màu, bo góc, bóng | Giá trị biến ở `:root` (tên biến cũ `--gd`, `--td`, `--line`… giữ nguyên vì ~1.800 style inline trong JS gọi tới). Màu chủ đạo `--gd:#006241` (xanh manage; trước là hồng `#E23A5D`), nền `--bg:#eef1ee`. Nhận diện Gieo = `--brand-gieo:#a36a08` (vàng, như manage). |
| Font | Inter nhúng sẵn (3 khối `@font-face` chép từ manage, đầu `<style>`). |
| Khung | Sidebar kính nổi bo 34px (`html.tab-ui`), mục menu hình viên thuốc, icon tròn theo `SB_TILE` (= bảng `NAV_COLOURS` của manage), nút chọn quán `.sb-store`, thanh tiêu đề tiêu đề đậm. Huy hiệu «Ca hiện tại» tự xuống hàng riêng khi màn < 1180px. |
| Điện thoại | **Thanh điều hướng nổi dưới đáy** `#bottomNav` (Hôm nay · Vận hành · Báo cáo · Thêm = mở menu) — `renderBottomNav()`, gọi trong `renderSidebarNav()`. Chỉ hiện ở `html.phone-ui`. |
| Thành phần | Nút viên thuốc xanh, tab `.seg`/`.k2-nav` = segment của manage, chip `.ftag` (chọn = xanh đặc), thẻ trắng bo lớn, popup/sheet nền mờ, toast tối, thẻ doanh thu gradient xanh (các mức sức khoẻ đỏ/vàng/xanh/lam/tím giữ màu ngữ nghĩa). |

## Quy tắc khi sửa tiếp
1. **Mọi rule giao diện chung nằm trong khối `/* [MANAGE-SKIN:BEGIN] */ … /* [MANAGE-SKIN:END] */`** — khối này là CUỐI `<style>` chính nên thắng mọi khối trên. Sửa nét chung → sửa **trong khối đó**, đừng thêm rule rời phía trên. (Test `tests/ql_giao_dien.test.js` báo nếu khối không còn ở cuối.)
2. Đổi màu chủ đạo: `--gd / --gm / --gl / --accent-glow` ở `:root` (+ gradient mặc định `.kcard.kcard-wide` trong khối skin).
3. **Hai màn Khuyến mãi (`#screen-tg`) và Quản lý Menu (`#screen-mn`) CỐ Ý giữ giao diện POS gốc, màu hồng** (chủ dự án yêu cầu hoàn nguyên trước đây) — khối skin đặt lại `--gd` hồng riêng cho 2 màn này. Muốn đồng bộ nốt thì xoá dòng `#screen-tg,#screen-mn{--gd:…}` (+ sửa test) — cần chủ dự án đồng ý.
4. Sau mỗi sửa: `sh tools/sinh_lai_tat_ca.sh` (quy tắc 7 của CLAUDE.md) — `quanlygieo_thu.html` và `ban_deploy/*/quanlygieo.html` sinh lại từ file gốc.

## Chưa làm (cố ý)
- **Chế độ tối** (manage có nút ☾): quanlygieo chưa có, và style inline trong JS có màu cứng → làm đợt riêng nếu cần.
- Bố cục riêng từng màn (vd. Hôm nay vẫn là thẻ Doanh thu + lưới chỉ số, chưa dựng lại theo «Tổng quan» của manage) — chỉ đổi giao diện, không đổi cấu trúc nội dung.
- Biểu đồ/SVG vẽ bằng màu cứng trong JS (vài chỗ `#C0392B`, `#0062AD` — bảng màu «tính năng mới» `.nf` giữ nguyên).

## Kiểm tra
- `node tests/ql_giao_dien.test.js` (node thuần, nằm trong `tests/run_all.sh`).
- Trình duyệt thật: `node tools/ql_giao_dien/e2e_khung.js` — Firebase giả (`tools/tet/e2e/mockfb.js`), kiểm thanh dưới / menu / ☰ / Ctrl+K / chọn quán / popup, 24 mục.
- Chụp ảnh: nạp `quanlygieo.html` với `mockfb.js` + bổ sung `firestore().batch/doc/collectionGroup` (xem phần đầu `e2e_khung.js`), viewport 1366×820 (máy tính), 853×1100 / 1024×768 (tablet), 390×844 (điện thoại).
