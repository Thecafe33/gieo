# Kiểm tra chung — kiểm lại lượt 10 và lượt 11 hạn dùng

- Ngày kiểm: 26/10/2026, giờ Việt Nam.
- Nhánh: `Phan-tach-unit-engine`.
- Commit kiểm chung: `8eaeae5348121b826e5fdd08629bc72f3f7c0ada`.
- Bản sửa công cụ lượt 10: `2c27f19a6330fdee9b4762b5596a92e159418d0a`; phần nguồn này giữ nguyên trong commit kiểm chung.
- Đã đọc `PHAN_HOI_KIEM_TRA_10.md` (cả phần phản hồi kiểm lại), báo cáo độc lập tại `e4526165`, `KIEM_TRA_11_HAN_DUNG.md` và diff nguồn/test.
- Baseline browser: bộ Giáng sinh `0bd95a7`; đối chứng chuyển mã lượt 11: commit cha `2c27f19a`.
- Chỉ kiểm tra và ghi báo cáo; không sửa app/JS phát hành, không deploy, không ghi sổ phát hành.

## Kết luận riêng từng phần

**Kiểm lại lượt 10: ĐẠT các sửa được yêu cầu, đóng F10-1/F10-2 trong phạm vi probe đã báo.** Mảng `not-in` có null không còn trả dữ liệu; mô phỏng phía máy chủ được ghi rõ. RT query rỗng/xoá mã cuối trả null/exists false, dọn tổ tiên rỗng; transaction đọc lại nhận null.

**Lượt 11: ĐẠT phần chuyển mã R và bốn kịch bản hạn dùng đã công bố ở mức phần mềm.** 26 khai báo giữ nguyên; timer ở main chỉ được cài sau khi module thiết yếu nạp xong. Chưa thấy hồi quy mới cần chặn phần này. Không diễn giải thành đã nghiệm thu mọi nhánh hạn dùng, mọi thao tác kho hoặc thiết bị thật.

## Kết quả chạy chung

| Kiểm tra | Kết quả |
| --- | --- |
| `sh tools/sinh_lai_tat_ca.sh` | TẤT CẢ ĐẠT, 151 file test; không diff tracked |
| Test Firebase giả | 31/31 đạt; bản mock cũ trượt đúng 5 assertion |
| `e2e_kho.js` chung | 504 assertion đạt; 19 kịch bản × GG01/GG02 và 6 tự kiểm, ALL PASS |
| `e2e_0d.js` | 39 đạt, 1 thất bại file:// do môi trường; không báo toàn bài PASS |
| `e2e_ban.js` / `e2e_hook.js` | 36 / 13 assertion đạt, ALL PASS; hook đủ 25 hàm bọc |
| `e2e_btp_am.js` | ALL PASS trên PC/mobile |
| Ranh giới / đường dẫn | Sạch; 109 tên, 875 lời gọi, 54 động đã duyệt |
| Audit xuyên app | 0 trường hợp lỗi, 9 kiểm tra đạt |
| AST / cú pháp / ba bộ mùa của expiry | 26/26 nguyên văn; cú pháp đạt, byte giống nhau |
| Probe timer | 3/3 trường hợp nạp đủ / 404 / chạy dở đạt |
| Runner cài thêm lỗi hạn dùng | 101 assertion, ALL PASS; lỗi lệch 1 giây/gọi checkout hai lần bị bắt |
| Kiểm độc lập log thô hạn dùng | 8/8 tổ hợp bốn kịch bản/hai quán đạt |

Không ghi kết quả FIFO/nhận hàng/Engine 2/Gấu Noel của các lượt trước thành lần chạy mới ở báo cáo này. Lượt 11 yêu cầu bài BTP âm và đã chạy lại riêng bài đó.

## Kiểm lại lượt 10 — bằng chứng độc lập

Ngoài bộ test 31 ca, chạy lại chính các probe đã tái hiện ở báo cáo trước với mock mới:

- Mồi a.n=1, b.n=2, missing={}, nul.n=null: `!= 1` và `not-in [1]` chỉ trả b; `not-in [1,null]` trả rỗng.
- RT lọc không có con khớp: `[val(), exists(), hasChildren()] = [null,false,false]`.
- Xoá lần lượt cả hai mã: node cha bị dọn khỏi mồi, snapshot rỗng đúng; transaction sau đó nhận null.
- Dọn nhánh nhiều tầng không làm mất các giá trị hợp lệ 0 và false ở nhánh khác.
- Chạy bộ test mới với mock cũ tại `d34dde8a`: **5 assertion thất bại đúng các sửa null/query RT rỗng/xoá mã cuối**. Mock mới đạt 31/31.

Phản hồi đã xử lý đúng khác biệt server/cache nêu ở lần trước: chú thích chọn mô phỏng server, cập nhật hai kỳ vọng cũ và thêm ca mảng chứa null. Đây là đóng các finding cụ thể, không chứng nhận mock là bản thay thế đầy đủ cho Firebase.

## Lượt 11 — 26 khai báo và thời điểm chạy

- Đối chiếu từng statement AST của `pos_expiry.v1.js` với main trước tách: **26/26 nguyên văn**, không còn các khai báo đó trong main.
- Giá trị đầu chỉ 24, 30, array rỗng, chuỗi rỗng và null. Không đọc DOM/localStorage/Firebase khi nạp; hai expression cấp ngoài cùng chỉ đặt marker `'dang'`/`true`.
- `setInterval(expirySoonTick, 60000)` ở lại main, sau chốt `POS_MODS_THIET_YEU`. File expiry được nạp đồng bộ trong head, trước main và các control ở body; có retry riêng, không dùng async/defer.
- Kiểm runtime bằng bọc `setInterval` và đếm riêng callback có tên `expirySoonTick`, trên bản sao bộ deploy:
  - Nạp đủ: marker true, qua bootstrap, đúng **1 timer**.
  - File 404 cả hai lần: màn đỏ, **0 timer**.
  - File chạy dở, marker dang rồi throw: màn đỏ, **0 timer**, không lỗi khai báo lần hai.
- `e2e_0d` cũng kiểm thiếu/chạy dở module expiry và gọi helper hạn dùng sau bootstrap.
- Cú pháp file mới đạt; bản sao trong ba bộ thường/Giáng sinh/Tết giống byte với nguồn. Sinh lại không gây diff tracked.

## Bốn kịch bản hạn dùng và bộ kiểm tự kiểm

Các bài chạy trên trang đã nạp các module thật, so lượt ghi/toast/state/lỗi trước-sau ở GG01/GG02, kiểm phạm vi độc lập theo REG, ghim tập bảng và tự chèn ghi sai quán.

- **hanGiaHan:** danh sách gồm b1 quá hạn, b2 và ctn_h1 sắp hết hạn; bấm nút thật của b2, hạn mới đúng `2026-10-27T07:53:20.000Z`; đọc lại b2 rời danh sách.
- **hanGiaHanNL:** bấm nút thật gia hạn ctn_h1; hạn mới đúng mốc trên; ghi bảng mã nguyên liệu đúng quán.
- **hanCheckOut:** chỉ b1 quá hạn; bỏ 400 g qua Engine; đóng overlay và gọi callback check-out lại đúng một lần.
- **hanDauCa:** gọi `expiryOpenDone`, đúng một update daily_openings của ngày 26/10 với expiryCheckedAt; không thay bằng set tạo phiếu mở ca.

Đã đọc và kiểm riêng tám snapshot log thô của bốn kịch bản/hai quán: hạn mới, dòng WASTE 400 g, callback checkout và update mở ca đúng. Timestamp hạn mới/expiryCheckedAt còn nguyên giá trị, không bị biến thành `<giờ>` ở chế độ gioCo.

Cổng PIN/check-out được stub đồng nhất như tài liệu. Bài `hanDauCa` kiểm dấu đã kiểm, không phải toàn bộ UI Việc đầu ca. Bài BTP âm hiện hành có thao tác phase open ở PC/mobile nhưng không phải phép so phase open với baseline.

Ngoài tự kiểm đổi 24 thành 25 giờ có sẵn, runner tester tạm cài thêm hai lỗi trên bản sao bộ deploy:

1. Thêm **đúng 1 giây** vào `expiryExtendTo`; `hanGiaHanNL` phát hiện lệch mục ghi. Như vậy chế độ giữ giờ không xoá mất lệch hạn nhỏ này.
2. Gọi `doCheckOut()` hai lần khi hết việc; `hanCheckOut` phát hiện lệch mục sau.

Runner tester chạy bốn kịch bản/hai quán và ba mutation: **101 assertion, ALL PASS**. PASS ở đây gồm nguồn sạch đạt và cả các lỗi cố ý bị phát hiện; không chỉnh source phát hành để cài lỗi.

## Trả lời bốn điểm phản biện lượt 11

1. **Giữ phần B inline tới Đợt 3:** hợp lý. Phần B gắn việc bù BTP lúc check-out/kết ca, có thể tách R riêng cùng luồng ca. Phụ thuộc `fmtPrepTime` đã có từ file expiry thiết yếu; không cần kéo phần B sang chỉ để cùng nằm dưới một chú thích.
2. **Handler chạy trước file expiry:** chưa thấy đường như vậy trong phần đã rà. Script expiry chặn parse và nạp trước body/main. Các tham chiếu từ stock_units/printer nằm trong thân hàm/method hoặc chuỗi HTML được dựng khi thao tác, không phải initializer gọi ngay trước khi expiry chạy. Các test browser đã gọi thật những đường hạn dùng được công bố.
3. **Timer chạy khi thiếu file:** chốt ném lỗi trước dòng setInterval; kiểm runtime 404/chạy dở xác nhận 0 timer. Giữ timer trong main là đúng với R này, không tạo timer tự chạy trong file mới.
4. **Giờ cố định và số lần gọi Date:** `gioCo` của harness cho mỗi lần Date/Date.now tăng 1 ms, không phải đồng hồ đứng yên tuyệt đối. Trong R hiện tại initializer không thêm lần đọc giờ; các phép so giữ nguyên timestamp đều đạt. Thêm/bớt lần đọc Date ở tương lai có thể làm metadata lệch vài ms dù nghiệp vụ không đổi; khi gặp cần điều tra trường cụ thể, không xoá toàn bộ giờ để cho PASS. Hiện `giuGio` giữ timestamp, và mutation lệch hạn 1 giây bị bắt. Chuẩn hoá mã ngẫu nhiên vẫn áp dụng như thiết kế.

## Giới hạn còn giữ

- Chưa có phép so baseline riêng cho toàn UI Việc đầu ca; chưa ghép đường «Bỏ đi» NL từ kiểm hạn qua màn Báo hết rồi quay lại. Các phần này đã được tài liệu lượt 11 ghi đúng là chưa phủ.
- Máy in giả trả lỗi, chưa in tem gia hạn thật. Mock `FieldValue.arrayUnion` vẫn chưa thực thi: bài gia hạn kiểm expiresAt/cache/UI, chưa chứng minh lịch sử `expiryExtensions` đã được server lưu đầy đủ. Đây là giới hạn mock hiện có, không phải thay đổi app trong lượt R.
- Các nhánh kho còn thiếu từ lượt 10 (cân trừ bì, bao bì/topping, pending sau reload/đổi quán, FIFO chưa hết, mở bao thứ hai, mất/cấp lại tem, kiểm kê quét) giữ nguyên trạng thái chưa nghiệm thu đầy đủ.
- orderBy/limit bỏ qua, increment xấp xỉ, onSnapshot chỉ ảnh đầu; chưa backend hai quán ghi đồng thời hoặc Firebase production.
- Chưa APK/máy quét/máy in thật. File:// tiếp tục bị môi trường chặn; không báo toàn bài khởi động PASS.

## File giao và bằng chứng

`node tools/file_thay_doi.js 0bd95a7 giangsinh` chỉ đọc, đã chạy không có `--ghi`. Danh sách gồm HTML thật/thử, DANH_SACH.txt và 11 JS mới dưới `public/js/posgieo/`, gồm expiry. Không ghi sổ phát hành hay thực hiện deploy; yêu cầu header Hosting vẫn theo kế hoạch.

Worktree: `/workspace/work/review10-11`, SHA đầu tài liệu. Chỉ runner tester tạm untracked; tracked source giữ nguyên sau sinh lại.

Logs trong `/workspace/work/`: `review10-11-suite.log`, `review10-11-mock.log`, `review10-11-old-mock.log`, `review10-11-null-probe.log`, `review10-11-rt-probe.log`, `review10-11-ast.log`, `review10-11-assets.log`, `review10-11-timer.log`, `review10-11-kho.log`, `review10-11-0d.log`, `review10-11-sale.log`, `review10-11-hook.log`, `review10-11-btp.log`, `review10-11-boundaries.log`, `review10-11-paths.log`, `review10-11-cross.log`, `review10-11-files.log`, `review10-11-negative.log`, `review10-11-dump-check.log`. Snapshot hai bản: `review10-11-dump/`.

Không thực hiện bước tách tiếp theo hoặc tự phê duyệt deploy.
