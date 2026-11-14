# Kế hoạch giấu mật khẩu / mã quản lý khỏi mã nguồn (14/11, bản 3) — CHỜ CHỐT 1 CÂU, chưa sửa dòng mã nào

Chủ dự án đã chốt 14/11:
- Khoá Google Sheets trong `pos.html`: **giữ nguyên, không đụng**.
- **Máy mới được duyệt ở `manage.html`** (không gõ mật khẩu trên máy POS).
- **Mật khẩu chung sẽ đổi**, đổi ngay trong `manage.html`.
- **Mọi mã quản lý (Gieo + XOFA) cấu hình ở `manage.html`.**

→ `manage.html` trở thành «chìa khoá gốc»: nơi duy nhất cần mật khẩu, nơi duyệt máy, nơi đặt mã.
Tài liệu không chép giá trị bí mật nào — chỉ ghi tên hằng / tên hàm để `grep`.

---

## 1. Phạm vi

| Thứ | Ở đâu (grep) | Làm gì |
|---|---|---|
| Mật khẩu 2 tài khoản Firebase dùng chung | `signInWithEmailAndPassword` — posgieo (`POS_AUTH_PASS`, 2 nơi), pos (`autoLoginPOS`), PosX, kiosk, manage + quanlygieo (`ensureAuth`), kiem_toan_kho | Việc 1 + 2 |
| 5 mã quản lý viết cứng | posgieo `MANAGER_OVERRIDE_PIN` (2 nơi) + `pos_prep.v2.js`; `CF_PASSWORD` (`pos_cashfund.v1.js`); `delOrderConfirm`, `backfillPinConfirm` (`pos_orders.v1.js`); PosX `delOrderConfirm` | Việc 3 |
| Khoá Sheets, `firebaseConfig`, PIN nhân viên, PIN ví | — | Không đụng |

Đã kiểm: không app nào (kể cả worker `functions/automation`) dựa vào `uid` / `email` của tài khoản đăng nhập → đổi danh tính đăng nhập của máy không ảnh hưởng dữ liệu.

---

## 2. Vì sao «duyệt máy ở manage» cần một phần backend nhỏ

Máy mới chưa đăng nhập thì không đọc / ghi được gì, nên không tự gửi «xin duyệt» qua Firestore được; và chỉ máy chủ mới cấp được phiên đăng nhập cho một máy khác. Có hai đường:

| | **A — 3 hàm Cloud Functions nhỏ (đề xuất)** | B — đăng nhập ẩn danh + danh sách máy được phép trong rules |
|---|---|---|
| Kín thật ngay với rules hiện tại | **Có** — máy chưa duyệt không có phiên nào | Không — phải sửa cả 3 bộ rules (Firestore / RTDB / Storage) thì mới kín; chưa sửa thì còn hở hơn hiện nay |
| Phải làm ở Console | Một lần: gán vai trò *Service Account Token Creator* cho tài khoản chạy function | Bật đăng nhập ẩn danh + dán 3 bộ rules mới |
| Rủi ro vận hành | Thấp — hàm chỉ chạy lúc duyệt máy | Cao — rules dùng chung 3 thương hiệu, app khách `index.html` không đăng nhập, repo chưa có bản rules nào |
| Thu hồi một máy | Thật (vô hiệu tài khoản của máy) | Thật, sau khi sửa rules |

Phần còn lại của tài liệu viết theo **đường A**.

---

## 3. Việc 1 — Máy tự nhớ phiên; máy mới xin duyệt ở manage

File dùng chung mới `kich_hoat_may.v1.js` (`KichHoatMay.sanSang()` → Promise), 6 app gọi (posgieo, pos, PosX, kiosk, quanlygieo, kiem_toan_kho) thay cho `signInWithEmailAndPassword(email, 'mật khẩu')`:

1. Chờ `onAuthStateChanged` đầu tiên (đọc phiên đã lưu ở máy — không cần mạng).
2. **Có phiên → chạy tiếp y như hiện nay.** Bớt một vòng mạng đăng nhập mỗi lần mở; mất mạng vẫn mở được.
3. **Máy đang chạy (phiên là tài khoản chung cũ)**: chạy nền, một lần, âm thầm đổi sang **danh tính riêng của máy** (gọi `mayNhanQuyen`). Nhân viên không thấy gì; lỗi / mất mạng → giữ phiên cũ, lần mở sau thử lại. Máy hiện trong danh sách ở manage với nhãn «tự chuyển».
4. **Không có phiên** (máy mới, cài lại APK, xoá dữ liệu app) → màn «Máy chờ duyệt»: hiện **mã 4 ký tự** + ô đặt tên máy → chủ dự án mở manage › «Thiết bị», thấy đúng mã đó, bấm **Duyệt** → máy tự vào app trong vài giây. Yêu cầu hết hạn sau 15 phút.

Backend — codebase riêng `functions/baomat/` (`gieo-baomat`, vùng `asia-southeast1`; không đụng worker Engine 2, không đụng `syncMenu` / `syncCustomers`). App gọi bằng `fetch` thường, không nạp thêm SDK:
- `mayXinDuyet` — máy mới gửi yêu cầu (giới hạn số yêu cầu chờ, tự dọn).
- `mayNhanQuyen` — trả vé đăng nhập (custom token) cho máy đã được duyệt, hoặc cho máy đang giữ phiên tài khoản chung (bước 3).
- `mayThuHoi` — chỉ tài khoản quản lý gọi được: vô hiệu một máy.
- Danh sách ở Firestore `thiet_bi_gieogieo` (tên máy, app, lần mở gần nhất, trạng thái).

Thứ tự khởi động sau khi có phiên (`_menuInited`, `initMenu`, listener sau auth) giữ nguyên văn.

## 4. Việc 2 — `manage.html`: đăng nhập, Thiết bị, Đổi mật khẩu

- **Đăng nhập:** bỏ mật khẩu viết cứng trong `ensureAuth`; chưa có phiên → ô nhập mật khẩu **một lần**, máy tự nhớ. (manage, quanlygieo, posgieo… cùng địa chỉ web nên dùng chung phiên: điện thoại đã đăng nhập manage thì mở quanlygieo vào thẳng.)
- **Mục «Thiết bị»:** yêu cầu chờ duyệt (mã, tên, app, giờ) → Duyệt / Từ chối; danh sách máy đang hoạt động → Thu hồi.
- **Mục «Đổi mật khẩu»:** nhập mật khẩu cũ + mới → đổi ngay (`updatePassword`). Trước khi cho đổi, màn hình báo còn bao nhiêu máy **chưa** tự chuyển (những máy đó sẽ rơi về «chờ duyệt» sau khi đổi).
- Đổi cả 2 tài khoản chung (tài khoản `pos` / `kiosk` TC33 đang dùng và tài khoản các app còn lại); sau khi mọi máy đã chuyển, POS / kiosk không còn dùng tài khoản nào trong hai tài khoản này.

## 5. Việc 3 — Mã quản lý cấu hình ở manage

- Tài liệu cấu hình trên Firestore giữ **băm SHA-256 có muối** của từng mã: `doanh_thu`, `quy`, `xoa_bill`, `ghi_bu` (Gieo) và `xoa_bill_xofa`.
- `manage.html` mục «Mã quản lý»: đặt / đổi từng mã (băm ở máy rồi ghi). Đổi mã không cần phát hành lại app.
- `ma_quan_ly.v1.js`: `MaQuanLy.kiem(loai, ma)`. Chỉ tải khi lần đầu cần kiểm mã, rồi nhớ ở máy → không thêm lượt đọc lúc mở app, mất mạng vẫn kiểm được. Nhập sai → tải lại một lần (phòng mã vừa đổi) rồi mới báo sai. Chưa đặt mã → báo «Chưa đặt mã — vào Quản lý»; không rơi về mã cũ.
- Mã nguồn: `pos_orders.v2.js`, `pos_cashfund.v2.js`, `pos_prep.v3.js` (chỉ thay dòng so mã) + sổ `tools/js_da_phat_hanh.json`; `posgieo.html` 2 chỗ; `PosX.html` 1 chỗ.
- Đường dẫn tài liệu: ưu tiên mục cấu hình đã có trong `GieoData.REG`; nếu phải đăng ký mới thì cần `data_access.v10.js` — báo trước khi chọn.
- Mức kín: hết thấy mã khi xem nguồn; mã 4 số thì máy đã được duyệt vẫn dò được từ băm → vẫn là khoá giao diện (đúng như chú thích sẵn trong `posgieo.html`).

---

## 6. Thứ tự làm và giao

| Đợt | Nội dung | Deploy | Quay lui |
|---|---|---|---|
| 1 | Functions `gieo-baomat` + manage (đăng nhập, Thiết bị, Mã quản lý; **chưa** mở Đổi mật khẩu) | Functions + `manage.html` | chép lại `manage.html` cũ; hàm mới không ai gọi thì vô hại |
| 2 | Chủ dự án đặt 5 mã ở manage → posgieo + PosX dùng `ma_quan_ly` | posgieo, PosX, 4 file JS | chép lại file cũ |
| 3 | `kich_hoat_may` cho Gieo: posgieo, quanlygieo, kiem_toan_kho — theo dõi máy «tự chuyển» ở manage | 3 file + 1 JS | chép lại file cũ (phiên cũ vẫn còn hiệu lực vì chưa đổi mật khẩu) |
| 4 | `kich_hoat_may` cho pos, PosX, kiosk | 3 file | như trên |
| 5 | Mọi máy đã «tự chuyển» → mở mục Đổi mật khẩu → chủ dự án đổi, **ngoài giờ bán** | `manage.html` | sau bước này không quay về bản cũ có mật khẩu viết cứng được nữa |

Đợt 1–4 quay lui được hoàn toàn. Làm sau khi các gói đang chờ (Engine 2 v5, kho v22, Gấu Noel, pos bento) đã deploy để không chồng bản `posgieo.html` / `pos.html` / `manage.html`.

## 7. Điều cần tránh

- Không gọi function trong luồng bán / thanh toán / in / tích tem — hàm chỉ chạy lúc duyệt máy và một lần tự chuyển chạy nền.
- Không đổi mật khẩu khi còn máy chưa tự chuyển, và không đổi trong giờ bán.
- Không deploy POS (đợt 2) trước khi đã đặt mã ở manage.
- Không đổi thứ tự khởi động sau đăng nhập (chú thích `[FIX]` quanh `onAuthStateChanged` ở posgieo / PosX: listener gắn trước auth sẽ chết).
- Không sửa JS đã phát hành tại chỗ; không sửa tay file sinh tự động — sửa gốc rồi `sh tools/sinh_lai_tat_ca.sh`.
- Không gộp hàm mới vào codebase worker Engine 2.
- Chế độ thử (`che_do_thu`) và các e2e dùng Firebase giả phải chạy như cũ — kiểm trước khi sửa.
- Mất mật khẩu manage = không duyệt được máy mới → chủ dự án giữ mật khẩu ở nơi an toàn (đặt lại được ở Firebase Console › Authentication).

## 8. Phân việc

| | Chủ dự án | Claude | Nhân viên |
|---|---|---|---|
| Đợt 1 | Gán vai trò Token Creator (một lần); thêm codebase `gieo-baomat` vào `~/MyCafeWeb/firebase.json`; deploy; đăng nhập manage | 3 hàm + test; 3 mục mới của manage (render mẫu giao diện để duyệt trước); gói giao + lệnh `cp` | — |
| Đợt 2 | Đặt 5 mã; deploy; thử xoá bill / xem doanh thu | `ma_quan_ly.v1.js`, các file `vN+1`, test (đúng / sai / đổi mã / mất mạng / chưa đặt) | Dùng mã mới chủ quán báo |
| Đợt 3–4 | Deploy; xem danh sách máy tự chuyển; thử duyệt một máy mới | `kich_hoat_may.v1.js`, sửa 6 app, e2e (có phiên / tự chuyển / máy mới / từ chối / hết hạn / mất mạng) | Không đổi gì |
| Đợt 5 | Đổi mật khẩu ngoài giờ bán | Mở mục Đổi mật khẩu; gỡ nốt mật khẩu viết cứng | Báo nếu thấy màn «Máy chờ duyệt» |

Claude không bao giờ chạy deploy.

## 9. Câu còn chờ chốt

- **Chọn đường A hay B ở mục 2?** Đề xuất A. Chọn A nghĩa là chấp nhận: thêm một codebase Functions nhỏ + một lần gán vai trò ở Console.
