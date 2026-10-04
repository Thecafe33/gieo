# Gieo Gieo — Kế hoạch mở đa cửa hàng (M0 → M6)

> Lập ngày 28/09/2026. **Cập nhật theo hiện trạng 04/10/2026** (engine v18, sau các tính năng 30/09–04/10).
> File này **tự đủ** để bắt đầu lại sau nhiều tháng. Hiện trạng chung: `docs/TRANG_THAI.md`; nguồn chi tiết:
> mục 7–9 của `docs/KE_HOACH_UNIT_ENGINE_DA_CUA_HANG.md`; API engine: `docs/UNIT_ENGINE.md`.
> Phần thay đổi so với bản 28/09 đánh dấu **[04/10]**.

---

## 0. Khi nào lấy file này ra

Chỉ bắt đầu khi **đủ cả 3**:
1. Bản hiện tại (engine **`unit_engine.v18.js`** + 2 HTML trỏ v18) đã deploy và chạy **ổn định ở cửa hàng 1** ít nhất vài tuần: Sổ lệch không tăng bất thường, kiểm kê cuối ca khớp, vụ lệch (`duty`) hợp lý, không lỗi đồng bộ. **[04/10]** Lúc cập nhật file này **chưa xác nhận** v18 đã deploy — hỏi chủ dự án trước.
2. Đã trả lời các câu hỏi ở **mục 4** (ít nhất O8, O7, O13 trước M2–M3).
3. Có thời gian cho một **cửa sổ bảo trì ngoài giờ bán** (M2) và một môi trường **staging** (bản sao project Firebase hoặc project thử).

**Câu mở đầu gợi ý cho phiên Claude mới:**
> Đọc CLAUDE.md, docs/TRANG_THAI.md, docs/KE_HOACH_DA_CUA_HANG.md và docs/UNIT_ENGINE.md. Chạy `sh tests/run_all.sh` và `node tools/check_boundaries.js`. Bắt đầu M0 (mục 5) — phản biện trước, báo tôi rồi mới sửa. Không deploy.

**[04/10] Mỗi giai đoạn nên mở một phiên mới.** Mức model gợi ý: trả lời mục 4 + phản biện kế hoạch → Opus, effort high · M0 → Sonnet, medium · M1 → Sonnet, high · M2a/M2 → Opus, xhigh (script chuyển dữ liệu + quay lui: max) · M3 → Opus, xhigh · M4 → Sonnet, high (phần cộng gộp số liệu: Opus, high) · M5 → Opus, xhigh · M6 → Sonnet, medium (lỗi lệch kho/tiền: Opus, high).

---

## 1. Vì sao hiện tại CHƯA mở cửa hàng 2 được

Engine đã *biết* `storeId` nhưng cố định `'gg01'`, còn **mọi dữ liệu vẫn nằm chung một chỗ**. Nếu cửa hàng 2 dùng app hiện tại:

| Dữ liệu | Hậu quả |
|---|---|
| Tồn kho: `inventory_items.currentStock`, RT `active_units_gieogieo/{itemId}` | Hai quán cộng/trừ chung một tồn, chung danh sách tem đang mở — FIFO trừ nhầm tem quán kia |
| Bill: RT `orders_gieogieo/{tháng}`, `billCounters_gieogieo` | Số bill đan xen, doanh thu gộp, không tách được |
| Ca / kết ca / kiểm kê: `daily_closings/{ngày}`, `daily_openings`, `handover_*`, `shift_inventory_counts/{ngày}_{phase}` | Khoá theo **ngày** → quán này **ghi đè** ca của quán kia |
| Chuyển khoản: `orderId = GG + ddMMHHmmss` | Hai quán tạo QR cùng giây → trùng khoá xác nhận |
| Tài khoản: mọi máy đăng nhập chung `cafe33@…`, rules = đăng nhập là toàn quyền | Không có ranh giới dữ liệu giữa quán |
| **[04/10]** Quy trách nhiệm theo ca (`duty_*`), dấu hoàn RT (`rev_marks_gieogieo/{itemId}`, `duty_verify_fence_gieogieo/{prepId}`) | Vụ lệch, rào xác minh của hai quán lẫn vào nhau |
| **[04/10]** Target nhân viên (`staff_target_*`), hoà vốn/lãi lỗ ngày, lương theo lịch | Target và số chụp gộp hai quán; chi phí/lương/khấu hao chưa tách theo quán |

**Phương án tạm (không khuyên)** nếu bắt buộc mở gấp trước khi xong M1–M3: nhân bản riêng hai app với hậu tố dữ liệu khác (vd `_gieogieo2`). Được: dữ liệu tách hẳn. Mất: báo cáo gộp, chuyển kho, nhân viên/khách dùng chung dễ lệch; sau này phải gộp lại — ngược hướng D4.

---

## 2. Những gì ĐÃ sẵn sàng (nền cho đa cửa hàng)

- **Một engine duy nhất** cho kho theo tem/lô, dùng chung POS + Quản lý; app không ghi thẳng dữ liệu kho (`tools/check_boundaries.js` chặn).
- **Khối `P`** trong engine = chỗ DUY NHẤT định nghĩa đường dẫn dữ liệu kho (`P.units`, `P.containers`, `P.stockTx`, …, `P.storeId()`) → M2 đổi đường dẫn kho **ở đây**.
- **`storeId`** truyền qua `UnitEngine.init({ storeId })`; mọi bản ghi Firestore **mới** do engine tạo đã mang `storeId` (hiện `'gg01'`).
- **Giờ máy chủ** (`serverClock`) + mốc chống ghi đè B9 thống nhất giữa các máy — cần khi nhiều máy/nhiều quán cùng ghi.
- **Bộ test** (`sh tests/run_all.sh`) + kiểm tra trước deploy (`sh tools/predeploy_check.sh`).

- **[04/10]** Engine đã qua 7 vòng rà bug (v6–v17) + Firebase giả **chế độ nghiêm** (`tests/lib/fakefb.js` báo lỗi như Firebase thật) — nền test đủ chắc để làm test ảnh chụp trước/sau cho M1–M2.
- **[04/10]** Chế độ thử (`che_do_thu.v1.js`, bản `_thu`) chạy code mới trên bản sao dữ liệu thật — dùng thử từng bước M0–M4 trước khi bật cho quán.

Chưa có: lớp truy cập dữ liệu cho phần **ngoài** engine (bán hàng, ca, báo cáo… **[04/10] 567 lời gọi `collection(`: POS 262, Quản lý 305**; engine v18 có thêm 212 nhưng đi qua khối `P`/hằng của engine), buộc cập nhật từ xa (`app_config_gieogieo`, `APP_VERSION` — chưa có), tài khoản theo quán, `tools/site_files.txt`.

---

## 3. Quyết định đã chốt (không bàn lại trừ khi có lý do mới)

| # | Chủ đề | Quyết định |
|---|---|---|
| D1 | Kiến trúc | Không backend / Cloud Functions. Engine + lớp dữ liệu là file `.js` tĩnh, nạp bằng `<script src>` |
| D4 | Hướng đa cửa hàng | **Hướng B** — chung dữ liệu, bản ghi mang `storeId` (dự kiến ~10 cửa hàng) |
| D5 | Khách hàng | `customers` + tích tem **dùng chung** giữa các quán |
| D6 | Nhân viên | **Dùng chung**, có `storeTags`; check-in ở quán nào cũng được |
| D7 | Lịch làm việc | **Theo cửa hàng**, đổi vị trí được |
| D8 | Chuyển khoản | **Một đường chung** `bank_confirmations`, mã có mã cửa hàng |
| D10 | Phiếu nhập | **Riêng từng cửa hàng** |
| D11 | Khuyến mãi | Phạm vi **toàn hệ thống** hoặc **danh sách cửa hàng** |
| D12 | Nguồn hàng | Chuyển giữa quán, từ **kho trung tâm**, hoặc NCC giao tận quán |
| D13 | Chuyển mã | Mặc định **chỉ tem nguyên seal** |
| D14 | Dụng cụ cân | Dùng chung |
| D15 | Bảo mật | Tách tài khoản + rules ở M3; tắt WebView debugging bản phát hành |
| D16 | Không gian tên | Collection / đường dẫn RT **mới** giữ hậu tố `_gieogieo` (`stores_gieogieo`, `active_units_gieogieo/{storeId}/…`) |
| D17 | Không chặn bán | Không cơ chế nào chặn bán / chặn khởi động khi offline — ngoại lệ duy nhất: cửa sổ bảo trì M2 |
| D18 | Dùng chung với XOFA & The Cafe 33 | `customers`, `bank_confirmations`, webhook Cloud Run, tài khoản `cafe33@…`, rules: Gieo Gieo **chỉ được thêm**, không đổi cấu trúc / quyền / hành vi của họ. Script chuyển dữ liệu **không ghi** vào nhóm này. `rewards`, `kiosk_config`: không ghi |

---

## 4. Câu hỏi phải trả lời trước

| # | Câu hỏi | Cần trước |
|---|---|---|
| **O8** | Chuẩn mã cửa hàng (`GG01`, `GG02`… hay 2 ký tự `01`?) — dùng trong khoá doc, đường dẫn RT, nội dung CK | M2 |
| **O13** | Mã nguồn webhook Cloud Run (xác nhận CK) — tiền tố từng thương hiệu, cách tách `orderId`, cách ghi RT | M3 |
| **O7** | Giới hạn độ dài nội dung CK của ngân hàng | M3 |
| O3 | `finance_gieogieo` chứa gì (dùng chung hay theo quán)? | M2 |
| O4 | Có chuyển tem **đang mở** giữa quán không? (mặc định: không) | M5 |
| O5 | Có bếp trung tâm nấu BTP chuyển đi không? | M5 |
| O6 | Kho trung tâm thao tác trên POS rút gọn hay trên Quản lý? | M5 |
| — | Quán 2 có menu / giá / khuyến mãi khác quán 1 không? | M4 |
| — | Staging: tạo project Firebase thử riêng, hay bản sao dữ liệu trong project hiện tại? **[04/10]** Chế độ thử (`__test_gieogieo`) đủ cho M0, M1, M4; **không đủ** cho M2 (cần thử cả rules, index, webhook) | M2 |
| **[04/10]** O14 | Target nhân viên theo quán hay toàn chuỗi? (mặc định đề xuất: theo quán) | M4 |
| **[04/10]** O15 | Chi phí cố định, tài sản/khấu hao, lương cứng: gắn theo quán hay chia theo tỷ lệ? (quyết định cách tính hoà vốn từng quán) | M4 |

---

## 5. Lộ trình

Mỗi bước: **phản biện → báo → sửa → test → chủ dự án deploy & thử máy thật**. Không gộp nhiều bước vào một lần deploy.

### M0 — Chuẩn bị (nhỏ, làm đầu tiên) — **[04/10] chưa làm mục nào**
0. Tạo `tools/site_files.txt` (danh sách file của XOFA / The Cafe 33 trên site Hosting dùng chung) để `predeploy_check` chặn deploy làm mất file của họ.
1. **Buộc cập nhật từ xa** (mục 6.4 kế hoạch gốc — chưa làm): doc `app_config_gieogieo/versions = { minPos, minQuanly, maintenance:{from,to,message} }`, đọc bằng listener. Máy có phiên bản < `min*` → banner + tự tải lại khi **không có bill đang mở**. `maintenance` hiệu lực → màn bảo trì. *Đây là điều kiện bắt buộc của M2.*
2. Thêm hằng `APP_VERSION` vào 2 HTML; `predeploy_check` kiểm 2 app cùng tăng phiên bản khi đổi engine.
3. (Tuỳ) Hợp nhất các dấu mốc chống ghi đè về `lastAbsWrite` (E5-2 để lại) — làm cùng M2 cho đỡ đổi dữ liệu hai lần.

**Xong khi**: bật `maintenance` trên staging → mọi máy thử vào màn bảo trì; tắt → bán lại bình thường.

### M1 — Lớp truy cập dữ liệu ngoài engine (không đổi hành vi)
- File dùng chung `data_access.v1.js`: `coll(name)`, `rt(path)`, `dayKey(ngày)` — hiện trả đúng tên/khoá cũ (`storeId` cố định).
- Thay dần **567** lời gọi `fstore.collection('…')` (POS 262, Quản lý 305 — đếm 04/10) + đường dẫn RT viết cứng bằng lớp này; mở rộng `tools/check_boundaries.js` để chặn `collection('…_gieogieo')` viết cứng mới.
- **[04/10]** Lớp dữ liệu phải nạp được cả trong chế độ thử: `che_do_thu` tráo `fstore.collection`/`db.ref` ở tầng dưới nên lớp mới không cần biết; nhưng danh sách collection cấu hình chép sang vùng thử (`che_do_thu.v1.js`, mảng đầu file) phải thêm các collection mới (`staff_target_config`…) → `che_do_thu.v2.js` (bản cũ cache immutable).
- Script AST liệt kê mọi `where/orderBy` → **danh sách index** cần tạo cho M2.

**Xong khi**: test xanh, checker báo không còn tên collection viết cứng; hành vi không đổi.

### M2a — Tách trạng thái tồn khỏi doc danh mục (trước M2)
- Trạng thái tồn (`currentStock`, `locationStock`, `unrefilledConsumption`, `refillUncertain`, `pendingShortage`, `untrackedPendingDelta`, `_ueLastRecomputeStart`) chuyển sang `store_item_state_gieogieo/{storeId}_{itemId}`; `inventory_items` / `prep_items` chỉ còn **danh mục** dùng chung.
- Engine ghi **song song** doc cũ + doc mới trong một transaction một thời gian; màn hình chuyển dần sang đọc doc mới (lập danh sách hàm đọc bằng AST — khoảng 25 hàm POS + 11 QL đọc `inventory_items`, 13 + 6 đọc `prep_items`); hết nơi đọc thì ngừng ghi trường cũ.
- Chi phí: mỗi lượt ghi sổ đọc thêm 1 doc (~+750 lượt đọc/ngày/quán — chấp nhận được).

### M2 — Schema & chuyển dữ liệu (RỦI RO CAO NHẤT)
**Code**: bật `storeId` thật trong `coll/rt/dayKey` và khối `P` của engine; khoá doc có `storeId`; tạo index (danh sách từ M1); việc lưu trữ / dọn dẹp chạy theo quán.

**Runbook** — staging trước, rồi thật trong cửa sổ bảo trì:
1. Công bố lịch bảo trì; bật `maintenance` + nâng `minPos/minQuanly`. Xác nhận **mọi máy** đã lên bản M2 và đang ở màn bảo trì.
2. Xác nhận webhook Cloud Run vẫn ghi `bank_confirmations` như cũ; app XOFA / The Cafe 33 không bị ảnh hưởng.
3. **Sao lưu**: export Firestore + RTDB.
4. Chạy script (idempotent, **chỉ thêm**):
   1. Tạo `stores_gieogieo/gg01` (+ kho nếu có).
   2. Gắn `storeId:'gg01'` cho mọi bản ghi loại **S** (mục 6).
   3. Sao chép doc khoá theo ngày/tháng sang khoá mới `gg01_…`.
   4. Tạo `store_item_state_gieogieo/gg01_{itemId}` (nếu M2a chưa tạo).
   5. RT: `active_units_gieogieo/*` → `active_units_gieogieo/gg01/*`; `orders_gieogieo/{tháng}` → `orders_gieogieo/gg01/{tháng}`; `billCounters_gieogieo` → `billCounters_gieogieo/gg01`; **[04/10]** `rev_marks_gieogieo/*` → `rev_marks_gieogieo/gg01/*`; `duty_verify_fence_gieogieo/*` → `duty_verify_fence_gieogieo/gg01/*`.
   6. **Không ghi** `customers`, `rewards`, `bank_confirmations`.
5. **Khoá chỉ-đọc** đường dẫn/khoá cũ bằng rules — máy nào còn bản cũ sẽ lỗi ghi thay vì ghi lệch chỗ.
6. **Kiểm đếm** trước/sau: số doc từng collection; tổng `currentStock` từng món; tổng `unitBase` tem mở; số tem sealed; doanh thu 30 ngày.
7. Thử checklist bán hàng / kho trên một máy → tắt `maintenance`.
8. Giữ dữ liệu cũ (chỉ-đọc) ≥ 14 ngày rồi mới xoá.

**Quay lui**: tắt khoá chỉ-đọc, trỏ HTML về bản trước M2 — dữ liệu cũ còn nguyên (script chỉ thêm).

### M3 — Danh tính, quyền, chuyển khoản
- **Tài khoản theo quán** bằng custom claims `{brand:'gieogieo', storeId, role}` (gán bằng Admin SDK — script một lần hoặc endpoint nhỏ trên Cloud Run hiện có). **Không tắt / không đổi mật khẩu** tài khoản chung `cafe33@…`.
- Rules (phác thảo): tài khoản không claim = `legacy()` giữ toàn quyền (XOFA, The Cafe 33, máy chưa chuyển); tài khoản `gg()` chỉ ghi `*_gieogieo` đúng `storeId` của mình (loại S), đọc G/C, ghi G/C khi là Quản lý; `customers` đọc/ghi như hiện tại. Ranh giới chỉ thật sự có khi **mọi** máy Gieo Gieo đã chuyển tài khoản.
- **Chuyển khoản** — thứ tự bắt buộc:
  1. Đọc mã nguồn webhook (O13).
  2. Sửa webhook nhận **thêm** dạng `GG{mã quán}{ddMMHHmmss}`, **giữ nguyên** dạng `GG{ddMMHHmmss}` và toàn bộ dạng của XOFA / The Cafe 33; kiểm mã quán không tạo chuỗi trùng tiền tố thương hiệu khác; kiểm độ dài (O7).
  3. Deploy webhook ngoài giờ bán của **cả ba**, thử **một giao dịch CK thật cho mỗi thương hiệu**.
  4. Mới đổi POS Gieo Gieo sang dạng mới.
  5. Hàm dọn `bank_confirmations` cũ (`ddDeleteBankOld`) hiện xoá **mọi** khoá > 7 ngày, kể cả của XOFA / The Cafe 33 → giới hạn chỉ xoá khoá tiền tố `GG`.
- Check-in ghi `storeId`; nhân viên có `storeTags`; tắt WebView debugging.

### M4 — Quản lý đa cửa hàng
- Bộ chọn cửa hàng: 1 / nhiều / toàn chuỗi; báo cáo gộp = cộng từng quán; các hàm đọc toàn lịch sử (`loadExpensesAll`, `loadDailyOpsAll`) → truy vấn theo khoảng ngày + `storeId`.
- Menu RT giữ chung + `store_menu_overrides_gieogieo/{storeId}` = `{hidden:[…], price:{…}}`; công thức chung.
- Khuyến mãi: mỗi chương trình / chiến dịch thêm `stores: 'all' | [storeId…]` (thiếu = toàn hệ thống; **không** dùng trường `scope` cũ). `togoSettings_gieogieo` → danh sách chương trình có `stores`, hoặc cấu hình chung + `togoSettingsOverrides_gieogieo/{storeId}` — chốt khi làm.
- Phiếu nhập, lịch làm việc, checklist, ngày đặc biệt theo quán; nút "sao chép cấu hình từ cửa hàng A".
- **[04/10]** Lãi/lỗ & hoà vốn theo quán: `computeDayPL` / `plBreakEven` (hoà vốn ngày: chỉ giá vốn + phí kênh là biên phí; lương, cố định, khấu hao, hao hụt, chi phí biến đổi là phần cần đắp) nhận chi phí/lương/khấu hao **của quán** (O15). Lương dự đoán (`plPredictedLaborByDate`) lọc lịch theo `storeId` (D7).
- **[04/10]** Target nhân viên: cấu hình `staff_target_config_gieogieo/{storeId}_{YYYY-MM}`, số chụp `staff_target_days_gieogieo/{storeId}_{YYYY-MM}` (O14); POS đọc bill RT theo quán. Ba hàm dùng chung `stPickConfig/stDailyTargets/stPct` đổi đồng thời ở 2 app (test so khớp).
- **[04/10]** Kế hoạch trách nhiệm ca (`duty`): vụ lệch, việc xác minh, tóm tắt ngày lọc theo quán; ngưỡng `duty_config` chung hay theo quán — chốt khi làm.

### M5 — Chuyển kho & kho trung tâm (chỉ khi cần)
```
[Tạo]  bên gửi quét mã (chỉ tem sealed) → phiếu draft
[Xuất] mã: status=in_transit, transferId; sổ bên gửi TRANSFER_OUT; tồn bên gửi suy lại
[Nhận] bên nhận quét → mã: storeId=bên nhận, status=sealed; sổ TRANSFER_IN; tồn bên nhận suy lại
[Chốt] mã không quét được → Sổ lệch bên nhận ('transfer_missing'); mã lạ → từ chối
[Huỷ]  trước khi nhận: mã về sealed bên gửi, sổ đảo
```
Engine thêm nhóm `transfer.*` + collection `stock_transfers_gieogieo`. Kho trung tâm = cửa hàng `type:'warehouse'` (không bán). Phụ thuộc O4–O6.

### M6 — Thí điểm & nhân rộng
- Cửa hàng 2 chạy **2–4 tuần** có theo dõi: lệch tồn, Sổ lệch, lượt đọc Firebase (hạn mức **chung** với XOFA & The Cafe 33 — xem Usage hằng tuần), lỗi đồng bộ, CK.
- Viết runbook khai trương quán mới: tạo `stores_gieogieo/{id}`, tài khoản + claims, máy POS, menu/giá ghi đè, quy tắc refill & vị trí kho, nhân viên `storeTags`, thử CK.

---

## 6. Phân loại dữ liệu

**G** dùng chung · **G+s** dùng chung, bản ghi mang `storeId` · **C** danh mục chung có ghi đè theo quán · **S** theo cửa hàng · **X** dùng chung với XOFA & The Cafe 33.
(Tên dưới đây bỏ hậu tố `_gieogieo`.)

| Collection | Loại | Ghi chú |
|---|---|---|
| `alerts`, `assets`, `assist_profile_effects`, `bill_deletions`, `checklist_activity_logs`, `checkout_side_effects`, `cogs`, `discount_effects`, `voucher_effects`, `expenses`, `label_reprints`, `ledger_day_summaries`, `order_stock_traces`, `prep_batches`, `prep_transactions`, `prep_shortage_recons`, `reversal_unit_claims`, `sales_assist_logs`, `shift_segments`, `shift_workflows`, `staff_notes`, `stock_anomalies`, `stock_counts`, `stock_label_reports`, `stock_lost_reports`, `stock_transactions` | S | |
| `book_closings` | S | `{tháng}` → `{storeId}_{tháng}` |
| `cashfund`, `handover_counts`, `handover_records` | S | khoá ngày |
| `daily_closings`, `daily_openings`, `daily_ops`, `daily_sales_cache` | S | khoá ngày → `{storeId}_{ngày}` |
| `shift_inventory_counts` | S | `{ngày}_{phase}` → thêm `storeId` |
| `prep_forecasts` | S | `{ngày}_{prepId}` → thêm `storeId` |
| `prep_ingredient_locks` | S | `{itemId}` → `{storeId}_{itemId}` |
| `orders_gieogieo_archive` | S | thêm `storeId` vào khoá; lưu trữ chạy theo quán |
| `employee_shifts` | S | `storeId` = nơi check-in |
| `employee_stock_deductions` | S | |
| `purchase_orders`, `receiving_records` | S | D10 |
| `refill_rules`, `storage_locations` | S | |
| `stock_containers` | S | `storeId` = nơi đang giữ; đổi khi chuyển kho |
| `work_schedules` | S | D7 |
| `inventory_items`, `prep_items` | G (danh mục) | trạng thái tồn → `store_item_state` (M2a) |
| `employees` | G | + `storeTags` |
| `expense_categories`, `hr_settings`, `ingredient_original_packs`, `note_reasons`, `waste_reasons`, `payment_methods`, `packaging_*`, `payroll_month_adjustments`, `recipes`, `recipe_history`, `recipe_suggestions`, `topping_recipes`, `prep_recipe_history`, `prep_vessels` | G | |
| `audit_logs`, `config_history`, `price_history`, `loyalty_bill_effects`, `loyalty_pending_retry`, `stamp_free_redemptions` | G+s | |
| `shift_checklists`, `special_days` | C | |
| **[04/10]** `duty_cases`, `duty_tasks`, `duty_digests`, `duty_verify_undo`, `dup_recovery`, `order_cancel_marks` | S | nhóm `duty` (v4–v5) + dấu/phục hồi của engine (v9–v16) |
| **[04/10]** `duty_config` | C | ngưỡng quy trách nhiệm — chung, có thể ghi đè theo quán |
| **[04/10]** `staff_target_config`, `staff_target_days` | S | khoá `{YYYY-MM}` → `{storeId}_{YYYY-MM}` (O14) |
| **[04/10]** `inventory_items.prepWholePack` | G | trường danh mục (nấu dùng nguyên gói) — đi theo danh mục chung |
| **[04/10]** Storage `receiving_photos_gieogieo/{recordId}` | S | ảnh phiếu nhận, theo phiếu (đã theo quán qua `receiving_records`) |
| `customers` | **X** | chỉ thêm trường tuỳ chọn |
| `rewards` | — | của The Cafe 33, Gieo Gieo không dùng (F4) |
| `finance` | ? | O3 |
| `wallets_gieogieo`, `donggia_config` | — | tính năng đã loại — không chuyển, không tự xoá |

**Collection mới**: `stores_gieogieo`, `store_item_state_gieogieo`, `stock_transfers_gieogieo`, `store_menu_overrides_gieogieo`, `app_config_gieogieo`.

### Đường dẫn RT
| Hiện tại | Sau M2 | Loại |
|---|---|---|
| `active_units_gieogieo/{itemId}` | `active_units_gieogieo/{storeId}/{itemId}` | S |
| `orders_gieogieo/{tháng}/{ngày}` | `orders_gieogieo/{storeId}/{tháng}/{ngày}` (sửa cả lưu trữ, REST `_ddShallow`) | S |
| `billCounters_gieogieo` | `billCounters_gieogieo/{storeId}` | S |
| `menu_gieogieo`, `menu_togo_gieogieo`, `food_gieogieo`, `food_menu_gieogieo`, `toppings_gieogieo` | giữ + `store_menu_overrides_gieogieo` | C |
| `togoSettings_gieogieo`, `sales_assist_config_gieogieo`, `appFeeSettings_gieogieo` | chung + phạm vi quán (M4) | C |
| `printer_layout_gieogieo`, `sales_assist_stats_gieogieo` | theo quán | S |
| **[04/10]** `rev_marks_gieogieo/{itemId}` (dấu hoàn bền, v10) | `rev_marks_gieogieo/{storeId}/{itemId}` | S |
| **[04/10]** `duty_verify_fence_gieogieo/{prepId}` (rào xác minh, v9) | `duty_verify_fence_gieogieo/{storeId}/{prepId}` | S |
| **[04/10]** `session_display_gieogieo` | xoá (K0, sau khi mọi máy tải lại) — không chuyển | — |
| `bank_confirmations` | giữ; khoá có mã quán (M3) | X |
| `kiosk_config` | của XOFA — không đụng | X |

---

## 7. Rủi ro chính

| Rủi ro | Mức | Cách giảm |
|---|---|---|
| Chuyển dữ liệu M2 hỏng | Rất cao | Staging; sao lưu; script chỉ-thêm, idempotent; kiểm đếm; quay lui |
| Máy còn chạy bản cũ lúc chuyển dữ liệu | Rất cao | M0 (`minVersion` + `maintenance`) + khoá chỉ-đọc dữ liệu cũ |
| Webhook Cloud Run hỏng → **cả ba thương hiệu** mất tự xác nhận CK | Rất cao | Đọc mã nguồn trước; chỉ thêm dạng mới; thử giao dịch thật từng thương hiệu; nhân viên vẫn xác nhận tay được |
| Làm hỏng XOFA / The Cafe 33 (rules, tài khoản, dọn CK) | Rất cao | D18; staging có app cả ba; rules mới chỉ áp `*_gieogieo` + tài khoản có claim; không tắt tài khoản chung |
| Deploy xoá / quay lui nhầm file thương hiệu khác (chung một site Hosting) | Rất cao | `tools/site_files.txt` + `predeploy_check`; quay lui bằng sửa tiến |
| Thiếu index sau M2 → màn hình lỗi truy vấn | Cao | Danh sách index từ M1, tạo trước M2 |
| Chi phí đọc tăng (hạn mức chung ba thương hiệu) | Trung bình | `storeId` trên mọi truy vấn S; bỏ đọc toàn lịch sử; theo dõi Usage |
| **[04/10]** Bỏ sót đường dẫn mới thêm sau 28/09 (`duty_*`, `rev_marks`, `staff_target_*`…) khi chuyển dữ liệu | Cao | Trước M2 chạy lại danh sách bằng AST (`npm run inventory`) và đối chiếu bảng mục 6 — không dựa vào bảng tay |

---

## 8. Mỗi bước phải giữ

- 15 bất biến engine B1–B15 (`docs/UNIT_ENGINE.md` mục 1) — đặc biệt **tem = sự thật**, FIFO theo `openedAt`, chống đúp theo `txId`.
- `sh tests/run_all.sh` xanh; `node tools/check_boundaries.js` sạch; thêm test ảnh chụp cho mọi nghiệp vụ đổi đường dẫn (so trước/sau như E4).
- Dữ liệu ghi ra **tương thích ngược** (chỉ thêm trường) cho tới đúng bước M2 có bảo trì.
- Đổi engine = file phiên bản mới `unit_engine.v{N+1}.js` (bản kế tiếp: **v19**), cả hai HTML trỏ cùng bản, ghi `tools/engine_releases.txt`, giữ bản cũ (hiện giữ toàn bộ v1–v18).
- Sau mỗi lần sửa HTML: `node tools/tao_ban_thu.js .` và gửi 2 file `_thu`.
- Claude **không deploy**; chủ dự án chạy `sh tools/predeploy_check.sh` rồi `firebase deploy --only hosting`.
