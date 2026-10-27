# Kiểm tra độc lập lượt 18–19 và số đo Đợt 5

- Ngày 27/10/2026, giờ Việt Nam; nhánh `Phan-tach-unit-engine`.
- Fetch rồi tạo detached worktree `/workspace/work/review18-19`, chốt **`cf617c30c6d52de9d5e871d0c5215c238864f910`**.
- Lượt 18: `80d6d7f66`, cha `f564ce889`; lượt 19: `9937d3690`, cha `80d6d7f66`. Hai commit sau chỉ cập nhật tài liệu/công cụ đo tải, không đổi runtime.
- Đã đọc `KIEM_TRA_18_GIO.md`, `KIEM_TRA_19_THANH_TOAN.md`, `DOT_5_DO_TAI.md`, đối chiếu báo cáo 17 và phản hồi 15–16. Tại thời điểm chốt không có lượt 20 hoặc phản hồi mới chưa kiểm khác. F15-1/F16-1 vẫn đã đóng.
- Sinh đủ ba bộ deploy trước E2E. Chromium `/usr/bin/chromium`, HTTP cục bộ, Firebase/CDN giả. Không sửa app/JS phát hành, không deploy, không ghi sổ phát hành.

## 1. Kết luận

**ĐẠT phần chuyển mã nguyên văn của lượt 18–19 trong phạm vi đã kiểm:** 156/156 khai báo, 151 file test, **1.500 khẳng định E2E**, 56 kịch bản × 2 quán và 28 tự kiểm. Không thấy hồi quy do tách file trong các đường đã chạy.

**Chưa nghiệm thu toàn bộ bảo đảm chống chạy lặp/hậu thanh toán chỉ dựa vào suite gốc**, vì mock thiếu RTDB `Reference.key` (F19-1). Có thêm ba khẳng định nghiệp vụ lỏng (F19-2). Các probe sửa riêng mock ở runner tạm chứng minh thêm các đường cụ thể, không thay cho sửa bộ kiểm chính thức.

**Không công nhận phép đo “cache ấm” và cột dung lượng của Đợt 5**: routing Playwright làm tắt HTTP cache (F5-1), bộ đếm byte mất cập nhật khi await (F5-2). Số đo vẫn có giá trị tham khảo trong cấu hình giả lập đã chạy, không chứng minh mức tăng tốc trên APK hay Firebase Hosting.

Probe callback CK báo 1đ cho bill 85.000đ được POS chấp nhận ở cả mốc và bản tách (O19-1). Đây là hành vi có sẵn cần xác minh cùng hợp đồng webhook, không phải hồi quy do tách và không tự sửa nghiệp vụ trong lượt R này.

## 2. Chuyển mã và nối dây

| Lượt | Module | Đối chiếu AST nguyên văn với cha |
| --- | --- | --- |
| 18 | `pos_cart.v1.js` | **31/31** |
| 19 | `pos_thanh_toan.v1.js` | **125/125** |

**156/156** khai báo giữ nguyên văn, không còn trùng binding trong main. Với từng commit, các khai báo còn lại chỉ đổi `POS_MODS_THIET_YEU`; statement cấp cao không phải khai báo giữ nguyên nội dung và thứ tự.

Initializer của module mới không đọc trạng thái máy/Firebase/DOM; `spSelected = new Set()` tạo Set rỗng. Các listener và chuỗi bọc vẫn ở main, được lắp sau khi module khai báo đủ. Probe GG02 đủ file/404/throw sau `dang` cho cả hai module: **6/6 PASS**; đủ file có một timer hạn dùng, lỗi tải chặn nghiệp vụ, không timer hay lỗi khai báo lexical lần hai.

Lưu ý tài liệu 19: `_bankConfirmMeta` thực tế nằm trong module mới, không ở lại main như dòng liệt kê state; việc chuyển vẫn nguyên văn và không gây đọc sớm trong các ca đã kiểm.

Hai sửa mỏ neo test hợp lý, không bỏ assertion:

- `ck_tc33` đọc `CAKE_ACCOUNT_NO` từ `maNoi('posgieo.html')` để thấy cả JS tách, vẫn so với tài khoản TC33.
- `da_cua_hang_b1` chèn collection giả trước `POS_MODS_THIET_YEU`, vẫn nằm trong nguồn và vẫn yêu cầu `check_paths` bắt collection chưa đăng ký.

`khongGiuGio` chỉ bật ở `muaThem` và năm ca thanh toán: chuẩn hóa trường thời gian theo tên; tiền, qty, trạng thái, đường bảng và ngày nghiệp vụ không bị xóa. Chấp nhận cho phép so hành vi ở đây, nhưng không dùng các ca đó để chứng minh chính xác timestamp/TTL.

## 3. Bài yêu cầu

| Bài | Kết quả |
| --- | --- |
| `sh tools/sinh_lai_tat_ca.sh` | TẤT CẢ ĐẠT, 151 file test, không diff tracked sau sinh |
| `node tools/check_boundaries.js` | RANH GIỚI SẠCH |
| `node tools/check_paths.js` | 109 tên, 875 lời gọi, 54 động; SẠCH |
| `e2e_kho.js --chi gioHang,gioChanSom,ttTienMat,ttChuyenKhoan,ttChuyenKhoanTay,ttTinhRieng,ttGiamGia` | **206 khẳng định ALL PASS**, 7 ca × 2 quán + 6 tự kiểm |
| `node tools/tach_posgieo/e2e_kho.js` | **1.500 khẳng định ALL PASS**, exit 0; 56 ca × 2 quán, 28 tự kiểm |
| `node tools/tach_posgieo/e2e_ban.js` | 36 khẳng định, ALL PASS |
| `node tools/tach_posgieo/e2e_hook.js` | 13 khẳng định, ALL PASS, 25 chuỗi bọc và lỗi cài được kiểm |
| `node tools/tach_posgieo/e2e_0d.js` | **59 PASS, 1 FAIL file://**; không ALL PASS |

Đọc lại đủ **112 dump JSON** (56 ca × 2 quán): `ghi`, `toasts`, `sau`, `loiKB`, `loi` khớp giữa mốc và bản tách. Cả hai phía dùng cùng mock chính thức; các finding dưới đây nêu giới hạn của bằng chứng này.

Thử goto trực tiếp `file:///workspace/work/review18-19/posgieo.html` trả `net::ERR_BLOCKED_BY_ADMINISTRATOR`; không nghiệm thu chế độ này. Không chạy lại các bài Gấu Noel ngoài yêu cầu lượt 18–19; giới hạn kiosk đã ghi ở báo cáo trước vẫn giữ nguyên.

## 4. Probe độc lập

Các ca dưới chạy hai quán, so mốc `0bd95a7` với bản tách; kiểm log/trạng thái/toast/lỗi và phạm vi REG. Mock tạm có `.key` được ghi rõ, không sửa `fb_gia.js` hay app trong repo.

### 4.1 Bấm hai lần, retry và callback lặp

- **Bấm hai lần:** giữ Promise của `_finalizeStampFreeAfterPay`, gọi `confirmPay` lần hai khi lần đầu đang chờ. Kiểm `_posSubmitBusy=true`, promise ngoài chưa hoàn tất, chỉ một bill và một lần hậu thanh toán. Release xong: giỏ rỗng, busy=false.
- **Lỗi lưu trước commit:** cài một lỗi RT `set` đơn hàng, kiểm giỏ/idemKey còn và busy được nhả. Retry dùng đúng key đó, chỉ một lần set bill thành công, giỏ rỗng/busy=false.
- **Callback CK lặp:** gọi listener đã đăng ký hai lần liên tiếp với cùng snapshot đúng tiền; chỉ một bill, không nhân đôi thanh toán. Đây là callback giả trực tiếp, không phải transport RTDB thật.
- **Ly miễn phí:** khách có một quyền lợi, chọn qua `consumeFreeToGoDrink` → popup quà → `confirmTogoGift`, thêm ly giá 0 vào giỏ đang có ba ly trả tiền 85.000đ. Trước thanh toán quyền lợi chưa bị trừ; sau `confirmPay`: một bill có ly đổi, tổng vẫn 85.000đ, quyền lợi 1→0, marker redemption một lần, hai tem cho ly trả tiền, busy=false.

Bốn ca với mock tạm bổ sung `.key`: **88 khẳng định ALL PASS**. Với mock gốc, ca ly miễn phí sau khi mồi đầy đủ ô SĐT: **22 PASS/2 FAIL** (mỗi quán thiếu marker redemption). Phần tích tem vẫn đạt; lỗi không phải app mất tem.

### 4.2 Mất ACK sau server đã ghi → retry → replay bill đã xong

Runner bọc `ref.child(...).set`: gọi set thật của mock để cập nhật seed, sau đó reject đúng một lần. Không dùng lỗi trước commit để thay cho mất ACK.

1. Lần đầu server đã có bill, client nhận lỗi: giỏ và idemKey giữ nguyên, busy=false.
2. Retry tìm bill đã có, không set thêm bill.
3. Phục hồi lại giỏ/idemKey trong cùng trang rồi gọi tiếp để kiểm replay: vẫn một bill, hậu thanh toán chỉ một lần, claim processing/done cùng đúng bill ID.

Mock có `.key`: **24 ALL PASS**. Mock nguyên bản: **22 PASS/2 FAIL**, không bảo đảm hậu thanh toán một lần/claim cùng key. Đây là retry/replay trong một phiên, **chưa** phải đóng trình duyệt/reload rồi khôi phục `[BUG#18]`.

### 4.3 Tự kiểm probe

Bản sao module bị cài ba lỗi riêng: bỏ await hậu thanh toán; bỏ trừ ly miễn phí; bỏ nhánh dùng bill đã tồn tại. Bộ so sánh phải bắt lệch `sau` hoặc `ghi` tương ứng.

**73 khẳng định ALL PASS** cho ba ca × hai quán và ba tự kiểm. Cả ba lỗi cài đều bị bắt đúng mục.

Trong lần dựng ca ly miễn phí đầu tiên, tester chỉ mồi `curCustomer` nhưng quên ô `#cuph`, nên phần tích tem không chạy. Đã sửa fixture để mô phỏng khách được chọn đầy đủ rồi chạy lại; không sửa runtime. Finding F19-1 dựa trên lần đã sửa fixture và probe `.key` trực tiếp.

## 5. F19-1 — Firebase giả thiếu `Reference.key`, làm sai marker hậu thanh toán

**Mức vừa/cao đối với độ tin cậy kiểm thử tiền/quyền lợi.** Trong `tools/tach_posgieo/fb_gia.js`, `mk(p,rt,loc)` chỉ đặt `path`, `id`, `_loc`, không đặt `key` cho RT reference. Snapshot có key không thay thế được `Reference.key`.

Tái hiện Node VM nạp `FB_STUB`:

```js
const r = w.firebase.database().ref('orders_gieogieo/oct/26').child('bill_probe');
// r.path = 'orders_gieogieo/oct/26/bill_probe'
// r.id = 'bill_probe'
// r.key === undefined; đúng SDK phải là 'bill_probe'.
```

`confirmPay`/`finalizeSplitPay` truyền `billRef.key` vào trừ kho, claim hậu thanh toán, trợ lý, tích tem và redemption. Trong dump GG02 của ca đổi ly:

- Mock gốc: claim `checkout_side_effects_gieogieo__gg02/auto1`, đánh done ở `.../auto3`, không có `stamp_free_redemptions_gieogieo/<bill>`.
- Chỉ bổ sung key vào mock trong runner: claim và done cùng `.../bill_ID`, redemption tại bảng chung `stamp_free_redemptions_gieogieo/bill_ID`; ca đổi ly và replay đạt.

Cả mốc và bản tách dùng cùng mock sai nên so bằng nhau không phát hiện được. Đây không phải bằng chứng runtime thật tạo auto1/auto3.

Đề nghị sửa mock `.key` (node con/child/push đúng đoạn cuối, root null), thêm unit test, đưa ca bill có khách/đổi ly và retry/replay vào suite; kiểm marker phải cùng ID của bill, không chỉ cùng tên collection. Không giải quyết bằng nới regex bỏ qua ID.

## 6. F19-2 — Ba oracle thanh toán có thể nhận giá trị sai là đạt

**Mức vừa, lỗi công cụ/assertion.** Trích trực tiếp ba hàm `kiem` bằng AST rồi truyền dữ liệu giả sai; không viết lại biểu thức để kết luận:

| Oracle | Giá trị sai đưa vào | Kết quả thực tế |
| --- | --- | --- |
| `ttTienMat` màn nhập tiền | `sau.manTien='sm'` | Trả chuỗi `'sm'` truthy, coi là đạt |
| `ttChuyenKhoan` QR 85.000 | `qrAmount='1'`, `qrNoiDung='TTHD GG123'` | true do nhánh `|| /^TTHD /` bỏ qua amount |
| `ttGiamGia` ghi giảm 5.000 | bill có `discountAmt:0, baseTotal:85000` | true vì `JSON.stringify(d).includes('5000')` |

Phép so mốc–bản tách **vẫn có thể bắt** lỗi chỉ xuất hiện ở bản tách. Finding này không nói toàn bộ suite sẽ bỏ qua mọi lỗi đó; nó nói oracle độc lập được quảng bá đang không kiểm đúng điều kiện, đặc biệt nếu fixture/hai bản cùng sai.

Đề nghị so chính xác màn thực tế (`cp`), QR amount và nội dung đúng ID bằng `&&`, trường `discountAmt === 5000`; thêm negative control riêng cho từng oracle.

Ngoài ra, helper `donhang()` trong `KB_TT` còn regex `orders_gieogieo/` không nhận `__gg02`; `cho()` hết vòng không throw. Vì vậy GG02 thường chờ hết timeout, không phải đợi đúng điều kiện như tài liệu mô tả. Các assertion cuối vẫn kiểm bill GG02, nên chưa gọi đây là PASS giả toàn ca, nhưng cần sửa để kiểm callback hoàn tất đáng tin cậy và tránh chờ thừa. Probe độc lập dùng regex nhận suffix và timeout ném lỗi.

## 7. O19-1 — Callback CK thiếu tiền vẫn hoàn tất bill (hành vi có sẵn)

Tái hiện qua listener thật mà `startBankListener` đăng ký: giỏ 85.000đ, mở QR đúng tiền, gọi callback với `{exists:()=>true,val:()=>({amount:1})}`.

Cả GG01/GG02, cả `0bd95a7` và bản tách: tạo một bill CHUYỂN KHOẢN tổng 85.000đ, đóng popup/xóa giỏ và xóa node xác nhận. Oracle yêu cầu không hoàn tất bill khi chỉ nhận 1đ trượt ở cả hai quán.

Đã đọc luồng POS: listener chỉ kiểm snapshot tồn tại; `_vietqrOnConfirm` gọi `confirmPay`, không so `data.amount` với tổng đang chờ. Chưa có bằng chứng trong lượt này về việc webhook Cloud Run có bảo đảm tuyệt đối số tiền đúng trước khi ghi node hay không; **không kết luận production đã thất thoát tiền**.

Cần xác minh hợp đồng webhook và quyết định nghiệp vụ trước khi nghiệm thu nhánh lệch tiền. Nếu backend không bảo đảm, đây là lỗ hổng kiểm soát thanh toán sẵn có cần xử lý riêng; không gắn là hồi quy R, không tự sửa app trong lượt kiểm này.

## 8. Đợt 5: đo tải và F5-1

Chạy nguyên lệnh `node tools/tach_posgieo/do_tai.js` sau khi tất cả E2E kết thúc: exit 0, CPU ×4, trung vị 7 lần. Số đo độc lập (ms):

| Bản | Lần đầu DCL | Lần đầu load | Mở lại DCL | Mở lại load | Request local |
| --- | ---: | ---: | ---: | ---: | ---: |
| `0bd95a7` | 1141 | 1170 | 1027 | 1048 | 8 |
| SHA kiểm | 1019 | 1042 | 1017 | 1034 | 30 |

Trong lần chạy này, DCL lần đầu giảm khoảng **10,7%**, load giảm khoảng **10,9%**; mở lại gần ngang nhau. Đây không phải tái xác nhận mức ~19% trong tài liệu và không phải số đo thiết bị thật. Cột KB nguyên bản ra 32/603 là sai do F5-2 bên dưới, không dùng để kết luận dung lượng.

**F5-1 — cách gọi “ấm, JS đã cache” không được phép đo hiện tại chứng minh.** `do_tai.js` gọi `page.route('**/*', ...)` trên cả lượt lạnh và ấm. Playwright tắt HTTP cache khi routing được bật. `hai_ban` dùng `serveFile`, cũng không đặt cache header/validator; cùng context tự nó chưa đủ chứng minh cache hit.

Probe riêng với server local trả `a.js` có `Cache-Control: public,max-age=31536000,immutable`, hai page liên tiếp cùng context:

| Điều kiện | Số request a.js tới server | transferSize hai lượt |
| --- | ---: | --- |
| Không route | 1 | 324, 0 byte |
| Có `page.route('**/*', r=>r.continue())` như công cụ | 2 | 324, 324 byte |

Hai assertion số request đạt. Vì vậy các cột “ấm” hiện chỉ là mở lại cùng browser context, **không phải số đo HTTP cache ấm**. Việc đọc response body rồi cộng KB cũng không phải số byte truyền trên dây khi có cache/compression.

Đề nghị chỉnh nhãn/kết luận tài liệu hoặc tạo bài đo cache đúng: tránh routing browser trong phép đo cache, phục vụ bản Firebase giả từ local server, đặt header theo Hosting, đo transferSize/CDP fromDiskCache/request tới server. Chạy xen kẽ hai bản và báo độ phân tán; CPU throttle ×4 không tự tương đương điện thoại tầm trung. Không quy nguyên nhân nhanh hơn cho “phân tích song song” khi chưa có trace chứng minh.

Không có thay đổi app ở Đợt 5; chưa có cơ sở buộc lazy-load hay tối ưu mã. Giữ lựa chọn chưa tối ưu là hợp lý, nhưng không dùng số ~19% làm cam kết tốc độ thực tế.

### F5-2 — Bộ đếm byte mất cập nhật do cộng trước await

**Mức vừa, lỗi công cụ đo.** Handler `response` dùng `byte += (await rs.body()).length`. Phép `+=` đọc giá trị cũ của `byte` trước khi chờ; nhiều handler đang chờ có thể giữ cùng giá trị cũ, rồi ghi đè phần cộng của nhau khi body về.

Probe tối thiểu Node: hai handler giữ hai Promise, đọc cùng `byte=0`; resolve body 10 byte rồi 20 byte. Biểu thức gốc trả **20**, không phải 30. Đổi thành `const body = await rs.body(); byte += body.length` hoặc `.then(body => { byte += body.length; })` trả **30**.

Trong phép đo 7 lần gốc: cột KB báo mốc 32 và bản tách 603, dù riêng HTML mốc đã là 1.937.024 byte. Bản sao tester chỉ đổi bộ thu body sang cộng sau resolve và await toàn bộ body trước đóng trang (`--lan 1 --cpu 4`) thu khoảng **2.729.502 byte ở mốc / 2.764.807 byte ở bản tách** (chênh favicon vài byte ở lượt đầu), tương ứng 2.666/2.700 KiB. Đây là tổng body giải nén trong cấu hình local, vẫn không phải byte trên dây hay cache hit.

Đề nghị sửa thứ tự cộng và chờ mọi tác vụ thu body hoàn tất; giữ lỗi body trong báo cáo thay vì nuốt im lặng. Không cần sửa app. Số đo body đã sửa cũng cho thấy phát biểu «tổng byte không đổi» chỉ có thể hiểu gần đúng cho mã chuyển chỗ, không phải tổng tài nguyên thực tế bằng nhau từng byte.

## 9. Phản biện ranh giới file, phạm vi và giới hạn

- `onCheckoutClick` ở `pos_cart` chấp nhận được vì là điểm chuyển từ giỏ sang chuỗi thanh toán; không cần di chuyển lại trong lượt R. Gộp khuyến mãi/thanh toán/Tính riêng theo yêu cầu một nhóm tác vụ liên tục cũng hợp lý. Số dòng/KB không tự quyết định hiệu năng; cần số đo đúng.
- `fmt`/`fmtK`, `getFinalTotal`/`computeAllDiscounts` được dùng xuyên nhóm nhưng module đều thiết yếu, nạp trước main. Chưa thấy gọi sớm trước khi binding sẵn sàng; test guard và hook đạt. Dời helper về nền là lượt R riêng nếu cần, không phải điều kiện bắt buộc của lần này.
- Các bảng orders/billCounters/checkout_side_effects phải theo quán; customers, marker loyalty/redemption và bank_confirmations là dữ liệu chung G/X theo REG. Probe đã giữ phân biệt này. Không nhận là đã kiểm hai quán đồng thời trên backend thật.
- Cần thêm ca khách/đổi ly, không chỉ ca không khách: bằng chứng F19-1 cho thấy kiểm đúng tên bảng riêng quán chưa đủ để kiểm đúng ID/marker hoặc quyền lợi chung.
- Ca CK tay của suite thay `resolveStaffPinAndCheckin` bằng nhân viên giả: chứng minh nối callback và metadata, không nghiệm thu PIN/điểm danh thật ở lượt này.
- Chưa nghiệm thu: khôi phục idemKey sau reload thực, CK đến muộn qua transport thật, mọi trường hợp Free Topping/mua-X-tặng-Y/Food/App/Ship/backfill, lỗi mất mạng ở mọi bước, tồn kho nhiều giao dịch với increment thật, máy in/APK/Firebase thật. Toàn chuỗi 8 bước kết ca vẫn chưa được chứng nhận.
- Mock `.on()` rỗng, push ID cố định, increment/query/listener còn giới hạn đã nêu. Bổ sung `.key` tạm không có nghĩa toàn bộ mock đúng SDK.

Log `/workspace/work/review18-19-*.log`, dump chuẩn `review18-19-dump/`, probe `review18-19-probe-dump/`, `review18-19-key-dump/`, `review18-19-ack-dump/`. Runner tester chỉ local; chỉ báo cáo được đưa lên nhánh.
