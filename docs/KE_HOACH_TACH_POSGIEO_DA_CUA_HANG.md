# Kế hoạch tách posgieo.html — đa cửa hàng và ba phiên bản theo mùa

- Lập: 25/10/2026 (giờ Việt Nam). **Bản rà soát 3** (25/10) — đối chiếu từng khẳng định với code thật và `firebase.json` thật của Hosting do chủ dự án gửi.
- Nguồn đã rà: `Thecafe33/gieo`, nhánh `Phan-tach-unit-engine`, HEAD `c859965` (= `0bd95a7` + tài liệu này). Commit gần nhất sửa `posgieo.html`: `6d8f947`.
- Trạng thái: **kế hoạch; chưa tách code, chưa sửa công cụ, chưa deploy**. Kế hoạch này nằm NGOÀI `KE_HOACH_UNIT_ENGINE_DA_CUA_HANG.md` → chủ dự án duyệt riêng; khi bắt đầu ghi một dòng vào `CLAUDE.md` + `docs/TRANG_THAI.md`.
- **Bản đang chạy ở cửa hàng (chủ dự án 25/10): bản mới nhất của mùa Giáng sinh** = `ban_deploy/giangsinh/` tại `0bd95a7` (commit cuối sửa bộ này). Trong đó `posgieo.html` giống hệt file gốc tại `6d8f947`, nạp `data_access.v9.js`, `unit_engine.v21.js` (chủ dự án xác nhận cửa hàng dùng engine v21), `gau_noel_giangsinh.v2.js` (data-quan="gieo"), `gieo_automation_pos.v3.js`, `unit_engine2_v1.js`, `unit_engine2_store_v1.js`, `gieo_engine2_pos_v1.js`. **Đây là mốc nền** cho mọi so sánh trước/sau; mọi JS trong danh sách này coi là đã phát hành (không sửa nội dung).
- Mùa đang chạy là Giáng sinh → biến thể posgieo **có Gấu Noel** là biến thể kiểm trước tiên; file giao cho chủ dự án lấy từ `ban_deploy/giangsinh/` (mục 1.4).
- Trước khi làm: cập nhật HEAD, đọc các commit phát sinh sau `c859965`; nếu có commit sửa `posgieo.html` sau `6d8f947` mà chưa deploy thì mốc nền vẫn là `6d8f947`, ghi rõ phần chênh.

## 0. Quyết định đã chốt

| # | Quyết định | Nguồn |
| --- | --- | --- |
| Q1 | JS mới tách từ POS Gieo nằm ở `js/posgieo/` — **cùng đường trong repo, trong `ban_deploy/<mùa>/` và trên Hosting** | Chủ dự án + rà soát 3 |
| Q2 | Tên file `ten.vN.js` (dấu chấm, như `unit_engine.v21.js`), không dùng kiểu `_v1.js` | Rà soát 3 |
| Q3 | **Không tạo ZIP.** Mỗi lần giao chỉ đưa các file thay đổi, kèm đường đích đầy đủ | Chủ dự án 25/10 |
| Q4 | Hosting: `"public": "public"`, không có `rewrites` (xem mục 1) | `firebase.json` chủ dự án gửi 25/10 |
| Q5 | Bootstrap (tạo Firebase, cài chế độ thử, đọc binding, `GieoData.install`) ở lại inline trong HTML suốt Đợt 0–1 | Rà soát 2 |
| Q6 | Chỉ JS **riêng POS Gieo** vào `js/posgieo/`; thư viện dùng chung và bridge đã phát hành giữ nguyên ở gốc | Rà soát 2–3 |

## 1. Hosting thật và cách giao file

### 1.1. `firebase.json` hiện hành (chủ dự án gửi 25/10)

Máy chủ dự án có **hai nơi tách biệt** (chủ dự án giải thích 25/10):

```text
~/  (thư mục home của Termux)            ← Cloud Functions: dự án firebase riêng,
  <thư mục functions>/                       codebase gieo-automation… — kế hoạch này KHÔNG đụng

/sdcard/<thư mục deploy hosting>/        ← nơi chạy `firebase deploy --only hosting`
  firebase.json                          ← file chủ dự án gửi (KHÔNG nằm trong public/)
  public/                                ← Firebase upload nội dung thư mục này
    posgieo.html
    unit_engine.v21.js ...               (các JS hiện có, phẳng ở gốc)
    js/posgieo/...                       (MỚI — sau khi tách)
```

Đọc từ file thật:

| Mục | Giá trị | Hệ quả cho việc tách |
| --- | --- | --- |
| `public` | `public` | Đích chép là `public/js/posgieo/` — không phải `js/posgieo/` cạnh `firebase.json` |
| `rewrites` | không có | File JS thiếu → 404 thật (không bị trả HTML thay JS). Vẫn phải kiểm, vì sau này có thể thêm rewrite |
| `ignore` | `firebase.json`, `**/.*`, `**/node_modules/**` | `js/` được upload bình thường |
| headers immutable | chỉ `/unit_engine.v*.js` | `data_access`, `lai_lo`, engine 2, `che_do_thu` đang theo mặc định của Firebase (mẫu `tools/firebase_headers_gieogieo.json` chưa được chép hết — **ngoài phạm vi, chỉ ghi nhận**) |
| headers no-cache | `/@(posgieo\|quanlygieo).html` | `posgieo_thu.html` chưa có no-cache → máy thử có thể thấy bản mới trễ |
| `/sw_gieogieo.js` | no-cache | File không tồn tại (đã loại PWA) — vô hại, không đụng |
| `functions` | khai báo codebase `default`, `source: functions` | Không dùng: Functions thật (gồm `gieo-automation`) nằm ở thư mục home Termux, deploy riêng. Lệnh `--only hosting` không đụng phần này. Kế hoạch không sửa mục này |

Hệ quả vì thư mục deploy nằm trên bộ nhớ trong (`/sdcard`, tức `/storage/emulated/0`):

- Termux cần quyền bộ nhớ (`termux-setup-storage`) để chép file và chạy `predeploy_check` trỏ vào đó: `sh tools/predeploy_check.sh /sdcard/<thư mục deploy hosting>/public` (chạy từ thư mục làm việc có `tools/`, `tests/`).
- Bộ nhớ này **không phân biệt hoa/thường** và không có symlink → mọi tên trong `js/posgieo/` viết thường; không có hai đường chỉ khác hoa/thường (T10 kiểm); không dùng symlink trong bộ deploy.

### 1.2. Header cần thêm (chủ dự án tự sửa `firebase.json`, Claude không deploy)

Thêm vào mảng `hosting.headers` (thêm, không thay mảng) **trước lần deploy đầu tiên có `js/posgieo/`**:

```json
{ "source": "/js/posgieo/**", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
{ "source": "/@(posgieo_thu|quanlygieo_thu).html", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }
```

Điều kiện đi kèm immutable (bắt buộc, có test chặn — mục 7, T9): **file đã từng lên Hosting, kể cả chỉ để thử, là đã phát hành → không bao giờ đổi nội dung dưới cùng tên.** Sửa = `ten.v{N+1}.js` + sửa HTML trỏ tới. Nếu chưa muốn thêm header thì vẫn chạy được (Firebase cache mặc định ngắn), chỉ mất lợi ích cache.

### 1.3. URL

HTML dùng đường **tương đối** như các JS hiện có: `<script src="js/posgieo/pos_ui.v1.js"></script>`.

| File trên máy | URL sau deploy |
| --- | --- |
| `public/posgieo.html` | `https://the-cafe-33.web.app/posgieo.html` |
| `public/js/posgieo/pos_ui.v1.js` | `https://the-cafe-33.web.app/js/posgieo/pos_ui.v1.js` |

- Không dùng `/js/...` tuyệt đối: e2e mở `file://` từ gốc repo, đường tương đối mới chạy được ở cả hai nơi.
- **Đã xác nhận (chủ dự án 25/10): APK mở `https://the-cafe-33.web.app/posgieo.html`** — HTML ở gốc site, không dấu `/` cuối; `firebase.json` không có `cleanUrls`/`trailingSlash` → `js/posgieo/x.vN.js` tải từ `https://the-cafe-33.web.app/js/posgieo/x.vN.js`, đúng như các JS gốc hiện tại. Không đổi URL APK. Sau này nếu bật `cleanUrls` (trang thành `/posgieo`) đường tương đối vẫn đúng; nếu bật `trailingSlash: true` thì phải xem lại.

### 1.4. Giao file thay đổi (không ZIP)

- `ban_deploy/{thuong,giangsinh,tet}/` vẫn là BỘ ĐẦY ĐỦ sinh tự động, giữ cây `js/posgieo/`. `DANH_SACH.txt` liệt kê đường tương đối đầy đủ.
- Mỗi lần giao: Claude chạy `node tools/file_thay_doi.js <commit mốc> <mùa>` (tool mới, mục 7, T8) → in danh sách file trong `ban_deploy/<mùa>/` khác so với mốc lần giao trước, mỗi dòng dạng:
  `ban_deploy/thuong/js/posgieo/pos_ui.v1.js  →  public/js/posgieo/pos_ui.v1.js`
- Tin nhắn giao file luôn kèm nguyên danh sách trên. Khi file được gửi lẻ (mất thư mục), đường đích trong danh sách là nguồn đúng — **file trong `js/posgieo/` không được chép phẳng vào `public/`**.
- File cũ trong `public/` không xoá (máy còn HTML cũ trong cache vẫn xin chúng). Không đụng file XOFA / The Cafe 33.
- Bản thử: chỉ giao `*_thu.html` + JS mới nó cần. Vì JS dùng chung tên với app thật, quy tắc 1.2 bảo đảm giao bản thử **không ghi đè** file mà `posgieo.html` thật đang trỏ tới.

## 2. Mục tiêu và giới hạn

Tách theo trách nhiệm, không tách để giảm số dòng. Ưu tiên: thiết bị in/quét, trợ lý, ranh giới mùa; thanh toán, kho, ca làm sau.

1. Một bộ nghiệp vụ chung cho thường / Giáng sinh / Tết.
2. Một phiên POS = đúng một cửa hàng đã gắn; không lẫn đơn, tồn, tiền, ca, cache, việc dở.
3. Tính năng mùa thêm/gỡ độc lập, không chép thuật toán thanh toán/kho.
4. Tận dụng cache JS; lazy-load chỉ khi đo được lợi ích.
5. Chủ dự án vẫn chép file vào `public/` rồi tự deploy như hiện nay.

**Chia file không tự giảm CPU, RAM hay lượt đọc Firebase**; lần mở đầu còn thêm request. Mọi bảo đảm ở đây là điều kiện nghiệm thu, không phải kết quả đã có.

Không làm trong đợt này: đổi schema, chuyển dữ liệu, đổi thuật toán tồn, chính sách quà/tem, xác thực, quy tắc ca; chuyển quán nóng trong trang đang chạy; ES module / bundler / framework; dọn JS dùng chung sang `js/shared/`; chuyển CSS ra file.

Hai loại việc, **không trộn trong cùng commit**: **R** = di chuyển mã, giữ nguyên hành vi; **H** = đổi hành vi (gộp listener, chống đổi binding giữa tab, đổi khóa cache…). H nào là điều kiện cách ly bắt buộc → làm và kiểm riêng trước khi phát hành R.

## 3. Hiện trạng cần bảo toàn

`posgieo.html`: 29.620 dòng, 1.937.024 byte (HEAD `c859965`).

Thứ tự nạp hiện tại (phải giữ):

```text
205–213  SDK Firebase compat 10.13.2, bcryptjs, qrcode-generator (CDN)
215      data_access.v9.js
218      #gdRetry  — thiếu GieoData → document.write nạp lại data_access.v9.js?r=1 (một lần)
219      unit_engine.v21.js
220      #ueRetry  — thiếu UnitEngine → nạp lại unit_engine.v21.js?r=1 (một lần)
...      <script> chính (inline, khối TRẦN đầu tiên — các công cụ lấy khối này làm script chính)
29614    gau_noel_giangsinh.v2.js data-quan="gieo"   (bị gỡ ở bản thường/Tết bằng tools/gau_noel/bo_gau.js)
29615    gieo_automation_pos.v3.js
29616–8  unit_engine2_v1.js, unit_engine2_store_v1.js, gieo_engine2_pos_v1.js
```

Cơ chế đã có, **dùng lại, không làm mới**:

| Cơ chế | Ở đâu | Dùng cho việc tách |
| --- | --- | --- |
| Nạp lại một lần khi thiếu file thiết yếu | `#gdRetry`, `#ueRetry` | Mẫu cho module thiết yếu trong `js/posgieo/` (mục 5.3) |
| Chế độ thử khoá vùng thử | `tao_ban_thu.js` chèn `che_do_thu` trước thẻ engine, chốt trước `initializeApp`, `GieoThu.install` ngay sau `const fstore` | Giữ nguyên điểm chèn (bootstrap inline — Q5) |
| Mã nội dung `?b=` cho bản thử | `tao_ban_thu.js` (engine, che_do_thu) | Mở rộng cho `js/posgieo/*` |
| Giữ JS bản cũ trong bộ deploy | `tao_bo_deploy.js` (từng họ: lai_lo, cham_cong, unit_engine…) | Thay bằng quy tắc chung cho `js/posgieo/` |
| Kiểm thư mục deploy | `predeploy_check.js` | Mở rộng: mọi src cục bộ, header `js/posgieo`, tìm `firebase.json` ở thư mục cha |

Đặc điểm khiến việc tách khó: biến toàn cục nhiều; handler HTML gọi tên hàm; trợ lý/automation/Engine 2/Gấu Noel bọc hàm qua `window[ten]`; lệnh khởi tạo, timer, listener xen giữa khai báo; **143 file test, 44 file đọc `posgieo.html`, 29 file trích hàm bằng `extract`**; e2e tự dựng server.

Hành vi mới phải giữ (commit gần): `6d8f947` trần ly đổi 6 tem; `6be72cc` kiểm hạn đầu ca / chuông / check-out, không hỏi lúc thanh toán; `3124df1`, `fb5ec8b` BTP âm; `282dd00` Engine 2 trên POS; `7f67c97` tiền mua thêm, quà giá 0, ngày VN.

## 4. Hợp đồng đa cửa hàng — bắt buộc

### 4.1. Phạm vi dữ liệu theo `GieoData.REG`

Dùng chung file JS ≠ dùng chung dữ liệu. Không suy phạm vi từ tên module.

| Loại | Ví dụ | Quy tắc |
| --- | --- | --- |
| S | đơn, quỹ, ca, sổ kho, lô, nhận hàng, cấu hình in | GG01 tên cũ; quán khác `__{storeId}` qua lớp dữ liệu |
| C | danh mục NL/BTP theo quán | Không đồng bộ trường tồn (`STATE_FIELDS`) |
| G | cấu hình chung, công thức, nhân viên, menu RT, `receiving_photos_gieogieo` | Chia sẻ có chủ đích, không tự thêm hậu tố |
| X | `customers`, `bank_confirmations`, Gấu Noel | Giữ giao thức chung với XOFA/TC33 |

- Module nhận `db`/`fstore` đã bọc; không tạo client Firebase thứ hai; không tự nối hậu tố; không ánh xạ hai lần.
- POS không bật `catalogMirror`.
- Đường dẫn mới → đăng ký `GieoData.REG` (bản data_access mới) + `check_paths` phải quét được cả file ngoài.
- Ngoại lệ hiện hành, giữ nguyên ở R và ghi trong test: bản thử dùng vùng thử GG01 khi chưa có binding thử; bản thật đã gắn GG01 có fallback khi thiếu data_access; GG02/chưa gắn thì dừng. Đổi fallback = H riêng.

### 4.2. Một phiên — một cửa hàng

- `storeId` cố định trong vòng đời phiên; chưa gắn quán chỉ chạy luồng gắn quán. **Không bao giờ tự gắn quán, không bắt máy đã gắn nhập lại mã.**
- Đổi quán = đăng xuất / đăng nhập / reload như hiện nay; giữ chốt đăng xuất khi còn giỏ, CK chờ, việc dở.
- Mỗi giao dịch chụp scope trước `await`; callback phiên cũ không được cập nhật UI, in, ghi tiếp. Giao dịch đã gửi đối soát trong scope gốc, không retry ở quán mới.

### 4.3. Nhiều tab / WebView cùng máy

Tab khác đổi binding → phát hiện qua `storage` event / khi quay lại foreground → ngừng nhận giao dịch mới, yêu cầu tải lại có kiểm soát. Dọn cache không xoá queue tab khác đang xử lý. (Nếu bản nền chưa có → H riêng.)

### 4.4. Cache, localStorage, queue

Lập bảng kiểm kê từng khóa: phạm vi S/C/G/X/thiết bị, chủ sở hữu, thời hạn, dọn, phục hồi.

- Khóa riêng quán gồm `mode + storeId + loại + tham số`; theo ngày dùng ngày VN.
- Cấu hình in theo quán ≠ hiệu chỉnh máy in theo thiết bị.
- Queue checkout / cân / nhận hàng / mẻ giữ scope gốc; quyền lợi khách giữ billId + chống áp lại.
- Không đổi khóa trong bước R. Cần migration → commit riêng, đọc tương thích, kiểm quay lui. Queue cũ không rõ quán không mặc định GG01.

### 4.5. Listener, timer, bất đồng bộ

Module có tài nguyên sống → `init(context)` / `dispose()` gọi lặp an toàn. Không ép JS đã phát hành đổi API. Lưu đúng hàm khi `off` (bài học chuông 16/10: `off('value')` không kèm hàm gỡ cả listener module khác). Gộp request chỉ trong cùng scope. Rời màn không làm mất phục hồi giao dịch nền.

### 4.6. Định danh, Engine, ngân hàng, ảnh

Giữ mã bill/CK, txId, receipt, marker chống lặp. `bank_confirmations` chỉ khớp đúng mã CK; callback cũ không hoàn tất giỏ mới. Unit Engine vẫn là bên ghi kho duy nhất; module giao diện không ghi kho (`check_boundaries` phải quét được file ngoài). Bridge Engine 2 không đổi chính sách worker / không bật active. Ảnh nhận hàng (G, Storage không bọc) kiểm liên kết phiếu hai quán, không di chuyển ảnh cũ.

### 4.7. Giới hạn

Ánh xạ phía client không phải ranh giới bảo mật; không thay Security Rules, không đổi xác thực.

## 5. Khởi động, vị trí thẻ script và lỗi tải

### 5.1. Vị trí thẻ (chốt)

| Giai đoạn | Nội dung file `js/posgieo/*` | Thẻ đặt ở đâu |
| --- | --- | --- |
| Đợt 0D, 1A (mặc định) | **Chỉ khai báo** (function, hằng không phụ thuộc runtime). Không lệnh tự chạy, không đọc `fstore`/`db`/`POS_STORE`/DOM lúc nạp | Ngay **sau `#ueRetry`, trước `<script>` chính** |
| Khi một cụm buộc phải có lệnh tự chạy | Lệnh tự chạy ở lại inline, gọi vào hàm của file; hoặc file đặt **sau** script chính (cùng nhóm với bridge) và chỉ chạy khi được gọi | Ghi rõ trong manifest lý do |

Lý do:
- Đặt sau script chính → code khởi động của script chính gọi hàm trong file sẽ lỗi `ReferenceError` (hoisting không vượt qua ranh giới file).
- File đặt trước mà tự chạy → `const fstore`, `POS_STORE`… của script chính chưa khai báo (TDZ / chưa có).
- Thẻ đặt trước script chính và sau thẻ engine → `tao_ban_thu.js` vẫn chèn `che_do_thu` trước engine, tức trước mọi module: cách ly bản thử không đổi.
- Không dùng `async`/`defer` cho file phụ thuộc nhau.

Quy tắc khác của bước R:
- `let`/`const`/`class` toàn cục không thành thuộc tính `window`. Hàm mà bridge lấy qua `window[ten]` phải là `function` toàn cục (như hiện nay). Không bọc IIFE làm mất tên bridge cần; không đổi hàng loạt sang `window.*`.
- Mỗi hàm/state **một định nghĩa duy nhất**: chuyển ra file thì xoá khỏi inline (test T6 chặn trùng).
- Không đồng thời đổi scope, tên hàm, thuật toán và thời điểm init trong cùng commit.

### 5.2. Bridge/hook

`gieo_automation_pos.v3.js`, `gieo_engine2_pos_v1.js` tự gắn lúc DOMContentLoaded (hoặc ngay nếu DOM sẵn sàng), lấy hàm từ `window`; Engine 2 còn đọc thẳng `POS_STORE`.
- Hàm đích phải tồn tại trước lúc bridge gắn → file chứa hàm đích nạp trước bridge (thoả mãn với vị trí 5.1).
- Giữ thứ tự bọc: trợ lý → automation → Engine 2 → Gấu Noel; giữ giá trị trả về, Promise, lỗi, `this`.
- Không khai báo lại / gán lại hàm gốc sau khi đã bị bọc.
- Assertion "hook đã gắn" chứ không chỉ "bridge tồn tại"; test cả DOM đang tải / đã tải, auth nhanh / chậm.
- Không sửa bridge đã phát hành; cần đổi → bản mới theo quy tắc phiên bản.

### 5.3. Lỗi tải

Module thiết yếu dùng lại mẫu `#gdRetry`/`#ueRetry`:

```html
<script src="js/posgieo/pos_ui.v1.js"></script>
<script id="pgUiRetry">if(!(window.PosGieoMods&&PosGieoMods.ui)){document.write('<scr'+'ipt src="js/posgieo/pos_ui.v1.js?r=1"><\/scr'+'ipt>');}</script>
```

- Dòng **cuối** mỗi file đặt dấu `(window.PosGieoMods=window.PosGieoMods||{}).<tên>=true;` → dấu chỉ có khi cả file chạy hết (không dùng `onload` làm bằng chứng).
- Nạp lại chỉ đúng khi file **không tải được** (chưa khai báo gì). File đã chạy dở rồi lỗi thì không nạp lại (khai báo `let/const/class` lần hai sẽ lỗi) → script chính kiểm `PosGieoMods` của các module thiết yếu trước khi mở bán; thiếu → màn lỗi + nút tải lại trang, handler ghi dữ liệu không chạy.
- Lỗi đọc dữ liệu / auth giữ nguyên fallback bản nền. Module mùa lỗi → chỉ tính năng đó tắt, không tự cấp quyền lợi.
- Không làm hot-reload module.

## 6. Thư mục và bản đồ module

### 6.1. Cấu trúc (chốt — Q1, Q2, Q6)

```text
gốc repo  (≡ ban_deploy/<mùa>/  ≡  public/ trên máy chủ dự án)
├── posgieo.html, posgieo_thu.html, quanlygieo.html, pos.html, PosX.html, ...
├── js/
│   └── posgieo/
│       ├── pos_ui.v1.js
│       ├── pos_printer.v1.js
│       └── ...           (chỉ tạo khi đến đợt tương ứng)
├── data_access.v9.js, unit_engine.v21.js, ...        # dùng chung — giữ URL cũ
├── gieo_automation_pos.v3.js, gieo_engine2_pos_v1.js # bridge đã phát hành — giữ ở gốc
└── gau_noel_giangsinh.v2.js                          # dùng chung 5 app — giữ ở gốc
```

**Không vào `js/posgieo/`:**

| Loại | Ví dụ | Lý do |
| --- | --- | --- |
| Hàm có bản chép y ở app khác, có test đối chiếu | `vnDate` (5 app) và mọi hàm có test «chép y» đối chiếu nhiều app (liệt kê ở 0B) | Test đối chiếu đọc từ HTML; `tests/lib/extract.js` tự lấy `vnDate` từ HTML khi hàm được trích có dùng nó |
| JS đã phát hành / dùng chung | engine, data_access, bridge, cham_cong, gau_noel, lixi | URL cũ đang được máy cache xin; immutable |
| Bootstrap | tạo Firebase, cài thử, binding | Q5 |
| CSS, HTML khung | — | Ngoài phạm vi; e2e đang lấy `<style>` từ HTML |

Không tạo thư mục theo cửa hàng hay theo mùa. Thư mục phân biệt chủ sở hữu mã, không phải cách ly dữ liệu.

### 6.2. Bản đồ module dự kiến

Tên dự kiến (tương đối với `js/posgieo/`), chỉ tạo khi tới đợt:

| Nhóm | File | Trách nhiệm |
| --- | --- | --- |
| Nền | `pos_ui`, `pos_data` (`pos_bootstrap` chỉ sau khi Q5 được gỡ có nghiệm thu) | Hộp thoại/chuyển màn, cache dùng chung |
| Thiết bị | `pos_printer`, `pos_scanner` | In/quét, kết nối, watchdog |
| Trợ lý | `pos_assist` | Gợi ý, giữ hook cũ |
| Kho | `pos_stock_ui`, `pos_receiving` | Form, tem, kiểm kê, phiếu/ảnh — gọi Engine |
| Chế biến/hạn | `pos_prep`, `pos_expiry` | Mẻ/cân, kiểm hạn đầu ca/chuông/check-out |
| Ca/quỹ | `pos_shift`, `pos_shift_closing`, `pos_cashfund` | Check-in/out, kết ca, quỹ |
| Bán | `pos_cart`, `pos_catalog_admin` | Giỏ, size/topping, sửa danh mục |
| Khách | `pos_customers`, `pos_loyalty` | Tra khách, tem/quà |
| Thanh toán | `pos_checkout`, `pos_payment` | Ghi đơn, TM/CK |
| Sau bán | `pos_orders`, `pos_reports` | Mua thêm, huỷ, lịch sử |

Mỗi state một chủ sở hữu; không file nào giữ bản sao cart, cache nhân viên, danh mục, client SDK.

## 7. Thay đổi công cụ — làm ở bước 0C, TRƯỚC khi có file đầu tiên trong `js/posgieo/`

Bảng dưới đây là hiện trạng đã đọc trong code. Mỗi dòng có một test "cài lỗi" chứng minh công cụ bắt được.

| # | File | Hiện trạng | Sửa | Test chặn |
| --- | --- | --- | --- | --- |
| T1 | `tools/tao_bo_deploy.js` `jsCuaApp` | Regex `[A-Za-z0-9_.-]+\.js` **không có `/`** → bỏ qua `js/posgieo/x.js` **im lặng**, bộ deploy thiếu file mà test vẫn xanh | Nhận đường tương đối có `/` (cả trong `document.write`), chặn `..`/tuyệt đối/`http`; khóa theo đường đầy đủ, không basename | Fixture HTML có `src="js/posgieo/a.v1.js"` → phải có trong bộ; thiếu file → throw |
| T2 | `tao_bo_deploy.js` ghi file | `writeFileSync(path.join(dir,f))` không tạo thư mục cha | `mkdirSync(dirname, {recursive:true})` | Bộ sinh ra có `js/posgieo/…` |
| T3 | `tao_bo_deploy.js` giữ bản cũ | Một regex cho mỗi họ | Quy tắc chung: mọi `js/posgieo/*.vN.js` có trong repo đều vào bộ (bản cũ cho máy còn cache HTML cũ) | Có `a.v1.js` + `a.v2.js`, HTML trỏ v2 → bộ có cả hai |
| T4 | `tools/tao_ban_thu.js` | `?b=<hash>` chỉ cho engine/che_do_thu; xuất sang thư mục khác chỉ chép `unit_engine/che_do_thu/data_access` | Thêm `?b=` cho mọi `js/posgieo/*` trong bản thử; chép cả cây `js/posgieo/` khi xuất ra ngoài | Bản thử có `?b=` cho mọi thẻ `js/posgieo`; xuất ra thư mục trống đủ file |
| T5 | `tools/tao_ban_dem.js` | Chỉ chép `unit_engine/data_access` | Chép cả cây `js/posgieo/` | Như T4 |
| T6 | `tests/lib/extract.js` (`scriptsOf`) + `core_loader.js`, `wrap_harness.js` | Chỉ đọc `<script>` inline; `wrap_harness` chọn data_access **số cao nhất trên đĩa** | Bộ đọc nguồn chung: inline + các `src` cục bộ theo thứ tự HTML, giữ xuất xứ file/dòng; resolver theo đúng bản HTML ghim. Kiểm **một định nghĩa duy nhất** cho mỗi hàm toàn cục | Hàm chuyển ra file vẫn `extract` được; cùng hàm ở inline + file → fail |
| T7 | `check_boundaries.js`, `check_paths.js`, `ast_inventory.js`, `free_idents.js`, `kiem_tra_xuyen_app.js` | Chỉ quét `<script>` TRẦN trong HTML → **code chuyển ra ngoài thoát rào ranh giới engine và rào đường dẫn** | Dùng bộ đọc nguồn T6; nhãn POS/QL theo HTML nạp file (không theo tên file); `boundary_allow.json`/`paths_allow.json` giữ khóa `POS:tenHam` | Cài một lệnh ghi `stock_transactions_gieogieo` và một đường chưa đăng ký vào file `js/posgieo` giả → hai checker fail |
| T8 | `tools/file_thay_doi.js` (mới) | Chưa có | `node tools/file_thay_doi.js <commit mốc> <mùa>` → danh sách file đổi trong `ban_deploy/<mùa>/` + đường đích `public/…` (mục 1.4) | Test với hai commit giả |
| T9 | `tools/js_da_phat_hanh.json` + `tests/js_bat_bien.test.js` (mới) | Bất biến file đã phát hành chỉ là quy ước | Ghi `{đường: sha256}` khi file `js/posgieo` được giao lần đầu; test fail nếu nội dung đổi dưới cùng tên | Sửa 1 byte file đã ghi → fail |
| T10 | `tools/predeploy_check.js` | Chỉ kiểm tồn tại engine/data_access/che_do_thu; tìm `firebase.json` **trong thư mục deploy** — nhưng thật ra nó nằm ở thư mục **cha** của `public/` → hiện chạy trên `public` sẽ báo thiếu firebase.json | Tìm `firebase.json` ở `<deploy>` hoặc `<deploy>/..`, kiểm `hosting.public` trỏ đúng `<deploy>`; kiểm MỌI src cục bộ (cả `document.write`) tồn tại; có `js/posgieo` → kiểm header `/js/posgieo/**`; có `rewrites` `**` → nhắc nguy cơ HTML thay JS; báo lỗi nếu hai đường chỉ khác hoa/thường hoặc tên trong `js/posgieo` có chữ hoa (bộ nhớ `/sdcard` không phân biệt) | Fixture `public/` + firebase.json ở cha |
| T11 | `tools/firebase_headers_gieogieo.json` | Không có mục `js/posgieo` | Thêm hai mục ở 1.2 | `predeploy_check` đọc mẫu |
| T12 | Server e2e (`tools/btp_am/e2e_btp_am.js` dùng `path.basename(u.pathname)`, và các e2e tự dựng server khác) | Đường `js/posgieo/x.js` bị phục vụ nhầm file gốc hoặc 404 | Helper server chung trong `tests/lib/`: phục vụ đúng đường tương đối, chặn thoát thư mục, MIME `text/javascript` | e2e tải `js/posgieo/…` thật |
| T13 | `tests/bo_deploy.test.js`, `gau_noel.test.js` | Kiểm theo tên file phẳng | Kiểm bộ có đủ cây, checksum lõi `js/posgieo` giống nhau ở ba bộ | — |

Không cần sửa: `tools/automation/build_page.js` / `sync.js` (quanlygieo2 và worker không nạp `js/posgieo`); `tao_ban_giangsinh.js`, `tao_ban_tet.js` (không sinh từ posgieo).

## 8. Ba bộ theo mùa

`posgieo` thực tế chỉ có **2 biến thể**: Giáng sinh (có thẻ Gấu Noel) và thường = Tết (`boGauNoel(posgieo.html)`). Lì xì không có ở POS Gieo.

| Thành phần | Thường | Giáng sinh | Tết |
| --- | --- | --- | --- |
| `js/posgieo/*` | giống hệt | giống hệt | giống hệt (checksum) |
| Gấu Noel | gỡ | nạp | gỡ |
| Quán / thật-thử | theo binding / cách ly | như trên | như trên |

- Ba bộ sinh tự động (`sh tools/sinh_lai_tat_ca.sh`), không sửa tay; JS lõi cùng release có checksum giống nhau.
- Một nguồn danh sách module duy nhất: HTML gốc (thẻ script). Bộ deploy, test, resolver đều dò từ đó — không giữ danh sách tay thứ hai.
- Lazy-load (nếu Đợt 5 làm): URL/version ghim của chính release, không "latest", không tải nhầm mùa, không init hai lần.

## 9. Lộ trình

### Đợt 0 — Hàng rào

| Bước | Sản phẩm | Điều kiện đi tiếp |
| --- | --- | --- |
| 0A | Đúng nhánh/SHA; chạy `sh tests/run_all.sh` + `check_boundaries` + `check_paths`, lưu kết quả nền và lỗi đã có. Mốc nền = `ban_deploy/giangsinh` @ `0bd95a7` (đã xác nhận), URL APK đã xác nhận (1.3); lưu bản sao bộ giangsinh nền để đối chiếu | Biết rõ nền; có câu trả lời |
| 0B | Bảng: global/state/caller/handler HTML-native/lệnh tự chạy/thời điểm sẵn sàng cho các cụm của Đợt 1; bảng khóa cache/queue (4.4) | Mọi cụm sắp chuyển có chủ sở hữu, không vòng phụ thuộc chưa xử lý |
| 0C | T1–T13 (mục 7), mỗi mục một commit nhỏ, kèm test cài lỗi | Toàn bộ test xanh; cài lỗi trong file `js/posgieo` giả làm đúng checker fail; bộ deploy / bản thử / bản đo giữ cây `js/posgieo` |
| 0D | Thử đường đi: chuyển **một cụm hàm thuần nhỏ** chỉ POS dùng, đã có test, không Firebase/native/hook (ứng viên chọn ở 0B, ví dụ `escHtmlPos` + helper định dạng — `escHtmlPos` có 8 file test trích) vào `js/posgieo/pos_ui.v1.js`, thẻ theo 5.1 + dấu/nạp lại theo 5.3 | Test trích được hàm từ file; HTML + JS chạy thật qua HTTP (e2e) và `file://`; bản thử có `?b=`; ba bộ có file; hành vi giống nền |
| 0E | Chốt hợp đồng khởi động/lỗi tải (5.3) bằng test: thiếu file, file lỗi giữa chừng, bấm sớm, mạng chậm; các H cách ly bắt buộc phát hiện ở 0B làm commit riêng | Đạt hết trước khi mở rộng |

0D thất bại → sửa công cụ/ranh giới, không tách cụm lớn.

### Đợt 1 — Thiết bị, trợ lý, mùa

Tiểu đợt, mỗi tiểu đợt một điểm quay lui: (1A) trợ lý hoặc cụm độc lập 0B chứng minh, một module/lần; (1B) kết nối in/quét, gọi tạo nội dung tem qua adapter; (1C) nội dung tem kho/BTP khi rõ phụ thuộc — được giữ inline tới Đợt 2; (1D) kiểm hook theo mùa. `POSPrinter`, `POSTemPrinter` là `const` toàn cục → giữ đúng kiểu truy cập của caller. `syncPrinterLayoutFromCloud` gọi trước và sau auth → gộp là H riêng. Đổi reconnect/timer/hook là commit sau commit chuyển mã.

**Qua đợt:** APK/browser in-quét đúng, không listener/hook trùng, không dùng cấu hình in của quán khác. **Có thể dừng ở đây.**

### Đợt 2 — Kho, nhận hàng, chế biến, hạn dùng
Giữ đơn vị nhận hàng, FIFO, cân mù, retry; Unit Engine vẫn là bên ghi. Hạn dùng ở đầu ca / chuông / check-out, không thêm vào thanh toán. **Qua:** snapshot + log ghi trước/sau giống nền; thao tác ở A không đổi S/C của B.

### Đợt 3 — Ca, kết ca, quỹ
Một bộ điều phối thứ tự kết ca. Kiểm qua nửa đêm VN, nhiều máy/quán, tab cũ, callback muộn.

### Đợt 4 — Giỏ, khách, thanh toán, sau bán
Làm sau cùng; giữ thứ tự ghi, idempotency, queue. **Qua:** retry không trùng bill/tiêu hao/quyền lợi; CK của A không hoàn tất đơn B.

### Đợt 5 — Tối ưu có đo (tuỳ chọn)
Đo trước: thời gian tới lúc bán được, mở màn, lượt đọc/ghi, listener, RAM. Lazy-load báo cáo/quản trị nếu có số. Danh sách khách đổi sang tải theo nhu cầu = việc riêng.

## 10. Nghiệm thu

Firebase giả (`tests/lib/fakefb.js` — xác nhận hỗ trợ đúng transaction/listener/query cần dùng; thiếu thì bổ sung, không coi mock bỏ qua là đạt) hoặc vùng thử. Không thử lỗi trên giao dịch thật.

Ma trận nền: **2 biến thể posgieo × thật/thử × GG01 / GG02 / GG03 / chưa gắn** (GG03 bắt hardcode GG02).

| Kịch bản | Đạt khi |
| --- | --- |
| GG01 bán / kho / ca | Đường cũ giữ nguyên |
| GG02, GG03 | S/C đúng hậu tố, không chạm quán khác |
| Hai quán cùng itemId/ngày/staffId | Không gộp cache/request/ca/tồn — **hai context độc lập cùng backend giả**, dữ liệu mồi trùng ID khác giá trị |
| Hai máy cùng quán, retry, mất ACK, reload | Đúng một lần, đúng quán/bill gốc |
| Chưa gắn / thiếu data_access | Không tự chọn GG01 (fallback GG01 thật kiểm riêng) |
| Tab khác đổi binding; callback/scan trả muộn | Không áp vào phiên/quán mới, không mất queue |
| CK của A đến khi đang mở B | Không xác nhận đơn B |
| Bản thử thiếu che_do_thu | Dừng trước mọi truy cập |
| Mở/đóng màn 20 lần | Không tăng listener/timer/hook |
| Thiếu / lỗi giữa chừng / sai version file `js/posgieo` thiết yếu | Nạp lại 1 lần (5.3); vẫn thiếu → màn lỗi, không ghi nửa chừng |
| Bộ `ban_deploy/<mùa>` phục vụ qua HTTP từ thư mục trống | Mọi `js/posgieo/…` 200, MIME JS, không phụ thuộc file sót |
| Mở bằng `file://` từ gốc repo | Tải được `js/posgieo/…` |
| HTML cũ sau release mới | JS bản cũ vẫn có (T3) |
| File đã phát hành bị sửa | T9 fail |
| Đổi mùa | Binding/dữ liệu/queue giữ đúng |

Đối chiếu trước–sau theo SHA nền: cùng seed/đồng hồ/kịch bản, so tiền, trường bill, đường đọc/ghi, kho, marker, queue; chỉ chuẩn hoá timestamp/ID ngẫu nhiên đã liệt kê. Không hứa "đúng một lần" cho giấy in khi mất phản hồi native.

| Tiêu chí | Ngưỡng |
| --- | --- |
| Dữ liệu | 0 sai khác ngoài danh sách H |
| Cách ly | 0 đọc/ghi S/C ngoài scope |
| Nguồn/bộ deploy | 0 hàm trùng định nghĩa; 0 file thiếu; checksum lõi giống ở 3 bộ |
| Lượt Firebase (R) | Không tăng so với nền |
| Hiệu năng | Đo cold/warm cùng máy, trung vị; ngưỡng chốt trước khi sửa |
| Thiết bị | APK + in/quét thật trước khi báo sẵn sàng |

Thiếu thiết bị/số đo → ghi "chưa nghiệm thu phần này".

Mỗi lần sửa: `sh tools/sinh_lai_tat_ca.sh` (đã gồm test), `node tools/check_boundaries.js`, `node tools/check_paths.js`, `node --check` từng file `js/posgieo`. Chủ dự án trước deploy: `sh tools/predeploy_check.sh /sdcard/<thư mục deploy hosting>/public`.

## 11. Phát hành và quay lui

- Commit chuyển mã (R) tách khỏi commit đổi hành vi (H). Mỗi lần giao ghi: danh sách file đổi (T8), kết quả test, phần chưa kiểm.
- Quay lui = chép lại HTML cũ; JS cũ vẫn còn trên Hosting (không xoá). Schema queue/storage đọc tương thích hai chiều.
- Tab cũ có thể chạy song song tab mới sau deploy: kiểm marker/queue tương thích, không ép reload giữa giao dịch.
- Sinh lại cùng nguồn → cùng file (trừ metadata đã khai). Rà diff các app dùng chung (quanlygieo, quanlygieo2, TC33, XOFA): chỉ thay đổi có giải thích.
- Thử hai quán ở vùng thử; chủ dự án quyết định deploy, chọn lúc không có giao dịch dở, theo dõi một chu kỳ mở ca → bán → in/quét → kết ca → mở lại. Chưa có quán thứ hai thật → ghi "đa quán mới chứng minh trên fixture/vùng thử".

## 12. Bảng theo dõi

| Đợt | Trạng thái | Commit | Bằng chứng |
| --- | --- | --- | --- |
| 0A Nền | Chưa làm | — | Kết quả test nền trên `0bd95a7` / biến thể Giáng sinh |
| 0B Bản đồ phụ thuộc | Chưa làm | — | Bảng global/caller/cache |
| 0C Công cụ T1–T13 | Chưa làm | — | Test cài lỗi |
| 0D Thử `pos_ui.v1.js` | Chưa làm | — | e2e HTTP + file://, ba bộ |
| 0E Hợp đồng lỗi tải | Chưa làm | — | Test thiếu/lỗi file |
| 1 Thiết bị/trợ lý/mùa | Chưa làm | — | APK, listener, checksum |
| 2 Kho | Chưa làm | — | Snapshot/log, cách ly S/C |
| 3 Ca/quỹ | Chưa làm | — | Tiền, ngày VN |
| 4 Thanh toán | Chưa làm | — | TM/CK/huỷ/mất ACK |
| 5 Tối ưu | Chưa làm | — | Số đo trước–sau |

Điều kiện hoàn thành mỗi đợt:

- [ ] Hành vi giữ nguyên so với nền (ngoài H đã duyệt).
- [ ] Mọi công cụ/test quét được file `js/posgieo` (T6, T7).
- [ ] Cache/queue/tác vụ có phạm vi và chủ sở hữu.
- [ ] 0 truy cập S/C ngoài quán.
- [ ] Thật/thử cách ly; ba bộ đủ file, cây `js/posgieo` không bị trải phẳng.
- [ ] File đã phát hành không đổi (T9); danh sách file giao có đường đích `public/…`.
- [ ] Không listener/timer/hook trùng.
- [ ] Có bằng chứng test, giới hạn, cách quay lui.

## 13. Lịch sử rà soát

**Lần 2** (trên `0bd95a7`): giữ bootstrap inline, chia 0A–0E có pilot; quy tắc hoisting / `let-const`; tách bộ đọc AST với bộ thực thi; kiểm bridge DOMContentLoaded; phân loại R/H; ghi rõ ngoại lệ GG01; tách transport in khỏi nội dung tem; test hai context đồng thời; quay lui khi tab cũ/mới chạy cùng.

**Lần 3** (25/10, trên `c859965` + `firebase.json` thật):

| Phát hiện | Điều chỉnh |
| --- | --- |
| Dòng 8 bản cũ ("cấu trúc repo chỉ phục vụ sinh bộ") mâu thuẫn mục 5.1 | Q1: repo ≡ bộ deploy ≡ `public/` |
| Tên file lẫn `.vN` / `_vN` | Q2 |
| Kế hoạch giả định ZIP cả bộ; thực tế chủ dự án nhận file đổi | Q3, mục 1.4, T8 |
| `firebase.json` thật: `public: "public"`, không rewrites, header immutable chỉ cho `unit_engine` | Mục 1.1–1.2, T10, T11 |
| `predeploy_check` tìm `firebase.json` trong thư mục deploy, thật ra nằm ở thư mục cha | T10 |
| `jsCuaApp` bỏ qua im lặng src có `/` | T1 (rủi ro cao nhất) |
| Đã có cơ chế nạp lại `#gdRetry`/`#ueRetry`, bản cũ đề xuất reload trang | Mục 5.3 dùng lại mẫu |
| Chưa chốt vị trí thẻ script | Mục 5.1 |
| `vnDate` và hàm chép đa app nếu chuyển sẽ vỡ test đối chiếu / `extract` | Mục 6.1 bảng "không vào" |
| `tao_ban_thu` chỉ gắn `?b=` cho engine; bản thử dùng chung tên JS với app thật | T4, T9, quy tắc 1.2 |
| Checker chỉ quét `<script>` inline → mã chuyển ra ngoài thoát rào ranh giới | T6, T7 |
| e2e phục vụ file theo basename | T12 |
| posgieo Tết = thường | Mục 8, ma trận 10 giảm còn 2 biến thể |
| Cửa hàng chạy bản Giáng sinh mới nhất (chủ dự án 25/10) | Mốc nền `ban_deploy/giangsinh` @ `0bd95a7`; biến thể Gấu Noel kiểm trước |
| URL APK `https://the-cafe-33.web.app/posgieo.html` (chủ dự án 25/10) | Mục 1.3: đường tương đối `js/posgieo/…` đúng |
| Functions ở home Termux, Hosting ở `/sdcard` (chủ dự án 25/10) | Mục 1.1: không đụng functions; quyền bộ nhớ Termux; tên viết thường, không symlink (T10) |

**Khuyến nghị bắt đầu:** 0A → 0E, rồi Đợt 1. Không đặt mục tiêu tách hết.
