# Target nhân viên (động lực) — 03/10/2026

Target doanh thu **của cả quán**, chỉ để tạo động lực cho nhân viên. Target thật (Target KPI ở `config_history_gieogieo`, dùng cho Sức khoẻ quán / hoà vốn) **không đổi**.

## Cấu hình (Quản lý ▸ Nhập liệu ▸ Target ▸ "Target nhân viên (động lực)")
- `staff_target_config_gieogieo/{YYYY-MM}` = `{ mode:'weekday'|'month', weekday:{'1'..'6','0'=CN}: đ/ngày, monthTotal, offDays:['YYYY-MM-DD'], updatedAt }`.
- **Nhập theo thứ**: mỗi thứ một mức; target tháng = cộng từng ngày theo đúng số thứ trong tháng.
- **Nhập theo tháng**: chia đều cho các ngày bán.
- **Ngày nghỉ**: bấm vào ngày trên lịch để tắt — ngày nghỉ target = 0, không tính vào tháng.
- Tháng chưa lưu riêng → dùng cấu hình tháng gần nhất trước đó (không mang ngày nghỉ).

## Doanh thu
Σ `total` của bill trong ngày — cùng công thức ô "Doanh thu" ở Quản lý (`aggregateOrders`).

## Chụp số (giảm lượt đọc)
- `staff_target_days_gieogieo/{YYYY-MM}.days['YYYY-MM-DD'] = { revenue, bills, at }`.
- POS chụp lúc **mở ca** (`_writeShiftOpen` → `stSnapshotOnOpen`, chạy nền), bù mọi ngày còn thiếu trong tháng (trước hôm nay). Lần bấm logo đầu tiên cũng tự bù nếu thiếu.
- Đã chụp thì **không chụp lại** (bổ sung/xoá bill sau đó không đổi số đã chụp — theo chốt với chủ quán). Đọc bill lỗi thì không ghi số 0 giả.
- Đọc bill như Quản lý: RT (3 ngày gần nhất đang có listener — không tốn lượt mạng) + archive (ngày ≥ 3 ngày trước).

## POS — bấm logo GIEO GIEO
- Đảo tối nở ra (kiểu Dynamic Island), 2 thanh: **Hôm nay** = doanh thu hôm nay (bill trong máy) / target hôm nay; **Tháng** = (Σ số đã chụp + hôm nay) / target cả tháng.
- Chỉ hiện **%**, không hiện số tiền. Vượt 100% ghi số thật, thanh vàng. Ngày nghỉ: "Hôm nay là ngày nghỉ".
- 5 giây tự thu về; bấm lần nữa thu ngay. Chưa đặt target → bấm không mở gì.
- Cấu hình + số chụp giữ trong máy 30 phút (2–3 lượt đọc mỗi lần nạp).

## Hàm
- Dùng chung (chép y hệt 2 app): `stPickConfig`, `stDailyTargets`, `stPct`.
- POS: `stLoadConfig`, `stRevenueForDate`, `stEnsureSnapshots`, `stLoad`, `stSnapshotOnOpen`, `stProgress`, `stIslandHTML`, `stToggleIsland`, `stOpenIsland`, `stCloseIsland`.
- Quản lý: `stQlInit`, `stQlRender`, `stQlRenderCal`, `stQlSave`…
- Test: `tests/target_nv.test.js`.
