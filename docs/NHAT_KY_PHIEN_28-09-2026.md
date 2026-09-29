# Nhật ký phiên làm việc 28/09/2026 (Claude.ai → chuyển sang Claude Code)

Các sửa đổi dưới đây **đã nằm trong** `posgieo.html` / `quanlygieo.html` đi kèm gói này. Bản gốc chủ dự án gửi lên đầu phiên **chưa có** chúng.

> Trạng thái: đã qua `node --check` và các test trong `tests/`. **Chưa thử trên máy POS thật, chưa deploy** (chủ dự án xác nhận lại trước khi deploy).

## 1. Cân NL cuối ca theo mã (POS)

- Bước kiểm kê **cuối ca** với NL có tem: cân **từng mã đang mở** thay cho một số tổng. Nhân viên quét QR (hoặc chọn tay kèm lý do) để xác nhận đang cầm đúng mã, rồi mới cân / nhập. Quét chỉ để xác nhận — không mở, không báo hết mã nào.
- Danh sách món:
  - lớp 1 = món Quản lý bật `shiftCountTiming` gồm cuối ca **và** đang có mã mở;
  - lớp 2 = món không bật nhưng hôm nay có bất thường (mã âm / nợ FIFO, mở ≥ 2 mã, cảnh báo `untracked_unit_consumption` / `allocate_rtdb_error`, Sổ lệch mở). Đọc cảnh báo theo cả `businessDate` lẫn ngày lịch (kết ca sau nửa đêm).
- Chốt số: một RT transaction trên node của NL. `unitBase` mới = số cân + (số hiện tại − mốc lúc cân); gỡ node `finishedDebt`. Hao hụt = sổ (gồm nợ) − số cân → dòng `WASTE` / `ADJUSTMENT` với `wasteKind:'shift_weigh'`, `measured:true`; phần nợ gắn vào mã mở **mới nhất**.
- An toàn:
  - lượt dở dang được ghi bền vững ở `daily_closings/{ngày}.shiftWeighPending` và **tự bù** (quét ngày hiện tại + 2 ngày trước);
  - chống ghi đè đồng thời bằng dấu mốc node (`shiftWeigh.op` / `lastPrepReconOp` / `lastMgrAdjustOp`);
  - lệch > 25% dung tích → hỏi lại "Cân lại / Vẫn ghi" (không lộ số sổ), vẫn ghi thì gắn cờ `largeDeviation` + cảnh báo;
  - chặn số cân > 110% dung tích;
  - quét theo **id container** (tem đã cấp lại);
  - mã "open" trên sổ mà không có trong RT → tự báo;
  - có mã "không có trên tay" → không ghi gì, gửi cảnh báo `shift_weigh_unconfirmed`.
- Hàm chính: `computeShiftInventoryCountLinesPOS`, `shiftWeigh*` (Apply / Finish / HealPending / HealRecent / ReclassToConsumption / SavedLine / …), `renderShiftInventoryCountCardPOS`, `submitShiftInventoryCountPOS`.

## 2. Sửa kèm trong luồng kết ca (POS)

- `submitShiftInventoryCountPOS`: sửa lỗi `const saved` che biến ngoài → trước đây báo "Chưa lưu được kiểm kê" dù đã lưu.
- BTP âm chờ đối chiếu: bỏ qua dòng có tem chưa chốt (`countedQty == null`); NL đã cân theo mã mà được xác nhận "dùng bù" → **chuyển loại tại chỗ** (giảm `qty` dòng hao hụt + thêm dòng CONSUMPTION, một transaction) thay vì trừ tem lần hai.
- `_recheckCloseAfterSalesImplPOS`: món đã chốt theo mã không bị bắt cân lại khi có bill sau kết ca.

## 3. Sổ kho (POS)

- `applyStockTransactionPOS`: thêm cờ `measured`. Hao hụt / dư **đo bằng cân** cộng / trừ thẳng `unrefilledConsumption` (và `locationStock` với dư), không bật `refillUncertain`.

## 4. Nhận hàng (POS)

- `_submitPoReceiveImpl`: **chặn trước mọi lệnh ghi** nếu món dán tem theo đơn vị nhận không tròn số đơn vị đếm, chưa khai quy cách, hoặc > 60 tem.
- `createContainersForReceipt`: phần không có mã đỡ (phần lẻ / không sinh tem) → Sổ lệch `receive_no_tem`.

## 5. Tem cái rời (POS)

- `writeAtomicContainerFinish`: gỡ node RT bằng transaction để biết số dư lúc gỡ; âm → Sổ lệch `atomic_debt_dropped`.

## 6. Giảm lượt đọc Firebase (POS)

- Cổng checklist đầu ca: chỉ chạy khi **đã mở ca**, nhịp 3 phút (trước 1 phút, chạy cả đêm nếu máy sáng màn hình); tính ngay khi ca vừa mở; chỉ tính mục bắt buộc chưa xong.
- Bộ đệm sống `_posLiveSubscribe` (`onSnapshot`) cho công thức / topping / bao bì (7 hàm `ensure*LoadedPOS`), nhân viên, check-in hôm nay, refill rules. `refillRulesSnapPOS()` thay 7 chỗ tự truy vấn refill rules.
- Chấm báo FIFO (`refreshFifoAlert`) lấy từ listener RT `active_units_gieogieo` thay cho đọc mọi tem mở trên Firestore mỗi 2 phút.

## 7. Quản lý (`quanlygieo.html`)

- Màn "Đếm đầu/cuối ca": hiện kết quả chốt theo mã (hụt / dư / chưa xác nhận đủ mã); cập nhật câu mô tả cấu hình.
- Báo cáo sổ: tách "hao hụt cân cuối ca" (phần dư không gộp vào Điều chỉnh kiểm kho); báo cáo trách nhiệm xếp `shift_weigh` vào Thiếu tồn / Dư (không đổ lên người đứng cân).
- Sổ lệch: thêm nhãn `receive_no_tem`, `atomic_debt_dropped`.

## 8. K0 — gỡ kiosk / màn hình phụ (POS, phiên Claude Code)

- Gỡ `syncDisplay` / `_sdQueue` / `_sdFlush` / `resetDisplay` + 28 nơi gọi (kế hoạch ghi 31 là tính cả định nghĩa và chú thích); lệnh ghi `session_display_gieogieo/isToGo` trong `toggleTogo` / `resetTogoToggle`; màn `#kc` + mục menu ẩn + 14 hàm `kc*` của kiosk.
- **Giữ** `kcStep*` / `_kcStep` (đếm từng món khi kiểm kê ca) và CSS `.kc-*` (giao diện Kết ca) — **không phải kiosk**, dù trùng tiền tố.
- Phản biện: màn kiosk đã không còn đường vào trên giao diện (tab ẩn) → rủi ro đè `kiosk_config` của XOFA chỉ còn ở code chết; phần thật sự chạy là ghi `session_display_gieogieo` mỗi lần giỏ đổi.
- **Chủ dự án tự làm sau deploy**: xoá node RT `session_display_gieogieo` (sau khi mọi máy POS đã tải lại). Không đụng `kiosk_config` và ảnh `kiosk/` trên Storage (của XOFA).

## 9. F4 — gỡ mã giảm giá / voucher (POS)

- Gỡ ô nhập mã, danh sách quà `myGifts`, `applyVoucher` / `findReward` / `applyReward` / `openPickCartModal` / `removeGiftVoucher` / `_finalizeDiscountAfterPay` / `loadDiscountCodes` và biến liên quan. POS không còn đọc/ghi `rewards`, `myGifts`, `discount_effects_gieogieo`, `voucher_effects_gieogieo`. Quản lý vốn không đụng các thứ này.
- Ly miễn phí theo tem tách sang biến riêng `_stampFreeVKey`. **Lỗi đã có từ trước**: vì dùng chung `_giftVoucherKey`, mỗi lần đổi ly lại ghi rác `customers/{sđt}.myGifts.__free_stamp__<ts>` (collection dùng chung) → dọn bằng `tools/don_myGifts_free_stamp.js` (dán vào Console của POS, mặc định chạy thử).
- Sửa kèm (chủ dự án duyệt): bỏ ly tem khỏi giỏ (✕ / "−" về 0) thì không trừ tem nữa (`_stampFreeSyncCart` + chốt chặn theo `order.itemsArray` trong `_finalizeStampFreeAfterPay`); không bấm "+" trên ly tem được (trước đây thành 2 ly miễn phí, trừ 1).
- `voucherUsed` của bill ly tem giữ nguyên giá trị như cũ (`__free_stamp__<ts>`).
- Test mới: `tests/stamp_free.test.js`.

> K0 + F4: đã qua `node --check`, `tests/run_all.sh`, kiểm kê AST. **Chưa thử trên máy thật, chưa deploy.** Thử tay: checklist 5.3 mục 1, 12 + ly miễn phí theo tem (đổi → thanh toán; đổi → xoá ly → thanh toán không bị trừ).

## 10. Unit Engine E0 → E6 (phiên Claude Code, chủ dự án duyệt "làm liền E0→E6")

Kết quả: file mới `unit_engine.v1.js`, **dùng chung** cho POS và Quản lý. Tài liệu API: `docs/UNIT_ENGINE.md`.

- **E0.** Dựng nền test (Firebase giả, đồng hồ giả, ngẫu nhiên cố định) và kiểm kê AST (`tools/ast_inventory.js`, `tools/free_idents.js`, `docs/BANG_GHI_ENGINE.md`: 51 hàm POS, 23 hàm QL ghi vào dữ liệu engine). Lập ảnh chụp hành vi từ **bản HTML gốc**.
- **E1–E2.** Chuyển nguyên văn lõi POS sang engine (trừ / hoàn FIFO, suy tồn, khoá mẻ, sổ kho, chuyển kho, Sổ lệch, sinh mã, tem nhận hàng). Chỉ đổi `Date.now` / `Math.random` / biến toàn cục thành cấu hình. Thêm `annotate` / `amend` / `UnitEngine.Error`.
- **E3.** Quản lý nạp engine (`app:'quanly'`):
  - Bỏ các bản chép (`reverseIntoUnits`, `applyStockTransfer` chết).
  - `qlReverseStockForOrder` → `consume.reverseOrder`.
  - `_btpAmApplySubstitution` → `ledger.annotate` + `anomaly.resolve` (có chặn áp hai lần).
  - R1 (hoàn về tem cũ nhất) và R2 (chỉnh tồn BTP theo `openedAt`, trước là `finishedAt`).
- **E4.** Gom **mọi** đường ghi thẳng vào engine. Có 2 cách chuyển:
  - **Nguyên văn**: tem cái rời, đổ ly BTP, âm chờ đối chiếu, cân cuối ca (8 hàm), đối chiếu NL, 5 hàm Quản lý (`setLocationStock`, sửa / khôi phục lô, duyệt báo mất, cân lại mã).
  - **Tách tay** (giao diện ở lại app, phần ghi vào engine): mở tem, báo huỷ tem, tìm lại tem mất, in lại tem (2 luồng), hoàn thành / huỷ / đổ bỏ / bắt đầu mẻ BTP, sửa sản lượng, 4 bước đối chiếu NL, kiểm kê BTP cuối ca, bill bổ sung, vết trừ kho, chỉnh tồn BTP, khôi phục tem cái rời, **sửa phiếu nhận** (`lifecycle.fixReceipt`, thêm vết `amendments[]`).
  - Checker ranh giới: **36 → 0 hàm vi phạm**.
- **F1.** Khôi phục lô BTP giữ `openedAt` gốc (trước đây nhận giờ lúc khôi phục nên nhảy xuống cuối FIFO).
- **F2.** Tạo món có tem thì tồn khởi tạo luôn 0. Form vốn đã chặn; thêm chốt ở `addInventoryItem`.
- **F3.** Dòng sổ tạo đúng một lần theo id cố định (`_ledgerCreateOnce`), không còn `.add()` trên sổ.
- **E5.**
  - `tools/check_boundaries.js` (AST) báo sạch.
  - Bỏ lớp shim tên cũ: 54 ở POS, 5 ở QL, sang `UnitEngine.<nhóm>.<hàm>`. App không còn gọi `UnitEngine.fn`.
  - F5 (mục 11).
  - `tools/predeploy_check.sh` (6.7) và mẫu headers `tools/firebase_headers_gieogieo.json` (6.2).
- **E6.**
  - Mọi bản ghi Firestore **mới** do engine tạo mang `storeId:'gg01'`. Chỉ thêm trường, đường dẫn chưa đổi.
  - C1: `serverClock:true` → giờ máy chủ theo `.info/serverTimeOffset`. Bỏ qua mốc B9 "tương lai" (> now+10 phút).
  - **R3 bật cho Quản lý**: suy tồn ở Quản lý giờ ghi và tôn trọng mốc B9 như POS.
- **Chưa làm** (theo kế hoạch để sau): hợp nhất dấu mốc về `lastAbsWrite` (E5-2, đổi trường dữ liệu — cần làm cùng M2); buộc cập nhật từ xa `app_config_gieogieo/versions` (6.4).

## 11. F5 — gỡ "Tại quán" / Point / Ví / service worker (POS)

- `isToGo` thành hằng `true`. Gỡ `toggleTogo` + nút ẩn và các nhánh `!isToGo` (giá topping, menu lúc bán, nút Ship, bỏ qua khuyến mãi To Go, gợi ý bán).
- Chiến dịch `scope:'dinein'` không bao giờ áp.
- `loyaltyProcessAfterPay` chỉ tích Stamp: bỏ nhánh Point và "x2 Ví", bỏ tham số `isWallet`.
- Gỡ khối đăng ký `sw_gieogieo.js` + `showSwUpdateBanner`. Sửa chú thích "đồng giá". Viết lại ghi chú ẩn đầu file (mục 14 và "Hiện trạng").
- **Giữ**:
  - `loyaltyAddPoints` và mục `points` trong hàng đợi, để nợ cũ (nếu có) chạy nốt;
  - field `isToGo` trên bill;
  - tab quản lý menu Tại quán (`menu_gieogieo`, đang ẩn);
  - CSS `.wal-*`.

## 12. Kiểm chứng đã chạy (máy Claude, KHÔNG phải máy thật)

- `sh tests/run_all.sh`: **14 file test đều đạt**. Gồm:
  - 56 kịch bản lõi;
  - 24 kịch bản chạy **nguyên hàm giao diện** (bản mới + engine so với bản HTML gốc): khớp dữ liệu Firestore / RT, thứ tự ghi, lời gọi giao diện;
  - 6 kịch bản kiểm kê BTP;
  - 12 kiểm tra E6.
- Khác biệt **có chủ đích** so với bản gốc, đã khai trong test:
  - F1;
  - vết `amendments` khi sửa phiếu nhận;
  - `storeId`;
  - mốc B9 bên Quản lý;
  - kết quả suy tồn / xoá bill ở vài kịch bản lõi (T1/T2, V1/V2/V4) đã duyệt từ E1–E3.
- Đã thử cố ý bỏ `storeId`: 27 kịch bản đỏ, tức test bắt được lỗi.
- Không có định danh toàn cục mới nào ngoài `UnitEngine` (so bằng AST với bản gốc).
- `node tools/check_boundaries.js` báo ranh giới sạch. `sh tools/predeploy_check.sh` đã thử cả nhánh đạt lẫn các nhánh chặn (thiếu file engine, lệch phiên bản, thiếu bản cũ < 7 ngày, thiếu file thương hiệu khác).

## 13. Câu hỏi còn mở cho chủ dự án

- ~~F6~~ — đã làm theo đề xuất, xem mục 15.
- Xoá dòng sổ ADJUSTMENT kiểu cũ ở Quản lý: các dòng "hoàn" rất cũ không còn được bỏ qua như trước (trường hợp hiếm).
- Bill ly tem vẫn lưu `voucherUsed = __free_stamp__<ts>` (giữ cho màn đọc bill cũ). Có đổi nhãn không?
- ~~Nút "Cập nhật" ở sidebar POS~~ — đã gỡ theo yêu cầu (nút + hàm `manualCheckUpdate`); HTML `no-cache` nên mở lại app là nhận bản mới.

## 14. Chủ dự án tự làm (Claude KHÔNG deploy) — ⚠️ đã thay bằng quy trình bản thử, xem mục 16 và `docs/CHE_DO_THU.md`

1. **Sao lưu** thư mục deploy.
2. Chép vào thư mục: `posgieo.html`, `quanlygieo.html`, `unit_engine.v1.js`, `tools/`, `tests/`, `docs/`, `package.json`. Chạy `npm install` một lần (cần `acorn` cho checker).
3. Thêm 2 mục `headers` trong `tools/firebase_headers_gieogieo.json` vào `firebase.json`. **Chỉ thêm, không đổi header của XOFA / The Cafe 33.**
4. Tạo `tools/site_files.txt` liệt kê file chính của XOFA / The Cafe 33, để kiểm tra chặn deploy nhầm làm mất file của họ.
5. Ghi `v1 2026-MM-DD` (ngày deploy) vào `tools/engine_releases.txt`.
6. `sh tools/predeploy_check.sh` → phải báo `=> ĐƯỢC DEPLOY` → `firebase deploy --only hosting`. Nên làm ngoài giờ bán, mọi máy tải lại cùng lúc (giờ máy chủ và mốc B9, mục 6.5).
7. Thử tay trên máy thật:
   - checklist 5.3;
   - bán / xoá bill;
   - mở tem, báo hết, báo huỷ;
   - mẻ BTP: bắt đầu → đối chiếu NL → hoàn thành / huỷ;
   - kiểm kê BTP cuối ca, cân cuối ca;
   - Quản lý: sửa phiếu nhận, chỉnh tồn BTP, cân lại mã;
   - ly tem;
   - mở app khi **mất mạng** (so với mốc E0).
8. Sau khi mọi máy POS đã tải lại: xoá node RT `session_display_gieogieo` (K0). Dọn rác `myGifts.__free_stamp__*` bằng `tools/don_myGifts_free_stamp.js` (F4, mặc định chạy thử).
9. Quay lui: sửa **cả hai** HTML trỏ về bản HTML trước phiên, rồi deploy lại (mục 6.6). Dữ liệu mới chỉ **thêm** trường (`storeId`, `amendments`, mốc B9 phía Quản lý), bản cũ đọc bình thường.

## 15. F6 — Nhập kho nhanh (Quản lý) cộng vào tồn kho nguồn (chủ dự án duyệt)

- So lại code: khác biệt **thật sự xảy ra** chỉ một chỗ — Quản lý "Nhập kho nhanh" món KHÔNG tem có quy tắc refill: `currentStock` tăng nhưng `locationStock` kho nguồn không tăng (POS nhận hàng thì cộng). Các khác biệt khác không chạy tới (RECEIVING món có tem đã bị form chặn) hoặc Quản lý chi tiết hơn (loại Sổ lệch theo nơi gọi — giữ). Đính chính mục 13 cũ: "`anomalyKind` để trống" là sai.
- Sửa: `ledger.applyManual` — RECEIVING món không tem cộng `locationStock.{kho nguồn}` theo quy tắc refill (y POS, `max(0, …)`). Chỉnh tồn tay / duyệt kiểm kho **không đổi**.
- Quản lý: nạp quy tắc refill trước khi nhập hàng (`_qlEnsureRefillRulesForEngine`); thêm/sửa/bật-tắt/xoá quy tắc thì xoá bộ nhớ quy tắc (trước đây nạp 1 lần, không bao giờ làm mới).
- Test: `tests/f6_receiving.test.js`.

## 16. Chế độ thử (chủ dự án yêu cầu — ngoài kế hoạch E/M)

- Mục đích: thử bản mới trên hệ thống đang chạy thật mà không đụng dữ liệu / máy thật. Hướng dẫn: `docs/CHE_DO_THU.md`.
- Chủ dự án chọn: **file `_thu` khoá cứng chế độ thử** (app thật không có công tắc); dữ liệu đầu **chép từ thật** (danh mục + cấu hình + tồn hiện tại, không chép bill/sổ/khách); **khách test riêng** (SĐT giả).
- Mới: `che_do_thu.v1.js` (chuyển hướng Firestore/RT/Storage/localStorage vào `__test_gieogieo`, chép từ thật, xoá vùng thử, fail-closed); `tools/tao_ban_thu.js` (sinh `posgieo_thu.html` / `quanlygieo_thu.html` vào thư mục deploy, không đụng bản thật); `tests/che_do_thu.test.js`.
- `quanlygieo.html`: 3 chốt cho đường REST đi thẳng (`_ddShallow`, upload / xoá ảnh dụng cụ) — chỉ có tác dụng khi `GieoThu` bật; app thật không nạp nên không đổi hành vi.
- `tools/predeploy_check.sh <thư mục deploy>`: chạy từ thư mục làm việc; chấp nhận app thật là bản cũ trong giai đoạn thử; **chặn** nếu app thật bị chép đè bằng bản thử, bản thử thiếu file / chốt; nhắc nếu `tools/`, `tests/`, `docs/`, `CLAUDE.md` nằm trong thư mục deploy (bị công khai).
- `tools/firebase_headers_gieogieo.json`: thêm header cho `che_do_thu.v*.js` và `*_thu.html`.
- Kiểm chứng: 24 kịch bản giao diện chạy ở chế độ thử — dữ liệu thật không đổi, 0 lượt ghi lọt (thử phá cố ý: 17 kịch bản báo đỏ); Chromium thật + SDK Firebase 10.13.2 thật (project giả, chặn mạng): chuyển hướng đúng, thiếu file thì dừng trước `initializeApp`.
- **Thay cho mục 14**: quy trình deploy giờ là bản thử trước (mục 2 `docs/CHE_DO_THU.md`), thử xong mới lên chính thức (mục 6).
- **Chủ dự án giữ nguyên cách để file** (một thư mục deploy như trước). Claude sinh sẵn 4 file bản thử (`posgieo_thu.html`, `quanlygieo_thu.html`, `unit_engine.v1.js`, `che_do_thu.v1.js`) — chủ dự án chỉ chép vào cạnh `posgieo.html` rồi deploy. `tao_ban_thu.js` do Claude chạy (từ code mới); trong thư mục deploy của chủ dự án KHÔNG chạy nó lúc thử (hai file thật còn bản cũ). `predeploy_check.sh` chỉ dùng khi lên chính thức.

## 17. Kết quả chủ dự án thử bản thử (28/09/2026) + sửa huỷ mẻ

- Đạt: xoá bill có hoàn + nhập kho in tem; huỷ mẻ đã nấu ghi hao hụt; sửa phiếu nhận; nhập kho nhanh + chỉnh tồn NL.
- **Lỗ hổng (có từ trước phiên, không do bản mới)**: huỷ mẻ không hoàn NL đã lấy qua **cân đối chiếu** (cố ý — có thể đã đổ vào nồi), nhưng thông báo lại ghi "lô này không trừ nguyên liệu nào" → hiểu lầm; bấm nhầm thì NL mất khỏi tồn.
- **Sửa (chủ dự án chốt, 2 lượt)**: màn Huỷ mẻ có khối "Nguyên liệu đã cân lấy ra", hỏi **RIÊNG từng NL**:
  - **Đã hoàn trả** → BẮT cân lại (đếm lại) từng mã; hoàn = số cân lại − tồn mã lúc cân, kẹp ≤ lượng đã lấy của mã (cân vô lý → bắt cân lại); phần lấy mà không trả lại được (trả thiếu, mã đã báo hết) → **HAO HỤT**.
  - **Không thể hoàn trả** → toàn bộ lượng đã lấy của NL đó → **HAO HỤT** (không cần cân). NL chỉ có mã đã báo hết → tự động "không thể hoàn trả".
  - Sổ: **không thêm dòng mới** — sửa CÓ VẾT (`ledger.amend`, `amendments[]`) 2 dòng của bước đối chiếu: `prep_after_{mẻ}_{NL}` (CONSUMPTION −dùng → qty −(dùng − phần trả); còn > 0 thì type **WASTE**, `reclassifiedFrom: CONSUMPTION`) và `prep_variance_{mẻ}_{NL}` (chỉ giảm khi phần trả vượt phần dùng). Tổng sổ luôn = −(lượng lấy − phần trả) = đúng hàng mất.
  - Mã: phần trả cộng vào đúng mã (RT, chống đúp theo op trên node), rồi suy tồn theo mã. Lô lưu `cancelReconAnswer` {NL: câu trả lời}, `cancelReconWeighed`.
  - Mẻ không có NL đối chiếu: luồng cũ không đổi. Engine: `prep.cancelSettleRecon(batchId, itemId, o)`. Test: `tests/huy_me_can_lai.test.js` (gồm trả vượt phần dùng, chống ghi đúp, chế độ thử).
- Bản thử gắn mã nội dung `?b=…` vào đường dẫn engine / che_do_thu → máy thử luôn tải engine mới (engine v1 chưa chạy ở app thật nên sửa tại chỗ được; từ khi v1 lên chính thức thì đổi engine = file v2).
- ~~Còn mở: NL đã đổ vào nồi rồi huỷ mẻ~~ → đã chốt: thành HAO HỤT (xem trên).
