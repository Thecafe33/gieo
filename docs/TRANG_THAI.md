# Hiện trạng dự án — cập nhật 04/10/2026

Đọc file này **sau CLAUDE.md**, trước khi làm bất cứ việc gì. Nhánh làm việc: `Phan-tach-unit-engine`.

## 1. Bản hiện hành

| Thành phần | Bản | Ghi chú |
|---|---|---|
| Engine kho | `unit_engine.v18.js` (01/10/2026) | v1–v17 giữ để quay lui — **không sửa, không xoá** (cache immutable). Danh sách: `tools/engine_releases.txt` |
| Lớp đường dẫn | `data_access.v4.js` (07/10, chưa deploy; v1 đã deploy, v2, v3 — giữ quay lui) | đa cửa hàng Bước 1 + 2 + 3 (withStore cho Xem tất cả) — 2 app nạp trước engine; danh mục NL/BTP theo quán + đồng bộ; đăng nhập cửa hàng; kiểm bằng `node tools/check_paths.js` |
| App bán hàng | `posgieo.html` | trỏ v18 |
| App quản lý | `quanlygieo.html` | trỏ v18 |
| Chế độ thử | `che_do_thu.v1.js` + `posgieo_thu.html`, `quanlygieo_thu.html` | sinh lại bằng `node tools/tao_ban_thu.js .` sau **mỗi** lần sửa HTML |
| Test | `sh tests/run_all.sh` | 50 file `tests/*.test.js`, chỉ cần `node` |

**Trạng thái deploy (chủ dự án xác nhận 04/10/2026): v18 ĐÃ DEPLOY**, chạy ổn ở cửa hàng 1 được **1–3 tuần**. Đa cửa hàng cần ≥ vài tuần ổn định (`docs/KE_HOACH_DA_CUA_HANG.md` mục 0) → theo dõi thêm rồi mới làm M0. Chủ dự án tự deploy; phiên mới hỏi lại trước việc lớn nếu đã qua lâu.

## 2. Đã làm (theo thứ tự)

- **28/09** — K0, F1–F6, E0 → E6: tách Unit Engine dùng chung, chế độ thử, `storeId` cố định `'gg01'`, giờ máy chủ. Chi tiết: `docs/luu_tru/NHAT_KY_PHIEN_28-09-2026.md`.
- **30/09–01/10** — Engine v2 → v18:
  - v2–v3: bán trong lúc NL khoá cân, cân ra nhiều hơn sổ.
  - v4–v5: nhóm `duty` — quy trách nhiệm lệch/hao hụt theo ca, tóm tắt ngày (`docs/KE_HOACH_TRACH_NHIEM_CA.md`).
  - v6–v17: 7 vòng rà bug (lỗi 1–64), test `tests/phan_bien_v*.test.js`; mô tả cho người rà: `docs/luu_tru/BAN_MO_TA_FIX_DE_TIM_BUG.md`.
  - v18: tự chốt NL khi đối chiếu mẻ kẹt (phương án A), "Hoàn tiếp" cho mẻ huỷ chưa hoàn xong.
  - Lương/OT theo mốc thời gian (`payHistory`).
- **01/10** — Quản lý: nhãn "Chuyển khoản - xác nhận tay"; POS: khoá "Nhận hàng tự do" khi còn đơn chờ nhận; POS Nấu chế biến: lô kẹt `finishing` có nút "Tiếp tục lưu".
- **02/10** — NL "nấu dùng nguyên gói" (cờ `prepWholePack` trên `inventory_items`): quét gói nguyên + báo hết, không cân.
- **03/10** — Target nhân viên (động lực): `docs/TARGET_NHAN_VIEN.md`.
- **04/10** — Lương dự đoán theo lịch bỏ lịch sót của nhân viên đã nghỉ; hoà vốn của ngày: chi phí biến đổi đã chi nằm trong phần cần đắp.

## 3. Còn mở (chưa làm — không tự làm khi chưa được giao)

| Việc | Ghi chú |
|---|---|
| Màn **Doanh thu** của POS vẫn hiện số tiền | Chủ quán chưa quyết có ẩn không (pill target chỉ hiện %) |
| **Tối ưu lượt đọc T0 → T6** (vượt 50K lượt đọc ngày 04/10) | `docs/KE_HOACH_TOI_UU_DOC.md` — ưu tiên hơn đa cửa hàng. T0: 4/6 index đã có từ trước (không phải nguyên nhân), còn 2 index `_histLoad`. T1: công cụ `tools/dem_luot_doc.js` + **bản đo** `posgieo_dem.html` / `quanlygieo_dem.html` (sinh bằng `tools/tao_ban_dem.js`, dữ liệu thật, nút 📊) — đã đo 05/10 (QL 22.880 lượt/13 phút, 83% sổ gốc; POS ~990 lượt `customers` mỗi lần mở app). **T3 + T2 đã làm 05/10 (chưa deploy)** — xem mục T2/T3 của kế hoạch. Bản đo đã gỡ khỏi repo — xoá `*_dem.html`, `dem_luot_doc.v1.js` khỏi thư mục deploy |
| **Đa cửa hàng Bước 1 — ĐÃ LÀM 05/10 (chưa deploy)** | `data_access.v1.js` + `tools/check_paths.js` + test `da_cua_hang_b1`; quán hiện tại giữ nguyên mọi đường dẫn. Deploy cùng T2/T3 được (đều không đổi hành vi). |
| **Đa cửa hàng Bước 2 — ĐÃ DEPLOY 06/10** | Danh mục NL/BTP riêng mỗi quán + Quản lý tự đồng bộ (engine giữ v18); POS màn **đăng nhập cửa hàng** (mã 6 ký tự, nhớ máy, sidebar tên + địa chỉ + đăng xuất); Quản lý ▸ Cấu hình ▸ **Cửa hàng**; mã CK `GG02…`; dọn CK chỉ xét khoá `GG…`. Test `da_cua_hang_b2`. **Deploy ngoài giờ bán — sau deploy POS dừng ở màn nhập mã tới khi tạo hồ sơ GG01 ở Quản lý** (runbook: kế hoạch mục 5 Bước 2). Còn trước Bước 4: nhãn bill mã quán, `storeTags` nhân viên |
| **Đa cửa hàng Bước 3 — ĐÃ LÀM phần chính 06/10 (chưa deploy)** | Quản lý xem từng quán / Xem tất cả (Hôm nay tổng hợp: doanh thu, việc cần xử lý gắn nhãn quán, tồn so sánh — chỉ xem); đơn đặt hàng chọn cửa hàng nhận; `data_access.v2.js`. Thêm 06/10: Báo cáo · Tất cả cửa hàng (tuần / tháng), bản thử POS "Thử cửa hàng khác", `tools/index_quan_moi.js` (6 index cho quán mới). **Bước 4 = runbook** ở kế hoạch mục 5 — không cần sửa code thêm để mở quán 2 |
| **Mở két bằng tay trên POS — ĐÃ LÀM 06/10 (chưa deploy)** | Nút két ở thanh trên màn bán hàng → chọn lý do + PIN người mở → gửi lệnh mở két qua máy in Bill (cùng lệnh mở két khi thanh toán) → ghi `cash_drawer_logs_gieogieo` (riêng từng quán, đăng ký ở `data_access.v3.js`). Quản lý: Tiền mặt ▸ "Mở két ngoài bán hàng" theo ngày + dòng vàng ở Hôm nay · Sức khoẻ quán. Mở két khi thanh toán tiền mặt vẫn tự động, không ghi nhật ký này |
| **Quản lý khi có từ 2 quán — ĐÃ LÀM 07/10 (chưa deploy)** | Lương cứng chỉ tính cho **quán chính** của nhân viên (`homeStore`, thiếu = GG01; ô chọn ở Nhân viên khi có ≥ 2 quán) — trước đây quán nào cũng cộng đủ, Tất cả cửa hàng gấp đôi. Thưởng / phạt / lương thực nhận (`payroll_month_adjustments`) riêng từng quán (`data_access.v4.js`, GG01 giữ sổ cũ). Lương / Tổng kết tháng chỉ hiện nhân viên có ca / lương ở quán đang xem. Mục tiêu ghi rõ phần chung / riêng quán. Kiểm toán gắn nhãn quán. Trích xuất dữ liệu: tên file + nội dung có mã quán. Tạo quán mới chép thêm ngưỡng tài chính. Khoá "Dựng lại hồ sơ thói quen khách" khi có ≥ 2 quán (ghi đè hồ sơ dùng chung). Một quán: không đổi gì. Chưa làm: Khách hàng · Tất cả cửa hàng. |
| Đa cửa hàng Bước 0 → 5 | `docs/KE_HOACH_DA_CUA_HANG.md` — **viết lại 05/10**: một project, quán hiện tại giữ nguyên chỗ cũ (không chuyển dữ liệu), quán mới collection `…__{storeId}`; Bước 1 = lớp đường dẫn `data_access.v1.js` + engine v19 + chốt chặn |
| O13 — mã nguồn webhook Cloud Run | cần cho M3 |
| `tools/site_files.txt` (danh sách file của Gieo Gieo trên site Hosting dùng chung) | chưa có — làm ở Bước 1 của kế hoạch đa cửa hàng |
| 2 câu hỏi nhỏ còn treo từ 28/09 | xoá dòng ADJUSTMENT kiểu cũ ở Quản lý; nhãn `voucherUsed = __free_stamp__…` của bill ly tem — `docs/luu_tru/NHAT_KY_PHIEN_28-09-2026.md` mục 13 |
| Việc dọn sau deploy (chủ dự án) | xoá node RT `session_display_gieogieo` (K0); dọn `myGifts.__free_stamp__*` bằng `tools/don_myGifts_free_stamp.js` — cùng file nhật ký mục 14 bước 8 |

## 4. Bản đồ tài liệu

| File | Dùng khi |
|---|---|
| `CLAUDE.md` | luôn — quy tắc làm việc |
| `docs/TRANG_THAI.md` | luôn — file này |
| `docs/UNIT_ENGINE.md` | sửa kho / engine (API, bất biến B1–B15, lịch sử v1–v18) |
| `docs/KE_HOACH_TOI_UU_DOC.md` | tối ưu lượt đọc Firestore / xử lý trùng (N1–N3, T0–T6) |
| `docs/KE_HOACH_DA_CUA_HANG.md` | làm đa cửa hàng |
| `docs/KE_HOACH_UNIT_ENGINE_DA_CUA_HANG.md` | kế hoạch gốc (mục 2.1 = bất biến; mục 7–9 đa cửa hàng là hướng cũ — đã thay bằng `KE_HOACH_DA_CUA_HANG.md` 05/10) |
| `docs/KE_HOACH_TRACH_NHIEM_CA.md` | nhóm `duty` (quy trách nhiệm theo ca) |
| `docs/CHE_DO_THU.md` | chế độ thử `_thu` |
| `docs/TARGET_NHAN_VIEN.md` | target nhân viên |
| `docs/BANG_GHI_ENGINE.md` | bảng hàm ghi dữ liệu kho (tự sinh) |
| `docs/luu_tru/` | tài liệu cũ, chỉ để tra cứu — **không** làm theo |

## 5. Quy trình mỗi lần sửa (tóm tắt — chi tiết ở CLAUDE.md)

1. Phản biện → báo chủ dự án → sửa. Đổi hành vi nghiệp vụ → hỏi trước.
2. `sh tests/run_all.sh` · tách `<script>` + `node --check` · `node tools/check_boundaries.js` · `npm run inventory` (xong xoá `inv_ast.json`).
3. `node tools/tao_ban_thu.js .` → predeploy trên thư mục giả lập (bản sao các file + `firebase.json` dựng từ `tools/firebase_headers_gieogieo.json`): `sh tools/predeploy_check.sh <thư mục>` phải ra "ĐƯỢC DEPLOY".
4. Commit (kèm dòng Co-Authored-By) → push `Phan-tach-unit-engine`. Không tạo PR nếu không được yêu cầu.
5. Gửi file cho chủ dự án: **📤 UPLOAD** (HTML + `_thu` + engine mới nếu có) / **💾 CHỈ LƯU, KHÔNG UPLOAD** (test, docs).
6. Claude **không deploy**.
