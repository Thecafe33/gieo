# Pha nhầm trong nhóm dễ nhầm (Engine 2, family BTP — kế hoạch 23/10/2026)

Thiết kế chủ quán đã duyệt từng điểm trong buổi trao đổi 23/10. Mất mát chính là **khách nhận sai món**, không phải lượng cốt.
Từ số kho không biết được bill nào → hệ thống **không bao giờ chỉ đích danh bill / người**.

## Ràng buộc đã chốt

- Bán hàng là ưu tiên: **không thêm thao tác lúc bán** (không xác nhận từng ly, không quét mã — BTP chỉ có tem).
- **Không in cốt lên tem ly** (khách thấy → lộ công thức).
- **Không đo mất khách** (tăng lượt đọc). Danh sách bill nghi chỉ tải khi quản lý mở sự cố.
- Chỉ ghép bù **trong cùng nhóm dễ nhầm do chủ quán khai báo**. Khác nhóm (vd cốt trà sữa thiếu – thạch cafe dư) → hai việc riêng.
- Ba nhóm hiện tại đã đủ; không cốt nào nấu từ cốt khác:
  1. Cốt trà sữa · Cốt sữa gạo
  2. Cốt trà lài · Cốt trà ô long · Cốt trà Camelia · Cốt trà đen
  3. Thạch dừa · Trân châu trắng · Trân châu hoàng kim baby · Thạch trà · Thạch Cafe
- Nhóm **cấu hình ở quanlygieo** (thêm món mới dễ nhầm → gán nhóm).
- Sau sự cố: **cân lại các món của cặp nghi lúc mở ca kế tiếp** (trước giờ bán) để loại «cân / nhập nhầm ô»; những ngày sau, **chỉ nhân viên có ca check-in trong ngày xảy ra sự cố** phải cân nhóm đó lúc bàn giao ca (ngoài giờ bán) — nhân viên khác không.

Lưu ý dữ liệu thật gg01: nhóm 3 trộn **BTP** (Thạch trà, Thạch Cafe — đếm cuối ngày, dòng `prep_transactions` ADJUSTMENT `fromPrepCount`) và **NL có tem** (Thạch dừa, Trân châu trắng, Trân châu hoàng kim baby — cân tem cuối ca, dòng `stock_transactions` `wasteKind:'shift_weigh'`). Món không có lượt đếm / cân trong ngày thì không tham gia ghép ngày đó (ghi rõ trong hồ sơ).

## Các bước

| # | Hạng mục | Nội dung |
|---|---|---|
| P1 | Cấu hình nhóm ở quanlygieo | Trường `nhomDeNham` (tên nhóm) trên `prep_items` và `inventory_items` — danh mục loại C, `catalogMirror` tự đồng bộ sang quán khác, không bảng mới. Form sửa BTP / NL: ô chọn nhóm có sẵn hoặc tạo nhóm mới; màn Kho: khung «Nhóm dễ nhầm» liệt kê nhóm và món. Hệ thống không tự đoán nhóm theo tên. |
| P2 | Lõi ghép (thuần, `unit_engine2_v1.js` — chưa phát hành, sửa tại chỗ) | Đầu vào mỗi ngày: lệch đếm từng món (đếm − sổ), số phần đã bán trong ngày (sổ bán), định lượng 1 phần, cỡ mẻ + giờ nấu. Chỉ ghép trong nhóm; dư X ≈ k phần X (k ≤ phần X đã bán), thiếu Y ≈ k phần (định lượng X hoặc Y), sai số max(15 g, 10%). Nhóm nhiều món: thử mọi cách ghép; hai cách khớp ngang nhau → «mập mờ». Loại «nấu nhầm loại mẻ» (lệch ≈ cỡ mẻ, khớp giờ nấu). |
| P3 | Store + worker | Chạy sau khi đếm cuối ngày đủ (dòng đếm của các món trong nhóm). Hồ sơ `mixups` (sự cố chất lượng, không phải hao hụt): `checking` → giao việc cân lại lúc mở ca sau → số đảo về đúng = nhập nhầm ô (ghi lỗi nhập liệu); không đảo = **nghi pha sai món**. Phần ghép khớp không chia hao hụt; trách nhiệm ca / nhóm pha chế trong ngày, ghi «không xác định được bill». Thông báo để biết (`fyi`) mức cao. Chế độ thử chỉ ghi hồ sơ. |
| P4 | POS | Việc «cân lại» lúc mở ca (danh sách món của cặp nghi) + việc cân nhóm lúc bàn giao cho đúng nhân viên có ca trong ngày sự cố (theo `employee_shifts`), vài ngày, đủ số ca sạch tự bỏ. Không có thao tác nào trong luồng bán. |
| P5 | quanlygieo / quanlygieo2 | Báo cáo tháng: dòng «Sự cố nghi pha sai món» (ngày, nhóm, k ly, ca). Mở sự cố → tải danh sách bill có món X trong ngày (1 truy vấn, khi bấm). |
| P6 | Kiểm toán + mô phỏng | Mã lỗi mới (ghép khác nhóm, kết luận khi chưa cân lại, chỉ đích danh bill, chia hao hụt phần đã ghép) + lỗi cài; kịch bản mô phỏng: pha nhầm thật / nhập nhầm ô / nấu nhầm mẻ / khác nhóm trùng số (không được ghép). |

Thứ tự: P1 trước (chủ quán gán nhóm được ngay, chưa đổi hành vi nào), rồi P2 → P6. Chưa deploy.
