# Kết quả kiểm tra độc lập lượt 08 — Nhận hàng

- Ngày: 26/10/2026, giờ Việt Nam.
- Nhánh: `Phan-tach-unit-engine`; SHA kiểm: `53008d87e01a939ac9daf90cfc68bfa6301c1e0a`.
- Đã đọc `KIEM_TRA_08_NHAN_HANG.md`, công cụ mới và phần nhận hàng được tách.
- Vai trò tester: không sửa app/JS phát hành, không deploy, không ghi sổ phát hành.

## Kết luận

**Phần chuyển 38 khai báo không phát hiện hồi quy trong phạm vi đã kiểm. Chưa thông qua kết luận bao phủ cách ly mọi cửa hàng của `e2e_kho.js`: có một điểm mù đã tái hiện cần sửa.**

Đây là thiếu sót của công cụ kiểm cách ly, không phải bằng chứng app hiện tại đã ghi sang GG03. Kịch bản gốc trên GG01/GG02 vẫn có 16 lượt ghi giống baseline. Các nhánh PO, ảnh, thử lại sau lỗi chưa được bài so sánh mới bao phủ như tài liệu đã ghi.

## Kết quả chạy lại

| Kiểm tra | Kết quả |
| --- | --- |
| `sh tools/sinh_lai_tat_ca.sh` | TẤT CẢ ĐẠT, 149 file test |
| `check_boundaries` | RANH GIỚI SẠCH |
| `check_paths` | ĐƯỜNG DẪN SẠCH: 109 tên, 875 lời gọi, 54 động đã duyệt |
| `kiem_tra_xuyen_app --assert-clean` | 0 trường hợp lỗi, 9 kiểm tra đạt |
| `e2e_kho.js` | ALL PASS, 18 assertion; GG01/GG02, tự kiểm ghi chú phiếu nhận được bắt |
| `e2e_ban.js` | ALL PASS, 36 assertion, gồm hai tự kiểm F07-2 |
| `e2e_hook.js` | ALL PASS, 13 assertion, đủ 25 hàm và tự kiểm bốn lỗi |
| `e2e_0d.js` | 28 assertion đạt; chỉ assertion file:// thất bại do môi trường chặn |
| Nhận hàng `e2e_don_vi.js` | 80/80 |
| FIFO `e2e_retry.js` | 28/28 |
| `node --check pos_receive.v1.js` | Đạt |
| SHA-256 file nhận hàng trong ba bộ mùa | Giống nhau |
| Index GG02 trước/sau cập nhật công cụ | JSON giống nhau, 6 index |

Không đánh dấu file:// đã nghiệm thu: browser môi trường chặn giao thức này (`ERR_BLOCKED_BY_ADMINISTRATOR` đã xác nhận ở các lượt trước). Không APK/Termux thật, không Firebase production.

## Đối chiếu mã được chuyển

Đọc script chính của commit cha `a720d8a2` bằng AST, lấy nguyên văn statement của mỗi khai báo và so với `js/posgieo/pos_receive.v1.js` hiện tại:

- **38/38 giống nguyên văn**, không phát hiện tên bị thay đổi trong tập chuyển.
- Ba state cấp cao chỉ là null/object literal, không có initializer đọc storage, Firebase hoặc DOM.
- Các hàm nhận hàng đọc dịch vụ main khi được gọi, không lúc file được tải.
- Bộ deploy được sinh lại; đường mới nằm trong `js/posgieo/` và file cùng nội dung ở ba mùa.
- Sửa `ban_do --cum` chọn nguồn HTML thay vì file JS nạp trước là phù hợp; test bản đồ có bài tương ứng trong suite.
- Công cụ index quét cả JS riêng; kết quả JSON GG02 khớp bản công cụ trước tách. Kết quả khớp không có nghĩa đã chạy truy vấn/index trên Firebase thật.

## F08-1 — Cao trong yêu cầu nghiệm thu cách ly: bỏ qua mọi hậu tố cửa hàng

Vị trí: `tools/tach_posgieo/e2e_kho.js`, vòng tính `lot` trong hàm `chay`:

```js
if (!T || /__gg\d\d$/.test(T)) continue;
```

Mọi đường có hậu tố đều bị bỏ qua trước khi xác minh hậu tố có phải quán đang kiểm hay không. Do đó lượt GG02 ghi GG03 hoặc lượt GG01 ghi GG02 cũng không bị invariant này đánh dấu. Assertion kế tiếp chỉ yêu cầu **có ít nhất một bảng `__gg02`**, không yêu cầu mọi bảng S/C đều thuộc GG02.

### Cách tái hiện độc lập

Tạo bản công cụ tạm cùng SHA, không thay ứng dụng và không thay assertion. Ngay trước `const lot = []`, thêm một record vào log thử nghiệm:

```js
window.__ghi.push({
  op: 'set',
  p: 'receiving_records_gieogieo__gg03/probe',
  rt: false,
  d: { tester: true }
});
```

Chạy bản tạm:

- Cả lượt GG01 và GG02 có thêm log ghi sang GG03.
- Phép kiểm vẫn in “mọi lượt ghi đi qua GieoData đúng quán”.
- Toàn bài vẫn **ALL PASS**, kể cả tự kiểm ghi chú.

Record được chèn cùng chỗ ở cả baseline và bản mới nên phép so trước/sau vẫn khớp. Đây là chủ đích của negative control: invariant cách ly phải độc lập phát hiện cả trường hợp hai bản cùng sai, không chỉ dựa vào sự khác nhau giữa hai log.

Không dùng kết quả này để khẳng định có thao tác ghi GG03 thật: đây là log mồi kiểm chính bộ phân loại đường ghi. Nó chứng minh tuyên bố “không lọt sang bảng riêng quán khác” đang mạnh hơn bằng chứng của công cụ.

### Yêu cầu sửa

1. Phân loại đường theo registry/phạm vi, tách phần tên bảng gốc và hậu tố hợp lệ rồi kiểm đích vật lý phải khớp **store hiện tại**, kể cả bản thật/thử nếu mở rộng bài.
2. GG01 phải dùng đúng tên legacy; GG02/GG03 phải dùng đúng hậu tố tương ứng. Không chấp nhận hậu tố bất kỳ.
3. Tiếp tục giữ chia sẻ G/X hợp lệ; không cấm chung mọi bảng không có hậu tố.
4. Thêm negative controls: GG02→GG01, GG02→GG03, GG01→GG02 và một lượt ghi hợp lệ để tránh chặn oan. Kiểm cả đường trong `p` và `tx.*@...`/`batch.*@...`.
5. Với kịch bản nhận hàng này, có thể ghim thêm tập bảng S/C dự kiến: inventory_items, stock_transactions, receiving_records, stock_containers. Một invariant độc lập không nên chỉ hỏi lại bộ ánh xạ đang được kiểm rồi mặc định mọi tên đã có suffix là đúng.

Sau khi sửa, chính record thử trên phải khiến kiểm cách ly thất bại; negative control bị bắt đúng phải được báo đạt trong bài tự kiểm.

## Các nhánh và giới hạn cần giữ rõ

- Nhận tự do hiện đã được so trước/sau. Chọn PO và retry sau lỗi là hai nhánh ưu tiên bổ sung trước khi tuyên bố toàn bộ 2A đã nghiệm thu nghiệp vụ: kiểm `poReceiveUpdatePODoc`, trạng thái partial/received, `appliedLines`, idemKey và không cộng đôi ledger/phiếu/PO.
- Ảnh là nhánh Storage không được data_access tự bọc. Cần kiểm đường ảnh, gộp URL khi retry, liên kết phiếu đúng quán và lỗi upload; không suy từ test Firestore rằng ảnh cũng cách ly đúng.
- Mock hiện ghi log nhưng không áp ghi trở lại seed, bỏ qua where/orderBy/limit và chưa có transaction retry/conflict thực. Vì vậy không dùng mock này đơn độc để chứng minh snapshot kho cuối hoặc idempotency nhiều lần.
- Dùng cùng hạt giống giúp phát hiện thay đổi mã tem trong đường đã chạy; không chứng nhận tính duy nhất ngẫu nhiên nhiều quán/máy. Normalization vẫn thay mã kỹ thuật có mẫu, nên tránh diễn giải nó như phép so mọi định danh nguyên bản.
- Một kịch bản chạy GG01 rồi GG02 với context riêng không chứng minh hai cửa hàng đồng thời dùng chung backend không chồng lấn. Khi kiểm đồng thời phải có backend fixture chung và dữ liệu mồi trùng ID khác giá trị, kiểm cả đọc/ghi.
- Test hiện yêu cầu >=3 lượt ghi và so giống baseline, chưa ghim đầy đủ điều kiện thành công nhận hàng. Nên thêm assertion toast thành công, phiếu completed, số mã/đơn vị/hao hụt đúng, state reset và không còn lỗi bị bắt rồi nuốt. Đây là tăng bằng chứng cho kịch bản happy path, không yêu cầu đổi thao tác app.

## Trả lời câu hỏi của người triển khai

1. **Nhánh cần bổ sung:** ưu tiên PO và partial-failure retry vì có tác dụng nhiều bảng và cơ chế chống ghi lặp; ảnh cần kiểm riêng phạm vi Storage. R nguyên văn hiện có bằng chứng tốt, nhưng không gọi toàn bộ các nhánh đó đã đạt nếu chưa chạy.
2. **Hạt giống:** phù hợp để ổn định mã tem. Cùng seed không chứng minh chất lượng ngẫu nhiên/độ duy nhất; normalization và mock rỗng vẫn có thể che phần định danh kỹ thuật. Giữ mã tem nghiệp vụ trong phép so là đúng.
3. **Đúng quán:** F08-1 tồn tại ngay trong bộ kiểm. Việc gọi `firebase.firestore()` lại chưa chắc tạo client thô vì SDK có thể trả cùng object đã bọc; cần kiểm log đích và instance thực tế, không suy chỉ từ cú pháp gọi. Không thấy runtime mới tự tạo client Firebase thứ hai trong 38 khai báo nguyên văn.

## Bằng chứng và phạm vi thay đổi

Worktree sạch: `/workspace/work/review08` tại `53008d87`. File `tools/tach_posgieo/e2e_kho.scope-tester.js` là công cụ thử untracked, không thuộc release; nó chỉ cài log mồi vào bộ kiểm, không sửa source app.

Log: `/workspace/work/review08-suite.log`, `review08-kho.log`, `review08-0d.log`, `review08-sale.log`, `review08-hook.log`, `review08-receiving.log`, `review08-fifo.log`, `review08-boundaries.log`, `review08-paths.log`, `review08-cross.log`, `review08-negative-scope.log`, `review08-index.json`, `review08-index-before.json`, `review08-files.log`.

Lệnh chạy lại lấy nguyên mục 4 của tài liệu lượt 08, cộng audit xuyên app và phép so index. Không sửa bộ sinh hoặc module nhận hàng để làm test đạt. Đề nghị sửa F08-1 trong công cụ, gửi kiểm lại; chưa thực hiện 2B.
