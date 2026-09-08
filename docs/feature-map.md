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
| Tìm nhanh sidebar (`navSearch`, Ctrl/⌘+K) | `onNavSearch()`, dòng 8624‑8697 | chỉ nhãn 40+ mục nav | thấp | 🟡 Có nhưng CHỈ lọc tên mục điều hướng — chưa tìm được nguyên liệu/bill/nhân viên cụ thể như Phase 4 mô tả ("Find Anything") |
| Breadcrumb-lite (`hdrKicker`/`hdrTitle`) | `switchScreen()` dòng ~9342 | | thấp | 🟡 Có 2 tầng (Nhóm › Mục), không phải breadcrumb bấm được từng cấp; không có deep link / URL hash |
| Context Navigation (tab liên quan ngay tại object) | — | — | — | 🔴 **Chưa có** — xem đối tượng (vd. một nguyên liệu) chưa có dải tab "Tổng quan / Kho / Container / Giao dịch / Kiểm kê" như Phase 5 mô tả |
| Related Actions | rải rác, vd. nudge "Duyệt phiếu kiểm kê" trong Lệch kho, nút "Khai định mức" khi thiếu recipe | | | 🟡 Có từng phần theo ngữ cảnh nhưng không nhất quán theo mọi màn |
| Recent & Favorites | — | — | — | 🔴 **Chưa có** |
| Transaction Drill-down | breakdown → `histSetFilter(type)` lọc đúng loại giao dịch trong cùng sheet | Nguyên liệu, BTP | thấp | 🟡 **Một phần, mới thêm 2026-09-08** — bấm vào một dòng breakdown thì lọc ra đúng các giao dịch loại đó (ngày giờ, nhân viên, ghi chú, tồn còn lại), nhưng CHƯA nhảy được tới đúng PO/bill/waste-record gốc (referenceId) |
| Integrity Rules → Alert Inbox (Phase 11) | alerts_gieogieo hiện có 5 loại (xem Object Map) | | | 🟡 Đã có framework, CHƯA có rule "Ledger ≠ Container", "GOGS Integrity", "Container Integrity", "Recipe Integrity" như kế hoạch liệt kê |
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
| **Nguyên liệu** | Kho → Nguyên liệu (danh sách, sửa tồn, sửa thông tin) · nút 🕐 → Lịch sử + **Giải thích tồn kho** (mới) · Kho → Lệch kho & định lượng (đối chiếu theo kỳ) · Kho → Kiểm kê · Kho → Đặt & nhận hàng · Menu & Khuyến mãi → Định mức món (recipe dùng nguyên liệu) · Tra giá theo ngày (cuối màn Nguyên liệu) |
| **BTP (Chế biến cấp 1)** | Kho → Chế biến cấp 1 · nút 🕐 → Lịch sử + Giải thích tồn kho (mới, dùng chung `_histRender`) · Kho → Lịch sử kho (chip "Bán thành phẩm") |
| **Container (chai/tem)** | Kho → Hàng đang mở & tem (`ctnFilter`: cần soát / hết hạn / chưa dán tem / đang mở / tất cả) |
| **Sản phẩm / Menu** | 🔒 Quản lý Menu (protected) · Định mức món · GOGS Món |
| **Bill** | 🔒 Lịch sử bill (protected) |
| **Nhân viên** | Nhân sự → Nhân viên, Lịch làm việc, Chấm công, Lương |
| **Ca làm** | Vận hành → Tiền mặt (giao ca) · Kho → Checklist ca |
| **Chi nhánh** | Chưa xác nhận có trong data model — cần kiểm tra trước khi làm Phase 18 |
| **Nhà cung cấp** | Kho → Đặt & nhận hàng (field `supplier` trên PO) — chưa có màn quản lý nhà cung cấp riêng |

Object "Nguyên liệu" hiện có điểm truy cập gần nhất với ví dụ trong kế hoạch (mục 3, "Sữa tươi"): Tổng quan (dòng trong danh sách) · Tồn kho (cùng dòng) · Giao dịch + Giải thích tồn kho (sheet 🕐) · Kiểm kê (Kho → Kiểm kê, lọc theo món) · Lệch kho (Kho → Lệch kho). Còn thiếu: **Container theo đúng nguyên liệu đó** (màn Container hiện lọc theo trạng thái chai, chưa lọc theo tên nguyên liệu từ phía màn Nguyên liệu) và **Giá nhập** (có "Tra giá theo ngày" nhưng là block riêng cuối trang, chưa gắn theo từng dòng nguyên liệu).

---

## 3. Đã triển khai trong phiên này (2026-09-08)

**Phase 9 — Stock Explanation**, đặt trực tiếp vào sheet "Lịch sử" đã có (mở từ nút 🕐 ở Nguyên liệu và Chế biến cấp 1 — dùng chung `_histRender()`), không tạo màn mới:

- Khối "🔍 Tồn hiện tại hình thành từ" cộng dồn ledger (`stock_transactions_gieogieo` / `prep_transactions_gieogieo`) theo từng loại giao dịch (Nhập kho / Chuyển kho / Bán ra / Hao hụt / Điều chỉnh / Đặt tồn vị trí / Nấu ra lô...), badge 🟢 khớp / 🟡 có phần chưa qua sổ.
- Phần dư (currentStock − tổng ledger đã tải) **không bị gán nhãn WASTE** — hiển thị trung tính là "số dư chưa qua sổ kho (thường là tồn khai tay lúc tạo món)", đúng nguyên tắc ở mục "Nguyên tắc" của kế hoạch.
- Giới hạn nói rõ trong UI: `_histLoad` chỉ tải tối đa 400 giao dịch gần nhất (hoặc bản rút gọn khi thiếu Firestore index) — nếu chạm giới hạn, khối giải thích tự cảnh báo số liệu có thể chưa đầy đủ thay vì im lặng đưa ra con số sai.
- **Transaction Drill-down (Phase 10, một phần)**: bấm vào một dòng trong khối breakdown lọc đúng loại giao dịch đó trong danh sách bên dưới (tái dùng cơ chế `histSetFilter`/chip có sẵn, không tạo bộ lọc song song).
- Không đổi schema Firestore, không thêm collection mới, không đụng 3 tab protected.

File thay đổi: `quanlygieo.html`, hàm mới `_histTypeLabel`, `HIST_EXTRA_TYPE_LABEL`, `HIST_TYPE_ORDER`, `_histTypeBreakdown`, `_histBreakdownHtml` (khoảng dòng 20085‑20152); sửa `_histRender()` để chèn khối này + hỗ trợ lọc theo type chính xác.

**Giới hạn đã biết, chưa làm trong phiên này:**
- Chưa đối chiếu Ledger vs **Container** (tồn vật lý theo chai/tem) như ví dụ "🟢 KHỚP / 🟡 Có chênh lệch" trong kế hoạch — cơ chế container hiện tại (`stock_containers_gieogieo`, `untrackedBase`) phức tạp hơn một phép cộng đơn giản (có trạng thái sealed/open/finished, `needsReview`...) nên cần nghiên cứu kỹ hơn trước khi làm, để tránh đưa ra con số reconciliation sai.
- Chưa test trên trình duyệt thật với dữ liệu Firebase thật (không có quyền truy cập project Firebase `the-cafe-33` trong phiên này) — mới kiểm tra bằng `node --check` (cú pháp hợp lệ) và đọc code đối chiếu thủ công. **Cần người quản lý mở thử trên trình duyệt trước khi tin tưởng hoàn toàn.**

---

## 4. Đề xuất việc tiếp theo (chưa làm)

Theo đúng thứ tự ưu tiên của kế hoạch, các hạng mục ⭐⭐⭐⭐⭐/⭐⭐⭐⭐ còn thiếu nhiều nhất:

1. **Command Search thật** (Phase 4) — nâng `onNavSearch` từ lọc nhãn nav sang tìm cả tên nguyên liệu/BTP/nhân viên/bill, trả kết quả kèm hành động (giống ví dụ "sữa" trong kế hoạch).
2. **Context Navigation** (Phase 5) — thêm dải tab "Tổng quan / Kho / Giao dịch / Kiểm kê" ngay tại từng nguyên liệu, thay vì phải rời khỏi màn Nguyên liệu để vào Kiểm kê/Lệch kho.
3. **Integrity Rules → Alert Inbox** (Phase 11) — bổ sung rule "Ledger ≠ Container", "GOGS Integrity" (bill hoàn tất chưa có consumption) vào cùng cơ chế `alerts_gieogieo` đã có, không tạo dashboard riêng.
4. Container reconciliation cho Giải thích tồn kho (nối tiếp việc đã làm ở §3) — sau khi hiểu rõ `untrackedBase`/trạng thái container.
