# Engine 2 — lộ trình lên cấp 6 (bản duy nhất)

Ngày: 22/10/2026. Chủ quán duyệt hướng điều chỉnh sau lượt rà kế hoạch (sau commit `282dd00`).

**Đây là tài liệu lộ trình và trạng thái DUY NHẤT của Engine 2.** Các tài liệu khác giữ vai trò tham chiếu, không ghi trạng thái riêng:

| Tài liệu | Vai trò |
|---|---|
| [THIET_KE_UNIT_ENGINE2_V1.md](THIET_KE_UNIT_ENGINE2_V1.md) | Kiến trúc, ranh giới lõi, luồng 300 g |
| [MA_TRAN_ENGINE2_TU_DONG_NANG_MUC.md](MA_TRAN_ENGINE2_TU_DONG_NANG_MUC.md) | Ma trận case A/B/F/D/T/C, luật hiện có, định nghĩa cấp 1–6 |
| [DAC_TA_TRIEN_KHAI_UNIT_ENGINE2_V1.md](DAC_TA_TRIEN_KHAI_UNIT_ENGINE2_V1.md) | Schema, ba FSM, writer/fence, nhãn học, manifest replay |
| [NGOAI_LE_UNIT_ENGINE2_DE_XUAT.md](NGOAI_LE_UNIT_ENGINE2_DE_XUAT.md) | 15 ngoại lệ đề xuất |
| [UNIT_ENGINE2_P0_22-10.md](UNIT_ENGINE2_P0_22-10.md) | Kết quả, kiểm thử và giới hạn của runtime P0 |

Khi tài liệu tham chiếu nói khác lộ trình này về **thứ tự, phạm vi hoặc định nghĩa cấp**, theo tài liệu này.

## 1. Bốn điều chỉnh đã chốt (22/10)

1. **Cấp 4 giới hạn ở giả thuyết kiểm được bằng phép đo.** Xác suất chỉ tính cho: sai bì/đơn vị/tỷ trọng; lệch định mức/yield; mở tem hoặc nhận hàng không khai; lỗi ghi/đồng bộ. «Thất thoát vật lý chưa khai» là **phần dư** sau khi loại các giả thuyết kiểm được — hiện lượng và độ bất định, **không in xác suất**. Nhãn học lấy từ: cân lại độc lập M3, cân vật mẫu biết trước khối lượng, kiểm bì định kỳ, kết quả đối soát sổ. Lý do: với 1–3 quán, nhãn «nguyên nhân hành vi đã xác minh» gần như không có, mốc ≥100 case của đặc tả 6.2 không thể đạt.
2. **Thu mẫu không thiên lệch.** Ngoài mốc cân sinh ra từ M2 (chỉ sau khi đã có hao hụt), có **cân ngẫu nhiên có ngân sách** cho món ở M0: mặc định đề xuất ≤ 2 món/ca, xoay vòng, ưu tiên món giá trị cao/chưa có mốc lâu. Mẫu này là dữ liệu baseline cấp 3, căn cứ tự hạ mức cấp 5 và nguồn nhãn cấp 4. Ngân sách là tham số có phiên bản, đo phút công thực tế.
3. **Bộ kiểm toán độc lập + cài lỗi giả làm SỚM**, là cửa chặn của mọi bước sau, không để tới nghiệm thu cuối. Bộ kiểm nằm ở file riêng, đọc thẳng sổ nguồn (stock/prep ledger, tem, RT, checkpoint), không gọi lại hàm quyết định.
4. **Đi theo lát dọc.** Đưa **một family — NL có tem (A1, A3, A6, D4; kèm T1–T4 liên quan)** — lên đủ cấp 6 trước. BTP/FIFO/nhận hàng (A4, B*, F*, D1–D3, D5) chỉ mở sau khi family đầu có báo cáo chứng nhận.

Kèm theo:

- **Quy mô lớn (phân vùng worker, 10.000 quán) là trục riêng**, không thuộc điều kiện cấp 6. Mã quán hiện là `gg\d{2}` (≤ 100 quán) — đủ cho giai đoạn này.
- **Phương pháp thống kê cho dữ liệu nhỏ** được chốt trước khi code cấp 3 (mục 4).
- **Ghi thời gian thao tác** (bắt đầu/kết thúc mỗi việc cân) — cần cho «giảm bất định so với công thao tác» (ma trận 5.3) và chỉ tiêu phút công (đặc tả 6.2).

## 2. Bảng trạng thái — family 1: NL có tem

Trạng thái: ✅ có runtime + test · 🟡 có một phần · ⬜ chưa làm · ⛔ bị chặn dữ liệu.

| Cấp | Cửa nghiệm thu (đo được) | Trạng thái 22/10 |
|---|---|---|
| 1 — Ghi đủ | Bộ kiểm độc lập: 0 vi phạm chưa giải trình về một nguồn tổn thất, tổng phân bổ + pending = nguồn, không WASTE đúp, đúng `storeId`; replay 30 ngày đường tương thích khớp sổ | 🟡 P0 giữ một writer + receipt. **B0 xong**: bộ kiểm độc lập `unit_engine2_audit_v1.js` (44 mã lỗi) bắt 40/40 lỗi cài trên dữ liệu giả từ luồng thật. Chưa chạy trên dữ liệu thật (B1); replay ⛔ |
| 2 — Luật | Cùng dữ liệu + phiên bản → cùng quyết định (replay); bảng FSM kiểm **mọi cặp** trạng thái × sự kiện; control không lan quán | 🟡 Test tích Descartes 335 cặp đã có: **33 lệch code ↔ đặc tả chờ quyết** (mục 3, B0). Store chưa đi qua `transition()`. Chưa replay |
| 3 — Học mức thường | Baseline theo món/quán (gộp tầng, mục 4) với khoảng bất định; kiểm ngoài thời gian học; tách «đang học» / «đủ tin cậy» | ⬜ Chưa thu mẫu M0 ngẫu nhiên |
| 4 — Suy luận (giả thuyết kiểm được) | Xác suất cho 4 nhóm giả thuyết kiểm được, đối chiếu nhãn M3/vật mẫu/kiểm bì; Brier/reliability báo kèm cỡ mẫu; phần dư không in % | ⬜ |
| 5 — Vòng kín | Event → quyết định → POS ACK → đo → đối soát → **tự hạ mức** theo tiêu chí đã kiểm định; mất ACK/retry phục hồi | 🟡 Nâng mức + giao cân + ACK + mốc mới chạy được; tự hạ đang **tắt** (`releaseEnabled`) |
| 6 — Tự hiệu chuẩn/tự kiểm toán | Mọi lỗi cài sẵn (danh sách B0 + drift + baseline học hao hụt) bị bộ kiểm phát hiện; hiệu chuẩn có phiên bản/giới hạn/quay lui tự động; báo cáo công bố số sai, khoản chưa khớp, độ phủ | ⬜ |

Chưa deploy, chưa bật cấu hình, chưa ghi Firebase thật (xem tài liệu P0).

## 3. Thứ tự thực hiện

Mỗi bước chỉ bắt đầu khi bước trước đạt cửa. Bước có ⛔ có thể làm song song phần không phụ thuộc dữ liệu.

**B0 — Bộ kiểm toán độc lập + cài lỗi giả (cấp 1–2).**
- File riêng (đề xuất `unit_engine2_audit_v1.js`), chỉ đọc; nhận phạm vi quán/món/khoảng; đọc sổ nguồn + quyết định/phân bổ/checkpoint của Engine 2.
- Bất biến: mục 5.5 ma trận + 7.4 đặc tả (một nguồn tổn thất, tổng khớp, không WASTE đúp, khoảng không chồng, mốc đúng đối tượng, control có ACK đúng phiên bản, `unconfirmed`/exception không là mẫu sạch, đúng quán).
- Bộ cài lỗi giả (test + công cụ chạy trên vùng thử): trùng event, sai đơn vị/bì, worker lease cũ, sai cửa hàng, allocation lệch tổng, WASTE đúp, mất ACK, sự kiện đến muộn, sửa nguồn sau khi chốt.
- Test tích Descartes trạng thái × sự kiện cho ba FSM.
- Cửa: mọi lỗi cài sẵn bị phát hiện; dữ liệu sạch → 0 cảnh báo.

**Kết quả B0 (22/10) — đạt cửa trên dữ liệu giả, chưa deploy:**
- `unit_engine2_audit_v1.js` (`UnitEngine2Audit`): `collect` chỉ đọc (mọi truy vấn có giới hạn; chạm giới hạn → `complete:false`, `ok:false`), `check` thuần (không ném lỗi vì dữ liệu xấu), `run`, `summary`. Không nạp `unit_engine2_v1.js`; tự suy lại nhóm pha chế từ ca thô (ca đã check-out giao khoảng là bắt buộc; ca chưa check-out được chấp nhận cả hai cách và báo cảnh báo `OPEN_SHIFT_IN_INTERVAL`), lượng ròng từ số tổng − bì, giá từ nguồn/lịch sử giá. 38 mã vi phạm + 6 mã cảnh báo (danh mục `CODES`). Không dùng index mới (stock_transactions type+businessDate đã có).
- `tests/unit_engine2_audit.test.js`: dữ liệu sạch dựng bằng luồng runtime thật (báo hết 300 g + hai lượt cân qua kho v21) → 0 vi phạm, 0 cảnh báo; 40 lỗi cài, mỗi lỗi bị bắt đúng mã; kiểm chỉ đọc, không nạp lõi, quán khác không lẫn, chạm giới hạn → CHƯA ĐẠT.
- `tests/unit_engine2_fsm.test.js`: bảng mong đợi viết lại từ đặc tả 3.2–3.4, so 335 cặp. **33 lệch đã biết** liệt kê đích danh (test hỏng khi có lệch mới hoặc lệch cũ tự mất):
  - Case: `SOURCE_UPSERT` gộp luôn `CHECK_START` (new → checking); thiếu `CHECK_START`, `DUE` (checking), `LATE_EVENT` (mọi trạng thái — đặc tả: không đổi trạng thái).
  - Task: thiếu `DUE` cho `exception_recorded`.
  - Control: `MEASUREMENT_CONFLICT` nhảy 0 → 3 (đặc tả chỉ 1/2 → 3); thiếu `TASK_RESULT`, `DUE`, `CONFIG/RECIPE/MEASUREMENT_CHANGED` (đặc tả: giữ hoặc tăng).
- `tools/automation/engine2_audit.js`: chạy kiểm toán trên bản xuất JSON `{đường/dẫn: doc}`, thoát mã 1 khi CHƯA ĐẠT — dùng lại ở B2.
- **Phát hiện khi rà:** `unit_engine2_store_v1.js` gán thẳng `status` (case đi thẳng `decided`, task `queued`/`done`), **không gọi `E.transition()`** → bảng FSM chưa gác đường ghi. Bộ kiểm toán bù bằng kiểm trạng thái/kết quả trên dữ liệu đã ghi.
- **Chờ chủ quán quyết** (đổi hành vi → `unit_engine2_v2.js`, không sửa v1): (a) sửa 33 lệch theo đặc tả hay sửa đặc tả theo code; (b) store đi qua `transition()`; (c) gắn bộ kiểm toán vào worker/QL2 (nút «Kiểm toán» hoặc chạy theo lịch) — hiện mới là module + công cụ dòng lệnh.

**B1 — Chạy đối chiếu thử (shadow) tại gg01 để thu dữ liệu thật.** Cần chủ quán deploy gói P0 (chế độ Đối chiếu thử, không ghi hiệu lực).
- Thêm vào bản ghi việc cân: `startedAt`, `finishedAt` (thời gian thiết bị + server), số lần cân lại → phút công.
- Thêm **cân ngẫu nhiên M0** theo ngân sách (điều chỉnh 2), đánh dấu `sampling:'random_m0'` để tách khỏi mẫu do M2 sinh ra.
- Thêm **kiểm bì / cân vật mẫu** định kỳ (nhãn độ đúng phép đo).
- Sửa engine đã phát hành = bản mới (`unit_engine2_v2.js` …), không sửa v1.
- Cửa: sau ≥ 14 ngày có hoạt động, bộ kiểm B0 chạy trên dữ liệu thật, 0 vi phạm chưa giải trình.

**B2 — Công cụ xuất manifest đủ + replay 30 ngày (công cụ xuất ✅ 22/10; replay ⛔ chờ file thật).**
- Xuất theo mục 7.2 đặc tả: raw stock/prep ledger có ID, tem có `containerId`, RT `active_units`, ca/role lịch sử, lịch sử giá/bì/công thức, điểm cắt FS–RT. Thao tác bấm rõ, có giới hạn, không quét nền POS.
- Replay hai đường (tương thích / chính sách mới). Không đủ nguồn → `BLOCKED_DATA`, không «PASS dự kiến».
- Cửa: cấp 1–2 family 1 đạt → **chứng nhận cấp 2**.

**Thứ tự đổi (chủ quán duyệt 22/10): B2 làm TRƯỚC B1** — xuất lịch sử thật để chạy lại/kiểm toán thay phần lớn thời gian đối chiếu thử; dữ liệu học cấp 3–6 chỉ sinh khi chạy tự động (đối chiếu thử không giao việc cân nên gần như không sinh mẫu).

**Kết quả B2 phần 1 — công cụ xuất (22/10, chưa deploy):**
- `unit_engine2_export_v1.js` (`UnitEngine2Export.build`): chỉ đọc, chạy khi bấm, đọc theo trang (con trỏ snapshot) có giới hạn; tối đa 62 ngày, một điểm bán. Lấy: danh mục + lịch sử giá + dụng cụ/bì + refill_rules; theo businessDate: stock/prep_transactions, prep_batches, stock_containers, stock_anomalies, daily_closings/openings, shift_segments, duty_cases; **tem liên quan** = còn sống + có dòng sổ trong kỳ (cả tem nhận trước kỳ) + nhận trong kỳ; ca từ 14 giờ trước ngày đầu; toàn bộ dữ liệu Engine 2 (12 bảng con); RT `active_units`. Không gồm bill/khách.
- File: `{manifest, docs:{tên_bảng_vật_lý/id: doc}, rt}`. Manifest: phiên bản, khoảng ngày, giờ máy chủ lệch, lúc chụp RT, số dòng / chạm giới hạn / thiếu / lỗi từng phần, **thao tác dở** (khoá cân, việc chờ, lượt cân xếp hàng, khoá chế biến RT, huỷ chờ), SHA-256 từng phần + tổng, ghi chú «FS và RT không phải ảnh chụp nguyên tử». Timestamp → ISO.
- Quản lý › Trích xuất dữ liệu: thẻ thứ ba **«Bản kiểm toán kho (Engine 2)»** (`runExportKho`); hai bản gọn / đầy đủ giữ nguyên. Tên bảng qua `GieoData.collFor` / `fsName` / `rtPath` (bảng dùng chung `price_history`, `prep_vessels` không hậu tố quán — test đối chiếu `data_access`).
- **Trang riêng `kiem_toan_kho.html`** (chủ quán 22/10: app đang chạy CHƯA có Engine 2 — không deploy lại quanlygieo): chỉ cần trang này + `unit_engine2_export_v1.js`; không nạp data_access / Unit Engine (tên bảng theo quy tắc data_access, test khoá), cùng tài khoản đăng nhập Quản lý, chỉ đọc. Có trong cả 3 bộ deploy.
- `tools/automation/engine2_audit.js` đọc thẳng file này; manifest chưa đủ → CHƯA ĐẠT.
- Test `tests/unit_engine2_export.test.js` (xuất → kiểm toán 0/0, CLI, mã kiểm ổn định khi đổi cỡ trang, chạm giới hạn, lỗi một phần, thao tác dở, chặn 62 ngày, Timestamp, tên bảng gg02) + e2e trình duyệt `tools/ql_giao_dien/e2e_kiem_toan_kho.js` (PC + điện thoại: bấm → tải file → kiểm toán ĐẠT, không ghi, không lỗi JS).
- **Còn lại của B2:** chủ quán deploy + xuất 30–60 ngày thật; viết công cụ chạy lại (replay) hai đường trên file đó; kiểm toán dữ liệu thật.
- **Phát hiện ngoài phạm vi (chưa sửa — chờ quyết):** worker `functions/automation/engine2.js` tạo store Engine 2 **không truyền hàm đặt tên bảng** → ở quán ≠ gg01 đọc `prep_vessels_gieogieo__ggNN` / `price_history_gieogieo__ggNN` (không tồn tại, đó là bảng dùng chung) → mọi lượt cân bị từ chối «Dụng cụ hoặc bì đã thay đổi», giá thành «chưa đủ giá». POS / quanlygieo2 đúng (dùng `GieoData.collFor`). gg01 không bị.

**B3 — Cấp 3: baseline NL có tem.** Phương pháp mục 4. Cửa: dự báo trên tuần chưa học nằm trong khoảng bất định đã công bố; một mẻ/khoảng lỗi không kéo lệch baseline (kiểm bằng lỗi cài).

**B4 — Cấp 4: giả thuyết kiểm được.** Mỗi case có danh sách giả thuyết + bằng chứng + phép đo phân biệt được đề xuất; xác suất chỉ hiện khi nhóm có đủ nhãn (mốc thử: ≥ 30 nhãn kiểm được cho nhóm, ≥ 10 kiểm ngoài thời gian). Cửa: Brier/reliability kèm cỡ mẫu, tốt hơn baseline «tần suất cũ».

**B5 — Cấp 5: bật tự hạ mức.** Tiêu chí hạ (hiện 5 mốc sạch / 3 ngày / cách 7 ngày) được kiểm lại bằng dữ liệu B1–B3 trước khi bật; giữ cân kiểm tra theo ngân sách sau khi hạ; tái diễn nâng lại ngay. Cửa: replay + quán thử cho thấy không bỏ sót tăng so với giữ M2, phút công giảm.

**B6 — Cấp 6: tự hiệu chuẩn có rào + báo cáo chứng nhận.** Tham số được phép (sai số đo, baseline, lịch lấy mẫu, ngưỡng thao tác trong sàn/trần) → offline → shadow → tự nhận khi tốt hơn; tự quay về bản đáng tin khi kém/drift. Báo cáo chứng nhận theo mục 5. Cửa: toàn bộ lỗi cài (B0 + drift + baseline học hao hụt) bị phát hiện/khôi phục; báo cáo được chủ quán xem.

**B7 — Mở family tiếp theo** (BTP: A4, B1–B4 → FIFO: F1–F4 → nhận hàng/nhãn: D1–D3, D5), mỗi family đi lại B0–B6 với phần dùng chung đã có.

**Trục riêng — quy mô:** phân vùng hàng đợi/clock, mã quán > 100. Làm khi có kế hoạch mở rộng thật, không chặn cấp 6.

## 4. Phương pháp thống kê cho dữ liệu nhỏ (chốt trước B3)

- **Gộp theo tầng (partial pooling / empirical Bayes):** món → nhóm món cùng đơn vị/cách đo → toàn quán. Món ít mẫu co về nhóm; nhiều mẫu thì theo dữ liệu của chính nó. Không chép mốc/trách nhiệm thực tế giữa các quán; chỉ dùng nhóm món tương đương làm tiên nghiệm khi đã xác nhận.
- **Ước lượng bền:** median/MAD hoặc Huber cho tỷ lệ hao hụt trên lượng dùng; loại mẫu phải ghi lý do (không xoá case xấu).
- **Khoảng bất định bắt buộc:** credible interval hoặc conformal; không hiện con số điểm khi mẫu dưới ngưỡng — hiện «đang học» + khoảng rộng.
- **Tiên nghiệm khai báo rõ:** mọi prior ghi nguồn và phiên bản, hiện là «giả định», không gọi là đã hiệu chuẩn.
- **Chỉ số hiệu chuẩn kèm cỡ mẫu:** Brier, reliability theo nhóm; ECE chỉ báo khi mỗi nhóm đủ mẫu. Ngưỡng ±5%/7 ngày, ECE ≤ 0,10 của đặc tả 6.2 giữ là mốc thử, chỉ áp khi đủ mẫu.
- **Hao hụt thường xuyên vẫn là hao hụt** (ma trận 5.1): baseline không phải mức cho phép.

## 5. Mẫu báo cáo chứng nhận cấp (mỗi family × quán)

1. Phạm vi: family, quán, khoảng ngày, phiên bản engine/chính sách/mô hình, hash manifest dữ liệu.
2. Độ phủ: số ngày đủ dữ liệu / tổng; tem có `containerId`; mốc hợp lệ; control đã ACK.
3. Bất biến (B0): số vi phạm, đã giải trình, còn mở — liệt kê từng khoản.
4. Lỗi cài sẵn: danh sách, phát hiện được / bỏ sót.
5. Chỉ số cấp: sai số baseline ngoài thời gian học; Brier/reliability + cỡ mẫu; tỷ lệ yêu cầu đo không cần; phút công/ca; tái diễn sau biện pháp.
6. Hiệu chuẩn: các lần đổi tham số, chênh lệch chất lượng, lần quay lui.
7. Kết luận: đạt / chưa đạt từng cửa ở mục 2. Không dùng «hộp thư trống» hay «100% case done» làm tiêu chí.

## 6. Giữ nguyên

Mọi nguyên tắc ở THIET_KE / MA_TRAN / DAC_TA / NGOAI_LE không trái với lộ trình này vẫn có hiệu lực: một writer kho, B1–B15, không chặn bán/chấm công, không tự trừ lương/duyệt chi, phân bổ theo chính sách ≠ kết luận hành vi, phiên bản bất biến, đọc có giới hạn, ca luôn có pha chế.
