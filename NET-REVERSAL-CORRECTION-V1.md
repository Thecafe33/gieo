# NET — REVERSAL / CORRECTION CẮT NGANG TOÀN HỆ THỐNG — V1

## Đây là gì

Liên kết `FIFO-CHAIN-TRACE-REVERSAL-CORRECTION-V1.md` (chain-trace DUY NHẤT
cắt ngang toàn hệ thống, không theo 1 domain) với `src/layers/commands/
reversal.js` + `fifo-core/reconciliation.js` đã viết. Làm domain này ngay sau
Sales/Loyalty vì cả 2 NET trước đều dẫn thẳng vào đây: N9 (`NET-SALES-V1.md`,
huỷ bill) và L5 (`NET-LOYALTY-V1.md`, hoàn điểm khi huỷ bill) đều phụ thuộc
`ReverseTransaction` + event `OrderVoided` được định nghĩa ở đây.

**Ký hiệu:** 🔴 BỎ · 🟡 GIỮ, ĐỔI CÁCH LÀM · 🟢 THÊM MỚI · ⚪ CHƯA QUYẾT.

---

## 10 LOẠI REVERSAL/CORRECTION CỦA LEGACY → ÁNH XẠ SANG 2 PATTERN MỚI

Chain-trace gốc đã liệt kê đủ 10 loại (bảng §"10 loại"), phát hiện quan
trọng nhất của NÓ: loại 1a/1b **cùng ý định, viết ở 2 thời điểm khác nhau,
không đồng bộ** — bằng chứng hệ cũ không thiếu ý tưởng đúng, thiếu KỶ LUẬT
dùng 1 nguồn duy nhất. Bảng dưới đối chiếu với code core mới thật:

| # | Loại (legacy) | Vị trí legacy | → Pattern mới | Trạng thái core mới |
|---|---|---|---|---|
| 1a | Xoá bill (POS) | `posgieo.html:18295-18328, 23239-23289` | `ReverseTransaction` | 🟡 **GIỮ nghiệp vụ, GỘP LÀM 1** — Unit-aware giữ nguyên, loyalty/voucher tách ra event `OrderVoided` (xem L5 `NET-LOYALTY-V1.md`) thay vì "cố ý bỏ qua, không audit log" |
| 1b | Xoá bill (QUANLY) | `quanlygieo.html:10633-10745` | `ReverseTransaction` (CÙNG API với 1a) | 🔴 **BỎ hẳn nhánh cộng thẳng `currentStock`** — đây chính xác là "Bug #17" mà comment `reconciliation.js:98` ghi rõ đã đóng: `qlReverseStockForOrder` không còn tồn tại, mọi hoàn kho đi qua đúng 1 cửa `reverseAllocations()` |
| 2 | `qlReverseStockForOrder` | quanlygieo.html | (không còn API riêng — nằm trong 1a/1b) | 🔴 **BỎ** — xác nhận lại: grep code mới không còn hàm tương đương độc lập |
| 3 | Sửa 1 dòng ledger sai | GAP ở legacy — không tồn tại, chỉ có compensating-entry/reclassify-type rải rác | `CorrectLedgerEntry` (mới) | 🟢 **THÊM MỚI** — ghi dòng ĐẢO + dòng ĐÚNG, `referenceId` trỏ về dòng gốc, KHÔNG update tại chỗ (đúng nguyên tắc ledger append-only, tránh lặp lại pattern mutate-tại-chỗ của `ctnDaoHaoHutMa`) |
| 4 | Receiving correction (sửa giá nhập) | thiếu nhánh sửa giá, không atomic (Bug #20) | *(chưa có đích để ánh xạ)* | 🔴🟢 **KHÔNG XÁC ĐỊNH ĐƯỢC — xem mục cảnh báo bên dưới: chưa có `ReceiveGoods` command trong core mới** |
| 5 | BTP yield correction | Có, nhưng COGS lịch sử trôi | `ReviseState` | 🟡 **GIỮ nghiệp vụ, ĐỔI CÁCH LÀM** — `historicalPolicy: FREEZE\|RECOMPUTE` bắt buộc khai (đóng đúng gap "COGS lịch sử trôi không ai biết") |
| 6 | Found-after-Lost | Deduction lương chưa từng tạo — đứt ở gốc (route duyệt Lost không tồn tại) | `ReportLostContainer`+`ApproveLostContainer`(`approval.js`)+`RestoreFoundContainer` | 🟢 **THÊM MỚI route duyệt** (đóng đúng Bug #12 — Unit vào `PENDING_REVIEW` chờ duyệt, không tự động LOST) + 🟡 giữ nguyên quyết định "Unit mới nguyên, không suy luận lại phần đã dùng trước khi mất" (§8, `RestoreFoundContainer` comment) |
| 7 | Huỷ mẻ đang nấu | Dùng chung engine 1a, có transaction giành lô | `ReverseTransaction` (CÙNG API) | 🟡 **GIỮ, GỘP LÀM 1** — không còn code riêng cho BTP |
| 8 | Đảo phân loại hao hụt | Chỉ đổi nhãn, có audit trail, idempotent | `CorrectLedgerEntry` (`input.corrected.type`) | 🟡 **GIỮ nghiệp vụ, GỘP VÀO #3** — không cần command riêng, đổi `type` là 1 trường hợp của sửa dòng ledger |
| 9 | Chỉnh tồn BTP theo kiểm kê | Không unit-aware | `fifo-core/reconciliation.physicalReconciliation` (§3.7) | 🟡 **GIỮ nguyên tắc GHI ĐÈ tuyệt đối** (`remainingQty = actualQty`, không cộng delta) — đóng đúng Bug#1 (`BUG-kho-can-updated.md`: "Điều chỉnh tồn bên Quản lý bị Unit Engine ghi đè xoá sạch") |
| 10 | Sửa đơn/add-on sau bán | AMBIGUOUS cả 2 tiêu chí (loyalty theo total mới chưa xác nhận) | `commands/sales.RecordAddon` + `ReverseTransaction` khi cần hoàn | 🟢 **THÊM MỚI** loyalty theo phần chênh (xem L4 `NET-LOYALTY-V1.md`) — hết AMBIGUOUS, có event `SaleAmountIncreased` tường minh |

---

## SƠ ĐỒ 2 PATTERN + 1 LỚP SIDE-EFFECT

```
ReverseTransaction(referenceId, domain, reason, originalAllocations)
   │  dùng cho: xoá bill, huỷ mẻ đang nấu, sửa add-on — MỌI "đã tiêu thụ/
   │  tạo ra Y đơn vị kho, giờ hoàn ngược"
   │  → BÙ TRỪ theo phân bổ GỐC, KHÔNG chạy lại FIFO (tránh hoàn sai Unit
   │    khi có thao tác khác xen vào sau đó)
   │  → coverage: 'full' (có allocation gốc) | 'untracked' (dữ liệu legacy,
   │    đánh dấu rà tay — KHÔNG đoán bừa)
   ▼
plan.events.push({ type: eventType, ... })  ◄── side-effect KHÔNG nhét ở đây
   │
   ├─► OrderVoided       → (nên) loyalty/accrual.reverseForVoidedBill  [CHƯA NỐI — L9]
   ├─► ContainerFound    → (nên) hoàn khoản trừ trách nhiệm nhân viên  [CHƯA NỐI — L9]
   └─► BatchCancelled    → (nên) ??? (chưa xác định domain nào lắng nghe)

ReviseState(entityId, field, newValue, historicalPolicy: FREEZE|RECOMPUTE)
   │  dùng cho: yield BTP, giờ công payroll, kiểm kê tồn — sửa 1 con số
   │  trạng thái đã chốt sai, KHÔNG có ý nghĩa tiêu thụ ngược
   ▼
   bắt buộc trả lời: đóng băng báo cáo cũ hay tính lại? (gap thấy LẶP LẠI
   5 lần độc lập trong audit: Recipe, Packaging, BTP yield, Payroll, và đây)

CorrectLedgerEntry(originalEntry, corrected, reason)
   │  dùng cho: sửa 1 dòng ledger sai (qty/itemId/type) — gap #3 VÀ #8 gộp
   ▼
   ghi dòng ĐẢO + dòng ĐÚNG — append-only thật, không update tại chỗ
```

---

## L9 (nhắc lại từ `NET-LOYALTY-V1.md`) — LỖ HỔNG NÀY KHÔNG RIÊNG CHO LOYALTY

`NET-LOYALTY-V1.md` đã phát hiện: `plan.events`/`createEventBus()` được viết
xong nhưng KHÔNG nơi nào trong `src/layers/` gọi lại. Domain Reversal xác
nhận thêm: gap này ảnh hưởng **ít nhất 3 sự kiện**, không chỉ `OrderVoided`:

- `OrderVoided` → cần loyalty hoàn điểm (L5)
- `ContainerFound` → cần hoàn khoản trừ trách nhiệm nhân viên (payroll) —
  **domain Payroll CHƯA có NET riêng, chưa xác nhận có handler tương ứng
  hay thậm chí có khái niệm "khoản trừ trách nhiệm" trong `hr/payroll.js`
  hay không — để ngỏ cho lượt NET domain Payroll**
- `BatchCancelled` → chưa xác định ai cần lắng nghe (có thể không ai cần,
  hoặc cần cho báo cáo hao phí BTP — để ngỏ cho lượt NET domain BTP)

→ Xác nhận lại kết luận đã ghi ở `NET-LOYALTY-V1.md`: **dựng tầng điều phối
sự kiện là việc phải làm ĐẦU TIÊN**, không phải việc riêng của Loyalty.

---

## 🔴 PHÁT HIỆN MỚI CỦA LƯỢT NET NÀY — "Receiving correction" (case #4) không có gì để sửa, vì NHẬP HÀNG chưa có command

Case #4 trong chain-trace mô tả lỗi khi SỬA giá nhập hàng đã ghi sai. Khi
đối chiếu sang core mới: **`src/layers/commands/` không có `ReceiveGoods`
hay bất kỳ command nào tạo Unit qua đường nhập hàng thật** (chỉ có
`unit.createUnit()`/`unit.seedUnitFromLegacy()` ở tầng thấp — xem
`SEED-CONTRACT-V1.md` §3.1 — nhưng không có COMMAND tầng nghiệp vụ nào gọi
`createUnit()` cho luồng "nhân viên quầy nhập hàng thật, có giá, có nhà cung
cấp"). `FEATURE-TREE-V1.md` [2a] có vẽ `ReceiveGoods` trong sơ đồ nhưng đây
mới là THIẾT KẾ, chưa có code.

**Hệ quả**: case #4 hiện KHÔNG THỂ phân loại BỎ/GIỮ/THÊM MỚI — không có đích
để ánh xạ. Đây không phải lỗi của domain Reversal, mà là một domain còn
thiếu hoàn toàn ở tầng command: **"Nhập hàng" (Receiving)**, đứng trước cả
Raw Material trong vòng đời 1 lô hàng
(`ReceiveGoods → Unit{sealed} → OpenContainer → CONSUME → CountStock →
ReconcileInventory`). Cần thêm 1 lượt NET riêng cho domain này (gộp chung
với Raw Material hoặc tách riêng — đề xuất gộp, vì đây chính là "đầu vào"
của cùng 1 vòng đời Unit mà Raw Material mô tả "đầu ra").

---

## TỔNG KẾT PHÂN LOẠI

- 🔴 **BỎ**: case 1b (nhánh cộng thẳng `currentStock`), case 2 (`qlReverseStockForOrder` xoá hẳn)
- 🟡 **GIỮ, ĐỔI CÁCH LÀM**: case 1a+1b (gộp), case 5, case 7, case 8 (gộp vào #3), case 9
- 🟢 **THÊM MỚI**: case 3 (`CorrectLedgerEntry`), case 6 (route duyệt Lost), case 10 (loyalty theo phần chênh)
- ⚪ **CHƯA XÁC ĐỊNH ĐƯỢC** (không phải "chưa quyết" — thiếu cả đích để quyết): case 4 (Receiving correction) — phụ thuộc 1 domain command chưa tồn tại

## VIỆC PHẢI LÀM

1. **Dựng tầng điều phối sự kiện** (chung với `NET-LOYALTY-V1.md` mục 1) —
   giờ đã xác nhận cần phục vụ ít nhất `OrderVoided`, `ContainerFound`,
   `SaleCompleted`, `SaleAmountIncreased`, có thể cả `BatchCancelled` —
   nên dựng 1 lần, đủ tổng quát cho mọi domain, không vá riêng từng cái.
2. Thêm 1 lượt NET cho domain **Receiving/Nhập hàng** (đứng trước Raw
   Material trong vòng đời Unit) — hiện hoàn toàn chưa có command, nên case
   #4 của Reversal còn treo, và cả Raw Material lẫn Cutover/Seed đều phụ
   thuộc gián tiếp vào domain này để có Unit thật đưa vào FIFO.
3. Domain Payroll cần 1 lượt NET riêng để xác nhận "khoản trừ trách nhiệm
   nhân viên khi mất container" có được mô hình hoá chưa — hiện chỉ biết
   `ContainerFound` PHẢI hoàn khoản trừ đó (theo đúng comment
   `RestoreFoundContainer`) nhưng chưa xác nhận phía payroll có gì để hoàn.
