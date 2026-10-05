# Gieo Gieo — Kế hoạch mở đa cửa hàng (Bước 0 → 5)

> Lập 28/09/2026 · cập nhật 04/10 · **viết lại 05/10/2026 theo hướng chủ dự án chốt: một project, QUÁN HIỆN TẠI GIỮ NGUYÊN CHỖ CŨ, quán mới có collection riêng.**
> Bản 04/10 (hướng B có bước M2 chuyển dữ liệu) **đã bỏ** — xem git nếu cần tra.
> File này **tự đủ** để bắt đầu lại sau nhiều tháng. Hiện trạng chung: `docs/TRANG_THAI.md`; API engine: `docs/UNIT_ENGINE.md`;
> lượt đọc: `docs/KE_HOACH_TOI_UU_DOC.md` (hạn mức miễn phí 50K/ngày là của **cả project**, mọi quán + XOFA + The Cafe 33 cộng chung).

---

## 0. Khi nào bắt đầu & cách mở phiên

Bắt đầu Bước 1 khi:
1. Bản tối ưu lượt đọc T2/T3 (05/10) **đã deploy** và Firebase Usage cho thấy lượt đọc/ngày đã giảm rõ — mỗi quán mới cộng thêm lượt đọc vào cùng hạn mức.
2. v18 (hoặc bản sau) chạy ổn ở quán hiện tại ≥ vài tuần (04/10: mới 1–3 tuần).
3. Bước 2 cần trả lời trước **O7, O8, O16, O17** (mục 4; O13 đã xong 05/10). Bước 1 không cần.

**Câu mở đầu cho phiên Claude mới (mỗi bước một phiên):**
> Đọc CLAUDE.md, docs/TRANG_THAI.md, docs/KE_HOACH_DA_CUA_HANG.md và docs/UNIT_ENGINE.md. Chạy `sh tests/run_all.sh` và `node tools/check_boundaries.js`. Làm **Bước N** (mục 5) — phản biện trước, báo tôi rồi mới sửa. Không deploy.

Mức model gợi ý: Bước 1 → Opus, high (engine v19: xhigh) · Bước 2 → Opus, xhigh (webhook CK: max) · Bước 3 → Sonnet, high (cộng gộp số liệu: Opus, high) · Bước 4 → Sonnet, medium · Bước 5 → Opus, xhigh.

---

## 1. Hướng đã chốt (05/10)

**Một project Firebase. Quán hiện tại (`gg01`) giữ NGUYÊN mọi tên collection / đường dẫn RT. Quán mới dùng tên có hậu tố `__{storeId}`.**

| Loại dữ liệu | Quán hiện tại `gg01` | Quán mới, vd `gg02` |
|---|---|---|
| Riêng từng quán (S): sổ kho, bill, ca, kết ca, kiểm kê, tem… | `stock_transactions_gieogieo` (y như hôm nay) | `stock_transactions_gieogieo__gg02` |
| RT riêng từng quán | `active_units_gieogieo/{itemId}` | `active_units_gieogieo__gg02/{itemId}` |
| Dùng chung (G): menu, công thức, danh mục NL/BTP, nhân viên… | một chỗ chung | cùng chỗ chung |
| Dùng chung với XOFA / The Cafe 33 (X): `customers`, `bank_confirmations` | không đổi | không đổi (CK mang mã quán, Bước 2) |

Vì sao chọn cách này:
- **Không chuyển dữ liệu quán đang bán** — bỏ hẳn bước rủi ro nhất của kế hoạch cũ (M2: cửa sổ bảo trì, sao lưu, script, quay lui), không cần buộc cập nhật từ xa: máy quán hiện tại chưa cập nhật vẫn ghi đúng chỗ cũ.
- **Cách ly tuyệt đối**: dữ liệu quán mới ở collection khác hẳn → mọi truy vấn của quán hiện tại không bao giờ thấy dữ liệu quán khác. (Nếu ghi chung collection rồi lọc theo `storeId`, chỉ cần một chỗ quên lọc trong ~700 chỗ là trộn số.)
- Khoá theo ngày (`daily_closings/{ngày}`, kiểm kê, giao ca…) **không phải đổi** — mỗi quán đã ở collection riêng.
- **RT quán mới là gốc riêng** (`…__gg02`), không lồng dưới gốc của quán hiện tại: con của `active_units_gieogieo` là `itemId`, listener gốc (chấm FIFO…) sẽ hiểu nhầm `gg02` là một nguyên liệu.

Cái giá (chấp nhận): hai kiểu đặt tên mãi mãi (chỉ lớp đường dẫn biết); mỗi quán mới phải tạo lại composite index cho collection có hậu tố; báo cáo toàn chuỗi = đọc từng quán rồi cộng.

---

## 2. Hiện trạng (05/10)

- Đã có: engine nhận `storeId` qua `UnitEngine.init({ storeId })` (đang `'gg01'`); bản ghi Firestore MỚI do engine tạo mang `storeId`; khối `P` trong engine.
- **Chưa có** — đường dẫn viết cứng (đếm 05/10):

| Nơi | Viết cứng |
|---|---|
| `unit_engine.v18.js` | 194 lời gọi `collection(...)` dùng hằng/chuỗi (chỉ 6 qua `P`) + RT `ref('…')` |
| `posgieo.html` | 213 `collection('…')` + 30 `ref('…')` |
| `quanlygieo.html` | 258 `collection('…')` + 18 `ref('…')` |

- Tồn kho (`currentStock`, `locationStock`…) nằm **trong doc danh mục** `inventory_items` / `prep_items` (dùng chung) → quán mới cần chỗ riêng cho tồn.
- Mã CK `GG + ddMMHHmmss`, số bill `billCounters_gieogieo` — chung một kiểu cho mọi máy.

---

## 3. Quyết định đã chốt

| # | Chủ đề | Quyết định |
|---|---|---|
| D1 | Kiến trúc | Không backend / Cloud Functions. Engine + lớp dữ liệu là file `.js` tĩnh, nạp bằng `<script src>` |
| **D4** | Hướng đa cửa hàng | **[05/10]** Một project; `gg01` giữ tên cũ; quán mới tên + `__{storeId}` (mục 1). Không chuyển dữ liệu quán hiện tại |
| D5 | Khách hàng | `customers` + tích tem **dùng chung** giữa các quán |
| D6 | Nhân viên | **Dùng chung**, có `storeTags`; check-in ở quán nào cũng được |
| D7 | Lịch làm việc | **Theo cửa hàng**, đổi vị trí được |
| D8 | Chuyển khoản | **Một đường chung** `bank_confirmations`; quán hiện tại giữ mã `GG…` như cũ, quán mới mã có mã quán |
| D10 | Phiếu nhập | **Riêng từng cửa hàng** |
| D11 | Khuyến mãi | Phạm vi **toàn hệ thống** hoặc **danh sách cửa hàng** |
| D12 | Nguồn hàng | Chuyển giữa quán, từ **kho trung tâm**, hoặc NCC giao tận quán |
| D13 | Chuyển mã | Mặc định **chỉ tem nguyên seal** |
| D14 | Dụng cụ cân | Dùng chung |
| D15 | Bảo mật | Tài khoản theo quán + rules: Bước 5 (khi cần); tắt WebView debugging bản phát hành |
| **D16** | Không gian tên | **[05/10]** Mọi collection / gốc RT giữ hậu tố `_gieogieo`; quán ≠ `gg01` thêm `__{storeId}` sau tên. Collection mới: `stores_gieogieo` (G), `store_item_state_gieogieo` (S) |
| D17 | Không chặn bán | Không cơ chế nào chặn bán / chặn khởi động khi offline |
| D18 | Dùng chung với XOFA & The Cafe 33 | `customers`, `bank_confirmations`, webhook Cloud Run, tài khoản `cafe33@…`, rules: Gieo Gieo **chỉ được thêm**, không đổi cấu trúc / quyền / hành vi của họ. `rewards`, `kiosk_config`: không ghi |
| **D19** | Lớp đường dẫn | **[05/10]** Một file dùng chung `data_access.v1.js` giữ **bảng đăng ký** (mỗi collection / gốc RT: S, G, G+s, C, X) và **quy tắc đặt tên duy nhất**; app + engine chỉ lấy đường dẫn qua đây. Tên chưa đăng ký → báo lỗi (test bắt trước deploy) |

---

## 4. Câu hỏi phải trả lời

| # | Câu hỏi | Cần trước |
|---|---|---|
| **O8** | Mã cửa hàng: đề xuất `gg01` (quán hiện tại — đúng mặc định engine), `gg02`, … — hậu tố tên dùng `gg02`; mã CK dùng **2 chữ số** `02` (mục 4.1) | Bước 2 |
| ~~O13~~ | ~~Mã nguồn webhook~~ → **đã đọc 05/10** (mục 4.1) | — |
| **O7** | Giới hạn độ dài nội dung CK của ngân hàng — nội dung quán mới `TTHD GG02ddMMHHmmss` = 19 ký tự (quán hiện tại 17). Thử 1 giao dịch thật để chắc | Bước 2 |
| **O17** | Quán mới dùng **chung STK** `0977570035` hay STK riêng? Chung → webhook không sửa gì; riêng → thêm đúng 1 dòng vào `KNOWN_ACCOUNTS` | Bước 2 |
| **O16** | Máy chọn quán thế nào: mã quán trong đường link APK (`posgieo.html?quan=gg02`) + máy nhớ quán của mình + tên quán hiện trên đầu màn hình. Mở nhầm link quán khác trên máy đã gắn quán → **cảnh báo** hay **tự dùng quán đã gắn**? | Bước 2 |
| O3 | `finance_gieogieo` chứa gì (dùng chung hay theo quán)? | Bước 1 |
| O4 | Có chuyển tem **đang mở** giữa quán không? (mặc định: không) | Bước 5 |
| O5 | Có bếp trung tâm nấu BTP chuyển đi không? | Bước 5 |
| O6 | Kho trung tâm thao tác trên POS rút gọn hay trên Quản lý? | Bước 5 |
| — | Quán 2 có menu / giá / khuyến mãi khác quán 1 không? | Bước 3 |
| O14 | Target nhân viên theo quán hay toàn chuỗi? (đề xuất: theo quán) | Bước 3 |
| O15 | Chi phí cố định, khấu hao, lương cứng: gắn theo quán hay chia tỷ lệ? (hoà vốn từng quán) | Bước 3 |

### 4.1 Webhook xác nhận CK (Cloud Run `processCakePayment`) — đọc 05/10

- Đọc Gmail báo có tiền; nhận mã bằng `/TTHD ([A-Z]{2}\d+)/` (**2 chữ in hoa + dãy số bất kỳ dài**), chỉ nhận mail có STK trong `KNOWN_ACCOUNTS` (`0964674795` PosX/XOFA, `0977570035` posgieo), ghi RT `bank_confirmations/{orderId}` = `{orderId, amount, account, confirmedAt, source}`.
- POS hiện tạo mã `genBankOrderId()` = `GG` + `ddMMHHmmss` (10 số), nội dung `TTHD GG…`.
- **Kết luận**: quán mới dùng mã `GG` + **2 số mã quán** + `ddMMHHmmss` (12 số), vd `GG020510143055`:
  - webhook **nhận được ngay, không sửa code** (regex nhận dãy số dài bất kỳ); khác STK thì chỉ thêm 1 dòng `KNOWN_ACCOUNTS` (O17);
  - **không bao giờ trùng** mã quán hiện tại (10 số ≠ 12 số) và không đụng tiền tố `DH` của XOFA;
  - quán hiện tại **không đổi gì**.
- Quản lý → dọn dữ liệu (`_ddDateFromBankKey` chỉ hiểu `GG` + 10 số):
  - `ddDeleteBankOld` chỉ xoá `GG` + 10 số cũ > 7 ngày → **không** đụng XOFA (đính chính bản 04/10).
  - **`ddDeleteBankUnknown` (nút xoá "không đọc được ngày") xoá cả khoá `DH…` của XOFA và sẽ xoá khoá quán mới** → Bước 2 sửa: hiểu thêm `GG` + 12 số; chỉ liệt kê / xoá khoá tiền tố `GG`.

---

## 5. Lộ trình

Mỗi bước: **phản biện → báo → sửa → test → `tao_ban_thu` → chủ dự án deploy & thử máy thật**. Không gộp hai bước vào một lần deploy.

### Bước 1 — Lớp đường dẫn + chốt chặn (quán hiện tại: hành vi y hệt)
Đây là **lần duy nhất** quán hiện tại bị đụng — chỉ code, không dữ liệu.
1. `data_access.v1.js` (nạp trước engine ở cả 2 app; chế độ thử nạp được):
   - Bảng đăng ký lấy từ mục 6 (chạy lại `npm run inventory` để không sót tên mới).
   - `coll(name)` / `rt(path)` / `storeId()`: S + quán ≠ `gg01` → thêm `__{storeId}`; còn lại trả **đúng chuỗi cũ**. Tên chưa đăng ký → ném lỗi.
2. **Engine v19** (`unit_engine.v19.js`, 2 HTML trỏ cùng bản): 194 lời gọi viết cứng + RT đi qua `P`, `P` lấy tên từ `data_access` — một quy tắc, không chép hai nơi.
3. POS + Quản lý: ~520 lời gọi `collection('…')` / `ref('…')` → `coll()` / `rt()`. Máy móc, không đổi hành vi.
4. **Chốt chặn** (vào `predeploy_check.sh`): `tools/check_paths.js` báo lỗi khi có `collection('…')` / `ref('…')` / tên ghép chuỗi nằm ngoài `data_access`; tên trong bảng đăng ký phải khớp tên thật đang dùng.
5. Test:
   - **Đồng nhất `gg01`**: với mọi tên đăng ký, `coll/rt` của `gg01` = chuỗi cũ; toàn bộ test hiện có (50+ file) xanh nguyên.
   - **Cách ly**: Firebase giả, chạy bán / nấu / kiểm kê / kết ca cho `gg01` và `gg02` xen nhau → `gg02` không ghi vào collection S nào không hậu tố; `gg01` không đọc thấy dữ liệu `gg02`.
6. Chế độ thử: `che_do_thu.v2.js` nếu danh sách collection chép sang vùng thử cần đổi.
7. `tools/site_files.txt` — danh sách file của XOFA / The Cafe 33 trên site Hosting dùng chung, để `predeploy_check` chặn deploy làm mất file của họ (chủ dự án cung cấp danh sách).

**Xong khi**: deploy, quán hiện tại chạy ≥ 1 tuần không khác biệt (Sổ lệch, kết ca, lượt đọc).

### Bước 2 — Quán mới chạy được (quán hiện tại không đổi)
- **Tồn theo quán**: quán ≠ `gg01` để trạng thái tồn (`currentStock`, `locationStock`, `unrefilledConsumption`, `refillUncertain`, `pendingShortage`, `untrackedPendingDelta`, `_ueLastRecomputeStart`, `lastCount`) ở `store_item_state_gieogieo__{storeId}/{itemId}`; danh mục `inventory_items` / `prep_items` dùng chung. Engine `P.itemState` theo quán; hàm nạp danh mục ở app trả danh mục + tồn của quán đang chạy. `gg01` giữ tồn trong doc danh mục như cũ.
- **Chọn quán trên máy** (O16): mã quán từ đường link → máy nhớ; không có mã + máy chưa gắn quán = `gg01` (máy hiện tại); tên quán luôn hiện trên đầu màn hình.
- **Số bill**: tự tách vì `billCounters_gieogieo__{storeId}` là gốc riêng; nhãn bill in thêm mã quán (quán ≠ `gg01`).
- **Chuyển khoản** (mục 4.1 — webhook đã đọc):
  1. `genBankOrderId()`: quán ≠ `gg01` → `GG` + 2 số mã quán + `ddMMHHmmss`; quán hiện tại giữ nguyên.
  2. STK riêng (O17) → thêm 1 dòng `KNOWN_ACCOUNTS`, deploy webhook ngoài giờ bán của cả ba, thử 1 CK thật mỗi thương hiệu. Chung STK → không đụng webhook.
  3. Quản lý: `_ddDateFromBankKey` hiểu `GG` + 12 số; `ddDeleteBankUnknown` chỉ xét khoá tiền tố `GG` (không bao giờ xoá `DH…` của XOFA).
  4. Thử 1 CK thật của quán mới ở chế độ thử (Bước 4).
- Check-in ghi `storeId`; nhân viên có `storeTags`.

### Bước 3 — Quản lý đa quán
- Bộ chọn quán (mặc định quán hiện tại): 1 quán / nhiều / toàn chuỗi; báo cáo gộp = đọc từng quán rồi cộng (bản tổng hợp theo ngày `ledger_day_summaries` đi theo quán → `…__{storeId}`).
- Menu chung + `store_menu_overrides_gieogieo/{storeId}` = `{hidden:[…], price:{…}}`; công thức chung.
- Khuyến mãi: chương trình / chiến dịch có `stores: 'all' | [storeId…]` (thiếu = toàn hệ thống).
- Phiếu nhập, lịch làm, checklist, ngày đặc biệt theo quán; nút "sao chép cấu hình từ quán A".
- Lãi/lỗ & hoà vốn theo quán (O15); lương dự đoán lọc lịch theo quán (D7); target nhân viên theo quán (O14); `duty` (vụ lệch, xác minh, tóm tắt ngày) theo quán; `duty_config` chung có ghi đè theo quán.

### Bước 4 — Thử & mở quán 2
- Chạy quán 2 trong **chế độ thử** (bản `_thu`, `?quan=gg02`) — bán, nấu, kiểm kê, kết ca, CK thử.
- Runbook khai trương: tạo `stores_gieogieo/gg02`; **tạo composite index** cho collection có hậu tố (danh sách sinh từ bảng đăng ký + index đang có); máy POS + link; menu/giá ghi đè; refill rules, vị trí kho; nhân viên `storeTags`; thử CK thật.
- Mở thật; theo dõi 2–4 tuần: lệch tồn, Sổ lệch, **lượt đọc** (hạn mức chung), CK.

### Bước 5 — Khi cần
- **Chuyển kho / kho trung tâm**:
```
[Tạo]  bên gửi quét mã (chỉ tem sealed) → phiếu draft
[Xuất] mã: status=in_transit, transferId; sổ bên gửi TRANSFER_OUT; tồn bên gửi suy lại
[Nhận] bên nhận quét → mã chuyển sang collection tem của bên nhận, status=sealed; sổ TRANSFER_IN; tồn bên nhận suy lại
[Chốt] mã không quét được → Sổ lệch bên nhận ('transfer_missing'); mã lạ → từ chối
[Huỷ]  trước khi nhận: mã về sealed bên gửi, sổ đảo
```
  Engine thêm nhóm `transfer.*` + `stock_transfers_gieogieo` (G). Kho trung tâm = cửa hàng `type:'warehouse'`. Phụ thuộc O4–O6.
- **Tài khoản theo quán + rules** (D15): custom claims `{brand:'gieogieo', storeId, role}`; rules chỉ áp lên `*_gieogieo` + tài khoản có claim; tài khoản chung `cafe33@…` giữ nguyên.

---

## 6. Phân loại dữ liệu (bảng đăng ký của `data_access`)

**S** theo quán (`gg01` tên cũ, quán khác `+__{storeId}`) · **G** dùng chung · **G+s** dùng chung, bản ghi mang `storeId` · **C** chung có ghi đè theo quán · **X** dùng chung với XOFA & The Cafe 33. Tên bỏ hậu tố `_gieogieo`. **Trước Bước 1 chạy lại `npm run inventory` và đối chiếu — không dựa vào bảng tay.**

| Collection | Loại | Ghi chú |
|---|---|---|
| `alerts`, `assets`, `assist_profile_effects`, `bill_deletions`, `book_closings`, `cashfund`, `checklist_activity_logs`, `checkout_side_effects`, `cogs`, `daily_closings`, `daily_openings`, `daily_ops`, `daily_sales_cache`, `employee_stock_deductions`, `expenses`, `handover_counts`, `handover_records`, `label_reprints`, `ledger_day_summaries`, `order_stock_traces`, `orders_gieogieo_archive`, `prep_batches`, `prep_forecasts`, `prep_ingredient_locks`, `prep_shortage_recons`, `prep_transactions`, `purchase_orders`, `receiving_records`, `refill_rules`, `reversal_unit_claims`, `sales_assist_logs`, `shift_inventory_counts`, `shift_segments`, `shift_workflows`, `staff_notes`, `stock_anomalies`, `stock_containers`, `stock_counts`, `stock_label_reports`, `stock_lost_reports`, `stock_transactions`, `storage_locations`, `work_schedules`, `store_item_state` | S | khoá theo ngày / tháng giữ nguyên (đã tách theo collection) |
| `employee_shifts` | S | nơi check-in |
| `duty_cases`, `duty_tasks`, `duty_digests`, `duty_verify_undo`, `dup_recovery`, `order_cancel_marks`, `loyalty_bill_effects`?, `stamp_free_redemptions`? | S / ? | `loyalty_bill_effects`, `stamp_free_redemptions` ghi cùng transaction với `customers` (X) theo `billId` — giữ G+s nếu `billId` không trùng giữa quán; chốt ở Bước 1 |
| `staff_target_config`, `staff_target_days` | S | O14 |
| `inventory_items`, `prep_items` | G (danh mục) | tồn của quán ≠ `gg01` ở `store_item_state` (Bước 2) |
| `employees` | G | + `storeTags` |
| `expense_categories`, `hr_settings`, `ingredient_original_packs`, `note_reasons`, `waste_reasons`, `payment_methods`, `packaging_*`, `payroll_month_adjustments`, `recipes`, `recipe_history`, `recipe_suggestions`, `topping_recipes`, `prep_recipe_history`, `prep_vessels`, `stores` | G | |
| `audit_logs`, `config_history`, `price_history`, `loyalty_pending_retry` | G+s | |
| `shift_checklists`, `special_days`, `duty_config` | C | |
| Storage `receiving_photos_gieogieo/{recordId}` | S | theo phiếu (phiếu đã theo quán) |
| `customers` | X | chỉ thêm trường tuỳ chọn |
| `rewards` | — | của The Cafe 33, Gieo Gieo không dùng |
| `finance` | ? | O3 |
| `wallets_gieogieo`, `donggia_config` | — | tính năng đã loại — không đụng |

### Đường dẫn RT
| Gốc | Loại | Quán khác `gg01` |
|---|---|---|
| `active_units_gieogieo`, `orders_gieogieo` (cả lưu trữ, REST `_ddShallow`), `billCounters_gieogieo`, `rev_marks_gieogieo`, `duty_verify_fence_gieogieo`, `printer_layout_gieogieo`, `sales_assist_stats_gieogieo` | S | `{gốc}__{storeId}/…` — gốc riêng, **không** lồng dưới gốc cũ |
| `menu_gieogieo`, `menu_togo_gieogieo`, `food_gieogieo`, `food_menu_gieogieo`, `toppings_gieogieo` | C | chung + `store_menu_overrides_gieogieo` |
| `togoSettings_gieogieo`, `sales_assist_config_gieogieo`, `appFeeSettings_gieogieo` | C | chung + phạm vi quán (Bước 3) |
| `session_display_gieogieo` | — | xoá (K0) |
| `bank_confirmations` | X | khoá CK quán mới có mã quán (Bước 2) |
| `kiosk_config` | X | của XOFA — không đụng |

---

## 7. Rủi ro chính

| Rủi ro | Mức | Cách giảm |
|---|---|---|
| Bước 1 làm đổi hành vi quán hiện tại | Cao | `gg01` → chuỗi cũ y hệt (test từng tên); 50+ test hiện có xanh nguyên; chế độ thử; theo dõi 1 tuần trước Bước 2 |
| Code viết sau này đi vòng lớp đường dẫn → quán mới ghi vào chỗ quán cũ | Cao | `check_paths.js` trong `predeploy_check`; tên chưa đăng ký ném lỗi |
| Máy quán mới mở nhầm link không mã quán → ghi vào quán hiện tại | Cao | Máy nhớ quán (O16); tên quán trên đầu màn hình; APK quán mới gắn link có mã |
| Webhook Cloud Run hỏng → **cả ba thương hiệu** mất tự xác nhận CK | Thấp (05/10) | Mã quán mới khớp regex sẵn có → không sửa webhook; STK riêng chỉ thêm 1 dòng, thử CK thật từng thương hiệu |
| Nút xoá "không đọc được ngày" ở Quản lý xoá nhầm CK của XOFA / quán mới | Cao (có từ trước) | Bước 2 mục CK.3 |
| Làm hỏng XOFA / The Cafe 33 | Rất cao | D18; không đổi rules / tài khoản chung ở Bước 1–4 |
| Deploy xoá nhầm file thương hiệu khác (chung site Hosting) | Rất cao | `tools/site_files.txt` + `predeploy_check` |
| Quán mới thiếu composite index → màn hình lỗi / đọc gốc nhiều | Cao | Runbook Bước 4 tạo index theo danh sách sinh tự động |
| Vượt hạn mức đọc miễn phí khi thêm quán | Trung bình | Tối ưu đọc (T2–T6) trước; theo dõi Usage hằng tuần; quyết định trả phí nếu cần |

---

## 8. Mỗi bước phải giữ

- 15 bất biến engine B1–B15 (`docs/UNIT_ENGINE.md` mục 1) — **tem = sự thật**, FIFO theo `openedAt`, chống đúp theo `txId`.
- `sh tests/run_all.sh` xanh; `node tools/check_boundaries.js` sạch; (từ Bước 1) `check_paths.js` sạch.
- Quán hiện tại: **không chuyển, không đổi tên dữ liệu**.
- Đổi engine = file mới `unit_engine.v{N+1}.js` (kế tiếp: **v19**), 2 HTML trỏ cùng bản, ghi `tools/engine_releases.txt`, giữ bản cũ.
- Sau mỗi lần sửa HTML: `node tools/tao_ban_thu.js .` và gửi 2 file `_thu`.
- Claude **không deploy**; chủ dự án chạy `sh tools/predeploy_check.sh` rồi `firebase deploy --only hosting`.
