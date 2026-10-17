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
