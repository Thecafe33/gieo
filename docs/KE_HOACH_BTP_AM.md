# BTP âm — hết hạn lúc bán & dùng loại thay thế (kế hoạch 23/10/2026)

Chủ quán chốt 23/10. Mục tiêu: quản lý không phải xử lý thông báo «BTP âm» từ ngày áp dụng.

## Hiện trạng (đã rà)

- Bán hàng trừ FIFO vào lô kể cả lô đã quá hạn — POS không hỏi; lô hết hạn chỉ bị «bỏ hết» lúc đếm cuối ngày. Gia hạn chỉ có ở quanlygieo (`prepBatchExtendExpiryCore`).
- Cấu hình «được phép dùng thay» đã có ở quanlygieo › Kho › BTP âm (`substitutes = [{kind, id, ratio}]` trên BTP / NL). Kết ca POS hỏi «đã dùng loại nào để bù?» (`prepShortageAskIfNeeded` / `prepShortageBuild`) → `prep_shortage_recons_gieogieo` `substitution_pending` → quản lý bấm xác nhận (`_btpAmApplySubstitution`).

## Chủ quán chốt

1. Lúc bán, lô BTP sắp trừ đã hết hạn → popup ở POS: **«Hủy»** = lô đó ghi đổ bỏ, món vẫn bán (từ lô khác / loại thay thế); **«Vẫn còn dùng được»** = gia hạn thêm 24 giờ + in tem gia hạn. Nhân viên xác nhận (PIN) là được gia hạn, **không giới hạn số lần**. Loại **hết hạn cuối ngày** (`shelfLifeType:'endOfDay'`) **không được gia hạn** — chỉ có «Hủy».
2. Bán BTP lúc không còn lô → nhân viên có ca lúc đó **phải trả lời khi check-out** (không trả lời không check-out được): đã dùng loại nào thay (theo cấu hình), nấu mẻ mới kịp, hay không dùng gì. Cốt trà / cốt trà sữa không cấu hình thay thế → không có lựa chọn thay.
3. Bỏ bước quản lý xác nhận: hệ thống tự xác nhận khi loại thay thế thiếu cuối ngày **khớp lượng cần bù trong ±10%, tối đa 30 g** (nhân viên còn nếm thử). Không khớp / «không dùng gì» → hao hụt theo luật thường + thông báo để biết.

## Các bước

| # | Nội dung |
|---|---|
| A1 | POS `onCheckoutClick` → `prepExpiryGateBeforePay`: món trong giỏ cần BTP → đọc RT lô đang mở của BTP đó (sự thật số còn), lô sắp bị trừ (FIFO) đã quá hạn → popup. Hàm thuần `prepExpiryPlan` (test). Không đọc Firestore trừ lô chưa có trong bộ nhớ. |
| A2 | «Vẫn còn dùng được» (PIN pha chế): `UnitEngine.batches.annotate` `expiresAt = bây giờ + 24h` + `expiryExtensions` (ai, lúc nào, từ → tới; kho v21 thêm trường chú thích) → in tem lô có dòng «GIA HẠN lần N». «Hủy» (PIN): `UnitEngine.prep.discardByLots` cả phần còn của lô, lý do «Hết hạn — nhân viên xác nhận không dùng được lúc bán». |
| B1 | POS `_doCheckOutImpl` → `prepUntrackedAskOnCheckOut`: BTP có `untrackedPendingDelta < 0` (1 truy vấn, thường 0 kết quả) → dòng bán không lô trong khoảng ca (hàm thuần `prepUntrackedSales`) → chưa trả lời thì hiện câu hỏi, lưu `prep_shortage_recons_gieogieo/{ngày}_{prepId}.checkoutAnswers.{shiftId}` rồi mới check-out. |
| B2 | Kết ca `prepShortageAskIfNeeded`: câu đã trả lời lúc check-out điền sẵn; trả lời đủ thì không hỏi lại. |
| C1 | Engine 2 `subReview` (trigger: thông báo `prep_shortage_recon` mới + quét hằng ngày): `substitution_pending` từ ngày áp dụng → so thiếu cuối ngày của loại thay thế với lượng cần bù (`E.subCheck`, ±10% tối đa 30). Khớp → ghi như `_btpAmApplySubstitution` (qua Unit Engine: `ledger.annotate` sổ BTP, `anomaly.resolve` NL; `duty.markMixup` kind `substitution` — phần bù không chia hao hụt) + `confirmedBy:'engine2_auto'`, đóng thông báo. Không khớp → `unexplained` + thông báo để biết. |
| C2 | Luật pha nhầm trừ phần đã xác nhận dùng thay (pool `substitution`) trước khi ghép. |
| C3 | Kiểm toán `SUB_CONFIRMED_OUT_OF_TOL`; test thuần POS + store + e2e quanlygieo hiển thị. |

## Trạng thái (23/10, chưa deploy)

| Bước | Trạng thái |
|---|---|
| A1–A2 | ✅ posgieo `prepExpiryGateBeforePay` (gọi ở `onCheckoutClick`, bỏ qua khi bổ sung bill), `prepExpiryPlan`/`prepLotExpired` (thuần), `prepExpiryAsk` popup, `prepExtendLotPOS` (kho v21 `batches.annotate` + trường `expiryExtensions`), `prepDiscardExpiredLotPOS` (`prep.discardByLots`); tem lô in «GIA HẠN lần N · người xác nhận». |
| B1–B2 | ✅ `prepUntrackedAskOnCheckOut` trong `_doCheckOutImpl` (1 truy vấn `untrackedPendingDelta < 0`), `prepUntrackedSales` (thuần), câu trả lời `checkoutAnswers.{ca}`; kết ca `prepShortagePrefillFromCheckout` điền sẵn, đủ thì không hỏi lại; phiếu ghi `merge` giữ câu trả lời. |
| C1–C3 | ✅ `E.subCheck`/`E.subCogsDelta`, store `subReview`/`sweepSubReviews` (worker: thông báo `prep_shortage_recon`, quét hằng ngày), kho v21 `duty.markMixup` nhận `kind:'substitution'`; `mixupDay` trừ pool `substitution`; quanlygieo › BTP âm hiện câu trả lời lúc check-out + «Hệ thống tự xác nhận bù / không xác nhận»; kiểm toán `SUB_CONFIRMED_OUT_OF_TOL`. Test `tests/btp_am_pos.test.js`, `tests/unit_engine2_sub_review.test.js`; e2e `tools/btp_am/e2e_btp_am.js` (PC 1366 + điện thoại 390). |

Giới hạn: câu hỏi check-out dựa trên lượt bán KHÔNG trừ được lô nào; bán vượt số còn của lô (lô âm) vẫn hỏi ở kết ca như cũ. NL dùng thẳng (tem) hết hạn sau mở không thuộc đợt này.
