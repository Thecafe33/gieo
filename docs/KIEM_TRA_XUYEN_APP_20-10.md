# Rà tính năng xuyên app — 20/10/2026

Mã ứng dụng được rà: `ee8b895957e191607ceaafb6bd1a6a64d6dde984`, nhánh
`Phan-tach-unit-engine`. Phạm vi: `pos.html` (TC33), `PosX.html` (XOFA),
`posgieo.html`, `manage.html`, `quanlygieo.html` và các JS đang được các app nạp.

**Tái hiện được 3 nhóm lỗi, gồm 6 trường hợp. Chưa sửa mã ứng dụng trong lượt rà này.**
Bộ test cũ vẫn đạt không có nghĩa số nghiệp vụ đều đúng: nhiều test so hai app với nhau,
trong khi cả hai có thể đang cùng tính sai. Các ca mới đối chiếu tiền thực trả/phương
thức từng lần thu với đầu ra, không chỉ so tính đồng nhất giữa hai hàm.

Không đọc/ghi Firebase thật, không deploy, không thay các luồng bán hàng mà chủ quán
đã yêu cầu giữ. Tất cả số/khách/PIN trong phép thử đều là fixture.

## 1. P1 — Topping bổ sung khác phương thức làm lệch đối soát Gieo

Chạy `_submitAddonImpl` thật trên Firebase giả nghiêm: bill ban đầu 30.000đ,
nhân viên thêm topping 5.000đ. Hàm ghi transaction thành công với tổng 35.000đ và
`addons[].amount/method` đúng. Sau đó đưa chính bill vừa ghi vào các hàm đọc thật.

| Thao tác | Đúng: TM / CK | POS Gieo: TM / CK | quanlygieo: TM / CK | manage: TM / CK |
|---|---:|---:|---:|---:|
| Gốc TM 30K, topping CK 5K | 30.000 / 5.000 | 30.000 / 0 | 35.000 / 0 | 35.000 / 0 |
| Gốc CK 30K, topping TM 5K | 5.000 / 30.000 | 5.000 / 35.000 | 0 / 35.000 | 0 / 35.000 |
| Gốc tách 15K TM + 15K CK, topping CK 5K | 15.000 / 20.000 | 15.000 / 15.000 | 15.000 / 15.000 | 15.000 / 15.000 |

Đối chứng: gốc TM + topping TM thì cả ba nơi đều tính đúng 35.000đ TM.
Doanh thu tổng manage vẫn 35.000đ; lỗi nằm ở phân loại và đối soát phương thức.

Nguồn:

- `posgieo.html`: `_submitAddonImpl`, `orderCashAmountPOS`, `orderBankAmountPOS`.
  Hàm tiền mặt đã tách addons; hàm chuyển khoản chưa có bước tương ứng.
- `quanlygieo.html`: `orderCashAmount`, `orderBankAmount` chưa tách addons;
  `computeCashBreakdownForDate` dùng hai hàm này để tính kỳ vọng két/ngân hàng.
- `manage.html`: `ggAddOrder` dùng lại `xoAddOrder`; hàm này chỉ xét phương thức gốc
  hoặc splitGroups, bỏ qua phương thức của addons.

Ảnh hưởng: mua bổ sung CK có thể thành tiền mặt trong báo cáo; mua bổ sung TM có thể
bị bỏ sót hoặc cộng vào CK. Có thể tạo chênh lệch giả khi quản lý đối chiếu với kết ca.
Không kết luận ownerReceipt hay tiền bàn giao đã ghi bị mất; chúng là dữ liệu riêng.

Hướng sửa: thống nhất phép tách tiền gốc + từng addon, giữ phân bổ splitGroups gốc.
Tính từ bill đã có, không cần đọc Firebase thêm hoặc đổi luồng nhân viên bán hàng.
Sau sửa phải xử lý phiên bản đệm doanh thu cũ; không tự ghi đè phiếu tiền nhận đã xác nhận.

## 2. P1 — Giá 0 của quà TC33 bị khôi phục thành giá menu

Chạy `applyPickedCartItem` thật, rồi `saveOrderToFirebase` để lấy DTO bill (chặn ghi
ở biên `_pushPaidOrder`). Bill có Trà 25.000đ + Bánh được tặng giá 0, khách trả TM
25.000đ. DTO giữ đúng giá Bánh = 0 và total = 25.000đ.

| Số | Đúng | Đầu ra hiện tại |
|---|---:|---:|
| Tổng thu bill | 25.000đ | 25.000đ |
| Doanh thu Trà | 25.000đ | 25.000đ |
| Doanh thu Bánh tặng | 0đ | 20.000đ |
| TM phải nộp, loại Ăn vặt theo quy tắc hiện có | 25.000đ | **5.000đ** |

`pos.html.calculateStats` và `manage.html.tcAddOrder` đều dùng nhánh
`itemPrice > 0 ? itemPrice : giá menu`. Như vậy giá 0 đã lưu rõ ràng bị coi như thiếu giá.
Manage tiếp tục trừ 20.000đ Bánh ảo khỏi TM bill khi tính `cashMain`.
Hai app cho cùng số sai nên test so POS với manage không bắt được.

Hướng sửa: phân biệt không có trường giá với giá 0 hợp lệ; vẫn giữ fallback cho bill cũ
chỉ có chuỗi món. Không thay quy tắc tiền mặt loại Ăn vặt hoặc cách áp quà. Phải nâng/
dựng lại đệm tổng hợp doanh thu khi triển khai, không chỉ đổi hàm rồi giữ số đệm sai.

## 3. P2 — Ngày Việt Nam chưa xuyên suốt khi máy dùng múi giờ khác

Cùng thời điểm `2026-10-20T17:30:00Z` = **00:30 ngày 21/10 giờ Việt Nam**:

- Máy UTC: `pos.html.getOrderParts` chọn nhánh ngày **20**; manage dùng `dkey` giờ VN
  và xem ngày **21**. Bill có thể vào ngày khác với báo cáo đang xem.
- Máy Australia/Sydney: vòng ngày manage dùng `parseDkey` giờ máy rồi đổi sang VN,
  chọn 21/10 nhưng dựng cả **20 và 21/10**. Biên tháng 10 trong `readPayroll` trở thành
  **30/9–30/10**, thừa đầu kỳ và thiếu 31/10.
- Đối chứng máy Asia/Ho_Chi_Minh: ngày và biên tháng khớp mong đợi.

Phép thử này xác minh trực tiếp ở pos/manage, chưa khẳng định mọi màn của POS XOFA/
POS Gieo đều đã được chạy trên tất cả múi giờ. Không phải sự cố luôn xảy ra tại quán:
điều kiện là máy đặt múi giờ khác VN. Cần chuẩn hoá ngày nghiệp vụ, không sửa giờ chấm
công thực tế hoặc tự dịch timestamp đã lưu.

## Những luồng đã chạy

| Bộ kiểm | Kết quả | Phạm vi thực sự kiểm |
|---|---|---|
| `tests/run_all.sh` | 104 file đạt | Bộ test hiện có, gồm kho/FIFO, bán-topping-xoá, đa quán, báo cáo, lương, khuyến mãi |
| `tools/kiem_tra_xuyen_app.js` | 6 ca lỗi, 2 đối chứng đúng | Các ca mới ở ba nhóm trên; không coi exit 0 là hết bug |
| `e2e_bill_realtime.js` | 234 kiểm tra đạt | manage/quanlygieo: bill mới/sửa/xoá → tổng và đúng quán; P&L/thu hồi vốn; không tăng đọc; UI PC/tablet/mobile |
| `e2e_tran_gio_cong.js` | 6 kiểm tra đạt | Loader lương hai app, giới hạn 10,5h = 222.500đ; thiếu lịch chặn tính |
| `e2e_manage_bed.js` | 16 kiểm tra đạt | Bed chờ/đang dùng/quá giờ, gỡ listener, không nghe trùng |
| `tools/manage_cash/e2e_history.js` | 116 kiểm tra đạt | Tiền nhận v3, xoá sạch localStorage/reload, ngày cũ, lỗi mạng/đọc từng quán |
| `tools/kho_fifo/e2e_retry.js` | 28 kiểm tra đạt | Nút Báo hết thật, mất ACK/cleanup, retry đúng lượng, không WASTE trùng |
| `tools/tet/e2e/lx_pos_full.js` | 57 kiểm tra đạt, không pageerror | Checkout TC33 + các loại lì xì trên bản Tết sinh từ gốc; có bill thường không lì xì |
| `tools/tet/e2e/lx_posx_full.js` | 34 kiểm tra đạt, không pageerror | Checkout XOFA + lì xì/To Go/quà đã dùng ở máy khác |

Tổng 491 kiểm tra trình duyệt. Đây là số assertions của các bộ trên, không phải
491 chức năng độc lập hay bằng chứng toàn bộ sản phẩm không còn lỗi.

Hai fixture cũ được cập nhật trong lượt rà, không phải sửa ứng dụng:

- Snapshot Firestore giả trong `mockfb.js` bổ sung `forEach/empty/size` đúng API SDK,
  tránh lỗi giả `snapshot.forEach is not a function`.
- Fixture RT bổ sung lịch cho các ca chấm công sau 01/10, metadata lương snapshot hiện
  hành và một ngày lịch sử có thặng dư dương để kiểm dự kiến hoàn vốn. Thiếu lịch phải
  báo lỗi theo chính sách đã chốt; tốc độ không dương phải giữ dự kiến null, không ép
  ứng dụng đổi kết quả cho test qua.

Các test thanh toán cũ dùng file:// được chạy qua HTTP localhost do Chromium môi
trường này không hỗ trợ mở file://; không thay trang thật. Các request Firebase được
thay bằng fixture trong bộ nhớ; không chạy thanh toán/in/mở két ở quán.

## Chạy lại và việc còn chưa kiểm

```sh
TZ=Asia/Ho_Chi_Minh node tools/kiem_tra_xuyen_app.js --json ket_qua.json
sh tests/run_all.sh
```

Kết quả chi tiết có trong [JSON](kiem_tra_xuyen_app/ket_qua_20-10.json).
Tool chẩn đoán in `BUG` với số mong đợi/thực tế; exit 0 chỉ xác nhận cuộc rà chạy xong.
Sau khi sửa app, các ca tương ứng phải hết `BUG` rồi mới coi nhóm đó đã xử lý.

Chưa kiểm được Firebase thật, máy in/két vật lý, APK tại quầy, webhook ngân hàng thật,
độ trễ mạng/đa thiết bị ở hạ tầng thực và mọi phối hợp khuyến mãi/cấu hình có thể có.
Không coi những phần chưa kiểm là lỗi, cũng không kết luận chúng đã an toàn/đúng hoàn toàn.
Ưu tiên tiếp theo là hai nhóm P1 tính tiền, rồi mới xử lý chuẩn ngày ở nhóm P2.
