# Kiểm tra lượt 14 — Đợt 3C (quỹ tiền mặt + mở két → `js/posgieo/pos_cashfund.v1.js`)

> **Dành cho agent kiểm tra độc lập.** Kế hoạch mục 9 Đợt 3 (`pos_cashfund`). Chủ dự án 26/10: chỉ tách, giữ đúng thao tác → **R thuần**.
> 3A và 3B đã kiểm lại ĐẠT (`KET_QUA_KIEM_TRA_LAI_12_1B67D446.md`, `KET_QUA_KIEM_TRA_LAI_13_C96B47C63.md`). Đây là phần cuối Đợt 3. Chưa deploy, chưa ghi sổ phát hành.

## 1. Chuyển mã (`chuyen.js --dai 2970-2976,6849-6911,7073-7404`, HEAD trước commit = `c8b6e8f`)

| Dải | Nội dung | Tên |
| --- | --- | --- |
| 2970–2976 | Hằng + trạng thái quỹ: `CF_PASSWORD`, `CASH_DENOMS`, `cfEmptyDenoms`, `cfDateKey`, `_cfDoc`, `_cfCheckoutDenoms` | 6 |
| 6849–6911 | **[MỞ KÉT]** mở két tay ở màn bán: `CASH_DRAWER_REASONS`, `_cashDrawerReason`, `openCashDrawerSheetPOS`, `cashDrawerPickReasonPOS`, `confirmCashDrawerOpenPOS` (ghi `cash_drawer_logs_gieogieo`) | 5 |
| 7073–7404 | Màn **Quỹ tiền mặt** (`#cashfundScreen`): `cfDocRef`, `cfLoadTodayDoc`, `getTodayCashRevenue`, lưới mệnh giá `cfRenderDenomGrid` / `cfDenomTotal`, mật khẩu `cfRequirePassword`, `loadCashFundScreen`, `cfRenderDashboard`, form mở / giữa / kết ca quỹ (`cfShowForm`, `cfSubmitForm`…), chi tiêu (`cfShowExpenseForm`, `cfSubmitExpense`…), `cfApplyCheckoutToFund`, `cfSuggestChangeBreakdown` | 23 |

- **34 tên**, 0 lệnh tự chạy. Kiểm (a)–(e) đạt. Cảnh báo: 4 giá trị đầu `cfEmptyDenoms()` (`_cfCheckoutDenoms`, `_cfFormDenoms`, `_cfExpenseOut`, `_cfExpenseChange`). `cfEmptyDenoms` là khai báo hàm trong cùng file, chỉ đọc `CASH_DENOMS`, mà `CASH_DENOMS` khai báo trước trong file. Không đọc trạng thái máy.
- **Ghi chú**: màn Quỹ tiền mặt đã bị chủ dự án huỷ từ trước (`[HIDDEN-CHANGE]` mục 11). Mục sidebar `display:none`, `cfLoadTodayDoc()` lúc khởi động đã tắt, nên `_cfDoc` luôn null khi chạy thật.
  - `cfApplyCheckoutToFund`, `cfSuggestChangeBreakdown`, `_cfCheckoutDenoms`, `getTodayCashRevenue` **không có chỗ gọi nào ngoài file**. Đã kiểm bằng grep cả bộ: chỉ còn chú thích. Vẫn chuyển nguyên văn, không xoá (chỉ tách).
  - Phần **còn sống**:
    - lưới đếm mệnh giá `cfEmptyDenoms` / `cfRenderDenomGrid` / `cfDenomTotal`, dùng bởi `pos_shift` (mở ca), `pos_shift_closing` (kết ca), `pos_handover` (giao ca);
    - nút **Mở két** `#drawerBtn` trên màn bán.
- **Ở lại script chính, đúng chỗ cũ**: `let _shiftOpenDenoms = cfEmptyDenoms(); let _shiftCloseDenoms = cfEmptyDenoms();`. Lời gọi này chạy lúc nạp script chính. Lúc đó `pos_cashfund.v1.js` đã chạy (thẻ nạp ở `<head>`), và chốt `POS_MODS_THIET_YEU` (dòng ~2454) đứng trước dòng này, nên thiếu file thì màn đỏ chặn trước, không ném `ReferenceError` giữa chừng.
- HTML: thẻ `js/posgieo/pos_cashfund.v1.js` + `#pgCashfundRetry` ngay sau `#pgHandoverRetry`; `POS_MODS_THIET_YEU` thêm `cashfund`. Lý do: lưới đếm của mở / kết / giao ca gọi thẳng, nên thiếu file thì phải màn đỏ, không để bán nửa chừng.
- `e2e_0d` ca (11) thêm `pos_cashfund.v1.js`.
- Test đọc thô `posgieo.html`: đã rà mọi test chứa 34 tên. Chỉ `e2e_kho` (mới thêm) và `da_cua_hang_b3` (kiểm REG `cash_drawer_logs`, không đọc mã), không test nào mất độ phủ.

## 2. `e2e_kho.js` — 5 kịch bản 3C

Điều kiện chung:
- chạy ở gg01 + gg02, so với `0bd95a7`;
- giờ cố định, phạm vi quán kiểm theo REG, ghim tập bảng.

Mồi: e1 (PIN 1234) một mình trong ca, nên ô người mở két tự điền như ngoài quầy. Cờ `quyDoc`: quỹ hôm nay đã mở 1.000.000 (khoá). Máy in Bill giả (`POSPrinter.connected` / `engine.openDrawer`) gán giống nhau ở hai bản.

| Kịch bản | Đường đi | Khẳng định riêng | Bảng |
| --- | --- | --- | --- |
| `quyMoCa` | `showScreen('cashfundScreen')` → chưa có quỹ → form tự do → 2 × 500.000 + 1 × 100.000 → nút Xác nhận | form hiện, không hỏi mật khẩu; `set` cashfund/2026-10-26 quỹ 1.100.000 `locked`, tồn mệnh giá; hỏi xác nhận 1 lần; toast | cashfund |
| `quyChiTieu` | quỹ đã mở → nút «+ Ghi chi tiêu», mật khẩu **sai** → nút lại, mật khẩu đúng → lấy 1 × 100.000, thối 1 × 20.000 → Xác nhận chi tiêu | sai mật khẩu: toast, không vào form; `update` `expenses` arrayUnion (chi 80.000) + `currentDenominations.100000` −1 / `.20000` +1, không đụng mệnh giá khác | cashfund |
| `quyKetCa` | quỹ 1.000.000 + 1 bill tiền mặt 50.000 hôm nay → «Kết ca ngày hôm nay» → đếm 1.000.000 | `close` { doanh thu tiền mặt 50.000, kỳ vọng 1.050.000, lệch −50.000 }; toast | cashfund |
| `moKet` | `openCashDrawerSheetPOS` → 4 lý do, người ký tự điền NV Một → «Khác» không ghi chú (bị chặn) → «Đổi tiền lẻ» → bấm nút Mở két thật | lệnh mở két đúng 1 lần, đóng tấm; `add` nhật ký { Đổi tiền lẻ, e1, 26/10 }; toast | cash_drawer_logs |
| `moKetLoi` | máy in chưa kết nối → không mở tấm; kết nối nhưng lệnh ném lỗi | không lượt ghi nào; tấm còn, nút bật lại; toast lỗi | (không) |

Tự kiểm mới, cài lỗi vào bản sao `pos_cashfund.v1.js`:
- số tiền chi +1 → `quyChiTieu` báo lệch mục `ghi`;
- đổi người mở két trong nhật ký → `moKet` báo lệch mục `ghi`.

## 3. Chạy lại

```sh
sh tools/sinh_lai_tat_ca.sh                 # TẤT CẢ ĐẠT
node tools/check_boundaries.js              # RANH GIỚI SẠCH
node tools/check_paths.js                   # ĐƯỜNG DẪN SẠCH (109 tên, 875 lời gọi, 54 động) — không đổi
node tools/tach_posgieo/e2e_kho.js --chi quyMoCa,quyChiTieu,quyKetCa,moKet,moKetLoi   # 130 khẳng định ALL PASS
node tools/tach_posgieo/e2e_kho.js          # 910 khẳng định, ALL PASS
node tools/tach_posgieo/e2e_0d.js; node tools/tach_posgieo/e2e_ban.js; node tools/tach_posgieo/e2e_hook.js   # ALL PASS
node tools/btp_am/e2e_btp_am.js             # ALL PASS
node tools/automation/e2e_shift_work.js     # ok 1366px + 390px (bản sao trỏ /opt/pw-browsers/chromium)
```

## 4. Giới hạn

- Mở két: máy in giả, chưa thử két thật trên APK.
- Các nhánh chưa so mốc:
  - mở két có PIN gõ tay (nhiều người trong ca / «Đổi người»);
  - mở két mất mạng lúc ghi nhật ký;
  - quỹ giữa ca (`mid`), sửa lại số đầu ca (`overrideLogs`), kết ca không có bill.
- Firebase giả: `increment` ghi số gia (không cộng dồn thật), orderBy / limit bỏ qua.

## 5. Kết quả cả bộ `e2e_kho`

35 kịch bản × gg01/gg02 + 14 tự kiểm → **910 khẳng định, ALL PASS** (gồm 780 khẳng định cũ, không hồi quy).

## 6. Điểm nhờ người kiểm phản biện

1. Gộp **mở két** (đang dùng) với **màn quỹ tiền mặt** (đã huỷ, mã còn nguyên) vào một file `pos_cashfund`: có hợp lý không, hay nên tách mở két riêng?
2. `pos_cashfund` vào `POS_MODS_THIET_YEU` vì lưới mệnh giá của mở / kết / giao ca gọi thẳng. Tôi đã rà (grep khai báo cấp cao): `pos_shift` / `pos_shift_closing` / `pos_handover` (nạp TRƯỚC `pos_cashfund`) chỉ gọi `cfEmptyDenoms` / `cfRenderDenomGrid` / `cfDenomTotal` trong thân hàm — nhờ kiểm lại có lời gọi **lúc nạp** nào sót không.
3. `CF_PASSWORD` (mã bí mật, việc chờ «chuyển mã vào backend») nay nằm trong file JS thay vì HTML. Mức lộ không đổi (cùng được phục vụ công khai), không đổi giá trị. Có ý kiến khác không?
