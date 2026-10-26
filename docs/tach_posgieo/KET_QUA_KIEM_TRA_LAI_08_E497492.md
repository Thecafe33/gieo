# Kết quả kiểm tra lại lượt 08 — F08-1 và các nhánh nhận hàng bổ sung

- Ngày kiểm: 26/10/2026, giờ Việt Nam.
- Nhánh: `Phan-tach-unit-engine`.
- SHA kiểm: `e4974921bdb5e2fc8eae16a2b4f0de5bd267a50a`.
- Đã đọc `PHAN_HOI_KIEM_TRA_08.md`, đối chiếu `KET_QUA_KIEM_TRA_08_DOC_LAP.md` và mã công cụ sửa.
- Chỉ kiểm tra; không sửa app/JS nghiệp vụ, không deploy, không ghi sổ phát hành.

## Kết luận

**Thông qua phần sửa F08-1 và ba kịch bản nhận hàng được yêu cầu trong phạm vi phần mềm đã kiểm.** Không còn tái hiện điểm mù cho qua mọi hậu tố cửa hàng. Bộ kiểm đã bắt đúng các record sai quán và giữ được dữ liệu dùng chung hợp lệ. Không phát hiện vấn đề mới cần chặn phần sửa công cụ tại SHA này.

## Các lệnh chạy lại

```sh
node tests/tach_posgieo_pham_vi.test.js
node tools/tach_posgieo/e2e_kho.js
node tools/tach_posgieo/e2e_ban.js
node tools/tach_posgieo/e2e_hook.js
node tools/tach_posgieo/e2e_0d.js
sh tests/run_all.sh
```

| Bài | Kết quả |
| --- | --- |
| Bộ kiểm phạm vi | 15/15 ca đạt |
| e2e_kho | 85 assertion đạt, ALL PASS: 3 kịch bản × 2 quán và tự kiểm |
| e2e_ban | 36 assertion đạt, ALL PASS |
| e2e_hook | 13 assertion đạt, ALL PASS |
| e2e_0d | 28 assertion đạt, 1 fail do file:// bị môi trường chặn; không coi toàn bài đã đạt |
| Suite Node | TẤT CẢ ĐẠT, 150 file test |
| Probe riêng mock | 3/3 kiểm tra đạt |

Worktree không có thay đổi tracked hoặc untracked sau chạy. Các worktree/bản cài lỗi tạm của bài so sánh đã được dọn theo quy trình công cụ.

## Đối chiếu F08-1

- Bộ kiểm `pham_vi.js` đọc REG tại Node từ thư mục bộ deploy, độc lập với trang đang chạy.
- S/C được đối chiếu với đúng cửa hàng: GG01 dùng tên legacy, quán khác đúng hậu tố của quán đó. Không còn nhánh bỏ qua mọi `__ggNN` như trước.
- G/X hợp lệ vẫn được chia sẻ; thêm hậu tố sai bị bắt. Kiểm riêng Firestore, RT và Storage; đường `tx.*@...` / `batch.*@...` không thoát kiểm.
- 15 ca của `tach_posgieo_pham_vi.test.js` đạt, gồm đúng record từng tái hiện: GG02 ghi `receiving_records_gieogieo__gg03/probe` bị báo một vi phạm. Các ca GG02→GG01, GG01→GG02 và ghi hợp lệ cũng được kiểm.
- E2E gọi invariant ở cả baseline và bản mới, ghim tập bảng theo kịch bản. Tự chèn record sang GG02 khi chạy GG01, sang GG03 khi chạy GG02 và yêu cầu bắt đúng một vi phạm. Nhờ vậy việc hai bản cùng có đường ghi sai không còn tự được coi là đạt chỉ vì log giống nhau.

Không tìm thấy nhánh bỏ qua hậu tố bất kỳ như lỗi đã báo. Phạm vi xác nhận là các dạng đường ghi và loại record hiện được collector hỗ trợ; không tuyên bố hiểu mọi kiểu dữ liệu ghi Firebase tương lai.

## Các nhánh được bổ sung

### Nhận tự do

Hai dòng nhận theo Bịch/Hộp, có hư hỏng; đối chiếu bản đang chạy `0bd95a7` ở GG01 và GG02. Khẳng định riêng về toast thành công, số mã tốt 3/2, một RECEIVING và một WASTE của trân châu, phiếu completed, xóa dòng và sang màn Tem chờ dán. Không chỉ yêu cầu có một số lượt ghi bất kỳ.

### Nhận theo PO kèm ảnh

Mồi PO hai dòng; nhận một Thùng trân châu và một Hộp sữa. Kiểm transaction PO thành partial, một Thùng sinh sáu mã Bịch, một mã sữa, upload ảnh qua Storage và lưu URL vào phiếu. Phạm vi Storage theo đăng ký G được giữ, không giả định mọi ảnh có hậu tố cửa hàng; đường theo mã phiếu được kiểm trong fixture.

### Bấm lại sau lỗi một dòng

Cài lỗi đúng thao tác `tx.set` của milk_RECEIVING: lượt đầu giữ phiếu và chỉ ghi nhận trân châu, lượt hai ghi nốt thành công. Kiểm số lần ghi ledger mỗi dòng và số mã không nhân đôi. Mồi được cập nhật theo commit, nên lần đọc sau ghi thấy marker đã có; không còn dựa hoàn toàn vào mock luôn rỗng.

## Kiểm độc lập phần mock mới

Ngoài các bài được yêu cầu, chạy probe Node/VM trực tiếp trên `FB_STUB`:

1. Transaction xếp update A và set B, cài lỗi tại set B: Promise reject, seed A không đổi và B không xuất hiện.
2. Chạy lại transaction khi lỗi một lần đã hết: dữ liệu commit đọc lại được ở cả A/B.
3. Storage put ghi nhận metadata file và trả URL đúng đường yêu cầu.

Cả ba probe đạt. Đây là kiểm các khả năng mock mà bài retry/ảnh đang dựa vào, không phải chứng nhận mô phỏng đầy đủ Firestore/Storage.

## Giới hạn vẫn giữ

- Mock bỏ qua bộ lọc truy vấn; update/FieldValue.increment không có đủ ngữ nghĩa SDK thật; chưa mô phỏng xung đột hoặc retry transaction nhiều client.
- Chưa chạy hai quán đồng thời trên cùng backend fixture, chưa kiểm mọi đường đọc riêng quán. Kết quả hiện tại là kiểm đích các lượt ghi trong sáu lượt chạy và các ca âm đã liệt kê.
- Chưa Firebase production, APK/thiết bị thật, lỗi mạng thật trong upload hoặc nhận hàng tại quán.
- Seed cố định phục vụ so sánh, không chứng nhận tính duy nhất của ID ngẫu nhiên trên nhiều máy/quán.
- REG hiện được chọn bằng version data_access cao nhất có trong bộ. Ở hai bộ đang kiểm đó là v9, khớp HTML. Nếu bộ tương lai chứa version mới chưa được HTML dùng, cần ghim theo thẻ HTML để tránh kiểm sai registry; không phải sai khác quan sát được ở SHA này.
- `file://` vẫn bị browser môi trường chặn; không đánh dấu đã nghiệm thu.

## Bằng chứng và tính toàn vẹn

Worktree: `/workspace/work/retest08` tại SHA nêu trên. Runtime/bộ deploy so với commit cha không đổi; phần sửa là công cụ, test và tài liệu.

Logs: `/workspace/work/retest08-scope.log`, `retest08-kho.log`, `retest08-sale.log`, `retest08-hook.log`, `retest08-0d.log`, `retest08-suite.log`, `retest08-mock-probe.log`.

Không thực hiện bước tách tiếp theo. Bản cài lỗi của e2e nằm trong thư mục tạm; không sửa nguồn release để làm test đạt.
