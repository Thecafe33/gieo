# Kế hoạch tối ưu Unit Engine 2 — các tác vụ còn tốn lượt đọc / thời gian chờ

> Ngày lập: 11/11/2026. Mốc mã đã đọc: `21736d9` (nhánh `Phan-tach-unit-engine`).
> Đầu vào: [TOM_TAT_UNIT_ENGINE2_POS_QUANLYGIEO2.md](TOM_TAT_UNIT_ENGINE2_POS_QUANLYGIEO2.md), [LO_TRINH_ENGINE2_CAP6.md](LO_TRINH_ENGINE2_CAP6.md), [ENGINE2_POS_V3_05-11.md](ENGINE2_POS_V3_05-11.md) và mã `gieo_engine2_pos_v4.js`, `unit_engine2_store_v4.js`, `functions/automation/engine2.js` + `index.js`, `tools/automation/engine2_ui.js`.
> **Chỉ là kế hoạch — chưa đổi dòng mã nào.** Trạng thái Engine 2 vẫn chỉ ghi ở lộ trình; tài liệu này là danh sách đề xuất chờ chủ dự án chọn.
> **Bổ sung lần 2 (11/11, chủ dự án yêu cầu):** bỏ kiểu «15 phút tự gọi dậy một lần» — Engine 2 chỉ làm việc khi có **tín hiệu**; xem mục 3. Mục 3 thay cho đề xuất A2 và đổi cách làm A1.
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
| B4 | Người kết ca hôm trước | `previousCloser`: tới 7 truy vấn ca theo ngày, chỉ nhớ trong bộ nhớ trang; chạy cả khi Engine 2 tắt | Tải lại trang là đọc lại | Nhớ theo ngày ở `localStorage`; dừng ở ngày đầu tiên có ca (đã làm) |

### Không đề xuất đổi

- Giao diện quanlygieo2 (`engine2_ui.js`): đọc theo lần bấm, có giới hạn, cache 30 giây — đủ tốt. Việc nó nạp `store_v1` không gây tốn (chỉ dùng `base` / `sub` / `config`).
- Số lần gọi function do mỗi việc hàng đợi ghi `requests` 3 lần: lần gọi thừa không đọc gì; chỉ theo dõi ở Đ0.

## 3. Đánh thức theo tín hiệu — bỏ nhịp 15 phút (bổ sung lần 2)

### 3.1 Nhịp 15 phút hiện đang làm gì

`gieoAutomationClock` (`functions/automation/index.js`) chạy 96 lần / ngày cho **mỗi quán**, kể cả lúc quán đóng cửa, và mỗi lần đều đọc / ghi dù không có việc:

| Phần | Việc mỗi nhịp | Tốn khi KHÔNG có việc |
|---|---|---|
| `engine2.tick` | chạy lại việc lỗi tới hạn (`retryDue`), ghi dấu còn sống, thử lượt học | 1 truy vấn + 1 lần ghi (kéo theo trigger thiết lập + mọi máy POS đang nghe) + phần A1 |
| `queue.retryDue` | chạy lại việc tự động hoá lỗi | 1 truy vấn |
| `worker.tickStore` | khoá (1 transaction ghi), việc tới hạn `nextCheckAt`, ngày `dirty`, ghi `heartbeatAt` | ~4 lượt đọc + 3 lần ghi |

Ước lượng: ~10 lượt đọc + ~5 lần ghi × 96 = **~1.000 lượt đọc + ~500 lần ghi / ngày / quán cho «không làm gì»**; tăng thẳng theo số quán (vòng lặp tuần tự trong một hàm, 100 quán là chạm trần 540 giây).

Điều quan trọng: **việc thật của Engine 2 vốn đã chạy theo tín hiệu** (trigger Firestore). Nhịp 15 phút chỉ còn 4 vai: ① thử lại việc lỗi, ② dấu còn sống, ③ lượt học + quét hằng ngày, ④ việc có hạn theo thời gian. Cả bốn đều thay được bằng tín hiệu.

### 3.2 Bảng tín hiệu — khi nào Engine 2 làm việc

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

### 3.3 Bốn cơ chế thay nhịp

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

### 3.4 An toàn khi bỏ nhịp

- **Người gác = tín hiệu vào ca.** Lần vào ca đầu tiên của ngày: chạy bù việc quá hạn, kiểm `nextWakeAt` đã qua mà chưa phục vụ (báo thức thất lạc), lập M0 nếu lượt học hôm trước lỡ. Quán có mở là có người gác; quán không mở thì không cần.
- **Chuyển từng bước có số đo, không tắt mù:** giữ nhịp 15 phút chạy song song, thêm bộ đếm «nhịp tìm thấy việc mà tín hiệu bỏ sót». Bộ đếm = 0 liên tục 7 ngày → hạ nhịp xuống 1 lần / ngày → 7 ngày nữa vẫn 0 → gỡ (hoặc giữ 1 lần / ngày làm lưới cuối, ~2 lượt đọc — chủ dự án chọn).
- **Máy POS bản cũ:** cầu nối v4 chỉ hiểu dấu 15 phút. Chỉ thôi ghi dấu khi mọi máy báo `bridgeVersion ≥ 5` (đã có ở `devices`); trước đó worker ghi dấu cũ **khi có tín hiệu vào ca / hỏi–đáp** thay vì mỗi 15 phút — cần kiểm kỹ vì v4 đòi dấu < 45 phút (ca dài hơn 45 phút → v4 tự ghi; an toàn nhưng Engine 2 không nhận lượt). Vì vậy: **POS v5 lên trước, worker sau.**

### 3.5 Thông minh hơn — ngoài chuyện đánh thức

| # | Ý | Giữ nguyên kết quả? |
|---|---|---|
| S1 | Lượt học chỉ tính lại món **có quan sát / nhãn mới** (cờ đặt cùng transaction ghi quan sát); món không đổi dùng lại số đã lưu | Phải chứng minh bằng test hai thế giới — mức thường gộp tầng theo nhóm nên một món đổi có thể kéo cả nhóm; nếu không giống hệt thì không làm |
| S2 | Lượt học công bố sẵn việc M0 / M3 lên tài liệu POS đã nghe (mục B3) | Có |
| S3 | Kết ca: một lần xin lượt cho **cả danh sách** thay vì từng dòng (gộp B1 + B2) | Có — kho vẫn do POS áp từng dòng |
| S4 | Mỗi bill ghi nhiều dòng `stock_transactions` → mỗi dòng một lần gọi function rồi thoát ngay (0 lượt đọc) | **Không đề xuất làm**: muốn bỏ phải sửa engine kho ghi «tín hiệu» riêng (v22) — rủi ro lớn hơn lợi; chỉ đo ở Đ0 |
| S5 | Chọn món M0 theo «lượng thông tin thu được» thay vì xoay vòng | **Đổi kết quả** → ngoài phạm vi; nếu muốn phải chạy lại chứng nhận mô phỏng |

## 4. Thứ tự thực hiện (thay bản trước)

| Đợt | Nội dung | File chạm | Deploy |
|---|---|---|---|
| **Đ0 — đo** | Bộ đếm lượt đọc / ghi / lần gọi cho: 1 ngày 96 nhịp không việc, 1 lần kết ca 10 dòng, 2 báo hết, 1 lượt học. Chủ dự án gửi số lần gọi thật của `gieoAutomationClock` và các trigger | `tests/`, `tools/automation/` | không |
| **Đ1 — POS v5** | T2 phía POS (hỏi, đọc đáp, vẫn hiểu dấu cũ) + B1, B2 / S3, B3 / S2, B4 | `gieo_engine2_pos_v5.js`, `unit_engine2_store_v5.js`, posgieo trỏ sang | Hosting |
| **Đ2 — worker theo tín hiệu** | T1 báo thức, T2 trả lời, T3 học khi đóng ngày, T4 hạn lười, người gác vào ca, A3, A4; nhịp 15 phút **vẫn chạy** + bộ đếm «tín hiệu bỏ sót» | store v5 (shared), `engine2.js`, `index.js`, `queue.js`, `worker.js` | Functions + bật Cloud Tasks |
| **Đ3 — hạ nhịp** | Bộ đếm = 0 trong 7 ngày → nhịp 1 lần / ngày → gỡ; thôi ghi dấu cũ khi mọi máy ≥ v5 | `index.js` | Functions |
| **Đ4 — tuỳ số đo** | A5 (chỉ mục giá), A6, A7, S1 | store v5 / v6 | Functions + chỉ mục |

Cửa mỗi đợt: `sh tools/sinh_lai_tat_ca.sh` giữ mốc 6 FAIL có sẵn; bộ test store v4 / POS v4 chạy lại nguyên trên v5; test hai thế giới cho lượt học; `check_boundaries` + `check_paths` sạch.

Lưu ý phạm vi: `queue.js` / `worker.js` là worker tự động hoá (không riêng Engine 2) nhưng **dùng chung nhịp** — bỏ nhịp thì phải chuyển cả hai; nếu chủ dự án chỉ muốn đụng Engine 2 thì nhịp còn lại cho hai phần kia và chỉ gỡ `engine2.tick` khỏi nhịp.

## 5. Cần chủ dự án quyết trước khi code

1. Đồng ý dùng **Cloud Tasks** làm báo thức (bật API một lần)? Không đồng ý thì phương án thay: không báo thức, việc lỗi chỉ thử lại ở tín hiệu vào ca / hỏi–đáp / đóng ngày kế tiếp (đơn giản hơn, thử lại chậm hơn).
2. Bỏ nhịp cho **cả** worker tự động hoá, hay chỉ gỡ phần Engine 2?
3. Sau khi chứng minh 7 ngày không sót: gỡ hẳn nhịp, hay giữ 1 lần / ngày làm lưới cuối?
4. T3: lượt học chạy sau đóng ngày và **không học ngày quán nghỉ** — đồng ý?
5. T4: thông báo sự cố pha nhầm quá 36 giờ được phép tới trễ tới lần vào ca kế tiếp, hay phải đúng giờ?
6. B3 / S2: lượt học công bố danh sách M0 / M3 lên tài liệu điều khiển — đồng ý?
7. Chỉ mục ghép mới cho A1(4) và A5 — chủ dự án tự deploy.
