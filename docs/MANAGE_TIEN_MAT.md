# Tiền mặt trong manage — bổ sung 20/10/2026

**Bản hiện hành thay bản vá 2422363:** trả đường đọc tiền nộp về mã nguồn
26edad6 trước khi sửa UI, theo yêu cầu của chủ quán. Giữ phần đối soát Gieo và hai
chỉ số nhỏ. Không sửa POS/engine hoặc các quy trình vận hành chủ quán yêu cầu giữ.
ZIP **`manage_doc_tien_nop_nhu_cu_20-10.zip`** chỉ chứa `manage.html`, dùng chung ba mùa.

## Đối chiếu với bản trước

`loadCashCfg`, toàn bộ phần truy vấn/ghép số/lưu đệm của `readCash`, `cashQueryFrom`,
`writeCashReceipt`, `writeCashStart` và `cashCacheSave` giữ nguyên bản 26edad6.
`readCash` chỉ đính kèm hai số phụ TC33/XOFA từ doanh thu đã đọc và cờ chờ tải số Gieo.
Gỡ cách ép đọc server, tra thêm doc và khóa nhập của bản vá 2422363.

Dùng lại `mg_cash_cache_v1`; v2 chỉ bổ sung ngày chưa có trong v1. Không xoá v2.
Các ngày gần hiện tại vẫn đọc lại nguồn như bản gốc; không đổi đường dẫn hoặc mã phiếu.

Kiểm A/B cùng dữ liệu giả/đồng hồ/đệm, so sánh với hàm gốc được đóng băng trong
`tests/fixtures/manage_cash_before_26edad6.js`: kết quả tiền và danh sách truy vấn khớp.
Trường hợp ngày đã cũ có số trong v1 nhưng v2 rỗng: bản gốc đọc được, 5d42060 mất số,
bản hiện hành đọc được. Đây là hồi quy đã tái hiện, chưa khẳng định giải thích toàn bộ
sự cố ở quán. Phiếu thiếu trường ngày cũng bị bỏ qua ở bản gốc, vì vậy KHÔNG dùng
trường hợp đó để kết luận nguyên nhân do bản sửa UI.

Chưa deploy Hosting, không đọc/ghi Firebase thật. Các phép thử không xác nhận được
số phiếu hiện có trên server hoặc tình trạng bộ đệm tại máy chủ quán.

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
Doanh thu TC33/XOFA dùng lại kết quả đọc cho tiền mặt. Sau khi tiền nộp đã hiện,
`readCashGieoDay` chỉ đọc bill đúng ngày xem qua `revLoadRange` (dùng `BillLive`/đệm
hiện có); không đọc doanh thu cả lịch sử chưa nhận. Lỗi số phụ không chặn số thực nhận.
Kết quả về trễ chỉ thay hai ô nhỏ, không vẽ lại form tiền mặt và không đè ngày mới.

Không tự đọc các đoạn ca, không thêm listener/polling. Mở lại popup dùng Promise/kết quả
đã tải theo khóa quán/ngày; tải lại tab xóa đệm chi tiết. Lỗi chi tiết có nút thử lại.
Đường tải lại phiếu nhận giữ hành vi bản gốc; thay đổi lần này không thêm truy vấn
lịch sử hoặc di chuyển dữ liệu tiền nhận.

## Kiểm tra

- `node tests/tien_mat.test.js`: giữ nguyên tiền cần lấy, khớp quanlygieo.
- `node tests/manage_tien_mat_chi_tiet.test.js`: đối soát/multi-ca, thiếu dữ liệu/số 0,
  phạm vi doanh thu, chỉ tải chi tiết khi bấm và số phụ Gieo tải sau.
- `node tests/manage_tien_mat_lich_su.test.js`: so mã nguồn và A/B kết quả + log truy vấn
  với 26edad6; đổi ngày, mốc theo dõi, tải lại, máy mới, v1 có số/v2 rỗng, v2 có ngày riêng;
  tái hiện lỗi ở 5d42060 và kiểm bản sửa. Firebase giả có lọc theo truy vấn thật.
- `node tools/manage_cash/e2e.js`: kiểm UI với dữ liệu dựng sẵn tại PC/tablet/điện thoại,
  sáng/tối, popup, xác nhận/sửa thực nhận. Không dùng bài này làm chứng cứ backend.
- `node tools/manage_cash/e2e_history.js`: backend + UI thật với Firebase giả trên PC/
  điện thoại, đổi ngày giữ số nhận, v1/v2, chỉ số phụ tải chậm không xoá tiền đang gõ;
  không stub `readCash`, chặn mạng thật và theo dõi không có lệnh ghi khi chỉ xem/sửa nháp.
- `sh tools/sinh_lai_tat_ca.sh`: sinh đủ bộ deploy thường/Giáng sinh/Tết và chạy toàn bộ test.

Ba file `ban_deploy/{thuong,giangsinh,tet}/manage.html` giống nhau; ZIP giao chỉ chứa
`manage.html`, dùng được cho cả ba mùa. Không cần thay engine/shared JS cho thay đổi này.
