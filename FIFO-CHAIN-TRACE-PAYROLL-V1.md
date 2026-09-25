# FIFO CHAIN TRACE — PAYROLL — V1

> Cùng chuẩn với `FIFO-CHAIN-TRACE-BTP-V1.md`. Dùng để trả lời "vòng lương từng tồn tại trong nghiệp vụ thật là gì" — không phải để giữ nguyên cách code cũ.

---

# SƠ ĐỒ CHUỖI THẬT (khảo sát legacy)

```text
[1] Check-in (posgieo.html:13939-13973)
      ghi employee_shifts{employeeId,businessDate,checkedInAt,checkedOutAt:null,
        payTerms{rate,otRate,otThreshold...} SNAPSHOT}
      → Ca treo qua ngày: 2 lớp tự động đóng (KHÔNG ĐỨT) + 1 lớp sửa tay dự phòng

[2] Sửa chấm công sai (quanlygieo.html:13669-13738, ccSaveEdit/ccSubmitAdd/ccDelete)
      KHÔNG ĐỨT về chức năng, nhưng:
      → GAP: không ghi audit log khi sửa (khác hẳn sửa Lịch làm việc có logAudit)
      → side-effect chưa tài liệu hoá: sửa ca "hôm nay đang mở" tắt
        isEmployeeCheckedInToday() → khoá MỌI actor-gate khác trong POS (23 điểm
        gọi requireCheckedIn — kho, BTP, bill, checklist, giao ca...)

[3] Tính lương (quanlygieo.html:3068-3176)
      ĐỌC: employee_shifts.checkedInAt/checkedOutAt (giờ công) — đúng
      ĐỌC: employees_gieogieo HIỆN TẠI (loadEmployees(), live) ← SAI NGUỒN
      KHÔNG ĐỌC: employee_shifts.payTerms (ghi ở [1], 0 kết quả grep đọc lại)
      🔴 ĐỨT CHUỖI: payTerms là write chết hoàn toàn — đổi lương/xoá nhân viên
      giữa tháng làm lương LỊCH SỬ trôi theo giá trị HIỆN TẠI

[4] "Chốt lương tháng"
      🔴 GAP — chưa từng tồn tại: renderEntryLuong() tính lại LIVE mỗi lần mở tab,
      không collection lưu snapshot, không nút chốt, không export/in phiếu lương.
      Khác hẳn book_closings_gieogieo (đã có cho P&L chung) — payroll không có
      đối tác tương đương. Rủi ro: xem lương tháng 8 hôm nay và xem lại sau khi
      sửa chấm công/đổi lương cho ra 2 số khác nhau, không ai biết số nào "đã trả".

[5] KPI Labor/Cup, Labor/Bill
      KHÔNG ĐỨT — so sánh thật với targets.laborCupTarget/laborBillTarget, nhưng
      KẾ THỪA bug [3]: KPI ngày cũ trôi theo giá lương hiện tại.

[6] Nghỉ phép/vắng mặt
      GAP có chủ đích (comment kiến trúc rõ ràng): không có state "nghỉ phép"
      riêng — lương giờ: vắng mặt tự động 0 giờ (ĐÚNG). Lương cứng: cộng đều mọi
      ngày KHÔNG kiểm tra work_schedules/có chấm công hay không — nghỉ dài ngày
      không tự trừ, muốn trừ phải sửa fixedMonthlySalary → dính lại bug [3].
```

---

# LUỒNG CHUẨN CHO HỆ THỐNG MỚI (không phải fix, mà thiết kế lại đúng ngay từ đầu)

1. **`PayTerms` phải là first-class, versioned theo effective date** — không phải field snapshot bị bỏ quên như legacy. `ComputePayroll(employeeId, dateKey)` PHẢI resolve đúng PayTerms có hiệu lực tại `dateKey`, đúng nguyên tắc đã áp cho Recipe/CostBasis/Packaging (`FIFO-CORE-ARCHITECTURE-V2.md` §10). Đây là lần thứ 5 cùng lớp lỗi này xuất hiện độc lập — xác nhận chắc chắn đây là 1 nguyên tắc kiến trúc xuyên suốt, không phải 5 case riêng lẻ cần 5 lần sửa khác nhau.
2. **`ReviseState` cho sửa chấm công** — bắt buộc `operationId`/audit trail, và bắt buộc phát domain event khi sửa ảnh hưởng tới actor-gate đang dùng ở nơi khác (đúng pattern cross-cutting đã thiết kế ở Reversal/Correction).
3. **`PayrollClosing`** — snapshot tháng bất biến, dùng lại đúng pattern `packages/compaction` đã thiết kế cho `book_closing` (correction giữ v1, không xoá khi mở lại) — không phải tính năng riêng, chỉ là áp dụng lại đúng 1 pattern đã có.
4. **Nghỉ phép**: giữ nguyên quyết định nghiệp vụ "không cần state riêng" (đã đúng ở legacy), nhưng lương cứng cần công thức tường minh trả lời "có tự động trừ theo work_schedule không" — hiện tại legacy để ngỏ câu hỏi này, hệ thống mới phải quyết định rõ khi thiết kế `ComputePayroll`.
