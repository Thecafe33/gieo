# Đợt 5 — Tối ưu có đo (27/10/2026)

Chủ dự án: chỉ tối ưu cái cần thiết. Quy tắc kế hoạch: **đo trước, có số mới làm**.

## Đo
Công cụ `tools/tach_posgieo/do_tai.js` (chỉ đọc): mở `posgieo.html` của bộ `0bd95a7` (mốc đã deploy) và của bản hiện tại, Firebase / CDN giả, **CPU giảm tốc ×4** (điện thoại tầm trung), trung vị 7 lần, lạnh (chưa cache) và ấm (mở lại, js đã cache). Đo phần tải + phân tích + khởi động mã app, không đo mạng Firebase.

| | lạnh DCL | lạnh load | ấm DCL | ấm load | request |
| --- | ---: | ---: | ---: | ---: | ---: |
| `0bd95a7` (mốc, 1 file HTML 1,9 MB) | 1256 ms | 1278 ms | 1122 ms | 1138 ms | 8 |
| hiện tại (HTML 0,5 MB + 21 file js) | 1021 ms | 1033 ms | 937 ms | 969 ms | 30 |

## Kết luận
- Tách file **không làm chậm** lúc mở app — nhanh hơn ~19% ở số đo này (trình duyệt phân tích song song / HTML nhỏ hơn).
- Phân tích 21 file js không phải điểm nghẽn → **không lazy-load** (sẽ phải bọc hàm gọi thẳng, rủi ro đổi hành vi, không có số liệu biện minh).
- Tổng số byte không đổi (chỉ chuyển chỗ); số lượt đọc / ghi Firebase, listener, timer không đổi (chuyển nguyên văn — đã so từng lượt ghi với mốc).
- **Không đổi mã app ở Đợt 5.**

## Việc đáng làm nhưng thuộc cấu hình triển khai (chủ dự án tự làm)
`firebase.json` (ở `/sdcard/<thư mục deploy>/`): thêm header cache cho `/js/posgieo/**` (file có phiên bản `.vN` → `Cache-Control: public, max-age=31536000, immutable`) để lần mở sau không hỏi lại máy chủ cho 21 file. Chưa có header thì Firebase dùng cache mặc định 1 giờ — vẫn chạy đúng, chỉ chậm hơn một chút lúc mở lần đầu mỗi giờ. (Header này cũng đã cần cho mục triển khai ở kế hoạch 1.1.)

## Chưa đo được
Trên APK / điện thoại thật và mạng yếu, và mạng Firebase thật. Nếu thấy chậm ở cửa hàng, báo màn / thao tác cụ thể rồi đo lại bằng công cụ này.
