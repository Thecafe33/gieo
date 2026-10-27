# Kiểm tra lượt 15 — Đợt 4A (sửa danh mục món / Food / topping → `js/posgieo/pos_catalog_admin.v1.js`)

> **Dành cho agent kiểm tra độc lập.** Kế hoạch mục 9 Đợt 4 («Giỏ, khách, thanh toán, sau bán — làm sau cùng; giữ thứ tự ghi, idempotency, queue»). Chủ dự án 26/10: chỉ tách, giữ đúng thao tác → **R thuần**.
> Đợt 3 hoàn tất (lượt 14 ĐẠT — `KET_QUA_KIEM_TRA_14_DOC_LAP.md`, phản hồi `PHAN_HOI_KIEM_TRA_14.md`).
> Đợt 4 chia theo rủi ro tăng dần: **4A sửa danh mục** (lượt này) → 4B sau bán (doanh thu / xếp hạng món / lịch sử / chi tiết bill / bổ sung bill) → 4C khách (tra cứu / tích tem / danh sách khách) → 4D giỏ + thanh toán (`confirmPay`, CK, tính riêng) cuối cùng. Chưa deploy, chưa ghi sổ phát hành.

## 1. Chuyển mã (`chuyen.js --dai 10543-10862,10881-10954`, HEAD trước commit = `b44b205`)

| Dải | Nội dung | Tên |
| --- | --- | --- |
| 10543–10862 | MENU MANAGEMENT + FOOD MENU: `reloadMenuAndRefresh`, `switchMnTab`, `renderMnList`, bảng màu `MN_COLORS` / `buildColorPicker` / `selectMenuColor`, form món `openMenuForm` / `saveMenuItem` / `deleteMenuItem`, ô phân loại `showTypeDropdown`… `hideTypeDropdown`, `fmtPriceInput` / `getPriceVal`, Food `openFoodForm` / `saveFoodItem` / `deleteFoodItem`, trạng thái `_mnEditId` / `_mnColor` / `_foodEditId` | 27 |
| 10881–10954 | Topping (quản lý): `renderMnToppingList`, `openToppingForm`, `closeToppingForm`, `saveTopping`, `deleteTopping` | 5 |

- **32 tên**. Kiểm (a)–(e) đạt, không cảnh báo giá trị đầu.
- **Ở lại script chính, đúng chỗ cũ:**
  - lệnh tự chạy `document.addEventListener('click', … hideTypeDropdown())` — gọi lúc chạy, file đã nạp;
  - `addFoodToCart` và cụm tách ly / chọn topping trong giỏ (`openToppingPickerSplit`, `showSplitQtyPopup`, `doSplitAndOpen`) — đây là **giỏ hàng**, để cho 4D, dù nằm cạnh khối Food / topping trong HTML;
  - `_curMenuTab` / `_tpEditId` (khối STATE đầu script) — biến dùng chung, chưa chuyển.
- HTML: thẻ `js/posgieo/pos_catalog_admin.v1.js` + `#pgCatalogAdminRetry` ngay sau `#pgCashfundRetry`; `POS_MODS_THIET_YEU` thêm `catalogAdmin`. Lý do thiết yếu: trình nghe click toàn trang gọi `hideTypeDropdown` ở MỌI cú chạm (thiếu file → lỗi mỗi lần chạm), và ô giá cài đặt To Go (`#tg-disc-max`) gọi `fmtPriceInput`.
- `e2e_0d` ca (11) thêm `pos_catalog_admin.v1.js`.
- Test đọc thô `posgieo.html`: grep 32 tên trong `tests/` + `tools/` → không test nào ngoài `e2e_kho` (mới).

## 2. `e2e_kho.js` — 3 kịch bản 4A

Điều kiện chung: gg01 + gg02, so `0bd95a7`, giờ cố định, phạm vi quán theo REG, ghim tập bảng.

Mồi RT qua `GieoData.rtPath`:
- món To Go `m1` Trà đào (M 30.000 / L 35.000);
- Food `f1` Bánh mì 20.000;
- topping `t1` Trân châu 7.000.

Mỗi kịch bản gồm: mở màn Quản lý menu thật (`showScreen('mn')`), điền ô thật (`input` event), gọi hàm lưu / xoá như nút bấm. Xoá đi qua `posConfirm` (giả đồng ý, đếm số lần hỏi). Sau mỗi bước, `reloadMenuAndRefresh` đọc lại.

| Kịch bản | Đường đi | Khẳng định riêng | Bảng |
| --- | --- | --- | --- |
| `menuMon` | lưu khi thiếu tên (chặn) → thêm «Trà vải E2E», phân loại Trà, M 32.000 → sửa m1 L 40.000 → xoá m1 | set `/push` đúng trường; set `/m1` giữ tên / M; remove `/m1` sau 1 lần hỏi; danh sách To Go cuối = [Trà vải E2E]; toast thêm / cập nhật / xoá | menu_togo |
| `menuFood` | lưu khi thiếu giá (chặn) → thêm «Bánh E2E» 18.000 → sửa f1 22.000 → xoá f1 | set `/push` (màu `#b45309`); set `/f1`; remove `/f1`; Food cuối = [Bánh E2E] | food |
| `menuTopping` | bấm tab Toppings (nút thật) → nút «+ Thêm topping» (đã đổi hành vi theo tab) → «Thạch E2E» 5.000 / To Go 6.000 → sửa t1 To Go 8.000 → xoá t1 | tab hiện danh sách topping; set `/push`, `/t1`; remove `/t1`; topping cuối = [Thạch E2E] | toppings |

Tự kiểm mới, cài lỗi vào bản sao `pos_catalog_admin.v1.js`:
- giá L +1 → `menuMon` báo lệch mục `ghi`;
- giá To Go topping +1 → `menuTopping` báo lệch mục `ghi`.

## 3. Chạy lại

```sh
sh tools/sinh_lai_tat_ca.sh                 # TẤT CẢ ĐẠT
node tools/check_boundaries.js              # RANH GIỚI SẠCH
node tools/check_paths.js                   # ĐƯỜNG DẪN SẠCH (109 tên, 875 lời gọi, 54 động) — không đổi
node tools/tach_posgieo/e2e_kho.js --chi menuMon,menuFood,menuTopping
node tools/tach_posgieo/e2e_kho.js          # 1049 khẳng định, ALL PASS
node tools/tach_posgieo/e2e_0d.js; node tools/tach_posgieo/e2e_ban.js; node tools/tach_posgieo/e2e_hook.js   # ALL PASS
```

## 4. Giới hạn

- Chưa so mốc:
  - tab «Tại quán» (`menu_gieogieo`, nút ẩn từ F5);
  - chọn màu bằng bảng màu;
  - chọn phân loại có sẵn từ danh sách gợi ý;
  - lỗi ghi Firebase (toast «Lỗi»).
- Menu bán hàng sau khi sửa (`renderMenu` / `buildFilterBar` ở script chính) chỉ được gọi lại, chưa khẳng định nội dung màn bán.
- Firebase giả: `push` dùng mã cố định `/push`; chưa thiết bị thật.

## 5. Kết quả cả bộ `e2e_kho`

40 kịch bản × gg01/gg02 + 17 tự kiểm → **1049 khẳng định, ALL PASS** (gồm `moKetPin` / `moKetNhatKyLoi` của phản hồi lượt 14; không hồi quy).

## 6. Điểm nhờ người kiểm phản biện

1. Ranh giới 4A: để `addFoodToCart` + cụm tách ly / topping trong giỏ lại cho 4D (giỏ). Có hàm nào trong 32 tên thực chất là luồng bán, nên đi cùng 4D?
2. `catalogAdmin` thiết yếu vì trình nghe click toàn trang gọi `hideTypeDropdown`. Có cách nhìn khác không, ví dụ để `hideTypeDropdown` ở lại script chính?
3. Thứ tự Đợt 4 (4A → 4B sau bán → 4C khách → 4D giỏ / thanh toán) có hợp lý với yêu cầu «giỏ / thanh toán làm sau cùng» không?
