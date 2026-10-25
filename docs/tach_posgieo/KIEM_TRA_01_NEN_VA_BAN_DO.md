# Kiểm tra lượt 01 — Bước 0A (mốc nền) + 0B (bản đồ phụ thuộc)

> **ĐÃ KIỂM (25/10):** kết quả `KET_QUA_KIEM_TRA_01_DOC_LAP.md`, phản hồi + sửa `PHAN_HOI_KIEM_TRA_01.md`. Bảng «JS ngoài dùng tên của app» ở mục 3 và số «362 handler» bên dưới là bản CŨ — xem bản sửa trong phản hồi.

> **Dành cho agent kiểm tra độc lập.** File này tự đủ: đọc xong là biết đã làm gì, chạy lại thế nào, và cần phản biện điểm nào.
> Kế hoạch gốc: `docs/KE_HOACH_TACH_POSGIEO_DA_CUA_HANG.md` (bản rà soát 3). Quy tắc dự án: `CLAUDE.md` (trả lời tiếng Việt, không đọc cả file HTML lớn — tìm theo tên hàm).
> **Chưa có thay đổi nào vào app** (`posgieo.html` và mọi JS giữ nguyên). Lượt này chỉ thêm 1 công cụ CHỈ ĐỌC + tài liệu.
> Sau khi chủ dự án gửi lại kết quả kiểm tra, mới làm bước 0C (sửa công cụ T1–T13).

## 1. Đã làm gì

| Việc | Kết quả |
| --- | --- |
| Xác nhận mốc nền | Chủ dự án 25/10: cửa hàng chạy **bộ Giáng sinh mới nhất, engine v21, ĐÃ deploy** = `ban_deploy/giangsinh/` tại `0bd95a7`. `git diff 0bd95a7 HEAD -- ban_deploy posgieo.html '*.js'` rỗng (HEAD chỉ thêm tài liệu) |
| Chạy test nền | `sh tests/run_all.sh`: **142/143 đạt**, 1 hỏng có sẵn (mục 2.2) |
| Rào ranh giới / đường dẫn | `check_boundaries`: RANH GIỚI SẠCH · `check_paths`: ĐƯỜNG DẪN SẠCH (109 tên, 875 lời gọi, 54 động đã duyệt) |
| e2e trình duyệt có posgieo | 5 bộ chạy; phần posgieo đạt hết (mục 2.3) |
| Công cụ bản đồ | `tools/tach_posgieo/ban_do.js` (mới, chỉ đọc, AST acorn) |
| Bản đồ cụm Đợt 1 + ứng viên 0D + kiểm kê localStorage | Mục 3–5 |

## 2. Mốc nền (0A)

### 2.1. Checksum bộ đang chạy (`ban_deploy/giangsinh/`, sha256)

```text
089e34948041b0092b278eef3b7ad22396b05ee3ebfb2d32344aab3bdc196243  posgieo.html
6ad91523d1c90fbdcd858ddca4b58c59a1d00280cfa97e5e796aeda421519cd2  posgieo_thu.html
6b3b441e2aa9eaf95d3855a26c7e9068cd6e6eaa5456a90a91191850ae63e39a  data_access.v9.js
c2b76cbe636e55da7eba677a3e89004a69204042c0d9137c1af22513ddb4e928  unit_engine.v21.js
81d347fd12d3aa035c7a7c7034865c3c24129464d9100757f4c98c858cb05d57  gau_noel_giangsinh.v2.js
c2c8c6886cc52b58e960e4d8334c76768f77628e0a168a3f914715f5fe56f9d7  gieo_automation_pos.v3.js
0b57331c7d58fede402f779188586f35f0f60f53ebf454b14aa2a1b4d5027076  unit_engine2_v1.js
caa652d1264030522d640a3f770c41e4653a1c304722df07a03c66816097a2cb  unit_engine2_store_v1.js
e73f7849287bb7015978057f10b9f65dbd0ecff726bf9290ce23c2996d9f606b  gieo_engine2_pos_v1.js
71dc388d258e7cbe44d76375a66b1373bdfd2caaea2496d17b51763ab11641da  che_do_thu.v1.js
```

`ban_deploy/giangsinh/posgieo.html` giống hệt `posgieo.html` gốc (`diff -q` rỗng). Mọi file trên coi là ĐÃ PHÁT HÀNH (không sửa nội dung).

### 2.2. Lỗi có sẵn trước khi tách (KHÔNG sửa trong kế hoạch này)

| Lỗi | Thuộc | Ghi chú |
| --- | --- | --- |
| `tests/manage_duyet_gieo.test.js:132` — `readGieoInbox` trả thêm `2026-10-23:null` | `manage.html` | Test giả `vnDate` = 23/10 nhưng kết quả có vẻ phụ thuộc NGÀY CHẠY THẬT (hôm chạy 25/10). Chưa tìm gốc — ngoài phạm vi tách posgieo; báo chủ dự án |
| `tools/gau_noel/e2e_gau.js` dừng ở K3 (`Cannot read properties of null (reading 'style')`) | `kiosk.html` (XOFA) | Phần posgieo G1–G14 đạt |
| `tools/kho_fifo/e2e_retry.js`, `tools/nhan_hang/e2e_don_vi.js` ghi cứng `executablePath:'/usr/bin/chromium'` | công cụ test | Chạy bản tạm thay `/opt/pw-browsers/chromium` → đạt 28/28, 80/80. Đưa vào T12 (helper e2e chung) |

### 2.3. e2e posgieo nền

| Bộ | Kết quả |
| --- | --- |
| `tools/btp_am/e2e_btp_am.js` | ALL PASS |
| `tools/gau_noel/e2e_gau.js` (phần posgieo) | G1–G14 ok |
| `tools/kho_fifo/e2e_retry.js` | 28/28 (sửa đường Chromium tạm) |
| `tools/nhan_hang/e2e_don_vi.js` | 80/80 (sửa đường Chromium tạm) |
| `tools/automation/engine2_e2e.js` | ok |

## 3. Bản đồ tổng (0B)

Chạy: `npm i` (một lần) rồi `node tools/tach_posgieo/ban_do.js --json /tmp/ban_do.json`.

- Script TRẦN: dòng 2336 (26.926 dòng — script chính) và 29602 (11 dòng — khối `[Ô NGÀY]`).
- **1.528 tên cấp cao**: 1.170 function, 357 `let/const/class`, 1 `var`; **0 tên trùng**.
- **362 tên được gọi từ handler HTML** (`onclick=…` trong HTML tĩnh hoặc trong chuỗi/template JS) → phải là `function` toàn cục.
- **59 lệnh tự chạy cấp cao** (danh sách đầy đủ: trường `effects` trong JSON). Các mốc quan trọng:

| Dòng | Lệnh | Ý nghĩa cho việc tách |
| --- | --- | --- |
| 2375–2382 | kiểm `firebase`, `initializeApp`, `db`, `fstore` | điểm chèn chế độ thử — giữ inline (Q5) |
| 2395–2399 | `_posBind`, `POS_STORE`, `GieoData.install` | bootstrap — giữ inline |
| 2399–2416 | thiếu data_access + quán ≠ GG01 → `throw` | **chốt dừng 1** |
| **2418** | `if (!POS_STORE) { posStoreLoginScreen(); throw … }` | **chốt dừng 2 — máy chưa gắn quán: mọi lệnh sau dòng này trong script chính KHÔNG chạy; mọi `let/const` khai báo sau dòng này ở lại TDZ vĩnh viễn** |
| 2428 | dọn localStorage theo quán (`POS_LS_THEO_QUAN`) | cơ chế cache theo quán ĐÃ CÓ (mục 5) |
| 2450 | `UnitEngine.init` | |
| 2484 | `enablePersistence({synchronizeTabs:false})` | không được đổi thứ tự |
| 3425, 5556 | khởi tạo `POSPrinter`, `POSTemPrinter` (const, đọc localStorage) | |
| 6289 | `window.__androidScanResult = …` | callback native máy quét |
| 7302–7319 | lưu trữ, dọn ca treo, nối lại máy in, `setInterval` trạng thái máy in, `syncPrinterLayoutFromCloud()` | |
| 7471, 7513 | `auth.onAuthStateChanged` (gọi `initMenu`, `assistInit`…), `signInWithEmailAndPassword` | |
| 15843, 26904, 27837 | `addEventListener` (DOMContentLoaded / click) | |
| 18032, 22461, 7372, 7420 | `setInterval` | |
| 28913 | `window.addEventListener('scroll', …)` của trợ lý | |
| 29224 | `assistHookIntoPOS()` — bọc 15 hàm qua `window[ten]` | |
| 29256 | `assistLoadLocalCache()` | |

**Hệ quả mới (bổ sung vào kế hoạch 5.1):** `posStoreLoginScreen` (chạy ở chốt 2418, TRƯỚC `throw`) dùng `escHtmlPos`, `vnDate`, `POS_AUTH_*`. Hàm này đang chạy được nhờ hoisting trong cùng script. Nếu một hàm nó dùng bị chuyển sang file đặt **sau** script chính → màn nhập mã quán vỡ. File đặt **trước** script chính (vị trí 5.1) thì an toàn. Ngược lại: mã đặt ở file **sau** script chính vẫn chạy kể cả khi script chính đã `throw` → có thể chạy nghiệp vụ khi máy chưa gắn quán, hoặc lỗi `ReferenceError` vì `let/const` sau 2418 còn TDZ.

JS ngoài dùng tên của app (dò heuristic: `window.x`, chuỗi `'x'`, hằng VIẾT_HOA — **có thể dương tính giả**, nhờ người kiểm xác nhận):
`POS_STORE`, `openCaLamViecScreen`, `computeShiftInventoryCountLinesPOS`, `_continueAfterPrepCount`, `renderShiftHandoverForm` ← `gieo_engine2_pos_v1`; `renderOpeningChecklist`, `renderDailyClosingChecklist` ← automation + engine2; `renderReceiptCanvas`, `buildReceiptContent`, `renderCustomerInfo`, `clearCustomer`, `delOrderConfirm`, `assistFinalizeOrder` ← `gau_noel_giangsinh.v2`; `STOCK_*`, `KHO_ITEMS_CACHE`, `PREP_RECON_LOCK_COLL`, `SHIFT_WEIGH_DEVIATION_PCT` ← `unit_engine.v21` (nhiều khả năng trùng chuỗi tên bảng, không phải tham chiếu thật); `orders`, `togoSettings` ← `data_access.v9` (gần như chắc là tên bảng).

## 4. Các cụm Đợt 1

Lệnh: `node tools/tach_posgieo/ban_do.js --cum assist:28008-29256 --cum may_in:3425-3584 --cum tem_noidung_transport:5059-5959 --cum ui_may_in_quet:5961-6400`

### 4.1. Trợ lý (`pos_assist`) — dòng 28008–29256, liền một khối

- 59 tên, ~44 KB; 17 `let/const` riêng (`ASSIST_*`, `assistConfig`, `_assistShown`…).
- Phụ thuộc ra ngoài 32 tên: `vnDate`, `db`, `fstore`, `orders`, `cart`, `TOPPINGS`, `curCustomer`, `togoSettings`, `loyaltyCustomer`, `_employeeShiftsTodayCache`, `showScreen`, `fmt`, `getCartTotal`, `renderMenu`, `renderCartDrawer`, `toast`, `openToppingPickerSplit`, `tpQty`… → tất cả là tên toàn cục của script chính; hàm trong file ngoài gọi tới lúc chạy vẫn thấy (môi trường từ vựng toàn cục dùng chung giữa các script thường).
- Bên ngoài gọi vào: `assistInit` (từ `onAuthStateChanged` @7471), `assistFinalizeOrder` (từ `confirmPay`, `finalizeSplitPay`, và **`gau_noel_giangsinh.v2.js`**), handler `assistToggleMain/assistSkip/assistAccept/assistChip` (trong chuỗi HTML).
- Lệnh tự chạy: 28071 (`assistConfig = JSON.parse(…)`), 28078, 28913 (scroll), 29224 (`assistHookIntoPOS`), 29256 (`assistLoadLocalCache`).
- localStorage: `salesAssistConfig_gieogieo` (G — chung chuỗi), `salesAssistStats_gieogieo` (theo quán — có trong `POS_LS_THEO_QUAN`).
- **Kết luận đề xuất:** cụm 1A khả thi nhất. Bước R: chuyển khai báo (hàm + hằng không phụ thuộc runtime) ra `js/posgieo/pos_assist.v1.js` đặt trước script chính; **3 lệnh tự chạy 28913 / 29224 / 29256 ở lại inline đúng vị trí cũ**. Cần kiểm: `assistConfig`/`assistStats` hiện khởi tạo SAU chốt 2418 → chuyển ra trước sẽ được khởi tạo cả khi máy chưa gắn quán (vô hại vì không đọc mạng, nhưng là khác biệt nhỏ — ghi vào danh sách R).

### 4.2. Máy in / tem / máy quét — RẢI RÁC, không cắt được một khối

| Cụm | Dòng | Ghi chú |
| --- | --- | --- |
| `POSPrinter` (một `const` object 7 KB) | 3425–3584 | dùng `XprinterWNN58E` (class @2951), `XprinterBillBridgeEngine` (class @3076), `renderReceiptCanvas`, `buildReceiptContent`, `loadPrinterLayout`; bị gọi từ 19+ nơi |
| Nội dung tem + transport tem | 5059–5959 | 23 tên, 38 KB; phụ thuộc `_temForceReconnect`, `temEnsureConnected` (@6996–7038, cụm khác), `fmtPrepQty`, `fmtPrepTime`, `tp*`; `POSTemPrinter` bị gọi từ 28 nơi |
| UI máy in/quét | 5961–6400 | 17 handler HTML; `getNextBillCode` (dùng bởi `confirmPay`!) nằm lẫn ở đây; `posScan*` dùng bởi 8–11 hàm kho |
| Kết nối tem / watchdog | ~6955–7290 | chưa đo riêng — làm ở 0B bổ sung khi tới 1B |
| Lệnh tự chạy liên quan | 6289, 7307–7319 | ở lại inline |

**Kết luận:** xác nhận cảnh báo của kế hoạch — Đợt 1B/1C cần adapter hoặc giữ inline tới Đợt 2. `getNextBillCode` thuộc thanh toán, không được mang theo cụm máy in.

## 5. Ứng viên 0D (bài thử đường đi)

| Hàm | Dòng | Phụ thuộc | Người gọi | Có ở app khác | Test trích |
| --- | --- | --- | --- | --- | --- |
| `escHtmlPos` | 14058 | không | 59 hàm, gồm `posStoreLoginScreen` (chạy trước chốt 2418) | không | ≥ 4 file |

Đề xuất 0D = **chỉ `escHtmlPos`** → `js/posgieo/pos_ui.v1.js`. Lý do: hàm thuần, 1 dòng, không Firebase/native/hook; được dùng ở đường chạy trước chốt dừng (kiểm luôn quy tắc vị trí thẻ 5.1); có test trích (kiểm luôn T6). Không chọn `fmt` (có bản khác nội dung ở quanlygieo, dễ gây hiểu nhầm "chép y"), `vnDate` (cấm — 6.1).

## 6. Kiểm kê localStorage (cho 4.4 kế hoạch)

Cơ chế ĐÃ CÓ: `POS_LS_STORE_KEY = 'gieo_ls_store_v1'` + `POS_LS_THEO_QUAN` (dòng 2425–2437) — máy đổi quán thì xoá các khoá theo quán; `posLsViecDo` chặn đăng xuất khi còn việc dở. **Không cần cơ chế mới**, chỉ cần giữ nguyên.

| Khoá | Phạm vi | Trong `POS_LS_THEO_QUAN` |
| --- | --- | --- |
| `gieo_store_v1` | binding máy | — (chính là binding) |
| `pos_printer_layout_cache`, `gieo_prepStartScanState_v1`, `dwPending_pos`, `pos_pending_checkout_v1`, `prepSugHist_v1`, `prepSugLead_v1`, `salesAssistStats_gieogieo`, `pendingArchiveDays_pos`, `lastCleanup_pos`, `lastArchiveRun_pos` | S (theo quán) | có |
| `togoSettings_gieogieo`, `appFeeSettings_gieogieo`, `salesAssistConfig_gieogieo` | G | không (đúng) |
| `custAc_gieogieo_v1`, `pos_loyalty_pending_v1` | X (khách chung) | không (đúng — ghi chú trong code) |
| `pos_auto_print`, `pos_tem_last_ip`, `pos_tem_*` (`_temLocal`) | thiết bị | không (đúng) |

49 lời gọi storage, không phát hiện khoá theo quán nằm ngoài danh sách. (Bản thử có tiền tố riêng qua `che_do_thu`.)

## 7. Điểm nhờ người kiểm phản biện

1. **Mốc nền:** đồng ý coi `ban_deploy/giangsinh` @ `0bd95a7` là bản đang chạy? Có commit nào sau `0bd95a7` đổi file runtime mà mình bỏ sót?
2. **Công cụ `ban_do.js`:** dò tham chiếu bằng định danh tự do — bỏ sót tham chiếu động (`window[ten]`, `eval`, chuỗi trong `setTimeout('…')`, tên ghép chuỗi). Có đường nào trong posgieo gọi hàm theo tên ghép mà công cụ không thấy? (đã kiểm: `grep -n "window\[" posgieo.html` chỉ ra 2 dòng, đều trong `assistHookIntoPOS`; còn `setTimeout('chuỗi')`, `new Function`, handler ghép chuỗi tên thì chưa kiểm hết).
3. **Chốt dừng 2418:** lập luận ở mục 3 (file trước script chính an toàn, file sau nguy hiểm) có đúng với cả bản thử (`posgieo_thu.html`) và nhánh thiếu data_access?
4. **Môi trường từ vựng toàn cục:** khẳng định "hàm ở file ngoài nạp TRƯỚC vẫn đọc được `let cart` khai báo ở script chính sau đó, miễn là chỉ đọc lúc gọi" — đúng với WebView Android của APK (Chrome cũ)? Có cần kiểm phiên bản WebView tối thiểu?
5. **Trợ lý 1A:** bọc hàm `assistHookIntoPOS` ở lại inline — thứ tự bọc với Gấu Noel / automation / Engine 2 có giữ nguyên không?
6. **Pilot `escHtmlPos`:** đủ để chứng minh đường đi (HTTP, `file://`, bản thử `?b=`, ba bộ mùa, test trích) hay nên chọn cụm có thêm một hằng `const` để kiểm cả TDZ?
7. **Lỗi nền** mục 2.2: có lỗi nào thật ra do posgieo?
8. Kế hoạch còn thiếu rủi ro nào khi đối chiếu với dữ liệu thật ở mục 3–6?

## 8. Tệp trong lượt này

- `tools/tach_posgieo/ban_do.js` — mới, chỉ đọc.
- `docs/tach_posgieo/KIEM_TRA_01_NEN_VA_BAN_DO.md` — file này.
- `docs/KE_HOACH_TACH_POSGIEO_DA_CUA_HANG.md` — thêm quy tắc "dừng chờ kiểm tra", hệ quả chốt 2418 vào 5.1, cơ chế `POS_LS_THEO_QUAN` vào 4.4, T12 gồm đường Chromium cứng, bảng theo dõi 0A/0B.
- `CLAUDE.md`, `docs/TRANG_THAI.md` — trạng thái deploy 25/10 + dòng kế hoạch.
