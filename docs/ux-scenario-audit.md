# UX Scenario Audit — Phase 20

Kế hoạch cải tổ UX yêu cầu Phase 20: tạo 20-30 tình huống thực tế, người quản lý phải tìm được tính năng **mà không cần hỏi AI**, đo số click, tìm màn hình gây "lạc đường".

**Giới hạn thật của tài liệu này — đọc trước khi tin:** đây là một lượt "đọc lạnh" (cold read) do tôi (Claude) tự đi qua từng tình huống bằng cách đọc code (`NAV_SECTIONS`, các hàm render), **không phải người dùng thật ngồi bấm trên trình duyệt**. Tôi biết trước cấu trúc hệ thống nên không thể đóng vai "người không biết gì" một cách trung thực — kế hoạch gốc đòi hỏi đúng việc tôi không làm được. Coi tài liệu này là **danh sách kiểm tra + phát hiện lỗ hổng rõ ràng**, không phải bằng chứng thay thế cho việc để một quản lý thật ngồi thử.

Cột "Số click" đếm từ màn "Hôm nay" (mặc định lúc mở app), không tính lúc gõ tìm kiếm.

---

## Bảng tình huống

| # | Tình huống | Đường đi | Số click | Đánh giá |
|---|---|---|---|---|
| 1 | Tại sao sữa tươi bị lệch? | Ctrl+K gõ "sữa" → bấm "Giải thích tồn kho" → xem breakdown + khối "Đối chiếu sổ kho với tem" | 2 | 🟢 |
| 2 | Nhân viên A hôm qua đã ghi hao hụt (WASTE) những gì? | Kho → Lịch sử kho → ô lọc "Lọc theo tên nhân viên" | 2 | 🟢 **Đã sửa cùng ngày** — chỉ trong phạm vi gần đây (xem "Cập nhật" cuối trang) |
| 3 | Xem container sữa đang mở, ai mở, hạn tới bao giờ | Ctrl+K gõ "sữa" → mở sheet 🕐 → khối "Đang mở & tem" | 2 | 🟢 |
| 4 | Bill #1023 đã trừ kho chưa? | Lịch sử bill (protected) → mở bill → **chưa xác minh được** màn chi tiết bill có hiện thẳng "đã trừ kho" hay không (chưa đọc lại toàn bộ `qlBillDetailHTML`) | ? | 🟡 **Cần xác minh** — hướng NGƯỢC (transaction→bill) đã làm ở Phase 10, hướng THUẬN (bill→có trừ kho không) chưa xác nhận có sẵn hay chưa |
| 5 | Kiểm kê bán thành phẩm (BTP) — duyệt phiếu ở đâu? | Kho → Kiểm kê chỉ có hàng đợi duyệt của **Nguyên liệu** (`stock_counts_gieogieo`, field `itemId`) | — | 🔴 **Không rõ ràng** — BTP đếm cuối ca bằng cơ chế khác (ghi đè thẳng, sinh alert `prep_count_variance`), không qua hàng đợi duyệt như Nguyên liệu. Người mới vào Kho → Kiểm kê tìm BTP sẽ không thấy, dễ tưởng thiếu tính năng |
| 6 | Nguyên liệu nào sắp hết? | Hôm nay (nudge có sẵn) hoặc Kho → Nguyên liệu (tự tô "Sắp hết") | 1 | 🟢 |
| 7 | Tại sao tồn kho hôm nay thay đổi (tổng quát)? | Hôm nay → "Hoạt động kho hôm nay" (mở/báo hết) hoặc Kho → Lịch sử kho | 1-2 | 🟢 |
| 8 | Xem transaction làm thay đổi tồn của 1 món | Ctrl+K → sheet 🕐 → cuộn xuống danh sách giao dịch | 2 | 🟢 |
| 9 | Kiểm tra một điều chỉnh (ADJUSTMENT) cụ thể | Sheet 🕐 → bấm dòng "Điều chỉnh KK" trong breakdown → lọc ra | 3 | 🟡 Lọc được nhưng **chưa nhảy tới đúng phiếu kiểm kê gốc** (referenceId có, chưa làm nút "Xem phiếu" như đã làm cho Bill ở Phase 10) |
| 10 | Xem chênh lệch của chi nhánh khác | — | — | ⚫ N/A — quán chỉ có 1 địa điểm (đã xác nhận qua `posgieo.html`) |
| 11 | Hôm nay có việc gì cần xử lý ngay? | Màn mặc định lúc mở app | 0 | 🟢 |
| 12 | Nhân viên X hôm nay làm ca nào? | Nhân sự → Lịch làm việc (hoặc Ctrl+K → tên NV → không có link thẳng tới lịch của ngày cụ thể) | 2 | 🟡 Tới được màn nhưng phải tự tìm đúng ngày/tên trong danh sách |
| 13 | Giá nhập sữa tuần trước là bao nhiêu? | Kho → Nguyên liệu → khối "Tra giá theo ngày" cuối trang | 2 | 🟡 Đúng tính năng nhưng là khối RIÊNG cuối trang, không gắn theo từng dòng nguyên liệu (đã ghi trong Object Map từ đầu) |
| 14 | Món nào chưa khai định mức (recipe)? | Hộp thư cảnh báo (loại `missing_recipe`) HOẶC tự dò trong Kho → Định mức món | 1 | 🟢 nếu đã có cảnh báo; 🟡 nếu muốn chủ động rà soát toàn bộ (không có "danh sách món thiếu định mức" độc lập) |
| 15 | Khuyến mãi nào đang chạy? | Khuyến mãi (protected, nhóm Menu & Khuyến mãi) | 1 | 🟢 |
| 16 | Doanh thu hôm nay so với mục tiêu? | Hôm nay (control tower) | 0 | 🟢 |
| 17 | Ai đã duyệt phiếu kiểm kê hôm qua? | Kiểm toán → nhật ký (`auditLogList`, action "approve") | 1 | 🟢 nếu biết vào Kiểm toán; tên nhóm không gợi ý rõ "xem ai duyệt gì" |
| 18 | Container nào sắp hết hạn sau khi mở? | Kho → Container → tab "Quá hạn sau mở" | 2 | 🟢 |
| 19 | Nguyên liệu "sữa tươi" được dùng trong những món nào (recipe usage ngược)? | Ctrl+K → sheet 🕐 → khối "Dùng trong công thức nào" → bấm "Tải danh sách" | 3 | 🟢 **Đã sửa cùng ngày** — bấm mới quét (không tự động, xem "Cập nhật" cuối trang) |
| 20 | Xem lại toàn bộ hao hụt tháng này | Kho → Lịch sử kho, lọc "Hao hụt" theo khoảng ngày, hoặc Báo cáo kỳ | 2 | 🟢 |
| 21 | Chi phí tháng này bao nhiêu, khoản nào lớn nhất? | Vận hành → Chi phí, hoặc Báo cáo kỳ | 1 | 🟢 |
| 22 | Có cảnh báo tồn kho ≠ tem (Ledger≠Container) nào chưa xử lý? | Hộp thư cảnh báo → thẻ "Kiểm tra toàn vẹn dữ liệu" | 1-2 | 🟡 Thẻ này chỉ báo tham chiếu hỏng + tồn âm; **KHÔNG tự động quét Ledger≠Container cho mọi món** — phải mở từng sheet 🕐 mới thấy. Xem mục 4 ở "Việc tiếp theo" |
| 23 | Tìm nhanh nguyên liệu "trân châu" đang còn bao nhiêu | Ctrl+K → gõ tên | 1 | 🟢 |
| 24 | Mở lại đúng màn đã xem sáng nay (vd Lệch kho) mà không nhớ đường | Sidebar → "Gần đây" | 1 | 🟢 (mới làm Phase 8) |
| 25 | Chia sẻ link "xem Kiểm kê" cho đồng nghiệp qua Zalo | Copy URL đang có `#kho:stockcount`, dán gửi | 0 (đã có sẵn) | 🟢 (mới làm Phase 7) |

---

## Tổng kết

- **20/25 (80%) mượt** (🟢, sau khi sửa #2 và #19 cùng ngày) — không cần cải tổ thêm.
- **4/25 (16%) có ma sát** (🟡) — tới được nhưng vòng vèo hoặc thiếu link trực tiếp.
- **0/25 lỗ hổng còn treo** — cả hai lỗ hổng phát hiện được (#2, #19) đã sửa cùng ngày, xem "Cập nhật" cuối trang.
- **1 mục cần xác minh trên trình duyệt thật** (#4 — bill đã trừ kho chưa) trước khi kết luận có phải lỗ hổng hay không.
- **#9 và #22** không phải lỗ hổng mới mà là phần MỞ RỘNG của việc đã làm (Transaction Drill-down cho ADJUSTMENT, và tự động hoá rule Ledger≠Container) — đã có trong danh sách "việc tiếp theo" ở `feature-map.md`.

## Khuyến nghị

Không sửa gì trong lượt audit ban đầu (đúng tinh thần Sprint 6 — audit trước, sửa sau). Sau đó đã sửa cả hai lỗ hổng phát hiện được trong cùng phiên vì cả hai đều thấp rủi ro (dữ liệu/hàm nền đã có sẵn, chỉ thiếu UI/điểm vào).

**Cập nhật (cùng ngày, ngay sau audit):**
- **#2 đã sửa** — xem `feature-map.md` §3. Ô lọc theo tên nhân viên chỉ áp dụng cho phần "Nguyên liệu" của Lịch sử kho (nguồn `renderKhoHistItems`), lọc trong phạm vi GẦN ĐÂY đã tải (50 giao dịch/10 phiếu kiểm kho/15 phiếu nhận toàn cửa hàng), không phải audit toàn bộ lịch sử — không giải quyết trọn vẹn tình huống #2 cho trường hợp cần tra CŨ hơn phạm vi đó, nhưng đáp ứng đúng nhu cầu thường gặp nhất ("gần đây nhân viên này có ghi gì bất thường không").
- **#19 đã sửa** — xem `feature-map.md` §3. Thêm khối "Dùng trong công thức nào" vào sheet 🕐 (cả Nguyên liệu lẫn BTP) — quét `recipes_gieogieo` tìm dòng tham chiếu đúng `itemId`/`prepId` đang xem. Vì phải đọc cả collection (không lọc theo itemId được ở tầng Firestore do đây không phải field lập chỉ mục) nên để BẤM MỚI TẢI, không tự động chạy mỗi lần mở sheet.

Việc tiếp theo (còn treo, không phải từ audit này mà từ các phiên trước): mở rộng Command Search sang Bill, thêm rule Integrity mới (GOGS/Container/Recipe Integrity đúng nghĩa), Transaction Drill-down cho RECEIVING/WASTE/ADJUSTMENT — xem `feature-map.md` §4.
