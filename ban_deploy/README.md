# Bộ file deploy theo mùa

Mỗi thư mục là **một bộ hoàn chỉnh, đã đặt sẵn đúng tên**. Tới mùa nào thì tải thư mục đó về,
chép **tất cả file trong thư mục** vào thư mục deploy (ghi đè), rồi `firebase deploy --only hosting`.

| Thư mục | Dùng khi | Khác bản thường |
|---|---|---|
| `thuong/` | Ngày thường (sau Giáng sinh, sau Tết) | — |
| `giangsinh/` | Từ nay tới hết 31/12/2026 | Gấu Noel ở `pos.html`, `PosX.html`, `posgieo.html`, `kiosk.html`; `index.html` = bản Giáng sinh; thêm `gau_noel_giangsinh.v1.js` |
| `tet/` | Tết 2027 (27 Tết → mùng 10) | Lì xì ở `pos.html`, `PosX.html`, `index.html` (bản Tết); thêm `lixi.v1.js`; không Gấu Noel |

Mỗi thư mục có `DANH_SACH.txt` liệt kê file của bộ đó.

## Đổi mùa

- **Vào Giáng sinh**: chép `giangsinh/` → deploy. Bật chương trình ở pos › Quản lý › Gấu Noel khi muốn chạy.
- **Hết Giáng sinh** (sau 31/12): pos › Quản lý › Gấu Noel → TẮT → xoá dữ liệu (mã 2512) → chép `thuong/` → deploy.
  Lần deploy SAU đó mới xoá `gau_noel_giangsinh.v1.js` khỏi thư mục deploy.
- **Vào Tết**: chép `tet/` → deploy.
- **Hết Tết** (sau mùng 10): pos › Quản lý › Lì xì 2027 → xoá dữ liệu (mã 3367) → chép `thuong/` → deploy.
  Lần deploy SAU đó mới xoá `lixi.v1.js`.

**Không xoá** các file `.js` bản cũ đang có trong thư mục deploy (`unit_engine.v1…v17.js`, `data_access.v1…v8.js`, `cham_cong.v1/v2.js`…):
máy còn giữ bản HTML cũ trong bộ nhớ đệm vẫn xin các file đó.

## Không sửa tay trong thư mục này

**Không tự đồng bộ.** File gốc nằm ở gốc repo (`pos.html`, `PosX.html`, `posgieo.html`, `kiosk.html`, `index.html`…).
Thư mục này chỉ được cập nhật khi chạy lệnh sinh lại — sửa file gốc mà không chạy thì các bộ ở đây vẫn là bản CŨ.

**Sau MỌI lần sửa file gốc** (người hay Claude, phiên nào cũng vậy):

```sh
sh tools/sinh_lai_tat_ca.sh
```

Lệnh này sinh lại theo đúng thứ tự: bản Giáng sinh (`index_giangsinh.html`) → bản Tết (`*_tet.html`) → bản thử (`*_thu.html`)
→ 3 bộ ở đây, rồi chạy toàn bộ test. Sau đó commit CẢ file gốc lẫn các file sinh ra.
`tests/bo_deploy.test.js` (cùng `giangsinh.test.js`, `tet.test.js`) báo lỗi nếu quên sinh lại.

Quy tắc này cũng ghi trong `CLAUDE.md` (quy tắc 7) — phiên làm việc mới của Claude đọc file đó trước.
