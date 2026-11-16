# Kế hoạch: thay `quanlygieo.html` bằng `quanlygieo2.html` + tinh gọn sidebar (16/11/2026)

**Trạng thái (16/11, lượt 3): XONG TOÀN BỘ, CHƯA deploy.** Chủ dự án yêu cầu làm luôn (quanlygieo2 đã chạy 2 tuần): quanlygieo2 nhập thẳng vào `quanlygieo.html` (một file gốc, bỏ bước sinh — bước A/B/C ở mục 2 gộp làm một lượt, không còn `quanlygieo_cu.html`), `quanlygieo2.html` = trang chuyển hướng; sidebar gọn như mục 3. Chi tiết: mục 16/11 trong `TRANG_THAI.md`.
Chốt của chủ dự án: giữ tên `quanlygieo.html`; giữ «Dọn dữ liệu»; quanlygieo2 đã chạy ổn và là bản mặc định cùng Unit Engine 2.
Kết quả khác đề xuất ban đầu: **«Tra cứu» KHÔNG bỏ** — kiểm lại thì nó truy tem ↔ bill ↔ lô (không trùng ô tìm ở Tem NL) và `goContainers('trace')` dẫn tới nó; vẫn nằm trong thanh tab Kho · Tem, lô & sổ. **Đã bỏ khỏi menu: «Mô phỏng», «Ghi chú ngày»** (mã vẽ màn còn trong file, không còn lối vào; dữ liệu `daily_ops_gieogieo` không đụng). Nhóm «Ít dùng» còn 14 mục. Gói giao: `giao_file/dot_16-11_quanly_gon_sidebar/`.
Ràng buộc chủ dự án nêu 16/11: **không đổi giao diện** (dáng, màu, tên mục, nội dung từng màn giữ nguyên) — chỉ tinh gọn sidebar; mục ít dùng / không dùng thì gom hoặc đề xuất bỏ.

Ảnh so sánh (dựng chính `quanlygieo2.html` với Firebase giả, chỉ đổi danh sách mục lúc chạy): `docs/mau/anh/sidebar_ql2_so_sanh.png` (trước · sau · sau khi mở nhóm «Ít dùng»), `docs/mau/anh/sidebar_ql2_sau_toan_man.png` (toàn màn 1366×820).

## 1. Hiện trạng

- `quanlygieo2.html` **không phải bản viết riêng**: `tools/automation/build_page.js` lấy `quanlygieo.html` rồi (a) đổi tên 6 hàm thành `…Legacy` (`renderStoreHealth`, `renderAlertInbox`, `renderTodayHealthInbox`, `reloadCurrent`, `_expWriteDone`, `_ctnDetailRender`), (b) nạp thêm `gieo_automation.v3.js` + `unit_engine2_v1.js` + `unit_engine2_store_v1.js`, (c) chèn `tools/automation/ui.css`, `ui.js`, `engine2_ui.js`. Khác biệt người dùng thấy: mục **«Tự động & Engine 2»**, chuông thông báo theo hồ sơ, chi tiết tem có nút xét lại.
- Mọi màn còn lại của hai file là một. Sửa `quanlygieo.html` → quanlygieo2 tự có.
- Phụ thuộc tên `quanlygieo.html`: 78 file trong `tests/` + `tools/` đọc nó làm nguồn; `tao_ban_thu.js` (→ `quanlygieo_thu.html`), `tao_ban_dem.js`, `tao_lai_lo.js` (→ `lai_lo.v*.js` cho manage), `predeploy_check.js` (cặp posgieo + quanlygieo cùng engine), `check_boundaries.js`, `check_paths.js`, `tao_bo_deploy.js`, headers `firebase.json`.
- Sidebar quanlygieo2: **51 mục / 11 nhóm**, cao ~2 690px (phải cuộn hơn 3 màn 820px).

## 2. Thay quanlygieo bằng quanlygieo2 — 3 bước, mỗi bước quay lui được

| Bước | Việc | Quay lui |
|---|---|---|
| **A. Chuyển người dùng** | `quanlygieo.html` trên máy chủ = **nội dung quanlygieo2** (bộ deploy chép bản sinh ra vào cả hai tên). Bản cũ giữ thêm một kỳ dưới tên `quanlygieo_cu.html`. Đường dẫn / lối tắt / bookmark đang dùng không đổi. | Chép lại bản cũ vào `quanlygieo.html`. |
| **B. Một nguồn** (sau khi A chạy ổn ≥ 1–2 tuần) | Nhập lớp phủ vào file gốc: 3 thẻ `<script>` + `ui.css` + `ui.js` + `engine2_ui.js` chuyển nguyên văn vào `quanlygieo.html` (hoặc thành file `js/quanlygieo/*.v1.js` nạp kèm, cùng kiểu tách posgieo); 6 hàm `…Legacy` giữ nguyên tên để không đổi hành vi. Bỏ `build_page.js` khỏi `sinh_lai_tat_ca.sh`. Nhờ vậy `quanlygieo_thu`, `check_boundaries`, `check_paths` cũng phủ luôn phần Tự động / Engine 2 (hiện chưa phủ). | Một commit — `git revert`. |
| **C. Dọn tên** | `quanlygieo2.html` trên máy chủ thành trang chuyển hướng về `quanlygieo.html` (giữ một kỳ), rồi gỡ khỏi `tao_bo_deploy.js`, `predeploy_check.js`, headers. 15 test + 7 tool đang đọc `quanlygieo2.html` trỏ về `quanlygieo.html`. | Không ảnh hưởng dữ liệu. |

**Cần chủ dự án chọn — tên file còn lại sau cùng:**
- **(Khuyến nghị) giữ tên `quanlygieo.html`**, nội dung là bản 2. Không phải sửa 78 test / tool, không đổi lối tắt đang dùng, `quanlygieo2.html` biến mất.
- Hoặc giữ tên `quanlygieo2.html`, xoá `quanlygieo.html`: phải đổi tên trong 78 file + sinh bản thử / bản đo / `lai_lo` từ tên mới, và mọi lối tắt cũ phải đặt lại. Kết quả cho người dùng như nhau, rủi ro cao hơn.

Điều kiện trước bước A: chủ dự án xác nhận quanlygieo2 trên máy chủ đang chạy ổn (Engine 2 đã deploy 05/11, gói v22 12/11 chưa deploy).

## 3. Tinh gọn sidebar — không đổi giao diện

Chỉ dùng **cơ chế đã có sẵn trong app**, không thêm thành phần giao diện mới:
- Thanh tab `renderReportSubNav` (`REPORT_SCREENS`): Hôm nay · Tài chính · Theo kỳ · Bán hàng · Khách hàng · Tổng kết tháng — đã nằm đầu cả 6 màn báo cáo.
- Thanh tab `khoSubNavHtml` (`.k2-nav`) — đã nằm đầu mọi màn của 3 nhóm Kho.
- Nhóm gập `sec.collapsible` + `.sidebar-subtree` trong `renderSidebarNav` (đã viết sẵn, hiện không nhóm nào dùng).
- Ô tìm `#navSearch` / Ctrl K vẫn tìm ra **mọi** mục, kể cả mục đã gom.

Sidebar hiện lặp lại đúng những màn mà hai thanh tab trên đã liệt kê. Đề xuất: sidebar chỉ giữ **một dòng cho mỗi cụm đã có thanh tab**, gom mục ít dùng vào một nhóm gập.

| Nhóm | Sidebar sau khi gọn | Mục rời sidebar — vẫn mở bằng |
|---|---|---|
| (đầu) | Hôm nay · Sức khoẻ quán · Tự động & Engine 2 · Hôm nay · Vận hành | — |
| Báo cáo | **Báo cáo** · Sức khoẻ NL_BTP | Sức khỏe tài chính, Báo cáo kỳ, Phân tích bán hàng, Khách hàng, Tổng kết tháng → thanh tab báo cáo sẵn có |
| Vận hành | Chi phí · Tiền mặt · Lịch sử bill | Ghi chú ngày, Checklist ca → «Ít dùng» |
| Kho | **Kho · Hằng ngày** · **Kho · Tem, lô & sổ** · **Kho · Danh mục** · Tóm tắt ngày & vụ lệch | Tổng quan, Đặt & nhận hàng, Kiểm kê, Refill & vị trí / Tem NL, Lô BTP, Tra cứu, Sổ kho, Sổ lệch tem, Đối chiếu BTP âm / Nguyên liệu, Bán thành phẩm, Dụng cụ đựng, Lý do hao hụt → thanh tab Kho sẵn có |
| Nhân sự | Nhân viên · Lịch làm việc · Chấm công · Lương | Nhắc nhở → «Ít dùng» |
| Menu & Khuyến mãi | Quản lý Menu · Định mức món · GOGS Món · Khuyến mãi | GOGS Topping, Bao bì, Trợ lý bán hàng → «Ít dùng» |
| **Ít dùng** (gập, mặc định đóng) | 1 dòng | Ghi chú ngày, Checklist ca, Nhắc nhở, Lệch kho & định lượng, Dự báo & số mẻ, Ngày đặc biệt, Trích xuất dữ liệu, GOGS Topping, Bao bì, Trợ lý bán hàng, Tài sản, Mục tiêu, Cửa hàng, Mô phỏng, Dọn dữ liệu, Kiểm toán |

Kết quả: **51 mục → 20 mục + 1 nhóm gập** (≈ 1 290px, gần vừa một màn). Không màn nào mất, nội dung từng màn không đổi. Các nhóm «Phân tích & dữ liệu», «Cấu hình», «Kiểm toán» không còn là nhóm riêng.

Phạm vi sửa khi được duyệt (chỉ `quanlygieo.html`, quanlygieo2 sinh lại): thêm cờ «chỉ hiện ở thanh tab» cho mục trong `NAV_SECTIONS` (thanh tab Kho vẫn đọc cùng danh sách), `renderSidebarNav` bỏ qua mục có cờ và sáng dòng cha khi đang đứng ở màn con; nhóm gập dùng biến riêng thay `khoNavOpen`. `NAV_LABEL` / `NAV_GROUP` / `switchScreen` / `goKho` / `goEntry` giữ nguyên. Cập nhật `tests/ql_giao_dien.test.js`, `tools/ql_giao_dien/e2e_khung.js`.

### Việc xếp «Ít dùng» là PHỎNG ĐOÁN — cần chủ dự án sửa lại
App không ghi lượt mở từng màn nên không có số đo thật. Danh sách trên dựa vào: màn chỉ có đúng 1 lối vào (không màn nào khác dẫn tới), là cấu hình đặt một lần, hoặc là công cụ kỹ thuật. Anh/chị chỉ cần nói mục nào thực tế vẫn mở hằng tuần để đưa lại lên trên.

## 4. Đề xuất BỎ HẲN (đổi chức năng → chỉ làm khi chủ dự án đồng ý từng mục)

| Mục | Vì sao đề xuất bỏ | Nếu bỏ thì mất gì |
|---|---|---|
| **Mô phỏng** (`sim`) | Màn đứng riêng, 1 lối vào, không màn nào đọc kết quả của nó | Công cụ «thử giả định» giá / chi phí |
| **Dọn dữ liệu** (`entry:dondep`) | Công cụ kỹ thuật quét / xoá RT cũ, dùng rất thưa và có rủi ro bấm nhầm | Phải nhờ dọn bằng cách khác khi RT đầy |
| **Ghi chú ngày** (`entry:ops`) | Màn đã rút còn đúng một ô ghi chú (chú thích trong mã) | Ô ghi chú theo ngày — có thể chuyển thành một ô trong màn Hôm nay thay vì bỏ |
| **Tra cứu** (`kho2:search`) | Trùng việc với ô tìm trong Tem NL / Lô BTP | Lối tra theo mã tem gộp NL + BTP |
| **Kiểm toán** (`entry:audit`) | Một nhóm chỉ một mục; nhật ký thao tác + hoạt động nhân viên theo ngày | Nơi xem nhật ký — nên **giữ**, chỉ gom vào «Ít dùng» nếu anh/chị còn tra |

**Không đề xuất bỏ dù ít mở** (màn khác đang đọc dữ liệu của chúng): Tài sản (khấu hao trong lãi / lỗ), Mục tiêu (manage đọc), Ngày đặc biệt (Dự báo đọc), Cửa hàng (mã đăng nhập POS), Lý do hao hụt, Dụng cụ đựng, Checklist ca (POS đọc), GOGS Topping, Bao bì.

## 5. Tham khảo mã nguồn mở (chỉ lấy ý tưởng sắp xếp)

- OpenSourcePOS — menu phẳng ~12 mô-đun (Items, Receivings, Reports, Employees, Expenses, Cashups, Config…): mỗi mảng việc một lối vào. https://github.com/opensourcepos/opensourcepos
- ERPNext — sidebar chỉ liệt kê «workspace» (Stock, Selling, HR…), màn con nằm bên trong workspace. https://github.com/frappe/erpnext
- TastyIgniter — nhóm theo Restaurant / Sales / Marketing, phần đặt một lần dồn xuống System cuối menu. https://github.com/tastyigniter/TastyIgniter

Áp dụng: một dòng sidebar cho mỗi cụm việc, màn con đi bằng tab; cấu hình / công cụ ít dùng dồn xuống cuối và gập.

## 6. Thứ tự làm đề xuất

1. Chủ dự án duyệt mục 3 (sửa danh sách «Ít dùng») và trả lời mục 4.
2. Làm gọn sidebar trên `quanlygieo.html` → `sh tools/sinh_lai_tat_ca.sh` → giao bản trong `ban_deploy/giangsinh/`.
3. Bước A → B → C của mục 2.

Ghi nhận ngoài phạm vi: lúc dựng thử, lần vẽ sidebar đầu tiên của quanlygieo2 chưa có dòng «Tự động & Engine 2» (mục được chèn sau lần vẽ đầu; lần vẽ kế tiếp mới hiện) — mới thấy trên Firebase giả, chưa kiểm trên máy thật.
