# Feature Map & Object Map — `quanlygieo.html`

Tài liệu tham chiếu cho kế hoạch cải tổ UX/IA (`kehoachcaitoquanlygieo1.md`). Cập nhật khi có thay đổi lớn về navigation, object mới, hoặc khi một Phase trong kế hoạch được triển khai. **Không phải tài liệu lịch sử** — sửa đè lên phần cũ, đừng cộng dồn "changelog" ở đây (git log đã làm việc đó).

Quét lần đầu: 2026-09-08. File gốc: `quanlygieo.html` (~23.000 dòng, single-file HTML/CSS/JS, backend Firebase — Firestore do app này sở hữu, Realtime Database chỉ đọc từ app POS).

---

## 1. Feature Map

Cột "Trạng thái" đối chiếu với 26 Phase của kế hoạch cải tổ, không phải đánh giá chất lượng code.

| Feature | Vị trí hiện tại | Object chính | UI risk | Trạng thái |
|---|---|---|---|---|
| Hôm nay · Sức khoẻ quán (Control Tower) | `switchScreen('today')`, `screen-today` | tổng hợp | thấp | 🟢 Đã đúng — gộp "Hôm nay" + "Sức khoẻ quán" thành 1 màn, đúng tinh thần Phase 18 |
| Hộp thư cảnh báo (Alert Inbox) | `switchScreen('inbox')`, `renderAlertInbox()` | alerts_gieogieo | thấp | 🟢 Đã có, đang nhận 5 loại alert (xem Object Map §Alert) |
| Sức khỏe tài chính / Báo cáo kỳ / Phân tích bán hàng / Khách hàng | nhóm **Báo cáo** | doanh thu, COGS, khách | thấp | 🟢 Đã đúng nhóm |
| Ghi chú ngày / Chi phí / Tiền mặt | nhóm **Vận hành** | ca, chi phí | thấp | 🟢 Đã đúng nhóm |
| **Lịch sử bill** | `screen-bills`, HTML 1580‑1583, JS 10222‑10744 | Bill (RTDB `orders`) | 🔒 **PROTECTED** | ⚪ Không đụng UI — chỉ đọc/tham chiếu |
| Nguyên liệu (danh mục + tồn) | `goKho('items')`, `renderKhoItems()` | Nguyên liệu | thấp | 🟢 |
| **Giải thích tồn kho (Stock Explanation)** | trong sheet "Lịch sử" mở từ nút 🕐 ở Nguyên liệu/BTP — `_histBreakdownHtml()` | Nguyên liệu, BTP | thấp | 🟢 **Mới thêm 2026-09-08** (Phase 9) — xem §3 |
| Chế biến cấp 1 (BTP), Dụng cụ đựng, Bao bì, GOGS Topping | nhóm con trong **Kho** | BTP, vessel, bao bì | thấp | 🟢 |
| Đặt & nhận hàng (PO), Kiểm kê, Hàng đang mở & tem (container), Refill, Tồn theo vị trí, Lịch sử kho | nhóm con **Kho** | PO, kiểm kê, container | thấp | 🟢 |
| Vị trí kho, Lý do hao hụt, Checklist ca, Nhập danh mục từ Excel | nhóm con **Kho** (đẩy xuống cuối, coi là cấu hình) | cấu hình kho | thấp | 🟢 — đã tách khỏi việc kho hằng ngày (xem comment dòng 8507‑8515) |
| Lệch kho & định lượng | `goKho('lechkho')`, `renderKhoLech()` | Nguyên liệu, recipe | thấp | 🟢 Đã có, khác Stock Explanation ở chỗ: đối chiếu **lý thuyết (POS trừ theo định mức) vs thực tế (2 lần đếm tay)** theo kỳ, không phải "tồn hiện tại từ đâu ra" tức thời. Hai tính năng bổ sung nhau, KHÔNG trùng — xem §3. |
| Dự báo & số mẻ | `goKho('dubao')` | BTP, mẻ nấu | thấp | 🟢 |
| Ngày đặc biệt, Trích xuất dữ liệu | nhóm **Phân tích & dữ liệu** | | thấp | 🟢 |
| Nhân viên, Lịch làm việc, Chấm công, Lương, Nhắc nhở | nhóm **Nhân sự** | Nhân viên | thấp | 🟢 |
| Tài sản, Mục tiêu, Mô phỏng (What-if), Dọn dữ liệu | nhóm **Cấu hình** | | thấp | 🟢 — "Mô phỏng" đã tồn tại, đáp ứng một phần Phase 17 (nhưng mới cho labor sim, chưa cho recipe/định lượng — xem §4) |
| **Quản lý Menu** | `screen-mn`, HTML 1593‑1617, JS ~20698‑21440 | Món, Topping | 🔒 **PROTECTED** | ⚪ Không đụng UI |
| Định mức món (recipe), GOGS Món | nhóm **Menu & Khuyến mãi** (không để trong Kho — đúng quyết định ở comment dòng 8557‑8561) | recipe, món | thấp | 🟢 |
| **Khuyến mãi** | `screen-tg`, HTML 1439‑1578 | chương trình KM | 🔒 **PROTECTED** | ⚪ Không đụng UI |
| Trợ lý bán hàng | `screen-assist` (nằm giữa hai tab protected nhưng KHÔNG protected) | | thấp | 🟢 |
| Kiểm toán | nhóm **Kiểm toán** | | thấp | 🟢 |
| Tìm nhanh sidebar (`navSearch`, Ctrl/⌘+K) | `onNavSearch()` / `renderSidebarNav()` | nhãn nav + **Nguyên liệu, BTP** | thấp | 🟡 **Mở rộng 2026-09-08** — gõ ≥2 ký tự giờ tìm cả tên nguyên liệu/BTP (không chỉ 40+ nhãn nav), mỗi kết quả có nút "Giải thích tồn kho" đi thẳng vào Phase 9. Còn thiếu Bill/Nhân viên/Transaction như Phase 4 mô tả đầy đủ |
| Breadcrumb-lite (`hdrKicker`/`hdrTitle`) | `switchScreen()` dòng ~9342 | | thấp | 🟡 Có 2 tầng (Nhóm › Mục), không phải breadcrumb bấm được từng cấp; không có deep link / URL hash |
| Context Navigation (tab liên quan ngay tại object) | sheet "Lịch sử" (nút 🕐) ở Nguyên liệu | Nguyên liệu | thấp | 🟡 **Một phần, mới thêm 2026-09-08** — sheet 🕐 giờ gộp sẵn Container đang mở CỦA ĐÚNG món đó + Giải thích tồn kho + Giao dịch trong cùng một chỗ (không cần rời khỏi Nguyên liệu). Còn thiếu: chưa gắn Kiểm kê/Lệch kho ngay tại đây, và BTP/các object khác chưa có tương tự |
| Related Actions | rải rác, vd. nudge "Duyệt phiếu kiểm kê" trong Lệch kho, nút "Khai định mức" khi thiếu recipe | | | 🟡 Có từng phần theo ngữ cảnh nhưng không nhất quán theo mọi màn |
| Recent & Favorites | — | — | — | 🔴 **Chưa có** |
| Transaction Drill-down | breakdown → `histSetFilter(type)` lọc đúng loại giao dịch trong cùng sheet | Nguyên liệu, BTP | thấp | 🟡 **Một phần, mới thêm 2026-09-08** — bấm vào một dòng breakdown thì lọc ra đúng các giao dịch loại đó (ngày giờ, nhân viên, ghi chú, tồn còn lại), nhưng CHƯA nhảy được tới đúng PO/bill/waste-record gốc (referenceId) |
| Integrity Rules → Alert Inbox (Phase 11) | `runDataIntegrityCheck()` (đã có sẵn, Giai đoạn 12) giờ hiện ngay đầu Hộp thư cảnh báo | Nguyên liệu, Recipe, Refill, PO | thấp | 🟡 **Nối lại 2026-09-08** — kiểm tra tham chiếu hỏng + tồn kho âm vốn chỉ nằm ở tab Kiểm toán, giờ hiện luôn ở Hộp thư (nút "Kiểm tra ngay", dùng chung state với Kiểm toán). Vẫn CHƯA có rule "Ledger ≠ Container" (cộng số so sánh, khác với việc liệt kê container đang mở đã làm ở Phase 5), "GOGS Integrity" (bill hoàn tất chưa có consumption) |
| Idempotency chuẩn hoá (Phase 12) | `referenceId` đã dùng ở nhiều nơi (vd. dòng 10628, 10666) nhưng không có pattern thống nhất tài liệu hoá | | | 🟡 Có nền tảng, chưa chuẩn hoá thành quy ước chung |
| Versioning recipe/định lượng (Phase 15) | `recipes_gieogieo` không thấy field version | | | 🔴 Chưa có |
| Simulation cho recipe (Phase 17) | `screen-sim` mới có labor/targets, chưa có "đổi định lượng → xem GOGS dự kiến" | | | 🟡 Một phần |
| Branch Health (Phase 18) | chưa xác nhận multi-branch trong data model hiện tại | | | ⚪ Chưa xác định — cần kiểm tra có field chi nhánh không trước khi làm |

Chú thích trạng thái: 🟢 đã đúng vị trí · 🟡 có nhưng chưa đủ như kế hoạch mô tả · 🔴 chưa có · ⚪ protected/chưa xác định.

**Không phát hiện chức năng trùng/chồng (🔴 loại "duplicate")** giữa các feature hiện có — điểm đáng chú ý duy nhất là ranh giới giữa **Lệch kho & định lượng** và **Giải thích tồn kho** (mới thêm), đã ghi rõ khác biệt ở trên để tránh hiểu nhầm là trùng nhau.

---

## 2. Object Map

| Object | Điểm truy cập hiện có |
|---|---|
| **Nguyên liệu** | Kho → Nguyên liệu (danh sách, sửa tồn, sửa thông tin) · nút 🕐 → Lịch sử + **Giải thích tồn kho** + **Container đang mở của đúng món này** (cả hai mới) · Kho → Lệch kho & định lượng (đối chiếu theo kỳ) · Kho → Kiểm kê · Kho → Đặt & nhận hàng · Menu & Khuyến mãi → Định mức món (recipe dùng nguyên liệu) · Tra giá theo ngày (cuối màn Nguyên liệu) · Tìm nhanh sidebar (mới) |
| **BTP (Chế biến cấp 1)** | Kho → Chế biến cấp 1 · nút 🕐 → Lịch sử + Giải thích tồn kho (mới, dùng chung `_histRender`) · Kho → Lịch sử kho (chip "Bán thành phẩm") |
| **Container (chai/tem)** | Kho → Hàng đang mở & tem (`ctnFilter`: cần soát / hết hạn / chưa dán tem / đang mở / tất cả) |
| **Sản phẩm / Menu** | 🔒 Quản lý Menu (protected) · Định mức món · GOGS Món |
| **Bill** | 🔒 Lịch sử bill (protected) |
| **Nhân viên** | Nhân sự → Nhân viên, Lịch làm việc, Chấm công, Lương |
| **Ca làm** | Vận hành → Tiền mặt (giao ca) · Kho → Checklist ca |
| **Chi nhánh** | Chưa xác nhận có trong data model — cần kiểm tra trước khi làm Phase 18 |
| **Nhà cung cấp** | Kho → Đặt & nhận hàng (field `supplier` trên PO) — chưa có màn quản lý nhà cung cấp riêng |

Object "Nguyên liệu" hiện có điểm truy cập gần nhất với ví dụ trong kế hoạch (mục 3, "Sữa tươi"): Tổng quan (dòng trong danh sách) · Tồn kho (cùng dòng) · Giao dịch + Giải thích tồn kho + **Container** (cả ba trong cùng sheet 🕐 — xem §3) · Kiểm kê (Kho → Kiểm kê, lọc theo món) · Lệch kho (Kho → Lệch kho). Còn thiếu: **Giá nhập** ngay tại từng dòng (có "Tra giá theo ngày" nhưng là block riêng cuối trang, chưa gắn theo từng dòng nguyên liệu) và **Kiểm kê/Lệch kho** chưa có link/tab trực tiếp từ trong sheet 🕐 — vẫn phải quay ra Kho.

---

## 3. Đã triển khai trong phiên này (2026-09-08)

**Phase 9 — Stock Explanation**, đặt trực tiếp vào sheet "Lịch sử" đã có (mở từ nút 🕐 ở Nguyên liệu và Chế biến cấp 1 — dùng chung `_histRender()`), không tạo màn mới:

- Khối "🔍 Tồn hiện tại hình thành từ" cộng dồn ledger (`stock_transactions_gieogieo` / `prep_transactions_gieogieo`) theo từng loại giao dịch (Nhập kho / Chuyển kho / Bán ra / Hao hụt / Điều chỉnh / Đặt tồn vị trí / Nấu ra lô...), badge 🟢 khớp / 🟡 có phần chưa qua sổ.
- Phần dư (currentStock − tổng ledger đã tải) **không bị gán nhãn WASTE** — hiển thị trung tính là "số dư chưa qua sổ kho (thường là tồn khai tay lúc tạo món)", đúng nguyên tắc ở mục "Nguyên tắc" của kế hoạch.
- Giới hạn nói rõ trong UI: `_histLoad` chỉ tải tối đa 400 giao dịch gần nhất (hoặc bản rút gọn khi thiếu Firestore index) — nếu chạm giới hạn, khối giải thích tự cảnh báo số liệu có thể chưa đầy đủ thay vì im lặng đưa ra con số sai.
- **Transaction Drill-down (Phase 10, một phần)**: bấm vào một dòng trong khối breakdown lọc đúng loại giao dịch đó trong danh sách bên dưới (tái dùng cơ chế `histSetFilter`/chip có sẵn, không tạo bộ lọc song song).
- Không đổi schema Firestore, không thêm collection mới, không đụng 3 tab protected.

File thay đổi: `quanlygieo.html`, hàm mới `_histTypeLabel`, `HIST_EXTRA_TYPE_LABEL`, `HIST_TYPE_ORDER`, `_histTypeBreakdown`, `_histBreakdownHtml` (khoảng dòng 20085‑20152); sửa `_histRender()` để chèn khối này + hỗ trợ lọc theo type chính xác.

**Phase 4 — Command Search ("Find Anything"), một phần**, mở rộng ngay ô tìm sidebar đã có (`onNavSearch`/`renderSidebarNav`), không tạo ô tìm/màn tìm kiếm riêng:

- Gõ ≥2 ký tự (đã bỏ dấu) giờ tìm thêm trong `INVENTORY_ITEMS`/`PREP_ITEMS` (tên nguyên liệu, tên BTP), không chỉ 40+ nhãn mục điều hướng như trước. Kết quả hiện dưới nhóm "Tìm thấy trong dữ liệu", kèm tồn hiện tại và hai nút: **Giải thích tồn kho** (mở thẳng khối vừa làm ở Phase 9) và **Xem danh mục** (tới Kho → Nguyên liệu/Chế biến cấp 1).
- `INVENTORY_ITEMS`/`PREP_ITEMS` bình thường chỉ có dữ liệu sau khi đã từng mở đúng màn Kho tương ứng — thêm `_ensureSearchIndexes()` tải nền hai mảng này ngay khi người dùng bắt đầu gõ tìm (dùng `ensureAuth()` + cache 20s sẵn có của `loadInventoryItems`/`loadPrepItems`, không đọc lại Firestore nếu đã có), và tự vẽ lại kết quả khi tải xong. Trong lúc chờ, ô tìm nói rõ "Đang tải dữ liệu…" thay vì im lặng báo "không tìm thấy".
- Chưa tìm được Bill/Nhân viên/Transaction như ví dụ đầy đủ trong kế hoạch — xem mục 1 ở §4.

File thay đổi: `quanlygieo.html`, hàm `renderSidebarNav()` (thêm khối kết quả dữ liệu), `onNavSearch()`, hàm mới `_ensureSearchIndexes()` (khoảng dòng 8656‑8750).

**Phase 5 — Context Navigation, một phần**, vẫn trong cùng sheet "Lịch sử" (nút 🕐 ở Nguyên liệu):

- Thêm khối "📦 Đang mở & tem" hiện đúng các container (`stock_containers_gieogieo`) đang mở CỦA RIÊNG món đang xem — trước đây phải rời Nguyên liệu, qua hẳn màn Container rồi tự dò trong danh sách lẫn lộn mọi món. Chỉ tải khi món có bật dán tem (`itemTrackingMode !== 'none'`) — đa số nguyên liệu không dùng tem nên không tốn lượt đọc thừa.
- Lọc phía client trên danh sách "đang mở" đã có sẵn (vốn chỉ vài chục bản ghi — xem `loadContainersFor`), **không** thêm `where('itemId',...)` mới để khỏi phải tạo composite index Firestore mới.
- Nút "Xem màn Container" đóng sheet rồi điều hướng sang màn Container đầy đủ (`goContainers('open')`) cho ai cần thao tác (đánh dấu đã xem, v.v.) — sheet chỉ để XEM nhanh, không thay thế quy trình xử lý container hiện có.
- Sheet 🕐 giờ gộp: Tồn hiện tại → Container đang mở → Giải thích tồn kho → Lịch sử giao dịch, đúng tinh thần "các chức năng liên quan phải ở gần đối tượng đó" — chỉ còn thiếu Kiểm kê/Lệch kho chưa có link tại chỗ.

File thay đổi: `quanlygieo.html`, hàm mới `_histContainerHtml` (khoảng dòng 20166‑20188), sửa `openItemHistory()` để tải song song container cùng lịch sử giao dịch.

**Phase 11 — Integrity Rules → Alert Inbox**, nối một kiểm tra ĐÃ CÓ SẴN từ trước (không viết rule mới) vào đúng nơi kế hoạch yêu cầu:

- `runDataIntegrityCheck()` (viết từ "Giai đoạn 12", rà tham chiếu hỏng ở recipe/refill rule/PO trỏ tới nguyên liệu hoặc vị trí đã xoá, cộng tồn kho âm) trước đây CHỈ hiện ở tab Kiểm toán — nơi chủ quán hiếm khi ghé trừ khi chủ động đi tìm. Giờ thêm thẻ "🔍 Kiểm tra toàn vẹn dữ liệu" ngay đầu **Hộp thư cảnh báo** — đúng màn chủ quán vào mỗi ngày để xử lý vấn đề.
- Dùng chung biến trạng thái `auditIntegrityIssues` với tab Kiểm toán (không tạo state song song) — chạy kiểm tra ở nơi nào thì nơi kia thấy kết quả ngay, khỏi chạy hai lần cho cùng dữ liệu.
- Vẫn chạy theo yêu cầu (nút "Kiểm tra ngay"), **không tự động** — giữ đúng lý do bản gốc thiết kế thủ công: hàm này đọc 5 collection, mà Hộp thư là màn được mở nhiều nhất trong ngày.
- Chưa thêm rule mới nào (Ledger≠Container dạng cộng số, GOGS Integrity, Container Integrity, Recipe Integrity theo đúng nghĩa kế hoạch liệt kê) — chỉ kết nối lại cái đã có.

File thay đổi: `quanlygieo.html`, hàm mới `integrityCheckCardHtml()`, `runIntegrityCheckFromInbox()` (khoảng dòng 9804‑9850), sửa `renderAlertInbox()` để chèn thẻ này ở cả hai nhánh (có/không có alert).

**Giới hạn đã biết, chưa làm trong phiên này:**
- Chưa đối chiếu Ledger vs **Container** (tồn vật lý theo chai/tem) như ví dụ "🟢 KHỚP / 🟡 Có chênh lệch" trong kế hoạch — khối Container ở Phase 5 mới chỉ LIỆT KÊ container đang mở, chưa CỘNG SỐ để so với tồn ledger. Cần hiểu rõ `untrackedBase`/trạng thái container trước khi làm phép cộng này cho đúng.
- Chưa có rule Integrity MỚI nào (Ledger≠Container, GOGS Integrity, Container Integrity, Recipe Integrity đúng nghĩa) — chỉ mới kết nối lại kiểm tra sẵn có.
- Command Search mới tìm Nguyên liệu/BTP, chưa tìm Bill/Nhân viên/Transaction.
- Context Navigation mới có ở Nguyên liệu (qua sheet 🕐), chưa có ở BTP/Container/Bill/Nhân viên.
- Chưa test trên trình duyệt thật với dữ liệu Firebase thật (không có quyền truy cập project Firebase `the-cafe-33` trong phiên này) — mới kiểm tra bằng `node --check` (cú pháp hợp lệ) và đọc code đối chiếu thủ công. **Cần người quản lý mở thử trên trình duyệt trước khi tin tưởng hoàn toàn** — đặc biệt: mở Hộp thư cảnh báo, bấm "Kiểm tra ngay" ở thẻ đầu trang và xem có ra đúng danh sách như khi bấm nút tương tự ở tab Kiểm toán không; mở sheet 🕐 của một nguyên liệu CÓ dán tem đang mở chai, xem khối Container có hiện đúng chai đó không; và gõ tìm tên một nguyên liệu, bấm "Giải thích tồn kho" có mở đúng sheet không.

---

## 4. Đề xuất việc tiếp theo (chưa làm)

Theo đúng thứ tự ưu tiên của kế hoạch, các hạng mục ⭐⭐⭐⭐⭐/⭐⭐⭐⭐ còn thiếu nhiều nhất:

1. **Command Search — mở rộng thêm** (Phase 4) — thêm Bill (số bill, SĐT khách) và Nhân viên vào cùng cơ chế tìm ở §3, giữ đúng nguyên tắc "vẫn một ô tìm, không tạo màn riêng".
2. **Context Navigation — mở rộng thêm** (Phase 5) — thêm link nhanh tới Kiểm kê/Lệch kho ngay trong sheet 🕐; và làm tương tự cho BTP (container không áp dụng cho BTP nhưng Kiểm kê/Lệch kho thì có).
3. **Integrity Rules — thêm rule mới** (Phase 11) — "Ledger ≠ Container" (đối chiếu số, không chỉ liệt kê), "GOGS Integrity" (bill hoàn tất chưa có consumption tương ứng) — bổ sung vào `runDataIntegrityCheck()` đã nối vào Alert Inbox ở §3, không tạo dashboard riêng.
4. Container reconciliation cho Giải thích tồn kho (nối tiếp việc đã làm ở §3) — sau khi hiểu rõ `untrackedBase`/trạng thái container. Cùng gốc dữ liệu với mục 3.
