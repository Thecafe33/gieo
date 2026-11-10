# Gấu Noel 2026 — ghi chú đầu file `gau_noel_giangsinh.v3.js` + hướng dẫn gỡ chương trình

Chuyển từ phần chú thích đầu file ngày 10/11 (file JS được app khách nạp nên không để tên file POS / ghi chú nội bộ trong đó). Nội dung nguyên văn:

```text
/* gau_noel_giangsinh.v3.js — QUAY TRÚNG GẤU GIÁNG SINH 2026, dùng chung 3 quán + app khách:
 *   pos.html (The cafe 33) · PosX.html (XOFA) · posgieo.html (Gieo Gieo) — BỐC THĂM lúc thanh toán đơn có SĐT, Đổi quà,
 *     Mở lượt tại quầy, huỷ bill (PosX / Gieo). The cafe 33: popup QR sau thanh toán. Gieo: QR cuối bill in.
 *   kiosk.html (màn hình phụ XOFA) — data-quan="kiosk": QR + số lượt sau thanh toán, chiếu lại «Mở lượt tại quầy» (RT gau_noel_2026_kiosk).
 *   index_giangsinh.html (app khách) — data-quan="khach" (chèn bởi tools/tao_ban_giangsinh.js): popup «Bạn có N lượt quay» khi có lượt,
 *     quay = MỞ lượt đã bốc, thẻ «Gấu Noel của bạn» dưới thẻ thành viên (mã nhận, quán nhận, đã nhận).
 *   pos.html → Quản lý → «Gấu Noel»: CÔNG TẮC BẬT / TẮT chương trình (cả 3 quán chỉ chạy khi bật), ngày bắt đầu,
 *     nhập kho từng quán, thống kê, XOÁ HẾT dữ liệu khi hết đợt.
 * Kế hoạch: docs/KE_HOACH_GAU_NOEL_2026.md. Chủ dự án chốt 16/10/2026:
 *   - Mua 2 ly tính tiền = 1 lượt (4–5 ly = 2, từ 6 ly = 3 lượt, chắc ≥ 1 gấu). Không giới hạn lượt / SĐT / ngày.
 *   - Tỉ lệ 1 lượt = số ly × giá đơn × lịch sử SĐT × ngày/giờ × kho (trần 60%). Trượt đủ lượt VÀ đủ lãi tích luỹ → lượt sau chắc trúng.
 *     23–25/12: tỉ lệ ×3, chắc trúng sớm hơn. The cafe 33: bill bed trên 160K (không tính ăn vặt) = trúng chắc.
 *   - Mỗi loại lượt có KHO RIÊNG (số con cụ thể theo chặng) — hết kho thì loại lượt đó ngừng trúng. Không có mẫu gấu: khách chọn tại quầy.
 *   - Kết quả bốc ở POS (rules Firebase hiện "đã đăng nhập = toàn quyền" → không bốc trên máy khách); khách quay lúc nào cũng được
 *     tới hạn nhận = MỞ kết quả. Trúng ở quán nào nhận ở quán đó: nhân viên nhập SĐT → Đổi quà → mã hết hiệu lực.
 *   - Hạn nhận 31/12/2026; gấu chưa nhận quay về kho (dùng cho chương trình sau).
 *   - Chỉ chạy khi CÔNG TẮC BẬT (gau_noel_2026_kho/_cfg.bat — tab Quản lý pos) VÀ trong ngày của đợt (giờ máy chủ .info/serverTimeOffset).
 *     Tắt (mặc định) = không bốc, không hiện gì, không ghi gì; chỉ nghe 1 doc _cfg.
 *   - Dữ liệu riêng (không đụng customers): gau_noel_2026/{sđt}, gau_noel_2026_kho/{quán | _cfg}.
 *   - Gắn vào app bằng ĐÚNG 1 THẺ trước </body>: <script src="gau_noel_giangsinh.v3.js" data-quan="tc33|xofa|gieo"></script>
 *     Phần gắn chỉ BỌC hàm sẵn có của app từ bên ngoài (không sửa code bên trong app).
 * v2 (16/10): v1 đã deploy bị sửa tại chỗ (vòng quay, nút Đổi gấu sidebar, quay tại quầy tự «Đã nhận», bed 160K lúc vào active, bán qua app
 *     không lượt, dashboard…) → máy giữ v1 trong bộ nhớ đệm không thấy → đổi tên v2. v1 giữ nguyên trên hosting (máy còn HTML cũ xin nó).
 * v3 (10/11): (1) khung «Gấu Noel của khách» ở quầy CHỈ hiện gấu của lượt khách ĐÃ quay (mở) — gấu của lượt chưa quay không lộ mã / kết quả,
 *     không đổi được trước khi quay (khớp app khách vốn đã giấu); (2) TC33: dòng «Nợ cũ» không tính vào mốc bed trên 160K.
 *     v2 giữ nguyên trên hosting (máy còn HTML cũ trong bộ nhớ đệm vẫn xin nó).
 * Sửa file này sau khi đã deploy = tạo gau_noel_giangsinh.v4.js (cùng quy tắc phiên bản như engine).
 *
 * ═══ GỠ CHƯƠNG TRÌNH SẠCH SẼ KHI HẾT GIÁNG SINH (sau 31/12/2026) ═══
 *   1. pos.html (The cafe 33) → Quản lý → tab «Gấu Noel»:
 *        a. Bấm TẮT chương trình (3 quán ngừng ngay, không cần deploy).
 *        b. (Tuỳ chọn) Tải thống kê, chụp màn hình để lưu số liệu đợt.
 *        c. Bấm «Xoá dữ liệu Gấu Noel…», nhập mã 2512 → xoá hết gau_noel_2026 (khách, lượt, mã) + gau_noel_2026_kho (kho, công tắc)
 *           + Realtime gau_noel_2026_kiosk (màn hình phụ).
 *           Không đụng customers, đơn hàng, điểm, tem. Báo lỗi giữa chừng → bấm lại, xoá tiếp phần còn lại.
 *   2. Deploy bộ ban_deploy/thuong/ (đã bỏ sẵn thẻ Gấu Noel — xem ban_deploy/README.md). Muốn bỏ hẳn khỏi file gốc trong repo:
 *      gỡ 1 thẻ <script src="gau_noel_giangsinh.v…js" …> trước </body> ở: pos.html, PosX.html, posgieo.html
 *      + kiosk.html (màn hình phụ XOFA)
 *      + index_giangsinh.html: đặt GAU_NOEL = '' trong tools/tao_ban_giangsinh.js rồi chạy lại node tools/tao_ban_giangsinh.js
 *        (hoặc deploy lại index.html bình thường nếu hết mùa Giáng sinh).
 *      Tìm nhanh: grep -n "gau_noel_giangsinh" *.html
 *   3. Chạy lại bản sinh tự động có chép từ các file trên: node tools/tao_ban_tet.js (pos_tet / PosX_tet), node tools/tao_ban_thu.js
 *      (posgieo_thu / quanlygieo_thu); chạy sh tests/run_all.sh — xoá luôn tests/gau_noel.test.js.
 *   4. Deploy (chủ dự án tự chạy). Sau đó xoá file gau_noel_giangsinh.v*.js khỏi thư mục deploy ở lần deploy KẾ TIẾP
 *      (để máy còn bản HTML cũ trong bộ nhớ đệm không lỗi khi xin file).
 *   5. data_access.v9.js giữ nguyên (2 tên gau_noel_2026* trong bảng đăng ký không ảnh hưởng gì) — không tạo bản mới chỉ để bỏ tên.
 *   6. Xoá docs/KE_HOACH_GAU_NOEL_2026.md hoặc chuyển vào docs/luu_tru/, bỏ dòng Gấu Noel trong CLAUDE.md.
 *   Bỏ qua bước 1c trước khi gỡ thẻ script = dữ liệu còn nằm trên Firebase (không hại gì, nhưng phải gắn lại file để xoá).
 */
```

## Phần gắn vào app (chú thích cũ trước dòng `(function () {` thứ hai)

```text
/* ═══ PHẦN GẮN VÀO APP ═══ (chỉ chạy trong trình duyệt, theo data-quan của thẻ script)
 * Chỉ BỌC hàm sẵn có của app — không sửa code bên trong app. App đổi tên hàm → phần gắn tự bỏ qua (cảnh báo console).
 *   tc33 (pos.html):    _pushPaidOrder + clearDebtAfterPayment (chỉ chạy khi đơn lưu thành công) → bốc → popup QR;
 *                       checkSdtLive / resetPhoneInput → khung Gấu Noel (Đổi quà, Mở lượt tại quầy); tab Quản lý «Gấu Noel».
 *   xofa (PosX.html):   _loyaltyAfterSave → bốc → hỏi «Quay tại quán / Quét mã» (màn hình phụ: vòng quay hoặc QR); renderCustomerInfo / clearCustomer → khung; delOrderConfirm → huỷ bill.
 *   gieo (posgieo.html): assistFinalizeOrder → bốc; POSPrinter.autoPrintIfEnabled → hỏi «Quay tại quán / Quét mã ở nhà» trước khi in;
 *                       buildReceiptContent / renderReceiptCanvas → QR cuối bill (bỏ khi quay tại quán);
 *                       renderCustomerInfo / clearCustomer → khung; delOrderConfirm → huỷ bill.
 */
```
