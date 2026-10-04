# Hiện trạng dự án — cập nhật 04/10/2026

Đọc file này **sau CLAUDE.md**, trước khi làm bất cứ việc gì. Nhánh làm việc: `Phan-tach-unit-engine`.

## 1. Bản hiện hành

| Thành phần | Bản | Ghi chú |
|---|---|---|
| Engine kho | `unit_engine.v18.js` (01/10/2026) | v1–v17 giữ để quay lui — **không sửa, không xoá** (cache immutable). Danh sách: `tools/engine_releases.txt` |
| App bán hàng | `posgieo.html` | trỏ v18 |
| App quản lý | `quanlygieo.html` | trỏ v18 |
| Chế độ thử | `che_do_thu.v1.js` + `posgieo_thu.html`, `quanlygieo_thu.html` | sinh lại bằng `node tools/tao_ban_thu.js .` sau **mỗi** lần sửa HTML |
| Test | `sh tests/run_all.sh` | 50 file `tests/*.test.js`, chỉ cần `node` |

**Trạng thái deploy: CHƯA XÁC NHẬN.** Chủ dự án tự deploy; phiên mới hỏi chủ dự án bản nào đang chạy ở quán và đã chạy ổn bao lâu trước khi bắt đầu việc lớn (đa cửa hàng cần ≥ vài tuần ổn định — `docs/KE_HOACH_DA_CUA_HANG.md` mục 0).

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
| Đa cửa hàng M0 → M6 | `docs/KE_HOACH_DA_CUA_HANG.md` (đã cập nhật theo hiện trạng 04/10) |
| O13 — mã nguồn webhook Cloud Run | cần cho M3 |
| `tools/site_files.txt` (danh sách file của Gieo Gieo trên site Hosting dùng chung) | chưa có — làm ở M0 |
| 2 câu hỏi nhỏ còn treo từ 28/09 | xoá dòng ADJUSTMENT kiểu cũ ở Quản lý; nhãn `voucherUsed = __free_stamp__…` của bill ly tem — `docs/luu_tru/NHAT_KY_PHIEN_28-09-2026.md` mục 13 |
| Việc dọn sau deploy (chủ dự án) | xoá node RT `session_display_gieogieo` (K0); dọn `myGifts.__free_stamp__*` bằng `tools/don_myGifts_free_stamp.js` — cùng file nhật ký mục 14 bước 8 |

## 4. Bản đồ tài liệu

| File | Dùng khi |
|---|---|
| `CLAUDE.md` | luôn — quy tắc làm việc |
| `docs/TRANG_THAI.md` | luôn — file này |
| `docs/UNIT_ENGINE.md` | sửa kho / engine (API, bất biến B1–B15, lịch sử v1–v18) |
| `docs/KE_HOACH_DA_CUA_HANG.md` | làm đa cửa hàng |
| `docs/KE_HOACH_UNIT_ENGINE_DA_CUA_HANG.md` | kế hoạch gốc (mục 2.1 = bất biến; mục 7–9 = đa cửa hàng chi tiết) |
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
