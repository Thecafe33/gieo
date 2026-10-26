# Kết quả kiểm tra độc lập lượt 10 — Kho, vòng đời mã và kiểm kê

- Ngày kiểm: 26/10/2026, giờ Việt Nam.
- Nhánh: `Phan-tach-unit-engine`.
- Commit kiểm: `626fd8380095cbbe614180a898222a72ef524ce9`; đối chứng chuyển mã: commit cha `300974cb`.
- Đã đọc `KIEM_TRA_10_KHO.md`, diff nguồn/công cụ và đối chiếu kết quả lượt 09.
- Baseline browser: bộ Giáng sinh `0bd95a7`; bản mới: bộ Giáng sinh của commit kiểm.
- Chỉ kiểm tra và ghi báo cáo, không sửa ứng dụng/JS phát hành, không deploy.

## Kết luận

**Đạt phần chuyển mã R và 12 kịch bản kho được công bố trong phạm vi phần mềm. Không phát hiện hồi quy ứng dụng mới cần chặn phần chuyển mã này.** Kiểm thêm độc lập đổ ly theo công thức và ghi lại sau lỗi một phần cũng đạt trên GG01/GG02.

**Có F10-1 ở công cụ Firebase giả:** một số phép lọc được mô tả là hỗ trợ vẫn khác Firebase thật. Cần sửa hoặc chặn rõ phần chưa hỗ trợ trước khi dùng các truy vấn đó để nghiệm thu. Điều này giới hạn bằng chứng kiểm thử; không phải bằng chứng app đang ghi sai kho. Không kết luận toàn bộ nghiệp vụ 2C hoặc backend nhiều quán đồng thời đã được nghiệm thu.

## Kết quả chạy

| Kiểm tra | Kết quả |
| --- | --- |
| `sh tools/sinh_lai_tat_ca.sh` | TẤT CẢ ĐẠT; 151 file test; sinh lại không gây diff tracked |
| `tests/tach_posgieo_fb_gia.test.js` | 12/12 assertion đạt; không phủ các sai lệch F10-1 bên dưới |
| Đối chiếu AST từng khai báo với main trước tách | 205/205 nguyên văn: 81 stockUnits, 85 kho, 39 count |
| Ranh giới / đường dẫn | Sạch; 109 tên, 875 lời gọi, 54 động đã duyệt |
| Audit xuyên app | 0 trường hợp lỗi, 9 kiểm tra đạt |
| `e2e_kho.js` | 298 assertion, 12 kịch bản × GG01/GG02 và 4 tự kiểm, ALL PASS |
| `e2e_ban.js` | 36 assertion, ALL PASS |
| `e2e_hook.js` | 13 assertion, đủ 25 hàm bọc và tự kiểm, ALL PASS |
| `e2e_0d.js` | 36 đạt; 1 thất bại ở `file://` như môi trường các lượt trước; không báo toàn bài PASS |
| BTP âm | ALL PASS, PC/mobile |
| FIFO | 28/28 |
| Nhận hàng | 80/80 |
| Engine 2 | Đạt ở 1366px/390px |
| Gấu Noel | 71/72; lỗi kiosk K3 như nền, Gieo G1–G14 đạt |
| Cú pháp 3 JS mới / bản sao 3 bộ mùa | Đạt; từng file giống byte với nguồn |
| Đổ ly và ghi lại sau lỗi, runner độc lập dùng giờ cố định | 49 assertion, ALL PASS, gồm tự cài lỗi lượng trừ |

Gấu Noel dùng runner tạm HTTP và `/usr/bin/chromium` thay đường browser/file hardcode không dùng được trong môi trường; giữ nguyên assertion. Các bài BTP/FIFO/nhận hàng/Engine 2 có fixture và mức tích hợp riêng, không đồng nghĩa đã chạy mọi thao tác 2C từ UI thật.

## 205 khai báo và bootstrap

- So từng statement AST của ba file với script chính ở commit cha: nội dung giữ nguyên. Không còn các khai báo đó trong main.
- Mỗi file chỉ có hai expression ở cấp ngoài cùng để đặt marker `'dang'` / `true`; phần còn lại là khai báo. Không phát hiện lệnh tự chạy nghiệp vụ bị chuyển ra trước bootstrap.
- Các initializer là literal/array/object; `stockCountState` và `missingLabelState` tạo Set rỗng. Không đọc Firebase, DOM hay localStorage khi khởi tạo.
- Ba phép đọc/ghi/xoá `dwPending_pos` nằm trong `_submitDrinkWasteImpl`, sau khi người dùng thao tác. Key vẫn thuộc `POS_LS_THEO_QUAN`, được dọn khi máy đổi quán; không thấy hồi quy khởi tạo sớm như máy in lượt 05.
- `KHO_ITEMS_CACHE` vẫn là binding chung, `UnitEngine.init` lấy qua `getItems: () => KHO_ITEMS_CACHE`. Đổi vị trí khai báo không tạo bản sao cache cho Engine.
- Ba script dùng đường tương đối `js/posgieo/…`, nạp trước main, có thẻ retry riêng và được đăng ký thiết yếu. E2E kiểm thiếu/chạy dở từng file: chốt dừng hoạt động, không chạy tiếp nghiệp vụ nửa chừng.

## Kiểm các bài đọc nguồn vẫn nhìn thấy file mới

Trong worktree âm cùng SHA, thêm một hàm không được gọi vào **mỗi** file mới, ghi một trường chưa phân loại lên `inventory_items_gieogieo`:

```js
function testerUnknownField0() {
  fstore.collection('inventory_items_gieogieo').doc('probe')
    .update({ tester_unknown_0: 1 });
}
```

Tên hàm/trường lần lượt mang số 0/1/2. `da_cua_hang_b2.test.js` thất bại đúng assertion phân loại trường, chỉ rõ cả ba vị trí: stock_units:1417, kho:1332, count:1073. Bản âm không thuộc release; không dùng kết quả âm để báo test app hỏng. Lần đầu chạy bản âm thiếu `acorn`; lần có bằng chứng hợp lệ dùng `NODE_PATH=/workspace/work/review10/node_modules` và bắt đúng ba trường cài vào.

## Ba kịch bản 2C và kiểm log thô

Ngoài assertion runner gốc, lưu snapshot baseline/bản mới từ runner tạm và kiểm riêng cho cả hai quán:

- **Mở mã:** `ctn_m1` sang open, ghi đúng nhân viên; hạn dùng trừ ngày mở đúng 24 giờ; RT có `SUA00001`, `unitBase: 1000`.
- **Báo hết:** `ctn_m2` sang finished, `finishScanned: true`, `wasteBase: 0`; có transaction xoá node RT. Đây là báo hết mã có số dư 0, chưa kiểm hao hụt phần dư dương.
- **Kiểm kê:** phiếu pending_review, đúng một dòng Trà lài: hệ thống 1000, đếm 900, chênh −100. Không chỉ kiểm chuỗi `countedBase` xuất hiện đâu đó trong JSON.
- Phạm vi quán được kiểm trên log baseline và bản mới bởi `pham_vi.js` độc lập theo REG. Tự chèn ghi sang quán khác vẫn bị bắt. Không suy từ hai lần chạy riêng thành kiểm hai quán đồng thời trên backend chung.

Tự kiểm sửa trạng thái phiếu đã ghim đúng chỗ ghi `countedBy: staff, status: 'pending_review'` và phát hiện lệch `ghi`.

## Bổ sung độc lập: đổ ly và ghi lại sau lỗi một phần

Runner tạm nạp cả trang và các module, so trước/sau trên GG01/GG02. Mồi menu một món size M, công thức mỗi ly dùng 25 ml sữa + 10 g trà; đổ 2 ly, chọn chưa rót vào ly, không topping. Chỉ thay loader công thức/danh mục và cổng ca/PIN đồng nhất giữa hai bản; giữ hàm tính công thức, `submitDrinkWaste`, lớp đường dẫn và Engine thật.

- Bình thường: đúng hai dòng WASTE, sữa −50 và trà −20; chung `wasteEventId`, hai mã giao dịch khác nhau; dọn pending và về màn Kho.
- Cài lỗi lần ghi sổ đầu tiên: pending được lưu; bấm ghi lại hoàn tất, không ghi lặp dòng đã thành công; tổng log vẫn chỉ có hai dòng WASTE thành công đúng lượng; pending được xoá.
- Kiểm phạm vi quán và so toàn bộ lượt ghi/toast/state/lỗi với baseline đều đạt.
- Cài lỗi trên bản sao `pos_kho.v1.js`: đổi `qty: -qtyUsed` thành `qty: -(qtyUsed + 1)`; bài phát hiện lệch mục `ghi`.

Lần đầu runner mở rộng dùng giờ thật tạo lệch giả ở mã alert chứa `dw_<ms>_<ngẫu nhiên>` lồng trong ID: regex chuẩn hoá hiện tại không bắt chuỗi này sau dấu gạch dưới. Chạy lại với `gioCo: 1793000000000` của harness, giữ nguyên nội dung/đường dẫn ghi, kết quả ALL PASS. Log lần đầu vẫn giữ; không coi lệch timestamp này là hồi quy app.

Fixture trên kiểm công thức và idempotency ghi sổ; không chứng minh đường FIFO có số dư dương, hỗn hợp NL/BTP, bao bì/topping hoặc reload sau lỗi. Nên đưa kịch bản hữu ích này vào runner chính thức và mở rộng các phần đó thay vì chỉ giữ bằng chứng tạm của tester.

## F10-1 — Bộ lọc Firebase giả còn trả kết quả sai

Mức: **vừa, lỗi công cụ kiểm thử**. Vị trí: `tools/tach_posgieo/fb_gia.js:18–19, 30–35`.

Probe trong Node VM với chính `FB_STUB`, không sửa mock:

```js
window.__SEED = {
  'c/a': { n: 1, obj: { v: 1 } },
  'c/b': { n: 2, obj: { v: 2 } },
  'c/missing': {},
  'r/k': { u1: { st: 'x' }, u2: { st: 'y' } }
};
```

| Truy vấn | Kết quả mock | Kết quả đúng |
| --- | --- | --- |
| `c.where('n', '!=', 1)` | b, missing | b; tài liệu thiếu trường bị loại |
| `c.where('n', 'not-in', [1])` | b, missing | b; tài liệu thiếu trường bị loại |
| `c.where('obj', '==', {v:1})` | rỗng | a; so map theo giá trị |
| `db.ref('r/k').orderByChild('st').equalTo('y')` | u1, u2 | u2 |

Nguyên nhân: dùng toán tử/identity JavaScript và `indexOf` trực tiếp; khi mồi có đúng node cha, `get()` lấy `S[p]` rồi bỏ qua bộ lọc đã áp cho danh sách đường con. Cách mồi node cha này cũng có thể xuất hiện sau ghi transaction, không chỉ do fixture viết tay.

Hai bản cùng dùng mock nên có thể cùng nhận dữ liệu thừa hoặc cùng bỏ sót dữ liệu, rồi so trước/sau vẫn PASS. Đây là câu trả lời cụ thể cho câu hỏi 2; `===` phù hợp với trường string/number của các ca hiện tại nhưng không đủ mô phỏng equality Firebase trên mọi giá trị.

Đề nghị sửa nhỏ ở công cụ: kiểm trường tồn tại cho truy vấn bất đẳng thức; hỗ trợ so giá trị cấu trúc hoặc báo lỗi rõ khi gặp kiểu chưa hỗ trợ; áp RT filter cho cả hai kiểu mồi. Thêm test âm cho từng ví dụ và giữ tự cài lỗi. Không cần biến mock thành Firebase hoàn chỉnh, nhưng phần tuyên bố hỗ trợ phải đúng hoặc từ chối rõ, tránh lặng lẽ PASS. Bình luận dòng 29 về việc mọi bộ lọc bị bỏ qua cũng đã lỗi thời.

Các probe này chưa chứng minh 12 fixture hiện tại sai: đường status/code/itemId/referenceId đang dùng chủ yếu equality giá trị nguyên thuỷ, và đã kiểm các kết quả nghiệp vụ riêng. Vì vậy giữ kết luận chuyển mã đạt, đồng thời không phê duyệt tuyên bố bộ lọc đã đúng tổng quát.

## Phản biện độ phủ trước khi kết luận đầy đủ 2C

Ưu tiên trước khi đánh dấu **nghiệm thu nghiệp vụ 2C đầy đủ**:

1. Giữ bài đổ ly chính thức: đường bình thường và lỗi một phần/ghi lại; mở rộng tới FIFO có lượng thật, NL + BTP, bao bì/topping và pending sau reload/đổi quán. Tester đã kiểm phần hai NL và ghi lại tại đây.
2. Có ít nhất một đường hao hụt số dư dương: báo hết còn dư hoặc huỷ nguyên liệu qua quét, kiểm lượng WASTE và tồn/tem/RT sau thao tác. `baoHet` hiện tại còn 0 không kiểm đường ghi lượng hao hụt này.
3. Một ca cân BTP có vật đựng/trừ bì qua UI, kiểm net và lượng ghi; helper cân vừa chuyển file cũng được nhánh chế biến dùng chung.

Các nhánh FIFO «chưa hết», mở bao thứ hai/lý do, báo mất tem, cấp lại mã, kiểm kê có quét/kiểm tra lại vẫn cần ghi rõ chưa so. Những ca này nên có kế hoạch bổ sung theo luồng thực tế; 205 khai báo nguyên văn và suite xanh không chứng minh đã thao tác hết chúng.

## Bằng chứng và giới hạn

Worktree: `/workspace/work/review10`; bản âm: `/workspace/work/review10-negative`, cùng SHA đầu báo cáo. Tracked source sạch sau sinh lại; chỉ ba runner tester tạm untracked. Không đổi nguồn phát hành để cài lỗi.

Logs trong `/workspace/work/`: `review10-suite.log`, `review10-ast.log`, `review10-assets.log`, `review10-kho.log`, `review10-0d.log`, `review10-sale.log`, `review10-hook.log`, `review10-btp.log`, `review10-fifo.log`, `review10-receiving.log`, `review10-e2.log`, `review10-gau.log`, `review10-boundaries.log`, `review10-paths.log`, `review10-cross.log`, `review10-extra.log`, `review10-extra-clock.log`, `review10-observe-check.log`, `review10-mock-probes.log`, `review10-negative-fields-ready.log`. Snapshot thô mang tiền tố `review10-observe-` / `review10-clock-observe-`.

Chưa APK, máy quét/máy in thật, Firebase production, backend hai quán chạy đồng thời. Mock còn bỏ qua orderBy/limit, chưa đủ concurrency và increment. Báo cáo không tự phê duyệt deploy và không thực hiện bước tách tiếp theo.
