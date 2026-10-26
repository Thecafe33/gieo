# Kết quả kiểm tra lại lượt 09 — phản hồi tại 0517061c

- Ngày kiểm: 26/10/2026, giờ Việt Nam.
- Nhánh: `Phan-tach-unit-engine`.
- Commit kiểm: `0517061c392fb437aa39b342e2115ea29fe696b0`.
- Đã đọc `PHAN_HOI_KIEM_TRA_09.md`, đối chiếu `KET_QUA_KIEM_TRA_09_DOC_LAP.md` tại `ddacdf9e` và diff công cụ.
- Baseline browser: bộ Giáng sinh `0bd95a7`; bản mới: bộ Giáng sinh của commit kiểm.
- Chỉ kiểm tra và ghi báo cáo; không sửa ứng dụng, không deploy.

## Kết luận

**Đạt phần bổ sung kiểm tra bắt đầu nấu trong phạm vi ba kịch bản đã công bố: theo công thức, nguyên gói có quét mã và lỗi ghi sổ cần hoàn kho. Không phát hiện hồi quy mới trong phạm vi kiểm lại.**

Phản hồi đã bổ sung được bằng chứng browser cho ba nhánh này. Kết luận đạt phần chuyển mã R và hoàn thành / huỷ / đổ bỏ ở báo cáo trước vẫn giữ. Tuy nhiên, không diễn giải kết quả này thành toàn bộ chế biến 2B đã được nghiệm thu mọi nhánh: cân đối chiếu `prepRecon*`, khôi phục sau tạo lô/mất ACK, gợi ý nấu, sửa yield và thiết bị thật chưa được bài bổ sung bao phủ đầy đủ.

## Xác nhận phạm vi thay đổi

Diff từ `d44b0969` đến commit kiểm không thay `posgieo.html`, `js/` hoặc `ban_deploy/`. Phần thực thi chỉ đổi `tools/tach_posgieo/e2e_kho.js` và `fb_gia.js`; còn lại là tài liệu. Không cần lặp lại phép so 168 khai báo vì nguồn ứng dụng không đổi.

Ba kịch bản chạy trong trang thật đã nạp các module, gọi các cổng bắt đầu nấu thật. Xác thực nhân viên/PIN, điều kiện ca và xác nhận được stub đồng nhất giữa baseline và bản mới; đây không phải kiểm UI nhập PIN hay máy quét vật lý.

## Kết quả chạy lại

| Kiểm tra | Kết quả |
| --- | --- |
| `sh tests/run_all.sh` sau cài đủ dependency | 150/150 file, TẤT CẢ ĐẠT; 2003 assertion `ok`, không `FAIL` |
| `e2e_kho.js` | 233 assertion đạt; 9 kịch bản × GG01/GG02 và 3 tự kiểm, ALL PASS |
| `e2e_ban.js` | 36 assertion đạt, ALL PASS |
| `e2e_hook.js` | 13 assertion đạt, đủ 25 hàm bọc và tự kiểm, ALL PASS |
| `e2e_0d.js` | 30 đạt; 1 thất bại vì `file://` bị môi trường chặn, không báo ALL PASS |
| Ranh giới / đường dẫn | Sạch; 109 tên, 875 lời gọi, 54 động đã duyệt |
| Runner độc lập và cài lỗi thêm | 78 assertion đạt, ALL PASS |

## Kiểm độc lập ngoài assertion có sẵn

Tạo bản runner tạm `e2e_kho.tester.js`, không sửa runner gốc hay JS phát hành. Bản này lưu log thô của baseline/bản mới cho cả ba kịch bản và hai quán; kiểm thêm bằng script riêng:

- Nấu thường: đúng hai dòng CONSUMPTION, đường −1000 và siro −500; hai mã giao dịch khác nhau; `referenceId` cùng trỏ đúng mã lô tạo mới. `inputTrace` có đúng hai NL và lượng tương ứng.
- Nấu nguyên gói: trừ 2000 g; trace gắn đúng `ctn_tcg1` / `TCG00001` và lượng 2000 g. Cổng quét đã mở, sau thành công được xoá; lô ở trạng thái cooking.
- Lỗi bắt đầu mẻ: xác nhận log thực tế có **đúng một** dấu lỗi ghi sổ, không có ghi tạo lô và cache lô rỗng. Siro đã trừ −500 có dòng hoàn +500, cùng mã tham chiếu lô, `reversal: true`, `resultingStock` trở lại 20000. Kiểm này mạnh hơn assertion `.some()` đơn lẻ của runner.
- Cả sáu tổ hợp kịch bản/quán đều đạt các kiểm bổ sung. Bộ kiểm phạm vi quán có sẵn vẫn chạy độc lập theo REG cho baseline và bản mới; phép chèn bản ghi sai quán vẫn bị bắt. Đây là chạy riêng GG01/GG02, chưa phải hai quán đồng thời trên backend chung.

### Cài lỗi để kiểm bài kiểm

Ngoài ba tự kiểm của runner gốc, bản runner tạm tạo từng bản sao bộ deploy rồi cài ba lỗi:

1. Nấu thường: đổi `qty: -qty` thành `qty: -(qty + 1)`.
2. Nấu nguyên gói: cùng thay đổi lượng trừ, giữ đường quét mã.
3. Lỗi bắt đầu mẻ: bỏ lời gọi hoàn kho đầu tiên `_reversePrepBatchInputsPOS`, trả kết quả giả `{ok: 0}`.

**Cả ba bản lỗi đều làm lệch mục `ghi` và bị bài kiểm phát hiện.** Bản nguồn sạch không bị chỉnh; các bản sao cài lỗi được runner dọn sau khi chạy. Bản runner tạm gồm 78 assertion, ALL PASS: PASS ở đây nghĩa là nguồn sạch đạt và các lỗi cố ý đều bị phát hiện.

## Firebase giả sau sửa

Kiểm riêng `FB_STUB` trong Node VM, không dùng dữ liệu thật:

- Hai lần `doc()` tạo hai mã khác nhau; `doc('known')` giữ nguyên mã chỉ định. Ghi hai tài liệu rồi đọc lại vẫn giữ đúng từng giá trị.
- Hai lần `add()` tiếp tục có mã riêng, không trùng hai mã `doc()`; dữ liệu được cập nhật vào mồi khi bật `__SEED_GHI`, đọc collection thấy đủ bốn tài liệu.
- Cài một lỗi `tx.set` trong giao dịch chứa hai ghi: cả hai tài liệu giữ dữ liệu trước giao dịch và log có đúng một dấu lỗi.

Sửa mock giải quyết đúng việc trước đây các `doc()` cùng nhận mã `auto`, có thể làm kiểm idempotency nhận nhầm. Mock vẫn tối giản: bỏ qua bộ lọc truy vấn, increment xấp xỉ, không mô phỏng đầy đủ concurrency/transaction retry; kết quả không thay thế Firebase thật.

## Giới hạn và việc còn lại

- Nhánh nguyên liệu phải cân trước/sau, khoá đối chiếu, `prepForce*` chưa có đối chiếu browser đầy đủ. Các bộ Node liên quan vẫn thuộc suite; không coi đó là bài browser mới.
- `batDauMeLoi` cài lỗi ở lần ghi sổ đầu tiên, trước khi tạo lô; không phải kiểm lỗi lưu lô hoặc mất ACK sau khi backend đã tạo lô. Phản hồi không được dùng để tuyên bố đã kiểm những tình huống đó.
- Chưa gợi ý nấu/localStorage, sửa định lượng, in tem lô, APK, máy quét thật hay Firebase production.
- `file://` thất bại do `net::ERR_BLOCKED_BY_ADMINISTRATOR`, xác minh lại bằng điều hướng trực tiếp. Không ghi toàn bộ `e2e_0d` là PASS.

## Bằng chứng

Worktree kiểm: `/workspace/work/retest09` tại SHA đầu tài liệu. Chỉ có runner tester tạm untracked; tracked source giữ nguyên.

Logs: `/workspace/work/retest09-kho.log`, `retest09-sale.log`, `retest09-hook.log`, `retest09-0d.log`, `retest09-suite-ready.log`, `retest09-boundaries.log`, `retest09-paths.log`, `retest09-independent.log`, `retest09-observe-check.log`. Sáu snapshot thô: `retest09-observe-<kịch bản>-<quán>.json` trong cùng thư mục work.

Lượt suite ban đầu ở worktree mới thiếu dependency `acorn`, làm ba assertion của `check_paths` thất bại. Đã cài dependency bằng `npm install --ignore-scripts` và chạy lại đầy đủ suite; dùng log `suite-ready` cho kết luận, không tính lần thiếu dependency là lỗi sản phẩm.
