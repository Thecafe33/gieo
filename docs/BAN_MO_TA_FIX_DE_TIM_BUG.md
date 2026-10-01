# Mô tả các luồng vừa sửa — dành cho agent tìm bug (01/10/2026)

Nhánh `Phan-tach-unit-engine`. Mục đích: chỉ cho người rà soát **đã đổi gì, đổi ở đâu, ý định, bất biến phải giữ, chỗ nghi ngờ**. Chưa deploy, chưa thử máy thật.
Quy ước dự án: `CLAUDE.md`. Engine (`unit_engine.v{N}.js`) bất biến sau deploy; bản hiện hành **v5**, v1–v4 giữ để quay lui. Bất biến B1–B15: `docs/KE_HOACH_UNIT_ENGINE_DA_CUA_HANG.md` mục 2.1. App không ghi thẳng dữ liệu kho (`tools/check_boundaries.js`).

## Cách chạy kiểm tra
```sh
sh tests/run_all.sh                         # toàn bộ test (chỉ cần node)
NODE_PATH=<nơi có acorn> node tools/check_boundaries.js   # phải báo "RANH GIỚI SẠCH"
# cú pháp: tách <script> inline của 2 HTML ra file tạm rồi node --check
node tools/chay_thu_trach_nhiem.js <file-xuat-day-du.json> chi-tiet   # chạy thử luật quy trách nhiệm trên dữ liệu thật
```
Test trích hàm thẳng từ HTML qua `tests/lib/extract.js` (đổi tên hàm → sửa danh sách tên trong test). Engine thật chạy trên Firebase giả `tests/lib/fakefb.js`.

---
## A. Phiên trước (đã commit, tóm tắt)
1. **Xoá bill / hoàn kho** (`qlReverseStockForOrder`, QL): lỗi đọc quy tắc refill → ném lỗi (không hoàn sai âm thầm); kết quả `busy` → ném. Test `xoa_bill_hoan_kho`.
2. **Bổ sung topping** (POS `_submitAddonImpl`, `_addonSameOrderState`, `_addonConsumeIngredientPOS`, `_addonApplyToItems(...,unitIdx)`): chặn hai máy cùng sửa một đơn, hoàn tem khi ghi sổ lỗi (thử lại 3 lần), cảnh báo bền khi lỗi tính tiêu hao, tách đúng ly. Test `them_topping`.
3. **Thẻ đơn đặt hàng / nhận hàng (PO)** thiết kế lại: `poPendingCardHtml`, `poLineProgress`, `poLinePillHtml`, `renderPoReceiveSelect`, form nhận có nút quay lại. Nút "Nhận hàng tự do" giữ nguyên.
4. **Lịch sử đơn hiện đá** khi chọn qua popup bắt buộc (`iceChipHtml` trong `showDet`); lọc HTML tên khách (`escHtmlPos`, test `khach_hang_xss`); ngày chọn theo giờ máy (`openDatePicker`); `_startPrepBatchImpl` đọc lại trước khi rollback (test `bat_dau_me`).
5. **Bán trong lúc NL khoá cân cho mẻ chế biến** (engine v2): bán vẫn trừ tem (`duringPrepLock:true`), cộng `saleHeld`/`prepSaleHeld`, dòng sổ gắn `prepWindowBatchId`; chốt đối chiếu theo mốc `{book, held}` (`prepReconSnapBook`, `reconBookOf`, `prepReconSetUnit(...,heldAt)`); tab Kho chặn báo hết / mở mã với NL đang khoá. Test `ban_trong_luc_can` (S1–S11).
6. **Cân ra NHIỀU HƠN sổ** (engine v3, `prepReconCommit` nhánh `surplusLots`): ghi ADJUSTMENT tăng, truy người cân mốc trước qua `startCheckpoint`, đánh dấu `entryErrorConfirmed`, alert `prep_entry_error`.
7. **Xuất dữ liệu v2/v3** (QL `buildExportPayload`, `_expBtpTheoNgay`, `_expDemNlGiaoCa`, `_expDongDoiChieu`, `_expTomTatSoLech`, `_expCaLamViec`; test `trich_xuat`): `_phienBan` = 3; mỗi dòng đếm BTP có `nguoiDem/nguoiDemId/demLuc`; khối `ca_lam_viec`; `duty_cases_gieogieo` trong dữ liệu ngày.

---
## B. Phiên này — quy trách nhiệm lệch theo ca (kế hoạch: `docs/KE_HOACH_TRACH_NHIEM_CA.md`)
### B1–B2. Chức năng nhân viên + báo cáo tháng (không đụng engine)
- QL: hồ sơ nhân viên có `roles` (`barista` = Pha chế, `order`) — `NV_ROLES`, `nvRolesOf`, `nvRolesLabel`, `nvToggleRole`, `renderEmployeeFormFields`, `submitEmployeeForm`; draft `nvFormDraft.roles`.
- POS: `_doCheckInImpl` chụp `roles` vào `employee_shifts` lúc check-in (bản sao lịch sử, giống `payTerms`).
- QL báo cáo tháng `thangKetTrachNhiemNL(txs, items, costOf, prepWasteTxs, dutyCases)`: đọc `ADJUSTMENT fromPrepCount` (loader `_ledgerWasteRows(coll,start,end,type)`); bỏ dòng đã có hồ sơ vụ lệch (`caseKeys` BTP, `caseOps` NL cân cuối ca) để không tính hai lần; thêm sự kiện `dutyShort/dutySurplus` (+ `dutyStrongShort` = độ tin cậy Mạnh), `dutyPool`. Test `bao_cao_dem_btp`, `vai_tro_nhan_vien`.

### B3. Hàm thuần `UnitEngine.duty.*` (engine v4, file `unit_engine.v5.js` mục "[v4] DUTY")
Quy ước dấu: **variance < 0 = thiếu**, > 0 = dư. Hằng `DUTY`: cân lại ≥50% lượng dùng và ≥150; báo chủ >100% và ≥50; `RESOLUTION` 1; hết hạn việc xác minh 48 giờ.
- `needsRecount`, `needsNotify`, `sameWeigh` (|a−b| ≤ max(10, 3%)).
- `presence/onDuty`: người có `barista` có mặt lúc t; không ai tích → dự phòng cả ca (ghi chú `du_phong_khong_ai_khai_pha_che`). Ca chưa check-out cắt theo `closeAt` hoặc 14 giờ.
- `detectRecipeBias(history)`: lệch nền công thức khi ≥5 khoảng, ≥80% cùng chiều, **và mọi người (≥2, mỗi người ≥20% tiếp xúc) cùng lệch cùng mức**; lệch dồn một người → không miễn.
- `attributeInterval(inp)`: thứ tự **nhập sai đã xác minh → lệch nền công thức (pool `recipe`) → người nấu mẻ ghi lệch ≥15% → lệch cực đoan chưa xác minh (pool `unverified`) → chia theo lượng bán theo sổ của người pha chế có mặt** (phần bán không rõ giờ/ca → pool `unknown`; phủ <50% → cả khoản `unknown`).
- `resolveVerification({a,b,base,clean})` → `confirmed` / `entry_error` / `dispute`. **`entry_error` khi B lệch nhỏ so với A, HOẶC B khớp "sổ gốc" trước lần đếm A** (`b.count ≈ b.book − vA`); `dispute` chỉ khi B lệch nhiều so với A và không khớp sổ gốc. Đây là chỗ **khác kế hoạch chữ** (mục 9 của kế hoạch).
Test: `duty_thuan`.

### B4. Engine — thu dữ liệu, hồ sơ vụ lệch, xác minh (cùng file)
Collection mới: `duty_cases_gieogieo`, `duty_tasks_gieogieo` (`verify_{prepId}`), `duty_config_gieogieo/current` (`baselineResetAt`), `duty_digests_gieogieo`; trường `prep_items.lastCount` / `inventory_items.lastCount`, `employee_shifts.roles`.
- Đọc dữ liệu: `dutyLoadPrepTx` / `dutyLoadStockTx` / `dutyLoadShifts` (nhớ 60 giây) / `dutyLoadProduction` đều lọc bằng **hai điều kiện bằng nhau** (`prepId|itemId` + `businessDate`, mỗi ngày một truy vấn, ±1 ngày), không cần composite index. `dutyTxTime`: giờ bán lấy từ **id bill `bill_<ms>_…`** (dòng bán bổ sung sau đóng ngày có `createdAt` muộn).
- `dutyOnCount` (gọi từ `prepCountCommitLine` sau giao dịch, **trong cùng promise job, lỗi bị nuốt + console.warn**): lập hồ sơ cho mọi lệch ≥1; chưa có mốc → `no_checkpoint`; suspect → `pending_verify` + task, ghi đè task cũ (`superseded`). Biến `dutyPrev/dutyMeta/dutyAdjust/dutyBook` được gán **trong** `runTransaction` (có thể chạy lại).
- `dutyVerifyCommit(l, task, ctx)`: người **khác** người cân đầu; mỗi lô chụp sổ lúc cân (`dutyLotBookNow`: RT `unitBase`, thiếu thì Firestore); RT ghi bằng `transaction` `unitBase = số cân − phần đã bán sau lúc cân`; không khoá bán. Ghi `prep_items.currentStock`, dòng `ADJUSTMENT prep_verify_{task}` (có `responsibility` của người đếm sai khi `entry_error`), lô `used_up` khi về 0, giải vụ, alert `entry_error` / `dispute`.
- `dutyGateCheck(l)`: `needs` chỉ khi **không** `discardAll`. `dutyExpireTasks`, `dutyListOpenTasks`.
- Tác động của chủ/nhân viên: `dutyReassign` (kind `manual|recipe|waived`, bắt lý do, tổng tỉ lệ ≤1, lưu `history`), `dutyContest` (chỉ người có phần), `dutyKeep`, `dutyResetBaseline`, `dutyListCases`. Alert đóng bằng `status:'resolved'` (`_dutyAlertDone`).
Test: `duty_luong` (S1–S12) và snapshot `snapshot_prepcount` (đã lập lại: chỉ **thêm** `lastCount`, `duty_cases…/recount`).

### B5. POS
- Cổng "cân lại một lần" ở `prepCountGoNext`: lệch vượt ngưỡng → `_prepCountResetLine` (xoá số đã cân), `l.attempt1`, `l.recountDone`; lần hai vẫn lệch → `l.suspect`. **Lời nhắc không nêu số/hướng/mức lệch (cân mù).** Lỗi `gateCheck` → bỏ qua cổng (không chặn kết ca).
- Chế độ xác minh dùng lại màn đếm (`_prepVerifyMode`): `openPrepVerifyPOS`, `exitPrepVerifyPOS`, `submitPrepVerify` → `_submitPrepVerifyImpl` (`resolveStaffPinAndCheckin`, từ chối cùng người). Trong chế độ này: không tự "bỏ hết" lô hết hạn, không hỏi đổ bỏ khi báo hết, chụp sổ lô trong `prepCountWeighBatch.onDone` và `prepCountToggleBatchDone`.
- Khối "Cần cân lại" ở Ca làm việc (`dutyTaskBlock`, `dutyTasksHTMLPOS`, `renderDutyTasksPOS`), nhắc sau check-in. "Xem phần trách nhiệm của tôi" (`openMyDutyCasesPOS`, `loadMyDutyCasesPOS`, `dutyContestPOS`; luôn hỏi PIN qua `_pinFieldForceAsk`).
- Đóng ngày: `UnitEngine.duty.writeDigest(...)` gọi **nền** sau `autoCheckOutAllOnClose` (`.catch`).
Test: `duty_pos`.

### B6. Quản lý
- Màn `kho:duty` "Tóm tắt ngày & vụ lệch" (`renderKhoDuty`, tab `dutyTab`): thẻ vụ (`dutyCardHTML`), chia lại (`dutyOpenReassign`, `dutyReassignSubmit`), `dutyMark`, `dutyKeepCase`, `dutyResetBaseline`; thẻ cảnh báo `duty_case` / `duty_digest` trong `renderAlertInbox`; Sức khoẻ quán đếm `duty_case` + tóm tắt có việc (`nDuty`, `nDigest`, `nDigestAct`, đã trừ khỏi "cảnh báo khác"). Test: `duty_ql`.

---
## C. Phiên này — v5: NL theo ca + tóm tắt ngày
- `shiftWeighFinishPOS` (cân NL cuối ca theo mã, **logic sổ cũ không đổi**) gọi thêm `dutyBg(dutyOnNlWeigh(m, out))` — **chạy nền, không `await`**. `dutyOnNlWeigh`: bỏ qua nếu hồ sơ `nl_{item}_{op}` đã tồn tại (tự bù lượt dở dang), ghi `inventory_items.lastCount`, variance = `counted − book`, case `type:'nl'`, `shiftWeighOp`; lần đầu chưa có mốc → `no_checkpoint`. `dutyFlush()` chờ việc nền (dùng trước `writeDigest`). NL **chưa có** vòng người khác cân lại. Test `duty_nl`.
- `dutyBuildDigest` (thuần) / `dutyDigest(day)` / `dutyWriteDigest(day)`: gom theo NL/BTP các luồng `sales / cooking / produced / wasteDeclared / received / countVariance / otherAdjust`, Sổ lệch, hồ sơ vụ lệch; trạng thái `ok|da_quy|chua_quy|cho_quyet|cho_xac_minh`. Bán = CONSUMPTION có `referenceId` bắt đầu `bill_`, trừ hoàn (`ADJUSTMENT reversal:true`); NL cân cuối ca nhận bằng `wasteKind:'shift_weigh'`. Lưu `duty_digests_gieogieo/{ngày}` + alert `duty_digest_{ngày}` (ghi `merge`, không nhân đôi). Test `duty_digest`.

---
## D. Chỗ nên soi kỹ (nghi ngờ / rủi ro)
1. **Giờ bán lấy từ id bill**: id không theo mẫu `bill_<12–14 chữ số>_` và dòng `backfillAfterClose` → `timeUnknown` (vào "chưa quy"). Kiểm tra các nguồn bán khác (addon `addon_…`, topping, đổ ly) có rơi nhầm không.
2. **`dutyUsageFromTx` gộp theo `referenceId`**: một bill có nhiều dòng cùng BTP/NL; hoàn bill (`reversal`) trừ vào cùng khoá. Với NL, dòng nấu mẻ (`prep_after_*`, CONSUMPTION không phải bill) cũng tính là "lượng dùng" có giờ.
3. **Chia theo ca không biết ai pha ly nào** — chỉ người đang có mặt; ca không ai tích Pha chế → cả ca (độ tin cậy Vừa). Kiểm tra check-out thiếu / hai ca chồng giờ / `employee_shifts` ngày khác khi qua nửa đêm (`_dayKey` dùng UTC+7).
4. **Sổ trong `dutyOnCount`**: `book = currentStock − discardedQty`; variance = `adjust` của ledger. Lệch giữa `currentStock` và tổng `qtyRemaining` các lô có thể làm số hồ sơ khác số cổng cân lại (`gateCheck` dùng `sysQty` từ lô).
5. **`verifyCommit`**: nhiều bước ghi liên tiếp, **không nằm trong một giao dịch** (RT từng lô → transaction tồn → cập nhật lô → ghi hồ sơ/việc). Lỗi giữa chừng có thể để RT đã đổi mà hồ sơ chưa; không có cơ chế tự bù như `shiftWeighPending`. Kiểm tra mạng đứt giữa các bước, hai người cùng xác minh một việc (kiểm tra `status==='open'` chỉ ở đầu).
6. **`sameWeigh` / ngưỡng** là hằng cứng (3% hoặc 10 đơn vị; 50%/150; 100%/50) — kiểm tra với BTP nhỏ (<100 g) và đơn vị `cái`.
7. **Nền công thức** cần ≥2 người mỗi người ≥20% tiếp xúc; quán một người pha chế thì không bao giờ miễn lỗi công thức (cố ý, ghi trong kế hoạch).
8. **Cổng cân lại** gọi Firestore (`prep_items`, `prep_transactions` theo ngày) mỗi lần bấm "Tiếp tục" của từng thẻ — độ trễ khi mạng chậm; lỗi → bỏ qua cổng.
9. **Chạy nền không `await`**: nếu app đóng ngay sau cân NL thì hồ sơ có thể mất (không có hàng đợi bền). `writeDigest` chờ `dutyFlush()` nhưng chỉ trong cùng phiên trình duyệt.
10. **Chi phí đọc**: mỗi lần đếm BTP ~4 ngày × 3 truy vấn × số BTP (song song); digest đọc toàn bộ `inventory_items` + `prep_items` + sổ NL/BTP của ngày.
11. **Dữ liệu cũ**: `usageEvents` BTP chỉ từ 19/9; ca cũ `roles = null`; mốc đếm đầu tiên sau deploy → `no_checkpoint`.
12. **Báo cáo tháng bỏ trùng**: BTP khớp theo `prepId|interval.to == createdAt` dòng sổ; NL khớp theo `shiftWeighOp`. Nếu `createdAt` của dòng sổ và `now` của hồ sơ lệch nhau (ví dụ `C.now()` khác `new Date()`), dòng đếm BTP sẽ bị tính hai lần.
13. **Quy tắc `thangKetTrachNhiemNL`** phân loại `ADJUSTMENT` theo `prepReconVariance/…`; dòng `ADJUSTMENT prep_verify_*` (`fromPrepVerify`) **không** vào nhóm "đếm BTP theo người" (cố ý) nhưng vào P&L "chênh kiểm đếm BTP" (`prepAdjValue`) — xem có đếm kép với dòng đếm cuối ca không.
14. **Không làm**: vòng xác minh cho NL; đo hiệu quả sau 2 tuần (B6); nút "sửa tồn" mới (dùng chức năng Kho sẵn có); `storeId` cho `employees` (đa cửa hàng).

Bất biến cần soi lại sau mỗi sửa: tồn NL = Σ tem sealed + Σ `unitBase` tem đang mở (RT); BTP: `currentStock` = Σ `qtyRemaining` các lô; mọi lần ghi RT lô BTP phải đồng bộ Firestore (`_ueRecomputeCurrentStock`); không thêm đường ghi thẳng kho từ app.

---
## E. Đợt sửa theo bản rà bug của agent khác (engine v6) — đã kiểm chứng từng lỗi trước khi sửa
Cả 7 lỗi đều tái hiện được ở v5 (`ENGINE=unit_engine.v5.js node tests/phan_bien_v6.test.js`). Lỗi 4 và 6 **có từ code gốc POS** (không phải từ các sửa phiên này) nhưng nằm trên đường bán/xoá bill nên được sửa hẹp.
1. Xác minh chiếm `_posSubmitBusy` (khoá thanh toán) → dùng khoá riêng `_dutyVerifyBusy` (POS `submitPrepVerify`).
2. `_prepVerifyMode` dính khi thoát màn bằng menu → `renderPrepCountScreen(lines, verifyTask)` luôn đặt/xoá chế độ theo lần dựng màn, `showScreen` xoá khi rời màn Ca làm việc; engine từ chối khi BTP không khớp việc.
3. Xác minh lỗi giữa chừng rồi bấm lại trừ thêm; hai máy cùng xác minh → giành việc (transaction), RT có dấu thao tác.
4. Xoá bill lúc NL khoá cân báo thành công dù tem chưa hoàn → `PREP_LOCKED` ném lên, nhả claim.
5. Bán xen làm lô Firestore bị ghi đè số cũ → đồng bộ lô theo RT hiện hành, đọc lại sau khi ghi.
6. `applyPrepConsumptionPOS` `return` trước bước suy tồn → suy tồn khi bán vượt tồn.
7. Bấm "Tiếp tục" hai lần nhảy qua thẻ → khoá `_prepCountNextBusy` + kiểm tra thẻ còn là thẻ hiện tại sau khi chờ cổng.
Phát hiện thêm khi sửa: dòng sổ `prep_verify_{task}` trùng id giữa hai việc cùng BTP (sửa trong lỗi 3). Snapshot `core` lập lại: chỉ khác thông báo lỗi khoá (`[PREP_LOCKED]`) và ca "bán BTP chưa có lô" nay có `pendingShortage` đúng.

---
## F. Đợt sửa theo bản rà bug lần 2 (engine v7) — lỗi 8–15, đều tái hiện được trước khi sửa
(Lỗi 8 và 9 có từ code gốc POS.) Test: `tests/phan_bien_v7.test.js` (engine; `ENGINE=unit_engine.v6.js` để xem lỗi cũ) và `tests/duty_pos.test.js` mục 11–12 (POS).
8. `continueAfterRefillChecklist` giữ `_posSubmitBusy` khi `_continueAfterCashPass` lỗi → `try/catch/finally` luôn nhả khoá + báo thử lại.
9. `applyPrepConsumptionPOS` cùng `txId` chạy chồng trừ RT hai lần → tuần tự hoá theo `txId` + đọc lại `txRef` trong transaction, hoàn phần trừ trùng.
10. Gỡ node lô về 0 xoá mất nợ do bán xen → gỡ có điều kiện bằng transaction RT.
11. Dòng điều chỉnh xác minh dùng `tonSau − currentStock` (hai thời điểm/phạm vi khác nhau) → dùng đúng phần chênh của lần cân (Σ cân − Σ sổ lúc cân).
12. Cùng nhân viên hai máy cùng ghi → token + từ chối khi lượt đang xử lý còn mới; lượt lỗi nhả việc.
13. Màn cũ xử lý việc mới (kể cả tự xác minh mình) → so thế hệ việc (`firstAt`/`caseId`) và người cân đầu trên dữ liệu vừa đọc, trong transaction.
14. Ghi lô lỗi vẫn báo thành công/đóng việc → báo lỗi, giữ việc mở.
15. Xác minh hoàn tất muộn xoá màn cân mới → `_prepVerifyMode.session`; chỉ dọn màn nếu còn đúng phiên đã gửi.
Đồng ý với nhận xét của bản rà: nói "chỉ còn khe hở nhỏ ở đồng bộ lô" ở v6 là chưa đủ — còn sai ở dòng sổ điều chỉnh (lỗi 11), gỡ node (lỗi 10) và đóng việc khi ghi lô lỗi (lỗi 14).

---
## G. Đợt sửa theo bản rà bug lần 3 (engine v8) — lỗi 16–21
Test: `tests/phan_bien_v8.test.js` (`ENGINE=unit_engine.v7.js` để xem lỗi cũ; v8 đạt hết).
16. Đường trừ NL cùng bill chạy chồng (cùng/khác máy) → mutex theo orderId + `alreadyApplied` thì hoàn phần tem vừa trừ.
17. `dupInTx` báo "đã bù" khi chưa chắc → hoàn qua `compensateDuplicate`, kiểm hoàn ĐỦ, ghi việc phục hồi bền, `recoverDuplicates` chạy lại; hoàn dở → `needs_manual` + cảnh báo.
18. Mở lại màn xác minh sau lỗi dùng số mới → lưu `attempt` trong việc, mở lại dùng lại số lượt đầu.
19. Token chỉ kiểm một lần → kiểm trước mỗi ghi RT/lô và trong transaction sổ + đóng việc.
20. RT lô bị kẹp ≥0 làm mất nợ → ghi `counted − sold` không kẹp.
21. POS đọc sổ lô sau lúc cân → lấy mốc trước, dùng `lotBookAt`.
Giới hạn: `lotBookAt` dựa `usageEvents` (best-effort); phục hồi bền chạy khi POS mở khối check-in; hoàn dở một phần cần quản lý xử lý tay (`needs_manual`).

---
## H. Đợt sửa theo bản rà bug lần 4 (engine v9) — lỗi 22–28
Test: `tests/phan_bien_v9.test.js` (`ENGINE=unit_engine.v8.js` để xem lỗi cũ; v9 đạt hết).
22. Phục hồi bù trùng hoàn hai lần → khoá idempotent theo thao tác ngay trên node RT + thuê 60 giây trên việc phục hồi.
23. `lotBookAt` ghép hai ảnh khác thời điểm, bỏ qua hoàn → nhật ký thay đổi có dấu ghi cùng transaction với `unitBase`, đọc một lần.
24. Token chưa chặn lượt cũ ghi RT → thế hệ `dutyVerifyGen` kiểm trong transaction RT.
25. Thử lại đóng nhầm lô chưa xử lý → tiến độ từng lô `rtDone` lưu trong `task.attempt`.
26. Lỗi ghi việc phục hồi làm mất dấu → hàng đợi cục bộ (bộ nhớ + localStorage) + ghi lại khi `recoverDuplicates`.
27. Xác minh bỏ qua hoàn sau mốc cân → remain có dấu (bỏ `max(0, …)`).
28. Lô cuối đã đóng, ghi sổ lỗi, không mở lại được → POS có đường "Ghi nốt" từ `task.attempt`.
Giới hạn còn lại: (a) `lotBookAt` rơi về cách cũ (best-effort) với node chưa có `chg`; (b) nếu máy tắt/crash đúng giữa lúc trừ RT thừa và lúc ghi bất kỳ dấu nào (kể cả localStorage) thì không có dấu phục hồi — phát hiện qua cân/kiểm kê; (c) lượt xác minh cũ có thể ghi RT trong khe vài ms giữa lúc việc mới được tạo và lúc việc mới ghi RT lần đầu.
