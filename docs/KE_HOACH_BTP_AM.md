# BTP âm — hết hạn lúc bán & dùng loại thay thế (kế hoạch 23/10/2026)

Chủ quán chốt 23/10. Mục tiêu: quản lý không phải xử lý thông báo «BTP âm» từ ngày áp dụng.

## Hiện trạng (đã rà)

- Bán hàng trừ FIFO vào lô kể cả lô đã quá hạn — POS không hỏi; lô hết hạn chỉ bị «bỏ hết» lúc đếm cuối ngày. Gia hạn chỉ có ở quanlygieo (`prepBatchExtendExpiryCore`).
- Cấu hình «được phép dùng thay» đã có ở quanlygieo › Kho › BTP âm (`substitutes = [{kind, id, ratio}]` trên BTP / NL). Kết ca POS hỏi «đã dùng loại nào để bù?» (`prepShortageAskIfNeeded` / `prepShortageBuild`) → `prep_shortage_recons_gieogieo` `substitution_pending` → quản lý bấm xác nhận (`_btpAmApplySubstitution`).

## Chủ quán chốt

1. ~~Lúc bán, lô BTP sắp trừ đã hết hạn → popup ở POS~~ — **chủ quán bỏ 23/10 (khách phải chờ)**. Thay bằng: **mở ca** kiểm mọi lô BTP / mã NL đang mở **sẽ hết hạn trong hôm nay** hoặc đã quá hạn → «Còn dùng được» (PIN, gia hạn thêm 24 giờ tính từ hạn cũ — đã quá hạn thì từ bây giờ — + in tem gia hạn, không giới hạn số lần) / «Bỏ đi». Loại **hết hạn cuối ngày** (`shelfLifeType:'endOfDay'`) **không được gia hạn**: lô hôm nay không hỏi, lô ngày cũ chỉ «Bỏ đi». Trong ngày: chuông sẵn có nhắc lô còn ≤ 30 phút / đã quá hạn (không chặn). Check-out: còn lô đã quá hạn → xử lý rồi mới check-out.
2. Bán BTP lúc không còn lô → nhân viên có ca lúc đó **phải trả lời khi check-out** (không trả lời không check-out được): đã dùng loại nào thay (theo cấu hình), nấu mẻ mới kịp, hay không dùng gì. Cốt trà / cốt trà sữa không cấu hình thay thế → không có lựa chọn thay.
3. Bỏ bước quản lý xác nhận: hệ thống tự xác nhận khi loại thay thế thiếu cuối ngày **khớp lượng cần bù trong ±10%, tối đa 30 g** (nhân viên còn nếm thử). Không khớp / «không dùng gì» → hao hụt theo luật thường + thông báo để biết.

## Các bước

| # | Nội dung |
|---|---|
| A1 (cũ, đã bỏ 23/10) | POS `onCheckoutClick` → `prepExpiryGateBeforePay`: món trong giỏ cần BTP → đọc RT lô đang mở của BTP đó (sự thật số còn), lô sắp bị trừ (FIFO) đã quá hạn → popup. Hàm thuần `prepExpiryPlan` (test). Không đọc Firestore trừ lô chưa có trong bộ nhớ. |
| A2 | «Vẫn còn dùng được» (PIN pha chế): `UnitEngine.batches.annotate` `expiresAt = bây giờ + 24h` + `expiryExtensions` (ai, lúc nào, từ → tới; kho v21 thêm trường chú thích) → in tem lô có dòng «GIA HẠN lần N». «Hủy» (PIN): `UnitEngine.prep.discardByLots` cả phần còn của lô, lý do «Hết hạn — nhân viên xác nhận không dùng được lúc bán». |
| B1 | POS `_doCheckOutImpl` → `prepUntrackedAskOnCheckOut`: BTP có `untrackedPendingDelta < 0` (1 truy vấn, thường 0 kết quả) → dòng bán không lô trong khoảng ca (hàm thuần `prepUntrackedSales`) → chưa trả lời thì hiện câu hỏi, lưu `prep_shortage_recons_gieogieo/{ngày}_{prepId}.checkoutAnswers.{shiftId}` rồi mới check-out. |
| B2 | Kết ca `prepShortageAskIfNeeded`: câu đã trả lời lúc check-out điền sẵn; trả lời đủ thì không hỏi lại. |
| C1 | Engine 2 `subReview` (trigger: thông báo `prep_shortage_recon` mới + quét hằng ngày): `substitution_pending` từ ngày áp dụng → so thiếu cuối ngày của loại thay thế với lượng cần bù (`E.subCheck`, ±10% tối đa 30). Khớp → ghi như `_btpAmApplySubstitution` (qua Unit Engine: `ledger.annotate` sổ BTP, `anomaly.resolve` NL; `duty.markMixup` kind `substitution` — phần bù không chia hao hụt) + `confirmedBy:'engine2_auto'`, đóng thông báo. Không khớp → `unexplained` + thông báo để biết. |
| C2 | Luật pha nhầm trừ phần đã xác nhận dùng thay (pool `substitution`) trước khi ghép. |
| C3 | Kiểm toán `SUB_CONFIRMED_OUT_OF_TOL`; test thuần POS + store + e2e quanlygieo hiển thị. |

## Trạng thái (23/10, chưa deploy)

| Bước | Trạng thái |
|---|---|
| A (đổi 23/10) | ✅ Thanh toán KHÔNG hỏi gì. Việc đầu ca (`renderOpeningChecklist` + cổng `refreshOpeningChecklistGate`): `loadExpiryCheckLinesPOS` (2 truy vấn: lô BTP `active`, mã NL `open`) → `expiryCheckLines` (thuần, tới hết hôm nay giờ VN) → màn `expiryCheckShow` phase `open`; xong ghi `daily_openings_gieogieo/{ngày}.expiryCheckedAt` (`expiryOpenDone`, **update** — không tự tạo bản ghi mở ca) → kiểm MỘT lần mỗi ngày, tải lại app giữa ngày không chặn vì lô mới nấu. Chuông `renderFifoAlertBar` mục «Sắp hết hạn» (`expirySoonLines`, ≤ `EXP_SOON_MIN` = 30 phút, chỉ dữ liệu trong máy, nhịp 60 giây) → «Kiểm tra lúc rảnh» (phase `soon`). Check-out `expiryAskOnCheckOut` (phase `checkout`, chỉ lô đã quá hạn, xong tự check-out). Gia hạn: `prepExtendLotPOS` (kho v21 `batches.annotate`) / `nlExtendOpenUnitPOS` (kho v21 `containers.annotate` thêm `expiresAt`, `expiryExtensions`), `expiryExtendTo` = max(bây giờ, hạn cũ) + 24 giờ; tem lô / tem mở NL in «GIA HẠN lần N · người xác nhận» + HSD mới. Bỏ đi: BTP `prepDiscardExpiredLotPOS` (`prep.discardByLots`), NL mở màn Báo hết hiện có (`openConfirmFinishSheet`; đóng màn → `_expAfterSheet` đọc lại). Lỗi đọc → bỏ qua, không chặn bán / check-out. |
| B1–B2 | ✅ `prepUntrackedAskOnCheckOut` trong `_doCheckOutImpl` (1 truy vấn `untrackedPendingDelta < 0`), `prepUntrackedSales` (thuần), câu trả lời `checkoutAnswers.{ca}`; kết ca `prepShortagePrefillFromCheckout` điền sẵn, đủ thì không hỏi lại; phiếu ghi `merge` giữ câu trả lời. |
| C1–C3 | ✅ `E.subCheck`/`E.subCogsDelta`, store `subReview`/`sweepSubReviews` (worker: thông báo `prep_shortage_recon`, quét hằng ngày), kho v21 `duty.markMixup` nhận `kind:'substitution'`; `mixupDay` trừ pool `substitution`; quanlygieo › BTP âm hiện câu trả lời lúc check-out + «Hệ thống tự xác nhận bù / không xác nhận»; kiểm toán `SUB_CONFIRMED_OUT_OF_TOL`. Test `tests/btp_am_pos.test.js`, `tests/unit_engine2_sub_review.test.js`; e2e `tools/btp_am/e2e_btp_am.js` (PC 1366 + điện thoại 390: kiểm hạn đầu ca, chuông, check-out, câu hỏi BTP âm). |

Giới hạn: câu hỏi check-out dựa trên lượt bán KHÔNG trừ được lô nào; bán vượt số còn của lô (lô âm) vẫn hỏi ở kết ca như cũ. NL dùng thẳng (tem) hết hạn sau mở không thuộc đợt này.
