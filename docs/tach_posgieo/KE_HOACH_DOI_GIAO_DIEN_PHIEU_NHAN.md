# Kế hoạch đổi giao diện form «Nhận hàng theo đơn» (phiếu nhập) — chuyển sang cuộc trò chuyện khác

> Soạn 29/10/2026, nhánh `Phan-tach-unit-engine`, commit gốc tại thời điểm soạn: `df9571e` + các commit giao file (`4f0a483`, `85c1059`).
> Chủ dự án viết bằng tiếng Việt — **trả lời tiếng Việt**. Đọc `CLAUDE.md` (quy tắc làm việc) trước khi sửa.
> **Chưa sửa mã nào.** Tài liệu này là bàn giao: bối cảnh, bằng chứng, phạm vi sửa, các bước, câu hỏi còn mở.

## 1. Vấn đề chủ dự án báo

Sau khi deploy bộ tách `posgieo` (tối 27/10), khi có **một đơn đặt hàng (PO) tạo từ quanlygieo đang chờ nhận**, bấm vào đơn (ví dụ «Khởi Minh») để mở **form nhận hàng** thì giao diện không giống cái chủ dự án nhớ và muốn:

- Chủ dự án nhớ bản đã sửa «từ những ngày đầu tháng 10»: giao diện form **đồng bộ với giao diện kết ca** (hệ thẻ `kc-*`), thông tin / nút bấm / ghi chú khác, và nhắc tới «button đen».
- Màn **danh sách đơn chờ** (thẻ Khởi Minh, nút hồng «Nhận hàng →», ghi chú «Không được nhập sai») chủ dự án xác nhận **là chuẩn** («cái màu hồng là chuẩn giao diện»).
- Màn **form sau khi bấm «Nhận hàng»** (ảnh chụp 10:35: tiêu đề «Đơn ngày 26 tháng 10», «Theo đơn đặt · 4 dòng», thẻ kem, ô «SỐ CAN TỐT / HỎNG», công tắc «Sai sản phẩm», chip xanh «Nhận 0 Can · +0 g», ô «Ghi chú riêng», nút xác nhận) là chỗ **sai so với kỳ vọng**.

Quyết định của chủ dự án (29/10): **không cần tìm bản cũ**; dựa vào các js đã tách, tìm file cần sửa để đổi giao diện phiếu nhập → làm theo kế hoạch này.

## 2. Kết luận điều tra (đã kiểm — không cần làm lại)

1. **Việc tách KHÔNG làm đổi giao diện.** HTML + CSS ngoài `<script>` của `posgieo.html` giữa bản đã deploy `0bd95a7` và bản tách chỉ khác các thẻ `<script src="js/posgieo/…">` mới thêm. 35 hàm của `pos_receive.v1.js` giống bản gốc (chỉ khác dòng trống). Chụp màn hình thật ở cả hai bản với cùng một PO mẫu (5 mặt hàng) → **giống từng byte** cả danh sách đơn lẫn form.
2. Mã hiện tại **render đúng hai ảnh chủ dự án chụp** (danh sách hồng + form thẻ kem). Nghĩa là form kiểu «thẻ kem / `ds-*`» chính là bản trong repo từ trước.
3. **Điểm lệch thật duy nhất giữa ảnh «trước deploy» (7:43) và mã repo**: ở ảnh 7:43 nút «Nhận hàng tự do (không theo đơn)» **hồng và bấm được** dù còn 1 đơn chờ; mã repo (`renderPoReceiveSelect`, biến `khoaTuDo`) **khoá nút xám 🔒** khi còn đơn chờ («Đang có đơn chờ nhận — nhận hàng theo đơn ở trên»). ⇒ Bản đang chạy trên máy chủ dự án **trước** lần deploy 27/10 **không phải bản trong repo** (có thể là file `posgieo.html` chủ dự án sửa/đưa riêng, chưa vào repo).
4. **Rủi ro cần nhắc lại với chủ dự án**: lần deploy 27/10 đã **ghi đè** file live bằng bản repo → mọi thay đổi riêng của chủ dự án ở `posgieo.html` (không có trong repo) có thể đã mất, không chỉ màn nhận hàng. Đã khuyên: Firebase Console → Hosting → Release history → Rollback về bản ngay trước 27/10, rồi tải `https://the-cafe-33.web.app/posgieo.html` gửi lại để so sánh toàn bộ. Chủ dự án chọn **không tìm bản cũ** — vẫn nên hỏi lại một lần ở cuối việc này xem có còn màn nào khác lệch không.
5. Lịch sử git trong môi trường bị cắt ngắn (clone nông): `posgieo.html` chỉ có 24 commit; toàn bộ file xuất hiện từ `097b9b7` (22/10). Các nhánh cũ (`origin/main` 25/9, `origin/claude/project-thread-pvl1n7` 24/9, `origin/claude/clever-hypatia-yji31n` 27/9…) có **form nhận hàng kiểu cũ hơn** (hàm `poReceiveLineCardHtml` / `renderPoReceiveForm` khác nội dung, **chưa có** `poPendingCardHtml`) — không phải bản chủ dự án muốn; chỉ để tham khảo nếu cần.

## 3. Vị trí cần sửa

### 3.1. JS — `js/posgieo/pos_receive.v1.js` (file DUY NHẤT vẽ màn Nhận hàng)

| Hàm | Dòng (v1) | Vẽ phần nào | Cần đổi? |
| --- | ---: | --- | --- |
| `renderPoReceiveForm` | 482 | khung chung form: nút «‹ Chọn đơn khác», tiêu đề (tên NCC / «Nhận hàng tự do»), dòng «Theo đơn đặt · N dòng», danh sách thẻ, nút «+ Thêm nguyên liệu» (tự do), **ô Ghi chú chung**, **ô PIN**, **nút `ds-cta` «Xác nhận nhận hàng»** | **Có** |
| `poReceiveLineCardHtml` | 426 | thẻ từng mặt hàng: tên, «Đặt: … · đã nhận …», chọn đơn vị (`ds-seg`), ô SỐ TỐT / HỎNG (`ds-qty-box`), công tắc **Sai sản phẩm** (`ds-switch`), chip, **ô ghi chú riêng** (`ds-note-input`) | **Có** |
| `poReceiveStepperHtml` | 466 | nút − / số / + (`ds-stepper`, `ds-stepbtn`, `ds-qtyval`) | Có (nếu đổi kiểu nút) |
| `poReceivePreviewHtml` | 267 | chip xanh «Nhận 0 Gói · +0 g» | Tuỳ |
| `renderPoReceiveSelect` / `poPendingCardHtml` / `poLinePillHtml` | 54 / 88 / 77 | **danh sách đơn chờ — đã đúng chuẩn hồng, KHÔNG sửa** | Không |

Chỉ đổi **cách dựng HTML / class**. **Không đổi logic**: `submitPoReceive`, `poReceiveChangeField`, ghi kho (`poReceiveUpdatePODoc`, `poReceiveMergeRecord`), idempotency, PIN — giữ nguyên, kể cả id / `oninput` / `onclick` mà test e2e gọi.

### 3.2. CSS — `posgieo.html` (không nằm trong js)

- Form đang dùng bộ lớp **`.ds-*`** (≈ dòng 818–860): `.ds-card`, `.ds-cta`, `.ds-seg`, `.ds-qty-box`, `.ds-stepper`, `.ds-stepbtn`, `.ds-switch`, `.ds-note-input`, `.ds-chips`, `.ds-sec-h`… Chỉ `pos_receive.v1.js` dùng `.ds-*` (đã kiểm: các js khác 0 lần).
- Bộ lớp giao diện **kết ca** là **`.kc-*`** (≈ dòng 793–797): `.kc-title`, `.kc-card` (trắng, bo 26px), `.kc-sub` (nền `#FAF8F2`, viền `#F0EAD9`, bo 18px), `.kc-pill`, `.kc-btn` (bo 18px, 16px đậm); cộng `.kc-chk`, `.kc-signer`, `.kc-nav`, `.kc-nav-back`, `.kc-nav-pill`. Dùng ở `pos_shift_closing` (51 chỗ), `pos_expiry`, `pos_handover`.
- Quy tắc `#poReceiveScreen …` hiện có ở ≈ dòng 846–848 (`.ds-seg`, `.ds-qty-box .lbl` cho phép xuống dòng).

## 4. Cách làm (đề xuất)

1. **Tạo `pos_receive.v2.js`** từ v1 (`v1` đã phát hành — sổ `tools/js_da_phat_hanh.json` — **KHÔNG sửa tại chỗ**). Sửa HTML trỏ `pos_receive.v2.js` (thẻ `<script src>` + thẻ nạp lại `#pgReceiveRetry` + đường trong `POS_MODS_THIET_YEU.receive`); khoá module vẫn `receive`, dấu `'dang'` / `true` giữ nguyên.
2. Trong v2 chỉ sửa `renderPoReceiveForm`, `poReceiveLineCardHtml`, `poReceiveStepperHtml` (+ `poReceivePreviewHtml` nếu cần) để dùng hệ **`kc-*`** (đồng bộ kết ca); **giữ nguyên mọi id, `onclick`, `oninput`, tên hàm**.
3. Thêm CSS riêng, **phạm vi hẹp** `#poReceiveScreen …` vào `posgieo.html` (không đổi `.ds-*` toàn cục, không đổi `.kc-*` — kết ca vẫn đang chạy). Nếu cần lớp mới: tiền tố riêng (vd `.rc-*`) để không đụng màn khác.
4. `sh tools/sinh_lai_tat_ca.sh` (quy tắc 7 CLAUDE.md) — sinh lại bản Giáng sinh / Tết / thử + `ban_deploy/`, commit CẢ file sinh ra.
5. Chụp ảnh trước–sau để chủ dự án duyệt **trước khi giao file** (xem 6).
6. Giao file: `node tools/file_thay_doi.js <mốc> giangsinh --ghi` với mốc là commit giao lần trước (`4f0a483` hoặc `85c1059`), chép vào `giao_file/giangsinh/` đúng cấu trúc `public/…`, gửi bằng công cụ gửi file (chủ dự án muốn tải về trực tiếp từ cuộc trò chuyện). Đường dẫn máy chủ dự án: `/sdcard/MyCafeWeb/public/…` (đã xác nhận: `Internal storage > MyCafeWeb > public > js > posgieo`); deploy từ Termux: `cd /sdcard/MyCafeWeb && firebase deploy --only hosting`. **Claude không bao giờ chạy deploy.**

## 5. Kiểm tra bắt buộc sau khi sửa

- `sh tools/sinh_lai_tat_ca.sh` → TẤT CẢ ĐẠT; `node tools/check_boundaries.js`; `node tools/check_paths.js`.
- `node tools/tach_posgieo/e2e_kho.js --chi nhanHang,nhanHangPO` (+ các kịch bản nhận hàng khác trong `KICH_BAN` nếu có) → **lượt ghi kho không đổi so với `0bd95a7`** (đây là thay đổi thuần giao diện; kịch bản so mốc sẽ báo nếu lỡ đổi logic). Chạy cả bộ `node tools/tach_posgieo/e2e_kho.js` ở nền (xoá log cũ trước, chờ dòng `rc=` mới; đừng `git stash` khi đang chạy).
- `node tools/tach_posgieo/e2e_0d.js` (nạp lại module — đường file `pos_receive.v2.js` phải khớp ca (11): file danh sách ở dòng ≈ 88 của `e2e_0d.js` đang ghi `pos_receive.v1.js` → **sửa sang v2**), `e2e_hook.js`, `e2e_ban.js`.
- Chụp màn hình bằng `moTrang` (`tools/tach_posgieo/hai_ban.js`) với PO mẫu (seed `purchase_orders_gieogieo/po1`, gọi `openPoReceiveScreen()` rồi `poSelectPO('po1')`), viewport ≈ 450×1000. Mẫu script dựng PO đã dùng ngày 29/10 (đã xoá): đặt `window.__SEED` có `inventory_items_gieogieo/<id>` và `purchase_orders_gieogieo/po1` {supplier, status:'pending', createdAt, note, lines:[{itemId,name,unit,orderUnitName,orderUnitFactor,qtyExpectedBase,qtyReceivedBase}]}.
- Test đọc thô `posgieo.html` / js (vd `tests/ck_tc33.test.js`, `da_cua_hang_*`) dùng `maNoi('posgieo.html')` — thêm file mới không cần sửa test, nhưng nếu đổi tên file js phải kiểm các test trích hàm (`tests/lib/extract.js`).

## 6. Câu hỏi còn mở — cần chủ dự án chốt TRƯỚC khi code

1. **Màu nút «Xác nhận nhận hàng»**: chủ dự án vừa nhắc «button đen», vừa nói chuẩn là kiểu hồng như kết ca. Đề xuất mặc định: **hồng** như `.kc-btn` kết ca (khớp «cái hồng là chuẩn»). Hỏi lại nếu muốn nút đen.
2. Phần nào của form phải đổi theo ý chủ dự án: tiêu đề / thanh quay lại (kiểu `.kc-nav` + `.kc-nav-pill`?), thẻ từng mặt hàng (`.kc-card`?), ô Ghi chú chung, công tắc «Sai sản phẩm», ô ghi chú riêng, nút ±. Nên hỏi chủ dự án **gửi ảnh bản đúng** (bản «giống kết ca») hoặc mô tả từng chỗ khác.
3. Nút «Nhận hàng tự do» còn đơn chờ: giữ **khoá xám** (hành vi repo từ 22/10) hay **hồng, bấm được** như ảnh 7:43 (đổi hành vi nghiệp vụ → phải hỏi, quy tắc 4 CLAUDE.md).
4. Có màn nào khác trong `posgieo` chủ dự án thấy lệch so với trước lần deploy 27/10 không (xem mục 2.4)?

## 7. Ghi chú vận hành

- Không tạo PR, không deploy. Commit kết thúc bằng hai dòng `Co-Authored-By: Claude … <noreply@anthropic.com>` và `Claude-Session: …` theo nhắc nhở của phiên đang chạy. Đẩy: `git push -u origin Phan-tach-unit-engine`.
- Không ghi mã model ở bất cứ chỗ nào trong repo.
- Phản biện trước khi sửa (quy tắc 2): trước mỗi đổi, tìm cơ chế sẵn có (comment `[FIX]`, `[KHOÁ NHẬN TỰ DO]`, `[BUG#27 FIX]`… trong `pos_receive.v1.js`).
- File ảnh chủ dự án đã gửi (không nằm trong repo): ảnh danh sách đơn chờ có khoanh cam «Không được nhập sai» + «Nhận hàng →» (7:43) và ảnh form «Đơn ngày 26 tháng 10 · Theo đơn đặt · 4 dòng» (10:35). Nếu cuộc trò chuyện mới không có, hỏi chủ dự án gửi lại.
