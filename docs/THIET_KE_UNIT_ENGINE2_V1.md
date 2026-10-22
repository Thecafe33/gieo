# Unit Engine 2 — thiết kế v1, 22/10/2026

Trạng thái: **thiết kế, chưa viết runtime hoặc chuyển POS sang Engine 2**. Tiếp nối yêu cầu bàn phương án trước khi code. File dự kiến `unit_engine2_v1.js`, API `UnitEngine2`; bản sau tăng thành `unit_engine2_v2.js`, không sửa bản đã phát hành.

## Mục tiêu đã chốt

Engine 2 là lõi điều hành mới, có trạng thái kiểm soát và khả năng tự thi hành phản ứng sau sự kiện. Mỗi case tạo được quyết định, trách nhiệm và biện pháp ngăn tái diễn; không kết thúc ở việc thêm thông báo cho chủ quán.

Không tạo kho, bill hoặc P&L thứ hai. Quanlygieo2 và POS dùng cùng kết luận từ Engine 2; bộ xử lý nền tiếp tục hoạt động khi trình duyệt đóng. Luồng bán hàng không chờ worker hoặc bị khóa bởi tác vụ kiểm soát kho. Các bước bắt buộc được đặt tại bàn giao/đóng ca và nghiệp vụ kho liên quan.

## Đối chiếu phần hiện có

| Phần | Hiện tại | Vai trò trong Engine 2 |
|---|---|---|
| FIFO, tem, RT, WASTE | Engine v20 là lõi thực thi; 15 bất biến B1–B15 đã có kiểm thử | Giữ nguồn dữ liệu và bất biến; tách các thành phần đã kiểm chứng sang kiến trúc mới, có kiểm tương thích trước khi chuyển quyền ghi |
| Phân bổ trách nhiệm | dutyAttributeInterval chia theo lượng sử dụng, có nhánh unverified/pool | Chính sách mới chia đều nhóm pha chế đủ điều kiện trong khoảng; ghi rõ đây là trách nhiệm theo chính sách, không giả là chứng minh hành vi |
| Báo hết còn dương | Ghi WASTE, đóng tem, needsReview=false | Sự kiện đầu vào để chốt trách nhiệm và tự bật kiểm soát; liên kết WASTE đã tồn tại |
| Cân cuối ca NL | computeShiftInventoryCountLinesPOS dựa cấu hình shiftCountTiming và vài bất thường; gắn phiếu đóng ngày | Bổ sung yêu cầu tự phát sinh theo cửa hàng/nguyên liệu và mốc bàn giao pha chế |
| Dụng cụ | openWeighPad chỉ lấy dụng cụ đã gắn; không có thì bỏ nút cân | Cho chọn dụng cụ hợp lệ trong thư viện ngay tại nhiệm vụ cân, lưu bì theo tem/lần cân |
| Module automation v3 | Phân loại hồ sơ, queue/retry/lease, tổng hợp trạng thái | Hạ tầng vận chuyển/thi hành cho quyết định Engine 2; không giữ một bộ luật trách nhiệm cạnh tranh |

## Ranh giới của lõi mới

1. **Sự kiện chuẩn hóa:** đúng storeId, loại nguồn, mã nguồn, phiên bản nguồn, mốc nghiệp vụ và sự kiện hao hụt. Không lấy thời điểm callback đến làm thời điểm phát sinh. Đọc nguồn hiện tại để xử lý sự kiện đến muộn.
2. **Bộ chính sách có phiên bản:** chọn quy tắc theo loại case, dữ liệu nguồn và trạng thái kiểm soát. Quyết định lưu phiên bản chính sách cùng căn cứ, người chịu và giá vốn. Thay chính sách không âm thầm tính lại khoản đã chốt.
3. **Trạng thái kiểm soát riêng cửa hàng/nguyên liệu:** bình thường, yêu cầu cân, tăng xác nhận, đang phục hồi. Có mốc hiệu lực và lý do; độc lập cấu hình danh mục được đồng bộ toàn chuỗi. Biện pháp tự bật không tự tắt cấu hình bắt buộc do quản lý đặt.
4. **Ý định hành động bền:** giao cân, mở lựa chọn dụng cụ, cập nhật trạng thái kiểm soát, ghi phân bổ. Mỗi ý định có mã chống lặp, phụ thuộc và kết quả. Retry tiếp tục phần chưa xong, không chia trách nhiệm hoặc ghi WASTE thêm lần nữa.
5. **Thực thi và đo kết quả:** POS thực hiện nhiệm vụ tại đúng điểm thao tác, worker chốt kết quả; mốc cân mới dùng cho khoảng sau. Quanlygieo2 chỉ trình bày tổn thất, phân bổ, biện pháp đang áp dụng và hiệu quả.

Lõi quyết định không phụ thuộc DOM và không giữ biến cửa hàng có thể bị tráo trong lúc await. Mỗi instance gắn cố định một storeId. Mã nguồn vẫn có quy tắc rõ ràng; tính tự động đến từ việc Engine chọn và thi hành biện pháp dựa trên sự kiện/trạng thái, không cần chủ quán cấu hình riêng sau mỗi case.

## Luồng bắt buộc hoàn thành trong bản đầu

Case mẫu: tem FZFWM9PS, nguyên liệu Thạch nổ củ năng Hồng, ban đầu 500 g, sổ đã dùng 200 g, báo hết với số dư 300 g.

1. Xác định đúng dòng WASTE và mã tem; 300 g đã ghi thì không trừ thêm vào kho/P&L. Khoản mất và khoản phân bổ trách nhiệm là hai biểu diễn của cùng một tổn thất.
2. Khoảng trách nhiệm bắt đầu ở mốc cân vật lý gần nhất; nếu chưa có thì dùng mốc mở tem. Kết thúc ở thời điểm báo hết. Không phân bổ lại chênh lệch đã chốt ở mốc trước.
3. Chọn nhân sự có ca thực tế giao với khoảng đó tại đúng cửa hàng và có snapshot chức năng barista trong ca; loại trùng employeeId. Không dùng chức năng trong hồ sơ hiện tại để đổi lịch sử, không tự kéo nhân sự order vào danh sách.
4. Với bốn người đủ điều kiện, chính sách chia đều cho mỗi người 75 g; số tiền theo giá vốn đã lưu của tổn thất. Làm tròn có phần bù để tổng lượng/tiền phân bổ luôn khớp khoản nguồn.
5. Ghi trách nhiệm, căn cứ, bốn người và phiên bản chính sách. Chưa tự tạo giao dịch thu tiền hoặc ghi đè bảng lương; quyền thu/bù trừ tiền cần luồng quyết toán riêng.
6. Tự bật cân bắt buộc cho nguyên liệu tại điểm bán này, áp dụng mã đang mở/mở mới; không hồi sinh tem đã finished. Có nhiệm vụ thiết lập mốc cân sớm để không mở rộng khoảng thiếu tiếp theo trong khi chờ tới cuối ngày.
7. Khi bàn giao pha chế hoặc đóng ngày, nhân viên cân từng mã còn sử dụng. Có dụng cụ đã gắn thì ưu tiên; chưa có thì cho chọn thư viện ngay tại bước cân. Lưu ID, biến thể, bì, tổng cân, lượng ròng, người cân và mốc nguồn.
8. So số cân với sổ đúng tại lúc cân, giữ các bill phát sinh trong lúc cân/chốt như cơ chế chống ghi đè hiện có. Mốc hoàn tất trở thành đầu khoảng tiếp theo.
9. Lần thiếu tiếp theo chỉ chia cho nhóm pha chế trong khoảng mới. Nhiệm vụ hoàn tất bằng kết quả nghiệp vụ, không bằng nút Đã xem. Nguyên nhân cụ thể có thể được bổ sung mà không làm treo khoản trách nhiệm đã chốt theo chính sách.

Cân xác định được khoảng và nhóm chịu trách nhiệm; tự nó không chứng minh hành vi ăn, đổ hay múc quá tay. Hệ thống phải trình bày đúng loại kết luận.

## Ngăn việc vẫn tiếp diễn trong lúc chờ xử lý

- Duy trì bản yêu cầu kiểm soát tại POS theo điểm bán, có phiên bản và ACK. Worker chưa gửi xong thì nhiệm vụ vẫn pending; không giả rằng biện pháp đã có hiệu lực.
- Dùng tín hiệu báo hết hiện có để POS biết ngay cần đồng bộ biện pháp; nhiệm vụ tạo lại được từ sự kiện nguồn nếu mất mạng hoặc tải lại. Không chờ người quản lý mở quanlygieo2.
- Khi mất mạng, tiếp tục bán; bảo toàn tác vụ cân/đồng bộ cần làm. Không chốt bàn giao là đã hoàn tất nếu phép cân bắt buộc chưa có kết quả hợp lệ.
- Không cho báo hết hoặc đổi ca làm mất yêu cầu cân của nguyên liệu. Cân không có mã đang mở được ghi đúng là không có đối tượng cân, không tạo số cân 0 giả.
- Không đoán bì bằng 0 hoặc mật độ 1 g/ml. Dụng cụ không có bì hợp lệ, thư viện rỗng hoặc thiếu tỷ trọng phải có bước bổ sung số đo ngay tại điểm bán; không âm thầm cho nhập số tổng để bỏ qua yêu cầu cân.

## Trách nhiệm ghi và chuyển tiếp

- Engine 2 có API và bộ điều hành độc lập; không chỉ là đổi tên hoặc sao chép v20 rồi thêm điều kiện vào HTML.
- Các thành phần kho/FIFO đã kiểm chứng được tách và tái sử dụng với kiểm thử tương thích. Trong giai đoạn chuyển tiếp, mỗi nghiệp vụ chỉ có **một** bên sở hữu quyền ghi; không chạy v20 và Engine 2 cùng ghi cho một bill, một WASTE hoặc một lần cân.
- Bật theo từng điểm bán qua các bước đối chiếu, áp dụng giới hạn rồi mở rộng. Quyết định và trạng thái điều hành đã ghi không bị xóa khi quay lui; bảo toàn ý định chưa hoàn tất.
- Không chuyển dữ liệu tồn sang bảng mới, không đổi nghĩa dữ liệu lịch sử và không xóa các bản Engine cũ. Việc chuyển frontend/worker phải có kiểm phiên bản; máy cũ chưa áp dụng được biện pháp phải hiện trạng thái chưa đồng bộ.
- Lỗi thao tác và quyết định tay đã chốt được bảo vệ bằng phiên bản/transaction, tương tự các rào đã kiểm chứng ở v20. Hai worker, hai tab, retry và sự kiện cũ không tạo hai kết luận cạnh tranh.

## Quy mô và lượt đọc

- Xử lý theo sự kiện có ý nghĩa: báo hết, khai hao hụt, cân/bàn giao, thiếu dữ liệu, hoàn tất hoặc quá hạn tác vụ. Không thêm truy vấn kho vào mỗi lần thêm món/thanh toán.
- Dùng dữ liệu FIFO và snapshot ca/mốc có sẵn. Chỉ đọc lịch sử đúng nguyên liệu, cửa hàng và khoảng đang xử lý; tổng hợp theo các mốc để không phải dựng lại toàn bộ lịch sử tem sau mỗi sự kiện.
- Ghi ý định cùng quyết định hoặc bằng cơ chế đảm bảo không mất ý định sau commit; hàng đợi có retry, lease và giới hạn tải. Không có một vòng lặp trung tâm quét 10.000 cửa hàng để tìm case.
- Phạm vi điều hành chuỗi là các snapshot tổng hợp, tổn thất, số tiền đã phân bổ, tái diễn và hiệu quả biện pháp. Chi tiết chỉ mở khi cần. Một lỗi điểm bán không chặn hàng đợi điểm khác.

## Lộ trình và điều kiện nghiệm thu

1. Chốt hợp đồng sự kiện, quyết định, quyền ghi, dữ liệu trách nhiệm và trạng thái kiểm soát; dựng fixture case 300 g cùng các trường hợp thiếu dữ liệu.
2. Xây runtime Engine 2 độc lập giao diện: chia trách nhiệm và sinh ý định kiểm soát theo phiên bản; kiểm retry/sự kiện đảo thứ tự/đa quán.
3. Nối worker thực thi và khôi phục ý định; xác minh trạng thái pending/áp dụng/hoàn tất có thật.
4. Nối POS: nhận yêu cầu, chọn dụng cụ, cân bàn giao/đóng ca và lưu mốc qua đúng nguồn kho. Chạy bán hàng đồng thời để kiểm không mất lượng trừ.
5. Nối quanlygieo2: hiển thị ai chịu, bao nhiêu, biện pháp nào đã thực sự có hiệu lực và lần sau cải thiện ra sao.
6. Chỉ chuyển quán thử sang áp dụng sau khi đi trọn luồng; sinh bản thường/Giáng sinh/Tết, thử khôi phục và quay lui trước mở rộng.

Tiêu chí tối thiểu: case 300 g tạo đúng tổng 300 g phân bổ; bốn người nhận 75 g/người; không WASTE đúp; tự có yêu cầu cân đúng cửa hàng; chưa gắn dụng cụ vẫn cân được bằng dụng cụ hợp lệ; bill đang bán không bị chặn/ghi đè; đóng trình duyệt hoặc mất ACK vẫn xử lý tiếp; lần cân sau dùng đúng khoảng mới.

## Điểm chính sách còn cần chốt trước khi triển khai nhánh tương ứng

- Không có nhân sự barista hợp lệ, ca thiếu giờ hoặc không có giá vốn: quy tắc hoàn thiện dữ liệu tại điểm bán và cách quyết toán, không tự gán ngẫu nhiên hoặc lấy 0 làm kết quả đủ.
- Dụng cụ/bì và tỷ trọng chưa có: ai được ghi số đo, hình thức xác nhận tại quầy.
- Tiêu chí tăng xác nhận chéo và tự giảm kiểm soát. Chưa có quyết định thì không tự tắt biện pháp chỉ vì vài lần không lệch.
- Thu/bù trừ khoản trách nhiệm là nghiệp vụ tài chính riêng, chưa được suy thành tự động khấu trừ lương.

Các điểm này không yêu cầu chủ quán duyệt từng case; cần chính sách chung rõ ràng để máy thực hiện nhất quán.
