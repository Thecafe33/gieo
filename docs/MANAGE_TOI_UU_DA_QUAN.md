# Manage — tối ưu phạm vi đọc, 18/10/2026

Chủ dự án duyệt sau rà soát: giữ ngưỡng hoà vốn cơ bản TC33/XOFA (đã hoàn vốn lâu), không tái dựng lịch sử tài sản/bill của hai quán.

## Đã làm

- `readRevenue(scope)` chỉ đọc doanh thu, sổ PL, chi phí tổng hợp/chờ duyệt của phạm vi chọn. Khoá màn theo kỳ + phạm vi. Ngày trước vẫn tự tải để so sánh như cũ.
- `revSources(only)` không tải menu và node bill cũ TC33 khi xem XOFA/Gieo. Tiếp tục dùng đệm ngày cũ, BillLive và sổ gộp hiện có.
- `readCosts(scope)` chỉ truy vấn chi phí/đã trả/chờ duyệt và sổ PL cần cho nhóm được chọn. Không ghi tổng hợp rỗng cho quán bị bỏ qua.
- `plAutoFill` chỉ tính bù danh sách quán Gieo trong phạm vi Tổng quan. Tab hoà vốn toàn hệ thống vẫn giữ đủ nguồn.
- Listener BillLive theo điểm đang xem; rời Tổng quan hoặc xem kỳ không có hôm nay thì gỡ. Quay lại tải nền hôm nay mới, tránh dùng số bị bỏ lỡ trong lúc không nghe. Chặn kết quả RT cũ sau đổi phạm vi.
- Danh sách quán đọc lỗi không âm thầm thay bằng GG01. Lỗi nguồn hoà vốn hiện trên màn; không dùng ngưỡng không đầy đủ. Lỗi sổ chốt tháng phân biệt với chưa chốt; thử lại tận dụng các listener sổ đã đọc được.
- Vạch ngưỡng chung chỉ hiện khi đủ quán, không bù ngưỡng thiếu bằng doanh thu. Giữ công thức TC33/XOFA, nhãn ngưỡng theo cấu hình từng quán.
- Tài sản: nhãn khấu hao thay cho thu hồi vốn; phép tính không đổi.
- Sổ tháng Gieo: số chính trước khấu hao, kế toán sau khấu hao ở chi tiết. Tổng kế toán được gọi đúng tên. Sổ chốt hiện chưa chứa mốc hoàn vốn: ghi rõ chưa phân loại giai đoạn, không đoán từ số lãi hoặc đọc lại lịch sử ngầm.

## Còn cần triển khai riêng

- Bổ sung snapshot giai đoạn hoàn vốn vào sổ tháng từ nguồn chuẩn quanlygieo, có tương thích sổ cũ; khi đó manage mới phân loại góp vốn/thặng dư chính xác mà không đọc lịch sử toàn kỳ.
- Báo cáo điều hành chuỗi và giải thích mọi chỉ số; điều hướng phạm vi quán thống nhất giữa các tab.
- Phân biệt nhập lương bổ sung và tiền trả lương; chưa đổi nghiệp vụ hay cắt nguồn lương liên quán.
- Chưa có số đo tiết kiệm trên Firebase thật. Kiểm tra bằng fake Firebase đếm truy vấn và Chromium.

## Kiểm tra

`tests/manage_pham_vi_doc.test.js`, `tools/ql_giao_dien/e2e_manage_doc.js` (45), `tools/ql_giao_dien/e2e_bill_realtime.js` (234); toàn bộ bộ sinh/test, boundaries, paths, lai_lo check. Không ghi Firebase thật, không deploy Hosting.
