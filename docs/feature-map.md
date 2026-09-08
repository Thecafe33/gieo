# Feature Map & Object Map — `quanlygieo.html`

Tài liệu tham chiếu cho kế hoạch cải tổ UX/IA (`kehoachcaitoquanlygieo1.md`). Cập nhật khi có thay đổi lớn về navigation, object mới, hoặc khi một Phase trong kế hoạch được triển khai. **Không phải tài liệu lịch sử** — sửa đè lên phần cũ, đừng cộng dồn "changelog" ở đây (git log đã làm việc đó).

Quét lần đầu: 2026-09-08. File gốc: `quanlygieo.html` (~23.000 dòng, single-file HTML/CSS/JS, backend Firebase — Firestore do app này sở hữu, Realtime Database chỉ đọc từ app POS).

Ngày 2026-09-08 (cùng ngày, phiên sau) đã đọc thêm `posgieo.html` (app POS — sibling app, ~22.100 dòng, dùng chung Firebase project `the-cafe-33`) để có bức tranh đầy đủ hai phía. Các kết luận quan trọng rút ra được ghi trực tiếp vào các mục liên quan bên dưới (đánh dấu "xem posgieo.html").

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
| Tìm nhanh sidebar (`navSearch`, Ctrl/⌘+K) | `onNavSearch()` / `renderSidebarNav()` | nhãn nav + **Nguyên liệu, BTP, Nhân viên** | thấp | 🟡 **Mở rộng 2026-09-08** — gõ ≥2 ký tự giờ tìm cả tên nguyên liệu/BTP/nhân viên (không chỉ 40+ nhãn nav); nguyên liệu/BTP có nút "Giải thích tồn kho" (Phase 9), nhân viên có nút tới Chấm công/Lương/Hồ sơ. Còn thiếu Bill/Transaction như Phase 4 mô tả đầy đủ |
| Breadcrumb & Deep Link (Phase 7) | `switchScreen()`, `tryOpenDeepLink()`, `updateUrlForNavKey()` | | thấp | 🟢 **Mới xong 2026-09-08** — xem §3. Tên nhóm ở `hdrKicker` giờ bấm được (quay về mục đầu nhóm đó); URL luôn có `#kho:items`/`#entry:nv`/... theo đúng màn đang đứng, mở link đó ra thẳng đúng màn |
| Context Navigation (tab liên quan ngay tại object) | sheet "Lịch sử" (nút 🕐) ở Nguyên liệu | Nguyên liệu | thấp | 🟡 **Một phần, mới thêm 2026-09-08** — sheet 🕐 giờ gộp sẵn Container đang mở CỦA ĐÚNG món đó + Giải thích tồn kho + Giao dịch trong cùng một chỗ (không cần rời khỏi Nguyên liệu). Còn thiếu: chưa gắn Kiểm kê/Lệch kho ngay tại đây, và BTP/các object khác chưa có tương tự |
| Related Actions | rải rác, vd. nudge "Duyệt phiếu kiểm kê" trong Lệch kho, nút "Khai định mức" khi thiếu recipe | | | 🟡 Có từng phần theo ngữ cảnh nhưng không nhất quán theo mọi màn |
| Recent & Favorites | Sidebar (dưới mục "Hôm nay") + nút ⭐ trên topbar | mọi nav key | thấp | 🟢 **Mới thêm 2026-09-08** — xem §3 |
| Transaction Drill-down | breakdown → `histSetFilter(type)` lọc đúng loại giao dịch trong cùng sheet | Nguyên liệu, BTP | thấp | 🟡 **Một phần, mới thêm 2026-09-08** — bấm vào một dòng breakdown thì lọc ra đúng các giao dịch loại đó (ngày giờ, nhân viên, ghi chú, tồn còn lại), nhưng CHƯA nhảy được tới đúng PO/bill/waste-record gốc (referenceId) |
| Integrity Rules → Alert Inbox (Phase 11) | `runDataIntegrityCheck()` (đã có sẵn, Giai đoạn 12) giờ hiện ngay đầu Hộp thư cảnh báo | Nguyên liệu, Recipe, Refill, PO | thấp | 🟡 **Nối lại 2026-09-08** — kiểm tra tham chiếu hỏng + tồn kho âm vốn chỉ nằm ở tab Kiểm toán, giờ hiện luôn ở Hộp thư (nút "Kiểm tra ngay", dùng chung state với Kiểm toán). Vẫn CHƯA có rule "GOGS Integrity" (bill hoàn tất chưa có consumption), "Container Integrity", "Recipe Integrity" đúng nghĩa kế hoạch |
| **Đối chiếu sổ kho với tem ("Ledger ≠ Container")** | trong sheet "Lịch sử" (nút 🕐) — `_histReconcileHtml()`, tái dùng `docTemConSongTheoMon()` | Nguyên liệu | thấp | 🟢 **Mới thêm 2026-09-08** — công thức đã có sẵn và đã kiểm chứng ở Kho → Container → Tồn lịch sử, chỉ hiện lại đúng con số đó tại sheet của từng món. Xem §3 |
| Idempotency chuẩn hoá (Phase 12) | `referenceId` đã dùng ở nhiều nơi (vd. dòng 10628, 10666) nhưng không có pattern thống nhất tài liệu hoá | | | 🟡 Có nền tảng, chưa chuẩn hoá thành quy ước chung |
| Versioning recipe/định lượng (Phase 15) | `recipes_gieogieo` không thấy field version | | | 🔴 Chưa có |
| Simulation cho recipe (Phase 17) | `screen-sim` mới có labor/targets, chưa có "đổi định lượng → xem GOGS dự kiến" | | | 🟡 Một phần |
| Branch Health (Phase 17) | — | — | — | ⚫ **Đã xác định 2026-09-08 — KHÔNG áp dụng**: đọc `posgieo.html` xác nhận quán chỉ có MỘT địa điểm, bán mang đi (comment gốc "Gieo Gieo chỉ bán mang đi", không table/dine-in), `firebaseConfig` khai một lần cho cả app, không có `branchId`/`storeId`/bộ chọn chi nhánh nào. `locationId` có tồn tại nhưng là vị trí lưu trữ TRONG một quán (quầy pha vs kho tổng), không phải nhiều quán. Bỏ khỏi backlog cho tới khi quán thật sự mở thêm chi nhánh |

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
| **Bill** | 🔒 Lịch sử bill (protected). Nguồn: RTDB `orders_gieogieo/{thángKey}/{ngày}` (xác nhận qua `posgieo.html`) — không có field nhân viên trực tiếp (suy ra qua ca làm), không có chỉ mục theo SĐT khách |
| **Nhân viên** | Nhân sự → Nhân viên, Lịch làm việc, Chấm công, Lương |
| **Ca làm** | Vận hành → Tiền mặt (giao ca) · Kho → Checklist ca |
| **Chi nhánh** | **Không tồn tại** — xác nhận 2026-09-08 qua `posgieo.html`: quán chỉ có một địa điểm (to-go only, không table/dine-in) |
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

- Gõ ≥2 ký tự (đã bỏ dấu) giờ tìm thêm trong `INVENTORY_ITEMS`/`PREP_ITEMS`/nhân viên (`employees_gieogieo`), không chỉ 40+ nhãn mục điều hướng như trước. Nguyên liệu/BTP hiện tồn hiện tại + hai nút: **Giải thích tồn kho** (Phase 9) và **Xem danh mục**. Nhân viên hiện tên (+ "Đã nghỉ" nếu có) và ba nút tới Chấm công/Lương/Hồ sơ — chưa lọc sẵn theo tên vì chưa có trang riêng cho từng nhân viên, chỉ đưa thẳng tới đúng màn.
- `INVENTORY_ITEMS`/`PREP_ITEMS` bình thường chỉ có dữ liệu sau khi đã từng mở đúng màn Kho tương ứng — thêm `_ensureSearchIndexes()` tải nền (Nguyên liệu + BTP + Nhân viên) ngay khi người dùng bắt đầu gõ tìm, và tự vẽ lại kết quả khi tải xong. Trong lúc chờ, ô tìm nói rõ "Đang tải dữ liệu…" thay vì im lặng báo "không tìm thấy".
- **Sửa lỗi từ lượt trước:** `_ensureSearchIndexes()` bản đầu gọi `loadInventoryItems()`/`loadPrepItems()` nhưng QUÊN gán kết quả vào biến toàn cục `INVENTORY_ITEMS`/`PREP_ITEMS` (hai hàm load chỉ trả về danh sách, không tự gán — mọi chỗ khác trong file đều gán tay sau khi gọi). Hậu quả: tìm kiếm chỉ chạy đúng nếu người dùng LỠ vào Kho→Nguyên liệu/Chế biến trước đó trong phiên — đúng kịch bản mà tính năng này sinh ra để giải quyết, coi như không tải nền được gì cho lần tìm đầu tiên. Đã gán lại đúng.
- Chưa tìm được Bill như ví dụ đầy đủ trong kế hoạch — xem mục 1 ở §4 (bill nằm ở RTDB, khác nguồn dữ liệu với phần đã làm).

File thay đổi: `quanlygieo.html`, hàm `renderSidebarNav()` (thêm khối kết quả dữ liệu + nhân viên), `onNavSearch()`, hàm `_ensureSearchIndexes()` (khoảng dòng 8656‑8783, đã sửa lỗi gán + thêm nhân viên).

**Phase 5 — Context Navigation, một phần**, vẫn trong cùng sheet "Lịch sử" (nút 🕐 ở Nguyên liệu):

- Thêm khối "📦 Đang mở & tem" hiện đúng các container (`stock_containers_gieogieo`) đang mở CỦA RIÊNG món đang xem — trước đây phải rời Nguyên liệu, qua hẳn màn Container rồi tự dò trong danh sách lẫn lộn mọi món. Chỉ tải khi món có bật dán tem (`itemTrackingMode !== 'none'`) — đa số nguyên liệu không dùng tem nên không tốn lượt đọc thừa.
- Lọc phía client trên danh sách "đang mở" đã có sẵn (vốn chỉ vài chục bản ghi — xem `loadContainersFor`), **không** thêm `where('itemId',...)` mới để khỏi phải tạo composite index Firestore mới.
- Nút "Xem màn Container" đóng sheet rồi điều hướng sang màn Container đầy đủ (`goContainers('open')`) cho ai cần thao tác (đánh dấu đã xem, v.v.) — sheet chỉ để XEM nhanh, không thay thế quy trình xử lý container hiện có.
- Sheet 🕐 giờ gộp: Tồn hiện tại → nút Kiểm kê/Lệch kho → Container đang mở → Giải thích tồn kho → Lịch sử giao dịch, đúng tinh thần "các chức năng liên quan phải ở gần đối tượng đó".
- **Thêm Related Actions (Phase 6)**: hai nút "Kiểm kê" / "Lệch kho & định lượng" ngay trong card "Tồn hiện tại" của sheet — chỉ cho Nguyên liệu (Kiểm kê ở đây là hàng đợi duyệt kiểm kê nguyên liệu; BTP đếm cuối ca theo cơ chế khác, không dùng chung hàng đợi này nên không gắn nhầm). Bấm thì đóng sheet trước khi điều hướng.

File thay đổi: `quanlygieo.html`, hàm mới `_histContainerHtml` (khoảng dòng 20166‑20188), sửa `openItemHistory()` để tải song song container cùng lịch sử giao dịch, sửa `_histRender()` thêm `relatedActions`.

**Phase 11 — Integrity Rules → Alert Inbox**, nối một kiểm tra ĐÃ CÓ SẴN từ trước (không viết rule mới) vào đúng nơi kế hoạch yêu cầu:

- `runDataIntegrityCheck()` (viết từ "Giai đoạn 12", rà tham chiếu hỏng ở recipe/refill rule/PO trỏ tới nguyên liệu hoặc vị trí đã xoá, cộng tồn kho âm) trước đây CHỈ hiện ở tab Kiểm toán — nơi chủ quán hiếm khi ghé trừ khi chủ động đi tìm. Giờ thêm thẻ "🔍 Kiểm tra toàn vẹn dữ liệu" ngay đầu **Hộp thư cảnh báo** — đúng màn chủ quán vào mỗi ngày để xử lý vấn đề.
- Dùng chung biến trạng thái `auditIntegrityIssues` với tab Kiểm toán (không tạo state song song) — chạy kiểm tra ở nơi nào thì nơi kia thấy kết quả ngay, khỏi chạy hai lần cho cùng dữ liệu.
- Vẫn chạy theo yêu cầu (nút "Kiểm tra ngay"), **không tự động** — giữ đúng lý do bản gốc thiết kế thủ công: hàm này đọc 5 collection, mà Hộp thư là màn được mở nhiều nhất trong ngày.
- Chưa thêm rule mới nào (Ledger≠Container dạng cộng số, GOGS Integrity, Container Integrity, Recipe Integrity theo đúng nghĩa kế hoạch liệt kê) — chỉ kết nối lại cái đã có.

File thay đổi: `quanlygieo.html`, hàm mới `integrityCheckCardHtml()`, `runIntegrityCheckFromInbox()` (khoảng dòng 9804‑9850), sửa `renderAlertInbox()` để chèn thẻ này ở cả hai nhánh (có/không có alert).

**"Ledger ≠ Container" — đối chiếu sổ kho với tem, một phần Phase 9/11**, hoá ra công thức này **đã có sẵn và đã đúng** — chỉ bị giấu trong tab Container → Tồn lịch sử:

- Phát hiện khi đọc code: `docTemConSongTheoMon()` + field `untrackedBase` trên `inventory_items_gieogieo` đã cài đặt đúng công thức `sổ kho = tem đang giữ (Σ container sealed+open còn sống) + tồn lịch sử đã chốt`, dùng ở `renderKhoLegacyStock()` (Kho → Container → Tồn lịch sử) — xem chú thích gốc "TỒN LỊCH SỬ TRƯỚC KHI DÁN TEM" (dòng ~3653) trong file. Đây chính là phép đối chiếu kế hoạch mô tả, đã kiểm chứng qua vụ thật (sữa tươi lệch 15.020g) chứ không phải tôi tự nghĩ ra.
- Thêm khối "Đối chiếu sổ kho với tem" vào sheet 🕐 — **gọi thẳng `docTemConSongTheoMon()` đã có, không viết công thức mới**, chỉ trình bày lại đúng 3 con số (sổ kho / tem đang giữ / tồn lịch sử) + phần chênh nếu có, ngay tại chỗ đang xem món đó.
- Món **chưa chốt mốc tồn lịch sử** thì hiện rõ 🟡 "Chưa chốt mốc" — KHÔNG hiện 🟢 giả (im lặng bỏ qua sẽ trông như "đang khớp" trong khi thực ra chưa đối chiếu được gì).
- Phần chênh (nếu có) ghi rõ "không tự tính là hao hụt", có link thẳng tới đúng chỗ xử lý (chốt lại mốc / xoá bằng điều chỉnh) ở Kho → Container → Tồn lịch sử — không nhân bản quy trình xử lý, chỉ làm rõ điểm vào.

File thay đổi: `quanlygieo.html`, hàm mới `_histReconcileHtml()` (khoảng dòng 20298‑20330), sửa `openItemHistory()` để gọi thêm `docTemConSongTheoMon()` song song khi món có dán tem.

**Phase 8 — Gần đây & Yêu thích**, giảm thao tác lặp lại giữa các mục điều hướng hay dùng:

- **Gần đây**: tự động ghi nhận — mỗi lần chuyển màn (`switchScreen()`), mục vừa vào được đẩy lên đầu danh sách "Gần đây" trong sidebar (tối đa 6 mục, không trùng). Không tính "Hôm nay"/"Hộp thư cảnh báo" vào đây vì hai mục đó đã có lối vào riêng cố định — tính vào chỉ làm loãng danh sách.
- **Yêu thích**: nút hình ⭐ mới ở topbar (cạnh nút đổi giao diện/tải lại) — bấm để đánh dấu/bỏ đánh dấu MÀN ĐANG ĐỨNG. Nút tự đổi màu (viền hổ phách + sao tô đặc) khi màn hiện tại đã được đánh dấu.
- Cả hai lưu ở `localStorage` (`gieo_nav_recent`, `gieo_nav_favorites`) — sở thích riêng theo từng máy, giống cách `gieo_ui_mode` đã lưu, không phải dữ liệu nghiệp vụ nên không đồng bộ qua Firebase.
- Hiện ngay dưới mục "Hôm nay" trong sidebar (không đẩy "Hôm nay" xuống), và **ẩn khi đang gõ tìm** — tránh chen vào lúc người dùng đã biết chính xác muốn tìm gì.
- Không cần xây UI đánh dấu riêng cho từng dòng trong sidebar (40+ mục) — chỉ MỘT nút ở topbar áp dụng cho màn hiện tại, an toàn hơn nhiều so với sửa markup dùng chung cho mọi `.sidebar-item`.

File thay đổi: `quanlygieo.html` — thêm `NAV_ITEM_BY_KEY`, `navRecent`/`navFavorites` + hàm `trackNavVisit()`, `toggleCurrentFavorite()`, `updateFavBtn()` (khoảng dòng 8594‑8650); nút `#favToggleBtn` trong topbar tĩnh + icon `star` mới trong `ICON_PATHS`; gọi `trackNavVisit()`/`updateFavBtn()` trong `switchScreen()` và trong khối khởi động ứng dụng; `renderSidebarNav()` chèn hai khối này ngay sau mục "Hôm nay".

**Phase 7 — Breadcrumb bấm được & Deep Linking:**

- **Deep link**: `switchScreen()` giờ ghi URL (`history.replaceState`, không đẩy thêm bước vào lịch sử trình duyệt) khớp đúng màn đang đứng — vd `#kho:items`, `#entry:nv`, `#tg`. Mở app bằng một link có sẵn hash thì `tryOpenDeepLink()` (chạy trong khối khởi động, TRƯỚC khi rơi về mặc định "Hôm nay") tra hash vào `NAV_ITEM_BY_KEY` — một whitelist dựng từ chính `NAV_SECTIONS` — rồi gọi lại ĐÚNG chuỗi `go` đã khai cho mục đó (chính là chuỗi đang chạy an toàn qua `onclick` ở mọi nút sidebar), không tự suy diễn lại đường điều hướng riêng. Hash không hợp lệ (hoặc rỗng) thì rơi về "Hôm nay" y như trước — không có gì đổi hành vi mặc định.
- **Breadcrumb bấm được**: tên nhóm ở `hdrKicker` (dòng nhỏ phía trên tiêu đề, vd "KHO") giờ là một nút — bấm vào đưa về mục ĐẦU TIÊN của nhóm đó (`NAV_GROUP_FIRST_KEY`, vd nhóm Kho → "Cần xử lý"). App chỉ có 2 tầng điều hướng thật (Nhóm › Mục, không có tầng "đối tượng" như "Sữa tươi" trong ví dụ minh hoạ của kế hoạch), nên "quay về cha" ở đây nghĩa là về mục đầu nhóm — không hiện nút khi đang đứng ngay tại mục đó (bấm vào chính mình vô nghĩa) hoặc khi không thuộc nhóm nào (vd "Hôm nay").

File thay đổi: `quanlygieo.html` — thêm `NAV_GROUP_FIRST_KEY`, `updateUrlForNavKey()`, `tryOpenDeepLink()` (khoảng dòng 8596‑8632); sửa `switchScreen()` phần dựng `#hdrKicker` + gọi `updateUrlForNavKey()`; sửa khối khởi động cuối file gọi `tryOpenDeepLink()` trước `renderToday()`; CSS `.hdr-kicker-link`.

**Giới hạn đã biết, chưa làm trong phiên này:**
- Chưa có rule Integrity MỚI nào ngoài "Ledger≠Container" (GOGS Integrity — bill hoàn tất chưa có consumption, Container Integrity, Recipe Integrity đúng nghĩa kế hoạch liệt kê) — phần Ledger≠Container coi như xong (tái dùng công thức có sẵn), các rule còn lại vẫn chưa làm.
- Command Search chưa tìm được Bill (khác nguồn dữ liệu — RTDB, không phải Firestore).
- Context Navigation mới có ở Nguyên liệu (qua sheet 🕐), chưa có ở BTP/Container/Bill/Nhân viên.
- Yêu thích chỉ đánh dấu được các màn có trong `NAV_SECTIONS`/`inbox` (mọi mục điều hướng chính) — không đánh dấu được một đối tượng cụ thể (vd. "món Sữa tươi này" không có khái niệm yêu thích riêng, chỉ có "màn Nguyên liệu" nói chung).
- Chưa test trên trình duyệt thật với dữ liệu Firebase thật (không có quyền truy cập project Firebase `the-cafe-33` trong phiên này) — mới kiểm tra bằng `node --check` (cú pháp hợp lệ) và đọc code đối chiếu thủ công. **Cần người quản lý mở thử trên trình duyệt trước khi tin tưởng hoàn toàn** — đặc biệt quan trọng: (1) mở sheet 🕐 của một nguyên liệu CÓ dán tem, xem khối "Đối chiếu sổ kho với tem" có khớp với số đang thấy ở Kho → Container → Tồn lịch sử của ĐÚNG món đó không — đây là số liệu tồn kho nên sai là nghiêm trọng; (2) bấm nút ⭐ ở topbar tại vài màn khác nhau, xem sidebar có hiện đúng mục vừa đánh dấu dưới "⭐ Yêu thích" không, và bấm lại có bỏ đánh dấu đúng không; (3) chuyển qua vài màn khác nhau rồi xem "Gần đây" trong sidebar có cập nhật đúng thứ tự không; (4) chuyển vài màn, copy URL lúc đó (có hash `#kho:...`), mở tab mới dán URL đó vào — phải vào thẳng đúng màn; (5) bấm tên nhóm ("KHO"/"BÁO CÁO"...) phía trên tiêu đề, xem có về đúng mục đầu nhóm không.

---

## 4. Đề xuất việc tiếp theo (chưa làm)

Theo đúng thứ tự ưu tiên của kế hoạch, các hạng mục ⭐⭐⭐⭐⭐/⭐⭐⭐⭐ còn thiếu nhiều nhất:

1. **Command Search — mở rộng thêm** (Phase 4) — thêm Bill vào cùng cơ chế tìm ở §3. Đã đọc `posgieo.html` để hiểu rõ khó khăn thật: bill nằm ở RTDB `orders_gieogieo/{thángKey}/{ngày}` (không phải Firestore), **không có field số điện thoại làm chỉ mục phẳng** và **không có field nhân viên trên chính order** (suy ra bằng cách khớp giờ tạo bill với ca làm) — tìm theo SĐT sẽ phải quét từng ngày chứ không query thẳng được như Nguyên liệu/BTP/Nhân viên. Cần cân nhắc: chỉ tìm trong khoảng ngày gần đây (vd 30 ngày) để giới hạn số lượt đọc, hoặc bỏ qua tìm theo SĐT và chỉ tìm theo mã bill (billCode, dễ hơn nếu đoán được ngày từ mã).
2. **Context Navigation — mở rộng thêm** (Phase 5) — làm tương tự sheet 🕐 cho BTP (container không áp dụng nhưng có thể thêm link liên quan khác); Bill/Nhân viên hiện chưa có "trang đối tượng" nào để gắn related actions vào.
3. **Integrity Rules — thêm rule còn thiếu** (Phase 11) — "GOGS Integrity" (bill hoàn tất chưa có consumption tương ứng — phía POS gọi `applySalesConsumptionPOS()` ngay sau khi tạo order và có cơ chế `reportMissingRecipePOS()` riêng cho món chưa khai định mức, đã tận dụng thành alert `missing_recipe` có sẵn; rule integrity mới nên nhắm vào trường hợp KHÁC: order tồn tại nhưng consumption bị lỗi/thiếu do lỗi mạng — POS đã tự bọc try/catch không chặn bán hàng, nghĩa là những lần lỗi này chỉ nằm im, không có dấu vết nào khác ngoài thiếu transaction), "Container Integrity", "Recipe Integrity" đúng nghĩa kế hoạch liệt kê — bổ sung vào `runDataIntegrityCheck()` đã nối vào Alert Inbox ở §3. ("Ledger ≠ Container" coi như xong — xem §3.)
4. Cân nhắc thêm cảnh báo TỰ ĐỘNG cho món "chưa chốt mốc tồn lịch sử" vào `runDataIntegrityCheck()`/Alert Inbox (hiện chỉ thấy khi mở sheet 🕐 của đúng món đó) — cần chốt mốc rồi mới đối chiếu Ledger≠Container được, nên đây là điều kiện tiên quyết đang bị ẩn.
5. ~~Branch Health (Phase 17)~~ — bỏ khỏi backlog, xem dòng "Branch Health" ở §1: quán chỉ có một địa điểm, không có dữ liệu để xây tính năng này.
