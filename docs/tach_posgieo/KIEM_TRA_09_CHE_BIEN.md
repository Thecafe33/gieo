# Kiểm tra lượt 09 — Đợt 2B (chế biến BTP → `js/posgieo/pos_prep.v1.js`)

> **Dành cho agent kiểm tra độc lập.** Kế hoạch mục 9 Đợt 2. Chủ dự án 26/10: chỉ tách, giữ đúng thao tác. Lượt này **R thuần** (chuyển nguyên văn). Chưa deploy, chưa ghi sổ phát hành.
> Lượt 08 (2A nhận hàng) đã kiểm lại ĐẠT (`KET_QUA_KIEM_TRA_LAI_08_E497492.md`); góp ý ghim REG theo thẻ `data_access` của `posgieo.html` đã làm (`pham_vi.js` `napREG`).

## 1. Chuyển mã

- `chuyen.js --dai 7638-11104` (HEAD trước commit lượt này): **168 khai báo** chế biến BTP — cache `PREP_ITEMS_CACHE_POS` / `PREP_BATCHES_CACHE_POS`, gợi ý nấu `prepSug*`, màn nấu mẻ, cổng quét mã trước khi nấu, đối chiếu NL khi nấu (`prepRecon*`), tự chốt NL kẹt (`prepForce*`), bắt đầu / hoàn thành / huỷ mẻ, sửa định lượng, thẻ tem lô, đổ bỏ BTP (`submitPrepWaste`), cùng các tiện ích dùng rộng `round2`, `fmtPrepQty`, `fmtDateTimeShort` → `js/posgieo/pos_prep.v1.js` (dấu `prep`, ~250 KB). Kiểm (a)–(e) đạt; 0 lệnh tự chạy trong dải.
- Cảnh báo công cụ: `const _prepSug = {… touched: new Set() …}` có `new` — chỉ `Set` rỗng, không đọc trạng thái máy.
- Đọc localStorage (`prepSugHist_v1`, `prepSugLead_v1`, `PREP_START_SCAN_LS_KEY`) đều **trong thân hàm** (gọi lúc chạy, sau cài chế độ thử + dọn theo quán) — giá trị đầu `prepStartScanState = null`.
- Bên ngoài gọi vào: `UnitEngine.init` (dòng ~2505: `getPreps: () => PREP_ITEMS_CACHE_POS` — hàm mũi tên, đọc lúc chạy; `prepReconExtraNeedsReview` / `prepReconClassifyUsage` truyền tham chiếu hàm — khai báo hàm ở file nạp TRƯỚC script chính nên có sẵn), kho / kết ca / hạn dùng / bán hàng (`prepSugOnUsage`) / `gieo_automation_pos.v3.js` (`openPrepBatchScreen`).
- HTML: thẻ + `#pgPrepRetry`; `POS_MODS_THIET_YEU.prep`. `e2e_0d` ca (11) thêm `pos_prep.v1.js`.

## 2. Test đọc thô (subagent Sonnet rà + chạy)

| Test | Vấn đề | Sửa |
| --- | --- | --- |
| `engine_api` | **HỎNG**: tìm `const PREP_RECON_LOCK_COLL` trong HTML (nay ở `pos_prep.v1.js`) | đọc HTML + `maNoi` |
| `da_cua_hang_mo_quan` | mất độ phủ «KHÔNG lọc `active` khi gán `PREP_ITEMS_CACHE_POS`» (2 chỗ gán đã ra file) | + `maNoi` |
| `da_cua_hang_b2` | mất độ phủ quét AST lệnh ghi danh mục NL/BTP (`prep_items…update` ở `pos_prep.v1.js`) | + mọi đoạn `js/` của `nguonCua` |

Thử cài lỗi (thêm vào `pos_prep.v1.js` một lệnh lọc `active` + một `update` trường lạ lên `prep_items`) → `da_cua_hang_mo_quan` và `da_cua_hang_b2` FAIL đúng; trả lại → đạt. Ghi chú: `engine_api` in `FAIL` nhưng thoát mã 0 — `run_all.sh` vẫn bắt (grep `^FAIL`/`SOME FAIL`), lượt sinh lại trước khi sửa đã báo «CÓ TEST HỎNG».

## 3. Bài so sánh kho (`e2e_kho.js`) — thêm 3 kịch bản chế biến

| Kịch bản | Nội dung | Khẳng định riêng | Bảng ghi tới (ghim) |
| --- | --- | --- | --- |
| `hoanThanhMe` | mẻ `cooking` → gõ 1950 g → `submitPrepFinish` (engine `prep.finishBatch`) | lô `active` còn 1950; sổ BTP PRODUCTION 1950; cập nhật lô | active_units, prep_batches, prep_items, prep_transactions |
| `huyMe` | mẻ `cooking` có giao dịch CONSUMPTION −500 g → lý do + PIN → `submitPrepCancel` | lô `cancelled`; hoàn +500 g sổ kho | inventory_items, prep_batches, stock_anomalies, stock_transactions |
| `doBoBTP` | lô `active` 1000 g → Hao hụt › BTP, đổ 300 g theo lô → `submitPrepWaste` (`prep.discardByLots`) | toast «Đã ghi huỷ 300 g lô …»; sổ BTP WASTE | active_units, prep_batches, prep_items, prep_transactions |

Mỗi kịch bản: gg01 + gg02, giống hệt `0bd95a7` (ghi / toast / trạng thái / lỗi), kiểm phạm vi quán độc lập (`pham_vi.js`), nối dây chèn ghi quán khác. Thêm khoá giờ `rev` (mốc RT ms × 1000 của mã đang mở) vào chuẩn hoá theo trường. **Tự kiểm** mới: bản sao đổi ghi chú dòng hoàn kho trong `pos_prep.v1.js` → `huyMe` báo lệch `ghi`. `stock_anomalies` ở `huyMe`: mã NL của khoản hoàn không có trong mồi → sổ lệch, như nhau ở hai bản.

## 4. Chạy lại

```sh
sh tools/sinh_lai_tat_ca.sh            # TẤT CẢ ĐẠT
node tools/check_boundaries.js; node tools/check_paths.js
node tools/tach_posgieo/e2e_kho.js     # 6 kịch bản × gg01/gg02 + 2 tự kiểm
node tools/tach_posgieo/e2e_0d.js; node tools/tach_posgieo/e2e_ban.js; node tools/tach_posgieo/e2e_hook.js
node tools/btp_am/e2e_btp_am.js; node tools/kho_fifo/e2e_retry.js; node tools/nhan_hang/e2e_don_vi.js; node tools/automation/engine2_e2e.js; node tools/gau_noel/e2e_gau.js
```

Kết quả: run_all TẤT CẢ ĐẠT; ranh giới / đường dẫn SẠCH (109 tên, 875 lời gọi); e2e_kho / e2e_0d / e2e_ban / e2e_hook ALL PASS; BTP âm, FIFO 28, nhận hàng 80, Engine 2 POS đạt; Gấu Noel 71/72 (chỉ K3 `kiosk.html` XOFA hỏng như nền).

## 5. Giới hạn

- Chưa so: **bắt đầu nấu** (cổng quét mã + đối chiếu NL khi nấu, `prepRecon*`/`prepForce*`), sửa định lượng lô, gợi ý nấu `prepSug*` (đọc lịch sử + localStorage), in tem lô. Đây là nhánh nhiều bước nhất — xin người kiểm cho ý kiến có bắt buộc trước khi qua 2B không.
- Firebase giả như lượt 08 (không xung đột/thử lại thật, bỏ bộ lọc truy vấn).
- Chưa APK.

## 6. Nhờ phản biện

1. `UnitEngine.init` nhận tham chiếu `prepReconExtraNeedsReview`/`prepReconClassifyUsage` lúc chạy dòng ~2505 — nay hai hàm nằm ở file nạp trước; có đường nào engine giữ tham chiếu cũ / bị gán lại sau?
2. `round2` / `fmtPrepQty` / `fmtDateTimeShort` dùng khắp nơi (nhận hàng, tem, kết ca…) nay ở `pos_prep.v1.js` — thiếu file này = màn đỏ (thiết yếu). Có nên tách tiện ích sang file riêng ở lượt sau không (chỉ sắp xếp, không đổi hành vi)?
3. Nhánh bắt đầu nấu cần đưa vào bài so sánh trước khi qua 2B?
