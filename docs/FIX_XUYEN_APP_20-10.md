# Sửa ba nhóm lỗi xuyên app — 20/10/2026

Theo yêu cầu tiếp sau [bản rà](KIEM_TRA_XUYEN_APP_20-10.md). Phạm vi gồm POS TC33,
POS XOFA, POS Gieo, manage và quanlygieo. Chưa deploy Hosting, không truy cập hoặc
ghi dữ liệu Firebase thật.

## Kết quả tính tiền

| Bill Gieo | Tiền mặt đúng | Chuyển khoản đúng |
|---|---:|---:|
| Gốc TM 30.000 + topping CK 5.000 | 30.000 | 5.000 |
| Gốc CK 30.000 + topping TM 5.000 | 5.000 | 30.000 |
| Gốc tách TM 15.000 / CK 15.000 + topping CK 5.000 | 15.000 | 20.000 |

`total` đã bao gồm addons, còn `splitGroups` chỉ chứa phần thanh toán gốc.
Các hàm tiền mặt/chuyển khoản POS Gieo và quanlygieo nay cộng tiền gốc với từng
`addons[].amount/method`. `updRv` và `manage.ggAddOrder` dùng cùng phép phân bổ;
giữ nhánh Food/đơn cũ. Không đổi transaction mua topping, bill, kho hoặc tem khách.
Đối soát dùng bill đã có, không truy vấn thêm theo từng addon.

Với TC33: Trà 25.000 + Bánh tặng giá 0, khách trả TM 25.000 → doanh thu Bánh bằng 0,
tiền phải nộp 25.000. `calculateStats` và `tcAddOrder` phân biệt giá 0 với thiếu trường
giá. Bill cũ chỉ có chuỗi món vẫn dùng giá menu dự phòng. Không đổi quy tắc loại
Ăn vặt khỏi tiền mặt phải nộp.

## Bộ đệm và tiền đã xác nhận

- Doanh thu manage dùng `mg_rev_cache_v4`, bỏ số tổng hợp v1/v2/v3. Ngày ổn định
  được đọc lại một lần khi người dùng mở khoảng đó rồi lưu v4; giữ chính sách 8 ngày,
  listener và phạm vi quán hiện hành.
- `mg_cash_cache_v3` vẫn tự dựng từ phiếu nguồn, không phụ thuộc bộ đệm cũ. Số
  **Thực nhận**, metadata và cách ghi phiếu giữ nguyên.
- Khi chọn ngày đã nhận tiền TC33/XOFA và đã đọc được bill, số **Phải nộp** tính lại
  từ bill/chi tại quầy. Nếu khác số trong phiếu cũ, hiện chú thích “Phiếu gốc tính phải
  nộp …; bên trên đã tính lại theo bill”. Không tự sửa phiếu. Nếu không có bill trong
  nguồn trả về, giữ số phiếu thay vì giả định phải nộp 0.
- Gieo giữ khoản bàn giao/ownerReceipt đã xác nhận; phép phân bổ mới phục vụ đối soát
  và bill sau kết ca. Không tự viết lại các khoản bàn giao cũ.

## Ngày nghiệp vụ Việt Nam

Năm app dùng cùng `vnDate`: lịch/ngày/giờ và phép cộng ngày/tháng theo UTC+7.
Các constructor trong mã nghiệp vụ gọi helper này; không thay `window.Date` hay Date
của Firebase SDK. ISO có múi giờ và timestamp vẫn giữ đúng thời điểm thật;
`toISOString()` không bị cộng thêm 7 giờ. Chuỗi ngày/giờ không múi giờ và constructor
theo năm/tháng/ngày được hiểu là giờ Việt Nam.

Cùng `2026-10-20T17:30:00Z`: các POS ghi ngày **21/10**, manage đọc ngày **21/10**,
tháng lương 10 vẫn **01/10–31/10**, kể cả máy dùng UTC/Sydney. Các đầu vào Date từ
SDK cũng được chuẩn hoá tại hàm lấy ngày. Không tự chuyển bill lịch sử sang đường dẫn
khác vì không có dữ liệu để xác định máy đã ghi sai ngày nào.

Hai JS mới tránh ghi đè file immutable đã phát hành:

- `cham_cong.v4.js`: lịch VN cho Ca làm việc TC33/XOFA; v3 giữ nguyên.
- `lai_lo.v6.js`: sinh từ quanlygieo bằng `tools/tao_lai_lo.js`, có cùng helper ngày;
  manage trỏ v6; v1–v5 giữ nguyên. Không đổi công thức lãi/lỗ/thu hồi vốn.

## Kiểm tra

- `sh tools/sinh_lai_tat_ca.sh`: sinh bản thử, Tết, Giáng sinh và ba bộ deploy;
  kiểm toàn bộ 105 file test.
- `tests/xuyen_app_thanh_toan_ngay.test.js`: 12 tổ hợp phương thức/addons, màn Doanh
  thu POS, caller tạo DTO thanh toán POS Gieo/XOFA, thời điểm thật/ngày/tháng/qua DST
  ở VN, UTC, Sydney, New York và Honolulu.
- `tools/kiem_tra_xuyen_app.js --assert-clean`: 0 ca lỗi, 9 kiểm tra đạt. Chạy hàm
  áp quà/ghi bill/mua topping thật trên Firebase giả; không chỉ so hai app với nhau.
  [JSON sau sửa](kiem_tra_xuyen_app/ket_qua_sau_fix_20-10.json) lưu SHA256 các file đã kiểm;
  JSON trước sửa được giữ để đối chiếu.
- Chromium: RT/báo cáo 234; tiền mặt 142 (gồm xoá sạch đệm, phiếu cũ và đệm doanh thu
  v3 sai); trần giờ công 6; bed 16; FIFO retry 28; nhập kho/sửa phiếu 80; thanh toán
  TC33 57 và XOFA 34. Tổng 597 assertions, không phải 597 chức năng độc lập.
- Cú pháp 52 script inline và hai JS mới đạt; ranh giới engine/đường dẫn sạch.

Tất cả dữ liệu kiểm là fixture, request ngoài bị chặn. Firebase thật, máy in/két và
webhook ngân hàng thật chưa được kiểm. Không thay engine v19 hoặc data_access v9.

## File cập nhật

Mỗi ZIP trong `tai_ve/fix_ba_loi_xuyen_app_{thuong,giangsinh,tet}_20-10.zip` gồm
đúng 9 file đã đổi: năm HTML, hai HTML thử và hai JS mới. Lấy từ bộ deploy theo mùa,
đã đặt đúng tên. Chọn một mùa, chép đè cả bộ file trong ZIP. Giữ các JS phiên bản cũ
đang có để máy còn HTML trong đệm tiếp tục tải được. Không cần xoá đệm tiền nhận,
không cần di chuyển dữ liệu Firebase.
