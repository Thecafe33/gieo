# Gấu Noel 2026 — luật chơi + hướng dẫn gỡ chương trình

## Bản hiện hành: `gau_noel_giangsinh.v5.js` (19/11, CHƯA deploy)

v4 đã deploy → v5 = v4 + **đúng 1 thay đổi** (chủ dự án chốt 19/11): phần quay **ngẫu nhiên cố định 40%** tỉ lệ gấu / lãi của quán, phần chắc trúng (ống may mắn, bill 6 ly, bed 160K, nhịp đông khách) dùng ~60% còn lại. Xác suất 1 lượt = `rho × CFG.phanRand (0,4) × lãi cặp ÷ 17K` (trần 60%). v4: `max(20%, 1 − gEst) × rho` — bắt đầu 60% rồi tụt về 20% khi chắc trúng nhiều. `gEst` vẫn được tính (không còn dùng để bốc). Dữ liệu (`kho.v4`, lượt `v: 4`) giữ nguyên — v5 chạy tiếp số liệu v4. Test `tests/gau_noel_v5.test.js`.

Rà 19/11 (khách không trúng 3 ngày sau khi «lên v4»): dashboard cho thấy tỉ lệ TC33 / XOFA đứng đúng 6% (`rhoDau`, chỉ có ở ngày đầu), «tuần này» dự kiến 0,1, Gieo «chưa có bill nào từ khi đổi bản mới» → máy quầy gần như chưa chạy v4 (còn trang cũ có v3, mà v3 đã hết suất ngẫu nhiên theo chặng). Phần gắn vào 3 POS đã đối chiếu: không lỗi. Sau deploy phải tắt hẳn / xoá bộ nhớ đệm POS.

## Bản trước: `gau_noel_giangsinh.v4.js` (16/11, đã deploy)

Phần gắn vào app và cách gỡ chương trình **giữ nguyên như v3** (ghi chú v3 bên dưới; đọc «v3» thành «v4»). Khác v3 ở luật phát gấu:

| | v3 | v4 |
|---|---|---|
| Số lượt | 2–3 ly = 1 · 4–5 = 2 · từ 6 = 3 | Như cũ, tính theo cặp 2 ly: bill lẻ bỏ 1 ly giá ở giữa |
| Mức giá lượt | tổng tiền nước ÷ số lượt, 4 mức cứng | giá 1 cặp; tỉ lệ trúng tỉ lệ thuận với lãi cặp (giá cặp − 17,8K) |
| Kho | 29 ô: 4 mức × 7 chặng + số gấu thật | 1 số / quán + Nạp thêm (quản lý tự quyết) |
| Nhịp phát | trần từng chặng + trần «trước 23» | tỉ lệ «gấu / đồng lãi» đặt lại mỗi ngày = gấu còn × 17K ÷ (lãi TB × ngày còn), đổi ≤ ±15%/ngày → gấu theo doanh thu từng ngày, phát hết kho tới 25/12 |
| Chắc trúng theo khách | trượt 5 lượt + đủ lãi 113K | ống may mắn: mỗi lượt +4% lãi cặp, đủ 17K → chắc trúng (KHÔNG hiện cho khách — cơ chế nội bộ, chỉ quản lý thấy trong tab Gấu) |
| 23–25/12 | trần riêng từng ngày, 4 ly chắc trúng | giữ 20% kho; 4 ly vẫn chắc trúng, nhưng cứ 5 bill thì 1 bill nhường gấu cho bill 2 ly |
| Khuyến mãi tuần | — | tuần trước phát thiếu dự kiến ≥ 3 gấu → Thứ 2 & Thứ 4 tuần này tỉ lệ ×2; tab Gấu báo + lời quảng cáo |
| Nhịp đông khách | — | chỉ lượt **quay tại quầy**: XOFA 5 / Gieo Gieo 4 bill trong 10 phút, các bill trước đều trượt → bill này chắc trúng (xét lúc mở lượt) |
| Bill 6 ly, bed 160K | chắc trúng | giữ nguyên |

**Nhận tiếp số liệu v3:** lần đầu v4 bốc lượt cho một quán, gấu còn = `tong − phat` của v3 (mọi gấu v3 đã trúng) → 80% ngày thường, 20% cho 23–25/12; ghi dấu `v4.nhanTu`. Lượt / mã / khách của v3 giữ nguyên, đổi quà và mở lượt như cũ. Huỷ bill có gấu chưa nhận → trả về phần kho đang chạy.

Dữ liệu thêm: `gau_noel_2026_kho/{quán}.v4` (thuong, noel, quy2, rho, laiTB, hom, tuan, boost, nhip…), `napLog`; `gau_noel_2026/{sđt}.ong` (ống may mắn, đồng). Tham số trong `CFG` đầu file (ongR, phanNoel, noelChia, rhoBuoc, nhip, x2Thieu…).

## Ghi chú đầu file v3 (giữ để tra cứu)

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
