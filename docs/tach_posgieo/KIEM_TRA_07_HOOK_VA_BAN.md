# Kiểm tra lượt 07 — Đợt 1D (chuỗi bọc hàm theo mùa + bán hàng có trợ lý)

> **Dành cho agent kiểm tra độc lập.** Kế hoạch: `docs/KE_HOACH_TACH_POSGIEO_DA_CUA_HANG.md` mục 5.2 («Test tích hợp phải chụp chuỗi bọc của từng hàm trước/sau tách và so khớp»), 9 (1D). Phản hồi lượt 04/06 hẹn bài «bán hoàn chỉnh có trợ lý + chuỗi hook» ở đây.
> **Lượt này KHÔNG đổi app** (`posgieo.html`, `js/posgieo/*` không đổi so với `d9c353e`) — chỉ thêm công cụ kiểm. Chưa deploy.
> Đối chứng: bộ deploy `ban_deploy/giangsinh` của **`0bd95a7` (bản đang chạy ở cửa hàng, engine v21)** ↔ bộ deploy hiện tại.

## 1. Công cụ mới (`tools/tach_posgieo/`)

| File | Vai trò |
| --- | --- |
| `fb_gia.js` | Firebase / CDN giả dùng chung (tách từ `e2e_0d.js`). Nay **ghi nhớ mọi lượt ghi** vào `window.__ghi` (`set/update/delete/remove/push/add`, `transaction` RT, `batch.*`, `runTransaction` Firestore — chạy thật hàm giao dịch với `tx.get` = đọc rỗng); snapshot RT có `exists()` là HÀM, Firestore là thuộc tính (ref sinh từ `db` mang cờ `rt`). |
| `hai_ban.js` | `dungHaiBan(mốc, mùa)`: `git worktree` tạm của mốc + 2 máy chủ HTTP (bộ deploy mốc / hiện tại), dọn khi xong. `moTrang(b, base, {authNgay, store, canh})`: máy gắn gg01, Firebase giả, auth chậm (không trả) hoặc auth ngay. |
| `e2e_hook.js` | **Chụp chuỗi bọc**: với mọi tên ứng viên (chuỗi định danh trong `gau_noel_giangsinh.v2.js`, `gieo_automation_pos.v3.js`, `gieo_engine2_pos_v1.js`, khối `assistHookIntoPOS`), đi từ `window[tên]` ngược về hàm gốc qua CDP `[[Scopes]]` — biến closure giữ lớp trước: `goc` (trợ lý), `cu` (Gấu Noel), `fn` (automation / Engine 2); bỏ qua scope Global/Script. Mỗi lớp ghi chữ ký mã nguồn (băm + độ dài + đầu đoạn). So mốc ↔ hiện tại: cùng tập hàm bị bọc, cùng chuỗi từng lớp + hàm gốc, cùng cảnh báo «bỏ qua phần gắn», cùng lỗi JS. Hai biến thể auth. |
| `e2e_ban.js` | **Bán hàng so hành vi**: cùng kịch bản trên hai bản — thêm món (4 lần, 2 món, 2 size) → tăng/giảm → topping ×2 → đổi đá → khách quen (`renderCustomerInfo`, bọc trợ lý + Gấu Noel) → `buildReceiptContent` + `renderReceiptCanvas` + `renderTemCanvas` → **`confirmPay` tiền mặt thật** (mã bill transaction, ghi đơn RT, side effect, `assistFinalizeOrder` ghi nhật ký trợ lý). So từng bước: giỏ, tổng, tổng cuối, HTML 3 vùng trợ lý; lệnh in bill; kích thước ảnh bill/tem; **danh sách lượt ghi Firebase (đường dẫn + dữ liệu)** trước và trong thanh toán; trạng thái sau thanh toán; toast; lỗi JS. Chuẩn hoá chỉ giờ thật (ISO / ms / HH:MM) + khoá ngẫu nhiên (`bill_…`, `_new…`). Cổng ca (mở ca / việc đầu ca / check-in) được gán đè GIỐNG NHAU ở hai bản. |

## 2. Kết quả

```text
e2e_hook.js  — A auth chậm / B auth ngay: 23 hàm có bọc, chuỗi GIỐNG HỆT 0bd95a7, 0 cảnh báo bỏ gắn, 0 lỗi JS
  _afterIceChange, addCart, addFoodToCart, assistFinalizeOrder, buildReceiptContent, cartAdj, cartClear, cartDel,
  clearCustomer×2, delOrderConfirm, doSplitAndOpen, onCheckoutClick, openCaLamViecScreen, removeCartTopping,
  renderCartDrawer, renderCustomerInfo×2, renderDailyClosingChecklist×2, renderOpeningChecklist×2, renderReceiptCanvas,
  renderScCartPreview, renderShiftHandoverForm, setCartToppingQty, updCoTotal   (×n = số lớp bọc)
e2e_ban.js   — A / B: mọi mục giống hệt 0bd95a7; thanh toán ghi 5 lượt: transaction billCounters_gieogieo,
  set orders_gieogieo (method TIỀN MẶT), tx.set + set checkout_side_effects_gieogieo, add sales_assist_logs_gieogieo
```
Chạy 3 lần liên tiếp `e2e_ban.js`: ổn định. `e2e_0d.js` (dùng `fb_gia.js` mới) ALL PASS; `sh tests/run_all.sh` TẤT CẢ ĐẠT.

**Thử cài lỗi** (sửa tạm `ban_deploy/giangsinh`, đã trả lại — `git status` sạch):
- `e2e_hook`: bỏ `boc('cartClear', …)` của trợ lý + chèn `window.updCoTotal = function(){}` sau thẻ Engine 2 → FAIL «cùng tập hàm bị bọc» (thiếu `cartClear`, `updCoTotal`) + FAIL chuỗi lệch, in rõ lớp mốc / lớp nay.
- `e2e_ban`: đổi «Khách: » → «Khach: » trong `buildReceiptContent` (`pos_print_content.v1.js`) + thêm trường `hong: 1` vào đơn trong `confirmPay` → FAIL `bill` và `ghiTT` ở cả hai biến thể.

Gấu Noel bọc `_pushPaidOrder` / `clearDebtAfterPayment` / `_loyaltyAfterSave` … chỉ ở nhánh `APP === 'tc33'` / XOFA — không thuộc posgieo, đúng là không xuất hiện.

## 3. Chạy lại

```sh
node tools/tach_posgieo/e2e_hook.js            # [--moc 0bd95a7] [--mua giangsinh]
node tools/tach_posgieo/e2e_ban.js
node tools/tach_posgieo/e2e_0d.js
sh tests/run_all.sh
```
Cần git (worktree tạm ở thư mục tạm hệ thống, tự gỡ) + Playwright/Chromium.

## 4. Giới hạn (ghi thật)

- Firebase giả RỖNG: so sánh chứng minh bản tách xử lý **y hệt** bản đang chạy trên cùng đầu vào, không chứng minh đúng nghiệp vụ với dữ liệu thật (khách có tem, ly đổi tem, chiến dịch trợ lý cấu hình, BTP/kho thật, CK/VietQR, chia bill, máy in thật).
- Kịch bản bán là một đường (tiền mặt, khách mới gán tay, không chiến dịch); `lookupCustomer` (đọc `customers`) không chạy vì giả rỗng — `renderCustomerInfo` được gọi thẳng.
- Biến thể DOM: các thẻ bridge đều đồng bộ trong `<body>` nên automation / Engine 2 gắn lúc DOMContentLoaded; chưa thử trường hợp DOM đã tải trước khi bridge chạy (không xảy ra với thẻ hiện tại).
- Chữ ký lớp = mã nguồn: hai lớp có mã giống hệt nhau nhưng closure khác giá trị (vd `sau` của trợ lý) không phân biệt được bằng chữ ký — được bù bằng bài `e2e_ban` (so hành vi).
- Chưa APK / thiết bị thật.

## 5. Điểm nhờ người kiểm phản biện

1. Cách đi chuỗi qua `[[Scopes]]` chỉ theo tên biến `goc` / `cu` / `fn` — có lớp bọc nào (trong posgieo, bridge, Gấu Noel) giữ hàm trước bằng tên khác hoặc gọi qua `window[...]` động mà công cụ đi sót (chuỗi bị cắt ngắn ở CẢ HAI bản nên vẫn «giống»)?
2. `fb_gia.js` nay CHẠY hàm `runTransaction` (trước trả rỗng) — có thể che lệch nào khi giao dịch ném lỗi ở cả hai bản giống nhau?
3. Chuẩn hoá trong `e2e_ban` có quá tay (vd `\b\d\d:\d\d\b` → `HH:MM` nuốt mất giá trị nghiệp vụ dạng giờ cấu hình)?
4. Danh sách 23 hàm có thiếu hàm nào bạn biết là bị bọc trên posgieo bản Giáng sinh?
