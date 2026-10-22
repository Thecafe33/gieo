# Debug chuyên sâu quanlygieo2 — 22/10/2026

Đối tượng: release `46c4a8f24defd5ee9ec93d78c49c2421f3900a17`. Kiểm caller → callee, giả lập lỗi tại ranh giới await, sự kiện lặp/trễ và thay chủ lease. Không giả danh kinh nghiệm làm việc ở Apple/Google; đánh giá dựa trên bằng chứng chạy được.

**Kết luận:** chưa nên chuyển toàn bộ cửa hàng sang active chỉ dựa vào các kiểm thử trước. Tái hiện thêm 5 lỗi riêng biệt. Không phát hiện mất bill/ghi sai tiền/tồn trong các tình huống này; bốn lỗi đầu ảnh hưởng độ tin cậy của hộp thư hoặc worker. Không coi kết quả này là chứng nhận an toàn toàn hệ thống.

Lượt này chỉ thêm công cụ tái hiện và báo cáo, chưa sửa mã ứng dụng/worker, chưa deploy, không kết nối dữ liệu Firebase thật. Bản v2/Engine v20 đã phát hành giữ nguyên.

## Các phát hiện, theo ưu tiên

### 1. P1 — Callback cũ và mới không cùng hợp đồng tham số

- Nguồn: `quanlygieo.html` / `markAlertStatus`; `tools/automation/ui.js` / `renderAlertInbox`.
- Hàm cũ gọi `renderAlertInbox(state.inbox)`, truyền mảng cảnh báo đã cập nhật. Hàm thay thế trong quanlygieo2 lại hiểu tham số đó là boolean `viewSaved`.
- Tái hiện chạy chính hàm `markAlertStatus` trích từ HTML: tắt automation, bấm Đã xử lý; nguồn được đổi resolved nhưng mảng truthy làm bỏ nhánh cảnh báo gốc, tự mở bản lưu automation.
- Đo được: `legacy=0`, `cases=1`, `saved=true`, `sourceStatus=resolved`.
- Ảnh hưởng: quản lý vừa xử lý một cảnh báo thì danh sách chuyển sang nguồn khác, có thể rỗng; còn phát sinh truy vấn automation khi người dùng không chọn xem bản lưu. Không xóa dữ liệu nguồn.
- Sửa đề nghị: giữ tương thích với mảng của caller cũ, chỉ mở bản lưu khi nhận `true` rõ ràng; truyền mảng xuống renderer gốc để dùng dữ liệu đã có. Không cần thêm lượt đọc.

### 2. P1 — Lỗi từ lượt chạy đã hết lease có thể mắc kẹt trên trạng thái chung

- Nguồn: `functions/automation/queue.js` / `drain`, catch cuối hàm.
- Lease bảo vệ cập nhật job nhưng không bảo vệ lượt ghi `lastSourceError` lên root.
- Tái hiện: A giữ lease rồi bị treo; vượt 120 giây, B nhận lease mới và xử lý thành công; sau đó A trả lỗi. Job vẫn hoàn tất (`dirty=false`, `lastError=''`) nhưng root bị A ghi lỗi trở lại.
- `retryDue` không lấy job này nữa vì đã sạch; nhịp worker chỉ xóa `lastError`, không tự xóa lỗi nguồn đó. Hộp thư có thể giữ cảnh báo bộ xử lý lỗi cho đến khi có sự kiện mới cùng nguồn hoặc can thiệp.
- Đây là tình huống có thể xảy ra khi lượt xử lý trong clock dài hơn lease; không kết luận mọi invocation bình thường đều gặp.
- Sửa đề nghị: kiểm token/revision và ghi lỗi job + trạng thái tổng hợp trong cùng transaction; kết quả từ chủ lease cũ không được sửa trạng thái chung.

### 3. P1 — Một job thành công che lỗi của job khác

- Nguồn: `functions/automation/queue.js`, một ô `lastSourceError` cho cả cửa hàng.
- Tái hiện: A lỗi, B lỗi sau; root giữ lỗi B. B retry thành công và xóa root; A vẫn `dirty=true`, `lastError=network`.
- Ảnh hưởng: nếu ready/heartbeat còn mới thì giao diện có thể báo automation hoạt động dù vẫn có nguồn xử lý lỗi. Lỗi còn trong job nên có thể retry sau; không phải mất job.
- Sửa đề nghị: trạng thái lỗi độc lập theo job/nguồn, cộng/trừ số nguồn lỗi trong transaction khi chuyển trạng thái. Summary chỉ báo ổn khi không còn lỗi; tránh query toàn bộ jobs mỗi lần mở trang. Tính cả lỗi enqueue nguồn hiện đang ghi ở `index.js`.

### 4. P2 — Thay cờ kiểm tra BTP không được đưa vào hàng đợi

- Nguồn: `gieo_automation.v2.js` / `relevant`, nhánh `prep_batches` chỉ theo dõi status/expiresAt/code; `task` lại dùng needsReview để quyết định.
- API `UnitEngine.batches.annotate` cho phép thay needsReview. Đây là trạng thái hợp lệ của nguồn, dù giao diện hiện chưa cung cấp đầy đủ đường xử lý mọi trường hợp BTP.
- Tái hiện: BTP active/needsReview=true đã sinh LOT_REVIEW; đổi needsReview=false, giữ nguyên các trường khác. `enqueue` trả queued=false, hồ sơ vẫn LOT_REVIEW và nextCheckAt=0.
- Chiều ngược lại cũng có thể bỏ sót yêu cầu kiểm tra. Retry không khắc phục vì chưa từng có job; cần nguồn đổi trường khác hoặc bootstrap mới.
- Sửa đề nghị: danh sách trường được theo dõi phải bao phủ các trường đầu vào của luật. Phát hành chính sách v3, giữ v2 immutable; chỉ thêm đọc khi cờ thật sự đổi, không quét định kỳ.

### 5. P2 — Mở đúng tem nhưng đường xử lý còn cụt

- Nguồn: `tools/automation/ui.js` / `autoGoSource` → `ctnShowDetail` → `_ctnDetailRender` trong HTML dùng chung.
- Với tem finished/needsReview=true, popup chi tiết mở đúng mã nhưng không có nút Đã xem và cũng không chỉ rõ đường xác nhận. Nút `ctnMarkReviewed` hiện nằm trong danh sách Kho khác.
- Tái hiện bằng renderer thật: không có hành động gọi ctnMarkReviewed trong nội dung popup.
- Lượt trước mới kiểm popup mở đúng mã, chưa kiểm hoàn tất tác vụ tại điểm đến. Kết luận trước đó về luồng này cần thu hẹp tương ứng.
- Sửa đề nghị: thêm đường xác nhận qua API annotate hiện có ngay trong chi tiết hoặc nút dẫn đúng danh sách review; giữ phân biệt Đã xem và xử lý vật lý, không tự đánh dấu xong khi mở popup.

## Cách chạy lại và đọc kết quả

```sh
node tools/automation/audit_faults_46c4a8f.js --json
```

Công cụ dùng Firebase giả trong bộ nhớ và Chromium chặn mạng; file JSON kết quả: `docs/QUANLYGIEO2_FAULT_AUDIT_46c4a8f.json`. Exit 1 nghĩa là đã xác nhận lỗi, exit 2 là lỗi công cụ; đây là chứng cứ cho release nêu trên, không phải một test xanh đặt vào CI để chấp nhận lỗi.

8 phép kiểm gồm 6 phép phát hiện lỗi và 2 đối chứng. Hai phép EXPIRED_LEASE_ERROR / EXPIRED_LEASE_SELF_HEAL là hai biểu hiện của cùng một lỗi số 2, không tính thành hai lỗi độc lập.

Đối chứng đã đạt:

- Sự kiện lặp không sinh thêm revision của kết luận.
- Sự kiện cũ vẫn đọc nguồn hiện tại, không hoàn tác khoản chi đã duyệt.
- `tests/gieo_engine20.test.js`: quyết định tay, lease cân, CAS và không suy trách nhiệm từ người báo.
- `tests/gieo_automation_queue.test.js`: ACK cũ không xóa sự kiện mới, tách quán, cập nhật hai ngày khi chứng từ đổi ngày, retry lỗi thông thường.
- `tests/gieo_automation_review.test.js`: đối chiếu badge, giữ cờ kiểm tra sau báo hết, cạnh tranh lúc đếm.

Các đối chứng đạt không phủ được nhánh lỗi của invocation đã hết lease hay hợp đồng callback cũ/mới. Đây là lý do cần kiểm thử lỗi có chủ đích ngoài kiểm thử luồng thuận.

## Thứ tự xử lý đề nghị

1. Giữ tương thích callback để thao tác cảnh báo không tự chuyển nguồn.
2. Khóa kết quả theo lease ở cả nhánh thành công/lỗi và thay ô lỗi đơn bằng trạng thái lỗi theo nguồn.
3. Bổ sung phụ thuộc needsReview vào sự kiện BTP; đồng bộ client/server cùng phiên bản immutable mới.
4. Hoàn thiện thao tác xác nhận ở popup tem qua nghiệp vụ hiện có.
5. Chuyển các tình huống trên thành regression yêu cầu đạt sau khi sửa; chạy lại đa quán, mất mạng, chế độ shadow/active và bộ sinh theo mùa.

Chưa đo billing Firebase thật; chưa chạy Functions trong emulator/production. Không đề nghị thêm listener bill, quét toàn kho hoặc mở rộng quy tắc trừ lương/tiền.
