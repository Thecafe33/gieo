# DEAD FEATURE PRUNING — V1

> Nguồn: đọc trực tiếp changelog trong `<head>` của `posgieo.html` (dòng 4-157) + toàn bộ marker `[HIDDEN-CHANGE]`/`[REMOVE-*]`/`[BÊ TỪ POS]` + code chết trong cả 2 file. Mục đích: quyết định cái gì **cắt hẳn** khi viết hệ thống mới, mà **không làm gãy nhánh khác của cây tính năng** (`FEATURE-TREE-V1.md`).
>
> Nguyên tắc khi đọc bảng dưới: **"đã ẩn UI sửa" ≠ "đã chết hoàn toàn"**. Nhiều tính năng bị ẩn màn hình SỬA nhưng phần ĐỌC (dùng để bán hàng) vẫn đang chạy thật — cắt nhầm phần đọc sẽ làm gãy dây chuyền tới doanh thu. Bảng này tách rõ 2 phần cho từng trường hợp.

---

# 1. BẢNG QUYẾT ĐỊNH NHANH

| Tính năng | Trạng thái | Quyết định |
|---|---|---|
| Ví (Wallet) — `#walletScreen` | Đã gỡ hẳn 22/08/2026 (legacy) | Không mang sang. Không còn gì để cắt (đã sạch). |
| Đồng giá (DG) — `#dgscreen` | Đã gỡ hẳn 22/08/2026 (legacy) | Không mang sang. Đã sạch. |
| Quỹ tiền mặt (Cash Fund) — `#cashfundScreen` | Huỷ hẳn, không route vào, không tương đương ở QUANLY | Không mang sang. |
| Đối soát tay chuyển khoản cuối ca | Đã bỏ, code dọn sạch | Không mang sang, giữ nguyên logic tự-chốt hiện tại (`bankAutoConfirmed`). |
| `FINISH_REVIEW_RATIO` (hằng số chết) | Khai báo, không ai dùng | Không mang sang. |
| Ô nhập mã giảm giá thủ công (`#discount-code-area`) | Ẩn UI, đã quyết định cắt cả `rewards`/voucher (lượt trước) | Không mang sang — khớp quyết định đã chốt. |
| **UI SỬA Menu (`#mn`) + Khuyến mãi (`#tg`) trong POS** | Ẩn UI, bản thật đã chuyển hẳn sang QUANLY | **Không mang UI sửa sang POS** — khớp đúng `POS-QUANLY-PERMISSION-CONTRACT-V1.md` (QUANLY sở hữu Product/Promotion Master). |
| Danh sách "Khách hàng" (`#customers`, list UI trong POS) | Ẩn UI, chỉ 1 view liệt kê | Không mang UI list này sang, **nhưng dữ liệu/logic loyalty phía sau PHẢI giữ** (xem §2). |
| `isWallet` param trong Loyalty | Code chết 1 phần, không caller nào còn truyền `true` | Bỏ hẳn param khi viết lại (hệ thống mới không có nợ cũ để tương thích ngược). |
| Web Serial / `XprinterWNN58E` | Còn 1 code path thật (chạy ngoài APK) | **CẦN HỎI** — xem §4. |

---

# 2. AN TOÀN XOÁ NHƯNG PHẢI GIỮ ĐÚNG PHẦN ĐỌC (rủi ro dây chuyền thật, đây là phần quan trọng nhất)

### 2.1 Menu/Khuyến mãi — tách XOÁ (sửa) khỏi GIỮ (đọc)
Xác nhận: `showScreen('mn')`/`showScreen('tg')` trong POS chỉ có đúng 1 điểm gọi — nút sidebar đã bị ẩn từ lâu. Toàn bộ `saveMenuItem()`, `saveTgGift()/saveTgDisc()/saveTgFreeTp()` bản POS **không có đường vào UI**, đã có bản thật đang chạy ở QUANLY.

- **XOÁ khi viết lại**: mọi form/hàm SỬA Menu và Khuyến mãi trong `apps/pos` — khớp đúng nguyên tắc đã chốt ở `POS-QUANLY-PERMISSION-CONTRACT-V1.md` §15 (QUANLY sở hữu Product/Recipe/Promotion Master, POS chỉ đọc effective version).
- **GIỮ NGUYÊN, không được đụng**: cơ chế POS **đọc** Catalog để bán hàng thật — listener đồng bộ `togoSettings`, `checkTogoBeforeCheckout()` (áp khuyến mãi tự động lúc thanh toán), đọc `MENU`/`menu_gieogieo` để hiển thị món cho khách chọn. Đây chính là domain `[1] Catalog` và `[4] Auto-promotion` đã có trong `FEATURE-TREE-V1.md` — **vẫn sống, chỉ đổi từ "đọc RTDB tự chế" sang "đọc qua Unified Read Layer"**, không phải cắt bỏ.

→ Bài học kiến trúc: đây chính xác là lý do `packages/catalog` phải là **1 package, 2 mode truy cập** (command để QUANLY ghi, read-layer để POS chỉ đọc) — không phải xoá code POS rồi thôi, mà đảm bảo POS vẫn có đường đọc chính thức.

### 2.2 `#customers` (POS) — chỉ xoá MÀN HÌNH LIỆT KÊ, không đụng dữ liệu loyalty
`#customers` chỉ là 1 view liệt kê thành viên (`loadCustomerList`, `_custFetchAll`). Nhưng collection `customers` phía sau đang được đọc/ghi ở **>10 điểm khác trong luồng thanh toán thật** (tích điểm, đổi tem, lưu hồ sơ gợi ý AI) — đây chính là domain `[4] Customer/Loyalty` đã thiết kế trong `FEATURE-TREE-V1.md`, đang sống mạnh, không liên quan gì tới việc màn hình liệt kê có bị ẩn hay không.

- **XOÁ**: màn hình `#customers` (UI liệt kê) khi viết `apps/pos`.
- **GIỮ NGUYÊN schema/logic**: `packages/loyalty` (Customer, Loyalty points/stamps) — không đổi, không liên quan tới việc cắt UI này.

### 2.3 ⚠️ Cảnh báo nhầm lẫn tên gọi: "Khách hàng" (POS) ≠ "Khách hàng" (QUANLY)
- POS `#customers` = danh sách **thành viên loyalty** (điểm/tem), đọc collection `customers`.
- QUANLY "Khách hàng" (`screen-customer`, đã có trong `FEATURE-TREE-V1.md` domain `[9] Reporting`) = **báo cáo doanh thu theo khách** (RFM-lite), đọc bill, KHÔNG đọc collection `customers`.

Đây là 2 tính năng khác mục đích hoàn toàn, trùng tên do lịch sử — khi rebuild đặt tên khác nhau rõ ràng (`packages/loyalty` vs `packages/reporting/customer-report.ts`, đã đúng cấu trúc hiện có) để không ai nhầm mà gộp/xoá sai.

### 2.4 `wal-*` CSS class — KHÔNG được xoá theo tên
Tên gợi ý "ví" (Wallet đã gỡ) nhưng thực chất là hệ class layout dùng chung toàn bộ back-office (Kho, Chi phí, Ca làm việc, Hao hụt — hàng trăm lần dùng). Khi viết lại UI mới, tự đặt tên design-system mới (không kế thừa tên `wal-*`), không phải "xoá" theo nghĩa loại bỏ tính năng.

---

# 3. CODE CHẾT AN TOÀN XOÁ HOÀN TOÀN

- `#walletScreen`, `#dgscreen`, `#cashfundScreen` + toàn bộ hàm `cf*`/`dg*` liên quan, Firestore `cashfund_gieogieo` — không route, không caller, không tương đương QUANLY.
- `FINISH_REVIEW_RATIO` — đã xác nhận qua cả grep lẫn đọc luồng thay thế (`unitEngineFinishOpenUnit` luôn set cứng `needsReview:false`).
- `isWallet` param trong Loyalty — bỏ hẳn, hệ thống mới không cần tương thích dữ liệu nợ cũ.
- Ô nhập mã giảm giá thủ công + `applyDiscountCode()` — khớp quyết định đã chốt cắt `rewards`/voucher (trao đổi lượt trước).

---

# 4. CẦN BẠN QUYẾT ĐỊNH — Web Serial (`XprinterWNN58E`)

Khác toàn bộ trường hợp trên (đã xác nhận chết 100%), đường in qua **Web Serial** (không qua APK, chạy thẳng trên Chrome desktop) **vẫn có code path thật sự gọi được** — chỉ bị ẩn nút khi biến `window.AndroidPrinter` tồn tại (tức luôn ẩn trong APK production, nhưng hiện ra nếu ai đó mở file bằng trình duyệt thường).

**Câu hỏi:** hệ thống mới có còn dự định chạy được ngoài APK (vd. dùng tạm trên máy tính quầy pha khi APK lỗi, hoặc môi trường dev) không? Nếu **không bao giờ** chạy ngoài APK → cắt hẳn Web Serial, `PrinterAdapter` chỉ cần 1 đường Bluetooth qua bridge. Nếu **có** → giữ lại như 1 fallback dự phòng chính thức (không phải code chết ẩn đi như legacy).

---

# 5. CẬP NHẬT VÀO CÂY TÍNH NĂNG

Không đổi cấu trúc domain nào trong `FEATURE-TREE-V1.md` — mọi thứ xoá ở đây đều là **code/UI thừa nằm ngoài cây** (dead weight), hoặc **UI trùng bản (giữ 1, bỏ 1)**, không phải nhánh nghiệp vụ. Domain `[1] Catalog` và `[4] Loyalty` giữ nguyên định nghĩa, chỉ khẳng định thêm: **POS trong 2 domain này = READ ONLY qua read-layer, không có bất kỳ command SỬA nào** — đúng những gì §4.1 của `FEATURE-TREE-V1.md` đã kết luận, audit lần này xác nhận thêm bằng bằng chứng UI thật (nút đã ẩn từ lâu vì đã chuyển hẳn sang QUANLY).
