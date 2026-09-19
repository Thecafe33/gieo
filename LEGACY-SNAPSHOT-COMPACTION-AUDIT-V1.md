# LEGACY SNAPSHOT / COMPACTION AUDIT — V1

> Nguồn: đọc trực tiếp `posgieo.html` + `quanlygieo.html`, quét toàn bộ Firebase path (RTDB `db.ref(...)` và Firestore `fstore.collection(...)`). Đây là output bắt buộc Phase 0 (`GIEO-NEW-CHAT-HANDOFF-FLAN-1.md` §3, §22 bước C-D).

Ghi chú chung: hệ thống dùng **song song** Realtime Database (`db`) và Firestore (`fstore`). RTDB cho dữ liệu "nóng" (đơn hàng đang chạy, menu, session hiển thị POS, xác nhận ngân hàng); Firestore cho phần lớn business data còn lại (kho, công thức, nhân sự, tài chính, snapshot/báo cáo).

---

# 1. DANH SÁCH FIREBASE PATH THEO NHÓM CHỨC NĂNG

### 1.1 Bill / Order (RTDB — dữ liệu sống)
| Path | Mục đích |
|---|---|
| `orders_gieogieo/{month}/{day}/{billId}` | Node chính chứa bill đang hoạt động. POS ghi, QUANLY đọc để tính doanh thu, quản lý xoá khi huỷ đơn. |
| `billCounters_gieogieo/{month}/{day}` | Bộ đếm sinh mã bill tuần tự trong ngày. |
| `bank_confirmations/{orderId}` | Bắt tay 1 lần webhook ngân hàng ↔ POS; tự `.remove()` sau khi dùng. |
| `session_display_gieogieo` | Trạng thái hiển thị phiên (Tại quán/To Go), chia sẻ giữa màn hình POS. |
| `orders_gieogieo_archive/{month}_{day}_{year}` (Firestore) | **Cơ chế archive chính** — xem mục 5. |
| `bill_deletions_gieogieo` (Firestore) | Audit log khi Quản lý xoá 1 bill thủ công. |

### 1.2 Unit / Inventory / FIFO (Firestore)
| Path | Mục đích |
|---|---|
| `stock_containers_gieogieo` | **Sổ FIFO theo container/tem** — mỗi chai/gói nhận hàng 1 doc, có `status`, `wasteBase`, `receiveRefId`. |
| `active_units_gieogieo/{itemId}` (RTDB) | Phản chiếu units "đang mở" real-time cho UI POS. |
| `inventory_items_gieogieo` | Danh mục nguyên liệu, `unitBase`/`currentStock` cập nhật bằng `FieldValue.increment`. |
| `stock_transactions_gieogieo` | **Ledger giao dịch kho** (nhập/xuất/waste/refill/reversal). |
| `stock_counts_gieogieo` | Phiên kiểm kê. |
| `stock_lost_reports_gieogieo` | Báo cáo thất thoát/mất hàng. |
| `stock_label_reports_gieogieo` | Báo cáo tem/nhãn thiếu. |
| `label_reprints_gieogieo` | Log in lại tem. |
| `refill_rules_gieogieo` | Quy tắc refill quầy. |
| `storage_locations_gieogieo` | Danh mục vị trí lưu kho. |
| `purchase_orders_gieogieo`, `receiving_records_gieogieo` | Đặt hàng & nhận hàng NCC — nguồn gốc sinh `stock_containers_gieogieo`. |
| `employee_stock_deductions_gieogieo` | Trừ kho quy trách nhiệm nhân viên. |

### 1.3 BTP (bán thành phẩm)
| Path | Mục đích |
|---|---|
| `prep_items_gieogieo` | Danh mục BTP, có `currentStock`. |
| `prep_batches_gieogieo` | **Lô BTP theo FIFO** — mỗi mẻ nấu 1 doc `qtyRemaining`, `status`. |
| `prep_transactions_gieogieo` | Ledger giao dịch BTP (nhập/xuất/waste) — song song `stock_transactions_gieogieo`. |
| `prep_vessels_gieogieo` | Dụng cụ đựng dùng để cân trừ bì. |
| `prep_forecasts_gieogieo` | Dự báo nhu cầu BTP. |

### 1.4 Recipe / Menu / Packaging
| Path | Mục đích |
|---|---|
| `recipes_gieogieo`, `topping_recipes_gieogieo` | Công thức món/topping theo size. |
| `packaging_presets_gieogieo` + 5 collection liên quan | Cấu hình bao bì nhiều tầng, ảnh hưởng COGS. |
| `menu_gieogieo`, `menu_togo_gieogieo`, `toppings_gieogieo`, `food_gieogieo` (RTDB) | Danh mục menu hiển thị POS. |
| `price_history_gieogieo` | **Lịch sử đổi giá — append-only, đúng mô hình versioning** (đối lập với recipe không versioned, xem `LEGACY-FIFO-AUDIT.md` §13). |
| `cogs_gieogieo/togo` | Bảng giá vốn nhập tay cho món mang đi (fallback khi recipe chưa khai). |

### 1.5 Snapshot / Report / Chốt sổ (Firestore) — chi tiết mục 2
`daily_closings_gieogieo`, `daily_openings_gieogieo`, `handover_records_gieogieo`, `shift_segments_gieogieo`, `daily_sales_cache_gieogieo`, `book_closings_gieogieo`, `employee_shifts_gieogieo`, `finance_gieogieo/current`, `config_history_gieogieo`, `audit_logs_gieogieo`, `daily_ops_gieogieo`.

### 1.6 Bank payment / Loyalty
`bank_confirmations` (RTDB), `customers`, `rewards`, `discount_effects_gieogieo`, `voucher_effects_gieogieo`, `stamp_free_redemptions_gieogieo`, `loyalty_bill_effects_gieogieo`, `loyalty_pending_retry_gieogieo`, `checkout_side_effects_gieogieo` — các collection `*_effects_gieogieo` là **idempotency marker theo billId**, chống cộng điểm/áp voucher 2 lần khi retry. Đây là tiền lệ tốt cho pattern claim/idempotency của FIFO Core mới.

### 1.7 Khác
`alerts_gieogieo` (hộp thư cảnh báo hệ thống tự sinh — FIFO lệch, refill lệch, loyalty lỗi...), `expenses_gieogieo`, `payment_methods_gieogieo`, `employees_gieogieo`.

---

# 2. CƠ CHẾ SNAPSHOT DOANH THU/BILL — 3 TẦNG TÁCH BIỆT, KHÔNG ĐƯỢC GỘP

**Phát hiện quan trọng nhất của audit này:** legacy có 3 cơ chế snapshot phục vụ 3 mục đích khác nhau. Thiết kế mới **không được gộp chúng thành 1 khái niệm "compaction" duy nhất** — legacy đã tách rất có chủ đích vì lý do nghiệp vụ thật.

## 2.1 `daily_sales_cache_gieogieo` — cache tính-lại-được (KHÔNG phải nguồn sự thật)
- Trigger: tự động trong `fetchSalesRange()` khi 1 ngày > `CACHE_BUFFER_DAYS` (=3 ngày) chưa có cache.
- Ghi `dayAgg` (kết quả `aggregateOrders()` + `rawMixFromOrders()`) vào doc id = `YYYY-MM-DD`.
- **Đọc lại trực tiếp**, không tính lại từ raw — đúng nghĩa read-through cache.
- **KHÔNG bất biến**: `clearSalesCache()`/`invalidateSalesCache()` xoá TOÀN BỘ cache (mọi ngày) mỗi khi cấu hình ảnh hưởng giá vốn (COGS/bao bì/định mức) đổi, để buộc tính lại. → Đây chính là cơ chế gây vi phạm invariant #13/#14 đã nêu ở `LEGACY-FIFO-AUDIT.md` §13.

## 2.2 `daily_closings_gieogieo` + `daily_openings_gieogieo` + `handover_records_gieogieo` + `shift_segments_gieogieo` — sổ vận hành ca/ngày
- Trigger: chuỗi thao tác thủ công "kết ca" (đối soát tiền mặt tối đa N lần đếm → bàn giao), dồn dần bằng `.set(...,{merge:true})` vào cùng 1 doc `daily_closings_gieogieo/{businessDate}`.
- `shift_segments_gieogieo/{businessDate}_{seq}` là sổ phụ theo từng đoạn ca khi giao ca giữa ngày — mỗi đoạn `startCash/endCash/expected/variance` riêng, không cộng dồn sai số đoạn trước sang đoạn sau (quyết định thiết kế có chủ đích, giải thích ngay trong comment).
- **Đây LÀ nguồn sự thật cho đối soát tiền mặt** (đọc thẳng, không tính lại), nhưng **KHÔNG phải snapshot doanh thu** — doanh thu/COGS trong ngày đó vẫn tính từ raw hoặc cache mục 2.1.

## 2.3 `book_closings_gieogieo` (doc id `YYYY-MM`) — SNAPSHOT P&L THẬT SỰ, BẤT BIẾN
Đây là cơ chế **gần nhất với "compaction giữ khả năng truy vết"** mà kiến trúc mới cần.
- Trigger: chủ quán bấm "Chốt sổ tháng" thủ công (`chotSoThang()`) — chỉ cho phép khi tháng đã kết thúc VÀ không còn chi phí "ước tính chờ số thật". Không có cron tự động.
- Ghi nguyên `tong` (lãi, lãi trước khấu hao, doanh thu, giá vốn, hao hụt, biến phí, lương, chi phí cố định, khấu hao, tổng chi phí, số ngày...) vào `book_closings_gieogieo/{monthKey}`.
- **Đọc lại — câu trả lời quan trọng nhất:**
  ```js
  const daChot = !!(book && book.chot);
  const so = daChot ? book.chot : tong;
  ```
  Nếu đã chốt → đọc thẳng số đã đóng băng, **không tính lại**, kể cả khi dữ liệu gốc thay đổi sau đó. Comment code nói thẳng chủ đích: *"CHỐT XONG LÀ ĐÓNG BĂNG CON SỐ... con số chủ quán đã đọc và đã dùng để ra quyết định thì không được đổi sau lưng."*
- **Sửa lại (correction) sau khi chốt:** `moLaiThang()` **XOÁ hẳn** doc snapshot (`.delete()`) để quay về tính lại từ raw, có `logAudit('reopen_book', ...)` ghi ai mở lại.
  - **Khác biệt so với thiết kế mới yêu cầu:** Master Plan §15.4 yêu cầu correction phải là `Snapshot v1 → correction → rebuild → Snapshot v2` (giữ v1, có revision), trong khi legacy **xoá thẳng v1** rồi tạo lại từ đầu — mất khả năng biết "v1 từng tồn tại và vì sao bị thay". Đây là điểm **phải cải tiến**, không copy nguyên xi khi rebuild.
- **AMBIGUOUS:** cơ chế này chỉ ở cấp THÁNG cho P&L, không có tương đương ở cấp ngày/tuần cho doanh thu thuần — "hôm nay" luôn tính trực tiếp từ raw, không có bước "chốt ngày P&L" tách biệt khỏi "chốt ca tiền mặt".

**Kết luận mục 2:** 2 kiểu đọc khác nhau tuỳ loại dữ liệu — (1) cache tính-lại-được chỉ tăng tốc, không phải nguồn sự thật; (2) snapshot bất biến thật sự mà UI đọc thẳng cho tới khi bị xoá tường minh qua hành động có audit log. **Chỉ có (2) đáng gọi là "compaction" theo đúng nghĩa `GIEO-SYSTEM-REBUILD-PLAN.md`.**

---

# 3. CƠ CHẾ XOÁ/DỌN DỮ LIỆU ĐỊNH KỲ

## 3.1 Archive-rồi-xoá `orders_gieogieo` (RTDB → Firestore) — CÓ dependency check
- `runArchiveIfNeeded()` (POS): tự chạy 1 lần/ngày khi mở app, quét cửa sổ trượt `MIN_AGE_DAYS=3` → `MAX_AGE_DAYS=60` dựa trên lần chạy trước (`localStorage.lastCleanup_pos`).
- **Điều kiện xoá: chỉ xoá RTDB SAU KHI ghi Firestore archive thành công** — `fstore....set(...).then(()=>snap.ref.remove())`. Đây là "dependency check" dạng write-then-delete tuần tự.
- Hàng đợi thử lại (`pendingArchiveDays_pos`) chỉ lưu **localStorage cấp máy** — đổi máy/xoá cache trình duyệt sẽ "quên" ngày lỗi (code tự thừa nhận hạn chế này).
- Bản thủ công bên QUANLY (`ddArchiveDay`/`ddArchiveAll`) bù cho trường hợp tự động bị hỏng/trôi ngoài cửa sổ quét, tách đúng theo NĂM thật của từng đơn (khắc phục lỗi bản POS chỉ gói theo năm hiện tại).

## 3.2 Xoá `bank_confirmations` cũ — CHỈ theo tuổi, KHÔNG kiểm tra dependency
`ddDeleteBankOld()`: xoá key cũ hơn 7 ngày suy từ định dạng mã, **không kiểm tra chương trình** xem bill tương ứng đã lên hay chưa trước khi xoá — chỉ dựa suy luận nghiệp vụ. Thao tác thủ công, không tự động.

## 3.3 `clearSalesCache()` — xoá để buộc tính lại đúng, không phải dọn rác theo tuổi (xem mục 2.1)

**Không tìm thấy cơ chế xoá tự động theo cron/server nào khác** — không có Cloud Functions trong 2 file; mọi thứ là (a) trigger khi mở app hoặc (b) thao tác thủ công của quản lý.

---

# 4. BÁO CÁO/HISTORY UI — ĐỌC RAW HAY AGGREGATE?

- Doanh thu/P&L đang chạy: tính lại từ raw `orders_gieogieo` (hoặc archive), trừ ngày > 3 ngày dùng cache mục 2.1.
- P&L tháng đã chốt sổ: đọc thẳng `book_closings_gieogieo`, không tính lại.
- Lịch sử chốt ca/tiền mặt: đọc thẳng theo doc id = businessDate (vốn dĩ đã là event record).
- Bill cũ: `fetchOrdersForDate()` tự fallback RTDB rỗng → `orders_gieogieo_archive` — đọc RAW (nguyên bill), chỉ khác nguồn lưu trữ.
- Chấm công/chi phí/kiểm kê theo khoảng ngày: query trực tiếp, raw, không qua cache.

---

# 5. CƠ CHẾ ARCHIVE — MÔ TẢ CHI TIẾT (mẫu tham chiếu tốt nhất cho compaction mới)

- **Nguồn:** `orders_gieogieo/{month}/{day}` (RTDB, không có năm trong key — đã gây bug, vá ở bản QUANLY bằng tách theo năm thật).
- **Đích:** `orders_gieogieo_archive/{month}_{day}_{year}` (Firestore), field `orders` = nguyên object các bill trong ngày (**không phải aggregate** — vẫn giữ đủ chi tiết từng dòng để truy vết) + `archivedAt/month/day/year`.
- **Trigger:** tự động (POS, 1 lần/ngày khi mở app) + thủ công (QUANLY, màn "Dọn dữ liệu cũ").
- **An toàn:** ghi Firestore xong mới xoá RTDB, `merge:true` chống đè mất archive cũ.
- **Đọc lại sau archive:** mọi hàm đọc đơn theo ngày tự fallback RTDB→archive — archive không làm mất khả năng truy vấn lịch sử, chỉ đổi kho lưu trữ.
- **Hạn chế đã biết:** trần quét tự động 60 ngày; theo dõi lỗi archive chỉ ở localStorage cấp máy, không tập trung.

---

# 6. KHUYẾN NGHỊ CHO `FIFO-COMPACTION-CONTRACT-V1.md` (sẽ viết riêng)

1. Giữ đúng 2 tầng khái niệm tách biệt: **cache tính-lại-được** (invalidate tự do) và **snapshot chốt sổ bất biến có audit log mở lại** (`book_closings_gieogieo` là mẫu tốt) — đừng gộp chung thành 1 khái niệm "compaction".
2. **Cải tiến so với legacy:** correction sau chốt sổ không được `.delete()` xoá thẳng v1 như `moLaiThang()` — phải giữ v1, tạo v2, ghi revision (đúng Master Plan §15.4).
3. Archive RTDB→Firestore (`orders_gieogieo_archive`) là contract cần giữ: format `{month}_{day}_{year}` với field `orders` nguyên bill — nhiều nơi QUANLY phụ thuộc trực tiếp format này.
4. Bổ sung dependency-check thật sự trước khi xoá `bank_confirmations` (hiện chỉ dựa tuổi) — ví dụ chỉ xoá nếu đã có bill tương ứng HOẶC quá hạn dài hơn và không còn tham chiếu.
5. Theo dõi lỗi archive nên chuyển từ localStorage cấp máy sang 1 collection tập trung (registry `TRACE_DEPENDENCY`/trạng thái archive theo ngày) — đúng tinh thần Master Plan §15.2.
6. Pattern `*_effects_gieogieo` (idempotency marker theo billId cho loyalty/voucher) là tiền lệ tốt, nên tổng quát hóa thành pattern claim dùng chung cho mọi mutation FIFO (xem `FIFO-CORE-ARCHITECTURE-V2.md`).
