# Kiểm tra lượt 13 — Đợt 3B (kết ca, giao ca, đóng ngày → `pos_shift_closing.v1.js` + `pos_handover.v1.js`)

> **Dành cho agent kiểm tra độc lập.** Kế hoạch mục 9 Đợt 3. Chủ dự án 26/10: chỉ tách, giữ đúng thao tác → **R thuần**; «bộ điều phối thứ tự kết ca» (việc H) **không làm**.
> 3A đã kiểm lại ĐẠT (`KET_QUA_KIEM_TRA_LAI_12_1B67D446.md`). Còn 3C (quỹ tiền mặt / mở két). Chưa deploy, chưa ghi sổ phát hành.

## 1. Chuyển mã (HEAD trước commit = `e4100fd`; dải sau chuyển trước để số dòng dải đầu không trôi)

| File (dấu) | Dải `posgieo.html` | Tên | Nội dung |
| --- | --- | --- | --- |
| `js/posgieo/pos_shift_closing.v1.js` (`shiftClosing`) | 5489–8674, giữ 5593–5594 | 197 | GĐ9 đối soát tiền mặt mù (`computeExpectedCashPOS`, `isExpenseIncludedInCash`, `posDateKeyToDisplay`, `orderCashAmountPOS`), `shiftState`, nhãn trạng thái ca `shift_workflows`, phiên kết ca 8 bước (`beginCloseShiftPOS`, `CLOSE_PIPELINE_PIN_FIELDS`, thanh tiến trình), đếm tiền cuối ca (`renderShiftCloseReview` / `submitShiftClose`), GĐ10 CK + bàn giao + đếm giao ca đầu/cuối ca, chặn đóng ca thiếu đồ bắt buộc, GĐ3 đếm BTP cuối ngày, **phần B BTP âm** (`prepUntrackedSales`, `prepUntrackedAskOnCheckOut`, `prepShortage*`), cân lại xác minh BTP, kiểm kê ca NL, bàn giao cuối ngày |
| `js/posgieo/pos_handover.v1.js` (`handover`) | 8675–9600 | 44 | Giao ca giữa ngày 2 người đếm (`SEG_COLL`, `loadSegmentsPOS`, `ensureOpeningSegmentPOS`, `openHandoverPOS`, `submitHandoverCountPOS`), GĐ11 đóng ngày (`computeDailyClosingChecklistPOS`, `renderDailyClosingChecklist`, `submitDailyClose`), dọn ca treo ngày cũ (`closeStaleEmployeeShifts`), tự check-out lúc đóng ngày |

- Kiểm (a)–(e) đạt. Cảnh báo giá trị đầu chỉ `Promise.resolve()` / `new Set(...)` (literal).
- **Ở lại script chính** (đúng chỗ cũ): `let _shiftOpenDenoms = cfEmptyDenoms();` / `let _shiftCloseDenoms = cfEmptyDenoms();` (`--giu` — `cfEmptyDenoms` ở script chính, nạp sau file → kiểm (a) chặn nếu chuyển); lệnh tự chạy `document.addEventListener('DOMContentLoaded', …closeStepTrackPOS…)` và `setInterval(expirySoonTick, 60000)`.
- HTML: 2 thẻ + `#pgShiftClosingRetry` / `#pgHandoverRetry` sau `#pgShiftRetry`; `POS_MODS_THIET_YEU` thêm `shiftClosing`, `handover`; `e2e_0d` ca (11) thêm 2 file.
- Test đọc thô `posgieo.html`: rà mọi test có tên trong 241 tên — đều qua `extract` / `maNoi`.

## 2. Công cụ

- **`e2e_hook` tự kiểm cài lỗi theo tên hàm nhưng ghim vào `posgieo.html`** → `_continueAfterPrepCount` / `computeShiftInventoryCountLinesPOS` (Engine 2 bọc) nay ở `pos_shift_closing` → công cụ ném lỗi. Thêm `chenDauHamBo` (`hai_ban.js`): tìm hàm trong cả bộ (`posgieo.html` + `js/posgieo/*.js`), đúng một chỗ. Tự kiểm lại bắt đúng 4 tên.
- Kịch bản kết ca gỡ **mọi** bộ đệm sống (`_posLive`) đăng ký lúc mở trang rồi mới chạy (ảnh đầu `__SNAP` chỉ có sau khi mồi) — giống nhau ở hai bản.

## 3. `e2e_kho.js` — 5 kịch bản 3B (gg01 + gg02, so `0bd95a7`, giờ cố định, phạm vi quán theo REG, ghim tập bảng)

Mồi: e1 (PIN 1234) / e2 (PIN 5678) đã làm hôm nay; mở ca 1.000.000 do e1 giữ két (đoạn ca 1); chi tiền mặt 100.000. **Mọi ô PIN gõ thật**, qua `resolveStaffPinWorkedToday`.

| Kịch bản | Đường đi | Khẳng định riêng | Bảng |
| --- | --- | --- | --- |
| `ketDoiSoatKhop` | màn đếm tiền cuối ca → 1 × 500.000 + 2 × 200.000 → PIN e1 → `submitShiftClose` | `cash_passed`, thực = kỳ vọng = 900.000 (1.000.000 − 100.000), lần đếm `passed` (arrayUnion); chốt đoạn 1 `endCash` 900.000; toast | daily_closings, shift_segments |
| `ketDoiSoatLech` | đếm 850.000 (lần đầu) | `pending`, lệch −50.000, chưa chốt; không chốt đoạn ca; toast «còn 1 lần đếm» | daily_closings |
| `ketGiaoCa` | `openHandoverPOS` → bắt đầu đếm → e1 đếm 900.000 + PIN 1234 → e2 đếm 900.000 + PIN 5678 | pha out → in; đoạn 1 chốt 900.000; đoạn 2 mở, e2 giữ két, startCash 900.000 | shift_segments, shift_workflows |
| `ketDongNgay` | đã bàn giao, không ai trong ca → **màn đóng ngày thật** (`renderDailyClosingChecklist`) → tick «không còn bill dở» → PIN e1 → `submitDailyClose` | `closed`, người ký e1; toast | alerts, daily_closings, duty_digests |
| `ketCaTreo` | ca e2 hôm 25/10 chưa check-out, ngày đó đóng lúc 15:10Z → `closeStaleEmployeeShifts` | check-out hộ đúng giờ đóng ngày, `autoCheckOut`; trả 1; toast | employee_shifts |

Tự kiểm mới: `pos_shift_closing` đổi trạng thái `cash_passed` → `ketDoiSoatKhop` lệch `ghi`; `pos_handover` đổi lý do chốt hộ ca treo → `ketCaTreo` lệch `ghi`. Đối soát / giao ca / đóng ngày: phần chạy tiếp sau khi ghi chờ tối đa 4 giây; kết quả có `busy` để so cả khoá bấm.

## 4. Chạy lại

```sh
sh tools/sinh_lai_tat_ca.sh                 # TẤT CẢ ĐẠT
node tools/check_boundaries.js              # RANH GIỚI SẠCH
node tools/check_paths.js                   # ĐƯỜNG DẪN SẠCH (109 tên, 875 lời gọi, 54 động) — không đổi
node tools/tach_posgieo/e2e_kho.js          # 28 kịch bản × gg01/gg02 + 9 tự kiểm → 717 khẳng định, ALL PASS
node tools/tach_posgieo/e2e_0d.js; node tools/tach_posgieo/e2e_ban.js; node tools/tach_posgieo/e2e_hook.js   # ALL PASS
node tools/btp_am/e2e_btp_am.js             # ALL PASS (check-out BTP bán không lô — phần B nay ở pos_shift_closing)
node tools/automation/e2e_shift_work.js     # cần /usr/bin/chromium (môi trường này: bản sao trỏ /opt/pw-browsers/chromium)
```

## 5. Giới hạn

- Chưa so mốc: toàn bộ 8 bước nối nhau (đối soát → CK → đếm giao ca → đếm BTP → kiểm kê ca → bàn giao → checklist → đóng ngày) trong một lượt; đếm hết lượt ghi nhận lệch (`cash_variance_recorded`); giao ca đếm lệch / đếm chung / bill tiền mặt chen giữa; đóng ngày bị chặn (còn người trong ca, bill mới sau đối soát, việc bắt buộc); qua nửa đêm VN. ~~Bài `e2e_btp_am` (bộ hiện tại, không so mốc) đi qua đếm BTP cuối ca + phần B.~~ **Đính chính (F13-1, kiểm lượt 13):** `e2e_btp_am` chỉ trích một số hàm (`extractRaw`) — kiểm hạn đầu ca / chuông / trước check-out và câu hỏi BTP bán không lô lúc check-out (phần B); **không** chạy màn đếm BTP cuối ca (`renderPrepCountScreen` / `renderPrepCountCard` / `submitPrepCount`). Màn này nay có kịch bản so mốc `ketDemBTP` (`PHAN_HOI_KIEM_TRA_13.md`).
- Firebase giả: orderBy / limit bỏ qua, increment xấp xỉ, onSnapshot một ảnh đầu; chưa APK / Firebase thật / hai quán đồng thời.

## 6. Điểm nhờ người kiểm phản biện

1. Chia 2 file (kết ca 8 bước + đối soát + BTP / giao ca giữa ngày + đóng ngày) có hợp lý không, hay gộp theo đúng tên kế hoạch `pos_shift_closing`?
2. `shiftState` (dùng khắp màn Ca làm việc, cả `pos_shift` 3A) nay khai báo ở `pos_shift_closing` — `let` toàn cục cùng một binding; có chỗ nào đọc nó **lúc nạp** trước khi file này chạy?
3. Phần B BTP âm (check-out / kết ca) đi cùng 3B như phản hồi lượt 11 đã thống nhất — có hàm nào của phần B còn sót ở script chính?
