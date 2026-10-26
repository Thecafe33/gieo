# Kết quả kiểm tra độc lập lượt 12 — Ca, PIN, việc đầu ca và mở ca

- Ngày kiểm: 26/10/2026, giờ Việt Nam.
- Nhánh: `Phan-tach-unit-engine`.
- Commit kiểm: `e2b8d38575e5f2e69cea557c72c0344cc2cc3514`; đối chứng chuyển mã: commit cha `bfdcaca0`.
- Đã đọc `KIEM_TRA_12_CA.md`, diff nguồn/công cụ/test, phần source liên quan và kết quả lượt 10+11.
- Baseline browser: bộ Giáng sinh `0bd95a7`.
- Chỉ kiểm tra và ghi báo cáo, không sửa app/JS phát hành, không deploy.

## Kết luận

**Đạt phần chuyển mã R: 87/87 khai báo giữ nguyên, các luồng và phần ghi đã kiểm không có hồi quy mới.** Các bài ca chạy GG01/GG02 và giữ phạm vi dữ liệu đúng theo log; chuỗi bọc hàm vẫn khớp baseline.

**Có F12-1 ở Firebase giả:** arrayUnion/arrayRemove chưa so map đúng theo giá trị và set không merge làm mất nền mảng trước transform. Cần sửa công cụ trước khi dùng nó để kết luận các tình huống này. Không quy đây thành lỗi ứng dụng do tách.

Chưa nghiệm thu toàn bộ chuỗi mở ca/kết ca: bài mở ca hiện dừng chờ sau 4 giây, và tester xác nhận `_posSubmitBusy` vẫn true ở cả hai bản tại điểm lấy kết quả. Đây là giới hạn fixture/phạm vi bài so sánh đã được tài liệu nói tới, không phải bằng chứng hồi quy production.

## Kết quả chạy

| Kiểm tra | Kết quả |
| --- | --- |
| Sinh lại + toàn suite | TẤT CẢ ĐẠT, 151 file test; không diff tracked |
| `e2e_kho.js` | 595 assertion, 23 kịch bản × GG01/GG02 + 7 tự kiểm, ALL PASS |
| `e2e_0d.js` | 41 đạt, 1 thất bại do file:// bị môi trường chặn; không báo toàn bài PASS |
| `e2e_ban.js` / `e2e_hook.js` | 36 / 13 assertion đạt, ALL PASS; đủ 25 tên bọc |
| BTP âm | ALL PASS, PC/mobile |
| Automation shift work | Đạt ở 1366px và 390px |
| Firebase giả | 32 assertion đạt; các probe F12-1 chưa có trong bộ này |
| Ranh giới / đường dẫn | Sạch; 109 tên, 875 lời gọi, 54 động đã duyệt |
| Audit xuyên app | 0 lỗi, 9 kiểm tra đạt |
| AST / cú pháp / ba bộ mùa | 87/87 nguyên văn; cú pháp đạt; JS giống byte |
| Probe chốt module shift | Đạt cả nạp đủ / 404 / chạy dở |
| Runner bổ sung của tester | 115 assertion, ALL PASS; thêm PIN sai/khoá và hai mutation |
| Kiểm log thô bốn ca/hai quán | 8/8 đạt |

`e2e_shift_work.js` chạy nguyên bản với `/usr/bin/chromium`, không cần sửa đường browser. Đây là bài riêng của lớp automation với render stub, được đối chiếu cùng bài hook và các bài ca tích hợp trang; không coi một mình nó là đã kiểm hết POS mới.

## 87 khai báo và thời điểm khởi tạo

- So từng statement AST của `pos_shift.v1.js` với ba dải trong main trước tách: **87/87 nguyên văn**, không còn khai báo trùng những tên này trong main.
- Giá trị đầu là literal, array/object rỗng, null hoặc bộ icon tĩnh. `PIN_FIELDS_ALWAYS_ASK` chỉ tạo Set từ literal `['checkin']`; không đọc localStorage/DOM/Firebase lúc nạp.
- File nạp đồng bộ sau expiry, trước main; có retry và marker dang/true; shift nằm trong `POS_MODS_THIET_YEU`.
- `_shiftOpenDenoms`/`_shiftCloseDenoms` gọi `cfEmptyDenoms()` vẫn ở main; `CLOSE_PIPELINE_PIN_FIELDS` vẫn ở main. Các helper trong file mới chỉ dùng chúng khi được gọi sau bootstrap, không phải initializer đọc sớm.
- Cú pháp đạt, ba bản thường/Giáng sinh/Tết giống byte với nguồn. Sinh lại không gây diff tracked.
- Probe runtime trên bản sao: shift nạp đủ thì bootstrap chạy; shift 404 hoặc chạy dở thì màn đỏ và main dừng trước timer expiry, không lỗi khai báo lần hai. `e2e_0d` cũng bao phủ thiếu/chạy dở file shift.

## Bốn kịch bản ca và kiểm bổ sung

- **Check-in:** danh mục nhân viên mồi được đọc qua loader thật; PIN 1234 được nhập vào ô thật và đi qua `resolveStaffPinField`. Ghi ca e1, ngày đúng, chưa checkout; cache có một người, ô PIN được xoá.
- **Check-out:** dùng PIN thật với ca e1 đang mở; không có việc giao ca/BTP âm/hạn dùng trong fixture; người cuối ngày chưa đóng được hỏi một lần rồi ghi checkedOutAt và cập nhật cache.
- **Mở ca:** hai tờ 500.000 và một tờ 200.000 thành 1.200.000; phiếu mở ca ghi đúng tiền/mệnh giá/người ký; đoạn ca số 1 status open, custodian đúng, startCash 1.200.000. PIN ký mở ca được stub đồng nhất như tài liệu.
- **Tick việc:** ghi `checklistDone` bằng sentinel arrayUnion có id lau/người ký; phần đăng ký thời gian/checklist tiếp theo được so trong khoảng lấy log. Không coi fixture minDurationSec=0 là kiểm thời gian làm tối thiểu.
- Cả baseline lẫn bản mới được kiểm phạm vi theo REG ở Node; mọi kịch bản vẫn tự chèn ghi sang cửa hàng khác để chứng minh bộ kiểm phạm vi bắt được.

Đã kiểm riêng tám snapshot log thô: danh tính/giờ ca, số người trong cache/ô PIN, tổng mệnh giá, số thứ tự/người giữ két của đoạn ca và sentinel việc đầu ca đều khớp, không chỉ dựa vào toast.

Runner tạm của tester chạy bốn ca trên và thêm ca **ba PIN sai liên tiếp rồi PIN đúng trong lúc khoá**: ở GG01/GG02, khóa còn hiệu lực, không check-in/ghi ca, cache không có người trong ca. Đây là kiểm cơ bản đường khoá; chưa kiểm hết giờ khoá, mọi field PIN hoặc phiên người ký kết ca.

Ngoài mutation ngưỡng OT 8→9 có sẵn, cài thêm trên bản sao:

1. Cộng 1.000 vào tiền mở ca: `caMoCa` phát hiện lệch mục ghi.
2. Đổi id việc đầu ca từ lau sang lau_wrong: `caTickViec` phát hiện lệch mục ghi.

Runner bổ sung đạt **115 assertion, ALL PASS**, gồm nguồn sạch và các lỗi cố ý đều bị phát hiện. Không sửa source phát hành để cài lỗi.

### Điểm lấy kết quả mở ca chưa phải hoàn tất luồng

Runner chính dùng `Promise.race([submitShiftOpen(), sleep(4000)])`, rồi lấy log sau 300 ms. Tester giữ nguyên thao tác và thêm trạng thái busy vào snapshot:

| Kịch bản | Baseline/bản mới ở hai quán |
| --- | --- |
| Check-in / check-out | busy false |
| Tick việc | busy false |
| Mở ca | **busy true** |

Do đó bài mở ca chứng minh phần ghi phiếu/đoạn ca và toast trong cửa sổ đó; chưa chứng minh promise hoàn tất, nhả khoá submit hay toàn bộ màn kiểm kê/checklist chạy tiếp. Phần này đã được mô tả là ngoài phạm vi sau ghi; cần giữ giới hạn khi đánh dấu nghiệm thu. Nếu muốn kiểm toàn luồng, mồi đủ hoặc điều khiển rõ phần chạy tiếp, rồi chờ mốc hoàn tất có assertion; không đổi app chỉ để test qua.

## F12-1 — phép biến đổi mảng trong Firebase giả còn sai

Mức: **vừa, công cụ kiểm thử**. Vị trí: `tools/tach_posgieo/fb_gia.js:12`, `:14`, `:19`.

Chạy trực tiếp `FB_STUB` trong Node VM với `__SEED_GHI=true`:

| Probe | Kết quả mock | Kỳ vọng |
| --- | --- | --- |
| Mảng có `{id:1,staff:'a'}`; union `{staff:'a',id:1}` | Hai phần tử | Một phần tử: cùng giá trị map |
| Mảng có `{id:1,staff:'a'}`; remove `{staff:'a',id:1}` | Vẫn còn phần tử | Mảng rỗng |
| Doc có arr=[1]; `set({arr: arrayUnion(2)})` không merge | arr=[2] | arr=[1,2]; field khác bị thay thế như set thường |

Nguyên nhân đầu: dùng JSON.stringify trực tiếp làm khoá so sánh, lệ thuộc thứ tự thuộc tính. Nguyên nhân sau: nhánh set gọi `fvDoc(null,d)`, bỏ giá trị trước transform. Bộ test mới chỉ có một chuỗi merge/update với object id đơn, nên 32 ca xanh chưa phát hiện các sai lệch này.

Đối chiếu đúng SDK 10.13.2: [so map và tìm phần tử mảng](https://github.com/firebase/firebase-js-sdk/blob/firebase%4010.13.2/packages/firestore/src/model/values.ts#L199) dùng giá trị theo key; [set mutation áp transform](https://github.com/firebase/firebase-js-sdk/blob/firebase%4010.13.2/packages/firestore/src/model/mutation.ts#L459) lấy giá trị transform từ document trước khi thay nội dung. Các kỳ vọng trên không dựa vào so identity JavaScript.

Đề nghị dùng so giá trị sâu/canonical như bộ lọc hiện có, giữ nền cũ cho field transform ngay cả set không merge, và thêm ba ca âm trên. Giữ đúng việc set thay các field không được nêu, không biến set thành merge toàn doc. Nếu chỉ hỗ trợ một tập con thì cần báo rõ khi gặp phần chưa hỗ trợ, tránh lặng lẽ trả sai.

Những probe này không chứng minh app mới sai: code nghiệp vụ giữ nguyên, baseline và bản mới cùng mock. Với fixture một việc lau chưa có lịch sử và gia hạn một lần, phần giá trị sentinel đã được kiểm; chưa dùng kết quả này để xác nhận dedup/remove map hoặc lịch sử có sẵn nói chung.

## Trả lời ba điểm phản biện

1. **posDateKey trong shift:** chấp nhận trong lượt R. Đây là tiện ích dùng chung nhưng file shift thiết yếu và có trước main, không có initializer đọc trạng thái máy. Chuyển sang nền nếu cần là R riêng sau này; không thêm tách phụ hoặc đổi thứ tự tải ở lượt này.
2. **Ranh giới 3A/3B:** giữ phần mở ca ở 3A; đối soát tiền cuối ca, pipeline kết ca, CK/bàn giao/đóng ngày và tiền quỹ GĐ9 ở 3B/3C là hợp lý. `clLogComplete`, bộ đếm giờ, renderPinInput/currentSignerPOS là helper dùng chung hai luồng; giữ một binding, không sao chép khi tách 3B. Chưa thấy khai báo nào trong tập chuyển cần chuyển lại ngay chỉ vì phục vụ cả kết ca.
3. **Có gán/bọc lại:** có hai tên trong tập chuyển: automation bọc renderOpeningChecklist; Engine 2 bọc renderOpeningChecklist và openCaLamViecScreen. `e2e_hook` kiểm đủ 25 tên và chuỗi của chúng vẫn khớp; lớp bọc root nạp sau main như trước. Không thấy wrapper mới của doCheckOut/renderPinInput trong nguồn đã rà. Các phép gán stub của harness không phải thay đổi app.

## Giới hạn và ghi nhận nền

- payTerms rỗng/roles=[] ở check-in được ghi nhận có sẵn ở baseline vì resolvePinToEmployee chỉ trả id/fullName. Đây không phải mất trường do tách. Báo cáo này không kiểm lại toàn bộ tính lương hoặc mọi cấu hình chức năng nhân viên chỉ từ fixture e1 barista.
- Chưa ghép check-out với bàn giao/BTP âm/hạn dùng; chưa so baseline cho countdown, bỏ qua có lý do, lệch tiền giữ lại hôm trước và phiên người ký kết ca.
- Mock vẫn bỏ qua orderBy/limit, increment xấp xỉ, onSnapshot một ảnh đầu; chưa đầy đủ transform lồng nhau, concurrency hoặc transaction retry. F12-1 không biến thành yêu cầu mô phỏng toàn bộ Firebase, nhưng phần dùng để nghiệm thu phải đúng hoặc từ chối rõ.
- Chưa APK/máy in/máy quét/Firebase production hoặc backend hai quán đồng thời. File:// bị môi trường chặn, không báo e2e_0d ALL PASS.

## Bằng chứng

Worktree: `/workspace/work/review12`, SHA đầu báo cáo. Tracked source sạch sau sinh lại; chỉ runner tester tạm untracked.

Logs trong `/workspace/work/`: `review12-suite.log`, `review12-kho.log`, `review12-0d.log`, `review12-sale.log`, `review12-hook.log`, `review12-btp.log`, `review12-shift-work.log`, `review12-mock.log`, `review12-array-probe.log`, `review12-ast.log`, `review12-assets.log`, `review12-assignments.log`, `review12-guard.log`, `review12-boundaries.log`, `review12-paths.log`, `review12-cross.log`, `review12-extra.log`, `review12-dump-check.log`. Snapshot chính: `review12-dump/`; snapshot bổ sung: `review12-extra-dump/`.

Không thực hiện bước tách tiếp theo, không tự phê duyệt deploy.
