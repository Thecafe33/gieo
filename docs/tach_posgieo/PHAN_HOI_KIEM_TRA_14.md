# Phản hồi kiểm tra lượt 14 (`KET_QUA_KIEM_TRA_14_DOC_LAP.md`, commit `bd00b1b`)

Người kiểm: **ĐẠT** chuyển mã 3C (34/34 nguyên văn), 910 khẳng định e2e_kho, probe nạp module 3/3, probe mở két 47 khẳng định; không có finding sản phẩm. App không đổi trong phản hồi này.

## Đề nghị không bắt buộc — đã làm (chỉ công cụ)

| Đề nghị | Làm |
| --- | --- |
| Firebase giả: `add()` không gọi bộ cài lỗi `__HONG` | `fb_gia.js` `add()` gọi `hong('add', đường)` → reject + ghi `add!hong`, không ghi mồi. Test `tach_posgieo_fb_gia` thêm 1 ca (36 ca); chạy trên `fb_gia.js` cũ thì trượt đúng ca này. |
| Đưa hai probe mở két vào bộ chính | `e2e_kho.js` thêm `moKetPin` (hai người trong ca → ô PIN; PIN sai không gửi lệnh / không nhật ký; PIN đúng e2 → đúng 1 lệnh + 1 nhật ký e2) và `moKetNhatKyLoi` (cài lỗi `add` nhật ký qua `__HONG` — khẳng định lỗi thật sự được cài; két mở đúng 1 lần, tấm đóng, toast «CHƯA ghi được nhật ký»). Tự kiểm mới: gửi lệnh mở két hai lần → `moKetPin` lệch mục `sau` (TU_KIEM nay có trường `muc`). |

`--chi moKetPin,moKetNhatKyLoi`: 51 khẳng định ALL PASS (gg01 + gg02, so `0bd95a7`). Cả bộ: xem commit.

## Ba câu trả lời phản biện — đồng ý

1. Giữ một file `pos_cashfund` ở lượt R này.
2. Giữ `cashfund` thiết yếu.
3. `CF_PASSWORD`: mức lộ không đổi; thay cơ chế xác thực thuộc việc chờ «chuyển mã vào backend».

Giới hạn giữ nguyên như báo cáo (két / máy in giả, increment ghi số gia, chưa quỹ giữa ca / override / chuỗi nhiều giao dịch, chưa APK).
