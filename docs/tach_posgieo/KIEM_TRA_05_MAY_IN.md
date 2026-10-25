# Kiểm tra lượt 05 — Đợt 1B: kết nối máy in bill / máy in tem → `js/posgieo/pos_printer.v1.js`

> **Dành cho agent kiểm tra độc lập.** Kế hoạch: `docs/KE_HOACH_TACH_POSGIEO_DA_CUA_HANG.md` Đợt 1 (1B = transport/kết nối, giữ nội dung tem/bill ở chỗ cũ). Lượt 02–04 chưa có kết quả kiểm tra; chủ dự án cho làm tiếp. Chưa deploy, chưa ghi sổ phát hành.
> Phân công: subagent Sonnet nâng `tools/tach_posgieo/chuyen.js` (kiểm (a) chỉ xét tham chiếu chạy NGAY lúc nạp; nhiều dải → một file) + test; Claude chọn dải, kiểm bắc cầu, chuyển thật, sửa `check_paths`, sửa test.

## 1. Đã làm (loại R)

`node tools/tach_posgieo/chuyen.js --html posgieo.html --dai 2998-3219,3401-3411,3472-3631,5313-6007,7006-7213 --ra js/posgieo/pos_printer.v1.js --dau printer --ghi`

| Dải (dòng trước khi chuyển) | Nội dung |
| --- | --- |
| 2998–3219 | `class XprinterWNN58E`, `class XprinterBillBridgeEngine` |
| 3401–3411 | `loadPrinterLayout` (POSPrinter gọi NGAY lúc tạo object `layout: loadPrinterLayout()` — Sonnet phát hiện; thân hàm chỉ dùng `localStorage`) |
| 3472–3631 | `const POSPrinter` |
| 5313–6007 | đổi ảnh → lệnh in (`canvasTo*`), `sendBytesToXprinterApp`, trạng thái cầu nối tem `_tem*`, `_temLocal*`, `const POSTemPrinter` |
| 7006–7213 | nối lại / canh kết nối tem: `_temPrinterReady`, `_temForceReconnect`, `temEnsureConnected`, `startTemConnectionWatchdog`… |

- 41 tên, 74.904 byte; `posgieo.html` 1.882.289 → 1.808.616 byte. 0 lệnh tự chạy trong dải.
- **KHÔNG chuyển** (ở lại HTML): nội dung bill `renderReceiptCanvas` / `buildReceiptContent` (Gấu Noel bọc theo tên), nội dung tem `renderTemCanvas`…, giao diện máy in/quét (17 handler HTML), `getNextBillCode` (thanh toán), `syncPrinterLayoutFromCloud`, `PRINTER_LAYOUT_FB_PATH`, `var _temCloudEnabled`, máy quét `posScan*` (để đợt sau).
- Cảnh báo đã kiểm tay (công cụ chỉ kiểm một tầng): `POSPrinter` lúc tạo gọi `localStorage.getItem` + `loadPrinterLayout()` (cùng file, không dùng tên ngoài); `POSTemPrinter` lúc tạo không gọi hàm nào.
- Thẻ + `#pgPrinterRetry` sau `#pgAssistRetry`; `POS_MODS_THIET_YEU` thêm `printer` (lệnh tự chạy lúc mở app ~dòng 7354 gọi `POSPrinter.tryReconnect…`, `temEnsureConnected`, `startTemConnectionWatchdog` — thiếu file thì script chính lỗi ngay).

## 2. Hai lỗi công cụ/test phát hiện trong lượt — đã sửa

1. **`check_paths` chỉ tra hằng trong CÙNG đoạn nguồn** → `db.ref(PRINTER_LAYOUT_FB_PATH)` trong file mới thành "tên không xác định" (875 → 874 lời gọi, 54 → 55 động) = rào đường dẫn yếu đi âm thầm. Sửa: gộp hằng chuỗi cấp cao của mọi đoạn nguồn cùng app. Số liệu trở lại đúng mốc (875 / 54). Ca cài lỗi mới **T7b** (`tests/tach_posgieo_cong_cu.test.js`); đối chứng: bản cũ không bắt được tên bảng chưa đăng ký dùng qua hằng của HTML, bản mới bắt được. (`check_boundaries`, `ast_inventory` vốn đã gộp hằng của mọi đoạn.)
2. **`tests/btp_am_pos.test.js` đọc thô `posgieo.html`** tìm chuỗi "GIA HẠN lần" của tem lô (nay ở `POSTemPrinter`) → chuyển sang `maNoi`. Bài học: rà test đọc thô phải dò cả **nội dung chuỗi**, không chỉ tên hàm — thêm vào quy tắc chuyển cụm.

## 3. Chạy lại

```sh
sh tools/sinh_lai_tat_ca.sh                 # => TẤT CẢ ĐẠT
node tools/check_boundaries.js && node tools/check_paths.js   # sạch, 875 lời gọi / 54 động
node tools/tach_posgieo/e2e_0d.js           # thêm ca «Đợt 1B: pos_printer.v1.js nạp…»
node tools/gau_noel/e2e_gau.js              # G1–G14 posgieo (in bill + QR); K3 kiosk hỏng như nền
node tools/btp_am/e2e_btp_am.js; node tools/kho_fifo/e2e_retry.js; node tools/nhan_hang/e2e_don_vi.js
```

Kết quả: tất cả đạt như mô tả (Gấu Noel 14/14 posgieo; FIFO 28/28; nhận hàng 80/80).

## 4. Giới hạn

- **Chưa in thật** (máy in bill Bluetooth / máy in tem LAN qua APK) — bắt buộc kiểm trên APK trước khi coi 1B là xong (kế hoạch: «Qua đợt: browser/APK in/quét đúng»).
- Kiểm bắc cầu lúc nạp (hàm được gọi ngay khi tạo object có dùng tên ngoài không) làm TAY cho 2 object; công cụ chưa tự kiểm nhiều tầng.
- Chưa có test chụp chuỗi bọc.

## 5. Điểm nhờ phản biện

1. Ranh giới "kết nối" vs "nội dung": có hàm nào trong 5 dải thật ra thuộc nội dung tem/bill (nên ở lại), hoặc hàm kết nối nào còn sót ngoài dải (vd `_updateTemStatusUI`, `printerQuickReconnect`, `_waitForTemReady` ở vùng giao diện)?
2. `_waitForTemReady` (vùng giao diện, ở lại HTML) được các hàm kết nối trong file mới gọi — chỉ lúc chạy, không lúc nạp; đồng ý để vậy tới khi tách giao diện?
3. Máy in là module THIẾT YẾU — đúng không, hay nên để thiếu module máy in vẫn bán (không in)?
4. `var _temCloudEnabled` ở lại HTML, được getter trong `POSTemPrinter` đọc — `var` cấp cao vẫn là thuộc tính `window`, đọc chéo file được; có rủi ro gì?
