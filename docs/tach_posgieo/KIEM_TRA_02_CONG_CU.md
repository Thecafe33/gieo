# Kiểm tra lượt 02 — Bước 0C (sửa công cụ T1–T13)

> **Dành cho agent kiểm tra độc lập.** Kế hoạch: `docs/KE_HOACH_TACH_POSGIEO_DA_CUA_HANG.md` (mục 7 = bảng T1–T13). Lượt trước: `KIEM_TRA_01_NEN_VA_BAN_DO.md` → `KET_QUA_KIEM_TRA_01_DOC_LAP.md` → `PHAN_HOI_KIEM_TRA_01.md`.
> **App không đổi:** `posgieo.html`, `quanlygieo.html` và mọi JS runtime giữ nguyên. Chưa có file nào trong `js/posgieo/`. Thay đổi chỉ ở công cụ, thư viện test, test. Bộ deploy sinh lại chỉ khác `DANH_SACH.txt` (thêm câu "giữ nguyên thư mục con").
> Sau khi chủ dự án gửi kết quả, mới làm 0D (bài thử `escHtmlPos` → `js/posgieo/pos_ui.v1.js`) + 0E.

## 1. Chạy lại

```sh
npm i                                    # một lần (acorn)
sh tools/sinh_lai_tat_ca.sh              # sinh lại + toàn bộ test → "=> TẤT CẢ ĐẠT"
node tests/tach_posgieo_cong_cu.test.js  # 27 ca cài lỗi cho T1–T12
node tests/tach_posgieo_nguon.test.js    # quy tắc nguồn trên repo thật
node tests/js_bat_bien.test.js           # sổ JS đã phát hành
node tools/check_boundaries.js && node tools/check_paths.js
node tools/kiem_tra_xuyen_app.js --assert-clean
# e2e posgieo (cần Chromium/Playwright có sẵn):
node tools/btp_am/e2e_btp_am.js; node tools/kho_fifo/e2e_retry.js; node tools/nhan_hang/e2e_don_vi.js
```

Kết quả tại commit lượt này: **toàn bộ test đạt (147 file)** — kể cả `manage_duyet_gieo` (hỏng từ trước, nay sửa ở T6); ranh giới SẠCH; đường dẫn SẠCH (109 tên, 875 lời gọi — không đổi); `kiem_tra_xuyen_app` 0 lỗi; 3 e2e posgieo đạt (BTP, FIFO 28/28, nhận hàng 80/80) — không còn cần sửa đường Chromium tạm.

## 2. Đã làm theo từng mục

**Nền chung mới — `tools/tach_posgieo/nguon.js` (bộ đọc nguồn):** mã của app = `<script>` TRẦN inline + file JS riêng nạp bằng `<script src="js/…">`, đúng thứ tự HTML, giữ file/dòng. Thư viện gốc (`unit_engine`, `data_access`, bridge, Gấu Noel) **không** tính (check_boundaries coi engine là bên ghi kho hợp lệ). Chú thích HTML ngoài script bị bỏ qua, nội dung script không bị đụng. **Đối chứng:** mã inline đọc ra giống hệt regex cũ trên 7 HTML (posgieo, quanlygieo, manage, pos, PosX, quanlygieo2, posgieo_thu).

| # | File | Đã sửa | Bằng chứng |
| --- | --- | --- | --- |
| T1 | `tools/tao_bo_deploy.js` `jsCuaApp` | Dùng `jsCucBoCua` (nhận `/`, cả `document.write`); đường cục bộ không hợp lệ (`..`, bắt đầu `/`) → **throw** thay vì bỏ qua im lặng | cài lỗi T1 ×2; bộ sinh lại giống cũ (trừ DANH_SACH) |
| T2 | `tao_bo_deploy.js` `ghiBo` | Tạo thư mục cha | cài lỗi T2 |
| T3 | `tao_bo_deploy.js` `banCuCungHo` | Một quy tắc chung: mọi `js/posgieo/<họ>.vN.js` trong repo vào bộ; không lẫn họ khác tên gần giống | cài lỗi T3 |
| T4 | `tools/tao_ban_thu.js` | `?b=<sha1 10 ký tự>` cho mọi `js/…` (thẻ thường + chuỗi nạp lại → `?b=…&r=1`); xuất ra thư mục khác chép cả cây; file thiếu → dừng | 3 ca chạy bản chép của tool trên gốc fixture |
| T5 | `tools/tao_ban_dem.js` | Chép cây `js/…` khi xuất ra ngoài | (đọc mã — chưa có ca riêng, xem mục 4) |
| T6 | `tests/lib/extract.js`, `wrap_harness.js`, `core_loader.js`, `engine_file.js` | `scriptsOf` → bộ đọc nguồn; `extract(…, {vnDate:false})` tắt chèn `vnDate` thật; `wrap_harness` đọc hằng qua bộ đọc nguồn + chọn `data_access` THEO THẺ trong HTML (không lấy số lớn nhất); `engine_file` theo thẻ engine của posgieo; `manage_duyet_gieo` 4 chỗ dùng `{vnDate:false}` | `manage_duyet_gieo` đạt; `tach_posgieo_nguon` kiểm một-định-nghĩa |
| T7 | `check_boundaries.js`, `check_paths.js`, `ast_inventory.js`, `free_idents.js`, `kiem_tra_xuyen_app.js` | Đọc qua bộ đọc nguồn, báo đúng `file:dòng`; nhãn POS/QL theo HTML nạp file; `free_idents` dùng `scope.js`; `kiem_tra_xuyen_app` băm cả `js/…`; thêm biến môi trường `CHECK_BOUNDARIES_ROOT` (như `CHECK_PATHS_ROOT` đã có) để test trên fixture | cài lỗi: lệnh ghi `stock_transactions_gieogieo` + tên bảng chưa đăng ký trong `js/posgieo/xau.v1.js` → cả hai checker FAIL đúng file:dòng; gỡ → sạch. `ast_inventory` ra `inv_ast.json` giống hệt bản cũ |
| T8 | `tools/file_thay_doi.js` (mới) | `node tools/file_thay_doi.js <mốc> [mùa] [--ghi]` → danh sách MỚI/SỬA/BỎ + đường đích `public/…`; file bỏ: "KHÔNG xoá trên máy" | chạy với mốc `0bd95a7`: chỉ `DANH_SACH.txt` |
| T9 | `tools/tach_posgieo/phat_hanh.js`, `tools/js_da_phat_hanh.json`, `tests/js_bat_bien.test.js` | Sổ `{đường: sha256}`; `--ghi` ghi lúc giao; test báo nếu đổi nội dung / xoá | 5 ca cài lỗi |
| T10 | `tools/predeploy_check.js` | `firebase.json` ở thư mục deploy **hoặc thư mục cha** (+ kiểm `public` trỏ đúng); mọi JS cục bộ của app Gieo phải có (cả `js/…`, cả `document.write`); có `js/posgieo` → bắt buộc header immutable `/js/posgieo/**`; `rewrites "**"` → nhắc; tên trong `js/posgieo` viết thường + không hai đường chỉ khác hoa/thường | **Bản cũ chạy trên cấu trúc Hosting thật (firebase.json của chủ dự án + `public/` = bộ Giáng sinh) báo "Không thấy firebase.json" → không deploy được; bản mới đạt.** 6 ca cài lỗi |
| T11 | `tools/firebase_headers_gieogieo.json` | Thêm `/js/posgieo/**` immutable (mục `_thu` no-cache đã có sẵn) | — |
| T12 | `tests/lib/e2e.js` (mới) + 3 e2e posgieo | `chromiumPath()`, `serveFile()` phục vụ đường đầy đủ + chặn thoát thư mục + MIME | 3 ca; 3 e2e đạt |
| T13 | `tests/bo_deploy.test.js` | Liệt kê đệ quy; mọi JS cục bộ HTML trong bộ nạp đều có; DANH_SACH ghi đường đầy đủ; `js/posgieo` giống hệt ở 3 bộ | đạt (0 file `js/posgieo` hiện tại) |

**Test mới:** `tests/tach_posgieo_cong_cu.test.js` (27 ca cài lỗi), `tests/tach_posgieo_nguon.test.js` (một định nghĩa / tên + quy tắc file `js/posgieo`: tên thường `ten.vN.js`, câu đầu `PosGieoMods.x='dang'`, câu cuối `=true`, giữa chỉ khai báo), `tests/js_bat_bien.test.js`.

## 3. Quyết định nhỏ trong lượt (nhờ phản biện)

1. **Chỉ `js/…` là "mã của app"** trong bộ đọc nguồn; JS ở gốc là thư viện. Hệ quả: nếu sau này JS riêng của app lại đặt ở gốc thì checker không thấy. Quy tắc Q1/Q6 cấm việc đó, nhưng chưa có test chặn "JS mới ở gốc" — có cần không?
2. **`jsCuaApp` giờ throw** khi gặp src cục bộ không hợp lệ thay vì bỏ qua. Đã kiểm 7 HTML hiện có không có src kiểu đó. Có HTML nào của XOFA/TC33 trong bộ (pos, PosX, kiosk, index) có thể bị chặn oan sau này?
3. **`predeploy_check` kiểm mọi JS cục bộ chỉ với 7 HTML của Gieo** (không kiểm HTML XOFA/TC33 — ngoài phạm vi, tránh chặn deploy vì file của thương hiệu khác).
4. **Kiểm hoa/thường** chỉ chạy khi thư mục deploy có `js/`; so cả tên file ở gốc thư mục deploy.
5. **`?b=` chỉ ở bản thử**, bản thật dùng tên có version + sổ phát hành (T9). Bản thật không gắn mã nội dung — đúng ý kế hoạch 1.2?

## 4. Giới hạn / chưa làm (ghi thật)

- **T5 bản đo** chưa có ca test riêng (mã ngắn, cùng mẫu T4) — chạy được trên repo thật vì chưa có `js/`.
- **Khoảng 20 file test đọc thô văn bản `posgieo.html`** (regex trên HTML, không qua `extract`), vd `engine_api`, `da_cua_hang_b1/b2/b3`, `gau_noel`, `stamp_free`, `khach_goi_y`, `ck_tc33`. Chúng chưa đọc `js/…`. Không sửa hàng loạt trong lượt này (chưa có mã nào chuyển). **Quy tắc thêm vào kế hoạch:** trước khi chuyển một cụm, grep các test này theo tên trong cụm và chuyển chỗ liên quan sang `maNoi` — nhất là test khẳng định "KHÔNG có X" (sẽ đạt giả khi X đã ra file).
- **e2e của quanlygieo/manage** (`tools/ql_giao_dien/*`) vẫn ghi cứng `/usr/bin/chromium` — ngoài phạm vi posgieo, không sửa.
- `tools/tach_posgieo/ban_do.js` nay cũng đọc qua bộ đọc nguồn (kết quả trên posgieo giống hệt: 0/1528 tên khác).
- Chưa thử trên Termux thật (`/sdcard`) — mô phỏng bằng thư mục tạm có `firebase.json` thật của chủ dự án.

## 5. Điểm nhờ người kiểm phản biện

1. Bộ đọc nguồn có bỏ sót dạng thẻ nào không (`<script type="module">`, `<script defer src>`, `src='…'` nháy đơn, thuộc tính viết hoa)? Hiện chỉ nhận `src="…"` nháy kép — HTML hiện tại đều nháy kép.
2. `jsCucBoCua` dò cả `src=` trong chuỗi JS (`document.write`) — có thể bắt nhầm `src=` của ảnh `.js`? (chỉ nhận đuôi `.js`).
3. T10: so `hosting.public` với thư mục đang kiểm bằng `path.resolve` — đúng khi Termux dùng symlink `~/storage/shared` ↔ `/sdcard`? (có thể cần `fs.realpathSync`).
4. T6: `extract` nay nối cả `js/…` vào chuỗi tìm kiếm — hàm trùng tên giữa inline và file sẽ lấy bản ĐẦU (thứ tự HTML); `tach_posgieo_nguon` chặn trùng — đủ chưa?
5. T9: sổ phát hành chỉ ghi khi chạy `--ghi`. Nếu quên chạy lúc giao file, file đã lên Hosting nhưng không có trong sổ → không được bảo vệ. Có nên ghi tự động khi `tao_bo_deploy` thấy file trong `ban_deploy/` khác bản đã commit?
6. Có công cụ/test nào khác đọc `posgieo.html` theo cách mà bộ đọc nguồn chưa phủ?

## 6. Tệp thay đổi trong lượt

Mới: `tools/tach_posgieo/nguon.js`, `tools/tach_posgieo/phat_hanh.js`, `tools/file_thay_doi.js`, `tools/js_da_phat_hanh.json`, `tests/lib/e2e.js`, `tests/tach_posgieo_cong_cu.test.js`, `tests/tach_posgieo_nguon.test.js`, `tests/js_bat_bien.test.js`, file này.
Sửa: `tools/{tao_bo_deploy,tao_ban_thu,tao_ban_dem,predeploy_check,check_boundaries,check_paths,ast_inventory,free_idents,kiem_tra_xuyen_app}.js`, `tools/predeploy_check.sh` (chú thích), `tools/firebase_headers_gieogieo.json`, `tools/tach_posgieo/ban_do.js`, `tools/{btp_am/e2e_btp_am,kho_fifo/e2e_retry,nhan_hang/e2e_don_vi}.js`, `tests/lib/{extract,wrap_harness,core_loader,engine_file}.js`, `tests/{bo_deploy,manage_duyet_gieo}.test.js`, `ban_deploy/*/DANH_SACH.txt` (sinh lại), kế hoạch, `CLAUDE.md`, `docs/TRANG_THAI.md`.
