# Gieo Gieo — POS & Quản lý

## Dự án
- `posgieo.html` — app bán hàng Gieo Gieo (APK bọc `https://the-cafe-33.web.app/posgieo.html`); `quanlygieo.html` — app quản lý.
- Mỗi app một file HTML, JS inline + file `*.vN.js` nạp kèm, không build step. Firebase **compat 10.13.2** (Firestore + RTDB + Auth + Storage), project `the-cafe-33`.
- Host: Firebase Hosting. **Chủ dự án tự deploy, Claude không bao giờ chạy deploy.** Hosting: chép file vào `/sdcard/MyCafeWeb/public/` rồi `firebase deploy --only hosting`; Functions: `cd ~/MyCafeWeb && firebase deploy --only functions:gieo-automation`. Gói giải nén ở `/sdcard/Download/Giải nén codex/<tên gói>/` — đưa lệnh `cp` theo đúng các đường này.
- Project và thư mục deploy **dùng chung với XOFA và The Cafe 33 (TC33)**. File của hai thương hiệu: không sửa / xoá / di chuyển, **trừ** `pos.html` (POS TC33), `PosX.html` (POS XOFA), `index.html` (app khách TC33), `manage.html` (quản lý TC33-XOFA) — chỉ sửa phần Ca làm việc (`cham_cong.v4.js`) và việc chủ dự án **yêu cầu đích danh** (ghi vào mục «Việc TC33 đã chốt» bên dưới).
- **File SINH TỰ ĐỘNG — không sửa tay**: `index_giangsinh.html`, `*_tet.html`, `*_thu.html`, `lai_lo.v*.js`, `unit_engine2_params_v1.js`, `quanlygieo2`, mọi thứ trong `ban_deploy/`. Sửa file gốc → `sh tools/sinh_lai_tat_ca.sh`.

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
- **Việc chờ, không tự đụng**: chuyển mã / mật khẩu bí mật vào backend (hỏi chủ quán trước khi bắt đầu).

## Kho (Unit Engine) & đa cửa hàng
- **Tem = sự thật**: tồn = Σ tem sealed + Σ `unitBase` tem đang mở; khoản không gắn được → Sổ lệch. Bất biến **B1–B15** (mục 2.1 `docs/KE_HOACH_UNIT_ENGINE_DA_CUA_HANG.md`) — mọi thay đổi phải giữ. POS và Quản lý lệch nhau → theo POS.
- Engine hiện hành **`unit_engine.v21.js`** (API `docs/UNIT_ENGINE.md`). App không ghi thẳng dữ liệu kho — gọi `UnitEngine.*`.
- Lớp đường dẫn hiện hành **`data_access.v9.js`** (cả posgieo / quanlygieo / manage). Quán hiện tại `gg01` giữ nguyên mọi tên; quán mới = tên + `__{storeId}`. Collection / gốc RT mới → đăng ký `GieoData.REG` (S / C / G / X). Ghi đổi lãi/lỗ ngày cũ tự ghi dấu `pl_dirty_gieogieo`. POS gắn quán bằng mã 6 ký tự — không tự gắn, không bắt nhập lại.
- NL / BTP đã dùng **không xoá** — «Ngừng sử dụng» (`active:false`).
- Engine 2 (cấp 6): mặc định TẮT; bản POS đã deploy = `gieo_engine2_pos_v4.js` + `unit_engine2_store_v4.js`. Bản mới CHƯA deploy = `gieo_engine2_pos_v5.js` + `unit_engine2_store_v5.js` + nhịp «cổng tín hiệu» `functions/automation/clock.js` (kế hoạch + số đo `docs/KE_HOACH_TOI_UU_ENGINE2_11-11.md`; đo lại bằng `node tools/automation/engine2_do_tai.js`) — chưa deploy thì còn sửa tại chỗ được, sau deploy = v6. Lộ trình duy nhất `docs/LO_TRINH_ENGINE2_CAP6.md`, chi tiết `docs/ENGINE2_POS_V3_05-11.md`.

## Việc TC33 đã chốt (được sửa `index.html` / `pos.html` / `manage.html`)
- CK TC33 = luồng VietQR như posgieo, không PayOS. Chi tiết các việc cũ: `docs/luu_tru/CLAUDE_MD_DAY_DU_27-10-2026.md`.
- **Vé đặt bed** (04/11, đã push): `_bsTicketSvg` / `_bsTicketInfo` trong `index.html` — modal Đặt thành công + «Lịch trình hôm nay» (nút Đổi giờ / Huỷ dưới vé, ≥ 2 lịch trượt ngang). Ảnh Nội quy / Thoả thuận miễn trừ trên Firebase Storage.
- **Combo bed không nước** (06/11, ĐANG CHUẨN BỊ — mẫu đã render, chưa code): tối đa 2 người, khung mặc định 08:30–12:30 T2–T7, giá 45/69/89/105K, giờ chẵn, không voucher; sau 4h +30K, +40K…; khách vãng lai luôn tính theo giờ. Công tắc + cấu hình ở POS (trên nút giờ đóng bed); app khách đặt bed theo từng bước. Thêm tên dòng combo vào `_isKhacLine` (pos) và `tcIsKhacLine` (manage).

## Kế hoạch & tài liệu
- **Đọc trước tiên: `docs/TRANG_THAI.md`** (bản hiện hành, việc còn mở, bản đồ tài liệu).
- Tách posgieo thành `js/posgieo/*.vN.js`: `docs/KE_HOACH_TACH_POSGIEO_DA_CUA_HANG.md` — chỉ chuyển nguyên văn, ưu tiên luồng bán trơn tru.
- Bản theo mùa: Giáng sinh đang chạy; Tết 2027 (`docs/LIXI_TET_2027.md`). Gấu Noel `gau_noel_giangsinh.v3.js` (chưa deploy: còn sửa tại chỗ được; sau deploy = v4; hướng dẫn gỡ + luật chơi: `docs/HUONG_DAN_GAU_NOEL.md`). Chế độ thử `docs/CHE_DO_THU.md` — app thật không bao giờ nạp `che_do_thu`.
- Giao diện quanlygieo: dáng theo manage, **giữ màu hồng `#E23A5D`** (`docs/GIAO_DIEN_QUANLY.md`).
- CLAUDE.md đầy đủ cũ: `docs/luu_tru/CLAUDE_MD_DAY_DU_06-11-2026.md` — chỉ tra cứu.

## Kiểm tra
- `npm i` một lần (test cần `acorn`).
- `sh tools/sinh_lai_tat_ca.sh` — sinh lại + chạy `tests/run_all.sh`. **Mốc hiện tại: 6 FAIL có sẵn ở `tools/tach_posgieo` (test 8, 11)** — chỉ lo khi số / danh sách FAIL khác mốc.
- Cú pháp: tách `<script>` inline ra file tạm rồi `node --check` (hoặc `new Function`).
- `node tools/check_boundaries.js` → «RANH GIỚI SẠCH»; `node tools/check_paths.js` → «ĐƯỜNG DẪN SẠCH».
- Trước deploy (chủ dự án chạy): `sh tools/predeploy_check.sh <thư mục deploy>`.
