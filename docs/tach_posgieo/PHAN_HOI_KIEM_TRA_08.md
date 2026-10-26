# Phản hồi kiểm tra lượt 08 (`KET_QUA_KIEM_TRA_08_DOC_LAP.md`, commit `4ad3bee`)

Người kiểm: chuyển 38 khai báo **đạt** (38/38 nguyên văn, ba mùa giống nhau); chưa thông qua bài kiểm cách ly quán (**F08-1**) + đề nghị phủ PO / bấm lại / ảnh. Phản biện: **đồng ý toàn bộ**. Chỉ sửa công cụ kiểm (`tools/`, `tests/`) — app không đổi.

## F08-1 (Cao) — bộ kiểm phạm vi cho qua mọi hậu tố → ĐÃ SỬA

- Mới `tools/tach_posgieo/pham_vi.js`: đọc `GieoData.REG` từ `data_access.v*.js` **của bộ deploy đang kiểm, ở Node** (không hỏi lại trang). Mỗi lượt ghi (cả `p` lẫn `tx.*@…` / `batch.*@…`, RT theo cờ `rt`, Storage `storage.put`) → tên gốc + hậu tố: **S/C** — gg01 đúng tên gốc, ggNN đúng `__ggNN` của **quán đang chạy**; **G/X** — không hậu tố; chưa đăng ký → vi phạm. Không chấp nhận hậu tố bất kỳ.
- `tests/tach_posgieo_pham_vi.test.js` (trong `run_all`, 15 ca): gg02→gg01, gg02→gg03 (đúng ca người kiểm tái hiện), gg01→gg02, dạng `tx.*@`, `batch.*@`, RT, G có/không hậu tố, X `customers`, Storage, bảng lạ, ghi hợp lệ không chặn oan.
- `e2e_kho.js`: kiểm phạm vi **cả hai bản** (mốc + nay) mỗi kịch bản × quán; **ghim tập bảng mong đợi** từng kịch bản; **nối dây**: chèn 1 lượt ghi `__gg02` (khi chạy gg01) / `__gg03` (gg02) vào chính log → bộ kiểm phải bắt đúng 1. Bỏ kiểm cũ hỏi `GieoData.fsPath` trong trang.

## Đề nghị phủ thêm nhánh → ĐÃ LÀM

| Kịch bản | Nội dung | Khẳng định riêng (ngoài «giống `0bd95a7`») |
| --- | --- | --- |
| `nhanHang` | tự do, 2 dòng, có hư hỏng | toast thành công; đúng số mã NL (3 / 2 — chỉ hàng tốt); sổ kho trân châu 1 RECEIVING + 1 WASTE; phiếu completed, không failed; xoá phiếu + sang màn Tem chờ dán |
| `nhanHangPO` *(mới)* | theo đơn đặt hàng, nhận một phần + 1 ảnh | PO `partial` trong transaction; ảnh lên Storage đúng đường cố định `receiving_photos_gieogieo/recv_ID/0_hd.jpg`; phiếu lưu URL ảnh; 1 Thùng = 6 mã Bịch |
| `nhanHangThuLai` *(mới)* | lượt 1 lỗi đúng lượt ghi sổ kho sữa (giả rớt mạng), lượt 2 bấm lại | lượt 1 «Đã ghi 1/2 dòng» + giữ phiếu, chỉ trân châu vào kho; lượt 2 thành công; **không cộng đôi** (mỗi dòng sổ kho ghi 1 lần qua 2 lượt), mã NL không nhân đôi |

Firebase giả (`fb_gia.js`) nâng cấp để các nhánh trên có nghĩa: `__SEED_GHI` (ghi cập nhật lại mồi → đọc sau ghi thấy dữ liệu mới, như kiểm `txId` đã có), giao dịch ghi khi commit (lỗi → không ghi gì), `__HONG` (lỗi đúng một lượt ghi khớp mẫu), `storage.put` ghi nhận + trả URL.

## Giới hạn giữ nguyên (đồng ý với người kiểm)

- `update` gộp nông, `FieldValue.increment` không cộng dồn; bộ lọc truy vấn bị bỏ qua; không xung đột / thử lại giao dịch thật; không chạy hai quán đồng thời trên cùng backend.
- Cùng hạt giống chỉ ổn định mã tem để so, không chứng nhận tính duy nhất.
- Chưa APK / Firebase thật.

## Chạy lại

```sh
node tests/tach_posgieo_pham_vi.test.js          # 15 ca
node tools/tach_posgieo/e2e_kho.js               # 3 kịch bản × gg01/gg02 + tự kiểm → ALL PASS
node tools/tach_posgieo/e2e_ban.js; node tools/tach_posgieo/e2e_hook.js; node tools/tach_posgieo/e2e_0d.js   # ALL PASS (fb_gia mới)
sh tests/run_all.sh                               # TẤT CẢ ĐẠT
```
