# NET — ALERTS / NOTIFICATIONS — V1

> Nguồn: `FIFO-CHAIN-TRACE-ALERTS-V1.md` đối chiếu với `src/layers/alerts/alert.js`,
> `src/layers/finance/config.js`, `src/layers/read-layer/gateway.js`.
>
> Chain-trace gốc trace "1 collection trung tâm + nhiều cơ chế push/pull",
> không phải 1 luồng tuần tự — NET này giữ đúng 8 mục [1]-[8] để đối chiếu
> ngược, đặt tên AL1-AL8.

## Sơ đồ (không tuần tự — 1 hub trung tâm)

```
AL1 Alert được tạo (nhiều nguồn) ──► AL2 Xếp hạng theo (type, severity)
                                            │
                    AL4 audience (POS/QUANLY/BOTH) theo mức nghiêm trọng thật
                                            │
AL3 Đẩy lên UI (push thật — StoreHealth, FIFO bell)
                                            │
AL6 Xác nhận/đóng cảnh báo (markSeen ≠ resolve)
                                            │
AL7 Kênh ngoài app (chỗ nối sẵn qua toEvents)

AL5 KPI/Target theo TỪNG NGÀY (finance/config.js, tách riêng khỏi AL1-4)
AL8 stockoutTargetPct — dead code (đã xác nhận dọn ở NET-RAW-MATERIAL-V1.md RM8)
```

---

## AL1 — Alert được tạo (nhiều nguồn)

| | |
|---|---|
| **Hệ cũ** | Nhiều điểm ghi vào `alerts_gieogieo` (`handover_variance`, `handover_cash_variance`, `prep_count_variance`, `prep_yield_mismatch`, `missing_recipe`, `untracked_unit_consumption`, `allocate_rtdb_error`, `label_reconcile_anomaly`, `stampfree_failed_*`...). Chain-trace: "KHÔNG ĐỨT — nguồn ghi phong phú, mỗi loại có ngữ cảnh cụ thể" |
| **Hệ mới** | `alerts/alert.js` → `TYPES` (16 loại đăng ký) + `raise()` |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM** |
| **Ghi chú** | Mỗi loại trong `TYPES` tự khai `severity`/`audience`/`resolution`/`required` — đóng luôn gap "§4.9: 12/16 loại rơi vào khuôn UI chung, mất nội dung chẩn đoán" (không phải mục đánh số trong sơ đồ 8 bước nhưng cùng file chain-trace, nêu trong header `alert.js`). `raise()` validate đủ trường bắt buộc theo TỪNG loại — thiếu 1 trường chẩn đoán thì từ chối tạo, không cho ra alert rỗng nội dung. `alertId` xác định theo `(type, storeId, subjectKey)` — cùng vấn đề không sinh nhiều alert trùng. **Nhưng: xem AL-CHUNG bên dưới — chưa command nào thật sự GỌI `raise()`.** |

## AL2 — Phân loại mức độ khẩn

| | |
|---|---|
| **Hệ cũ** | `computeStoreHealth()` (`quanlygieo.html:9401-9534`) — 🔴 ĐỨT CHUỖI: alert tự gắn `severity:'danger'` lúc tạo nhưng hàm CHỈ switch theo `a.type` (dòng 9431-9455); loại không nằm trong 6 type đặt tên cứng rơi hết vào bucket vàng chung "Cảnh báo khác chưa xem", kể cả loại đã tự gắn nhãn danger |
| **Hệ mới** | `alerts/alert.js` → `rank()` + `bucketize()` |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM** |
| **Ghi chú** | `rank()` sort theo `SEVERITY_RANK` TRƯỚC, không theo type — đọc đúng field `severity` đã bị bỏ qua ở hệ cũ. `bucketize()` group vào đúng 3 bucket `{DANGER, WARNING, INFO}` — không có bucket "khác" nuốt alert đã tự gắn nhãn nghiêm trọng. Cùng mức severity thì alert cũ hơn xếp trước (`raisedAt` tăng dần) — "tồn lâu không bị lùi xuống cuối", một cải tiến nhỏ không có trong yêu cầu gốc nhưng hợp lý. |

## AL3 — Đẩy lên UI mặc định (push thật)

| | |
|---|---|
| **Hệ cũ** | StoreHealth + sidebar dot (`renderToday()` tự gọi khi mở app QUANLY) và FIFO bell (`posgieo.html:4166-4444`, badge luôn hiện trên màn order mặc định POS, poll 2 phút + trigger sự kiện, cơ chế DUY NHẤT tự xoá đúng khi điều kiện thật sự hết) — chain-trace: "KHÔNG ĐỨT cho 2 cơ chế này" |
| **Hệ mới** | `read-layer/gateway.js` → `getAlerts()` (query `GetAlerts`, đọc theo `audience`) |
| **Phân loại** | ⚪ **CHƯA THỂ XÁC NHẬN — thuộc tầng UI, chưa tới lượt nối** |
| **Ghi chú** | `GetAlerts` đã đăng ký và lọc theo `audience` — đúng nền để dựng lại CẢ HAI cơ chế push (StoreHealth/sidebar dot cho QUANLY, FIFO-bell-style badge cho POS) từ MỘT nguồn duy nhất thay vì 2 đường tách biệt như hệ cũ. Nhưng việc UI thật sự poll/subscribe đúng nhịp (2 phút + trigger sự kiện như FIFO bell) là việc của bước sửa `posgieo.html`/`quanlygieo.html` tại chỗ sau này — không đánh giá được tới khi làm bước đó. Không phải GAP của core, chỉ chưa tới lượt. |

## AL4 — Các cảnh báo còn lại (chỉ PULL dù đáng lẽ nên PUSH)

| | |
|---|---|
| **Hệ cũ** | 🔴 ĐỨT CHUỖI NHIỀU ĐIỂM: ngày-chưa-đóng-sổ chỉ hiện khi tự mở màn Ca làm việc (nhưng comment QUANLY ngộ nhận là push); hạn dùng BTP chôn trong màn Tài chính trong khi hạn dùng chai/hũ được push đỏ (cùng loại rủi ro, xử lý khác nhau); bất thường định lượng (`soBatThuong`) chỉ hiện màn đối chiếu riêng; tồn thấp CHỈ ở QUANLY — nhân viên bán hàng không được báo |
| **Hệ mới** | `alerts/alert.js` → field `audience` trên từng `TYPES` entry |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM** |
| **Ghi chú** | Đã xác nhận đúng thiết kế "LUỒNG CHUẨN" #2: `PREP_BATCH_EXPIRING` (hạn BTP) giờ `severity: DANGER, audience: BOTH` — CÙNG MỨC với `CONTAINER_EXPIRING` (hạn chai/hũ), header file tự ghi chú rõ "Legacy để loại này chôn trong màn Tài chính". `LOW_STOCK` → `audience: BOTH` — nhân viên đứng bán giờ nằm trong tầm đọc alert này, không chỉ QUANLY. `DAY_NOT_CLOSED` → `audience: BOTH`. Quyết định `audience` giờ nằm ở DỮ LIỆU (đăng ký loại), không phải "ai code trước ở màn nào". |

## AL5 — Cấu hình Target/KPI (áp version sai theo khoảng ngày)

| | |
|---|---|
| **Hệ cũ** | `computeKPIs()` (`quanlygieo.html:5669-5761`) — bản thân việc version hoá target theo `effectiveFrom` (`config_history_gieogieo`, `configForDate()`) là ĐÚNG, nhưng 🔴 ĐỨT CHUỖI Ở CHỖ ÁP DỤNG: chọn version tại NGÀY CUỐI của cả khoảng báo cáo rồi áp DUY NHẤT version đó cho TOÀN BỘ khoảng — nếu target đổi giữa kỳ, các ngày đầu kỳ bị đánh giá lại theo target MỚI. Xác nhận là lần thứ 6 của cùng lớp lỗi versioning |
| **Hệ mới** | `finance/config.js` → `resolveConfigDaily()` |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM** |
| **Ghi chú** | Header file tự nhận đích danh: "đóng instance #6" — gọi `registry.resolveDaily()` trả về version có hiệu lực cho TỪNG `dateKey` riêng lẻ trong khoảng, không phải 1 version áp chung. Khi chưa ai cấu hình, trả mặc định cho mọi ngày và NÓI RÕ `isDefault: true` thay vì giả vờ có cấu hình — không bịa. Đây là bằng chứng thứ 6 cho nguyên tắc kiến trúc versioning (sau Recipe, Packaging, BTP yield, Payroll, COGS chung — và giờ có thêm domain thứ 7 nếu tính cả instance đã thấy trước đó theo đúng cách đếm của chain-trace). |

## AL6 — Xác nhận/tắt cảnh báo

| | |
|---|---|
| **Hệ cũ** | `quanlygieo.html:9631-9637` — `status: new → seen → resolved`, CẢ "Đã xem" LẪN "Đã xử lý" đều làm alert biến mất khỏi danh sách push (query `where status==new`). 🔴 ĐỨT CHUỖI: hệ thống không xác minh vấn đề gốc đã thật sự được sửa. Đối lập với FIFO bell (mục AL3) — nơi duy nhất tự xoá đúng |
| **Hệ mới** | `alerts/alert.js` → `markSeen()` (không tắt push) + `resolve()` (yêu cầu `referenceId` cho loại không tự kiểm chứng được; PRECONDITION chặn nếu cố đóng tay loại `AUTO_VERIFIABLE`) + `reconcile()` (tự đóng khi điều kiện thật sự hết) |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM** |
| **Ghi chú** | Đúng thiết kế "LUỒNG CHUẨN" #3: pattern FIFO bell (tự xoá khi điều kiện thật sự hết) trở thành MẶC ĐỊNH cho mọi loại `AUTO_VERIFIABLE` qua `reconcile()` — không phải ngoại lệ riêng của 1 cơ chế như hệ cũ. Loại `MANUAL_WITH_REFERENCE` (`CASH_VARIANCE`, `STOCK_VARIANCE`, `UNTRACKED_CONSUMPTION`, `LOYALTY_DRIFT`, `DRIFT_AFTER_CLOSING`, `SNAPSHOT_VERIFY_FAILED`, `UNIT_NEEDS_REVIEW`) bắt buộc `referenceId` trỏ về hành động đã sửa thật (`ReviseState`/`ReverseTransaction`/approval...) — "không có tham chiếu thì không chứng minh được vấn đề đã được xử lý", đúng validate trong code. `markSeen()` chỉ ghi nhận đã nhìn thấy, KHÔNG đổi `status` khỏi diện push nếu status đã qua NEW — nói đúng, không tắt nhầm push như hệ cũ. |

## AL7 — Kênh gửi ra ngoài app

| | |
|---|---|
| **Hệ cũ** | GAP — chưa tồn tại: không có push OS, SMS, Zalo/Telegram webhook tự động. Cảnh báo chỉ tồn tại khi có người thật sự mở 1 trong 2 app |
| **Hệ mới** | `alerts/alert.js` → `toEvents()` (phát `AlertRaised` event) |
| **Phân loại** | 🟢 **THÊM MỚI — chỗ nối sẵn, chưa bắt buộc dựng ngay** |
| **Ghi chú** | Đúng "LUỒNG CHUẨN" #6: AlertEngine chỉ phát domain event, handler ngoài (push/SMS/Zalo) đăng ký sau — không cần sửa lại engine khi có kênh mới. Cùng nguyên tắc side-effect tách biệt đã áp cho Reversal/Correction (`EVENTS`) và Sales (`plan.events`). **Nhưng `toEvents()` chính nó cũng cần một consumer để thật sự gửi ra ngoài — phụ thuộc gap L9 giống mọi domain khác đã ghi nhận.** |

## AL8 — Mã dead: `stockoutTargetPct`

| | |
|---|---|
| **Hệ cũ** | Có field mặc định, lưu mỗi lần save config, cộng dồn trong `sumDailyOps()`, nhưng KHÔNG có input UI để sửa, KHÔNG có nơi ghi sự kiện hết hàng ở POS, KHÔNG có nơi đọc lại để so sánh/hiển thị — "toàn bộ đường đi chết từ đầu đến cuối", cùng dạng lỗi đã thấy ở báo cáo BTP hằng ngày |
| **Hệ mới** | Không tồn tại trong `finance/config.js KEYS` |
| **Phân loại** | ✅ **ĐÃ TỰ ĐỘNG GIẢI QUYẾT** |
| **Ghi chú** | Đã xác nhận LẦN 2 (lần đầu ở `NET-RAW-MATERIAL-V1.md` RM8) — field chết không được mang sang khi viết lại core. `finance/config.js KEYS` chỉ có `finishReviewRatio`, `cogsPctTarget`, `wastePctTarget`, `stockVarianceTolerance`, `maxCashCounts` — không có `stockoutTargetPct`. Không cần việc phải làm riêng; nếu tính năng "báo hết hàng" cần dựng lại theo đúng "LUỒNG CHUẨN" #5 (đủ 3 chân: ghi sự kiện → lưu → hiển thị so target), đó là quyết định tính năng MỚI, không phải dọn dẹp. |

---

## PHÁT HIỆN CHUNG — AlertEngine chưa có ai gọi `raise()`

Grep toàn bộ `src/layers/commands/` cho `alerts/alert`, `.raise(`, `AlertEngine` → **0 kết quả**. `alerts/alert` CHỈ được import bởi `read-layer/gateway.js` (để đăng ký query `GetAlerts` — đọc alert ĐÃ CÓ SẴN), không có command nào (`RecordWaste`, `AdjustInventory`, `ApproveLostContainer`, `RecordPrepProduction`, `ApproveStockCount`...) thật sự gọi `alert.raise()` để TẠO alert khi điều kiện xảy ra.

Đây KHÔNG PHẢI một gap độc lập thứ 5 — đây là HỆ QUẢ TRỰC TIẾP của gap L9 (tầng điều phối sự kiện chưa có consumer, đã ghi nhận ở `NET-LOYALTY-V1.md`, `NET-REVERSAL-CORRECTION-V1.md`, `NET-RAW-MATERIAL-V1.md` RM6, `NET-BTP-V1.md` B1). Các event đã có sẵn trong `plan.events` của nhiều command (`PrepYieldMismatch`, `LostContainerReported`, `StockCountPartiallyApplied`) CHÍNH LÀ input tự nhiên cho `alert.raise()` — khi tầng điều phối sự kiện được xây, một trong những handler đầu tiên cần đăng ký là "on `PrepYieldMismatch` → `alert.raise({type: 'STOCK_VARIANCE', ...})`" v.v. Không cần thiết kế thêm gì mới ở AlertEngine — chỉ cần nối.

**Đây là domain thứ 5 xác nhận phụ thuộc gap L9**, sau Loyalty, Reversal, Raw Material (RM6), BTP (B1).

### ĐÃ ĐÓNG — `commands/alerts.js` + `bootstrap/domain-events.js` ROUTES

Sau khi L9 (tầng điều phối sự kiện — `bootstrap/domain-events.js`) được xây (xem `NET-LOYALTY-V1.md`), phát hiện này được nối tiếp ngay: `commands/alerts.js` bọc `alert.raise()` thành command `RaiseAlert` thật (đăng ký authority/idempotency/audit qua đúng `pipeline.defineCommand` như mọi command khác, không có đường ghi tắt). `bootstrap/domain-events.js` ROUTES thêm 3 route mới:

- `PrepYieldMismatch` (`commands/prep.js`) → `RaiseAlert` loại `PREP_YIELD_MISMATCH` (loại MỚI, đăng ký trong `alerts/alert.js TYPES` — không loại cũ nào khớp đúng ngữ nghĩa "lệch yield của MỘT mẻ cụ thể").
- `LostContainerReported` (`commands/inventory.js` ReportLostContainer) → `RaiseAlert` loại `LOST_CONTAINER_PENDING` (đã có sẵn trong TYPES, khớp thẳng chain-trace gốc). Event được bổ sung `lostReportId` denormalized (trước đây chỉ có `unitId`) để domain-events không phải tự tính lại id.
- `StockCountPartiallyApplied` (`commands/approval.js` ApproveStockCount) → `RaiseAlert` loại `STOCK_COUNT_LINE_FAILED` (loại MỚI — một sự kiện có thể mang NHIỀU dòng lỗi, khác `STOCK_VARIANCE` vốn dành cho lệch số lượng đã biết cả 2 phía, ở đây là LỖI ÁP DỤNG như "không tìm thấy lô"). `routeEvents()` được mở rộng để `toInput` có thể trả về MỘT MẢNG input — xoè 1 sự kiện thành nhiều route độc lập (1 alert/dòng lỗi), không gộp mất `reason` của từng dòng.

`RaiseAlert` dùng CHUNG cơ chế idempotent-theo-id với `alert.raise()`: `operationId` dựng từ đúng `(type, storeId, subjectKey)` — cùng cơ sở với `alertId` — nên gọi lại (retry, hoặc điều kiện lặp lại) là REPLAY, không ghi đè mất trạng thái `SEEN`/`RESOLVED` mà QUANLY đã đặt cho alert đó qua đường khác. Authority khai `['EXECUTE', 'REVIEW_APPROVE_CORRECT']` vì side-effect chạy dưới CÙNG actor với command gốc (có thể là `ReportLostContainer` nguồn POS/EXECUTE hoặc `ApproveStockCount` nguồn QUANLY/REVIEW_APPROVE_CORRECT) — không được đòi quyền cao hơn command đã kích hoạt nó.

10 test mới (`tests/unit/finance-alerts.test.js`): `commands/alerts` (tạo domainRecord, validate, lỗi thiếu trường chẩn đoán lộ ra từ `alert.raise()`, idempotent-replay) + `bootstrap/domain-events` (3 route mới, gồm cả case thiếu `lostReportId` bị bỏ qua và case xoè mảng `failedLines`) + 1 test end-to-end qua `bootstrap/runtime` (ReportLostContainer → sideEffect RaiseAlert thật).

**CẬP NHẬT — `markSeen`/`resolve` nay ĐÃ ĐÓNG**: `commands/alerts.js` có thêm `MarkAlertSeen`/`ResolveAlert`, đăng ký trong `bootstrap/runtime.js COMMANDS` (xem AL6 ở trên). Còn lại NGOÀI phạm vi lượt nối này: `reconcile()` (tự đóng loại `AUTO_VERIFIABLE` khi điều kiện hết) vẫn 0 caller — grep xác nhận không command/route nào gọi. Khác `markSeen`/`resolve` (đợi hành động của người dùng nên hợp lý nối thành command), `reconcile()` cần một tiến trình QUÉT LẠI định kỳ (ai đó phải tính `stillActiveKeys` hiện tại rồi gọi hàm) — câu hỏi vận hành (lịch quét bao lâu, chạy ở đâu), không phải thiếu logic; cùng loại với `autoCloseIfStale()` (`NET-PAYROLL-V1.md`) và tiến trình quét `detectDrift()` (`NET-REPORTING-V1.md`/`NET-STOCK-COUNT-V1.md`). AL3 (push UI thật) và AL7 (kênh ngoài app) vẫn để ngỏ như đã ghi nhận.

---

## Liên kết chéo domain

| Domain | Điểm nối |
|---|---|
| **Loyalty/Reversal/Raw Material/BTP (L9)** | AL1/AL7 phụ thuộc trực tiếp — domain thứ 5 |
| **Raw Material** | AL8 xác nhận lần 2 việc `stockoutTargetPct` đã bị dọn đúng |
| **BTP** | AL5's "instance #6" tiếp nối chuỗi versioning đã thấy ở BTP yield (B2), Recipe/Packaging |
| **Sales/Catalog** | `MISSING_RECIPE` (AL1's TYPES) liên kết trực tiếp N10 (`NET-SALES-V1.md`) và CP3/CP9 (`NET-CATALOG-PROMOTION-V1.md`) — cùng một GAP dữ liệu (thiếu recipe), giờ có đường alert riêng thay vì chặn cứng |

---

## TỔNG KẾT PHÂN LOẠI

- 🟢 THÊM MỚI: **AL7** (kênh ngoài app — chỗ nối sẵn)
- 🟡 GIỮ, ĐỔI CÁCH LÀM: **AL1, AL2, AL4, AL5, AL6** — xác nhận cả 4 vấn đề header `alert.js` tự nhận "đóng cả bốn", cộng AL5 (finance/config.js, domain riêng nhưng cùng nguồn chain-trace) — **AL1 nay ĐÃ ĐÓNG luôn phần "ai gọi `raise()`" qua `commands/alerts.js` + `bootstrap/domain-events.js`**
- ⚪ CHƯA THỂ XÁC NHẬN: **AL3** (thuộc tầng UI, chưa tới lượt nối)
- ✅ ĐÃ TỰ ĐỘNG GIẢI QUYẾT: **AL8**

## VIỆC PHẢI LÀM (tích lũy, không chặn)

1. ~~Xây tầng điều phối sự kiện — AlertEngine là domain thứ 5 xác nhận cần nó, và là domain có NHIỀU HANDLER TỰ NHIÊN NHẤT để bắt đầu.~~ **ĐÃ XONG** — `commands/alerts.js` (`RaiseAlert`) + 3 route mới trong `bootstrap/domain-events.js` (`PrepYieldMismatch`, `LostContainerReported`, `StockCountPartiallyApplied`). ~~Còn lại: `markSeen`/`resolve` (AL6) chưa có command riêng gọi từ UI được.~~ **ĐÃ LÀM**: `commands/alerts.js` nay có `MarkAlertSeen` (wrap `alerts/alert.js#markSeen()`, authority `['EXECUTE','REVIEW_APPROVE_CORRECT']` — cả POS lẫn QUANLY đều đánh dấu "đã xem" được, không tắt cảnh báo) và `ResolveAlert` (wrap `#resolve()`, authority `REVIEW_APPROVE_CORRECT` — mọi loại `MANUAL_WITH_REFERENCE` đều audience QUANLY nên không loại nào cần POS đóng; validate chỉ kiểm tra input tồn tại, logic domain — chặn AUTO_VERIFIABLE, đòi `referenceId` — vẫn ở lib). Cả hai nhận thẳng bản ghi `alert` hiện tại qua input (denormalized input, giống mọi command khác), đăng ký trong `bootstrap/runtime.js COMMANDS`. Tests: `finance-alerts.test.js` ("MarkAlertSeen/ResolveAlert (AL6)").
2. ~~Khi nối UI (AL3): thiết kế lại StoreHealth/sidebar dot (QUANLY) VÀ
   FIFO-bell-style badge (POS) từ CÙNG một nguồn `GetAlerts`, không tách 2
   đường như hệ cũ.~~ — **ĐÃ ĐÓNG (rà lại 2026-09-17)**: cả 2 app đã port UI
   này (từ đợt xây màn hình POS/QUANLY) và cả hai cùng đọc qua
   `controller.getAlerts()`/`readAlerts()` → runtime query `GetAlerts` DUY
   NHẤT, không có đường đọc thô riêng. `src/apps/quanly/main.js`: dot đếm
   tổng cảnh báo trên sidebar (`.sb-dot`, dòng ~723) + màn `alertsScreen()`
   liệt kê chi tiết theo bucket DANGER/WARNING. `src/apps/pos/main.js`:
   `alertBanner()` hiện banner đếm DANGER/WARNING kèm 3 loại cảnh báo đầu —
   không phải đúng hình icon chuông của legacy (đó là chi tiết CSS/UX, không
   phải nguồn dữ liệu), nhưng cùng một `GetAlerts` với QUANLY, đúng ý chính
   của mục này: không tách 2 đường như hệ cũ.
3. Không có việc phải làm mới cho AL8 trừ khi chủ quán quyết định dựng lại tính năng "báo hết hàng" như một yêu cầu MỚI.
4. Còn 2 event khác cũng phụ thuộc gap L9 mà lượt này CHƯA nối vào AlertEngine (nằm ngoài phạm vi "3 route rõ nhất"): `AlertRaised` chính nó (AL7 — kênh ngoài app, cần consumer riêng gửi push/SMS/Zalo, không phải việc của domain-events) và các event khác chưa audit hết (vd `PrepBatchExpiring`/`ContainerExpiring` có thể cần một tiến trình quét định kỳ thay vì chờ event — câu hỏi vận hành, không phải thiếu logic).
