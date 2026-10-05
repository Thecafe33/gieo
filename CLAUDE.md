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
- **Engine là file riêng `unit_engine.v18.js`** (bản hiện hành; v1–v17 giữ để quay lui — không sửa, không xoá; dùng chung 2 app, API: `docs/UNIT_ENGINE.md`). App **không ghi thẳng** dữ liệu kho — gọi `UnitEngine.<nhóm>.<hàm>`; `tools/check_boundaries.js` chặn. Sửa engine đã deploy = tạo `unit_engine.v{N+1}.js` (bản cũ cache immutable), sửa cả 2 HTML trỏ tới.
- **Lớp đường dẫn `data_access.v1.js`** (đa cửa hàng Bước 1+2, 05/10): bọc `fstore`/`db` ngay sau khi tạo; quán hiện tại `gg01` giữ nguyên mọi tên. Danh mục `inventory_items`/`prep_items` theo quán (loại C) — Quản lý bật `catalogMirror` nên sửa danh mục tự đồng bộ sang quán khác (không chép trường tồn `STATE_FIELDS`; trường tồn mới → thêm vào đó). POS gắn cửa hàng bằng mã 6 ký tự (`gieo_store_v1`), chưa gắn → app dừng ở màn nhập mã; **không bao giờ tự gắn quán, không bắt máy đã gắn nhập lại mã**. Cùng quy tắc phiên bản như engine (sửa bản đã deploy = `v{N+1}`).

## Kế hoạch & tiến độ
- **Đọc trước tiên: `docs/TRANG_THAI.md`** — bản hiện hành (engine v18), việc đã làm tới 04/10/2026, việc còn mở, bản đồ tài liệu, quy trình mỗi lần sửa.
- Kế hoạch gốc: `docs/KE_HOACH_UNIT_ENGINE_DA_CUA_HANG.md` (đọc mục cần thiết, không cần đọc hết; mục 2.1 = bất biến B1–B15).
- **Kế hoạch tối ưu lượt đọc** (05/10, ưu tiên trước đa cửa hàng): `docs/KE_HOACH_TOI_UU_DOC.md` — 3 nguyên tắc N1–N3, giai đoạn T0–T6. Code mới phải theo N1–N3.
- Kế hoạch đa cửa hàng: `docs/KE_HOACH_DA_CUA_HANG.md` — một project, quán hiện tại `gg01` giữ nguyên mọi đường dẫn (không chuyển dữ liệu), quán mới tên + `__{storeId}`; Bước 0–5. **Bước 1 + 2 đã làm 05/10 (chưa deploy)**.
- **Chế độ thử** (`che_do_thu.v1.js`, `docs/CHE_DO_THU.md`): bản `*_thu.html` sinh bằng `tools/tao_ban_thu.js`, khoá cứng vùng thử `__test_gieogieo`. App thật **không bao giờ** nạp `che_do_thu` (predeploy_check chặn). Sửa code → Claude chạy lại `tao_ban_thu.js` và **gửi sẵn 2 file `_thu`** cho chủ dự án. Chủ dự án **giữ nguyên cách để file** (một thư mục deploy) — không yêu cầu tách thư mục.
- Tài liệu cũ (nhật ký 28/09, bản mô tả cho người rà bug, báo cáo bug kho/cân, kế hoạch rebuild cũ): `docs/luu_tru/` — chỉ tra cứu, không làm theo.
- Trạng thái deploy: chủ dự án xác nhận ngày 04/10/2026 — **v18 đã deploy**, chạy ổn ở cửa hàng 1 được **1–3 tuần** (chưa đủ "vài tuần" cho đa cửa hàng). Hỏi lại trước việc lớn.

## Kiểm tra
- Test: `sh tests/run_all.sh` (chỉ cần `node`). Test trích hàm thẳng từ HTML qua `tests/lib/extract.js` — đổi tên hàm thì sửa danh sách tên trong file test.
- Cú pháp: tách các `<script>` inline ra file tạm rồi `node --check` từng file.
- Kiểm kê truy cập Firebase (AST): `npm i` một lần, rồi `npm run inventory` → `inv_ast.json`.
- Ranh giới engine: `node tools/check_boundaries.js` (phải báo "RANH GIỚI SẠCH").
- Lớp đường dẫn đa cửa hàng: `node tools/check_paths.js` (phải báo "ĐƯỜNG DẪN SẠCH"). Collection / gốc RT mới → đăng ký vào `GieoData.REG` trong `data_access.v1.js` (S riêng từng quán / C danh mục theo quán / G dùng chung / X dùng chung XOFA–The Cafe 33).
- Trước deploy (chủ dự án chạy, từ thư mục làm việc): `sh tools/predeploy_check.sh <thư mục deploy>` — gồm cả ranh giới + test.
