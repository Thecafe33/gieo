# Kế hoạch giấu mật khẩu / mã quản lý khỏi mã nguồn (14/11, bản 2) — CHỜ DUYỆT, chưa sửa dòng mã nào

Bản 2 thay bản 1 (5 đợt, Cloud Functions, siết rules) theo chốt của chủ dự án 14/11:
- **Khoá Google Sheets trong `pos.html`: GIỮ NGUYÊN, không đụng** (khoá đã bị giới hạn từ phía Google lúc tạo).
- Các thứ còn lại: **giấu khỏi mã nguồn, ít thay đổi nhất**. Không xoá / không cấp quyền gì ở Console, không Cloud Functions, không đổi rules.

Tài liệu không chép giá trị bí mật nào — chỉ ghi tên hằng / tên hàm để `grep`.

---

## 1. Thứ sẽ giấu và thứ không đụng

| Thứ | Ở đâu (grep) | Làm gì |
|---|---|---|
| Mật khẩu 2 tài khoản Firebase dùng chung | `signInWithEmailAndPassword` — posgieo (`POS_AUTH_PASS`, 2 nơi gọi), pos (`autoLoginPOS`), PosX, kiosk, manage + quanlygieo (`ensureAuth`), kiem_toan_kho | **Việc 1** |
| 5 mã quản lý viết cứng | posgieo `MANAGER_OVERRIDE_PIN` (2 nơi) + `pos_prep.v2.js`; `CF_PASSWORD` (`pos_cashfund.v1.js`); `delOrderConfirm`, `backfillPinConfirm` (`pos_orders.v1.js`); PosX `delOrderConfirm` | **Việc 2** |
| Khoá Sheets `SHEETS_CONFIG.PRIVATE_KEY` (pos) | — | Giữ nguyên (đã chốt) |
| `firebaseConfig` / `apiKey` | 8 file | Giữ nguyên — không phải bí mật, trình duyệt bắt buộc phải có |
| PIN nhân viên, PIN ví, `GOOGLE_SCRIPT_URL` | — | Không nằm trong mã nguồn dưới dạng bí mật viết cứng → ngoài phạm vi |

---

## 2. Việc 1 — Mật khẩu đăng nhập: máy tự nhớ phiên, mã nguồn không còn mật khẩu

**Cơ chế đã có sẵn, chỉ là chưa tận dụng:** Firebase Auth tự lưu phiên đăng nhập ở máy (bền qua tắt app / khởi động lại). Mọi máy đang chạy đều **đã có phiên** — vì app hiện đăng nhập lại mỗi lần mở.

**Sửa:** thay lệnh `signInWithEmailAndPassword(email, 'mật khẩu')` lúc khởi động bằng:
1. Chờ sự kiện `onAuthStateChanged` đầu tiên (đọc phiên đã lưu, vài chục mili-giây, không cần mạng).
2. **Có phiên → chạy tiếp y như hiện nay.** Nhân viên không thấy gì khác. App còn mở nhanh hơn một chút (bớt một vòng mạng đăng nhập mỗi lần mở) và mở được cả khi mất mạng như cũ.
3. **Không có phiên** (máy mới, cài lại APK, xoá dữ liệu app) → hiện màn «Kích hoạt máy»: nhập mật khẩu **một lần** → từ đó máy tự nhớ.

- Gói trong một file dùng chung mới `kich_hoat_may.v1.js` (`KichHoatMay.dangNhap(email)` → Promise); 7 app gọi vào đó. Email giữ trong mã (không phải bí mật).
- Thứ tự khởi động sau khi có phiên (`_menuInited`, `initMenu`, các listener sau auth…) giữ nguyên văn; nhánh «đăng nhập lỗi vẫn dựng menu» của posgieo / PosX giữ nguyên ý.
- Màn kích hoạt: sai mật khẩu → báo sai, cho nhập lại; mất mạng → báo «cần mạng để kích hoạt lần đầu».

**Kín tới đâu:** bản mới không còn mật khẩu trong nguồn. Nhưng mật khẩu cũ vẫn nằm trong lịch sử git và các bản đã deploy trước → muốn kín hẳn thì sau khi mọi máy đã chạy bản mới, chủ dự án **đổi mật khẩu** (xem Q2 — đổi mật khẩu làm mọi máy mất phiên, mỗi máy phải kích hoạt lại một lần).

---

## 3. Việc 2 — Mã quản lý: chuyển từ mã nguồn lên Firestore (dạng băm)

- Một tài liệu cấu hình trên Firestore giữ **băm SHA-256 có muối** của từng mã (`doanh_thu`, `quy`, `xoa_bill`, `ghi_bu`, `xoa_bill_xofa`) — không lưu mã chữ thường.
- File mới `ma_quan_ly.v1.js`: `MaQuanLy.kiem(loai, ma)` → đúng / sai. Tài liệu chỉ tải **khi lần đầu cần kiểm mã** (không thêm lượt đọc lúc mở app), rồi nhớ ở máy → các lần sau và khi mất mạng kiểm ngay, không vòng mạng. Nhập sai → tải lại một lần (phòng khi mã vừa được đổi) rồi mới báo sai.
- **Đổi mã:** màn «Đổi mã quản lý» trong quanlygieo (nhập mã mới → băm ở máy → ghi). Đổi mã không cần phát hành lại app.
- Chưa đặt mã (tài liệu chưa có) → báo «Chưa đặt mã — vào Quản lý › Đổi mã quản lý»; **không** rơi về mã cũ viết cứng.
- Mã nguồn: JS đã phát hành không sửa → `pos_orders.v2.js`, `pos_cashfund.v2.js`, `pos_prep.v3.js` (chỉ thay dòng so mã, còn lại nguyên văn) + sổ `tools/js_da_phat_hanh.json`; `posgieo.html` 2 chỗ; `PosX.html` 1 chỗ.
- Đường dẫn tài liệu: ưu tiên gắn vào một mục cấu hình **đã đăng ký** trong `GieoData.REG`; nếu buộc phải đăng ký mục mới thì cần `data_access.v10.js` — xác định lúc bắt tay làm, báo trước khi chọn.

**Kín tới đâu (nói thẳng):** hết thấy mã khi xem nguồn; nhưng mã 4 số thì người đã đăng nhập, đọc được băm, vẫn dò ra được. Đây là khoá chặn người tò mò — đúng mức «khoá giao diện» mà chú thích sẵn trong `posgieo.html` đã ghi. Sau khi deploy nên đổi cả 5 mã (mã cũ đã nằm trong nguồn cũ).

---

## 4. Thứ tự làm và giao

| Đợt | Nội dung | File deploy | Quay lui |
|---|---|---|---|
| 1 | Việc 1 cho posgieo + quanlygieo + kiem_toan_kho (Gieo trước, thử trên máy thật) | 3 file + `kich_hoat_may.v1.js` | chép lại 3 file cũ |
| 2 | Việc 1 cho pos, PosX, kiosk, manage | 4 file | chép lại file cũ |
| 3 | Việc 2: quanlygieo (màn đổi mã) **deploy trước → chủ dự án đặt mã** → rồi posgieo, PosX | quanlygieo, posgieo, PosX, `ma_quan_ly.v1.js`, 3 file `vN+1` | chép lại file cũ (file `vN` cũ vẫn còn trên máy chủ) |
| 4 (tuỳ) | Đổi mật khẩu chung + kích hoạt lại từng máy | — (Console) | — |

Đợt 1–3 chỉ là Hosting, độc lập nhau, làm sau khi các gói đang chờ (Engine 2 v5, kho v22, Gấu Noel, pos bento) đã deploy để không chồng bản `posgieo.html` / `pos.html`.

## 5. Điều cần tránh

- Không đụng luồng bán / thanh toán / in / tích tem — hai việc trên chỉ chạm lúc khởi động và lúc nhập mã quản lý.
- Không đổi thứ tự khởi động sau đăng nhập (các chú thích `[FIX]` quanh `onAuthStateChanged` ở posgieo / PosX ghi rõ listener gắn trước auth sẽ chết) — chỉ thay nguồn gốc phiên.
- Không đổi mật khẩu chung trước khi **mọi** máy của cả 3 thương hiệu đã chạy bản có màn kích hoạt — bản cũ đăng nhập bằng mật khẩu viết cứng sẽ hỏng ngay.
- Không deploy POS (Việc 2) trước khi đã đặt mã ở quanlygieo — nếu không mọi thao tác cần mã sẽ báo «chưa đặt mã».
- Không sửa JS đã phát hành tại chỗ; không sửa tay file sinh tự động (`*_tet.html`, `*_thu.html`, `ban_deploy/`) — sửa gốc rồi `sh tools/sinh_lai_tat_ca.sh`.
- Chế độ thử (`che_do_thu`) và các e2e dùng Firebase giả phải chạy như cũ — kiểm chúng có dựa vào lệnh đăng nhập cũ không trước khi sửa.

## 6. Phân việc

| | Chủ dự án | Claude | Nhân viên |
|---|---|---|---|
| Việc 1 | Duyệt Q1–Q2; deploy; thử: mở app bình thường, mở khi mất mạng, xoá dữ liệu app một máy để thấy màn kích hoạt | Viết `kich_hoat_may.v1.js`, sửa 7 app, test + e2e (có phiên / không phiên / sai mật khẩu / mất mạng), gói giao + lệnh `cp` | Không đổi gì |
| Việc 2 | Duyệt Q3; deploy quanlygieo → đặt 5 mã → deploy POS | Viết `ma_quan_ly.v1.js`, màn đổi mã, các file `vN+1`, test (đúng / sai / đổi mã / mất mạng / chưa đặt mã) | Không đổi gì |
| Đợt 4 | Đổi mật khẩu ở Console, đi kích hoạt từng máy | Danh sách máy / app cần kích hoạt | Báo nếu thấy màn «Kích hoạt máy» |

Claude không bao giờ chạy deploy.

## 7. Câu hỏi chờ chủ dự án

- **Q1.** Máy mới / máy mất phiên: chủ dự án (hoặc người được giao) nhập mật khẩu một lần ở màn «Kích hoạt máy» — đồng ý chứ? (Nhân viên sẽ không tự mở được POS trên máy lạ.)
- **Q2.** Sau khi mọi máy chạy bản mới, có đổi mật khẩu chung không? Đổi = kín hẳn, nhưng phải đi kích hoạt lại từng máy của cả 3 thương hiệu một lần. Không đổi = chỉ kín với bản mới.
- **Q3.** Mã xoá bill của XOFA đặt ở đâu: chung màn «Đổi mã quản lý» trong quanlygieo (ít sửa nhất — đề xuất), hay thêm màn riêng trong `manage.html`?
