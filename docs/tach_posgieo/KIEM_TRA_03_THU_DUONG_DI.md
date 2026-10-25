# Kiểm tra lượt 03 — Bước 0D (bài thử `escHtmlPos` → `js/posgieo/pos_ui.v1.js`) + 0E (chốt lỗi tải, H1)

> **Dành cho agent kiểm tra độc lập.** Kế hoạch: `docs/KE_HOACH_TACH_POSGIEO_DA_CUA_HANG.md` (5.1 vị trí thẻ, 5.3 mẫu nạp lại, 4.3 H1).
> Lượt 02 (`KIEM_TRA_02_CONG_CU.md`) **chưa có kết quả kiểm tra** — chủ dự án cho làm tiếp; lượt này dựa trên công cụ của lượt 02. Nếu lượt 02 phát hiện lỗi công cụ, kiểm lại lượt này sau khi sửa.
> **Đây là lượt ĐẦU TIÊN đổi app thật** (`posgieo.html`). Chưa deploy, chưa ghi sổ phát hành (`--ghi`) — chờ kiểm tra.
> Subagent đã làm hai việc nhẹ: ca test T5 (bản đo) và rà soát test bị ảnh hưởng (chỉ đọc); kết quả đã được kiểm lại khi chạy toàn bộ test.

## 1. Hai commit, tách R / H đúng kế hoạch

| Commit | Loại | Nội dung |
| --- | --- | --- |
| `e102ba4` | **R** (di chuyển mã, không đổi hành vi) | `escHtmlPos` (1 dòng, nguyên văn) → `js/posgieo/pos_ui.v1.js` (dấu `PosGieoMods.ui='dang'` đầu / `=true` cuối, giữa chỉ khai báo). `posgieo.html`: bỏ định nghĩa inline (để lại chú thích trỏ tới file), thêm thẻ ngay sau `#ueRetry` + `#pgUiRetry` (nạp lại một lần khi dấu `undefined`). |
| `bbe5a97` | **H** (đổi hành vi — chỉ khi lỗi / nhiều tab) | (a) Trước chốt "chưa gắn quán": kiểm `PosGieoMods.<tên> === true` cho mọi module trong `POS_MODS_THIET_YEU` — thiếu / chạy dở → màn đỏ `#posModThieu` + Tải lại, `throw` dừng app. (b) **H1**: `posKiemDoiCuaHang` qua sự kiện `storage` + `visibilitychange` — cửa sổ khác đổi `gieo_store_v1` khác `_posBind` lúc mở → phủ `#posStoreDoi` «Máy đã đổi cửa hàng ở cửa sổ khác» + Tải lại. |

**Vì sao chốt module đặt TRƯỚC chốt "chưa gắn quán"** (lệch nhẹ so với ghi chú cũ ở 5.3 "đặt sau"): màn nhập mã quán `posStoreLoginScreen` gọi `escHtmlPos` trong callback hiện tên/địa chỉ quán tìm được → module thiếu thì màn nhập mã cũng hỏng giữa chừng. Đặt trước = dừng sạch với hướng dẫn. Kế hoạch 5.3 sẽ cập nhật theo.

**H1 đặt sau `posLsViecDo`** (không đặt giữa khối `POS_LS_STORE_KEY … posLsViecDo`) vì `tests/da_cua_hang_mo_quan.test.js` cắt văn bản đoạn đó ra chạy riêng — lần đầu chèn vào giữa làm test hỏng (`window is not defined`), đã dời ra sau.

## 2. Chạy lại

```sh
sh tools/sinh_lai_tat_ca.sh                 # => TẤT CẢ ĐẠT (147 file test)
node tools/tach_posgieo/e2e_0d.js           # 15 ca Chromium thật (cần Playwright)
node tools/check_boundaries.js && node tools/check_paths.js
node tools/btp_am/e2e_btp_am.js; node tools/gau_noel/e2e_gau.js   # Gấu Noel: G1–G14 ok; K3 kiosk hỏng như nền
node tools/file_thay_doi.js 0bd95a7 giangsinh
```

## 3. Kết quả

- Toàn bộ test đạt; ranh giới SẠCH; đường dẫn SẠCH (109 tên, 875 lời gọi — không đổi).
- `tests/tach_posgieo_nguon.test.js`: một định nghĩa / tên trên inline + `js/`; `pos_ui.v1.js` đúng tên, đúng hai dấu, chỉ khai báo.
- `tests/bo_deploy.test.js`: ba bộ mùa có `js/posgieo/pos_ui.v1.js`, **giống hệt nhau**.
- **e2e `tools/tach_posgieo/e2e_0d.js`** — `posgieo.html` THẬT trong Chromium, Firebase/CDN giả (không mạng ngoài):

| Ca | Kết quả |
| --- | --- |
| (1) HTTP bình thường, máy chưa gắn quán | `pos_ui.v1.js` nạp 1 lần, `escHtmlPos('<b>&')` = `&lt;b&gt;&amp;`, màn nhập mã hiện, không lỗi JS ngoài `throw` có chủ đích |
| (2) lần đầu 404 | nạp lại đúng 1 lần `?r=1` → chạy |
| (3) lần đầu máy chủ trả HTML thay JS | lỗi cú pháp, chưa khai báo gì → nạp lại → chạy |
| (4) file chạy dở (`'dang'` rồi `throw`) | KHÔNG nạp lại, không lỗi "Identifier has already been declared"; (4b) màn đỏ, không vào màn nhập mã |
| (7) nạp lại cũng 404 | màn đỏ + Tải lại, dừng app |
| (8) H1 hai tab cùng máy | tab B đổi khoá khác → A không phủ; B đổi `gieo_store_v1` gg01 → gg02 → A phủ màn đổi cửa hàng |
| (5) mở bằng `file://` | đường tương đối tải được |
| (6) bản thử `posgieo_thu.html` | nạp `pos_ui.v1.js?b=<10 hex>`, `GieoThu.active` |

- **Thử làm hỏng có chủ đích:** đổi `#pgUiRetry` sang điều kiện sai `ui!==true` → ca (4) FAIL cả hai dòng (có lỗi "already been declared") → e2e bắt được đúng lỗi lượt 01 cảnh báo. Đã trả về.

## 4. File giao cho chủ dự án (CHƯA giao — chờ kiểm tra)

```text
SỬA  ban_deploy/giangsinh/posgieo.html              →  public/posgieo.html
SỬA  ban_deploy/giangsinh/posgieo_thu.html          →  public/posgieo_thu.html
MỚI  ban_deploy/giangsinh/js/posgieo/pos_ui.v1.js   →  public/js/posgieo/pos_ui.v1.js   (giữ thư mục con)
SỬA  ban_deploy/giangsinh/DANH_SACH.txt             →  public/DANH_SACH.txt
```

**Bắt buộc trước khi deploy:** thêm vào `firebase.json` (mảng `hosting.headers`) mục `/js/posgieo/**` immutable (mẫu: `tools/firebase_headers_gieogieo.json`) — `predeploy_check` chặn nếu thiếu. Lúc giao: `node tools/file_thay_doi.js 0bd95a7 giangsinh --ghi` để ghi `pos_ui.v1.js` vào sổ phát hành (từ đó KHÔNG sửa nội dung file này nữa).

## 5. Giới hạn (ghi thật)

- Chưa chạy trên APK / WebView Android thật, chưa thử Termux thật.
- H1: nhánh `visibilitychange` chưa có ca e2e riêng (chỉ thử nhánh `storage`); không chặn native callback (máy quét) — lớp phủ chặn thao tác chạm.
- Firebase giả tối thiểu: chỉ đi tới chốt "chưa gắn quán" / qua chốt ở ca H1; không chạy luồng bán hàng thật trong e2e này (luồng bán đã có e2e/test riêng, không đổi).
- Gấu Noel e2e K3 (`kiosk.html`, XOFA) hỏng từ trước, không liên quan.

## 6. Điểm nhờ người kiểm phản biện

1. Vị trí chốt module TRƯỚC chốt "chưa gắn quán" (mục 1) — đồng ý?
2. H1 so `gieo_store_v1` hiện tại với `_posBind` LÚC MỞ trang (không so `POS_STORE`): bản thử không có binding (`_posBind` null) — tab thử khác bấm "Thử cửa hàng khác" thì tab thử này bị phủ; đúng ý?
3. H1 khi tab KHÁC đăng xuất (xoá khoá) → tab này bị phủ (cur null ≠ gg01). Hợp lý (máy không còn gắn quán) hay nên để tab này bán tiếp?
4. Màn đỏ module thiếu không tự tải lại (khác nhánh thiếu data_access có tự tải lại sau 8 giây khi không phải 404) — có nên tự tải lại?
5. `document.write` của `#pgUiRetry`: Chrome có thể chặn `document.write` script bên thứ ba trên mạng 2G chậm — script CÙNG nguồn không bị chặn; `#gdRetry`/`#ueRetry` đã dùng cùng cách. Đồng ý?
6. Có đường nào trong posgieo chạy `escHtmlPos` TRƯỚC khi thẻ `pos_ui.v1.js` chạy xong (vd thẻ inline đặt trước dòng 224)?
