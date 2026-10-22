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
| 1 — Ghi đủ | Bộ kiểm độc lập: 0 vi phạm chưa giải trình về một nguồn tổn thất, tổng phân bổ + pending = nguồn, không WASTE đúp, đúng `storeId`; replay 30 ngày đường tương thích khớp sổ | ✅ gg01 52 ngày thật: kiểm toán độc lập 0/0 trên 46 hồ sơ chạy lại; hao hụt khớp sổ lãi/lỗ (0 ngày lệch); tem = sự thật 38/38 (B2) |
| 2 — Luật | Cùng dữ liệu + phiên bản → cùng quyết định (replay); bảng FSM kiểm **mọi cặp** trạng thái × sự kiện; control không lan quán | ✅ 22/10: FSM 335 cặp **0 lệch** đặc tả (33 lệch cũ sửa theo đặc tả — chủ quán duyệt); store ghi trạng thái qua `caseFlow`/`taskStart`/`transition` (lưu `statusEvents`); chạy lại = quyết định runtime; quán gg02 dùng đúng bảng dùng chung (`E.tableName`) |
| 3 — Học mức thường | Baseline theo món/quán (gộp tầng, mục 4) với khoảng bất định; kiểm ngoài thời gian học; tách «đang học» / «đủ tin cậy» | ✅ runtime + mô phỏng (mục B3–B6 bên dưới) · ⛔ dữ liệu thật: 0 món «đủ tin cậy» (chưa có mốc cân M0/M2) |
| 4 — Suy luận (giả thuyết kiểm được) | Xác suất cho 4 nhóm giả thuyết kiểm được, đối chiếu nhãn M3/vật mẫu/kiểm bì; Brier/reliability báo kèm cỡ mẫu; phần dư không in % | ✅ runtime + mô phỏng: 7 giả thuyết kiểm được, % chỉ in sau hiệu chỉnh Brier ngoài mẫu · ⛔ dữ liệu thật: 0 nhãn |
| 5 — Vòng kín | Event → quyết định → POS ACK → đo → đối soát → **tự hạ mức** theo tiêu chí đã kiểm định; mất ACK/retry phục hồi | ✅ runtime + mô phỏng: tự hạ một bậc chỉ khi chế độ tự động + tham số đã hiệu chuẩn; tái diễn → M3 · ⛔ dữ liệu thật: chưa có chu kỳ nâng → hạ |
| 6 — Tự hiệu chuẩn/tự kiểm toán | Mọi lỗi cài sẵn (danh sách B0 + drift + baseline học hao hụt) bị bộ kiểm phát hiện; hiệu chuẩn có phiên bản/giới hạn/quay lui tự động; báo cáo công bố số sai, khoản chưa khớp, độ phủ | ✅ runtime + mô phỏng: hiệu chuẩn tuần ±5% có phiên bản/quay lui, kiểm toán mô hình, công cụ chứng nhận · ⛔ dữ liệu thật: chưa có lượt học |

**Chứng nhận hiện tại** (`node tools/automation/engine2_certify.js <bản kiểm toán kho>`): **năng lực cấp 6/6 trên mô phỏng** (hạt giống chưa dùng) · **chứng minh trên dữ liệu thật gg01: cấp 2/6** — cấp 3–6 «chưa đủ dữ liệu thật» vì Engine 2 chưa chạy ở quán (không sinh mốc cân, nhãn, lượt học). Công cụ không bao giờ báo đạt khi thiếu mẫu.

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

**B2 — Công cụ xuất manifest đủ + replay 30 ngày (✅ 22/10 trên dữ liệu thật 52 ngày; cấp 1 + cấp 2 đạt).**
- Xuất theo mục 7.2 đặc tả: raw stock/prep ledger có ID, tem có `containerId`, RT `active_units`, ca/role lịch sử, lịch sử giá/bì/công thức, điểm cắt FS–RT. Thao tác bấm rõ, có giới hạn, không quét nền POS.
- Replay hai đường (tương thích / chính sách mới). Không đủ nguồn → `BLOCKED_DATA`, không «PASS dự kiến».
- Cửa: cấp 1–2 family 1 đạt → **chứng nhận cấp 2**.

**Chủ quán 22/10 — mục tiêu cấp 6, «lường trước»:** dựng bộ MÔ PHỎNG nhiều kịch bản có sự thật biết trước (kể cả case chưa từng xảy ra ở quán), hiệu chuẩn ban đầu trên đó; tham số đánh dấu «hiệu chuẩn mô phỏng» — điểm xuất phát, cấp 6 tự kiểm / chỉnh / quay lui khi có số liệu thật.

**Thứ tự đổi (chủ quán duyệt 22/10): B2 làm TRƯỚC B1** — xuất lịch sử thật để chạy lại/kiểm toán thay phần lớn thời gian đối chiếu thử; dữ liệu học cấp 3–6 chỉ sinh khi chạy tự động (đối chiếu thử không giao việc cân nên gần như không sinh mẫu).

**Kết quả B2 phần 1 — công cụ xuất (22/10, chưa deploy):**
- `unit_engine2_export_v1.js` (`UnitEngine2Export.build`): chỉ đọc, chạy khi bấm, đọc theo trang (con trỏ snapshot) có giới hạn; tối đa 62 ngày, một điểm bán. Lấy: danh mục + lịch sử giá + dụng cụ/bì + refill_rules; theo businessDate: stock/prep_transactions, prep_batches, stock_containers, stock_anomalies, daily_closings/openings, shift_segments, duty_cases; **tem liên quan** = còn sống + có dòng sổ trong kỳ (cả tem nhận trước kỳ) + nhận trong kỳ; ca từ 14 giờ trước ngày đầu; toàn bộ dữ liệu Engine 2 (12 bảng con); RT `active_units`. Không gồm bill/khách.
- File: `{manifest, docs:{tên_bảng_vật_lý/id: doc}, rt}`. Manifest: phiên bản, khoảng ngày, giờ máy chủ lệch, lúc chụp RT, số dòng / chạm giới hạn / thiếu / lỗi từng phần, **thao tác dở** (khoá cân, việc chờ, lượt cân xếp hàng, khoá chế biến RT, huỷ chờ), SHA-256 từng phần + tổng, ghi chú «FS và RT không phải ảnh chụp nguyên tử». Timestamp → ISO.
- Quản lý › Trích xuất dữ liệu: thẻ thứ ba **«Bản kiểm toán kho (Engine 2)»** (`runExportKho`); hai bản gọn / đầy đủ giữ nguyên. Tên bảng qua `GieoData.collFor` / `fsName` / `rtPath` (bảng dùng chung `price_history`, `prep_vessels` không hậu tố quán — test đối chiếu `data_access`).
- **Trang riêng `kiem_toan_kho.html`** (chủ quán 22/10: app đang chạy CHƯA có Engine 2 — không deploy lại quanlygieo): chỉ cần trang này + `unit_engine2_export_v1.js`; không nạp data_access / Unit Engine (tên bảng theo quy tắc data_access, test khoá), cùng tài khoản đăng nhập Quản lý, chỉ đọc. Có trong cả 3 bộ deploy.
- `tools/automation/engine2_audit.js` đọc thẳng file này; manifest chưa đủ → CHƯA ĐẠT.
- Test `tests/unit_engine2_export.test.js` (xuất → kiểm toán 0/0, CLI, mã kiểm ổn định khi đổi cỡ trang, chạm giới hạn, lỗi một phần, thao tác dở, chặn 62 ngày, Timestamp, tên bảng gg02) + e2e trình duyệt `tools/ql_giao_dien/e2e_kiem_toan_kho.js` (PC + điện thoại: bấm → tải file → kiểm toán ĐẠT, không ghi, không lỗi JS).
- **Kết quả trên dữ liệu thật gg01 1/9–22/10 (52 ngày, 17.506 bản ghi, `complete`, mã kiểm `181366a9…`):**
  - Kiểm toán sổ gốc: ĐẠT 0/0 — ít ý nghĩa vì chưa có hồ sơ Engine 2.
  - Bộ đếm `stock_containers_ref.missing` (1.317) của export v1 là NHIỄU (đếm cả referenceId = mã bill của CONSUMPTION); mọi tem trong `fifoAllocations` và mọi tem WASTE trỏ tới đều có trong file. Sửa ở export v2 khi có đợt deploy khác.
  - **Ca không ghi chức năng: 80/80** (53 thiếu trường, 27 rỗng) → luật cũ «phải có 'barista'» làm MỌI case kẹt. **Chủ quán chốt 22/10: ca không ghi chức năng (thiếu / rỗng) = pha chế; có ghi thì theo đúng chức năng** — `E.isBarista` (lõi, store bàn giao/tìm ca, worker, POS nhận việc), bộ kiểm toán viết lại độc lập; phân bổ ghi `roleBasis: recorded | not_recorded`. Sửa thẳng v1 vì Engine 2 v1 CHƯA deploy (chỉ trang trích xuất đã deploy).
  - Dữ liệu ca đúng thực tế (chủ quán xác nhận): 10/10–22/10 mỗi ngày một người; «4 pha chế» ở case 300 g chỉ là ví dụ thiết kế.
  - Báo hết engine cũ ghi mã NGẪU NHIÊN (chỉ 3/47 dạng `finish_<tem>_WASTE`) → Engine 2 P0 `bootstrap`/`finish` chỉ nhận mã mới sẽ BỎ SÓT lịch sử (công cụ chạy lại nhận diện thêm theo ghi chú «Báo hết» / giờ kết thúc tem).
- **Đường 2 (chính sách mới) — `tools/automation/engine2_replay.js`**: 46/46 báo hết chạy lại được (38 chia đều, **8 quản lý đã gán tay → giữ nguyên**; bản đầu đếm 47 vì bắt nhầm 1 huỷ tem quét mã trùng giờ đóng tem — đã sửa + test), bộ kiểm toán độc lập trên hồ sơ chạy lại ĐẠT 0/0; test `tests/unit_engine2_replay.test.js` (trùng quyết định runtime; dữ liệu kiểu cũ). Báo cáo có tên nhân viên → chỉ gửi chủ quán, không commit.
  - **Định giá — chủ quán chốt (b) 22/10: giữ «chưa đủ giá»** khi không có lịch sử giá hiệu lực tới ngày đó; không lấy giá hiện tại làm giá lịch sử (đặc tả 2.3). Lịch sử giá tự đầy dần theo phiếu nhập. Báo cáo chạy lại chỉ hiện giá tạm theo sổ lãi/lỗ để tham khảo (46/46 hiện chưa đủ giá; tham khảo 517.288đ).
- **Đường 1 (tương thích) — `tools/automation/engine2_compat.js`** (test `tests/unit_engine2_compat.test.js`, định giá đối chiếu mã nguồn `lai_lo.v6.js`): trên 52 ngày thật
  - **Hao hụt Engine 2 = sổ lãi/lỗ: 1.325.439đ cả hai, 0/50 ngày lệch.** Phân loại: BTP 744.457đ (115 dòng, family sau) · báo hết 517.288đ (46, P0) · khai huỷ không tem 42.750đ (1, A2) · huỷ tem quét 11.333đ (1, A2) · lệch chế biến NL 7.538đ (8, family BTP) · cân ca 2.073đ (1).
  - **Tem = sự thật: 38/38 NL theo tem khớp** (công thức `_ueRecomputeCurrentStock` v21: tem nguyên trừ tem đã có RT + RT bỏ chờ huỷ + mở thiếu RT + bù `_ueRtStale`).
  - Phát hiện vốn có: sổ lãi/lỗ không lọc WASTE `voided` (dữ liệu này không có dòng nào) — công cụ ghi thành phát hiện, test giữ. Không sửa sổ lãi/lỗ (ngoài phạm vi).
  - (Phép cộng thô «233 tem lệch» lượt trước là SAI phương pháp — bỏ.)
- **Trạng thái cấp — family NL có tem, gg01, 1/9–22/10:** cấp 1 **ĐẠT** (kiểm toán độc lập 0/0 trên hồ sơ chạy lại; hao hụt + tồn khớp sổ). Cấp 2 **ĐẠT (22/10)**: FSM khớp đặc tả, store đi qua máy trạng thái (việc bị lượt cân khác phủ → `superseded`, từ chối sau khi bắt đầu → `retry_wait`; POS đóng ca chấp nhận `superseded`), lỗi worker tên bảng dùng chung ở quán ≠ gg01 đã sửa ở lõi (`E.tableName`, store mặc định). P0 `finish`/`bootstrap` chỉ nhận mã `finish_<tem>_WASTE` — đủ cho dữ liệu từ nay.
- **Phát hiện ngoài phạm vi (chưa sửa — chờ quyết):** worker `functions/automation/engine2.js` tạo store Engine 2 **không truyền hàm đặt tên bảng** → ở quán ≠ gg01 đọc `prep_vessels_gieogieo__ggNN` / `price_history_gieogieo__ggNN` (không tồn tại, đó là bảng dùng chung) → mọi lượt cân bị từ chối «Dụng cụ hoặc bì đã thay đổi», giá thành «chưa đủ giá». POS / quanlygieo2 đúng (dùng `GieoData.collFor`). gg01 không bị.

**Kết quả B3–B6 (22/10, chưa deploy) — năng lực cấp 3–6 + MÔ PHỎNG «lường trước» (chủ quán yêu cầu):**
- **Dữ liệu học** `unit_engine2_obs_v1.js`: mỗi tem → dãy mốc (mở tem = dung tích, cân ca cũ `sw_*`, lượt cân Engine 2, báo hết) → «quan sát khoảng» (used = Σ fifoAllocations của tem, loss = sổ − số đo, số lần cân, ngữ cảnh). Bỏ có lý do: dùng nguyên gói, đối chiếu chế biến (family BTP), huỷ quét mã, tem huỷ; nợ FIFO (`unit_engine_debt/carried` hoặc sổ âm) tách nhánh kế toán, không học. Runtime ghi quan sát CÙNG transaction với quyết định báo hết / lượt cân (`obs/*`).
- **Cấp 3** `unit_engine2_learn_v1.js` `baseline`: gộp tầng món → nhóm cùng đơn vị (empirical Bayes), median/MAD bền, tách nhiễu quy trình khỏi sai số cân (sai số cân học theo nhóm đơn vị, chuẩn hoá theo số lần cân), tiên nghiệm khai báo khi < 3 món; trần nhóm (μ₀ + 3τ) chống «học thuộc» thất thoát — chỉ mức đã xác minh mới vượt trần; mẫu đã báo bất thường không vào học; «đủ tin cậy» cần ≥ 20 mốc CÓ THÔNG TIN / 14 ngày; món mới «biết mình chưa biết» (nới ngưỡng `coldStartFactor`, `measUnsureFactor`). CUSUM cộng dồn thiếu nhỏ (A8).
- **Cấp 4** `hypotheses`: 7 giả thuyết kiểm được (sai bì, tỷ trọng, định mức, tiêu hao không khai, đồng bộ sổ, nhận hàng sai dung tích, cân lệch hệ số) + thất thoát chưa khai = PHẦN DƯ (không %, không quy người). Dấu hiệu ngữ cảnh là bằng chứng có khả năng (Sổ lệch, nợ FIFO, mở nhiều mã). Nhận hàng sai phải LẶP ở tem mở liền trước và bị loại khi khoảng cân → cân cũng thiếu rõ. Phép đo tiếp theo chỉ là phép đo CHẨN ĐOÁN (kiểm bì, đo tỷ trọng, cân phần định mức, rà mã đang mở, cân tem nguyên, cân vật mẫu) chọn theo thông tin thu được × giá trị rủi ro ÷ phút công; M2 là kiểm soát, không phải chẩn đoán. Kết quả phép đo → NHÃN (cùng ngưỡng ở runtime và mô phỏng). **Xác suất chỉ in sau hiệu chỉnh Platt theo nhãn của chính quán, khi ≥ 30 nhãn và Brier NGOÀI MẪU ≤ 0,2** (`fitCalibration` — mỗi nhãn chấm bằng ánh xạ học từ nhãn trước nó).
- **Cấp 5** `controlAdvice`: thiếu vượt mức thường → M2; tái diễn SAU lúc nâng → M3 (người khác cân, cân mù; không đếm hai lần chính sự kiện đã nâng); hạ một bậc khi đủ mốc sạch đã đo (5 mốc / 3 ngày / cách 7 ngày / lượng dùng ≥ 2 tem), không dưới sàn quản lý, không khi còn việc dở. Tự hạ ở runtime chỉ khi chế độ tự động + tham số «calibrated». Cân ngẫu nhiên M0 theo ngân sách (≤ 2 món/ngày, món giá trị cao lâu chưa cân).
- **Cấp 6**: hiệu chuẩn có rào (`calibrate`: mô phỏng = đánh giá VÒNG KÍN từng ứng viên; tại quán = ±5%/7 ngày, chỉ nhận khi tốt hơn trên phần thời gian chưa học và bỏ sót không tăng), mỗi lần nhận ghi `model_versions/*` (dataHash, cửa sổ, số trước/sau, bước, bản cha); quay lui tự động khi số thật kém hơn lúc kiểm định (`shouldRollback`); drift CUSUM, chống hấp thụ baseline, món ngoại lai; kiểm toán mô hình độc lập (`auditModels`: bản nhận tệ hơn, bước vượt biên, thiếu căn cứ).
- **Runtime** `learnDay` (worker `functions/automation/engine2.js`, 1 lần/ngày/quán): chấm quan sát mới theo thời gian, nhãn từ `evidence/*`, giả thuyết → việc chẩn đoán (`createTask`, POS `submitEvidence` qua máy trạng thái), M3, M0, hạ mức, hiệu chuẩn tuần + quay lui, ghi `models/current`. QL2 › Engine 2 › **«Học & tự hiệu chuẩn»**: đọc 1 bản tóm tắt + 30 quan sát khi bấm — mức thường từng NL (khoảng, trạng thái, M0–M3), nhãn/hiệu chỉnh từng giả thuyết, bất thường gần đây (xếp hạng; % chỉ khi đã hiệu chỉnh; phần dư không quy nguyên nhân), kiểm toán mô hình.
- **Mô phỏng có sự thật biết trước** `tools/automation/engine2_sim.js`: 7 NL mẫu (g / ml / cái), VÒNG KÍN (hệ thống nâng mức → cân bàn giao, chọn phép đo → hôm sau đo → nhãn + sửa tại quầy, baseline học lại mỗi ngày, M0 ngẫu nhiên). **24 kịch bản lường trước** — yên tĩnh; thất thoát kéo dài / một người / sau khi hạ mức; sai bì; sai tỷ trọng; định mức thiếu giữa kỳ / từ đầu; tiêu hao không khai; mở nhiều mã; lỗi đồng bộ; drift mùa; mẻ đổ một lần; đổi nhà cung cấp; món ít bán; nhiều lỗi cùng lúc; cân nhiễu; thiếu nhỏ lặp lại; DƯ hàng; nhận hàng sai dung tích; cân lệch hệ số; nhân viên mới quá tay; cuối tuần đông; bán đột biến. Mỗi kịch bản có tiêu chí đạt riêng (nhận đúng giả thuyết, sửa được, không tăng mức vì dư, bỏ sót / báo sai trong ngưỡng…).
- **Hiệu chuẩn khởi tạo** `node tools/automation/engine2_sim.js --calibrate` → `unit_engine2_params_v1.js` (SINH TỰ ĐỘNG, không sửa tay): huấn luyện hạt giống 1–6, nghiệm thu 101–110; tham số mang nhãn `calibrated_simulation` = ĐIỂM XUẤT PHÁT, quán thật tự chỉnh ±5%/7 ngày và quay lui.
- **Chứng nhận** `tools/automation/engine2_certify.js [bản kiểm toán kho] [--out thư mục]`: chấm từng cấp trên hai mặt (mô phỏng hạt giống chưa dùng 201–203 / dữ liệu thật); cấp chỉ tính khi đạt liên tục từ cấp 1; thiếu mẫu thật → «chưa đủ dữ liệu thật». {{KET_QUA_CHUNG_NHAN}}
- Sửa trong lượt: nhãn cộng dồn qua ngày ở `learnDay` mất `brierSum` (bản ghi chỉ lưu Brier) → nay lưu `brierSum` + cặp (p, nhãn), đọc được bản cũ.
- Test: `unit_engine2_learn.test.js`, `unit_engine2_runtime.test.js`, `unit_engine2_sim.test.js` (tham số có căn cứ + nghiệm thu đạt + đúng thư viện kịch bản; chứng nhận hạt giống 301: cấp 6 mô phỏng, dữ liệu thật «chưa đủ»), e2e QL2 `tools/automation/role_full_e2e.js` (màn «Học & tự hiệu chuẩn»).
- **Giới hạn trung thực:** mô phỏng chứng minh NĂNG LỰC trước các tình huống đã lường; chứng minh cấp 3–6 trên quán cần Engine 2 chạy tự động ≥ 14 ngày có cân (cấp 3), ≥ 30 nhãn mỗi giả thuyết (cấp 4 — vài tuần đến vài tháng tuỳ tần suất lỗi), ít nhất một chu kỳ nâng → hạ (cấp 5) và một lượt hiệu chuẩn tuần có phiên bản (cấp 6). Lấy bản kiểm toán kho định kỳ rồi chạy công cụ chứng nhận.

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
