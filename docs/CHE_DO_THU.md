# Chế độ thử — thử bản mới trên hệ thống đang chạy thật

Chế độ thử dùng để chạy **code mới** với **dữ liệu giống thật** mà không ảnh hưởng quán đang bán:

- Máy thật vẫn mở `posgieo.html` / `quanlygieo.html` như cũ. Hai file này **không đổi** cho tới khi anh quyết định lên chính thức.
- Bản thử là `posgieo_thu.html` / `quanlygieo_thu.html` (cùng site, cùng Firebase). Bản thử **khoá cứng** ở chế độ thử, không tắt được.
- Mọi dữ liệu bản thử đọc/ghi nằm trong **vùng thử** (`__test_gieogieo`). App thật không đọc vùng thử, bản thử không ghi vào dữ liệu thật.
- Bấm "Kết thúc thử" thì toàn bộ dữ liệu thử bị xoá.

## 1. Đưa bản thử lên (giữ nguyên cách để file hiện tại)

1. Lấy 4 file bản thử do Claude sinh sẵn: `posgieo_thu.html`, `quanlygieo_thu.html`, `unit_engine.v1.js`, `che_do_thu.v1.js`.
2. Chép vào thư mục deploy, **cạnh** `posgieo.html`. **Không** thay `posgieo.html` / `quanlygieo.html`, không đụng file XOFA / The Cafe 33.
3. `firebase deploy --only hosting` như mọi khi. Deploy giờ nào cũng được, vì máy thật vẫn chạy bản cũ.

Mỗi lần sửa code, Claude gửi lại 2 file `_thu` mới, anh chép đè rồi deploy.

**Tuỳ chọn** (không bắt buộc khi thử):
- Lúc thử **không** chạy `tools/tao_ban_thu.js` hay `tools/predeploy_check.sh` trong thư mục deploy: hai file thật ở đó còn là bản cũ, nên công cụ sẽ sinh sai hoặc báo sai. `predeploy_check.sh` chỉ dùng khi lên chính thức (mục 5).
- Thêm các mục `headers` trong `tools/firebase_headers_gieogieo.json` vào `firebase.json`, để máy nhận bản mới ngay (không có thì chậm tối đa ~1 giờ). Bắt buộc khi lên chính thức.
- Các thư mục `tools/`, `tests/`, `docs/` nằm trong thư mục deploy sẽ bị công khai trên web. Muốn giữ nguyên chỗ để mà không công khai, thêm vào `firebase.json` dòng `"ignore": ["firebase.json", "**/.*", "**/node_modules/**", "tools/**", "tests/**", "docs/**", "*.md", "package*.json"]`, **gộp** với `ignore` đang có nếu đã có.

## 2. Thử

1. Mở `https://<site>/posgieo_thu.html` và `https://<site>/quanlygieo_thu.html` bằng **Chrome** (máy tính bảng / PC).
   - Góc phải dưới có nút cam **🧪 CHẾ ĐỘ THỬ**, tiêu đề tab có chữ **[THỬ]**.
2. Lần đầu, màn hình hỏi chép dữ liệu → bấm **"Chép dữ liệu thật vào vùng thử"**, chờ xong, bấm **"Bắt đầu thử"**.
   - **Có chép:** danh mục nguyên liệu/BTP, công thức, menu, topping, khuyến mãi, nhân viên, quy tắc refill, vị trí kho, lịch, checklist, và **tồn hiện tại** (tem còn seal / đang mở, lô BTP đang có).
   - **Không chép:** bill cũ, sổ kho cũ, kết ca cũ, khách hàng.
   - Dữ liệu thật **chỉ được đọc**.
3. Thử các nghiệp vụ theo danh sách ở mục 4. Mở bản thử ở nhiều máy cùng lúc được (dùng chung một vùng thử).
4. Xong thì bấm nút **🧪** → **"Kết thúc thử — xoá toàn bộ dữ liệu thử"**. Muốn làm lại từ đầu thì bấm **"Xoá dữ liệu thử & chép lại từ thật"**.

## 3. Giới hạn của bản thử

- **Chuyển khoản:** QR vẫn là **tài khoản thật**. Vùng thử không nhận xác nhận tự động → bấm **"ĐÃ CHUYỂN KHOẢN XONG"** (xác nhận tay). **Đừng chuyển tiền thật.**
- **In bill / tem:** chỉ chạy trong APK. Mở bản thử bằng Chrome thì không in được.
- **Khách hàng:** vùng thử không có khách thật → thử tích tem bằng **SĐT giả**.
- **Công cụ dọn dữ liệu của Quản lý** (quét / lưu trữ bill, dọn CK cũ) **bị tắt** ở bản thử, vì chúng gọi thẳng vào dữ liệu thật.
- **Nhiều máy cùng thử:** một máy bấm "Kết thúc thử" là dữ liệu thử của mọi máy bị xoá.
- Nếu đóng bản thử mà chưa kết thúc, dữ liệu thử vẫn còn. Lần mở sau sẽ thử tiếp, hoặc anh bấm xoá.

## 4. Nên thử những gì

| Nhóm | Làm gì | Đúng khi |
|---|---|---|
| Bán hàng | Bill có NL dán tem + BTP + topping. Trả tiền mặt, CK (xác nhận tay), tính riêng | Tồn giảm đúng định mức, tem đang mở giảm đúng, không có ❌ |
| Xoá bill | Xoá ở POS, xoá ở Quản lý, bấm hai lần | Tồn hoàn lại đúng **một lần** |
| Ly tem | Khách SĐT giả đủ 6 tem: đổi ly; đổi ly rồi xoá ly | Trừ đúng 1 ly; xoá ly thì không trừ |
| Kho POS | Nhận hàng, mở tem (kể cả khi đang có tem mở), báo hết, báo huỷ, báo mất / tìm lại, in lại tem | Tồn = tổng tem; mở tem thứ 2 bị chặn trừ khi "Vẫn mở" |
| Mẻ BTP | **Bắt đầu mẻ** (cân NL, mở mã tiếp), hoàn thành, huỷ, đổ bỏ, sửa sản lượng | NL trừ đúng; lô mới có tồn; huỷ mẻ hoàn NL |
| Kết ca | Cân NL cuối ca, kiểm kê BTP, đếm giao ca | Lưu được; tồn sau kiểm = số đếm |
| Quản lý | Sửa phiếu nhận, chỉnh tồn, duyệt kiểm kho, cân lại mã, khôi phục lô, nhập kho nhanh món có refill | Tồn đúng; nhập nhanh cộng vào kho nguồn |

**Dấu hiệu lỗi:** thông báo ❌, banner đỏ, nút treo "Đang…", cảnh báo lạ trong Quản lý, Sổ lệch tăng bất thường, tồn khác tổng tem. Gặp lỗi thì chụp màn hình và ghi giờ, mã bill/tem, máy nào. Trên Chrome thì chụp thêm tab Console (F12).

## 5. Lên chính thức (sau khi thử ổn)

1. Chép `posgieo.html`, `quanlygieo.html` **mới** đè lên hai file thật (engine đã có sẵn từ bước 1).
2. Đã thêm `headers` vào `firebase.json` (xem mục 1). Nếu có node thì chạy `sh tools/predeploy_check.sh`.
3. `firebase deploy --only hosting`, **ngoài giờ bán**. Mọi máy tắt hẳn rồi mở lại app.
4. Bản thử để lại trên site cho lần sau cũng được.

**Quay lui:** chép lại hai HTML cũ rồi deploy. Dữ liệu bản mới ghi chỉ **thêm trường**, bản cũ đọc bình thường.

## 6. Kỹ thuật (cho người bảo trì)

- `che_do_thu.v1.js` chuyển hướng ngay ở gốc SDK, nên áp cho cả app lẫn Unit Engine:

  | Loại | Chuyển thành |
  |---|---|
  | Firestore `collection('x')` / `doc('x/y')` | `__test_gieogieo/data/x…` (tên collection giữ nguyên nên chỉ mục Firestore vẫn dùng được) |
  | RT `ref('x')` | `__test_gieogieo/x`; `.info/*` giữ nguyên |
  | Storage | `__test_gieogieo/…` |
  | localStorage `k` | `__thu__k` |
  | `collectionGroup`, `refFromURL` | Chặn |

- **Fail-closed:**
  - Chốt đầu script: thiếu `che_do_thu.v1.js` thì dừng **trước** `initializeApp`, nên `db` / `fstore` không tồn tại.
  - `install` chuyển hướng **trước** rồi tự kiểm (đối tượng SDK duy nhất, đường dẫn đúng). Kiểm sai thì khoá mọi lệnh đọc/ghi.
  - Đường REST đi thẳng (`_ddShallow`, upload ảnh dụng cụ ở Quản lý) có chốt riêng trong code nguồn.
- **Xoá:** danh sách collection đã chạm được ghi vào doc `__test_gieogieo/data` (`colls`). Kết thúc thử xoá từng collection đó, cùng nhánh RT `__test_gieogieo`, ảnh thử và khoá localStorage thử.
- **Test:** `tests/che_do_thu.test.js` chạy lại 24 kịch bản giao diện ở chế độ thử và kiểm dữ liệu thật **không đổi một byte**, không lượt ghi nào lọt ra ngoài. Kèm test chép, xoá, fail-closed, localStorage. Đã thử thêm trên **Chromium thật với SDK Firebase 10.13.2 thật** (project giả, chặn mạng): chuyển hướng đúng, và khi thiếu file thì dừng trước khi khởi tạo Firebase.
