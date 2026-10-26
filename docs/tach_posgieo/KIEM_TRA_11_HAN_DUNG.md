# Kiểm tra lượt 11 — Đợt 2D (hạn dùng → `js/posgieo/pos_expiry.v1.js`)

> **Dành cho agent kiểm tra độc lập.** Kế hoạch mục 9 Đợt 2: «Hạn dùng ở đầu ca / chuông / check-out, không thêm vào thanh toán. **Qua:** snapshot + log ghi trước/sau giống nền; thao tác ở A không đổi S/C của B.»
> Chủ dự án 26/10: chỉ tách, giữ đúng thao tác. Lượt này là **R thuần** (chuyển nguyên văn), app không đổi hành vi. Chưa deploy, chưa ghi sổ phát hành (`--ghi`).
> Chủ dự án báo agent sẽ kiểm **cả 2C (sau phản hồi lượt 10, đến `2c27f19`) và 2D** trong cùng lượt — 2C xem `KIEM_TRA_10_KHO.md` + `PHAN_HOI_KIEM_TRA_10.md` (cả phần kiểm lại).

## 1. Chuyển mã (`chuyen.js --dai 8649-8851`, HEAD trước commit = `2c27f19`)

| File (dấu) | Khai báo | Nội dung |
| --- | --- | --- |
| `js/posgieo/pos_expiry.v1.js` (`expiry`) | 26 | Phần **A. HẠN DÙNG** của khối «BTP ÂM» (`docs/KE_HOACH_BTP_AM.md`): hằng `PREP_EXTEND_HOURS` (24) / `EXP_SOON_MIN` (30); hàm thuần `prepLotExpired`, `expiryCheckLines`, `expiryExtendTo`; đọc `loadExpiryCheckLinesPOS`; chuông `expirySoonLines` / `expirySoonTick` / `_expSoonSig`; màn kiểm hạn `expiryCheckHTML` / `Show` / `Close` / `Refresh` / `Act` / `OpenSoon`, dấu đầu ca `expiryOpenDone`, check-out `expiryAskOnCheckOut`; ghi `prepExtendLotPOS`, `nlExtendOpenUnitPOS`, `prepDiscardExpiredLotPOS`, `_expSyncCaches`; tiện ích `fmtPrepTime`, `expiryLineWhen`; trạng thái `_expWatchPrep`, `_expCheck`, `_expAfterSheet` |

- Kiểm (a)–(e) đạt. Giá trị đầu let/const chỉ literal (`24`, `30`, `[]`, `''`, `null`). Không đọc localStorage / DOM / Firebase lúc nạp.
- **Ở lại script chính:** lệnh tự chạy `setInterval(expirySoonTick, 60000);` (đúng chỗ cũ, sau khối chú thích — chạy khi script chính chạy, lúc đó file đã nạp). Phần **B** của khối BTP ÂM (`prepUntrackedSales`, `prepUntrackedAskOnCheckOut`, `prepShortage*` — hỏi khi check-out / kết ca) **giữ inline**: thuộc luồng ca / kết ca → Đợt 3. Chú thích đầu khối (mô tả A + B) đi theo file mới; phần B còn chú thích riêng «B. Hàm THUẦN…».
- Bên ngoài gọi vào (đều lúc chạy): script chính — Việc đầu ca (`loadExpiryCheckLinesPOS`, `expiryCheckShow`), check-out (`expiryAskOnCheckOut`), `fmtPrepTime` (phần B); `pos_stock_units.v1.js` — chuông (`expirySoonLines`, `expiryCheckOpenSoon`), Báo hết (`_expAfterSheet`); `pos_printer.v1.js` — `fmtPrepTime` (tem gia hạn).
- HTML: thẻ `js/posgieo/pos_expiry.v1.js` + nạp lại `#pgExpiryRetry` ngay sau `#pgCountRetry`; `POS_MODS_THIET_YEU` thêm `expiry` (Việc đầu ca / chuông / check-out gọi thẳng → thiếu file thì màn đỏ, không bán nửa chừng).

## 2. Bài kiểm

### `e2e_0d.js`
- Ca (11): thêm `pos_expiry.v1.js` — 404 cả lần nạp lại → màn đỏ; chạy dở → không nạp lại, không lỗi khai báo lần hai.
- Ca (8): sau chốt dừng gọi `expiryCheckLines` (lô quá hạn + mã sắp hết hạn, lô xa hạn bị loại), `expiryExtendTo` (+24 giờ từ bây giờ khi đã quá hạn), `expirySoonTick` (gọi `renderFifoAlertBar` ở `pos_stock_units`), dấu `expiry === true`.

### `e2e_kho.js` — 4 kịch bản 2D (gg01 + gg02, so `0bd95a7`, phạm vi quán độc lập theo REG, chèn ghi sang quán khác tự kiểm)
Giờ **cố định** (`gioCo` = 14:33 giờ VN 26/10) → hai bản cùng mốc. Kịch bản có `gioCo` **không chuẩn hoá giờ** (giá trị tất định) nên so được cả hạn mới. Mồi: lô BTP `b1` quá hạn 1 giờ (còn 400 g), `b2` hết hạn sau 20 phút (600 g), mã sữa đang mở `ctn_h1` hết hạn sau 20 phút; RT đủ ba mã. PIN (`resolveStaffPinWorkedToday`) và `doCheckOut` gán đè giống nhau ở hai bản. Bấm **nút thật** trên màn kiểm hạn thật.

| Kịch bản | Đường đi | Khẳng định riêng | Bảng |
| --- | --- | --- | --- |
| `hanGiaHan` | chuông → `expiryCheckOpenSoon` → danh sách thật → «Còn dùng được» lô b2 | danh sách `b1 (quá hạn), b2, ctn_h1`; lô b2 hạn mới `2026-10-27T07:53:20Z` (= hạn cũ + 24 giờ); đọc lại b2 rời danh sách | prep_batches |
| `hanGiaHanNL` | như trên, «Còn dùng được» mã sữa `ctn_h1` | mã ctn_h1 hạn mới = hạn cũ + 24 giờ | stock_containers |
| `hanCheckOut` | `expiryAskOnCheckOut` → chỉ lô **đã quá hạn** → «Bỏ đi» b1 | danh sách chỉ `b1`; sổ BTP WASTE 400 g; hết việc → đóng màn, gọi check-out lại **đúng một lần**; toast «Đã ghi huỷ lô … 400 g» | active_units, prep_batches, prep_items, prep_transactions |
| `hanDauCa` | `expiryOpenDone` | đúng một `update` (không `set`) `daily_openings/2026-10-26 { expiryCheckedAt }` | daily_openings |

Tự kiểm mới: bản sao `pos_expiry.v1.js` đổi `PREP_EXTEND_HOURS = 24` → `25` thì `hanGiaHan` báo lệch `ghi`.

Biến `E2E_KHO_DUMP=<thư mục>` ghi lượt ghi đã chuẩn hoá của hai bản để đối chiếu thô.

## 3. Chạy lại

```sh
sh tools/sinh_lai_tat_ca.sh                 # TẤT CẢ ĐẠT (gồm tach_posgieo_*, btp_am_pos, da_cua_hang_*…)
node tools/check_boundaries.js              # RANH GIỚI SẠCH
node tools/check_paths.js                   # ĐƯỜNG DẪN SẠCH (109 tên, 875 lời gọi, 54 động) — không đổi
node tools/tach_posgieo/e2e_kho.js          # 19 kịch bản × gg01/gg02 + 6 tự kiểm → 504 khẳng định, ALL PASS
node tools/tach_posgieo/e2e_0d.js           # ALL PASS
node tools/tach_posgieo/e2e_ban.js; node tools/tach_posgieo/e2e_hook.js   # ALL PASS
node tools/btp_am/e2e_btp_am.js             # ALL PASS (màn kiểm hạn đầu ca / check-out của luồng BTP âm)
node tools/file_thay_doi.js 0bd95a7 giangsinh
```

## 4. File giao (CHƯA giao — chờ kiểm tra), so với bản đang chạy `0bd95a7`

```text
SỬA  ban_deploy/giangsinh/posgieo.html, posgieo_thu.html, DANH_SACH.txt   →  public/…
MỚI  ban_deploy/giangsinh/js/posgieo/pos_{ui,assist,printer,print_content,print_ui,receive,prep,stock_units,kho,count,expiry}.v1.js  →  public/js/posgieo/…
```
Trước deploy: `firebase.json` thêm header `/js/posgieo/**` (mẫu `tools/firebase_headers_gieogieo.json`); lúc giao chạy `--ghi`.

## 5. Giới hạn (ghi thật)

- Phase `open` (màn kiểm hạn **trong Việc đầu ca**, vẽ vào `#shiftBody` rồi `renderOpeningChecklist`) chưa có bài so sánh riêng — dùng chung `expiryCheckAct` / `expiryCheckRefresh` với hai phase đã kiểm; bài `e2e_btp_am` (bộ hiện tại, không so mốc) có đi qua.
- «Bỏ đi» một **mã NL** mở màn Báo hết (`openConfirmFinishSheet`, đã kiểm ở 2C `baoHetConDu`) — chưa ghép thành một kịch bản từ màn kiểm hạn.
- In tem gia hạn: máy in giả trả lỗi → toast «chưa in được tem gia hạn» ở cả hai bản; chưa in thật trên APK.
- Firebase giả: orderBy / limit bỏ qua, increment xấp xỉ, `onSnapshot` một ảnh đầu (khi bật `__SNAP`), chưa hai quán ghi đồng thời.

## 6. Điểm nhờ người kiểm phản biện

1. Giữ phần B (BTP bán không lô / hỏi bù khi check-out & kết ca) inline tới Đợt 3 có hợp lý, hay nên tách cùng 2D?
2. Có handler inline / chuỗi HTML dựng sẵn nào gọi 26 tên **trước** khi `pos_expiry.v1.js` chạy?
3. `setInterval(expirySoonTick, 60000)` ở script chính: có đường nào chạy trước khi file nạp (vd script chính chạy dù `expiry` thiếu — chốt `POS_MODS_THIET_YEU` có chặn trước dòng này không)?
4. Kịch bản giờ cố định bỏ chuẩn hoá giờ: có trường nào phụ thuộc số lần gọi `Date.now` khác nhau giữa hai bản gây lệch giả, hoặc ngược lại che lệch thật?
