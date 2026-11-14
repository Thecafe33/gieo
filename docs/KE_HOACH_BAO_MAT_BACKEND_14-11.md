# Kế hoạch đưa mã / mật khẩu bí mật vào backend (14/11) — CHỜ DUYỆT, chưa sửa dòng mã nào

Phạm vi: `pos.html`, `PosX.html`, `posgieo.html` (+ `js/posgieo/*`), `index.html`, `kiosk.html`, `manage.html`, `quanlygieo.html`, `kiem_toan_kho.html`.
Tài liệu này KHÔNG chép giá trị bí mật nào — chỉ ghi tên hằng / tên hàm để `grep`.

Nguyên tắc xuyên suốt: **luồng bán không thêm vòng mạng nào**; mỗi đợt deploy độc lập, quay lui được bằng cách chép lại file cũ; chạy song song cũ + mới trước khi cắt cái cũ.

---

## 1. Kết quả rà soát (đã quét cả 8 file + JS nạp kèm)

| # | Thứ tìm thấy | Ở đâu (grep) | Mức | Ghi chú |
|---|---|---|---|---|
| A | **Khoá riêng (private key) của tài khoản dịch vụ Google** `bot-sheet@…` nằm nguyên văn trong trang | `pos.html` › `SHEETS_CONFIG.PRIVATE_KEY`, `createServiceAccountJWT`, `getAccessToken`, `writeToGoogleSheets` | **NGHIÊM TRỌNG** | Ai mở `the-cafe-33.web.app/pos.html` → «Xem nguồn» là lấy được. Khoá này đăng nhập được Google Cloud với mọi quyền của tài khoản `bot-sheet` (chưa biết quyền gì — phải xem ở Console). Cũng nằm trong lịch sử git và `pos_tet.html`, `ban_deploy/*/pos.html`. |
| B | Email + mật khẩu tài khoản Firebase dùng chung (2 tài khoản) viết thẳng trong mã | `signInWithEmailAndPassword` ở cả 7 file (posgieo: `POS_AUTH_EMAIL` / `POS_AUTH_PASS`; pos: `autoLoginPOS`; kiosk; manage / quanlygieo: `ensureAuth`; kiem_toan_kho) | **CAO** | Rules hiện tại «đã đăng nhập = toàn quyền» → ai có mật khẩu này đọc / sửa / xoá được toàn bộ dữ liệu 3 thương hiệu từ máy bất kỳ. |
| C | Mã quản lý viết cứng | posgieo: `MANAGER_OVERRIDE_PIN` (Doanh thu, đăng xuất ca, nấu mẻ — `pos_prep.v2.js`), `CF_PASSWORD` (`pos_cashfund.v1.js`), `delOrderConfirm` + `backfillPinConfirm` (`pos_orders.v1.js`); PosX: `delOrderConfirm` | TRUNG BÌNH | Chú thích sẵn trong `posgieo.html` (mục «8. Khoá mật khẩu cho tab Doanh thu») đã ghi rõ: đây chỉ là khoá giao diện, không phải bảo mật thật. |
| D | PIN nhân viên lưu chữ thường, mọi máy đọc được, so ở máy | posgieo `EMPLOYEES_CACHE_POS.find(e => e.pin === pin)` (`pos_shift.v1.js`), pos `_resolveTc33StaffPin`, manage hiện `PIN · …` | THẤP–TB | PIN dùng để ghi «ai làm», không trực tiếp mở tiền. |
| E | Ví (TC33, app khách): mã giao dịch `wallet_pin_index/current` đọc về máy khách rồi so; `pin_hash` (bcrypt) của ví tải về máy khách rồi `compareSync` | `index.html` (`cur.pin !== _txCodeEntered`, `dcodeIO.bcrypt.compareSync`) | **CAO** (liên quan tiền) | PIN 4–6 số có hash trong tay thì dò ra trong vài giây. `index.html` không đăng nhập (`firebase.auth()` có khai báo nhưng không gọi `signIn…`) → nghĩa là rules đang cho người lạ đọc / ghi một số nhánh. Cần xem rules mới kết luận được. |
| F | `firebaseConfig` (`apiKey: "AIza…"`, `projectId`…) | cả 8 file | **KHÔNG phải bí mật** | Xem mục 2. |
| G | URL Apps Script `GOOGLE_SCRIPT_URL` (ghi nhật ký đổi tên / đổi quà) | `index.html` | THẤP | Ai cũng POST được nhật ký giả; không lộ dữ liệu. |
| H | Hàm HTTP `syncMenu`, `syncCustomers` (us-central1) | `pos.html` | CHƯA RÕ | Mã nguồn không có trong repo — chưa biết có kiểm tra người gọi không. |
| I | Số tài khoản ngân hàng trong VietQR | pos / posgieo / PosX | Không bí mật | Bản chất là công khai (in trên QR). |

**Chưa xem được (không có trong repo):** Firestore rules, RTDB rules, Storage rules, mã các hàm `syncMenu` / `syncCustomers`, quyền IAM của `bot-sheet`, repo GitHub đang công khai hay riêng tư.

---

## 2. Phản biện trước khi làm — ba điều phải nói thẳng

1. **«SDK / cấu hình Firebase» không đưa vào backend được và không cần.** `apiKey` của Firebase web chỉ là «địa chỉ dự án», Google thiết kế để công khai; trình duyệt phải có nó thì mới kết nối. Tải nó từ backend = thêm một vòng mạng lúc mở app (chậm, mất mạng là app không lên) mà người xem nguồn vẫn thấy. Cách bảo vệ đúng là **Rules + App Check + giới hạn API key theo tên miền** (Đợt 4).
2. **Giấu mật khẩu đăng nhập chung vào backend không tăng bảo mật.** App cần tự đăng nhập không ai gõ gì → thứ gì app lấy được thì người xem nguồn cũng lấy được. Cách đúng: **mỗi máy một danh tính riêng** do backend cấp sau khi máy chứng minh mình thuộc quán (mã quán 6 ký tự đã có sẵn ở posgieo), rồi rules phân quyền theo danh tính đó. Mật khẩu chung lúc ấy bị đổi và không còn nằm ở đâu trong mã (Đợt 3–4).
3. **Chừng nào rules còn «đã đăng nhập = toàn quyền» thì mọi mã PIN chỉ là khoá giao diện.** Chuyển PIN lên backend (Đợt 2) giúp không lộ mã trong nguồn và đổi mã không cần phát hành lại app; còn chặn thật sự người cố tình vượt thì phải tới Đợt 4 (rules).

→ Việc **A** là thứ duy nhất «đưa bí mật vào backend» theo đúng nghĩa đen và cũng là việc gấp nhất.

Tham khảo (chỉ lấy ý tưởng): [Firebase — API keys](https://firebase.google.com/docs/projects/api-keys), [App Check](https://firebase.google.com/docs/app-check), [Custom tokens](https://firebase.google.com/docs/auth/admin/create-custom-tokens), [Functions — secrets](https://firebase.google.com/docs/functions/config-env#secret-manager), [OWASP MASVS-STORAGE / AUTH](https://mas.owasp.org/MASVS/).

---

## 3. Kiến trúc đích

```
Máy POS / kiosk ──(lần đầu: mã quán)──▶ Function capDanhTinhMay ──▶ custom token + claims {vai, quan, thuongHieu}
      │  phiên đăng nhập Firebase tự lưu ở máy → các lần mở sau KHÔNG gọi function
      ├─ bán hàng: Firestore / RTDB trực tiếp như hiện nay (0 vòng mạng thêm)
      └─ thao tác quản lý hiếm (xoá bill, quỹ…): Function kiemMaQuanLy (1 vòng mạng, chỉ lúc đó)
Function chạy theo lịch ghiDoanhThuSheets ──▶ Google Sheets (không còn khoá trong trang)
Rules: phân quyền theo claims · App Check: chỉ nhận yêu cầu từ app thật
```

- **Codebase Functions mới, riêng**: `functions/baomat/` (tên codebase `gieo-baomat`, vùng `asia-southeast1` như worker hiện có). KHÔNG đụng `functions/automation` (worker Engine 2) và không đụng các hàm cũ `syncMenu` / `syncCustomers`. Deploy: `firebase deploy --only functions:gieo-baomat`.
- **Nơi cất bí mật**: mã quản lý (dạng băm có muối) ở tài liệu Firestore `bao_mat_gieogieo/*` — rules chặn mọi máy khách, chỉ Admin SDK đọc; đăng ký vào `GieoData.REG` theo quy ước. Không cất gì trong mã function hay `stores.json`.
- **Phía app**: thêm `firebase-functions-compat.js` 10.13.2 (chỉ ở file có gọi hàm), gói trong một file mới `bao_mat.v1.js` (API: `BaoMat.kiemMa(loai, ma)`, `BaoMat.capDanhTinh()`); app không gọi thẳng function.

---

## 4. Các đợt thực hiện

### Đợt 0 — KHẨN, chủ dự án làm ở Console (không cần mã, ~15 phút)

1. Google Cloud Console › IAM › Service Accounts › `bot-sheet@…` › **Keys → xoá khoá đang dùng**. Xem luôn tab Permissions: tài khoản này có vai trò gì trong dự án (nếu là Editor / Owner → rủi ro A là toàn bộ dự án; báo lại cho Claude).
   - Hệ quả: việc tự ghi doanh thu TC33 sang Google Sheets (`checkAndSyncDailyRevenue`) ngừng cho tới khi xong Đợt 1. POS vẫn bán bình thường. Số các ngày thiếu sẽ ghi bù.
2. GitHub: kiểm tra repo `gieo` là **Private**.
3. Chép 3 bộ rules hiện hành (Firestore, Realtime Database, Storage) từ Firebase Console gửi Claude → lưu vào `rules/` trong repo làm mốc.
4. Firebase Console › Functions: chụp danh sách hàm đang chạy (để biết `syncMenu`, `syncCustomers` thuộc codebase nào, có còn dùng không).

### Đợt 1 — Google Sheets về backend (việc A) · chỉ `pos.html`

- Hàm theo lịch `ghiDoanhThuSheets` (mỗi ngày sau giờ đóng quán): tự đọc doanh thu ngày TC33 từ Firestore, ghi Sheets bằng **tài khoản mặc định của function** (chia sẻ file Sheets cho email tài khoản đó) → **không còn khoá nào tồn tại**. Có dấu «đã ghi ngày X» để chạy lại không ghi đôi + ghi bù ngày thiếu.
- `pos.html`: xoá `SHEETS_CONFIG.PRIVATE_KEY`, `createServiceAccountJWT`, `getAccessToken`, `writeToGoogleSheets`, `checkAndSyncDailyRevenue` (được phép vì chủ dự án yêu cầu đích danh — ghi vào CLAUDE.md mục «Việc TC33 đã chốt»).
- Phải làm rõ trước khi viết: công thức `finalRevenue` hiện tại (đọc đoạn quanh `checkAndSyncDailyRevenue`) để hàm backend ra **đúng con số POS đang ghi**; test so hai bên trên dữ liệu giả.
- Lợi thêm: POS bớt một việc lúc mở app, không còn phụ thuộc «hôm đó có ai mở POS không».

### Đợt 2 — Mã quản lý (việc C) · posgieo + PosX

- Hàm gọi được `kiemMaQuanLy({loai, ma})` → `{ok}`; `loai` ∈ `doanh_thu` / `quy` / `xoa_bill` / `ghi_bu`. Chặn dò: sai 5 lần / máy / 10 phút → khoá 10 phút (đếm ở backend). `minInstances: 0` (thao tác hiếm; lần đầu trong ngày có thể chờ 1–3 giây — hiện «Đang kiểm tra…»).
- Đổi mã: màn trong `manage.html` (hoặc tạm thời chủ dự án sửa ở Console) — **không cần phát hành lại app mỗi lần đổi mã**.
- Mã nguồn: JS đã phát hành không sửa → `pos_orders.v2.js`, `pos_cashfund.v2.js`, `pos_prep.v3.js` (chỉ thay đúng dòng so mã, phần còn lại nguyên văn), cập nhật `tools/js_da_phat_hanh.json`; `posgieo.html` (2 chỗ `MANAGER_OVERRIDE_PIN`), `PosX.html` (`delOrderConfirm`).
- Khi mất mạng: xem câu hỏi Q2.
- Sau khi deploy: chủ dự án **đổi cả 4 mã** (mã cũ đã lộ trong nguồn + lịch sử git).

### Đợt 3 — Danh tính riêng cho từng máy (việc B, bước chạy song song)

- Hàm `capDanhTinhMay`:
  - **Máy đang chạy** (đang đăng nhập bằng tài khoản chung + đã gắn quán): app âm thầm gọi hàm một lần → nhận custom token → `signInWithCustomToken` → từ đó phiên tự lưu. **Nhân viên không phải nhập gì** (giữ đúng quy tắc «POS không bắt nhập lại mã quán»).
  - **Máy mới sau này**: nhập mã quán 6 ký tự (posgieo — luồng đã có) hoặc mã ghép máy do `manage` cấp (pos / PosX / kiosk).
  - Claims đặt bằng `setCustomUserClaims` (bền qua mọi lần làm mới phiên): `{vai:'pos'|'kiosk'|'quanly', quan, thuongHieu}`. Danh sách máy ở `thiet_bi_gieogieo/{uid}` — quản lý **thu hồi một máy** được (mất máy, nhân viên nghỉ).
- App quản lý (`manage`, `quanlygieo`, `kiem_toan_kho`): xem câu hỏi Q3.
- **Giai đoạn song song ≥ 2 tuần**: nhận danh tính mới thất bại (mất mạng, hàm lỗi) → app dùng tiếp tài khoản chung như cũ, không ai bị chặn. Bảng theo dõi «máy nào đã chuyển» trong manage.
- Điều kiện kỹ thuật chủ dự án bật một lần: cấp vai trò *Service Account Token Creator* cho tài khoản chạy function (thiếu thì `createCustomToken` báo lỗi `iam.serviceAccounts.signBlob`).

### Đợt 4 — Siết rules + App Check + đổi mật khẩu chung (cắt cái cũ)

Làm từng nấc, mỗi nấc chạy vài ngày, mỗi nấc có bản rules cũ để dán lại nếu trục trặc:

1. Viết rules mới + test bằng Firebase Emulator (`@firebase/rules-unit-testing`) với ma trận: mỗi app × mỗi collection / gốc RT nó thật sự dùng (lấy từ `GieoData.REG` + `tools/check_paths.js`; TC33 / XOFA / app khách phải liệt kê tay).
2. Nấc 4a: chỉ khoá `bao_mat_gieogieo`, `thiet_bi_gieogieo` (thứ mới, không app nào đang dùng).
3. Nấc 4b: thao tác quản lý (xoá bill, quỹ, cấu hình) đòi claims `vai` phù hợp.
4. Nấc 4c: dữ liệu theo quán đòi claims `quan` khớp; nhánh app khách (`index.html`) thu hẹp về đúng thứ khách cần.
5. App Check (reCAPTCHA Enterprise cho tên miền `the-cafe-33.web.app`; APK là WebView bọc đúng URL này nên dùng chung): **chế độ theo dõi trước ≥ 1 tuần**, số yêu cầu «không xác minh» từ app thật về ~0 mới bật bắt buộc.
6. Giới hạn API key theo HTTP referrer (`the-cafe-33.web.app`, `the-cafe-33.firebaseapp.com`).
7. Cuối cùng, khi bảng theo dõi báo 100% máy đã chuyển: chủ dự án **đổi mật khẩu 2 tài khoản chung**, Claude xoá mọi `signInWithEmailAndPassword(...)` viết cứng khỏi 7 file.

### Đợt 5 — Tuỳ chọn, cần chủ dự án quyết riêng

- **Ví (E)**: chuyển kiểm mã giao dịch + PIN ví + trừ tiền vào một hàm `viThanhToan` (một giao dịch phía máy chủ), rules chặn đọc `pin_hash` và `wallet_pin_index`. Đổi luồng tiền TC33 → hỏi trước (Q4).
- **PIN nhân viên (D)**: đề xuất **giữ ở máy** — chuyển lên backend sẽ thêm một vòng mạng cho mỗi lần ký tên (check-in, từng bước kết ca), đi ngược mục tiêu «mượt». Chỉ nên: ẩn PIN khỏi các truy vấn không cần (tách sang tài liệu riêng) khi làm nấc 4c.
- **G, H**: Apps Script thêm kiểm tra hình dạng dữ liệu; `syncMenu` / `syncCustomers` đòi ID token — sau khi thấy mã nguồn.

---

## 5. Điều cần tránh

| Không làm | Vì sao |
|---|---|
| Gọi function trong luồng bán / thanh toán / in bill / tích tem | Khởi động lạnh 1–5 giây, mất mạng là kẹt đơn. Function chỉ dùng cho: cấp danh tính (một lần / máy), thao tác quản lý hiếm, việc theo lịch. |
| Tải `firebaseConfig` hay mật khẩu chung từ backend lúc mở app | Chậm hơn, mất mạng app không lên, không kín hơn (mục 2). |
| Đổi mật khẩu chung / siết rules trước khi mọi máy đã chuyển | Tab đang mở, máy lâu không tải lại, 3 thương hiệu chung một dự án → khoá nhầm cả quán đang bán. Luôn: thêm cái mới → chạy song song → đo → mới cắt cái cũ. |
| Siết rules một lần cho tất cả | Không có rules trong repo, `index.html` đang chạy không đăng nhập — phải lập ma trận và test giả lập trước, đi từng nấc. |
| Bật App Check bắt buộc ngay | Phải qua chế độ theo dõi; WebView APK cần thử thật. |
| Sửa JS đã phát hành tại chỗ | Quy tắc 8 — tạo `vN+1`, cập nhật sổ phát hành. |
| Lưu băm PIN 4 số ở máy để «kiểm ngoại tuyến an toàn» | 10.000 khả năng — dò xong trong chưa tới một giây; chỉ là khoá giao diện, phải gọi đúng tên như vậy. |
| Viết lại lịch sử git để xoá bí mật | Không cần và nguy hiểm cho các nhánh đang chạy: **xoá khoá + đổi mật khẩu / mã** là đủ để thứ nằm trong lịch sử thành vô dụng. |
| Đổi cấu trúc `customers`, `rewards`, `bank_confirmations`, `kiosk_config` | Tài nguyên dùng chung đã chốt không đổi. Chỉ thêm collection mới. |
| Gộp vào codebase worker Engine 2 | Lỗi ở hàm bảo mật không được kéo theo nhịp 15 phút của kho, và ngược lại. |
| Gộp nhiều đợt vào một lần deploy | Mỗi đợt một gói `giao_file/`, có lệnh quay lui riêng. |

---

## 6. Phân chia nhiệm vụ

| Việc | Chủ dự án | Claude | Nhân viên quán |
|---|---|---|---|
| Đợt 0 | Xoá khoá `bot-sheet`, xem quyền IAM, kiểm repo Private, gửi 3 bộ rules + danh sách hàm | Lưu rules vào `rules/`, lập ma trận app × dữ liệu | — |
| Đợt 1 | Chia sẻ file Sheets cho tài khoản function; thêm codebase `gieo-baomat` vào `~/MyCafeWeb/firebase.json`; deploy; so số Sheets 3 ngày | Viết hàm + test so công thức; gỡ khoá khỏi `pos.html`; `sinh_lai_tat_ca.sh`; gói giao + lệnh `cp` | — |
| Đợt 2 | Duyệt Q2; deploy; **đổi 4 mã quản lý** sau deploy | Hàm `kiemMaQuanLy`, `bao_mat.v1.js`, các file `vN+1`, màn đổi mã, test (đúng / sai / khoá dò / mất mạng) | Không đổi thao tác (lần đầu trong ngày có thể chờ 1–3 giây) |
| Đợt 3 | Duyệt Q3; bật vai trò Token Creator; deploy; theo dõi bảng máy đã chuyển | Hàm `capDanhTinhMay`, chuyển đổi âm thầm + đường lui về tài khoản chung, bảng theo dõi + thu hồi máy, e2e (máy cũ / máy mới / mất mạng / hàm lỗi) | Không phải làm gì với máy đang chạy |
| Đợt 4 | Dán rules từng nấc ở Console; đăng ký App Check; giới hạn API key; đổi mật khẩu chung ở bước cuối | Viết rules + test giả lập; hướng dẫn từng nấc kèm bản quay lui; gỡ mật khẩu khỏi 7 file | Báo ngay nếu thấy «không có quyền» |
| Đợt 5 | Quyết Q4 | Theo quyết định | — |

Mỗi đợt Claude giao kèm: danh sách kiểm trước deploy (`sh tools/predeploy_check.sh`), **dấu hiệu thành công**, **lệnh quay lui**. Claude không bao giờ chạy deploy.

**Chỉ tiêu «vẫn mượt» phải đo sau mỗi đợt:** số vòng mạng của một bill (bán → thanh toán → in) không đổi so với trước; thời gian mở app tới lúc bấm được món không tăng; mở app khi mất mạng vẫn bán được như hiện nay.

---

## 7. Câu hỏi chờ chủ dự án (đổi hành vi nghiệp vụ → phải hỏi)

- **Q1.** Xoá khoá `bot-sheet` ngay hôm nay và chấp nhận Sheets tạm ngừng ghi vài ngày (đề xuất), hay đợi xong Đợt 1 mới xoá (khoá tiếp tục lộ trong lúc chờ)?
- **Q2.** Mất mạng lúc nhập mã quản lý (xoá bill, quỹ, xem doanh thu): (a) **không cho làm, báo «cần mạng»** — đề xuất, vì các thao tác này vốn cần mạng mới có nghĩa; hay (b) cho kiểm tạm ở máy (chỉ là khoá giao diện)?
- **Q3.** App quản lý (`manage`, `quanlygieo`): chủ quán / quản lý **đăng nhập một lần bằng tài khoản cá nhân** trên mỗi máy (đề xuất — sau đó tự nhớ, biết được ai sửa gì, thu hồi được từng người), hay cũng ghép máy bằng mã như POS?
- **Q4.** Ví TC33 (Đợt 5): có làm không, và khi nào?
- **Q5.** Thứ tự ưu tiên giữa việc này với Engine 2 v5 / kho v22 / Gấu Noel (bắt đầu 15/11) đang chờ deploy? Đề xuất: Đợt 0 ngay; Đợt 1–2 sau khi các gói đang chờ đã deploy xong (tránh chồng bản `pos.html` / `posgieo.html`); Đợt 3–4 sau mùa Giáng sinh.
