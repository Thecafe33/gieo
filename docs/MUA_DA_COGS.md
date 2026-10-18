# Mua đá và COGS — 18/10/2026

## Quy tắc chủ dự án chốt

Đá tiêu hao tiếp tục tính theo giá vốn đã cấu hình của món/BTP. Nhân viên mua đá vẫn báo ở Kho → Chi phí như cũ. Khoản báo mua là tiền đã/sẽ trả: giữ trong sổ chi, quy trình duyệt, tiền mặt, bàn giao và đối soát. Không trừ thêm khoản mua vào lãi/lỗ vì đá dùng đã tính qua COGS. Không đổi giá đá, định mức món, giá trị hao hụt hoặc tồn kho.

Với danh mục mua đá cũ, `expenseCoveredByCogs` chỉ nhận đúng các nhãn `Nước đá`, `Đá`, `Đá cây`, `Đá viên` (không phân biệt hoa/thường, dấu, khoảng trắng). Không dò chuỗi con, không loại nhầm trà đào/đá sửa chữa hoặc các khoản vận hành khác. Hàm cũng nhận khoản trả NCC được đánh dấu `accountingTreatment: inventory_purchase`, theo thiết kế dòng tiền trong `docs/BAO_CAO_DIEU_HANH.md`. Quy tắc này dùng cho Gieo, nơi COGS đã cấu hình; không thay cách hạch toán TC33/XOFA.

## Triển khai

- `splitExpensesByCostType` trả thêm `daTrongGiaVon`; `computeDayPL` lưu `chiMuaDa` để giải thích nhưng không cộng vào `bienPhiKhac`/`chiPhiCoDinh`. Giữ nguyên `giaVon` và công thức hoà vốn/thu hồi vốn. `computeKPIs` cũng tách khoản này khỏi opex.
- Khoản mua đá dự đoán không tạo cảnh báo chờ số thật của P&L hoặc sai lệch lợi nhuận do hoá đơn. Sổ chi/công nợ vẫn thấy khoản dự đoán/chưa trả.
- Tab Chi phí có widget riêng, nhãn trên khoản mua và gợi ý khi chọn danh mục. Không thêm thao tác cho nhân viên, không cần sửa POS hoặc ghi chuyển đổi dữ liệu cũ.
- Tóm tắt ngày có `iceVersion`, `iceCheckedExpenseAmount` và `chiMuaDa`. `plNgayDaCanTinhLai` chọn ngày đã qua có khoản chi nhưng chưa có phiên bản mới hoặc số chi đã bị HTML cũ merge ghi đè. Hai app dùng cùng selector và cách tính theo đoạn; manage giữ giới hạn 62 ngày. Có thể cần tính lại một ngày có khoản chi khác để xác nhận không phải mua đá, sau đó không lặp. Không quét lại toàn bộ giao dịch mỗi lần mở hoặc nhận bill RT.
- `lai_lo.v4.js` sinh từ quanlygieo bằng `node tools/tao_lai_lo.js`; manage trỏ v4. Các v1–v3 giữ nguyên. Không tự sửa sổ chốt tháng đã lưu; việc mở/chốt lại vẫn theo quy trình cũ.

## Kiểm tra và bàn giao

`tests/mua_da_cogs.test.js`: lương theo giờ/OT, nhận đúng danh mục, giữ COGS và khoản chi gốc, két vẫn trừ tiền, P&L/KPI không tính trùng, trạng thái duyệt/dự đoán, sửa snapshot cũ/không lặp/chống HTML cũ ghi đè, giới hạn manage, đẳng thức hoà vốn. `tests/lai_lo.test.js` chạy bộ sinh v4 và realtime không thêm đọc. `tools/ql_giao_dien/e2e_bill_realtime.js` kiểm thêm DOM tab Chi phí/két/sửa snapshot ngày cũ trên PC, tablet, điện thoại; chặn mạng ngoài, chỉ Firebase giả.

Gói cập nhật gồm `quanlygieo.html`, `quanlygieo_thu.html`, `manage.html`, `lai_lo.v4.js`, lấy từ bộ deploy đã sinh. Chủ dự án tự deploy rồi tải lại cả hai app; giữ JS cũ để HTML trong cache còn tải được. Không ghi sửa dữ liệu Firebase thật trong lượt triển khai.
