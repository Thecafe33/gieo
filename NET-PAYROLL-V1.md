# NET — PAYROLL (LƯƠNG / CHẤM CÔNG) — V1

> Nguồn: `FIFO-CHAIN-TRACE-PAYROLL-V1.md` đối chiếu với `src/layers/hr/shift.js`,
> `src/layers/hr/employee.js`, `src/layers/hr/work-schedule.js`,
> `src/layers/hr/payroll.js`, `src/layers/commands/shift.js`.
>
> Áp dụng §2.3a. Domain này đã được `NET-REVERSAL-CORRECTION-V1.md` (dòng
> 78-81, 129-132) treo sẵn một câu hỏi mở: "`ContainerFound` có hoàn khoản trừ
> trách nhiệm nhân viên (payroll) không" — xác nhận ở phần cuối file này.

## Sơ đồ luồng (PR1 → PR6, theo đúng thứ tự chain-trace gốc)

```
PR1 Check-in ──► Shift{payTermsRef SNAPSHOT đọc lại được}
        │
PR2 Sửa chấm công sai (attendance correction)
        │
PR3 Tính lương ──► computePayroll() đọc payTermsRef, KHÔNG đọc Employee hiện tại
        │
PR4 "Chốt lương tháng" ──► closePayroll() (pattern book_closing)
        │
PR5 KPI Labor/Cup, Labor/Bill (kế thừa PR3)
        │
PR6 Nghỉ phép/vắng mặt — công thức trừ lương cứng
```

---

## PR1 — Check-in

| | |
|---|---|
| **Hệ cũ** | `posgieo.html:13939-13973` ghi `employee_shifts{checkedInAt, checkedOutAt:null, payTerms{...} SNAPSHOT}` — snapshot có ghi nhưng KHÔNG BAO GIỜ đọc lại (0 kết quả grep), tính lương join `employees_gieogieo` hiện tại. Check-in bản thân KHÔNG BỊ CHẶN dù nhân viên chưa có payTerms nào — thiếu thì tính lương sau bằng giá hiện tại (chính là bug [3]). |
| **Hệ mới** | `commands/shift.js` → `CheckIn`, dựa trên `hr/shift.checkIn()` |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM** — nhưng có **⚠️ ĐIỂM CẦN RÀ THEO §2.3a** |
| **Ghi chú** | Đã đọc trọn. `checkIn()` snapshot `payTermsRef` qua `versionRegistry.snapshotRef()` — con trỏ ĐỌC LẠI ĐƯỢC (khác legacy: field chết). `computeWage()` chỉ nhận `shift.payTermsRef`, không có tham số nào cho Employee hiện tại — chặn tái lặp bug bằng chữ ký hàm. **NHƯNG: nếu nhân viên CHƯA có PayTerms hiệu lực tại thời điểm check-in, `checkIn()` trả `PRECONDITION` và TỪ CHỐI CHECK-IN HOÀN TOÀN — không có cờ thoát nào.** Legacy KHÔNG có block này (luôn cho check-in). Vì `isCheckedIn()` gate 23 điểm `requireCheckedIn()` ở POS (kho, BTP, bill, checklist, giao ca — theo chính chain-trace [2]), một nhân viên mới chưa kịp công bố PayTerms sẽ KHÔNG VÀO ĐƯỢC CA — tức không thao tác được gì ở POS. **Đây là hard-block MỚI ảnh hưởng trực tiếp flow vận hành sống mà hệ cũ không có — đúng loại tình huống §2.3a yêu cầu phải xét lại**: nên cân nhắc cho phép check-in với `payTermsRef: null` + `needsReview`/GAP-flag (tính lương ca đó treo chờ bổ sung PayTerms), thay vì chặn cứng ngay lúc vào ca. ⚪ **CHƯA QUYẾT — đưa vào cùng đợt quyết định chủ quán về PRECONDITION đã treo ở Sales/Raw Material/BTP**, vì bản chất giống nhau: core mới đúng về nguyên tắc dữ liệu (không đoán lương) nhưng chặn một hành vi vận hành mà hệ cũ luôn cho phép. |

## PR2 — Sửa chấm công sai

| | |
|---|---|
| **Hệ cũ** | `quanlygieo.html:13669-13738` (`ccSaveEdit`/`ccSubmitAdd`/`ccDelete`) — chức năng không đứt, nhưng: (a) không ghi audit log khi sửa (khác Lịch làm việc có `logAudit`), (b) side-effect chưa tài liệu hoá: sửa ca "hôm nay đang mở" tắt `isEmployeeCheckedInToday()` → khoá âm thầm 23 điểm actor-gate. |
| **Hệ mới** | `hr/shift.reviseShift()` |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM — nay ĐÃ NỐI vào tầng command** ✅ |
| **Ghi chú** | Đã đọc trọn. `reviseShift()` đóng cả 2 gap: bắt buộc `actorId`/`operationId`/`reason` (validate ngay, comment code tự nhận "legacy thiếu audit ở đúng chỗ này"), append-only `revisions[]` giữ `before`/`after` để trả lời "số nào từng đúng", và **trả về event `EmployeeCheckedInStateChanged` NGAY TRONG GIÁ TRỊ TRẢ VỀ** khi sửa làm đổi trạng thái mở/đóng của ca hôm nay — đúng ý đồ "không để caller tự nhớ phát event" mà comment code nêu rõ. **CẬP NHẬT (quyết định chủ quán "tìm chỗ nối vào hợp lý")**: `commands/payroll.js` nay có `ReviseAttendance` — wrap `reviseShift()` đúng pattern `CheckIn`/`CheckOut`, dùng `revisionRef` do caller cấp làm id xác định (cùng vai trò `wasteRef`/`adjustRef`), đăng ký trong `bootstrap/runtime.js COMMANDS`. Domain logic không đổi, chỉ thêm đường thực thi. `autoCloseIfStale()` (tự đóng ca treo qua ngày) VẪN 0 caller — `business-day.js` không gọi tới, còn treo (xem VIỆC PHẢI LÀM). |

## PR3 — Tính lương

| | |
|---|---|
| **Hệ cũ** | `quanlygieo.html:3068-3176` — đọc đúng giờ công (`checkedInAt`/`checkedOutAt`), nhưng đọc SAI NGUỒN lương: `employees_gieogieo` HIỆN TẠI (`loadEmployees()`, live) thay vì `employee_shifts.payTerms` đã snapshot. 🔴 ĐỨT CHUỖI: đổi lương/xoá nhân viên giữa tháng làm lương LỊCH SỬ trôi theo giá trị hiện tại. |
| **Hệ mới** | `hr/payroll.js` → `computePayroll()` |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM ở tầng domain — nay ĐÃ CÓ ĐƯỜNG DÙNG THẬT qua `ClosePayroll`** ✅ |
| **Ghi chú** | Đã đọc trọn. Đóng đúng ĐỨT CHUỖI: giờ công tính qua `shiftLib.computeWage(sh)` (đọc `payTermsRef` snapshot, không đọc Employee hiện tại); yêu cầu MỌI shift phải `status === CLOSED` mới tính (PRECONDITION nếu còn ca mở — "không chốt lương khi còn ca mở", đây là block hợp lý, KHÔNG mới so với tinh thần legacy vì bản chất là "chưa xong thì chưa tính"). Lương cứng resolve PayTerms theo TỪNG NGÀY qua `registry.resolveDaily()` — đúng nguyên tắc versioning đã áp cho Recipe/Packaging/BTP-yield/PayTerms(check-in)/KPI-target — code tự gọi đây là closing 3 gap ("Ba gap đang đóng"). **CẬP NHẬT (quyết định chủ quán "tìm chỗ nối vào hợp lý")**: `computePayroll()` vẫn là bước TÍNH thuần tuý (không tự thành command riêng, đúng như mọi report khác) — nhưng kết quả của nó giờ có nơi ĐI TỚI thật: `commands/payroll.js ClosePayroll` nhận `input.results` (mảng `computePayroll()` đã chạy sẵn cho từng nhân viên trong kỳ, do caller/UI cung cấp) rồi mới gọi `closePayroll()` để chốt. Đồng thời `computePayroll()` nay còn nhận `spec.liabilities` (khoản trừ trách nhiệm nhân viên — xem mục Liên kết chéo domain bên dưới) và trừ thẳng vào `total`, kèm gap ở `needsReviewDetail` khi liability thiếu `employeeId`/`costBasis`. Route đọc riêng cho `computePayroll()`/`readPayrollForMonth()`/`detectPayrollDrift()` qua `reporting/report-queries.js` **VẪN CHƯA LÀM** (xem VIỆC PHẢI LÀM) — nhưng không còn là "không có route nào để dùng logic mới", vì đường ghi (chốt lương) đã thông. |

## PR4 — "Chốt lương tháng"

| | |
|---|---|
| **Hệ cũ** | 🔴 **GAP — chưa từng tồn tại.** `renderEntryLuong()` tính lại LIVE mỗi lần mở tab, không collection lưu snapshot, không nút chốt, không export/in phiếu lương. Khác hẳn `book_closings_gieogieo` (đã có cho P&L chung). Rủi ro: xem lương tháng 8 hôm nay và xem lại sau khi sửa chấm công/đổi lương ra 2 số khác nhau, không ai biết số nào "đã trả". |
| **Hệ mới** | `hr/payroll.js` → `closePayroll()` + `readPayrollForMonth()` + `detectPayrollDrift()` |
| **Phân loại** | 🟢 **THÊM MỚI ở tầng domain — nay ĐÃ NỐI vào tầng command** ✅ |
| **Ghi chú** | Đã đọc trọn. `closePayroll()` tái dùng ĐÚNG pattern `book_closing`: `payrollClosingId` xác định, `revisionNo`/`supersedesClosingId` cho correction (giữ v1, không xoá khi sửa lại), đóng băng `lines` per-employee. Có gate `needsReview` — nếu bất kỳ kết quả nào cần review mà `!spec.acknowledgeReview` thì từ chối chốt, liệt kê nhân viên liên quan (hợp lý: không chốt lương âm thầm khi có ca `autoClosed`/`needsReview` chưa xử lý — không phải block mới kiểu §2.3a vì đây là hành động CHỐT một kỳ, tương đương "không chốt sổ khi còn treo" vốn đã là chuẩn của `book_closing`). `readPayrollForMonth()` trả `{source:'CLOSING', frozen:true}` khi có bản chốt, `{source:'LIVE', frozen:false}` khi chưa — chính là cơ chế làm "xem lương tháng 8 hôm nay" và "xem lại sau khi sửa chấm công" RA CÙNG MỘT SỐ, đóng đúng gap chain-trace [4]. `detectPayrollDrift()` mirror đúng hợp đồng phát hiện trôi số của `book_closing` §3.2. **CẬP NHẬT (quyết định chủ quán "tìm chỗ nối vào hợp lý")**: `commands/payroll.js` nay có `ClosePayroll` — wrap `closePayroll()` đúng pattern `book_closing` commands khác, đăng ký trong `bootstrap/runtime.js COMMANDS`. Cùng trong mutation này, `ClosePayroll` còn duyệt `closed.value.lines[].appliedLiabilityIds` (khoản trừ trách nhiệm nhân viên đã đóng băng vào từng dòng lương) và chuyển các `hr/liability` tương ứng sang `DEDUCTED` NGAY — không đợi L9 (xem Liên kết chéo domain). `readPayrollForMonth()`/`detectPayrollDrift()` vẫn CHƯA có route đọc qua `reporting/report-queries.js` (xem VIỆC PHẢI LÀM) — chỉ đường GHI (chốt lương) đã thông, đường ĐỌC báo cáo lương tháng vẫn còn thiếu. |

## PR5 — KPI Labor/Cup, Labor/Bill

| | |
|---|---|
| **Hệ cũ** | KHÔNG ĐỨT — so sánh thật với `targets.laborCupTarget`/`laborBillTarget`, nhưng KẾ THỪA bug [3]: KPI ngày cũ trôi theo giá lương hiện tại. |
| **Hệ mới** | Không có domain KPI-lương riêng được đọc trong lượt này — kế thừa trực tiếp `computePayroll()`/`resolveConfigDaily()` (đã xác nhận "instance #6" ở `NET-ALERTS-V1.md` AL5) |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM (suy luận từ PR3)** — chưa đọc riêng file KPI |
| **Ghi chú** | Vì `computePayroll()` giờ dùng `payTermsRef` versioned thay vì Employee hiện tại, KPI ngày cũ SẼ không còn trôi MIỄN LÀ nó đọc kết quả qua `computePayroll()`/`readPayrollForMonth()` thay vì tự join Employee hiện tại lần nữa. Chưa xác nhận trực tiếp vì chưa đọc file KPI liên quan — và vì PR3/PR4 đang orphaned, KPI-lương thực tế CŨNG chưa có gì để nối vào. Không mở rộng NET này thêm vì không tìm thấy file `hr/kpi*`/`finance/kpi*` chuyên biệt cho labor KPI trong đợt đọc — nếu có, cần một lượt xác nhận riêng khi tới domain Reporting/KPI. |

## PR6 — Nghỉ phép / vắng mặt (công thức trừ lương cứng)

| | |
|---|---|
| **Hệ cũ** | GAP có chủ đích: lương giờ vắng mặt tự động 0 giờ (ĐÚNG, giữ nguyên). Lương cứng cộng đều mọi ngày, KHÔNG kiểm tra `work_schedules`/có chấm công hay không — nghỉ dài ngày không tự trừ. Legacy để ngỏ câu hỏi công thức. |
| **Hệ mới** | `hr/work-schedule.js` (mới, bắt buộc cho payroll) + `hr/payroll.js computePayroll()` |
| **Phân loại** | 🟡 **GIỮ** (lương giờ = 0 khi vắng) + 🟢 **THÊM MỚI** (công thức trừ lương cứng theo lịch làm việc) |
| **Ghi chú** | Đã đọc trọn cả 2 file. **Câu hỏi mở của chain-trace ĐÃ ĐƯỢC CHỦ QUÁN QUYẾT**, ghi rõ trong header `work-schedule.js`: "Chủ quán đã chốt: lương cứng trừ theo lịch làm việc." `scheduleLib.reconcile()` tách 4 nhóm: `worked`/`absent` (cơ sở trừ)/`excusedAbsent` (không trừ — khái niệm nghỉ phép MỚI, legacy không phân biệt được nghỉ phép với nghỉ không báo)/`unscheduled` (đi ngoài lịch, không cộng thêm nhưng vẫn thấy được). `computePayroll()` dùng đúng: nếu nhân viên có lương cứng mà KHÔNG có `scheduleDays` thì từ chối tính (PRECONDITION — "không trừ được ngày vắng nếu không biết ngày nào phải đi làm", hợp lý vì đây không phải chặn thao tác vận hành sống mà chặn một phép TÍNH khi thiếu input, giống style RM/BTP shortfall nhưng ở ngữ cảnh tính lương cuối kỳ chứ không phải giao dịch trực tiếp — không xếp vào nhóm §2.3a). **Phát hiện phụ: comment cũ trong `hr/employee.js publishPayTerms()`** ("công thức trừ theo lịch làm việc còn để ngỏ, xem README 'Điểm còn treo'. Không tự quyết thay chủ quán") **MÂU THUẪN với quyết định đã chốt ở `work-schedule.js`/`payroll.js`** — đây là comment lỗi thời (viết trước khi chủ quán quyết, chưa được cập nhật lại). Đã tự sửa comment này trong lượt NET này (xem VIỆC PHẢI LÀM). |

---

## Liên kết chéo domain

| Domain | Điểm nối |
|---|---|
| **Reversal/Correction** | Câu hỏi treo ở `NET-REVERSAL-CORRECTION-V1.md` (dòng 78-81, 129-132): "`ContainerFound` có hoàn khoản trừ trách nhiệm nhân viên (payroll) không" — **ĐÃ TRẢ LỜI VÀ THI CÔNG (quyết định chủ quán, mục 4: "hệ thống mới cần quy trách nhiệm rõ ràng, do FIFO phải truy xuất được")**. Domain con mới `hr/liability.js` mô hình hoá đầy đủ: state machine `PENDING → {WAIVED, DEDUCTED, REVERSED}`, `WAIVED/DEDUCTED → REVERSED` (terminal). Vòng đời đầy đủ: `commands/approval.js ApproveLostContainer` tạo liability `PENDING` với `computeLiabilityAmount(unit)` dùng ĐÚNG `Unit.costBasis.unitCost` thật (không đoán số) — nếu unit là legacy-seeded (`costBasis: null`) thì `amount: null` + `gap: true`, không chặn duyệt mất container (đúng §2.3a: thiếu metadata → GAP-flag, không chặn); tương tự nếu không khớp được `employeeId` từ `actorId` báo mất (qua `input.employees` do caller cấp, pattern "denormalized input" quen thuộc) thì để `employeeId: null` + gap reason, không chặn. `commands/inventory.js RestoreFoundContainer` REVERSE liability nếu container sau đó tìm lại được (`input.liability`, PENDING/WAIVED → REVERSED). `hr/payroll.js computePayroll()` gọi `liabilityLib.pendingFor(spec.liabilities, employeeId)` để trừ PENDING liabilities có `amount` số thật vào `total`, đưa liability thiếu số vào `needsReviewDetail` (không đoán, không tính 0). `commands/payroll.js ClosePayroll` đóng băng khoản trừ vào `lines[].liabilityDeduction`/`appliedLiabilityIds`, rồi chuyển các liability tương ứng sang `DEDUCTED` NGAY trong cùng mutation (không đợi L9, tránh thêm event mồ côi thứ 9). Toàn bộ vòng đời chạy ĐỒNG BỘ trong plan của command tương ứng — không có consumer L9 nào cần cho luồng này. Sửa kèm: bug đặt tên event trùng — `ApproveLostContainer` từng phát `{type:'ContainerFound', direction:'LOST_APPROVED'}` trùng `type` với event "tìm lại được" thật của `RestoreFoundContainer`; đã đổi thành `ContainerLostApproved`. |
| **Loyalty/Reversal/Raw Material/BTP/Alerts (L9)** | `reviseShift()`'s `EmployeeCheckedInStateChanged` VÀ `commands/shift.js`'s `CheckIn`/`CheckOut` cùng phát event này nhưng KHÔNG CÓ CONSUMER nào (grep xác nhận) — **domain thứ 6 xác nhận phụ thuộc gap L9** (sau Loyalty, Reversal, Raw Material RM6, BTP B1, Alerts). |
| **Sales/Raw Material/BTP (PRECONDITION không cờ thoát)** | PR1's block check-in khi thiếu PayTerms là case MỚI cần gộp vào cùng đợt quyết định chủ quán, dù bản chất khác (chặn VÀO CA, không chặn MỘT GIAO DỊCH) — mức ảnh hưởng vận hành còn rộng hơn vì chặn toàn bộ khả năng thao tác của nhân viên đó trong ngày. |
| **BTP** | `hr/payroll.js`'s header tự gọi PayTerms-versioning là "Ba gap đang đóng"; `hr/employee.js publishPayTerms()` tự gọi đây là "instance #5" của lớp lỗi versioning đã xác nhận 7 lần (cùng họ với Recipe/Packaging/BTP-yield/KPI-target/Config — đã thấy ở BTP B2 và Alerts AL5). |

---

## TỔNG KẾT PHÂN LOẠI

- 🟢 THÊM MỚI: **PR4** (PayrollClosing — chưa từng tồn tại ở hệ cũ), **PR6 phần lương cứng** (công thức trừ theo lịch làm việc — quyết định mới, legacy để ngỏ), **khoản trừ trách nhiệm nhân viên** (`hr/liability.js` — chưa từng tồn tại ở hệ cũ, hệ cũ chỉ ghi nhận mất container rồi chủ quán tự đối chiếu cuối tháng không lưu vết)
- 🟡 GIỮ, ĐỔI CÁCH LÀM: **PR1, PR2, PR3, PR5, PR6 phần lương giờ** — logic domain đúng, đóng cả 3 gap chain-trace nêu ở tầng thiết kế ([3] payTerms-write-chết, [4] chưa có chốt lương, [6] công thức nghỉ phép để ngỏ); **PR2, PR3, PR4 nay đều đã có đường thực thi thật qua `commands/payroll.js`**
- ⚪ CHƯA QUYẾT (gộp vào quyết định chung PRECONDITION-không-cờ-thoát với Sales/Raw Material/BTP): **PR1** — check-in bị chặn cứng khi thiếu PayTerms, hard-block MỚI so với legacy. Đây là mục DUY NHẤT còn treo trong domain này.

**Phát hiện nổi bật của domain này (đã cập nhật)**: trước đợt này, `hr/payroll.js` (PR3+PR4) và `hr/shift.reviseShift()` (PR2) đóng đúng logic domain nhưng hoàn toàn chưa nối tầng command — khoảng cách "logic đúng" và "dùng được" xa nhất trong các domain đã khảo sát. **Quyết định chủ quán (mục 2 và 3: "thiếu thì thêm vào" / "tìm chỗ nối vào hợp lý") đã đóng khoảng cách này**: `commands/payroll.js` (file mới) nay có `ReviseAttendance` (wrap `reviseShift()`) và `ClosePayroll` (wrap `closePayroll()`), cả hai đăng ký trong `bootstrap/runtime.js COMMANDS` theo đúng pattern `commands/shift.js`. Đồng thời, quyết định chủ quán mục 4 đóng luôn câu hỏi mở lớn nhất còn lại của domain này — khoản trừ trách nhiệm nhân viên khi mất container — bằng domain con mới `hr/liability.js`, nối xuyên suốt `ApproveLostContainer → RestoreFoundContainer → computePayroll → ClosePayroll` (xem Liên kết chéo domain). Còn lại đúng MỘT mục treo thật sự: PR1's hard-block check-in khi thiếu PayTerms, gộp chung đợt quyết định PRECONDITION-không-cờ-thoát với Sales/Raw Material/BTP (chưa được chủ quán trả lời trong đợt này).

## VIỆC PHẢI LÀM (tích lũy, không chặn)

1. Khi tổng hợp quyết định chủ quán về PRECONDITION không cờ thoát (đã treo ở Sales/Raw Material/BTP), tính thêm **PR1** (check-in bị chặn khi thiếu PayTerms) — đề xuất mặc định: cho check-in với `payTermsRef: null` + `needsReview` GAP-flag, không chặn vào ca. **VẪN CHƯA QUYẾT.**
2. ✅ **ĐÃ LÀM**: Xây `commands/payroll.js` với `ReviseAttendance` (wrap `hr/shift.reviseShift()`, dùng `revisionRef` do caller cấp làm id xác định) và `ClosePayroll` (wrap `hr/payroll.closePayroll()`, đồng thời chuyển các `hr/liability` được áp dụng sang `DEDUCTED` trong cùng mutation) — cả hai đăng ký trong `bootstrap/runtime.js COMMANDS`. Một route đọc riêng cho `computePayroll()`/`readPayrollForMonth()`/`detectPayrollDrift()` qua `reporting/report-queries.js` **VẪN CHƯA LÀM** — còn treo, xem mục 2b mới.
   2b. Thêm `GetPayrollForMonth`/tương đương vào `reporting/report-queries.js` + `QUERIES` ở `bootstrap/runtime.js`, wrap `readPayrollForMonth()`/`detectPayrollDrift()` — hiện tại chỉ có đường GHI (chốt lương), chưa có đường ĐỌC báo cáo lương tháng qua cổng đọc chuẩn.
3. Xác nhận `autoCloseIfStale()` được gọi ở đâu đó trong luồng chốt ngày (`commands/business-day.js`) — hiện tại 0 caller, nghĩa là ca treo qua ngày sẽ KHÔNG bao giờ tự đóng cho tới khi có route gọi hàm này. **VẪN CHƯA LÀM** (ngoài phạm vi quyết định chủ quán đợt này — đợt này chỉ nối `reviseShift`/`closePayroll`).
4. ✅ **ĐÃ TRẢ LỜI VÀ THI CÔNG**: chủ quán xác nhận nghiệp vụ "khoản trừ trách nhiệm nhân viên khi mất container" có thật (hệ cũ chỉ ghi nhận, chủ quán tự tổng hợp cuối tháng không lưu vết; hệ mới cần quy trách nhiệm rõ ràng, truy xuất được qua FIFO). Domain con mới `hr/liability.js` — xem Liên kết chéo domain.
5. (Đã tự làm ở lượt trước) Sửa comment lỗi thời ở `hr/employee.js publishPayTerms()` — comment cũ nói công thức trừ lương cứng "còn để ngỏ" trong khi `work-schedule.js`/`payroll.js` đã ghi rõ chủ quán đã chốt. Đã cập nhật lại comment cho khớp thực tế (không đổi logic, chỉ đổi chú thích).
6. (Không mới, nhắc lại) Tầng điều phối sự kiện — PR2's `EmployeeCheckedInStateChanged` là domain thứ 6 phụ thuộc gap L9. Liability's lifecycle (`ApproveLostContainer`/`RestoreFoundContainer`/`ClosePayroll`) KHÔNG phụ thuộc L9 — chạy đồng bộ trong plan, xem Liên kết chéo domain.
