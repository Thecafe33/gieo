# Kiểm tra lượt 06 — Đợt 1C (nội dung bill/tem + giao diện máy in / máy quét / in lại)

> **Dành cho agent kiểm tra độc lập.** Kế hoạch: `docs/KE_HOACH_TACH_POSGIEO_DA_CUA_HANG.md` (5.1, 5.3, 9 Đợt 1).
> Chủ dự án 26/10: **chỉ tách, không đổi thao tác hiện tại; gặp trường hợp như vậy không hỏi, giữ đúng thao tác, ưu tiên luồng bán hàng trơn tru.** → Lượt này là **R thuần** (chuyển nguyên văn), không có commit H.
> H1 (tab khác đổi cửa hàng): chủ dự án chọn **A** — giữ lớp phủ, ghi giới hạn (kế hoạch 4.3).
> Chưa deploy, chưa ghi sổ phát hành (`--ghi`), chưa thử trên APK.

## 1. Đã chuyển (công cụ `tools/tach_posgieo/chuyen.js`, nguyên văn, kiểm (a)–(e) đạt)

| File mới | Dấu | Tên | Dải dòng posgieo.html (trước khi chuyển, bản `48b0b43`) |
| --- | --- | --- | --- |
| `js/posgieo/pos_print_content.v1.js` | `printContent` | 12: `renderReceiptCanvas`, `maskPhoneForPrint`, `buildReceiptContent`, `buildFooterLines`, `TEM_LABEL_WIDTH_MM`, `TEM_LABEL_HEIGHT_MM`, `TEM_DPI_TO_DOTS_PER_MM`, `temDotsPerMm`, `temPxW`, `temPxH`, `drawQrOnCanvas`, `renderTemCanvas` | 3003–3185, 3428–3442, 4882–5103 |
| `js/posgieo/pos_print_ui.v1.js` | `printUi` | 45: handler màn máy in / tem (`temToggleEnabled` … `_updateTemStatusUI`, `_updatePrinterStatusUI` … `printerSaveLayout`, `printerTab` … `_pollTemConnectStatus`, `_temDiagOpen`, `_temPollTimer`), máy quét (`posScanAvailable`, `posScan`, `posScanErrorText`, `scanTestClick`), in lại (`temReprintInfo`, `temReprintGuard`, `logReprint`, `billIsFresh`, `printerReprintOrder`, `openTemReprintPicker`, `temReprintOneUnit`, `_temCupInfoForItem`, `temReprintOneItem`, `temReprintAll`) | 5111–5185, 5205–5432, 5459–5762, 6043–6277 |

**Cố ý ở lại script chính:**
- `POSPrinter` (đọc localStorage lúc tạo — quy tắc P1/P2 lượt 05), `getNextBillCode` (transaction mã bill — luồng thanh toán), `PRINTER_LAYOUT_FB_PATH`, `_temCloudEnabled`, `syncPrinterLayoutFromCloud`, `syncTgSettingsFromCloud` (gọi trước/sau auth — gộp là H riêng nếu có, kế hoạch 9).
- `_scanPending`, `_scanSeq`, `window.__androidScanResult = …` — lệnh tự chạy (callback native của APK) đặt đúng chỗ cũ.
- Hằng chống "đá bill" `TEM_REPRINT_WINDOW_MIN`, `HISTORY_VISIBLE_MIN`, `CASH_COUNT_MAX_ATTEMPTS`, `REPRINT_LOG_COLL` (dùng chung với kết ca) và `_guardStaffOnShift`, `_guardMinsSince`.
- Giá trị đầu let/const trong file mới chỉ là literal (`_temDiagOpen = false`, `_temPollTimer = null`, các hằng tem) — không đọc trạng thái máy.

**HTML:** 2 thẻ + 2 thẻ nạp lại (`#pgPrintContentRetry`, `#pgPrintUiRetry`) ngay sau `#pgPrinterRetry`; `POS_MODS_THIET_YEU` thêm `printContent`, `printUi` (thanh toán / màn máy in gọi thẳng → thiếu file thì màn đỏ, không bán nửa chừng).

## 2. Test đổi

- `tests/stamp_free.test.js`, `tests/ledger_once.test.js`, `tests/khach_goi_y.test.js`: kiểm "KHÔNG CÓ" (rewards / `.add()` sổ kho / tự tải customers) trước chỉ quét HTML → nay quét thêm `maNoi('posgieo.html')` (mọi `js/…`). **Thử cài lỗi**: chèn cả ba mẫu cấm vào `pos_print_ui.v1.js` → cả 3 test FAIL; trả lại → PASS. (Subagent rà: không test nào đọc thô văn bản các hàm đã chuyển; `nhan_ly_doi_tem` dùng `extract` — đã đọc cả `js/`.)
- `tools/tach_posgieo/e2e_0d.js`: ca (1) kiểm 2 dấu + 8 hàm có; ca (8) sau chốt dừng gọi `renderTemCanvas` / `temDotsPerMm` (gọi ngược `POSTemPrinter` ở `pos_printer.v1.js`) / `posScanAvailable` / `billIsFresh`.

## 3. Chạy lại

```sh
sh tools/sinh_lai_tat_ca.sh                 # => TẤT CẢ ĐẠT
node tools/check_boundaries.js              # RANH GIỚI SẠCH
node tools/check_paths.js                   # ĐƯỜNG DẪN SẠCH (109 tên, 875 lời gọi, 54 động) — không đổi
node tools/tach_posgieo/e2e_0d.js           # ALL PASS (22 dòng)
node tools/gau_noel/e2e_gau.js              # 71/72 — chỉ K3 kiosk.html (XOFA) hỏng như nền; posgieo gọi buildReceiptContent + renderReceiptCanvas thật: ok
node tools/btp_am/e2e_btp_am.js; node tools/kho_fifo/e2e_retry.js; node tools/nhan_hang/e2e_don_vi.js   # ALL PASS
node tools/file_thay_doi.js 0bd95a7 giangsinh
```

## 4. File giao (CHƯA giao — chờ kiểm tra), so với bản đang chạy `0bd95a7`

```text
SỬA  ban_deploy/giangsinh/posgieo.html                         →  public/posgieo.html
SỬA  ban_deploy/giangsinh/posgieo_thu.html                     →  public/posgieo_thu.html
SỬA  ban_deploy/giangsinh/DANH_SACH.txt                        →  public/DANH_SACH.txt
MỚI  ban_deploy/giangsinh/js/posgieo/pos_ui.v1.js              →  public/js/posgieo/pos_ui.v1.js
MỚI  ban_deploy/giangsinh/js/posgieo/pos_assist.v1.js          →  public/js/posgieo/pos_assist.v1.js
MỚI  ban_deploy/giangsinh/js/posgieo/pos_printer.v1.js         →  public/js/posgieo/pos_printer.v1.js
MỚI  ban_deploy/giangsinh/js/posgieo/pos_print_content.v1.js   →  public/js/posgieo/pos_print_content.v1.js
MỚI  ban_deploy/giangsinh/js/posgieo/pos_print_ui.v1.js        →  public/js/posgieo/pos_print_ui.v1.js
```
Trước deploy: `firebase.json` thêm header `/js/posgieo/**` (mẫu `tools/firebase_headers_gieogieo.json`); lúc giao chạy `--ghi`.

## 5. Giới hạn (ghi thật)

- Chưa in thử bill / tem, chưa quét thử trên APK thật (cầu nối `AndroidPrinter` / `AndroidScanner` chỉ có trong APK). e2e chỉ chứng minh hàm có mặt + chạy trong cùng môi trường toàn cục.
- 5 file JS riêng = 5 lượt tải thêm khi mở app lần đầu (sau đó cache immutable). Mạng chậm: mỗi file một lần nạp lại.

## 6. Điểm nhờ người kiểm phản biện

1. Có handler `onclick="…"` nào trong HTML / chuỗi HTML dựng động gọi một trong 57 tên TRƯỚC khi `js/posgieo/pos_print_*.v1.js` chạy (vd thẻ inline đặt trước dòng ~230)?
2. Có chỗ nào trong script chính GÁN LẠI một trong các tên đã chuyển (`printerTab = …`, bọc hàm kiểu Gấu Noel / automation / Engine 2 `window.X = wrap(X)`) — nếu là `function` khai báo ở file khác thì gán lại vẫn đúng như cũ, nhưng xin xác nhận Gấu Noel bọc `buildReceiptContent` / `renderReceiptCanvas` còn ăn (e2e G-ca đạt).
3. Để `logReprint` (ghi `label_reprints_gieogieo`) ra file riêng có lệch quy tắc nào của `check_paths` / `data_access` không (công cụ báo sạch)?
4. (Đã tự rà: không chỗ nào ở script chính gán `_temPollTimer` / `_temDiagOpen` hay gán lại 57 tên; Gấu Noel `boc()` bọc qua `window[tên]` — hàm khai báo ở file riêng vẫn là thuộc tính window.) `_temPollTimer` / `_temDiagOpen` là `let` giờ nằm ở file khác — có chỗ nào ở script chính gán chúng (gán `let` của script khác vẫn hợp lệ, nhưng xin rà)?
