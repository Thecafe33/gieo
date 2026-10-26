# Phản hồi kiểm tra lượt 10 (`KET_QUA_KIEM_TRA_10_DOC_LAP.md`, commit `8909c0f`)

Người kiểm: **đạt** phần chuyển mã 2C (205/205 nguyên văn) và 12 kịch bản kho. Còn **F10-1** (bộ lọc Firebase giả, lỗi công cụ, mức vừa) và ba đề nghị về độ phủ. Phản biện: đồng ý cả F10-1 lẫn các đề nghị. Kết quả: **app không đổi**, chỉ sửa công cụ và thêm kịch bản.

## F10-1 — bộ lọc Firebase giả (`tools/tach_posgieo/fb_gia.js`)

| Probe của người kiểm | Trước | Nay |
| --- | --- | --- |
| `where('n','!=',1)` / `not-in [1]` | trả cả doc thiếu trường | **loại doc thiếu trường** (mọi toán tử, như Firestore) |
| `where('obj','==',{v:1})` | rỗng (so identity) | **so theo giá trị**, map so sâu và không phụ thuộc thứ tự khoá; `in`/`array-contains`/`-any` cũng vậy |
| RT `orderByChild('st').equalTo('y')`, mồi ở node cha | trả mọi con | **lọc con**, dù mồi ở node cha hay node con |
| `<,<=,>,>=` với map/mảng; toán tử lạ; `equalTo` không có `orderByChild` | lặng lẽ cho qua / coi là khớp | **báo LỖI rõ** (`fb_gia: …`), không âm thầm trả sai |

Chú thích lỗi thời («bộ lọc bị bỏ qua») đã sửa. `orderBy`/`limit`/`startAt…` vẫn bỏ qua (ghi rõ ở đầu file; thứ tự = mã doc).

Lúc đưa kịch bản đổ ly vào, lộ thêm **hai chỗ Firebase giả lệch Firebase thật**. Đã sửa cả hai:

1. **RT là cây**: transaction / đọc chỉ thấy mồi đặt **đúng** node, nên mồi ở node con (`active_units/milk/ctn1`) không vào được transaction của node cha (`active_units/milk`). Hậu quả: phân bổ FIFO luôn coi như «không có tem đang mở», ghi Sổ lệch thay vì trừ tem. Cả hai bản cùng sai nên so trước/sau vẫn PASS — đúng loại điểm mù người kiểm cảnh báo. Nay đọc / transaction **ghép node cha và node con**, node cụ thể hơn thắng. Ghi RT gom về node tổ tiên đã có, nên mỗi chỗ chỉ còn một nguồn; set/xoá bỏ mồi con cũ.
2. **`onSnapshot` không bao giờ gửi ảnh đầu**: bộ đệm sống công thức / bao bì (`_posLiveSubscribe`) chờ ảnh đầu nên treo mãi. Thêm tuỳ chọn `window.__SNAP = true` để gửi **một** ảnh đầu từ mồi, đã lọc, `fromCache:false`. Mặc định vẫn im lặng như trước, nên các bài cũ không đổi.

Test `tests/tach_posgieo_fb_gia.test.js`: thêm 15 ca (4 probe F10-1, các ca báo lỗi, RT cây, `onSnapshot`). Chạy test mới trên `fb_gia.js` cũ (`626fd83`) thì **8 ca F10-1 trượt đúng chỗ**.

Hệ quả cho bài cũ: `baoHet` nay đọc được mã đang mở ở RT, nên engine tính lại tồn theo mã và ghi thêm `inventory_items_gieogieo`. Tập bảng ghim đã cập nhật, và hai bản vẫn giống hệt nhau.

## Đề nghị 1 — đổ ly vào runner chính thức (`e2e_kho.js`)

Mồi: món «Trà sữa E2E» size M = 25 ml sữa (NL có tem, mã đang mở `ctn_d1` còn 800 ml) + 10 g trà (NL thường) + 30 g BTP Trân châu đường (lô `b3` đang dùng 1000 g); lý do đổ cấu hình sẵn. Bài đi qua **công thức thật** (`computeConsumptionForOrder` + loader đọc từ Firebase giả, không gán đè loader). Mở màn Hao hụt thật (`openWasteScreen`, mặc định Đổ ly), nhập 2 ly, tick «Chưa rót vào ly», rồi bấm Ghi. Chỉ cổng ca / PIN được gán đè, giống nhau ở hai bản.

| Kịch bản | Khẳng định riêng (ngoài so khớp toàn bộ lượt ghi / toast / trạng thái / lỗi với `0bd95a7`, gg01 + gg02, kiểm phạm vi quán) |
| --- | --- |
| `doLy` | xem trước «Sẽ trừ 3 loại nguyên liệu»; sổ kho đúng **một** dòng WASTE mỗi NL (sữa −50, trà −20); sổ BTP một dòng WASTE 60 g; chung `wasteEventId`; sữa `fifoAllocations` = đúng 50 ml vào `ctn_d1`; RT sau thao tác: mã sữa 800 → 750, lô BTP 1000 → 940; lô `b3` `qtyRemaining` 940; toast; về màn Kho |
| `doLyGhiLai` | cài lỗi lượt ghi sổ dòng Trà lài → toast «1/3 nguyên liệu chưa trừ được»; `dwPending_pos` giữ `wasteEventId`; bấm Ghi lại → các khẳng định của `doLy` vẫn đúng (**không ghi lặp** sữa/BTP, tem không bị trừ hai lần); dọn `dwPending_pos` |

Tự kiểm mới: bản sao `pos_kho.v1.js` đổi `qty: -qtyUsed` → `-(qtyUsed + 1)` thì `doLy` báo lệch `ghi`.

Các bước của kịch bản có hạn **45 giây**: lời hứa treo thì báo lỗi kèm bước cuối, không treo cả bài. Biến `E2E_KHO_DUMP=<thư mục>` ghi lượt ghi đã chuẩn hoá của hai bản để gỡ lỗi.

**Chuẩn hoá mã lồng (`MA_NN`)**: trước đây chỉ bắt mã đứng sau ranh giới từ, nên `alert_dw_<ms>_<rand>` lọt qua. Nay bắt cả mã đứng sau `_` hoặc `/`. Khoá giờ thêm `t` (`chg[].t`) và `…Rev` (`rtRev`, ms × 1000).

## Đề nghị 2 — hao hụt có số dư dương

`baoHetConDu`: mã sữa đang mở còn 300 ml theo RT. Bài mở **tấm báo hết thật** (`openConfirmFinishSheet`): tấm hiện «còn 300 ml» và ô xác nhận hao hụt. Tick ô rồi bấm báo hết. Khẳng định: mã → `finished`, `wasteBase` 300; sổ kho đúng một dòng WASTE sữa −300; gỡ mã khỏi RT đang mở; ghim tập bảng.

## Đề nghị 3 và các nhánh còn lại — CHƯA phủ (ghi thật)

- Cân BTP **có vật đựng / trừ bì** qua UI.
- Đổ ly có **bao bì / topping**; pending sau **tải lại trang / đổi quán**.
- FIFO «chưa hết» / mở bao thứ hai kèm lý do; báo mất tem; cấp lại mã; kiểm kê có quét / kiểm tra lại.
- APK, Firebase thật, hai quán ghi đồng thời.

Bộ Node trích hàm (`nhan_ly_doi_tem`, `btp_am`, `kho_fifo`…) vẫn chạy.

## Chạy lại

```sh
node tests/tach_posgieo_fb_gia.test.js           # 27 ca, ALL PASS
node tools/tach_posgieo/e2e_kho.js               # 15 kịch bản × gg01/gg02 + 5 tự kiểm → 405 khẳng định, ALL PASS
node tools/tach_posgieo/e2e_0d.js; node tools/tach_posgieo/e2e_ban.js; node tools/tach_posgieo/e2e_hook.js   # ALL PASS
sh tools/sinh_lai_tat_ca.sh                      # TẤT CẢ ĐẠT, file sinh không đổi
```

---

# Phản hồi kiểm lại lượt 10 (`KET_QUA_KIEM_TRA_LAI_10_D34DDE8.md`, commit `e452616`)

Người kiểm: **đạt** đổ ly / ghi lại / báo hết còn dư (cài thêm 2 lỗi FIFO / idempotency → đều bị bắt), không hồi quy app. Còn F10-1 (`not-in` có null) và F10-2 (RT rỗng báo có dữ liệu) — lỗi công cụ. Phản biện: đồng ý cả hai. App không đổi.

- **F10-1 (null)**: mock nói rõ mô phỏng **phía máy chủ** (vì ảnh gửi `fromCache:false`, theo tài liệu truy vấn hiện hành): `!=` / `not-in` loại cả trường null; `not-in` có null trong mảng → không khớp gì (khớp cả `NotInFilter` SDK 10.13.2). Kỳ vọng hai ca cũ đổi từ `['b','nul']` → `['b']`; thêm ca `not-in [1, null]` → rỗng và `== null`.
- **F10-2**: RT không giữ node rỗng — đọc / truy vấn không khớp con / xoá mã cuối → `val() null`, `exists() false`; tổ tiên rỗng bị dọn khỏi mồi; transaction nhận null.
- Test `tach_posgieo_fb_gia`: 31 ca; chạy trên `fb_gia.js` của `d34dde8` trượt đúng 5 ca mới / đổi.
- Chạy lại: `e2e_kho` 405 khẳng định ALL PASS; `e2e_0d` / `e2e_ban` / `e2e_hook` ALL PASS; `sinh_lai_tat_ca.sh` TẤT CẢ ĐẠT.
- Giới hạn giữ nguyên như báo cáo (orderBy/limit bỏ qua, increment xấp xỉ, onSnapshot một ảnh đầu, chưa APK / Firebase thật / hai quán đồng thời; các nhánh kho ghi ở mục «CHƯA phủ»).
