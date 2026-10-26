# Kết quả kiểm tra độc lập lượt 13 — kết ca / giao ca / đóng ngày

- Ngày kiểm: 26/10/2026, giờ Việt Nam.
- Nhánh: `Phan-tach-unit-engine`.
- SHA được kiểm: `52176ec52a932cfe654333166cb6d476849e97c5`.
- Đối chiếu chuyển mã với cha `e4100fd7d969bed11ba47a95a617ad1b9e8f544f`; đối chiếu hành vi với bộ Giáng sinh đã deploy `0bd95a7`.
- Đọc `KIEM_TRA_13_KET_CA.md`, `PHAN_HOI_KIEM_TRA_12.md` và kết quả kiểm lại lượt 12. Detached worktree riêng: `/workspace/work/review13`.
- Chỉ kiểm thử và báo cáo. Không sửa app/JS phát hành, không deploy, không ghi sổ phát hành. Các probe bổ sung là file tạm của tester; lỗi được cài vào bản sao deploy tạm.

## 1. Kết luận

**ĐẠT việc chuyển mã R của lượt 13 trong phạm vi đã kiểm.** Chưa tìm thấy lỗi hồi quy của app do tách file. Toàn bộ 28 kịch bản ở hai cửa hàng khớp bản nền, các tự kiểm cài lỗi đều bắt được sai lệch.

Có một sai lệch về mô tả độ phủ test cần sửa: **F13-1** bên dưới. Đây là vấn đề tài liệu/nghiệm thu, chưa phải lỗi sản phẩm. Không xem toàn bộ chuỗi kết ca 8 bước đã được nghiệm thu tích hợp chỉ từ các bài hiện có.

Điểm còn mở ở lượt 12 đã được kiểm thêm bằng một luồng cụ thể: mở ca → kiểm kê đầu ca → checklist bắt buộc → bán hàng, PIN thật trong fixture; cả GG01/GG02 đều nhả khóa. Nhánh có đếm bàn giao từ hôm trước và chuỗi kết ca 8 bước vẫn nằm ngoài probe này.

## 2. Chuyển mã và thứ tự chạy

Đối chiếu AST độc lập, so nguyên văn từng khai báo với script chính ở commit cha:

| Module | Số tên | Kết quả |
| --- | ---: | --- |
| `pos_shift_closing.v1.js` | 197 | Nguyên văn; không còn khai báo trùng trong script chính |
| `pos_handover.v1.js` | 44 | Nguyên văn; không còn khai báo trùng trong script chính |

Tổng **241/241**. Các khai báo còn lại trong script chính giữ nguyên, ngoại trừ `POS_MODS_THIET_YEU` bổ sung hai module. Chuỗi câu lệnh cấp cao không phải khai báo trong script chính giữ nguyên văn và thứ tự. `DOMContentLoaded`, timer hạn dùng và hai biến gọi `cfEmptyDenoms()` vẫn ở script chính.

Giá trị đầu của các biến mới là literal, cấu trúc dữ liệu, `Promise.resolve()` hoặc `new Set(...)`; không đọc localStorage/Firebase/DOM khi nạp. `shiftState` chỉ có một binding. Các chỗ dùng nó ở module `pos_shift` nằm trong thân hàm, không chạy trước khi `pos_shift_closing` nạp xong.

Hai module có dấu `'dang'`/`true`, retry chỉ khi chưa có dấu và được liệt kê là thiết yếu. Probe độc lập ở GG02 cho mỗi module, ba chế độ đủ file / 404 / ném lỗi giữa file:

- Đủ file: qua chốt dừng, đúng một timer `expirySoonTick`.
- Thiếu hoặc chạy dở: màn đỏ, chưa khởi động timer, không khai báo lexical lần hai.
- Sáu tổ hợp đều đạt; `e2e_0d` cũng có kiểm thiếu/chạy dở cả hai module.

## 3. Chạy lại các bài được yêu cầu

Đã `npm install --ignore-scripts`, sinh xong toàn bộ deploy rồi mới cho E2E đọc `ban_deploy`. Chromium: `/usr/bin/chromium`; E2E dùng HTTP cục bộ, chặn yêu cầu ra Firebase thật.

| Bài | Kết quả |
| --- | --- |
| `sh tools/sinh_lai_tat_ca.sh` | **TẤT CẢ ĐẠT**, 151 file test; 3 bộ thường/Giáng sinh/Tết sinh lại không tạo diff tracked |
| `node tools/check_boundaries.js` | RANH GIỚI SẠCH |
| `node tools/check_paths.js` | ĐƯỜNG DẪN SẠCH: 109 tên, 875 lời gọi, 54 động đã duyệt |
| `node tools/tach_posgieo/e2e_kho.js` | **717 khẳng định, ALL PASS**: 28 kịch bản × GG01/GG02 + 9 tự kiểm; 56 dump khớp ghi/toast/trạng thái/lỗi |
| `node tools/tach_posgieo/e2e_ban.js` | **36 khẳng định, ALL PASS**, kể cả tự cài lỗi |
| `node tools/tach_posgieo/e2e_hook.js` | **13 khẳng định, ALL PASS**, chuỗi 25 hàm khớp; tự kiểm bắt đúng 4 tên bị cài lỗi |
| `node tools/tach_posgieo/e2e_0d.js` | **45 PASS, 1 FAIL môi trường**, chi tiết dưới |
| `node tools/btp_am/e2e_btp_am.js` | **ALL PASS**, 4 nhóm tình huống × 1366/390 px; giới hạn F13-1 |
| `node tools/automation/e2e_shift_work.js` | **PASS ở 1366 và 390 px**; bài này dùng khung giao diện và hàm render giả, không phải toàn POS |
| `node tests/tach_posgieo_fb_gia.test.js` | **35 khẳng định, ALL PASS** |

Ca `file://` lỗi `net::ERR_BLOCKED_BY_ADMINISTRATOR` ngay khi điều hướng tới file local. Chạy riêng `page.goto('file:///workspace/work/review13/ban_deploy/giangsinh/posgieo.html')` tái hiện cùng lỗi. Không quy lỗi này cho đường dẫn module và **không báo `e2e_0d` ALL PASS**. HTTP và bản thử `?b=` đã qua.

Năm ca mới 3B ở hai cửa hàng đều khớp mốc: đối soát 900.000 → cash_passed/chốt đoạn ca; đối soát 850.000 → pending/lệch −50.000, chưa chốt đoạn; giao két e1 → e2 mở đoạn 2; đóng ngày ghi closed bởi e1; ca treo được check-out hộ lúc 15:10Z của ngày đã đóng. Trong snapshot, đối soát/giao ca/đóng ngày đều busy=false. Mọi lượt ghi S/C đúng tên gốc ở GG01 hoặc hậu tố __gg02 ở GG02; bài cài thêm lượt ghi sang cửa hàng khác bị bộ kiểm REG bắt.

## 4. Probe độc lập bổ sung

### 4.1 Mở ca → kiểm kê → checklist → bán hàng: đóng một phần khoảng trống lượt 12

Trong bản sao runner `e2e_kho.js`, dùng cùng bộ mốc và bản tách:

1. Sau khi đặt seed và bật `__SNAP`, gỡ **mọi** `_posLive` đăng ký trước khi seed sẵn sàng; chỉ đổi fixture, không đổi app.
2. Giữ resolver `resolveStaffPinAndCheckin` thật cho ca này. Nhân viên e1 PIN `1234`, đang check-in.
3. Mồi một NL `tra`: 1.000 g, `shiftCountTiming:'open'`; một việc `lau`: phase open, bắt buộc, thời gian tối thiểu 0.
4. Mở ca 1.200.000 bằng ô PIN thật. **Await `submitShiftOpen()` hoàn tất**, không dùng `Promise.race` 4 giây.
5. Màn kiểm kê có đúng một dòng; nhập 900 g qua `shiftInventoryCountSetQtyPOS`, PIN thật, await `submitShiftInventoryCountPOS()`.
6. PIN thật trên checklist, await `tickChecklistItem('lau')`; bấm nút thật có `onclick="finishOpeningChecklist()"`.
7. Kiểm `busy=false` sau mở ca, sau kiểm kê và khi kết thúc; màn active `sm`; người mở e1; phiếu lưu 900 g và checklist `lau`. Đếm số lần gọi tiếp `_continueAfterShiftInventoryOpenPOS`: đúng **1**.
8. Sentinel `daily_openings_gieogieo__gg03/2026-10-26` giữ nguyên; mọi lượt ghi được kiểm độc lập theo REG.

Kết quả: **30 khẳng định, ALL PASS**, gồm so mốc/bản tách ở GG01 và GG02 cùng hai tự kiểm:

```js
// Chỉ cài vào bản sao pos_shift_closing.v1.js:
// (a) Nhân đôi callback — phải lệch mục sau, callbacks=2.
if (phase === 'open') {
  await _continueAfterShiftInventoryOpenPOS();
  await _continueAfterShiftInventoryOpenPOS();
}
// (b) Trong dòng kiểm kê tổng: countedQty:l.counted → countedQty:l.counted+1
// Phải lệch mục ghi.
```

Cả hai lỗi đều bị bắt. Có 8 lượt ghi trong fixture đầy đủ, gồm daily_openings, shift_inventory_counts, shift_segments, shift_workflows và staff_target_days, đúng quán.

**Giải thích `busy=true` trước đây:** runner gốc `KB_CA` chỉ gỡ `employees`/`empShifts`; listener khác đăng ký lúc `__SNAP` chưa bật không có ảnh đầu, nên Promise sẵn sàng có thể chờ mãi trong mock. Gỡ hết bộ đệm trước lượt thử làm cả mốc và bản tách hoàn tất. Đây là giới hạn fixture, không phải bằng chứng lỗi do tách mã.

Lần probe thăm dò đầu tiên chỉ sửa listener/await nhưng giữ bảng kỳ vọng cũ đã báo FAIL tập bảng vì phát sinh thêm `shift_workflows` khi luồng đi tiếp. Hai bản vẫn khớp. Probe đầy đủ trên đã ghim đúng tập bảng và khẳng định trạng thái cuối; không bỏ qua failure đó để báo PASS.

**Đề nghị:** đưa ca đầy đủ cùng hai tự kiểm vào công cụ chính; ca `caMoCa` hiện có vẫn chỉ chứng minh phần log trong cửa sổ 4 giây. Không lấy việc hai bản cùng busy=true làm bằng chứng hoàn tất mở ca.

### 4.2 Chặn đóng ngày khi người khác quay lại ca; giao két đúng người

- Dùng fixture `ketDongNgay` đã bàn giao, mở màn checklist thật. Ngay trước ký đóng ngày, đổi `employee_shifts/.../s2.checkedOutAt` thành null, gỡ listener `empShifts` để đọc lại dữ liệu mới.
- Ở cả GG01/GG02: báo nhân viên đang trong ca, **không ghi status closed**, nhả `_posSubmitBusy`; kết quả khớp mốc.
- Chạy lại giao ca e1 → e2. Cài lỗi vào bản sao `pos_handover.v1.js`: `custodianId: h.in.byId` → `custodianId: 'e1'`. Bộ so sánh bắt lệch `ghi`.
- **47 khẳng định, ALL PASS** cho runner bổ sung. Lần dựng probe đầu tiên dùng nhầm mẫu tìm `inEmp.id`, công cụ từ chối vì không cài được lỗi; đã sửa đúng biểu thức hiện hữu `h.in.byId` và chạy lại toàn bộ hai ca này, đạt.

### 4.3 Độ tin cậy Firebase giả

Ngoài 35 bài chính, chạy độc lập qua Node VM sáu probe: union map đảo thứ tự khóa không nhân đôi; remove map đảo thứ tự khóa; set không merge vẫn dùng nền mảng cũ nhưng bỏ trường thường; update đường lồng so map sâu; transaction lỗi sau transform không áp dụng nửa chừng; retry áp đúng một lần. **6/6 PASS**, F12-1 vẫn đóng.

Các giới hạn vẫn còn: bỏ qua orderBy/limit, increment xấp xỉ, onSnapshot một ảnh đầu. Vì vậy đây là so hành vi trên fixture và kiểm những bất biến cụ thể, không phải chứng nhận Firebase SDK đầy đủ hoặc dữ liệu production.

## 5. Finding F13-1 — tài liệu nhận quá phạm vi E2E đếm BTP cuối ca

**Mức nhẹ, cần sửa mô tả độ phủ; không phải lỗi runtime được tái hiện.**

`docs/tach_posgieo/KIEM_TRA_13_KET_CA.md`, mục 5 ghi rằng `e2e_btp_am` «đi qua đếm BTP cuối ca + phần B». Thực tế `tools/btp_am/e2e_btp_am.js`:

- Dùng `extractRaw` một danh sách hàm, không tải toàn bộ POS.
- Chạy kiểm hạn đầu ca, chuông, kiểm hạn trước check-out và câu hỏi BTP bán không lô lúc check-out.
- Không trích/chạy `renderPrepCountScreen`, `renderPrepCountCard` hoặc `submitPrepCount` (các hàm này ở module mới, lần lượt quanh dòng 2108/2149/2341).

Tái kiểm chỉ đọc:

```sh
rg -n 'extractRaw|renderPrepCountScreen|renderPrepCountCard|submitPrepCount' tools/btp_am/e2e_btp_am.js
```

Không có ba hàm đếm cuối ca trong bài đó. Unit test có kiểm một số hàm BTP, nhưng không thay thế E2E luồng này. Đề nghị sửa câu mô tả; nếu muốn nghiệm thu đếm BTP cuối ca trên browser thì thêm một ca đi qua màn đếm → lưu → callback tiếp tục, so với mốc, kèm lỗi cài để chứng minh bài bắt được sai lượng/nhân đôi callback.

## 6. Trả lời ba câu phản biện

1. **Giữ hai file là hợp lý trong lần tách này.** Không có yêu cầu phải gộp để chạy đúng. Hai file đều thiết yếu và cùng tải trước main; tách như vậy giúp phân biệt giao két/đóng ngày với kiểm kê/đối soát. Chưa có phép đo chứng minh giảm CPU/RAM; không coi chia file tự nó là tối ưu tài nguyên. `pos_shift_closing` vẫn lớn (~3.251 dòng), có thể phân nhỏ ở lượt R riêng sau khi chốt phạm vi.
2. **Không thấy đọc `shiftState` quá sớm.** Một binding, literal initializer, lời gọi phụ thuộc chạy sau khi đủ module; AST, startup và probe thiếu/chạy dở đều khớp.
3. **Phần B đã chuyển cùng 3B.** Các khai báo `prepUntracked*`, `prepShortage*`, `_prepUntrackedAsk`, `_prepShortAsk` và hằng liên quan nằm trong `pos_shift_closing`, không còn khai báo bản sao inline. `doCheckOut` ở `pos_shift` vẫn gọi vào đúng binding; bài BTP xác minh câu hỏi, lưu lựa chọn, callback check-out đúng một lần và không hỏi lại.

## 7. Giới hạn nghiệm thu

- Chưa chạy một phiên nối trọn 8 bước kết ca; chưa E2E browser bước đếm BTP cuối ca như F13-1.
- Chưa phủ hết cash_variance_recorded, giao ca lệch/đếm chung/bill chen giữa, chặn đóng ngày do bill mới hoặc việc bắt buộc, qua nửa đêm VN.
- Probe mở ca bổ sung có kiểm kê và checklist, không có dòng đếm bàn giao tồn từ hôm trước, không có lô hết hạn; không suy rộng sang mọi cấu hình mở ca.
- So log/tập bảng và sentinel chứng minh phạm vi fixture. Chưa kiểm hai cửa hàng production chạy đồng thời, APK, máy in thật hay Firebase thật.
- Giới hạn file:// là của môi trường kiểm, phải giữ riêng khi tổng hợp kết quả.

Log và probe tái hiện của phiên tester nằm dưới `/workspace/work/review13-*.log`, `review13-dump/`, `review13-extra-dump/`, `review13-block-dump/`; script tạm trong `review13/tools/tach_posgieo/*.tester.js`. Chỉ báo cáo này được đưa lên nhánh.
