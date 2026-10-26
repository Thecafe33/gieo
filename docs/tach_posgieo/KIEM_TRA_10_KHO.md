# Kiểm tra lượt 10 — Đợt 2C (mở chai / báo hết, màn Kho / hao hụt / cân, kiểm kê → 3 file JS)

> **Dành cho agent kiểm tra độc lập.** Kế hoạch mục 9 Đợt 2. Chủ dự án 26/10: chỉ tách, giữ đúng thao tác. **R thuần**. Chưa deploy, chưa ghi sổ phát hành.
> Lượt 09 kiểm lại ĐẠT (`KET_QUA_KIEM_TRA_LAI_09_0517061.md`).

## 1. Chuyển mã (`chuyen.js`, áp từ dưới lên để dải dòng không trôi; HEAD trước commit)

| File (dấu) | Dải | Khai báo | Nội dung |
| --- | --- | --- | --- |
| `js/posgieo/pos_stock_units.v1.js` (`stockUnits`) | 3266–4702 | 81 | mở chai / báo hết (quét + chọn tay kèm lý do), pill FIFO «cần xác nhận đã hết» / «chưa hết», màn Dùng NL, tem mở / tem kho chờ dán, hằng `STOCK_CONTAINERS_COLL`, `STOCK_LOST_REPORTS_COLL`, `MISSING_LABEL_REPORTS_COLL`, `STOCK_ANOMALY_COLL`, `laMaCu`, `computeOpenExpiry`, `isAtomicUnitContainer`… |
| `js/posgieo/pos_kho.v1.js` (`kho`) | 6310–7644 | 85 | màn Kho, `KHO_ITEMS_CACHE`, hao hụt trong ngày (đổ ly / huỷ BTP / hao hụt NL), bộ cân BTP (vật đựng, trừ bì) |
| `js/posgieo/pos_count.v1.js` (`count`) | 7693–8758 | 39 | kiểm kê mù, «Kiểm tra lại», báo mất tem, cấp lại mã hàng loạt theo ngày nhận |

- Kiểm (a)–(e) đạt; 0 lệnh tự chạy trong dải. Cảnh báo `stockCountState` / `missingLabelState`: giá trị đầu chỉ có `new Set()`.
- localStorage: chỉ `dwPending_pos` trong thân `_submitDrinkWasteImpl` (lúc chạy).
- Bên ngoài gọi vào: `UnitEngine.init` (`getItems: () => KHO_ITEMS_CACHE` — mũi tên, lúc chạy), kết ca / đầu ca / bán hàng / automation (`openStockUseScreen`, `loadKhoScreen`).
- HTML: 3 thẻ + 3 thẻ nạp lại sau `#pgPrepRetry`; `POS_MODS_THIET_YEU` thêm `stockUnits`, `kho`, `count`; `e2e_0d` ca (11) thêm 3 file.
- Subagent (Sonnet) rà + chạy: **không test hỏng, không mất độ phủ** (các test đọc thô đã nối `maNoi` từ lượt trước).

## 2. Firebase giả — bộ lọc truy vấn (giới hạn người kiểm nêu nhiều lượt; nay gây kết luận sai thật)

Kịch bản mở mã bị app chặn «đang có bao mở: SUA00001» dù SUA00001 còn seal — vì `where('status','==','open')` trả cả mã sealed. Đã cài bộ lọc cơ bản: Firestore `==`, `!=`, `<`, `<=`, `>`, `>=`, `in`, `not-in`, `array-contains`, `array-contains-any`, trường lồng, `FieldPath.documentId()`; RT `orderByChild` + `equalTo` (orderBy / limit vẫn bỏ qua). Test mới `tests/tach_posgieo_fb_gia.test.js` (12 ca, trong `run_all`): bộ lọc, mã `doc()` riêng, ghi cập nhật mồi, giao dịch lỗi không ghi gì + thử lại, Storage. Toàn bộ bài so sánh chạy lại sau sửa.

## 3. `e2e_kho.js` — thêm 3 kịch bản 2C (gg01 + gg02, so `0bd95a7`, phạm vi quán độc lập, ghim tập bảng)

| Kịch bản | Nội dung | Khẳng định riêng | Bảng |
| --- | --- | --- | --- |
| `moMa` | mã sữa sealed → `submitOpenContainer` (PIN) | mã → `open`; ghi RT mã đang mở | active_units, inventory_items, stock_containers |
| `baoHet` | mã sữa đang mở còn 0 → `submitFinishContainer(id, đã quét)` | mã → `finished` | active_units, stock_containers |
| `kiemKe` | `openStockCountScreen` (đọc danh mục) → đếm Trà lài 900 g → `submitStockCount` | phiếu `pending_review`, dòng đếm 900 | stock_counts |

Tự kiểm mới: đổi trạng thái phiếu kiểm kê trong `pos_count.v1.js` → `kiemKe` lệch `ghi`. Tổng: 12 kịch bản × 2 quán + 4 tự kiểm.

## 4. Chạy lại

```sh
sh tools/sinh_lai_tat_ca.sh; node tools/check_boundaries.js; node tools/check_paths.js
node tests/tach_posgieo_fb_gia.test.js
node tools/tach_posgieo/e2e_kho.js
node tools/tach_posgieo/e2e_0d.js; node tools/tach_posgieo/e2e_ban.js; node tools/tach_posgieo/e2e_hook.js
node tools/btp_am/e2e_btp_am.js; node tools/kho_fifo/e2e_retry.js; node tools/nhan_hang/e2e_don_vi.js; node tools/automation/engine2_e2e.js; node tools/gau_noel/e2e_gau.js
```

Kết quả: `e2e_kho` 12 kịch bản × 2 quán + 4 tự kiểm ALL PASS (ghi chú thật: lần chạy đầu tự kiểm `kiemKe` báo «KHÔNG thấy lệch» vì mẫu cài lỗi trúng chỗ `pending_review` thứ nhất — dòng báo mất tem, không phải chỗ ghi phiếu kiểm kê; đã ghim mẫu `countedBy: staff, status: 'pending_review'` → bắt được); `fb_gia` 12/12; e2e_0d / e2e_ban / e2e_hook ALL PASS; BTP âm, FIFO 28, nhận hàng 80, Engine 2 POS đạt; Gấu Noel 71/72 (K3 kiosk XOFA như nền); ranh giới / đường dẫn SẠCH; run_all TẤT CẢ ĐẠT.

## 5. Giới hạn

- Chưa so: đổ ly thành phẩm (`submitDrinkWaste` — cần công thức menu + tiêu hao theo công thức), hao hụt NL thô, bộ cân BTP có vật đựng, «Chưa hết» FIFO, báo mất tem, cấp lại mã hàng loạt, kiểm kê có quét mã / «Kiểm tra lại», mở bao thứ 2 kèm lý do.
- Firebase giả: orderBy/limit bỏ qua; không xung đột thật; chưa hai quán đồng thời.
- Chưa APK.

## 6. Nhờ phản biện

1. Nhánh nào trong danh sách «chưa so» bắt buộc trước khi qua 2C (gợi ý: đổ ly — đường hao hụt hay dùng nhất)?
2. Bộ lọc mới của Firebase giả có thể làm hai bản «cùng sai giống nhau» theo cách nào khác (vd so sánh kiểu dữ liệu `==` nghiêm ngặt)?
