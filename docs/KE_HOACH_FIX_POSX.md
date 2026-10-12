# Kế hoạch sửa lỗi PosX.html (rà ngày 12/10/2026)

File được rà: `PosX.html` do chủ dự án gửi (bản XOLIFA / The Cafe 33, 7.678 dòng). File **không nằm trong repo** và thuộc thương hiệu khác — CLAUDE.md cấm sửa/xoá/di chuyển file của hai thương hiệu đó. Vì vậy mọi bản vá làm trên **bản sao**, giao lại cho chủ dự án; Claude không deploy.

Số dòng dưới đây là dòng trong file đã gửi. Số dòng sẽ trôi, khi làm luôn tìm theo tên hàm.

## 0. Phạm vi và những gì đã loại

Chủ dự án xác nhận 12/10:
- **Ví (wallet) đã bị loại khỏi vận hành** (không phù hợp cơ chế và pháp luật) → bỏ mọi hạng mục sửa logic ví. Riêng lỗi "tiền ví bị xoá khi Đồng giá chạy" biến mất theo, vì chỉ ví mới gán `togoDiscountAmt = walDeduct`.
- **Chuyển khoản vẫn đúng** → bỏ hạng mục mã đơn `DDMMHHmm` trùng phút và đối chiếu số tiền.

Còn lại: khuyến mãi (To Go quà / giảm giá, Đồng giá, phí sàn app, mã giảm giá / voucher, tem miễn phí), tính riêng, báo cáo, vài lỗi khác.

## 1. Nguyên tắc

1. **Mỗi lỗi một test tái hiện trước khi sửa** (đỏ → xanh), theo mẫu `tests/lib/extract.js`: trích hàm thẳng từ HTML, giả lập giỏ. Bốn lỗi đã chạy thử ngày 12/10: phí sàn 0% → 10%, mất ngày đầu của khoảng ngày (múi giờ VN), dòng mã giảm giá tính như 1 ly, ví bị xoá bởi `computeAllDiscounts`.
2. **Một nguồn sự thật cho khuyến mãi**: tổng tiền, nhãn và dữ liệu ghi đơn đều lấy từ cùng một hàm, tính lại từ giỏ hiện tại, không giữ biến trạng thái cũ.
3. **Phản biện trước khi sửa**: trước mỗi hạng mục grep xem đã có cơ chế xử lý chưa. Đổi hành vi nghiệp vụ thì hỏi trước (mục 3).
4. Sau mỗi giai đoạn: tách `<script>` + `node --check`, chạy test. Giao: file vá + bản ghi thay đổi. Không deploy.
5. Mỗi giai đoạn là một lần giao riêng, để chủ dự án thử ngoài quán rồi mới sang giai đoạn sau.

## 2. Các giai đoạn

Cỡ: S = một hàm, M = vài hàm, L = đụng nhiều luồng.

### G1: Nền tảng khuyến mãi (làm trước, nhiều lỗi sau phụ thuộc)

| # | Việc | Cách sửa | Cỡ |
|---|---|---|---|
| 1.1 | Dòng giá âm (mã giảm giá, voucher toàn đơn) và ly tặng bị đếm như "ly" (`getCartTotalQty` L1990, tổng ly của Đồng giá L2140 / L2866 / L3112 / L6048, `drinkCount` tích tem L4727) | Một hàm `cartCupCount()` dùng chung: bỏ dòng `isFree`, `_vKey`, `_discountId`, giá ≤ 0 (và Food, xem câu hỏi Q3). Thay mọi chỗ đếm tại chỗ bằng hàm này | M |
| 1.2 | Tổng tiền lệch giữa các nơi (`getFinalTotal` L2450 không có guard "không cộng dồn" như `computeAllDiscounts` L2457; `togoDiscountAmt` giữ giá trị cũ khi sửa giỏ) | Hàm `computePromo()` tính từ giỏ hiện tại, trả `{dg, togo, app, total}` và chịu trách nhiệm quy tắc loại trừ. `getFinalTotal`, `computeAllDiscounts`, `updFooter`, `updCoTotal`, ghi đơn đều gọi hàm này. `togoDiscountAmt` chỉ còn là kết quả của hàm, không phải trạng thái | L |
| 1.3 | To Go: quà và giảm giá cộng dồn khi bấm Thanh toán lần 2 (L1996) | Quy tắc cố định trong `computePromo()`: giỏ có ly tặng thì không áp giảm giá To Go (đúng thứ tự ưu tiên lần 1). Đếm điều kiện bằng `cartCupCount()` nên ly tặng không tự mở khoá giảm giá | S |
| 1.4 | Ly tặng không gỡ khi bớt món, bấm + tăng được số ly tặng | Dòng `isFree` khoá nút +/−; khi số ly trả tiền < `buyQty` thì tự gỡ ly tặng và báo | S |
| 1.5 | Đồng giá trừ chồng lên dòng voucher mà giỏ không hiện (L2140 so với L2866) | `applyDgDiscount` bỏ dòng `_vKey` / `isFree`, khớp phần hiển thị | S |

### G2: Voucher, mã giảm giá, tem miễn phí

| # | Việc | Cách sửa | Cỡ |
|---|---|---|---|
| 2.1 | Voucher "miễn phí / giảm 1 món" gắn cờ lên dòng gốc nên bấm thêm món hoặc nút + sẽ nhân lên (`openPickCartModal`, `addCart` L2986, `cartAdj` L2939) | Luôn **tách 1 ly** sang dòng riêng `k+'_v'` (kể cả khi qty = 1, dòng gốc chuyển hẳn sang key mới). Dòng `_vKey` khoá +/−, chỉ gỡ qua "gỡ voucher". Nên `addCart` tạo dòng thường mới, không gộp vào dòng voucher | M |
| 2.2 | Upsize áp cho cả dòng nhiều ly; gỡ không trả lại tên và size (L3829) | Upsize cũng tách 1 ly; `removeGiftVoucher` khôi phục `name`, `size` từ `_originalName` / `_originalSize` | S |
| 2.3 | Dòng tách mất `itemId`, `toppings`, `isFood` (voucher `k+'_v'`; `doSplitAndOpen` L5958) | Một hàm `cloneCartLine(c, overrides)` sao chép đủ trường, dùng cho cả hai chỗ tách | S |
| 2.4 | Đóng popup chọn món (✕ hoặc bấm nền) không huỷ trạng thái voucher; `cartDel` / `cartAdj` trên dòng voucher cũng vậy (L3971, L7640) | Hàm `cancelPendingVoucher()` reset `_giftVoucherKey`, `_appliedDiscountId`, `_stampFreePhone`, `_pendingVoucher*`; gọi khi đóng popup chưa chọn và khi dòng `_vKey` bị xoá | M |
| 2.5 | Thanh toán xong vẫn đánh dấu voucher đã dùng / tăng `usedCount` / trừ tem dù giỏ không có dòng voucher (L3991, L4075) | Lớp bảo vệ thứ hai: `_finalizeDiscountAfterPay` và `_finalizeStampFreeAfterPay` chỉ ghi khi **giỏ còn dòng mang đúng `_vKey`** tại thời điểm ghi đơn (chụp trước khi xoá giỏ) | S |
| 2.6 | Race tem: `loyaltyProcessAfterPay` và `_finalizeStampFreeAfterPay` chạy song song; `loyaltyAddStamps` ghi `free_drink_available` tuyệt đối từ bản đọc cũ (L4143) | Chạy **tuần tự** (`await` tích tem rồi mới trừ ly miễn phí) và đổi ghi `free_drink_available` sang `increment`. Chỉ đổi cách ghi, không đổi cấu trúc `customers` (dùng chung XOFA) | M |

### G3: Cài đặt khuyến mãi

| # | Việc | Cách sửa | Cỡ |
|---|---|---|---|
| 3.1 | Phí sàn 0% thành 10% (L1821, 1862, 4660) | Dùng `Number.isFinite(x) ? x : 10` thay `x \|\| 10` ở mọi chỗ. Nhánh đăng nhập dự phòng (L1752) gọi đủ `loadAppFeeSettings`, `loadDiscountCodes` | S |
| 3.2 | `loadTogoSettings` ghi đè cả object; file cũ thiếu `gift.categories` gây lỗi (L1800) | Merge sâu với mặc định | S |
| 3.3 | Nút bật / tắt quà và giảm giá To Go không tự lưu | Gọi `saveTogoSettingsLocal()` (và lưu RT nếu chọn Q2) khi bật / tắt | S |
| 3.4 | Popup quà không có nút bỏ qua; không có món Size M phù hợp thì kẹt (L1533, L2067) | Thêm nút "Không tặng ly này"; nếu danh sách rỗng thì bỏ qua popup. Cần quyết (Q1) | S |
| 3.5 | Màn Đồng giá: `loadDgSettings` bất đồng bộ nhưng `loadDgAdminUI` chạy ngay → form dữ liệu cũ, Lưu ghi đè (L2700) | `loadDgSettings()` trả Promise; render form sau khi có dữ liệu RT | S |
| 3.6 | Đồng giá không chạy khi khung giờ qua nửa đêm (L2117) | `inTime = start <= end ? (h >= start && h < end) : (h >= start \|\| h < end)` | S |
| 3.7 | Đồng giá tính lại theo giờ máy tại thời điểm xác nhận, nên đầu / cuối khung giờ tổng khác với tổng đang hiển thị | Chốt trạng thái "Đồng giá đang áp" khi vào màn thanh toán, giữ đến khi ra khỏi màn. Cần quyết (Q4) | S |
| 3.8 | Đổi To Go ↔ Tại quán khi giỏ đã có món không tính lại giá và topping (L1764) | Giỏ không rỗng: hỏi xác nhận rồi tính lại giá theo menu mới (khớp `itemId` + size; topping theo `price` / `priceTogo`). Cần quyết (Q5) | M |
| 3.9 | Món Đồng giá chọn từ `MENU`, To Go dùng `MENU_TOGO` | Kiểm tra dữ liệu thật: id hai menu có trùng không. Nếu khác id thì khớp theo tên + loại. Việc này cần chủ dự án xem node RT | S |

### G4: Chốt đơn và Tính riêng

| # | Việc | Cách sửa | Cỡ |
|---|---|---|---|
| 4.1 | `confirmPay` không chặn bấm 2 lần (giỏ chỉ xoá sau chuỗi Promise, L4733) → đơn trùng, voucher Bed trùng | Cờ `_payInFlight` bật từ lúc bấm đến khi ghi xong hoặc lỗi; truyền `orderId` cho `grantBedVoucherIfQualified` | S |
| 4.2 | `_actualFinalizeSplitPay` (L6222) thiếu tích tem, finalize voucher, reset trạng thái; thêm đơn thủ công vào `orders` trong khi listener cũng thêm → đơn hiện 2 lần | Tách `afterOrderSaved(order, items, ctx)` dùng chung cho `confirmPay` và Tính riêng (tem, finalize, reset, hiển thị). Bỏ `orders.unshift` thủ công | M |
| 4.3 | Tính riêng tính giá từng ly theo Đồng giá nhưng tổng đơn ghi `getCartTotal()` (L6084 so với L6222) | Theo Q6 | M |

### G5: Báo cáo và các lỗi khác

| # | Việc | Cách sửa | Cỡ |
|---|---|---|---|
| 5.1 | `_ordersInRange` mất ngày đầu ở múi giờ VN (L4804) ✔ đã chạy thử | Parse `YYYY-MM-DD` thành ngày địa phương (`new Date(y, m-1, d)`) | S |
| 5.2 | `openDatePicker` dùng `toISOString()` (UTC), 0–7h sáng lệch 1 ngày (L4775) | Định dạng bằng giờ địa phương | S |
| 5.3 | Xoá đơn không đụng archive; máy khác không thấy đơn bị xoá (L5401, `_attachRtListener` L2528) | Thêm `child_removed`; đơn đã archive thì xoá cả trong `orders_xolifa_archive` | M |
| 5.4 | Archive: chạy trước đăng nhập, lỗi bị nuốt nhưng vẫn ghi `lastCleanup_pos`; `set()` ghi đè doc cũ (L5454, L1733) | Chạy sau `onAuthStateChanged`; chỉ ghi mốc khi không lỗi; `set(..., {merge:true})` | S |
| 5.5 | `onPhoneInput` khai báo 2 lần (L3315 là bản chết) | Xoá bản L3315 | S |
| 5.6 | `Bed voucher` đếm cả Food (L4198) | Theo Q3 | S |

### G6 (tuỳ chọn): gỡ mã ví

Nút ví đã ẩn (`pmwa` `display:none`, L560) nhưng mục sidebar vào `walletScreen` (L486) và ~600 dòng mã ví còn đó, cùng các biến `_walLevel1*` mà `confirmPay` vẫn đọc. Đề xuất làm **sau cùng và riêng**: ẩn lối vào sidebar trước (S); gỡ hẳn mã ví là việc lớn, cần quyết (Q7).

## 3. Quyết định cần chủ dự án (mỗi mục có đề xuất mặc định)

| Q | Câu hỏi | Mặc định |
|---|---|---|
| Q1 | Popup tặng ly To Go có cần nút "Không tặng"? | Có |
| Q2 | Cài đặt quà / giảm giá To Go hiện chỉ lưu trên từng máy. Có đồng bộ lên RT như Đồng giá? | Đồng bộ |
| Q3 | Món Food có tính vào số ly cho: điều kiện tặng / giảm To Go, Đồng giá, tem, voucher Bed? | Không tính |
| Q4 | Đồng giá hết giờ giữa lúc đang thanh toán: giữ giá đã hiển thị cho bill đó? | Giữ (chốt lúc vào màn thanh toán) |
| Q5 | Đổi To Go ↔ Tại quán khi giỏ có món: tính lại giá theo menu mới? | Có, sau khi hỏi xác nhận |
| Q6 | Tính riêng khi có khuyến mãi (Đồng giá, To Go, app, mã): (A) chặn Tính riêng khi bill có khuyến mãi; (B) chia giảm giá theo tỷ lệ cho từng ly | A (đơn giản, không sai tiền) |
| Q7 | Mã ví còn trong file: giữ nguyên chỉ ẩn lối vào, hay gỡ hẳn? | Chỉ ẩn lối vào ở bước này |
| Q8 | Xoá đơn: có cần hoàn tem / voucher đã tích? PIN `3367` đang nằm cứng trong code | Chưa hoàn; chuyển PIN ra cấu hình RT (cần quyết thêm) |

## 4. Ngoài phạm vi (chỉ ghi nhận)

- Email và mật khẩu Firebase nằm cứng trong client (L1745): đổi cơ chế đăng nhập là việc kiến trúc, không sửa trong đợt này.
- Ảnh và slide Đồng giá lưu base64 vào RT `donggia_config`: nên chuyển sang Storage, làm riêng.
- `fetchAllCustomersCache` đọc cả collection `customers` mỗi lần mở (tốn lượt đọc): thuộc kế hoạch tối ưu đọc, không thuộc đợt này.
- Chưa kiểm tra sâu: màn phụ / kiosk, cắt lát menu, quản lý menu, hồ sơ khách.

## 5. Đối chiếu sang `posgieo.html` (sau khi vá PosX)

Gieo Gieo đã bỏ Ví, Đồng giá, voucher; chỉ bán to-go. Chỉ cần soi các lỗi cùng loại có thể còn: đếm ly cho quà / giảm giá (Gieo đã có `giftEligibleQtyPOS`), mất cờ khi tách dòng topping, `confirmPay` chống bấm đôi, race tích tem / dùng ly tem, khoảng ngày theo múi giờ, xoá đơn không đồng bộ giữa máy. Mỗi lỗi tìm thấy sẽ báo riêng và được chủ dự án duyệt trước khi sửa (CLAUDE.md quy tắc 3, 4).

## 6. Giao nhận

- Bản vá đặt ở thư mục riêng `posx/` (ngoài danh sách deploy của Gieo Gieo), không đụng `posgieo*.html`, `quanlygieo*.html`.
- Mỗi giai đoạn: file `PosX` vá + danh sách thay đổi + test + hướng dẫn thử.
- Chủ dự án tự kiểm thử và tự deploy lên host của PosX.
