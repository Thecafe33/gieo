# Kế hoạch code — Quay trúng gấu Giáng sinh 2026 (3 quán)

Bản kế hoạch, **chưa code**. Kịch bản tỉ lệ + kho gấu đã chốt ở trang mô phỏng (artifact "Quay trúng gấu Giáng sinh"). Làm theo khuôn **lì xì Tết 2027** (`lixi.v1.js`, `tools/tet/`, `docs/LIXI_TET_2027.md`): một lõi dùng chung + phần gắn từng app + test.

## 1. Luồng

```
Khách order, nhập SĐT tích điểm (3 quán)
  → POS thanh toán xong: BỐC THĂM NGAY trên máy quán (1 giao dịch Firestore: hồ sơ khách + kho quán)
      tính số lượt (mỗi 2 ly tính tiền = 1 lượt, tối đa 3) → mỗi lượt: 5 yếu tố → trúng / trượt, trừ kho, sinh mã nhận
  → khách thấy QR tĩnh → the-cafe-33.web.app (index bản Giáng sinh)
        XOFA: ảnh QR trên màn hình phụ (slide kiosk, không cần code)
        Gieo: QR in cuối bill
        The cafe 33: QR hiện ngay trên POS sau khi thanh toán
  → index: đăng nhập SĐT → popup "Bạn có N lượt quay gấu" → quay = MỞ kết quả đã bốc → trúng thì thẻ gấu dưới thẻ thành viên
  → khách tới đúng quán đã trúng → nhân viên nhập SĐT → khung "Gấu của khách" → bấm Đổi quà → mã hết hiệu lực
```

**Vì sao bốc thăm ở POS, không ở app khách:** rules Firebase hiện "đã đăng nhập = toàn quyền"; bốc thăm trên máy khách thì người rành kỹ thuật ép được kết quả (lì xì chấp nhận vì quà 5–15K; gấu là hàng thật, có kho). Bốc ở POS lúc thanh toán: kết quả và kho nằm cùng một giao dịch trên máy của quán, app khách chỉ hiển thị. Với khách, cảm giác quay vẫn y như vậy (giống thẻ cào: kết quả có sẵn, cào mới thấy).

## 2. Dữ liệu (Firestore, riêng, không đụng `customers`)

| Chỗ | Nội dung |
|---|---|
| `gau_noel_2026/{sđt}` | `streak` (lượt trượt liên tiếp), `acc` (lãi gộp tích luỹ từ lần trúng trước), `luot.{id}` = `{store, bill, at, ly, tienNuoc, band, kho, win, mau, code, opened, openedAt}`, `qua.{code}` = `{store, mau, at, used, usedAt, usedBy, usedBill}` |
| `gau_noel_2026_kho/{store}` | trần từng kho × từng chặng (từ mô phỏng), số đã phát, số gấu thật của quán (`tong`) |
| `gau_noel_2026_kho/_cfg` | tỉ lệ 5 yếu tố, ngày (bắt đầu, mở màn, 15/12, 23–25/12, hạn nhận), giá vốn % từng quán, giá gấu |

- Mã nhận: `GAU` + 5 ký tự ngẫu nhiên (bỏ chữ dễ nhầm 0/O, 1/I). Một mã một con, dùng một lần (giao dịch).
- Ngày giờ theo **giờ máy chủ** (`.info/serverTimeOffset`) như lì xì.
- Giao dịch mỗi đơn có SĐT: đọc 2 doc + ghi 2 doc. App khách: 1 lần đọc khi mở app (chỉ trong đợt) + nghe doc của mình khi đang mở; kho 3 quán đọc khi khách mở thẻ gấu.
- posgieo ghi qua lớp đường dẫn: đăng ký 2 collection vào `GieoData.REG` loại **G** (dùng chung, giữ nguyên tên) — `data_access` bản mới nhất; nếu v8 đã deploy thì tạo **v9**.

## 3. Lõi dùng chung trong `gau_noel_giangsinh.v1.js` (như `lixi.v1.js`)

- Hàm thuần (test được, không Firebase): `soLuot(ly)`, `bandOf(tienNuoc/lượt)`, `pTurn(...)` = số ly × giá đơn × lịch sử SĐT × ngày/giờ × kho (trần 60%), `chacTrung(streak, acc, ngày)`, `chang(ngày)` (mở màn / tuần / 15–22/12 / 23 / 24 / 25), `conKho(kho, chặng)`, `heSoKho(đã phát, kế hoạch)`, `maNhan()`.
- Giao dịch: `boc(store, sđt, bill)` (POS, sau khi đơn lưu), `mo(sđt, id)` (app khách), `doi(store, sđt, code, nhânViên)` (POS), `huyBill(store, sđt, bill)` (POS huỷ / xoá bill: trả kho + trả chuỗi nếu quà chưa nhận; đã nhận thì gắn cờ cho Quản lý).
- Thống kê + nhập kho + xoá dữ liệu sau đợt (mã xác nhận như lì xì).
- Sửa sau khi deploy = `gau_noel.v2.js`.

## 4. Phần gắn từng app

| App | Việc | Ghi chú |
|---|---|---|
| **PosX.html** (XOFA) | sau `_loyaltyAfterSave` → `boc`; khung "Gấu của khách" khi nhập SĐT (`#cuph`) → Đổi quà; huỷ bill → `huyBill` | ly tính tiền: bỏ Food, ly 0đ. QR: tải ảnh QR lên slide kiosk ở màn "Màn hình phụ" có sẵn |
| **posgieo.html** | sau khi đơn lưu + `loyaltyAddStamps` → `boc`; khối QR + "Quét để quay gấu · N lượt" cuối bill (`buildReceiptContent`, vẽ bằng thư viện QR đã nạp); khung Đổi quà; huỷ bill | qua `GieoData` (lớp đường dẫn); chạy lại `tools/tao_ban_thu.js` |
| **pos.html** (The cafe 33) | sau `_pushPaidOrder` (cả luồng bed `finalizeBedCheckIn`) → `boc`; **bill bed trên 160K (không tính ăn vặt) = trúng chắc**; popup QR to trên POS sau thanh toán (đưa khách quét); khung Đổi quà; huỷ bill | chạy lại `tools/tao_ban_tet.js` (pos_tet mang theo, tự tắt sau đợt) |
| **index_giangsinh.html** | popup "Có N lượt quay" + vòng quay mở kết quả; thẻ gấu dưới thẻ thành viên (quán nhận, mã to, hạn nhận, "Đã nhận"); thanh chuông + chi tiêu tích luỹ; số gấu còn tuần này / hôm nay | chèn qua `tools/tao_ban_giangsinh.js` (không sửa tay) |
| **pos.html → Quản lý → «Gấu Noel»** | kho từng quán × từng kho × chặng (đã phát / còn), số gấu thật từng quán, thống kê lượt / trúng / đã nhận, cờ bất thường, xoá hết dữ liệu | đọc khi bấm, không nghe thường trực |

Code trong 3 POS **tự tắt ngoài đợt** (đọc ngày máy chủ): trước ngày bắt đầu và sau hạn nhận không đọc / ghi gì.

## 5. Giai đoạn

| GĐ | Việc | Kiểm tra |
|---|---|---|
| 0 | Chốt các câu hỏi mục 6; số bill thật 30 ngày TC33 / XOFA → chạy lại mô phỏng → số kho chốt | — |
| 1 | `gau_noel_giangsinh.v1.js` (hàm thuần + giao dịch) | `tests/gau_noel.test.js`: 20 kịch bản ở trang mô phỏng thành điều kiện test; trần kho không bao giờ vượt; chắc trúng cần đủ lượt **và** đủ lãi; 2 máy cùng đổi 1 mã → máy sau báo lỗi (Firestore giả `tests/lib/fakefb.js`) |
| 2 | Gắn 3 POS: bốc thăm sau thanh toán, Đổi quà, huỷ bill, QR (Gieo in bill, TC33 popup) | test trình duyệt như `tools/tet/e2e/` (thanh toán thật → có lượt → đổi quà); `sh tests/run_all.sh`, ranh giới, đường dẫn |
| 3 | index_giangsinh: popup quay, thẻ gấu, chuông, tủ gấu | test `giangsinh.test.js` (ngoài phần chèn chỉ khác màu) + e2e đăng nhập SĐT có lượt |
| 4 | manage tab Gấu Noel | test hàm tổng hợp |
| 5 | Chạy thử toàn luồng ở chế độ thử (`posgieo_thu`, dữ liệu `__test`) + hướng dẫn deploy | chủ dự án tự deploy |

## 6. Chủ dự án đã chốt (16/10/2026)

1. Khách chỉ cần mua để có lượt, quay lúc nào là việc của khách → giữ **bốc ở POS lúc thanh toán**, app khách mở kết quả bất cứ lúc nào tới hạn nhận (ngày mua quyết định tỉ lệ: mua 23–25/12 hưởng ×3).
2. Hạn nhận **31/12/2026**; gấu chưa nhận quay về kho.
3. **Một file riêng `gau_noel_giangsinh.v1.js`** (lõi + phần gắn) — 3 POS và index_giangsinh cùng nạp, tự bật / tắt theo ngày máy chủ. Hết đợt: pos.html → Quản lý → tab nhỏ **«Gấu Noel»** → xoá hết dữ liệu (mã xác nhận `2512`) → gỡ thẻ `<script>` ở các app. Tab Quản lý này cũng là chỗ nhập kho từng quán + thống kê (không cần tab ở manage.html).
4. `data_access.v8.js` **đã deploy** → posgieo cần **v9** = v8 + đăng ký `gau_noel_2026`, `gau_noel_2026_kho` loại X (dùng chung 3 thương hiệu), posgieo + quanlygieo trỏ v9.
5. Cần nút **«Mở lượt tại quầy»** trên POS cho khách không dùng app; PosX đồng bộ màn này lên màn hình phụ — **chờ file màn hình phụ**.
6. QR XOFA: theo màn hình phụ (chờ file).
7. **Không có mẫu gấu**: trúng = 1 gấu, khách chọn tự do tại quầy (bỏ tủ gấu / tồn từng mẫu).

## 7. Tiến độ

- GĐ1 xong: `gau_noel_giangsinh.v1.js` (lõi: chặng, 5 yếu tố, luật chắc trúng, kho ngẫu nhiên theo chặng + carry Noel + trần cứng `tong` mỗi quán; giao dịch `boc` / `mo` / `quaTaiQuan` / `doi` / `huyBill`; `luuKho` / `docKho` / `thongKe` / `xoaHet`) + `tests/gau_noel.test.js`.
- Mã quán trong dữ liệu: `tc33`, `xofa`, Gieo theo mã quán (`gg01`…). Số kho từng quán nhập ở tab Quản lý (số từ trang mô phỏng — vẫn chờ số bill thật 30 ngày TC33 / XOFA).
- GĐ2 xong (16/10, chủ dự án deploy từ hôm nay): **công tắc bật / tắt** `gau_noel_2026_kho/_cfg` (`bat`, `batDau`) — mặc định TẮT, tab pos.html › Quản lý › «Gấu Noel» (bật/tắt, ngày bắt đầu, kho từng quán, thống kê, xoá mã 2512). Gắn 3 POS bằng 1 thẻ `<script src="gau_noel_giangsinh.v1.js" data-quan="tc33|xofa|gieo">` trước `</body>`, chỉ bọc hàm sẵn có:
  - TC33: `_pushPaidOrder` + `clearDebtAfterPayment` → bốc → popup QR (+ Mở lượt tại quầy); `checkSdtLive` / `resetPhoneInput` → khung Gấu Noel (Đổi quà, Mở lượt). Bed > 160K tính theo TỪNG BILL (giờ bed + nước, bỏ ăn vặt).
  - XOFA: `_loyaltyAfterSave` → bốc; `renderCustomerInfo` / `clearCustomer` → khung; `delOrderConfirm` → huỷ bill. QR màn hình phụ: chờ file (`GauNoel.onManHinh` để nối).
  - Gieo: `assistFinalizeOrder` → bốc; `buildReceiptContent` + `renderReceiptCanvas` → QR cuối bill; khung; huỷ bill. `data_access.v9.js` (posgieo, quanlygieo, manage trỏ v9).
  - Hướng dẫn gỡ sạch: đầu file `gau_noel_giangsinh.v1.js`. Test trình duyệt: `node tools/gau_noel/e2e_gau.js`.
- Tiếp: GĐ3 index_giangsinh (popup quay + thẻ gấu); PosX màn hình phụ khi có file.
