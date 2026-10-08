# Gieo Gieo — Kế hoạch mở đa cửa hàng (Bước 0 → 5)

> Lập 28/09/2026 · cập nhật 04/10 · **viết lại 05/10/2026 theo hướng chủ dự án chốt: một project, QUÁN HIỆN TẠI GIỮ NGUYÊN CHỖ CŨ, quán mới có collection riêng.**
> Bản 04/10 (hướng B có bước M2 chuyển dữ liệu) **đã bỏ** — xem git nếu cần tra.
> File này **tự đủ** để bắt đầu lại sau nhiều tháng. Hiện trạng chung: `docs/TRANG_THAI.md`; API engine: `docs/UNIT_ENGINE.md`;
> lượt đọc: `docs/KE_HOACH_TOI_UU_DOC.md` (hạn mức miễn phí 50K/ngày là của **cả project**, mọi quán + XOFA + The Cafe 33 cộng chung).

---

## 0. Khi nào bắt đầu & cách mở phiên

Bắt đầu Bước 1 khi:
1. Bản tối ưu lượt đọc T2/T3 (05/10) **đã deploy** và Firebase Usage cho thấy lượt đọc/ngày đã giảm rõ — mỗi quán mới cộng thêm lượt đọc vào cùng hạn mức.
2. v18 (hoặc bản sau) chạy ổn ở quán hiện tại ≥ vài tuần (04/10: mới 1–3 tuần).
3. Câu hỏi cho Bước 2 đã chốt hết (O7, O8, O13, O16, O17 — 05/10).

**Câu mở đầu cho phiên Claude mới (mỗi bước một phiên):**
> Đọc CLAUDE.md, docs/TRANG_THAI.md, docs/KE_HOACH_DA_CUA_HANG.md và docs/UNIT_ENGINE.md. Chạy `sh tests/run_all.sh` và `node tools/check_boundaries.js`. Làm **Bước N** (mục 5) — phản biện trước, báo tôi rồi mới sửa. Không deploy.

Mức model gợi ý: Bước 1 → Opus, high (engine v19: xhigh) · Bước 2 → Opus, xhigh (webhook CK: max) · Bước 3 → Sonnet, high (cộng gộp số liệu: Opus, high) · Bước 4 → Sonnet, medium · Bước 5 → Opus, xhigh.

---

## 1. Hướng đã chốt (05/10)

**Một project Firebase. Quán hiện tại (`gg01`) giữ NGUYÊN mọi tên collection / đường dẫn RT. Quán mới dùng tên có hậu tố `__{storeId}`.**

| Loại dữ liệu | Quán hiện tại `gg01` | Quán mới, vd `gg02` |
|---|---|---|
| Riêng từng quán (S): sổ kho, bill, ca, kết ca, kiểm kê, tem… | `stock_transactions_gieogieo` (y như hôm nay) | `stock_transactions_gieogieo__gg02` |
| RT riêng từng quán | `active_units_gieogieo/{itemId}` | `active_units_gieogieo__gg02/{itemId}` |
| Dùng chung (G): menu, công thức, danh mục NL/BTP, nhân viên… | một chỗ chung | cùng chỗ chung |
| Dùng chung với XOFA / The Cafe 33 (X): `customers`, `bank_confirmations` | không đổi | không đổi (CK mang mã quán, Bước 2) |

Vì sao chọn cách này:
- **Không chuyển dữ liệu quán đang bán** — bỏ hẳn bước rủi ro nhất của kế hoạch cũ (M2: cửa sổ bảo trì, sao lưu, script, quay lui), không cần buộc cập nhật từ xa: máy quán hiện tại chưa cập nhật vẫn ghi đúng chỗ cũ.
- **Cách ly tuyệt đối**: dữ liệu quán mới ở collection khác hẳn → mọi truy vấn của quán hiện tại không bao giờ thấy dữ liệu quán khác. (Nếu ghi chung collection rồi lọc theo `storeId`, chỉ cần một chỗ quên lọc trong ~700 chỗ là trộn số.)
- Khoá theo ngày (`daily_closings/{ngày}`, kiểm kê, giao ca…) **không phải đổi** — mỗi quán đã ở collection riêng.
- **RT quán mới là gốc riêng** (`…__gg02`), không lồng dưới gốc của quán hiện tại: con của `active_units_gieogieo` là `itemId`, listener gốc (chấm FIFO…) sẽ hiểu nhầm `gg02` là một nguyên liệu.

Cái giá (chấp nhận): hai kiểu đặt tên mãi mãi (chỉ lớp đường dẫn biết); mỗi quán mới phải tạo lại composite index cho collection có hậu tố; báo cáo toàn chuỗi = đọc từng quán rồi cộng.

---

## 2. Hiện trạng (05/10)

- Đã có: engine nhận `storeId` qua `UnitEngine.init({ storeId })` (đang `'gg01'`); bản ghi Firestore MỚI do engine tạo mang `storeId`; khối `P` trong engine.
- **Chưa có** — đường dẫn viết cứng (đếm 05/10):

| Nơi | Viết cứng |
|---|---|
| `unit_engine.v18.js` | 194 lời gọi `collection(...)` dùng hằng/chuỗi (chỉ 6 qua `P`) + RT `ref('…')` |
| `posgieo.html` | 213 `collection('…')` + 30 `ref('…')` |
| `quanlygieo.html` | 258 `collection('…')` + 18 `ref('…')` |

- Tồn kho (`currentStock`, `locationStock`…) nằm **trong doc danh mục** `inventory_items` / `prep_items` (dùng chung) → quán mới cần chỗ riêng cho tồn.
- Mã CK `GG + ddMMHHmmss`, số bill `billCounters_gieogieo` — chung một kiểu cho mọi máy.

---

## 3. Quyết định đã chốt

| # | Chủ đề | Quyết định |
|---|---|---|
| D1 | Kiến trúc | Không backend / Cloud Functions. Engine + lớp dữ liệu là file `.js` tĩnh, nạp bằng `<script src>` |
| **D4** | Hướng đa cửa hàng | **[05/10]** Một project; `gg01` giữ tên cũ; quán mới tên + `__{storeId}` (mục 1). Không chuyển dữ liệu quán hiện tại |
| D5 | Khách hàng | `customers` + tích tem **dùng chung** giữa các quán |
| D6 | Nhân viên | **Dùng chung**, có `storeTags`; check-in ở quán nào cũng được |
| D7 | Lịch làm việc | **Theo cửa hàng**, đổi vị trí được |
| D8 | Chuyển khoản | **Một đường chung** `bank_confirmations`; quán hiện tại giữ mã `GG…` như cũ, quán mới mã có mã quán |
| D10 | Phiếu nhập | **Riêng từng cửa hàng** |
| D11 | Khuyến mãi | Phạm vi **toàn hệ thống** hoặc **danh sách cửa hàng** |
| D12 | Nguồn hàng | Chuyển giữa quán, từ **kho trung tâm**, hoặc NCC giao tận quán |
| D13 | Chuyển mã | Mặc định **chỉ tem nguyên seal** |
| D14 | Dụng cụ cân | Dùng chung |
| D15 | Bảo mật | Tài khoản theo quán + rules: Bước 5 (khi cần); tắt WebView debugging bản phát hành |
| **D16** | Không gian tên | **[05/10]** Mọi collection / gốc RT giữ hậu tố `_gieogieo`; quán ≠ `gg01` thêm `__{storeId}` sau tên. Collection mới: `stores_gieogieo` (G), `store_item_state_gieogieo` (S) |
| D17 | Không chặn bán | Không cơ chế nào chặn bán / chặn khởi động khi offline |
| D18 | Dùng chung với XOFA & The Cafe 33 | `customers`, `bank_confirmations`, webhook Cloud Run, tài khoản `cafe33@…`, rules: Gieo Gieo **chỉ được thêm**, không đổi cấu trúc / quyền / hành vi của họ. `rewards`, `kiosk_config`: không ghi |
| **D19** | Lớp đường dẫn | **[05/10]** `data_access.v1.js` giữ **bảng đăng ký** (S / G / X) và **quy tắc đặt tên duy nhất**, bọc ở gốc SDK (`fstore.collection` / `doc`, `db.ref`) — app + engine không tự đổi tên. Tên chưa đăng ký: `check_paths.js` chặn trước deploy; lúc chạy, quán khác `gg01` báo lỗi |

---

## 4. Câu hỏi phải trả lời

| # | Câu hỏi | Cần trước |
|---|---|---|
| ~~O8~~ | ~~Mã cửa hàng~~ → **chốt 05/10: GG01 (quán hiện tại), GG02, GG03…** Trong dữ liệu dùng chữ thường `gg01`, `gg02` (đúng mặc định engine + `storeId` đã ghi trên bản ghi); hậu tố tên `__gg02`; mã CK quán mới `GG` + `02` + ngày giờ | — |
| ~~O13~~ | ~~Mã nguồn webhook~~ → **đã đọc 05/10** (mục 4.1) | — |
| ~~O7~~ | ~~Độ dài nội dung CK~~ → chủ dự án **không thử** (05/10); nội dung quán mới `TTHD GG02ddMMHHmmss` = 19 ký tự (quán hiện tại 17) | — |
| ~~O17~~ | ~~Chung hay riêng STK?~~ → **chung `0977570035`** (05/10) — webhook không sửa gì | — |
| ~~O16~~ | ~~Cách chọn quán trên POS~~ → **chốt 05/10**: màn đăng nhập cửa hàng bằng mã 6 ký tự, máy tự nhớ, sidebar hiện tên + địa chỉ + nút đăng xuất (mục 5, Bước 2). Đổi mã ở Quản lý không bắt máy đang dùng nhập lại. | — |
| O3 | `finance_gieogieo` chứa gì (dùng chung hay theo quán)? | Bước 1 |
| O4 | Có chuyển tem **đang mở** giữa quán không? (mặc định: không) | Bước 5 |
| O5 | Có bếp trung tâm nấu BTP chuyển đi không? | Bước 5 |
| O6 | Kho trung tâm thao tác trên POS rút gọn hay trên Quản lý? | Bước 5 |
| — | Quán 2 có menu / giá / khuyến mãi khác quán 1 không? | Bước 3 |
| O14 | Target nhân viên theo quán hay toàn chuỗi? (đề xuất: theo quán) | Bước 3 |
| O15 | Chi phí cố định, khấu hao, lương cứng: gắn theo quán hay chia tỷ lệ? (hoà vốn từng quán) | Bước 3 |

### 4.1 Webhook xác nhận CK (Cloud Run `processCakePayment`) — đọc 05/10

- Đọc Gmail báo có tiền; nhận mã bằng `/TTHD ([A-Z]{2}\d+)/` (**2 chữ in hoa + dãy số bất kỳ dài**), chỉ nhận mail có STK trong `KNOWN_ACCOUNTS` (`0964674795` PosX/XOFA, `0977570035` posgieo), ghi RT `bank_confirmations/{orderId}` = `{orderId, amount, account, confirmedAt, source}`.
- POS hiện tạo mã `genBankOrderId()` = `GG` + `ddMMHHmmss` (10 số), nội dung `TTHD GG…`.
- **Kết luận**: quán mới dùng mã `GG` + **2 số mã quán** + `ddMMHHmmss` (12 số), vd `GG020510143055`:
  - webhook **nhận được ngay, không sửa code** (regex nhận dãy số dài bất kỳ); khác STK thì chỉ thêm 1 dòng `KNOWN_ACCOUNTS` (O17);
  - **không bao giờ trùng** mã quán hiện tại (10 số ≠ 12 số) và không đụng tiền tố `DH` của XOFA;
  - quán hiện tại **không đổi gì**.
- Quản lý → dọn dữ liệu (`_ddDateFromBankKey` chỉ hiểu `GG` + 10 số):
  - `ddDeleteBankOld` chỉ xoá `GG` + 10 số cũ > 7 ngày → **không** đụng XOFA (đính chính bản 04/10).
  - **`ddDeleteBankUnknown` (nút xoá "không đọc được ngày") xoá cả khoá `DH…` của XOFA và sẽ xoá khoá quán mới** → Bước 2 sửa: hiểu thêm `GG` + 12 số; chỉ liệt kê / xoá khoá tiền tố `GG`.

---

## 5. Lộ trình

Mỗi bước: **phản biện → báo → sửa → test → `tao_ban_thu` → chủ dự án deploy & thử máy thật**. Không gộp hai bước vào một lần deploy.

### Bước 1 — Lớp đường dẫn + chốt chặn — **[05/10] ĐÃ LÀM (chưa deploy)**
Phản biện 05/10 → **đổi cách làm so với bản đầu** (không sửa ~700 lời gọi, không cần engine v19 ở bước này): bọc ở gốc SDK như chế độ thử đã chạy ổn.
- `data_access.v1.js` (`GieoData`): bảng đăng ký `REG` (87 collection Firestore, 17 gốc RT, 1 đường dẫn Storage — S / G / X) + `install({fstore, db, storeId})` bọc `fstore.collection` / `fstore.doc` / `db.ref` (chặn `collectionGroup`, `refFromURL`, gốc RT ở quán khác). Quán `gg01` → **trả đúng tên cũ**; tên lạ ở `gg01` đi tiếp + cảnh báo, ở quán khác → lỗi. (Bước 1 chỉ cho chạy `gg01`; Bước 2 bỏ chốt này.)
- 2 HTML: `<script src="data_access.v1.js">` trước engine + 1 dòng `GieoData.install(...)` ngay sau dòng tạo `fstore` (thiếu file → chạy tiếp như cũ). Engine **không đổi** (dùng chung `fstore` / `db` đã bọc). Bản `_thu`: `GieoThu.install` (trong) rồi `GieoData.install` (ngoài).
- REST `_ddShallow` (Quản lý → dọn dữ liệu) đổi đường dẫn qua `GieoData.rtPath`.
- `tools/check_paths.js` (trong `predeploy_check.sh`): mọi tên collection / gốc RT / Storage + mọi chuỗi dạng `…_gieogieo` phải đăng ký (bắt cả tên truyền qua biến); 2 app nạp `data_access` đúng 1 lần trước engine, `install` ngay sau `fstore`; REST tới RTDB phải qua `rtPath`. Chuỗi không phải đường dẫn khai ở `tools/paths_allow.json`. `predeploy_check.js` đòi file `data_access.v*.js` có trong thư mục deploy; `tao_ban_thu` / `tao_ban_dem` chép kèm.
- Test `tests/da_cua_hang_b1.test.js`: quy tắc tên; **24 kịch bản giao diện thật (POS + Quản lý + engine) giống từng byte** khi có lớp ở `gg01`; cùng 24 kịch bản chạy ở `gg02` → dữ liệu riêng của quán hiện tại không đổi, không lượt ghi lọt; chế độ thử + `gg02` vẫn trong vùng thử; `check_paths` bắt tên mới / thiếu `install`. Chạy thử 2 app thật + 2 bản `_thu` trên Chromium (Firebase 10.13.2, chặn mạng): không lỗi trang, thiếu file vẫn chạy.
- **Phát hiện cho Bước 2**: chạy ở `gg02`, engine + app còn ghi vào doc danh mục dùng chung `inventory_items` / `prep_items` (trạng thái tồn) → Bước 2 giải bằng danh mục theo quán (không cần engine v19).
- Quy tắc: sửa `data_access` đã deploy = tạo `data_access.v{N+1}.js` (cache lâu như engine), sửa cả 2 HTML; collection / gốc RT mới phải đăng ký vào `REG`.

**Xong khi**: deploy, quán hiện tại chạy ≥ 1 tuần không khác biệt (Sổ lệch, kết ca, lượt đọc).

### Bước 2 — Quán mới chạy được (quán hiện tại không đổi) — **[05/10] ĐÃ LÀM (chưa deploy)**
Chủ dự án chọn 05/10: **bản danh mục riêng mỗi quán** (thay cho `store_item_state` ở bản đầu) → **engine không đổi** (vẫn v18).
- **Danh mục theo quán** (loại **C** trong `REG`): `inventory_items`, `prep_items` của quán ≠ `gg01` ở `…__{storeId}` — tồn nằm trong bản của quán y như quán hiện tại. Cùng mã món giữa các quán (công thức dùng chung trỏ đúng).
  - **Đồng bộ tự động** (`GieoData.install({…, catalogMirror: true})` — chỉ Quản lý): mọi lượt ghi danh mục qua `doc().set/update/delete`, `collection().add`, `batch()` tự ghi cùng trường sang mọi quán khác **đang hoạt động + đã sẵn danh mục** (`catalogReady`). **Không bao giờ chép trường tồn** (`STATE_FIELDS` — kể cả dạng `lastCount.suspect`); lượt ghi chỉ có trường tồn (engine) → không đồng bộ, không tốn lượt đọc. Không phải sửa từng hàm Quản lý; chỗ ghi danh mục viết sau này cũng tự đồng bộ. POS không bật.
  - **Xoá món** bị chặn trước khi xoá nếu quán khác còn tồn món đó. Món thiếu ở quán khác / lỗi mạng → quán đang chạy vẫn lưu, toast báo "chưa đồng bộ sang GG0x".
  - **Tạo quán mới** (`seedNewStore`): chép danh mục (chỉ trường danh mục, tồn 0) + `refill_rules`, `storage_locations` (sửa lại sau); bật `catalogReady` sau khi chép xong, rồi kiểm lệch một lượt.
  - **Đồng bộ danh mục** (`catalogDiff`): kiểm / sửa lệch theo `CATALOG_FIELDS`; không xoá món thừa, không đụng tồn.
- **Chưa đăng nhập cửa hàng** (`storeId: null`): lớp đường dẫn chặn mọi S / C, chỉ đọc được G / X.
- **POS — đăng nhập cửa hàng** (đúng như chủ dự án chốt): máy chưa gắn → màn "Đăng nhập cửa hàng" (mã 6 ký tự → hiện tên + địa chỉ → xác nhận), **app dừng hẳn** cho tới khi gắn; không bao giờ tự gắn. Máy nhớ `gieo_store_v1` → các lần mở sau vào thẳng, **không so lại mã** (Quản lý đổi mã không bắt máy đang dùng nhập lại). Sai 5 lần → chờ 30 giây. Sidebar: thẻ gọn 2 dòng "🏪 {tên} · GG0x / 📍 {địa chỉ}" (sidebar cuộn được); **Đăng xuất khỏi cửa hàng** là chữ nhỏ ở CUỐI sidebar (06/10, chủ dự án: nút to ở đầu dễ chạm nhầm) (chặn khi giỏ có món / đang chờ CK; cảnh báo khi ca đang mở; cần **mã quản lý**). Tên / địa chỉ làm mới 1 lượt đọc mỗi lần mở app. Thiếu `data_access`: máy gắn `gg01` chạy tiếp như cũ; máy gắn quán khác / chưa gắn → báo đỏ + tự tải lại. Bản `_thu` luôn là vùng thử GG01, không hỏi mã.
- **Quản lý → Cấu hình → Cửa hàng**: hồ sơ `gg01` (bước đầu bắt buộc), danh sách quán (tên, địa chỉ, mã đăng nhập, trạng thái, mã CK), thêm quán (`gg` + số kế tiếp), sửa tên / địa chỉ, đổi mã, ngừng / mở lại, kiểm lệch danh mục. Mã 6 ký tự bỏ O/0/I/1, không trùng. Thiếu `data_access` → báo đỏ + tải lại (chạy không bọc thì sửa danh mục không tới quán khác).
- **Chuyển khoản**: `genBankOrderId()` quán ≠ `gg01` → `GG02ddMMHHmmss`; `gg01` y cũ. Dọn dữ liệu: `_ddDateFromBankKey` hiểu cả 12 số; **chỉ xét khoá `GG…`** — khoá của XOFA / The Cafe 33 chỉ đếm, không bao giờ vào danh sách xoá (sửa luôn lỗi cũ: nút "xoá không rõ ngày" từng xoá được khoá `DH…` của XOFA).
- Bản ghi mới do engine tạo đã mang `storeId` (E6). Test: `tests/da_cua_hang_b2.test.js` (đồng bộ, chặn xoá, quán mới, kiểm lệch, chưa đăng nhập, gắn máy, mã CK, 24 kịch bản thật ở `gg01` có bật đồng bộ → không ghi gì sang `gg02`; **mọi trường engine / POS / Quản lý ghi lên doc danh mục phải nằm trong `STATE_FIELDS` hoặc `CATALOG_FIELDS`** — trường mới chưa phân loại → test đỏ); `da_cua_hang_b1` cập nhật: chạy `gg02` không còn ghi vào dữ liệu dùng chung. Chromium: màn nhập mã → gắn → vào thẳng → sidebar → đăng xuất; máy `gg01` vào thẳng, mã CK y cũ; thiếu file → báo đỏ; màn Cửa hàng; 2 bản `_thu`.
- **Còn lại trước khi mở quán 2 (Bước 4)**: nhãn bill in mã quán (quán ≠ `gg01`); check-in / nhân viên `storeTags`; nhãn tên quán đầu màn bán hàng (chưa làm — sidebar đã hiện).
- **Triển khai** (máy quán hiện tại cũng phải nhập mã một lần): deploy **ngoài giờ bán** → mở Quản lý ▸ Cấu hình ▸ Cửa hàng → tạo hồ sơ GG01 (tên, địa chỉ) → lấy mã → nhập trên từng máy POS. Muốn POS không dừng phút nào: deploy lần 1 chỉ Quản lý + `data_access` (giữ `posgieo.html` cũ), tạo hồ sơ, rồi deploy lần 2 có POS.

### Bước 3 — Quản lý đa quán
- **[06/10] ĐÃ LÀM phần chính (chưa deploy)**:
  - `data_access.v2.js` (v1 đã deploy, giữ để quay lui): thêm `withStore(id, fn)` — chỉ chạy khi app cài `storeId: null` (Xem tất cả), đổi tạm quán cho đúng một hàm, **tuần tự có khoá**, xong trả về null. `check_paths` buộc 2 app nạp bản `data_access` mới nhất; test + công cụ tự đọc bản mới nhất.
  - Quản lý: `QL_VIEW` (localStorage `ql_view_store_v1`) = `gg01` / `gg02`… / `all`. Ô chọn ở đầu sidebar (ẩn khi chỉ có 1 quán); tiêu đề luôn ghi quán đang xem. Đổi quán = lưu + tải lại trang. Từng quán: mọi màn y như trước, dữ liệu quán đó.
  - Xem tất cả: cài `storeId: null` → mọi dữ liệu riêng bị chặn tận gốc. Chỉ có **Hôm nay tổng hợp** (chỉ xem): doanh thu + bill từng quán + tổng; việc cần xử lý gộp, gắn nhãn quán (`computeStoreHealth` trong `withStore`, xoá bộ đệm trước/sau mỗi quán) — bấm một việc → chuyển đúng quán, mở đúng việc (`ql_after_switch_v1`); tồn kho so sánh NL + BTP (cột từng quán + tổng, mặc định chỉ món âm / dưới ngưỡng). Mục khác → hộp "chọn cửa hàng để mở mục này".
  - Đơn đặt hàng: ô "Cửa hàng nhận" (khi có từ 2 quán) → đơn ghi vào sổ đơn của quán nhận (`GieoData.collFor`), có trường `storeId`.
  - Test `tests/da_cua_hang_b3.test.js`; Chromium: ô chọn quán, chuyển Tất cả, chốt chặn mục khác, màn tổng hợp, bấm việc → chuyển đúng quán.
  - **Báo cáo · Tất cả cửa hàng** (06/10): Báo cáo kỳ / Sức khoẻ tài chính / Tổng kết tháng ở chế độ Tất cả → một bảng: mỗi quán một cột + Tổng (doanh thu, bill, AOV, ly/bill, giá vốn, lãi gộp, lương, hao hụt, đổ ly, chi phí vận hành, đóng góp, EBIT) cho Tuần này / Tuần trước / Tháng này / Tháng trước — cùng `computeKPIs` với Báo cáo kỳ, từng quán trong `withStore`; Tổng = cộng số tuyệt đối rồi tính lại tỷ lệ.
  - Mục tiêu, lịch làm việc, chi phí, sổ tiền: đã theo quán sẵn (dữ liệu riêng). Menu / giá / khuyến mãi / lương theo quán: xem "Không làm" ở Bước 4.
  - **[07/10] Rà Quản lý khi có từ 2 quán** (`data_access.v4.js`):
    - Lương cứng chỉ tính cho **quán chính** của nhân viên (`employees.homeStore`, thiếu = `gg01`; `empFixedPayHere`) ở chi phí lương thật, lương dự đoán theo lịch, bảng lương — trước đây mọi quán cộng đủ lương cứng của mọi nhân viên (Tất cả cửa hàng gấp đôi). Ô "Quán chính" ở form Nhân viên khi có ≥ 2 quán.
    - `payroll_month_adjustments` (thưởng / phạt / lương thực nhận) G → **S**: GG01 giữ nguyên tên + dữ liệu cũ, quán khác `__{storeId}`.
    - Lương / Tổng kết tháng: chỉ liệt kê nhân viên có ca / lương / quán chính / thưởng-phạt ở quán đang xem (`qlEmpThuocQuan`), ghi số người bị ẩn.
    - Mục tiêu: nhãn "chung mọi cửa hàng" (Target KPI, Cấu hình Labor — `config_history`) / "riêng GGxx" (Target nhân viên, Tài chính). Bật Labor thật (`hr_settings`) ghi "chung mọi cửa hàng".
    - Kiểm toán: `audit_logs` ghi `storeId`, danh sách gắn nhãn quán (bản ghi cũ = GG01).
    - Trích xuất dữ liệu: tên file `gieo-ggNN-…` + trường `_cuaHang` (một quán: tên file như cũ).
    - Tạo quán mới: chép thêm ngưỡng tài chính (`FINANCE_COPY_FIELDS`: lệch kiểm kê, lệch bao bì, dung sai tiền mặt / giao ca, tiền đầu ca mặc định, hao hụt thật) — không chép vốn đầu tư / quỹ / mốc thu hồi vốn.
    - Trợ lý bán hàng ▸ "Dựng lại hồ sơ thói quen khách": **khoá** khi có ≥ 2 quán (đọc bill một quán rồi ghi đè `customers.assist_profile` dùng chung → mất thói quen ở quán kia; POS vẫn tự cộng dồn sau mỗi đơn).
    - Chưa làm: Khách hàng · Tất cả cửa hàng (khách đi cả 2 quán đang bị tách theo quán).
  - **[08/10] Rà trước khi mở GG02** (từ một bản review bên ngoài, đã đối chiếu code; không đổi `data_access`):
    - Tạo cửa hàng đứt giữa chừng: POS **từ chối mã** của quán `catalogReady === false`; Cửa hàng ▸ **Tiếp tục thiết lập** (`storeResumeSetup`) chỉ THÊM doc còn thiếu (danh mục tồn 0, refill, vị trí kho, ngưỡng tài chính) — không ghi đè doc đã có, nên không đưa tồn về 0 — rồi bật `catalogReady` + kiểm lệch.
    - POS dữ liệu trên máy: dấu `gieo_ls_store_v1`; máy đổi quán → bỏ `POS_LS_THEO_QUAN` (cache máy in, quét nấu dở, đổ ly dở, khoá chống trùng đơn, gợi ý nấu, tần suất trợ lý, hàng đợi lưu trữ bill). Giữ `pos_tem_*` (canh theo máy in), cấu hình chung, hàng đợi tích điểm (khách dùng chung). Đăng xuất: liệt kê việc dở, phải xác nhận bỏ.
    - Đổi cấu hình giá vốn (định mức, giá NL, bao bì…): `invalidateSalesCache` xoá bộ đệm doanh thu của **mọi** quán.
    - Báo cáo · Tất cả cửa hàng: gồm quán đã ngừng nếu có bill trong kỳ; có quán đọc lỗi → "Tổng tạm tính — thiếu GGxx" (cả màn Hôm nay tổng hợp).
    - **Ngừng sử dụng NL / BTP** (chủ dự án chọn): `active=false` (trường danh mục, đồng bộ mọi quán). Xoá chỉ còn cho món chưa từng có tồn / tem / lô / giao dịch ở quán đang xem (+ `chanXoa` quán khác). Món ngừng dùng: bỏ khỏi ô chọn (`conDung`), cảnh báo sắp hết, nhận hàng tự do (POS), chọn BTP nấu mẻ mới (`POS_PREP_CON_DUNG`). POS giữ ĐỦ BTP trong `PREP_ITEMS_CACHE_POS` (engine dò BTP qua `getPreps`).
    - Không làm: đồng bộ danh mục khi hai máy sửa cùng lúc (hiếm; Kiểm lệch sửa được); phân quyền theo quán (Bước 5); `fetchOrdersForDate` bỏ qua lỗi đọc (có từ trước, mọi báo cáo — việc riêng).
- **Chủ dự án chốt 06/10**:
  - Quản lý có **cả hai chế độ**: **xem từng quán** (chuyển qua lại giữa các quán) và **xem tất cả cửa hàng**. Mỗi máy nhớ lựa chọn lần trước.
  - **Kho**: tem, lô, tồn, sổ của mỗi quán là riêng (đã tách ở Bước 2). Xem từng quán thì mọi màn Kho giữ nguyên như hiện nay, và **mọi thao tác ghi chỉ làm ở chế độ này**. Xem tất cả thì **chỉ xem**: bảng tồn so sánh (mỗi NL/BTP một dòng, cột từng quán + tổng) và việc kho cần xử lý gộp lại, gắn nhãn quán, bấm vào là chuyển sang đúng quán. Tem / lô không gộp thành một danh sách.
  - **Không có chuyển nguyên liệu giữa các quán.**
  - **Đơn đặt hàng**: mỗi đơn riêng; lúc tạo đơn **chọn cửa hàng nhận** (mặc định = quán đang xem). Đơn nằm ở dữ liệu của quán đó, POS quán đó nhận hàng.
  - **Mức tồn tối thiểu** (`minStock`, cảnh báo sắp hết): **chung cho mọi quán** — giữ trong danh mục chung, đồng bộ như hiện nay (Bước 2), không làm mức riêng theo quán.
- Bộ chọn quán (mặc định quán hiện tại): 1 quán / nhiều / toàn chuỗi; báo cáo gộp = đọc từng quán rồi cộng (bản tổng hợp theo ngày `ledger_day_summaries` đi theo quán → `…__{storeId}`).
- Menu chung + `store_menu_overrides_gieogieo/{storeId}` = `{hidden:[…], price:{…}}`; công thức chung.
- Khuyến mãi: chương trình / chiến dịch có `stores: 'all' | [storeId…]` (thiếu = toàn hệ thống).
- Phiếu nhập, lịch làm, checklist, ngày đặc biệt theo quán; nút "sao chép cấu hình từ quán A".
- Lãi/lỗ & hoà vốn theo quán (O15); lương dự đoán lọc lịch theo quán (D7); target nhân viên theo quán (O14); `duty` (vụ lệch, xác minh, tóm tắt ngày) theo quán; `duty_config` chung có ghi đè theo quán.

### Bước 4 — Thử & mở quán 2 — **[06/10] công cụ đã sẵn, chờ chủ dự án chạy runbook**
Đã làm 06/10: bản thử POS "Thử cửa hàng khác" (đăng nhập mã quán tạo trong vùng thử); `tools/index_quan_moi.js` (danh sách composite index cho quán mới, quét code); Báo cáo · Tất cả cửa hàng (tuần / tháng). Không cần sửa code thêm để mở quán 2.

**A. Thử trong bản thử** (`posgieo_thu.html` / `quanlygieo_thu.html`, dữ liệu thử — không đụng dữ liệu thật):
1. Quản lý bản thử ▸ Cấu hình ▸ Cửa hàng: tạo hồ sơ GG01 (vùng thử) → Thêm cửa hàng mới (GG02 thử) → ghi lại mã 6 ký tự.
2. POS bản thử ▸ sidebar ▸ "Thử cửa hàng khác" → nhập mã GG02 thử → bán, nhận hàng (sinh tem), mở tem, nấu BTP, kiểm kê, kết ca.
3. Quản lý bản thử: đổi qua lại GG01 / GG02 / Tất cả — số liệu tách đúng quán; tồn GG01 thử không đổi khi bán ở GG02 thử.
4. Xong: "Về thử GG01"; Kết thúc thử để xoá vùng thử (xoá cả dữ liệu thử của GG02).

**B. Mở thật**:
1. `node tools/index_quan_moi.js gg02` → tạo **6 composite index** ở Firebase Console ▸ Firestore ▸ Indexes ▸ Composite (Query scope: Collection), chờ **Enabled**. (Thiếu index: màn lọc + sắp xếp ở quán 2 lỗi hoặc đọc sổ gốc tốn gấp nhiều lần.)
2. Quản lý (đang xem GG01) ▸ Cấu hình ▸ Cửa hàng ▸ Thêm cửa hàng mới: tên + địa chỉ GG02 → danh mục NL / BTP chép sang (tồn 0), refill rules + vị trí kho chép sang. Lấy mã 6 ký tự.
3. Quản lý ▸ chọn GG02 ở đầu sidebar: sửa refill rules / vị trí kho cho đúng quán 2; danh mục chi phí, nhân viên dùng chung (không phải làm). **Nhân viên lương cứng làm chính ở quán 2** → Nhân sự ▸ Nhân viên ▸ sửa ▸ "Quán chính" = GG02. Cấu hình ▸ Mục tiêu ▸ Tài chính (đang xem GG02): khai vốn đầu tư / quỹ của quán 2 nếu muốn theo dõi thu hồi vốn.
4. Máy POS quán 2: mở link POS như quán 1 → nhập mã GG02 → **cài đầu bill (tên, địa chỉ) ở POS ▸ Máy in** (cấu hình in tách theo quán).
5. Nhập hàng đầu kỳ quán 2: Quản lý (GG02) ▸ Đặt hàng (Cửa hàng nhận: GG02) → POS GG02 nhận hàng, in tem.
6. Thử 1 lần chuyển khoản thật nhỏ ở quán 2 (mã CK `GG02…`, cùng tài khoản ngân hàng — webhook không đổi).
7. Theo dõi 2–4 tuần: Sổ lệch, kết ca, **lượt đọc** (hạn mức chung cả 3 thương hiệu), CK.

**Không làm (đã cân nhắc 06/10)**: nhãn bill in mã quán (đầu bill cấu hình riêng theo quán là đủ); menu / giá / khuyến mãi riêng từng quán (hai quán dùng chung menu, giá, khuyến mãi — khi cần khác thì làm); nhân viên `storeTags` (nhân viên dùng chung, ai cũng check-in được ở quán nào — ca ghi đúng quán). **Lương** tính theo ca ở quán đang xem (lương cứng: quán chính, 07/10): nhân viên làm ở cả 2 quán thì lương giờ nằm ở 2 quán — cần "Lương · Tất cả cửa hàng" thì báo.

### Bước 5 — Khi cần
- **Chuyển kho / kho trung tâm**:
```
[Tạo]  bên gửi quét mã (chỉ tem sealed) → phiếu draft
[Xuất] mã: status=in_transit, transferId; sổ bên gửi TRANSFER_OUT; tồn bên gửi suy lại
[Nhận] bên nhận quét → mã chuyển sang collection tem của bên nhận, status=sealed; sổ TRANSFER_IN; tồn bên nhận suy lại
[Chốt] mã không quét được → Sổ lệch bên nhận ('transfer_missing'); mã lạ → từ chối
[Huỷ]  trước khi nhận: mã về sealed bên gửi, sổ đảo
```
  Engine thêm nhóm `transfer.*` + `stock_transfers_gieogieo` (G). Kho trung tâm = cửa hàng `type:'warehouse'`. Phụ thuộc O4–O6.
- **Tài khoản theo quán + rules** (D15): custom claims `{brand:'gieogieo', storeId, role}`; rules chỉ áp lên `*_gieogieo` + tài khoản có claim; tài khoản chung `cafe33@…` giữ nguyên.

---

## 6. Phân loại dữ liệu (bảng đăng ký của `data_access`)

**S** theo quán (`gg01` tên cũ, quán khác `+__{storeId}`) · **G** dùng chung · **G+s** dùng chung, bản ghi mang `storeId` · **C** danh mục theo quán (Bước 2 — `inventory_items`, `prep_items`; trong `REG`) · **G+o** chung có ghi đè theo quán (Bước 3) · **X** dùng chung với XOFA & The Cafe 33. Tên bỏ hậu tố `_gieogieo`. **Trước Bước 1 chạy lại `npm run inventory` và đối chiếu — không dựa vào bảng tay.**

| Collection | Loại | Ghi chú |
|---|---|---|
| `alerts`, `assets`, `assist_profile_effects`, `bill_deletions`, `book_closings`, `cashfund`, `checklist_activity_logs`, `checkout_side_effects`, `cogs`, `daily_closings`, `daily_openings`, `daily_ops`, `daily_sales_cache`, `employee_stock_deductions`, `expenses`, `handover_counts`, `handover_records`, `label_reprints`, `ledger_day_summaries`, `order_stock_traces`, `orders_gieogieo_archive`, `prep_batches`, `prep_forecasts`, `prep_ingredient_locks`, `prep_shortage_recons`, `prep_transactions`, `purchase_orders`, `receiving_records`, `refill_rules`, `reversal_unit_claims`, `sales_assist_logs`, `shift_inventory_counts`, `shift_segments`, `shift_workflows`, `staff_notes`, `stock_anomalies`, `stock_containers`, `stock_counts`, `stock_label_reports`, `stock_lost_reports`, `stock_transactions`, `storage_locations`, `work_schedules` | S | khoá theo ngày / tháng giữ nguyên (đã tách theo collection) |
| `employee_shifts` | S | nơi check-in |
| `duty_cases`, `duty_tasks`, `duty_digests`, `duty_verify_undo`, `dup_recovery`, `order_cancel_marks`, `loyalty_bill_effects`?, `stamp_free_redemptions`? | S / ? | `loyalty_bill_effects`, `stamp_free_redemptions` ghi cùng transaction với `customers` (X) theo `billId` — giữ G+s nếu `billId` không trùng giữa quán; chốt ở Bước 1 |
| `staff_target_config`, `staff_target_days` | S | O14 |
| `inventory_items`, `prep_items` | C (danh mục theo quán) | Bước 2: mỗi quán một bản (tồn trong bản của quán), Quản lý sửa → tự đồng bộ trường danh mục |
| `employees` | G | lương cứng tính cho quán chính `homeStore` (07/10); `storeTags`: không làm |
| `payroll_month_adjustments` | S | thưởng / phạt theo tháng — 07/10 G → S (data_access.v4) |
| `expense_categories`, `hr_settings`, `ingredient_original_packs`, `note_reasons`, `waste_reasons`, `payment_methods`, `packaging_*`, `recipes`, `recipe_history`, `recipe_suggestions`, `topping_recipes`, `prep_recipe_history`, `prep_vessels`, `stores` | G | |
| `audit_logs`, `config_history`, `price_history`, `loyalty_pending_retry` | G+s | |
| `shift_checklists`, `special_days`, `duty_config` | G+o | |
| Storage `receiving_photos_gieogieo/{recordId}` | S | theo phiếu (phiếu đã theo quán) |
| `customers` | X | chỉ thêm trường tuỳ chọn |
| `rewards` | — | của The Cafe 33, Gieo Gieo không dùng |
| `finance` | ? | O3 |
| `wallets_gieogieo`, `donggia_config` | — | tính năng đã loại — không đụng |

### Đường dẫn RT
| Gốc | Loại | Quán khác `gg01` |
|---|---|---|
| `active_units_gieogieo`, `orders_gieogieo` (cả lưu trữ, REST `_ddShallow`), `billCounters_gieogieo`, `rev_marks_gieogieo`, `duty_verify_fence_gieogieo`, `printer_layout_gieogieo`, `sales_assist_stats_gieogieo` | S | `{gốc}__{storeId}/…` — gốc riêng, **không** lồng dưới gốc cũ |
| `menu_gieogieo`, `menu_togo_gieogieo`, `food_gieogieo`, `food_menu_gieogieo`, `toppings_gieogieo` | C | chung + `store_menu_overrides_gieogieo` |
| `togoSettings_gieogieo`, `sales_assist_config_gieogieo`, `appFeeSettings_gieogieo` | C | chung + phạm vi quán (Bước 3) |
| `session_display_gieogieo` | — | xoá (K0) |
| `bank_confirmations` | X | khoá CK quán mới có mã quán (Bước 2) |
| `kiosk_config` | X | của XOFA — không đụng |

---

## 7. Rủi ro chính

| Rủi ro | Mức | Cách giảm |
|---|---|---|
| Bước 1 làm đổi hành vi quán hiện tại | Cao | `gg01` → chuỗi cũ y hệt (test từng tên); 50+ test hiện có xanh nguyên; chế độ thử; theo dõi 1 tuần trước Bước 2 |
| Code viết sau này đi vòng lớp đường dẫn → quán mới ghi vào chỗ quán cũ | Cao | `check_paths.js` trong `predeploy_check`; tên chưa đăng ký ném lỗi |
| Máy chạy nhầm quán | Cao | Không tự gắn: máy nào cũng phải nhập mã 6 ký tự của quán; tên + địa chỉ quán trên sidebar, nhãn quán trên màn bán; đăng xuất / vào quán khác cần mã |
| Lên bản POS có màn đăng nhập mà quán hiện tại chưa có mã → không vào bán được | Cao | Thứ tự triển khai Bước 2: Quản lý + hồ sơ `gg01` trước, POS sau, ngoài giờ bán |
| Webhook Cloud Run hỏng → **cả ba thương hiệu** mất tự xác nhận CK | Thấp (05/10) | Mã quán mới khớp regex sẵn có → không sửa webhook; STK riêng chỉ thêm 1 dòng, thử CK thật từng thương hiệu |
| Nút xoá "không đọc được ngày" ở Quản lý xoá nhầm CK của XOFA / quán mới | Cao (có từ trước) | Bước 2 mục CK.3 |
| Làm hỏng XOFA / The Cafe 33 | Rất cao | D18; không đổi rules / tài khoản chung ở Bước 1–4 |
| Deploy xoá nhầm file thương hiệu khác (chung site Hosting) | Rất cao | `tools/site_files.txt` + `predeploy_check` |
| Quán mới thiếu composite index → màn hình lỗi / đọc gốc nhiều | Cao | Runbook Bước 4 tạo index theo danh sách sinh tự động |
| Vượt hạn mức đọc miễn phí khi thêm quán | Trung bình | Tối ưu đọc (T2–T6) trước; theo dõi Usage hằng tuần; quyết định trả phí nếu cần |

---

## 8. Mỗi bước phải giữ

- 15 bất biến engine B1–B15 (`docs/UNIT_ENGINE.md` mục 1) — **tem = sự thật**, FIFO theo `openedAt`, chống đúp theo `txId`.
- `sh tests/run_all.sh` xanh; `node tools/check_boundaries.js` sạch; (từ Bước 1) `check_paths.js` sạch.
- Quán hiện tại: **không chuyển, không đổi tên dữ liệu**.
- Đổi engine = file mới `unit_engine.v{N+1}.js` (kế tiếp: **v19**), 2 HTML trỏ cùng bản, ghi `tools/engine_releases.txt`, giữ bản cũ.
- Sau mỗi lần sửa HTML: `node tools/tao_ban_thu.js .` và gửi 2 file `_thu`.
- Claude **không deploy**; chủ dự án chạy `sh tools/predeploy_check.sh` rồi `firebase deploy --only hosting`.
