# COGS theo menu — The cafe 33 / XOFA

Ngày hoàn thiện: 21/10/2026. Chưa deploy Hosting; không đọc/ghi Firebase thật trong quá trình phát triển và thử.

## Quyết định của chủ quán

- Giá vốn riêng từng size và từng menu. XOFA có menu Tại quán và To Go, topping riêng từng kênh. TC33 dùng menu của TC33.
- Áp dụng từ 01/10/2026; giá vốn sửa về sau có mốc hiệu lực, không tự sửa đơn giá của mốc cũ.
- Công tắc riêng từng quán, mặc định tắt. Chỉ bật khi menu hiện tại đã có đầy đủ giá vốn. Ô bỏ trống khác giá vốn được chủ quán nhập rõ 0đ.
- Phạm vi Đồ uống và topping; giữ doanh thu TC33 = Đồ uống + Khác, XOFA không gồm Food. Bed/phí/nợ cũ, Ăn vặt/Food không được nhập vào COGS nước. Không sửa cách bán/in/chấm công hay các bộ engine dùng chung.
- Ly tặng 0đ, bill tổng bằng 0, ly đổi tem, topping tặng vẫn có giá vốn theo số lượng thực.

## Cách dùng

Vào **COGS** ở sidebar → chọn **The cafe 33** hoặc **XOFA**. Đây là tab cấu hình riêng, không mở popup nhập và không còn dòng/nút COGS trong widget quán. Tab Điểm hoà vốn giữ phần cấu hình chi phí cố định như trước.

Bảng PC chiếm phần lớn chiều cao màn hình; tên món và hai ô M/L nằm cùng một dòng. XOFA lọc Tất cả / Tại quán / To Go tại máy. Topping nhập giá cho một phần. Thanh công cụ gọn ở trên, ngày áp dụng/công tắc/Lưu ở dưới, chỉ danh sách món cuộn. Menu thử 84 ô hiển thị 6 món đầy đủ ở 1366×768 và 1024×768, 8 món ở 1440×900. Điện thoại hiển thị cả M/L trong bề ngang trang. Tab chuyển ô tiếp theo; Enter/Shift+Enter chuyển xuống/lên cùng cột. Bản nháp theo quán giữ trong RAM khi chuyển quán/rời tab; tải lại menu hỏi trước nếu có ô chưa lưu.

Lần đầu mặc định ngày áp dụng 01/10/2026. Có thể lưu bản nháp khi tắt. Nhập đủ rồi bật công tắc và lưu. Phiên mở mới khi đã có cấu hình mặc định từ hôm nay; trong cùng phiên giữ ngày/bản nháp đang xem. Chọn ngày/mốc đã lưu để chủ động xem/sửa mốc cũ; muốn tạo mốc mới phải chọn đúng ngày áp dụng trước khi lưu. Tải lại menu sẽ tải lại danh mục và dữ liệu đã lưu, nên chỉ dùng khi không cần giữ ô đang nhập dở.

Theo yêu cầu bổ sung 21/10, **gỡ toàn bộ dòng/nút COGS khỏi widget doanh thu** để giữ kích thước widget. COGS vẫn tham gia phép tính hoà vốn; bảng cấu hình chỉ nằm trong tab COGS. Phần chi tiết tính toán hiện có vẫn dùng số lượng/giá vốn trong RAM.

Món cũ xuất hiện trong bill của kỳ đã tải nhưng không còn menu (có size M/L hoặc topping) được bổ sung vào trình nhập từ dữ liệu RAM. Không tự truy vấn lịch sử để tìm món. Bill thiếu dữ liệu/tên/size không đối chiếu được phải báo thiếu; không tự coi là giá vốn bằng 0 và không kết luận hoà vốn. Sau khi tải kỳ tương ứng, mở cấu hình để bổ sung món cũ nếu đủ thông tin.

## Tính toán

COGS ngày = Σ (số lượng món × đơn giá vốn tại ngày bán) + Σ (số phần topping × đơn giá vốn topping). Số phần topping = số ly của dòng × số phần topping trên mỗi ly. Giá bán không tham gia công thức COGS.

Bộ đọc doanh thu cũ vẫn giữ cách tính doanh thu và số bill của POS. Một bản tổng hợp số lượng `cogsUsage` được tính song song từ cùng bill gốc, nên bill tổng 0đ vẫn có COGS ngay cả khi báo cáo doanh thu TC33 không tính bill này vào số bill thu tiền.

Hoà vốn khi bật = (vận hành + khấu hao) ÷ (1 − COGS / doanh thu), theo cơ cấu món của kỳ. Kỳ có phần trước ngày hiệu lực giữ nguyên ngưỡng cũ cho phần đó. COGS bằng/vượt doanh thu thì không có ngưỡng hoà vốn theo cơ cấu đang bán; chưa có doanh thu thì báo chưa đo được tỷ lệ. Khi tắt, quay về công thức vận hành + khấu hao cũ.

Tổng kết tháng chưa chốt dùng COGS theo món thay khoản mua hàng loại Giá vốn cho những ngày áp dụng, tránh trừ hai lần. Sổ chốt đã có giữ nguyên; muốn tính lại phải mở lại tháng bằng luồng hiện tại. Sổ chốt mới lưu thêm số ngày dùng COGS menu để ghi đúng nhãn nguồn giá vốn.

## Dữ liệu và tối ưu đọc

- Cấu hình lưu trong doc có sẵn `revenue_targets_tc33xofa/breakeven`, trường `cogs.{tc33|xofa}` gồm `enabled`, `versions[{from,costs}]`, `updatedAt`. Cấu hình tháng `.m` giữ nguyên. Dùng transaction kiểm phiên bản trước lưu để không ghi đè máy khác.
- Đọc cấu hình cùng lượt đọc hoà vốn đang có. Không thêm listener hoặc polling COGS.
- Tab COGS chỉ đọc menu đúng quán đang chọn khi mở; không gọi báo cáo hoà vốn/Gieo, không tự tải menu quán còn lại. Menu và bản nháp giữ trong phiên; lọc/tìm kiếm/chuyển menu đã tải không đọc Firebase. Sau lưu chỉ đọc lại doc cấu hình, báo cáo khác chỉ tải khi mở tab tương ứng. Bật tính năng khi lưu sẽ kiểm lại menu hiện tại để tránh bật với danh mục mới bị thiếu giá vốn.
- `cogsUsage.v=1` chứa số lượng theo menu/tên/size/topping và số lượng tặng, không gắn đơn giá. Lưu cùng bộ đệm tổng hợp ngày `mg_rev_cache_v4` đang có.
- Ngày cũ thiếu `cogsUsage` chỉ được đọc bù khi COGS đang bật và ngày đó nằm trong kỳ đang xem/từ mốc hiệu lực. Sau đó dùng bản đệm. Sửa đơn giá không bắt đọc lại bill cũ đã có số lượng.
- Bill realtime mới/sửa/xoá cập nhật số lượng và COGS từ cùng snapshot BillLive hiện có. Mỗi quán chỉ ảnh hưởng widget của quán đó và tổng liên quan. Mở chi tiết COGS chỉ tính từ RAM.
- Không chuyển dữ liệu, không sửa bill hoặc cấu trúc khách, không thay `lai_lo`/`unit_engine`/`data_access`, không thay các POS.

## Kiểm tra và file bàn giao

- `tests/manage_menu_cogs.test.js`: tính theo size/menu, ly tặng/bill 0đ, topping, mốc cũ/mới, thiếu số, % trên tổng kỳ, trần bật tính năng, chống ghi đè, nạp bù đệm một lần.
- `tests/tong_ket_thang.test.js`: giữ các kết quả cũ khi tắt; khi bật thay tiền mua nguyên liệu bằng giá vốn bán/tặng, không trừ hai lần.
- `tools/ql_giao_dien/e2e_menu_cogs.js`: giao diện và luồng lưu/bật/tắt thật với Firebase bộ nhớ; 1440×900, 1366×768, 1024×768, 390×844; menu dài và số hàng thực sự nhìn thấy, hai kênh, giữ cấu hình quán khác, giải thích số, bill tặng realtime không đọc thêm, món cũ báo thiếu và bổ sung từ RAM; giữ draft khi chuyển quán/rời tab, huỷ tải lại không mất ô, phản hồi tải chậm không ghi đè quán đang xem, Enter nhập theo cột.
- Hồi quy `e2e_bill_realtime.js` đạt 234 kiểm tra; `e2e_manage_closed.js` giữ nhãn đóng ca qua cập nhật widget.
- Chạy `sh tools/sinh_lai_tat_ca.sh` để sinh ba bộ deploy và kiểm tra toàn dự án.

ZIP bàn giao mới thay gói cấu hình popup: `tai_ve/manage_cogs_tab_rieng_21-10.zip`, chỉ **manage.html**, dùng chung bản thường/Giáng sinh/Tết. Chủ quán triển khai Hosting và tự nhập số giá vốn thật.
