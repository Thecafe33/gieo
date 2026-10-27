# Đợt 5 — Tối ưu có đo (27/10/2026)

Chủ dự án: chỉ tối ưu cái cần thiết. Quy tắc kế hoạch: **đo trước, có số mới làm**.

## Đo
Công cụ `tools/tach_posgieo/do_tai.js` (chỉ đọc): mở `posgieo.html` của bộ `0bd95a7` (mốc đã deploy) và của bản hiện tại, Firebase / CDN giả, **CPU giảm tốc ×4**, trung vị 5–7 lần. Đo phần tải + phân tích + khởi động mã app, không đo mạng Firebase.

**Đính chính sau kiểm độc lập (`KET_QUA_KIEM_TRA_18_19_DOC_LAP.md`, F5-1 / F5-2):**
- Cột trước đây gọi là «ấm / cache» thực ra chỉ là **mở lại lần hai cùng phiên** — `page.route` làm Playwright tắt cache HTTP nên **không phải số đo cache**. Đã đổi nhãn thành «mở lại».
- Cột KB trước đây sai (cộng `byte += await` mất cập nhật: 32 / 603 KB). Đã sửa: tổng body đã giải nén ≈ 2,67 MB (mốc) và 2,70 MB (bản tách) — **không phải byte trên dây**, và gần bằng nhau.

| Lần đo (CPU ×4, trung vị) | `0bd95a7` lạnh DCL | hiện tại lạnh DCL | chênh |
| --- | ---: | ---: | ---: |
| Đo gốc (7 lần) | 1256 ms | 1021 ms | −19% |
| Người kiểm (7 lần) | 1141 ms | 1019 ms | −11% |
| Đo lại sau sửa công cụ (5 lần) | 1462 ms | 1037 ms | −29% |

Số đo dao động giữa các lần chạy (mốc 1141–1462 ms) nên **chỉ kết luận được: bản tách không chậm hơn, có xu hướng nhanh hơn ~10–30% trong mô phỏng**. Không dùng làm cam kết tốc độ trên APK / Firebase Hosting; chưa có trace chứng minh nguyên nhân.

## Kết luận
- Tách file **không làm chậm** lúc mở app.
- Phân tích 21 file js không phải điểm nghẽn → **không lazy-load** (sẽ phải bọc hàm gọi thẳng, rủi ro đổi hành vi, không có số liệu biện minh).
- Số lượt đọc / ghi Firebase, listener, timer không đổi (chuyển nguyên văn — đã so từng lượt ghi với mốc).
- **Không đổi mã app ở Đợt 5.**

## Việc đáng làm nhưng thuộc cấu hình triển khai (chủ dự án tự làm)
`firebase.json` (ở `/sdcard/<thư mục deploy>/`): thêm header cache cho `/js/posgieo/**` (file có phiên bản `.vN` → `Cache-Control: public, max-age=31536000, immutable`) để lần mở sau không hỏi lại máy chủ cho 21 file. Chưa có header thì Firebase dùng cache mặc định 1 giờ — vẫn chạy đúng, chỉ chậm hơn một chút lúc mở lần đầu mỗi giờ. (Header này cũng đã cần cho mục triển khai ở kế hoạch 1.1.)

## Chưa đo được
Trên APK / điện thoại thật và mạng yếu, và mạng Firebase thật. Nếu thấy chậm ở cửa hàng, báo màn / thao tác cụ thể rồi đo lại bằng công cụ này.
