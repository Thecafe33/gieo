# NET — REPORTING / DASHBOARD — V1

> Nguồn: `FIFO-CHAIN-TRACE-REPORTING-V1.md` đối chiếu với `src/layers/read-layer/gateway.js`,
> `src/layers/read-layer/merge-canonical.js`, `src/layers/reporting/inventory-valuation.js`,
> `src/layers/reporting/export-payload.js`, `src/layers/reporting/report-queries.js`,
> `src/layers/store-context/access.js`.
>
> Áp dụng §2.3a. Domain này KHÁC các domain trước: chain-trace không theo 1
> nghiệp vụ mà theo ĐƯỜNG ĐI DỮ LIỆU từ giao dịch gốc tới con số hiển thị —
> nơi hội tụ mọi lớp lỗi "tính đúng nhưng hiển thị sai/không hiển thị" đã
> thấy rải rác ở Sales/COGS, Payroll, Alerts. Đây cũng là domain đóng NHIỀU
> NHẤT trong toàn bộ 10 domain đã khảo sát — `read-layer/gateway.js` VÀ
> `read-layer/merge-canonical.js` được viết CHÍNH XÁC để đóng từng mục của
> chain-trace này (header 2 file trích dẫn thẳng "R3", "R5/§5", "R8/§3").

## Sơ đồ luồng (RP1 → RP10, theo đúng thứ tự chain-trace gốc)

```
RP1  Nguồn dữ liệu cho từng màn (cache/live theo mục đích)
RP2  Doanh thu — 2 pipeline độc lập (POS tự tính / QUANLY tự tính)
RP3  Cache invalidation khi cấu hình giá đổi + khi xoá/sửa bill cũ
RP4  So sánh kỳ trước/kỳ này (freeze-vs-recalculate)
RP5  P&L tháng (đã đóng băng đúng — mẫu cần nhân rộng)
RP6  Định giá tồn kho (scalar giá gần nhất vs FIFO costBasis thật)
RP7  Export/In báo cáo
RP8  Đa cửa hàng / ALL_STORES
RP9  Phân quyền xem báo cáo
RP10 Chỉ báo dữ liệu sống hay cache
```

---

## RP1 — Nguồn dữ liệu cho từng màn báo cáo

| | |
|---|---|
| **Hệ cũ** | Health/Report/Mix dùng chung `fetchSalesRange()` — ngày cũ hơn `CACHE_BUFFER_DAYS` đọc `daily_sales_cache_gieogieo`, ngày gần tính live rồi ghi ngược cache (lazy cache, không theo lịch). Mix/Customer CỐ Ý bỏ qua cache, luôn đọc live (cache không giữ chi tiết topping/size). Chain-trace tự đánh giá: KHÔNG ĐỨT — mỗi màn chọn nguồn phù hợp mục đích, có lý do rõ ràng. |
| **Hệ mới** | `read-layer/merge-canonical.js` → `resolve()` |
| **Phân loại** | 🟡 **GIỮ NGUYÊN NGUYÊN TẮC, THỐNG NHẤT CƠ CHẾ** |
| **Ghi chú** | Đã đọc trọn. Legacy đúng ở QUYẾT ĐỊNH (chọn nguồn theo mục đích) nhưng mỗi màn tự cài đặt lại logic đó — `resolve()` cho MỌI truy vấn đi qua ĐÚNG một thứ tự ưu tiên (`SNAPSHOT → CACHE → LIVE → LEGACY`, §4.1) thay vì mỗi màn tự branch `if (còn raw) ... else đọc archive/compact`. Đây là điểm khác biệt cốt lõi: nguyên tắc nghiệp vụ giữ nguyên, nhưng KHÔNG còn N cách cài đặt riêng lẻ có thể lệch nhau — đúng tinh thần R1/R2 mà header file trích dẫn thẳng. |

## RP2 — Bộ máy doanh thu ở POS — HOÀN TOÀN TÁCH BIỆT

| | |
|---|---|
| **Hệ cũ** | `posgieo.html` có màn "DOANH THU" riêng, tự đọc mảng `orders` in-memory + archive, KHÔNG hề biết đến `daily_sales_cache_gieogieo` (0 kết quả grep). 🔴 ĐỨT CHUỖI: 2 pipeline tính doanh thu ĐỘC LẬP cho CÙNG 1 tập giao dịch gốc — không đảm bảo luôn cho cùng 1 số nếu 1 bên có logic khác biệt (vd 1 bên tính phí sàn, 1 bên không). |
| **Hệ mới** | `read-layer/gateway.js` → `getRevenue()` (R3) |
| **Phân loại** | 🟢 **THÊM MỚI cơ chế đảm bảo — đóng đúng gap trọng tâm nhất domain này** |
| **Ghi chú** | Đã đọc trọn. Header file `gateway.js` gọi ĐÍCH DANH gap này ("Legacy có 2 pipeline doanh thu độc lập... không đảm bảo khớp nhau") làm lý do tồn tại của invariant R3: "MỘT canonical query, MỘT implementation... cả hai app gọi cùng một hàm, nên không tồn tại khả năng lệch." `getRevenue()` còn đóng thêm một khoảng trống legacy chưa từng nối: trừ phí sàn (`channelFee`) để ra `netRevenue`, tách theo `byChannel` — dữ liệu legacy đã có nhưng P&L chỉ hiện 1 số tổng. Không phải sửa lỗi tính toán — là XOÁ HẲN khả năng có 2 số khác nhau bằng kiến trúc (một hàm, hai app cùng gọi), thay vì thêm test đối chiếu 2 pipeline. |

## RP3 — Cache invalidation

| | |
|---|---|
| **Hệ cũ** | Nhánh ĐÚNG: `invalidateSalesCache()` nối vào MỌI điểm sửa COGS/recipe/packaging/giá (10 điểm gọi) — không đứt. Nhánh ĐỨT: khi 1 bill CŨ (đã trong cache) bị xoá/sửa qua QUANLY (`qlDoDeleteBill`), KHÔNG có lời gọi `invalidateSalesCache()` nào — và POS (cũng xoá bill được qua `delOrderConfirm`) hoàn toàn không biết collection cache này tồn tại. Kết quả: xoá/sửa 1 đơn cũ để lại số SAI trong cache vô thời hạn tới khi ai đó bấm "Xoá cache" thủ công. |
| **Hệ mới** | `read-layer/merge-canonical.js` → `invalidateScope()` |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM ở tầng cơ chế — nhưng CHƯA NỐI, cùng họ gap L9** |
| **Ghi chú** | Đã đọc trọn. `invalidateScope()` đã đóng đúng phần "cách làm SAI của legacy" mà chain-trace không hề nhắc tới nhưng tự bản thân code phát hiện thêm: legacy's `clearSalesCache()`/`invalidateSalesCache()` xoá TOÀN BỘ cache mọi ngày (không chỉ ngày bị ảnh hưởng) — chính là instance khác của lớp lỗi versioning (tính lại bằng version HIỆN TẠI cho toàn bộ, không phải version lịch sử của từng ngày). Ở đây `invalidateScope()` CHỈ bỏ những ngày trong `[fromDateKey, toDateKey]`, giữ nguyên phần còn lại — đúng bản chất "K3" mà comment code trích dẫn. **NHƯNG: grep toàn bộ `src/layers` xác nhận `invalidateScope()` KHÔNG có bất kỳ caller nào** — không có `commands/reversal.js`/`ReviseState` nào gọi tới khi xoá/sửa bill cũ. Đây là CÙNG HÌNH DẠNG với gap L9 (Loyalty/Reversal/Raw Material/BTP/Alerts/Payroll/Stock-Count): cơ chế side-effect đã thiết kế đúng, nhưng không có nơi nào KÍCH HOẠT nó khi giao dịch gốc bị đảo/sửa. Domain thứ 8 xác nhận phụ thuộc gap này — và củng cố nhận định L9 rộng hơn "event bus không consumer": ở đây không có `plan.events` liên quan, mà là một HÀM tiện ích không được GỌI — cùng một gốc rễ (thiếu tầng điều phối side-effect xuyên domain), khác biểu hiện cụ thể. |

## RP4 — So sánh kỳ trước/kỳ này

| | |
|---|---|
| **Hệ cũ** | `quanlygieo.html:11335-11419` — cả 2 cột "tuần này"/"tuần trước" gọi `fetchSalesRange()` SỐNG (không đóng băng) — nếu 1 ngày trong "tuần trước" bị sửa sau khi đã xem lần đầu, lần xem sau ra số khác không cảnh báo. Màn này còn thiếu chỉ báo "N ngày lấy từ cache" mà màn Health liền kề LẠI CÓ. |
| **Hệ mới** | `read-layer/gateway.js` → `comparePeriods()` |
| **Phân loại** | 🟡 **GIỮ, ĐỔI CÁCH LÀM** |
| **Ghi chú** | Đã đọc trọn. `comparePeriods()` gắn `frozen` RIÊNG cho từng cột (`current.frozen`/`previous.frozen`) thay vì coi cả kỳ là 1 khối, và tính `bothLive` — cờ cảnh báo tường minh khi CẢ HAI cột đều sống ("so sánh này sẽ đổi theo thời gian — nói ra", trích comment code) — đóng đúng gap "không cảnh báo gì" của chain-trace. Đây chính là quy tắc T3 được cite trong code, cùng cơ chế với RP10. |

## RP5 — P&L tháng (mẫu đúng cần nhân rộng)

| | |
|---|---|
| **Hệ cũ** | `plHealthHTML` — nếu kỳ xem trùng đúng 1 tháng đã có `book_closings_gieogieo`, dùng số ĐÃ CHỐT, không dùng số sống — còn chủ động cảnh báo nếu số sống đã trôi khỏi số đã chốt (`lechSauChot`). Chain-trace tự đánh giá: KHÔNG ĐỨT — mẫu "freeze vs recalculate" cần nhân rộng, không phải giữ làm ngoại lệ riêng. |
| **Hệ mới** | `read-layer/gateway.js` → `getPnL()`, dùng `merge-canonical.resolve()` với `snapshot: spec.closing` |
| **Phân loại** | 🟡 **GIỮ NGUYÊN NGUYÊN TẮC — ĐÃ NHÂN RỘNG ĐÚNG YÊU CẦU** |
| **Ghi chú** | Đã đọc trọn. Đây là bằng chứng rõ nhất cho việc chain-trace's yêu cầu "nhân rộng, không giữ ngoại lệ riêng" ĐÃ THÀNH HIỆN THỰC: `resolve()` (RP1) là CƠ CHẾ CHUNG cho MỌI query, không riêng P&L — `getPnL()` chỉ là MỘT lần gọi trong số đó. `getPnL()` còn thêm `cogsBasisUsed: 'ACTUAL'|'THEORETICAL'` tường minh (R8: cấm field `cogsActual` chứa theoretical) và `hasEstimatedExpenses` (lãi chưa phải số cuối khi còn chi phí ước tính) — cả hai đều là chi tiết legacy chưa từng công khai trên UI dù dữ liệu có sẵn. |

## RP6 — Báo cáo giá trị tồn kho

| | |
|---|---|
| **Hệ cũ** | Công thức: `currentStock × costPerUnit hiện tại` (1 field scalar "giá gần nhất", không phải tổng theo lớp FIFO thật). 🔴 ĐỨT CHUỖI — xác nhận LẦN NỮA (đã biết từ Sales/COGS) rằng legacy chưa từng có cost-basis FIFO thật trên Unit. Phát hiện thêm: TRONG CÙNG 1 thẻ báo cáo, tồn kho định giá theo giá HIỆN TẠI còn phần tiêu hao lại định giá theo giá LỊCH SỬ (`itemCostOn`) — code tự biết và ghi chú, nhưng 2 số cạnh nhau dùng 2 cơ sở giá khác nhau, dễ đọc nhầm là so sánh được trực tiếp. |
| **Hệ mới** | `reporting/inventory-valuation.js` → `valuate()` |
| **Phân loại** | 🟢 **THÊM MỚI** |
| **Ghi chú** | Đã đọc trọn. Dùng `Unit.costBasis.unitCost` THẬT cho từng lô còn tồn (`BASIS.FIFO_ACTUAL`), tách RIÊNG phần `untracked` (không có Unit đại diện) dùng `BASIS.LATEST_COST` — và bắt buộc gắn `basis` vào TỪNG kết quả cộng với cờ `mixedBasis` khi tổng có trộn 2 cơ sở giá. `describeBasis()` cho UI nhãn tường minh theo TỪNG số, không phải chú thích nhỏ cuối màn như legacy — đóng đúng cả 2 phần của gap (giá thật thay vì scalar, VÀ nhãn cơ sở giá đi kèm từng số). |

## RP7 — Export/In báo cáo

| | |
|---|---|
| **Hệ cũ** | GAP — chưa tồn tại: không xuất CSV/Excel/PDF cho bất kỳ báo cáo nào. "Trích xuất dữ liệu" chỉ dump JSON thô toàn bộ collection (cho AI phân tích), KHÔNG phải xuất báo cáo đã định dạng. In chỉ là tác dụng phụ CSS `@media print` chung, không có nút "In" thiết kế riêng. |
| **Hệ mới** | `reporting/export-payload.js` → `toCsv()` + `buildExport()` + `rawExtract()` (giữ riêng) |
| **Phân loại** | 🟢 **THÊM MỚI** |
| **Ghi chú** | Đã đọc trọn. Tách đúng 2 việc chain-trace đòi tách: `buildExport()` (CSV có cột khai tường minh `{label,key}`/`{label,value}` — validate rõ cột sai để tránh "hỏng im lặng" khi header rỗng) cho người đọc/kế toán; `rawExtract()` GIỮ RIÊNG cho phân tích/AI, gắn nhãn `purpose` để không nhầm 2 việc. `buildExport()` MANG THEO `meta` nguyên vẹn từ read-layer (`computedAt`/`frozen`/`sources`/`ambiguous`) — file xuất ra nói được số đến từ đâu, đã đóng băng chưa — và có `buildNotices()` tự sinh cảnh báo dán ngay trên file (số chưa đóng băng / dữ liệu cũ không đủ nghĩa / trộn cơ sở giá / còn chi phí ước tính) thay vì để người cầm file tự suy luận. Đăng ký qua `ExportReport` ở tầng quyền cao nhất (`MASTER_CONFIGURE`) — hợp lý vì đây là dữ liệu RA KHỎI hệ thống. |

## RP8 — Đa cửa hàng / ALL_STORES

| | |
|---|---|
| **Hệ cũ** | GAP — chưa tồn tại 100%: `STORE_ID` là hằng số đơn, tự comment "không còn dùng làm tiền tố path" — 0 kết quả "ALL_STORES" trong code thật (chỉ trong tài liệu hợp đồng phân quyền). Chain-trace tự đánh giá: khái niệm quyền hạn cho TƯƠNG LAI, không phải tính năng dở dang. |
| **Hệ mới** | `store-context/access.js` → `crossStore` field, xuyên suốt `commands/pipeline.js`/`read-layer/gateway.js registerQuery()` |
| **Phân loại** | 🟢 **THÊM MỚI (chỗ nối, không phải tính năng)** |
| **Ghi chú** | Xác nhận đúng nguyên tắc LUỒNG CHUẨN §7 ("chỉ cần chừa vị trí nối, không cần dựng UI multi-store ngay"): mọi command/query đăng ký đều có tham số `crossStore` (boolean) đi qua `access.registerCommand()`, và `access.js:187` đã có logic CHẶN thao tác nhiều store khi command không khai `crossStore` — nghĩa là khung phân quyền multi-store ĐÃ CÀI vào cấu trúc lõi (không phải TODO), dù chưa có UI/command nào thực sự dùng `ALL_STORES` — đúng đúng mức độ "chừa chỗ nối" mà chain-trace yêu cầu, không hơn không kém. |

## RP9 — Phân quyền xem báo cáo

| | |
|---|---|
| **Hệ cũ** | 🔴 ĐỨT CHUỖI NGHIÊM TRỌNG NHẤT domain này: QUANLY đăng nhập Firebase bằng 1 TÀI KHOẢN DÙNG CHUNG duy nhất (`cafe33@xolifa.com`, hardcode), KHÔNG có màn đăng nhập theo từng người, KHÔNG có bất kỳ check role/permission nào trong code trước khi render báo cáo tài chính (`switchScreen()` không kiểm tra quyền). Bất kỳ ai mở được app đều thấy toàn bộ P&L/COGS/waste/định giá tồn/dữ liệu khách hàng — mâu thuẫn trực tiếp với `POS-QUANLY-PERMISSION-CONTRACT-V1.md` (3 tầng EXECUTE/REVIEW_APPROVE_CORRECT/MASTER_CONFIGURE) — legacy KHÔNG hề có tầng nào ở mức code. |
| **Hệ mới** | `read-layer/gateway.js` → `guard()`/`guardRead` + `store-context/access.js` → `authorize()` |
| **Phân loại** | 🟢 **THÊM MỚI — đóng đúng gap nghiêm trọng nhất domain này** |
| **Ghi chú** | Đã đọc trọn. Header file `gateway.js` trích dẫn ĐÍCH DANH gap này làm lý do của invariant R5/§5: "mọi API đăng ký quyền, và MẶC ĐỊNH ĐÓNG: query chưa khai quyền thì bị từ chối." `guard()` là CỔNG DUY NHẤT (`guardRead` export ra CHO CẢ `reporting/report-queries.js` dùng — "viết cổng thứ hai là cách phân quyền đọc trôi khỏi một chỗ", trích comment) — kiểm tra CẢ actor context lẫn storeId TRƯỚC KHI chạm dữ liệu, không phải sau khi render rồi ẩn UI. Mọi query nhạy cảm (`GetRevenue`/`GetCOGS`/`GetPnL`/`GetCustomerReport`) mặc định KHÔNG thuộc tầng `EXECUTE` (nhân viên bán hàng không tự động thấy), và `GetPnL`/`GetCustomerReport`/`ExportReport` yêu cầu `MASTER_CONFIGURE`. **Đây là điểm nối trực tiếp với câu hỏi trước đây treo ở `NET-CATALOG-PROMOTION-V1.md` CP11** ("permission enforcement... vì không có `commands/catalog.js` write-pipeline") — với domain Reporting, câu trả lời đã RÕ RÀNG hơn: enforcement THẬT SỰ tồn tại ở tầng ĐỌC (không chỉ tầng ghi), và catalog/menu's `getMenu()` cũng đi qua ĐÚNG cổng `guard()` này — nên phần ĐỌC catalog ĐÃ CÓ phân quyền. CP11 (phần GHI) đã đóng sau đó bằng `commands/catalog.js` (xem `NET-CATALOG-PROMOTION-V1.md`), nên câu hỏi treo này không còn nữa ở cả hai tầng. |

## RP10 — Chỉ báo dữ liệu sống hay cache

| | |
|---|---|
| **Hệ cũ** | Chỉ màn Health có "(N ngày, M ngày lấy từ cache)" — không có timestamp tính lúc nào (`daily_sales_cache_gieogieo` không lưu `computedAt`). Report kỳ (RP4) không có chỉ báo này dù cùng nguồn. GAP nhất quán, không phải thiếu hẳn. |
| **Hệ mới** | `read-layer/merge-canonical.js` → `wrap()` (mọi kết quả đều có `meta.sources`/`meta.frozen`/`meta.computedAt`) |
| **Phân loại** | 🟢 **THÊM MỚI, ÁP DỤNG ĐỒNG NHẤT** |
| **Ghi chú** | Vì `resolve()` (RP1) là cổng DUY NHẤT cho mọi query, `meta` đi kèm MỌI kết quả không phân biệt màn hình — không còn tình trạng "chỉ Health có, Report kỳ không có" vì bản chất không còn 2 cách cài đặt khác nhau để lệch tính năng. `computedAt` luôn có mặt (đóng đúng "không lưu lúc tính" của legacy), `sources` liệt kê chính xác nguồn đã dùng (`SNAPSHOT`/`CACHE`/`LIVE`/`LEGACY`, có thể nhiều nguồn cùng lúc khi có dữ liệu legacy ambiguous trộn vào). Đây là hệ quả TRỰC TIẾP của việc thống nhất RP1, không phải một tính năng xây thêm riêng. |

---

## Liên kết chéo domain

| Domain | Điểm nối |
|---|---|
| **Sales/COGS/P&L, Payroll, Alerts** | Chain-trace tự nhận domain này là nơi HỘI TỤ lớp lỗi "tính đúng nhưng hiển thị sai/không hiển thị" đã thấy ở 3 domain đó — xác nhận: `getCOGS()`'s 2-vế bắt buộc (R8) là hệ quả trực tiếp của nguyên tắc đã thiết kế ở Sales/COGS; `getPnL()` đọc `book_closing` đúng pattern đã dùng lại cho `PayrollClosing` (`NET-PAYROLL-V1.md` PR4); `getAlerts()` dùng `alertLib.bucketize()` từ chính `alerts/alert.js` đã khảo sát ở `NET-ALERTS-V1.md`. |
| **Catalog/Promotion** | RP9's `guard()` là câu trả lời thực tế cho câu hỏi treo CP11 — phần ĐỌC catalog (`getMenu()`) ĐÃ có phân quyền qua đúng cổng này; phần GHI vẫn treo vì thiếu `commands/catalog.js`. |
| **Loyalty/Reversal/Raw Material/BTP/Alerts/Payroll/Stock-Count (L9)** | RP3's `invalidateScope()` không có caller — domain thứ 8 xác nhận phụ thuộc gap L9, ở biến thể "hàm side-effect không được gọi" thay vì "event không có consumer" — cùng gốc rễ: thiếu tầng điều phối side-effect xuyên domain khi một giao dịch gốc bị đảo/sửa. |
| **Config/KPI (versioning)** | Nguyên tắc freeze-vs-recalculate (RP4/RP5) được chính chain-trace gọi là "lần thứ 7" của lớp lỗi versioning (Recipe, Packaging, BTP yield, Payroll, COGS chung, Alerts/KPI-target, nay là báo cáo theo kỳ) — khớp đúng với các lần đã đếm ở `NET-BTP-V1.md`/`NET-ALERTS-V1.md`/`NET-PAYROLL-V1.md`. |

---

## TỔNG KẾT PHÂN LOẠI

- 🟢 THÊM MỚI: **RP2** (đảm bảo 1-pipeline-doanh-thu bằng kiến trúc), **RP6** (định giá FIFO thật + nhãn cơ sở giá), **RP7** (export CSV có định dạng), **RP8** (chỗ nối multi-store), **RP9** (phân quyền đọc thật — gap nghiêm trọng nhất domain, đã đóng), **RP10** (chỉ báo sống/cache đồng nhất mọi màn)
- 🟡 GIỮ, ĐỔI CÁCH LÀM: **RP1** (thống nhất cơ chế chọn nguồn), **RP4** (đóng băng từng cột khi so sánh kỳ), **RP5** (nhân rộng đúng mẫu P&L tháng ra mọi query) — cả 3 giữ nguyên quyết định nghiệp vụ, đổi từ N cách cài đặt riêng lẻ sang 1 cơ chế dùng chung
- 🟡 GIỮ, ĐỔI CÁCH LÀM nhưng CHƯA NỐI (cùng họ L9): **RP3** — cơ chế `invalidateScope()` đúng, nhưng chưa có `ReviseState`/xoá-bill nào gọi tới

**Domain đóng nhiều nhất trong 10 domain đã khảo sát**: 6/10 mục 🟢 THÊM MỚI đã xác nhận đóng hoàn toàn qua đọc trọn code — bao gồm gap NGHIÊM TRỌNG NHẤT được chain-trace tự xếp hạng (RP9, phân quyền). Không có mục nào 🔴 GAP TOÀN PHẦN trong domain này — khác hẳn hình dạng của Stock Count (thiếu domain đầu vào) hay Payroll (thiếu command wrapper). Điểm cần theo dõi duy nhất là RP3 (cùng họ L9).

## VIỆC PHẢI LÀM (tích lũy, không chặn)

1. Nối `invalidateScope()` vào đúng điểm `ReviseState`/xoá-sửa giao dịch gốc trong `commands/reversal.js` — đây là phần "chưa nối" duy nhất của domain này, cùng họ với tầng điều phối L9.
2. Khi xây `commands/catalog.js` (đã treo ở CP11), tái dùng ĐÚNG `guard()`/`guardRead` của `read-layer/gateway.js` — không viết cổng quyền thứ hai cho phần ghi catalog.
3. Xác nhận route/lịch chạy `detectDrift()` (đã treo ở `NET-STOCK-COUNT-V1.md` SC5) có nối với `rebuildUnitState()`/RT-vs-Firestore drift mà domain Reporting cũng cần — hiện là CÙNG MỘT cơ chế nền, chưa xác nhận có lịch chạy tự động.
4. (Không mới, nhắc lại) Tầng điều phối sự kiện — RP3 là domain thứ 8 phụ thuộc gap L9.
