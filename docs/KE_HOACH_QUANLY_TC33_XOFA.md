# Quản lý The Cafe 33 + XOFA (`manage.html`) và Ca làm việc ở 2 POS

Chủ dự án yêu cầu ngày 12/10/2026. Nằm NGOÀI kế hoạch Unit Engine / đa cửa hàng Gieo — không đụng engine,
không đụng `data_access`, không đổi hành vi của `posgieo.html` / `quanlygieo.html`.

## 1. Phạm vi

| File | Việc |
|---|---|
| `manage.html` (mới) | App quản lý cho **The Cafe 33** (`pos.html`) và **XOFA** (`PosX.html`): doanh thu 2 quán song song + Nhân sự (Nhân viên, Lịch làm việc, Chấm công, Lương). Giao diện lấy `quanlygieo.html` làm mẫu, màu chủ đạo xanh `#006241` của `pos.html`. **Không** có Kho / NL / BTP / FIFO / lãi lỗ / mở ca – kết ca. |
| `cham_cong.v1.js` (mới) | Màn **Ca làm việc** (check-in / check-out bằng mã PIN) dùng chung cho `pos.html` và `PosX.html`, giao diện theo khối Check-in / Check-out của `posgieo`. Cùng quy tắc phiên bản như engine: sửa bản đã deploy = tạo `cham_cong.v2.js` và trỏ cả 2 POS sang. |
| `pos.html`, `PosX.html` | Đưa vào repo (bản chủ dự án gửi ngày 12/10). **Chỉ** thêm: thẻ `<script src="cham_cong.v1.js">` + nút mở màn Ca làm việc. Không sửa gì khác. |

`index.html` (app khách The Cafe 33) — không đụng.

## 2. Quyết định đã chốt (12/10)

1. Tên file `manage.html`.
2. Doanh thu chia **y như POS đang làm**:
   - **The Cafe 33** (`calculateStats` của `pos.html`): Đồ uống / Ăn vặt / **Khác** — phân loại theo `type` của món trong menu RT `menu` (khớp tên, không phân biệt hoa thường); "Tổng nước" = Đồ uống + Khác. Khác **hiện luôn**, không ẩn sau nút 🐶. Tiền mặt / Chuyển khoản tính theo `o.total` (cả bill). Bỏ đơn `total <= 0`.
   - **XOFA** (`updRv` của `PosX.html`): Tổng (không gồm Food) = Tại quán + To Go; Tiền mặt / Chuyển khoản (đơn TÍNH RIÊNG chia theo `splitGroups`); **Food** tách riêng (tiền mặt / chuyển khoản); số đơn Ship.
   - Dòng **Tổng 2 quán** = mọi tiền thu của cả 2 quán (TC33 cả Ăn vặt, XOFA cả Food) — ghi rõ trên màn.
   - Không lấy số liệu giường (bed). Không có doanh thu Gieo.
3. Kỳ xem: Hôm nay / Tuần / Tháng / Năm / Tuỳ chọn, 2 cột cạnh nhau + biểu đồ 2 quán.
4. Giảm lượt đọc: tổng hợp của **ngày đã qua > 8 ngày** lưu trong máy (localStorage); nút Tải lại xoá đệm.
5. Trường mới trên `employees_gieogieo`: **`workStores`** = mảng `['gieo','tc33','xofa']` (chọn nhiều). Thiếu = `['gieo']`.
   `pos.html` / `PosX.html` chỉ cho check-in người có tích đúng quán. `posgieo` **giữ nguyên** (chưa lọc theo trường này).
6. Nhân sự cứng của TC33 / XOFA **không** đưa vào hệ thống. Người mới thêm ở `manage.html` chỉ có lương giờ.
7. Chấm công lưu **riêng**: `employee_shifts_tc33`, `employee_shifts_xofa` — cùng cấu trúc `employee_shifts_gieogieo`
   (`employeeId, employeeName, businessDate 'YYYY-MM-DD', payTerms, checkedInAt, checkedOutAt`) + `store`.
   Không trộn vào chấm công Gieo (nếu trộn, lương / chi phí nhân công của Gieo bị cộng sai).
   Quy tắc như POS Gieo: PIN 4 số, sai 3 lần khoá ô 60 giây, tối đa 2 lần vào/ra mỗi ngày, đang trong ca phải ra mới vào lại, chụp mức lương vào ca.
   **Không** chặn bán hàng khi chưa ai check-in (nhân sự cứng không check-in). **Không** tự chốt ca bỏ quên (2 quán không có đóng ngày → không có mốc giờ ra đáng tin) — ca treo hiện đỏ ở màn Chấm công để Quản lý điền tay.
8. Lương: đơn giá giờ dùng chung trong hồ sơ (kể cả `payHistory`, OT theo ngày như Gieo). `quanlygieo` tính phần giờ ở Gieo, `manage.html` tính phần giờ ở TC33 / XOFA; màn Lương có thêm cột giờ ở Gieo để tham khảo.
9. `manage.html` sửa được hồ sơ nhân viên dùng chung (thêm, sửa, ngừng, PIN, lương, cửa hàng). Cài đặt nhân sự riêng: `hr_settings_tc33xofa/current` (`lateGraceMinutes`) — không sửa bản của Gieo.
10. Lịch làm việc riêng từng quán: `work_schedules_tc33`, `work_schedules_xofa`, doc id `{employeeId}_{date}` như Gieo; một người có thể có lịch ở 2 quán cùng ngày.
11. Đăng nhập: cùng tài khoản dùng chung như `quanlygieo`.

### Bổ sung 12/10 (lần 2)

12. Thêm kỳ **Hôm qua** (biểu đồ theo khung giờ, dòng "So hôm kia").
13. Ô lớn đổi thành **Doanh thu chung 2 quán** = Tổng nước TC33 + Tổng không gồm Food XOFA (số chính của từng POS), kèm thanh **% đóng góp** của từng quán (2 số cộng đúng 100). Tổng thu cả bill (gồm Ăn vặt, Food) vẫn ghi ở dòng phụ. Mỗi cột quán có nhãn "Góp …% tổng".
14. **Mục tiêu** (mục riêng trong menu): đặt theo **tháng**, mỗi tháng một mức; tháng chưa đặt dùng mức của tháng gần nhất trước đó (từng ô riêng). 3 ô: The Cafe 33 (so với Tổng nước), XOFA (so với không gồm Food), **Chung 2 quán nhập riêng** (so với Doanh thu chung). Kỳ khác tháng: mục tiêu ngày = mục tiêu tháng ÷ số ngày tháng đó, cộng theo các ngày trong kỳ. Kỳ chưa hết có thêm dòng "Tiến độ tới hôm nay".
    Lưu: `revenue_targets_tc33xofa/months` → `{ m: { 'YYYY-MM': { tc33, xofa, all, updatedAt } } }` (1 doc, 1 lượt đọc).

## 3. Nguồn dữ liệu đọc doanh thu (không ghi)

| Quán | 3 ngày gần nhất (RT) | Đã lưu trữ (Firestore) |
|---|---|---|
| TC33 | `orders/{yyyy}/{mon}/{dd}` (+ node cũ `order`) | `orders_archive/{yyyy}/{mon}/{dd}` → `.orders` — POS đọc RT trước, RT trống mới đọc archive |
| XOFA | `orders_xolifa/{mon}/{dd}` (không có năm) | `orders_xolifa_archive/{mon}_{dd}_{yyyy}` → `.orders` — POS archive cửa sổ 3→7 ngày, có thể nằm ở cả 2 chỗ → đọc cả 2 rồi gộp theo mã đơn (≤ 8 ngày) |

`mon` = `jan…dec`.

## 4. Việc chủ dự án cần làm khi deploy

- Chép `manage.html`, `cham_cong.v1.js`, `pos.html`, `PosX.html` vào thư mục deploy.
- Rules Firestore: nếu rules không phải dạng "đã đăng nhập = toàn quyền mọi collection", cần mở thêm
  `employee_shifts_tc33`, `employee_shifts_xofa`, `work_schedules_tc33`, `work_schedules_xofa`, `hr_settings_tc33xofa`,
  `revenue_targets_tc33xofa`.
- Vào `manage.html` → Nhân viên → tích "Làm ở cửa hàng" cho người sẽ chấm công ở TC33 / XOFA.

## 5. Còn để ngỏ (báo, chưa làm)

- `quanlygieo` vẫn liệt kê cả người chỉ làm TC33 / XOFA ở màn Lịch làm việc / Lương của Gieo (0 giờ). Lọc theo `workStores` = đổi hành vi Gieo → hỏi trước.
- `posgieo` vẫn cho người chỉ làm TC33 / XOFA check-in ở Gieo.
