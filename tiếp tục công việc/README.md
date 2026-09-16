# Tiếp tục công việc

## Bước hiện tại

Đang thực hiện **Phase P9/P10 — POS và QUANLY thin client ở chế độ READ_ONLY**.
Hệ thống production cũ vẫn là sole writer; code mới chưa được phép ghi dữ liệu production.

## Đã hoàn thành tại checkpoint này

- `legacy-firebase-adapter` chỉ đọc, gồm path registry, mapper canonical và read port.
- Firebase SDK read bridge được inject từ bên ngoài, không chứa credential và không phơi API ghi.
- POS đọc Catalog qua `GetMenu`; menu/giá được cập nhật realtime từ RTDB và có unsubscribe.
- QUANLY đọc báo cáo doanh thu qua Unified Read Layer.
- Hai thin client không chứa FIFO/business inventory logic riêng.
- Race hoàn đơn đồng thời vẫn là release gate bắt buộc trước shadow/cutover.

## Kiểm chứng

- `654/654` test pass.
- `69` module, `0` vi phạm import-direction.
- Build thành công `dist/posgieo-new.html` và `dist/quanlygieo-new.html`.

## Việc tiếp theo

1. Cấp Firebase config/handles thật cho composition root, không đưa credential vào source.
2. Hoàn thiện các màn nghiệp vụ P9/P10 còn lại qua Runtime/Read Layer/Commands.
3. Giữ READ_ONLY cho tới khi hoàn tất P12 shadow comparison và đủ điều kiện cutover.

## Commit liên quan

- `7da5a48` — Nối Catalog và Firebase read bridge vào UI.
- `becece6` — Đồng bộ menu realtime vào POS chỉ đọc.
