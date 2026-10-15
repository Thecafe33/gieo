# Lì xì Tết 2027 (Đinh Mùi) — Bé Gạo phát lì xì

Chủ dự án chốt ngày 16/10/2026. Code: `lixi.v1.js` (lõi dùng chung) + `tools/tao_ban_tet.js` (sinh 3 bản Tết). Test: `tests/lixi.test.js`, `tests/tet.test.js`.

## Lịch (giờ Việt Nam, tính theo GIỜ MÁY CHỦ Firebase — đổi giờ điện thoại không lách được)

Tháng Chạp năm Bính Ngọ chỉ có 29 ngày → **không có 30 Tết**; giao thừa là 29 Tết.

| Mốc | Âm lịch | Dương lịch |
|---|---|---|
| Phát lì xì | 27 Tết → mùng 5 | 3/2 → 10/2/2027 |
| 4 ngày "lộc" (tỉ lệ 80%) | 29 Tết, mùng 1, 2, 3 | 5/2 → 8/2/2027 |
| Mã dùng được | mùng 3 → mùng 10 | 8/2 → 15/2/2027 |
| Hết hạn | từ mùng 11 | từ 16/2/2027 |

## Quy tắc

- **Lượt mở**: mỗi ngày 1 bao miễn phí (không cộng dồn qua ngày). Mỗi đơn ở **XOFA hoặc The cafe 33** có nhập SĐT tích điểm (trong giai đoạn phát) = +1 lượt, **không giới hạn**. Lượt thêm chưa mở hết hạn khi hết mùng 5. Gieo Gieo không cộng lượt (chủ dự án chọn không đụng posgieo).
- **Tỉ lệ trúng**: có mua nước trong 24h (`customers.lastVisit` — cả 3 quán đều ghi khi tích điểm/tem) → 90%. Không mua: 10%, riêng 4 ngày lộc → 80%.
- **Loại quà khi trúng**: upsize XOFA 25% · upsize The cafe 33 25% · giảm 5K đơn XOFA 25% · giảm 10K lịch bed 15% · +1h bed 10%.
- **Điều kiện** (chữ trên mã):
  - **Upsize** — "Upsize lên L miễn phí khi mua M", đúng quán ghi trên mã. Bấm Áp: 1 ly M (món có size L) **đổi thành L** trong giỏ (pha chế thấy đúng size), dòng lì xì trừ phần chênh → khách trả giá M. Giỏ có sẵn ly L thì chỉ trừ phần chênh. Bỏ mã → đúng 1 ly trả về M. XOFA đổi To Go ↔ Tại quán khi đang áp → gỡ mã (giá khác nhau), áp lại.
  - **Giảm 5K** — đơn XOFA từ 30K. **Giảm 10K** — bill có giờ bed ở The cafe 33.
  - **+1h bed** — "Tặng thêm 1 giờ bed cho lịch từ 2 giờ": lịch được **kéo dài thêm 1 giờ** (giờ kết thúc `end` +60 phút) → mọi chỗ kiểm trùng (app khách, POS) thấy đúng giờ mới, khách sau không đặt chồng. Không quá giờ quán nhận bed (`bed_closing_time`), lịch trong mùng 3 → mùng 10.
    - Đặt qua **app khách**: tab Đặt bed hiện khung "Dùng lì xì +1h bed — lịch kết thúc 16:00 thay vì 15:00" (tick bỏ được). Bấm đặt: kiểm trùng + giờ đóng cửa theo khung đã cộng; **giữ mã** (`reserve`) trước khi lưu lịch — mã vừa dùng / giữ chỗ khác thì lịch giữ giờ cũ + báo. Lịch lưu `lixiBed1h = {code, phone, freeMin:60, baseEnd, by:'app'}`. Huỷ lịch → trả mã. Đổi giờ: ô kết thúc hiện giờ khách trả tiền, lưu thì cộng lại 1 giờ. Hết chỗ → gợi ý giờ (đã gồm 1 giờ tặng) → chọn gợi ý thì form về giờ trả tiền.
    - **POS** mở lịch có `lixiBed1h` → tự thêm dòng trừ **giờ cuối** (giá "1h bed từ h5" nếu lịch > 4 giờ) + đọc lại Firebase (mã đã dùng → gỡ). Thanh toán xong ghi `lixiBed1h/used` (mở lại lịch không trừ lần 2).
    - Áp ở **quầy** (lịch tạo không qua app): bấm Áp khi đang tính tiền lịch → lịch kéo dài +1 giờ trên Firebase rồi tính lại giờ bed.
    - Bỏ mã ở POS (✕ / Bỏ / đổi mã khác) → lịch trả về giờ cũ (đặt qua app thì trả mã cho khách).
- **1 bill 1 mã lì xì, 1 mã dùng 1 lần.** Nhân viên bấm chọn mã (không tự áp — trừ +1h bed của lịch đặt qua app). Bấm **Áp** = đọc lại mã trên Firebase (vừa dùng ở máy khác → báo, không trừ). Giỏ đổi làm mã hết điều kiện (xoá ly L, bớt ly dưới 30K, bớt giờ bed…) → tự gỡ + báo; bấm thanh toán cũng kiểm lại lần cuối. Mã chỉ bị đánh dấu "đã dùng" khi thanh toán thành công (transaction — 2 máy cùng dùng 1 mã thì máy sau báo lỗi).
- Huỷ / hoàn đơn sau khi đã cộng lượt: không trừ lại.

## Dữ liệu

Firestore `lixi_tet_2027/{sđt}` — riêng, không đụng `customers`:
`freeDay` (ngày đã mở bao miễn phí), `extra` (lượt thêm còn lại), `earned` (tổng lượt nhờ mua), `opened`, `wins`, `codes.{TETxxxxx}` = `{type, at, day, used, usedAt, usedStore, usedBill, usedAmount, reservedBooking, reservedPath, reservedInfo, reservedAt}` (reserved* = mã +1h bed đang giữ cho 1 lịch). Lịch bed (RT `bedBookings/…`) có thêm `lixiBed1h`.
Lượt đọc: app khách đọc 1 lần khi vào app (chỉ trong giai đoạn phát / dùng); POS đọc 1 lần khi nhập SĐT (chỉ trong giai đoạn dùng, nhớ 60 giây). Ngoài 2 giai đoạn: không đọc / ghi gì.

## Ở đâu

- **App khách `index_tet.html`**: giao diện Tết (đỏ đô + vàng, đèn lồng, hoa mai), Bé Gạo dê (câu chúc có vần, đếm ngày tới mùng 1, nhắc mở lì xì — chạm Bé Gạo khi còn bao là mở popup), thẻ **Túi lì xì Tết 2027** ở tab Tích điểm (trước đợt: đếm ngày; đang phát: số bao + nút Mở lì xì; danh sách mã + trạng thái).
- **`pos_tet.html` (The cafe 33)**: nhập SĐT ở ô tích điểm → khung "🧧 Lì xì của khách · TẾT 2027" dưới khung quà tặng → **Áp** / **Bỏ**. Dòng giỏ: "🧧 Lì xì Tết 2027 · …" (giá âm). Thanh toán xong (kể cả luồng chọn bed) → đánh dấu mã + cộng lượt. Tab **Quản lý → 🧧 Lì xì 2027**: Tải thống kê (đọc cả bảng, chỉ khi bấm) + **Xoá dữ liệu lì xì** (mã xác nhận **3367**; còn trong đợt thì cảnh báo thêm).
- **`PosX_tet.html` (XOFA)**: nhập SĐT → khung lì xì trong thẻ khách → Áp / Bỏ (nút ✕ trong giỏ cũng bỏ được). Không áp chung với mã giảm giá thường. Bill có lì xì không chia bill được (như mọi khuyến mãi). Thanh toán xong → đánh dấu mã + cộng lượt.

## Test

- `node tests/lixi.test.js` — lịch, tỉ lệ, mở bao, cộng lượt, dùng / giữ / trả mã, thống kê, xoá (chỉ cần node, nằm trong `tests/run_all.sh`).
- `node tests/tet.test.js` — 3 bản `_tet` khớp bản gốc hiện tại, chỉ chèn thêm.
- Trình duyệt (cần Playwright): `tools/tet/e2e/` — áp đủ 5 loại mã + thanh toán thật ở pos_tet (43 kịch bản) / PosX_tet (28), đặt bed +1h ở index_tet (27: kéo dài lịch, khách sau bị chặn đúng, hết chỗ, giờ đóng cửa, lịch < 2 giờ, mã giữ chỗ khác, huỷ, đổi giờ). Chạy lại sau mỗi lần sửa pos / PosX / index hoặc phần gắn.

## Deploy (chủ dự án tự làm)

1. Trước 27 Tết (3/2/2027): `node tools/tao_ban_tet.js <thư mục deploy>` (hoặc lấy 3 file `_tet` + `lixi.v1.js` Claude gửi). Trong thư mục deploy: cất 3 bản thường, đổi tên `index_tet.html` → `index.html`, `pos_tet.html` → `pos.html`, `PosX_tet.html` → `PosX.html`; có `lixi.v1.js` cạnh đó. Deploy.
   Có thể deploy sớm (vd. từ Giáng sinh qua): trước 27 Tết app khách chỉ hiện thẻ đếm ngày, POS không đọc gì.
2. Từ mùng 11 (16/2/2027) mã tự hết hạn. Vào **pos → Quản lý → Lì xì 2027 → Xoá dữ liệu lì xì** (mã 3367).
3. Deploy lại 3 bản bình thường (index / pos / PosX). `lixi.v1.js` để lại cũng được (không ai nạp).

Sửa bản gốc trong thời gian chạy bản Tết → chạy lại `node tools/tao_ban_tet.js` (test `tet.test.js` báo nếu quên). Sửa `lixi.v1.js` sau khi đã deploy → tạo `lixi.v2.js` và sửa `LIXI` trong `tools/tao_ban_tet.js`.

## Rủi ro đã chấp nhận

Rules Firebase hiện tại "đã đăng nhập = toàn quyền" và việc bốc thăm chạy trên máy khách → người rành kỹ thuật có thể tự ghi mã. Quà nhỏ (5K–15K) — chủ dự án chấp nhận; lượt mở được chặn bằng transaction (không mở 2 lần một bao), mã lạ (sai dạng `TETxxxxx`) bị bỏ qua.
