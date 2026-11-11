# Kế hoạch tối ưu Unit Engine 2 — các tác vụ còn tốn lượt đọc / thời gian chờ

> Ngày lập: 11/11/2026. Mốc mã đã đọc: `21736d9` (nhánh `Phan-tach-unit-engine`).
> Đầu vào: [TOM_TAT_UNIT_ENGINE2_POS_QUANLYGIEO2.md](TOM_TAT_UNIT_ENGINE2_POS_QUANLYGIEO2.md), [LO_TRINH_ENGINE2_CAP6.md](LO_TRINH_ENGINE2_CAP6.md), [ENGINE2_POS_V3_05-11.md](ENGINE2_POS_V3_05-11.md) và mã `gieo_engine2_pos_v4.js`, `unit_engine2_store_v4.js`, `functions/automation/engine2.js` + `index.js`, `tools/automation/engine2_ui.js`.
> **Chỉ là kế hoạch — chưa đổi dòng mã nào.** Trạng thái Engine 2 vẫn chỉ ghi ở lộ trình; tài liệu này là danh sách đề xuất chờ chủ dự án chọn.
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

## 3. Thứ tự thực hiện

| Đợt | Nội dung | File chạm | Deploy |
|---|---|---|---|
| **Đ0 — đo** | Đếm lượt đọc / ghi từng tác vụ trên Firebase giả (mở rộng bộ đếm của test v4): một ngày mẫu = 96 nhịp (ấm + lạnh), 1 lần kết ca 10 dòng, 2 báo hết, 1 đêm học. Chủ dự án xem thêm số lần gọi `gieoAutomationClock` / `*_engine2_settings` và log `Engine2 learn` trên máy chủ để xác nhận A1 / A2 | chỉ `tests/` + `tools/automation/` | không |
| **Đ1 — worker** | A1, A3, A4 + phần worker của A2 (ghi hai nơi) | `unit_engine2_store_v5.js` (+ bản shared), `functions/automation/engine2.js` | Functions `gieo-automation` |
| **Đ2 — POS** | B1, B2, B3, B4 + phần POS của A2 | `gieo_engine2_pos_v5.js`, posgieo trỏ store v5 + cầu nối v5, `engine2_ui.js` đọc tài liệu trạng thái mới | Hosting (POS trước, an toàn hai chiều như gói v3) |
| **Đ3 — dọn** | A2 thôi ghi nơi cũ (khi mọi máy ≥ v5); A5 (sau khi có chỉ mục); A6, A7 nếu Đ0 cho thấy đáng làm | store v5 chưa phát hành thì sửa thẳng, đã phát hành thì v6 | Functions + chỉ mục |

Cửa của mỗi đợt: `sh tools/sinh_lai_tat_ca.sh` giữ đúng mốc 6 FAIL có sẵn; bộ test store v4 / POS v4 chạy lại nguyên trên v5; số đo Đ0 giảm đúng như dự kiến; `check_boundaries` + `check_paths` sạch.

## 4. Cần chủ dự án quyết trước khi code

1. Chọn phạm vi: cả Đ1 + Đ2, hay chỉ Đ1 (không đụng POS)?
2. **A2**: đồng ý chuyển dấu worker / bộ đếm sang tài liệu riêng (thêm một đường dẫn con dưới `_engine2`, không thêm bảng)?
3. **B3**: đồng ý để lượt học công bố danh sách M0 / M3 lên tài liệu điều khiển?
4. **A1(4) + A5**: hai chỉ mục ghép mới — chủ dự án tự deploy chỉ mục.
5. Đ0 cần chủ dự án gửi số liệu Functions (số lần gọi, log khởi động lạnh) — phiên làm việc của Claude không đọc được Firebase thật.
