# Kiểm tra lượt 16 — Đợt 4B (sau bán → `js/posgieo/pos_reports.v1.js` + `pos_orders.v1.js`)

> **Dành cho agent kiểm tra độc lập.** Kế hoạch mục 6.2 («Sau bán: `pos_orders`, `pos_reports` — mua thêm, huỷ, lịch sử») + mục 9 Đợt 4 («giữ thứ tự ghi, idempotency, queue»). Chủ dự án 26/10: chỉ tách, giữ đúng thao tác → **R thuần**.
> Chủ dự án 27/10 cho làm 4B **song song** trong lúc lượt 15 (4A) chưa có kết quả kiểm — lượt này dựng trên `23357b0` (4A, CHƯA kiểm). Có lỗi ở 4A thì sửa riêng, không ảnh hưởng dải của 4B. Chưa deploy, chưa ghi sổ phát hành.

## 1. Chuyển mã (HEAD trước = `23357b0`; dải sau chuyển trước)

| File (dấu) | Dải `posgieo.html` | Tên | Nội dung |
| --- | --- | --- | --- |
| `js/posgieo/pos_reports.v1.js` (`reports`) | 8727–9246 | 16 | REVENUE (`todayKey`, `weekStart`, chọn khoảng ngày, `_ordersInRange`, `updRv`, `_updShipStats`, `setTab`), ITEM RANKING (`openItemRanking` … `_doRenderItemRanking`, `drawChart`), HISTORY (`renderH`, `filterH`) |
| `js/posgieo/pos_orders.v1.js` (`orders`) | 9248–10364 | 50 | Bổ sung topping sau khi bấm bill (`ADDON_WINDOW_MIN`, `orderAddonInfo`, tấm 3 bước `_addon*`, `submitAddon` / `_submitAddonImpl`, việc trừ kho bền `_addonJobStartPOS` / `_addonJobUpdatePOS` / `applyAddonConsumptionPOS`, phiếu + tem bổ sung), DETAIL `showDet`, xoá bill (`delOrder`, `delOrderConfirm`, `removeBillSideRecordsPOS`, `_deletingOrderIds`), bổ sung bill thiếu sau kết ca (`_backfillMode`, PIN, chọn chế độ, `startBackfillBill`, tiền mặt bổ sung, băng thông báo) |

- **66 tên**, 0 lệnh tự chạy. Kiểm (a)–(e) đạt. Cảnh báo duy nhất: `_deletingOrderIds = new Set()` (literal).
- Bên ngoài gọi vào, đều lúc chạy:
  - `todayKey`: giỏ / khuyến mãi / kết ca / quỹ…;
  - `_backfillMode`: `confirmPay`, giỏ;
  - `showDet` / `renderH`: `showScreen`, trợ lý, automation.
- Không có lời gọi lúc nạp từ file nạp trước.
- HTML: 2 thẻ + `#pgReportsRetry` / `#pgOrdersRetry` sau `#pgCatalogAdminRetry`. `POS_MODS_THIET_YEU` thêm `reports`, `orders`, vì `todayKey` dùng khắp app và thanh toán đọc `_backfillMode`. `e2e_0d` ca (11) thêm 2 file.
- Test đọc thô `posgieo.html`: `phan_bien_v12` L47 tìm chuỗi cờ xoá dở / hoàn kho trong `delOrderConfirm` (nay ở `pos_orders`) → chuyển sang `maNoi('posgieo.html')`. Các test khác chứa tên trong 66 tên đều qua `extract`:
  - `manage_doanh_thu`, `phan_bien_v13`, `them_topping`, `chuoi_bill`, `xuyen_app_thanh_toan_ngay`;
  - công cụ `kiem_tra_xuyen_app`.
- `e2e_hook` (25 hàm bọc) vẫn khớp mốc.

## 2. `e2e_kho.js` — 3 kịch bản 4B

Điều kiện chung: gg01 + gg02, so `0bd95a7`, giờ cố định, phạm vi quán theo REG, ghim tập bảng.

Mồi:
- đơn `o1` trên RT `orders_gieogieo/oct/26/o1`: Trà sữa E2E M, tiền mặt 30.000, tạo 2 phút trước. Trong RAM `orders`, `items` là mảng như `_attachRtListener`.
- công thức món như đổ ly;
- GOGS topping `t1` Trân châu: 1 phần = 30 g BTP lô `b3`, đang dùng 1000 g.

| Kịch bản | Đường đi | Khẳng định riêng | Bảng |
| --- | --- | --- | --- |
| `muaThem` | `openAddonSheet('o1')` (đọc phiếu đóng ngày) → chọn ly 1 → Trân châu × 1 → thanh toán TM khách đưa 10.000 → `submitAddon` (hỏi xác nhận) → chờ việc trừ kho tới `done` | node bill: tổng 37.000, addon 7.000 TM, thối 3.000, ly 1 có topping; `consumeJobs` pending → running → running (kế hoạch `dPrep.tcd = 30`) → done; RT lô b3 1000 → 970; đúng MỘT dòng sổ BTP CONSUMPTION −30; hỏi 1 lần; toast | active_units, order_stock_traces, orders, prep_batches, prep_items, prep_transactions |
| `xoaBill` | `showDet('o1')` → Xoá → mã sai (báo lỗi) → Xoá → mã đúng → `delOrderConfirm` | mã sai: không lượt ghi; cờ `deletionPending` ghi TRƯỚC, `remove` node bill SAU; bỏ khỏi RAM; về màn Lịch sử; toast | orders |
| `doanhThu` | 3 đơn hôm nay (TM 30.000 / CK 45.000 / CK 65.000 có Food TM 20.000) → `updRv()`; Lịch sử không gõ / gõ mã `BO2` | không ghi gì; màn doanh thu (chữ) giống mốc; danh sách lịch sử giống mốc | (không) |

Tự kiểm mới, cài lỗi vào bản sao `pos_orders.v1.js`:
- tiền thối mua thêm +1 → `muaThem` báo lệch `ghi`;
- cờ xoá dở `true` → `1` → `xoaBill` báo lệch `ghi`.

## 3. Chạy lại

```sh
sh tools/sinh_lai_tat_ca.sh                 # TẤT CẢ ĐẠT
node tools/check_boundaries.js              # RANH GIỚI SẠCH
node tools/check_paths.js                   # ĐƯỜNG DẪN SẠCH (109 tên, 875 lời gọi, 54 động) — không đổi
node tools/tach_posgieo/e2e_kho.js --chi muaThem,xoaBill,doanhThu
node tools/tach_posgieo/e2e_kho.js          # 1135 khẳng định, ALL PASS
node tools/tach_posgieo/e2e_0d.js; node tools/tach_posgieo/e2e_ban.js; node tools/tach_posgieo/e2e_hook.js   # ALL PASS
node tools/gau_noel/e2e_gau.js              # 71/72 — 1 FAIL CÓ SẴN ở phần kiosk.html (dừng sau K2: `style` của null), giống hệt trên 23357b0 trước lượt này; phần posgieo G1/G2… đạt
```

## 4. Giới hạn

- Xoá bill **có tiêu hao thật** (hoàn kho từng dòng qua `UnitEngine.consume.reverseSales`): `xoaBill` dùng đơn chưa trừ kho, nên chỉ chứng minh thứ tự cờ → hoàn (rỗng) → xoá, chưa so lượng hoàn. Xoá bill đang có việc trừ kho bổ sung **running** (chờ) / **pending** (huỷ): chưa có kịch bản.
- Mua thêm lỗi / xung đột (máy khác sửa đơn, đơn đang xoá dở, quá 10 phút, ngày đã đóng), chuyển khoản, in phiếu + tem bổ sung trên máy in thật: chưa so mốc. Máy in giả trả lỗi giống nhau ở hai bản.
- Bổ sung bill thiếu sau kết ca (`startBackfillBill` → bán → `recordBackfillCashPOS`): chưa có kịch bản; luồng này đi qua `confirmPay` (4D).
- Xếp hạng món / biểu đồ (`drawChart`, canvas): chưa so.
- Firebase giả: orderBy / limit bỏ qua, increment xấp xỉ; chưa APK / Firebase thật / hai quán đồng thời.

## 5. Kết quả cả bộ `e2e_kho`

43 kịch bản × gg01/gg02 + 19 tự kiểm → **1135 khẳng định, ALL PASS** (không hồi quy).

## 6. Điểm nhờ người kiểm phản biện

1. Chia 2 file `pos_reports` (chỉ đọc / hiển thị) và `pos_orders` (ghi: mua thêm / xoá / bổ sung bill) theo tên kế hoạch có hợp lý không?
2. `todayKey` (tiện ích ngày, gọi khắp app) nằm ở `pos_reports`, giống trường hợp `posDateKey` ở `pos_shift`. Giữ hay dời về nền ở lượt sau?
3. Luồng bổ sung bill (backfill) nằm trong `pos_orders` nhưng bán hàng thật đi qua `confirmPay` (script chính, 4D). Có biến trạng thái nào (`_backfillMode`, `_backfillPendingDate`) cần ở lại cạnh `confirmPay`?
