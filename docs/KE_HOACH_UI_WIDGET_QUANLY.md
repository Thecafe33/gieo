# Kế hoạch hoàn thiện UI widget quanlygieo — 17/10/2026

Trạng thái: **đã triển khai và kiểm tra P0–P5 ngày 17/10/2026**. Bản nguồn được rà ban đầu: `fcc6ea8`; kế hoạch được chốt tại `dd27002`, nhánh `Phan-tach-unit-engine`.

## Phạm vi đã chốt

- Hoàn thiện những vị trí chưa đồng bộ với widget đang có ở quanlygieo. Nền và thương hiệu vẫn hồng; màu phụ theo vai trò, số tốt/xấu giữ màu ngữ nghĩa.
- **Giữ nguyên tab Quản lý Menu (`#screen-mn`) và Khuyến mãi (`#screen-tg`)**, gồm popup, bộ chọn, thao tác và giao diện bên trong hai tab. Không sửa CSS chung để thay đổi gián tiếp hai màn này.
- Nguyên liệu/BTP phải giữ hiệu quả vận hành và các quy tắc kho. Không đổi cách tính, đơn vị lưu, lịch sử giá/công thức, luồng lưu hay dữ liệu chỉ để phục vụ bố cục.
- Không tiếp tục đối chiếu chênh lệch thu hồi vốn trong quá khứ ở đợt UI này. Widget nào chứa số tài chính cũng dùng kết quả bộ tính hiện có.
- `manage.html` và các JS đã phát hành không nằm trong phạm vi kế hoạch UI này.

## Cách rà và giới hạn

Đã đọc cấu trúc điều hướng, các hàm render và những form/popup liên quan; chạy Chromium với Firebase giả, chặn kết nối ngoài, ở **1366px và 390px**. Rà **51 điểm điều hướng × 2 cỡ màn = 102 lượt render**, gồm Hộp thư cảnh báo và các mục con Tồn theo vị trí/Vị trí kho; hai tab được bảo vệ không nằm trong lượt chuyển đổi này. Rà thêm danh sách có dữ liệu và form thêm Nguyên liệu/BTP trên cả hai cỡ màn.

Dữ liệu giả dùng để nhận diện bố cục, trạng thái trống/có dữ liệu và thao tác mở form, không dùng để kết luận số kinh doanh hoặc độ đúng nghiệp vụ. Khi triển khai vẫn phải kiểm thêm trạng thái nhiều dòng, tên dài, lỗi nạp và popup sửa/chi tiết.

Kết quả chính:

1. Màn Hôm nay, Chi phí, Tiền mặt và bốn màn Nhân sự đã có phần lớn widget. Giữ các phần này, chỉ xử lý phần còn thiếu.
2. Hôm nay · Vận hành có sáu khối thẻ trắng cũ; nhóm báo cáo và cấu hình vẫn dùng nhiều `.card`/`.kcard` cũ.
3. Báo cáo kỳ và Tổng kết tháng xuất hiện tràn ngang trang trên điện thoại với bộ dữ liệu thử. Cần giải quyết trong chính bố cục bảng/widget.
4. Nhiều màn kho có bộ giao diện riêng `.k2-*`, `.nl-*`, `.nlf-*`. Không có class `.wdg` **không có nghĩa là phải dựng lại**: các hàng tem/lô và lưới nguyên liệu hiện có đã thể hiện tốt trạng thái và thao tác.
5. Form Nguyên liệu đã chia nhóm trong sheet; form BTP còn là một khối dài với nhiều đoạn giải thích luôn mở. Đây là hai trường hợp cần cách xử lý khác nhau.

## Kiểm kê và phương án theo màn

P0 là chuẩn bị; P1–P5 là thứ tự đề xuất. Những màn đã đồng bộ không dựng lại từ đầu.

| Màn / vị trí | Hiện trạng cần chú ý | Phương án widget | Đợt |
|---|---|---|---|
| Hôm nay · Sức khoẻ quán | KPI, lãi/lỗ, bill, biểu đồ và feed đã có widget; thu hồi vốn còn khung thẻ cũ | Giữ phần đã làm. Thu hồi vốn chỉ ghi nhận để đồng bộ khung ở lượt UI phù hợp, không xem lại công thức/lịch sử trong đợt này | Giữ / bổ sung sau |
| Hôm nay · Vận hành | 6 khối checklist, tiền mặt, NL sắp hết, BTP, NL đang dùng, bill vẫn là thẻ trắng cũ | Mỗi việc là một widget; số chính ở đầu, các dòng gọn bên trong. PC ưu tiên 2 cột khi đủ chỗ, điện thoại 1 cột. Bill dùng lại cách hiển thị hiện có | P1 |
| Ghi chú ngày | Form và lịch sử tách thành thẻ cũ | Widget nhập ghi chú + widget lịch sử, ngày và nút lưu trong cùng nhóm thao tác | P1 |
| Lịch sử bill | Đã có hàng bill riêng, bộ lọc chưa thành widget | Gom bộ lọc và tổng kỳ đang xem; giữ chi tiết mở tại hàng, trạng thái thanh toán và các thao tác sửa/xoá | P1 |
| Hộp thư cảnh báo | Có bộ phân loại và hành động riêng | Widget theo nhóm việc/trạng thái, số chưa xử lý nổi bật; giữ nguyên hành động và xác nhận | P1 |
| Checklist ca | Trộn cấu hình quy trình, nhật ký và kết quả thực hiện | Tách widget Kết quả ngày / Nhật ký / Cấu hình; giữ các bước đầu ca, cuối ca, refill và công tắc cũ | P1 |
| Nhắc nhở nhân viên | Còn thẻ danh sách cũ | Widget tổng hợp + danh sách theo nhân viên, chi tiết mở tại chỗ | P1 |
| Sức khoẻ tài chính | Nhiều thẻ KPI và thẻ phân tích cũ | Nhóm kết quả tài chính, chi phí/biên lợi nhuận, vốn kho và hiệu suất. Lãi/lỗ kỳ dùng ngôn ngữ thị giác của widget lãi/lỗ hôm nay nhưng giữ công thức/nhãn theo kỳ | P2 |
| Báo cáo kỳ | Bảng KPI so sánh và Product Mix cũ; tràn ngang trên mobile | Widget so sánh kỳ + Chẩn đoán + Product Mix. Bảng cuộn trong khung hoặc bố cục mobile phù hợp, giữ đủ số kỳ này/kỳ trước/mục tiêu | P2 |
| Tổng kết tháng | Nhiều khối trắng dài, biểu mẫu và bảng nằm xen nhau; có tràn ngang | Nhóm Tài chính / Bán hàng / Kho & nhập hàng / Nhân sự / Việc cần xử lý. Chi tiết và hành động chốt sổ rõ ràng, không ẩn trạng thái còn thiếu số | P2 |
| Phân tích bán hàng | Các khối món bán chạy, nhóm món, size/topping, theo ngày chưa đồng bộ | Mỗi góc phân tích một widget, bộ chọn kỳ thống nhất, giữ biểu đồ/bảng có ích | P2 |
| Khách hàng | Có nhiều nhánh có/thiếu dữ liệu, phần giải thích vẫn là card | Widget thống kê và danh sách/chi tiết khi có dữ liệu; trạng thái trống nói đúng trường đang thiếu, không tạo chỉ số giả | P2 |
| Sức khoẻ NL_BTP | Bộ chọn khoảng, hao hụt/COGS và lệch theo lô còn khung cũ | Widget hao hụt, giá vốn, lệch định lượng; xem từng lô ngay trong khối chi tiết. Đây là màn phân tích, khác danh mục NL/BTP | P2 |
| Dự báo & số mẻ | Widget xuất phân tích mẻ đã làm; các phần gợi ý/dự báo chưa đồng bộ hết | Giữ widget đã có, đồng bộ phần gợi ý số mẻ và bộ lọc còn lại; không đổi thuật toán dự báo | P2 |
| Ngày đặc biệt; Trích xuất dữ liệu | Form ngày và lựa chọn xuất còn là card | Widget khai ngày/danh sách; widget chọn khoảng và lựa chọn bản gọn/đầy đủ; thông báo kết quả cùng khối | P3 |
| Tài sản | Form thêm, danh sách và popup sửa còn khung cũ | Widget hồ sơ tài sản + danh sách gọn; popup sửa cùng UI; giữ giải thích ảnh hưởng ngày mua/khấu hao | P3 |
| Mục tiêu | Nhiều form KPI, Labor, lịch sử, target nhân viên và tài chính nối dài | Một widget cho mỗi nhóm cấu hình; giữ nhãn phạm vi chung/riêng từng quán và ngày hiệu lực; nút lưu gắn đúng nhóm | P3 |
| Mô phỏng | Form What-if và kết quả cũ | Widget điều chỉnh giả định + widget kết quả; giữ rõ đây là mô phỏng | P3 |
| Cửa hàng | Hồ sơ/mã POS/thêm quán/đồng bộ danh mục còn là card | Widget theo từng cửa hàng + tác vụ tạo/đồng bộ riêng; giữ rõ quán nguồn, quán đích và xác nhận | P3 |
| Kiểm toán; Dọn dữ liệu | Nhiều khối nhật ký, kiểm tra, nút xoá còn card | Widget lọc ngày/nhật ký/đối chiếu/tính toàn vẹn; Dọn dữ liệu đặt riêng, giữ xác nhận và phạm vi xoá hiện có | P3 |
| Trợ lý bán hàng | Cấu hình, chiến dịch, upsell, hiệu quả dùng card và nhiều công tắc | Chỉ đồng bộ khung các tab riêng của Trợ lý. Không đụng cấu hình nghiệp vụ hay helper giao diện dùng chung với Menu/Khuyến mãi | P3, tách lượt |
| Kho · Tổng quan | Đã có nhóm số và hàng thao tác chuyên dụng k2 | Đồng bộ đầu nhóm, số tổng và hành động; giữ hàng tác nghiệp gọn, không bọc thêm nhiều lớp | P4a |
| Tem NL; Lô BTP; Tra cứu; Sổ kho | Có thiết kế riêng cho trạng thái tem/lô và tìm kiếm | Widget bộ lọc + kết quả, đầu nhóm và chi tiết nhất quán; giữ mã, trạng thái, hạn dùng và lịch sử ở vị trí dễ quét | P4a |
| Đặt & nhận hàng | Giao diện chuyên dụng cho đơn và dòng nhận | Widget nhóm theo trạng thái/tác vụ đang có; giữ bản nháp, từng dòng nhận và luồng nhận từng phần/tiếp tục | P4b |
| Kiểm kê | Có cấu trúc biểu mẫu/dòng số chuyên dụng | Widget theo phiên/nhóm kiểm kê; số hệ thống, số thực đếm và chênh lệch rõ, giữ thao tác nhập nhanh | P4b |
| Refill & vị trí; Tồn theo vị trí; Vị trí kho | Cấu hình và tồn nằm ở các mục con, nhiều form cũ | Tách widget Quy tắc / Tồn theo vị trí / Danh mục vị trí; giữ chuyển tab, đơn vị và các liên kết nghiệp vụ | P4b |
| Sổ lệch tem; Đối chiếu BTP âm; Tóm tắt ngày & vụ lệch; Lệch kho & định lượng | Bộ lọc, bằng chứng và hành động dễ kéo dài | Widget tổng hợp + danh sách vụ/lô + chi tiết bằng chứng; không gập ẩn cảnh báo chặn hoặc hành động cần xử lý | P4c |
| Nguyên liệu | Lưới thẻ đang khá tốt; thanh danh sách, tra giá và sheet chưa đồng bộ hoàn toàn | Giữ lưới và độ gọn; đồng bộ đầu danh sách, tra giá và các nhóm form trong sheet. Xem phương án riêng bên dưới | P5a |
| Bán thành phẩm | Thẻ danh sách có trạng thái; form thêm/sửa dài và nhiều hướng dẫn mở sẵn | Giữ thẻ danh sách, chia form thành widget theo nhiệm vụ; ưu tiên công thức mẻ, sản lượng, giá thành | P5a |
| Dụng cụ đựng; Lý do hao hụt | Đã có lưới ảnh/danh sách riêng, form cũ | Đồng bộ khung form và đầu danh sách; giữ lưới ảnh chọn dụng cụ, thứ tự chọn và bì từng kiểu | P5b |
| Định mức món; GOGS Món; GOGS Topping; Bao bì | Màn riêng, nhiều trình sửa liên kết NL/BTP | Làm sau khi chuẩn form NL/BTP ổn định; chỉ đồng bộ khung, nhóm thông tin và tổng giá vốn. Không sửa giao diện tab Quản lý Menu/Khuyến mãi | P5c |
| Chi phí; Tiền mặt; Nhân viên; Lịch; Chấm công; Lương | Phần chính đã dùng widget | Giữ phần đã hoàn thành; chỉ rà popup sửa/chi tiết và trạng thái nhiều dữ liệu khi làm nhóm liên quan | Duy trì |
| Quản lý Menu; Khuyến mãi | Theo yêu cầu giữ nguyên | Không nằm trong phạm vi chuyển đổi | Loại trừ |

## Chuẩn widget cần thống nhất trước — P0

- Dùng hệ `.wdg`, `.wdg-head`, `.wdg-mark`, `.wdg-title` sẵn có; bổ sung biến thể theo nhiệm vụ khi thật sự cần. Không phát sinh một hệ giao diện khác.
- Widget là một **nhóm công việc hoặc thông tin**. Một dòng bill, một dòng kiểm kê hay một dòng công thức không nhất thiết là một widget độc lập.
- Một lớp khung chính; các dòng bên trong dùng nền nhẹ và khoảng cách gọn. Tránh widget lồng widget, tiêu đề lặp và popup có thêm hộp trắng bọc ngoài.
- Thứ tự thông tin: tiêu đề và hành động → số chính/trạng thái → các dòng cần xem → phần mở rộng. Giữ số tiền/số lượng/đơn vị quan trọng tương phản cao.
- Chữ nội dung khoảng 14–15px, chú thích 12–13px; số chính theo vai trò. Đệm tham chiếu 18–24px trên PC, 14–18px trên điện thoại, giảm ở hàng tác nghiệp. Nút bấm chính đủ vùng chạm khoảng 44px.
- Chỉ dùng lưới 2×2 khi có bốn chỉ số cùng cấp, không ép mọi bảng/form vào cùng một lưới. PC hai cột khi nội dung đủ chỗ; điện thoại xếp dọc.
- Chi tiết mở phải liền cùng widget, giữ trạng thái mở khi RT vẽ lại. Popup dùng cùng hình dáng, có nút X, cuộn rõ ràng và thao tác đóng phù hợp.
- Với bảng nhiều cột: giữ bảng khi cần so sánh; giới hạn cuộn ngang trong widget hoặc dùng bố cục riêng trên mobile. Không để toàn trang tràn ngang.
- CSS mới đặt trong khối MANAGE-SKIN cuối stylesheet, **gắn class mới cho đúng nhóm màn**. Không đổi rộng `.card`, `.row`, `.field`, `.btn`, `input`, `select` để làm một màn rồi ảnh hưởng hai tab bị loại trừ. Các helper chung có người dùng ở Menu/Khuyến mãi phải giữ hoặc tạo biến thể riêng.

## Phương án riêng Nguyên liệu/BTP — P5

### Nguyên liệu: giữ phần đã hiệu quả

Lưới hiện tại đã có tên, tồn và đơn vị nổi bật; phân biệt **Tồn ÂM / Sắp hết / Ngừng sử dụng / Không quản kho / Tem**; các nút **Sửa tồn, Sửa, Lịch sử** đặt tại thẻ. Cần giữ cấu trúc này, không tăng kích thước mỗi thẻ chỉ để đổi nền.

Đề xuất:

1. Đồng bộ đầu danh sách gồm tên, tìm kiếm, số lượng đang lọc và nút thêm; không thêm query để đếm lại danh mục.
2. Widget Tra giá theo ngày dùng bộ ngày có nhãn, kết quả cùng khối, giữ ngày áp dụng giá và lịch sử.
3. Giữ sheet thêm/sửa hiện có. Đồng bộ các nhóm Thông tin / Quy cách-quy đổi / Tồn-ngưỡng-giá / Kiểm kê-tem / Cân-bì-dụng cụ bằng cùng chuẩn widget, ưu tiên nhóm đang cần nhập.
4. Giữ **Sửa tồn** là thao tác riêng với **Sửa thông tin**. Với hàng quản lý bằng tem, UI không được mở đường ghi thẳng tồn để bỏ qua engine.
5. Tên dài, nhiều quy cách, tồn âm và ngừng sử dụng phải đọc được; menu thao tác phụ không lấn số tồn/đơn vị.

### BTP: ưu tiên rút ngắn luồng khai công thức

Form hiện tại chứa liên tiếp mã/đơn vị, tên, nguyên liệu đầu vào, hướng dẫn chế biến, hao hụt-sản lượng, hạn dùng, kế hoạch ngày và dụng cụ cân. Nhiều đoạn giải thích dài làm luồng nhập bị đứt.

Đề xuất chia nhóm:

- **Thông tin BTP:** mã, tên, đơn vị.
- **Công thức mẻ:** các dòng nguyên liệu đầu vào + định lượng, thêm/xoá dòng ngay tại đây.
- **Sản lượng & giá thành:** tổng đầu vào, sản lượng thực tế, hao hụt dự kiến, giá thành và cảnh báo. Đây là khối luôn đọc được, không gập ẩn số quan trọng.
- **Hạn dùng & kế hoạch:** hạn theo giờ/cuối ca, thời gian chế biến, mức cần chuẩn bị mỗi ngày; hiện đúng trường theo lựa chọn.
- **Quy trình chế biến:** hướng dẫn, ghi chú; giải thích dài mở khi cần thay vì luôn chiếm chỗ.
- **Dụng cụ cân:** giữ lưới ảnh và thứ tự chọn, bì theo kiểu dụng cụ; không biến thành dropdown chữ khó chọn.

PC ưu tiên lưới form phù hợp từng nhóm; điện thoại đi theo thứ tự nhập. Bắt đầu bằng cách chia lại form hiện có, chưa chuyển sang một quy trình nhiều bước hoặc popup mới. Vị trí Lưu/Huỷ rõ và nhất quán; không mất dữ liệu đã nhập khi đổi đơn vị, thêm dòng nguyên liệu hoặc chọn dụng cụ.

Trước khi làm hàng loạt cần đối chiếu mẫu có dữ liệu thực tế đại diện ở chế độ thử: NL theo tem, NL theo lô, không quản kho, nhiều quy cách, BTP nhiều đầu vào và nhiều dụng cụ. Không thay schema, tính giá vốn, yield, lịch sử giá/công thức, dấu cập nhật lãi/lỗ hoặc liên kết POS.

### Điểm chạm trong nguồn cần giới hạn

- Danh mục NL: `renderKhoItems`, `nlItemsGridHtml`, `renderInventoryItemFormFields`; giữ các hàm submit và xử lý tồn/tem.
- Danh mục BTP: `renderKhoPrep`, `renderPrepEditor`, `renderPrepVesselPicker`; giữ `prepDraft`, các id nhập liệu và cơ chế cập nhật tổng.
- Tem/lô, nhận hàng, kiểm kê: các nhánh `renderKho2*`, `renderKhoPO`, `renderKhoStockCount`; không gom thành một lần sửa lớn cùng danh mục.
- Định mức/GOGS/Bao bì có liên kết sang NL/BTP và Menu: chỉ dùng biến thể giao diện riêng, không sửa các renderer của `mn`/`tg`.

## Trình tự triển khai và điều kiện hoàn tất

| Đợt | Kết quả cần có trước khi sang đợt tiếp |
|---|---|
| P0 — Chốt chuẩn | Bộ thành phần nhỏ tái sử dụng, phạm vi CSS rõ, ảnh đối chiếu hai tab được bảo vệ và một bảng dài trên mobile |
| P1 — Việc hằng ngày | Vận hành, ghi chú, bill, cảnh báo, checklist, nhắc nhở đồng bộ; giữ luồng và trạng thái mở khi dữ liệu về |
| P2 — Đọc số | Nhóm báo cáo/phân tích đồng bộ, bảng không tràn ngang trang; kỳ xem, số tổng, bộ lọc và phần mở rộng rõ |
| P3 — Biểu mẫu/cấu hình | Form chia đúng nhóm, nút lưu đúng phạm vi; popup và trạng thái lỗi/trống đồng bộ; tác vụ nguy hiểm vẫn có xác nhận hiện hành |
| P4a/b/c — Kho vận hành | Chia ít nhất ba lượt: tổng quan-tra cứu → nhận hàng/kiểm kê/refill → đối chiếu/vụ lệch. Mỗi lượt kiểm xong luồng hiện có rồi mới tiếp |
| P5a/b/c — Danh mục và giá vốn | Làm mẫu NL/BTP trước, so sánh độ gọn và thao tác; sau đó mới mở rộng dụng cụ/lý do và định mức/GOGS/bao bì |

Mỗi đợt có thể chia tiếp thành các lượt nhỏ theo 2–3 màn liên quan; không thay cả app trong một lần.

Các tiêu chí kiểm tra cho mỗi lượt:

1. **Giao diện:** 1366 / 853 / 390px; tên dài, số lớn, không có dữ liệu, nhiều dòng, đang tải, lỗi nạp; cả phần mở rộng và popup. Không tràn ngang trang, không cắt đơn vị/tiền hoặc để nút Lưu bị che.
2. **Thao tác:** tìm/lọc/chọn kỳ, mở/gập, nhập/sửa/lưu/huỷ theo đúng phạm vi. Thao tác thường dùng không tăng số lần bấm; bảng hoặc danh sách đông dữ liệu vẫn quét nhanh được.
3. **Bảo vệ Menu/Khuyến mãi:** đối chiếu ảnh, style và thao tác chính trước/sau; không sửa renderer, DOM, popup hoặc áp CSS mới vào hai màn này. Tab có chức năng khác nhưng dùng helper chung phải được kiểm riêng.
4. **Dữ liệu:** công thức và kết quả tính giữ nguyên; RT không đọc lại điểm bán/nhóm dữ liệu không liên quan; lọc hoặc mở chi tiết trên dữ liệu đã nạp không tạo truy vấn thừa. Giữ trạng thái mở/nhập dở khi dữ liệu cập nhật theo cơ chế hiện có.
5. **Kho:** các luồng tem, lô, nhận từng phần, điều chỉnh, đối chiếu, đơn vị/quy cách và yield không đổi. Xác nhận và cảnh báo nghiệp vụ quan trọng phải còn nguyên.
6. **Phát hành:** chạy kiểm tra phù hợp thay đổi, kiểm đồng bộ bộ tính dùng chung, sinh lại bản thử và `ban_deploy/{thuong,giangsinh,tet}/`, chạy predeploy. Gửi ZIP chỉ gồm file mới cần thay; chủ dự án tự deploy Hosting.

## Triển khai

- Hoàn tất các nhóm P1–P5 bằng khung widget opt-in trong `quanlygieo.html`: `UI_WIDGET_PAGES` liệt kê từng màn và `uiWidgetsApply` đồng bộ các phần render bất đồng bộ, giữ nguyên các node/id/input/sự kiện hiện có. Lượt rAF gom thay đổi DOM; không polling, không gọi Firebase. Các màn có widget hoàn chỉnh trước đó không nằm trong danh sách đổi.
- Hôm nay · Vận hành có sáu widget cố định, phần nội dung cập nhật độc lập. Bảng báo cáo cuộn cục bộ có gợi ý; Sức khoẻ tài chính/Mục tiêu dùng hai cột khi đủ rộng.
- Danh mục NL giữ lưới/thẻ và sheet hiện hành; BTP chia sáu nhóm, sản lượng/giá thành luôn mở, hướng dẫn dài nằm trong details. Lưu/Huỷ dễ thấy; giữ draft, đơn vị, định lượng, công thức giá vốn.
- Kho giữ thẻ tem/lô cùng màu cảnh báo; chỉ đồng bộ khung/đầu nhóm, các bảng và tác vụ, không thay bộ máy kho.
- Popup thuộc màn được đổi dùng cùng nền/khung; Menu/Khuyến mãi cùng popup của chúng được so style/DOM với bản trước rollout tại `dd27002`.
- Kiểm tra: `node tools/ql_giao_dien/e2e_widgets_toan_app.js` (cần checkout git có commit tham chiếu; hỗ trợ CHROMIUM_PATH), kiểm PC/tablet/mobile, Menu/Khuyến mãi và ba popup Menu, DOM ổn định, không đọc Firebase khi trang trí, giữ focus/draft, lưu ghi chú/NL/BTP qua form thật trên Firebase giả. Chặn mạng ngoài.
- Sinh lại bản thử và ba bộ deploy theo quy trình hiện hành. Chủ dự án tự deploy Hosting.

Kết quả kiểm tra: 87 file unit/regression test đạt; e2e widget toàn app 540 kiểm tra đạt ở 1366/853/390px; bill realtime 207 kiểm tra đạt; khung điều hướng 56 kiểm tra và nhân sự 76 kiểm tra đạt. Bộ tính dùng chung khớp nguyên bản, ranh giới engine/đường dẫn sạch. Gói bàn giao chỉ gồm `quanlygieo.html` và `quanlygieo_thu.html`.
