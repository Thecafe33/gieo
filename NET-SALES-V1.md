# NET — NGHIỆP VỤ BÁN HÀNG (Sales) — V1

## Đây là gì

Đây KHÔNG phải audit mới. Đây là **liên kết** những gì đã có
(`FIFO-CHAIN-TRACE-SALES-COGS-PL-V1.md` + code thật của `posgieo.html` +
`src/layers/commands/sales.js` đã viết) thành **1 vòng nghiệp vụ đầy đủ**, để
sau này nhìn NET này là biết: đụng vào đâu, đụng thì kéo theo ai, và hệ mới đã
có/chưa có gì cho chỗ đó.

Domain này làm trước vì nó chạm nhiều domain khác nhất: Catalog (menu/giá),
Promotion (khuyến mãi), Loyalty (điểm/tem), FIFO/Kho (trừ nguyên liệu), Alerts
(báo thiếu định mức), Reporting (P&L, COGS).

**Ký hiệu:**
- 🔴 **BỎ** — luồng cũ không cần nữa (hệ mới không làm lại việc này, hoặc làm
  theo cách khác nên bản cũ vô nghĩa)
- 🟡 **GIỮ, ĐỔI CÁCH LÀM** — nghiệp vụ vẫn còn, nhưng hàm cũ bị thay bằng gọi
  `runtime.command`/`runtime.query`; DOM/UX người dùng thấy có thể giữ nguyên
- 🟢 **THÊM MỚI** — hệ cũ không có, core mới đòi hỏi vì lý do đã audit ra
- ⚪ **CHƯA QUYẾT** — cần chủ quán/người đọc NET này xác nhận trước khi code

---

## SƠ ĐỒ VÒNG NGHIỆP VỤ (theo đúng thứ tự thao tác tại quầy)

```
N1 Chọn món+size ─┐
N2 Chọn đá        ├─► N4 Bấm "Thanh toán" ─► N5 Khuyến mãi tự động ─► N6 SĐT tích điểm
N3 Topping lúc order┘         │                                            │
                               ▼                                            ▼
                        N7 Chọn phương thức ◄───────────────────────────────┘
                               │
                               ▼
                        N8 Xác nhận thanh toán
                               │
                               ▼
                        N9 GHI BILL (orders_gieogieo)
                               │
                 ┌─────────────┼─────────────────┬───────────────┬─────────────┐
                 ▼             ▼                 ▼               ▼             ▼
         N10 Trừ kho FIFO  N11 Tích điểm/tem  N12 Đổi tem/mã   N13 In bill+tem  N14 Mở két
                 │             │
                 ▼             ▼
         (→ FIFO-CHAIN-TRACE-RAW-MATERIAL/BTP)   (→ FIFO-CHAIN-TRACE-LOYALTY)

N15 Gọi thêm topping SAU khi bill đã lưu (addon) ─► lặp lại nhánh N10/N11 cho PHẦN CHÊNH LỆCH

N16 Cuối tháng: chốt sổ / mở lại tháng  ──┐
N17 Xem P&L theo kênh (tại quán/mang đi/app) ─┴─► (→ FIFO-CHAIN-TRACE-REPORTING)
```

---

## BẢNG NÚT (node) — hàm thật, vị trí, phân loại

### N1 — Chọn món + size

| | |
|---|---|
| Hệ cũ | `addCart(item, size)` — `posgieo.html:20020` |
| Việc làm | Thêm dòng vào `cart{}` (global object, key = `itemId_sizeLabel`), giá lấy từ `size.price` tại THỜI ĐIỂM bấm |
| Hệ mới | `commands/sales.buildBill()` nhận `spec.lines[].price` — **bắt buộc đã snapshot qua `catalog/menu.snapshotPrice`** trước khi vào bill |
| Phân loại | 🟡 **GIỮ, ĐỔI CÁCH LÀM** — UI chọn món/size giữ nguyên (DOM `posgieo.html`); khi build bill để gọi `RecordSale`, giá dòng phải đi qua `catalog/menu.snapshotPrice` thay vì đọc thẳng `size.price` từ biến cart runtime — nguyên tắc "giá không trôi theo sửa menu sau" (đã đúng ở legacy, core mới CHỈ LÀM TƯỜNG MINH bằng field). |
| Ghi chú | `cart` là biến toàn cục dùng chung bởi ~30 hàm khác (đá, topping, giảm giá, hiển thị màn phụ...) — đây CHÍNH LÀ "mối quan hệ nhân viên cũ" cần giữ nguyên ở tầng UI, chỉ đổi chỗ NỘP dữ liệu cuối (N9) sang `runtime.command('RecordSale', ...)`. |

### N2 — Chọn mức đá

| | |
|---|---|
| Hệ cũ | `renderCartIceBar()` / `setCartIceAll(mode)` / `setBatchItemIce` / `setBatchUnitIce` — `posgieo.html:2603/2589/2673/2684` |
| Hệ mới | **Không có field tương ứng trong `commands/sales.js` hiện tại** (`buildBill` không nhận `ice`) |
| Phân loại | ⚪ **CHƯA QUYẾT** — cần xác nhận: đá có ảnh hưởng định mức nguyên liệu (đá viên tính là 1 nguyên liệu trong recipe?) hay chỉ là thông tin hiển thị cho pha chế/tem. Nếu KHÔNG ảnh hưởng công thức/FIFO thì đây là dữ liệu UI-only, không cần lên `Bill` — chỉ cần lên `BillLine` để in tem đúng. Nếu CÓ ảnh hưởng (vd "ít đá" = nhiều topping/trân châu hơn theo 1 số công thức) thì phải là 1 field trong `line` để tính `requirements` đúng. |
| Ghi chú | Không có mục nào trong 10 file chain-trace đề cập đá ảnh hưởng COGS — tạm coi là UI-only cho tới khi có phản hồi khác. |

### N3 — Topping lúc order (trước khi bấm Thanh toán)

| | |
|---|---|
| Hệ cũ | `openToppingPicker(cartKey)` / `addCartTopping(toppingId)` / `setCartToppingQty` — `posgieo.html:24050/24114/24086` |
| Hệ mới | `commands/sales.buildBill()` → `line.toppings` (truyền thẳng qua, `sales.js:100`); `buildRequirements()` gọi `toppingRecipes`/`recipeLib` để tính nguyên liệu topping vào FIFO cùng đợt với món chính |
| Phân loại | 🟡 **GIỮ, ĐỔI CÁCH LÀM** — UI picker giữ nguyên; dữ liệu topping khi build bill phải mang `recipeId` của chính topping đó (không chỉ tên+giá) để `buildRequirements` trừ đúng kho — legacy CÓ làm việc này qua `toppingRecipes` (xem N10), core mới chỉ cần đảm bảo field đủ khi build bill. |

### N4 — Bấm "Thanh toán" (mở màn xác nhận)

| | |
|---|---|
| Hệ cũ | `onCheckoutClick()` — `posgieo.html:20109` |
| Việc làm | Chặn sớm: ngày đã đóng ca? ca đã mở? checklist đầu ca xong? có ai check-in? → tính `computeAllDiscounts()`, `getCartTotal()`, `getFinalTotal()`, mở popup tặng topping thành viên nếu có `curCustomer` |
| Hệ mới | Các gate này ĐÃ là command/query riêng: `GetShiftStatus`, business-day state (`store-context/business-day.js`), `RecordSale.validate` tự chặn kỹ thuật lần cuối ở tầng core |
| Phân loại | 🟡 **GIỮ, ĐỔI CÁCH LÀM** — 4 gate sớm này giữ nguyên Ở UI cho UX (không đợi round-trip mới báo lỗi), NHƯNG **chặn thật sự** phải nằm ở validate của `RecordSale` chứ không tin UI-side gate — đúng comment gốc trong chính hàm này ("Chặn thật sự nằm ở confirmPay — chỗ này chỉ là UX"). Core mới cần đảm bảo `RecordSale.validate`/`execute` tự kiểm tra business-day đang mở, không kế thừa "tin tưởng ngầm" là UI đã chặn. |
| Ghi chú | 🔴 Điểm cần soát kỹ khi migrate: legacy có **2 lớp chặn** (sớm ở `onCheckoutClick`, thật ở `confirmPay`) — nếu hệ mới chỉ giữ 1 lớp (UI) mà quên lớp core, đây là hổng thật, không phải lý thuyết (comment gốc ghi rõ lý do). |

### N5 — Khuyến mãi tự động (đồng giá, mua X tặng Y, mang đi giảm giá)

| | |
|---|---|
| Hệ cũ | `computeAllDiscounts()`, `getAppSaleDiscount()`, `checkTogoBeforeCheckout()`, `checkFreeToppingMemberPromo()` — `posgieo.html:8710/7956/8474/8265` |
| Hệ mới | `catalog/promotion.js` — rule engine tổng quát, `tier` bắt buộc khai (togoSettings-tự-chạy vs assistConfig-chỉ-gợi-ý không còn lẫn lộn), `priority`+`exclusivityGroup` tường minh |
| Phân loại | 🟢 **THÊM MỚI** (phần rule engine + tier tường minh) trên nền 🟡 **GIỮ nghiệp vụ** (2 loại khuyến mãi mua-X-tặng-Y và đạt-ngưỡng-giảm-% vẫn là 2 loại thật quán đang dùng) |
| Ghi chú | Xem `FIFO-CHAIN-TRACE-CATALOG-PROMOTION-V1.md`. Đã audit 3 vấn đề (2 tầng lẫn lộn, điều kiện hard-code, chồng khuyến mãi ngầm định — xem header `catalog/promotion.js`) — **core mới đã viết xong phần luật**, còn thiếu: nối UI popup chọn khuyến mãi ở `onCheckoutClick`/`checkFreeToppingMemberPromo` sang gọi engine mới thay vì hard-code 2 nhánh if. |

### N6 — Nhập SĐT tích điểm / tra khách quen

| | |
|---|---|
| Hệ cũ | `lookupCustomer()` — `posgieo.html:20464`; kết quả gán vào `curCustomer` (global) |
| Hệ mới | `loyalty/customer.js` — chuẩn hoá SĐT (84xxx→0xxx), khoá theo SĐT đã chuẩn hoá — **giữ nguyên quyết định nghiệp vụ legacy nguyên văn** |
| Phân loại | 🟡 **GIỮ, ĐỔI CÁCH LÀM** — quy ước chuẩn hoá SĐT giữ y hệt (để khách cũ migrate khớp); đường đọc/ghi đổi từ đọc thẳng `customers/{phone}` sang qua `GetCustomer`-kiểu-query (nếu có) hoặc trực tiếp `loyalty/customer.js` |

### N7 — Chọn phương thức thanh toán

| | |
|---|---|
| Hệ cũ | biến `curPay` ('cash'/'bank'), luồng VietQR riêng cho chuyển khoản (mã `_vietqrOrderId`) |
| Hệ mới | `bill.payments[]` trong `buildBill()` — mảng thay vì 1 field method đơn (chỗ nối sẵn cho thanh toán 1 bill nhiều phương thức, dù legacy hiện tại chỉ có 1) |
| Phân loại | 🟡 **GIỮ, ĐỔI CÁCH LÀM** — 2 phương thức thật (tiền mặt, chuyển khoản) giữ nguyên; cấu trúc dữ liệu đổi từ field string sang mảng `payments[]` |
| Ghi chú | Legacy đã "gỡ ví" (trước có phương thức ví cơ bản kết hợp, giờ bỏ — xem comment `confirmPay` dòng `splitMethod`) → 🔴 **BỎ** hẳn nhánh "ví cơ bản kết hợp tiền mặt/chuyển khoản", không cần mang qua hệ mới. |

### N8 — Xác nhận thanh toán tiền mặt (tính tiền thối)

| | |
|---|---|
| Hệ cũ | `confirmCashPay()` — `posgieo.html:21815`, tính `cashGiven`/`cashChange`, gọi `confirmPay()` |
| Hệ mới | Phần tính tiền thối là UI-only (không cần lên core — core chỉ cần `payments[].amount` cuối cùng) |
| Phân loại | 🟡 **GIỮ, ĐỔI CÁCH LÀM** — giữ nguyên UI tính tiền thối, chỉ đổi điểm gọi cuối |

### N9 — GHI BILL (nút thắt của toàn bộ nghiệp vụ)

| | |
|---|---|
| Hệ cũ | `confirmPay(cashGiven, cashChange)` — `posgieo.html:21828`. Ghi trực tiếp `db.ref('orders_gieogieo/{month}/{day}').child(idemKey).set(order)`. `order` là 1 object phẳng ~25 field tự dựng tay (không qua validate tập trung). |
| Hệ mới | `runtime.command('RecordSale', { bill, deps, allowShortfall })` → `commands/sales.RecordSale` |
| Phân loại | 🟡 **GIỮ nghiệp vụ, ĐỔI HẲN CÁCH LÀM** (thay đổi lớn nhất trong toàn NET) |
| So sánh field | `soldByActorId` 🟢 **THÊM MỚI** (legacy KHÔNG ghi ai bán thật, chỉ gate "có ai đó đang check-in" — đây là field thiếu quan trọng nhất theo `FEATURE-TREE-V1.md §4.7`); `channel.feePct` 🟢 **THÊM MỚI Ở CHỖ ĐỌC** (legacy CÓ ghi `appFeePct` nhưng KHÔNG BAO GIỜ ĐỌC — `plChannelFeeForDay()` hard-code trả 0; core mới trừ thật vào `netRevenue`); `idemKey`/chống double-submit 🟡 **GIỮ, ĐỔI CÁCH LÀM** (legacy tự chế `_checkoutIdemKey` + `_posSubmitBusy` + đọc-trước-khi-ghi; core mới có `operationId` xác định theo `billId` ở tầng `pipeline` — cùng MỤC ĐÍCH, cơ chế idempotency chuẩn hoá thay vì tự chế từng nơi) |
| Ghi chú | Đây là hàm DÀI NHẤT và QUAN TRỌNG NHẤT cần "mổ" khi vào Pha B/C thật — nó gọi trực tiếp 6 nhánh con (N10-N14 + tích điểm + đổi mã) TRONG CÙNG 1 hàm, không tách side-effect. Core mới đã tách qua `plan.events` (N11 loyalty là **event async, không nhét trong lệnh bán** — xem comment `sales.js` "side-effect là handler đăng ký riêng"). |

### N10 — Trừ kho theo định mức (GOGS) → phân bổ FIFO

| | |
|---|---|
| Hệ cũ | `applySalesConsumptionPOS(order, orderId, businessDate)` — `posgieo.html:18085`; gọi `computeConsumptionForOrder()` rồi `unitEngineAllocateConsumption(ingId, qty)` cho từng nguyên liệu, `applyPrepConsumptionPOS` cho BTP |
| Hệ mới | `commands/sales.buildRequirements()` (gộp định mức theo `recipeVersionIds` snapshot trên bill) → `fifo-core/allocation.allocateMany()` → `recipe-cost-btp/cogs.computeCogs()` |
| Phân loại | 🟡 **GIỮ nghiệp vụ, ĐỔI CÁCH LÀM** (FIFO theo lượng), cộng 🟢 **THÊM MỚI nghiêm trọng nhất toàn NET**: `cogsActual` |
| 🔴 Đứt chuỗi lớn nhất (đã audit) | `cogsActual` trong `aggregateOrders()` (quanlygieo.html) **THỰC CHẤT là recipe-theoretical bị đặt tên sai** — Unit/tem legacy KHÔNG lưu giá vốn (`createContainersForReceipt` không có field cost). "COGS actual" theo đúng nghĩa **chưa từng tồn tại** ở hệ cũ. |
| Core mới đã làm | 2 vế tách biệt bắt buộc: `cogsTheoretical` (định mức × giá lịch sử) và `cogsActual` (tổng thật từ `Unit.costBasis` của đúng lô đã FIFO cấp phát) + `variance`. Cấm field tên `cogsActual` mà nội dung là theoretical (invariant R8, `UNIFIED-READ-LAYER-CONTRACT-V1.md §3`). Thiếu dữ liệu Unit → trả `null` kèm lý do, KHÔNG fallback im lặng. |
| Ghi chú | Món chưa khai định mức: legacy chỉ `console.info` rồi bán tiếp lặng lẽ (đã tự vá thành báo Hộp thư Quản lý — `reportMissingRecipePOS`) → core mới hiện **chặn cứng hơn**: `buildRequirements` trả lỗi `PRECONDITION` nếu `line.recipeId` rỗng. **ĐÃ CHỐT 2026-09-17 (xem `BAN-GIAO-V1.md` §2.3a — nguyên tắc vận hành thật đè core): SAI, phải sửa lại.** Core không được thêm điểm chặn mới mà hệ cũ không có — vận hành bán hàng cho khách đang đứng chờ quan trọng hơn. Cách đúng: cho bán tiếp, `cogsTheoretical`/`cogsActual` trả `null` kèm `reason: 'NO_RECIPE'` (đúng khuôn đã dùng cho thiếu `costBasis`), đồng thời phát cảnh báo GAP cho Quản lý — KHÔNG trả lỗi chặn `RecordSale`. **Việc cần làm — chưa sửa code**: đổi `buildRequirements`/`RecordSale.execute` trong `commands/sales.js` theo hướng này. |

### N11 — Tích điểm / tích tem

| | |
|---|---|
| Hệ cũ | `loyaltyProcessAfterPay(phone, billAmount, itemCount, isWallet, billId)` — `posgieo.html:21628`, gọi `loyaltyAddPoints`/`loyaltyAddStamps` (21515/21558) NGAY TRONG `confirmPay()`, có `await` |
| Hệ mới | `plan.events.push({ type: 'SaleCompleted', ... })` trong `RecordSale` (chỉ phát khi có `customerId`) → cần **handler riêng** lắng nghe event này rồi gọi `loyalty/accrual.js` |
| Phân loại | 🟡 **GIỮ nghiệp vụ** (điểm tính trên tổng SAU giảm giá — legacy đúng, giữ nguyên), 🟢 **THÊM MỚI kiến trúc**: tách thành event-driven thay vì gọi thẳng trong lệnh bán |
| 🔴 GAP CÒN TRỐNG (chưa có code) | Đã `grep` toàn `src/layers/`: **không có handler nào lắng nghe `SaleCompleted`/`SaleAmountIncreased`.** `RecordSale`/`RecordAddon` phát event nhưng chưa ai xử lý — nếu đưa vào chạy thật lúc này, khách thanh toán xong sẽ KHÔNG được cộng điểm (thoái lui so với legacy). Đây là việc phải làm TRƯỚC KHI RecordSale được coi là "đủ dùng thay confirmPay". |
| Core mới đã có sẵn (chưa nối) | `loyalty/ledger.js` — sửa đúng lỗi nặng nhất của legacy: `total_points`/`stamp_count` không còn là field cộng dồn trực tiếp trên `customers/{phone}` (không thể dựng lại nếu trôi số) mà là **sổ cái dòng ghi**, số dư là kết quả cộng sổ. |
| Ghi chú addon | `submitAddon` (posgieo.html:22848) KHÔNG gọi `loyaltyProcessAfterPay` — khách trả thêm tiền addon không được cộng điểm (đã audit, `FEATURE-TREE-V1.md §4.16`). `RecordAddon` (sales.js:336) đã phát `SaleAmountIncreased` cho ĐÚNG PHẦN CHÊNH LỆCH — nhưng vẫn treo trên cùng gap "chưa có handler" ở trên. |

### N12 — Đổi tem miễn phí / áp mã giảm giá lúc chốt

| | |
|---|---|
| Hệ cũ | `_finalizeStampFreeAfterPay(billId)` (21355), `_finalizeDiscountAfterPay(billId)` (21241) — trừ `usedCount` của voucher/reward, idempotent theo `billId` |
| Hệ mới | Chưa thấy module riêng tương ứng trong `src/layers/loyalty/` hay `catalog/promotion.js` cho phần "tiêu thụ" voucher (chỉ thấy phần "cấp" điều kiện) |
| Phân loại | ⚪ **CHƯA QUYẾT / CẦN RÀ THÊM** — cần đọc kỹ `catalog/promotion.js` phần còn lại (chưa đọc hết trong lượt NET này) để xác định đây là 🟡 GIỮ-ĐỔI-CÁCH-LÀM hay còn là 🟢 THÊM MỚI thật (voucher/reward "usedCount" giảm dần là 1 dạng sổ cái riêng, có thể dính đúng lỗi "field cộng dồn" như loyalty). |

### N13 — In hoá đơn + in tem

| | |
|---|---|
| Hệ cũ | `POSPrinter.autoPrintIfEnabled(order)`, `POSTemPrinter.printOrderLabels(order)` — cầu nối LAN tới máy in, không chặn luồng thanh toán |
| Hệ mới | Không thuộc phạm vi FIFO core — đây là I/O phần cứng tại quầy |
| Phân loại | 🟡 **GIỮ NGUYÊN, KHÔNG ĐỤNG** — thuộc "công ty cũ" (DOM/thiết bị), không phải "nhân viên" tính toán nghiệp vụ. Chỉ cần đảm bảo `order`/`bill` object truyền vào 2 hàm in này lấy đúng field từ kết quả `RecordSale` (billCode, items, giá) sau khi đổi nguồn ghi ở N9. |

### N14 — Mở két tiền

| | |
|---|---|
| Hệ cũ | `POSPrinter.openCashDrawerIfConnected()`, điều kiện `orderCashAmountPOS(order) > 0` |
| Phân loại | 🟡 **GIỮ NGUYÊN** — cùng lý do N13, phần cứng tại quầy, không phải nghiệp vụ core |

### N15 — Gọi thêm topping sau khi bill đã lưu (addon, trong 10 phút)

| | |
|---|---|
| Hệ cũ | `submitAddon`/`_submitAddonImpl` — `posgieo.html:22848/22855` |
| Hệ mới | `commands/sales.RecordAddon` |
| Phân loại | 🟡 **GIỮ nghiệp vụ** (add-only trong cửa sổ 10 phút, trừ kho theo đúng phần chênh lệch — đúng đắn của legacy, giữ nguyên) + 🟢 **THÊM MỚI**: phát `SaleAmountIncreased` để loyalty cộng điểm phần chênh lệch (xem N11 — legacy bỏ sót hoàn toàn) |
| Ghi chú | Cùng treo trên gap "chưa có handler lắng nghe event" ở N11. |

### N16 — Chốt sổ tháng / Mở lại tháng đã chốt

| | |
|---|---|
| Hệ cũ | `chotSoThang()` (quanlygieo.html:6656), `moLaiThang()` (quanlygieo.html:6689) |
| 🔴 Đứt chuỗi đã audit | `moLaiThang()` XOÁ snapshot cũ, và log audit của chính thao tác mở-lại-tháng cũng RỖNG — số liệu cũ biến mất hoàn toàn khi mở lại, không có v1/v2. |
| Hệ mới | Chưa xác định module cụ thể (ngoài phạm vi Sales thuần — thuộc `compaction/book-snapshot.js`, đã thấy tồn tại nhưng chưa đọc trong lượt NET này) |
| Phân loại | ⚪ **CHƯA QUYẾT — cần đọc `compaction/book-snapshot.js` trong lượt domain "Reporting" hoặc "Reversal/Correction"** để xác nhận có giữ v1 khi retro-correct hay chưa (đã thấy có mention "correction-rebuild giữ v1" trong ghi chú cũ của chain-trace nhưng CHƯA verify lại theo code hiện tại — không khẳng định khi chưa đọc). |

### N17 — Xem P&L theo kênh (tại quán / mang đi / app)

| | |
|---|---|
| Hệ cũ | `plChannelFeeForDay()` (quanlygieo.html:6045) — hard-code `return 0`; `appFeePct` được ghi ở N9 nhưng grep toàn bộ 2 file chỉ ra ĐÚNG 1 kết quả (chính dòng ghi) — không ai đọc |
| Hệ mới | `read-layer/gateway.js:getPnL` (dòng ~256) — `netRevenue` đã trừ `channelFee` THẬT ngay từ lúc `buildBill()` (N9), không đợi tính lại lúc xem báo cáo |
| Phân loại | 🟢 **THÊM MỚI** (nối đường ống đã có dữ liệu nhưng chưa từng chạy) |

---

## LIÊN KẾT CHÉO DOMAIN (cross-domain edges)

| Từ node | Sang domain | File chain-trace liên quan | Trạng thái liên kết |
|---|---|---|---|
| N1, N3 | Catalog | `FIFO-CHAIN-TRACE-CATALOG-PROMOTION-V1.md` | Menu/giá/công thức đọc từ Catalog — POS chỉ ĐỌC, sửa thật ở QUANLY |
| N5 | Promotion | `FIFO-CHAIN-TRACE-CATALOG-PROMOTION-V1.md` §4-7 | core mới đã viết luật (`catalog/promotion.js`), UI chưa nối |
| N6, N11, N15 | Loyalty | `FIFO-CHAIN-TRACE-LOYALTY-V1.md` | core mới đã viết 3 module (customer/accrual/ledger), **THIẾU handler nối event** — gap chặn đường, không phải lý thuyết |
| N10 | Raw Material / BTP | `FIFO-CHAIN-TRACE-RAW-MATERIAL-V1.md`, `FIFO-CHAIN-TRACE-BTP-V1.md` | FIFO allocation dùng chung `fifo-core/allocation.js` cho cả 2 domain trong 1 `WorkingSet` — 1 bill có cả nguyên liệu thô lẫn BTP thì dùng CHUNG allocation, không tách 2 lượt (khác legacy: legacy gọi `applyStockTransactionPOS` và `applyPrepConsumptionPOS` RIÊNG, 2 lượt async khác nhau — core mới gộp làm 1 WorkingSet để "các món dùng chung nguyên liệu không đọc số dư cũ của nhau", đúng theo comment `sales.js`) |
| N4, N9 | Alerts | `FIFO-CHAIN-TRACE-ALERTS-V1.md` | món chưa khai định mức — legacy báo Hộp thư (soft), core mới chặn cứng (`PRECONDITION`) — xem N10 ⚪ CHƯA QUYẾT |
| N10, N17 | Reporting | `FIFO-CHAIN-TRACE-REPORTING-V1.md`, `FIFO-CHAIN-TRACE-SALES-COGS-PL-V1.md` | `getCOGS`/`getPnL` đã có 2 vế COGS + channel fee — đây là điểm core mới ĐẦY ĐỦ HƠN legacy nhiều nhất trong toàn domain Sales |
| N9 (huỷ bill) | Reversal/Correction | `FIFO-CHAIN-TRACE-REVERSAL-CORRECTION-V1.md` | chưa lần theo trong lượt NET này — hệ quả huỷ bill lên FIFO/Loyalty cần 1 NET riêng hoặc phụ lục nối vào đây sau |

---

## TỔNG KẾT PHÂN LOẠI (đếm nhanh cho domain Sales)

- 🔴 **BỎ**: 1 (nhánh "ví cơ bản kết hợp" ở N7 — đã bỏ ngay từ trong chính legacy, không mang qua)
- 🟡 **GIỮ, ĐỔI CÁCH LÀM**: N1, N3, N4, N6, N7, N8, N9(khung), N10(khung), N11(khung nghiệp vụ), N13, N14, N15(khung)
- 🟢 **THÊM MỚI**: `soldByActorId` (N9), `channel.feePct` được ĐỌC thật (N9, N17), `cogsActual` thật (N10), event-driven loyalty (N11, N15), rule engine khuyến mãi tường minh (N5), loyalty ledger thay field cộng dồn (N11)
- ⚪ **CHƯA QUYẾT**: đá có ảnh hưởng định mức không (N2), cơ chế voucher/reward "usedCount" (N12), số phận `moLaiThang`/versioning sổ tháng (N16)
- ✅ **MỚI CHỐT (2026-09-17)**: N10 — thiếu định mức KHÔNG chặn bán, theo nguyên tắc "vận hành thật đè core" (`BAN-GIAO-V1.md` §2.3a). `commands/sales.js` cần sửa lại theo hướng này (chưa sửa).

## VIỆC PHẢI LÀM TRƯỚC KHI COI N9 (RecordSale) LÀ "ĐỦ DÙNG THAY confirmPay"

Thứ tự theo mức chặn đường (chặn cứng trước, tinh chỉnh sau):

1. **Viết handler lắng nghe `SaleCompleted`/`SaleAmountIncreased`** gọi
   `loyalty/accrual.js` — hiện KHÔNG có, nếu chuyển sang `RecordSale` ngay bây
   giờ thì tích điểm/tem sẽ CHẾT so với legacy (thoái lui thật, không phải lý
   thuyết).
2. **Sửa `buildRequirements`/`RecordSale` — bỏ chặn cứng khi thiếu định mức**
   (N10) — theo nguyên tắc "vận hành thật đè core" vừa chốt: cho bán tiếp,
   trả `cogsTheoretical`/`cogsActual: null, reason: 'NO_RECIPE'`, phát cảnh
   báo GAP cho Quản lý thay vì trả lỗi `PRECONDITION` chặn `RecordSale`.
3. Nối UI `onCheckoutClick`/`checkFreeToppingMemberPromo`/`checkTogoBeforeCheckout`
   sang gọi `catalog/promotion.js` thay vì 2 nhánh if hard-code (N5).
4. Đảm bảo `RecordSale.validate`/`execute` tự chặn business-day/shift — không
   thừa hưởng ngầm "UI đã chặn rồi" (N4). Đây là chặn hệ cũ ĐÃ có (không phải
   điểm chặn mới) nên không vi phạm nguyên tắc ở mục 2.
5. Quyết định field `ice` có cần lên `BillLine` hay là UI/tem-only (N2).
6. Đọc `catalog/promotion.js` phần còn lại + `compaction/book-snapshot.js` để
   đóng 2 mục ⚪ CHƯA QUYẾT còn lại (N12, N16) — có thể đóng ngay trong domain
   Sales hoặc để lại cho lượt NET domain Loyalty/Reporting.
7. Rà toàn bộ core mới (không chỉ Sales) tìm các `R.err('PRECONDITION', ...)`
   khác có thể là điểm chặn MỚI so với hệ cũ, theo đúng nguyên tắc §2.3a —
   `buildRequirements` (N10) chỉ là ca đầu tiên phát hiện được, nhiều khả năng
   không phải ca duy nhất.

## Ca liên quan đã rà — KHÁC LOẠI với N10, cần chủ quán trả lời riêng

`RecordSale` (sales.js:247) còn 1 chặn cứng khác: **hết nguyên liệu thật**
(`alloc.shortfalls.length && !input.allowShortfall` → `PRECONDITION`). Comment
gốc ghi: bán tiếp khi âm kho "không ai chặn (đúng lỗi legacy)" — tức hệ CŨ
CHƯA TỪNG chặn bán khi hết hàng, và core mới coi đó là lỗi cần sửa, mặc định
chặn (có cờ `allowShortfall` để tắt).

**Đây KHÔNG cùng loại với N10.** N10 chặn vì THIẾU DỮ LIỆU SỔ SÁCH (chưa khai
định mức — hành chính, không liên quan hàng có thật hay không). Chặn này lại
là do THIẾU HÀNG THẬT (không còn nguyên liệu để pha) — tín hiệu vận hành thật,
không phải khoảng trống hành chính. Áp nguyên tắc §2.3a máy móc vào đây (mở
`allowShortfall` mặc định true để không chặn gì) sẽ khôi phục đúng lỗi bán-âm-
kho mà legacy mắc phải — không chắc đó là điều chủ quán muốn.

→ ⚪ **CẦN CHỦ QUÁN QUYẾT ĐỊNH RIÊNG** (không tự suy diễn theo §2.3a): giữ chặn
cứng khi hết hàng thật (khác legacy nhưng có chủ đích), hay vẫn cho bán tiếp
kèm cảnh báo (giữ đúng hành vi legacy, chấp nhận rủi ro âm kho như cũ)? Cùng
mẫu này lặp lại ở `commands/inventory.js:68` (RecordWaste, cờ `allowUntracked`)
và `commands/prep.js:79` (RecordPrepProduction, KHÔNG có cờ thoát — luôn chặn).
