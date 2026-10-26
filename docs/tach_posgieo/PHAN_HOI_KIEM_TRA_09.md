# Phản hồi kiểm tra lượt 09 (`KET_QUA_KIEM_TRA_09_DOC_LAP.md`, commit `ddacdf9`)

Người kiểm: **đạt** phần chuyển mã (168/168 nguyên văn) + hoàn thành / huỷ mẻ / đổ bỏ; chưa đủ để coi **toàn bộ 2B** nghiệm thu — đề nghị bài trình duyệt **bắt đầu nấu**. Phản biện: đồng ý. App không đổi; chỉ thêm kịch bản + sửa Firebase giả.

## Đã làm — 3 kịch bản bắt đầu nấu (`e2e_kho.js`, gg01 + gg02, so `0bd95a7`, kiểm phạm vi quán, ghim tập bảng)

| Kịch bản | Đi qua | Khẳng định riêng |
| --- | --- | --- |
| `batDauMe` | `startPrepBatchGate` (cổng đối chiếu: không NL phải cân; không NL nguyên gói) → `startPrepBatch` → trừ NL theo công thức → tạo lô | lô `cooking` Siro đường; sổ kho CONSUMPTION đúng công thức (đường −1000, siro −500); lô có `inputTrace` |
| `batDauMeQuet` | NL **nguyên gói** (`prepWholePack`, Bịch 2000 g) → PIN → **cổng quét mã** (`prepStartGateScan`, máy quét giả trả mã tem đã mồi) → đủ gói tự `confirmPrepStartAfterScan` → `startPrepBatch` | mở cổng (cần 1 Bịch); tem đã quét → `finished`; lô `cooking`; xoá trạng thái cổng quét |
| `batDauMeLoi` | như `batDauMe`, lượt ghi sổ kho **đầu tiên** lỗi (giả rớt mạng) | đúng một lượt lỗi; **không tạo lô**; NL còn lại đã trừ được có **dòng hoàn đúng lượng** (cuộn ngược `_reversePrepBatchInputsPOS`) |

Tự kiểm mới: bản sao đổi ghi chú dòng trừ NL trong `pos_prep.v1.js` → `batDauMe` báo lệch `ghi`.

## Sửa Firebase giả (`fb_gia.js`)

`doc()` không truyền mã trước luôn ra cùng mã `auto` → hai giao dịch khác nhau ghi chung một chỗ; khi bật ghi-cập-nhật-mồi, kiểm «mã đã có» của engine có thể nhận nhầm (che lệch). Nay mỗi lần gọi một mã riêng `autoN` (bộ đếm, tất định giữa hai bản); `add()` cũng vậy + cập nhật mồi. Chạy lại mọi bài e2e sau sửa.

## Còn ngoài phạm vi (ghi rõ)

- Bắt đầu nấu **có NL phải cân đối chiếu** (`prepRecon*` — cân trước / cân sau, khoá NL, tự chốt kẹt `prepForce*`): nhiều màn cân, chưa đưa vào bài so sánh. Bộ Node `bat_dau_me` / `nau_nguyen_goi` / `nau_che_bien` / `me_ket_hoan_tiep` / `huy_me_can_lai` (trích hàm, đọc cả `js/`) vẫn chạy.
- Sửa định lượng lô, gợi ý nấu `prepSug*` (lịch sử + localStorage), in tem lô thật; APK; Firebase thật; hai quán đồng thời.

## Câu trả lời khác của người kiểm — đồng ý

- Tham chiếu Engine: không cần đổi adapter.
- Tiện ích `round2`/`fmtPrepQty`/`fmtDateTimeShort` ở `pos_prep.v1.js`: giữ, nếu tách sau làm R riêng.

## Chạy lại

```sh
node tools/tach_posgieo/e2e_kho.js     # 9 kịch bản × gg01/gg02 + 3 tự kiểm → ALL PASS
node tools/tach_posgieo/e2e_0d.js; node tools/tach_posgieo/e2e_ban.js; node tools/tach_posgieo/e2e_hook.js
sh tests/run_all.sh
```
