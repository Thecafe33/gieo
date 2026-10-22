# quanlygieo2 — tự đối soát và giao việc, bản v2 ngày 22/10/2026

Chưa deploy lên Firebase; chưa ghi dữ liệu production. Hướng triển khai dựa trên PLAN_TU_DONG_HAO_HUT_HUY_v2 do chủ quán cung cấp và đối chiếu mã nguồn thực tế.

Bản rà soát tiếp theo: [RA_SOAT_QUANLYGIEO2_NHAN_VIEN_QUAN_LY.md](RA_SOAT_QUANLYGIEO2_NHAN_VIEN_QUAN_LY.md). Chính sách và module công việc đã lên v2; cần cập nhật Hosting + worker cùng nhau, Engine vẫn v20.

## Các phần đã triển khai

- `quanlygieo2.html` sinh từ trang quản lý hiện tại; dùng chung dữ liệu và JS nghiệp vụ. Trang gốc giữ nguyên nghiệp vụ, cùng POS chuyển thẻ nạp sang Engine v20 (cả đường retry). v19 giữ nguyên để quay lui.
- Engine v20 kiểm quyết định tay và phiên bản ngay trong transaction khi xác minh, hết hạn, tạo/thay hồ sơ, phản đối và giữ quyết định. Hết hạn không giành việc cân đang có lease hợp lệ. Mốc cân cũ không được phục hồi vào tồn hiện tại.
- Luật WASTE thuần phân biệt ghi nhận/nguyên nhân/người liên quan/người chịu. API annotateAuto có CAS; người báo không mặc nhiên là người chịu. Chưa tự ghi phân bổ trách nhiệm mới cho WASTE khai báo: chỉ có API chính sách, chưa thêm màn khai nhận/xác minh WASTE mới trên POS.
- Trigger chỉ gắn đúng collection và quán đã đăng ký; không có trigger toàn bộ top-level hoặc bill. Nguyên liệu vẫn có trigger khi chứng từ tồn thay đổi, nhưng chỉ đổi ngưỡng/cờ liên quan mới được đọc xử lý tiếp. Invocation của thay đổi tồn thông thường vẫn có chi phí.
- Hàng đợi bền theo quán + nguồn/mã WASTE; gom các thay đổi đang chờ trong một sự kiện. Một lượt nhận việc có lease và revision; ACK cũ không xóa công việc vừa phát sinh. Không hứa mọi dòng của sự kiện sẽ luôn chỉ có một invocation, vì chúng có thể đến ở các thời điểm khác nhau.
- Nguồn hiện tại được đọc trong transaction; alert liên kết duty case không tạo vụ trách nhiệm thứ hai. WASTE có fromPrepCount/shift_weigh/dutyCaseId không thành khoản hao hụt mới trong tổng hợp này.
- Worker chạy khi trình duyệt đóng. 15 phút xử lý việc đến hạn, retry và ngày bẩn; dùng Engine v20 để hết hạn xác minh hoặc đóng tranh chấp đủ 7 ngày theo chính sách. Quyết định tay được giữ, số tiền và lịch sử không mất, không tăng độ tin cậy vì hết hạn. Khoản chi luôn chờ chủ duyệt.
- Báo cáo ngày tách giá trị WASTE khai báo và chênh lệch kiểm kê hai chiều, không cộng thành khoản lỗ mới. Thay ngày chứng từ đánh dấu cả ngày cũ và mới. Mỗi nhịp tổng hợp tối đa 5 ngày bẩn; không gọi dutyDigest cho mỗi cảnh báo, không quét bill.
- Hộp thư có Chờ duyệt chi / Đang xử lý / Đã ghi nhận. Hiện trạng thái kết quả, căn cứ, độ tin cậy, người phụ trách, hạn và lịch sử. Báo cáo vận hành 7 ngày chỉ đọc khi bấm; xu hướng chỉ chỉ ra NL/BTP có khai báo ở nhiều ngày, không kết luận lỗi cá nhân hay đề nghị tăng HSD.
- Checklist đầu/cuối ca của POS có nút Xem công việc; chỉ đọc khi bấm, không có listener mới, không chặn bán hàng, không thêm điều kiện hoàn tất checklist. Mở lại nghiệp vụ thật để xử lý, không có nút Xong giả.
- Người phụ trách và người thay thế được cấu hình theo quán. Thay thế không tự được coi là đang có mặt; bản này chưa tự chọn người thay dựa trên lịch/chấm công.

## Triển khai từng giai đoạn

1. Hosting: chép gói đúng mùa gồm POS Gieo, quanlygieo/quanlygieo2 và các JS kèm theo. Tất cả máy POS/quản lý phải tải lại để dùng v20 trước khi bật xử lý thật; máy còn v19 có các đường ghi cũ chưa được bảo vệ. Gói không thay POS TC33, XOFA hay kiosk.
2. Chạy nền: dùng `functions/automation` (Node 22), chạy `npm ci`. Ghép `tools/automation/firebase_config.fragment.json` vào firebase.json hiện hữu; giữ nguyên cấu hình Hosting và các codebase cũ.
3. `functions/automation/stores.json` liệt kê quán được gắn trigger, mặc định gg01. Thêm gg02… vào đây khi mở quán mới rồi deploy lại Functions. Chỉ tạo quán trong app chưa đủ để tự sinh trigger mới. Mỗi quán hiện có 13 trigger nguồn + một trigger hàng đợi; đồng hồ dùng chung.
4. Ghép indexes từ `node tools/automation/indexes.js gg01 gg02` vào indexes hiện hữu, không xóa indexes cũ. Kiểm vùng Firestore tương thích vùng Functions asia-southeast1, quyền service account, gói Firebase hỗ trợ Functions/Scheduler và quyền quản lý đối với subcollection mới. Không thay rules cả dự án bằng một rules mẫu.
5. Chủ quán deploy Hosting, codebase `gieo-automation` và indexes. Runtime dùng URL RTDB hiện tại; có thể thay bằng biến GIEO_DATABASE_URL. Không cần cấp hoặc đưa khóa dịch vụ vào HTML.
6. Mở quanlygieo2, chọn từng quán, Thiết lập phụ trách: chọn vận hành/kho và người thay thế, ngày khởi tạo; bật với chế độ **Đối chiếu thử** mặc định. Chế độ này chỉ lập hồ sơ phụ trợ, không chạy quyết định hết hạn trong Engine, không che cảnh báo cũ.
7. Đối chiếu hồ sơ/sổ thật và số đọc; sau đó chọn **Tự xử lý theo chính sách**. Mọi lần đổi cấu hình khởi tạo lại có kiểm tra phiên bản cấu hình. Mốc xác minh giữ 48 giờ của Engine; tranh chấp là 7 ngày; ngưỡng khoản nhỏ mặc định 0 (chưa áp dụng), chủ tự nhập nếu muốn.

Khởi tạo lấy cảnh báo/phiếu đang chờ, tem/lô mở, tồn và WASTE từ mốc đã chọn (tối đa 31 ngày). Mỗi nhịp tối đa 8 trang × 100 bản ghi, có cursor bền; cần nhiều nhịp nếu nhiều dữ liệu. Trước khi sẵn sàng, giữ hộp thư cũ.

## Đường dữ liệu và quan sát

Cấu hình `duty_digests_gieogieo/_automation_config`; tổng hợp `duty_digests_gieogieo/_automation`; subcollection `cases`, `sources`, `dependents`, `jobs`, `days`; lịch sử dưới case. Quán khác có hậu tố __ggNN trên collection, cùng cơ chế đang dùng. Không tạo sổ kho hoặc P&L thứ hai. Worker chỉ đổi nghiệp vụ gốc qua các API hạn của Engine v20 khi chế độ active cho phép; không tự trừ lương/tiền hay ghi WASTE mới.

Thiếu worker, đang khởi tạo, nguồn bị lỗi hoặc heartbeat quá 60 phút đều hiện trên app. Heartbeat không tự xóa lỗi nguồn. Hàng đợi giữ dirty và retry khi lỗi; lỗi một job không làm bỏ các job retry khác. Không có thông báo ngoài ứng dụng.

Tắt cấu hình dừng xử lý tự động mới và quay về cảnh báo cũ. Lịch sử và chứng từ đã xử lý vẫn được giữ. Một thao tác đã commit trước lúc tắt không được hoàn tác tự động.

## Lượt đọc và kiểm thử

Giao diện đọc 1 summary, giữ RAM 30 giây; danh sách 20 hồ sơ/trang và 10 lịch sử chỉ đọc khi bấm; tổng hợp 7 ngày đọc snapshot, không đọc bill. Checklist POS không đọc gì mới cho đến khi bấm Xem công việc. Worker đọc nguồn hiện tại/cấu hình/hồ sơ/tổng hợp bằng transaction; nhóm nhiều dòng hoặc liên kết cần thêm đọc. Retry và khởi tạo có chi phí riêng. Đồng hồ 96 nhịp/ngày chỉ lấy các việc tới hạn và ngày bẩn.

Đã có fixture đếm thao tác đọc (khởi tạo 205 hồ sơ qua nhiều trang), cùng E2E kiểm đếm đọc summary/danh sách/lịch sử trước/sau thao tác. Đây không phải số billing Firebase production, không dùng để hứa tỷ lệ tiết kiệm. Đối chiếu số đọc thật trước/sau là điều kiện chuyển khỏi shadow, chưa thể xác nhận khi chưa deploy.

Kiểm tra Node: `tests/gieo_engine20.test.js`, `gieo_automation.test.js`, `gieo_automation_queue.test.js`, `gieo_automation_bootstrap.test.js`; thử event muộn, hai quán cùng ID, sự kiện tới giữa lượt xử lý, lỗi/retry, chuyển ngày, không ghi đè manual và không phục hồi tồn. E2E: `tools/automation/e2e.js`, `e2e_shift_work.js`; smoke HTML đầy đủ với Firebase giả. Chưa kiểm chứng Cloud Functions/RTDB/Firestore trên production hoặc emulator.

Bảo trì: sửa nguồn `tools/automation/ui.js`, `ui.css`, chính sách và worker; chạy `sh tools/sinh_lai_tat_ca.sh`. Không sửa tay HTML2 hoặc file trong functions/automation/shared. Engine immutable: phát hành tiếp sau v20 phải tăng phiên bản.
