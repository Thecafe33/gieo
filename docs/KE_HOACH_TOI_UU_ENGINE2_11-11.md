# Kế hoạch tối ưu Unit Engine 2 — các tác vụ còn tốn lượt đọc / thời gian chờ

> Ngày lập: 11/11/2026. Mốc mã đã đọc: `21736d9` (nhánh `Phan-tach-unit-engine`).
> Đầu vào: [TOM_TAT_UNIT_ENGINE2_POS_QUANLYGIEO2.md](TOM_TAT_UNIT_ENGINE2_POS_QUANLYGIEO2.md), [LO_TRINH_ENGINE2_CAP6.md](LO_TRINH_ENGINE2_CAP6.md), [ENGINE2_POS_V3_05-11.md](ENGINE2_POS_V3_05-11.md) và mã `gieo_engine2_pos_v4.js`, `unit_engine2_store_v4.js`, `functions/automation/engine2.js` + `index.js`, `tools/automation/engine2_ui.js`.
> **Chỉ là kế hoạch — chưa đổi dòng mã nào.** Trạng thái Engine 2 vẫn chỉ ghi ở lộ trình; tài liệu này là danh sách đề xuất chờ chủ dự án chọn.
> **Bản lần 3 (11/11) là bản hiện hành:** mục 3–8 — mô hình 10 cửa hàng, bốn ưu tiên của chủ dự án, quyết định đã chọn + hướng «cổng tín hiệu, giữ nguyên cơ chế». Phương án lần 2 (đổi cách đánh thức) chuyển xuống Phụ lục, **không còn là đề xuất chính** vì nó đổi cơ chế của Engine 2.
> Mọi con số bên dưới là **ước lượng từ đọc mã**, chưa đo trên Firebase thật (bước Đ0 là đo).

## 1. Phạm vi và nguyên tắc

- «Tối ưu» ở đây = bớt lượt đọc / ghi Firestore, bớt lần gọi Cloud Functions, bớt thời gian nhân viên chờ lúc kết ca. **Không đổi luật** (phân bổ, mức M0–M3, ngưỡng, chính sách) và không đổi kết quả học.
- Đã tối ưu ở gói v4 (không làm lại): học dồn theo gói tuần, hàng đợi thử lại giãn dần, nhịp không đọc trước, trigger lượt cân `onlyNew`, dọn việc treo một truy vấn, cache 15 giây / 60 giây ở POS.
- Giữ: một writer kho, B1–B15, không bao giờ chặn bán / kết ca, POS không chắc thì tự ghi.
- File đã phát hành không sửa: `unit_engine2_store_v4.js` → **`_v5`**, `gieo_engine2_pos_v4.js` → **`_v5`** (v4 giữ để quay lui); bản worker đồng bộ qua `tools/automation/sync.js`. Mỗi mục phải có test «hai thế giới giống hệt» (kết quả y hệt bản v4) + đếm lượt đọc như `unit_engine2_store_v4.test.js`.

## 2. Các tác vụ chưa tối ưu tốt (xếp theo giá trị)

### Nhóm A — worker nền (chạy cả khi không ai thao tác)

| # | Tác vụ | Hiện tại (nơi trong mã) | Vì sao tốn | Đề xuất |
|---|---|---|---|---|
| **A1** | Bốn lượt quét hằng ngày + lượt học | `engine2.js` › `learn`: chỉ nhớ «hôm nay đã chạy» trong bộ nhớ instance (`learned`), và 4 lượt quét (`sweepPrepReview`, `mixupSweep`, `sweepAlerts`, `sweepSubReviews`) chạy **trước** khi `learnDay` kiểm `models/current.day` | Instance đồng hồ khởi động lạnh (nhịp 15 phút — dễ xảy ra) hoặc lượt học ném lỗi → **mỗi nhịp** quét lại: 5 lần đọc tài liệu điều khiển + truy vấn tới 200 dòng `needsReview` (dòng tồn trước ngày áp dụng nằm đó mãi — gg01 ~85) + tới 300 thông báo `new` + 100 sự cố / theo dõi + 100 phiếu bù. Xấu nhất ≈ vài trăm lượt đọc × 96 nhịp / ngày / quán, và xếp lại hàng đợi các việc đã xếp | (1) Đọc mốc ngày bền (`models/current.day`, 1 lượt) **trước** các lượt quét; đã chạy hôm nay → bỏ qua hết. (2) Một lần `config()` dùng chung cho 4 lượt quét + lượt học. (3) Lượt học lỗi → ghi mốc thử lại giãn dần (30 phút → 6 giờ) thay vì thử mỗi nhịp. (4) `sweepPrepReview` thêm điều kiện `businessDate >= fromDate` vào truy vấn (cần chỉ mục) để không đọc lại tồn cũ mỗi ngày |
| **A2** | Dấu «worker còn chạy» | `heartbeat()` ghi `workerHeartbeatAt` lên **tài liệu điều khiển** `_engine2` mỗi 15 phút | Tài liệu này có (a) trigger `{quán}_engine2_settings` → 96 lần gọi function vô ích / ngày / quán; (b) mọi máy POS đang nghe `onSnapshot` → 96 lượt đọc / ngày / máy, cộng mỗi lần đổi `e2Daily` / `posFallbacks` / `lastMeasurementAt` | Chuyển dấu + bộ đếm theo ngày + 20 lượt «POS tự ghi» sang tài liệu riêng (vd `_engine2/status/worker`); POS đọc 1 lượt khi dựng danh sách cân (nhớ cùng `wanted`), quanlygieo2 đọc thêm 1 lượt khi mở mục. **Chuyển tiếp an toàn:** worker ghi cả hai nơi cho tới khi mọi máy báo `bridgeVersion ≥ 5` (đã có ở `devices`), rồi mới thôi ghi nơi cũ — nếu không, POS v4 thấy dấu cũ và tự ghi hết |
| **A3** | Hoàn tất lượt cân | `measure()`: **mỗi mã** của lượt lặp lại `prices()` (đọc toàn bộ `price_history` của món), truy vấn ca theo khoảng (thường trùng nhau), `tareOf` đọc lại cùng dụng cụ / gói; `getInventory` dựng engine mới mỗi lượt (đọc món + quy tắc) | Lượt cân 3 mã ≈ 3 × (lịch sử giá + ca + bì) thay vì 1 | Nhớ trong phạm vi **một lần gọi** `measure` (không nhớ qua lượt → không lo dữ liệu cũ): giá theo (món, ngày), ca theo khoảng, bì theo mã dụng cụ. Transaction kiểm nguồn giữ nguyên |
| **A4** | Lượt học đêm (ngoài phần quan sát đã học dồn) | `learnDay`: mỗi món kiểm soát 1 truy vấn việc chờ (`pend`) dù `sweepStaleTasks` vừa đọc toàn bộ việc chờ; `model_versions` 200 bản **kèm tham số** mỗi đêm; `stock_containers` đang mở (≤ 300); `inventory_items` cân bắt buộc (≤ 300); ca 28 ngày (≤ 501); `devices` | Con số 52–86 lượt đọc / đêm của lượt 3 chỉ tính phần quan sát; các truy vấn này có thể cộng thêm vài trăm | Dùng lại danh sách việc chờ của lượt dọn; `model_versions` chỉ đọc vào ngày hiệu chuẩn (7 ngày) hoặc khi `models/params` đổi phiên bản; món đang mở / món bắt buộc / mô hình vận hành nhớ trong `models/current` và làm mới theo tuần hoặc khi lượt cân / báo hết trong ngày chạm tới. Cửa nghiệm thu: kết quả học giống hệt bản v4 trên bộ 4 đêm |
| A5 | Định giá | `prices()`: `where itemId ==` không giới hạn, lọc trên máy | Lịch sử giá «tự đầy dần theo phiếu nhập» → mỗi báo hết / lượt cân đọc ngày càng nhiều | `effectiveFrom <= ngày`, sắp giảm dần, giới hạn nhỏ (giữ luật chọn bản cuối theo `createdAt`). **Cần chỉ mục ghép** `price_history (itemId, effectiveFrom↓)` — chủ dự án deploy |
| A6 | Báo hết còn dư — luật quy cách | `finish()`: mỗi mã cùng phiếu 1 truy vấn `cases` (tới 50 truy vấn); toàn bộ ca trong khoảng đọc 2 lần (ngoài + trong transaction) | Ít xảy ra (46 lần / 52 ngày ở gg01) → ưu tiên thấp | Ghi khoá phiếu (`lotKey`) lên hồ sơ lượt cân để lấy phần hụt của cả phiếu bằng 1 truy vấn; trong transaction chỉ đọc lại ca thuộc `result.shiftIds` + kiểm số lượng |
| A7 | Đổi ca | `source()` so cả tài liệu ca (`E.stable`) → mỗi thay đổi sinh 3 việc hàng đợi (`handover`, `recompute_shift`, `discover_shift`), mỗi việc 3 lần ghi `requests` = 3 lần gọi trigger | Ca chỉ ghi lúc vào / ra nên ít; ưu tiên thấp | So riêng các trường có ảnh hưởng (người, giờ vào / ra, chức năng, huỷ); gộp `recompute` + `discover` thành một việc |

### Nhóm B — POS (nhân viên phải chờ)

| # | Tác vụ | Hiện tại | Vì sao tốn | Đề xuất |
|---|---|---|---|---|
| **B1** | Dựng danh sách cân cuối ca | `extendCloseLines` → `ensureCloseTasks`: 1 `config()` + **mỗi món kiểm soát 1 transaction 3 lượt đọc, chạy tuần tự**, lặp lại mỗi lần dựng danh sách dù việc đã có; RT từng món thiếu đọc tuần tự | 10 món kiểm soát ≈ 31 lượt đọc + 10 vòng mạng mỗi lần mở màn kết ca | Nhớ «đã bảo đảm» theo (ngày, món) trong phiên; một transaction cho mọi món còn thiếu; bỏ `config()` (đã có `state` đang nghe); RT đọc song song |
| **B2** | Ghi từng dòng cân | `engage` cho **mỗi dòng**: truy vấn ca người cân → transaction xin lượt → transaction xếp hàng → đọc lại lượt cân vừa ghi | 4 vòng mạng × số dòng, tuần tự — mạng yếu là chậm kết ca rõ nhất | `requestMeasurement` trả luôn `{id, status, operationId, lastError}` (bỏ lượt đọc lại); nhớ kết quả truy vấn ca của (người, ngày) trong 60 giây (transaction vẫn kiểm lại từng ca); gộp bước xếp hàng vào transaction xin lượt (trigger `_engine2_measurement` vẫn là lưới an toàn) |
| **B3** | Lấy việc M0 / M3 | `wanted()`: truy vấn 40 việc chờ mới nhất rồi lọc trên máy; phụ thuộc chỉ mục `tasks (pending, createdAt↓)` | Việc loại khác (đối chiếu quy cách, nhóm dễ nhầm…) nhiều thì M0 / M3 trôi khỏi cửa sổ; thiếu chỉ mục → Engine 2 không nhận lượt nào | Lượt học công bố sẵn danh sách M0 hôm nay + M3 đang mở lên tài liệu POS đã nghe (như `controlledItemIds`) → **0 lượt đọc**, hết phụ thuộc chỉ mục. Việc `resync` tạo trong ngày vẫn cần đường truy vấn dự phòng |
| **B5** | Chờ Engine 2 lúc ghi số cân | `engage` không có trần thời gian — mạng treo thì bước ghi dòng cân treo theo | Trái ưu tiên «nhân viên không chờ vô nghĩa» | Trần thời gian cho cả lần kết ca (đề xuất 4 giây); quá trần → POS tự ghi, mã lý do `request_failed` (cơ chế sẵn có) |
| B4 | Người kết ca hôm trước | `previousCloser`: tới 7 truy vấn ca theo ngày, chỉ nhớ trong bộ nhớ trang; chạy cả khi Engine 2 tắt | Tải lại trang là đọc lại | Nhớ theo ngày ở `localStorage`; dừng ở ngày đầu tiên có ca (đã làm) |

### Không đề xuất đổi

- Giao diện quanlygieo2 (`engine2_ui.js`): đọc theo lần bấm, có giới hạn, cache 30 giây — đủ tốt. Việc nó nạp `store_v1` không gây tốn (chỉ dùng `base` / `sub` / `config`).
- Số lần gọi function do mỗi việc hàng đợi ghi `requests` 3 lần: lần gọi thừa không đọc gì; chỉ theo dõi ở Đ0.

## 3. Mô hình 10 cửa hàng — Engine 2 bản hiện tại (v4) đang tiêu gì

**Giả định một quán / ngày** (suy từ số thật gg01 trong lộ trình; quán mới có thể khác): 1 báo hết còn dư · 7 dòng cân cuối ca do Engine 2 điều phối (5 món kiểm soát + 2 ngẫu nhiên) · 2 dòng lệch nấu mẻ · 5 thông báo lệch · 3 lần đổi ca · 1 lượt học · 150 bill · 1–2 máy POS · worker tự động hoá và Engine 2 cùng bật.
**Mọi số là ước lượng từ đọc mã, sai số có thể ±50%** — bước Đ0 đo lại trước khi quyết.

| Nhóm việc | Có tín hiệu? | Đọc / quán / ngày | Ghi / quán / ngày |
|---|---|---|---|
| Nhịp 15 phút × 96 — hỏi «có việc lỗi tới hạn không» (Engine 2 + hàng đợi) | ❌ | ~190 | 0 |
| Nhịp — ghi dấu còn sống lên tài liệu điều khiển → máy POS đang nghe đọc lại | ❌ | ~100–190 | ~96 |
| Nhịp — `worker.tickStore` (khoá, việc tới hạn, ngày `dirty`, ghi trạng thái) | ❌ | ~580 | ~290 |
| **Cộng phần «không có tín hiệu»** | | **~900** | **~390** |
| Báo hết còn dư (1) | ✅ | ~40 | ~12 |
| Kết ca: POS xin lượt + worker hoàn tất (7 dòng) | ✅ | ~300 | ~120 |
| Lệch nấu mẻ, thông báo lệch, pha nhầm, phiếu bù (~8 việc) | ✅ | ~120 | ~40 |
| Đổi ca (3) | ✅ | ~60 | ~30 |
| Lượt học + 4 lượt quét (1 / ngày, instance ấm) | ⏰ theo ngày | ~350 | ~25 |
| **Cộng phần «có việc»** | | **~870** | **~230** |
| **Tổng một quán** | | **~1.800** | **~620** |

**Mười quán:** ~18.000 lượt đọc + ~6.200 lần ghi / ngày (≈ 540.000 đọc + 185.000 ghi / tháng). Thêm lần gọi function: nhịp 96 + trigger thiết lập bị dấu còn sống đánh thức ~960 + trigger theo dòng kho của bill ~9.000 / ngày (các lần này thoát ngay, 0 lượt đọc).

Ba điều rút ra:

1. **Khoảng một nửa lượt đọc và hơn 60% lần ghi là cho «không có việc gì»** — đúng điều chủ dự án nói: lao vào làm bất chấp. Phần này tăng thẳng theo số quán, không theo doanh số.
2. Phần «có việc» của Engine 2 vốn đã theo tín hiệu và **đúng cơ chế** — không cần đổi cách nó quyết định, chỉ bớt đọc lặp trong từng việc (mục 2).
3. **Nói thật về tiền:** với giá Firestore hiện hành, 540.000 đọc + 185.000 ghi / tháng chỉ khoảng dưới 1 USD. Lợi ích thật là (a) không ăn vào hạn mức miễn phí 50.000 đọc / 20.000 ghi mỗi ngày **dùng chung với XOFA và TC33**; (b) rủi ro A1 — khởi động lạnh có thể nhân lượt quét lên hàng chục lần, khi đó 10 quán vượt hạn mức; (c) vòng lặp tuần tự qua các quán trong một hàm 540 giây sẽ thành giới hạn khi số quán lớn.

### 3.1 Kết quả Đ0 — số ĐO (11/11, thay cho ước lượng ở trên)

Công cụ `node tools/automation/engine2_do_tai.js` chạy **mã thật** (worker, store v4, cầu nối POS v4, kho v21) trên Firebase giả, đếm như Firestore tính phí; mốc khoá ở `tests/engine2_do_tai.test.js`. Thế giới mẫu: 5 món kiểm soát + 2 cân ngẫu nhiên + 3 món chỉ bắt buộc, 40 thông báo «để biết» và 30 dòng `needsReview` tồn cũ.

| Đo được (một quán) | Đọc | Ghi | Vòng mạng |
|---|---|---|---|
| Một nhịp 15 phút không có việc | 11 | 4 | 12 |
| — trong đó `worker.tickStore` cả ngày | 864 | 288 | |
| — `engine2.tick` cả ngày (gồm 1 lượt học 125 đọc) | 343 | 109 | |
| — `queue.retryDue` cả ngày | 96 | 0 | |
| **96 nhịp, instance ấm** | **1.303** | **397** | |
| **96 nhịp, instance LẠNH mỗi nhịp (A1)** | **9.011** | 397 | |
| POS dựng danh sách cân cuối ca (dựng lại: 24) | 17 | 0 | 7 |
| POS ghi một dòng thường (kho v21) | 11 | 9 | 13,7 |
| **Engine 2 thêm vào mỗi dòng cân** | **+11** | **+4** | **+3,8** |
| Worker hoàn tất 7 lượt cân | 197 | 119 | |
| Báo hết còn dư | 28 | 12 | |
| Một lần đổi ca | 26 | 9 | |
| Bán một bill (12 lần gọi function) | **0** | **0** | 0 |

- **Một quán / ngày: 1.800 đọc + 642 ghi — 67% lượt đọc và 60% lần ghi là «không có việc».** Mười quán: ~18.000 đọc + ~6.400 ghi / ngày.
- **A1 là rủi ro lớn nhất, đã xác nhận:** chỉ với 70 tài liệu tồn cũ, instance lạnh mỗi nhịp làm 10 quán tốn ~90.000 lượt đọc / ngày riêng phần nhịp — **vượt hạn mức miễn phí 50.000 / ngày** dùng chung với XOFA / TC33.
- Ưu tiên 1 giữ đúng: bán hàng không làm Engine 2 đọc / ghi gì.
- Ưu tiên 2: kết ca 7 dòng Engine 2 → nhân viên chờ thêm ~27 vòng mạng (mạng 150 ms ≈ 4 giây; mạng yếu 500 ms ≈ 13 giây). Đây là chỗ B1 / B2 / B5 nhắm tới.

## 4. Hướng tối ưu mới — «cổng tín hiệu», giữ nguyên cơ chế

**Nguyên tắc:** không đổi luật, không đổi thời điểm, không đổi cách POS và worker tin nhau. Chỉ đặt một **cổng rẻ** trước mỗi việc: *có tín hiệu thì Engine 2 vào làm, không có thì không bước qua cổng*. Nhịp 15 phút còn lại chỉ là người gác cổng (vài lượt đọc cho **cả chuỗi**), không phải Engine 2.

| # | Cổng | Hiện tại | Sau khi có cổng | Cơ chế giữ nguyên |
|---|---|---|---|---|
| **G1** | **Một câu hỏi cho cả chuỗi** thay vì hỏi từng quán | Mỗi nhịp, mỗi quán: 2 truy vấn việc tới hạn + 1 truy vấn `nextCheckAt` + 1 truy vấn ngày `dirty` | 4 truy vấn nhóm (collection group) cho **mọi quán**: việc Engine 2 tới hạn, việc tự động hoá tới hạn, hồ sơ tới `nextCheckAt`, ngày `dirty`. Không quán nào có việc → 4 lượt đọc cả chuỗi; quán nào có việc mới vào xử lý quán đó | Giờ thử lại, hạn chờ, thứ tự xử lý y hệt |
| **G2** | **Không khoá, không ghi khi không có việc** | `tickStore` mỗi nhịp khoá + ghi trạng thái (~3 lần ghi) dù rỗng | Chỉ khoá / ghi khi G1 báo quán đó có việc; trạng thái «vẫn chạy» ghi cùng dấu còn sống (G3) | Khoá chống chạy đôi vẫn dùng khi có việc |
| **G3** | **Dấu còn sống chỉ ghi khi quán có người trong ca** | 96 lần / ngày kể cả 2 giờ sáng | Tín hiệu vào ca → ghi dấu ngay + bật «đang mở» cho quán; ra ca cuối → tắt. Nhịp chỉ ghi dấu cho quán đang mở (≈ 40 lần / ngày). Trạng thái «đang mở» của mọi quán nằm trong **một** tài liệu chuỗi, nhịp đọc 1 lượt | POS v4 vẫn thấy dấu < 45 phút suốt lúc có ca — không đổi gì ở POS |
| **G4** | **Lượt học chỉ cho quán có hoạt động** + mốc ngày bền (A1) | Thử học mọi quán; khởi động lạnh thì quét lại | Kiểm mốc `models/current.day` trước mọi lượt quét. Quán hôm qua không mở và không có dữ liệu mới → bỏ qua; nếu hôm nay quán mở lại thì tín hiệu vào ca đầu tiên chạy bù lượt học | Giờ học 00:xx, thuật toán, đầu vào y hệt. Khác duy nhất: sau ngày nghỉ, lượt học chạy lúc vào ca thay vì 00:xx — trước lúc cân cuối ca nên kết quả dùng như nhau |
| **G5** | **Bớt đọc lặp trong từng việc** (mục 2: A3, A4, A5, B1, B2, B3) | — | Như mục 2 | Có — chỉ là nhớ tạm trong một lần gọi |
| G6 | Dấu còn sống rời khỏi tài liệu điều khiển (A2) | Mỗi lần ghi dấu đánh thức trigger thiết lập + máy POS đang nghe | Làm sau, khi mọi máy lên cầu nối v5 | Có (POS v5 đọc cả hai nơi) |

**Ước lượng sau G1–G5, mười quán / ngày:**

| | Hiện tại | Sau | Ghi chú |
|---|---|---|---|
| Đọc khi không có việc | ~9.000 | ~500 + ~600 (máy POS nghe dấu, tới khi làm G6) | Phần gác cổng **không tăng theo số quán** |
| Ghi khi không có việc | ~3.900 | ~400 | Chỉ còn dấu còn sống lúc quán mở |
| Đọc khi có việc | ~8.700 | ~6.000 | Nhờ G5 |
| Ghi khi có việc | ~2.300 | ~2.300 | Ghi là kết quả thật, không cắt |
| **Tổng** | **~18.000 đọc / ~6.200 ghi** | **~7.000 đọc / ~2.700 ghi** | |

Một giờ không có đơn ở cả 10 quán: 4 nhịp × ~5 lượt đọc = **~20 lượt đọc cho cả chuỗi**, Engine 2 không chạy dòng nào (hiện tại: ~375 đọc + ~160 ghi).

**Điều cần kiểm khi làm G1:** truy vấn nhóm quét mọi collection con cùng tên trong cả project (dùng chung XOFA / TC33) → lọc thêm theo `storeId` và kiểm đường dẫn thuộc Gieo; cần chỉ mục phạm vi nhóm (chủ dự án deploy). Nếu tên collection con trùng với thương hiệu khác thì dùng phương án thay: một tài liệu chuỗi ghi «quán nào đang có việc hẹn», cập nhật trong chính transaction xếp hàng.

## 5. Có đang làm Engine 2 sai lệch cơ chế không?

- **Mục 2 (bản lần 1)** và **mục 4 (bản này): không.** Luật, ngưỡng, thời điểm, giao thức POS ↔ worker giữ nguyên; chỉ bỏ việc đọc / ghi khi không có gì để làm.
- **Bản lần 2 (Phụ lục): có, ở ba chỗ** — «hỏi–đáp» thay cơ chế dấu còn sống; học lúc đóng ngày thay 00:xx; xét hạn «lười» làm thông báo tới trễ. Vì vậy đã rút khỏi đề xuất chính.
- Engine 2 bản hiện tại đã đủ thông minh ở phần **quyết định**. Chỗ chưa thông minh là phần **hạ tầng quanh nó** (nhịp, hàng đợi, đọc lặp) — kế hoạch này chỉ đụng phần đó.

## 6. Bốn ưu tiên của chủ dự án (11/11) → luật thiết kế của kế hoạch này

Chủ dự án giao: «cái nào hợp lý thì tối ưu, đừng hỏi ngược lại». Mọi mục trong kế hoạch đã được soi qua bốn ưu tiên dưới đây; mục nào vi phạm thì bỏ.

| Ưu tiên | Luật thiết kế | Kế hoạch này tuân thủ thế nào |
|---|---|---|
| **1. Bán hàng trước hết** — không đổi luồng bán, khách / nhân viên không chờ vô nghĩa | Không thêm lượt đọc, lượt ghi hay `await` nào vào đường bán (giỏ → thanh toán → in). Engine 2 chỉ chạy ở máy chủ, sau khi bill đã xong | Không mục nào chạm đường bán. Cầu nối POS chỉ bọc danh sách cân và bước ghi số cân (giữ nguyên). Thêm test khoá: bán một bill khi Engine 2 bật / tắt → số lượt đọc và thời gian như nhau |
| **2. Thời gian của nhân viên** — một việc chỉ làm một lần, dù phục vụ nhiều tín hiệu | «Một lần cân, nhiều nơi dùng»: món đã có trong danh sách thì chỉ gắn dấu ngầm; cân ngẫu nhiên ưu tiên món vốn phải cân; cân độc lập = chính số cân của người nhận ca (đang làm vậy — giữ). Máy không được bắt người chờ mạng | B1 + B2 rút vòng mạng lúc kết ca từ ~4 × số dòng xuống ~1 cho cả danh sách. **Thêm B5:** phần xin lượt của Engine 2 có **trần thời gian** (đề xuất 4 giây cho cả lần kết ca) — quá trần thì POS tự ghi như cơ chế «không chắc → POS ghi» sẵn có (mã lý do `request_failed`), nhân viên không bao giờ đứng chờ Engine 2. Việc trùng: mã việc cố định theo (ngày, món) nên hai tín hiệu cùng đòi cân một món vẫn là **một** dòng |
| **3. Không có luồng riêng cho Engine 2** | Mọi việc Engine 2 cần phải là **một dòng trong danh sách sẵn có** (cân đầu ca / cuối ca). Không màn mới, không popup, không bước mới | Kế hoạch không thêm màn / bước nào. Việc chẩn đoán dạng nhập riêng (kiểm bì, tỷ trọng, đối chiếu nhãn…) **tiếp tục tắt** cho tới khi có chỗ nằm trong danh sách cân — không bật trong kế hoạch này |
| **4. Không giải thích cho nhân viên** | Không thêm chữ, lý do, nhãn nào lên POS; dòng Engine 2 trông y như dòng thường | Giữ nguyên việc ẩn «Cần cân hôm nay vì…». Mọi lý do (kể cả B5 quá trần thời gian) chỉ hiện ở quanlygieo2 cho quản lý |

## 7. Quyết định đã chọn (thay cho các câu hỏi ở bản trước)

| Việc | Chọn | Vì sao |
|---|---|---|
| Hướng chung | **Cổng tín hiệu, giữ nguyên cơ chế** (mục 4). Phương án phụ lục không làm | Không đổi luật, không đổi cách POS ↔ worker tin nhau |
| Nhịp 15 phút | **Giữ làm người gác cổng**, không gỡ | Gỡ hẳn cần hạ tầng mới + đổi cơ chế; gác cổng chỉ ~1 lượt đọc / nhịp cho cả chuỗi |
| Cách làm G1 | **Một tài liệu «bảng tín hiệu chuỗi»** (mỗi quán: có việc hẹn tới giờ nào, đang có ca không, hôm qua có hoạt động không) — worker ghi khi trạng thái **đổi** (việc lỗi được hẹn lại, vào / ra ca). Không dùng truy vấn nhóm | Không cần chỉ mục mới, không đụng collection trùng tên của XOFA / TC33. Thêm lưới an toàn: **mỗi giờ một lần** vẫn hỏi từng quán như cũ để bắt việc thất lạc (trường hợp hiếm này chờ tối đa 1 giờ thay vì 15 phút — khác biệt duy nhất về thời gian, chỉ ở đường lỗi) |
| Phạm vi worker | Làm **cả** phần worker tự động hoá dùng chung nhịp (`worker.js`, `queue.js`) nhưng ở đợt riêng, sau phần Engine 2 | Chiếm ~60% phần lãng phí; tách đợt để lỗi (nếu có) không lẫn |
| Lượt học sau ngày nghỉ | Chạy bù ở tín hiệu vào ca đầu tiên | Kịp trước lúc cân cuối ca; ngày nghỉ không tạo việc cân không ai làm |
| Việc M0 / M3 cho POS | Lượt học **công bố sẵn** lên tài liệu POS đang nghe; POS v5 vẫn giữ truy vấn cũ làm dự phòng | 0 lượt đọc, hết phụ thuộc chỉ mục, bớt chờ lúc mở màn kết ca |
| Mục cần chỉ mục mới (A1-4, A5) | **Hoãn**, chỉ làm nếu số đo cho thấy đáng | Tránh việc chủ dự án phải deploy chỉ mục cho lợi ích chưa rõ |
| A6, A7, S1, S4, S5 | **Không làm** | Lợi nhỏ hoặc đổi kết quả |
| Giả định 10 quán | Dùng tạm; Đ0 đo lại và sửa bảng | — |

## 8. Thứ tự thực hiện (xếp theo bốn ưu tiên)

| Đợt | Phục vụ ưu tiên | Nội dung | File chạm | Deploy |
|---|---|---|---|---|
| **Đ0 — đo** | — | Mô phỏng 10 quán × 7 ngày trên Firebase giả: đếm đọc / ghi / lần gọi từng nhóm việc; đo số vòng mạng và thời gian một lần kết ca 10 dòng (mạng thường / mạng chậm giả lập); test khoá «bán một bill không tốn thêm gì» | `tests/`, `tools/automation/` | không |
| **Đ1 — POS: kết ca nhanh** | 2 (và 1, 3, 4 giữ nguyên) | B1, B2 (gộp xin lượt), B4, **B5 trần thời gian**, đọc danh sách M0 / M3 công bố sẵn (dự phòng truy vấn cũ) | `gieo_engine2_pos_v5.js`, `unit_engine2_store_v5.js`, posgieo trỏ sang; v4 giữ quay lui | Hosting |
| **Đ2 — worker Engine 2: cổng tín hiệu** | chi phí | Bảng tín hiệu chuỗi (G1), dấu còn sống chỉ khi có ca (G3), mốc học bền + học theo hoạt động (G4, A1), bớt đọc lặp (A3, A4), công bố M0 / M3 | store v5 (shared), `functions/automation/engine2.js`, `index.js` | Functions |
| **Đ3 — worker tự động hoá: cùng cổng** | chi phí | G1 + G2 cho `queue.retryDue` và `worker.tickStore` | `queue.js`, `worker.js`, `index.js` | Functions |
| **Đ4 — dọn** | chi phí | Dấu còn sống rời tài liệu điều khiển (G6) khi mọi máy ≥ v5; A5 nếu đáng | store v5 / v6 | Functions |

Thứ tự deploy an toàn cả hai chiều như gói v3: POS v5 chạy được với worker v4 (chưa có danh sách công bố → dùng truy vấn cũ), worker mới chạy được với POS v4 (dấu còn sống vẫn < 45 phút suốt lúc có ca).

**Cửa nghiệm thu mỗi đợt**
1. `sh tools/sinh_lai_tat_ca.sh` giữ mốc 6 FAIL có sẵn; `check_boundaries` + `check_paths` sạch.
2. Bộ test store v4 / POS v4 chạy lại nguyên trên v5.
3. Test «hai thế giới» (v4 và v5, cùng dữ liệu 10 quán × 7 ngày): hồ sơ, phân bổ, mức kiểm soát, việc cân, mô hình học **giống hệt**.
4. Bốn ưu tiên thành test: (1) bán một bill — lượt đọc / thời gian không đổi; (2) danh sách cân không có món trùng, một lần cân phục vụ mọi tín hiệu, kết ca không chờ quá trần khi mạng treo; (3) không có phần tử giao diện mới ở POS; (4) HTML dòng cân của Engine 2 giống hệt dòng thường.
5. Số đo Đ0 giảm như dự kiến.

**Bước kế tiếp:** kế hoạch đã đủ quyết định để code. Khi chủ dự án bảo bắt đầu, làm Đ0 trước (chỉ thêm test / công cụ đo, không đổi app), rồi Đ1.

## Phụ lục — phương án lần 2: đánh thức hoàn toàn theo tín hiệu (ĐỂ DÀNH, không làm trong kế hoạch này)

> Giữ lại để tra cứu. Lý do không chọn: T2 đổi cơ chế «còn sống», T3 đổi thời điểm học, T4 làm trễ thông báo, cần thêm hạ tầng Cloud Tasks. Chỉ xem lại khi số quán lớn tới mức cổng tín hiệu (mục 4) không còn đủ.

### P1 Nhịp 15 phút hiện đang làm gì

`gieoAutomationClock` (`functions/automation/index.js`) chạy 96 lần / ngày cho **mỗi quán**, kể cả lúc quán đóng cửa, và mỗi lần đều đọc / ghi dù không có việc:

| Phần | Việc mỗi nhịp | Tốn khi KHÔNG có việc |
|---|---|---|
| `engine2.tick` | chạy lại việc lỗi tới hạn (`retryDue`), ghi dấu còn sống, thử lượt học | 1 truy vấn + 1 lần ghi (kéo theo trigger thiết lập + mọi máy POS đang nghe) + phần A1 |
| `queue.retryDue` | chạy lại việc tự động hoá lỗi | 1 truy vấn |
| `worker.tickStore` | khoá (1 transaction ghi), việc tới hạn `nextCheckAt`, ngày `dirty`, ghi `heartbeatAt` | ~4 lượt đọc + 3 lần ghi |

Ước lượng: ~10 lượt đọc + ~5 lần ghi × 96 = **~1.000 lượt đọc + ~500 lần ghi / ngày / quán cho «không làm gì»**; tăng thẳng theo số quán (vòng lặp tuần tự trong một hàm, 100 quán là chạm trần 540 giây).

Điều quan trọng: **việc thật của Engine 2 vốn đã chạy theo tín hiệu** (trigger Firestore). Nhịp 15 phút chỉ còn 4 vai: ① thử lại việc lỗi, ② dấu còn sống, ③ lượt học + quét hằng ngày, ④ việc có hạn theo thời gian. Cả bốn đều thay được bằng tín hiệu.

### P2 Bảng tín hiệu — khi nào Engine 2 làm việc

| Tín hiệu (đã có sẵn trong dữ liệu) | Engine 2 làm gì | Hiện tại |
|---|---|---|
| Báo hết còn dư (dòng `finish_<tem>_WASTE` / tem `finished`) | lập hồ sơ, phân bổ, nâng mức | ✅ trigger |
| Lượt cân POS giao (`measurements/*` tạo mới) | hoàn tất trách nhiệm + mốc cân | ✅ trigger |
| Dòng nấu mẻ bật `needsReview` / `entryErrorConfirmed` | tự duyệt lệch nấu mẻ | ✅ trigger |
| Vụ lệch, thông báo lệch, phiếu bù BTP âm | xếp loại / đóng thông báo | ✅ trigger |
| Đổi giá, đổi thiết lập | tính lại giá / khởi tạo | ✅ trigger |
| **Vào ca / ra ca** (`employee_shifts`) | hôm nay: đối chiếu nhóm pha chế. **Thêm:** «người gác» — chạy bù mọi việc quá hạn, lập việc M0 của ngày nếu chưa có | 🆕 |
| **Mở màn kết ca** (POS ghi 1 tài liệu «hỏi») | trả lời «còn sống» + chạy bù việc tới hạn trước khi nhân viên cân xong | 🆕 thay dấu 15 phút |
| **Đóng ngày** (`daily_closings` đổi `status`) | lượt học + 4 lượt quét + xét các hạn chờ | 🆕 thay «00:xx mỗi đêm» |
| **Báo thức hẹn giờ** (Cloud Tasks, chỉ đặt khi có việc hẹn) | thử lại việc lỗi đúng giờ `nextTryAt`; việc tới `nextCheckAt` | 🆕 thay `retryDue` mỗi nhịp |
| *Không có tín hiệu nào* (1 giờ không đơn, quán nghỉ) | **không chạy gì — 0 lần gọi, 0 lượt đọc** | hiện: 4 nhịp / giờ |

Bán hàng bình thường (bill → trừ kho) **không** phải tín hiệu của Engine 2: không có hao hụt mới thì không có gì để xét.

### P3 Bốn cơ chế thay nhịp

**T1 — Báo thức kế tiếp thay cho «cứ 15 phút hỏi một lần».**
- Việc lỗi được ghi `nextTryAt` (đã có, giãn dần 1 phút → 6 giờ). Thay vì đợi nhịp quét, lúc ghi lỗi worker **đặt luôn một báo thức** đúng giờ đó (Cloud Tasks — hàm `onTaskDispatched` của Firebase Functions v2, gói `firebase-functions` ^6 đang dùng đã có). Báo thức reo → chạy mọi việc tới hạn → nếu còn việc hẹn thì đặt báo thức cho mốc gần nhất, **hết việc thì không đặt nữa**.
- Một mốc `nextWakeAt` cho mỗi quán (tài liệu trạng thái): chỉ đặt báo thức mới khi mốc mới sớm hơn mốc đang có → không đặt trùng. Báo thức reo thừa vô hại (việc đã có khoá + mã thao tác chống lặp).
- Dùng chung cho hàng đợi tự động hoá (`queue.retryDue`) và `nextCheckAt` của `worker.tickStore`.
- Tham khảo (chỉ lấy ý tưởng): Firebase «Enqueue functions with Cloud Tasks» — https://firebase.google.com/docs/functions/task-functions. **Cần chủ dự án bật Cloud Tasks API một lần**; chi tiết quyền và cách chống trùng tên task kiểm lại theo tài liệu lúc code.

**T2 — «Hỏi – đáp» thay dấu còn sống 15 phút.**
- Hiện POS tin worker nếu dấu < 45 phút: vừa tốn (96 lần ghi / ngày), vừa **kém chính xác** (worker hỏng 40 phút trước vẫn được tin; hàm đồng hồ sống không chứng minh trigger lượt cân sống).
- Mới: lúc POS dựng danh sách cân cuối ca có món Engine 2, ghi một tài liệu «hỏi» (mã ngẫu nhiên). Trigger trả lời vào chính tài liệu đó. Tới lúc ghi dòng cân đầu tiên (nhân viên cân mất vài phút) POS đã có «đáp» → giao lượt; chưa có → `worker_stale`, POS tự ghi **đúng như hành vi hiện tại**. Không bao giờ chờ, không chặn kết ca.
- Lợi thêm: câu hỏi đánh thức worker **ngay trước lúc sắp có việc** (làm nóng, chạy bù việc tới hạn).
- Tốn: 1 lần ghi + 1 lần gọi + 1 lượt đọc cho mỗi lần kết ca, thay cho 96 lần ghi + 96 × số máy lượt đọc mỗi ngày.

**T3 — Lượt học chạy khi «đóng ngày», không chạy theo giờ.**
- Dữ liệu học (quan sát) chỉ sinh từ lượt cân cuối ca và báo hết. Sau tín hiệu đóng ngày là lúc dữ liệu vừa đủ → học ngay (hẹn trễ ~10 phút bằng báo thức T1 để các lượt cân hoàn tất), lập việc M0 cho **ngày làm việc kế tiếp**.
- Ngày quán nghỉ: không tín hiệu → không học. Bản v4 vẫn học vào ngày nghỉ và tạo việc M0 không ai làm (3 ngày sau lượt dọn mới huỷ) — bỏ được phần thừa này.
- Mốc «đã học ngày D» ghi bền ở `models/current` (giải quyết luôn A1: khởi động lạnh không còn quét lại). Bốn lượt quét đi cùng lượt học.
- **Giữ kết quả:** cùng thuật toán, cùng đầu vào; chỉ đổi lúc chạy. Điểm phải kiểm bằng test hai thế giới: mã việc `m0~<ngày>`, luật «cách 2 ngày» của M0, cửa sổ 90 ngày và mốc hiệu chuẩn 7 ngày tính theo ngày làm việc đã đóng.

**T4 — Hạn chờ xét «lười» tại tín hiệu kế tiếp.**
- Các hạn theo thời gian của Engine 2: việc treo 3 ngày, sự cố pha nhầm 36 giờ, chờ mã cùng phiếu 45 ngày, hết hạn theo dõi nhóm. Kết quả của chúng **chỉ được dùng khi quán hoạt động** (POS dựng danh sách cân, lượt học xét hạ mức) → xét ở tín hiệu vào ca / đóng ngày kế tiếp là đủ, không cần đồng hồ.
- Ngoại lệ cần quyết: thông báo «để biết» của sự cố pha nhầm quá 36 giờ sẽ tới trễ tới lần vào ca kế tiếp nếu quán nghỉ. Muốn đúng giờ thì đặt báo thức T1 cho riêng hạn này.

### P4 An toàn khi bỏ nhịp

- **Người gác = tín hiệu vào ca.** Lần vào ca đầu tiên của ngày: chạy bù việc quá hạn, kiểm `nextWakeAt` đã qua mà chưa phục vụ (báo thức thất lạc), lập M0 nếu lượt học hôm trước lỡ. Quán có mở là có người gác; quán không mở thì không cần.
- **Chuyển từng bước có số đo, không tắt mù:** giữ nhịp 15 phút chạy song song, thêm bộ đếm «nhịp tìm thấy việc mà tín hiệu bỏ sót». Bộ đếm = 0 liên tục 7 ngày → hạ nhịp xuống 1 lần / ngày → 7 ngày nữa vẫn 0 → gỡ (hoặc giữ 1 lần / ngày làm lưới cuối, ~2 lượt đọc — chủ dự án chọn).
- **Máy POS bản cũ:** cầu nối v4 chỉ hiểu dấu 15 phút. Chỉ thôi ghi dấu khi mọi máy báo `bridgeVersion ≥ 5` (đã có ở `devices`); trước đó worker ghi dấu cũ **khi có tín hiệu vào ca / hỏi–đáp** thay vì mỗi 15 phút — cần kiểm kỹ vì v4 đòi dấu < 45 phút (ca dài hơn 45 phút → v4 tự ghi; an toàn nhưng Engine 2 không nhận lượt). Vì vậy: **POS v5 lên trước, worker sau.**

### P5 Thông minh hơn — ngoài chuyện đánh thức

| # | Ý | Giữ nguyên kết quả? |
|---|---|---|
| S1 | Lượt học chỉ tính lại món **có quan sát / nhãn mới** (cờ đặt cùng transaction ghi quan sát); món không đổi dùng lại số đã lưu | Phải chứng minh bằng test hai thế giới — mức thường gộp tầng theo nhóm nên một món đổi có thể kéo cả nhóm; nếu không giống hệt thì không làm |
| S2 | Lượt học công bố sẵn việc M0 / M3 lên tài liệu POS đã nghe (mục B3) | Có |
| S3 | Kết ca: một lần xin lượt cho **cả danh sách** thay vì từng dòng (gộp B1 + B2) | Có — kho vẫn do POS áp từng dòng |
| S4 | Mỗi bill ghi nhiều dòng `stock_transactions` → mỗi dòng một lần gọi function rồi thoát ngay (0 lượt đọc) | **Không đề xuất làm**: muốn bỏ phải sửa engine kho ghi «tín hiệu» riêng (v22) — rủi ro lớn hơn lợi; chỉ đo ở Đ0 |
| S5 | Chọn món M0 theo «lượng thông tin thu được» thay vì xoay vòng | **Đổi kết quả** → ngoài phạm vi; nếu muốn phải chạy lại chứng nhận mô phỏng |
