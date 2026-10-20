# Gieo Gieo — POS & Quản lý

Hai app một file HTML (không build step), Firebase compat 10.13.2, project `the-cafe-33` (dùng chung Hosting với XOFA và The Cafe 33).

| File | Là gì |
|---|---|
| `posgieo.html` | App bán hàng (chạy trong APK bọc web) |
| `quanlygieo.html` | App quản lý |
| `unit_engine.v19.js` | Engine kho theo tem/lô dùng chung 2 app (v1–v18 giữ để quay lui; v19 chưa deploy) |
| `che_do_thu.v1.js`, `*_thu.html` | Chế độ thử trên bản sao dữ liệu thật |
| `tests/` | `sh tests/run_all.sh` (chỉ cần node) |
| `tools/` | kiểm ranh giới engine, predeploy, sinh bản thử, kiểm kê AST |
| `docs/` | tài liệu — bắt đầu từ `docs/TRANG_THAI.md` |

Quy tắc làm việc cho Claude: `CLAUDE.md`. Deploy: chủ dự án tự chạy `sh tools/predeploy_check.sh <thư mục deploy>` rồi `firebase deploy --only hosting`.

20/10: Tiền mặt `manage.html` dùng bộ đọc/đệm **v3 độc lập v1/v2**: tải phiếu theo mã Firebase, kể cả phiếu cũ thiếu trường ngày. Xoá sạch đệm vẫn tự tải lại đúng, giữ tối ưu ngày ổn định sau lần đầu. Đối soát Gieo và hai chỉ số nhỏ giữ nguyên. ZIP hiện hành `manage_tien_nop_v3_20-10.zip`, chỉ manage.html dùng chung ba mùa. Xem `docs/MANAGE_TIEN_MAT.md`.
