# Gieo Gieo — POS & Quản lý

## Dự án
- `posgieo.html` — app bán hàng Gieo Gieo (APK bọc `https://the-cafe-33.web.app/posgieo.html`); `quanlygieo.html` — app quản lý.
- Mỗi app một file HTML, JS inline + file `*.vN.js` nạp kèm, không build step. Firebase **compat 10.13.2** (Firestore + RTDB + Auth + Storage), project `the-cafe-33`.
- Host: Firebase Hosting. **Chủ dự án tự deploy, Claude không bao giờ chạy deploy.** Hosting: chép file vào `/sdcard/MyCafeWeb/public/` rồi `firebase deploy --only hosting`; Functions: `cd ~/MyCafeWeb && firebase deploy --only functions:gieo-automation`. Gói giải nén ở `/sdcard/Download/Giải nén codex/<tên gói>/` — đưa lệnh `cp` theo đúng các đường này.
- Project và thư mục deploy **dùng chung với XOFA và The Cafe 33 (TC33)**. File của hai thương hiệu: không sửa / xoá / di chuyển, **trừ** `pos.html` (POS TC33), `PosX.html` (POS XOFA), `index.html` (app khách TC33), `manage.html` (quản lý TC33-XOFA) — chỉ sửa phần Ca làm việc (`cham_cong.v4.js`) và việc chủ dự án **yêu cầu đích danh** (ghi vào mục «Việc TC33 đã chốt» bên dưới).
- **File SINH TỰ ĐỘNG — không sửa tay**: `index_giangsinh.html`, `*_tet.html`, `*_thu.html`, `lai_lo.v*.js`, `unit_engine2_params_v1.js`, mọi thứ trong `ban_deploy/`. Sửa file gốc → `sh tools/sinh_lai_tat_ca.sh`.

## Quy tắc làm việc (bắt buộc)
1. Trả lời bằng **tiếng Việt**.
2. **Phản biện trước khi sửa**: tìm cơ chế đã có (tên hàm, chú thích `[FIX]`, `[GIẢM-ĐỌC]`, `[TEM = SỰ THẬT]`…), báo kết quả trước, sửa sau.
3. **Không lan man**: chỉ làm việc chủ dự án giao hoặc có trong kế hoạch đang chạy. Phát hiện vấn đề mới → báo ngắn, không tự thêm vào phạm vi.
4. Đổi **hành vi nghiệp vụ** (tiền, luồng bán, quy tắc khoá…) → hỏi trước. Việc giao diện lớn → render mẫu cho chủ dự án duyệt trước khi sửa file thật.
5. Chức năng mới, chưa quen → tham khảo dự án mã nguồn mở cùng loại trước (chỉ lấy ý tưởng, báo kèm link).
6. File rất lớn: không đọc cả file; `grep -n "function tenHam"` rồi đọc từng đoạn. Số dòng trong tài liệu sẽ trôi — luôn tìm theo tên.
7. Sau MỌI sửa file gốc: `sh tools/sinh_lai_tat_ca.sh` (sinh bản Giáng sinh / Tết / thử + `ban_deploy/{thuong,giangsinh,tet}/` + chạy test), commit CẢ file sinh ra. Gửi file: bản trong `ban_deploy/<mùa đang chạy>/` (hiện **giangsinh**).
8. JS / engine **đã phát hành không sửa** — tạo `vN+1` và trỏ các app sang (sổ phát hành `tools/js_da_phat_hanh.json`).
9. Dữ liệu người ngoài nhập (tên khách…) luôn **escape** trước khi chèn `innerHTML`.

## Nghiệp vụ Gieo Gieo đã chốt
- Chỉ bán to-go. Không mã giảm giá / voucher — khuyến mãi chỉ ở `togoSettings_gieogieo` và `sales_assist_config_gieogieo`. Tích luỹ = tem → ly miễn phí.
- Đã loại: kiosk / màn hình phụ, Ví, Đồng giá, service worker.
- Tài nguyên dùng chung XOFA / TC33 — **không đổi cấu trúc**: `customers`, `rewards`, `bank_confirmations`, `kiosk_config`, tài khoản đăng nhập chung. Rules: đã đăng nhập = toàn quyền.
- **Bảo mật (14/11, đợt 1 xong, chưa deploy — `docs/KE_HOACH_BAO_MAT_BACKEND_14-11.md`)**: làm sẵn, **không bắt buộc gì cho tới khi chủ dự án tự đổi mật khẩu** (bảo mật chưa phải ưu tiên). Duyệt máy mới / mã quản lý / đổi mật khẩu đều ở `manage.html` mục «Bảo mật»; duyệt máy qua `functions/baomat` (codebase riêng `gieo-baomat`, không gộp vào worker). **Kiosk đứng ngoài** (giữ đăng nhập cũ, không đổi mật khẩu tài khoản `elio@…`). Khoá Google Sheets trong `pos.html` **giữ nguyên**. Mã quản lý lưu dạng đọc được (chủ dự án muốn mở ra là thấy). Không gọi function trong luồng bán.

## Kho (Unit Engine) & đa cửa hàng
- **Tem = sự thật**: tồn = Σ tem sealed + Σ `unitBase` tem đang mở; khoản không gắn được → Sổ lệch. Bất biến **B1–B16** (mục 2.1 `docs/KE_HOACH_UNIT_ENGINE_DA_CUA_HANG.md`) — mọi thay đổi phải giữ. POS và Quản lý lệch nhau → theo POS.
- Engine hiện hành **`unit_engine.v22.js`** (ĐÃ deploy 12/11 — chủ dự án xác nhận 16/11; sửa tiếp = v23; API `docs/UNIT_ENGINE.md`). App không ghi thẳng dữ liệu kho — gọi `UnitEngine.*`.
- Lớp đường dẫn hiện hành **`data_access.v9.js`** (cả posgieo / quanlygieo / manage). Quán hiện tại `gg01` giữ nguyên mọi tên; quán mới = tên + `__{storeId}`. Collection / gốc RT mới → đăng ký `GieoData.REG` (S / C / G / X). Ghi đổi lãi/lỗ ngày cũ tự ghi dấu `pl_dirty_gieogieo`. POS gắn quán bằng mã 6 ký tự — không tự gắn, không bắt nhập lại.
- NL / BTP đã dùng **không xoá** — «Ngừng sử dụng» (`active:false`).
- Engine 2 (cấp 6): mặc định TẮT; bản POS đã deploy 12/11 (cùng gói kho v22) = `gieo_engine2_pos_v5.js` + `unit_engine2_store_v5.js` (+ `js/posgieo/pos_thanh_toan.v2.js`); nhịp «cổng tín hiệu» `functions/automation/clock.js` — Functions cùng gói, cũng ĐÃ deploy 12/11 (kế hoạch + số đo `docs/KE_HOACH_TOI_UU_ENGINE2_11-11.md`; đo lại bằng `node tools/automation/engine2_do_tai.js`) — đã deploy nên sửa tiếp = v6. Lộ trình duy nhất `docs/LO_TRINH_ENGINE2_CAP6.md`, chi tiết `docs/ENGINE2_POS_V3_05-11.md`.

## Việc TC33 đã chốt (được sửa `index.html` / `pos.html` / `manage.html`)
- CK TC33 = luồng VietQR như posgieo, không PayOS. Chi tiết các việc cũ: `docs/luu_tru/CLAUDE_MD_DAY_DU_27-10-2026.md`.
- **Vé đặt bed** (04/11, đã push): `_bsTicketSvg` / `_bsTicketInfo` trong `index.html` — modal Đặt thành công + «Lịch trình hôm nay» (nút Đổi giờ / Huỷ dưới vé, ≥ 2 lịch trượt ngang). Ảnh Nội quy / Thoả thuận miễn trừ trên Firebase Storage.
- **Combo bed không nước** (06/11, ĐANG CHUẨN BỊ — mẫu đã render, chưa code): tối đa 2 người, khung mặc định 08:30–12:30 T2–T7, giá 45/69/89/105K, giờ chẵn, không voucher; sau 4h +30K, +40K…; khách vãng lai luôn tính theo giờ. Công tắc + cấu hình ở POS (trên nút giờ đóng bed); app khách đặt bed theo từng bước. Thêm tên dòng combo vào `_isKhacLine` (pos) và `tcIsKhacLine` (manage).
- **Mục «Bảo mật» của `manage.html`** (14/11, chưa deploy): `<style id="manage-bao-mat">` + class `bm-*`, hàm `bm*` / `readBaoMat` / `writeMaQuanLy` / `doiMatKhau`; mẫu duyệt `docs/mau/mau_manage_bao_mat_v4.html`. Kiểm: `tools/ql_giao_dien/e2e_manage_bao_mat.js`.
- **Gấu Noel trong `manage.html`** (16/11, đã deploy cùng v4): mục «Gấu Noel» = tab Gấu của pos (thẻ `gau_noel_giangsinh.v5.js` `data-quan="manage"`, chỉ bản Giáng sinh; `navList()` / `GauNoel.manageView` / `manageMount`). Kiểm: `tools/gau_noel/e2e_manage_gau.js`.
- **Tab Chi phí `manage.html` — duyệt nhiều + cập nhật tại chỗ** (16/11, chưa deploy): ô chọn từng khoản chờ duyệt + «Chọn tất cả» + `approveSelectedExpenses` (duyệt lần lượt qua đúng hàm duyệt cũ, hỏi lại một lần kèm tổng tiền); duyệt / từ chối không xoá trắng màn (`costPendDrop` + `costQuietRefresh` + `renderKeep`). Bảng khoản chi: nút Sửa / Xoá một hàng. Kiểm: `tools/ql_giao_dien/e2e_manage_duyet_gieo.js` (55 mục).
- **Bảng «Chọn điểm bán» `manage.html`** (16/11, chưa deploy): The cafe 33 / XOFA (mỗi thương hiệu một điểm) là NÚT chọn cùng hàng «Tất cả» (`chooserIsSingle`, `#chooserQuick`), chỉ Gieo Gieo là nhóm + dòng; ô tìm chỉ hiện khi > 6 điểm Gieo. Kiểm: `tools/ql_giao_dien/e2e_store_dropdown.js`.
- **In tem Niimbot B1 trong `PosX.html`** (16/11, chưa deploy — chủ dự án yêu cầu đích danh): nút «Máy in» thay nút «Cập nhật» trên sidebar (`moMayInTem`), in sau khi lưu đơn qua `inTemSauThanhToan` (2 nơi: `confirmPay` + Tính riêng, không await). Bộ in `in_tem_niimbot.v1.js` (`NiimTem.*`) + thư viện `niimbluelib.v1.js` (MIT, nguyên văn); mỗi ly một tem 40×30, đơn To Go ghi «Mang đi», bỏ món Food / dòng giảm giá; cấu hình lưu theo máy (`localStorage niimtem_xofa_v1`). Web Bluetooth: chỉ chạy trong Chrome, không chạy trong APK bọc. Trang thử độc lập: `niim.html`.
- **Tab Quản lý `pos.html` kiểu bento** (13/11, chưa deploy): một khối `<style id="pos-manager-bento">` + class `mgr-*`, mẫu `docs/mau/mau_quanly_tc33_bento_v3.html`; xanh `#006241` + đen, phông Inter. Giữ điểm neo file theo mùa: `mgr-tab-label`, `mgr-mob-tab-label`, `mgr-col-c`, `mgr-col-b-wrap`, `switchMgrTab`. Kiểm: `tools/ql_giao_dien/e2e_pos_manager_bento.js` (cần `TAILWIND_CSS`).
- **Nút Duyệt chi phí `manage.html` kiểu toast-status** (16/11, chưa deploy, chủ dự án yêu cầu đích danh): `approveBtnHtml` / `apbSet` / `apbHold` + khối CSS `.apb-*` (đánh dấu `[DUYỆT-TICK]`); Duyệt → vòng quay «Đang duyệt…» → tick «Đã duyệt» (giữ ~0,65s rồi mới tải lại danh sách). Dùng cho 2 nút Duyệt trong khung «khoản chờ duyệt» (`approveExpense`, `approveGieoExpense`) và nút Xác nhận / Xác nhận tổng / Lưu thực nhận ở tab Tiền mặt (`saveCash`, qua `apbHtml`); nghiệp vụ không đổi.
- **Tab Tiền mặt `manage.html` — nhập nhiều ngày** (16/11, chưa deploy, chủ dự án yêu cầu đích danh): quán có ≥ 2 ngày chờ nhận → popup (`cashBulk`, tự mở MỘT lần mỗi lần mở trang qua `cashAutoBulk`, còn nút «Nhập N ngày một lượt»). Mỗi ngày 1 dòng: phải nộp + ô nhập + nút Xác nhận RIÊNG (`cashDaySave` → đúng `writeCashReceipt` của nhập 1 ngày; KHÔNG có nút lưu chung, không chi tiết, nhập cùng lúc không khoá ngày); hiện «Lệch ± … · ck thêm … là đủ». Làm mới tab phía sau gộp (debounce) để không dựng lại popup. Kiểm: `tools/ql_giao_dien/e2e_manage_tien_mat_nhieu_ngay.js` (44 mục).

## Kế hoạch & tài liệu
- **Đọc trước tiên: `docs/TRANG_THAI.md`** (bản hiện hành, việc còn mở, bản đồ tài liệu).
- **Gói chờ deploy (16/11)**: `giao_file/dot_16-11_GOP_v22_gaunoel_quanly/` gồm 2 đợt CHƯA deploy (Gấu Noel v4, quanlygieo gộp) + file Hosting đợt 12/11 đã deploy (chép đè lại vô hại, JS giống hệt) — CHỈ Hosting, chủ dự án deploy một lượt. Sửa file thuộc gói → dựng lại gói gộp từ `ban_deploy/giangsinh/`.
- **Gợi ý đặt hàng quanlygieo** (19/11, CHƯA deploy — chủ dự án xác nhận 19/11; gói chờ deploy `giao_file/dot_19-11_goi_y_dat_hang/`, sửa quanlygieo trước khi deploy → dựng lại gói từ `ban_deploy/giangsinh/`): widget `[GỢI-Ý-ĐẶT]` (`gyd*`, `<style id="ql-goi-y-dat">`) ở Kho ▸ Đặt hàng; đặt ngày nào hàng về ngày đó; chi tiết `docs/TRANG_THAI.md` mục 19/11.
- Tách posgieo thành `js/posgieo/*.vN.js`: `docs/KE_HOACH_TACH_POSGIEO_DA_CUA_HANG.md` — chỉ chuyển nguyên văn, ưu tiên luồng bán trơn tru.
- Bản theo mùa: Giáng sinh đang chạy; Tết 2027 (`docs/LIXI_TET_2027.md`). Gấu Noel `gau_noel_giangsinh.v5.js` (19/11, CHƯA deploy — v4 đã deploy; v5 = v4 + phần ngẫu nhiên cố định 40%; gói `giao_file/dot_19-11_gau_noel_v5/`; còn sửa tại chỗ được, sau deploy = v6; luật + hướng dẫn gỡ: `docs/HUONG_DAN_GAU_NOEL.md`). Chế độ thử `docs/CHE_DO_THU.md` — app thật không bao giờ nạp `che_do_thu`.
- Giao diện quanlygieo: dáng theo manage, **giữ màu hồng `#E23A5D`** (`docs/GIAO_DIEN_QUANLY.md`).
- **quanlygieo2 đã nhập vào `quanlygieo.html`** (16/11, chưa deploy): một file gốc duy nhất, không còn bước sinh. Lớp «Tự động & Engine 2» nằm inline giữa các mốc `[TỰ ĐỘNG-UI]` / `[ENGINE2-UI]` + `<style id="ql-tu-dong">` (test lấy qua `tools/automation/nguon_ui.js`); `quanlygieo2.html` chỉ là trang chuyển hướng. Sidebar gọn (`one` / `head` / `collapsible` trong `NAV_SECTIONS`): `docs/KE_HOACH_THAY_QUANLYGIEO_VA_GON_SIDEBAR_16-11.md`.
- CLAUDE.md đầy đủ cũ: `docs/luu_tru/CLAUDE_MD_DAY_DU_06-11-2026.md` — chỉ tra cứu.

## Kiểm tra
- `npm i` một lần (test cần `acorn`).
- `sh tools/sinh_lai_tat_ca.sh` — sinh lại + chạy `tests/run_all.sh`. **Mốc hiện tại: 6 FAIL có sẵn ở `tools/tach_posgieo` (test 8, 11)** — chỉ lo khi số / danh sách FAIL khác mốc.
- Cú pháp: tách `<script>` inline ra file tạm rồi `node --check` (hoặc `new Function`).
- `node tools/check_boundaries.js` → «RANH GIỚI SẠCH»; `node tools/check_paths.js` → «ĐƯỜNG DẪN SẠCH».
- Trước deploy (chủ dự án chạy): `sh tools/predeploy_check.sh <thư mục deploy>`.
