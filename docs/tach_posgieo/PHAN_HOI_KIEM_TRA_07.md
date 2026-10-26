# Phản hồi kiểm tra lượt 07 (`KET_QUA_KIEM_TRA_07_DOC_LAP.md`, commit `c3dff1a`)

Người kiểm: chưa thông qua — 2 điểm mù **của công cụ kiểm** (runtime không đổi, không hồi quy). Phản biện: **đồng ý cả hai**, đã tái hiện. Sửa chỉ trong `tools/tach_posgieo/` — app (`posgieo.html`, `js/posgieo/*`, `ban_deploy/`) không đổi.

## F07-1 (Cao) — sót 2 lớp bọc Engine 2 → ĐÃ SỬA

- Nguyên nhân: (1) chỉ thu tên trong dấu nháy; (2) chỉ theo biến closure `goc`/`cu`/`fn` — Engine 2 dùng `const old = window._continueAfterPrepCount`, `const count = window.computeShiftInventoryCountLinesPOS`.
- `e2e_hook.js` `phanTich()`: quét file bọc (Gấu Noel, automation, Engine 2, khối trợ lý) **và mọi mã app** (script trần + `js/posgieo/*`):
  - `const|let|var V = window.N` → tên N là ứng viên + **cạnh riêng** N → V (không mở cho tên khác — tránh đi nhầm helper);
  - `const V = window[…]` → V là biến lớp trước cho mọi tên (cùng `goc`/`cu`/`fn`);
  - `window.N =` → tên ứng viên.
- **Bảng kỳ vọng `KY_VONG` 25 hàm** (mốc mặc định `0bd95a7` · giangsinh): so ĐÚNG tập, báo thiếu/thừa — bỏ ngưỡng `≥ 15`.
- **Tự kiểm cố định trong công cụ** (`banSua` + `chenDauHam` ở `hai_ban.js`, bản sao tạm của bộ hiện tại): chèn `throw` đầu HÀM GỐC `_continueAfterPrepCount` và `computeShiftInventoryCountLinesPOS`, gỡ lớp trợ lý `cartClear`, gán đè `updCoTotal` sau Engine 2 → phải báo lệch **đúng** 4 tên đó. Đạt.

## F07-2 (Vừa) — chuẩn hoá giờ quá rộng → ĐÃ SỬA

- Bỏ regex trên toàn JSON. `chuan()` nay chỉ áp cho **dữ liệu ghi Firebase + giỏ**, theo trường: khoá giờ (`…At`, `at`, `ts`, `time`) mang giá trị giờ (ISO / ms / `HH:MM`) → `<giờ>`; khoá thanh toán `bill_<ms>_<ngẫu nhiên>` (giá trị / khoá / đường dẫn); khoá dòng giỏ `_new…`. **Nội dung bill, toast, lỗi, giờ fixture không chuẩn hoá.**
- Thêm khẳng định thanh toán thành công ở CẢ HAI bản (câu hỏi 2 của người kiểm): không `ttLoi`, có toast «Thanh toán thành công», giỏ trống sau thanh toán.
- **Tự kiểm cố định**: (1) chạy bản hiện tại với giờ thật lệch 7 phút 13 giây (`moTrang` tuỳ chọn `lechGio`, tránh qua nửa đêm VN) → không báo lệch giả; (2) bản sao in `12:34` thay `${order.time}` → báo lệch **đúng** mục `bill`. Đạt.

## Câu hỏi khác

- Transaction giả: giữ chạy callback; bổ sung khẳng định thành công như trên. Không coi là chứng nhận Firebase thật (giới hạn giữ nguyên).
- `file://` bị môi trường người kiểm chặn — ghi nhận, không đổi.

## Chạy lại

```sh
node tools/tach_posgieo/e2e_hook.js   # 25 hàm đúng bảng, chuỗi giống 0bd95a7 (A/B), tự kiểm 4 tên → ALL PASS
node tools/tach_posgieo/e2e_ban.js    # thanh toán thành công + 12 mục giống 0bd95a7 (A/B), tự kiểm 2 ca → ALL PASS
node tools/tach_posgieo/e2e_0d.js; sh tests/run_all.sh
```
Chạy 2 lượt liên tiếp: ổn định; không còn worktree / thư mục tạm sót.
