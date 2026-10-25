# Kế hoạch tách posgieo.html — đa cửa hàng và ba phiên bản theo mùa

- Ngày lập: 25/10/2026 (giờ Việt Nam).
- Nguồn đã rà: `Thecafe33/gieo`, nhánh `Phan-tach-unit-engine`, HEAD `0bd95a7`.
- Commit gần nhất sửa `posgieo.html`: `6d8f947`.
- Trạng thái: **kế hoạch để theo dõi; chưa tách code, chưa deploy**.
- Bản rà soát 2: bổ sung quy trình chuyển tiếp, kiểm thực thi từng script, tương thích bridge và thứ tự triển khai chi tiết. Mọi điều kiện nói về kiến trúc đích chỉ được áp dụng sau bước chuyển tiếp đã kiểm chứng.
- Yêu cầu bàn giao đã làm rõ: trong **bộ tải về để upload Firebase Hosting**, các JS riêng POS Gieo nằm ở `js/posgieo/` cạnh vị trí HTML; `posgieo.html` trỏ tới đúng URL Hosting đó. Cấu trúc repo chỉ phục vụ sinh bộ này, không phải mục tiêu sắp xếp của yêu cầu.
- Trước khi thực hiện phải cập nhật lại HEAD, đọc các commit phát sinh và xác nhận phiên bản đang chạy tại cửa hàng.

## 0. Bộ tải về, vị trí upload Firebase và URL chạy thật

Đây là hợp đồng bàn giao cho chủ dự án. Khi triển khai kế hoạch, cung cấp từng ZIP theo mùa, ví dụ `gieo-thuong-<release>.zip`, `gieo-giangsinh-<release>.zip`, `gieo-tet-<release>.zip`. Tên minh họa; các ZIP chưa được tạo trong giai đoạn lập kế hoạch.

Chủ dự án tải **một bộ đúng mùa**. Bên trong ZIP, đường dẫn tính từ gốc bộ là:

```text
posgieo.html
posgieo_thu.html
js/
  posgieo/
    pos_ui.v1.js
    pos_assist.v1.js
    pos_printer.v1.js
    ...đủ các JS mà HTML của release này cần
...các HTML/thư viện dùng chung khác có trong bộ mùa hiện hành
DANH_SACH.txt
```

Các file ví dụ chỉ xuất hiện khi đã được tách. Gói thực tế phải có đủ phụ thuộc đúng release. Không yêu cầu người dùng tải JS riêng, lấy thêm file từ GitHub, tự sửa thẻ script hay tự chọn phiên bản thư viện.

### 0.1. Chép vào đâu trên máy trước khi upload?

Đọc `firebase.json` hiện có để xác định thư mục `hosting.public` của đúng site đang phục vụ `posgieo.html`. Đây là thư mục Firebase upload; không mặc định là thư mục chứa `firebase.json`.

Ví dụ nếu cấu hình đang dùng `"public": "public"`:

```text
thu-muc-chay-lenh-firebase/
  firebase.json
  public/                       ← Firebase upload nội dung thư mục này
    posgieo.html
    posgieo_thu.html
    js/
      posgieo/
        pos_ui.v1.js
        pos_assist.v1.js
        pos_printer.v1.js
```

Giải nén rồi chép **nội dung bộ tải về**, bao gồm cả thư mục `js`, vào `public/`. Nếu cấu hình hiện hành dùng `"public": "."` thì chép vào chính thư mục deploy đó. Nếu dùng tên khác thì theo tên thật trong cấu hình. Không đổi `hosting.public`, tạo Firebase project mới hay thay cấu hình site chỉ để phù hợp ví dụ này.

Không chép thêm tầng `public/gieo-thuong-<release>/posgieo.html` hoặc `public/ban_deploy/thuong/posgieo.html` khi APK đang mở `/posgieo.html`. Không trải phẳng JS ra gốc. Chép/ghép cây thư mục vào bộ hiện có, giữ file của app khác và các version cũ còn được hỗ trợ; không xoá toàn bộ thư mục hosting dùng chung. Nếu Firebase cấu hình nhiều site/target, xác định đúng target hiện hành và dùng quy trình deploy đang có.

### 0.2. HTML trỏ đến file nào trên Hosting?

HTML bàn giao phải có sẵn đường dẫn đúng, ví dụ:

```html
<script src="js/posgieo/pos_assist.v1.js"></script>
```

Với site minh họa `https://ten-site.web.app`:

| File trên máy trong hosting.public | URL sau upload |
| --- | --- |
| `posgieo.html` | `https://ten-site.web.app/posgieo.html` |
| `js/posgieo/pos_assist.v1.js` | `https://ten-site.web.app/js/posgieo/pos_assist.v1.js` |

Khi mở URL HTML trên, trình duyệt tự yêu cầu URL JS ở hàng thứ hai. **Không có `public/`, đường máy tính hoặc đường GitHub trong URL.** Tên miền trên là ví dụ, không phải site đã xác minh. Nếu HTML thực tế đang ở một đường con, đặt `js/posgieo/` cạnh HTML trong đường con đó và kiểm URL resolve tương ứng trước bàn giao; không đổi URL APK đang dùng.

### 0.3. Điều kiện nghiệm thu bộ tải về

- Giải nén chính ZIP bàn giao vào thư mục sạch, phục vụ thư mục tương ứng hosting.public và mở HTML để kiểm; không chỉ chạy bản trong repo.
- HTML tải đầy đủ JS từ `js/posgieo/`, đúng version/checksum và MIME; không 404, không nhận HTML fallback thay JavaScript.
- Kiểm cả thật/thử và ba ZIP theo mùa; các file lõi của cùng release giống nhau, thành phần mùa đúng chính sách.
- Kèm hướng dẫn ngắn trong `DANH_SACH.txt`: chép nội dung vào hosting.public hiện có, bao gồm thư mục js, giữ file/version cũ, dùng đúng site/target hiện hành.
- Sau khi chủ dự án deploy, kiểm URL HTML và URL JS thật trên Hosting, rồi mở APK/browser. Chưa deploy thì chỉ báo đã kiểm gói cục bộ, không tuyên bố URL Hosting đã chạy.

## 1. Quyết định và mục tiêu

Tách theo trách nhiệm và nhu cầu tải, không chia nhiều file chỉ để giảm số dòng. Ưu tiên máy in/quét, trợ lý và ranh giới chương trình theo mùa; thanh toán, kho và ca làm việc làm sau.

Mục tiêu:

1. Giữ một bộ nghiệp vụ chung cho bản thường, Giáng sinh và Tết.
2. Một phiên POS chỉ xử lý đúng cửa hàng đã gắn; không lẫn đơn, tồn, tiền, ca, cache và việc dở.
3. Tính năng mùa thêm/gỡ độc lập, không tạo bản sao thuật toán thanh toán hoặc kho.
4. Tận dụng cache JS, tải khi cần ở những màn phù hợp nếu đo được lợi ích.
5. Chủ dự án vẫn chọn một bộ theo mùa, chép đầy đủ rồi tự deploy như hiện nay.

**Chia file không tự làm giảm CPU, RAM hoặc lượt đọc Firebase.** Nếu vẫn tải và chạy toàn bộ mã, hiệu năng có thể không đổi, lần mở đầu còn có thêm yêu cầu tải. Các bảo đảm trong tài liệu là điều kiện nghiệm thu phải kiểm chứng, không phải chứng nhận bản tách đã chạy đúng.

Không đổi schema, di chuyển dữ liệu thật, thay thuật toán tồn, chính sách quà/tem, cơ chế xác thực hoặc quy tắc ca trong cùng đợt tách. Không triển khai chuyển cửa hàng nóng trong một trang đang chạy.

Phân biệt hai loại công việc: **R (di chuyển/đóng gói mã, bảo toàn hành vi)** và **H (cải thiện hành vi như chống đổi binding ở tab khác, gộp listener hoặc đổi khóa cache)**. Không trộn R và H trong cùng commit. Nếu H là điều kiện bắt buộc để bảo đảm cách ly nhưng bản nền chưa đạt, ghi nhận lỗi nền, sửa/kiểm H trong bước riêng trước khi phát hành R. Không vì test bản nền đã xanh mà coi mọi tình huống đa cửa hàng đã an toàn.

## 2. Hiện trạng cần bảo toàn

`posgieo.html` có 29.620 dòng, 1.937.024 byte; script chính khoảng 26.925 dòng tại mốc nguồn trên.

Đã có các module ngoài: `data_access.v9.js`, `unit_engine.v21.js`, `gieo_automation_pos.v3.js`, `unit_engine2_v1.js`, `unit_engine2_store_v1.js`, `gieo_engine2_pos_v1.js`, `gau_noel_giangsinh.v2.js`.

Các đặc điểm ảnh hưởng việc tách:

- Nhiều biến toàn cục, handler HTML gọi tên hàm và trợ lý bọc hàm qua `window[ten]`.
- Lệnh khởi tạo, timer và listener nằm xen giữa các khai báo; không thể chỉ cắt theo số dòng.
- Test và công cụ kiểm kê đang đọc JavaScript inline trong HTML.
- Công cụ tạo bản thử tìm dòng tạo `fstore` trong HTML để chèn lớp cách ly.
- Ba bộ theo mùa đã được sinh tự động từ nguồn chung; không cần tách JS mới có lợi ích đồng bộ nguồn.

| Commit | Hành vi phải giữ |
| --- | --- |
| `6d8f947` | Trần ly đổi 6 tem = trung bình giá 6 ly tích tem + 3.000đ |
| `6be72cc` | Kiểm hạn đầu ca, chuông và check-out; không hỏi hạn lúc thanh toán |
| `3124df1`, `fb5ec8b` | BTP âm, xử lý/gia hạn hết hạn và giao diện liên quan |
| `282dd00` | Tích hợp Engine 2 vào POS |
| `7f67c97` | Tiền mua thêm, quà giá 0 và ngày nghiệp vụ Việt Nam |

## 3. Hợp đồng đa cửa hàng — bắt buộc

### 3.1. Phân loại dữ liệu theo GieoData.REG

Không suy phạm vi dữ liệu từ tên module. Dùng chung file JS không có nghĩa dùng chung trạng thái hoặc dữ liệu của cửa hàng.

| Loại | Hiện hành | Quy tắc khi tách |
| --- | --- | --- |
| S | Riêng quán: đơn, quỹ, ca, sổ kho, lô, nhận hàng, cấu hình in… | GG01 giữ tên cũ; quán khác dùng hậu tố `__{storeId}` qua lớp dữ liệu |
| C | Danh mục nguyên liệu/BTP theo quán, có tồn riêng | Không đồng bộ trường tồn sang quán khác |
| G | Dùng chung chuỗi: một số cấu hình, công thức, nhân viên, menu RT… | Giữ chia sẻ có chủ đích; không tự thêm hậu tố |
| X | Dùng chung với XOFA/TC33: khách, xác nhận ngân hàng, chương trình gấu… | Giữ giao thức chung; định danh và tác dụng giao dịch vẫn phải đúng |

- Không nhân bản `customers` theo quán hoặc đổi menu G thành riêng từng quán trong đợt này.
- POS không tự bật `catalogMirror` của Quản lý. Cơ chế mirror không được chép các trường tồn C.
- Module nhận `db`/`fstore` đã cài lớp ánh xạ, không tạo client Firebase thứ hai đi vòng qua lớp đó.
- Không tự nối hậu tố trong nghiệp vụ. Không ánh xạ hai lần bằng cách đưa đường đã đổi vào client tự đổi đường.
- Đường dẫn mới phải đăng ký và được `check_paths` kiểm tra. Không dùng GG01 làm mặc định cho scope bị thiếu.

Ngoại lệ hiện hành cần ghi rõ trong test: bản thử chủ động dùng vùng thử GG01 khi chưa có binding thử; đây không phải tự rơi về dữ liệu thật GG01. Bản thật đã gắn GG01 hiện có fallback khi thiếu data_access, còn GG02/chưa gắn bị dừng. Đợt R giữ hành vi này và kiểm đường truy cập; thay đổi fallback nếu cần là H riêng, không âm thầm đổi trong bootstrap.

### 3.2. Một phiên — một cửa hàng

Bootstrap sở hữu context gồm `mode` (thật/thử), `storeId`, định danh phiên và các dịch vụ đã cài. `storeId` cố định trong vòng đời phiên. Tên/địa chỉ có thể cập nhật mà không đổi scope.

- Chưa gắn quán: chỉ chạy luồng đăng nhập/gắn quán, không khởi động nghiệp vụ S/C.
- Giữ cách đăng xuất/đăng nhập rồi reload; không dùng chức năng đổi scope của màn Quản lý để đổi quán nóng trên POS.
- Giữ chốt đăng xuất hiện hành đối với giỏ có món, CK chờ và xác nhận việc dở. Kiểm kê thêm tác vụ đang ghi trước khi gom lifecycle.
- Mỗi giao dịch chụp scope gốc trước `await`. Không đọc storeId mới để ghi tiếp sau khi request cũ trở về.
- Callback thuộc phiên cũ không được cập nhật UI, in hoặc phát sinh tác dụng tiếp theo trong phiên mới.
- Không coi huỷ giao diện là huỷ được transaction đã gửi. Giao dịch đang bay phải được đối soát trong scope gốc, không tự retry ở quán mới.

### 3.3. Nhiều tab/WebView cùng máy

Binding localStorage có thể dùng chung giữa các tab cùng origin. Nếu một tab đổi binding, tab còn lại phải phát hiện qua storage event và khi quay lại foreground, ngừng nhận giao dịch mới và yêu cầu tải lại có kiểm soát. Không đổi scope âm thầm.

Việc dọn cache khi đổi quán không được xoá queue của tab đang xử lý giao dịch. Dữ liệu cũ không rõ chủ sở hữu phải được giữ riêng để xử lý, không gán cho quán mới.

### 3.4. Cache, localStorage và queue

Lập bảng kiểm kê từng cache/khóa: phạm vi S/C/G/X/thiết bị, chủ sở hữu, thời hạn, cách cập nhật, dọn và phục hồi.

- Cache riêng quán khóa theo `mode + storeId + loại dữ liệu + tham số truy vấn`; dữ liệu theo ngày dùng ngày nghiệp vụ Việt Nam.
- Cache dùng chung chỉ chia sẻ khi được xác định rõ. Dữ liệu suy ra có phụ thuộc quán phải chứa storeId dù đầu vào có phần dùng chung.
- Cấu hình in theo quán khác với hiệu chỉnh máy in theo thiết bị; không xoá/ghi đè lẫn nhau.
- Queue checkout, cân, nhận hàng, mẻ nấu giữ scope gốc. Queue quyền lợi khách dùng chung vẫn giữ billId gốc và cơ chế chống áp lại.
- Bản thử tiếp tục cách ly localStorage bằng `che_do_thu`; không chạy hàng đợi bản thật.
- Không đổi tất cả khóa trong bước di chuyển mã. Nếu cần migration: commit riêng, đọc tương thích bản cũ, đánh dấu hoàn tất và kiểm quay lui.
- Queue cũ không rõ quán: chỉ nhận scope nếu chứng minh được từ binding/dấu cũ; nếu không, xử lý riêng, không mặc định GG01.

### 3.5. Listener, timer và tác vụ bất đồng bộ

Module mới có tài nguyên sống phải có `init(context)` và `dispose()` hoặc tương đương; module chỉ chứa phép tính không cần lifecycle giả. Gọi lặp phải an toàn, không tạo thêm listener/timer/hook. Đây là hợp đồng đích cho phần mới; không ép viết lại các JS Engine/bridge đã phát hành chỉ để có cùng API.

- Lưu unsubscribe và đúng callback; không `off('value')` chung làm gỡ listener của module khác.
- Timer, DOM handler, callback scanner và hàm bọc đều có chủ sở hữu/cơ chế dọn.
- Kiểm phiên và scope trước khi áp phản hồi hoặc phát lệnh tiếp theo.
- Gộp request đang tải chỉ trong cùng scope; không gộp GG01 với GG02.
- Phân biệt vòng đời màn với vòng đời phiên: rời màn không được làm mất cơ chế phục hồi giao dịch cần chạy nền.
- Lỗi mạng không được rơi về client chưa ánh xạ hoặc dữ liệu quán khác.

### 3.6. Định danh, Engine, ngân hàng và ảnh

- Giữ mã bill/CK, txId, receipt và marker chống lặp hiện hành; kiểm trùng giữa quán, ngày và máy.
- `bank_confirmations` là X: chỉ nhận xác nhận của đúng mã CK/giao dịch; callback cũ không hoàn tất giỏ mới.
- Unit Engine tiếp tục ghi các nghiệp vụ kho mà nó đang phụ trách; module giao diện không sinh writer kho khác.
- Bridge Engine 2 nhận đúng context; không tự thay chính sách worker, bật active hoặc đổi mức tự động trong đợt tách.
- `receiving_photos_gieogieo` hiện là G, Storage không được data_access bọc; mã phiếu là cơ sở tránh trùng. Kiểm đường ảnh và liên kết phiếu hai quán, không giả định ảnh tự thêm hậu tố. Không di chuyển ảnh cũ.
- Bất biến: thao tác S/C ở A không thay S/C của B. Thay đổi G/X hợp lệ có thể xuất hiện ở cả hai theo đúng chính sách.

### 3.7. Giới hạn bảo đảm

Đây là kế hoạch bảo vệ tính đúng đắn của ứng dụng khi refactor. Ánh xạ client không thay Firebase Security Rules/kiểm soát backend. Không tuyên bố tạo ranh giới bảo mật tenant mới và không đổi cơ chế xác thực trong phạm vi này.

## 4. Khởi động và giao tiếp giữa module

Giai đoạn đầu dùng script thường, thứ tự xác định, giữ các tên global cần cho HTML/native bridge. Chưa chuyển toàn bộ sang ES module hoặc thêm framework/bundler. Có danh sách global tương thích; tránh tạo thêm tùy ý. Trình tự dưới đây là đích cần đối chiếu bằng trace khởi động, không phải lệnh viết lại toàn bộ bootstrap trong Đợt 0.

Trình tự logic:

1. Tải SDK, lớp dữ liệu, định nghĩa module; file được tải không tự chạy nghiệp vụ.
2. Bản thử kiểm module cách ly trước khởi tạo Firebase; cài lớp thử đúng vị trí đã kiểm chứng.
3. Xác định binding, tạo client/cài GieoData một lần theo thứ tự đúng; chưa gắn quán chỉ chạy luồng gắn quán.
4. Kiểm module/phiên bản thiết yếu, tạo trạng thái/context và xác thực theo luồng hiện hành.
5. Khởi tạo Engine sau khi trạng thái và callback cần thiết đã có; đảm bảo DOM/dữ liệu sẵn sàng tại đúng mốc.
6. Gắn hooks/bridge một lần, bắt đầu listener/công việc nền tại các mốc phù hợp.
7. Mở thao tác bán khi các chốt hiện hành và readiness của mã đã đạt.

Tải file có thể song song, init phải theo phụ thuộc. Không dùng `async` cho các script phụ thuộc nhau khi chưa có điều phối readiness. Một `throw` trong file riêng không tự ngăn script sau chạy.

Phân biệt module thiết yếu/tùy chọn. Thiếu mã thanh toán hoặc lớp cách ly không được cho giao dịch chạy nửa chừng. Lỗi đọc dữ liệu vẫn giữ chính sách fallback hiện hành, không thêm chốt bán không liên quan. Lỗi module mùa không được tự cấp quyền lợi khi chưa có cấu hình; giữ chính sách lỗi đã xác định.

### 4.1. Quy trình chuyển tiếp đã chốt

1. **Giữ khối tạo Firebase, cài lớp thử, đọc binding và cài GieoData trong HTML ở đợt đầu.** `pos_bootstrap.v1.js` là đích về sau, không là file phải chuyển đầu tiên. Công cụ tạo bản thử/bản đo vẫn có điểm chèn ổn định trong thời gian này.
2. Giữ thứ tự: chốt bản thử trước Firebase initialize; sau tạo db/fstore thì `GieoThu.install` trước đọc binding/localStorage nghiệp vụ và trước `GieoData.install`; không tạo reference S/C trước khi các lớp đã cài. Khi di chuyển phải kiểm cả thứ tự tương đối của persistence, auth, UnitEngine và request đầu tiên; không vô tình thay chế độ persistence.
3. Mỗi lần chọn một cụm: lập bảng khai báo, biến đọc/ghi, caller, handler HTML/native, top-level side effect và thời điểm cần sẵn sàng. Nếu các cụm phụ thuộc vòng, giữ cùng nhóm chuyển hoặc dùng adapter nhỏ; không chữa bằng timeout chờ may rủi.
4. `let`/`const`/`class` toàn cục của script thường không phải thuộc tính `window`; giữ đúng kiểu truy cập của caller. `const POSPrinter`, `const POSTemPrinter` và các class in là ví dụ cần kiểm. Không đổi hàng loạt sang `window.*` hoặc bọc IIFE làm mất tên mà bridge đang dùng.
5. Hoisting của function trong script cũ không còn bảo đảm qua ranh giới file: khai báo ở file sau chưa tồn tại khi file trước chạy. Đưa khai báo cần thiết ra trước side effect một cách có kiểm tra, không chỉ giữ nguyên thứ tự các đoạn cắt.
6. File chuyển ra ngoài có thể giữ side effect tại mốc tương đương trong bước R nếu đã chứng minh không nhân đôi; tách side effect sang lifecycle là bước riêng. Không đồng thời đổi scope, tên hàm, thuật toán và thời điểm init.
7. Mỗi hàm/state chỉ còn một định nghĩa nguồn. Handler tương thích chỉ chuyển tiếp tới định nghĩa đó; không giữ cả bản inline lẫn bản JS hoạt động.
8. Lúc chưa tách xong, bảng tải có thể gồm inline + JS ngoài. Không dùng `async`, không thêm `defer` tùy ý để che lỗi thứ tự; giữ mốc DOM/DOMContentLoaded đã đo và test với mạng chậm.

### 4.2. Bridge/hook cần bảo toàn

`gieo_automation_pos.v3.js` và `gieo_engine2_pos_v1.js` tự gắn khi DOMContentLoaded hoặc ngay nếu DOM đã sẵn sàng. Chúng lấy hàm từ `window`; Engine 2 còn tham chiếu trực tiếp `POS_STORE` và các biến/hàm ứng dụng. Vì vậy:

- Hàm đích phải tồn tại trước lúc bridge cài hook; có assertion hook được gắn, không chỉ kiểm global bridge tồn tại.
- Giữ thứ tự bọc hàm giữa trợ lý, automation, Engine 2 và chương trình mùa; kiểm giá trị trả về, Promise, lỗi và `this` không đổi.
- Không khai báo lại/gán lại hàm gốc sau khi bridge đã bọc vì sẽ làm mất hook.
- Test cả DOM đang tải và DOM đã sẵn sàng, auth có sẵn và auth trả chậm.
- Không sửa tay file đã phát hành. Nếu cần đổi bridge, tạo version theo quy tắc repo và test cặp HTML/bridge cũ-mới cần hỗ trợ; ưu tiên giữ tương thích để không mở rộng phạm vi.

### 4.3. Hợp đồng lỗi tải trước khi đưa module ra ngoài

Mỗi cụm sắp tách phải ghi: ai tải, phụ thuộc, tín hiệu đăng ký đã thành công, điều kiện được gọi, hành vi khi lỗi và cách retry. `onload` của thẻ script chỉ báo tải, không đủ chứng minh toàn bộ init thành công. Không đánh dấu ready trước khi đăng ký API và khởi tạo bắt buộc hoàn tất.

| Lỗi | Hành vi bắt buộc |
| --- | --- |
| Thiếu/sai JS nghiệp vụ thiết yếu | Hiện lỗi và khả năng tải lại; handler ghi dữ liệu kiểm readiness, không chỉ che nút bằng CSS |
| Một script lỗi giữa chừng nhưng các script sau vẫn chạy | Script sau không tự bắt đầu nghiệp vụ phụ thuộc; giữ trạng thái lỗi của phiên |
| Người dùng bấm sớm / native callback đến sớm | Không gọi phần chưa sẵn sàng; không ghi hoặc nhận mã vào phiên sai |
| Tải lại file sau lỗi | Không evaluate lần hai file đã khai báo `let/const/class` ở global; ưu tiên reload trang có kiểm soát khi chưa có loader hỗ trợ retry an toàn |
| Lỗi đọc dữ liệu/auth | Giữ nhánh fallback và giới hạn của bản nền; không tự đổi quán/client, không vô tình kích hoạt hai đường init |
| Thiếu tính năng tùy chọn | Chỉ ảnh hưởng tính năng đó theo chính sách đã ghi; không giả lập kết quả thành công |

Do global lexical binding khó dỡ sau lỗi evaluate, không xây hot-reload module trong phạm vi này. Kiểm cả handler inline, lời gọi trực tiếp từ bridge và đường retry, không chỉ nút chính.

## 5. Bản đồ module mục tiêu

Tên dự kiến, không bắt buộc tạo tất cả ngay. **Mọi JS mới tách riêng từ POS Gieo đặt trong `js/posgieo/`**, không rải ở gốc deploy. Các tên file trong bảng dưới đây đều tương đối với thư mục đó; module mùa và thư viện đang dùng chung giữ vị trí hiện hành theo mục 5.1.

| Nhóm | File dự kiến | Trách nhiệm |
| --- | --- | --- |
| Nền tảng | `pos_bootstrap.v1.js`, `pos_data.v1.js`, `pos_ui.v1.js` | Context/readiness, cache dùng chung, chuyển màn/hộp thoại; không thay GieoData |
| Thiết bị | `pos_printer.v1.js`, `pos_scanner.v1.js` | In/quét, kết nối, reconnect, watchdog |
| Trợ lý | `pos_assist.v1.js` | Gợi ý, hiển thị, ghi nhận; giữ hooks cũ trước |
| Kho/nhận hàng | `pos_stock_ui.v1.js`, `pos_receiving.v1.js` | Form, tem, kiểm kê, phiếu/ảnh; gọi Engine |
| Chế biến/hạn | `pos_prep.v1.js`, `pos_expiry.v1.js` | Mẻ/cân và kiểm hạn dùng chung đầu ca/chuông/check-out |
| Ca/quỹ | `pos_shift.v1.js`, `pos_shift_closing.v1.js`, `pos_cashfund.v1.js` | Check-in/out, điều phối bàn giao/kết ca, tiền quỹ |
| Bán hàng | `pos_cart.v1.js`, `pos_catalog_admin.v1.js` | Giỏ/size/topping/đá và màn sửa danh mục |
| Khách/quyền lợi | `pos_customers.v1.js`, `pos_loyalty.v1.js` | Tra khách, điểm/tem/quà, retry |
| Thanh toán | `pos_checkout.v1.js`, `pos_payment.v1.js` | Điều phối ghi đơn; TM/CK/tính riêng |
| Sau bán/báo cáo | `pos_orders.v1.js`, `pos_reports.v1.js` | Mua thêm, huỷ/bổ sung, lịch sử/doanh thu |
| Mùa | Các module mùa hiện có | Giữ đúng phạm vi áp dụng; không chép lại checkout |

Mỗi trạng thái có một chủ sở hữu. Không để từng file tạo bản sao cart, cache nhân viên, danh mục hoặc SDK client. Di chuyển nguyên mã trước, đổi API/state trong commit sau để đối chiếu được.

### 5.1. Cấu trúc thư mục đã chốt

Ví dụ cấu trúc đích, tạo file theo từng đợt chứ không tạo sẵn toàn bộ:

```text
<thu_muc_deploy>/
├── posgieo.html
├── posgieo_thu.html
├── quanlygieo.html
├── pos.html
├── PosX.html
├── js/
│   └── posgieo/
│       ├── pos_ui.v1.js
│       ├── pos_data.v1.js
│       ├── pos_assist.v1.js
│       ├── pos_printer.v1.js
│       ├── pos_scanner.v1.js
│       └── ...các module POS Gieo được tách ở đợt sau
├── data_access.v9.js          # thư viện hiện có dùng chung, giữ URL cũ
├── unit_engine.v21.js         # thư viện hiện có dùng chung, giữ URL cũ
└── ...các file hiện hành của app khác/chương trình dùng chung
```

- Nguồn repo và `ban_deploy/thuong`, `ban_deploy/giangsinh`, `ban_deploy/tet` đều giữ đường tương đối `js/posgieo/...`; không đổi cấu trúc theo mùa.
- HTML dùng đường tương đối, ví dụ `<script src="js/posgieo/pos_assist.v1.js"></script>`. Không dùng đường tuyệt đối của máy phát triển. Giữ tên file có version để cache/quay lui.
- `posgieo.html`, `posgieo_thu.html` và bản đo có thể nạp cùng JS nghiệp vụ; thật/thử và cửa hàng được xác định qua context/lớp dữ liệu, không hardcode trong file hoặc nhân bản JS cho GG01/GG02.
- Chỉ JS thuộc riêng POS Gieo vào thư mục này. Không chuyển JS của TC33/XOFA/Quản lý vào đó, không chép Engine hay data_access thành một bản riêng cho POS.
- `pos_bootstrap` chỉ xuất hiện khi tới bước chuyển bootstrap đã nghiệm thu; cấu trúc thư mục không làm thay đổi quyết định giữ bootstrap inline ban đầu.
- JS riêng POS đã có ở gốc chỉ chuyển URL sau khi kiểm tất cả caller/tool. Bước đầu vẫn có thể để bridge hiện hành ở gốc để giữ tương thích; ghi rõ trong manifest những ngoại lệ đang giữ lại.
- Thư viện chung hiện có tiếp tục ở gốc. Nếu sau này muốn dọn cả chúng, dùng đợt riêng cho `js/shared/`, kiểm mọi HTML liên quan và giữ URL cũ còn được tham chiếu. Không mở rộng đợt này thành chuyển toàn bộ JS của hệ thống.
- Không tạo thư mục theo cửa hàng hoặc theo mùa cho cùng một lõi. Thư mục phân biệt chủ sở hữu mã, không phải cơ chế cách ly dữ liệu.

### 5.2. Thay đổi công cụ phải làm trước khi đưa file vào thư mục

`tools/tao_bo_deploy.js` hiện dò tên JS đơn giản ở gốc và ghi file theo tên; không thể chỉ tạo thư mục rồi coi đóng gói sẽ tự đúng. Cập nhật ở bước 0C:

1. Resolver/manifest nhận đường tương đối đầy đủ như `js/posgieo/pos_ui.v1.js`, giữ nguyên đường khi đóng gói, không lấy basename làm khóa (tránh đè file trùng tên của app khác).
2. Đóng gói tạo thư mục cha trước khi ghi, sao chép cả cây file được manifest tham chiếu và các version cũ còn hỗ trợ. `DANH_SACH.txt` ghi đầy đủ đường tương đối.
3. `tao_ban_thu.js`, `tao_ban_dem.js` khi xuất sang thư mục khác cũng chép đủ JS phụ thuộc và giữ cây thư mục; không chỉ chép các JS Engine/data_access ở gốc như hiện tại.
4. Test loader, AST inventory, boundary/path checks và predeploy theo được đường lồng nhau, báo lỗi đúng file/dòng. Giữ vai trò POS/QL theo chủ sở hữu/entry trong manifest, không suy chỉ từ basename hoặc việc file nằm ở gốc.
5. Kiểm URL tài nguyên trong JS. Với script thường, `fetch('...')` và URL gán DOM thường được resolve theo trang, không tự theo thư mục JS. Ghi rõ base dùng cho từng tài nguyên, kiểm cả khi trang nằm dưới đường dẫn con; không tự thêm `../` hàng loạt. Loader động giữ URL/version chính xác của release.
6. Rà Firebase Hosting `public`, `ignore`, cache headers và rewrites: thư mục mới phải được phục vụ, đúng MIME JavaScript; JS bị thiếu không được nhầm là thành công khi server trả HTML fallback. Kiểm HTTP và thực thi, không chỉ kiểm tồn tại trên đĩa.
7. Cập nhật ZIP/gói giao file nếu có để giữ thư mục. Khi chuyển tên/đường một JS đã phát hành, giữ file tại URL cũ trong thời gian hỗ trợ, kể cả file cùng nội dung đã có ở vị trí mới; không sửa nội dung version cũ.

Chủ dự án vẫn chỉ cần chép toàn bộ bộ mùa, **bao gồm thư mục `js/`**, vào thư mục deploy rồi chạy lệnh như trước; không tự trải phẳng các JS ra gốc hoặc chọn từng file con.

## 6. Ba bộ theo mùa và cache phát hành

| Thành phần | Thường | Giáng sinh | Tết |
| --- | --- | --- | --- |
| Lõi POS Gieo | Cùng version/nội dung | Cùng version/nội dung | Cùng version/nội dung |
| Gấu Noel | Không tải | Theo cấu hình hiện hành | Không tải |
| Lì xì | Không tải | Không tải | Chỉ app đã tích hợp; không tự thêm vào POS Gieo |
| Quán | Theo binding | Theo binding | Theo binding |
| Bản thử | Cách ly | Cách ly | Cách ly |

Mùa không phải storeId, không tạo sổ kho/đơn mới. Đổi mùa giữ binding và dữ liệu quán; việc dở phục hồi đúng chính sách.

Yêu cầu:

1. Sinh `ban_deploy/{thuong,giangsinh,tet}` tự động, không sửa tay.
2. Manifest release liệt kê JS, version, checksum, phụ thuộc, module thiết yếu/mùa. Không bắt buộc thêm request manifest ở runtime.
3. Lõi cùng release trong ba bộ phải có checksum giống nhau.
4. HTML và JS đi cùng bộ; JS đã phát hành không ghi đè nội dung dưới tên cũ. Giữ JS cũ cho máy còn cache HTML cũ.
5. `tao_bo_deploy.js` gom đủ cả JS tải động; không chỉ dựa vào quét thẻ script. Bổ sung giữ các version POS JS cũ còn được hỗ trợ.
6. Kiểm headers HTML/JS. Cache có lợi khi URL, version và Hosting headers đúng; không khẳng định tiết kiệm trước khi đo.
7. Nếu lazy-load: gộp lượt tải, timeout/retry rõ, không init hai lần, không tải nhầm mùa.

Danh sách module/phiên bản là một nguồn cấu hình phát hành duy nhất; HTML, trình đóng gói và test resolver phải được sinh hoặc kiểm nhất quán với nguồn đó. Không duy trì ba danh sách thủ công dễ lệch nhau. Đặt thời hạn giữ tài nguyên cũ theo phiên bản còn được hỗ trợ/thiết bị còn cache và cửa sổ rollback; không xoá chỉ vì đang ở mùa khác.

## 7. Lộ trình

### Đợt 0 — Hàng rào và vòng đời

- Chốt mốc nền, bản đồ global/caller/top-level/native hooks và bảng scope cache/queue.
- Xây bộ đọc nguồn HTML + JS cục bộ theo phụ thuộc cho test/AST.
- Cập nhật `tests/lib/extract.js`, test đọc HTML trực tiếp, `ast_inventory`, `check_boundaries`, `check_paths`, predeploy để quét đầy đủ module ngoài.
- Cập nhật `tao_ban_thu.js` trước khi chuyển bootstrap: không còn phụ thuộc mù vào dòng `fstore` trong HTML; kiểm thiếu lớp thử thì dừng trước truy cập thật.
- Rà `tao_ban_dem.js` và E2E chèn/trích script; tránh test/đo thiếu JS ngoài.
- Thiết kế readiness/init/dispose, xử lý thiếu file thiết yếu; chưa lazy-load nghiệp vụ.

Thực hiện tuần tự thành các bước nhỏ:

| Bước | Sản phẩm cụ thể | Điều kiện đi tiếp |
| --- | --- | --- |
| 0A | Checkout/worktree riêng đúng SHA của nhánh đích; baseline toàn bộ test, trace boot và danh sách lỗi đã có | Không dùng nhầm nhánh `work`/main; không đụng thay đổi người dùng; biết rõ lỗi nền |
| 0B | Bảng phụ thuộc/global/state/side effect, danh sách phạm vi dữ liệu và manifest module dự kiến | Mọi cụm sắp chuyển có caller/callee/chủ sở hữu; không có phụ thuộc vòng chưa xử lý |
| 0C | Bộ đọc nguồn chung, test loader thực thi từng script, các tool quét/đóng gói hỗ trợ `js/posgieo/` | Cài thử lỗi trong JS ngoài làm đúng test/checker thất bại; cây thư mục giữ nguyên trong nguồn/bản thử/bản đo/ba bộ mùa |
| 0D | Thử một cụm hàm thuần nhỏ đã có test, không Firebase/native/hook, vào file nền dự kiến dùng lâu dài | HTML + JS thực thi thật qua HTTP, bản thử/bộ mùa đúng, so hành vi với baseline |
| 0E | Chốt hợp đồng khởi động/lỗi tải; xử lý các H cách ly bắt buộc đã phát hiện trong commit riêng | Kiểm scope, file thiếu, callback muộn và rollback đạt trước khi mở rộng |

0D chỉ là bài chứng minh đường chuyển và công cụ, không tạo hàng chục file helper. Chọn cụm chính xác từ inventory 0B, đưa vào `pos_ui` hoặc module sở hữu phù hợp; không chạm thuật toán ghi đơn/kho. Nếu 0D thất bại, sửa loader/ranh giới trước, không tiếp tục tách các cụm lớn.

**Qua đợt:** công cụ nhìn thấy toàn bộ mã; GG01/GG02/thật/thử đúng scope; thiếu module không chạy giao dịch nửa chừng.

### Đợt 1 — Thiết bị, trợ lý và mùa

- Tách cụm in/quét và trợ lý, giữ API Android/handler ngoài.
- Thay reconnect/timer/hook trong commit riêng sau bước chuyển mã.
- Kiểm một listener cấu hình in/một bộ watchdog cần thiết. `syncPrinterLayoutFromCloud` hiện gọi trước và sau auth; gộp phải kiểm cả lỗi auth/reconnect.
- Giữ module mùa và chính sách quà hiện hành, nối qua API rõ dần.

Không coi toàn bộ máy in là một khối dễ cắt: `POSPrinter`, `POSTemPrinter`, dựng nội dung tem kho/BTP và native bridge nằm ở các vùng khác nhau. Làm từng tiểu đợt: (1A) trợ lý hoặc cụm độc lập được inventory chứng minh, một module/lần; (1B) transport/kết nối in-quét, giữ lời gọi tạo nội dung qua adapter; (1C) phần tạo nội dung/in tem theo nghiệp vụ khi đã rõ phụ thuộc kho/BTP; (1D) kiểm tích hợp hooks theo mùa. Có thể giữ phần tem nghiệp vụ trong HTML tới Đợt 2 nếu tách sớm gây vòng phụ thuộc. Mỗi tiểu đợt có điểm quay lui riêng.

**Qua đợt:** browser/APK in/quét đúng, không listener/hook trùng, không dùng cấu hình quán trước; ba bộ đủ đúng module.

**Có thể dừng ở đây** nếu mục tiêu chỉ là tính năng độc lập/ba mùa. Không bắt buộc tách hết.

### Đợt 2 — Kho, nhận hàng, chế biến và hạn dùng

Tách UI/state, tái dùng cache/Engine/receipt, giữ đơn vị nhận hàng/FIFO/cân mù/retry. Hạn dùng dùng chung đầu ca/chuông/check-out, không thêm cổng hạn vào thanh toán.

**Qua đợt:** snapshot và log giao dịch trước/sau giống nền, không writer mới, thao tác A không đổi S/C của B.

### Đợt 3 — Ca, kết ca và quỹ

Một bộ điều phối thứ tự kết ca, màn con trả kết quả. Kiểm qua nửa đêm Việt Nam, nhiều máy/quán, tab cũ và callback muộn.

**Qua đợt:** tiền/trạng thái ca đúng nền; không trộn phiếu dù cùng ngày/nhân viên.

### Đợt 4 — Giỏ, khách, quyền lợi, thanh toán và sau bán

Tách sau cùng; giữ các luồng bán thường/tính riêng/mua thêm/huỷ/bổ sung, thứ tự ghi, idempotency và queue. Không đồng thời viết lại thành thuật toán chung. Phân biệt khách dùng chung với bill/tồn/quỹ riêng quán.

**Qua đợt:** retry không trùng bill/tiêu hao/quyền lợi; CK A không hoàn tất đơn B; reload phục hồi đúng scope.

### Đợt 5 — Tối ưu có đo, tùy chọn

Đo thời gian tới lúc bán được, mở màn, lượt đọc/ghi, listener và RAM sau nhiều lần mở/đóng. Cân nhắc lazy-load báo cáo/quản trị/danh sách khách/cấu hình thiết bị; không trì hoãn chốt nghiệp vụ thiết yếu.

Danh sách khách hiện đọc các trang liên tiếp tới hết rồi mới hiển thị: nếu đổi sang tải theo nhu cầu, phải giữ đúng tìm kiếm/sắp xếp và làm riêng. Không gỡ bộ đệm sống đã có.

**Qua đợt:** không thoái lui độ đúng, không tăng đọc/ghi ngoài dự kiến; cải thiện có số đo trên thiết bị đại diện.

## 8. Ma trận nghiệm thu

Dùng Firebase giả/emulator và vùng thử, không dùng giao dịch thật để thử lỗi. So sánh cả log đường truy cập lẫn snapshot trước/sau; màn hình đúng chưa đủ chứng minh cách ly.

Ma trận nền: **3 mùa × 2 chế độ thật/thử được mô phỏng × 3 scope GG01/GG02/chưa gắn**. Thêm GG03 để bắt hardcode GG02. Bộ nghiệp vụ chung có thể dùng bằng chứng checksum và các bài tích hợp có chủ đích, không cần lặp máy móc mọi bài trên mọi tổ hợp.

| Kịch bản | Điều kiện đạt |
| --- | --- |
| GG01 bán, kho, ca | Đường cũ giữ nguyên, không chuyển dữ liệu |
| GG02/GG03 làm tương tự | S/C đúng hậu tố, không chạm quán khác |
| Hai quán cùng itemId/ngày/staffId/mã cục bộ | Không gộp cache/request/ca/tồn |
| Hai máy cùng quán và retry | Đồng bộ đúng, không tác dụng trùng |
| Hai quán ghi đồng thời | S/C riêng; G/X đúng chính sách chung |
| Chưa gắn quán/thiếu data_access | Không tự chọn GG01; kiểm fallback GG01 hiện hành riêng nếu giữ |
| Một tab đổi binding | Tab khác ngừng nhận đơn mới, không đổi scope nóng hoặc mất queue |
| Response/listener/scan trả muộn | Không áp vào phiên/quán mới |
| Đăng xuất khi CK/bill/cân/mẻ dở | Giữ chốt và cách xử lý rõ, không chuyển việc sang quán khác |
| Mất ACK, reload, retry | Đúng một lần, đúng quán/bill gốc |
| Khách mua ở hai quán | Quyền lợi chung đúng; tiền/tồn không trộn |
| CK A đến khi mở B | Không xác nhận đơn B |
| Ảnh nhận hàng hai quán | Không ghi đè/liên kết nhầm phiếu |
| Bản thử thiếu module cách ly | Không truy cập nghiệp vụ thật/queue thật |
| Mở/đóng màn 20 lần, init/dispose lặp | Không tăng listener/timer/hook ngoài thiết kế |
| Nửa đêm/quay lại foreground | Đúng ngày Việt Nam/scope, không listener ngày cũ trùng |
| Đổi mùa | Binding/dữ liệu/queue giữ đúng; tính năng mùa cũ không hoạt động sai |
| HTML cũ sau release mới | Các JS tương thích vẫn tồn tại |
| Xuất từng bộ sang một thư mục trống rồi mở qua HTTP | `js/posgieo/...` đủ file/đúng MIME, không 404, không phụ thuộc file sót của release trước |
| Bản thử/bản đo xuất sang thư mục khác | Giữ đúng cây JS và cách ly/đo như thiết kế; bài thử dùng backend giả |
| Cùng basename ở thư mục của hai app | Manifest/đóng gói không ghi đè; loader tải đúng đường đầy đủ |
| Trang chạy ở gốc và dưới đường dẫn con | URL JS/tài nguyên resolve đúng, không hardcode host hoặc nhầm base |
| URL JS cũ ở gốc sau chuyển thư mục | HTML cũ vẫn tải được version đã ghim trong thời gian hỗ trợ |
| Thiếu/sai version JS thiết yếu | Lỗi rõ, không ghi nửa chừng do thiếu mã |
| Mirror danh mục | Chỉ đúng luồng Quản lý; tồn C không đồng bộ sang quán khác |

Mỗi đợt chạy test liên quan, kiểm cú pháp JS, đường dẫn và ranh giới. Hoàn tất đợt chạy quy trình sinh/test chung; kiểm DOM và APK cho native bridge.

```sh
sh tools/sinh_lai_tat_ca.sh
node tools/check_boundaries.js
node tools/check_paths.js
# Chủ dự án kiểm trước khi tự deploy:
sh tools/predeploy_check.sh <thu_muc_deploy>
```

`sinh_lai_tat_ca.sh` hiện đã chạy test chung; không cần lặp không lý do. Các lệnh trên chỉ đủ sau khi được cập nhật để quét JS ngoài. Bổ sung bài scope/lifecycle có hành vi thật, không chỉ kiểm chuỗi tên hàm.

### 8.1. Hai tầng loader, không đánh đồng

- **Bộ đọc nguồn** phục vụ trích hàm/AST: trả về file, vị trí, thứ tự và mã; có thể tổng hợp để tìm tên, nhưng giữ xuất xứ cho báo lỗi/allowlist.
- **Bộ thực thi tích hợp** tải từng script theo HTML/manifest trong cùng môi trường trình duyệt hoặc VM có ngữ nghĩa phù hợp. Không nối tất cả mã thành một script lớn: cách đó tái tạo hoisting cũ và che lỗi tải/TDZ/khai báo trùng của bản tách.
- Browser test qua HTTP tải thực các JS cục bộ; chặn mạng backend ngoài fixture, không vô tình dùng Firebase thật. Tải chậm/404/sai nội dung/sai MIME/auth chậm phải được mô phỏng.
- Resolver dùng đúng version HTML/manifest ghim, không chọn file có số version cao nhất trên đĩa. `tests/lib/wrap_harness.js` hiện có đoạn chọn data_access cao nhất; cập nhật để test đúng tài nguyên phát hành. Rà `core_loader.js` và các harness trích hằng/init từ HTML, không chỉ `extract.js`.
- Kiểm nguồn không bỏ qua alias như `context.fstore` hoặc helper bọc truy cập. Bài thử cài lỗi phải bao gồm một ghi kho sai ranh giới và một đường chưa đăng ký trong JS ngoài. Bất kỳ miễn trừ nào phải giữ lý do cụ thể, không mở allowlist cả file.

### 8.2. Đối chiếu trước–sau và giới hạn mock

Lưu baseline cố định theo SHA. Chạy cùng seed, đồng hồ và kịch bản trên bản nền và bản tách; so số tiền, field bill, thứ tự tác dụng quan trọng, path đọc/ghi, trạng thái kho, marker và queue. Chỉ chuẩn hóa timestamp/ID ngẫu nhiên đã liệt kê; không chuẩn hóa bỏ storeId, tiền hoặc số lượng. Chạy thêm assertion độc lập về cách ly để không sao chép nguyên lỗi nền.

Test hai quán phải có hai context/client độc lập cùng backend giả, có dữ liệu mồi giá trị khác nhau nhưng trùng ID logic. Không chỉ chạy GG01 rồi xoá toàn bộ mock để chạy GG02: cách đó không bắt được chồng lấn đồng thời. Kiểm cả đọc lẫn ghi; dùng chung G/X theo allowlist nghiệp vụ, không miễn mọi truy cập G/X vô điều kiện.

Fake Firebase hiện có giới hạn; trước test mới phải xác nhận mock hỗ trợ đúng transaction, listener, cache/offline và query mà bài test cần. Bổ sung mock hoặc dùng emulator/browser phù hợp, không coi mock im lặng bỏ thao tác là đạt. Browser test giả không chứng nhận Security Rules hay thiết bị in thật.

Không hứa exactly-once cho giấy in qua native khi mất phản hồi: phân biệt giao dịch dữ liệu chống lặp với kết quả thiết bị chưa rõ. Kiểm phục hồi không tự in lặp ngoài chính sách và có đường in lại rõ ràng theo hành vi hiện hành.

### 8.3. Tiêu chí chấp nhận đo được

| Nội dung | Tiêu chí |
| --- | --- |
| Đúng dữ liệu | Không có sai khác nghiệp vụ ngoài danh sách H đã kiểm riêng |
| Cách ly | 0 đọc/ghi S/C ngoài scope dự kiến; 0 tác dụng callback cũ vào scope mới |
| Nguồn và bộ deploy | 0 hàm/state trùng hoạt động; 0 file thiếu; version/checksum lõi đúng trên 3 bộ |
| Vòng đời | Không tăng tài nguyên sau vòng mở/đóng lặp; số tài nguyên trở về mức phiên hợp lệ, không bắt buộc về 0 khi còn listener nền cần thiết |
| Lượt Firebase trong R | Cùng fixture/lịch chạy: không tăng lượt đọc/ghi so baseline nếu không có H giải thích riêng |
| Hiệu năng | Đo cold/warm start trên cùng thiết bị/điều kiện; lưu trung vị và khoảng dao động, chốt ngưỡng chấp nhận trước sửa; không lấy một lần đo làm bằng chứng |
| Thiết bị | Browser mock đạt và kiểm APK/in/quét thật trước công bố sẵn sàng cho cửa hàng |

Thiếu thiết bị hoặc dữ liệu đo phải đánh dấu “chưa nghiệm thu phần này”, không báo hoàn thành toàn đợt phát hành.

## 9. Phát hành và quay lui

- Mỗi đợt có commit chuyển mã riêng; tối ưu/đổi hành vi là commit riêng.
- Ghi manifest, kết quả test, giới hạn chưa kiểm và bộ deploy sinh lại.
- Giữ release cũ; schema queue/storage phải đọc tương thích để quay lui. Nếu cần đổi, có migration và test rollback trước.
- Thử ít nhất hai quán ở vùng thử; chủ dự án quyết định triển khai, kiểm máy đại diện. Không tự deploy.
- Quay lui cả HTML và tập JS tương thích, giữ tài nguyên version cũ/mới cần cho máy còn cache.
- Không xoá queue/dữ liệu nghiệp vụ để che lỗi. Giao dịch đã gửi phải đối soát theo scope/ID gốc trước khi retry.

Không dựa vào việc đổi bộ Hosting để cập nhật đồng thời các tab đang mở: tab cũ có thể chạy tiếp. Phải kiểm phiên cũ sống cùng phiên mới, schema queue/marker tương thích và không ép reload giữa giao dịch. Chỉ lazy-load theo URL/version đã ghim của chính release đang chạy, không gọi tên “latest”.

Sinh bộ trong thư mục làm việc riêng. Chạy lại công cụ sinh với cùng nguồn phải ra cùng tập file/nội dung (ngoại trừ metadata đã khai báo); không sửa source qua bước sinh một cách ngoài dự kiến. Rà diff các app dùng chung như quanlygieo/quanlygieo2/TC33/XOFA: chỉ thay đổi đã giải thích, không kéo cải tiến ngoài phạm vi vào release POS.

Khi nghiệm thu vùng thử đạt, chủ dự án có thể triển khai trên máy/quán đại diện ở thời điểm không có giao dịch đang dở, theo dõi một chu kỳ gồm mở ca, bán, in/quét, kết ca và mở lại. Nếu không có cửa hàng thật thứ hai để kiểm, giữ ghi chú đa quán chỉ mới được chứng minh trên fixture/vùng thử, không báo đã xác minh sản xuất nhiều quán.

## 10. Bảng theo dõi

| Đợt | Trạng thái | Commit/release | Bằng chứng cần lưu |
| --- | --- | --- | --- |
| 0. Hàng rào/lifecycle | Chưa làm | — | Bản đồ phụ thuộc, scope, bootstrap/thử/JS ngoài |
| 1. Thiết bị/trợ lý/mùa | Chưa làm | — | APK/browser, listener, checksum ba bộ, đổi quán |
| 2. Kho/nhận/chế biến | Chưa làm | — | Snapshot/log giao dịch, retry, cách ly S/C |
| 3. Ca/quỹ | Chưa làm | — | Tiền, ngày VN, nhiều máy/quán |
| 4. Thanh toán/sau bán | Chưa làm | — | TM/CK/tính riêng/addon/huỷ/quyền lợi/mất ACK |
| 5. Tối ưu tùy chọn | Chưa làm | — | Đo trước-sau, lượt đọc/ghi |

Điều kiện hoàn thành mỗi đợt:

- [ ] Bảo toàn hành vi tại mốc nền.
- [ ] Test/công cụ quét được mọi module ngoài.
- [ ] Dữ liệu/cache/queue/tác vụ có phạm vi/chủ sở hữu rõ.
- [ ] Không truy cập S/C ngoài quán; G/X được giải thích đúng chính sách.
- [ ] Thật/thử cách ly; ba bộ đủ đúng JS/version.
- [ ] JS riêng POS nằm trong `js/posgieo/`; mọi bộ giữ cây thư mục, không thiếu file hoặc trải phẳng khi đóng gói.
- [ ] Không listener/timer/hook hoặc tác dụng retry trùng.
- [ ] Có bằng chứng kiểm thử, giới hạn và rollback.

## 11. Bằng chứng nền và tham chiếu

Đã chạy thành công sáu bộ test trên bản chưa tách: `stamp_cap`, `btp_am_pos`, `engine_api`, `live_cache`, `che_do_thu`, `bo_deploy`. Chưa chạy toàn bộ hệ thống trong đợt rà này, chưa đo APK, chưa thử giao dịch Firebase thật; đây không phải chứng nhận bản refactor.

Đọc khi triển khai: `CLAUDE.md`, `docs/TRANG_THAI.md`, `docs/KE_HOACH_DA_CUA_HANG.md`, `docs/KE_HOACH_UNIT_ENGINE_DA_CUA_HANG.md`, `docs/KE_HOACH_TOI_UU_DOC.md`, `data_access.v9.js`, bootstrap/cache/binding/logout trong `posgieo.html`, các tool sinh bản/thử/đo/deploy và test loader.

### Kết quả rà soát kế hoạch lần 2

| Điểm thiếu/rủi ro trong bản đầu | Điều chỉnh |
| --- | --- |
| Có thể hiểu phải chuyển bootstrap và mọi side effect ngay từ đầu | Giữ bootstrap inline trước; chia 0A–0E, có pilot nhỏ trước khi chuyển cụm lớn |
| Chưa nói rõ hoisting/lexical scope | Quy tắc riêng cho function và let/const/class, giữ global bridge cần dùng |
| Chỉ mở rộng extract có thể khiến test xanh giả | Tách bộ đọc AST và bộ thực thi từng script; thử cài lỗi để kiểm hàng rào |
| Bridge tự gắn theo DOMContentLoaded | Kiểm thời điểm, thứ tự bọc, Promise/this và hàm đích; không ghi đè hook về sau |
| Đa tab/cache/lifecycle vừa là refactor vừa là thay hành vi | Phân loại R/H; lỗi nền bắt buộc sửa riêng trước phát hành |
| “Không mặc định GG01” chưa rõ ngoại lệ thử | Ghi chính xác mặc định vùng thử và fallback GG01 thật hiện hành |
| Thiết bị được xem quá độc lập | Tách transport khỏi nội dung tem kho/BTP; cho phép giữ nội dung tới Đợt 2 |
| Chưa đủ bằng chứng đồng thời nhiều quán | Hai context độc lập cùng backend giả, dữ liệu mồi trùng ID, kiểm cả đọc/ghi |
| Rollback mới chủ yếu nói bộ file | Bổ sung tab cũ/mới chạy cùng, queue/marker, lazy-load ghim release, không reload giữa đơn |

Lần rà 2 đối chiếu thêm `tests/lib/core_loader.js`, `tests/lib/wrap_harness.js`, `tools/tao_ban_dem.js`, `tools/check_paths.js`, hai bridge POS và bootstrap thật. Chỉ cập nhật tài liệu; không chạy lại sáu bộ test để ngụ ý rằng kiến trúc đề xuất đã được kiểm chứng. Các bước 0A–0E là phần việc phải thực hiện khi bắt đầu code.

**Khuyến nghị bắt đầu: Đợt 0 + Đợt 1.** Chỉ mở rộng khi có nhu cầu và đạt nghiệm thu; không đặt mục tiêu tách hết bằng mọi giá.
