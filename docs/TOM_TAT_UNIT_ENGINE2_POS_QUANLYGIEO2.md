# Tóm tắt Unit Engine 2 — POS Gieo và Quản lý Gieo 2

> Ngày lập: 11/11/2026.
> Repository: `Thecafe33/gieo`, nhánh `Phan-tach-unit-engine`.
> Mốc mã đã phân tích: `ce679ad13c73520700ec7ce3b51a18d1d4809681`.
> Phạm vi: `posgieo.html`, `quanlygieo2.html` và các module Engine 2 liên quan.
> Đây là tài liệu giải thích nhanh từ mã nguồn, không thay thế lộ trình/đặc tả hoặc báo cáo nghiệm thu.

## 1. Engine 2 làm gì?

**Engine 2 là bộ điều phối kiểm soát hao hụt:** nhận sự kiện kho và ca làm → phân tích chênh lệch → xác định trách nhiệm theo chính sách → yêu cầu cân thêm → theo dõi kết quả để tăng hoặc giảm kiểm soát.

Engine kho `unit_engine.v21.js` vẫn thực hiện nghiệp vụ tem, tồn kho, trừ/hoàn kho. Engine 2 sử dụng nguồn dữ liệu đó; không tạo một kho, bộ bill hoặc sổ lãi/lỗ riêng.

Ngoài luồng nguyên liệu có tem, worker còn có các đường xử lý lệch khi nấu BTP, nghi pha nhầm, thông báo cần đối soát và phiếu bù BTP. Phạm vi áp dụng từng đường phụ thuộc cấu hình và dữ liệu nguồn; không nên hiểu là mọi tình huống đều đã tự xử lý hoàn toàn.

## 2. POS và quản lý đảm nhiệm phần nào?

| | `posgieo.html` | `quanlygieo2.html` |
| --- | --- | --- |
| Người dùng | Nhân viên tại quán | Chủ quán/quản lý |
| Công việc | Bán hàng, thao tác kho, cân và kết ca | Thiết lập, xem hao hụt và căn cứ phân bổ |
| Giao diện Engine 2 | Lồng vào danh sách cân đầu/cuối ca sẵn có; không có màn Engine 2 riêng cho nhân viên | Mục **Tự động & Engine 2**: kết quả, việc đang xử lý, học và thiết lập |
| Khi POS không giao được lượt xử lý | Tiếp tục xử lý theo cơ chế thông thường, ghi lý do để theo dõi | Hiển thị việc POS tự xử lý, trạng thái worker và phiên bản máy POS |

Worker trên Firebase tiếp tục xử lý khi trình duyệt đóng. Luồng bán hàng không phải chờ worker hoàn thành tác vụ kiểm soát kho.

## 3. Một vòng hoạt động

1. **Nhận sự kiện:** báo hết còn dư, cân lệch, chênh lệch khi nấu BTP, thay đổi ca làm…
2. **Đọc căn cứ:** quán, nguyên liệu, tem, sổ kho, mốc cân và nhóm pha chế trong khoảng liên quan.
3. **Áp dụng luật:** lập hồ sơ, xác định lượng/giá trị và phân bổ trách nhiệm nếu đủ căn cứ. Chính sách có phiên bản; nguồn thay đổi được xử lý theo cơ chế đối soát.
4. **Giao việc:** nguyên liệu cần kiểm soát được đưa vào danh sách cân của POS.
5. **Thực hiện:** nhân viên cân bằng giao diện quen thuộc. POS cập nhật kho; worker hoàn tất trách nhiệm và mốc đối chiếu. Mã thao tác dùng để chống xử lý lặp.
6. **Theo dõi và học:** dữ liệu tích lũy giúp học mức thường, phát hiện bất thường và điều chỉnh mức kiểm soát khi đủ điều kiện.

**Trách nhiệm theo chính sách không đồng nghĩa với chứng minh người gây thất thoát.** Trong trường hợp áp dụng chia đều, nhóm pha chế phù hợp trong khoảng được chia lượng/giá trị tương ứng. Việc phân bổ này không tự tạo giao dịch thu tiền hoặc khấu trừ lương.

Việc cân dở có thể được giao tiếp cho ca sau; trách nhiệm của khoảng trước không tự chuyển sang người nhận việc.

## 4. Chế độ hoạt động và mức kiểm soát

### Chế độ theo quán

- **Tắt:** Engine 2 không điều phối nghiệp vụ mới theo chế độ tự động.
- **Đối chiếu thử — `shadow`:** xem đề xuất/kết quả đối chiếu trước khi áp dụng tự động.
- **Tự động — `active`:** phân bổ và giao cân khi đáp ứng các điều kiện cấu hình, giao thức và xác nhận máy POS.

Chọn `active` không tự chứng minh mọi máy POS đã nhận cấu hình. Màn quản lý có thông tin xác nhận phiên bản và trạng thái worker để kiểm tra.

### Mức theo nguyên liệu/quán

| Mức | Ý nghĩa khái quát |
| --- | --- |
| M0 | Bình thường; có thể được chọn cân ngẫu nhiên theo ngân sách |
| M1 | Cần mốc cân/căn cứ ban đầu |
| M2 | Tăng kiểm soát sau hao hụt |
| M3 | Cần đối chiếu độc lập khi có mâu thuẫn hoặc tái diễn |

“**Cấp 6**” trong lộ trình là cấp năng lực của toàn hệ thống, khác với M0–M3.

Hệ thống có cơ chế học mức thường, xếp hạng giả thuyết, hiệu chuẩn và tự hạ mức có điều kiện. Có mã xử lý không đồng nghĩa đã đủ mẫu thật tại quán. Xác suất chỉ được trình bày khi đủ điều kiện hiệu chỉnh; phần dư chưa giải thích không được dùng để tự quy kết hành vi.

## 5. Những cơ chế quan trọng trong bản hiện tại

- **Không cân trùng:** món đã có trong danh sách cân được gắn dấu điều phối, không thêm một dòng cân thứ hai.
- **Giảm thao tác đầu ca:** cùng một người kết ca rồi mở ca kế tiếp có cơ chế bỏ yêu cầu cân/đếm lại đầu ca; khi chưa xác định chắc hoặc có nhiều người thì xử lý thận trọng.
- **Cân độc lập cần người khác:** M3 được nối vào đầu ca khi có người khác người cân trước; không tạo một màn riêng.
- **Worker phải còn hoạt động:** POS chỉ giao lượt khi heartbeat mới trong 45 phút; không chắc thì POS tự xử lý.
- **Mất mạng có đường phục hồi:** dùng hàng đợi, retry và hộp thư trên máy. Việc POS tự xử lý được ghi kèm lý do thay vì để nhiệm vụ treo im lặng.
- **Chống xử lý lặp:** mã thao tác, transaction, biên nhận và mã dòng sổ liên kết phần POS với worker.
- **Đa cửa hàng:** instance xử lý và dữ liệu nghiệp vụ gắn với quán; bảng dùng chung vẫn theo lớp đường dẫn đã đăng ký. Không mặc định mọi collection đều có hậu tố quán.
- **Giảm đọc nền:** có cache ngắn ở POS, retry giãn dần, học theo ngày và dữ liệu quan sát tổng hợp. Điều này không có nghĩa hệ thống không phát sinh lượt đọc/ghi.

## 6. Các file cần làm việc

| Muốn thay đổi phần nào | File nguồn chính |
| --- | --- |
| Cách Engine 2 nối vào thao tác/cân trên POS | [`gieo_engine2_pos_v4.js`](../gieo_engine2_pos_v4.js) |
| Luật tính, phân bổ và chuyển mức | [`unit_engine2_v1.js`](../unit_engine2_v1.js) |
| Lưu hồ sơ, nhiệm vụ, retry và điều phối học | [`unit_engine2_store_v4.js`](../unit_engine2_store_v4.js) |
| Nhân sự, người mở/kết ca, điều kiện cân độc lập | [`unit_engine2_staffing_v1.js`](../unit_engine2_staffing_v1.js) |
| Nhận sự kiện và xử lý nền | [`functions/automation/engine2.js`](../functions/automation/engine2.js) |
| Giao diện Engine 2 trên quản lý | [`tools/automation/engine2_ui.js`](../tools/automation/engine2_ui.js) |
| Ghép/sinh màn quản lý | [`tools/automation/build_page.js`](../tools/automation/build_page.js) |
| Nghiệp vụ quản lý gốc dùng để sinh trang | [`quanlygieo.html`](../quanlygieo.html) |
| Nghiệp vụ kho thực thi | [`unit_engine.v21.js`](../unit_engine.v21.js) |

**`quanlygieo2.html` là file sinh tự động:** lấy `quanlygieo.html` rồi ghép giao diện automation/Engine 2. Khi sửa cần chỉnh nguồn tương ứng rồi sinh lại, không sửa trực tiếp file đầu ra.

Tại mốc đã đọc:

- POS nạp core v1, staffing v1, **store v4**, cầu nối POS **v4**.
- Worker dùng bản shared của **store v4**.
- `quanlygieo2.html` nạp core v1 và **store v1**.

Vì vậy phải kiểm đúng API của từng phía khi thay đổi; không mặc định ba nơi đang chạy cùng phiên bản store. Các file shared của worker được đồng bộ qua công cụ dự án. File đã phát hành cần tuân thủ quy tắc phiên bản và sinh lại bộ deploy.

## 7. Giới hạn của bản tóm tắt

Đã phân tích mã nguồn và tài liệu, chưa đọc cấu hình/dữ liệu Firebase thật trong lượt này. Chưa xác nhận quán nào đang bật Engine 2, máy nào đã cập nhật, lượng mẫu học thực tế hoặc tình trạng worker đang chạy.

Tài liệu tham chiếu:

- [Lộ trình Engine 2 cấp 6](LO_TRINH_ENGINE2_CAP6.md)
- [Thiết kế Unit Engine 2](THIET_KE_UNIT_ENGINE2_V1.md)
- [Cập nhật giao tiếp POS và store v3/v4 ngày 05/11](ENGINE2_POS_V3_05-11.md)
