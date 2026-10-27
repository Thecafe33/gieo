# Kiểm tra lượt 19 — Đợt 4D-2 + 4D-3 + 4D-4 (khuyến mãi, thanh toán, Tính riêng → `js/posgieo/pos_thanh_toan.v1.js`)

> **Dành cho agent kiểm tra độc lập.** Kế hoạch mục 6.2 + Đợt 4. Chủ dự án 26–27/10: chỉ tách, giữ đúng thao tác → **R thuần**.
> **Gộp 3 tiểu đợt thành MỘT file** theo yêu cầu chủ dự án 27/10 (các file js phải thuộc một nhóm lớn / một nhóm tác vụ liên tục): khuyến mãi / quà / To Go, thanh toán, Tính riêng là một chuỗi liên tục từ «bấm thanh toán» tới «ghi bill».
> **Chủ dự án 27/10: lượt 18 (4D-1) sẽ được kiểm cùng lượt này khi toàn bộ Đợt 4 xong** → báo cáo kiểm lượt 18 + 19 gộp. Chưa deploy, chưa ghi sổ phát hành.

## 1. Chuyển mã (`chuyen.js --dai 4004-4873,7018-7346,7360-7749,7951-8387`, HEAD trước = `80d6d7f`; dải sau chuyển trước)

| Dải `posgieo.html` (trước chuyển) | Nội dung | Tên |
| --- | --- | ---: |
| 4004–4873 | To Go (bật / tắt, cài đặt quà / giảm giá / Free Topping ở màn Quản lý), Bán qua App, Ship, menu quà tặng (bộ lọc dùng chung `giftEligibleQtyPOS`…), Free Topping cho thành viên (popup 2 tầng), `checkTogoBeforeCheckout`, `confirmTogoGift`, `getFinalTotal` / `computeAllDiscounts` | 67 |
| 7018–7346 | màn thanh toán (`updCoTotal`, `renderScCartPreview`, `selM`), VietQR Cake (`genBankOrderId`, popup, xác nhận tay bằng PIN), BANK LISTENER (`startBankListener` / `stopBankListener`), `calcChange` | 23 |
| 7360–7749 | màn tiền mặt (`openCashScreen`, gợi ý mệnh giá, `confirmCashPay`), **`confirmPay`** (ghi bill, idempotency theo bill, trừ kho, tích tem, in bill / tem, mở két) | 12 |
| 7951–8387 | Tính riêng (`openSplitPay`, chia giảm giá theo tỷ lệ, nhóm tiền mặt / chuyển khoản, `finalizeSplitPay`) | 23 |

- **125 tên**, 4 dải, `js/posgieo/pos_thanh_toan.v1.js` (~107 KB; HTML 617.302 → 512.642 byte, `posgieo.html` còn ~8.1k dòng).
- Kiểm (a)–(e) đạt. **1 cảnh báo, đã xem**: `let spSelected = new Set()` — `new` ở giá trị đầu nhưng là `Set` rỗng thuần (không đọc trạng thái máy) → an toàn lúc nạp.
- **Ở lại script chính, đúng chỗ cũ**: state `cart`, `curCustomer`, `curPay`, `togoSettings`, `isAppSale`, `isShip`, `_checkoutIdemKey`, `_posSubmitBusy`, `_bankConfirmMeta`… (khối STATE đầu script — dùng chung với giỏ / kết ca); lệnh tự chạy `document.addEventListener('click', …)` cuối dải Tính riêng (1 lệnh, báo ở «giữ lại»).
- **Không đổi thứ tự ghi / idempotency**: `confirmPay` và `finalizeSplitPay` chuyển nguyên văn (dòng nào cũng như cũ, kể cả nhánh `_backfillMode`, `_ueClaimCheckoutSideEffects`, `loyaltyProcessAfterPay`, `_finalizeStampFreeAfterPay`, `_ueMarkCheckoutSideEffectsDone`).
- HTML: thẻ `js/posgieo/pos_thanh_toan.v1.js` + `#pgThanhToanRetry` sau `#pgCartRetry`; `POS_MODS_THIET_YEU` thêm `thanhtoan`. `e2e_0d` ca (11) thêm file.
- Test đọc thô `posgieo.html`: `sh tools/sinh_lai_tat_ca.sh` TẤT CẢ ĐẠT (151 file test). Hai test phải sửa vì mỏ neo đã chuyển ra file: `ck_tc33.test.js` (`CAKE_ACCOUNT_NO` — nay đọc `maNoi('posgieo.html')`) và `da_cua_hang_b1.test.js` (mỏ neo chèn collection giả: `const CAKE_ACCOUNT_NO` → `const POS_MODS_THIET_YEU`, vẫn ở HTML). `check_boundaries` SẠCH; `check_paths` SẠCH (109 tên, 875 lời gọi, 54 động — không đổi).
- `e2e_0d`, `e2e_ban` (bán thật tới `confirmPay` tiền mặt, giống hệt `0bd95a7`), `e2e_hook` (chuỗi bọc 25 hàm — `updCoTotal` nay nằm trong file này, vẫn đúng chuỗi) **ALL PASS**.

## 2. `e2e_kho.js` — 5 kịch bản 4D-2/3/4

Điều kiện chung: gg01 + gg02, so `0bd95a7`, giờ cố định (`khongGiuGio` — chờ nhiều bước bất đồng bộ), phạm vi quán theo REG, ghim tập bảng. Giỏ mồi: Trà đào M 30.000 + Trà đào L 35.000 + Cà phê M 20.000 = **85.000**.

| Kịch bản | Đường đi | Khẳng định riêng |
| --- | --- | --- |
| `ttTienMat` | `selM('cash')` → màn nhập tiền → `confirmPay(100000, 15000)` | màn `cp`; MỘT đơn TIỀN MẶT 85.000, đưa 100.000 thối 15.000; 3 dòng món + mã bill `#01-26.10.26`; toast «Thanh toán thành công»; giỏ trống |
| `ttChuyenKhoan` | `selM('bank')` → QR → webhook ghi `bank_confirmations/<mã>` (gọi bộ nghe thật của `startBankListener` với snapshot giả) | QR đúng số tiền, nội dung `TTHD <mã>`; MỘT đơn CHUYỂN KHOẢN 85.000 `bankConfirmMethod:'auto'`; **xoá** bản `bank_confirmations` sau khi dùng; popup đóng, giỏ trống |
| `ttChuyenKhoanTay` | `selM('bank')` → nhân viên bấm xác nhận (PIN) → `submitManualBankConfirm` | MỘT đơn CHUYỂN KHOẢN `manual_staff` + `bankConfirmedBy`; popup đóng; giỏ trống |
| `ttTinhRieng` | `openSplitPay` → nhóm 1 (2 phần) tiền mặt → nhóm 2 (1 phần) chuyển khoản qua QR + webhook → `finalizeSplitPay` | 3 phần; nhóm 1 TIỀN MẶT 50.000, nhóm 2 CHUYỂN KHOẢN 35.000 có mã CK + `auto`; MỘT đơn TÍNH RIÊNG 85.000 hai nhóm; giỏ trống |
| `ttGiamGia` | giảm To Go 5.000 → `getFinalTotal` 80.000 → tiền mặt | tổng 80.000, thối 20.000, đơn ghi `discountAmt` 5.000; giảm giá về 0 |

Tự kiểm mới (cài lỗi vào bản sao `pos_thanh_toan.v1.js`, mỗi lỗi phải bị báo lệch đúng mục): lệch tiền thối ghi trên đơn; xoá nhầm node `bank_confirmations`; đổi người xác nhận tay; lệch tiền khách đưa của nhóm Tính riêng; lệch tổng cuối +1 (`getFinalTotal`, mục `sau`).

Ghi chú công cụ (rất quan trọng cho người kiểm):
1. **Firebase giả: RT `.on()` là hàm rỗng** (từ trước). Kịch bản chuyển khoản **giữ hàm nghe** mà `startBankListener` đăng ký rồi gọi với snapshot giả `{exists, val}` — giống webhook ghi vào; phần còn lại của app (xoá bản xác nhận, ghi bill) chạy thật. Không đổi `fb_gia.js` để khỏi ảnh hưởng ~1.350 khẳng định cũ.
2. Vòng chờ `cho()` đếm số vòng, **không đo `Date.now()`** (đồng hồ giả có thể đứng → vòng vô hạn); regex nhận đơn chấp nhận hậu tố quán `orders_gieogieo(__gg02)`.

## 3. Chạy lại

```sh
sh tools/sinh_lai_tat_ca.sh                 # TẤT CẢ ĐẠT
node tools/check_boundaries.js              # RANH GIỚI SẠCH
node tools/check_paths.js                   # ĐƯỜNG DẪN SẠCH (109 tên, 875 lời gọi, 54 động) — không đổi
node tools/tach_posgieo/e2e_kho.js --chi ttTienMat,ttChuyenKhoan,ttChuyenKhoanTay,ttTinhRieng,ttGiamGia
node tools/tach_posgieo/e2e_kho.js          # cả bộ — xem mục 5
node tools/tach_posgieo/e2e_0d.js; node tools/tach_posgieo/e2e_ban.js; node tools/tach_posgieo/e2e_hook.js
```

## 4. Giới hạn

- **Chưa so**: khuyến mãi tặng ly («mua X tặng Y», `confirmTogoGift`) và Free Topping cho thành viên (popup 2 tầng) — chỉ có đường giảm giá; ly đổi tem (`_stampFreeVKey`); món Food trong bill; Bán qua App (`isAppSale`, làm tròn tiền mặt); Ship; chế độ Bổ sung bill thiếu (`_backfillMode`) đi qua `confirmPay`; hàng đợi nợ tích tem khi mất mạng; xác nhận CK **lệch số tiền** / khách chuyển muộn sau khi đóng popup; `confirmPay` bấm hai lần (`_posSubmitBusy`) và khôi phục `idemKey` sau tải lại (`[BUG#18]`).
- In bill / tem, mở két: chạy nhưng thiết bị thật không có (toast «In tem chỉ chạy trong app Android»); chưa kiểm trên APK.
- Firebase giả: `increment` xấp xỉ, `.on()` rỗng (xem 2), không kiểm tranh chấp hai máy cùng một bill.
- Chưa Firebase thật / hai quán đồng thời.

## 5. Kết quả cả bộ `e2e_kho`

(ghi sau khi chạy xong — xem commit)

## 6. Điểm nhờ người kiểm phản biện

1. Gộp khuyến mãi + thanh toán + Tính riêng vào **một** file (107 KB, ~2.9k dòng) có làm lần nạp hoặc lần sửa sau này khó hơn không? (Chủ dự án muốn ít nhóm lớn; vẫn dưới trần ~3.500 dòng.)
2. `getFinalTotal` / `computeAllDiscounts` (dùng khắp giỏ, trợ lý, kết ca) nằm trong `pos_thanh_toan` — thiết yếu đã khai (`thanhtoan`). Có lời gọi **lúc nạp** nào tới 125 tên này từ file nạp **trước** nó (kể cả `onclick` dựng sẵn chạy sớm, hàm bọc của trợ lý / Gấu Noel / automation)?
3. Hai test đã sửa mỏ neo (`ck_tc33`, `da_cua_hang_b1`): sửa có làm yếu việc kiểm hay không?
4. `confirmPay` chạy ở gg02 đúng đường quán (`orders_gieogieo__gg02`, `billCounters_gieogieo__gg02`, `checkout_side_effects_gieogieo__gg02`) — có đủ chưa, hay cần thêm ca có tích tem / ly miễn phí?
