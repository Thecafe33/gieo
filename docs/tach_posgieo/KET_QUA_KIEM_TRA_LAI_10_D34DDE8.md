# Kết quả kiểm tra lại lượt 10 — phản hồi tại d34dde8a

- Ngày kiểm: 26/10/2026, giờ Việt Nam.
- Nhánh: `Phan-tach-unit-engine`.
- Commit kiểm: `d34dde8a8a6651ea6f14f451a2ab80a7c0a404c1`.
- Đã đọc `PHAN_HOI_KIEM_TRA_10.md`, đối chiếu `KET_QUA_KIEM_TRA_10_DOC_LAP.md` tại `8909c0fc` và diff công cụ/test.
- Baseline browser: bộ Giáng sinh `0bd95a7`.
- Chỉ kiểm tra, không sửa ứng dụng/JS phát hành, không deploy.

## Kết luận

**Đạt các kịch bản nghiệp vụ được bổ sung trong phạm vi đã chạy: đổ ly có NL/BTP/FIFO, ghi lại sau lỗi một phần và báo hết còn dư. Chưa thấy hồi quy ứng dụng mới.** Phép so phần chuyển mã R của lượt trước vẫn giữ; diff lần này không đổi `posgieo.html`, `js/` hoặc `ban_deploy/`.

**Chưa đóng hoàn toàn F10-1:** các probe cũ đã được sửa, nhưng `not-in` có null trong mảng so sánh vẫn trả dữ liệu, sai cả tài liệu server và SDK 10.13.2. **Có thêm F10-2:** snapshot RT rỗng báo có dữ liệu. Đây là vấn đề công cụ kiểm thử, không phải bằng chứng lỗi kho ở ứng dụng. Không dùng việc 27 test mock xanh để kết luận mock đã đúng mọi phần được mô tả là hỗ trợ.

## Chạy lại

| Kiểm tra | Kết quả |
| --- | --- |
| `sh tools/sinh_lai_tat_ca.sh` | TẤT CẢ ĐẠT, 151 file test; file sinh không gây diff tracked |
| `tests/tach_posgieo_fb_gia.test.js` | 27 assertion đạt; còn thiếu các ca F10-1/F10-2 dưới đây |
| `e2e_kho.js` | 405 assertion đạt, 15 kịch bản × GG01/GG02 và 5 tự kiểm, ALL PASS |
| `e2e_ban.js` | 36 assertion đạt, ALL PASS |
| `e2e_hook.js` | 13 assertion đạt, đủ 25 hàm bọc và tự kiểm, ALL PASS |
| `e2e_0d.js` | 36 đạt, 1 thất bại vì file:// bị môi trường chặn; không báo toàn bài PASS |
| Runner cài thêm lỗi FIFO/idempotency | 83 assertion, ALL PASS; cả hai lỗi đều bị phát hiện |
| Kiểm log thô 3 kịch bản mới × 2 quán | 6/6 đạt |

Các bài BTP/FIFO/nhận hàng/Engine 2/Gấu Noel đã chạy ở lượt 10 trước. Lần kiểm lại này tập trung đúng mock dùng chung và các bài được phản hồi yêu cầu; không trình bày kết quả các bài cũ thành lần chạy mới.

## Phần sửa đã xác nhận

- Các tài liệu thiếu trường không còn lọt qua probe `!=`/`not-in` gốc (fixture không có null); so map sâu và `in` theo giá trị hoạt động với dữ liệu thử; query RT lọc được khi mồi ở node cha.
- Bài test mới chạy với mock cũ tại `626fd838` thất bại 11 assertion, gồm 8 assertion về bộ lọc và 3 về ảnh đầu/cây RT. Điều này xác nhận test bắt các sửa đổi, nhưng không xác nhận mọi kỳ vọng trong test là đúng Firebase.
- Kiểm riêng RT có cả node cha và con: node cụ thể thắng; transaction ở cha thấy đủ mã, ghi xong không mất mã khác; xoá một mã giữ mã còn lại.
- `onSnapshot` gửi một ảnh đầu có lọc khi bật `__SNAP`, mặc định im lặng như mô tả. Huỷ đăng ký trước ảnh đầu không gọi callback. Chưa mô phỏng listener cập nhật liên tục.
- Sửa RT làm bài `baoHet` tính lại tồn và ghi thêm inventory là hệ quả có giải thích, không phải app đổi đường ghi. Tập bảng của bài này đã cập nhật; baseline và bản mới vẫn được so cùng mock.

## Độ phủ đổ ly, ghi lại và báo hết còn dư

Đã đọc phần mồi và đường gọi: bài đổ ly dùng `openWasteScreen`, form thật, công thức thật và các loader thật qua snapshot Firebase giả. Không gán đè hàm tính công thức hay loader. Nhập số ly/tick checkbox bằng thay giá trị và phát event; gọi hàm submit thật, không kiểm thao tác chạm trên APK.

Các assertion chính kiểm hai quán:

- Đổ hai ly: sữa −50 ml và trà −20 g, mỗi NL đúng một dòng WASTE; BTP đúng một dòng WASTE 60 g; chung một `wasteEventId`.
- FIFO sữa đúng `ctn_d1`, lượng 50; RT sữa từ 800 còn 750, BTP từ 1000 còn 940; lô b3 có `qtyRemaining: 940`.
- Ghi lại sau lỗi dòng trà: có pending và cảnh báo phần lỗi; kết quả cuối vẫn chỉ trừ sữa/BTP một lần, pending được dọn.
- Báo hết còn dư: tấm xác nhận thật hiện 300 ml; sau xác nhận, tem finished với `wasteBase: 300`, đúng một dòng WASTE sữa −300 và gỡ mã đang mở.
- Bộ kiểm phạm vi độc lập theo REG vẫn áp cho cả baseline và bản mới; mỗi kịch bản chèn ghi sang quán khác để tự kiểm. Đây vẫn là chạy GG01/GG02 riêng, chưa phải backend hai quán đồng thời.

Đã kiểm lại độc lập sáu snapshot log thô của ba kịch bản/hai quán: lượng ghi sổ, event chung, số dòng thành công, tồn RT cuối và pending đều khớp. Kiểm riêng phép chuẩn hoá mới: mã lồng được chuẩn hoá; lượng 50/51 vẫn phân biệt và giờ trong ghi chú không bị xoá.

### Cài lỗi độc lập để kiểm chính bài mới

Tạo runner tạm từ runner chính, chỉ thêm các mutation trên bản sao bộ deploy:

1. **Bỏ FIFO nhưng vẫn ghi sổ WASTE:** thay lời gọi `UnitEngine.consume.allocate` ở đổ ly bằng kết quả rỗng. Bài `doLy` phát hiện lệch `ghi`; bản lỗi không có transaction trừ mã sữa.
2. **Bỏ chốt idempotency trước phân bổ tem:** bỏ `if (ledgerDoc.exists) return` ở đổ ly. Khi ghi lại, sữa bị trừ RT hai lần: 800 → 750 → 700. Bài `doLyGhiLai` phát hiện lệch `ghi`.

Cả hai lỗi đều bị phát hiện. Cộng tự kiểm lượng trừ có sẵn, runner tester đạt 83 assertion, ALL PASS. Kết quả này xác nhận bài mới kiểm được phân bổ tem và ghi lại, không chỉ nhìn toast hoặc lượng ghi sổ. Không sửa nguồn release để cài lỗi.

## F10-1 còn lại — not-in chứa null

Mức: **vừa, công cụ**. Vị trí: `tools/tach_posgieo/fb_gia.js:40–42`; `tests/tach_posgieo_fb_gia.test.js:20–21`.

Với mồi:

```js
window.__SEED = {
  'f/a': { n: 1 }, 'f/b': { n: 2 },
  'f/missing': {}, 'f/nul': { n: null }
};
```

| Truy vấn | Mock d34dde8a | Theo tài liệu API server hiện hành |
| --- | --- | --- |
| `where('n', '!=', 1)` | b, nul | b |
| `where('n', 'not-in', [1])` | b, nul | b |
| `where('n', 'not-in', [1, null])` | b | rỗng |

**Ca chắc chắn sai là hàng cuối:** `not-in [1, null]` phải rỗng. Bộ 27 test chưa có ca này. Cần thêm assertion và sửa mock hoặc báo lỗi rõ nếu không hỗ trợ null trong toán tử này.

Đối chiếu [hướng dẫn truy vấn chính thức của Firebase](https://firebase.google.com/docs/firestore/query-data/queries#not-in): `not-in` chứa null không khớp tài liệu nào. Đã đối chiếu thêm **đúng SDK 10.13.2 mà app đang nạp**: [NotInFilter.matches](https://github.com/firebase/firebase-js-sdk/blob/firebase%4010.13.2/packages/firestore/src/core/filter.ts#L491) cũng trả false ngay khi mảng so sánh có null. Đây không phải kết luận chỉ dựa vào SDK mới nhất.

Về hai hàng đầu: tài liệu server hiện hành loại field null, trong khi bộ lọc client/cache của SDK 10.13.2 vẫn cho phép null khác giá trị không-null; SDK main hiện nay đã loại null. Hai assertion dòng 20–21 đang ghim `['b', 'nul']`, phù hợp hành vi bộ lọc client cũ nhưng chưa đủ chứng minh hành vi server mà mock `__SNAP` gắn `fromCache:false`. Cần ghi rõ mock đang mô phỏng lớp nào và chọn kỳ vọng có đối chứng; không dùng riêng khác biệt phiên bản này làm bằng chứng app hỏng. Báo cáo không khẳng định đã thử server production cho hai truy vấn đó.

Điểm sửa thiếu trường/map/RT có kết quả đúng trong probe gốc; phần null này là lý do chưa đóng hết F10-1. Không thấy các fixture nghiệp vụ hiện tại phụ thuộc truy vấn bất đẳng thức với null, nên không quy các kết quả kho đã đạt thành thất bại ứng dụng.

## F10-2 — RT rỗng báo exists true

Mức: **vừa, công cụ**. Vị trí: `tools/tach_posgieo/fb_gia.js:20–29, 57–59`.

Hai probe đều tái hiện:

1. Mồi `r/k = {u1:{st:'x'}, u2:{st:'y'}}`; query `orderByChild('st').equalTo('absent')` không có con khớp.
2. Cùng mồi, lần lượt `remove()` cả u1 và u2, rồi đọc lại `r/k`.

Cả hai cho `[val(), exists(), hasChildren()] = [{}, true, false]`. Kỳ vọng là `[null, false, false]`. Mock giữ object rỗng và chỉ kiểm `v != null`; caller kiểm `exists()` hoặc `val()` truthy có thể đi nhầm nhánh.

Đối chiếu [API DataSnapshot chính thức](https://firebase.google.com/docs/reference/js/database.datasnapshot): snapshot không có dữ liệu trả null và exists false. Đề nghị chuẩn hoá cây/snapshot rỗng, dọn tổ tiên rỗng sau xoá, thêm cả test query không khớp và xoá mã cuối. Chưa chứng minh lỗi này làm các fixture đang chạy sai; cần tránh dựa vào mock hiện tại để nghiệm thu nhánh RT rỗng.

## Giới hạn còn giữ

- Cân BTP có vật đựng/trừ bì, bao bì/topping của đổ ly, pending sau reload/đổi quán chưa có bài browser mới. Phản hồi đã ghi đúng các giới hạn này.
- Các nhánh FIFO chưa hết, mở bao thứ hai/lý do, mất tem/cấp lại mã, kiểm kê có quét/kiểm tra lại vẫn chưa được so đầy đủ.
- `orderBy`/`limit` vẫn bỏ qua, increment xấp xỉ, chưa concurrency/transaction retry thật; `onSnapshot` chỉ một ảnh đầu.
- Chưa APK, máy quét/máy in hoặc Firebase production. `file://` tiếp tục là phép thử môi trường không đạt, không ghi toàn bài khởi động PASS.

## Bằng chứng

Worktree: `/workspace/work/retest10`, SHA đầu báo cáo. Sau sinh lại tracked source sạch; chỉ runner tester tạm untracked.

Logs trong `/workspace/work/`: `retest10-suite.log`, `retest10-mock.log`, `retest10-kho.log`, `retest10-0d.log`, `retest10-sale.log`, `retest10-hook.log`, `retest10-old-mock.log`, `retest10-independent-mock.log`, `retest10-null-probe.log`, `retest10-rt-empty.log`, `retest10-rt-extra.log`, `retest10-negative-e2e.log`, `retest10-dump-check.log`, `retest10-normalization.log`, `retest10-file-url.log`. Snapshot hai bản của runner chính: `retest10-dump/`; snapshot bản cài lỗi: `retest10-negative-*.json`.

Không thay đổi hay kết luận lại toàn bộ ứng dụng chỉ từ việc test công cụ đạt; không thực hiện bước tách tiếp theo.
