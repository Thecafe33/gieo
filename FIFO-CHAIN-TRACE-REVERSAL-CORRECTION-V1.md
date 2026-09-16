# FIFO CHAIN TRACE — REVERSAL / CORRECTION TOÀN HỆ THỐNG — V1

> Khác các chain-trace trước (theo 1 domain), đây là trace **CẮT NGANG toàn hệ thống**: mọi con đường "sửa lại 1 việc đã xảy ra" — dùng để trả lời câu hỏi thiết kế quan trọng nhất: **hệ thống mới cần bao nhiêu loại command Reversal, hay dùng chung 1 pattern?**

---

# 10 LOẠI REVERSAL/CORRECTION TÌM THẤY TRONG LEGACY

| # | Loại | Unit-aware? | Hoàn đủ side-effect? | Idempotent? |
|---|---|---|---|---|
| 1a | Xoá bill (POS) | Có (FIFO-aware) | KHÔNG — cố ý bỏ loyalty/voucher (có chủ đích); không audit log | Có (claim theo referenceId+itemId) |
| 1b | Xoá bill (QUANLY) | KHÔNG — cộng thẳng currentStock | KHÔNG — như 1a; có audit log riêng (`bill_deletions_gieogieo`) | KHÔNG atomic (race check-then-act) |
| 2 | `qlReverseStockForOrder` | Không | Không | Không atomic |
| 3 | Sửa 1 dòng ledger sai (qty/itemId) | N/A | N/A | **GAP — không tồn tại**, chỉ có compensating-entry hoặc reclassify-type |
| 4 | Receiving correction | Có phần | Thiếu nhánh sửa giá | Không atomic (Bug #20) |
| 5 | BTP yield correction | Có | COGS lịch sử trôi | Có |
| 6 | Found-after-Lost | Có (RT) | Deduction lương chưa từng được tạo (đứt ở gốc — route duyệt Lost không tồn tại) | Không (thiếu txId) |
| 7 | Huỷ mẻ đang nấu | Có (dùng chung engine 1a) | N/A | Có (transaction giành lô) |
| 8 | Đảo phân loại hao hụt | N/A (chỉ đổi nhãn) | Có audit trail | Có |
| 9 | Chỉnh tồn BTP theo kiểm kê | Không | N/A | Có |
| 10 | Sửa đơn/add-on sau bán | Có (FIFO tỷ lệ) | AMBIGUOUS (loyalty theo total mới chưa xác nhận) | AMBIGUOUS |

**Phát hiện quan trọng nhất:** loại 1a và 1b có **cùng Ý ĐỊNH** (comment trong code 1b còn tự giải thích lẽ ra nên dùng chung engine của 1a) — khác nhau chỉ vì **viết ở 2 thời điểm khác nhau, không đồng bộ lại**. Đây là bằng chứng trực tiếp: hệ thống cũ không thiếu ý tưởng đúng, thiếu kỷ luật dùng 1 nguồn duy nhất.

---

# KẾT LUẬN THIẾT KẾ — 2 PATTERN, KHÔNG PHẢI 1 VÀ KHÔNG PHẢI 10+

## `ReverseTransaction(referenceId, scope)`
Cho mọi trường hợp "sự kiện X đã tiêu thụ/tạo ra Y đơn vị kho, giờ hoàn ngược": xoá bill (1a+1b gộp thành 1 API duy nhất), huỷ mẻ đang nấu (7), sửa add-on (10), và **sửa 1 dòng ledger sai (3 — hiện là gap, bổ sung)**: ghi dòng ĐẢO + dòng ĐÚNG, `referenceId` trỏ về dòng gốc, KHÔNG update trực tiếp dòng cũ (ledger append-only thật — tránh lặp lại pattern mutate-tại-chỗ của `ctnDaoHaoHutMa`).

Luôn: unit/FIFO-aware, claim theo doc ID xác định trước (idempotent tự nhiên qua Firestore, không phải check-then-act).

## `ReviseState(entityId, field, newValue, reason)`
Cho "sửa lại 1 con số trạng thái đã chốt sai" khi KHÔNG có ý nghĩa tiêu thụ ngược: yield mẻ BTP (5), giờ công payroll, kiểm kê tồn (9). Luôn kèm audit-array giữ lịch sử, và **bắt buộc trả lời rõ 1 câu hỏi mà legacy để ngỏ ở MỌI trường hợp đã audit**: báo cáo lịch sử đóng băng theo giá trị tại thời điểm phát sinh, hay tính lại theo giá trị mới? (Đây là gap đã thấy độc lập ở Recipe, Packaging, BTP yield, Payroll — 4 lần trước khi tới đây, giờ là bằng chứng thứ 5.)

## Side-effect ngoài kho — domain event, KHÔNG nhét vào 2 pattern trên
Loyalty/voucher/lương khi hoàn 1 giao dịch **không nên** là logic cứng trong `ReverseTransaction`. Bằng chứng: legacy CỐ Ý không hoàn loyalty khi xoá bill (quyết định nghiệp vụ hợp lệ, ghi rõ trong comment/toast), còn ở Found-after-Lost thì logic hoàn deduction đã viết sẵn nhưng tầng tạo deduction (duyệt Lost) chưa từng tồn tại — 2 tình huống khác nhau nhưng cùng 1 bài học: **side-effect phải là handler đăng ký riêng lắng nghe domain event** (`OrderVoided`, `ContainerFound`, `BatchCancelled`...), không phải nhánh if/else trong hàm reversal chính.

Lợi ích cho hệ thống mới: nếu sau này chủ quán muốn đổi quyết định "có hoàn loyalty khi huỷ bill không", chỉ cần thêm/bớt 1 handler (`LoyaltyReversalHandler`), không phải sửa lại toàn bộ luồng `ReverseTransaction` — tách đúng ranh giới trách nhiệm ngay từ đầu.

---

# ÁP DỤNG VÀO `packages/commands/reversal`

```text
packages/commands/reversal/
├── reverse-transaction.ts     # 1 API DUY NHẤT, thay thế toàn bộ 1a/1b/2/7/10 cũ
├── revise-state.ts            # 1 API DUY NHẤT, thay thế 5/9 cũ, versioned bắt buộc
├── ledger-correction.ts       # đóng gap #3 — sửa 1 dòng ledger qua đảo+đúng
└── events/
    ├── order-voided.ts
    ├── container-found.ts
    └── batch-cancelled.ts
      → mỗi domain (loyalty, payroll, voucher) tự đăng ký handler riêng, không
        sửa file trên khi thêm/bớt side-effect
```

Mọi command ở `packages/commands/sales|inventory|prep|approval` khi cần "hoàn lại" đều gọi `reverse-transaction.ts`/`revise-state.ts` — không tự viết logic hoàn riêng như 10 đường khác nhau ở legacy.
