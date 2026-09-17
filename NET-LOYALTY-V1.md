# NET — NGHIỆP VỤ TÍCH ĐIỂM / TEM / ĐỔI THƯỞNG (Loyalty) — V1

## Đây là gì

Liên kết `FIFO-CHAIN-TRACE-LOYALTY-V1.md` (đã audit rất kỹ — 1 trong những
chain sạch nhất) với code thật `posgieo.html` và code core mới đã viết
(`src/layers/loyalty/customer.js`, `accrual.js`, `ledger.js`). Domain này làm
ngay sau Sales vì `NET-SALES-V1.md` (N11, N15) đã chỉ thẳng vào đây: core mới
đã viết xong LUẬT tích điểm nhưng chưa có gì GỌI nó.

**Ký hiệu:** 🔴 BỎ · 🟡 GIỮ, ĐỔI CÁCH LÀM · 🟢 THÊM MỚI · ⚪ CHƯA QUYẾT
(giống `NET-SALES-V1.md`).

---

## SƠ ĐỒ VÒNG NGHIỆP VỤ

```
L1 Định danh khách (SĐT) ──► (nối từ N6 của NET-SALES)
        │
        ▼
   [bill thanh toán xong — N9 của NET-SALES]
        │
        ├─► L2 Tích điểm (dine-in) / tích tem (mang đi)
        ├─► L6 Guard chống double-dip (khuyến mãi ↔ điểm, ly tặng ↔ tem)
        └─► L7 Hệ số theo hạng (tier) — chỗ nối sẵn, chưa kích hoạt

L3 Đổi tem lấy ly miễn phí (tại quầy, trước khi thanh toán bill có ly đó)
        │
        ▼
   ly free ĐI QUA CHUNG pipeline trừ kho như món thường (→ NET-SALES N10)

L4 Gọi thêm topping SAU khi bill đã lưu (addon) ──► tích điểm PHẦN CHÊNH LỆCH
   (nối từ N15 của NET-SALES)

L5 Huỷ/xoá bill ──► hoàn điểm/tem cho ĐÚNG phần đã tích của bill đó (hoặc KHÔNG,
   tuỳ policy tường minh)

L8 Lưu trữ số dư — nền của TẤT CẢ các nhánh trên (sổ cái, không phải field)

L9 ĐIỀU PHỐI SỰ KIỆN — nút thắt hiện đang TRỐNG, chặn L2/L4/L5 chạy được thật
```

---

## BẢNG NÚT

### L1 — Định danh khách qua SĐT

| | |
|---|---|
| Hệ cũ | `lookupCustomer()` (`posgieo.html:20464`, chain-trace ghi thêm `:1033, 20459-20469`) — nhập tay, tra `customers/{phone}`, key = SĐT đã chuẩn hoá (84xxx→0xxx). Không scan/QR. |
| Hệ mới | `loyalty/customer.js` — `normalizePhone()` giữ đúng quy ước legacy (để khách cũ migrate khớp số), `createCustomer()` sinh `customerId` xác định theo SĐT (nhập lại cùng số → cùng khách, không tạo trùng) |
| Phân loại | 🟡 **GIỮ, ĐỔI CÁCH LÀM** |
| Ghi chú | `normalizePhone` core mới ĐÒI HỎI regex `^0\d{8,10}$` mới coi là hợp lệ — legacy có validate chặt vậy không chưa kiểm tra lại. Vì đây là bước TUỲ CHỌN (không tích điểm được thì bill vẫn thanh toán bình thường — xem N9 `NET-SALES-V1.md`), theo nguyên tắc §2.3a KHÔNG cần xin phép: không chặn bán, chỉ chặn tích điểm cho đúng số đó — chấp nhận được. |

### L2 — Tích điểm (dine-in) / tích tem (mang đi)

| | |
|---|---|
| Hệ cũ | `posgieo.html:21510-21611, 21628-21660` — `loyaltyAddPoints`/`loyaltyAddStamps`/`loyaltyProcessAfterPay`. 5 điểm/100đ (tại quán), 1 tem/ly tối đa 2 tem/ngày (mang đi), 6 tem → 1 ly free. Tính trên total SAU giảm giá. Idempotent qua marker `loyalty_bill_effects_gieogieo/{billId}` + Firestore transaction + hàng đợi retry (localStorage + `loyalty_pending_retry_gieogieo`). |
| Hệ mới | `loyalty/accrual.accrueForSale()` — **giữ nguyên nguyên văn 4 con số luật** (`DEFAULT_RULES`), tính trên `bill.total` (đã sau giảm giá) |
| Phân loại | 🟡 **GIỮ nghiệp vụ/luật số** + 🟢 **THÊM MỚI kiến trúc**: kết quả là dòng ledger (`loyalty/ledger.createEntry`), không phải cộng thẳng field |
| Ghi chú | Cơ chế idempotent-qua-marker-riêng-lẻ của legacy (rất công phu, tự chế: transaction + retry queue + localStorage) → core mới thay bằng `entryId` xác định theo `(customer, currency, reason, referenceId)` — ghi lại cùng 1 billId không sinh dòng thứ 2. **Cùng mục đích, không cần tự chế retry-queue riêng nữa** vì đây chính là bảo đảm `operationId`/pipeline đã có sẵn cho mọi command khác — không phải nghĩ lại từ đầu cho riêng Loyalty. |

### L3 — Đổi tem lấy ly miễn phí

| | |
|---|---|
| Hệ cũ | `posgieo.html:21295-21341, 8662-8668, 21355-21399` — ly free thêm vào cart y hệt món trả tiền (`price:0`), ĐI QUA CHUNG `applySalesConsumptionPOS` (có trừ FIFO/COGS như món thường — legacy làm ĐÚNG). Trừ tem CHỈ SAU thanh toán thành công, qua transaction + marker `stamp_free_redemptions_gieogieo/{billId}`. |
| Hệ mới | `loyalty/accrual.redeemStamps()` — kiểm số dư từ `ledger.computeBalance()` (sổ, không phải field), trả 2 dòng sổ (`-6 STAMPS`, `+1 FREE_DRINKS`) |
| Phân loại | 🟡 **GIỮ, ĐỔI CÁCH LÀM** — nguyên tắc "quà tặng vẫn tiêu tốn kho thật" giữ y nguyên, chỉ đổi nơi đọc/ghi số dư |
| Về chặn cứng (§2.3a) | `redeemStamps` trả `PRECONDITION` khi không đủ tem — **đây KHÔNG phải điểm chặn mới**, legacy cũng chặn y hệt (không đủ tem thì không cho đổi) — không vi phạm nguyên tắc "vận hành thật đè core". |

### L4 — Addon tích điểm phần chênh lệch

| | |
|---|---|
| Hệ cũ | 🔴 **ĐỨT CHUỖI (đã audit, đã xác nhận lại qua NET-SALES N11/N15)** — `_submitAddonImpl` (`posgieo.html:22848-22919`) gọi lại FIFO/COGS cho phần chênh nhưng KHÔNG hề gọi `loyaltyAddPoints`/`loyaltyAddStamps`. Khách trả thêm tiền, không được cộng thêm điểm. |
| Hệ mới | `loyalty/accrual.accrueForAddon()` — tích cho ĐÚNG `addedAmount`, `referenceId` gồm cả `addonSeq` nên 2 lần addon khác nhau ra 2 dòng khác nhau, lặp cùng `addonSeq` thì trùng `entryId` (không cộng đúp) |
| Phân loại | 🟢 **THÊM MỚI** — đóng đúng gap đã audit |
| 🔴 Vẫn treo | `commands/sales.RecordAddon` (sales.js:336) đã phát event `SaleAmountIncreased` — nhưng KHÔNG có gì gọi `accrueForAddon` cả (xem L9). Logic viết xong, chưa nối dây. |

### L5 — Hoàn điểm/tem khi huỷ bill

| | |
|---|---|
| Hệ cũ | 🔴 **ĐỨT CHUỖI có ghi nhận công khai** (`posgieo.html:18295-18328, 23239-23289`; `quanlygieo.html:10633-10745`) — cả 2 app chỉ hoàn kho, KHÔNG hoàn điểm/tem/voucher. Toast/cảnh báo UI đều nói thẳng "Quản lý xử lý tay" — nhưng **quanlygieo.html không có màn hình nào để xử lý tay cả**, chỉ có 1 dòng ghi `assist_profile` không liên quan. |
| Hệ mới | `loyalty/accrual.reverseForVoidedBill()` — cờ `policy: 'REVERSE' \| 'KEEP'` TƯỜNG MINH; `commands/reversal.js` đã định nghĩa `EVENTS.OrderVoided` + `createEventBus()` (`.on()`/`.emit()`, handler lỗi trả `MANUAL_REVIEW` chứ không nuốt im lặng) |
| Phân loại | 🟢 **THÊM MỚI** (cơ chế tường minh) — nhưng **KHÔNG mặc định coi `REVERSE` là đúng** |
| ⚪ **CẦN CHỦ QUÁN QUYẾT ĐỊNH** | Comment gốc trong `commands/reversal.js` ghi rõ: "xoá bill CỐ Ý không hoàn loyalty (**quyết định nghiệp vụ hợp lệ**, ghi rõ trong comment/toast)". Tức đây KHÔNG chắc là một gap cần đóng — có thể là quyết định ĐÚNG của chủ quán từ trước (huỷ bill không hoàn điểm, tránh khách "ăn gian" bằng cách mua-rồi-huỷ-rồi-mua-lại để nhân điểm). Core mới đã chừa `policy: 'KEEP'` đúng cho tình huống này. **Việc thật sự cần làm không phải "sửa cho hoàn điểm" mà là: (1) chốt `policy` nào là mặc định, (2) nếu chọn `KEEP` như legacy, vẫn cần dựng màn hình QUẢN LÝ xem/sửa tay số dư mà legacy chưa từng có (`loyalty/ledger.adjust()` đã viết sẵn hàm, chỉ thiếu UI) — đây là chỗ legacy thật sự thiếu, không phải chỗ "không hoàn điểm".** |

### L6 — Guard chống double-dip (khuyến mãi ↔ điểm/tem)

| | |
|---|---|
| Hệ cũ | `posgieo.html:21983-21992` — điểm tính trên total SAU giảm giá (tự nhiên không double-dip); riêng tem có guard tường minh: bill có ly "mua X tặng Y" (`isFree:true`) → `drinkCount=0`, không tích tem cho bill đó (fix cho bug đã từng cho tem cả ly tặng) |
| Hệ mới | `loyalty/accrual.accrueForSale()` tính trên `bill.total` (đã snapshot sau giảm giá ở `commands/sales.buildBill`); `countableCups()` loại `l.isFree` |
| Phân loại | 🟡 **GIỮ NGUYÊN, KHÔNG ĐỤNG** — legacy làm đúng, core mới chỉ port y nguyên logic |

### L7 — Hạng thành viên / Tier

| | |
|---|---|
| Hệ cũ | GAP — không tồn tại tier ảnh hưởng tốc độ tích điểm. Chỉ có 1 nhãn phân khúc thuần đọc-báo-cáo (`computeCustomerReport()`, `quanlygieo.html:9119-9134`: loyal/back/new theo số lần ghé) — không nối vào công thức tích điểm |
| Hệ mới | `loyalty/customer.js` — field `tier` + `accrualMultiplier` (mặc định 1) có mặt sẵn trong `Customer`, `accrual.js` đã NHÂN `mult` vào mọi công thức tích điểm/tem |
| Phân loại | 🟢 **THÊM MỚI (chỗ nối sẵn) — CHƯA KÍCH HOẠT** (đúng chủ đích: "chừa vị trí nối vào", không dựng UI/luật tier ngay) |
| Ghi chú | Không có việc gì phải làm ngay ở đây — `accrualMultiplier: 1` mặc định khiến hành vi HIỆN TẠI giống hệt legacy (không tier nào có lợi cả). An toàn theo nguyên tắc §2.3a: không đổi hành vi vận hành hiện tại. |

### L8 — Lưu trữ số dư (nền của toàn bộ domain)

| | |
|---|---|
| Hệ cũ | 🔴 **ĐỨT CHUỖI NẶNG NHẤT domain này** (`posgieo.html:21532-21534, 21377-21381, 24794`) — `total_points`/`stamp_count`/`free_drink_available` là field CỘNG DỒN TRỰC TIẾP trên `customers/{phone}`, tự gọi là "single source of truth". `loyalty_bill_effects_gieogieo` chỉ là marker chống trùng theo billId, KHÔNG phải sổ cái — nếu số dư trôi (ghi lỗi, sửa tay Firestore, race hiếm), **không có cách nào tính lại đúng**. Nặng hơn cả `untrackedPendingDelta` của FIFO (FIFO còn có `stock_transactions_gieogieo` để dựng lại `currentStock` được). |
| Hệ mới | `loyalty/ledger.js` — mỗi lần tích/đổi là 1 `entry` bất biến; `computeBalance()` = TỔNG SỔ (không có hàm nào set số dư trực tiếp); `detectDrift()` đối chiếu số dư đang hiển thị với số dư dựng lại từ sổ — **biến "số dư trôi" từ không phát hiện được thành phát hiện được**; `adjust()` — sửa tay vẫn phải qua sổ, bắt buộc `reasonText` + `actorId` |
| Phân loại | 🟢 **THÊM MỚI** — đây là điểm SỬA GỐC quan trọng nhất của toàn NET Loyalty |

---

## L9 — ĐIỀU PHỐI SỰ KIỆN (phát hiện MỚI của lượt NET này, không có trong chain-trace gốc)

Chain-trace gốc audit legacy, không audit phần dây nối của core MỚI — đây là
phát hiện khi đối chiếu NET-SALES với `src/layers/loyalty/` và
`src/layers/commands/reversal.js`:

- `commands/sales.js` (`RecordSale`, `RecordAddon`) đẩy sự kiện vào
  `plan.events` (`SaleCompleted`, `SaleAmountIncreased`).
- `commands/reversal.js` định nghĩa hẳn 1 event bus riêng
  (`createEventBus()` với `.on()`/`.emit()`, xử lý lỗi handler không nuốt im
  lặng) cho `OrderVoided`/`ContainerFound`/`BatchCancelled`/`StateRevised`.
- **Grep toàn bộ `src/layers/`**: không nơi nào gọi
  `loyalty/accrual.accrueForSale`, `accrueForAddon`, hay
  `reverseForVoidedBill`. `commands/pipeline.js` khởi tạo `plan.events = []`
  nhưng không có chỗ nào ĐỌC lại mảng đó. `createEventBus` của
  `reversal.js` được export nhưng không nơi nào gọi (`bootstrap/runtime.js`
  chỉ import `reversal.ReverseTransaction`/`ReviseState`/`CorrectLedgerEntry`
  làm command, không đụng tới event bus).

**Kết luận: L2/L4/L5 đã viết xong LUẬT nhưng KHÔNG THỂ CHẠY THẬT** — không
phải vì luật sai, mà vì chưa có tầng "ai lắng nghe sự kiện nào, gọi hàm nào"
ở `bootstrap/runtime.js` (hoặc 1 module dây nối riêng, ví dụ
`bootstrap/domain-events.js` — CHƯA TỒN TẠI).

Đây là **việc phải làm ĐẦU TIÊN** trước khi Loyalty (hay bất kỳ side-effect
cross-domain nào khác — addon, huỷ bill) chạy được thật, quan trọng hơn cả
việc sửa luật `buildRequirements` đã ghi ở `NET-SALES-V1.md` §"việc phải làm
trước" mục 2, vì nếu không có L9 thì DÙ sửa xong mục 2 vẫn không có khách nào
được tích điểm.

---

## TỔNG KẾT PHÂN LOẠI

- 🔴 **BỎ**: không có (domain này không có nhánh nào cần loại bỏ hẳn — mọi nghiệp vụ legacy đều còn giá trị)
- 🟡 **GIỮ, ĐỔI CÁCH LÀM**: L1, L2(luật số), L3, L6
- 🟢 **THÊM MỚI**: L2(ledger), L4, L5(cơ chế), L7(chỗ nối), L8, **L9 (điều phối sự kiện — hạ tầng còn thiếu, không phải nghiệp vụ)**
- ⚪ **CHƯA QUYẾT**: L5 — `policy` mặc định REVERSE hay KEEP khi huỷ bill có hoàn điểm không; nếu KEEP (giữ như legacy) thì vẫn cần dựng màn hình Quản lý xem/sửa tay ledger (đã có `adjust()`, chưa có UI)

## VIỆC PHẢI LÀM (thứ tự theo mức chặn đường)

1. **Dựng tầng điều phối sự kiện** (L9) — nơi duy nhất biết "sau khi
   `RecordSale` thành công thì gọi `accrueForSale`", "sau khi `RecordAddon`
   thì gọi `accrueForAddon`", "sau khi `ReverseTransaction` phát
   `OrderVoided` thì gọi `reverseForVoidedBill` (theo policy đã chốt)". Đây
   là điều kiện tiên quyết cho MỌI thứ còn lại trong Loyalty domain, cũng có
   thể cần cho các domain khác (Alerts khi thiếu định mức — xem
   `NET-SALES-V1.md` N10) → cân nhắc dựng CHUNG 1 lần, không riêng cho
   Loyalty.
2. Chủ quán chốt `policy` mặc định cho L5 (REVERSE hay KEEP) — không tự suy
   ra, vì legacy KEEP là quyết định nghiệp vụ có chủ đích, không phải bug.
3. Nếu chốt KEEP: lên kế hoạch màn hình Quản lý xem/sửa tay ledger (gọi
   `loyalty/ledger.adjust()`) — đây là màn hình legacy CHƯA TỪNG CÓ dù toast
   nói "Quản lý xử lý tay" suốt bao lâu nay.
4. Sau khi L9 xong: nối `onCheckoutClick`/`confirmPay` (POS) gọi
   `runtime.command('RecordSale', ...)` thay vì ghi thẳng RTDB — lúc đó L2
   mới thật sự chạy được (phụ thuộc N9 của `NET-SALES-V1.md`).
