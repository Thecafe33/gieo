# Engine 2 — rà luồng nâng mức kiểm soát và đích cấp 6

Ngày rà: 22/10/2026. Mã nguồn đối chiếu: `abf5034`, nhánh `Phan-tach-unit-engine`.

**Trạng thái: tài liệu thiết kế, chưa sửa runtime, chưa triển khai Firebase.** Phạm vi là `posgieo.html`, Engine v20, automation v3 và `quanlygieo2`; không thay những luồng bán hàng chủ quán đã xác nhận là có chủ đích.

## 1. Kết luận từ luồng thực thi

1. POS đã có một phần tự tăng kiểm soát: khi kết ngày, NL đang mở có nợ FIFO, nhiều mã cùng mở, bán không gắn được tem, lỗi phân bổ RT hoặc Sổ lệch mở có thể tự vào danh sách cân dù chưa được cấu hình. Nhưng đây là lựa chọn tại bước cuối ngày, chưa phải trạng thái kiểm soát bền qua các ca.
2. Báo hết còn dương ghi WASTE, đóng tem và đặt `needsReview:false`. Automation nhận dòng đó có ghi chú thì trả `WASTE_RECORDED`, nhóm `done`, không tự chia trách nhiệm hoặc bật cân cho lần sau. Câu ghi chú tự sinh “Báo hết còn thừa…” không xác định được nguyên nhân vật lý.
3. Trong cân NL cuối ca, chọn “không có trên tay” được coi là đủ để gửi màn. Engine trả `unconfirmed`, chỉ tạo cảnh báo và không sửa mã. Caller vẫn có đường lưu phiếu rồi chuyển bước. Đây là điểm cần tách **đã báo tình trạng** khỏi **đã hoàn tất đối soát** trong Engine 2.
4. Luồng duty hiện chia phần tiếp xúc theo lượng bán, có nhánh `pool`, và dự phòng tất cả nhân sự có mặt nếu không có barista. Nó **chưa phải** chính sách mới chia đều nhóm pha chế trong khoảng mở/cân gần nhất → kết thúc khoảng.
5. Automation có trigger cho 13 loại nguồn, nhưng lọc giao dịch chỉ nhận `WASTE`. Chênh lệch chế biến ghi `ADJUSTMENT`, Sổ lệch và sự kiện bàn giao chưa có một hợp đồng điều hành chung. Một số cảnh báo đi vào nhóm công việc chung, chưa sinh biện pháp thực thi ở POS.
6. Đã có học đơn giản: thống kê yield BTP từ các lô gần nhất và heuristic `dutyDetectRecipeBias`. Chưa thấy bộ suy luận xác suất được hiệu chuẩn, vòng tự hạ kiểm soát có kiểm chứng hoặc bộ tự kiểm toán độc lập như yêu cầu cấp 6. Riêng `refreshPrepYieldStatsPOS` đang đọc toàn bộ lô của BTP rồi mới lấy 8 lô trong RAM; không phải Firebase chỉ đọc 8 lô.

Những kết luận trên dựa caller/callee và phép chạy policy cục bộ, không phải đối soát dữ liệu sản xuất hay xác nhận một nhân viên gây mất hàng.

## 2. Phân biệt hai thang đo

**Cấp năng lực 1–6** là khả năng của toàn hệ thống. **Mức kiểm soát** bên dưới là biện pháp áp dụng riêng cho một nguyên liệu/BTP tại một điểm bán; không nâng toàn bộ cửa hàng chỉ vì một món phát sinh case.

| Mức kiểm soát đề xuất | Nhân viên thực hiện | Điều kiện hoàn tất |
|---|---|---|
| M0 — thường | Theo nghiệp vụ và cấu hình bắt buộc đang có | Có đủ dữ liệu gốc, không có yêu cầu tăng kiểm soát chưa hoàn thành |
| M1 — lấy thêm mốc | Cân/đếm xác nhận đối tượng liên quan tại cơ hội phù hợp sớm nhất | Mốc vật lý hợp lệ, đúng mã/đơn vị/bì/thời điểm; không phải nút Đã xem |
| M2 — cân bàn giao | Cân/đếm bắt buộc mỗi lần đổi nhóm phụ trách và cuối ngày đối với món đang kiểm soát | Lưu mốc, đối soát chênh lệch và mở đúng khoảng trách nhiệm tiếp theo |
| M3 — xác nhận độc lập | Thêm một lần đo mù bởi người khác phù hợp hoặc nguồn đo độc lập đã được công nhận | Đối chiếu hai kết quả và chất lượng phép đo; không coi hai số của cùng người là hai xác nhận độc lập |

Có thể nhảy thẳng M2 khi báo hết còn lượng đáng kể; không bắt đi qua tuần tự M0 → M1 → M2. M1 cũng có thể là tác vụ lấy mốc ngay trong khi M2 đã được bật cho các ca sau. M3 không phải yêu cầu thêm thao tác cho mỗi ly bán ra.

Không khóa order, thanh toán, check-in hoặc check-out chấm công. Ca thực tế vẫn ghi đúng giờ. Trạng thái **bàn giao kho chưa hoàn tất** được giữ riêng, không kéo dài giờ công giả hoặc giả đã cân xong. Ngoại lệ mất mạng/hỏng cân phải có nhánh phục hồi tại điểm bán và người nhận việc rõ ràng.

## 3. Ma trận case cần điều hành

P0: cần đi trọn trong luồng đầu tiên trước áp dụng thật. P1: mở rộng sau khi P0 có bằng chứng đúng. P2: nhánh riêng, không tự suy rộng chính sách trách nhiệm NL sang đó. Các biện pháp trong cột cuối là **đề xuất**, chưa chạy trong sản phẩm.

### 3.1. Hao hụt vật lý và mốc bàn giao

| Case | Hiện có thực sự | Phản ứng Engine 2 cần có |
|---|---|---|
| **A1 / P0 — Báo hết nhưng sổ còn dương** | `lifecycle.finish` ghi WASTE theo số dư; checkbox xác nhận ở POS; không có nâng mức bền | Liên kết đúng WASTE, chốt khoản hao hụt một lần; chia đều nhóm barista đủ điều kiện trong khoảng theo chính sách mới; bật M2 cho món tại quán, giao lấy mốc sớm cho các mã còn sử dụng |
| **A2 / P1 — Báo hủy/đổ/vỡ/hỏng có lý do** | `lifecycle.requestDiscard`/hủy BTP ghi hao hụt; có người báo và lý do | Không miễn kiểm soát chỉ vì có câu lý do; một vụ có chứng cứ và nhiều vụ lặp cần biện pháp khác nhau. Tổng hợp lượng/giá trị/tần suất; lấy mốc hoặc nâng M2 khi tái diễn. Người báo không tự biến thành người gây ra |
| **A3 / P0 — Cân NL thiếu so với sổ** | Cân từng mã, giữ bill phát sinh giữa lúc cân/chốt; WASTE và duty case; chưa có cơ chế mới xuyên ca | Xác nhận chất lượng số đo, liên kết hao hụt hiện có, dùng mốc gần nhất để phân bổ; duy trì M2; lên M3 nếu số đo bất nhất hoặc tái diễn dù đã M2. Dư hàng đi nhánh kiểm sổ, không bù trừ để che khoản thiếu khác |
| **A4 / P0 — Đếm/cân BTP thiếu** | Ghi chênh lệch theo lô; cân lại mù theo cổng duty; có việc xác minh 48 giờ | Đồng bộ lô, số đếm, WASTE và hồ sơ trách nhiệm thành một case. Tách hủy hạn dùng khỏi thiếu không giải thích; không cộng WASTE từ cảnh báo thêm lần nữa. Đưa BTP liên quan vào M2/M3 theo chất lượng bằng chứng |
| **A5 / P0 — Đầu ca khác số cuối ca trước** | Refill `mustCount` có đếm mù hai lần và `handover_variance`; không phải mốc đổi mọi nhóm pha chế | Đặt khoảng trách nhiệm đúng giữa hai mốc có giao nhận; người phát hiện ca sau không mặc định chịu khoản trước. Tự yêu cầu kiểm nhận/đo độc lập khi hai số không ổn, lưu mốc mới để khoảng sau ngắn lại |
| **A6 / P0 — Mã đang mở không có trên tay** | Cân cuối ca trả `unconfirmed`; kiểm kê có báo mất chờ duyệt và luồng tìm lại | Phân biệt mất nhãn, đã dùng hết chưa báo, mất hàng thật. Giao kiểm tra/quét/đếm đúng đối tượng ngay tại quầy; chưa có kết quả thì tác vụ đối soát chưa hoàn tất. Khi xác lập mất hàng, ghi/liên kết tổn thất và trách nhiệm theo chính sách, không chỉ tạo cảnh báo |
| **A7 / P1 — Hủy hết hạn lặp lại** | Hạn dùng, hủy NL/BTP và theo dõi hạn trong automation | Phân biệt tồn quá nhiều, sai luân chuyển, chậm ghi hủy; tăng kiểm hạn/kiểm nhận và điều chỉnh khuyến nghị mẻ trong phạm vi chính sách. Không tự kéo dài hạn dùng hoặc giả hàng đã bị hủy vật lý |
| **A8 / P1 — Nhiều khoản nhỏ dưới ngưỡng riêng lẻ** | Có ngưỡng từng lần, WASTE nhỏ vẫn có sổ; chưa có trạng thái phòng ngừa dựa tích lũy | Dùng tổng thiếu, tỷ lệ trên lượng sử dụng và số lần trong cửa sổ; gộp một nhiệm vụ/món/quán. Không để chia nhỏ khoản hao hụt làm mất tín hiệu. Ngưỡng là ngưỡng thao tác, không xóa khoản mất khỏi sổ |

### 3.2. Nấu BTP và tiêu hao NL

| Case | Hiện có thực sự | Phản ứng Engine 2 cần có |
|---|---|---|
| **B1 / P1 — Mẻ dùng thêm vượt định mức** | `extra_usage` vượt 5% gắn review; phần dùng thêm vào giá vốn mẻ | Tách **tiêu hao thực tế của mẻ** khỏi **hao hụt**. So theo công thức, cỡ mẻ, số đo và lịch sử; tăng cân trước/sau cho đúng NL/mẻ nếu bất thường. Không quy toàn bộ phần vượt thành WASTE |
| **B2 / P0 — Chênh lệch trước mẻ/chưa chắc nguyên nhân/sổ thấp hơn thực** | Reconcile có WASTE, ADJUSTMENT, metadata phân loại và cờ review; automation không nhận mọi ADJUSTMENT | Chuẩn hóa sự kiện từ kết quả reconcile, không chỉ loại giao dịch. Đo bổ sung khi cần; tách khoản đã mất trước mẻ khỏi lượng mẻ thật dùng. Chênh lệch sổ chưa xác minh không tự biến thành mất vật lý hoặc lỗi người nấu |
| **B3 / P1 — Yield lệch, giá vốn BTP bị kéo lệch** | Trung bình tối đa 8 lô, đủ 3 mẫu có thể cập nhật giá vốn; lệch >10% sinh cảnh báo | Học riêng theo BTP/cỡ mẻ/phiên bản công thức, chất lượng cân và điểm bán. Đối chiếu đầu vào–đầu ra, phát hiện sai bì/ghi số; hiệu chuẩn dự báo có phiên bản. Không tự hợp thức hóa hao hụt bằng việc tăng định mức; không sửa giá vốn lịch sử đã chốt |
| **B4 / P0 — Mẻ dở, khóa cân treo, force settle/hủy mẻ, dùng bù** | Có khóa reconcile, phục hồi, force settle, chuyển phần WASTE sang CONSUMPTION khi xác nhận dùng bù | Tự tiếp tục phần dở và giao đo hoàn thiện đúng mã; giám sát tuổi tác vụ. Khi dùng bù/hoàn tác phải rút hoặc sửa quyết định cũ theo phiên bản, tránh WASTE + CONSUMPTION hai lần. Không xóa khóa bằng cách đoán số hoặc cản bán hàng |

### 3.3. FIFO và gắn tiêu hao vào mã

| Case | Hiện có thực sự | Phản ứng Engine 2 cần có |
|---|---|---|
| **F1 / P0 — Nợ FIFO/tem âm** | Cơ chế giữ nợ, mã mới hấp thụ nợ và lựa chọn cân cuối ngày | Đối soát trước: thiếu khai mở, sai quy đổi hay số đo thật. Tự giao kiểm nhận/mở đúng mã, lấy mốc M1/M2. Nợ sổ không tự bị gọi là mất hàng; không vừa hấp thụ nợ vừa thu lại như một WASTE khác |
| **F2 / P0 — Bán không có tem mở/lượng không phân bổ được** | `untracked_unit_consumption`, Sổ lệch, tự chọn cân khi cuối ngày vẫn có mã mở | Tạo việc ngay theo món, không đợi quản lý mở trang hoặc phải có mã mở mới nhìn thấy. Nếu chưa có đối tượng cân: kiểm nhận thực tế/ghi đúng thao tác mở; giải quyết liên kết sổ rồi mới xét hao hụt |
| **F3 / P1 — Mở nhiều mã/override lặp** | Soft-lock có lý do, ghi `openedWithOtherOpen`/`openOverrideReason`; cuối ngày có thể cân | Giữ quyền mở ngoại lệ đã được thiết kế. Tăng xác nhận mã đang dùng và mốc từng mã nếu lặp hoặc đi cùng thiếu; không đổi thành khóa cứng, không mặc định mọi override là vi phạm |
| **F4 / P1 — BTP âm hoặc có shortage chờ bù** | Engine có pending shortage và xử lý nợ BTP | Tự đối chiếu mẻ hoàn tất, lượng bán, tác vụ dở và phiên bản công thức trước; đo tồn tại mốc bàn giao nếu cần. Không tự đưa tồn về 0 hoặc ghi hao hụt chỉ để dọn nợ |

### 3.4. Đầu vào, dụng cụ và khả năng truy ngược

| Case | Hiện có thực sự | Phản ứng Engine 2 cần có |
|---|---|---|
| **D1 / P1 — Nhận thiếu/hỏng/sai đơn vị, phiếu nhận–PO–số tem không khớp** | Lưu đơn vị/hệ số người nhận chọn, tính `goodBase`; sinh tem có ID chống lặp; có báo lỗi sync PO | Kiểm số kiểm kê/tem dự kiến với số thực sinh và số hàng lành, tự phục hồi phần dở. Giữ đơn vị kiểm kê/dán tem; hàng không QR theo cách nhận kho đã lưu. Không đổi 6 bịch thành 6 thùng; không bắt nhân viên chia ngược g/ml để xác nhận số chai |
| **D2 / P1 — Thiếu nhãn, in lại liên tiếp** | `labelEvents`, cấp lại mã nhưng giữ containerId, theo dõi tem chưa in sau 48 giờ | Giao in/dán/xác nhận đúng mã; nếu lặp thì tăng kiểm nhận. Mất nhãn không phải mất hàng, in lại không tạo hàng mới. Phải theo containerId để không tạo hai khoản trách nhiệm cho mã cũ/mới |
| **D3 / P0 — Thiếu công thức hoặc định mức topping** | `missing_recipe` gộp theo ngày/tên/size, có `hitCount`; bán vẫn tiếp tục | Giữ việc dữ liệu chưa đủ tới khi định mức hợp lệ và các lượt thiếu liên quan được đối soát. Có thể lấy cấu hình đã được xác nhận cho đúng SKU/size/phiên bản, hoặc giao người có quyền bổ sung; không đoán công thức hay mặc định COGS=0. Không biến thành một lượt duyệt của chủ cho từng bill |
| **D4 / P0 — Chưa gắn dụng cụ, thiếu bì/tỷ trọng/đơn vị đo phù hợp** | Nút cân phụ thuộc dụng cụ đã gắn; thiếu thì luồng cũ còn nhập tay; NL ml/l cần tỷ trọng | Trong nhiệm vụ bắt buộc, cho chọn thư viện dụng cụ hợp lệ ngay tại chỗ; thiếu bì/tỷ trọng thì hướng dẫn đo bổ sung theo quyền. Lưu bì, biến thể, phép đo. NL kiểm kê theo cái/chai dùng cách đếm phù hợp; không ép mọi món sang gram |
| **D5 / P1 — Điều chỉnh tay/sửa số lô lặp** | Có ADJUSTMENT, amendments, Sổ lệch và đường sửa qua Engine | Liên kết sửa số với case gốc và mốc mới; tăng kiểm chứng khi cùng món phải sửa liên tiếp. Phân biệt sửa sai nhập liệu với bù thiếu vật lý. Không để đổi số làm mất lịch sử trách nhiệm hoặc làm sạch tín hiệu tái diễn |

### 3.5. Lỗi kỹ thuật và nhánh tài chính riêng

| Case | Hiện có thực sự | Phản ứng Engine 2 cần có |
|---|---|---|
| **T1 / P0 — RT/Firestore hoặc ghi sổ dở** | Các nhánh heal, pending, transaction, cảnh báo `allocate_rtdb_error`/`shift_weigh_heal_failed` | Tự sửa liên kết và tiếp tục phần chưa xong có giới hạn retry. Trong lúc sổ chưa đáng tin, không chốt trách nhiệm tiền dựa trên số sai; yêu cầu mốc độc lập nếu cần. Giữ khoản lỗi hệ thống riêng với mất hàng |
| **T2 / P0 — Trừ/hoàn bill lặp hoặc hoàn thất bại** | Claim/ID chống lặp, cảnh báo duplicate/reversal; có thể có nhiều dòng hợp lệ cùng bill | Kiểm ID thao tác, món/NL, allocations và phần hoàn thực tế. Hai dòng cùng bill chưa đủ chứng minh trừ đúp. Tự đối soát; không chia một lỗi phần mềm thành khoản nhân viên phải chịu |
| **T3 / P0 — Sự kiện đến muộn, tác vụ hết hạn, mất ACK hoặc bị thay thế** | Queue/revision/lease/clock, Engine có hết hạn xác minh và đóng pool | Đánh giá lại nguồn hiện hành; giữ action bền cho tới ACK và kết quả. Hết hạn không tương đương hết tổn thất; thiếu xác minh phải chuyển biện pháp/người nhận việc, không tự đóng là đã giải quyết. Không phục hồi quyết định cũ đè bản tay đã chốt |
| **T4 / P0 — Sai cửa hàng, app cũ chưa áp dụng biện pháp** | Phân vùng GieoData; `withStore` dùng ngữ cảnh chung; có cổng phiên bản Engine trong duty | Mọi sự kiện/instance/control/mốc gắn storeId cố định. Máy cũ hoặc chưa ACK là chưa có hiệu lực, không hiển thị đã bảo vệ. Không chạy `withStore` song song trên instance dùng chung |
| **C1 / P2 — Lệch tiền mặt/tiền bổ sung chưa đối soát** | Đếm mù có giới hạn lượt, lưu expected/actual/variance; có biên bản đoạn ca và addon | Dùng chính số và đoạn giao nhận hiện có để điều hành theo chính sách tiền mặt riêng. Không áp phép chia đều barista của NL vào két; không đảo các luồng cố ý đã được chủ quán chốt. Nhánh này không là điều kiện để bắt đầu A1 |
| **C2 / giữ nguyên — Chi phí cần duyệt** | `expenses.status=pending_review` vào nhóm chủ duyệt | Vẫn cần chủ duyệt. Học/kiểm soát kho không tự cấp quyền duyệt chi, chuyển khoản hay trừ lương |

## 4. Các cấu hình/luật đang có — không được nhầm với Engine 2

| Cấu hình hoặc luật | Thực tế đang dùng | Lưu ý khi kế thừa |
|---|---|---|
| `shiftCountTiming` | Chọn NL cân/đếm đầu/cuối/cả hai theo cấu hình; cuối ngày bổ sung một số NL bất thường | Cấu hình bắt buộc do quản lý đặt là mức sàn, thuật toán không tự tắt |
| Refill `mustCount`, `countTiming` | Đếm giao ca theo rule; dung sai `abs(diff) > max(1, abs(base) × 5%)` | Không phải mọi lần nhân viên barista đổi ca đều tạo mốc này |
| Cân NL lệch lớn | Vượt **25% dung tích mã**; nếu thiếu dung tích mới lấy độ lớn số sổ, sàn 1; hỏi xác nhận “Vẫn ghi” | Không phải đã cân độc lập; không phải ngưỡng 25% mọi tổn thất |
| Cổng cân lại duty | `abs(variance) >= 50% × base` **và** `>=150`; base ưu tiên lượng dùng, rồi số sổ, rồi 1 | Đơn vị theo món. Không áp 150 g cho món đang đo cái/lít mà không xét độ phân giải |
| Cổng thông báo duty | `abs(variance) > 100% × base` **và** `>=50` | Ngưỡng thông báo không quyết định khoản thiếu có tồn tại hay không |
| Giống nhau giữa hai số cân | Sai khác `<= max(10, 3% × max(abs(a), abs(b)))` | Luật hiện có; cần xem lại theo loại đơn vị/thiết bị khi hiệu chuẩn |
| Xác minh/tranh chấp | Verify 48 giờ; automation đóng tranh chấp theo cấu hình, mặc định 7 ngày, giữ quyết định tay | Hiện có đường `closed_pool`; chưa đạt mục tiêu tự giải quyết trách nhiệm mới |
| `dutyDetectRecipeBias` | Tối thiểu 5 mẫu, 80% cùng dấu; so ít nhất 2 người có tiếp xúc đáng kể và mức lệch cùng chiều | Heuristic, không phải chứng cứ chắc chắn lỗi công thức; không có xác suất đã kiểm định |
| Yield BTP | Tối đa 8 lô; từ 3 mẫu có thể cập nhật giá vốn; lệch trung bình >10% mới cảnh báo | Đã có cập nhật từ dữ liệu, nhưng chưa đủ cơ chế tự hiệu chuẩn/kiểm toán cấp 6 |
| Dùng thêm khi nấu | `extra_usage` vượt 5% định mức gắn review; bỏ sai số rất nhỏ | Không được đánh đồng mọi phần dùng thêm với thất thoát |
| Hạn/mức tồn/nhãn | Hạn mở, hạn BTP, minStock; automation theo dõi expiry và nhãn sealed chưa in quá 48 giờ | Phụ thuộc dữ liệu nguồn; không tự xác nhận thao tác vật lý |
| Automation v3 | Owners/backups, `lowValueLimit`, `disputeDays`, ngày bắt đầu; active cần xác nhận phiên bản đội máy | Giao việc/ghi nhận/theo dõi hiện có không đồng nghĩa đã phân bổ thiệt hại và áp dụng biện pháp |
| `FINISH_REVIEW_RATIO=0.25` ở POS | Hằng còn trong HTML, đường submit đã ủy quyền Engine | **Không tính là luật báo hết 25% đang thực thi.** Cũng không có căn cứ nói “còn thừa ≥50%” là luật finish hiện hành |

13 loại nguồn automation hiện tại: `alerts`, `duty_cases`, `stock_transactions`, `prep_transactions`, `stock_containers`, `prep_batches`, `inventory_items`, `stock_counts`, `purchase_orders`, `expenses`, `daily_openings`, `daily_closings`, `duty_tasks`.

Các nhánh rule đã có: chi phí chờ duyệt; đồng hồ xác minh; kết quả/tranh chấp duty; WASTE có/thiếu lý do hoặc khoản nhỏ; cảnh báo chung; tem/lô cần review/quá hạn/chưa in; tồn âm/thấp; kiểm kê chờ duyệt; PO nhận dở; ngày chưa đóng. Chúng chưa phải bộ tự tăng–giảm kiểm soát. `stock_anomalies`, mốc bàn giao, ca nhân viên và kết quả reconcile không phải các trigger riêng đầy đủ trong bộ này.

**Rủi ro đa quán:** `shiftCountTiming`/`vesselIds` là trường danh mục có thể đồng bộ qua catalogMirror. Yêu cầu kiểm soát phát sinh riêng gg01 phải lưu riêng cửa hàng, không bật/tắt các trường danh mục để vô tình lan sang gg02.

## 5. Đích cấp 6 và bằng chứng nghiệm thu

Đây là đích hoàn thiện chủ quán yêu cầu cho Engine 2. Một bản có nhiều rule hoặc một bảng chấm điểm không được gọi là cấp 6. Từng năng lực cần dữ liệu và bằng chứng thực hiện; hiện chưa có runtime Engine 2.

| Cấp | Engine 2 phải làm được | Bằng chứng để nghiệm thu |
|---|---|---|
| 1 — Ghi đủ | Giữ sổ, tem, FIFO, bill và phép đo có thể đối chiếu; không có sổ thiệt hại thứ hai | Cùng tổn thất có một ID và một giá trị nguồn; tổng phân bổ/điều chỉnh khớp nguồn, không WASTE đúp |
| 2 — Luật | Rule có phiên bản, đúng đơn vị và phạm vi; chọn hành động cụ thể | Replay cùng dữ liệu và phiên bản cho cùng quyết định; cấu hình không lan nhầm quán |
| 3 — Học mức thường | Học theo món/quán/nhóm ca, cách đo và phiên bản công thức; có chế độ ít mẫu | Kiểm bằng dữ liệu ngoài tập học, theo thời gian; mức dự báo không bị một mẻ lỗi kéo lệch; tách “đang học” và “đủ tin cậy” |
| 4 — Suy luận có xác suất | Xếp giả thuyết có bằng chứng, độ bất định và khả năng thiếu dữ liệu; không biến nghi vấn thành kết tội | Xác suất đối chiếu được với kết quả xác minh độc lập; thiếu mẫu không in phần trăm giả; phân biệt kết luận nguyên nhân và phân bổ theo chính sách |
| 5 — Vòng kín | Chọn phép đo tiếp, thi hành ở POS, nhận kết quả, thay đổi kiểm soát, tự hạ khi ổn thật | Case đi hết event → quyết định → POS ACK → đo → đối soát → đánh giá; mất ACK/retry vẫn phục hồi, không cần chủ xử lý từng case |
| 6 — Tự hiệu chuẩn/tự kiểm toán | Tự đánh giá độ đúng của dự báo, ngưỡng, giả thuyết và tác vụ; phát hiện chính quyết định sai của mình, phục hồi có giới hạn | Bộ kiểm độc lập phát hiện lỗi cài sẵn; hiệu chuẩn có phiên bản/giới hạn/quay lui; công bố số sai, khoản chưa khớp và độ phủ, không chỉ thống kê thành công |

### 5.1. Học cái gì, không được “học cho hết lỗi”

- Dữ liệu học ưu tiên mốc cân/đếm được xác thực, đúng đơn vị/bì, sổ đã đối soát và khoảng sạch. Lưu cả mẫu bị loại và lý do; không xóa case xấu để báo chất lượng đẹp.
- Học độ sai của phép đo, yield theo cỡ mẻ, tiêu hao theo lượng dùng và tần suất bất thường. Dùng thống kê bền trước ngoại lệ và độ bất định; chia nhóm vừa đủ mẫu, không tách nhỏ mọi nhân viên/giờ tới mức không học được.
- Giai đoạn ít mẫu dùng mức sàn an toàn và độ bất định rộng, có thể tham khảo nhóm món tương đương đã được xác nhận. Không chép kết luận trách nhiệm hoặc mốc thực tế của quán này sang quán khác.
- Thay công thức, bao gói, bì, đơn vị hoặc cách đo phải tách phiên bản/đánh giá lại baseline. Không dùng giá trị hiện tại để viết lại lịch sử.
- **Hao hụt thường xuyên vẫn là hao hụt.** Baseline thực tế và mục tiêu tổn thất cho phép là hai thứ khác nhau. Không tự tăng định mức, nới dung sai vô hạn hoặc miễn trách nhiệm vì “món này thường mất như vậy”.

### 5.2. Suy luận nguyên nhân và trách nhiệm là hai kết quả riêng

Nhóm giả thuyết cần phân biệt: số đo/bì/đơn vị sai; định mức/sản lượng sai; nhận hàng/ghi sổ thiếu; thất thoát vật lý chưa khai báo; lỗi thực thi/đồng bộ. Một case có thể phải tách nhiều khoản, không ép một nguyên nhân cho cả số tiền.

Xác suất phải dựa trên dữ liệu đã kiểm chứng hoặc mô hình được kiểm định. Ban đầu chưa có dữ liệu xác minh thì chỉ ghi giả thuyết và mức thiếu căn cứ; không tự gắn “90% nhân viên lấy ăn”. Chọn phép đo có thể phân biệt các giả thuyết thay vì tiếp tục hỏi người quản lý.

Khi mất vật lý đã được xác lập nhưng chưa biết hành vi, vẫn áp chính sách chia đều nhóm barista đủ điều kiện trong khoảng. Ghi rõ **phân bổ theo chính sách**, không giả là chứng minh mỗi người trực tiếp làm mất. Chưa đủ ca/role/mốc/giá vốn thì hệ thống tạo việc bổ sung tại điểm bán; tổn thất không bị bỏ khỏi sổ và hồ sơ chưa được ghi đã quyết toán đủ. Không lấy nhân sự order thế chỗ, không lấy cost=0 để đóng việc.

### 5.3. Chọn phép đo và tự hạ mức

Chọn phép đo theo khả năng giảm bất định, giá trị có nguy cơ mất và thời gian thao tác. Sai bì cần kiểm bì; lệch giữa hai nhóm ca cần mốc bàn giao; nghi thiếu ghi mở cần xác nhận mã; số đo không nhất quán cần đo độc lập. Không tự thêm cân tất cả NL ở mọi ca.

Đề xuất điều kiện tự hạ một bậc: đủ số mốc hợp lệ trải qua đủ ngày và lượng sử dụng, không có thiếu lớn hoặc case chưa đối soát, chất lượng phép đo đạt, biện pháp đã được các máy áp dụng. Mốc khởi điểm để thử: ít nhất 5 mốc sạch trên ít nhất 3 ngày có hoạt động; lượng dùng tối thiểu/sai số phải theo nhóm món, không coi đây là hằng số đã được duyệt cho sản xuất.

Hạ từng bậc và giữ một số phép đo kiểm tra theo ngân sách; tái diễn thì nâng lại nhanh. Không hạ vì không bán món đó, không có ai cân, hết 48 giờ hoặc case bị đánh dấu Đã xem. Không hạ dưới cấu hình bắt buộc của quản lý. Nếu chỉ có một nhân viên thì ghi đúng giới hạn xác minh, không tự tạo tên người xác nhận thứ hai.

### 5.4. Tự hiệu chuẩn có rào giới hạn

1. Sau kết quả xác minh độc lập, đánh giá sai số lượng dự báo và chất lượng xác suất (ví dụ độ khớp xác suất/Brier score trên mẫu kiểm). Nhãn học phải đến từ kết quả nghiệp vụ, không phải chính phỏng đoán trước của Engine.
2. Chỉ cập nhật tham số được phép: phân bố sai số đo, baseline dự báo, lịch lấy mẫu, ngưỡng thao tác trong mức sàn/trần đã đặt. Tách tham số học và chính sách trách nhiệm/tiền.
3. Thử bộ tham số mới trên lịch sử và tập thời gian chưa học, rồi chạy đối chiếu trên phạm vi nhỏ. Chỉ tự đưa vào dùng khi đạt tiêu chí tốt hơn về bỏ sót, yêu cầu đo sai và công thao tác, không chỉ giảm số cảnh báo.
4. Mỗi lần đổi lưu dữ liệu căn cứ, phiên bản, phạm vi, chênh lệch chất lượng và bản quay lui. Nếu chất lượng giảm, dữ liệu đổi mạnh hoặc không đủ mẫu, tự quay về bản đáng tin/mức sàn; duy trì đo cần thiết.
5. Không tự sửa lịch sử WASTE/COGS, chuyển tiền, trừ lương, sửa giá bán hoặc nới hạn dùng để làm chỉ số đẹp. Tự hiệu chuẩn không tự ban hành chính sách tài chính mới.

### 5.5. Bộ tự kiểm toán độc lập

Một bộ kiểm riêng đánh giá sự kiện, quyết định và kết quả từ các bất biến; không chỉ gọi lại cùng hàm quyết định và nhận “đúng”.

- Kho/tiền: nguồn hao hụt duy nhất; phân bổ + phần chưa quyết toán khớp tổn thất hiệu lực; hoàn tác/đổi loại được bù đúng; không ghi WASTE hai lần từ một case.
- Khoảng trách nhiệm: đúng storeId, mốc vật lý, nhân sự và role lịch sử; không chồng khoảng đã quyết toán. Nhiều dòng cùng bill phải kiểm thao tác thực, không kết luận trùng chỉ theo billId.
- Mốc phải phù hợp đối tượng: mốc tổng của nhiều mã không tự trở thành số cân riêng của một tem. Thiếu mốc riêng thì lấy mốc mở hợp lệ hoặc giao đo để mở khoảng rõ ràng tiếp theo; lưu đúng giới hạn của căn cứ hiện có.
- Thi hành: control đã ghi chưa đủ — POS có ACK đúng phiên bản và phép đo đạt hay chưa; `missing/unconfirmed`, hết hạn hoặc đã xem không đủ để báo hoàn tất.
- Mô hình: phát hiện drift, dữ liệu ít, mẫu không độc lập, tỷ lệ báo sai/bỏ sót, thiếu nhãn học và baseline đang học chính thất thoát lặp lại.
- Khôi phục: sự kiện đến muộn, đổi nhân sự, sửa nguồn, retry, app cũ, mất mạng và hai worker không làm chốt hai kết luận cạnh tranh.
- Khi tự phát hiện lỗi: đánh dấu kết quả bị ảnh hưởng, tạm dừng **quyết toán tự động của nhánh đó**, phục hồi/tính bù qua phiên bản và tăng kiểm chứng tại điểm bán nếu cần. Bán hàng và chấm công tiếp tục. Không ghi đè quyết định tay bảo vệ sẵn.

Mỗi quyết định được kiểm các bất biến bằng payload/summary sẵn có; đối chiếu chi tiết chỉ giới hạn theo khoảng/mã nghi vấn hoặc nhiệm vụ tới hạn. Kiểm toán phần mềm không thể tự xác nhận lượng hàng vật lý chưa ai đo.

## 6. Kiến trúc đọc/ghi để vận hành nhiều cửa hàng

- Dùng sự kiện có nghĩa từ Engine: finish/discard, kết quả reconcile/cân/nhận/hoàn tác, thay đổi ca và kết quả tác vụ. Không thêm đọc lịch sử vào mỗi lần chọn món hoặc thanh toán.
- Gắn `storeId`, ID nguồn/operation/loss, phiên bản, thời điểm nghiệp vụ, mã/món, đơn vị, lượng và tham chiếu mốc vào sự kiện. Dùng outbox/ý định bền gắn cùng commit nghiệp vụ hoặc cơ chế phát lại có thể chứng minh không mất sự kiện; không chỉ emit từ DOM sau thao tác.
- Cùng một transaction có thể sinh WASTE + alert + duty case: liên kết về một case nguồn. `ADJUSTMENT` chỉ đi vào khi có semantics liên quan; không nghe mọi thay đổi sổ rồi đọc lại toàn kho.
- POS nhận bản control gọn của chính cửa hàng, cập nhật theo phiên bản; tái sử dụng cache/mốc và dữ liệu ca đã có. Thư viện dụng cụ tải khi thực sự cần chọn/đo, có cache; không tải thư viện của tất cả quán.
- Worker dùng checkpoint và summary theo khoảng, chỉ đọc phần ca/ledger còn thiếu của đúng món/quán. Khi sửa dữ liệu cũ, đánh dấu đúng khoảng bị ảnh hưởng; không tính lại toàn lịch sử cho một tem.
- Học/kiểm toán theo kết quả đo và kỳ đã đóng; giữ thống kê đủ dùng, mẫu kiểm được giới hạn và truy vấn phân trang. Không nhân thêm một lượt quét tất cả bill cho từng model.
- Thay đường thống kê yield đang đọc toàn bộ lịch sử sau hoàn thành/sửa lô bằng summary hoặc cửa sổ truy vấn hữu hạn đúng điều kiện, có xử lý sửa/hủy lô cũ. Chỉ một bên được quyền ghi tham số/giá vốn khi chuyển tiếp; không để updater POS cũ cạnh tranh với bộ hiệu chuẩn mới.
- Clock hiện tại còn vòng qua danh sách quán đăng ký mỗi 15 phút. Để tiến tới quy mô lớn cần phân vùng hàng đợi/tác vụ tới hạn, hạn tải và cách ly lỗi; không coi vòng quét hiện tại đã đủ cho 10.000 quán.
- Màn chuỗi chỉ đọc tổng hợp theo quán: mất bao nhiêu, đã phân bổ bao nhiêu, còn thiếu dữ liệu gì, bao nhiêu biện pháp đang có hiệu lực và hiệu quả. Chi tiết mở khi bấm.

Theo dõi cả reads/writes mỗi case, mỗi mốc, mỗi quán/ngày và trên 1.000 bill; đo trước/sau. Không tuyên bố “không tăng lượt đọc”: xác minh/đo/học có thể cần đọc thêm, nhưng phải có mục đích, phạm vi và ngân sách.

## 7. Thứ tự triển khai và kiểm chứng

1. **Chuẩn hóa sự kiện và kiểm sổ trước phân bổ.** Map các nhánh WASTE/ADJUSTMENT/alert/duty, ID chống lặp, ca/mốc/giá vốn và cách xử lý nguồn bị sửa. Chốt chính sách chung cho nhóm thiếu dữ liệu, sai số theo đơn vị và quyền bổ sung bì/tỷ trọng; không hỏi chủ duyệt mỗi case.
2. **Đi trọn A1 → D4 → A3/A5.** Case 500 g − 200 g đã dùng = 300 g báo hết: 4 barista hợp lệ nhận 75 g/người, theo giá vốn nguồn; không trừ kho thêm; tự bật M2 và lấy mốc cho mã còn dùng/mở mới. Bàn giao sau tách đúng nhóm và khoảng mới. Không hồi sinh tem finished.
3. **Đóng các lối mất kết quả P0.** Unconfirmed không giả hoàn tất; nguồn kỹ thuật lỗi không quy sai; tác vụ bền, ACK, máy cũ, mất mạng và đóng trình duyệt vẫn phục hồi. Không để check-out chấm công bị kéo dài vì kiểm kê.
4. **Mở rộng các case P1 và baseline cấp 3.** Theo chất lượng đo và chi phí thao tác; không tăng kiểm soát cả chuỗi khi một món bất thường.
5. **Đạt cấp 4–5 bằng dữ liệu thực có kiểm chứng.** Giả thuyết minh bạch; thu kết quả xác minh; kiểm định xác suất; lấy thêm phép đo và tự hạ theo tiêu chí. Chưa có dữ liệu đủ thì chưa gọi xác suất là đã đáng tin.
6. **Nghiệm thu cấp 6.** Cài lỗi giả trong môi trường thử: trùng event, sai đơn vị/bì, worker cũ, sai cửa hàng, allocation không khớp, drift, baseline học hao hụt, mất ACK và sự kiện đến muộn. Bộ kiểm phải phát hiện/khôi phục, giữ một khoản nguồn và không chặn bán. Kiểm trên quán thử rồi mở dần; chỉ gọi hoàn thiện khi có báo cáo chứng minh.

Chỉ số đánh giá: thiếu thực/giá trị mất trên lượng dùng; tỷ lệ tái diễn sau biện pháp; tỷ lệ ca có mốc đáng tin; khoản trách nhiệm đã quyết toán/chưa đủ dữ liệu; tác vụ chưa ACK/quá hạn; số yêu cầu cân sai và thời gian nhân viên phải thao tác; chất lượng dự báo/xác suất; read/write theo ngân sách. Không dùng “hộp thư trống” hoặc “100% case done” làm tiêu chí thành công.

## 8. Bản đồ bằng chứng mã nguồn

Tên hàm là điểm tra chính; số dòng thuộc commit rà, có thể thay đổi ở lần sau.

| Nguồn | Vị trí/luồng đã đọc |
|---|---|
| `posgieo.html` | `openConfirmFinishSheet`/`submitFinishContainer` (~4500–4660) → Engine finish; `prepReconExtraNeedsReview` (~11404); yield constants/`refreshPrepYieldStatsPOS` (~12204–12305), caller sau hoàn thành/sửa lô (~12891, ~13072) |
| `posgieo.html` | `handoverIsOverThreshold` (~16980), `_finalizeHandoverOpen` (~17362); cổng duty ở submit BTP (~18235) |
| `posgieo.html` | `computeShiftInventoryCountLinesPOS` (~18600), `shiftWeighAnomalyItemsPOS` (~18684), `shiftInventoryCountLineDonePOS` (~18944), submit → `UnitEngine.shift.applyLine` (~19015) |
| `posgieo.html` | `vesselsForItemPOS` (~9308), `openWeighPad` (~9480); `reportMissingRecipePOS` (~20669), `poReceiveQuantities` (~21251), nhận → `lifecycle.createFromReceipt` (~21830) |
| `unit_engine.v20.js` | `unitEngineFinishOpenUnit` (~931), `shiftWeighApplyLinePOS` (~2962), `codesReprint` (~3092), `lifecycleMarkFound`, `approvePendingLostReportsForItem` (~3405), `lifecycleRequestDiscard` (~3530) |
| `unit_engine.v20.js` | `prepReconCommit` (~3732), `prepReconForceSettle` (~3837), `prepFinishBatch` (~4103), `prepCountCommitLine` (~4493) |
| `unit_engine.v20.js` | `dutyWasteDecision` (~4873), DUTY/cổng (~4986), `dutyOnDuty`, `dutyDetectRecipeBias`, `dutyAttributeInterval`, `dutyOnCount` (~5295), `dutyOnNlWeigh` (~5394), expire/closePolicy |
| `gieo_automation.v3.js` | `kinds`, `relevant`, `task`: lọc WASTE, LOT_REVIEW/COMPLETE, ENGINE_RESULT, các rule và nhóm công việc |
| `functions/automation/index.js`, `worker.js` | Exact source triggers; clock 15 phút; guard active/fleet20; lịch xác minh/tranh chấp |
| `data_access.v9.js` | `STATE_FIELDS`/catalogMirror (~89), `CATALOG_FIELDS`, ngữ cảnh `withStore` |

Phép chạy policy cục bộ trong lượt rà (không ghi Firebase):

| Fixture | Kết quả v3 |
|---|---|
| WASTE −300 có ghi chú “Báo hết — còn thừa 300 g” | relevant=true; done / WASTE_RECORDED; allocations=[] |
| ADJUSTMENT −300 có needsReview | relevant=false; NO_ACTION |
| Tem finished, needsReview=false, unitBase=300 | done / LOT_COMPLETE |
| Tem finished, needsReview=true, unitBase=300 | working / LOT_REVIEW |

Không lấy các fixture này làm chứng minh dữ liệu thật ở quán đã được đối soát. Lượt này chỉ bổ sung tài liệu; chưa tạo `unit_engine2_v1.js`, chưa chuyển frontend/worker và chưa sửa chính sách vận hành hiện tại.
