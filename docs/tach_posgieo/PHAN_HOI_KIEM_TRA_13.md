# Phản hồi kiểm tra lượt 13 (`KET_QUA_KIEM_TRA_13_DOC_LAP.md`, commit `7ac84fa`)

Người kiểm: **đạt** chuyển mã 3B (241/241 nguyên văn), 28 kịch bản × 2 quán khớp mốc, tự kiểm bắt đủ; thêm probe mở ca đầy đủ (30 khẳng định) và chặn đóng ngày khi có người quay lại ca / giao két đúng người (47 khẳng định). Còn **F13-1** (mô tả độ phủ sai) + đề nghị đưa hai luồng vào công cụ chính. Phản biện: đồng ý cả hai. App không đổi.

## F13-1 — đính chính tài liệu

`KIEM_TRA_13_KET_CA.md` mục 5 đã gạch câu sai và ghi rõ: `e2e_btp_am` chỉ trích hàm (kiểm hạn + câu hỏi phần B lúc check-out), **không** chạy màn đếm BTP cuối ca. Màn này nay có kịch bản so mốc riêng (dưới).

## Hai kịch bản mới trong `e2e_kho.js` (gg01 + gg02, so `0bd95a7`, giờ cố định, phạm vi quán theo REG, ghim tập bảng)

| Kịch bản | Đường đi | Khẳng định riêng | Tự kiểm cài lỗi |
| --- | --- | --- | --- |
| `caMoCaDayDu` | gỡ mọi bộ đệm sống trước khi chạy; dùng `resolveStaffPinAndCheckin` **thật**; mở ca 1.200.000 (PIN 1234) → **chờ hoàn tất** → kiểm kê đầu ca Trà lài 900 (PIN) → tick việc bắt buộc «Lau quầy» (PIN) → nút thật «Xong việc đầu ca» | mở ca do e1; phiếu kiểm kê 1 dòng 900; checklist `lau`; bước tiếp sau kiểm kê gọi **đúng 1** lần; khoá bấm nhả sau mở ca / kiểm kê / cuối luồng; về màn bán `sm` | gọi bước tiếp 2 lần → lệch; số kiểm kê +1 → lệch `ghi` |
| `ketDemBTP` | lô b1 (sổ 500 g, có dụng cụ) → **màn đếm BTP thật** → nút «Cân trừ bì» (bộ cân giả trả 480 g, giống nhau hai bản) → PIN → «Xác nhận & tiếp tục kết ca» | lô b1 `qtyRemaining` 480; phiếu cuối ngày đếm 480 / lệch −20; bước tiếp `_continueAfterPrepCount` gọi **đúng 1** lần; khoá bấm nhả | gọi bước tiếp sau đếm BTP 2 lần → lệch |

`caMoCa` cũ (cửa sổ 4 giây) giữ nguyên để so lịch sử; `caMoCaDayDu` là bằng chứng luồng mở ca hoàn tất.

## Câu trả lời phản biện — đồng ý

1. Giữ hai file 3B; tách nhỏ `pos_shift_closing` (≈ 3.250 dòng) nếu cần là lượt R riêng.
2. `shiftState` một binding, không đọc lúc nạp.
3. Phần B đã đi cùng 3B, không còn bản inline.

## Chạy lại

```sh
node tools/tach_posgieo/e2e_kho.js          # 30 kịch bản × gg01/gg02 + 12 tự kiểm → 780 khẳng định, ALL PASS
node tools/tach_posgieo/e2e_0d.js; node tools/tach_posgieo/e2e_ban.js; node tools/tach_posgieo/e2e_hook.js   # ALL PASS
sh tools/sinh_lai_tat_ca.sh                 # TẤT CẢ ĐẠT
```

## Giới hạn giữ nguyên

8 bước kết ca nối liền một lượt; đếm hết lượt lệch; giao ca lệch / đếm chung / bill chen giữa; đóng ngày bị chặn do bill mới / việc bắt buộc; qua nửa đêm VN; mở ca có đếm giao ca tồn hôm trước / lô hết hạn; APK / Firebase thật / hai quán đồng thời.
