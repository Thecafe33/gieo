# Kiểm tra lượt 17 — Đợt 4C (khách: tra cứu / tích tem / danh sách → `js/posgieo/pos_customers.v1.js`)

> **Dành cho agent kiểm tra độc lập.** Kế hoạch mục 6.2 («Khách: `pos_customers`, `pos_loyalty` — tra khách, tem / quà») + Đợt 4 («giữ thứ tự ghi, idempotency, queue; retry không trùng quyền lợi»). Chủ dự án 26/10: chỉ tách, giữ đúng thao tác → **R thuần**.
> Lượt 15 + 16 đã kiểm ĐẠT (`KET_QUA_KIEM_TRA_15_16_DOC_LAP.md`, phản hồi `PHAN_HOI_KIEM_TRA_15_16.md`, commit `05db7a3`). Chưa deploy, chưa ghi sổ phát hành.
> Đợt 4 còn lại sau lượt này: **4D giỏ + thanh toán** (`confirmPay`, CK, tính riêng).

## 1. Chuyển mã (`chuyen.js --dai 7641-8347,9538-9911`, HEAD trước = `05db7a3`; dải sau chuyển trước)

| Dải `posgieo.html` | Nội dung | Tên |
| --- | --- | ---: |
| 7641–8347 | NHÁNH CUSTOMER — tra cứu SĐT (`lookupCustomer`, `renderCustomerInfo`), thêm thành viên (`openAddMemberPopup` / `confirmAddMember`…), xoá khách khỏi đơn (`requestClearCustomer`, `clearCustomer`, `resetDiscountState`), ly miễn phí theo tem (`consumeFreeToGoDrink`, `_stampFree*`, `_finalizeStampFreeAfterPay`), LOYALTY (hàng đợi nợ bền `_loyaltyPending*` / `loyaltyFlushPending`, `loyaltyAddPoints`, trần ly tem `STAMP_*` / `_capOfSixStamps` / `stampCupPricesOf` / `_stampLedgerAdd`, `loyaltyAddStamps`, `loyaltyProcessAfterPay`) | 42 |
| 9538–9911 | AUTOCOMPLETE SĐT (`allCustomersCache`, bản gợi ý trong máy / dùng chung `CUST_AC_*`, `fetchAllCustomersCache`, `onPhoneInput`, `selectPhone`) + DANH SÁCH KHÁCH (`CUST_PAGE_SIZE`, `loadCustomerList`, `_custFetchAll`, `_custRenderNextPage`, tìm kiếm, `onCustListScroll`) | 26 |

- **68 tên**. Kiểm (a)–(e) đạt, **không cảnh báo**: mọi giá trị đầu là literal / `null` / `[]` / `0`; `_LOYALTY_PENDING_LS_KEY` và `CUST_AC_LS` chỉ là **tên khoá** (chuỗi), không đọc localStorage lúc nạp.
- **Ở lại script chính, đúng chỗ cũ** (4 lệnh tự chạy): `document.addEventListener('click', …)` (đóng gợi ý SĐT), `window.addEventListener('scroll', …)`, `assistHookIntoPOS()` (IIFE), `assistLoadLocalCache()`.
- Biến liên quan nằm ở chỗ khác, KHÔNG chuyển: `loyaltyCustomer` / `curCustomer` (khối STATE đầu script — dùng chung với giỏ), `checkFreeToppingMemberPromo` / `cartHasFreeToppingApplied` / giỏ (4D).
- HTML: thẻ `js/posgieo/pos_customers.v1.js` + `#pgCustomersRetry` sau `#pgOrdersRetry`; `POS_MODS_THIET_YEU` thêm `customers` (ô SĐT ở giỏ / thanh toán, `confirmPay` gọi `loyaltyProcessAfterPay` / `_finalizeStampFreeAfterPay`, listener scroll / click gọi thẳng). `e2e_0d` ca (11) thêm file.
- Test đọc thô `posgieo.html`: `sh tools/sinh_lai_tat_ca.sh` TẤT CẢ ĐẠT (151 file test; các test «kiểm không có» `stamp_free`, `khach_goi_y`, `ledger_once` đã quét cả `js/` qua `maNoi`).

## 2. `e2e_kho.js` — 4 kịch bản 4C

Điều kiện chung: gg01 + gg02, so `0bd95a7`, giờ cố định, phạm vi quán theo REG, ghim tập bảng.

Mồi (collection `customers` — **dùng chung**, không hậu tố quán): Lan `0901234567` (1.200 điểm, 5 tem, chưa tích hôm nay), Minh `0902222222` (2 tem), Hoa `0903333333`.

| Kịch bản | Đường đi | Khẳng định riêng | Bảng |
| --- | --- | --- | --- |
| `khachTraCuu` | gõ ô `#cuph` (sự kiện `input` thật) → `lookupCustomer`: SĐT có thành viên / SĐT lạ / `+84…` | tên «Lan» + 1.200 Point + 5/6 Stamp; SĐT lạ hiện gợi ý thêm thành viên đúng SĐT; `+84901234567` chuẩn về `0…` tìm ra Lan; **chỉ** ghi bản gợi ý dùng chung (gõ SĐT lần đầu trong ngày → hành vi có sẵn), **không** ghi vào `customers` | customer_ac_cache |
| `khachThemThanhVien` | SĐT mới → gợi ý → popup → thiếu tên (chặn) → «Minh Anh» → `confirmAddMember` | `set` `customers/0911111111` đủ trường (0 điểm / 0 tem / 0 ly, nguồn `pos_gieogieo`), tự chọn vào đơn, đóng popup, toast | customers |
| `khachTichTem` | `loyaltyProcessAfterPay` bill1 (2 ly) → bill1 **lần hai** → bill2 | đúng MỘT lần cập nhật khách (tem 5 → 1, hôm nay 2, +1 ly miễn phí, 1 trần ly); dấu bill: bill1 added 2 / freeDrink, bill2 added 0; lần hai cùng bill KHÔNG cộng lại (idempotent); bill2 chạm trần 2 tem / ngày → toast «Đã đạt 2 Stamp hôm nay» | customers, loyalty_bill_effects |
| `khachDanhSach` | mở màn khách → đọc bảng → gõ «0902» → xoá | 3 khách + nhãn đếm; lọc còn đúng 1; xoá ô → đủ 3; chỉ đọc | (không) |

Tự kiểm mới, cài lỗi vào bản sao `pos_customers.v1.js`:
- trần tem mỗi ngày 2 → 3 → `khachTichTem` báo lệch `ghi`;
- đổi nguồn tạo thành viên → `khachThemThanhVien` báo lệch `ghi`.

## 3. Chạy lại

```sh
sh tools/sinh_lai_tat_ca.sh                 # TẤT CẢ ĐẠT
node tools/check_boundaries.js              # RANH GIỚI SẠCH
node tools/check_paths.js                   # ĐƯỜNG DẪN SẠCH (109 tên, 875 lời gọi, 54 động) — không đổi
node tools/tach_posgieo/e2e_kho.js --chi khachTraCuu,khachThemThanhVien,khachTichTem,khachDanhSach
node tools/tach_posgieo/e2e_kho.js          # 1294 khẳng định, ALL PASS
node tools/tach_posgieo/e2e_0d.js; node tools/tach_posgieo/e2e_ban.js; node tools/tach_posgieo/e2e_hook.js
```

## 4. Giới hạn

- **Đổi ly miễn phí** (`consumeFreeToGoDrink` → menu quà tặng → thêm vào giỏ) và `_finalizeStampFreeAfterPay` (trừ tem sau thanh toán): phụ thuộc giỏ / menu quà nên chưa có kịch bản; nghiệm thu cùng 4D.
- **Hàng đợi nợ bền** (`_loyaltyGhiNo`, `loyaltyFlushPending`, mất mạng giữa chừng): chưa ép lỗi ghi khách để so mốc; mới so đường thành công + idempotent theo bill.
- `loyaltyAddPoints` (nhánh điểm cũ, chỉ chạy nốt hàng đợi) chưa so.
- Xoá khách khỏi đơn khi giỏ có topping tặng (hộp hỏi xác nhận), tìm kiếm danh sách với bảng > 200 khách (phân trang `startAfter`): chưa so.
- Firebase giả: `orderBy` / `limit` bỏ qua; `increment` xấp xỉ; chưa APK / Firebase thật / hai quán đồng thời. `customers` là bảng chung nên hai quán cùng ghi một doc — chưa chạy đồng thời.

## 5. Kết quả cả bộ `e2e_kho`

49 kịch bản × gg01/gg02 + 22 tự kiểm → **1294 khẳng định, ALL PASS** (1188 cũ + 106 mới; không hồi quy). `check_boundaries` / `check_paths` sạch; `e2e_0d` / `e2e_ban` / `e2e_hook` ALL PASS.

## 6. Điểm nhờ người kiểm phản biện

1. `pos_customers` gộp tra cứu + tích tem + danh sách (68 tên). Kế hoạch có tên `pos_loyalty` riêng — gộp một file trong lượt R này có chấp nhận được, hay nên tách tích tem (`loyalty*`, `stamp*`) sang `pos_loyalty`?
2. `clearCustomer` / `resetDiscountState` / `_stampFreeSyncCart` đụng giỏ và khuyến mãi (4D) nhưng nằm cạnh khối khách trong HTML; chuyển cùng vì liền khối — có hàm nào nên ở lại để đi cùng giỏ?
3. Có lời gọi **lúc nạp** nào tới 68 tên từ file nạp **trước** `pos_customers` (kể cả `onclick` dựng sẵn chạy sớm)?
