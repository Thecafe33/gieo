# Tiền mặt trong manage — bổ sung 20/10/2026

Phạm vi: thêm dữ kiện đối soát và hai chỉ số nhỏ. Không sửa quy trình bán hàng,
chốt/huỷ bill, chuyển khoản tay, kết ca hoặc các phép tính/ghi nhận gốc của POS.
Chưa deploy Hosting, không đọc/ghi Firebase thật trong quá trình kiểm tra.

## Các số cần phân biệt

- **Tiền mặt cần lấy**: giữ nguyên `ggCashExpected` / `ownerReceiptExpected`:
  `handedOverAmount + postCloseBills[timing=after_close].cash`.
- **Theo hệ thống trong két**: `finalExpectedCash` của chính lần đối soát cuối ca.
- **Nhân viên đã đếm**: `finalActualCash`, không phải tiền chủ quán thực nhận.
- **Chênh lệch cuối ca**: số nhân viên đếm trừ số hệ thống trong két; thiếu/thừa đều hiện.
  Thiếu trường thì hiện `—`, không coi là 0/Khớp. Đếm 0 thật vẫn hiển thị bình thường.
- **Phải nộp theo hệ thống**: `max(0, finalExpectedCash - retainedAmount)` cộng phần tiền
  mặt sau kết ca nói trên, chỉ khi có đủ dữ kiện và đã bàn giao. Chưa đủ dữ kiện thì `—`.
- **Chủ quán thực nhận**: vẫn ghi `ownerReceipt` trên phiếu kết ca của đúng quán/ngày;
  chênh lệch ở khối này so với số nhân viên báo bàn giao, như trước.

Ví dụ: hệ thống trong két 1.700.000đ, đếm 1.680.000đ, giữ lại 500.000đ,
báo bàn giao 1.180.000đ và bán sau kết ca 45.000đ: widget giữ tiền cần lấy
1.225.000đ, hiện thiếu cuối ca 20.000đ và phải nộp theo hệ thống 1.245.000đ.
Chủ nhận 1.220.000đ thì thiếu so với báo bàn giao thêm 5.000đ.

## Nhiều đoạn ca

POS chốt `finalExpectedCash` theo đoạn cuối nếu có giao ca giữa ngày. Không gọi số đó
là chênh lệch cả ngày. `segmentCount > 1` → ghi rõ “Đối soát đoạn cuối”.
Nút “Xem từng đoạn ca” lấy `shift_segments_gieogieo[__ggNN]`, lọc `businessDate == ngày xem`.
Hiện người giữ két, giờ, tiền đầu đoạn, expected/endCash, mức lệch, số người giao/nhận đếm.
Tổng chỉ cộng các đoạn có số lệch; ghi rõ đã có số bao nhiêu đoạn. Hai đoạn thừa/thiếu bù
nhau về 0 vẫn hiện số đoạn lệch và nhãn “Tổng bù trừ 0”, không gọi là tất cả khớp.

## Hai chỉ số nhỏ

Ở mọi quán, đúng ngày đang xem:

- Chuyển khoản: tiền CK trên bill (không phải xác nhận độc lập từ ngân hàng).
- Doanh thu ngày: tổng tiền trên bill. TC33 gồm Ăn vặt; XOFA gồm Food; Gieo dùng `revenue`.
  Nhãn nhỏ ghi phạm vi này. Không đổi số tiền mặt nộp về TC33/XOFA vốn loại Ăn vặt/Food.

## Lượt đọc và bộ đệm

Số cuối ca lấy từ phiếu kết ca `readCash` đã đọc, không thêm truy vấn lấy lại.
Doanh thu TC33/XOFA dùng lại kết quả đọc cho tiền mặt. Gieo chỉ đọc bill đúng ngày xem
qua `revLoadRange` (dùng `BillLive`/đệm hiện có), không đọc doanh thu cả lịch sử chưa nhận.
Không tự đọc các đoạn ca, không thêm listener/polling. Mở lại popup dùng Promise/kết quả
đã tải theo khóa quán/ngày; tải lại tab xóa đệm chi tiết. Lỗi chi tiết có nút thử lại.

Đệm tiền mặt v2 vẫn đọc lại dữ liệu v1, giữ ngày đã nhận. Nếu ngày đang xem thiếu
`reconciliation`, chỉ đọc doc kết ca ngày đó để bổ sung; không bỏ cả lịch sử đệm.
Lỗi một quán không biến số thiếu thành 0 hoặc làm mất các quán đã tải được.

## Kiểm tra

- `node tests/tien_mat.test.js`: giữ nguyên tiền cần lấy, khớp quanlygieo.
- `node tests/manage_tien_mat_chi_tiet.test.js`: đối soát, nhiều đoạn, chưa bàn giao,
  thiếu dữ liệu/số 0, phạm vi doanh thu từng thương hiệu, truy vấn đúng quán/ngày,
  không tự tải đoạn ca và nâng đệm v1 mà giữ dữ liệu đã nhận.
- `node tools/manage_cash/e2e.js`: 63 kiểm tra ở 1366/1024/390px, sáng/tối, popup,
  mở lại không đọc thêm, xác nhận/sửa thực nhận hoạt động. Dữ liệu giả, chặn mọi mạng ngoài.
- `sh tools/sinh_lai_tat_ca.sh`: sinh đủ bộ deploy thường/Giáng sinh/Tết và chạy toàn bộ test.

Ba file `ban_deploy/{thuong,giangsinh,tet}/manage.html` giống nhau; ZIP giao chỉ chứa
`manage.html`, dùng được cho cả ba mùa. Không cần thay engine/shared JS cho thay đổi này.
