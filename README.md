# Gieo Gieo — POS & Quản lý

Hai app một file HTML (không build step), Firebase compat 10.13.2, project `the-cafe-33` (dùng chung Hosting với XOFA và The Cafe 33).

| File | Là gì |
|---|---|
| `posgieo.html` | App bán hàng (chạy trong APK bọc web) |
| `quanlygieo.html` | App quản lý |
| `unit_engine.v18.js` | Engine kho theo tem/lô dùng chung 2 app (v1–v17 giữ để quay lui) |
| `che_do_thu.v1.js`, `*_thu.html` | Chế độ thử trên bản sao dữ liệu thật |
| `tests/` | `sh tests/run_all.sh` (chỉ cần node) |
| `tools/` | kiểm ranh giới engine, predeploy, sinh bản thử, kiểm kê AST |
| `docs/` | tài liệu — bắt đầu từ `docs/TRANG_THAI.md` |

Quy tắc làm việc cho Claude: `CLAUDE.md`. Deploy: chủ dự án tự chạy `sh tools/predeploy_check.sh <thư mục deploy>` rồi `firebase deploy --only hosting`.
