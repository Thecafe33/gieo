# NET — CATALOG / MENU / PROMOTION — V1

> Nguồn: `FIFO-CHAIN-TRACE-CATALOG-PROMOTION-V1.md` đối chiếu với
> `src/layers/catalog/menu.js`, `src/layers/catalog/promotion.js`,
> `src/layers/catalog/packaging.js`, `src/layers/commands/sales.js`,
> `src/layers/read-layer/gateway.js`.
>
> Đánh số CP1-CP11 theo ĐÚNG thứ tự 11 mục [1]-[11] của chain-trace gốc để dễ
> đối chiếu ngược. Áp dụng §2.3a cho mọi khả năng chặn checkout mới.

## Sơ đồ luồng (CP1 → CP11)

```
CP1 Cấu trúc Menu item ──► CP9 liên kết Recipe (con trỏ tường minh)
CP2 Category (entity thật)         │
CP3 Sold-out (dẫn xuất từ FIFO) ◄──┘
CP4 togoSettings auto-promo ──► CP7 chồng khuyến mãi (ưu tiên tường minh)
CP5 campaign advisory-only ──►      │
CP6 giảm giá thủ công (5 kiểu) ─────┘
CP8 giá snapshot vào bill (mẫu ĐÚNG, giữ nguyên)
CP10 xoá/đổi tên món (soft-delete, hết mồ côi)
CP11 phân quyền sửa Menu: QUANLY only (đã đúng, không đổi)
```

---

## CP1 — Cấu trúc Menu item

| | |
|---|---|
| **Hệ cũ** | `posgieo.html:8717-8726, 23773-23798` — field tối giản: name, type (free text), color, priceM, priceL. Không có ảnh, sold-out, recipeId, topping riêng theo món. Chain-trace tự ghi: "KHÔNG ĐỨT — đơn giản có chủ đích" |
| **Hệ mới** | `catalog/menu.js` → `createMenuItem()` |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM** |
| **Ghi chú** | Không phải sửa lỗi — cấu trúc mở rộng để đóng CP3/CP9/CP10 (thêm `recipeId` con trỏ tường minh, `archived`/`archivedAt` thay vì `.remove()` cứng, `categoryId` trỏ vào entity thật thay vì free-text `type`). `prices` giữ đúng khái niệm theo size (M/L) như hệ cũ. `recipeId: null` là trạng thái NÓI RA ĐƯỢC ("chưa khai định mức"), khác hẳn hệ cũ chỉ im lặng không tìm thấy key — liên kết trực tiếp với N10 đã chốt ở `NET-SALES-V1.md` (§2.3a: thiếu recipe không được chặn bán, chỉ gắn GAP). |

## CP2 — Category

| | |
|---|---|
| **Hệ cũ** | `posgieo.html:19335, 8032` — GAP: category chỉ là `[...new Set(menu.map(m=>m.type))]` tính lại mỗi lần render, không có thứ tự lưu trữ, không phải entity riêng |
| **Hệ mới** | `catalog/menu.js` → `createCategory()` + `sortCategories()` |
| **Phân loại** | 🟢 **THÊM MỚI** |
| **Ghi chú** | `displayOrder` là field BẮT BUỘC khi tạo category (`validate` từ chối nếu thiếu) — "thứ tự phải được LƯU, không suy ra lúc render". Đóng đúng gap: menu không còn đổi thứ tự ngẫu nhiên giữa các lần tải. |

## CP3 — Sold-out / hết món

| | |
|---|---|
| **Hệ cũ** | Kiểm tra toàn bộ 2 file — 🔴 ĐỨT CHUỖI NẶNG NHẤT trong domain này: không có field/flag hết hàng nào; `renderMenu()` render mọi món luôn bấm được; trừ kho chỉ chạy SAU khi xác nhận bán, không kiểm tra tồn trước; nhân viên bán được vô hạn 1 món dù nguyên liệu = 0 |
| **Hệ mới** | `catalog/menu.js` → `computeAvailability()` |
| **Phân loại** | 🟢 **THÊM MỚI** — nhưng **CHƯA ĐƯỢC GỌI Ở ĐÂU** |
| **Ghi chú** | Thiết kế đúng: khả dụng TÍNH từ tồn kho thật (tham số truyền vào, hàm thuần — `catalog` không import `fifo-core`), không phải cờ tay nên không có chuyện quên bật/tắt; món chưa khai định mức trả `unknown: true` thay vì đoán còn hàng (không bịa số khi thiếu dữ liệu). **NHƯNG**: grep toàn bộ `src/layers/` cho `computeAvailability` chỉ ra ĐÚNG 3 chỗ — định nghĩa, comment header, và export — KHÔNG có nơi nào GỌI hàm này (không phải `read-layer/gateway.js`, không phải `commands/sales.js`). Nghĩa là gap NẶNG NHẤT của toàn chain-trace đã có lời giải đúng ở tầng logic, nhưng CHƯA đóng ở tầng vận hành — chưa có query `GetMenuAvailability` nào đăng ký, chưa có UI POS nào gọi. **Khi nối, phải tuân §2.3a: kết quả `unavailable`/`unknown` chỉ nên làm MỜ nút món trên UI (cảnh báo), KHÔNG tự ý biến thành PRECONDITION chặn cứng ở `buildRequirements` — đó là quyết định vận hành riêng, không tự động suy ra từ việc hàm này tồn tại.** |

## CP4 — togoSettings auto-promotion tại quầy

| | |
|---|---|
| **Hệ cũ** | `checkTogoBeforeCheckout()` (`posgieo.html:8474-8511`) — chỉ 2 dạng cố định (mua X tặng Y theo bội số; đạt ngưỡng số ly → giảm %), tham số cấu hình được nhưng LOGIC ĐIỀU KIỆN hard-code trong hàm — chủ quán không tự tạo dạng thứ 3 được. Chain-trace: "KHÔNG ĐỨT cho 2 dạng có sẵn, chỉ không tổng quát hoá được" |
| **Hệ mới** | `catalog/promotion.js` → `EFFECT.BUY_X_GET_Y` + `EFFECT.PERCENT_OFF`, đánh giá qua `CONDITION` engine tổng quát (`evalCondition()`) thay vì if hard-code |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM** |
| **Ghi chú** | 2 dạng cũ được giữ nguyên nghĩa nghiệp vụ (`computeEffect()` case `BUY_X_GET_Y`/`PERCENT_OFF` tính đúng công thức cũ: `sets = floor(totalQty/buyQty)`, `amt = subtotal * pct/100` có `maxAmount` cap) nhưng điều kiện giờ là DỮ LIỆU (`CONDITION` enum: QTY_TOTAL/QTY_SIZE/QTY_ITEM/QTY_CATEGORY/AMOUNT/CHANNEL/DAY_OF_WEEK/DATE_RANGE) — chủ quán tự tạo dạng thứ 3+ được mà không cần sửa code, đóng đúng giới hạn chain-trace nêu. |

## CP5 — Bộ máy campaign linh hoạt hơn (advisory-only)

| | |
|---|---|
| **Hệ cũ** | `assistConfig.campaigns` (`quanlygieo.html:22442-22485`) cho phép cấu hình điều kiện phong phú NHƯNG `assistProviderCampaigns()` (`posgieo.html:25497-25561`) CHỈ đẩy gợi ý hiển thị, KHÔNG BAO GIỜ tự trừ tiền/thêm quà — 🔴 ĐỨT CHUỖI QUAN TRỌNG: chủ quán dễ hiểu lầm "chiến dịch" sẽ tự chạy |
| **Hệ mới** | `catalog/promotion.js` → `TIER.AUTO_EXECUTE` / `TIER.ADVISORY`, field `tier` BẮT BUỘC không có mặc định |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM** (khái niệm "campaign điều kiện phong phú" giữ) + 🟢 **THÊM MỚI** (khả năng campaign THẬT SỰ tự thực thi — legacy chưa từng có) |
| **Ghi chú** | `createPromotion()` từ chối tạo nếu thiếu `tier` hợp lệ, thông báo thẳng lý do: "lẫn 2 tầng này chính là điểm mơ hồ của hệ thống cũ" — không cho phép lặp lại sự mơ hồ bằng cách bắt buộc khai rõ ngay lúc tạo, không phải chỉ ghi chú UI như legacy (`quanlygieo.html:22353`). `evaluate()` tách `applied` (AUTO_EXECUTE, tự trừ) khỏi `advisory` (chỉ hiện cho nhân viên) — không lẫn 2 danh sách. |

## CP6 — Giảm giá thủ công (Đồng giá đã xoá; Discount code 5 kiểu còn sống nhưng ẩn UI)

| | |
|---|---|
| **Hệ cũ** | Đồng giá (DG): đã XOÁ HẲN code — đúng `DEAD-FEATURE-PRUNING-V1.md`. Discount code (`posgieo.html:20744-20823, 26439-26443`): 5 kiểu (`item_free/item_upsize/item/percent/order`) code CÒN SỐNG ĐẦY ĐỦ, chỉ ô nhập bị ẩn `display:none` |
| **Hệ mới** | `catalog/promotion.js` → `EFFECT` enum (`ITEM_FREE, ITEM_UPSIZE, ITEM_DISCOUNT, ORDER_DISCOUNT, PERCENT_OFF, BUY_X_GET_Y, FREE_TOPPING`) |
| **Phân loại** | 🟡 **GIỮ — chỗ nối sẵn, chưa bắt buộc bật lại** |
| **Ghi chú** | Đúng như "LUỒNG CHUẨN" #7 chain-trace ghi: giữ nguyên thiết kế nghiệp vụ 5 loại, KHÔNG cần thiết kế lại. `computeEffect()` implement đủ cả `ITEM_DISCOUNT`/`ITEM_FREE`/`ITEM_UPSIZE`/`ORDER_DISCOUNT` cộng thêm `FREE_TOPPING` (đóng gap "free topping" đã thấy ở `NET-SALES-V1.md`). Bật/tắt UI là quyết định vận hành của chủ quán, không phải quyết định kiến trúc — không cần quyết ngay. |

## CP7 — Chồng khuyến mãi

| | |
|---|---|
| **Hệ cũ** | `posgieo.html:8491-8507, 20762-20763, 8710-8711` — togoSettings loại trừ nhau theo THỨ TỰ CODE (không field priority); discount-code tự chặn với chính nó và voucher khách nhưng KHÔNG đối chiếu với togoSettings auto-discount (2 biến độc lập). Vô hại hiện tại (discount-code đang ẩn UI) nhưng là lỗ hổng thật nếu bật lại |
| **Hệ mới** | `catalog/promotion.js` → `evaluate()`, field `priority` + `exclusivityGroup` |
| **Phân loại** | 🟢 **THÊM MỚI** |
| **Ghi chú** | MỘT bộ kiểm tra loại trừ DUY NHẤT cho MỌI loại khuyến mãi — `voucher`/`discountCode` của khách truyền vào `extraPromotions` dưới CÙNG hình dạng `Promotion` để chịu chung luật, không còn 2 biến độc lập không đối chiếu nhau như legacy. Sắp theo `priority` giảm dần, tie-break theo `promotionId` để KẾT QUẢ TẤT ĐỊNH (không phụ thuộc thứ tự mảng đầu vào như legacy phụ thuộc thứ tự code). `suppressed[]` nói rõ cái nào bị loại và vì sao — không im lặng bỏ qua. Đóng đúng cả 2 vấn đề legacy: thiếu priority tường minh VÀ thiếu đối chiếu chéo giữa các loại khuyến mãi khác nhau. |

## CP8 — Giá tại thời điểm bán (snapshot)

| | |
|---|---|
| **Hệ cũ** | `posgieo.html:20028-20032, 21858, 21870-21907` — giá snapshot vào cart NGAY lúc thêm món, sao y nguyên vào order đã lưu; báo cáo đọc thẳng `o.itemsArray[].price`, không join lại giá menu hiện tại. Chain-trace: "ĐÂY LÀ PHẦN LÀM ĐÚNG... KHÔNG ĐỨT... mẫu ĐÚNG cần giữ" |
| **Hệ mới** | `catalog/menu.js` → `snapshotPrice()` |
| **Phân loại** | 🟡 **GIỮ NGUYÊN** (không đổi cách làm, chỉ đóng gói thành hàm tường minh) |
| **Ghi chú** | `commands/sales.js` dùng đúng mẫu này (comment dòng 61: "Mỗi dòng mang GIÁ ĐÃ SNAPSHOT — mẫu ĐÚNG"). Đây là domain DUY NHẤT trong toàn NET-series mà chain-trace tự nhận là mẫu tham chiếu để giải thích TẠI SAO Recipe/Payroll/KPI-target/Packaging cần sửa theo hướng versioned — không cần thay đổi gì thêm ở đây. |

## CP9 — Liên kết Recipe

| | |
|---|---|
| **Hệ cũ** | `posgieo.html:17680, 17910-17912` — GAP kiến trúc: không có field liên kết tường minh, chỉ khớp key ngầm `'togo:' + menuItemId`. Không có thao tác "đổi món sang trỏ recipe khác" vì không có con trỏ để đổi |
| **Hệ mới** | `catalog/menu.js` → `recipeId` (field) + `linkRecipe()` |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM** |
| **Ghi chú** | Con trỏ tường minh thay khớp-key-ngầm — đây là "điểm khác biệt quan trọng nhất của domain này" theo chính header file `menu.js`. `linkRecipe()` là thao tác độc lập mà legacy không có. Đóng trực tiếp CP10 (mồ côi dữ liệu) từ GỐC THIẾT KẾ, không cần cơ chế dọn dẹp bù đắp — vì đổi tên không còn cần xoá-tạo-lại nữa (xem CP10). |

## CP10 — Xoá/đổi tên món (rủi ro mồ côi dữ liệu)

| | |
|---|---|
| **Hệ cũ** | `posgieo.html:23800-23810` — xoá món là `.remove()` cứng, không soft-delete, không cascade. 🔴 ĐỨT CHUỖI: xoá-rồi-tạo-lại (cách duy nhất "đổi tên" nếu không sửa tại chỗ) sinh Firebase key MỚI → recipe cũ mồ côi vĩnh viễn; tham chiếu itemId trong togoSettings giftMenu/freeTopping và campaign conditions cũng không được dọn tự động |
| **Hệ mới** | `catalog/menu.js` → `rename()` (sửa field, không xoá-tạo-lại) + `archive()`/`restore()` (soft-delete) |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM** |
| **Ghi chú** | `rename()` chỉ sửa `name`, không tạo item mới → vấn đề mồ côi "biến mất từ gốc thiết kế", đúng như "LUỒNG CHUẨN" #1 chain-trace yêu cầu. `archive()` thay `.remove()` cứng: mọi tham chiếu (khuyến mãi, quà tặng, điều kiện campaign) vẫn resolve được thay vì trỏ vào hư không — comment file tự xác nhận đóng đúng gap §4.1 (2 app cùng ghi thẳng RTDB) bằng việc archive không xoá dữ liệu tham chiếu. |

## CP11 — Migration UI Menu/Promotion POS→QUANLY

| | |
|---|---|
| **Hệ cũ** | `posgieo.html:982,987,2311; quanlygieo.html:1439-1441,1593-1595` — sidebar POS ẩn hẳn "Quản lý Menu"/"Khuyến mãi", comment ghi rõ lý do đã chuyển hẳn sang QUANLY. Chain-trace: "KHÔNG ĐỨT, khớp hoàn toàn phân quyền đã định" |
| **Hệ mới** | Header `catalog/menu.js`: "QUANLY là nơi DUY NHẤT sửa menu (POS chỉ đọc)... Enforce ở tầng command qua `sources:['QUANLY']`, không phải ở đây." |
| **Phân loại** | ⚪ **CHƯA THỂ XÁC NHẬN — tầng command chưa tồn tại** |
| **Ghi chú** | Ý định giữ đúng phân quyền cũ, nhưng **không có `commands/catalog.js`** nào wrap `createMenuItem`/`archive`/`linkRecipe`/`createPromotion` thành pipeline command với `sources:['QUANLY']` — grep xác nhận `catalog/menu`/`catalog/promotion` chỉ được import bởi `commands/sales.js` (đọc `snapshotPrice`/`packaging`, phía BÁN HÀNG) và `read-layer/gateway.js` (đọc `catalog/menu` — có thể là 1 query GetMenu), KHÔNG có phía GHI nào. Enforcement "QUANLY only" hiện chỉ là Ý ĐỊNH ghi trong comment, chưa có code nào thật sự chặn. Đây là phần THIẾU giống RM1 (Receiving) — domain logic đúng nhưng chưa có command-write layer. |

---

## Liên kết chéo domain

| Domain | Điểm nối |
|---|---|
| **Sales/POS** | CP1/CP8/CP9 dùng trực tiếp trong `commands/sales.js` (`snapshotPrice`, `packaging`); CP3's `recipeId: null` liên kết thẳng N10 đã chốt ở `NET-SALES-V1.md` (§2.3a); CP4-CP7's `promotionsApplied`/`discountTotal` là INPUT sẵn có của `buildBill()` — nhưng **`catalog/promotion.evaluate()` chưa được gọi ở bất kỳ đâu trong `commands/sales.js`** — cùng loại gap "logic đúng, chưa nối" như CP3 |
| **Raw Material** | CP9 (con trỏ Recipe) tương tác trực tiếp với recipe versioning đã xác nhận ở BTP (`resolveRecipeAt`) — cùng `compaction/versioned-input` |
| **BTP** | `catalog/packaging.js` cũng dùng `VersionedInput` — "instance #3 của lớp lỗi đã xác nhận 7 lần" (cùng họ với BTP yield, Recipe, Payroll) |

---

## TỔNG KẾT PHÂN LOẠI

- 🟢 THÊM MỚI: **CP2, CP3 (logic đúng nhưng chưa gọi), CP5 (phần AUTO_EXECUTE thật), CP7**
- 🟡 GIỮ, ĐỔI CÁCH LÀM: **CP1, CP4, CP5 (phần khái niệm campaign), CP6, CP9, CP10**
- 🟡 GIỮ NGUYÊN (mẫu đúng, không đổi): **CP8**
- ⚪ CHƯA THỂ XÁC NHẬN (thiếu tầng command): **CP11**

## VIỆC PHẢI LÀM (tích lũy, không chặn)

1. **`catalog/promotion.evaluate()` và `catalog/menu.computeAvailability()` chưa có nơi gọi nào** — cùng một dạng gap với event-dispatch (L9) nhưng khác bản chất: đây không phải thiếu consumer cho SỰ KIỆN, mà thiếu ORCHESTRATION gọi 2 hàm THUẦN đúng lúc checkout. Khi nối, `computeAvailability` phải tuân §2.3a — chỉ cảnh báo/làm mờ, không tự động thành PRECONDITION chặn cứng.
2. **Chưa có `commands/catalog.js`** (CreateMenuItem/ArchiveMenuItem/LinkRecipe/CreatePromotion...) để enforce `sources:['QUANLY']` như comment `menu.js` đã hứa — domain logic đúng, tầng ghi (write-command) chưa tồn tại. Cùng dạng thiếu như Receiving (`NET-RAW-MATERIAL-V1.md` RM1), ưu tiên thấp hơn vì hiện KHÔNG có đường ghi nào khác thay thế nó (không có nguy cơ 2 app cùng ghi thẳng như legacy — chỉ đơn giản là chưa ai gọi được).
3. Khi kích hoạt discount-code (CP6) trở lại: đảm bảo nó đi qua ĐÚNG `catalog/promotion.evaluate()` (dưới hình dạng `extraPromotions`), không tạo đường tính riêng — nếu không sẽ lặp lại đúng gap CP7 vừa đóng.
