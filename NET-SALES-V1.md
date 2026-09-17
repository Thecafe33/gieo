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
| Phân loại | ✅ **ĐÃ CHỐT VÀ ĐÃ SỬA (2026-09-17)** |
| Quyết định chủ quán | *"cửa hàng chỉ có 'đá chung' 'đá riêng' 'không đá' không có ít nhiều gì ở đâu cả, nên cứ mặc định cái nào cũng trừ 1 lượng đá theo cài đặt là được, nhưng cũng nên có chỗ bật tắt theo lượng đá cogs nếu cần thiết."* |
| Đã sửa | `catalog/ice.js` (module mới) — versioned qua `compaction/versioned-input` (kind `iceCogs`, `subjectId: '__default__'` toàn cửa hàng). `enabled`/`itemId`/`qtyPerCup` nằm trong payload đã versioned, nên bật/tắt hay đổi lượng đá KHÔNG làm trôi COGS bill cũ. `commands/sales.js buildBill` nhận `line.ice` (mặc định `'CHUNG'` như legacy `cartIceDefault`, hoặc `bill.iceDefault`) — CHỈ để in tem/nhãn, KHÔNG rẽ nhánh COGS. `buildRequirements` trừ kho theo `catalog/ice.js#toRequirement(resolved, cups)` — ĐỒNG NHẤT theo tổng số ly của bill, bất kể khách chọn đá chung/đá riêng/không đá. Chưa cấu hình thì mặc định TẮT (không đoán mò nguyên liệu/lượng đá của quán). |
| Test | `tests/unit/sales-cogs.test.js` — `catalog/ice`, N2 mức đá trên dòng, N2 RecordSale integration (trừ đúng theo số ly dù chọn 'không đá'). |

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
| Phân loại | ✅ **ĐÃ ĐÓNG** — 4 gate sớm giữ Ở UI cho UX (không đợi round-trip mới báo lỗi) như audit yêu cầu; phần **chặn thật sự** (business-day đang mở) đã có sẵn Ở TẦNG CORE, không tin UI-side gate — nhưng KHÔNG phải do `RecordSale` tự viết check riêng, mà do `commands/pipeline.js` áp `requiresOpenDay` CHO MỌI command có `mutates: true` (mặc định, không cần khai riêng — xem `defineCommand`): `pipeline.run()` gọi `ctx.assertOperable(command.name)` (→ `store-context/business-day.js#assertOperable`, chặn nếu `day.status !== 'OPEN'`) TRƯỚC `validate`/`execute`. `RecordSale` có `mutates: true`, không override `requiresOpenDay`, nên gate này đã áp dụng, đã test riêng cho đúng command này ở `tests/unit/store-context-access.test.js:280` (`assertErr(preAuth.assertOperable('RecordSale'), 'PRECONDITION')`). Không cần thêm code hay test. |
| Ghi chú | 3 gate còn lại (ca đã mở/checklist đầu ca/có ai check-in) đúng theo Phân loại ở trên là UI-only theo chính audit gốc ("4 gate sớm này giữ nguyên Ở UI") — không nằm trong yêu cầu "chặn thật ở core" mà audit nêu (audit chỉ nói rõ business-day, trích đúng comment gốc "Chặn thật sự nằm ở confirmPay"), nên không cần nâng lên core. Nếu sau này phát sinh nhu cầu (vd. quy trách nhiệm ca chưa mở mà vẫn bán), đó là quyết định nghiệp vụ mới, ngoài phạm vi đợt audit này. |

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
| Hệ mới | `runtime.command('RecordSale', { bill, deps })` → `commands/sales.RecordSale` |
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
| Ghi chú | Món chưa khai định mức: legacy chỉ `console.info` rồi bán tiếp lặng lẽ (đã tự vá thành báo Hộp thư Quản lý — `reportMissingRecipePOS`). **ĐÃ SỬA (2026-09-17, theo quyết định §2.3a cùng ngày)**: `buildRequirements` không còn trả `PRECONDITION` khi `line.recipeId` rỗng — ghi nhận vào `gapLines`, KHÔNG suy đoán requirements cho dòng đó (bao bì/tem vẫn tính bình thường, không phụ thuộc recipe). `RecordSale.execute` truyền `gapLineCount` sang `recipe-cost-btp/cogs.computeCogs()`: khi có ≥1 dòng gap, **CẢ HAI vế COGS của cả bill** về `null` kèm `cogsTheoreticalReason`/`cogsActualReason: 'NO_RECIPE'` (không chỉ phần thiếu — vì requirements của dòng gap hoàn toàn vắng mặt nên tổng còn lại KHÔNG PHẢI con số đầy đủ của bill, dù tính "trọn vẹn" theo dữ liệu đang có; số đã tính được vẫn giữ ở `cogsTheoreticalPartial`/`cogsActualPartial`, không mất). Đồng thời phát event `MissingRecipeDetected` (gộp theo `menuItemId`, không phải theo dòng) → `bootstrap/domain-events.js` (L9) → `RaiseAlert` loại `MISSING_RECIPE` (đã có sẵn trong `alerts/alert.js TYPES`, `AUTO_VERIFIABLE` — tự hết khi khai định mức xong). 4 test mới ở `sales-cogs.test.js` + 1 ở `finance-alerts.test.js` (route). |

### N11 — Tích điểm / tích tem

| | |
|---|---|
| Hệ cũ | `loyaltyProcessAfterPay(phone, billAmount, itemCount, isWallet, billId)` — `posgieo.html:21628`, gọi `loyaltyAddPoints`/`loyaltyAddStamps` (21515/21558) NGAY TRONG `confirmPay()`, có `await` |
| Hệ mới | `plan.events.push({ type: 'SaleCompleted', ... })` trong `RecordSale` (chỉ phát khi có `customerId`) → cần **handler riêng** lắng nghe event này rồi gọi `loyalty/accrual.js` |
| Phân loại | 🟡 **GIỮ nghiệp vụ** (điểm tính trên tổng SAU giảm giá — legacy đúng, giữ nguyên), 🟢 **THÊM MỚI kiến trúc**: tách thành event-driven thay vì gọi thẳng trong lệnh bán |
| ✅ ĐÃ ĐÓNG (qua L9) | **Cập nhật**: `bootstrap/domain-events.js` nay có route `SaleCompleted` → `AccrueLoyaltyForSale` và `SaleAmountIncreased` → `AccrueLoyaltyForAddon` (`commands/loyalty.js`), chạy qua `bootstrap/runtime.js#dispatchDomainEvents()` ngay sau khi `RecordSale`/`RecordAddon` commit — không còn "chưa ai xử lý". Xem `NET-LOYALTY-V1.md` mục L9. Gap này KHÔNG còn chặn việc coi `RecordSale` là "đủ dùng thay `confirmPay`". |
| Core mới đã có sẵn (chưa nối) | `loyalty/ledger.js` — sửa đúng lỗi nặng nhất của legacy: `total_points`/`stamp_count` không còn là field cộng dồn trực tiếp trên `customers/{phone}` (không thể dựng lại nếu trôi số) mà là **sổ cái dòng ghi**, số dư là kết quả cộng sổ. |
| Ghi chú addon | `submitAddon` (posgieo.html:22848) KHÔNG gọi `loyaltyProcessAfterPay` — khách trả thêm tiền addon không được cộng điểm (đã audit, `FEATURE-TREE-V1.md §4.16`). `RecordAddon` (sales.js:336) đã phát `SaleAmountIncreased` cho ĐÚNG PHẦN CHÊNH LỆCH — nhưng vẫn treo trên cùng gap "chưa có handler" ở trên. |

### N12 — Đổi tem miễn phí / áp mã giảm giá lúc chốt

| | |
|---|---|
| Hệ cũ | `_finalizeStampFreeAfterPay(billId)` (21355), `_finalizeDiscountAfterPay(billId)` (21241) — trừ `usedCount` của voucher/reward, idempotent theo `billId` |
| Hệ mới | Chưa thấy module riêng tương ứng trong `src/layers/loyalty/` hay `catalog/promotion.js` cho phần "tiêu thụ" voucher (chỉ thấy phần "cấp" điều kiện) |
| Phân loại | ✅ **ĐÃ CHỐT VÀ ĐÃ SỬA — CHỈ PHẦN "ĐỔI TEM" (2026-09-17)** |
| Quyết định chủ quán | *"bạn thấy an toàn thì làm, bước chọn, áp mã, đổi mã có thể dùng ngay sau bước xin sdt tích điểm, trước bước hình thức thanh toán."* |
| **QUAN TRỌNG — xung đột với quyết định CŨ hơn** | `FEATURE-TREE-V1.md` §4.5 + `GIEO-REBUILD-HANDOFF-V2.md` đã ghi nhận MỘT chỉ đạo trực tiếp KHÁC, TRƯỚC ĐÓ, của chính chủ quán: *"KHÔNG đưa `rewards`/`myGifts`/mã giảm giá nhập tay vào hệ thống mới ... Nếu sau này cần lại, đó là feature MỚI thiết kế từ đầu, không phải migrate dữ liệu `rewards` cũ."* — lý do: tàn dư hệ 1.0, không có UI tạo ở cả 2 app, dữ liệu tới từ nguồn ngoài phạm vi rebuild. Vòng hỏi-đáp dẫn tới câu trả lời "bạn thấy an toàn thì làm" ở trên KHÔNG nhắc lại quyết định cũ này — có khả năng chủ quán trả lời mà không có ngữ cảnh đó trước mắt. **Đã xử lý theo hướng an toàn nhất**: chỉ xây phần "đổi tem" (tem tích luỹ → ly miễn phí), vì đây là phần DUY NHẤT vẫn nằm trong phạm vi đã chốt (`packages/loyalty` giữ "Stamp-free" — chỉ cắt Voucher/Discount code). KHÔNG xây "áp mã giảm giá"/voucher — giữ nguyên quyết định cắt cũ. Nếu chủ quán thực sự muốn mở lại mã giảm giá, cần xác nhận LẠI rõ ràng vì nó đảo ngược một chỉ đạo trực tiếp đã ghi nhận trước đó. |
| Đã sửa | `loyalty/accrual.js#redeemStamps` (đã có sẵn từ trước, chưa từng được gọi) — trừ 6 tem/cộng 1 `FREE_DRINKS` vào SỔ (không phải field `usedCount` cộng dồn như legacy). `commands/sales.js buildBill` nhận `spec.redemption = { type: 'STAMP_FREE_DRINK' }` (bắt buộc `customerId`, bắt buộc ĐÚNG 1 dòng `isFree`) và `line.isFree` (amount về 0, nhưng qty/price giữ nguyên — ly free vẫn tiêu tốn kho thật, đi qua FIFO/COGS như món thường, đúng `loyalty/accrual.js` §3). `RecordSale.execute()` gọi `redeemStamps` TRỰC TIẾP (không qua event/handler như tích điểm) vì đổi tem là ĐIỀU KIỆN của giá bill, phải cùng thành/bại với chính giao dịch — không đủ tem thì bill không được chốt với dòng miễn phí đó, tránh lặp lại đúng kiểu race mà legacy phải chống bằng Firestore transaction riêng. |
| Test | `tests/unit/sales-cogs.test.js` — bill model (dòng `isFree`, validate `redemption`), RecordSale integration (đủ tem → chốt + ghi sổ; thiếu tem → từ chối, không âm thầm cho miễn phí). |

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
| Hệ mới | `compaction/book-snapshot.js#createBook()` — `close()` tạo revision 1 (CLOSED), `correct()` (§3.3) tạo revision MỚI tăng dần và đánh dấu bản trước SUPERSEDED, giữ TOÀN BỘ lịch sử — khác hẳn `moLaiThang()` của legacy (xoá snapshot cũ, audit log rỗng). |
| Phân loại | ✅ **ĐÃ CHỐT VÀ ĐÃ SỬA (2026-09-17)** |
| Quyết định chủ quán | *"giữ lại thêm 1 tháng, sau tháng nữa thì không cần giữ lại, VD: tháng 8 đã snapshot thì nó vẫn giữ lại trong suốt tháng 9, khi qua tháng 10 -> không cần giữ lại nữa, vì không ai sửa số liệu của 2 tháng trước cả!"* |
| Đã sửa | `compaction/book-snapshot.js#createBook().retention(period, asOfPeriod)` (§3.4, method mới) — kỳ THÁNG `period` chốt xong thì `retainedThrough = period + 1 tháng`; `purgeEligible = true` khi `asOfPeriod` đã qua ĐỦ 2 tháng kể từ `period` (vd chốt 2026-08 → còn giữ suốt 2026-09 → qua 2026-10 mới `purgeEligible`). CỐ Ý KHÔNG chặn `correct()` khi đã qua cửa sổ giữ — quyết định của chủ quán là chính sách GIỮ/PURGE, không phải yêu cầu chặn sửa muộn; đúng nguyên tắc `compaction/purge.js`: "Tuổi chỉ chọn ứng viên, không cấp quyền xoá" — `retention()` chỉ là GỢI Ý ứng viên purge cho tiến trình nền, KHÔNG tự xoá gì (purge thật vẫn phải qua `compaction/purge.js#check()` với `unresolvedCorrections`/`unresolvedReferences`). |
| Test | `tests/unit/compaction.test.js` §3.4 — retention qua các mốc tháng, qua năm mới, kỳ chưa chốt bị từ chối, kỳ dạng ngày bị từ chối (khái niệm "giữ thêm 1 tháng" chỉ áp dụng cho kỳ THÁNG), `correct()` vẫn hoạt động dù đã qua cửa sổ giữ mặc định. |

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
| N4, N9 | Alerts | `FIFO-CHAIN-TRACE-ALERTS-V1.md` | món chưa khai định mức — legacy báo Hộp thư (soft), core mới cũng KHÔNG chặn cứng (đã sửa theo §2.3a) — xem N10 ✅ ĐÃ SỬA; hết nguyên liệu thật cũng đã chốt KHÔNG chặn, xem mục "Ca liên quan đã rà" |
| N10, N17 | Reporting | `FIFO-CHAIN-TRACE-REPORTING-V1.md`, `FIFO-CHAIN-TRACE-SALES-COGS-PL-V1.md` | `getCOGS`/`getPnL` đã có 2 vế COGS + channel fee — đây là điểm core mới ĐẦY ĐỦ HƠN legacy nhiều nhất trong toàn domain Sales |
| N9 (huỷ bill) | Reversal/Correction | `FIFO-CHAIN-TRACE-REVERSAL-CORRECTION-V1.md` | chưa lần theo trong lượt NET này — hệ quả huỷ bill lên FIFO/Loyalty cần 1 NET riêng hoặc phụ lục nối vào đây sau |

---

## TỔNG KẾT PHÂN LOẠI (đếm nhanh cho domain Sales)

- 🔴 **BỎ**: 1 (nhánh "ví cơ bản kết hợp" ở N7 — đã bỏ ngay từ trong chính legacy, không mang qua)
- 🟡 **GIỮ, ĐỔI CÁCH LÀM**: N1, N3, N6, N7, N8, N9(khung), N10(khung), N11(khung nghiệp vụ), N13, N14, N15(khung)
- 🟢 **THÊM MỚI**: `soldByActorId` (N9), `channel.feePct` được ĐỌC thật (N9, N17), `cogsActual` thật (N10), event-driven loyalty (N11, N15), rule engine khuyến mãi tường minh (N5), loyalty ledger thay field cộng dồn (N11)
- ✅ **MỚI CHỐT VÀ ĐÃ SỬA (2026-09-17)**: N2 (đá trừ kho đồng nhất + chỗ bật tắt), N12 (đổi tem lấy ly miễn phí — mã giảm giá/voucher KHÔNG xây, giữ nguyên quyết định cắt cũ ở `FEATURE-TREE-V1.md` §4.5), N16 (retention sổ tháng — giữ thêm đúng 1 tháng). Chi tiết ở từng mục N2/N12/N16 phía trên.
- ✅ **MỚI CHỐT VÀ ĐÃ SỬA (2026-09-17)**: N10 — thiếu định mức KHÔNG chặn bán, theo nguyên tắc "vận hành thật đè core" (`BAN-GIAO-V1.md` §2.3a). `commands/sales.js` đã sửa xong (`gapLines` + `MissingRecipeDetected` → alert `MISSING_RECIPE`), xem chi tiết ở N10.
- ✅ **MỚI CHỐT VÀ ĐÃ SỬA (2026-09)**: hết nguyên liệu thật KHÔNG chặn bán/nấu/ghi hao hụt (SOP cho thay nguyên liệu khi hết) — `sales.js`/`prep.js`/`inventory.js` đã sửa xong (dùng `allocation.handleShortfall` §3.3, alert `UNIT_NEEDS_REVIEW`/`UNTRACKED_CONSUMPTION`), xem mục "Ca liên quan đã rà".
- ✅ **RÀ LẠI, KHÔNG CẦN SỬA (2026-09-17)**: N4 — chặn business-day thật ở `RecordSale` đã có sẵn từ trước, qua gate chung `requiresOpenDay` của `commands/pipeline.js` (áp cho mọi command `mutates: true`), không phải code riêng cho `RecordSale`; đã có test ở `tests/unit/store-context-access.test.js:280`. Chỉ là sửa tài liệu cho đúng thực tế code, không đổi code.

## VIỆC PHẢI LÀM TRƯỚC KHI COI N9 (RecordSale) LÀ "ĐỦ DÙNG THAY confirmPay"

Thứ tự theo mức chặn đường (chặn cứng trước, tinh chỉnh sau):

1. ~~**Viết handler lắng nghe `SaleCompleted`/`SaleAmountIncreased`** gọi
   `loyalty/accrual.js`~~ — **ĐÃ XONG** qua L9 (`bootstrap/domain-events.js` route
   → `commands/loyalty.js AccrueLoyaltyForSale`/`AccrueLoyaltyForAddon`). Xem N11.
2. ~~**Sửa `buildRequirements`/`RecordSale` — bỏ chặn cứng khi thiếu định mức**
   (N10)~~ — **ĐÃ XONG**: cho bán tiếp, `cogsTheoretical`/`cogsActual` về
   `null, reason: 'NO_RECIPE'`, phát `MissingRecipeDetected` → alert
   `MISSING_RECIPE` cho Quản lý qua L9, không còn trả `PRECONDITION` chặn
   `RecordSale`. Xem N10.
3. Nối UI `onCheckoutClick`/`checkFreeToppingMemberPromo`/`checkTogoBeforeCheckout`
   sang gọi `catalog/promotion.js` thay vì 2 nhánh if hard-code (N5).
4. ~~**Đảm bảo `RecordSale.validate`/`execute` tự chặn business-day** — không
   thừa hưởng ngầm "UI đã chặn rồi" (N4)~~ — **ĐÃ ĐÓNG (rà lại 2026-09-17)**:
   không cần code riêng, `commands/pipeline.js` đã áp `requiresOpenDay`
   (mặc định `true` khi `mutates: true`) cho MỌI command mutate, gồm cả
   `RecordSale` — `pipeline.run()` tự gọi `ctx.assertOperable('RecordSale')`
   trước `validate`/`execute`. Đã có test riêng đúng command này ở
   `tests/unit/store-context-access.test.js:280`. 3 gate sớm còn lại (ca
   mở/checklist/check-in) đúng ý audit là để lại UI-only, không cần nâng
   lên core — xem N4.
5. ~~Quyết định field `ice` có cần lên `BillLine` hay là UI/tem-only (N2).~~ —
   **ĐÃ ĐÓNG (2026-09-17)**: lên `BillLine` để in tem, KHÔNG rẽ nhánh COGS —
   xem N2.
6. ~~Đọc `catalog/promotion.js` phần còn lại + `compaction/book-snapshot.js` để
   đóng 2 mục ⚪ CHƯA QUYẾT còn lại (N12, N16)~~ — **ĐÃ ĐÓNG (2026-09-17)**:
   N12 chỉ đóng phần "đổi tem" (mã giảm giá/voucher giữ nguyên quyết định cắt
   cũ — xem ghi chú xung đột ở N12); N16 đóng bằng
   `compaction/book-snapshot.js#retention()`. Xem chi tiết ở từng mục.
7. ~~Rà toàn bộ core mới (không chỉ Sales) tìm các `R.err('PRECONDITION', ...)`
   khác có thể là điểm chặn MỚI so với hệ cũ, theo đúng nguyên tắc §2.3a~~ —
   **ĐÃ RÀ (2026-09-17)**: grep toàn bộ `src/layers/commands/*.js` (13 chỗ),
   phân loại từng cái:
   - `sales.js`, `inventory.js`, `prep.js` — 3 ca shortfall-nguyên-liệu đã
     biết, xem mục "Ca liên quan đã rà" bên dưới — **✅ chủ quán đã chốt và đã
     sửa xong (2026-09), không còn treo.**
   - `approval.js` (3 chỗ) — chặn duyệt lại phiếu đã xử lý (§27 invariant 8),
     là guard chống ghi đúp/idempotency, không phải chặn do THIẾU METADATA —
     không thuộc phạm vi §2.3a.
   - `shift.js` (5 chỗ) — đoạn ca đã đóng / phải đếm tiền trước khi chốt / phải
     chốt đoạn trước khi mở đoạn kế. Đã đối chiếu `posgieo.html`/`quanlygieo.html`:
     legacy CÓ chặn tương đương ("Cần đếm tiền bàn giao trước khi check-out" —
     `posgieo.html:13991`; luồng giao ca tuần tự) — không phải chặn mới.
   - `takeover.js` (2 chỗ) — chặn của quy trình TIẾP NHẬN DỮ LIỆU MỘT LẦN (P13
     cutover), không phải nghiệp vụ bán/vận hành sống hàng ngày — §2.3a không
     áp dụng (không có "hệ cũ" để so vì đây là công cụ mới hoàn toàn).
   **Kết luận: không có ca MỚI nào ngoài 3 ca đã biết.** Không cần sửa code.

## Ca liên quan đã rà — hết nguyên liệu thật — ✅ ĐÃ CHỐT VÀ ĐÃ SỬA (2026-09)

`RecordSale` (sales.js) từng có 1 chặn cứng khác ngoài N10: **hết nguyên liệu
thật** (`alloc.shortfalls.length && !input.allowShortfall` → `PRECONDITION`).
Đây KHÔNG cùng loại với N10 — N10 chặn vì THIẾU DỮ LIỆU SỔ SÁCH (chưa khai
định mức, hành chính), còn chặn này là do THIẾU HÀNG THẬT (không còn nguyên
liệu để pha) — tín hiệu vận hành thật, nên KHÔNG tự suy diễn theo §2.3a, đã
treo chờ chủ quán quyết định riêng.

**Chủ quán đã chốt (2026-09)**: *"Hết nguyên liệu thật → vẫn cho bán, do SOP
có quy định một vài loại được phép thay thế khi nguyên liệu kia hết."* — tức
KHÔNG chặn, đúng hành vi legacy (bán tiếp, không ai chặn), có chủ đích chứ
không phải bỏ sót.

**Đã sửa cả 3 ca cùng mẫu** (dùng lại cơ chế NỢ tường minh trên Unit đã có sẵn
ở `fifo-core/allocation.js#handleShortfall`, §3.3 — trước đây được viết ra
nhưng chưa từng được tầng command gọi tới):

- `commands/sales.js` (RecordSale) — bỏ chặn `PRECONDITION`, mỗi shortfall đi
  qua `handleShortfall`, Unit gánh nợ gắn `needsReview`
  (`REVIEW.NEGATIVE_REMAINDER`, cùng lý do `finish()` dùng khi báo hết hũ còn
  âm), phát event `IngredientShortfallRecorded` → L9 → alert
  `UNIT_NEEDS_REVIEW` cho Quản lý.
- `commands/prep.js` (RecordPrepProduction) — cùng cơ chế; trước đây CHẶT HƠN
  cả 2 case kia (không có cờ thoát nào).
- `commands/inventory.js` (RecordWaste) — bỏ chặn `!input.allowUntracked`; cơ
  chế untrackedPendingDelta (ghi 1 dòng sổ `unitId: null`) vốn đã có sẵn từ
  trước giờ chạy KHÔNG ĐIỀU KIỆN, kèm phát `UntrackedConsumptionRecorded` →
  alert `UNTRACKED_CONSUMPTION` (đã có sẵn trong TYPES, chưa từng được raise
  trước bản sửa này).

Cả 3 cờ thoát cũ (`allowShortfall`, `allowUntracked`) đã bỏ — không còn cần
thiết vì hành vi mặc định giờ chính là "không chặn". Test cập nhật ở
`sales-cogs.test.js`, `btp.test.js`, `commands-gap.test.js`, `fifo-core.test.js`.
