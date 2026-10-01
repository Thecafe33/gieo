# Gieo Gieo — POS & Quản lý

## Dự án
- `posgieo.html` (~31.800 dòng) — app bán hàng, chạy trong APK bọc đường link web.
- `quanlygieo.html` (~28.300 dòng) — app quản lý.
- Mỗi app là **một file HTML duy nhất**, JS inline, không build step. Firebase **compat 10.13.2** (Firestore + Realtime Database + Auth + Storage), project `the-cafe-33`.
- Host: **Firebase Hosting**. Chủ dự án **tự deploy** cả thư mục bằng `firebase deploy --only hosting` từ Termux. **Claude không bao giờ chạy deploy.**
- Project Firebase và thư mục deploy **dùng chung với XOFA và The Cafe 33**. Không sửa, không xoá, không di chuyển file của hai thương hiệu đó.

## Quy tắc làm việc (bắt buộc)
1. Trả lời bằng **tiếng Việt**.
2. **Phản biện trước khi sửa**: trước mỗi sửa đổi, kiểm tra xem đã có cơ chế nào xử lý chưa (tìm theo tên hàm, đọc chú thích `[FIX]`, `[GIẢM-ĐỌC]`, `[TEM = SỰ THẬT]`…). Báo kết quả phản biện trước, sửa sau.
3. **Không lan man**: chỉ làm hạng mục có trong kế hoạch (`docs/KE_HOACH_UNIT_ENGINE_DA_CUA_HANG.md`). Phát hiện vấn đề mới → báo ngắn, không tự thêm vào phạm vi.
4. Đổi **hành vi nghiệp vụ** (không chỉ sắp xếp code) → hỏi trước.
5. File rất lớn: **không đọc cả file**; tìm theo tên hàm (`grep -n "function tenHam"`), đọc từng đoạn. Số dòng trong tài liệu sẽ trôi — luôn tìm theo tên.
6. Sau mỗi sửa đổi: chạy kiểm tra ở mục "Kiểm tra" bên dưới.

## Bối cảnh nghiệp vụ đã chốt
- Gieo Gieo **chỉ bán to-go** (`isToGo` là hằng `true`; nhánh "Tại quán"/Point đã gỡ ở F5).
- **Không dùng mã giảm giá / voucher**. Khuyến mãi chỉ gồm: `togoSettings_gieogieo` (quà tặng, giảm giá to-go, tặng topping) và chiến dịch trong `sales_assist_config_gieogieo` — cấu hình ở Quản lý.
- Tích luỹ khách = **tem → ly miễn phí** (`loyaltyAddStamps`, `consumeFreeToGoDrink`).
- Đã loại khỏi hệ thống: **kiosk / màn hình phụ**, **Ví**, **Đồng giá**. Không có service worker / PWA (`sw_gieogieo.js` không tồn tại).
- Tài nguyên dùng chung với XOFA / The Cafe 33 — **không đổi cấu trúc**: `customers`, `rewards`, `bank_confirmations` (webhook ngân hàng chạy trên Cloud Run), `kiosk_config` (của XOFA), tài khoản đăng nhập chung. Rules hiện tại: đã đăng nhập = toàn quyền.

## Unit Engine (kho theo tem/lô)
- Nguyên tắc **tem = sự thật**: tồn NL = Σ tem sealed (Firestore) + Σ `unitBase` tem đang mở (RT `active_units_gieogieo/{itemId}/{containerId}`). Khoản không gắn được vào mã → Sổ lệch (`stock_anomalies_gieogieo`).
- 15 bất biến B1–B15: mục 2.1 của kế hoạch. **Mọi thay đổi phải giữ nguyên.**
- Chỗ POS và Quản lý lệch nhau → **theo POS**. Chỗ POS không có → danh sách F, chủ dự án duyệt.
- **Engine là file riêng `unit_engine.v12.js`** (bản hiện hành; v1–v11 giữ để quay lui; dùng chung 2 app, API: `docs/UNIT_ENGINE.md`). App **không ghi thẳng** dữ liệu kho — gọi `UnitEngine.<nhóm>.<hàm>`; `tools/check_boundaries.js` chặn. Sửa engine đã deploy = tạo `unit_engine.v{N+1}.js` (bản cũ cache immutable), sửa cả 2 HTML trỏ tới.

## Kế hoạch & tiến độ
- Kế hoạch đầy đủ: `docs/KE_HOACH_UNIT_ENGINE_DA_CUA_HANG.md` (đọc mục cần thiết, không cần đọc hết).
- Những gì đã sửa trong phiên trước: `docs/NHAT_KY_PHIEN_28-09-2026.md`.
- **Đã xong (28/09/2026, chưa deploy / chưa thử máy thật)**: K0, F4, E0 → E6, F1–F3, F5 — chi tiết + việc chủ dự án tự làm: mục 10–14 của nhật ký phiên.
- Kế hoạch đa cửa hàng (chưa làm, chờ chủ dự án gọi): `docs/KE_HOACH_DA_CUA_HANG.md`.
- **Chế độ thử** (`che_do_thu.v1.js`, `docs/CHE_DO_THU.md`): bản `*_thu.html` sinh bằng `tools/tao_ban_thu.js`, khoá cứng vùng thử `__test_gieogieo`. App thật **không bao giờ** nạp `che_do_thu` (predeploy_check chặn). Sửa code → Claude chạy lại `tao_ban_thu.js` và **gửi sẵn 2 file `_thu`** cho chủ dự án. Chủ dự án **giữ nguyên cách để file** (một thư mục deploy) — không yêu cầu tách thư mục.
- Còn mở: các câu hỏi ở mục 13 nhật ký (F6 đã làm — mục 15); kế tiếp theo kế hoạch: M1 → (đa cửa hàng).
- Còn mở: O13 (mã nguồn webhook Cloud Run — chỉ cần cho phần đa cửa hàng, chưa làm).

## Kiểm tra
- Test: `sh tests/run_all.sh` (chỉ cần `node`). Test trích hàm thẳng từ HTML qua `tests/lib/extract.js` — đổi tên hàm thì sửa danh sách tên trong file test.
- Cú pháp: tách các `<script>` inline ra file tạm rồi `node --check` từng file.
- Kiểm kê truy cập Firebase (AST): `npm i` một lần, rồi `npm run inventory` → `inv_ast.json`.
- Ranh giới engine: `node tools/check_boundaries.js` (phải báo "RANH GIỚI SẠCH").
- Trước deploy (chủ dự án chạy, từ thư mục làm việc): `sh tools/predeploy_check.sh <thư mục deploy>` — gồm cả ranh giới + test.
