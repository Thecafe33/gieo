# Kiểm tra lượt 08 — Đợt 2A (nhận hàng → `js/posgieo/pos_receive.v1.js`) + bài so sánh lượt ghi kho

> **Dành cho agent kiểm tra độc lập.** Kế hoạch `docs/KE_HOACH_TACH_POSGIEO_DA_CUA_HANG.md` mục 9 Đợt 2 («Giữ đơn vị nhận hàng, FIFO, cân mù, retry; Unit Engine vẫn là bên ghi … **Qua:** snapshot + log ghi trước/sau giống nền; thao tác ở A không đổi S/C của B»).
> Chủ dự án 26/10: chỉ tách, giữ đúng thao tác, ưu tiên luồng bán trơn tru. Lượt này **R thuần** (chuyển nguyên văn). Chưa deploy, chưa ghi sổ phát hành.
> Đợt 2 chia tiểu đợt: **2A nhận hàng (lượt này)** → 2B chế biến BTP → 2C kho / mở chai–báo hết / kiểm kê → 2D hạn dùng.

## 1. Chuyển mã (commit này)

- `tools/tach_posgieo/chuyen.js --dai 19170-20052` (bản trước lượt, `d9c…`/HEAD trước commit): **38 tên** nhận hàng + popup chọn nguyên liệu dùng chung (`POS_PENDING_PO_CACHE`, `poReceiveState`, `_dsItemPickerState` = literal; `openPoReceiveScreen` … `_submitPoReceiveImpl`, `dsOpenItemPicker` …) → `js/posgieo/pos_receive.v1.js` (dấu `receive`). Kiểm (a)–(e) đạt; 0 lệnh tự chạy; 0 đọc storage.
- Bản đồ `--cum`: không hàm nào ngoài cụm gọi vào (chỉ handler HTML / chuỗi + `gieo_automation_pos.v3.js` gọi `openPoReceiveScreen` qua window); phụ thuộc ra ngoài: `fstore`, `storageRef`, `showScreen`, `loadKhoScreen`, `KHO_ITEMS_CACHE`, `resolveStaffPinAndCheckin`, … (đều ở script chính, gọi lúc chạy).
- HTML: thẻ + `#pgReceiveRetry` sau `#pgPrintUiRetry`; `POS_MODS_THIET_YEU.receive`.
- Subagent (Sonnet, chỉ đọc) rà test đọc văn bản thô: **không file nào hỏng**; chỉ `tools/index_quan_moi.js` (quét khối script trần đầu) mất độ phủ 2 truy vấn `purchase_orders` → đã sửa (dưới).

## 2. Sửa công cụ kèm theo

| File | Sửa |
| --- | --- |
| `tools/tach_posgieo/ban_do.js` | `--cum` lấy dải dòng theo **file HTML** (trước lấy đoạn nguồn ĐẦU = `js/posgieo/pos_ui.v1.js` từ khi có JS nạp trước → cụm luôn rỗng); `set` trước đó nằm lọt trong chú thích. Test `tach_posgieo_ban_do` thêm ca (hỏng với bản cũ, đạt bản mới). |
| `tools/index_quan_moi.js` | Quét MỌI đoạn nguồn (`nguonCua`), hằng tên bảng gộp theo app. Kết quả gg02 giống hệt trước (6 index). |
| `tools/tach_posgieo/fb_gia.js` | Dữ liệu mồi `window.__SEED` (doc / collection con trực tiếp / nút RT); bản ghi `__ghi` thêm cờ `rt`. |
| `tools/tach_posgieo/hai_ban.js` | Tuỳ chọn `ngauNhienCo`: `Math.random` + `crypto.getRandomValues` theo hạt giống cố định (mã tem giống nhau ở hai bản — so cả cách sinh mã, không xoá trường mã). |
| `tools/tach_posgieo/e2e_0d.js` | Ca (11) thêm `pos_receive.v1.js` (thiếu / chạy dở → màn đỏ). |

## 3. Bài mới `tools/tach_posgieo/e2e_kho.js`

Kịch bản `nhanHang` trên bộ deploy `0bd95a7` (bản đang chạy) và hiện tại, ở **gg01 và gg02**: mồi 2 nguyên liệu dán tem theo đơn vị (Bịch 2000 g / Thùng, Hộp 1000 ml) → `openPoReceiveScreen` → nhận tự do: trân châu 3 Bịch tốt + 1 hư hỏng, sữa 2 Hộp → `submitPoReceive` (PIN gán đè giống nhau). So: **16 lượt ghi** (tx.update tồn `inventory_items`, tx.set `stock_transactions` RECEIVING, tx.set + update `receiving_records`, set `stock_containers` từng mã), toast, trạng thái sau, lỗi JS. Chuẩn hoá theo trường (giờ: `…At`/`at`/`ts`/`time`/`timestamp`; khoá `<tiền tố>_<ms>_<ngẫu nhiên>`).
- **Đúng quán**: với mỗi lượt ghi, hỏi `GieoData.fsPath/rtPath` — bảng tên gốc mà GieoData đổi tên ở quán đang chạy = lọt sang bảng gg01 → FAIL. gg02 phải có ghi `…__gg02`.
- **Tự kiểm**: bản sao đổi `note: generalNote` trong `pos_receive.v1.js` → phải báo lệch `ghi`.

Kết quả: **ALL PASS** (gg01 + gg02 giống hệt `0bd95a7`; 0 lượt lọt quán; tự kiểm bắt được).

## 4. Chạy lại

```sh
sh tools/sinh_lai_tat_ca.sh                       # TẤT CẢ ĐẠT
node tools/check_boundaries.js; node tools/check_paths.js   # SẠCH (109 tên, 875 lời gọi)
node tools/tach_posgieo/e2e_kho.js                 # ALL PASS
node tools/tach_posgieo/e2e_0d.js; node tools/tach_posgieo/e2e_ban.js; node tools/tach_posgieo/e2e_hook.js   # ALL PASS
node tools/nhan_hang/e2e_don_vi.js; node tools/kho_fifo/e2e_retry.js   # 80 / 28 checks
node tools/file_thay_doi.js 0bd95a7 giangsinh
```

## 5. Giới hạn

- Một kịch bản nhận tự do (không PO, không ảnh, không sai sản phẩm, không bấm lại sau lỗi); Firebase giả không có xung đột/thử lại thật; mồi không cập nhật theo ghi.
- PO (`purchase_orders`) chỉ đọc rỗng — nhánh chọn PO chưa so.
- Chưa APK.

## 6. Nhờ phản biện

1. Có nhánh nhận hàng nào (PO, ảnh `storageRef`, bấm lại sau lỗi `appliedLines`) nên thêm vào kịch bản trước khi coi 2A qua?
2. `ngauNhienCo` cố định hạt giống — có thể che lệch nào (vd hai bản gọi số lần ngẫu nhiên khác nhau vẫn trùng)? Ở đây nếu số lần khác thì mã lệch → bị bắt.
3. Kiểm «đúng quán» dựa vào `GieoData.fsPath` lúc chạy — có đường ghi nào không qua `fstore`/`db` đã bọc (vd `firebase.firestore()` gọi lại) mà kiểm này bỏ sót?
