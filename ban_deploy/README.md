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

File gốc nằm ở gốc repo (`pos.html`, `PosX.html`, `posgieo.html`, `kiosk.html`, `index.html`…). Sửa file gốc rồi chạy:

```sh
node tools/tao_ban_giangsinh.js && node tools/tao_ban_tet.js && node tools/tao_ban_thu.js . && node tools/tao_bo_deploy.js
```

`tests/bo_deploy.test.js` báo nếu quên sinh lại.
