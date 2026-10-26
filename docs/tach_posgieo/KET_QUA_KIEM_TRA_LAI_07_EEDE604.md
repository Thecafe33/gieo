# Kết quả kiểm tra lại lượt 07 — F07-1 / F07-2 tại eede604

- Ngày kiểm: 26/10/2026, giờ Việt Nam.
- Nhánh: `Phan-tach-unit-engine`.
- SHA kiểm chính xác: `eede6048fdbcbd8fa791431ed9300c684d446880`.
- Thực hiện: agent kiểm tra độc lập trong worktree riêng; Codex chính đọc phản hồi, đối chiếu mã và log kết quả.
- Đầu vào: `PHAN_HOI_KIEM_TRA_07.md` và `KET_QUA_KIEM_TRA_07_DOC_LAP.md`.
- Chỉ kiểm công cụ; không sửa runtime, không deploy, không ghi sổ phát hành.

## Kết luận

**Thông qua phần sửa F07-1 và F07-2 trong phạm vi hai bài được yêu cầu.** Hai bài đều exit 0, ALL PASS, bao gồm các ca tự cài lỗi. Không còn tái hiện hai điểm mù đã báo ở lượt 07.

Đây là kết quả kiểm lại công cụ đối chiếu và kịch bản hiện có, không phải mở rộng thành nghiệm thu mọi luồng bán hàng, Firebase production hoặc APK/thiết bị thật.

## Hai lệnh đã chạy

```sh
node tools/tach_posgieo/e2e_hook.js
node tools/tach_posgieo/e2e_ban.js
```

| Bài | Mã thoát | Kết quả |
| --- | --- | --- |
| Hook | 0 | ALL PASS; 13 assertion, auth chậm và auth ngay |
| Bán hàng | 0 | ALL PASS; 36 assertion, auth chậm, auth ngay và hai tự kiểm |

Không chạy lại toàn suite 149 bài trong đợt kiểm hẹp này; kết quả suite tại bản trước giữ ở báo cáo trước. Không báo kết quả chưa chạy là đạt.

## F07-1 — Đã bắt đủ hai wrapper bị bỏ sót

- Công cụ thu cả tên qua `window.N` và xác định cạnh closure riêng theo tên hàm; hai cạnh `old` / `count` không còn bị bỏ qua.
- Bảng kỳ vọng mặc định có đúng **25 hàm có bọc**, thay vì chỉ yêu cầu ít nhất 15 hoặc nhận diện 23 như bản cũ.
- Ở cả hai biến thể auth, baseline `0bd95a7` và bộ hiện tại có cùng tập 25 hàm và cùng chuỗi từng lớp tới hàm gốc, 0 cảnh báo bỏ gắn và 0 lỗi JavaScript.
- Tự kiểm tạo bản sao tạm, làm hỏng hàm gốc `_continueAfterPrepCount` và `computeShiftInventoryCountLinesPOS`, bỏ lớp trợ lý `cartClear`, gán đè `updCoTotal`.
- Công cụ phát hiện lệch **đúng bốn tên** trên. Vì đây là negative control đã được bắt đúng nên toàn bài exit 0 là kết quả đúng, không có nghĩa bản cài lỗi được cho qua.

## F07-2 — Giờ fixture không còn bị chuẩn hóa mất

- Mã sửa bỏ regex HH:MM trên toàn JSON; nội dung bill, toast và lỗi được giữ để đối chiếu.
- Dữ liệu ghi Firebase/giỏ dùng chuẩn hóa theo trường và mẫu định danh, giới hạn trong dữ liệu phụ thuộc thời điểm/ngẫu nhiên của kịch bản.
- Hai bản hoàn tất đường thanh toán đang kiểm: không `ttLoi`, toast thành công, giỏ trống; các mục so sánh baseline/hiện tại khớp. Mỗi kịch bản có 1 đơn tiền mặt và 5 lượt ghi.
- Tự kiểm giờ thực lệch **7 phút 13 giây**: không báo khác biệt giả.
- Tự kiểm thay `${order.time}` bằng `12:34` trên bản sao: phát hiện lệch **đúng mục `bill`**. Điểm mù đã tái hiện trong báo cáo cũ nay được bắt.

## Tính độc lập và dữ liệu thử

Worktree agent: `/workspace/work/retest07-eede604-agent`, checkout đúng SHA nêu trên. Công cụ dựng baseline bằng worktree tạm và cài lỗi trong bản sao bộ deploy; không cài lỗi vào source release.

Sau chạy, `git status --short` của worktree agent rỗng. Các bản sao cài lỗi và worktree baseline tạm của hai bài đã được dọn. Worktree kiểm tra chính giữ lại để đối chiếu bằng chứng.

Codex chính xác nhận diff từ commit cha tới `eede604` không thay `posgieo.html`, `js/posgieo/` hoặc `ban_deploy/`; thay đổi thuộc công cụ và tài liệu.

## Bằng chứng

- `/workspace/work/retest07-agent-hook.log`
- `/workspace/work/retest07-agent-ban.log`
- `/workspace/work/retest07-agent-status.log`
- `/workspace/work/retest07-agent-worktrees.log`

Các đường workspace là log phiên kiểm, không phải file cần upload Hosting. Nội dung kết luận và ca tự kiểm được ghi đủ trong tài liệu này để người triển khai đối chiếu.

## Giới hạn giữ nguyên

- Baseline và bản mới chạy với Firebase giả rỗng, một đường bán tiền mặt, khách gán tay và các cổng ca được thay giống nhau.
- Chưa xác minh CK/VietQR, chia bill, khách có tem/quà, chiến dịch, tồn kho/BTP thực và máy in/quét thật.
- Chữ ký mã nguồn không phân biệt mọi giá trị closure; bài bán bổ sung kiểm các đường đã chạy, không chứng minh mọi nhánh chưa chạy.
- Thu tên/cạnh hook hiện dùng mẫu mã nguồn, không phải bảo đảm tự hiểu mọi kiểu wrapper tương lai. Khi thêm wrapper mới cần cập nhật kỳ vọng và negative control phù hợp.
- Không thử lại `file://` trong đợt này; giới hạn môi trường từ các lượt trước vẫn giữ.

Không phát hiện vấn đề mới cần chặn phần sửa công cụ tại commit này. Không thực hiện bước tách tiếp theo.
