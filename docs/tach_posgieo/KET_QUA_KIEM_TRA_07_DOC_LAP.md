# Kết quả kiểm tra độc lập lượt 07 — Chuỗi hook và bán hàng có trợ lý

- Ngày kiểm: 26/10/2026, giờ Việt Nam.
- Nhánh: `Phan-tach-unit-engine`; SHA kiểm: `abff6d9d`.
- Baseline của hai bài so sánh: bộ Giáng sinh `0bd95a7`.
- Đã đọc `KIEM_TRA_07_HOOK_VA_BAN.md`, `PHAN_HOI_KIEM_TRA_06.md` và bốn công cụ mới.
- Không sửa app/JS phát hành, không deploy, không ghi sổ phát hành. Mọi cài lỗi chỉ ở worktree âm riêng.

## Kết luận

**Chưa thông qua kết luận “đã kiểm đầy đủ chuỗi hook và hành vi” của lượt 07. Cần sửa hai điểm mù của công cụ kiểm tra.** Không phát hiện hồi quy mới của runtime trong lượt này; thay đổi lượt 07 thực tế chỉ là công cụ/test/tài liệu.

Bài hook và bài bán gốc đều chạy đạt trên nguồn sạch, nhưng hai ca cài lỗi bên dưới vẫn đạt sai. Khi mở rộng công cụ hook trong bản tạm, nguồn sạch đạt với 25 hàm có bọc thay vì 23; lỗi cố ý trong hàm gốc bị phát hiện đúng.

## Kết quả chạy lại

| Kiểm tra | Kết quả |
| --- | --- |
| `sh tests/run_all.sh` | TẤT CẢ ĐẠT, 149 file test |
| `e2e_hook.js` nguyên bản | ALL PASS, hai biến thể auth, nhận diện 23 hàm có bọc |
| `e2e_ban.js` nguyên bản | ALL PASS, hai biến thể auth, 1 đơn tiền mặt/5 lượt ghi trong mỗi kịch bản |
| `e2e_0d.js` | Các assertion HTTP/hồi quy đạt; riêng file:// thất bại vì môi trường chặn |
| `check_boundaries` | RANH GIỚI SẠCH |
| `check_paths` | ĐƯỜNG DẪN SẠCH: 109 tên, 875 lời gọi, 54 động |
| `kiem_tra_xuyen_app --assert-clean` | 0 lỗi, 9 kiểm tra đạt |
| Runtime so với `d9c353e4` | Diff rỗng cho posgieo.html, js/posgieo và ban_deploy |

Không coi `file://` là lỗi sản phẩm, cũng không đánh dấu đã nghiệm thu giao thức này: browser của môi trường đã được xác nhận chặn bằng `ERR_BLOCKED_BY_ADMINISTRATOR` ở lượt trước. Chưa APK/thiết bị thật.

## F07-1 — Cao: bỏ sót hai wrapper Engine 2 và hàm gốc của chúng

Vị trí: `tools/tach_posgieo/e2e_hook.js`, hàm `ungVien` và `chuoi`.

Trong `gieo_engine2_pos_v1.js`, `install()` có hai lớp bọc:

```js
const old = window._continueAfterPrepCount;
// wrapper gọi old.apply(...)
const count = window.computeShiftInventoryCountLinesPOS;
// wrapper gọi count.apply(...)
```

Có hai nguyên nhân bỏ sót độc lập:

1. `ungVien` chỉ thu chuỗi định danh trong dấu nháy; hai tên ở đây là truy cập dấu chấm, không được đưa vào tập ứng viên từ các câu lệnh này.
2. `chuoi` chỉ theo biến closure `goc`, `cu`, `fn`; không theo `old`, `count` ngay cả khi tên hàm được thêm thủ công.

### Tái hiện

Trên worktree âm cùng SHA, chỉ sửa file đang được server phục vụ `ban_deploy/giangsinh/posgieo.html`: thêm ngay đầu hàm gốc `_continueAfterPrepCount`:

```js
throw Error('tester-root-broken');
```

Không đổi wrapper Engine 2 hoặc file công cụ. Chạy `e2e_hook.js` nguyên bản: **ALL PASS ở cả hai biến thể auth**. Hàm gốc đang hỏng không bị phát hiện vì test không gọi nhánh kết ca và không đi tới root này.

### Kiểm đối chứng

Trong bản công cụ tạm:

- Thêm hai tên trên vào ứng viên.
- Cho phép theo closure `old` đối với `_continueAfterPrepCount`, `count` đối với `computeShiftInventoryCountLinesPOS`, bên cạnh các tên cũ. Không đơn giản chọn mọi function trong scope vì có thể đi nhầm hàm helper.

Nguồn sạch: **25 hàm có bọc, ALL PASS**, cùng chuỗi giữa baseline và bản mới. Bản cài lỗi: **SOME FAIL**, chỉ rõ `_continueAfterPrepCount` lệch root ở cả hai biến thể auth.

### Yêu cầu xử lý

Thu tên từ cả truy cập/gán `window.x`, mảng/chuỗi tên và wrapper đã biết; xác định cạnh về lớp trước đúng với hàm đang xét. Có bảng kỳ vọng cụ thể ít nhất 25 hàm trong biến thể hiện tại và test cài lỗi vào hai root bị bỏ sót. Không chỉ nới ngưỡng `>=15` hoặc chỉ đổi số 23 thành 25 mà chưa kiểm chuỗi.

## F07-2 — Vừa: chuẩn hóa toàn cục xóa khác biệt giờ đã cố định trong đầu vào

Vị trí: `tools/tach_posgieo/e2e_ban.js`, hàm `chuan`.

Regex `\b\d\d:\d\d\b` thay mọi HH:MM trên toàn bộ JSON, gồm cả dữ liệu nghiệp vụ và nội dung bill; không chỉ giờ thực phát sinh trong lúc chạy. Kịch bản đã đặt rõ `order.time = '10:00'`, nên giờ in từ trường này phải được giữ để so sánh.

### Tái hiện

Trong worktree âm riêng, đổi duy nhất nội dung biểu thức in giờ của file được phục vụ:

```text
ban_deploy/giangsinh/js/posgieo/pos_print_content.v1.js
${order.time}  →  12:34
```

Giữ baseline, kịch bản và assertion nguyên bản. `e2e_ban.js` vẫn **ALL PASS** ở cả hai biến thể auth dù bản mới in sai giờ đã cố định. Cùng độ dài chữ số cũng không làm đổi kích thước canvas mà bài test đang so.

### Yêu cầu xử lý

Chuẩn hóa theo trường/đường dữ liệu rõ ràng, chỉ loại giá trị thực sự không xác định, hoặc cố định clock/random hợp lý trước khi khởi tạo hai bản. Không thay HH:MM trên toàn JSON. Giữ nguyên giờ fixture, giá trị cấu hình giờ, text khách/menu và các định danh cần phân biệt. Bổ sung ca giờ in sai phải fail cùng ca giờ thực khác nhau không gây fail giả.

Không kết luận normalization đang xóa mọi số tiền: số tiền thông thường trong kịch bản vẫn được so. Phát hiện ở đây là giờ nghiệp vụ/nội dung được so đã bị chuẩn hóa quá rộng.

## Kiểm lại khả năng bắt lỗi khác

Đổi riêng chữ `Khách: ` thành `Khach: ` trong nội dung in của bản âm: bài bán phát hiện khác biệt `bill`. Điều này xác nhận so nội dung bill có tác dụng, nhưng không khắc phục điểm mù chuẩn hóa giờ.

Hai ca âm về hook/giờ được chạy riêng: khi kiểm root hook đã trả nội dung bill về bản sạch để không nhầm lỗi `buildReceiptContent` với lỗi root bị bỏ sót. Worktree sạch không mang các thay đổi này.

## Phản hồi các câu hỏi trong tài liệu lượt 07

1. **Có lớp bị cắt chuỗi ở cả hai bản:** chính là hai wrapper `old`/`count` của Engine 2 (F07-1). Công cụ gốc chưa chứng minh “cùng mọi chuỗi”.
2. **Firebase giả chạy transaction:** tốt hơn mock bỏ qua callback, nhưng snapshot luôn rỗng và không có trạng thái commit/retry/conflict thật. Nếu callback ném lỗi ở cả hai bản, các trường lỗi giống nhau có thể vẫn được coi là tương đương. Test hiện có chốt một đơn đã ghi nhưng chưa buộc `ttLoi` vắng ở cả hai bản; nên thêm assertion thành công riêng cho kịch bản happy path, trạng thái giỏ sau thanh toán và tác dụng dự kiến. Không diễn giải phép so ngang là chứng nhận tính đúng nghiệp vụ backend.
3. **Chuẩn hóa quá tay:** đã tái hiện (F07-2). Nên thay bằng cơ chế theo trường hoặc fixture thời gian thay vì regex trên toàn JSON.
4. **Danh sách 23 chưa đầy đủ:** ít nhất còn `_continueAfterPrepCount` và `computeShiftInventoryCountLinesPOS`; bản mở rộng tạm thu được 25. Các tên nhánh TC33/XOFA không cần ép vào danh sách POS Gieo.

## Giới hạn hợp lệ vẫn giữ

- Chỉ một kịch bản tiền mặt với khách gán tay, cổng ca bị thay giống nhau; không nghiệm thu CK/VietQR, chia bill, khách có tem, đổi tem, chiến dịch, tồn kho/BTP thật.
- Chuỗi chữ ký nguồn không phân biệt mọi giá trị closure. Bài bán bổ sung kiểm hành vi của các đường đã chạy, không bao phủ nhánh chưa chạy.
- Mock không lưu dữ liệu và không tái hiện đầy đủ Firebase transaction. Không thử ghi Firebase production.
- Không đổi lựa chọn A về H1, không yêu cầu thay thao tác bán hàng trong lượt kiểm công cụ này.

## Bằng chứng và bước tiếp theo

Worktree sạch `/workspace/work/review07` ở `abff6d9d`; worktree âm `/workspace/work/review07-negative`. File `tools/tach_posgieo/e2e_hook.tester.js` là bản tạm untracked để xác nhận 25 chuỗi, không thuộc release.

Logs trong `/workspace/work/`: `review07-suite.log`, `review07-hook.log`, `review07-sale.log`, `review07-0d.log`, `review07-boundaries.log`, `review07-paths.log`, `review07-cross.log`, `review07-negative-broken-root.log`, `review07-expanded-clean.log`, `review07-negative-expanded-final.log`, `review07-negative-time.log`, `review07-negative-bill.log`.

Đề nghị sửa F07-1/F07-2 trong công cụ, thêm các ca âm đã tái hiện rồi gửi kiểm lại. Không cần thay runtime ứng dụng để xử lý hai phát hiện này. Chưa thực hiện bước tách tiếp theo.
