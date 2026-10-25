# Kiểm tra lượt 04 — Đợt 1A: trợ lý bán hàng → `js/posgieo/pos_assist.v1.js`

> **Dành cho agent kiểm tra độc lập.** Kế hoạch: `docs/KE_HOACH_TACH_POSGIEO_DA_CUA_HANG.md` (Đợt 1, quy tắc mỗi lần chuyển cụm). Bản đồ cụm trợ lý: `KIEM_TRA_01_NEN_VA_BAN_DO.md` mục 4.1.
> Lượt 02, 03 **chưa có kết quả kiểm tra** — chủ dự án cho làm tiếp. Chưa deploy, chưa ghi sổ phát hành.
> Phân công: công cụ chuyển mã `tools/tach_posgieo/chuyen.js` + test do **subagent Sonnet** viết theo đặc tả; Claude xem lại, thêm `--root`, sửa ca 8 test, chạy chuyển thật và kiểm.

## 1. Đã làm (commit `3003478`, loại R)

- **Công cụ `tools/tach_posgieo/chuyen.js`** — chuyển NGUYÊN VĂN mọi khai báo cấp cao nằm trọn trong dải dòng của script trần chính sang file mới (hai dấu `'dang'`/`true`); lệnh tự chạy ở lại HTML đúng chỗ, đúng thứ tự; chỗ lấy đi thay bằng dòng chú thích `// tên… → js/posgieo/…`. Dừng không ghi nếu: giá trị đầu `let/const/var` tham chiếu tên còn ở HTML hoặc tên khai báo sau nó (TDZ); trùng tên với JS riêng khác; file ra đã có; tập tên trước ≠ sau. Có chạy thử (mặc định) và `--ghi`; `--root` cho thư mục khác. Test `tests/tach_posgieo_chuyen.test.js` (fixture + chạy thử trên `posgieo.html` ở `bbe5a97`).
- **Chuyển:** `node tools/tach_posgieo/chuyen.js --html posgieo.html --tu 28050 --den 29298 --ra js/posgieo/pos_assist.v1.js --dau assist --ghi`
  - 59 tên (đủ danh sách cụm 4.1), 60.567 byte; `posgieo.html` 1.941.371 → 1.881.962 byte.
  - Giữ inline đúng chỗ: `window.addEventListener('scroll', …)`, `(function assistHookIntoPOS(){…})()` (bọc 15 hàm), `assistLoadLocalCache();`.
  - Cảnh báo đã xem: `let assistConfig = JSON.parse(JSON.stringify(ASSIST_DEFAULT_CONFIG))` (chỉ dùng hằng cùng file), `let _assistDismissed = new Set()` — an toàn chạy lúc nạp.
- Thẻ `js/posgieo/pos_assist.v1.js` + `#pgAssistRetry` ngay sau `#pgUiRetry`; `POS_MODS_THIET_YEU` thêm `assist` (thiếu → màn đỏ; lý do: `confirmPay`/`finalizeSplitPay` gọi thẳng `assistFinalizeOrder`, thiếu là hỏng thanh toán).
- Test đọc thô `assistEsc` (`da_cua_hang_mo_quan`) đã chuyển sang `maNoi` trước (commit `e7478de`).

## 2. Chạy lại

```sh
sh tools/sinh_lai_tat_ca.sh                       # => TẤT CẢ ĐẠT
node tools/tach_posgieo/e2e_0d.js                 # có ca «Đợt 1A: pos_assist.v1.js nạp…»
node tools/gau_noel/e2e_gau.js                    # G1–G14 posgieo (G2 bọc assistFinalizeOrder); K3 kiosk hỏng như nền
node tools/check_boundaries.js && node tools/check_paths.js
node tools/file_thay_doi.js 0bd95a7 giangsinh
```

Kết quả: toàn bộ test đạt; ranh giới / đường dẫn sạch (không đổi số); e2e 0D+1A 16 ca đạt; Gấu Noel G1–G14 đạt; BTP, FIFO 28/28, nhận hàng 80/80 đạt.

## 3. Thay đổi hành vi?

Không, ngoài một khác biệt có chủ đích đã ghi ở lượt 01: hằng/biến trợ lý trước đây khai báo SAU chốt «chưa gắn quán» (máy chưa gắn quán thì chúng ở TDZ), nay được khởi tạo cả khi chưa gắn quán (không đọc mạng, không ghi gì).

## 4. Giới hạn

- Chưa có test «chụp chuỗi bọc» trước/sau (kế hoạch 5.2) — chuỗi bọc được kiểm gián tiếp: e2e Gấu Noel (bọc `assistFinalizeOrder`, `renderCustomerInfo`…) đạt; `assistHookIntoPOS` không đổi chỗ.
- Chưa chạy luồng bán hàng thật có gợi ý trợ lý trong trình duyệt (test trợ lý hiện có chạy qua `extract`, vẫn tìm thấy hàm trong file mới).
- Chưa APK.

## 5. Điểm nhờ phản biện

1. Trợ lý là module THIẾT YẾU (thiếu → dừng app) — hay nên để thiếu trợ lý vẫn bán (bọc `assistFinalizeOrder` bằng `typeof` ở `confirmPay`)? Cách sau là đổi mã thanh toán (H) nên chưa làm.
2. Dòng chú thích công cụ để lại trong HTML có giữ cả chú thích đuôi của hằng (vd `// ASSIST_CFG_FB_PATH → … // RTDB — …`) — chấp nhận?
3. Công cụ `chuyen.js`: còn ca nào cần chặn (vd hàm trong dải bị câu lệnh tự chạy TRƯỚC dải gọi ngay lúc phân tích; khai báo `var` trùng `window.x`)?
4. 59 tên có đủ không — có hàm trợ lý nào nằm NGOÀI dải 28050–29298 (vd `assistUpdateCustomerProfile` gọi từ chỗ khác) bị bỏ sót?
