# Kết quả kiểm tra độc lập lượt 15 + 16

- Ngày: 27/10/2026, giờ Việt Nam; nhánh `Phan-tach-unit-engine`.
- Lượt 15: commit `23357b0dd` (cha `b44b20501`), danh mục món/Food/topping.
- Lượt 16: commit `8a3487f20` (cha `23357b0dd`), báo cáo và nghiệp vụ sau bán.
- Worktree chính `/workspace/work/review15-16` tại `c7687d4e85591add998c35b7d529bcdcf1dd22ed`. Commit này chỉ thêm báo cáo kiểm lại 14; runtime giống hệt `8a3487f20`. AST so riêng từng commit với cha; E2E chung chạy trạng thái sau lượt 16, so bộ Giáng sinh đã deploy `0bd95a7`.
- Đọc cả `KIEM_TRA_15_DANH_MUC.md`, `KIEM_TRA_16_SAU_BAN.md`. Không sửa app/JS phát hành, không deploy, không ghi sổ phát hành. Probe và lỗi cài chỉ ở file/bộ deploy tạm.

## 1. Kết luận

**ĐẠT việc chuyển mã nguyên văn của cả lượt 15 và 16 trong phạm vi đã kiểm.** 151 file test đạt; E2E kho/nghiệp vụ đạt 1.135 khẳng định, 43 kịch bản × 2 quán và 19 tự kiểm. Chưa thấy hồi quy ứng dụng do tách file. Đây không phải nghiệm thu mọi nhánh lỗi hoặc toàn bộ nghiệp vụ production.

Có **hai finding công cụ** cần xử lý trước khi coi các nhánh lỗi/xung đột đã được nghiệm thu đầy đủ: **F15-1** (log lỗi RTDB ghi sai loại nguồn) và **F16-1** (mock transaction hủy trả sai kết quả). Không phải lỗi mới của app do chuyển file. Không gộp các probe FAIL có chủ đích này vào kết luận ALL PASS của bộ kiểm hiện có.

## 2. Đối chiếu chuyển mã

| Lượt | Module | Tên khai báo nguyên văn |
| --- | --- | ---: |
| 15 | `pos_catalog_admin.v1.js` | 32/32 |
| 16 | `pos_reports.v1.js` | 16/16 |
| 16 | `pos_orders.v1.js` | 50/50 |

Tổng **98/98**. Không còn khai báo trùng trong main. Với từng commit, các khai báo còn lại chỉ đổi `POS_MODS_THIET_YEU`; chuỗi lệnh cấp cao không phải khai báo giữ nguyên văn và thứ tự. Các biến mới có giá trị đầu literal/null/Set rỗng; không đọc cache máy/Firebase/DOM lúc nạp.

Ba module thiết yếu có retry chỉ khi dấu chưa tồn tại, không retry file đã chạy dở. Probe GG02, mỗi module đủ file/404/throw sau `dang`: **9/9 PASS**. Đủ file có đúng một timer hạn dùng; thiếu/chạy dở hiện màn đỏ trước nghiệp vụ, không timer và không lỗi khai báo lexical lần hai.

`_curMenuTab`, `_tpEditId`, `addFoodToCart`, cụm tách ly/topping trong giỏ và listener click `hideTypeDropdown()` vẫn ở main như thiết kế. `todayKey`, `_backfillMode`, `_backfillPendingDate` chỉ còn một binding trong module mới; các phần còn lại gọi/đọc chúng sau khi đủ module.

## 3. Kết quả bài yêu cầu

Sinh xong deploy trước E2E; Chromium `/usr/bin/chromium`; Firebase/CDN giả trong trình duyệt, HTTP cục bộ. Bộ E2E chung bao gồm cả 3 ca mới lượt 15 và 3 ca mới lượt 16; không nhận là đã chạy riêng toàn bộ suite tại commit 15.

| Bài | Kết quả |
| --- | --- |
| `sh tools/sinh_lai_tat_ca.sh` | TẤT CẢ ĐẠT, 151 file test; sinh lại không có diff tracked |
| `node tools/check_boundaries.js` | RANH GIỚI SẠCH |
| `node tools/check_paths.js` | ĐƯỜNG DẪN SẠCH: 109 tên, 875 lời gọi, 54 động |
| `node tools/tach_posgieo/e2e_kho.js` | 1.135 khẳng định ALL PASS, exit 0; 43 kịch bản × GG01/GG02, 19 tự kiểm |
| `node tools/tach_posgieo/e2e_ban.js` | 36 khẳng định, ALL PASS |
| `node tools/tach_posgieo/e2e_hook.js` | 13 khẳng định, ALL PASS; 25 chuỗi bọc khớp, lỗi cài bị bắt |
| `node tools/tach_posgieo/e2e_0d.js` | 53 PASS, 1 FAIL file:// do môi trường; không ALL PASS |
| `node tools/gau_noel/e2e_gau.js` | Không khởi chạy được: hardcode `/opt/pw-browsers/chromium` không tồn tại |
| Bản sao Gấu Noel chỉ đổi Chromium + file:// sang HTTP | 71/72 ở cả sau và trước lượt 16; cùng lỗi kiosk null.style, các ca POS đạt |

Đọc lại 86 dump JSON của E2E chung: các mục `ghi`, `toasts`, `sau`, `loiKB`, `loi` không lệch giữa mốc và bản tách.

Bản Gấu Noel HTTP giữ nguyên assertions, dùng cùng nguồn ở trạng thái sau lượt 16 và worktree riêng `23357b0dd` trước lượt 16. Giới hạn kiosk và file:// được tách khỏi kết luận về POS. Probe goto trực tiếp tại worktree kiểm cũng trả `net::ERR_BLOCKED_BY_ADMINISTRATOR`; không nghiệm thu chế độ file://.

## 4. Đa cửa hàng: phân biệt danh mục chung với dữ liệu nghiệp vụ riêng

Đọc REG độc lập từ đúng `data_access.v9.js` mà HTML nạp:

- RT `menu_togo_gieogieo`, `food_gieogieo`, `toppings_gieogieo` là **G — dùng chung**, không có hậu tố cửa hàng. Sửa danh mục từ GG02 vẫn đổi danh mục chung như trước; không được mô tả là mỗi quán có menu độc lập.
- RT đơn hàng và dữ liệu kho liên quan là **S/C** theo REG: GG01 dùng tên gốc, GG02 có `__gg02`; các ca mua thêm/hoàn/xóa kiểm đúng phạm vi này.
- Các dòng cố ý chèn sang quán khác bị bộ kiểm REG bắt. Đây là bằng chứng trên fixture, không phải chạy đồng thời hai cửa hàng production.

## 5. Probe bổ sung

### 5.1 Lưu danh mục lỗi → giữ form → thử lại → màn bán cập nhật

Mở thêm món To Go bằng form thật; cài đúng một lỗi `set` tại đường RT `/push` rồi lưu. Kiểm form còn và RAM chưa thêm món; thử lại thành công; kiểm `#mg` có tên món mới, rồi tiếp tục sửa/xóa như ca gốc. Ở cả hai quán, hành vi/log/toast/trạng thái khớp mốc.

- Với mock nguyên bản: **4 FAIL ở bộ kiểm phạm vi**, do F15-1 bên dưới; không phải thao tác app thất bại khác mốc.
- Bản sao tester chỉ sửa metadata `rt=true` của đúng log `set!hong` vừa cài vào đường RT (không sửa app, không bỏ log): **31 khẳng định ALL PASS**, gồm tự kiểm giá L sai +1 bị bắt.

### 5.2 Mua thêm thật → trừ kho → xóa bill → hoàn lượng đã trừ

Dùng fixture `muaThem`: BTP lô b3 1.000 g, thêm một phần topping 30 g. Chờ job tiêu hao xong, kiểm RT còn 970 g. Sau đó mở chi tiết bill, thực hiện xóa qua luồng thật; engine hoàn kho, bill được xóa.

- GG01/GG02: trước xóa 970 g, sau xóa **1.000 g**; đúng **một** dòng hoàn BTP +30; không còn bill trong RAM/RT; các lượt ghi khớp mốc.
- Tập bảng thực tế: active_units, order_stock_traces, orders, prep_batches, prep_items, prep_transactions, rev_marks, reversal_unit_claims; scope REG đúng quán.
- Cài lỗi vào bản sao `pos_orders`: thay chỗ `await UnitEngine.consume.reverseSales(o, delId)` bằng kết quả `{ok:true}` để bỏ hoàn kho. Bộ so sánh bắt lệch `sau`.
- **23 khẳng định ALL PASS** cho hai quán + lỗi cài. Ca này chỉ chứng minh hoàn phần topping thực sự đã trừ; bill gốc chưa có lượt tiêu hao nền, không suy rộng thành hoàn mọi loại NL hoặc mọi lịch sử đơn.

### 5.3 Xóa bill còn job bổ sung đang running

Mồi node bill có `consumeJobs.j1.status='running'`, `startedAt` là giờ hiện tại, rồi đi qua xóa bill thật. Dữ liệu bill phải giữ nguyên và phải báo đang trừ kho, chờ rồi xóa lại.

- Mock nguyên bản: **20 PASS / 2 FAIL**, cả GG01/GG02 sai thông báo mong đợi; hai bản đều báo đơn không còn vì mock trả snapshot undefined. Không xóa bill, nhưng không đi đúng nhánh busy cần kiểm.
- Chỉ thay mock trong runner tạm: callback transaction trả undefined → `committed:false`, snapshot là dữ liệu đầu vào hiện tại. Cùng hai ca: **22/22 PASS**, bản nền và bản tách đều xử lý đúng nhánh chờ. Không sửa runtime để làm test qua.

## 6. F15-1 — log lỗi RTDB bị đánh dấu thành Firestore

**Mức nhẹ, lỗi công cụ kiểm.** `tools/tach_posgieo/fb_gia.js`, helper `hong` ghi `{rt:false}` cố định. `mk(...,rt)` gọi helper khi `set/update/remove` RTDB bị cài lỗi mà không truyền loại nguồn. `pham_vi.js` phân loại theo `g.rt`, vì vậy lỗi ghi menu RT bị kiểm như collection Firestore chưa đăng ký.

Tái hiện tối thiểu (Node VM nạp `FB_STUB`, `window.__SEED_GHI=true`):

```js
w.__HONG = [{op:'set', re:'^menu_togo_gieogieo/push$', con:1}];
await w.firebase.database().ref('menu_togo_gieogieo/push').set({name:'probe'})
  .catch(() => {});
// __ghi có set!hong, p đúng nhưng rt:false; phải là rt:true.
```

Probe browser 5.1 cho thấy bộ kiểm phạm vi báo sai `bảng chưa đăng ký fs:menu_togo_gieogieo`, rồi assertion chèn một lỗi phạm vi cũng lệch số lỗi. Đề nghị truyền/ghi loại nguồn thực vào log cài lỗi, thêm test riêng RT và Firestore. Không sửa bằng cách bỏ qua mọi dòng `!hong` hoặc mọi bảng chưa biết: sẽ làm yếu kiểm phạm vi.

## 7. F16-1 — transaction RTDB abort trả committed=true và mất snapshot hiện tại

**Mức vừa, lỗi công cụ kiểm nhánh tranh chấp/hủy.** `fb_gia.js` phương thức `transaction` luôn trả `committed:true`, snapshot là giá trị callback trả về. Callback trả undefined thì không áp seed, nhưng vẫn báo đã commit và snapshot undefined.

Điều này khác SDK mà app dùng. Firebase JS SDK `firebase@10.13.2`, `packages/database/src/core/Repo.ts` quanh dòng 965–975: khi `newVal === undefined`, SDK gọi `onComplete(null, false, transaction.currentInputSnapshot)`.

Nguồn đối chiếu: https://github.com/firebase/firebase-js-sdk/blob/firebase%4010.13.2/packages/database/src/core/Repo.ts#L965

Tái hiện Node VM với seed tại `orders_gieogieo/oct/26/o1`:

```js
const r = await w.firebase.database()
  .ref('orders_gieogieo/oct/26/o1').transaction(() => undefined);
// Thực tế mock: r.committed === true, r.snapshot.val() === undefined.
// Mong đợi abort: committed === false, snapshot giữ dữ liệu đã đưa vào callback.
// Seed không đổi là chưa đủ để coi mô phỏng abort đúng.
```

Ảnh hưởng trực tiếp có bằng chứng ở probe 5.3: `delOrderConfirm` trả undefined khi job khác đang chạy. Mock khiến app đi nhánh «Đơn không còn» thay vì nhánh chờ job. Cả mốc và bản tách cùng dùng mock sai nên chỉ so bằng nhau không phát hiện được; cần oracle `committed`/snapshot và hành vi cụ thể.

Đề nghị sửa mock và thêm test: abort undefined giữ snapshot/seed, commit giá trị mới, commit null xóa node; sau đó chạy lại ca bill có job running. Chưa yêu cầu thay hành vi app. Cũng chưa chứng minh toàn bộ retries/concurrency RTDB chỉ bằng sửa ba trường kết quả này.

## 8. Trả lời phản biện và giới hạn

- Ranh giới lượt 15 hợp lý: thao tác danh mục ở `catalogAdmin`; thêm Food vào giỏ/tách ly để 4D. `fmtPriceInput/getPriceVal` là helper dùng chung với cài đặt; có thể dời sang nền ở một lượt R khác, không cần đổi lúc này.
- Giữ `catalogAdmin` thiết yếu là đúng với cách nối dây hiện tại: click listener và ô giá gọi trực tiếp. Chỉ dời `hideTypeDropdown` về main chưa loại bỏ mọi phụ thuộc. Không thay mô hình nạp trong lượt kiểm.
- Thứ tự 4A → 4B → 4C → 4D phù hợp yêu cầu để giỏ/thanh toán cuối cùng. Nghiệp vụ mua thêm/xóa ở 4B vẫn liên quan tiền/kho, cần các kiểm thứ tự ghi và idempotency như trên.
- Tách `reports` đọc/hiển thị và `orders` nghiệp vụ ghi là hợp lý. `todayKey` có thể ở nền về sau; hiện module thiết yếu nên các caller không bị thiếu hàm.
- `_backfillMode/_backfillPendingDate` không cần cùng file với `confirmPay` để giữ binding. Khởi tạo null, chưa thấy đọc trước khi module nạp. Luồng backfill xuyên thanh toán vẫn cần nghiệm thu khi làm 4D.
- Chưa phủ CK mua thêm, mọi xung đột/mất mạng, job pending/cancel/retry đầy đủ, hoàn nhiều loại NL, backfill, xếp hạng/canvas, màu/gợi ý danh mục, APK/máy in/két/Firebase thật.
- `push` mock vẫn dùng ID `/push` cố định; chỉ kiểm một lần thêm mỗi ca, không chứng minh nhiều lần thêm liên tiếp không đè nhau. Increment, query orderBy/limit, listener vẫn có giới hạn cũ.
- Không đổi luật catalog dùng chung hoặc luật tách dữ liệu từng quán để làm test qua. Toàn bộ chuỗi 8 bước kết ca vẫn chưa được chứng nhận bởi lượt này.

Log ở `/workspace/work/review15-16-*.log`, dump chuẩn `review15-16-dump/`, dump hoàn kho `review15-16-roundtrip-dump/`; probe trong `review15-16/tools/tach_posgieo/*.tester.js`. Chỉ báo cáo được đưa lên nhánh.
