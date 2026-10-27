# Kiểm tra độc lập lượt 17 và kiểm lại phản hồi 15–16

- Ngày 27/10/2026 (Việt Nam), nhánh `Phan-tach-unit-engine`.
- Fetch nhánh đích rồi tạo detached worktree `/workspace/work/review17` tại **`1c11f5c955f16294bca67fb110eedcf320826e61`** (triển khai lượt 17).
- Cha là **`05db7a3a4cfcc183e895c84ca2f65ebc1d43acce`**: phản hồi 15–16, chỉ sửa mock/test/tài liệu, không sửa app.
- Đọc `PHAN_HOI_KIEM_TRA_15_16.md`, `KIEM_TRA_17_KHACH.md`, đối chiếu `KET_QUA_KIEM_TRA_15_16_DOC_LAP.md` (`3bc3e986`). Không dùng branch `work` cũ để kết luận.
- Sinh đủ ba bộ deploy trước khi chạy E2E; Chromium `/usr/bin/chromium`, HTTP cục bộ, Firebase/CDN giả. Không sửa app/JS phát hành, không deploy, không ghi sổ phát hành.

## Kết luận

**ĐẠT lượt 17 trong phạm vi chuyển mã nguyên văn và các hành vi đã kiểm.** 68/68 khai báo giữ nguyên; 151 file test đạt; bộ E2E nghiệp vụ đạt **1.294 khẳng định, 49 kịch bản × 2 quán và 22 tự kiểm**. Không phát hiện hồi quy ứng dụng do lượt tách này.

**Đóng F15-1 và F16-1 trong phạm vi đã báo.** Các probe cũ từng thất bại nay đạt với mock chính thức, không cần vá metadata hoặc transaction trong runner. Không nâng kết luận này thành chứng nhận toàn bộ hành vi Firebase thật.

## 1. Kiểm lại phản hồi 15–16

### F15-1: loại nguồn của log lỗi RTDB

`hong(op, path, rt)` nhận loại nguồn, `set/update/remove` và `add` truyền đúng `rt`; log RT là `true`, Firestore là `false`. `pham_vi.js` không bị nới: không bỏ qua log `!hong`, không bỏ qua collection lạ.

### F16-1: transaction callback trả undefined

Mock hiện trả `committed:false`, snapshot dữ liệu đầu vào, không ghi seed và không tạo log ghi transaction khi callback hủy. Commit giá trị mới và commit null/xóa node vẫn hoạt động.

Bằng chứng chạy lại tại SHA lượt 17 (mock/test không đổi so với commit phản hồi):

| Bài | Kết quả |
| --- | --- |
| `node tests/tach_posgieo_fb_gia.test.js` | 40 khẳng định, ALL PASS |
| Chạy chính test mới với `FB_STUB` lấy từ `3bc3e986` qua Node VM/require cache, không sửa file gốc | Exit 1, trượt đúng **2** khẳng định F15-1/F16-1; các kiểm khác qua |
| Probe nguyên bản từng bắt F15-1: lưu món RT lỗi một lần, giữ form, thử lại, kiểm màn bán | **31 ALL PASS**, cả GG01/GG02 và tự kiểm giá sai; không còn 4 FAIL phân loại nguồn |
| Probe nguyên bản từng bắt F16-1: xóa bill có job running | **22 ALL PASS**, cả GG01/GG02 báo đang trừ kho, không xóa bill; không còn 2 FAIL thông báo |
| Hai ca đã đưa vào bộ chính `menuLoiThuLai`, `xoaBillJobChay` | Đạt trong bộ mục tiêu 6 ca và bộ tổng; tự kiểm bỏ chặn busy bị bắt |

Probe cũ được chép vào worktree mới, dùng `fb_gia.js` mới qua `hai_ban.js`, không dùng bản `*_meta`/`*_fixed` từng vá mock tạm. Các file tester chỉ nằm local.

## 2. Chuyển mã lượt 17

Đối chiếu AST từng khai báo trong `pos_customers.v1.js` với main tại cha `05db7a3`: **68/68 nguyên văn**, không còn binding trùng trong main. Với main còn lại, chỉ khai báo `POS_MODS_THIET_YEU` đổi; các statement cấp cao không phải khai báo giữ nguyên nội dung và thứ tự.

Các giá trị đầu không đọc DOM/cache/Firebase. Nói chính xác hơn tài liệu: `FREE_DRINK_LEGACY_CAP` là phép cộng hai hằng đã khai báo ngay trước, không phải literal, nhưng không tạo phụ thuộc nạp sớm ra ngoài module.

Listener click đóng gợi ý, listener scroll, IIFE bọc trợ lý và `assistLoadLocalCache()` vẫn ở main. `curCustomer`/`loyaltyCustomer` vẫn là state dùng chung; module mới chỉ khai báo các hàm truy cập chúng khi được gọi. Không thấy đường gọi lúc nạp tới 68 tên trước khi module sẵn sàng trong các đường khởi động đã kiểm.

Probe module `customers` trên GG02:

- Đủ file: qua chốt dừng, đúng một timer hạn dùng.
- 404 và throw giữa file sau marker `dang`: màn đỏ chặn nghiệp vụ, không timer, không lỗi khai báo lexical lần hai.
- **3/3 PASS**. Ca tải chậm/hỏng/nạp lại của bộ `e2e_0d` cũng có module này.

## 3. Bộ kiểm yêu cầu

| Lệnh | Kết quả tại SHA chốt |
| --- | --- |
| `sh tools/sinh_lai_tat_ca.sh` | TẤT CẢ ĐẠT, 151 file test; không diff tracked sau sinh |
| `node tools/check_boundaries.js` | RANH GIỚI SẠCH |
| `node tools/check_paths.js` | ĐƯỜNG DẪN SẠCH: 109 tên, 875 lời gọi, 54 động |
| `node tools/tach_posgieo/e2e_kho.js --chi menuLoiThuLai,xoaBillJobChay,khachTraCuu,khachThemThanhVien,khachTichTem,khachDanhSach` | 159 khẳng định ALL PASS, 6 ca × 2 quán + 3 tự kiểm |
| `node tools/tach_posgieo/e2e_kho.js` | **1.294 khẳng định ALL PASS**, exit 0; 49 ca × 2 quán, 22 tự kiểm |
| `node tools/tach_posgieo/e2e_ban.js` | 36 khẳng định, ALL PASS |
| `node tools/tach_posgieo/e2e_hook.js` | 13 khẳng định, ALL PASS; chuỗi bọc và các lỗi cài được kiểm |
| `node tools/tach_posgieo/e2e_0d.js` | **55 PASS, 1 FAIL file://**, không ALL PASS |

`file:///workspace/work/review17/posgieo.html` được thử trực tiếp và trả `net::ERR_BLOCKED_BY_ADMINISTRATOR`; đây là giới hạn môi trường. Không chứng nhận file://. Lượt này không chạy lại Gấu Noel ngoài bài yêu cầu; giới hạn kiosk có sẵn trong báo cáo 15–16 vẫn giữ nguyên.

Đọc lại **98 dump JSON** (49 ca × 2 quán): các mục `ghi`, `toasts`, `sau`, `loiKB`, `loi` đều khớp giữa mốc `0bd95a7` và bản tách. Các phép so này dùng mock mới ở cả hai phía; các oracle độc lập và tự kiểm ở dưới bổ sung cho phép so bằng nhau.

## 4. Probe độc lập bổ sung cho lượt 17

### 4.1 Lỗi tích tem → nợ → flush lỗi → hai flush đồng thời → không cộng trùng

Dùng fixture khách Lan 5 tem, hai ly giá 30.000, bill `probe17`. Trong bản sao runner, thêm ca `khachNoRetry`:

```js
window.__HONG = [{ op: 'tx.update', re: '^customers/0901234567$', con: 20 }];
await loyaltyProcessAfterPay('0901234567', 60000, 2, 'probe17', [30000, 30000]);
// Kiểm: khách vẫn 5 tem, localStorage có đúng 1 khoản nợ.
await loyaltyFlushPending();
// Vẫn lỗi: nợ còn, _loyaltyFlushing === false.
window.__HONG = [];
await Promise.all([loyaltyFlushPending(), loyaltyFlushPending()]);
await loyaltyFlushPending();
await loyaltyAddStamps('0901234567', 2, 'probe17', true, [30000, 30000]);
```

Kết quả GG01/GG02, cả mốc `0bd95a7` và bản tách:

- Chỉ một update khách thành công; tem từ 5 thành 1, thêm đúng một ly miễn phí; marker added=2.
- Hết nợ local; nợ server `done`, cảnh báo `resolved`; khóa flush được nhả ở cả nhánh lỗi và thành công.
- Log, toast, trạng thái, lỗi khớp mốc; mọi bảng đúng REG.
- Cài lỗi vào bản sao module: bỏ `_loyaltyPendingDrop(e.billId, e.kind)` sau thành công. Bộ so sánh bắt lệch `sau`.
- **31 khẳng định ALL PASS**, gồm tự kiểm. Không sửa app hoặc mock để ca này qua.

Ca này mở rộng phần hàng đợi nợ chưa phủ trong tài liệu 17, nhưng **chưa** chứng nhận khôi phục sau đóng/mở trình duyệt, lỗi ghi chính localStorage, hoặc mất ACK sau server đã commit. Đây là gọi đồng thời hai flush trong một trang; không phải hai quán đồng thời tranh cùng doc thật.

### 4.2 Kiểm await bằng transaction bị giữ lại

Bản sao runner `khachAwait` dùng cùng fixture, xóa log khởi động trước khi bắt đầu thao tác; bọc `fstore.runTransaction` bằng một Promise chỉ được mở khi tester gọi `release()`.

- Sau gọi `loyaltyProcessAfterPay`, chờ 100 ms: transaction được gọi một lần, promise ngoài chưa hoàn tất, chưa ghi.
- Gọi `release()`, await promise ngoài: mới hoàn tất; khách có 1 tem như mong đợi.
- Cài lỗi vào bản sao module, bỏ `await` trước `loyaltyAddStamps(...)`: bộ so sánh bắt lệch `sau`.
- **23 khẳng định ALL PASS** cho hai quán + tự kiểm; không chỉ lấy log trong một cửa sổ thời gian rồi coi là xong.

Lần dựng probe đầu tiên quên xóa log khởi động (khác các ca `KB_KHACH`), gây 4 FAIL do lẫn lượt ghi sổ ngày. Đã sửa phần chuẩn bị của tester, không lọc bỏ log trong thao tác và không sửa runtime. Kết quả trên là lần chạy với log bắt đầu đúng ranh giới thao tác.

## 5. Phạm vi đa cửa hàng và phản biện ranh giới file

Theo REG của đúng `data_access.v9.js`:

- `customers` là **X**, dùng chung với XOFA/The Cafe 33; `customer_ac_cache_gieogieo`, `loyalty_bill_effects_gieogieo`, `loyalty_pending_retry_gieogieo` là **G**, dùng chung toàn chuỗi. Không gắn `__gg02` vào các bảng này.
- `alerts_gieogieo` là **S**; probe nợ kiểm cảnh báo đúng tên gốc ở GG01 và `__gg02` ở GG02. Bộ kiểm phạm vi vẫn bắt được lượt cố ý chèn sang quán khác.
- Local queue tích tem được giữ khi đổi quán theo thiết kế có sẵn ở main vì khách và marker dùng chung. Lượt này không nghiệm thu luồng đổi quán/reload khi đang nợ hoặc việc đóng cảnh báo ở quán ban đầu sau chuyển máy.

Trả lời ba điểm tài liệu nhờ phản biện:

1. **Chấp nhận gộp `pos_customers` trong lượt R này.** Không cần thêm một thay đổi phân ranh giữa lúc nghiệm thu. Tuy nhiên nhóm giao diện tra cứu/danh sách và nhóm transaction/hàng đợi/tem có trách nhiệm khác nhau; tách `pos_loyalty` về sau có cơ sở, thực hiện bằng lượt R riêng có kiểm bảo toàn binding, await và thứ tự ghi. Không có bằng chứng tách thêm file sẽ tự tiết kiệm tài nguyên.
2. `clearCustomer`, `resetDiscountState`, `_stampFreeSyncCart` là điểm nối khách–giỏ. Chuyển nguyên văn trong nhóm khách hiện không làm đổi hành vi; không bắt buộc đưa lại main chỉ vì đụng giỏ. Khi làm 4D cần kiểm đổi/xóa khách lúc có topping quà, ly miễn phí và giảm giá để chốt quyền sở hữu state rõ ràng.
3. Không thấy lời gọi sớm gây thiếu binding trong phạm vi kiểm. File mới nạp đồng bộ trước main; initializer không gọi nghiệp vụ. Listener/chuỗi bọc vẫn lắp ở vị trí cũ, module thiếu hoặc chạy dở bị chặn trước nghiệp vụ. Không suy rộng thành chứng minh mọi tương tác người dùng trong lúc tải dở trên thiết bị thật.

## 6. Giới hạn còn giữ

- Chưa nghiệm thu `consumeFreeToGoDrink` → giỏ → `_finalizeStampFreeAfterPay`, thanh toán TM/CK/backfill toàn luồng ở 4D; lượt này gọi trực tiếp phần hậu thanh toán với fixture.
- Chưa so nhánh điểm cũ, mọi trường hợp hủy khách có quà, danh sách lớn/phân trang, xung đột hai quán thật, máy in/APK/Firebase thật.
- Mock còn giới hạn `push` ID cố định, increment xấp xỉ, `orderBy`/`limit` bỏ qua, listener một ảnh đầu; fix F16-1 không mô phỏng đầy đủ retries/concurrency của RTDB.
- Toàn chuỗi 8 bước kết ca vẫn chưa được chứng nhận.
- Chỉ báo cáo được đưa lên nhánh; các probe và log ở `/workspace/work/review17-*`, runner `tools/tach_posgieo/*.tester.js` trong worktree local. Không sửa app, không deploy.
