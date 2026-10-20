# Tiền mặt trong manage — bổ sung 20/10/2026

**Bản v3 thay 36c8935:** tự tải lại đúng từ phiếu Firebase khi không còn bất kỳ
đệm nào. Không lấy số từ v1/v2. Giữ đối soát Gieo và hai chỉ số nhỏ, không sửa POS/
engine/công thức hoặc luồng ghi tiền nhận. ZIP **`manage_tien_nop_v3_20-10.zip`** chỉ
chứa `manage.html`, dùng chung thường/Tết/Giáng sinh.

## Nguồn dữ liệu và phiên bản đệm

- TC33/XOFA: `cash_receipts_tc33xofa/{store}_{YYYY-MM-DD}` — đúng mã `writeCashReceipt` ghi.
- Gieo: `daily_closings_gieogieo[__ggNN]/{YYYY-MM-DD}.ownerReceipt` — chung quanlygieo.
- Bộ đọc lọc khoảng theo `firebase.firestore.FieldPath.documentId()`, không lọc theo
  `date`/`businessDate`. Mã phiếu xác định quán/ngày; thiếu trường ngày không làm mất phiếu.
- Đệm `mg_cash_cache_v3` có `schema:3`, chỉ dựng từ số vừa đọc trên nguồn. KHÔNG đọc/nhập
  v1/v2. Không cần giữ đệm cũ, không cần sửa phiếu lịch sử hoặc migrate Firebase.
- Không có v3 (nâng phiên bản, máy mới, xoá sạch bộ nhớ): đọc khoảng từ mốc theo dõi.
  Có v3: chỉ đọc phần chưa nhận và 7 ngày gần nhất. TC33/XOFA mỗi quán 1 query; Gieo
  mỗi quán 1 query. Không quét toàn collection. Bấm ngày nằm ngoài khoảng chỉ đọc thêm
  đúng doc quán/ngày đó, không mở rộng lịch sử. Tải lại bỏ v3 và dựng lại từ nguồn.
- Config/phiếu đọc server. Mất mạng/snapshot cache không được coi là nguồn rỗng đầy đủ;
  báo lỗi thay vì dựng số 0. Lỗi Gieo riêng hiện chưa tải đủ và không cho nhập đè tại quán
  đó; các quán đọc được vẫn hiện. Không thay công thức hay hàm ghi phiếu đã dùng.

## Chứng cứ kiểm tra và giới hạn

Cùng dữ liệu giả thiếu `date`/`businessDate`, sạch đệm: hàm gốc 26edad6 bỏ qua phiếu,
v3 đọc được TC33 500.000đ, XOFA 400.000đ, Gieo 300.000đ từ mã phiếu. Phiếu đủ trường
vẫn cho số tài chính khớp bản gốc. Các số này là fixture kiểm thử, KHÔNG phải số của quán.
Đệm cũ chứa số sai không ảnh hưởng v3; xoá cả ba đệm giữa phiên hoặc xoá toàn bộ
localStorage rồi reload trình duyệt vẫn tự đọc đủ phiếu. Không bổ sung trường ngày
vào fixture để khiến phép thử qua.

Bản 36c8935 chỉ phục hồi cách đọc và ưu tiên v1 nên chưa đáp ứng điều kiện độc lập đệm;
bản v3 thay cơ chế đó. Chưa deploy Hosting, không đọc/ghi Firebase thật và không xác nhận
được toàn bộ nguyên nhân hoặc tình trạng phiếu tại quán từ các bài kiểm giả lập.

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
TC33/XOFA dùng lại doanh thu đã tải để tính tiền mặt. `readCashGieoDay` tải hai số phụ
sau khi tiền nhận đã hiện; chỉ ngày đang xem, qua `revLoadRange`/`BillLive`/đệm chung.
Kết quả về trễ chỉ thay hai ô nhỏ, không vẽ lại form hoặc đè ngày mới. Lỗi số phụ
không chặn số thực nhận.

Chi tiết đoạn ca chỉ đọc khi bấm, dùng lại kết quả theo quán/ngày tới lúc tải lại.
Không thêm listener/polling, không đọc doanh thu cả lịch sử Gieo để hiện hai số phụ.

## Kiểm tra

- `node tests/tien_mat.test.js`: công thức số cần lấy giữ nguyên, khớp quanlygieo.
- `node tests/manage_tien_mat_chi_tiet.test.js`: đối soát/đa ca, thiếu/số 0, số phụ tải
  sau, chi tiết chỉ khi bấm; đệm v3 không nhập số từ v1/v2.
- `node tests/manage_tien_mat_lich_su.test.js`: toàn bộ backend với query lọc document ID;
  không đệm, đệm cũ sai, xoá cả v1/v2/v3, trước mốc, ngày cũ, đổi ngày, tải lại,
  số thực nhận 0, lỗi mạng. So bản gốc trên cùng nguồn; kiểm giới hạn khoảng đọc sau
  lần đầu và doc đúng ngày khi bấm. Không ghi nguồn giả khi chỉ xem.
- `node tools/manage_cash/e2e_history.js`: backend + UI thật, Firebase giả thiếu trường
  ngày, PC/điện thoại; xoá toàn localStorage rồi reload vẫn có số nhận; v3 độc lập,
  lỗi mạng không dựng 0, chỉ số phụ không xoá tiền đang gõ. Chặn mọi mạng ngoài.
- `node tools/manage_cash/e2e.js`: kiểm trình bày với fixture UI, không dùng làm chứng
  cứ backend; PC/tablet/điện thoại, sáng/tối, popup, xác nhận/sửa thực nhận.
- `sh tools/sinh_lai_tat_ca.sh`: sinh bộ deploy ba mùa và chạy toàn bộ test.

Ba file `ban_deploy/{thuong,giangsinh,tet}/manage.html` giống nhau; ZIP giao chỉ chứa
`manage.html`, dùng được cho cả ba mùa. Không cần thay engine/shared JS cho thay đổi này.
