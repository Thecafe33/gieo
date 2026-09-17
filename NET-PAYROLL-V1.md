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
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM ở tầng domain — nhưng THIẾU tầng command** |
| **Ghi chú** | Đã đọc trọn. `reviseShift()` đóng cả 2 gap: bắt buộc `actorId`/`operationId`/`reason` (validate ngay, comment code tự nhận "legacy thiếu audit ở đúng chỗ này"), append-only `revisions[]` giữ `before`/`after` để trả lời "số nào từng đúng", và **trả về event `EmployeeCheckedInStateChanged` NGAY TRONG GIÁ TRỊ TRẢ VỀ** khi sửa làm đổi trạng thái mở/đóng của ca hôm nay — đúng ý đồ "không để caller tự nhớ phát event" mà comment code nêu rõ. **Nhưng: grep toàn bộ `src/layers/commands/` xác nhận KHÔNG có command/pipeline nào gọi `reviseShift()`** — `commands/shift.js` chỉ định nghĩa `CheckIn`/`CheckOut`/`OpenCashSegment`/`CloseCashSegment`, không có `ReviseAttendance`. Domain logic hoàn chỉnh và đúng, nhưng chưa có đường thực thi (không phải "orphaned pure function" kiểu advisory — đây là một THAO TÁC NGHIỆP VỤ cần audit, thiếu route nghĩa là chưa dùng được). Cùng tình trạng: `autoCloseIfStale()` (tự đóng ca treo qua ngày, gắn cờ `needsReview`) cũng 0 caller — `business-day.js` không gọi tới. |

## PR3 — Tính lương

| | |
|---|---|
| **Hệ cũ** | `quanlygieo.html:3068-3176` — đọc đúng giờ công (`checkedInAt`/`checkedOutAt`), nhưng đọc SAI NGUỒN lương: `employees_gieogieo` HIỆN TẠI (`loadEmployees()`, live) thay vì `employee_shifts.payTerms` đã snapshot. 🔴 ĐỨT CHUỖI: đổi lương/xoá nhân viên giữa tháng làm lương LỊCH SỬ trôi theo giá trị hiện tại. |
| **Hệ mới** | `hr/payroll.js` → `computePayroll()` |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM ở tầng domain — nhưng ORPHANED, chưa có bất kỳ caller nào** |
| **Ghi chú** | Đã đọc trọn. Đóng đúng ĐỨT CHUỖI: giờ công tính qua `shiftLib.computeWage(sh)` (đọc `payTermsRef` snapshot, không đọc Employee hiện tại); yêu cầu MỌI shift phải `status === CLOSED` mới tính (PRECONDITION nếu còn ca mở — "không chốt lương khi còn ca mở", đây là block hợp lý, KHÔNG mới so với tinh thần legacy vì bản chất là "chưa xong thì chưa tính"). Lương cứng resolve PayTerms theo TỪNG NGÀY qua `registry.resolveDaily()` — đúng nguyên tắc versioning đã áp cho Recipe/Packaging/BTP-yield/PayTerms(check-in)/KPI-target — code tự gọi đây là closing 3 gap ("Ba gap đang đóng"). **Nhưng: grep toàn bộ `src/layers` xác nhận `hr/payroll` KHÔNG được import bởi bất kỳ file nào khác ngoài chính nó** — không có `commands/payroll.js`, không đăng ký trong `reporting/report-queries.js`, không xuất hiện trong `read-layer/gateway.js`. Đây là **domain hoàn chỉnh nhưng hoàn toàn chưa nối** — cùng loại "orphaned pure function" đã thấy ở `catalog/menu.computeAvailability()`/`catalog/promotion.evaluate()`/`alerts/alert.raise()`, nhưng NGHIÊM TRỌNG HƠN vì đây không phải hàm advisory mà là toàn bộ chuỗi tính lương — không có route nào để chủ quán THỰC SỰ tính lương tháng bằng logic mới này. |

## PR4 — "Chốt lương tháng"

| | |
|---|---|
| **Hệ cũ** | 🔴 **GAP — chưa từng tồn tại.** `renderEntryLuong()` tính lại LIVE mỗi lần mở tab, không collection lưu snapshot, không nút chốt, không export/in phiếu lương. Khác hẳn `book_closings_gieogieo` (đã có cho P&L chung). Rủi ro: xem lương tháng 8 hôm nay và xem lại sau khi sửa chấm công/đổi lương ra 2 số khác nhau, không ai biết số nào "đã trả". |
| **Hệ mới** | `hr/payroll.js` → `closePayroll()` + `readPayrollForMonth()` + `detectPayrollDrift()` |
| **Phân loại** | 🟢 **THÊM MỚI ở tầng domain — nhưng ORPHANED, chưa có bất kỳ caller nào** |
| **Ghi chú** | Đã đọc trọn. `closePayroll()` tái dùng ĐÚNG pattern `book_closing`: `payrollClosingId` xác định, `revisionNo`/`supersedesClosingId` cho correction (giữ v1, không xoá khi sửa lại), đóng băng `lines` per-employee. Có gate `needsReview` — nếu bất kỳ kết quả nào cần review mà `!spec.acknowledgeReview` thì từ chối chốt, liệt kê nhân viên liên quan (hợp lý: không chốt lương âm thầm khi có ca `autoClosed`/`needsReview` chưa xử lý — không phải block mới kiểu §2.3a vì đây là hành động CHỐT một kỳ, tương đương "không chốt sổ khi còn treo" vốn đã là chuẩn của `book_closing`). `readPayrollForMonth()` trả `{source:'CLOSING', frozen:true}` khi có bản chốt, `{source:'LIVE', frozen:false}` khi chưa — chính là cơ chế làm "xem lương tháng 8 hôm nay" và "xem lại sau khi sửa chấm công" RA CÙNG MỘT SỐ, đóng đúng gap chain-trace [4]. `detectPayrollDrift()` mirror đúng hợp đồng phát hiện trôi số của `book_closing` §3.2. **Nhưng cùng tình trạng PR3: 0 caller trong toàn bộ `src/layers`** — không có `commands/payroll.js ClosePayroll` command, không route UI. Logic đúng, chưa dùng được. |

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
| **Reversal/Correction** | Câu hỏi treo ở `NET-REVERSAL-CORRECTION-V1.md` (dòng 78-81, 129-132): "`ContainerFound` có hoàn khoản trừ trách nhiệm nhân viên (payroll) không" — **xác nhận: KHÔNG có khái niệm "khoản trừ trách nhiệm nhân viên khi mất container" ở bất kỳ đâu trong `hr/payroll.js`/`hr/shift.js`.** Payroll hiện chỉ tính giờ công + PayTerms, không có trường/luồng nào trừ lương vì mất container. Nếu nghiệp vụ thật có việc này, nó CHƯA ĐƯỢC MÔ HÌNH HOÁ ở domain nào — không phải là bug của Payroll cụ thể mà là một domain con hoàn toàn thiếu (như RM1/Receiving). Đưa vào VIỆC PHẢI LÀM để chủ quán xác nhận có tồn tại nghiệp vụ này ở hệ cũ hay không trước khi thiết kế. |
| **Loyalty/Reversal/Raw Material/BTP/Alerts (L9)** | `reviseShift()`'s `EmployeeCheckedInStateChanged` VÀ `commands/shift.js`'s `CheckIn`/`CheckOut` cùng phát event này nhưng KHÔNG CÓ CONSUMER nào (grep xác nhận) — **domain thứ 6 xác nhận phụ thuộc gap L9** (sau Loyalty, Reversal, Raw Material RM6, BTP B1, Alerts). |
| **Sales/Raw Material/BTP (PRECONDITION không cờ thoát)** | PR1's block check-in khi thiếu PayTerms là case MỚI cần gộp vào cùng đợt quyết định chủ quán, dù bản chất khác (chặn VÀO CA, không chặn MỘT GIAO DỊCH) — mức ảnh hưởng vận hành còn rộng hơn vì chặn toàn bộ khả năng thao tác của nhân viên đó trong ngày. |
| **BTP** | `hr/payroll.js`'s header tự gọi PayTerms-versioning là "Ba gap đang đóng"; `hr/employee.js publishPayTerms()` tự gọi đây là "instance #5" của lớp lỗi versioning đã xác nhận 7 lần (cùng họ với Recipe/Packaging/BTP-yield/KPI-target/Config — đã thấy ở BTP B2 và Alerts AL5). |

---

## TỔNG KẾT PHÂN LOẠI

- 🟢 THÊM MỚI: **PR4** (PayrollClosing — chưa từng tồn tại ở hệ cũ), **PR6 phần lương cứng** (công thức trừ theo lịch làm việc — quyết định mới, legacy để ngỏ)
- 🟡 GIỮ, ĐỔI CÁCH LÀM: **PR1, PR2, PR3, PR5, PR6 phần lương giờ** — logic domain đúng, đóng cả 3 gap chain-trace nêu ở tầng thiết kế ([3] payTerms-write-chết, [4] chưa có chốt lương, [6] công thức nghỉ phép để ngỏ)
- ⚪ CHƯA QUYẾT (gộp vào quyết định chung PRECONDITION-không-cờ-thoát với Sales/Raw Material/BTP): **PR1** — check-in bị chặn cứng khi thiếu PayTerms, hard-block MỚI so với legacy
- ⚪ CHƯA XÁC NHẬN (cần chủ quán trả lời có nghiệp vụ hay không): **"khoản trừ trách nhiệm nhân viên khi mất container"** — câu hỏi treo từ Reversal/Correction, xác nhận domain con này chưa tồn tại ở đâu

**Phát hiện nổi bật của domain này (khác 5 domain trước)**: ở Raw Material/BTP/Catalog/Alerts, phần lớn gap chain-trace đã đóng ở tầng domain VÀ đã có đường thực thi (command/query đăng ký). Ở Payroll, **domain logic đóng đúng cả 3 gap nhưng TOÀN BỘ `hr/payroll.js` (PR3+PR4) và `hr/shift.reviseShift()`/`autoCloseIfStale()` (PR2) chưa có BẤT KỲ command/pipeline wrapper nào** — không phải "chưa nối UI" (tình trạng chung, không phải bug) mà là "chưa nối cả tầng command", một bước sớm hơn UI. Đây là domain có khoảng cách giữa "logic đúng" và "dùng được" xa nhất trong 6 domain đã khảo sát.

## VIỆC PHẢI LÀM (tích lũy, không chặn)

1. Khi tổng hợp quyết định chủ quán về PRECONDITION không cờ thoát (đã treo ở Sales/Raw Material/BTP), tính thêm **PR1** (check-in bị chặn khi thiếu PayTerms) — đề xuất mặc định: cho check-in với `payTermsRef: null` + `needsReview` GAP-flag, không chặn vào ca.
2. Xây `commands/payroll.js` (hoặc mở rộng `commands/shift.js`) với ít nhất: `ReviseAttendance` (wrap `hr/shift.reviseShift()`), `ClosePayroll` (wrap `hr/payroll.closePayroll()`), và một route đọc cho `computePayroll()`/`readPayrollForMonth()`/`detectPayrollDrift()` qua `reporting/report-queries.js`. Không có bước này thì PR2/PR3/PR4 chỉ là domain logic nằm im.
3. Xác nhận `autoCloseIfStale()` được gọi ở đâu đó trong luồng chốt ngày (`commands/business-day.js`) — hiện tại 0 caller, nghĩa là ca treo qua ngày sẽ KHÔNG bao giờ tự đóng cho tới khi có route gọi hàm này.
4. Hỏi chủ quán: nghiệp vụ "khoản trừ trách nhiệm nhân viên khi mất container" (treo từ `NET-REVERSAL-CORRECTION-V1.md`) có thật sự tồn tại ở hệ cũ không? Nếu có, đây là một domain con hoàn toàn chưa được thiết kế trong `hr/payroll.js` hiện tại.
5. (Đã tự làm trong lượt này) Sửa comment lỗi thời ở `hr/employee.js publishPayTerms()` — comment cũ nói công thức trừ lương cứng "còn để ngỏ" trong khi `work-schedule.js`/`payroll.js` đã ghi rõ chủ quán đã chốt. Đã cập nhật lại comment cho khớp thực tế (không đổi logic, chỉ đổi chú thích).
6. (Không mới, nhắc lại) Tầng điều phối sự kiện — PR2's `EmployeeCheckedInStateChanged` là domain thứ 6 phụ thuộc gap L9.
