# Nhãn ly đổi 6 tem — 18/10/2026

## Nguyên nhân đã xác minh

XOFA tạo dòng đổi tem qua `openPickCartModal`, truyền tên “Ly miễn phí (6 Stamp)” vào `_giftLabel`. POS Gieo dùng popup chọn quà riêng: `consumeFreeToGoDrink` → `openTogoGiftPopup` → `confirmTogoGift`; dòng tạo ra có `_vKey` và `_giftType` nhưng thiếu `_giftLabel`. Cả `confirmPay` và `finalizeSplitPay` lấy nhãn thiếu rồi dự phòng bằng `_stampFreeVKey`. Bill vì thế lưu `voucherUsed: '__free_stamp__<timestamp>'`. Manage hiển thị nguyên giá trị đã lưu; không tự tạo chuỗi đó.

## Sửa

- POS Gieo gắn `_giftLabel: 'Ly miễn phí (6 tem)'` khi tạo dòng đổi tem. Hai đường lưu bill dự phòng bằng nhãn này, thay vì mã nội bộ, để cả giỏ đang mở từ dữ liệu cũ cũng được xử lý.
- `stampPromotionLabel` trong POS Gieo / quanlygieo / manage cùng nhận chính xác mẫu `^__free_stamp__\d+$` và trả nhãn dễ đọc. Tên chương trình khác giữ nguyên. Chuỗi đưa vào HTML vẫn được escape.
- Manage Bill chung, quanlygieo bảng tin/lịch sử, POS Gieo lịch sử và in lại bill dùng nhãn đã chuyển. Không sửa bill lịch sử trên Firebase; chỉ chuyển lúc hiển thị/in.
- Khoá `_vKey`, loại `_giftType`, số lượng/giá, cách trừ tem, ghi nhận đổi quà và engine giữ nguyên. Không sửa PosX hoặc bộ JS dùng chung.

## Kiểm tra và bàn giao

`tests/nhan_ly_doi_tem.test.js` chạy hàm tạo quà thật, biểu thức `voucherUsed` trích từ cả hai hàm thanh toán, hàm dựng bill quản lý và nội dung in. Kiểm nhãn cũ/mới, chương trình khác, escape HTML và không đổi đối tượng bill gốc. `tools/ql_giao_dien/e2e_bill_realtime.js` kiểm bill cũ trong widget manage/quanlygieo bằng Chromium, kèm các kiểm tra RT hiện có.

Sinh lại bản thử và ba bộ deploy theo mùa. Gói ZIP chỉ có 5 HTML mới: `posgieo.html`, `posgieo_thu.html`, `quanlygieo.html`, `quanlygieo_thu.html`, `manage.html`, lấy từ bộ Giáng sinh. Không ghi dữ liệu Firebase thật hoặc deploy Hosting.
