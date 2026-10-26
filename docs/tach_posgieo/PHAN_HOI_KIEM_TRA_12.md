# Phản hồi kiểm tra lượt 12 (`KET_QUA_KIEM_TRA_12_DOC_LAP.md`, commit `9a6b45f`)

Người kiểm: **đạt** chuyển mã 3A (87/87 nguyên văn), bốn kịch bản ca + PIN sai / khoá + hai lỗi cài thêm bị bắt; còn **F12-1** (biến đổi mảng của Firebase giả — lỗi công cụ, mức vừa). Phản biện: đồng ý. App không đổi.

## F12-1 — `arrayUnion` / `arrayRemove` (`tools/tach_posgieo/fb_gia.js`)

| Probe | Trước | Nay |
| --- | --- | --- |
| mảng có `{id:1,staff:'a'}`, union `{staff:'a',id:1}` | 2 phần tử (so chuỗi JSON theo thứ tự khoá) | 1 phần tử — so theo giá trị (`chuan`, cùng hàm bộ lọc) |
| cùng mảng, remove `{staff:'a',id:1}` | vẫn còn | rỗng |
| `arr=[1]`, `set({arr: arrayUnion(2)})` không merge | `arr=[2]` | `arr=[1,2]`; trường khác vẫn bị thay như set thường (không biến set thành merge) |

Test `tach_posgieo_fb_gia`: thêm 3 ca (35 ca); chạy trên `fb_gia.js` của `e2b8d38` trượt đúng 3 ca này.

## Mở ca: điểm lấy kết quả

Đồng ý giới hạn: `caMoCa` chứng minh phần ghi phiếu mở ca / đoạn ca / toast trong cửa sổ 4 giây, **chưa** chứng minh phần chạy tiếp (đếm giao ca / kiểm kê đầu ca — module khác) hoàn tất và nhả khoá bấm. Kết quả kịch bản ca nay có thêm `busy` (`_posSubmitBusy`) nên mốc và bản mới được so cả trạng thái này (mở ca: true ở cả hai). Không đổi app để test qua. Kiểm toàn luồng mở ca → kiểm kê đầu ca → checklist để lại khi tách 3B (cùng luồng kết ca dùng chung bộ đếm / màn kiểm kê).

## Ba câu trả lời phản biện — đồng ý

1. `posDateKey` ở `pos_shift`: giữ; dời sang nền (nếu cần) là R riêng.
2. Ranh giới 3A / 3B: giữ; helper dùng chung (`clLogComplete`, đếm giờ, `renderPinInput` / `currentSignerPOS`) một binding, 3B không sao chép.
3. Bọc lại: automation + Engine 2 bọc `renderOpeningChecklist`, Engine 2 bọc `openCaLamViecScreen` — `e2e_hook` vẫn đủ 25 tên, chuỗi khớp mốc.

## Chạy lại

```sh
node tests/tach_posgieo_fb_gia.test.js      # 35 ca, ALL PASS
node tools/tach_posgieo/e2e_kho.js          # ALL PASS
node tools/tach_posgieo/e2e_0d.js; node tools/tach_posgieo/e2e_ban.js; node tools/tach_posgieo/e2e_hook.js
sh tools/sinh_lai_tat_ca.sh                 # TẤT CẢ ĐẠT
```
