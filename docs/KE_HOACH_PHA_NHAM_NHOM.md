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

## Trạng thái

| Bước | Trạng thái |
|---|---|
| P1 | ✅ 23/10 — quanlygieo: ô «Nhóm dễ nhầm» ở form BTP (`prepDraft.nhomDeNham`) và form nguyên liệu (`invNhomDeNham`), gợi ý nhóm sẵn có (`nhomDeNhamFieldHTML`), khung «Nhóm dễ nhầm» trên danh sách BTP (`nhomDeNhamPanelHTML`, gồm cả NL); gộp không phân biệt hoa thường (`nhomDeNhamGroups`). Test `tests/nhom_de_nham.test.js`. Chủ quán tự gán 3 nhóm cho từng món. |
| P2 | ✅ 23/10 — lõi `E.mixMatch` / `mixPair` / `mixReweigh` / `mixNoise` / `mixPortion` (`unit_engine2_v1.js`). Ngưỡng theo **độ nhiễu đếm của chính món** (σ ≈ trung vị \|lệch\| 30 ngày ÷ 0,6745): lệch phải ≥ 3,5σ mới xét; dư ≈ k phần 1 ly (sai số max(15, 10%, 2σ)), k ≤ đã bán; thiếu ≈ dư (sai số thêm 15% cho muỗng / ca món khác). Ghép một-một trong nhóm, hai cách ngang nhau → «mập mờ». Lệch ≈ cỡ mẻ → «ghi nhầm loại mẻ»; cặp ngược chiều hôm sau một lần «nhập nhầm ô» → «sổ tự đúng lại». |
| P3 | ✅ 23/10 — store `mixupDay` (worker: vụ lệch `duty_cases` mới tạo → `mixup_day`), hồ sơ `duty_digests/_engine2/mixups` (k ly, N bill có món dư + giờ bán, ca / nhóm pha chế, «không xác định được bill / người»). Phần ghép rút khỏi phân bổ qua kho v21 `duty.markMixup` (pool kind `mixup`, tổng vụ lệch giữ nguyên, hồ sơ quyết định tay không đụng). Cân lại lúc mở ca → `mixupEvidence`: sổ đảo đúng lượng = «nhập nhầm ô» (báo lỗi nhập liệu); không đảo = «nghi pha sai món» (thông báo để biết mức cao); khác = «nghi pha sai món hoặc nhập nhầm ô». Quá 36 giờ chưa cân lại → `mixupSweep`: mức «nghi». Lượt sau cùng ngày ghép khác → hồ sơ cũ `superseded`. Chế độ thử chỉ ghi hồ sơ. |
| P4 | ✅ 23/10 — POS (`gieo_engine2_pos_v1.js`): việc «Cân lại lúc mở ca (trước khi bán)» và «Cân nhóm dễ nhầm lúc bàn giao — tên NV» (nhập số đã trừ bì từng món, chỉ là bằng chứng). Theo dõi `mixup_watch` theo nhóm: nhân viên có ca trong ngày sự cố check-in ngày sau → việc giao ĐÍCH DANH (`mixupHandover`); NV khác không. 3 lượt sạch hoặc hết 7 ngày → thôi; lặp lại dư/thiếu cùng lượng → báo «lặp lại» + gia hạn. Không thao tác nào trong luồng bán. |
| P5 | ✅ 23/10 — quanlygieo › Tổng kết tháng › Chi tiết nhân sự: khung «Sự cố nghi pha nhầm» (`thangKetMixupLoad`, 1 truy vấn khoảng ngày / tháng / quán, nhớ theo tháng; mở từng sự cố mới hiện giờ bán của các bill nghi — dữ liệu có sẵn trong hồ sơ). quanlygieo2 sinh từ quanlygieo nên có cùng khung; thông báo `fyi` → «xong» (`ENGINE2_FYI`). |
| P6 | ✅ 23/10 — kiểm toán độc lập `MIXUP_CROSS_GROUP`, `MIXUP_NAMED_PERSON`, `MIXUP_CONCLUDED_WITHOUT_REWEIGH`, `MIXUP_STILL_ALLOCATED` + lỗi cài (`tests/unit_engine2_audit.test.js` 53/53); mô phỏng `tools/automation/mixup_sim.js` + `tests/mixup_sim.test.js`; test runtime `tests/unit_engine2_mixup.test.js`. |

## Kết quả mô phỏng (hạt giống 11–13 không dùng khi chỉnh, 3 × 3000 ngày)

| Nhiễu đếm | Bắt được pha nhầm thật | Kết luận «nghi» đúng | Báo «nghi» sai | Ghép khác nhóm |
|---|---|---|---|---|
| Vừa (2% lượng bán) | 66% | 81% | 1,5 / 100 ngày | 0 |
| Như dữ liệu thật gg01 (σ ≈ 45) | 39% | 66% | 1,9 / 100 ngày | 0 |

- Bỏ sót chủ yếu khi lệch của chính món bị nhiễu đếm / hao hụt khác che (đặc biệt topping: thạch trà / thạch cafe ở gg01 lệch trung bình 100–144 g / ngày). Đếm càng chính xác thì càng bắt được nhiều.
- Báo «nghi» sai chỉ dẫn tới: thông báo để biết + vài lượt cân nhóm lúc bàn giao — không quy hao hụt, không chỉ đích danh ai.
- Dữ liệu thật gg01 20 ngày đếm (gán 3 nhóm theo tên, chỉ trong script): **0 lần ghép** (kể cả khi tắt điều kiện nhiễu) → không báo động giả trên lịch sử.
- Giới hạn: một món dư ghép một món thiếu (không ghép một dư – hai thiếu); món không có lượt đếm / cân trong ngày thì không xét.

