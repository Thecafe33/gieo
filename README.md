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

20/10: tab Tiền mặt của `manage.html` bổ sung đối soát cuối ca Gieo, chi tiết từng đoạn ca khi bấm và hai số nhỏ doanh thu/chuyển khoản từng quán. **Bản vá khẩn kế tiếp** tra phiếu gốc ngày cũ, giữ số nhận trong cả đệm v1/v2 và không cho ghi đè khi chưa xác minh server. Dùng ZIP `manage_khoi_phuc_tien_nop_20-10.zip` thay ZIP `manage_tien_mat_doi_soat_20-10.zip`. Xem `docs/MANAGE_TIEN_MAT.md`.
