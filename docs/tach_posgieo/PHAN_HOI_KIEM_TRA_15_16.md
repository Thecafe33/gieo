# Phản hồi kiểm tra lượt 15 + 16 (`KET_QUA_KIEM_TRA_15_16_DOC_LAP.md`, commit `3bc3e98`)

Người kiểm: **ĐẠT** chuyển mã nguyên văn 98/98 tên (lượt 15: 32, lượt 16: 66), 1.135 khẳng định e2e_kho, probe nạp module 9/9; không hồi quy app. Còn hai finding **công cụ** (F15-1, F16-1) và hai probe bổ sung. Phản biện: đồng ý cả hai finding (đã đối chiếu mã `fb_gia.js`). **App không đổi** — chỉ sửa Firebase giả, test và kịch bản.

## F15-1 — log lỗi RTDB mang `rt:false` (`tools/tach_posgieo/fb_gia.js`)

Nguyên nhân đúng như báo cáo: `hong()` ghi cứng `rt:false`, nên một lượt ghi RT bị cài lỗi (`set!hong`) bị bộ kiểm phạm vi coi là bảng Firestore chưa đăng ký.

| Trước | Nay |
| --- | --- |
| `hong(op, đường)` → log `rt:false` | `hong(op, đường, rt)` → log `rt:!!rt`; `set/update/remove` và `add` truyền loại nguồn của đối tượng đang ghi |

Không nới bộ kiểm phạm vi (không bỏ qua dòng `!hong` hay bảng chưa biết). Test `tach_posgieo_fb_gia`: ca mới — RT `rt:true`, Firestore `rt:false`.

## F16-1 — transaction RTDB huỷ trả `committed:true` (`fb_gia.js`)

Đối chiếu SDK 10.13.2 `Repo.ts` (callback trả `undefined` → `onComplete(null, false, currentInputSnapshot)`): mock trước luôn `committed:true`, snapshot = giá trị callback trả (undefined).

| Callback trả | Mock trước | Nay |
| --- | --- | --- |
| `undefined` (huỷ) | `committed:true`, snapshot `undefined`, vẫn ghi log `transaction` d=null | `committed:false`, snapshot = **dữ liệu đầu vào**, seed không đổi, **không** log lượt ghi |
| giá trị mới | commit | commit (không đổi) |
| `null` | xoá node | xoá node (không đổi) |

Test: 3 ca mới (huỷ / commit / xoá) — chạy trên `fb_gia.js` cũ thì trượt đúng các ca huỷ và log lỗi.

Ảnh hưởng đã kiểm sau sửa: chưa kịch bản nào của bộ chính phụ thuộc hành vi cũ (xem mục chạy lại); nhánh app thật dùng transaction huỷ (`delOrderConfirm` khi có việc trừ kho đang chạy, `_submitAddonImpl` khi xung đột) nay đi đúng nhánh.

## Hai probe bổ sung — đưa vào bộ chính (`e2e_kho.js`)

| Kịch bản | Đường đi | Khẳng định |
| --- | --- | --- |
| `menuLoiThuLai` (probe 5.1) | thêm món To Go → cài đúng một lỗi ghi RT → lưu → toast «Lỗi», form còn → lưu lại | form còn sau lỗi, món chưa vào danh sách; thử lại → form đóng, món có ở danh sách và màn bán `#mg`; đúng một lượt ghi thành công |
| `xoaBillJobChay` (probe 5.3) | node bill có `consumeJobs.j1` running còn hạn → xoá với mã đúng | không ghi cờ xoá dở, không xoá node, toast «Đang trừ kho phần bổ sung topping … CHƯA xoá», bill còn trong RAM + RT, việc vẫn running |

Tự kiểm mới: bản sao `pos_orders.v1.js` bỏ chặn `if (busy) return;` → `xoaBillJobChay` báo lệch.

Probe 5.2 (mua thêm → trừ kho → xoá → hoàn 970 → 1000 g, một dòng hoàn +30) đã đạt ở báo cáo người kiểm; chưa chuyển vào bộ chính ở lượt này (không có lỗi cần theo).

## Phản biện — đồng ý

- Danh mục món / Food / topping là **G dùng chung** (không hậu tố quán); báo cáo lượt 15 không mô tả khác. Sửa từ gg02 vẫn đổi danh mục chung như trước.
- Giữ `catalogAdmin` thiết yếu; `fmtPriceInput` / `getPriceVal` / `todayKey` dời về nền là R riêng nếu cần.
- `_backfillMode` / `_backfillPendingDate` nghiệm thu thêm khi làm 4D (`confirmPay`).
- Giữ nguyên giới hạn: Gấu Noel `e2e_gau` còn 1 FAIL có sẵn ở `kiosk.html` (cả trước lượt 16), `file://` bị chặn ở môi trường kiểm; `/opt/pw-browsers/chromium` cứng trong `e2e_gau` — không thuộc phạm vi tách.

## Chạy lại

```sh
node tests/tach_posgieo_fb_gia.test.js                                        # ALL PASS (thêm ca F15-1 / F16-1)
node tools/tach_posgieo/e2e_kho.js --chi menuLoiThuLai,xoaBillJobChay         # ALL PASS (gồm tự kiểm)
sh tools/sinh_lai_tat_ca.sh                                                   # TẤT CẢ ĐẠT
node tools/tach_posgieo/e2e_kho.js                                            # cả bộ: xem dưới
node tools/tach_posgieo/e2e_0d.js; node tools/tach_posgieo/e2e_ban.js; node tools/tach_posgieo/e2e_hook.js
```

Kết quả cả bộ: 45 kịch bản × gg01/gg02 + 20 tự kiểm → **1188 khẳng định, ALL PASS** (1135 cũ + 53 mới; không hồi quy do sửa mock). `e2e_0d` / `e2e_ban` / `e2e_hook` ALL PASS; `sinh_lai_tat_ca.sh` TẤT CẢ ĐẠT.
