# Kiểm tra lượt 12 — Đợt 3A (ca: PIN nhân viên, check-in / check-out, Việc đầu ca, mở ca → `js/posgieo/pos_shift.v1.js`)

> **Dành cho agent kiểm tra độc lập.** Kế hoạch mục 9 Đợt 3 («Ca, kết ca, quỹ»). Chủ dự án 26/10: chỉ tách, giữ đúng thao tác → lượt này là **R thuần**. «Một bộ điều phối thứ tự kết ca» (kế hoạch) là việc H, **không làm** ở lượt này.
> Đợt 3 chia 3A (ca — lượt này) → 3B kết ca (phiên kết ca 8 bước, đối soát tiền / CK, bàn giao, giao ca giữa ngày, đóng ngày, đếm BTP cuối ngày + phần B BTP âm) → 3C quỹ (quỹ tiền mặt, mở két).
> Đợt 2 đã kiểm ĐẠT (`KET_QUA_KIEM_TRA_LAI_10_VA_11_DOC_LAP.md`). Chưa deploy, chưa ghi sổ phát hành.

## 1. Chuyển mã (`chuyen.js --dai 5035-5308,5864-6183,6637-7420`, HEAD trước commit = `bfdcaca`)

| Dải | Nội dung | Ví dụ tên |
| --- | --- | --- |
| 5035–5308 | Mã nhân viên PIN 4 số, người ký trong phiên, khoá PIN sai 3 lần, `posDateKey` | `EMPLOYEES_CACHE_POS`, `loadEmployeesCachePOS`, `resolvePinToEmployee`, `renderPinInput`, `resolveStaffPinField`, `resolveStaffPinAndCheckin`, `resolveStaffPinWorkedToday`, `currentSignerPOS`, `switchSignerPOS`, `PIN_FIELDS_ALWAYS_ASK` |
| 5864–6183 | Check-in / check-out cá nhân, màn Ca làm việc, cảnh báo ngày trước chưa đóng | `loadEmployeeShiftsTodayCache`, `renderCheckinBlock`, `doCheckIn`, `doCheckOut`, `openCaLamViecScreen`, `loadStaleShiftDays`, `renderStaleShiftWarning` |
| 6637–7420 | Việc đầu ca (checklist, đếm giờ tối thiểu, cổng bán) + mở ca (đếm tiền quỹ, đối chiếu tiền giữ lại hôm trước) | `computeOpeningChecklistPOS`, `refreshOpeningChecklistGate`, `requireOpeningChecklistDone`, `renderOpeningChecklist`, `tickChecklistItem`, `renderShiftOpenForm`, `submitShiftOpen`, `_writeShiftOpen`, `_continueAfterShiftInventoryOpenPOS` |

- **87 tên**, 0 lệnh tự chạy trong dải. Kiểm (a)–(e) đạt; cảnh báo duy nhất `PIN_FIELDS_ALWAYS_ASK = new Set(['checkin'])` (literal, không đọc trạng thái máy).
- **Ở lại script chính** (thuộc 3B / 3C): đối soát tiền mặt mù GĐ9 (`_shiftOpenDenoms` / `_shiftCloseDenoms` gọi `cfEmptyDenoms()` lúc nạp), phiên kết ca, `renderShiftCloseReview` / `submitShiftClose`, đối soát CK + bàn giao, giao ca giữa ngày, đóng ngày, quỹ / mở két.
- HTML: thẻ `js/posgieo/pos_shift.v1.js` + `#pgShiftRetry` ngay sau `#pgExpiryRetry`; `POS_MODS_THIET_YEU` thêm `shift` (mọi màn ký PIN + cổng bán `requireOpeningChecklistDone` gọi thẳng → thiếu file thì màn đỏ).
- Test đọc thô `posgieo.html`: đã rà tất cả test có tên trong 87 tên — đều đọc qua `extract` / `maNoi` (thấy cả `js/`), không test nào mất độ phủ.

## 2. Công cụ

- **Firebase giả `FieldValue.arrayUnion` / `arrayRemove`** (người kiểm lượt 10+11 nêu «mock arrayUnion chưa thực thi»): trả dấu `{__fv, v}` → lượt ghi nhớ giá trị; ghi-cập-nhật-mồi gộp không trùng / bỏ theo giá trị. Test `tach_posgieo_fb_gia` thêm 1 ca (32 ca).
- `e2e_0d` ca (11) thêm `pos_shift.v1.js`.

## 3. `e2e_kho.js` — 4 kịch bản 3A (gg01 + gg02, so `0bd95a7`, giờ cố định, phạm vi quán theo REG, ghim tập bảng)

Mồi danh mục nhân viên thật (`employees_gieogieo` e1 PIN 1234, e2 PIN 5678) đọc qua bộ đệm sống (`__SNAP`; đăng ký lúc mở trang được gỡ rồi gắn lại sau khi mồi — giống nhau ở hai bản).

| Kịch bản | Đường đi | Khẳng định riêng | Bảng |
| --- | --- | --- | --- |
| `caCheckIn` | Ca làm việc → khối Check-in → gõ **PIN thật** 1234 → `doCheckIn` (`resolveStaffPinField`) | thêm ca e1 hôm nay, `checkedOutAt: null`; toast; vẽ lại 1 người trong ca, ô PIN xoá | employee_shifts |
| `caCheckOut` | ca e1 đang mở, PIN thật → `doCheckOut` (qua giao ca / BTP âm / hạn dùng — không có việc) → người cuối + ngày chưa đóng → hỏi xác nhận | cập nhật `checkedOutAt`; hỏi đúng 1 lần; toast | employee_shifts |
| `caMoCa` | `renderShiftOpenForm` → đếm 2 × 500.000 + 1 × 200.000 → `submitShiftOpen` | `daily_openings/2026-10-26` tiền quỹ 1.200.000; toast «Đã mở ca»; đoạn ca số 1 | daily_openings, shift_segments, staff_target_days |
| `caTickViec` | mục «Lau quầy» → `tickChecklistItem` | `daily_openings` `checklistDone` = arrayUnion `{id: lau, người ký}` | daily_openings |

Tự kiểm mới: bản sao `pos_shift.v1.js` đổi ngưỡng OT mặc định chụp vào ca (8 → 9) → `caCheckIn` báo lệch `ghi`.
Mở ca / tick việc: phần chạy tiếp sau khi đã ghi (đếm giao ca / kiểm kê đầu ca — module khác) chờ tối đa 4 giây; mọi lượt ghi trong khoảng đó vẫn so với mốc.

**GHI NHẬN — không do tách, không sửa (đổi hành vi phải hỏi chủ dự án):** check-in ghi `payTerms` rỗng (`payType: null`, đơn giá 0) và `roles: []` dù hồ sơ có đơn giá / chức năng — vì `resolvePinToEmployee` chỉ trả `{id, fullName}`. Bản đang chạy `0bd95a7` y hệt (phép so khớp). **Không sai lương**: quanlygieo `empPayTermsOn` chỉ dùng ảnh chụp khi có `payType`, thiếu thì theo hồ sơ / `payHistory`. Ca không ghi chức năng = pha chế (quy tắc chủ quán 22/10) nên Engine 2 cũng không lệch.

## 4. Chạy lại

```sh
sh tools/sinh_lai_tat_ca.sh                 # TẤT CẢ ĐẠT
node tools/check_boundaries.js              # RANH GIỚI SẠCH
node tools/check_paths.js                   # ĐƯỜNG DẪN SẠCH (109 tên, 875 lời gọi, 54 động) — không đổi
node tools/tach_posgieo/e2e_kho.js          # 23 kịch bản × gg01/gg02 + 7 tự kiểm → 595 khẳng định, ALL PASS
node tools/tach_posgieo/e2e_0d.js; node tools/tach_posgieo/e2e_ban.js; node tools/tach_posgieo/e2e_hook.js   # ALL PASS
node tools/btp_am/e2e_btp_am.js             # ALL PASS
node tools/automation/e2e_shift_work.js     # ghim /usr/bin/chromium — chạy bản sao trỏ /opt/pw-browsers/chromium: ok 1366px + 390px
```

## 5. Giới hạn

- Check-out có giao ca giữa ngày / BTP bán không lô / lô quá hạn (rẽ nhánh sang module khác) chưa ghép vào kịch bản này; `hanCheckOut` (2D) phủ nhánh hạn dùng.
- Việc đầu ca có đếm giờ tối thiểu (`clEnsureStarted` / `minDurationSec`), bỏ qua có lý do, đối chiếu tiền giữ lại hôm trước lệch → màn xác nhận: chưa có kịch bản so mốc.
- Khoá PIN sau 3 lần sai, người ký trong phiên kết ca (`CLOSE_PIPELINE_PIN_FIELDS`, ở 3B): chưa so mốc.
- Chưa APK / Firebase thật / hai quán đồng thời.

## 6. Điểm nhờ người kiểm phản biện

1. `posDateKey` (tiện ích ngày VN, gọi khắp app) nằm trong dải PIN nên ra `pos_shift` — chấp nhận, hay nên để ở nền (`pos_ui` / sau này `pos_data`)?
2. Ranh giới 3A / 3B: `renderShiftCloseReview` / `submitShiftClose` (đếm tiền cuối ca) và đối soát GĐ9 để lại cho 3B — có hàm nào trong 87 tên thực chất là kết ca nên đi cùng 3B?
3. Có chỗ nào gán lại một trong 87 tên (vd bọc `doCheckOut` / `renderPinInput` kiểu Gấu Noel / automation / Engine 2)? `e2e_hook` vẫn đủ 25 hàm bọc.
