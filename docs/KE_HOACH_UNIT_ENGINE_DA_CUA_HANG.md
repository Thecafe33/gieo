# KẾ HOẠCH TÁI CẤU TRÚC UNIT ENGINE & MỞ RỘNG ĐA CỬA HÀNG — GIEO GIEO

| | |
|---|---|
| Phiên bản | **1.11** — 28/09/2026 |
| Trạng thái | Kế hoạch — **chưa sửa code** |
| Phạm vi code khảo sát | `posgieo.html` (31.842 dòng), `quanlygieo.html` (28.264 dòng) — bản đã gồm các sửa đổi trong phiên (cân cuối ca theo mã, giảm lượt đọc, chặn phần lẻ nhận hàng, Sổ lệch tem cái rời) |
| Cách kiểm kê | **Phân tích cú pháp (AST, acorn)** toàn bộ script của hai file — thay cho quét regex theo dòng ở bản 1.0. Giới hạn: xem 10.1 |
| Số dòng trích dẫn | Theo đúng bản code trên. Sẽ trôi khi code đổi — luôn tìm theo **tên hàm** |
| Nguyên tắc làm việc | Mọi bug/thay đổi đều **phản biện trước khi sửa** (kiểm xem đã có cơ chế nào xử lý chưa) |

### Thay đổi ở bản 1.11

| # | Nội dung |
|---|---|
| 31 | Giữ **toàn bộ** nội dung đã có; K0, F4, F5 chuyển từ "cần duyệt" thành **bước thực hiện** trong lộ trình (K0 + F4 đầu tiên, F5 gộp vào E5). O20 đã trả lời: thư mục deploy chứa cả file XOFA / The Cafe 33 |

### Thay đổi ở bản 1.10 (cách deploy thực tế)

| # | Thông tin mới | Hệ quả trong kế hoạch |
|---|---|---|
| 30 | Anh deploy **cả thư mục** bằng `firebase deploy --only hosting` từ **Termux trên điện thoại** | 6.1 viết lại theo quy trình này; thêm **kiểm tra trước deploy** chạy được trong Termux (6.7). Giả định làm việc: **một site, một thư mục** chứa file của cả ba thương hiệu → thư mục trên máy anh là **nguồn gốc duy nhất** của cả ba web app. Quay lui ưu tiên **sửa tiến** (trỏ HTML về engine cũ rồi deploy lại) thay vì Rollback của Hosting, vì Rollback quay lui **cả site** |

### Thay đổi ở bản 1.9 (host là Firebase Hosting)

| # | Thông tin mới | Hệ quả trong kế hoạch |
|---|---|---|
| 29 | **Hai app host trên Firebase Hosting** | 6.1 / 6.2 / 6.6 viết lại theo cách Firebase Hosting chạy: cache đặt trong `firebase.json`; **mỗi lần deploy thay toàn bộ site** → file engine cũ chỉ còn nếu vẫn nằm trong thư mục deploy; quay lui dùng **Rollback bản phát hành** có sẵn của Hosting. Mặc định Hosting cho file tĩnh `max-age=3600` → HTML cũ có thể còn chạy tới ~1 giờ sau deploy → đặt HTML `no-cache`. Thêm **O20** (site Hosting có dùng chung với XOFA / The Cafe 33 không) |

### Thay đổi ở bản 1.8 (không có service worker)

| # | Thông tin mới | Hệ quả trong kế hoạch |
|---|---|---|
| 28 | **`sw_gieogieo.js` chưa từng tồn tại** — hệ thống không cấu hình PWA | Đoạn `navigator.serviceWorker.register('sw_gieogieo.js')` + `showSwUpdateBanner` trong POS là **tàn dư**: mỗi lần mở app đăng ký lỗi 404 (bắt lỗi im lặng), banner "có bản mới" không bao giờ hiện → dọn ở **F5**. Bản 1.0–1.7 dựa trên giả định sai "POS khởi động offline nhờ SW" → **sửa 2.7, 3.1, 3.10, 6.1, 6.2, E0, E1**: engine được tải **cùng cách với HTML** (cache HTTP của WebView trong APK), không có precache. Mốc thực tế: *mất mạng khi app đang mở* → vẫn bán (Firestore persistence); *mở app khi không có mạng* → phụ thuộc cache WebView, **chưa từng kiểm** → E0 đo mốc này |

### Thay đổi ở bản 1.7 (Đồng giá đã bị loại)

| # | Thông tin mới | Hệ quả trong kế hoạch |
|---|---|---|
| 27 | **Đồng giá đã loại từ lâu** | Kiểm code: logic đã gỡ hẳn (ghi chú 22/08/2026), **không còn dòng code nào chạy**. Chỉ còn: chú thích cũ trong `onCheckoutClick`, `openSplitPay`, `applySplitBillDiscount`, `spPay` còn nhắc "đồng giá"; một dòng chú thích CSS mồ côi; ghi chú ẩn đầu file vẫn ghi "Ví và Đồng giá chỉ ẩn tab" + hướng dẫn "phục hồi Đồng giá" trỏ tới tab không còn tồn tại; dữ liệu `donggia_config` trên Firebase. → gộp vào **F5** (chỉ sửa chú thích/ghi chú); M2 bỏ qua `donggia_config` |

### Thay đổi ở bản 1.6 (Ví đã bị loại khỏi Gieo Gieo)

| # | Thông tin mới | Hệ quả trong kế hoạch |
|---|---|---|
| 26 | **Tính năng Ví (wallet) đã bị loại** | Kiểm code: màn ví + ~762 dòng JS đã gỡ hẳn (ghi chú ngày 22/08/2026 trong file). Còn sót: tham số `isWallet` và "x2 Ví" trong nhánh Point (đã là code chết — gộp vào **F5**); dữ liệu `wallets_gieogieo` còn trên Firebase (M2 **bỏ qua**, không chuyển, không tự xoá). **Lưu ý khi dọn**: các lớp CSS `.wal-section`, `.wal-section-title`, `.wal-input-group`, `.wal-input-label` mang tên ví nhưng **đang được hơn 200 phần tử của màn khác dùng** — không được xoá. Ghi chú ẩn đầu `posgieo.html` có một đoạn cũ còn ghi "Ví chỉ ẩn tab" — sửa cho khớp |

### Thay đổi ở bản 1.5 (sau khi có trả lời O18)

| # | Thông tin mới | Hệ quả trong kế hoạch |
|---|---|---|
| 25 | **Gieo Gieo chỉ bán to-go** | Kiểm code: `isToGo` mặc định `true`, `resetTogoToggle` đặt lại `true` sau mỗi đơn, nút chuyển "Tại quán" đã **ẩn** (`display:none`) → nhánh tích **Point** tại quán **không chạy được**. Rủi ro #24 **không đang mở** — hạ xuống thành dọn code chết **F5** (ưu tiên thấp) |

### Thay đổi ở bản 1.4 (sau khi có trả lời O17)

| # | Thông tin mới | Hệ quả trong kế hoạch |
|---|---|---|
| 22 | **Gieo Gieo không dùng mã nào** — chỉ khuyến mãi cấu hình ở Quản lý + tích tem tặng ly | Kiểm code: POS vẫn còn **nhập mã giảm giá**, **dùng quà của khách từ `myGifts`** (quà của hệ khác), và **ghi `rewards.usedCount`** (tăng lượt dùng mã của The Cafe 33) → **F4 đổi thành gỡ bỏ**, không phải lọc. Sau F4, Gieo Gieo **không đọc/ghi `rewards`** |
| 23 | *(phát hiện khi kiểm)* Luồng tặng ly miễn phí theo tem (`consumeFreeToGoDrink`) **dùng chung cơ chế voucher** (`_giftVoucherKey`) với phần sẽ gỡ | F4 phải giữ nguyên đường này |
| 24 | *(phát hiện khi kiểm)* Bill **tại quán** tích **Point** (`loyaltyAddPoints`, x2 khi trả bằng ví) vào `customers` dùng chung; chỉ bill **to-go** tích tem | → O18 (bản 1.5: nhánh này không chạy được — F5) |

### Thay đổi ở bản 1.3 (sau khi có trả lời O12, O14–O16)

| # | Thông tin mới | Hệ quả trong kế hoạch |
|---|---|---|
| 18 | **`kiosk_config` là của XOFA** (quán duy nhất dùng kiosk) | Màn cấu hình kiosk còn sót trong POS Gieo Gieo **đang có thể ghi đè kiosk của XOFA** → K0 thành **việc gấp**, làm trước mọi bước khác |
| 19 | **Rules hiện tại: đã đăng nhập = toàn quyền** | Hiện không có lớp bảo vệ nào ở máy chủ; ranh giới engine chỉ là kỷ luật code. M3 dùng custom claims để siết riêng tài khoản Gieo Gieo, **tài khoản không có claim giữ nguyên toàn quyền** (hai thương hiệu kia không bị ảnh hưởng) — 7.9 |
| 20 | **Khuyến mãi Gieo Gieo là khuyến mãi cục bộ**; `rewards` do The Cafe 33 cấu hình, Gieo Gieo **không được** dùng mã của quán khác | Khuyến mãi đa cửa hàng áp cho `togoSettings_gieogieo` + chiến dịch trong `sales_assist_config_gieogieo` (7.6), **không** đụng `rewards`. Kiểm code thấy POS **chưa chặn** mã/quà của quán khác → **F4** |
| 21 | **Chỉ quan tâm những gì Gieo Gieo dùng** | D18 rút gọn: không kiểm kê app XOFA / The Cafe 33; ràng buộc là không đổi cấu trúc tài nguyên dùng chung mà Gieo Gieo chạm tới |

### Thay đổi ở bản 1.2 (sau khi có trả lời O9–O11)

| # | Thông tin mới | Hệ quả trong kế hoạch |
|---|---|---|
| 15 | **XOFA và The Cafe 33 đang dùng chung dữ liệu** với Gieo Gieo trong project `the-cafe-33` (`customers`, `rewards`, `bank_confirmations`, tài khoản `cafe33@…`) | Nhóm **X** được xác nhận; nguyên tắc **D18**; mục 7.13 mới; M2/M3 không đụng cấu trúc tài nguyên X; giữ tài khoản chung |
| 16 | **Webhook ngân hàng chạy trên Cloud Run cùng project** (phục vụ chung) | 2.7, 7.5, M3: một lần deploy Cloud Run để nhận mã có cửa hàng, **không đổi** cách đọc của 2 thương hiệu kia |
| 17 | **Màn hình phụ (kiosk) đã bị loại khỏi Gieo Gieo** — nhưng code vẫn còn chạy: `syncDisplay` (31 nơi gọi) ghi `session_display_gieogieo` mỗi lần giỏ hàng đổi; màn cấu hình vẫn ghi `kiosk_config` (**không hậu tố — có thể đè cấu hình kiosk của thương hiệu khác**) | Bước **K0 dọn kiosk** (làm sớm, độc lập); M2 **không** chuyển `session_display` mà xoá |

### Thay đổi so với bản 1.0 (sau red-team)

| # | Bản 1.0 sai / thiếu | Bản 1.1 sửa ở |
|---|---|---|
| 1 | Ma trận quyền ghi coi toàn bộ Sổ kho là của engine, trong khi nhiều cụm **chú thích/sửa dòng sổ tại chỗ** | 2.5, 3.4-F, 3.9 |
| 2 | Kiểm kê thiếu ≥ 8 hàm ghi thẳng (quét theo dòng) — nay **74 hàm** từ AST | 2.4 |
| 3 | Bỏ quên thành phần **ngoài hai file** (webhook ngân hàng, màn hình khách…) | 2.7, M3, M2 |
| 4 | Đường dẫn mới **bỏ hậu tố `_gieogieo`** — nguy cơ đụng thương hiệu khác cùng project | D16, 3.3, 7.x |
| 5 | Hứa "test so khớp từng byte" — không làm được (giờ, mã ngẫu nhiên, push id) | 3.2, 5.1, E1 |
| 6 | `ready` chờ giờ máy chủ + chặn thao tác khi lệch phiên bản → **có thể chặn bán hàng** | D17, 3.10, 6.x |
| 7 | Thiếu cơ chế **buộc cập nhật từ xa** trước khi chuyển dữ liệu | 6.4, M2 |
| 8 | Giờ máy chủ được gọi là "giữ đúng POS" — thực ra là **thay đổi**, cần cách triển khai | 3.7-C1, 6.5 |
| 9 | Đánh giá thấp việc tách `store_item_state` | M2a |
| 10 | Thiếu các **việc dọn dẹp/lưu trữ** (archive đơn, dọn xác nhận CK) | 2.7, M2 |
| 11 | Nói "mọi hàm ghi idempotent" — có **3 chỗ ghi sổ bằng `.add()`** | 2.6, E4.0 |
| 12 | R5 trình bày như "theo POS" — thực ra là **sửa lỗi của Quản lý** | 3.7 (F-list) |
| 13 | *(mới phát hiện khi kiểm kê AST)* Quản lý có **bản thứ hai** của 2 nghiệp vụ: xoá bill hoàn kho (`qlReverseStockForOrder` + claim riêng) và BTP âm → dùng bù (`_btpAmApplySubstitution`) | 2.3, E3 |
| 14 | *(mới)* Quản lý **sửa số lượng dòng sổ đã ghi** (`fixRecWizApply` sửa `qty` RECEIVING; `prepBatchRestoreCore` đổi `type`) | 2.5, `ledger.amend` |

---

## Mục lục

0. [Tóm tắt](#0-tóm-tắt)
1. [Các quyết định đã chốt](#1-các-quyết-định-đã-chốt)
2. [Hiện trạng — kiểm kê từ code](#2-hiện-trạng--kiểm-kê-từ-code)
3. [Thiết kế `unit_engine.js`](#3-thiết-kế-unit_enginejs)
4. [Lộ trình tách engine E0 → E6](#4-lộ-trình-tách-engine-e0--e6)
5. [Kiểm thử](#5-kiểm-thử)
6. [Triển khai, phiên bản, quay lui](#6-triển-khai-phiên-bản-quay-lui)
7. [Kế hoạch đa cửa hàng M1 → M6](#7-kế-hoạch-đa-cửa-hàng-m1--m6)
8. [Rủi ro và cách giảm](#8-rủi-ro-và-cách-giảm)
9. [Việc còn mở / thông tin cần bổ sung](#9-việc-còn-mở--thông-tin-cần-bổ-sung)
10. [Phụ lục](#10-phụ-lục)

---

## 0. Tóm tắt

**Vấn đề.** Unit Engine (tem nguyên liệu + lô BTP, FIFO, nợ FIFO, suy tồn) chạm vào gần như mọi nghiệp vụ. Kiểm kê AST cho thấy:

- Lõi nằm tập trung trong POS (~dòng 3689–4460).
- **74 hàm** (51 POS, 23 Quản lý) ghi vào dữ liệu thuộc engine: RT `active_units`, tem/lô, sổ kho, Sổ lệch, claim, khoá, trường tồn.
- Quản lý có **bản chép** của lõi (suy tồn, hoàn, sổ kho, Sổ lệch) và **bản thứ hai của 2 nghiệp vụ** (xoá bill, BTP âm dùng bù) — đã lệch POS.
- Sổ kho không chỉ được "ghi thêm": có **chú thích tại chỗ** (trách nhiệm, duyệt, huỷ) và cả **sửa số lượng tại chỗ**.
- Có thành phần **ngoài hai file** phụ thuộc vào cấu trúc dữ liệu (webhook ngân hàng ghi `bank_confirmations`, màn hình khách đọc `session_display`).

**Mục tiêu.**

1. Một file `unit_engine.js` duy nhất, POS và Quản lý cùng nạp. **Logic = logic POS hiện tại** (trừ danh sách sửa lỗi F đã duyệt).
2. Chỉ engine ghi **trường số lượng** của tem/lô/sổ/tồn. Chú thích đi qua API chú thích có danh sách trường cho phép. Script AST tự kiểm tra ranh giới.
3. Engine biết `storeId` ngay từ đầu (cố định một cửa hàng).
4. **Không bước nào được làm POS mất khả năng bán hàng** (kể cả offline).
5. Sau đó mở rộng lên 10 cửa hàng theo hướng B, **giữ không gian tên `_gieogieo`**.

**Lộ trình tổng.**

```
K0 Dọn kiosk + F4 gỡ mã/voucher (GẤP, làm đầu tiên)
E0 Kiểm kê AST, client ngoài, nền test ─► E1 Tách lõi POS ─► E2 Sổ kho/mã/Sổ lệch
   ─► E3 Quản lý dùng engine (+ gộp 2 nghiệp vụ trùng) ─► E4 Gom đường ghi thẳng
   ─► E5 Rào ranh giới AST & dọn dẹp (+ F5 dọn code chết) ─► E6 Engine biết storeId
                                                  │
M1 Lớp truy cập dữ liệu ngoài engine ◄── (song song E4–E6)
   ─► M2a Tách trạng thái tồn ─► M2 Schema & chuyển dữ liệu ─► M3 Danh tính/quyền/CK
   ─► M4 Quản lý đa cửa hàng ─► M5 Chuyển kho & kho trung tâm ─► M6 Thí điểm → nhân rộng
```

---

## 1. Các quyết định đã chốt

| # | Chủ đề | Quyết định |
|---|---|---|
| D1 | Kiến trúc | Không backend/Cloud Functions. Engine là file `.js` tĩnh, nạp bằng `<script src>` ở cả hai app |
| D2 | Hosting | POS là APK bọc **đường link web** → cập nhật = thay file trên host |
| D3 | Quy tắc lệch giữa POS/Quản lý | **Theo POS hiện tại** (3.7). Những điểm POS không có → danh sách **F** cần anh duyệt riêng |
| D4 | Hướng đa cửa hàng | **Hướng B** — chung dữ liệu, bản ghi mang `storeId` (10 cửa hàng) |
| D5 | Khách hàng | `customers` + loyalty **dùng chung** |
| D6 | Nhân viên | **Dùng chung**, có `storeTags`; check-in ở cửa hàng nào cũng được |
| D7 | Lịch làm việc | **Theo cửa hàng**, đổi vị trí được |
| D8 | Chuyển khoản | **Một đường chung** `bank_confirmations` |
| D9 | Kiosk | Không áp dụng cho Gieo Gieo |
| D10 | Phiếu nhập | **Riêng từng cửa hàng** |
| D11 | Khuyến mãi | Phạm vi **toàn hệ thống** hoặc **danh sách cửa hàng** |
| D12 | Nguồn hàng | Chuyển giữa cửa hàng, từ **kho trung tâm**, nhà cung cấp giao tận quán |
| D13 | Chuyển mã | Mặc định **chỉ tem nguyên seal** |
| D14 | Dụng cụ cân | **Dùng chung** |
| D15 | Bảo mật | Tách tài khoản + rules ở M3; tắt WebView debugging bản phát hành |
| **D16** | **Không gian tên** | Mọi collection / đường dẫn RT **mới** giữ hậu tố `_gieogieo` (vd `stores_gieogieo`, `active_units_gieogieo/{storeId}/…`). `customers`, `rewards`, `bank_confirmations` **không hậu tố** → coi là tài nguyên **có thể dùng chung nhiều thương hiệu** (xác nhận ở O9) |
| **D18** | **Dùng chung với XOFA & The Cafe 33** | Chỉ xét những gì **Gieo Gieo dùng**. Với tài nguyên dùng chung mà Gieo Gieo chạm tới (`customers`, `bank_confirmations`, `kiosk_config` của XOFA, tài khoản `cafe33@…`, Cloud Run webhook; `rewards` cho tới khi xong F4): **không đổi cấu trúc, không thu hẹp quyền, không đổi hành vi**; Gieo Gieo chỉ được *thêm* (trường tuỳ chọn, dạng mã mới). Script chuyển dữ liệu **không ghi** vào nhóm này. `rewards` và `kiosk_config`: Gieo Gieo **không ghi** |
| **D17** | **Không chặn bán hàng** | Không cơ chế nào của engine/phiên bản được chặn bán hàng hoặc chặn khởi động khi offline. Chỉ ngoại lệ: cửa sổ bảo trì có kế hoạch của M2 (6.4) |

---

## 2. Hiện trạng — kiểm kê từ code

### 2.1 Các bất biến engine đang giữ (phải giữ nguyên)

| Mã | Bất biến | Nơi thể hiện |
|---|---|---|
| B1 | **Tem = sự thật.** Tồn NL = Σ `baseQty` tem sealed (Firestore) + Σ `unitBase` tem đang mở (RT). Khoản không gắn được vào mã → Sổ lệch | `_ueRecomputeCurrentStock` |
| B2 | **RT là nguồn thật của phần đang mở**: `active_units_gieogieo/{itemId}/{containerId}` = `{code,itemName,unit,unitBase,capacity,openedAt(ms)}` (+ `finishedDebt`, `discardPending`, `shiftWeigh`, `lastPrepReconOp`, `lastMgrAdjustOp`); node đặc biệt `__prepLock` | `_ueActiveUnitsRef` |
| B3 | **FIFO theo `openedAt`** (RT) | `_ueComputeAllocation` |
| B4 | **Nợ FIFO** dồn vào tem mở **gần nhất** | `_ueComputeAllocation` |
| B5 | **Mở tem mới hấp thụ nợ** mọi tem âm cùng món (NL); BTP không | `unitEngineOnOpen` |
| B6 | **Báo hết**: dương → WASTE; âm → node `finishedDebt` | `unitEngineFinishOpenUnit` |
| B7 | **Hoàn**: về đúng tem; tem gốc rời RT → tem mở **cũ nhất** | `unitEngineReverseAllocations` |
| B8 | **Chống đúp**: `txId` cố định; claim `reversal_unit_claims`; fail-closed | `_ueClaimedReverseAllocations` |
| B9 | **Chống ghi đè tồn** bằng mốc `_ueLastRecomputeStart` (**giờ máy**) | `_ueRecomputeCurrentStock` |
| B10 | **Bù lệch RT–Firestore** (orphan open, `_ueRtStale`) | `_ueRecomputeCurrentStock` |
| B11 | **BTP**: tồn = Σ phần dương; âm + `untrackedPendingDelta` âm → `pendingShortage` | `_ueRecomputeCurrentStock` |
| B12 | **Khoá NL khi cân mẻ** (`__prepLock` + `prep_ingredient_locks`) | `prepRecon*` |
| B13 | **Ghi tuyệt đối có chống ghi đè** (dấu mốc node hoặc giá trị kỳ vọng) | `shiftWeighApplyLinePOS`, `prepReconSetUnit`, `ctnAdjustCore` |
| B14 | **Mã** 8 ký tự ngẫu nhiên, kiểm trùng trong collection; mã trùng cũ bị chặn | `capMaKhoDuyNhat`, `findContainerByCode` |
| B15 | **Tem cái rời** không mở qua quét; báo hết đi thẳng từ sealed | `scanToOpenContainer`, `writeAtomicContainerFinish` |

### 2.2 Lõi trong POS (chuyển nguyên vào engine)

| Hàm | Dòng | Vai trò |
|---|---|---|
| `loadOpenContainers` | 3689 | Danh sách tem mở |
| `findContainerByCode` | 3713 | Tra mã |
| `_ueActiveUnitsRef` / `_ueRetryAsync` | 3760 / 3768 | Đường dẫn RT / thử lại |
| `_ueComputeAllocation` | 3782 | Thuật toán FIFO + nợ (thuần) |
| `missingUnitsWarning` | 3812 | Nợ > dung tích |
| `unitEngineAllocateConsumption` | 3826 | Trừ FIFO |
| `_ueMaybeWarnUntrackedConsumption` / `_ueWarnAllocateRtdbError` | 3924 / 3955 | Cảnh báo |
| `_ueRecomputeCurrentStock` | 3982 | Suy tồn |
| `_ueSyncQtyRemainingClamped` | 4083 | Đồng bộ `qtyRemaining` |
| `unitEngineReverseAllocations` / `_ueClaimedReverseAllocations` | 4108 / 4200 | Hoàn |
| `unitEngineOnOpen` / `unitEngineFinishOpenUnit` | 4277 / 4355 | Mở / báo hết |
| `refreshFifoAlert` / `_fifoRtListen` / `_fifoRebuild` | ~4468–4510 | Tem cần xác nhận hết |
| `sinhMaNgauNhien` / `capMaKhoDuyNhat` / `genStockContainerCode` / `genPrepBatchCode` | 5890 / 5907 / 5927 / 11123 | Sinh mã |
| `isTemTrackedNL` / `isAtomicUnitItem` | 5992 / 6009 | Phân loại |
| `logStockAnomalyPOS` | 5996 | Sổ lệch |
| `createContainersForReceipt` | 6039 | Sinh tem khi nhận hàng |
| `prepRecon*` | 12072–12220 | Khoá / ghi số khi cân mẻ |
| `applyStockTransactionPOS` / `applyStockTransferPOS` | 15990 / 16248 | Sổ kho |
| `applyPrepConsumptionPOS` | 22649 | Trừ BTP khi bán |

### 2.3 Bản chép và nghiệp vụ trùng ở Quản lý

**Bản chép của lõi**

| Hàm Quản lý | Dòng | Tương ứng POS | Điểm lệch |
|---|---|---|---|
| `_ueActiveUnitsRef` | 2251 | `_ueActiveUnitsRef` | Bản sao |
| `recomputeTemStock` | 6526 | `_ueRecomputeCurrentStock` | **Cố ý bỏ mốc B9** vì lệch giờ máy (có chú thích trong code) |
| `recomputePrepStock` | 6560 | như trên (BTP) | như trên |
| `reverseIntoUnits` | 6582 | `unitEngineReverseAllocations` | Tem gốc rời RT → **từ chối** (POS: tem cũ nhất) |
| `applyStockTransaction` | 6445 | `applyStockTransactionPOS` | Không refill/quầy |
| `logStockAnomaly` | 6514 | `logStockAnomalyPOS` | Bản sao |
| `applyStockTransfer` | 6841 | `applyStockTransferPOS` | **0 nơi gọi — code chết** |

**Bản thứ hai của nghiệp vụ** *(bản 1.0 bỏ sót)*

| Nghiệp vụ | POS | Quản lý | Khác biệt cần xử lý |
|---|---|---|---|
| Xoá bill → hoàn kho | `reverseSalesConsumptionPOS` → `_reverseIngredientConsumptionPOS` / `_reversePrepConsumptionPOS` → `_ueClaimedReverseAllocations` | `qlReverseStockForOrder` (+ `hoanVaoTem` lồng bên trong, **claim riêng**, hằng `STALE_MS` chép tay từ POS) | Hợp nhất thành `consume.reverseOrder`; một cơ chế claim |
| BTP âm → dùng bù | `prepShortageSubmitAnswers` (+ `shiftWeighReclassToConsumptionPOS`) | `_btpAmApplySubstitution` (đánh dấu Sổ lệch + dòng sổ) | Hợp nhất thành `prep.shortageResolve`; kiểm lại để không trừ/chuyển loại hai lần |
| Chỉnh tồn BTP | (kiểm kê cuối ca) | `submitPrepAdjust` (FIFO theo `finishedAt`) | Theo POS: `openedAt` (R2) |

### 2.4 Toàn bộ hàm ghi vào dữ liệu thuộc engine (AST)

"Ghi gì" = collection thuộc engine + thao tác + trường theo dõi được (trong ngoặc); `RT …` = thao tác trên `active_units_gieogieo`. Trường ghi qua biến dựng động không hiện (xem 10.1).

**POS — 51 hàm**

| Hàm | Dòng | Ghi gì (AST) | Nghiệp vụ | Loại | Đích trong engine |
|---|---|---|---|---|---|
| `unitEngineAllocateConsumption` | 3826 | collection động update (unitBase); RT transaction | Trừ FIFO | Lõi | `consume.allocate` |
| `_ueRecomputeCurrentStock` | 3982 | collection động tx.update (_ueLastRecomputeStart, currentStock, pendingShortage) | Suy tồn | Lõi | `stock.recompute` |
| `_ueSyncQtyRemainingClamped` | 4083 | `prep_batches` update (qtyRemaining) | Đồng bộ qtyRemaining BTP | Lõi | nội bộ engine |
| `unitEngineReverseAllocations` | 4108 | collection động update (unitBase); RT transaction | Hoàn | Lõi | `consume.reverse` |
| `_ueClaimedReverseAllocations` | 4200 | `reversal_unit_claims` tx.set/set (itemId, status) | Hoàn có claim | Lõi | `consume.reverse` |
| `unitEngineOnOpen` | 4277 | collection động update; RT transaction | Mở tem/lô + hấp thụ nợ | Lõi | `lifecycle.open` |
| `unitEngineFinishOpenUnit` | 4355 | RT transaction | Báo hết | Lõi | `lifecycle.finish` |
| `_applyFifoNotEmpty` | 4669 | `stock_containers` update (needsReview, unitBase); `stock_transactions` add (itemId, qty, status, type); RT transaction | Xác nhận "chưa hết" ở chấm FIFO | Ghi số lượng | `units.setBalance` (+ sửa `.add` → txId cố định) |
| `submitOpenContainer` | 5063 | `stock_containers` tx.update (openedAt, status) | Mở tem (phần Firestore) | Ghi số lượng | `lifecycle.open` |
| `confirmOpenLabelStuck` | 5279 | `stock_containers` update | Xác nhận đã dán nhãn mở | Chú thích | `containers.annotate` |
| `writeAtomicContainerFinish` | 5438 | RT transaction | Báo hết tem cái rời | Ghi số lượng | `lifecycle.finishAtomic` |
| `_reverseAtomicContainerFinish` | 5506 | `stock_containers` update (status); RT set | Huỷ mẻ → trả tem cái rời | Ghi số lượng | `lifecycle.reverseFinishAtomic` |
| `markOpenLabelStuck` | 5714 | `stock_containers` update | Đánh dấu nhãn mở | Chú thích | `containers.annotate` |
| `markStockLabelsPrinted` | 5825 | `stock_containers` update | Đánh dấu đã in tem | Chú thích | `containers.annotate` |
| `logStockAnomalyPOS` | 5996 | `stock_anomalies` set (itemId, qty, status) | Ghi Sổ lệch | Lõi (E2) | `anomaly.log` |
| `createContainersForReceipt` | 6039 | `stock_containers` set | Sinh tem khi nhận hàng | Lõi (E2) | `lifecycle.createFromReceipt` |
| `_wastePrepQtyPOS` | 9934 | `prep_transactions` tx.set (qty, type); `prep_items` (currentStock) | Hao hụt BTP | Ghi số lượng | `prep.waste` |
| `_submitKhoTxImpl` | 10367 | `stock_containers` tx.update/update (finishedAt, needsReview, status, unitBase); RT transaction/remove | Báo huỷ tem | Ghi số lượng | `lifecycle.requestDiscard` |
| `prepReconAcquire` | 12170 | RT transaction | Khoá NL khi cân mẻ | Ghi số lượng | `prep.reconAcquire` |
| `prepReconRelease` | 12196 | `prep_ingredient_locks` tx.delete; RT transaction | Mở khoá NL | Ghi số lượng | `prep.reconRelease` |
| `prepReconSetUnit` | 12220 | `stock_containers` update (unitBase); RT transaction | Ghi số cân NL trong mẻ | Ghi số lượng | `units.setBalance` |
| `prepReconAttachOpenUnit` | 12317 | `prep_batches` tx.update | Gắn tem đang mở vào mẻ | Chú thích (trên lô) | `prep.reconAttach` |
| `prepReconRegisterNew` | 12352 | `prep_batches` tx.update | Mở tem mới trong mẻ | Ghi số lượng | `prep.reconOpenNext` |
| `prepReconOpenNext` | 12389 | `prep_batches` tx.update | Mở tem kế tiếp trong mẻ | Ghi số lượng | `prep.reconOpenNext` |
| `prepReconRefreshStale` | 12594 | `prep_batches` tx.update | Làm mới đầu vào mẻ đã cũ | Chú thích (trên lô) | `prep.reconRefresh` |
| `prepReconPostSave` | 12790 | `prep_batches` tx.update/update; `stock_containers` update (unitBase) | Chốt mẻ | Ghi số lượng | `prep.reconCommit` |
| `_startPrepBatchImpl` | 13144 | `prep_batches` set (finishedAt, qtyRemaining, status) | Bắt đầu mẻ | Ghi số lượng | `prep.startBatch` |
| `_submitPrepCancelImpl` | 13743 | `prep_batches` tx.update/update (status) | Huỷ mẻ | Ghi số lượng | `prep.cancelBatch` |
| `_submitPrepFinishImpl` | 13847 | `prep_batches` tx.update/update (finishedAt, qtyRemaining, status, unitBase); `prep_transactions` tx.set (qty, type); `prep_items` (currentStock) | Xong mẻ | Ghi số lượng | `prep.finishBatch` |
| `_applyPrepYieldEdit` | 14133 | `prep_batches` update (qtyRemaining, status, unitBase); `prep_transactions` add (qty, type); RT transaction | Sửa sản lượng lô | Ghi số lượng | `prep.editYield` (+ sửa `.add`) |
| `_submitPrepWasteImpl` | 14352 | `prep_transactions` tx.set (qty, type); `prep_items` (currentStock); RT transaction/remove | Huỷ lô BTP | Ghi số lượng | `prep.discardBatch` |
| `submitFoundLostContainer` | 14998 | `stock_containers` update (status); RT set | Tìm lại tem đã mất | Ghi số lượng | `lifecycle.markFound` |
| `bulkReprintByDateConfirm` | 15272 | `stock_containers` update (code); RT update | Cấp lại tem hàng loạt | Ghi mã | `codes.reprint` |
| `missingLabelDoReprint` | 15474 | `stock_containers` update (code); RT update | Cấp lại tem | Ghi mã | `codes.reprint` |
| `applyStockTransactionPOS` | 15990 | `stock_transactions` tx.set | Sổ kho NL | Lõi (E2) | `ledger.apply` |
| `setLocationStockFromCountPOS` | 16214 | `stock_transactions` tx.set (itemId, qty, status, type); `inventory_items` (locationStock) | Đếm giao ca → tồn quầy | Ghi số lượng | `ledger.setLocationStock` |
| `applyStockTransferPOS` | 16248 | `stock_transactions` tx.set | Refill kho → quầy | Lõi (E2) | `ledger.transfer` |
| `prepShortageClearAll` | 19510 | `prep_items` (untrackedPendingDelta); RT remove | Xoá âm BTP cuối ca | Ghi số lượng | `prep.shortageClear` |
| `_submitPrepCountImpl` | 19951 | `prep_batches` update (_ueRtStale, qtyRemaining, status, unitBase); `prep_transactions` tx.set (qty, type); `prep_items` (currentStock, pendingShortage, untrackedPendingDelta); RT remove/transaction | Kiểm kê BTP cuối ca | Ghi số lượng | `prep.countCommit` |
| `shiftWeighApplyLinePOS` | 20629 | RT transaction | Cân NL cuối ca (RT) | Ghi số lượng | `units.reconcileItem` |
| `shiftWeighFinishPOS` | 20765 | `stock_containers` update (unitBase) | Cân NL cuối ca (bản sao + sổ) | Ghi số lượng | `units.reconcileItem` |
| `shiftWeighHealPendingPOS` | 20807 | (qua biến động — xem ghi chú) | Tự bù lượt cân dở dang | Ghi số lượng | `units.reconcileItem` (heal) |
| `shiftWeighReclassToConsumptionPOS` | 20861 | `stock_transactions` tx.set (itemId, qty, status, type) | Chuyển hao hụt cân cuối ca → dùng bù | Sửa dòng sổ | `ledger.amend` |
| `applyPrepConsumptionPOS` | 22649 | `prep_transactions` tx.set (qty, type) | Trừ BTP khi bán | Lõi | `consume.sale` |
| `applySalesConsumptionPOS` | 22771 | `order_stock_traces` set | Trừ kho khi bán | Ghi số lượng | `consume.sale` |
| `applyBackfillConsumptionNoStockEffect` | 22979 | `stock_transactions` add (itemId, qty, status, type); `prep_transactions` add (qty, type); `order_stock_traces` set | Bill bổ sung không trừ kho | Ghi sổ | `consume.backfillNoStock` (+ sửa `.add`) |
| `reverseSalesConsumptionPOS` | 23111 | `order_stock_traces` set | Xoá bill (điều phối) | Ghi số lượng | `consume.reverseOrder` |
| `_voidBackfillConsumptionPOS` | 23183 | `order_stock_traces` set | Xoá bill bổ sung | Chú thích sổ | `ledger.annotate` (voided) |
| `_reverseIngredientConsumptionPOS` | 23273 | `stock_transactions` tx.set (itemId, qty, status, type) | Xoá bill — NL | Ghi số lượng | `consume.reverseOrder` |
| `_reversePrepConsumptionPOS` | 23378 | `prep_transactions` tx.set (qty, type) | Xoá bill — BTP | Ghi số lượng | `consume.reverseOrder` |
| `applyAddonConsumptionPOS` | 27951 | `order_stock_traces` set | Trừ kho món thêm | Ghi số lượng | `consume.sale` |

**Quản lý — 23 hàm**

| Hàm | Dòng | Ghi gì (AST) | Nghiệp vụ | Loại | Đích trong engine |
|---|---|---|---|---|---|
| `addInventoryItem` | 4426 | `inventory_items` (currentStock) | Tạo NL (tồn khởi tạo) | Danh mục | danh mục; tồn khởi tạo chỉ cho món **không** tem (F2) |
| `fixRecWizApply` | 4883 | `stock_containers` tx.update/update (needsReview, status, unitBase); `stock_transactions` tx.update (qty); `inventory_items` (currentStock); RT transaction | Sửa phiếu nhận | Sửa dòng sổ | `lifecycle.fixReceipt` + `ledger.amend` (sửa qty RECEIVING) |
| `ctnMarkReviewed` | 5029 | `stock_containers` update (needsReview) | Đánh dấu đã xem tem | Chú thích | `containers.annotate` |
| `ctnAdjustCore` | 5605 | `stock_transactions` tx.set (itemId, qty, status, type); `stock_containers` tx.update (unitBase); `inventory_items` (currentStock); RT transaction | Cân lại mã | Ghi số lượng | `units.setBalance` |
| `ctnRestoreAtomicSealed` | 5669 | `stock_containers` update (status) | Trả tem cái rời về seal | Ghi số lượng | `lifecycle.restoreAtomic` |
| `applyStockTransaction` | 6445 | `stock_transactions` tx.set | Sổ kho (bản chép) | Bản chép | `ledger.apply` |
| `logStockAnomaly` | 6514 | `stock_anomalies` set (itemId, qty, status) | Sổ lệch (bản chép) | Bản chép | `anomaly.log` |
| `recomputeTemStock` | 6526 | `inventory_items` (currentStock) | Suy tồn NL (bản chép) | Bản chép | `stock.recompute` |
| `recomputePrepStock` | 6560 | `prep_items` (currentStock, pendingShortage) | Suy tồn BTP (bản chép) | Bản chép | `stock.recompute` |
| `reverseIntoUnits` | 6582 | collection động update; RT transaction | Hoàn (bản chép, lệch R1) | Bản chép | `consume.reverse` |
| `approvePendingLostReportsForItem` | 6656 | `stock_containers` tx.update (status); `stock_transactions` set (itemId, qty, status, type); RT remove | Duyệt báo mất | Ghi số lượng | `lifecycle.approveLost` |
| `applyStockTransfer` | 6841 | `stock_transactions` tx.set; `inventory_items` (locationStock) | Chuyển quầy (0 nơi gọi) | Bản chép | **xoá — code chết** |
| `addPrepItem` | 7077 | `prep_items` (currentStock) | Tạo BTP (tồn khởi tạo) | Danh mục | như trên |
| `wasteAssignSave` | 8468 | collection động update (responsibility) | Gán trách nhiệm hao hụt | Chú thích sổ | `ledger.annotate` (responsibility) |
| `soLechCutover` | 9971 | (qua biến động — xem ghi chú) | Chốt sổ theo tem | Ghi số lượng | `stock.cutover` |
| `_btpAmApplySubstitution` | 10139 | `stock_anomalies` update (status) | BTP âm → dùng bù (**bản thứ hai**, POS có `prepShortageSubmitAnswers`) | Bản chép nghiệp vụ | `prep.shortageResolve` |
| `prepBatchSetQtyCore` | 12748 | `prep_batches` update (_ueRtStale, qtyRemaining, unitBase); `prep_items` (currentStock); RT transaction | Sửa số lô (không kiểm tra ghi đè) | Ghi số lượng | `units.setBalance` |
| `prepBatchRestoreCore` | 12802 | `prep_batches` update (_ueRtStale, qtyRemaining, status, unitBase); `prep_transactions` tx.update (reclassifiedFrom, type); `prep_items` (currentStock); RT set | Khôi phục lô + đổi loại dòng sổ | Sửa dòng sổ | `prep.restoreBatch` + `ledger.amend` |
| `prepBatchExtendExpiryCore` | 12985 | `prep_batches` update | Gia hạn lô | Chú thích | `batches.annotate` |
| `qlReverseStockForOrder` | 14614 | `reversal_unit_claims` tx.set/set (itemId, status); `stock_transactions` tx.set (itemId, qty, status, type); `prep_transactions` tx.set (qty, type) | Xoá bill ở Quản lý (**bản thứ hai**, gồm `hoanVaoTem` lồng bên trong, claim riêng) | Bản chép nghiệp vụ | `consume.reverseOrder` |
| `thangKetDuyetSuKien` | 18579 | `stock_transactions` update (needsReview) | Duyệt sự kiện khi chốt tháng | Chú thích sổ | `ledger.annotate` (needsReview) |
| `submitPrepAdjust` | 23446 | `prep_transactions` tx.set (qty, type); `prep_batches` update (qtyRemaining, status, unitBase); `prep_items` (currentStock); RT transaction/remove | Chỉnh tồn BTP (FIFO theo finishedAt — lệch R2) | Ghi số lượng | `prep.adjustStock` |
| `setLocationStock` | 24229 | `stock_transactions` tx.set (itemId, qty, status, type); `inventory_items` (locationStock) | Sửa tồn quầy | Ghi số lượng | `ledger.setLocationStock` |

### 2.5 Sổ kho bị sửa tại chỗ *(bản 1.0 bỏ sót)*

Sổ kho không chỉ "ghi thêm dòng". Các hàm sau **sửa dòng đã có**:

| Loại sửa | Hàm | Trường | Hướng xử lý |
|---|---|---|---|
| **Số lượng** | `fixRecWizApply` (QL) | `qty` của dòng RECEIVING | `ledger.amend` — chỉ engine, bắt buộc lý do + ghi vết cũ/mới |
| **Số lượng** | `shiftWeighReclassToConsumptionPOS` (POS) | `qty` dòng hao hụt cân cuối ca | `ledger.amend` |
| **Loại dòng** | `prepBatchRestoreCore` (QL) | `type`, `reclassifiedFrom` | `ledger.amend` |
| Chú thích | `wasteAssignSave` (QL) | `responsibility`, `responsibilityHistory` | `ledger.annotate` |
| Chú thích | `thangKetDuyetSuKien` (QL) | `needsReview`, `reviewedAt/By` | `ledger.annotate` |
| Chú thích | `_voidBackfillConsumptionPOS` (POS) | `voided`, `voidedAt`, `voidedReason` | `ledger.annotate` |
| Chú thích | `_btpAmApplySubstitution` (QL) | `substitutionQty`, `substitutionReconId`, `substitutionFor` | nằm trong `prep.shortageResolve` |

### 2.6 Ghi sổ không idempotent (`.add()` — ID ngẫu nhiên) *(bản 1.0 bỏ sót)*

| Hàm | Collection | Hậu quả khi gọi lại / thử lại |
|---|---|---|
| `_applyFifoNotEmpty` (POS 4725) | `stock_transactions` | Ghi đôi dòng điều chỉnh |
| `_applyPrepYieldEdit` (POS 14208) | `prep_transactions` | Ghi đôi dòng điều chỉnh sản lượng |
| `applyBackfillConsumptionNoStockEffect` (POS 22990, 23003) | `stock_transactions`, `prep_transactions` | Ghi đôi dòng bill bổ sung |

→ Sửa ở **E4.0** (trước các đợt khác): đổi sang `txId` cố định theo nghiệp vụ.

### 2.7 Thành phần ngoài hai file *(bản 1.0 bỏ sót)*

| Thành phần | Bằng chứng trong code | Phụ thuộc vào | Ảnh hưởng |
|---|---|---|---|
| **Webhook ngân hàng — Cloud Run cùng project** (O10) | POS chỉ **đọc** + xoá `bank_confirmations/{orderId}`; không file nào ghi | Định dạng nội dung CK `TTHD GG{ddMMHHmmss}` → khoá `orderId`; **phục vụ chung cả ba thương hiệu** | Đổi `orderId` (M3) = một lần deploy Cloud Run: nhận thêm dạng có mã cửa hàng, **giữ nguyên** dạng của XOFA/The Cafe 33 |
| **Kiosk / màn hình phụ — đã loại khỏi Gieo Gieo** (O11) | Code vẫn chạy: `syncDisplay` (31 nơi gọi) → `_sdFlush`/`resetDisplay`/`toggleTogo`/`resetTogoToggle` ghi `session_display_gieogieo`; `kcSaveAndApply` ghi **`kiosk_config` — của XOFA** (O12) | Không còn bên đọc nào của Gieo Gieo | Ghi RT thừa mỗi lần giỏ hàng đổi; **bấm Lưu ở màn cấu hình kiosk trong POS Gieo Gieo sẽ ghi đè kiosk của XOFA** → K0 (gấp) |
| **Không có service worker** (O1) | POS vẫn gọi `register('sw_gieogieo.js')` nhưng file **không tồn tại** → lỗi 404 im lặng mỗi lần mở app; `showSwUpdateBanner` không bao giờ chạy | Cache HTTP của WebView trong APK | Engine tải cùng cách với HTML (6.2); code đăng ký SW dọn ở F5 |
| **XOFA & The Cafe 33** (O9 — đã xác nhận) | project `the-cafe-33`; `customers`/`rewards`/`bank_confirmations` không hậu tố; tài khoản `cafe33@…` | Tài khoản chung, collection chung, webhook chung, **hạn mức & chi phí Firebase chung** | D18; 7.13 |
| **Việc lưu trữ/dọn dẹp** | POS `runArchiveIfNeeded`, QL `ddArchiveDay` (RT `orders_gieogieo/{tháng}/{ngày}` → Firestore `orders_gieogieo_archive/{tháng}_{ngày}_{năm}`); QL `ddDeleteBankOld` (xoá `bank_confirmations` > 7 ngày); QL `_ddShallow` gọi REST RTDB `?shallow=true` | Đường dẫn RT đơn hàng, khoá lưu trữ theo ngày | Phải theo cửa hàng (M2); dọn CK là việc **toàn chuỗi** |

### 2.8 Phụ thuộc của lõi vào phần còn lại (phải cắt khi tách)

| Loại | Hiện tại | Trong engine |
|---|---|---|
| Firebase | `fstore`, `db` toàn cục | Truyền qua `init()` |
| Hằng số | `STOCK_CONTAINERS_COLL`, `STOCK_ANOMALY_COLL`, `PREP_RECON_LOCK_COLL`, `REVERSAL_CLAIM_STALE_MS` (QL chép tay thành `STALE_MS`) | Lớp truy cập dữ liệu của engine — **một** hằng |
| Tiện ích | `round2`, `fmtPrepQty`, `posDateKey` | Bản riêng; ngày qua config |
| **Giờ & ngẫu nhiên** | `Date.now()`, `new Date()`, `Math.random` rải trong lõi | `init({ now, random })` — bắt buộc để test được (5.1) |
| Danh mục | `KHO_ITEMS_CACHE`, `isTemTrackedNL`, `isAtomicUnitItem` | `init({ getItem, getPrep })` |
| Refill | `getPrimaryRefillRulePOS`, `getBiggestPackagingUnitPOS` | `init({ getRefillRule })` |
| Giao diện | `toast`, `toastAutoReport`, `refreshFifoAlert`, `_refreshStockUseListIfActive`, `closeStockScanSheet`, `STOCK_OPEN_LIST` | Hook (3.6) |
| Ngữ cảnh bán | `_backfillMode` | Tham số tường minh |

### 2.9 Dữ liệu thuộc engine

| Loại | Tên |
|---|---|
| RT | `active_units_gieogieo/**` |
| Firestore — mã/lô | `stock_containers_gieogieo`, `prep_batches_gieogieo` |
| Firestore — sổ & phụ trợ | `stock_transactions_gieogieo`, `prep_transactions_gieogieo`, `stock_anomalies_gieogieo`, `reversal_unit_claims_gieogieo`, `prep_ingredient_locks_gieogieo`, `order_stock_traces_gieogieo` |
| Trường trạng thái trên doc món | `currentStock`, `locationStock`, `unrefilledConsumption`, `refillUncertain`, `pendingShortage`, `untrackedPendingDelta`, `_ueLastRecomputeStart` |

---

## 3. Thiết kế `unit_engine.js`

### 3.1 Vị trí và cách nạp

- File `unit_engine.v{N}.js` cùng thư mục host với hai HTML.
- `<script src="unit_engine.v1.js"></script>` **trước** script chính. Plain script, không build step, xuất `window.UnitEngine`.
- Tên file mang phiên bản; HTML ghi **cố định** tên file → HTML và engine không thể lệch phiên bản; giữ bản cũ trên host ≥ 7 ngày.
- Tải **cùng cách với HTML** (không có service worker — 6.2). Tên file có phiên bản nên có thể đặt cache HTTP dài hạn nếu host cho phép.

### 3.2 Khởi tạo

```js
UnitEngine.init({
  app: 'pos',                         // 'pos' | 'quanly'
  fstore, db,
  storeId: 'gg01',                    // E1–E5 hằng số
  businessDate: () => posDateKey(),
  now:    () => Date.now(),           // test truyền đồng hồ giả; E6 đổi sang giờ máy chủ (C1)
  random: () => Math.random(),        // test truyền nguồn cố định (sinh mã)
  getItem: id => ..., getPrep: id => ..., getRefillRule: itemId => ...,
  hooks: { notify, report, fifoChanged, stockChanged, openUnitsChanged }
});
UnitEngine.VERSION   // '1.0.0'
```

- **Không có `ready` chặn.** `init()` đồng bộ, dùng được ngay (D17).

### 3.3 Lớp truy cập dữ liệu bên trong engine (giữ `_gieogieo` — D16)

```js
const P = {
  units:      (itemId)       => `active_units_gieogieo/${itemId}`,              // M2: `active_units_gieogieo/${storeId}/${itemId}`
  unit:       (itemId, id)   => `active_units_gieogieo/${itemId}/${id}`,
  containers: () => 'stock_containers_gieogieo',
  batches:    () => 'prep_batches_gieogieo',
  stockTx:    () => 'stock_transactions_gieogieo',
  prepTx:     () => 'prep_transactions_gieogieo',
  anomalies:  () => 'stock_anomalies_gieogieo',
  claims:     () => 'reversal_unit_claims_gieogieo',
  locks:      () => 'prep_ingredient_locks_gieogieo',
  traces:     () => 'order_stock_traces_gieogieo',
  itemState:  (itemId, kind) => kind === 'prep' ? ['prep_items_gieogieo', itemId]
                                                : ['inventory_items_gieogieo', itemId], // M2a: store_item_state_gieogieo/{storeId}_{itemId}
  key:        (...p) => p.join('_').replace(/[^\w\-]/g, '_').slice(0, 180)          // M2: tiền tố storeId
};
```

### 3.4 API công khai

Quy ước: nhận `ctx = { staff:{name,id}, opId?, txId?, reason?, note?, businessDate? }`; **idempotent** theo `txId`/`opId` (trừ ngoại lệ 2.6 đang chờ sửa); trả kết quả, không toast; lỗi ném `UnitEngineError{code,message,meta}`.

**A. Đọc** — `units.listOpen`, `units.watchFifo`, `codes.find` (cả tra theo id khi mã đã cấp lại), `containers.listOpen`, `stock.summary`.

**B. Tiêu hao & hoàn**

| API | Thay cho |
|---|---|
| `consume.allocate` | `unitEngineAllocateConsumption` |
| `consume.reverse` | `unitEngineReverseAllocations`, `_ueClaimedReverseAllocations`, `reverseIntoUnits` (QL) |
| `consume.sale(lines, orderId, ctx)` | phần kho của `applySalesConsumptionPOS`, `applyAddonConsumptionPOS`, `applyPrepConsumptionPOS` — **app** vẫn quy công thức ra `lines` |
| `consume.backfillNoStock(lines, orderId, ctx)` | `applyBackfillConsumptionNoStockEffect` (sửa `.add`) |
| `consume.reverseOrder(orderId, ctx)` | `reverseSalesConsumptionPOS` + 2 hàm con, `_voidBackfillConsumptionPOS`, **`qlReverseStockForOrder`** (QL) |

**C. Vòng đời mã** — `lifecycle.createFromReceipt`, `open`, `finish`, `finishAtomic`, `reverseFinishAtomic`, `restoreAtomic`, `requestDiscard`, `approveDiscard`, `reportLost`, `approveLost`, `markFound`, `fixReceipt`; `codes.generate`, `codes.reprint`.

**D. Chỉnh số dư tuyệt đối** — `units.setBalance(itemId, unitId, value, {kind, expected, reason, opId})` (thay `_applyFifoNotEmpty`, `prepReconSetUnit`, `ctnAdjustCore`, `prepBatchSetQtyCore`); `units.reconcileItem(...)` (cân cuối ca + tự bù). `expected` = `{value}` hoặc `{sig}`; **không có ghi đè không điều kiện**.

**E. BTP** — `prep.startBatch`, `finishBatch`, `cancelBatch`, `editYield`, `discardBatch`, `restoreBatch`, `waste`, `countCommit`, `shortageCollect`, `shortageClear`, **`shortageResolve`** (hợp nhất POS `prepShortageSubmitAnswers` + QL `_btpAmApplySubstitution`), `adjustStock`, `reconAcquire/Release/AssertFree/Attach/OpenNext/Refresh/Commit`.

**F. Sổ kho, chú thích, Sổ lệch**

| API | Thay cho | Ai được gọi |
|---|---|---|
| `ledger.apply` | `applyStockTransactionPOS`, `applyStockTransaction` (QL) | engine nội bộ + app |
| `ledger.transfer` | `applyStockTransferPOS` | app |
| `ledger.setLocationStock` | `setLocationStockFromCountPOS`, `setLocationStock` (QL) | app |
| **`ledger.amend(txId, patch, {reason})`** | sửa **số lượng/loại** tại chỗ: `fixRecWizApply`, `shiftWeighReclassToConsumptionPOS`, `prepBatchRestoreCore` | engine (qua API nghiệp vụ) — luôn lưu `amendments[]` {trước, sau, lý do, ai, lúc} |
| **`ledger.annotate(txId, fields)`** | chú thích tại chỗ: `wasteAssignSave`, `thangKetDuyetSuKien`, `_voidBackfillConsumptionPOS` | mọi cụm — **chỉ** các trường trong danh sách cho phép (3.9) |
| `containers.annotate` / `batches.annotate` | `markStockLabelsPrinted`, `markOpenLabelStuck`, `confirmOpenLabelStuck`, `ctnMarkReviewed`, `prepBatchExtendExpiryCore` | mọi cụm — trường cho phép |
| `anomaly.log` | `logStockAnomalyPOS`, `logStockAnomaly` (QL) | engine + app |
| `stock.recompute`, `stock.cutover` | 3 bản suy tồn, `soLechCutover` | engine + Quản lý |

**G. Để dành M5** — `transfer.createOut/receive/cancel`, trạng thái `in_transit`.

### 3.5 Quy ước dùng chung

| Chủ đề | Quy ước |
|---|---|
| Khoá idempotent | `txId` theo mẫu đang có (`sales_…`, `reversal_…_ing_…`, `sw_{ngày}_{món}_{seed}_{unitId}`…). Mọi `.add()` trên dữ liệu engine bị cấm |
| Thời gian / ngẫu nhiên | Chỉ qua `now()` / `random()` của config |
| RT transaction | Đọc `once()` trước, callback dùng `cur ?? snapshot` (mẫu `prepReconSetUnit`) |
| Ghi tuyệt đối | Chỉ `units.setBalance` / `reconcileItem`, có `expected` |
| Dấu mốc node | Hợp nhất `shiftWeigh.op` / `lastPrepReconOp` / `lastMgrAdjustOp` → `lastAbsWrite{op,at,by}`; vẫn **đọc** được 3 trường cũ trong giai đoạn chuyển |
| Mã lỗi | `PREP_LOCKED`, `UNIT_GONE`, `UNITS_CHANGED`, `CONCURRENT_WRITE`, `PARTIAL_APPLY`, `LEDGER_UNKNOWN`, `ITEM_NOT_FOUND`, `INVALID_QTY`, `RECEIPT_NOT_WHOLE_UNITS`, `TOO_MANY_UNITS`, `DUPLICATE_CODE`, `FIELD_NOT_ANNOTATABLE` |

### 3.6 Hook giao diện

| Hook | POS | Quản lý |
|---|---|---|
| `notify` | `toast` | `toast` |
| `report` | `toastAutoReport` | `showError` |
| `fifoChanged` | vẽ chấm FIFO | bỏ qua |
| `stockChanged` | làm mới badge | `memoDropItems/Preps` |
| `openUnitsChanged` | `_refreshStockUseListIfActive` | vẽ lại danh sách tem |

### 3.7 Quy tắc hợp nhất

**Theo POS (D3) — Quản lý đổi hành vi**

| # | Quy tắc | Ảnh hưởng |
|---|---|---|
| R1 | Hoàn khi tem gốc rời RT → tem mở **cũ nhất** | `reverseIntoUnits`, `qlReverseStockForOrder` |
| R2 | FIFO theo `openedAt` ở mọi nơi | `submitPrepAdjust` bỏ `finishedAt` |
| R3 | Suy tồn có mốc chống ghi đè | Quản lý bắt đầu dùng mốc (cần C1 để không bị lệch giờ) |
| R4 | Ghi tuyệt đối luôn có kiểm tra | `prepBatchSetQtyCore`, `submitPrepAdjust` |
| R6 | Món có tem: không có tồn ngoài mã | Nhập nhanh đã chặn sẵn; thêm chặn tồn khởi tạo (F2) |

**Thay đổi hành vi có chủ đích (không phải "theo POS")**

| # | Thay đổi | Lý do | Triển khai |
|---|---|---|---|
| C1 | Mốc B9 dùng **giờ máy chủ** (`Date.now() + .info/serverTimeOffset`) thay giờ máy | Để Quản lý dùng được R3; chống máy chạy giờ sai chặn lượt suy tồn của máy khác | Ở **E6**, không phải E1. Offset mặc định 0 nếu chưa lấy được (không chờ). Chuyển giao: xem 6.5 |

**Sửa lỗi cần anh duyệt (POS không có hành vi tương ứng)**

| # | Sửa | Hiện trạng |
|---|---|---|
| F1 | Khôi phục lô **giữ `openedAt` gốc** | `prepBatchRestoreCore` đặt `openedAt = Date.now()` → lô cũ nhảy xuống cuối FIFO |
| F2 | Chặn **tồn khởi tạo** khi tạo món có tem | `addInventoryItem`/`submitInventoryItem` ghi `currentStock` ngoài mã → bị suy tồn xoá |
| F3 | Ghi sổ bằng `txId` cố định thay `.add()` | 2.6 |
| **F4** | **Gỡ toàn bộ mã giảm giá / voucher khỏi POS Gieo Gieo** (Gieo Gieo không dùng mã nào — O17) | Code hiện còn: ô nhập mã `applyDiscountCode` (tra **toàn bộ** `rewards`, không kiểm thương hiệu); danh sách quà `myGifts` của khách trong `renderCustomerInfo` (quà hệ khác, dùng được ở Gieo Gieo); `findReward`, `applyReward`, `applyVoucher`; `_finalizeDiscountAfterPay` **ghi `rewards.usedCount`** và đánh dấu quà `myGifts` đã dùng; listener `loadDiscountCodes` nạp toàn bộ `rewards`. **Giữ nguyên**: khuyến mãi cấu hình ở Quản lý (`togoSettings`, chiến dịch) và **ly miễn phí theo tem** (`consumeFreeToGoDrink` — đang dùng chung biến `_giftVoucherKey`, phải tách ra trước khi gỡ). Bill cũ có `_appliedDiscountId` vẫn hiển thị đúng. Độc lập với engine, làm cùng K0 |
| F5 | **Dọn nhánh "Tại quán"** (Gieo Gieo chỉ bán to-go — O18). Ưu tiên **thấp**: code chết, không chạy được | Nút chuyển đã ẩn và `isToGo` luôn `true`, nhưng code vẫn giữ: nhánh tích Point + x2 ví trong `loyaltyProcessAfterPay`, `loyaltyAddPoints` (và mục `points` trong hàng đợi `loyaltyFlushPending`), `toggleTogo`, chiến dịch `scope:'dinein'`, lọc menu theo chế độ. Gộp luôn tàn dư Ví: tham số `isWallet`, nhân đôi Point "x2 Ví", ghi chú ẩn đầu file còn ghi "Ví chỉ ẩn tab". Đồng giá: chỉ còn chú thích cũ (checkout, tách bill) và ghi chú ẩn "Ví và Đồng giá chỉ ẩn tab / cách phục hồi" — sửa cho đúng hiện trạng, **không có logic nào để gỡ**. Service worker: gỡ đoạn `navigator.serviceWorker.register('sw_gieogieo.js')` và `showSwUpdateBanner` (file SW không tồn tại). **Không xoá** CSS `.wal-*` (đang được màn khác dùng rộng rãi). Cách làm an toàn: cố định `isToGo = true` thành hằng, gỡ dần các nhánh `!isToGo`; **giữ** đọc bill cũ và hàng đợi loyalty cũ (nếu còn mục `points` chưa chạy, cho chạy nốt rồi mới gỡ) |

### 3.8 Ngoài phạm vi engine

Quy đổi công thức (`computeConsumptionForOrder`), quét mã, cân, luồng ca, refill UI, báo cáo, loyalty, chuyển khoản.

### 3.9 Ma trận quyền ghi (sau E5)

| Dữ liệu | Engine | Cụm khác |
|---|---|---|
| RT `active_units_gieogieo/**` | ✅ | ❌ |
| Tem/lô — **trường số lượng/trạng thái**: `unitBase`, `qtyRemaining`, `status`, `openedAt`, `finishedAt`, `baseQty`, `itemId`, `code`, `_ueRtStale` | ✅ | ❌ |
| Tem/lô — **trường chú thích** (danh sách cho phép, lấy từ code — chốt lại ở E0): `labelPrinted`, `labelPrintedAt`, `openLabelPrinted`, `openLabelPrintedAt`, `needsReview`, `reviewedAt`, `reviewedBy`, `expiresAt` (gia hạn lô), `note` | ✅ | ✅ qua `containers/batches.annotate` |
| Dòng sổ — **trường số lượng**: `type`, `qty`, `itemId`, `fifoAllocations`, `unitAllocations`, `resultingStock` | ✅ (`ledger.apply`/`amend`) | ❌ |
| Dòng sổ — **trường chú thích**: `responsibility`, `responsibilityHistory`, `needsReview`, `reviewedAt`, `reviewedBy`, `voided`, `voidedAt`, `voidedReason`, `note` | ✅ | ✅ qua `ledger.annotate` |
| `stock_anomalies` — `status` (giải trình/đóng) | ✅ | ✅ qua `anomaly.resolve` |
| `reversal_unit_claims`, `prep_ingredient_locks`, `order_stock_traces` | ✅ | ❌ |
| Trường trạng thái tồn trên doc món | ✅ | ❌ |
| Danh mục món | ❌ | ✅ (Quản lý) |

> Danh sách trường chú thích chốt cuối cùng ở E0 từ kết quả AST (2.4 cột "Loại = Chú thích").

### 3.10 Nguyên tắc không chặn bán hàng (D17)

1. `init()` đồng bộ; không promise nào của engine là điều kiện để bán.
2. Giờ máy chủ: offset mặc định 0, cập nhật khi lấy được; không chờ.
3. Không có "chặn thao tác kho khi lệch phiên bản" — HTML ghi cố định tên file engine nên không lệch được. Chỉ kiểm tra **"engine đã nạp chưa"**; nếu chưa (lỗi tải) → banner đỏ + tự tải lại trang. Rủi ro này **cùng mức** với rủi ro HTML hoặc SDK Firebase (tải từ gstatic) không tải được — engine không làm hồ sơ offline tệ hơn, miễn là được cache giống HTML (6.2).
4. Cơ chế buộc cập nhật từ xa (6.4) chỉ dùng trong **cửa sổ bảo trì có kế hoạch** (M2), công bố trước, ngoài giờ bán.

---

## 4. Lộ trình tách engine E0 → E6

Mỗi bước = một lần deploy, có tiêu chí xong và đường quay lui.

### K0 — Dọn tính năng kiosk / màn hình phụ (**gấp** — làm trước mọi bước khác)

`kiosk_config` là của XOFA (O12): màn cấu hình kiosk còn sót trong POS Gieo Gieo ghi đè thẳng lên cấu hình kiosk đang chạy của XOFA. Trong lúc chờ K0, **không ai được bấm Lưu ở màn đó**.

Theo nguyên tắc phản biện trước khi sửa:
1. Kiểm màn cấu hình kiosk có còn đường vào trên giao diện POS Gieo Gieo không (nút/menu nào mở được) — để biết rủi ro đang mở hay chỉ còn code chết.
2. Gỡ khỏi `posgieo.html`: `syncDisplay` và 31 nơi gọi, `_sdFlush`, `resetDisplay`, phần ghi RT trong `toggleTogo`/`resetTogoToggle`, màn cấu hình kiosk (`kcSaveAndApply` và các hàm `kc*`), biến/listener liên quan.
3. Xoá dữ liệu `session_display_gieogieo` (của riêng Gieo Gieo); **không** đụng dữ liệu `kiosk_config` (của XOFA).
4. Chạy lại `ast_inventory.js`: không còn hàm nào ghi `session_display_gieogieo` / `kiosk_config`.

**Xong khi**: bán hàng, to-go, tính tiền, tách bill chạy bình thường (checklist 5.3 mục 1, 12); không còn ghi RT khi giỏ hàng đổi.

### F4 — Gỡ mã giảm giá / voucher (**gấp**, làm cùng K0)

Chi tiết hiện trạng ở bảng F (3.7). Các bước, theo nguyên tắc phản biện trước khi sửa:
1. **Tách luồng ly miễn phí theo tem** (`consumeFreeToGoDrink`) khỏi biến dùng chung `_giftVoucherKey` — làm trước, test riêng: đủ 6 tem → ly miễn phí → thanh toán → trừ `free_drink_available` đúng một lần.
2. Gỡ ô nhập mã (`applyDiscountCode`, `_dcStatus`), danh sách quà `myGifts` trong `renderCustomerInfo`, `findReward`, `applyReward`, `applyVoucher`, `removeGiftVoucher`, nhánh ghi `rewards.usedCount` và đánh dấu `myGifts` trong `_finalizeDiscountAfterPay`, listener `loadDiscountCodes`.
3. **Giữ**: khuyến mãi cấu hình ở Quản lý (`togoSettings`, chiến dịch), ly miễn phí theo tem, hiển thị/in lại bill cũ có `_appliedDiscountId` / `voucherUsed`.
4. Chạy lại `ast_inventory.js`: POS không còn đọc/ghi `rewards`.

**Xong khi**: bán thường, tặng quà to-go, giảm giá to-go, tặng topping, chiến dịch, ly miễn phí theo tem, tách bill đều đúng; không còn ô nhập mã; mở lại bill cũ có mã vẫn hiện đúng.

### E0 — Kiểm kê, chốt, dựng nền

1. **Đưa script AST vào dự án** (`tools/ast_inventory.js` — bản dùng để lập tài liệu này) → chạy lại, chốt bảng 2.4 và danh sách trường chú thích (3.9).
2. **Kiểm kê client ngoài** (2.7): đọc mã nguồn **webhook Cloud Run** khi có (O13) — bộ đọc nội dung CK, tiền tố của từng thương hiệu, ghi RT bằng Admin SDK hay SDK thường. Rules hiện tại đã biết (O14: đăng nhập = toàn quyền). **Không** kiểm kê app XOFA / The Cafe 33 (O16) — chỉ dùng danh sách tài nguyên dùng chung mà Gieo Gieo chạm tới (7.13).
3. Anh duyệt **F1–F3**.
4. **Đo mốc offline hiện tại** trên máy POS thật (APK): (a) đang mở app → tắt mạng → bán được không; (b) tắt mạng → mở lại app → có lên màn bán không. Ghi lại để E1 so sánh.
5. Dựng **Firebase project staging** — dữ liệu Gieo Gieo + bản sao các tài nguyên dùng chung mà Gieo Gieo chạm tới (để thử luồng Gieo Gieo đầy đủ, không cần app hai thương hiệu kia).
6. Thư mục `tests/`: Firebase giả lập dùng chung (RT `once/on/transaction/set/update/remove` có lượt `null` đầu tiên; Firestore `get/set(merge)/update(dot-path, FieldValue.delete)/where/runTransaction`), đồng hồ giả, nguồn ngẫu nhiên cố định. Gom các test đã viết trong phiên.
7. **Test ảnh chụp hành vi**: chạy từng hàm lõi POS (qua lớp bọc thay `Date.now`/`Math.random` bằng bản giả) trên dữ liệu mẫu → lưu trạng thái RT + Firestore đã **chuẩn hoá** (5.1).

**Xong khi**: bảng 2.4 được duyệt; client ngoài được liệt kê đủ; test ảnh chụp chạy xanh trên code hiện tại.

### E1 — Tách lõi POS ra `unit_engine.v1.js`

1. Chuyển các hàm ở 2.2 (trừ phần E2) vào engine.
2. **Thay đổi duy nhất được phép trong thân hàm**: `Date.now()`/`new Date()`/`Math.random()` → `cfg.now()`/`cfg.random()`; biến toàn cục → config; gọi giao diện → hook.
3. POS giữ **tên cũ làm lớp chuyển tiếp** (`const unitEngineAllocateConsumption = (...a) => UnitEngine.consume.allocate(...a)`).
4. `UnitEngine.init({...})` ngay sau khi Firebase khởi tạo.
5. Thêm `headers` vào `firebase.json` (6.2): engine `immutable`, HTML `no-cache`; thư mục deploy giữ cả bản engine trước (6.1). Thử lại hai kịch bản offline của E0: kết quả **không được kém hơn mốc E0**.

**Xong khi**: test ảnh chụp + test cũ xanh; checklist 5.3 đạt trên máy thật; thử khởi động **offline** vẫn bán được.
**Quay lui**: trỏ HTML về bản trước.

### E2 — Sổ kho, sinh mã, Sổ lệch

Chuyển `applyStockTransactionPOS`, `applyStockTransferPOS`, `setLocationStockFromCountPOS`, `logStockAnomalyPOS`, `createContainersForReceipt`, `findContainerByCode`, `capMaKhoDuyNhat`, `gen*Code`, `loadOpenContainers`, phần dữ liệu của `refreshFifoAlert`. Thêm `ledger.annotate`, `containers/batches.annotate`, `ledger.amend` (chưa ai gọi).

### E3 — Quản lý dùng engine + gộp nghiệp vụ trùng

1. Quản lý nạp engine, `init({app:'quanly'})`.
2. Bỏ bản chép (2.3 bảng 1) → gọi engine; xoá `applyStockTransfer` (chết).
3. **Gộp nghiệp vụ trùng** (2.3 bảng 2): `qlReverseStockForOrder` → `consume.reverseOrder`; `_btpAmApplySubstitution` → `prep.shortageResolve`.
4. Áp R1–R4. Ghi chú phát hành cho Quản lý.
5. R3 ở bước này **chưa bật mốc cho Quản lý** (giữ hành vi "luôn ghi, không đụng mốc" như hiện tại) cho tới khi có C1 ở E6.

**Xong khi**: test xoá bill (POS và Quản lý, tem gốc còn/đã đóng, bấm hai lần), BTP âm dùng bù (POS và Quản lý, không chuyển loại hai lần), chỉnh tồn, duyệt báo mất, sửa phiếu nhận đều xanh.

### E4 — Gom các đường ghi thẳng (2.4)

| Đợt | Nội dung |
|---|---|
| **E4.0** | F3: bỏ 3 chỗ `.add()` trên sổ (2.6) |
| E4.1 | Chú thích: in tem, nhãn mở, đã xem, gia hạn lô, trách nhiệm hao hụt, duyệt chốt tháng → `*.annotate` |
| E4.2 | `codes.reprint`, `lifecycle.markFound`, `_applyFifoNotEmpty` → `setBalance` |
| E4.3 | Tem cái rời (3 hàm) + báo huỷ + duyệt báo mất |
| E4.4 | `ctnAdjustCore`, `prepReconSetUnit`, `prepBatchSetQtyCore` → `units.setBalance`; hợp nhất dấu mốc |
| E4.5 | Cân cuối ca (3 hàm) → `units.reconcileItem`; `shiftWeighReclassToConsumptionPOS` → `ledger.amend` |
| E4.6 | BTP: start/finish/cancel/editYield/discard/restore, `prepRecon*` còn lại |
| E4.7 | BTP: kiểm kê cuối ca, âm chờ đối chiếu, `submitPrepAdjust` |
| E4.8 | Bán / món thêm / bill bổ sung → `consume.sale`, `consume.backfillNoStock` |
| E4.9 | `fixRecWizApply` (`ledger.amend`), `soLechCutover`, `setLocationStock`, F1, F2 |

### E5 — Rào ranh giới & dọn dẹp

1. `tools/check_boundaries.js` **dựa trên AST** (không regex): báo lỗi khi code ngoài `unit_engine*.js` ghi collection/đường dẫn ở 2.9, hoặc ghi trường số lượng ở 3.9, hoặc gọi `.add()` trên sổ.
2. Bỏ lớp chuyển tiếp tên cũ; xoá code chết; hợp nhất dấu mốc về `lastAbsWrite`.
3. **F5** (bảng F ở 3.7): gỡ nhánh "Tại quán" / Point / Ví, đoạn đăng ký service worker, sửa chú thích Đồng giá và viết lại ghi chú ẩn đầu `posgieo.html` cho đúng hiện trạng. **Không xoá** CSS `.wal-*`. Nếu hàng đợi loyalty còn mục `points` chưa chạy thì để chạy nốt trước khi gỡ.
4. `UNIT_ENGINE.md` — tài liệu API.

### E6 — Engine biết `storeId` + giờ máy chủ

1. Khối `P` nhận `storeId` (vẫn `gg01`), giữ hậu tố `_gieogieo`.
2. Mọi bản ghi **mới** engine tạo mang `storeId`.
3. **C1**: `now()` = giờ máy chủ; triển khai theo 6.5; sau đó bật R3 cho Quản lý.

---

## 5. Kiểm thử

### 5.1 Bộ test tự động

**Test ảnh chụp hành vi (chuẩn hoá, không so từng byte)**
- Chạy với đồng hồ giả tăng đều và nguồn ngẫu nhiên cố định.
- Trước khi so: thay mọi chuỗi ISO/timestamp bằng `<T#>` theo thứ tự xuất hiện, mã tem/lô bằng `<CODE#>`, push id / id ngẫu nhiên bằng `<ID#>`; sắp xếp khoá object.
- So cấu trúc + mọi giá trị số + thứ tự thao tác ghi.

**Kịch bản bắt buộc**

| Nhóm | Kịch bản |
|---|---|
| FIFO | cũ trước; qua nhiều tem; cạn hết → nợ tem mới nhất; bỏ qua `discardPending`/`__prepLock` |
| Mở tem | hấp thụ nợ nhiều tem; nợ > dung tích; BTP không hấp thụ; mở trùng |
| Báo hết | dương → WASTE; âm → `finishedDebt`; tem cái rời âm → Sổ lệch |
| Hoàn | về đúng tem; tem gốc rời RT → cũ nhất; không có tem mở; claim chống đúp; ledger không đọc được → fail-closed; **xoá bill ở POS rồi ở Quản lý cùng bill** |
| Suy tồn | sealed + open; sealed→open giữa hai lượt đọc; orphan; `_ueRtStale`; BTP `pendingShortage`; mốc chặn lượt cũ; **hai máy lệch giờ** (sau C1) |
| Khoá mẻ | các lượt ghi bị chặn; khoá mồ côi thu hồi |
| Ghi tuyệt đối | `expected.value` sai; `expected.sig` đổi; cùng `opId` gọi lại |
| Cân cuối ca | các kịch bản đã có (nợ + bán xen, chạy lại, tự bù, lệch lớn, ghi đè đồng thời, tem không trên tay, khoá mẻ, chuyển loại) |
| Sổ | `amend` lưu vết; `annotate` từ chối trường số lượng; **không còn `.add()`**; bill bổ sung gọi hai lần |
| Nhận hàng | phần lẻ; > 60 tem; chưa khai quy cách; batch; mã duy nhất; sửa phiếu nhận |
| BTP | bắt đầu/xong/huỷ mẻ; sửa sản lượng (gọi hai lần); huỷ lô; kiểm kê cuối ca; âm → dùng bù **từ POS và từ Quản lý**; chỉnh tồn theo `openedAt`; khôi phục lô (F1) |
| Refill | WASTE thường / `measured`; ADJUSTMENT `measured` |
| Không chặn bán | khởi động không mạng; engine nạp chậm; giờ máy chủ chưa có |

### 5.2 Test ranh giới

`tools/check_boundaries.js` (AST) xanh trước mỗi deploy từ E5.

### 5.3 Checklist thử tay trên máy thật (mỗi lần deploy E1–E4)

1. Bán 1 bill (NL tem + BTP + topping + bao bì) → tồn, sổ, trace đúng.
2. Xoá bill đó **ở POS**; bán bill khác rồi xoá **ở Quản lý**.
3. Mở tem mới khi tem cũ đang âm.
4. Báo hết tem còn dư / đang âm.
5. Nấu mẻ: cân NL, khoá, chốt; huỷ mẻ; sửa sản lượng.
6. Hao hụt đồ uống / BTP; gán trách nhiệm ở Quản lý.
7. Nhận hàng đủ / thiếu / phần lẻ (bị chặn); sửa phiếu nhận ở Quản lý.
8. Kiểm kê kho; báo mất → duyệt.
9. Kết ca: kiểm kê BTP, cân NL theo mã, BTP âm → dùng bù.
10. Quản lý: cân lại mã, sửa số lô, chỉnh tồn BTP, khôi phục lô, chốt tháng.
11. **Mất mạng khi app đang mở** → vẫn bán được; bật mạng → không mất/không đôi. **Tắt mạng rồi mở lại app** → kết quả giống mốc đo ở E0 (không được kém hơn).
12. Bill bổ sung sau kết ca → xoá bill đó.

---

## 6. Triển khai, phiên bản, quay lui

### 6.1 Quy trình deploy (Termux → Firebase Hosting, cả thư mục)

Cách anh đang làm: sửa file trong thư mục dự án trên điện thoại → `firebase deploy --only hosting` trong Termux → Hosting thay **toàn bộ site** bằng nội dung thư mục.

Hệ quả và quy tắc:
1. **Thư mục trên máy anh là nguồn gốc duy nhất** của site. File nào không có trong thư mục thì biến mất khỏi host sau lần deploy đó — kể cả file của XOFA / The Cafe 33 nếu chung site (O20).
2. Thư mục luôn chứa: hai HTML + `unit_engine.v{N}.js` + `unit_engine.v{N-1}.js` (giữ ≥ 7 ngày) + `firebase.json` có `headers` (6.2).
3. Một lần deploy đưa engine mới và HTML trỏ tới nó lên **cùng lúc** — không có khoảng HTML mới trỏ tới engine chưa lên.
4. Trước mỗi lần deploy chạy **kiểm tra trước deploy** (6.7). Không chạy được thì không deploy.
5. **Sao lưu thư mục** (vd nén thành `backup_{ngày}.zip` ra bộ nhớ ngoài hoặc Google Drive) trước mỗi lần deploy có đổi engine — điện thoại mất / hỏng là mất nguồn của cả ba web app.

### 6.2 Cache và khả năng chạy offline (Firebase Hosting, không có service worker)

- Hệ thống **không có PWA / service worker** (O1). HTML, SDK Firebase (gstatic) và engine đều được WebView trong APK tải và cache theo HTTP.
- **Mặc định Firebase Hosting** trả file tĩnh với `Cache-Control: max-age=3600` → sau khi deploy, máy có thể tiếp tục chạy **HTML cũ tới ~1 giờ**. Đặt lại trong `firebase.json`:
  ```json
  {
    "hosting": {
      "headers": [
        { "source": "/unit_engine.v*.js",
          "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
        { "source": "/@(posgieo|quanlygieo).html",
          "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }
      ]
    }
  }
  ```
  - Engine: cache 1 năm, an toàn vì đổi bản = đổi tên file.
  - HTML: `no-cache` = mỗi lần mở máy hỏi lại host (trả 304 rất nhẹ nếu không đổi) → máy nhận bản mới ngay lần mở kế tiếp. Khi **mất mạng**, WebView vẫn có thể dùng bản đã lưu (tuỳ WebView — đo ở E0).
  - Chỉ khai `source` cho đúng file Gieo Gieo — **không** đổi header của file thương hiệu khác nếu dùng chung site (O20).
- Engine **không làm hồ sơ offline tệ hơn** hiện tại: HTML mở được từ cache thì engine cũng mở được.
- Muốn **chắc chắn mở app được khi không có mạng** là dự án riêng (service worker) — **ngoài phạm vi**.

### 6.3 Kiểm tra lúc khởi động

```js
if (!window.UnitEngine) { /* banner đỏ + tự tải lại sau 5 giây — KHÔNG có nhánh chặn bán nào khác */ }
```

### 6.4 Buộc cập nhật từ xa (chỉ cho cửa sổ bảo trì)

- Doc `app_config_gieogieo/versions` = `{ minPos, minQuanly, maintenance: {from, to, message} }` — đọc bằng listener (1 doc).
- Máy thấy phiên bản mình < `min*` → banner "cần tải lại" + tự tải lại khi **không có bill đang mở**.
- `maintenance` đang hiệu lực → màn hình bảo trì (dùng cho M2, ngoài giờ bán, công bố trước).
- Đây là cách **duy nhất** để bảo đảm không máy nào còn chạy HTML cũ khi chuyển dữ liệu.

### 6.5 Chuyển giao giờ máy chủ (C1)

Trong lúc chuyển, máy cũ ghi mốc B9 theo giờ máy, máy mới theo giờ máy chủ. Cách làm:
1. Nâng `minPos`/`minQuanly` (6.4) để mọi máy lên bản E6 cùng lúc, ngoài giờ bán.
2. Khi lên bản E6, engine **bỏ qua** mốc `_ueLastRecomputeStart` lớn hơn `now() + 10 phút` (mốc "tương lai" do máy chạy giờ nhanh để lại) và ghi đè bằng mốc mới.

### 6.6 Quay lui

- **Cách mặc định — sửa tiến**: trong thư mục, sửa HTML trỏ lại `unit_engine.v{N-1}.js` (file vẫn còn nhờ quy tắc 6.1-2) → chạy kiểm tra (6.7) → deploy. Chỉ đổi đúng phần Gieo Gieo.
- **Rollback của Hosting** (console ▸ Hosting ▸ Release history): quay lui **cả site** về bản phát hành trước. Chỉ dùng khi chắc chắn giữa hai lần phát hành **không có thay đổi nào của XOFA / The Cafe 33**; nếu có, Rollback sẽ quay lui luôn thay đổi của họ. Sau khi Rollback, thư mục trên máy anh **khác** host → phải sửa thư mục cho khớp trước lần deploy kế tiếp, nếu không lần deploy đó sẽ đưa lại bản lỗi.
- **Dữ liệu**: điều kiện để một bước E được deploy — dữ liệu ghi ra **tương thích ngược** (chỉ thêm trường, không đổi nghĩa trường cũ). `ledger.amend` giữ nguyên trường cũ, chỉ thêm `amendments[]`.

### 6.7 Kiểm tra trước deploy (chạy trong Termux)

Script `tools/predeploy_check.sh` (cần `pkg install nodejs` một lần), dừng và báo lỗi nếu:
1. HTML trỏ tới `unit_engine.v{N}.js` mà file đó **không có** trong thư mục.
2. Hai HTML trỏ tới **hai phiên bản engine khác nhau**.
3. Thiếu `unit_engine.v{N-1}.js` khi bản mới lên chưa đủ 7 ngày.
4. `firebase.json` thiếu `headers` cho engine / HTML.
5. (Từ E5) `node tools/check_boundaries.js` báo vi phạm ranh giới.
6. (Nếu O20 = chung site) thiếu file chính của XOFA / The Cafe 33 so với danh sách anh khai một lần trong `tools/site_files.txt`.

---

## 7. Kế hoạch đa cửa hàng M1 → M6

### 7.1 Mô hình tổng

```
        ┌──────── DÙNG CHUNG TOÀN CHUỖI (không storeId) ────────┐
        │ stores_gieogieo · employees(storeTags) · danh mục NL/BTP │
        │ công thức · bao bì · dụng cụ cân · khuyến mãi (phạm vi)  │
        └─────────────────────────────────────────────────────────┘
        ┌──── DÙNG CHUNG VỚI XOFA & THE CAFE 33 (không hậu tố) — D18 ─┐
        │ customers · rewards · bank_confirmations (RT) · Cloud Run   │
        └────────────────────────────────────────────────────────────┘
   ┌─ CỬA HÀNG A (storeId) ─┐   ┌─ CỬA HÀNG B ─┐   ┌─ KHO TRUNG TÂM (type=warehouse) ─┐
   │ tem/lô · sổ · tồn      │◄──┤ phiếu chuyển ├──►│ tem · sổ · tồn · phiếu nhập       │
   │ ca · két · lịch · nhập │   │              │   │ (không bán)                        │
   └────────────────────────┘   └──────────────┘   └────────────────────────────────────┘
```

Collection mới (giữ hậu tố — D16): `stores_gieogieo`, `store_item_state_gieogieo`, `stock_transfers_gieogieo`, `store_menu_overrides_gieogieo`, `app_config_gieogieo`.

### 7.2 Phân loại toàn bộ collection hiện có

**G** dùng chung · **G+s** dùng chung, bản ghi mang `storeId` · **C** danh mục chung có ghi đè theo cửa hàng · **S** theo cửa hàng · **X** dùng chung với XOFA & The Cafe 33 (D18).

| Collection | Loại | Ghi chú |
|---|---|---|
| `alerts` | S | Khoá ghép ngày/món → thêm `storeId` |
| `assets` | S | |
| `assist_profile_effects` | S | |
| `audit_logs` | G+s | |
| `bill_deletions` | S | |
| `book_closings` | S | `{tháng}` → `{storeId}_{tháng}` |
| `cashfund` | S | khoá ngày |
| `checklist_activity_logs` | S | |
| `checkout_side_effects` | S | |
| `cogs` | S | |
| `config_history` | G+s | |
| `customers` | **X** | D5, D18 — chỉ thêm trường tuỳ chọn |
| `daily_closings`, `daily_openings`, `daily_ops`, `daily_sales_cache` | S | khoá ngày → `{storeId}_{ngày}` |
| `discount_effects` | S | |
| `employee_shifts` | S | `storeId` = nơi check-in |
| `employee_stock_deductions` | S | có `employeeId` |
| `employees` | G | + `storeTags` |
| `expense_categories` | G | |
| `expenses` | S | |
| `finance` | ? | O3 |
| `handover_counts`, `handover_records` | S | khoá ngày |
| `hr_settings` | G | |
| `ingredient_original_packs` | G | |
| `inventory_items` | G (danh mục) | trạng thái → `store_item_state_gieogieo` |
| `label_reprints` | S | |
| `ledger_day_summaries` | S | |
| `loyalty_bill_effects`, `loyalty_pending_retry`, `stamp_free_redemptions` | G+s | |
| `note_reasons`, `waste_reasons`, `payment_methods` | G | |
| `order_stock_traces` | S | |
| `orders_gieogieo_archive` | S | `{tháng}_{ngày}_{năm}` → thêm `storeId`; việc lưu trữ chạy theo cửa hàng |
| `packaging_*` (6) | G | |
| `payroll_month_adjustments` | G | |
| `prep_batches`, `prep_transactions`, `prep_shortage_recons` | S | |
| `prep_forecasts` | S | `{ngày}_{prepId}` → thêm `storeId` |
| `prep_ingredient_locks` | S | `{itemId}` → `{storeId}_{itemId}` |
| `prep_items` | G (danh mục) | trạng thái → `store_item_state_gieogieo` |
| `prep_recipe_history`, `recipe_history`, `recipe_suggestions`, `recipes`, `topping_recipes` | G | |
| `prep_vessels` | G | D14 |
| `price_history` | G+s | |
| `purchase_orders`, `receiving_records` | S | D10 |
| `refill_rules`, `storage_locations` | S | |
| `reversal_unit_claims` | S | |
| `rewards` | **Không dùng** (sau F4) | Của The Cafe 33; Gieo Gieo không mã nào — F4 |
| `sales_assist_logs` | S | |
| `shift_checklists`, `special_days` | C | |
| `shift_inventory_counts` | S | `{ngày}_{phase}` → thêm `storeId` |
| `shift_segments`, `shift_workflows` | S | |
| `staff_notes` | S | |
| `stock_anomalies`, `stock_counts`, `stock_label_reports`, `stock_lost_reports`, `stock_transactions` | S | |
| `stock_containers` | S | `storeId` = nơi đang giữ; đổi khi chuyển kho |
| `voucher_effects` | S | |
| `work_schedules` | S | D7 |
| `wallets_gieogieo` (dữ liệu Ví cũ), `donggia_config` (dữ liệu Đồng giá cũ) | — | **Tính năng đã loại** — M2 bỏ qua, không chuyển, không tự xoá (xoá tay khi anh quyết) |

### 7.3 Đường dẫn RT

| Hiện tại | Sau M2 (giữ hậu tố) | Loại | Ai khác phải sửa |
|---|---|---|---|
| `active_units_gieogieo/{itemId}` | `active_units_gieogieo/{storeId}/{itemId}` | S | — |
| `orders_gieogieo/{tháng}/{ngày}` | `orders_gieogieo/{storeId}/{tháng}/{ngày}` | S | việc lưu trữ, REST `_ddShallow` |
| `billCounters_gieogieo` | `billCounters_gieogieo/{storeId}` | S | — |
| `session_display_gieogieo` | **xoá** (K0) — kiosk đã loại | — | — |
| `menu_gieogieo`, `menu_togo_gieogieo`, `food_gieogieo`, `food_menu_gieogieo`, `toppings_gieogieo` | giữ + `store_menu_overrides_gieogieo` | C | — |
| `bank_confirmations` | giữ (D8, D18); khoá có mã cửa hàng | X | **Cloud Run webhook** (một lần deploy) |
| `togoSettings_gieogieo` (**khuyến mãi**: quà tặng, giảm giá to-go, tặng topping), `sales_assist_config_gieogieo` (**chiến dịch khuyến mãi** + cấu hình trợ lý), `appFeeSettings_gieogieo` | chung + phạm vi cửa hàng (7.6) | C | — |
| `printer_layout_gieogieo`, `sales_assist_stats_gieogieo` | theo cửa hàng | S | — |
| `kiosk_config` | **của XOFA**; Gieo Gieo ngừng ghi (K0), không đụng dữ liệu | X | — |

### 7.4 Nhân viên, ca, lịch (D6, D7)

- POS nạp **toàn bộ** nhân viên (listener đã có) — không lọc theo cửa hàng.
- `employee_shifts.storeId` = nơi check-in; bill, két, trách nhiệm theo `storeId` của ca.
- `work_schedules` theo cửa hàng, cho phép nhân viên `storeTags` khác (nhãn "hỗ trợ", không chặn).
- Lương gộp theo `employeeId`.

### 7.5 Chuyển khoản (D8)

- **Vấn đề**: `orderId = GG + ddMMHHmmss` → hai cửa hàng tạo QR cùng giây trùng khoá.
- **Giải pháp**: `GG{mã cửa hàng 2 ký tự}{ddMMHHmmss}`.
- **Webhook là dịch vụ Cloud Run chung của cả ba thương hiệu** (O10). Thay đổi = **một lần deploy**, không phải backend mới.
- **Thứ tự bắt buộc**:
  1. Đọc mã nguồn webhook (E0): tiền tố từng thương hiệu, cách tách `orderId`, cách ghi RT.
  2. Sửa bộ đọc để nhận **thêm** dạng `GG{xx}{ddMMHHmmss}`, **giữ nguyên** dạng `GG{ddMMHHmmss}` và toàn bộ dạng của XOFA / The Cafe 33. Kiểm mã cửa hàng không tạo ra chuỗi trùng tiền tố của thương hiệu khác.
  3. Deploy, thử bằng một giao dịch nhỏ thật cho **mỗi** thương hiệu.
  4. Mới đổi POS Gieo Gieo sang dạng mới.
- Kiểm độ dài nội dung CK (O7).
- Dọn `bank_confirmations` cũ (`ddDeleteBankOld`) hiện xoá mọi khoá > 7 ngày — **kể cả khoá của XOFA / The Cafe 33**. Phải xác nhận hai app kia không cần các khoá đó; tốt nhất giới hạn chỉ xoá khoá tiền tố `GG`.

### 7.6 Khuyến mãi & nhập hàng

**Khuyến mãi của Gieo Gieo là khuyến mãi cục bộ** (O15), nằm ở hai chỗ, đều thuộc riêng Gieo Gieo:

| Nơi lưu | Nội dung | Ai cấu hình |
|---|---|---|
| RT `togoSettings_gieogieo` | `gift`, `giftMenu`, `discount`, `freeTopping` (tặng quà, giảm giá to-go, tặng topping) | Quản lý (màn Khuyến mãi — `saveTogoSettingsLocal`) |
| RT `sales_assist_config_gieogieo` | Chiến dịch cấu hình được `{id, name, enabled, from, to, weekdays[], scope, conditions[] …}` (8.8, 9.9, sinh nhật quán…) | Quản lý (`saveAssistCfg`) |

Đa cửa hàng (D11):
- Mỗi chương trình / chiến dịch thêm trường `stores: 'all' | [storeId…]`; **thiếu trường = toàn hệ thống**. (Không trùng với `scope` hiện có của chiến dịch — `scope` đang mang nghĩa `togo`/`dinein`.)
- `togoSettings` hiện là **một** cấu hình → chuyển thành danh sách chương trình có `stores`, hoặc giữ một cấu hình chung + `togoSettingsOverrides_gieogieo/{storeId}` — chốt ở M4.
- POS lọc theo `storeId` của máy khi áp.
- Gieo Gieo **không dùng mã / voucher** (O17); phần code còn sót được gỡ ở **F4**. Tích luỹ khách = **tem → ly miễn phí** (`loyaltyAddStamps`, `stamp_free_redemptions_gieogieo`), dùng chung `customers` (D5). Gieo Gieo chỉ bán to-go nên không có Point (nhánh cũ dọn ở F5).

**Nhập hàng**: phiếu nhập theo cửa hàng; tem mang `storeId` nơi nhận; `price_history` mang `storeId`.

### 7.7 Chuyển kho & kho trung tâm (D12, D13)

```
[Tạo]   bên gửi quét mã (chỉ tem sealed) → phiếu draft
[Xuất]  mã: status=in_transit, transferId; sổ bên gửi TRANSFER_OUT; tồn bên gửi suy lại (in_transit không tính)
[Nhận]  bên nhận quét → mã: storeId=bên nhận, status=sealed; sổ TRANSFER_IN; tồn bên nhận suy lại
[Chốt]  mã không quét được → Sổ lệch bên nhận ('transfer_missing'); mã lạ → từ chối
[Huỷ]   trước khi nhận: mã về sealed bên gửi, sổ đảo
```

Engine thêm `transfer.*`. Tem đang mở không chuyển. Bếp trung tâm (BTP chuyển đi) — O5.

### 7.8 Menu & giá

Menu RT giữ chung; `store_menu_overrides_gieogieo/{storeId}` = `{hidden:[…], price:{…}}`; công thức chung.

### 7.9 Danh tính & quyền (M3)

- **Hiện trạng (O14)**: rules = *đã đăng nhập là toàn quyền*. Mọi máy của cả ba thương hiệu đăng nhập cùng tài khoản `cafe33@…` → mọi máy đọc/ghi được mọi dữ liệu. Không có lớp bảo vệ ở máy chủ; ranh giới engine (E5) hiện chỉ được giữ bằng code.
- **Cách siết mà không ảnh hưởng hai thương hiệu kia**: phân biệt bằng **custom claims**, không phải bằng tài khoản:
  ```
  // Firestore rules (phác thảo)
  function legacy()  { return request.auth != null && request.auth.token.brand == null; }   // tài khoản cũ: GIỮ NGUYÊN toàn quyền
  function gg()      { return request.auth != null && request.auth.token.brand == 'gieogieo'; }
  function myStore() { return request.auth.token.storeId; }
  match /{coll}/{id} {
    allow read, write: if legacy();                                        // XOFA, The Cafe 33, máy Gieo Gieo chưa chuyển
    allow read, write: if gg() && coll.matches('.*_gieogieo$') && (… luật storeId cho loại S …);
    allow read, write: if gg() && coll == 'customers';                     // tích tem (sau F4 không cần rewards)
  }
  ```
- Custom claims chỉ gán được bằng **Admin SDK** → một script chạy một lần (tài khoản dịch vụ) hoặc một endpoint nhỏ trên chính Cloud Run hiện có (O13). Không cần backend mới.
- Tài khoản riêng cho từng cửa hàng Gieo Gieo (claims `brand:'gieogieo'`, `storeId`, `role`). **Tài khoản chung không bị tắt, không đổi mật khẩu** (D18).
- Luật cho tài khoản `gg()`: loại **S** — `resource.data.storeId == myStore()` (chủ chuỗi: tất cả); **G/C** — đọc được, vai trò Quản lý mới ghi; tài nguyên X — chỉ đúng quyền Gieo Gieo đang cần (đọc/ghi `customers`; `rewards` không cần sau F4).
- Lưu ý: một máy Gieo Gieo **chưa chuyển** sang tài khoản mới vẫn toàn quyền (vì là `legacy()`) → ranh giới chỉ thật sự có khi **mọi** máy Gieo Gieo đã chuyển.
- RTDB rules cùng mô hình `legacy()` / `gg()`; nhánh `*_gieogieo/{storeId}` theo `myStore()`; `bank_confirmations` giữ nguyên (webhook Cloud Run thường ghi bằng Admin SDK — bỏ qua rules; xác nhận khi có O13).

### 7.10 Báo cáo

Bộ chọn 1 / nhiều / toàn chuỗi; báo cáo gộp = cộng từng cửa hàng. `loadExpensesAll`, `loadDailyOpsAll` (đọc cả lịch sử) → truy vấn theo khoảng ngày + `storeId`.

### 7.11 Chi phí đọc

**Hạn mức và hoá đơn Firebase dùng chung với XOFA & The Cafe 33** — tăng tải của 10 cửa hàng Gieo Gieo ảnh hưởng chung; theo dõi Usage theo tuần. Mọi truy vấn/listener loại S có `storeId`. **M2a làm mỗi lượt ghi sổ đọc thêm 1 doc** (`store_item_state`) — với ~150 bill × ~5 dòng sổ/bill ≈ +750 lượt đọc/ngày/cửa hàng, chấp nhận được nhưng phải ghi nhận. Index: lập danh sách bằng script ở M1.

### 7.13 Làm việc chung với XOFA & The Cafe 33 (D18)

| Tài nguyên | Hiện trạng dùng chung | Việc Gieo Gieo được làm | Việc **không** được làm |
|---|---|---|---|
| `customers` | Một hệ khách hàng cho cả ba | Ghi tem / ly miễn phí như hiện tại; thêm trường tuỳ chọn nếu cần | Đổi/xoá trường cũ, đổi khoá doc; dùng `myGifts` của hệ khác (F4); ghi Point (không có — F5) |
| `rewards` | The Cafe 33 cấu hình | **Không dùng** — F4 gỡ ô nhập mã, voucher, listener, và lượt ghi `usedCount` | Đọc/ghi |
| `bank_confirmations` + Cloud Run | Một webhook, một nhánh RT | Thêm dạng mã có cửa hàng; dọn khoá `GG…` | Đổi dạng mã / cách ghi của hai thương hiệu kia; dọn khoá của họ |
| Tài khoản `cafe33@…` | Mọi app đăng nhập chung | Chuyển thiết bị Gieo Gieo sang tài khoản riêng | Tắt / đổi mật khẩu tài khoản chung |
| Rules Firestore/RTDB | Chung một bộ, đăng nhập = toàn quyền | Thêm luật cho tài khoản có claim `brand:'gieogieo'` | Đổi luật của tài khoản không có claim |
| `kiosk_config` | Của XOFA | Ngừng ghi (K0) — **gấp** | Ghi, xoá |
| Hạn mức / chi phí | Chung | Giảm đọc (đã làm), theo dõi Usage | — |

**Quy trình cho mọi thay đổi chạm tài nguyên dùng chung** (thực tế chỉ còn: webhook Cloud Run ở M3, rules ở M3): thử luồng Gieo Gieo trên staging → báo trước cho người vận hành XOFA / The Cafe 33 → triển khai ngoài giờ bán của cả ba → thử một giao dịch CK thật cho mỗi thương hiệu.

### 7.12 Lộ trình M1 → M6

#### M1 — Lớp truy cập dữ liệu ngoài engine (song song E4–E6)

- Hai file có ~580 lời gọi `collection('…')` (POS 284, Quản lý 296) + đường dẫn RT viết cứng. Phần của engine đã gom ở E; phần **còn lại** → `coll()`, `rt()`, `dayKey()` trong `data_access.v{N}.js` dùng chung.
- Script AST liệt kê mọi `where/orderBy` → danh sách index cho M2.
- `storeId` cố định. Không đổi hành vi.

#### M2a — Tách trạng thái tồn (trước M2)

- Nơi đọc tồn từ doc món: AST cho thấy `inventory_items` được **25 hàm POS** và **11 hàm Quản lý** đọc; `prep_items` 13 / 6 — lập danh sách chính xác những hàm đọc **trường trạng thái** (refill, checklist đầu ca, kết ca, báo cáo, Kho…).
- Engine ghi **song song** cả doc món và `store_item_state_gieogieo` (một transaction) trong một giai đoạn; màn hình chuyển dần sang đọc `store_item_state`; khi không còn nơi đọc trường cũ → ngừng ghi trường cũ.

#### M2 — Schema & chuyển dữ liệu (rủi ro cao nhất)

**Code**: bật `storeId` thật trong `coll/rt/dayKey`/`P`; khoá doc có `storeId`; tạo index; các việc lưu trữ/dọn dẹp theo cửa hàng.

**Runbook** (staging trước, rồi thật trong cửa sổ bảo trì):

1. Công bố lịch bảo trì; bật `maintenance` + nâng `minPos/minQuanly` (6.4). Xác nhận **mọi máy** đã lên bản M2 và đang ở màn bảo trì.
2. Xác nhận **Cloud Run webhook** vẫn ghi `bank_confirmations` như cũ (M2 không đổi nhánh này) và app **XOFA / The Cafe 33** không bị ảnh hưởng (không chạm tài nguyên X).
3. Sao lưu: export Firestore + RTDB.
4. Chạy script (idempotent, **chỉ thêm**):
   1. `stores_gieogieo/gg01` (+ kho nếu có).
   2. Gắn `storeId:'gg01'` cho bản ghi loại S.
   3. Sao chép doc khoá theo ngày/tháng sang khoá mới `gg01_…`.
   4. `store_item_state_gieogieo/gg01_{itemId}` (nếu M2a chưa tạo).
   5. RT: `active_units_gieogieo/*` → `active_units_gieogieo/gg01/*`; `orders_gieogieo/{tháng}` → `orders_gieogieo/gg01/{tháng}`; `billCounters_gieogieo` → `billCounters_gieogieo/gg01`. (`session_display` đã xoá ở K0.)
   6. **Không ghi** vào `customers`, `rewards`, `bank_confirmations` (D18).
5. **Khoá chỉ-đọc** đường dẫn/khoá cũ bằng rules (không phải "giữ để dùng") — máy nào còn bản cũ sẽ lỗi ghi thay vì ghi lệch chỗ.
6. **Kiểm đếm**: số doc từng collection; tổng `currentStock` từng món; tổng `unitBase` tem mở; số tem sealed; doanh thu 30 ngày.
7. Thử checklist 5.3 trên một máy → tắt `maintenance`.
8. Giữ dữ liệu cũ (chỉ-đọc) ≥ 14 ngày rồi mới xoá.

**Quay lui**: tắt khoá chỉ-đọc, trỏ code về bản trước M2, dữ liệu cũ còn nguyên.

#### M3 — Danh tính, quyền, chuyển khoản

- Tài khoản theo cửa hàng + claims + rules (7.9).
- Cloud Run webhook nhận thêm dạng `GGxx…` (một lần deploy, thử cho cả ba thương hiệu) → POS đổi sang `GGxx…` (7.5).
- `storeTags`, check-in ghi `storeId`.
- Tắt WebView debugging.

#### M4 — Quản lý đa cửa hàng

Bộ chọn cửa hàng; báo cáo từng/gộp; danh mục chung + ghi đè (menu/giá, khuyến mãi, checklist, ngày đặc biệt); phiếu nhập, lịch theo cửa hàng; "sao chép cấu hình từ cửa hàng A".

#### M5 — Chuyển kho & kho trung tâm

`transfer.*`, `in_transit`; màn tạo/xuất/nhận ở POS; theo dõi ở Quản lý; chốt nơi thao tác của kho trung tâm (O6).

#### M6 — Thí điểm & nhân rộng

Cửa hàng 2 chạy 2–4 tuần (theo dõi lệch tồn, Sổ lệch, lượt đọc, lỗi đồng bộ, CK); runbook khai trương cửa hàng mới.

---

## 8. Rủi ro và cách giảm

| Rủi ro | Mức | Cách giảm |
|---|---|---|
| Tách engine đổi hành vi ngầm | Cao | Test ảnh chụp chuẩn hoá; chỉ cho phép thay giờ/ngẫu nhiên/hook trong thân hàm ở E1; lớp chuyển tiếp |
| Deploy / Rollback của Gieo Gieo xoá hoặc quay lui nhầm app thương hiệu khác (một site chung) | Rất cao | Thư mục là nguồn duy nhất, luôn đủ file cả ba (6.1); kiểm tra `site_files.txt` (6.7); quay lui bằng sửa tiến, hạn chế Rollback (6.6) |
| Mất điện thoại / hỏng thư mục = mất nguồn của cả ba web app | Cao | Sao lưu thư mục trước mỗi lần deploy đổi engine (6.1-5) |
| Máy chạy HTML cũ ~1 giờ sau deploy (cache mặc định Hosting) | Trung bình | HTML `no-cache` trong `firebase.json` |
| Engine không nạp được → không bán được | Trung bình | Cache giống HTML (cùng mức rủi ro với HTML/SDK hiện nay); đo mốc offline ở E0, E1 không được kém hơn; không có `ready` chặn; banner + tự tải lại |
| Gộp nghiệp vụ trùng (xoá bill, BTP âm) làm hoàn/chuyển loại hai lần | Cao | Một cơ chế claim; test "POS rồi Quản lý cùng bill" |
| Chặn nhầm chú thích hợp lệ khi rào ranh giới | Trung bình | Danh sách trường chú thích lấy từ AST ở E0; `FIELD_NOT_ANNOTATABLE` chỉ bật ở E5 |
| Máy chạy bản cũ khi chuyển dữ liệu | Rất cao | `minVersion` + `maintenance` + khoá chỉ-đọc dữ liệu cũ |
| Webhook Cloud Run hỏng khi đổi dạng mã → **cả ba thương hiệu** mất tự xác nhận CK | Rất cao | Đọc mã nguồn ở E0; chỉ thêm dạng mới; thử giao dịch thật cho từng thương hiệu; nhân viên vẫn xác nhận tay được |
| Làm hỏng XOFA / The Cafe 33 (rules, tài khoản, schema X, dọn CK) | Rất cao | D18 + bảng 7.13; staging có app của cả ba; rules mới chỉ áp `*_gieogieo`; không tắt tài khoản chung |
| Màn cấu hình kiosk Gieo Gieo đè `kiosk_config` **của XOFA** | Cao — **đang mở** | K0 gấp; tạm thời không bấm Lưu ở màn đó |
| Nhân viên áp mã/quà của XOFA / The Cafe 33 tại Gieo Gieo; POS tăng `usedCount` mã của The Cafe 33 | Trung bình — **đang mở** | F4 (gỡ) |
| Code nhánh "Tại quán" (Point) còn sót | Thấp — **không chạy được** (nút ẩn, `isToGo` luôn true) | F5 |
| Giờ máy chủ chuyển giao lệch mốc | Trung bình | 6.5 (cập nhật đồng loạt + bỏ mốc tương lai) |
| Chuyển dữ liệu M2 hỏng | Rất cao | Staging; sao lưu; chỉ-thêm; kiểm đếm; quay lui |
| Thiếu index | Cao | Danh sách từ M1, tạo trước M2 |
| Chi phí đọc | Trung bình | `storeId` mọi truy vấn S; bỏ đọc toàn lịch sử; theo dõi Usage |
| Khối lượng lớn cho một người | Trung bình | Bước nhỏ, có test; E0–E3 trước |

---

## 9. Việc còn mở / thông tin cần bổ sung

| # | Việc | Cần cho |
|---|---|---|
| ~~O1~~ | ✅ Không có service worker / PWA → 6.2; code đăng ký SW dọn ở F5 | — |
| ~~O19~~ | ✅ Firebase Hosting → 6.1, 6.2, 6.6 | — |
| ~~O20~~ | ✅ Có — thư mục deploy chứa cả file XOFA / The Cafe 33 → 6.1, 6.6, 6.7 | — |
| O2 | Duyệt **F1** (khôi phục lô giữ `openedAt`), **F2** (chặn tồn khởi tạo món có tem), **F3** (bỏ `.add()` trên sổ) | E0 |
| O3 | Nội dung `finance_gieogieo` | 7.2 |
| O4 | Chuyển tem **đang mở** giữa cửa hàng? (mặc định: không) | M5 |
| O5 | Bếp trung tâm nấu BTP chuyển đi? | M5 |
| O6 | Kho trung tâm thao tác trên POS rút gọn hay Quản lý | M5 |
| O7 | Giới hạn độ dài nội dung CK của ngân hàng | M3 |
| O8 | Chuẩn mã cửa hàng (`GG01`…) | M2 |
| ~~O9~~ | ✅ XOFA & The Cafe 33 dùng chung dữ liệu → D18, 7.13 | — |
| ~~O10~~ | ✅ Webhook chạy trên Cloud Run cùng project → 7.5 | — |
| ~~O11~~ | ✅ Kiosk/màn hình phụ đã loại → K0 | — |
| ~~O12~~ | ✅ `kiosk_config` là của XOFA → K0 gấp | — |
| **O13** | Mã nguồn Cloud Run webhook — **anh gửi sau** | M3 (không chặn K0–E6) |
| ~~O14~~ | ✅ Đăng nhập = toàn quyền → 7.9 | — |
| ~~O15~~ | ✅ Gieo Gieo chỉ khuyến mãi cục bộ → 7.6; POS chưa chặn mã quán khác → F4 | — |
| ~~O17~~ | ✅ Gieo Gieo không dùng mã nào → F4 = gỡ bỏ | — |
| ~~O18~~ | ✅ Chỉ bán to-go → nhánh Point không chạy; dọn ở F5 | — |
| ~~O16~~ | ✅ Chỉ xét phần Gieo Gieo dùng → D18 | — |

---

## 10. Phụ lục

### 10.1 Phương pháp kiểm kê AST và giới hạn

- Trích mọi `<script>` inline của hai file, phân tích bằng `acorn` (ECMAScript mới nhất), duyệt từng câu lệnh cấp cao (mỗi hàm cấp cao = một đơn vị báo cáo; hàm lồng quy về hàm ngoài, vd `hoanVaoTem` → `qlReverseStockForOrder`).
- Nhận diện: chuỗi `fstore.collection(X)…` (X là chuỗi hoặc hằng `const`), `db.ref('…')`, `_ueActiveUnitsRef(…)`; theo dõi biến gán từ các chuỗi đó (kể cả qua `?:`/`||`), snapshot `get()` và tham số callback `forEach/map` (`d.ref.update`), transaction/batch `t.set/update/delete(ref, …)`.
- Trường ghi: khoá của object literal truyền trực tiếp vào lệnh ghi (kể cả `['locationStock.'+id]`, template).
- **Không bắt được**: collection chọn bằng tham số hàm (hiện là "collection động"), object dữ liệu dựng qua biến rồi mới truyền vào lệnh ghi (vd `updates` trong `applyStockTransactionPOS`), ghi trong callback RT transaction (chỉ báo "RT transaction", không báo trường). Các trường hợp này đã được bổ sung tay trong bảng 2.4 khi biết.

### 10.2 Truy cập Firestore theo collection (số hàm cấp cao, AST)

| Collection | POS: hàm ghi | POS: hàm đọc | QL: hàm ghi | QL: hàm đọc |
|---|---|---|---|---|
| `alerts_gieogieo` | 24 | 1 | 3 | 4 |
| `assets_gieogieo` | 0 | 0 | 4 | 1 |
| `assist_profile_effects_gieogieo` | 1 | 1 | 0 | 0 |
| `audit_logs_gieogieo` | 0 | 0 | 1 | 1 |
| `bill_deletions_gieogieo` | 0 | 0 | 1 | 0 |
| `book_closings_gieogieo` | 0 | 0 | 2 | 1 |
| `checklist_activity_logs_gieogieo` | 2 | 1 | 0 | 2 |
| `checkout_side_effects_gieogieo` | 2 | 1 | 0 | 0 |
| `cogs_gieogieo` | 0 | 0 | 1 | 1 |
| `config_history_gieogieo` | 0 | 0 | 1 | 1 |
| `customers` | 6 | 8 | 1 | 0 |
| `daily_closings_gieogieo` | 20 | 17 | 4 | 8 |
| `daily_openings_gieogieo` | 4 | 6 | 0 | 2 |
| `daily_ops_gieogieo` | 0 | 0 | 1 | 3 |
| `daily_sales_cache_gieogieo` | 0 | 0 | 1 | 2 |
| `discount_effects_gieogieo` | 1 | 1 | 0 | 0 |
| `employee_shifts_gieogieo` | 4 | 3 | 3 | 9 |
| `employee_stock_deductions_gieogieo` | 0 | 1 | 0 | 0 |
| `employees_gieogieo` | 0 | 1 | 4 | 1 |
| `expense_categories_gieogieo` | 0 | 1 | 4 | 1 |
| `expenses_gieogieo` | 1 | 4 | 7 | 6 |
| `finance_gieogieo` | 0 | 4 | 1 | 2 |
| `handover_counts_gieogieo` | 3 | 2 | 0 | 2 |
| `handover_records_gieogieo` | 2 | 0 | 0 | 1 |
| `hr_settings_gieogieo` | 0 | 0 | 1 | 1 |
| `ingredient_original_packs_gieogieo` | 0 | 1 | 2 | 1 |
| `inventory_items_gieogieo` | 4 | 25 | 15 | 11 |
| `label_reprints_gieogieo` | 1 | 0 | 0 | 1 |
| `ledger_day_summaries_gieogieo` | 1 | 1 | 2 | 2 |
| `loyalty_bill_effects_gieogieo` | 2 | 2 | 0 | 0 |
| `loyalty_pending_retry_gieogieo` | 2 | 0 | 0 | 0 |
| `note_reasons_gieogieo` | 0 | 0 | 4 | 1 |
| `order_stock_traces_gieogieo` | 5 | 1 | 0 | 2 |
| `orders_gieogieo_archive` | 2 | 2 | 2 | 3 |
| `packaging_bagging_rules_gieogieo` | 0 | 1 | 1 | 1 |
| `packaging_bagging_table_gieogieo` | 0 | 1 | 1 | 1 |
| `packaging_item_overrides_gieogieo` | 0 | 1 | 2 | 1 |
| `packaging_presets_gieogieo` | 0 | 1 | 2 | 1 |
| `packaging_rules_config_gieogieo` | 0 | 1 | 1 | 1 |
| `packaging_rules_gieogieo` | 0 | 1 | 2 | 1 |
| `payment_methods_gieogieo` | 0 | 1 | 3 | 1 |
| `payroll_month_adjustments_gieogieo` | 0 | 0 | 1 | 1 |
| `prep_batches_gieogieo` | 11 | 24 | 4 | 18 |
| `prep_forecasts_gieogieo` | 0 | 0 | 1 | 2 |
| `prep_ingredient_locks_gieogieo` | 1 | 9 | 0 | 4 |
| `prep_items_gieogieo` | 8 | 13 | 10 | 6 |
| `prep_recipe_history_gieogieo` | 0 | 0 | 1 | 1 |
| `prep_shortage_recons_gieogieo` | 1 | 1 | 2 | 4 |
| `prep_transactions_gieogieo` | 8 | 8 | 3 | 12 |
| `prep_vessels_gieogieo` | 0 | 1 | 2 | 1 |
| `price_history_gieogieo` | 0 | 0 | 2 | 1 |
| `purchase_orders_gieogieo` | 1 | 2 | 4 | 2 |
| `receiving_records_gieogieo` | 1 | 0 | 1 | 4 |
| `recipe_history_gieogieo` | 0 | 0 | 1 | 1 |
| `recipe_suggestions_gieogieo` | 0 | 0 | 2 | 1 |
| `recipes_gieogieo` | 0 | 1 | 2 | 3 |
| `refill_rules_gieogieo` | 0 | 2 | 4 | 3 |
| `reversal_unit_claims_gieogieo` | 1 | 1 | 1 | 1 |
| `rewards` | 1 | 3 | 0 | 0 |
| `sales_assist_logs_gieogieo` | 1 | 0 | 0 | 1 |
| `shift_checklists_gieogieo` | 0 | 3 | 3 | 1 |
| `shift_inventory_counts_gieogieo` | 2 | 0 | 0 | 1 |
| `shift_segments_gieogieo` | 4 | 1 | 0 | 2 |
| `shift_workflows_gieogieo` | 1 | 0 | 0 | 1 |
| `special_days_gieogieo` | 0 | 0 | 2 | 1 |
| `staff_notes_gieogieo` | 0 | 0 | 3 | 1 |
| `stamp_free_redemptions_gieogieo` | 1 | 1 | 0 | 0 |
| `stock_anomalies_gieogieo` | 1 | 2 | 2 | 2 |
| `stock_containers_gieogieo` | 14 | 25 | 5 | 11 |
| `stock_counts_gieogieo` | 1 | 2 | 2 | 6 |
| `stock_label_reports_gieogieo` | 3 | 0 | 0 | 0 |
| `stock_lost_reports_gieogieo` | 1 | 1 | 1 | 2 |
| `stock_transactions_gieogieo` | 7 | 13 | 8 | 17 |
| `storage_locations_gieogieo` | 0 | 0 | 4 | 1 |
| `topping_recipes_gieogieo` | 0 | 1 | 2 | 1 |
| `voucher_effects_gieogieo` | 1 | 1 | 0 | 0 |
| `waste_reasons_gieogieo` | 0 | 1 | 3 | 1 |
| `work_schedules_gieogieo` | 0 | 0 | 2 | 2 |

### 10.3 Đường dẫn RT (AST)

| Đường dẫn RT | Hàm ghi (trong 2 file) | Số hàm đọc |
|---|---|---|
| `active_units_gieogieo` | POS `unitEngineAllocateConsumption`, POS `unitEngineReverseAllocations`, POS `unitEngineOnOpen`, POS `unitEngineFinishOpenUnit`, POS `_applyFifoNotEmpty`, POS `writeAtomicContainerFinish` … (+20) | 27 |
| `appFeeSettings_gieogieo` | — (không có — **ghi từ bên ngoài**) | 1 |
| `bank_confirmations` | POS `startBankListener`, QL `_ddDeleteKeys` | 1 |
| `billCounters_gieogieo` | POS `getNextBillCode` | 0 |
| `food_gieogieo` | POS `saveFoodItem`, POS `deleteFoodItem`, QL `deleteFoodItem`, QL `saveFoodItem` | 2 |
| `food_menu_gieogieo` | — (không có — **ghi từ bên ngoài**) | 2 |
| `kiosk_config` | POS `kcSaveAndApply` | 1 |
| `menu_gieogieo` | — (không có — **ghi từ bên ngoài**) | 4 |
| `menu_togo_gieogieo` | — (không có — **ghi từ bên ngoài**) | 4 |
| `orders_gieogieo` | POS `confirmPay`, POS `finalizeSplitPay`, QL `qlDoDeleteBill` | 6 |
| `printer_layout_gieogieo` | POS `(top-level)` | 1 |
| `sales_assist_config_gieogieo` | QL `saveAssistCfg` | 2 |
| `sales_assist_stats_gieogieo` | QL `assistRebuildStats` | 1 |
| `session_display_gieogieo` | POS `toggleTogo`, POS `resetTogoToggle`, POS `_sdFlush`, POS `resetDisplay` | 0 |
| `togoSettings_gieogieo` | POS `saveTogoSettingsLocal`, QL `saveTogoSettingsLocal` | 2 |
| `toppings_gieogieo` | POS `saveTopping`, POS `deleteTopping`, QL `deleteTopping`, QL `saveTopping` | 8 |

`bank_confirmations`: hàm "ghi" trong hai file chỉ là **xoá** (dọn sau khi dùng, dọn bản cũ) — bản ghi được tạo bởi **Cloud Run webhook**. `session_display_gieogieo`: chỉ POS ghi, không ai đọc — **tàn dư kiosk đã loại**, xoá ở K0.

### 10.4 Khoá doc cần thêm `storeId`

`daily_closings/{ngày}`, `daily_openings/{ngày}`, `daily_ops/{ngày}`, `daily_sales_cache/{ngày}`, `cashfund/{ngày}`, `shift_workflows/{ngày}`, `handover_records/{ngày}`, `handover_counts/{ngày}_{open|close}`, `shift_inventory_counts/{ngày}_{phase}`, `book_closings/{tháng}`, `orders_gieogieo_archive/{tháng}_{ngày}_{năm}`, `prep_forecasts/{ngày}_{prepId}`, `prep_ingredient_locks/{itemId}`, `alerts/…_{ngày}_{itemId}`, trạng thái `inventory_items/{itemId}` và `prep_items/{prepId}` → `store_item_state_gieogieo/{storeId}_{id}`, `bank_confirmations/{orderId}` (qua mã cửa hàng trong `orderId`).

### 10.5 Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| Mã / tem | Một đơn vị hàng có QR (chai, hộp, bao) — NL |
| Lô | Một mẻ BTP |
| `unitBase` | Số dư của mã/lô, có thể âm |
| Nợ FIFO | `unitBase` âm do bán vượt tem |
| `finishedDebt` | Tem đã báo hết còn nợ, chờ tem mới hấp thụ |
| Sổ lệch | `stock_anomalies` — khoản không gắn được vào mã |
| BTP âm chờ đối chiếu | `pendingShortage` |
| Ghi tuyệt đối | Đặt `unitBase` = một số (cân, chỉnh) |
| Trường số lượng / trường chú thích | Trường làm đổi tồn/sổ (chỉ engine) / trường mô tả, duyệt, trách nhiệm (mọi cụm qua API chú thích) |
| `amend` | Sửa số lượng/loại của dòng sổ đã ghi, có lưu vết |
| `storeId` | Mã cửa hàng/kho |
