# Kết quả kiểm tra lại lượt 12 — phản hồi tại 1b67d446a

- Ngày kiểm: 26/10/2026, giờ Việt Nam.
- Nhánh: `Phan-tach-unit-engine`.
- Commit kiểm: `1b67d446a43dbd5b9263f1de6805a13e83d3dfe5`.
- Đã đọc `PHAN_HOI_KIEM_TRA_12.md`, đối chiếu `KET_QUA_KIEM_TRA_12_DOC_LAP.md` tại `9a6b45f1` và diff công cụ/test.
- Baseline browser: bộ Giáng sinh `0bd95a7`.
- Chỉ kiểm tra và ghi báo cáo; không sửa ứng dụng/JS phát hành, không deploy.

## Kết luận

**ĐẠT phần sửa F12-1, đóng finding trong phạm vi ba probe đã báo. Không phát hiện hồi quy mới trong các bài chạy lại.** Mock đã so map theo giá trị và giữ nền mảng cho transform khi set không merge, đồng thời vẫn thay thế các field thường đúng kiểu set.

Phần tách mã 3A đã đạt ở báo cáo trước vẫn giữ. Diff lần này không đổi `posgieo.html`, `js/` hoặc `ban_deploy/`, nên không lặp lại phép so 87 khai báo.

Giới hạn mở ca được ghi nhận đúng: đã so cả trạng thái busy; fixture vẫn chỉ xác nhận phần ghi phiếu/đoạn ca trong cửa sổ lấy kết quả. Chưa kết luận luồng mở ca tới kiểm kê/checklist hoàn tất hoặc khoá bấm đã được nhả. Phần đó để lại 3B như phản hồi nêu.

## Kết quả chạy

| Kiểm tra | Kết quả |
| --- | --- |
| `tests/tach_posgieo_fb_gia.test.js` | 35/35 đạt; mock cũ trượt đúng 3 ca F12-1 |
| Probe hợp đồng độc lập | 6 nhóm đạt, gồm map sâu và transaction lỗi/thử lại |
| `e2e_kho.js` | 595 assertion, 23 kịch bản × GG01/GG02 + 7 tự kiểm, ALL PASS |
| `e2e_0d.js` | 41 đạt, 1 thất bại file:// do môi trường; không báo toàn bài PASS |
| `e2e_ban.js` / `e2e_hook.js` chạy lại trên bộ file ổn định | 36 / 13 assertion đạt; hook đủ 25 tên bọc, ALL PASS |
| `sh tools/sinh_lai_tat_ca.sh` | TẤT CẢ ĐẠT, 151 file test; không diff tracked |
| Runner cài lỗi trạng thái busy | 49 assertion đạt, ALL PASS; hai lỗi bị bắt ở mục sau |
| Kiểm log/state bốn ca/hai quán | 8/8 khớp baseline, gồm trường busy |

Không trình bày kết quả BTP/automation hoặc probe loader ở báo cáo trước thành lần chạy mới. Lần này tập trung thay đổi mock, so trạng thái ca và các bài phản hồi yêu cầu.

## F12-1 — kiểm riêng ba probe và đối chứng âm

Chạy lại trực tiếp `FB_STUB` trong Node VM với `__SEED_GHI=true`, không dùng runner e2e để tự suy kỳ vọng:

| Probe | Kết quả mới |
| --- | --- |
| Mảng có `{id:1,staff:'a'}`, union `{staff:'a',id:1}` | Giữ đúng một phần tử; field thường khác giữ nguyên trong update |
| Remove map cùng giá trị nhưng khác thứ tự khoá | Xoá được, mảng rỗng |
| Doc có arr=[1], keep=1; `set({arr:arrayUnion(2)})` không merge | arr=[1,2], field keep bị bỏ |

Diff đúng nguyên nhân: `fvAp` dùng `chuan` thay JSON.stringify trực tiếp; nhánh set lấy nền từ `S[duong]` thay null, nhưng vẫn dựng nội dung mới chỉ từ field được set.

Chạy test mới với mock cũ ở `e2b8d385`: đúng **3 assertion thất bại**, lần lượt là ba probe trên. Mock mới đạt **35/35**. Không tính lần đối chứng âm là lỗi sản phẩm.

Kiểm thêm ba hợp đồng liên quan:

- Update qua đường lồng `nested.arr`, map có object con đảo thứ tự key: không thêm trùng và giữ field thường khác.
- Transaction có transform rồi lỗi ở lần ghi tài liệu thứ hai: cả mảng cũ và tài liệu thứ hai giữ trạng thái trước giao dịch; không áp transform nửa chừng.
- Thử lại sau lỗi: mảng trở thành [1,2] đúng một lần.

Cả sáu nhóm probe độc lập đều đạt. Điều này đóng lỗi đã báo; không chứng nhận mọi phép biến đổi hoặc toàn bộ Firebase đã được mô phỏng.

## Trạng thái busy đã thực sự tham gia phép so

Đã kiểm mã runner: bốn nhánh ca trả `busy: _posSubmitBusy`; trường này nằm trong `sau`, vốn được so trước/sau. Không chỉ thêm vào log để đọc bằng mắt.

Runner tạm tạo bản sao bộ deploy và cài thêm hai lỗi, không sửa nguồn release:

1. Sau check-in, cố tình giữ `_posSubmitBusy=true` thay vì nhả khoá: bài phát hiện lệch **mục sau**.
2. Trong mở ca, cố tình đổi `_posSubmitBusy=false` trước phần chạy tiếp: bài cũng phát hiện lệch **mục sau**.

Nguồn sạch ở GG01/GG02 vẫn khớp baseline: check-in busy false, mở ca busy true tại điểm lấy snapshot. Hai mutation chứng minh phép so mới bắt được thay đổi trạng thái khoá dù mục tiêu chính của bài là ghi sổ. Runner bổ sung gồm 49 assertion, ALL PASS, có cả mutation OT sẵn có.

Không thay việc kiểm giá trị busy bằng kết luận hoàn tất mở ca: Promise.race 4 giây vẫn là ranh giới lấy kết quả, không phải assertion promise submit đã settle. Phản hồi đã ghi đúng giới hạn và không sửa app để che nó.

## Giới hạn còn giữ

- Kiểm đầy đủ mở ca → kiểm kê → checklist/nhả khoá, các nhánh check-out có bàn giao/BTP âm/hạn dùng và các giới hạn nghiệp vụ ở lượt 12 vẫn chưa được nghiệm thu thêm tại đây.
- Mock orderBy/limit còn bỏ qua, increment xấp xỉ, onSnapshot một ảnh đầu; chưa đầy đủ transform lồng nhau, concurrency hoặc transaction retry thật.
- Chưa APK, máy in/quét, Firebase production hoặc hai quán đồng thời. `file://` tiếp tục bị môi trường chặn; không báo toàn bộ e2e_0d là PASS.

## Bằng chứng

Worktree: `/workspace/work/retest12`, SHA đầu báo cáo. Tracked source giữ nguyên sau sinh lại; chỉ runner tester tạm untracked.

Logs trong `/workspace/work/`: `retest12-mock.log`, `retest12-probes.log`, `retest12-old-mock.log`, `retest12-kho.log`, `retest12-0d.log`, `retest12-sale.log`, `retest12-hook-ready.log`, `retest12-suite.log`, `retest12-busy-negative.log`, `retest12-dump-check.log`. Snapshot chính: `retest12-dump/`; snapshot bổ sung: `retest12-extra-dump/`.

Lần hook đầu (`retest12-hook.log`) gặp ENOENT khi tác vụ sinh bộ deploy đang thay thư mục. Đã chạy lại trên bộ file ổn định sau khi bước sinh/test kết thúc; dùng log hook-ready cho kết luận. Đây là lỗi thứ tự chạy trong môi trường tester, không phải hồi quy app.

Không thực hiện bước tách tiếp theo, không tự phê duyệt deploy.
