# Kế hoạch code — Quay trúng gấu Giáng sinh 2026 (3 quán)

Bản kế hoạch, **chưa code**. Kịch bản tỉ lệ + kho gấu đã chốt ở trang mô phỏng (artifact "Quay trúng gấu Giáng sinh"). Làm theo khuôn **lì xì Tết 2027** (`lixi.v1.js`, `tools/tet/`, `docs/LIXI_TET_2027.md`): một lõi dùng chung + phần gắn từng app + test.

## 1. Luồng

```
Khách order, nhập SĐT tích điểm (3 quán)
  → POS thanh toán xong: BỐC THĂM NGAY trên máy quán (1 giao dịch Firestore: hồ sơ khách + kho quán)
      tính số lượt (mỗi 2 ly tính tiền = 1 lượt, tối đa 3) → mỗi lượt: 5 yếu tố → trúng / trượt, trừ kho, chọn mẫu, sinh mã nhận
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
| `gau_noel_2026_kho/{store}` | trần từng kho × từng chặng (từ mô phỏng), số đã phát, tồn từng mẫu gấu, dự phòng |
| `gau_noel_2026_kho/_cfg` | tỉ lệ 5 yếu tố, ngày (bắt đầu, mở màn, 15/12, 23–25/12, hạn nhận), giá vốn % từng quán, giá gấu |

- Mã nhận: `GAU` + 5 ký tự ngẫu nhiên (bỏ chữ dễ nhầm 0/O, 1/I). Một mã một con, dùng một lần (giao dịch).
- Ngày giờ theo **giờ máy chủ** (`.info/serverTimeOffset`) như lì xì.
- Giao dịch mỗi đơn có SĐT: đọc 2 doc + ghi 2 doc. App khách: 1 lần đọc khi mở app (chỉ trong đợt) + nghe doc của mình khi đang mở; kho 3 quán đọc khi khách mở thẻ gấu.
- posgieo ghi qua lớp đường dẫn: đăng ký 2 collection vào `GieoData.REG` loại **G** (dùng chung, giữ nguyên tên) — `data_access` bản mới nhất; nếu v8 đã deploy thì tạo **v9**.

## 3. Lõi dùng chung `gau_noel.v1.js` (như `lixi.v1.js`)

- Hàm thuần (test được, không Firebase): `soLuot(ly)`, `bandOf(tienNuoc/lượt)`, `pTurn(...)` = số ly × giá đơn × lịch sử SĐT × ngày/giờ × kho (trần 60%), `chacTrung(streak, acc, ngày)`, `chanCua(ngày)` (mở màn / tuần / 15–22/12 / 23 / 24 / 25), `conKho(kho, chặng)`, `heSoKho(đã phát, kế hoạch)`, `chonMau(tồn, mẫu khách đã có)`, `maNhan()`.
- Giao dịch: `boc(store, sđt, bill)` (POS, sau khi đơn lưu), `mo(sđt, id)` (app khách), `doi(store, sđt, code, nhânViên)` (POS), `huyBill(store, sđt, bill)` (POS huỷ / xoá bill: trả kho + trả chuỗi nếu quà chưa nhận; đã nhận thì gắn cờ cho Quản lý).
- Thống kê + nhập kho + xoá dữ liệu sau đợt (mã xác nhận như lì xì).
- Sửa sau khi deploy = `gau_noel.v2.js`.

## 4. Phần gắn từng app

| App | Việc | Ghi chú |
|---|---|---|
| **PosX.html** (XOFA) | sau `_loyaltyAfterSave` → `boc`; khung "Gấu của khách" khi nhập SĐT (`#cuph`) → Đổi quà; huỷ bill → `huyBill` | ly tính tiền: bỏ Food, ly 0đ. QR: tải ảnh QR lên slide kiosk ở màn "Màn hình phụ" có sẵn |
| **posgieo.html** | sau khi đơn lưu + `loyaltyAddStamps` → `boc`; khối QR + "Quét để quay gấu · N lượt" cuối bill (`buildReceiptContent`, vẽ bằng thư viện QR đã nạp); khung Đổi quà; huỷ bill | qua `GieoData` (lớp đường dẫn); chạy lại `tools/tao_ban_thu.js` |
| **pos.html** (The cafe 33) | sau `_pushPaidOrder` (cả luồng bed `finalizeBedCheckIn`) → `boc`; **bill bed trên 160K (không tính ăn vặt) = trúng chắc**; popup QR to trên POS sau thanh toán (đưa khách quét); khung Đổi quà; huỷ bill | chạy lại `tools/tao_ban_tet.js` (pos_tet mang theo, tự tắt sau đợt) |
| **index_giangsinh.html** | popup "Có N lượt quay" + vòng quay mở kết quả; thẻ gấu dưới thẻ thành viên (mẫu, quán nhận, mã to, hạn nhận, "Đã nhận"); thanh chuông + chi tiêu tích luỹ; tủ gấu 6 mẫu; số gấu còn tuần này / hôm nay | chèn qua `tools/tao_ban_giangsinh.js` (không sửa tay) |
| **manage.html** | tab "Gấu Noel": kho từng quán × từng kho × chặng (đã phát / còn), nhập gấu thật nhận về theo mẫu, chuyển gấu giữa quán, thống kê lượt / trúng / đã nhận, quà chưa nhận, cờ bất thường, cấu hình tỉ lệ, xoá dữ liệu | đọc khi bấm, không nghe thường trực |

Code trong 3 POS **tự tắt ngoài đợt** (đọc ngày máy chủ): trước ngày bắt đầu và sau hạn nhận không đọc / ghi gì.

## 5. Giai đoạn

| GĐ | Việc | Kiểm tra |
|---|---|---|
| 0 | Chốt các câu hỏi mục 6; số bill thật 30 ngày TC33 / XOFA → chạy lại mô phỏng → số kho chốt | — |
| 1 | `gau_noel.v1.js` (hàm thuần + giao dịch) | `tests/gau_noel.test.js`: 20 kịch bản ở trang mô phỏng thành điều kiện test; trần kho không bao giờ vượt; chắc trúng cần đủ lượt **và** đủ lãi; 2 máy cùng đổi 1 mã → máy sau báo lỗi (Firestore giả `tools/tet/e2e/mockfb.js`) |
| 2 | Gắn 3 POS: bốc thăm sau thanh toán, Đổi quà, huỷ bill, QR (Gieo in bill, TC33 popup) | test trình duyệt như `tools/tet/e2e/` (thanh toán thật → có lượt → đổi quà); `sh tests/run_all.sh`, ranh giới, đường dẫn |
| 3 | index_giangsinh: popup quay, thẻ gấu, chuông, tủ gấu | test `giangsinh.test.js` (ngoài phần chèn chỉ khác màu) + e2e đăng nhập SĐT có lượt |
| 4 | manage tab Gấu Noel | test hàm tổng hợp |
| 5 | Chạy thử toàn luồng ở chế độ thử (`posgieo_thu`, dữ liệu `__test`) + hướng dẫn deploy | chủ dự án tự deploy |

## 6. Cần chủ dự án chốt

1. **Bốc thăm ở POS lúc thanh toán** (đề xuất, an toàn) — app khách chỉ mở kết quả. Hay bốc lúc khách bấm quay trong app?
2. **Hạn nhận gấu**: đề xuất tới hết 31/12/2026. Lượt chưa quay: mở được tới hạn nhận. Quá hạn: gấu chưa nhận trả về kho (dùng cho Tết).
3. **Gắn thẳng vào 3 POS gốc, tự bật / tắt theo ngày** (đề xuất: không phải đổi file khi deploy) hay sinh bản `_giangsinh` riêng như Tết?
4. **`data_access.v8.js` đã deploy chưa?** (đăng ký collection mới vào v8 nếu chưa, v9 nếu rồi.)
5. Khách **không quét QR / không có app**: vẫn có lượt (giữ theo SĐT, mở khi vào app). Có cần nút "Mở lượt tại quầy" trên POS cho khách không dùng app không?
6. XOFA: dùng **ảnh QR làm slide màn hình phụ** (không code) — được không?
7. Mẫu gấu: số mẫu, tên mẫu, ảnh từng mẫu (cho tủ gấu và thẻ gấu).
