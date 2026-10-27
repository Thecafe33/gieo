# Kiểm tra lượt 18 — Đợt 4D-1 (giỏ hàng, menu bán, chọn size / topping → `js/posgieo/pos_cart.v1.js`)

> **Dành cho agent kiểm tra độc lập.** Kế hoạch mục 6.2 («Bán: `pos_cart` — giỏ, size / topping») + Đợt 4. Chủ dự án 26/10: chỉ tách, giữ đúng thao tác → **R thuần**.
> Lượt 15–17 đã kiểm ĐẠT (`KET_QUA_KIEM_TRA_15_16_DOC_LAP.md`, `KET_QUA_KIEM_TRA_17_DOC_LAP.md`). Chưa deploy, chưa ghi sổ phát hành.
> **4D chia nhỏ** (chủ dự án yêu cầu làm cẩn thận phần chạm tiền): **4D-1 giỏ (lượt này, chưa chạm thanh toán)** → 4D-2 khuyến mãi / quà / giảm giá (`FREE TOPPING`, `giftMenu`, `getFinalTotal`) → 4D-3 thanh toán (màn thanh toán, VietQR, bank listener, tiền mặt) → 4D-4 `confirmPay` + Tính riêng.

## 1. Chuyển mã (`chuyen.js --dai 7023-7321,8238-8423`, HEAD trước = `f564ce8`; dải sau chuyển trước)

| Dải `posgieo.html` | Nội dung | Tên |
| --- | --- | ---: |
| 7023–7321 | MENU RENDER (`fmtK`, `fmt`, `getCartTotal`, `getQty`, `renderMenu`, `updFooter`), CART DRAWER (`openCartDrawer` / `closeCartDrawer` / `renderCartDrawer`, `cartAdj`, `cartDel`, `cartClear`), SIZE POPUP (`openPO`, `closePO`, `onSize`, `cupSVG`, `addCart`), **`onCheckoutClick`** (bước vào thanh toán: chặn sớm, `idemKey`, hỏi đá, khuyến mãi) | 18 |
| 8238–8423 | Món Food vào giỏ (`addFoodToCart`), tách ly / chọn topping trong giỏ (`openToppingPickerSplit`, `showSplitQtyPopup`, `doSplitAndOpen`), TOPPING CÓ SỐ LƯỢNG (`tpQty`, `tpSum`, `tpLabel`, `tpCount`, `openToppingPicker` / `closeToppingPicker`, `setCartToppingQty`, `addCartTopping`, `removeCartTopping`) | 13 |

- **31 tên**. Kiểm (a)–(e) đạt, **không cảnh báo** (không có `let` giá trị đầu nào trong dải).
- **Ở lại script chính** (đúng chỗ cũ): state `cart`, `curCustomer`, `cartIceDefault`, `_checkoutIdemKey`, `_tpPickerKey`, `_curMenuTab`… (khối STATE đầu script — dùng chung cả khuyến mãi / thanh toán); `getFinalTotal`, `renderFreeTpReminder`, `renderCartIceBar`, `resetDiscountState` (đã ở `pos_customers`), các hàm lưu / xoá đơn chờ thanh toán (khuyến mãi / thanh toán — 4D-2/3).
- `onCheckoutClick` chuyển nguyên văn dù gần thanh toán: nó chỉ là bước vào luồng; thanh toán thật vẫn ở main. Hàm gọi tới (`requireShiftOpened`, `getFinalTotal`, `showScreen`…) đều là hàm gọi lúc chạy, không lúc nạp.
- HTML: thẻ `js/posgieo/pos_cart.v1.js` + `#pgCartRetry` sau `#pgCustomersRetry`; `POS_MODS_THIET_YEU` thêm `cart` (mọi nút món, giỏ, thanh toán, khuyến mãi, trợ lý gọi thẳng). `e2e_0d` ca (11) thêm file.
- Test đọc thô `posgieo.html`: `sh tools/sinh_lai_tat_ca.sh` TẤT CẢ ĐẠT (151 file test). `e2e_hook` (chuỗi bọc 25 hàm của trợ lý / Gấu Noel / automation / Engine 2 so với mốc) **ALL PASS**.

## 2. `e2e_kho.js` — 2 kịch bản 4D-1

Điều kiện chung: gg01 + gg02, so `0bd95a7`, giờ cố định, phạm vi quán theo REG. Giỏ là UI thuần nên cả hai kịch bản **không có lượt ghi** — mốc so là trạng thái giỏ / DOM / toast.

Mồi trong trang: menu To Go 2 món (Trà đào M 30.000 / L 35.000; Cà phê M 20.000), topping Trân châu 7.000 / Thạch 5.000.

| Kịch bản | Đường đi | Khẳng định riêng |
| --- | --- | --- |
| `gioHang` | `renderMenu` → `openPO` (popup 2 size) → `onSize('L')` → `openPO` món 1 size (thêm thẳng) → `cartAdj` ×2 → `openToppingPickerSplit` (hỏi tách 3 nút) → `doSplitAndOpen(1)` → `setCartToppingQty` Trân châu ×2 + Thạch ×1 → `removeCartTopping` → `cartDel` → `cartClear` | số ô menu; popup size + 2 nút; giỏ `m1_L ×1 / m2_M ×1` tổng 55.000; ly ×3 chưa topping → hỏi tách; sau tách `m1_L ×2` + dòng mới `_tp<ms> ×1` topping 19.000; tổng 144.000; bỏ Thạch còn Trân châu ×2; xoá món → 2 dòng; xoá giỏ → 0; không lượt ghi |
| `gioChanSom` | `onCheckoutClick` khi giỏ trống / có món nhưng `_isDayClosedToday` | toast «Giỏ hàng trống!» / «Ngày hôm nay đã đóng ca — không thể tạo bill mới»; vẫn ở màn bán; không ghi |

Tự kiểm mới: bản sao `pos_cart.v1.js` cộng +1 vào tổng giỏ → `gioHang` báo lệch mục `sau` (`TU_KIEM` nay có trường `muc` chọn mục lệch kỳ vọng).

## 3. Chạy lại

```sh
sh tools/sinh_lai_tat_ca.sh                 # TẤT CẢ ĐẠT
node tools/check_boundaries.js              # RANH GIỚI SẠCH
node tools/check_paths.js                   # ĐƯỜNG DẪN SẠCH (109 tên, 875 lời gọi, 54 động) — không đổi
node tools/tach_posgieo/e2e_kho.js --chi gioHang,gioChanSom
node tools/tach_posgieo/e2e_kho.js          # 1357 khẳng định, ALL PASS
node tools/tach_posgieo/e2e_0d.js; node tools/tach_posgieo/e2e_ban.js; node tools/tach_posgieo/e2e_hook.js
```

`e2e_ban` đã đi qua luồng bán thật tới `confirmPay` bằng các hàm giỏ này từ trước (36 khẳng định, ALL PASS sau lượt này).

## 4. Giới hạn

- `onCheckoutClick` chỉ so hai nhánh chặn sớm; các nhánh sau (hỏi đá bắt buộc `_iceAskNext`, `idemKey` khôi phục sau tải lại `[BUG#18]`, mở khuyến mãi / quà, chuyển sang màn thanh toán) phụ thuộc khuyến mãi / thanh toán — nghiệm thu ở 4D-2/3.
- Chưa so: ly đổi tem trong giỏ (`_stampFreeVKey`), dòng đã tặng topping (`freeTpApplied`) tách dòng khi bấm «+», ly miễn phí (`isFree`), món Food (`addFoodToCart`) và `renderMenu` với bộ lọc phân loại / Food / điện thoại; thanh chọn đá (`renderCartIceBar`).
- DOM kiểm ở mức đếm / văn bản chính, không so từng điểm ảnh; không kiểm cuộn / cử chỉ chạm.
- Chưa APK / Firebase thật.

## 5. Kết quả cả bộ `e2e_kho`

51 kịch bản × gg01/gg02 + 23 tự kiểm → **1357 khẳng định, ALL PASS** (1294 cũ + 63 mới; không hồi quy). `muaThem` chạy lại 4 lần liên tiếp đều đạt sau chỉnh công cụ. `check_boundaries` / `check_paths` sạch; `e2e_0d` / `e2e_ban` / `e2e_hook` ALL PASS.

Ghi chú công cụ: ở lần chạy cả bộ đầu, `muaThem · gg02` lệch **1 ms** ở trường `updatedAt` của `prep_items` giữa mốc và bản tách (1.356 khẳng định khác đều đạt). Nguyên nhân: kịch bản chờ nhiều bước bất đồng bộ (trừ kho phần thêm), đồng hồ giả của runner tiến theo thời gian thực nên giá trị giờ có thể chênh vài ms giữa hai bản — **không phải lỗi app**, kịch bản này đã đạt các lần chạy trước. Sửa công cụ: tuỳ chọn `khongGiuGio` cho riêng `muaThem` → vẫn chuẩn hoá giá trị giờ (ngày nghiệp vụ 26/10 vẫn cố định); không nới so sánh cho kịch bản khác.

## 6. Điểm nhờ người kiểm phản biện

1. `onCheckoutClick` (bước vào thanh toán) nằm trong `pos_cart` — chấp nhận, hay nên đi cùng 4D-3 (thanh toán)?
2. `fmt` / `fmtK` (định dạng tiền, dùng khắp app) nằm ở `pos_cart`, giống `todayKey` ở `pos_reports` và `posDateKey` ở `pos_shift`. Giữ hay dời về nền?
3. Có lời gọi **lúc nạp** nào tới 31 tên từ file nạp **trước** `pos_cart` (kể cả `onclick` dựng sẵn chạy sớm, hay hàm bọc ở `pos_assist` / Gấu Noel / automation)?
