# PROTECTED INFRASTRUCTURE ADAPTER CONTRACT — V1

> Nguồn: đọc trực tiếp `posgieo.html` (in bill, in tem, quét mã, thanh toán ngân hàng — toàn bộ pipeline, không chỉ tên hàm). Đây là phần bổ sung bắt buộc cho `GIEO-CODE-STRUCTURE-BLUEPRINT-V1.md` (`packages/protected-adapters`) và cụ thể hóa invariant #22 (`GIEO-SYSTEM-REBUILD-PLAN.md`: "Bank/APK infrastructure là protected boundary — không rewrite").
>
> **Ranh giới quan trọng:** "không rewrite" áp dụng cho *giao thức/semantics giao tiếp phần cứng* (byte encoding, bridge API, one-shot handshake). Nó **không** có nghĩa là chép nguyên cả bug — mục 8 liệt kê rõ những chỗ code cũ SAI về mặt kỹ thuật (không phải quyết định nghiệp vụ) và phải sửa khi viết adapter mới.

---

# 1. BILL PRINTER — `BillPrinterAdapter`

## 1.1 Pipeline thật (từ `confirmPay`, dòng 21828-22047)
```text
confirmPay()
  → chốt chặn nghiệp vụ (đóng ngày/mở ca/checklist)
  → dựng order
  → ghi order vào orders_gieogieo/{...}/{idemKey}   (idempotent, bill đã tồn tại thì bỏ qua ghi)
  → applySalesConsumptionPOS()                       (trừ kho — LUÔN chạy, không phụ thuộc in)
  → claim nguyên tử _ueClaimCheckoutSideEffects(billId)  (chỉ 1 lượt "thắng" chạy khối dưới)
      → POSPrinter.autoPrintIfEnabled(order)          (in bill — KHÔNG AWAIT, fire-and-forget)
      → POSTemPrinter.printOrderLabels(order)         (in tem — KHÔNG AWAIT, fire-and-forget)
      → openCashDrawerIfConnected()
      → loyalty/voucher/stamp
```
**Điểm cốt lõi phải giữ:** in bill/in tem KHÔNG BAO GIỜ chặn hay rollback việc trừ kho/ghi bill — order và stock transaction đã "chốt" trước khi in được gọi. Lỗi in chỉ toast, không tạo lại đơn, không hoàn kho.

## 1.2 🔴 BUG THẬT CẦN SỬA — hàng đợi in bị "đầu độc" vĩnh viễn
`POSPrinter._queue = Promise.resolve()`, mọi lệnh in chain kiểu `this._queue = this._queue.then(() => this._doPrint(order))` — **KHÔNG có `.catch()` phục hồi**. Một lần in lỗi (mất kết nối, hết giấy) làm `_queue` thành Promise rejected vĩnh viễn → **mọi lệnh in bill sau đó (kể cả reprint) im lặng không chạy nữa**, chỉ tới khi reload app.

So sánh: `POSTemPrinter._enqueue()` (dòng 6192-6198) làm ĐÚNG:
```js
const next = POSTemPrinter._queue.then(fn, fn);   // lỗi lượt trước không chặn lượt sau
POSTemPrinter._queue = next.catch(() => {});       // luôn giữ queue ở trạng thái chạy được
```
**Quyết định:** `BillPrinterAdapter` PHẢI dùng đúng pattern queue tự phục hồi như tem (không dùng chung code với bản bill cũ). Đây là fix bắt buộc, không phải "giữ nguyên để tương thích" — hành vi cũ là lỗi kỹ thuật thuần túy, không phải quyết định nghiệp vụ.

## 1.3 Engine & giao thức
- `printBillRawBytes` (bill) khác `printRawBytes` (tem) — 2 hàm bridge riêng trên cùng `window.AndroidPrinter`, không dùng lẫn.
- Bill in qua `XprinterBillBridgeEngine` — Bluetooth, pipeline: `initPrinter()` → `printCanvasRaster(canvas)` → `feed()`. Nội dung dựng bằng `buildReceiptContent()` → `renderReceiptCanvas()` (canvas raster, không phải lệnh text thuần).
- **Đã chốt (xem `DEAD-FEATURE-PRUNING-V1.md` §4): KHÔNG mang `XprinterWNN58E`/Web Serial sang.** Hệ thống mới chỉ chạy trong APK, `BillPrinterAdapter` chỉ có 1 đường Bluetooth qua `window.AndroidPrinter`, không cần nhánh dự phòng/feature-detect cho trình duyệt thường như legacy.
- Kết nối: máy phải **ghép nối Bluetooth trước trong Cài đặt Android** (app không tự pair) → `connectBluetoothApp(mac)` → lưu MAC vào `printer_layout_gieogieo.billPrinterMac` (RTDB, dùng chung mọi máy POS trong quán) → tự kết nối lại lúc khởi động app bằng MAC đã nhớ.

## 1.4 Reprint bill
Không giới hạn thời gian (chỉ danh sách hiển thị bị giới hạn 60 phút, tra ngoài cửa sổ đó vẫn được bằng mã bill/SĐT). **Không có side-effect nào khác** ngoài in + ghi log `label_reprints_gieogieo` (field `kind` phân biệt bill/tem) — đúng "in thuần túy".

---

# 2. LABEL PRINTER (TEM) — `LabelPrinterAdapter`

## 2.1 Thời điểm in theo nghiệp vụ (khác nhau theo loại tem)
| Loại tem | Trigger | Tự động hay bấm tay |
|---|---|---|
| Tem ly bán hàng | Ngay khi `confirmPay()` thành công | Tự động (nếu `POSTemPrinter.enabled`) |
| Tem kho (nhận hàng) | **Ngay lúc nhập hàng**, KHÔNG phải lúc mở nắp — lý do: seal còn nguyên thì chưa có danh tính | Bấm tay ("In tất cả"/từng cái) — điều hướng gợi ý nhưng không tự in |
| Tem mở (mở seal dùng dở) | Khi mở container | Giữ nguyên mã cũ (không sinh mã mới) |
| Tem lô chế biến (BTP) | Khi chốt mẻ nấu | Bấm tay |

## 2.2 🔴 Container/Unit KHÔNG rollback nếu in tem lỗi
`createContainersForReceipt()` cố tình **không ném lỗi ra ngoài** — nhập hàng đã ghi sổ kho xong, sinh tem lỗi chỉ toast + đẩy vào hàng đợi "Tem chờ dán" (`STOCK_LABEL_PENDING`) để in lại sau, KHÔNG rollback phiếu nhập/kho. **Đây là quyết định ĐÚNG, giữ nguyên** khi thiết kế Unit lifecycle mới — Unit tồn tại độc lập với trạng thái đã-in-tem-hay-chưa (map với `FIFO-CORE-ARCHITECTURE-V2.md` §2: KHÔNG có state "chờ tem" nào chặn Unit chuyển sang `SEALED`).

## 2.3 Giao thức: TSPL vs ESC/POS
Setting nhân viên chọn tay (`printer_layout_gieogieo.temEngine`, mặc định **TSPL**) — không auto-detect theo model máy. TSPL có lệnh `SIZE/GAP/OFFSET` để máy tự canh tem (khuyến nghị mặc định); ESC/POS không có khái niệm khổ tem, dễ in đè. Cả 2 dùng chung `canvasToMonoBitmap()` để rasterize, khác nhau ở header/footer lệnh.

## 2.4 Đường gửi — CHỈ 1 ĐƯỜNG, không có fallback
`sendBytesToXprinterApp()` = gọi thẳng `window.AndroidPrinter.printRawBytes()` — **đây là đường DUY NHẤT**. Trước đây có fallback qua app RawBT trung gian nhưng đã bị **cố ý xoá** vì gây văng WebView khi máy in mất kết nối. **Quyết định giữ nguyên:** `LabelPrinterAdapter` KHÔNG được tự ý thêm lại đường fallback thứ 2 — nếu bridge không sẵn sàng, báo lỗi rõ ràng thay vì thử đường khác (bài học từ chính lịch sử sửa lỗi của legacy).

## 2.5 Kết nối LAN — 3 lớp chống rớt (phức tạp hơn Bluetooth của bill printer nhiều)
Máy in tem tự đóng socket sau 30-90s nhàn rỗi và chỉ nhận **1 phiên TCP tại 1 thời điểm**. 3 lớp:
1. Nhớ IP cuối (localStorage cấp máy, KHÔNG lưu cloud vì IP đổi theo DHCP) → tự nối lại ngay trước khi in.
2. Watchdog nền định kỳ (chỉ chạy nếu app hỗ trợ `setTemKeepAlive`/`getTemStatus` — tức APK bản mới, cần feature-detect).
3. `temEnsureConnected()` có khoá single-flight chống gọi `connectPrinter()` chồng lấp — bắt buộc vì máy chỉ nhận 1 phiên.

**Quyết định:** `LabelPrinterAdapter` giữ nguyên cả 3 lớp — đây không phải dư thừa, mỗi lớp giải quyết 1 race condition thật đã được xử lý qua nhiều đợt vá lỗi (comment `[FIX-tem-wipe]` trong code xác nhận từng có bug mất cấu hình `temEnabled` toàn quán do 1 máy ghi `.set()` thay vì `.update()`).

## 2.6 Reprint tem — có giới hạn thời gian, KHÔNG giới hạn số lần
Chỉ cho in lại trong `20 phút` kể từ `order.createdAt` (khác bill: không giới hạn thời gian). Guard đặt ở TỪNG HÀM nghiệp vụ (không chỉ ở nút bấm) để không bị vòng qua console. Đây là **lớp 1 trong 3 lớp chống gian lận "đá bill"** của legacy (lớp 2: danh sách bill chỉ hiện 60 phút; lớp 3: đếm tiền cuối ca tối đa 2 lần) — **các con số/luồng chống gian lận này là business rule, thuộc `packages/commands`, không thuộc adapter** (xem §6).

---

# 3. SCANNER — `ScannerAdapter`

## 3.1 Pattern giao tiếp
WebView không tự cấp quyền camera cho app quán (thiếu `onPermissionRequest`), nên quét luôn giao cho UI native. Callback qua **global function + pending-map** (không phải Promise trực tiếp từ native):
```text
posScan() → sinh id duy nhất → gọi AndroidScanner.scan(id) → trả về 1 Promise LUÔN resolve
                                                                 (KHÔNG BAO GIỜ reject),
                                                                 timeout 90s đề phòng app treo
window.__androidScanResult(res) → app gọi ngược đúng 1 lần, đối chiếu res.id với map đang chờ
```
**Quyết định:** `ScannerAdapter.scan()` giữ đúng contract "luôn resolve, không bao giờ reject" — caller luôn nhận `{ok, code, format, error}` và tự xử lý `ok:false`, không dùng try/catch cho luồng lỗi bình thường (khác với net error thật).

## 3.2 Chống mã trùng / quét nhầm (business logic, không phải adapter concern)
`findContainerByCode()` + `chanMaTrung()` — nếu >1 Unit "sống" trùng mã, chặn cứng + yêu cầu Quản lý cấp lại mã. Mỗi màn nghiệp vụ tự validate thêm theo ngữ cảnh (đúng itemId đang mong đợi, đúng status, chưa quét trùng trong lượt hiện tại). **Đây là logic thuộc Unit Identity (`FIFO-CORE-ARCHITECTURE-V2.md` §1), không phải logic của `ScannerAdapter`** — adapter chỉ trả `{code}` thô, validate mã trùng/hợp lệ nằm ở `packages/commands`.

## 3.3 🟡 AMBIGUOUS — chưa xác nhận có fallback nhập tay khi quét lỗi
Không tìm thấy ô nhập mã bằng tay khi máy quét timeout/lỗi tạm thời (chỉ toast lỗi + gợi ý lời nói "chọn tay" ở `chanMaTrung`, không rõ UI cụ thể). Khi hoàn toàn không có scanner (`posScanAvailable()===false`), không tìm thấy input thay thế nào trong phạm vi đã audit. **Khuyến nghị cho thiết kế mới:** bổ sung tường minh 1 ô nhập mã tay làm fallback cho mọi command dùng `ScannerAdapter` — đây là cải tiến so với legacy, không phải giữ nguyên hành vi (legacy có khả năng có gap thật ở đây, không chỉ là chưa audit hết).

---

# 4. BANK PAYMENT (VietQR) — `BankPaymentAdapter`

## 4.1 Pipeline
```text
bấm "Chuyển khoản" → openVietQRPopup()
  → genBankOrderId()                       ('GG' + ddHHmmss)
  → build URL ảnh QR (img.vietqr.io, tài khoản Cake cố định)
  → startBankListener(orderId)             (lắng nghe RTDB bank_confirmations/{orderId})
       ├─ (tự động) webhook ghi node này → callback → confirmPay() → XOÁ node ngay (one-shot)
       └─ (thủ công) nhân viên bấm "ĐÃ CHUYỂN KHOẢN XONG" → confirmBankTransfer()
                       → chạy ĐÚNG callback y hệt đường tự động
```

## 4.2 🔴 RỦI RO THẬT — không đối chiếu số tiền phía client
`startBankListener` chỉ kiểm tra **snapshot tồn tại**, KHÔNG so sánh `data.amount` với tổng đơn hàng trước khi coi là đã thanh toán — field `amount` chỉ dùng để hiển thị toast. Việc đối soát số tiền (nếu có) nằm hoàn toàn ở phía webhook/Cloud Function ghi vào `bank_confirmations/{orderId}` — **ngoài phạm vi `posgieo.html`**, không audit được từ 2 file HTML.

**Quyết định bắt buộc cho adapter mới:** `BankPaymentAdapter` (phía client) tiếp tục giữ đúng contract "tin tưởng sự tồn tại của bản ghi tại path one-shot", NHƯNG tài liệu này phải cảnh báo rõ: **bên ghi `bank_confirmations` (webhook, ngoài repo này) phải tự đối chiếu `addInfo`/số tiền trước khi ghi** — nếu Phase sau viết lại webhook đó, đây là chỗ bắt buộc có validate, không được bỏ qua như giả định ngầm hiện tại của client.

## 4.3 Không có timeout QR
Không tìm thấy `setTimeout` nào tự đóng popup/hết hạn mã QR — popup mở vô thời hạn tới khi có 1 trong 3 sự kiện: webhook về, nhân viên tự xác nhận, hoặc tự đóng popup. **Giữ nguyên hành vi này** (không tự ý thêm timeout) — đây là quyết định nghiệp vụ hợp lý (nhân viên toàn quyền quyết định khi nào huỷ), không phải thiếu sót kỹ thuật.

## 4.4 Sau xác nhận — gọi ngay in bill/trừ kho, không tách rời
Callback thanh toán gọi thẳng `confirmPay()` — cùng 1 hàm dùng cho cả tiền mặt lẫn chuyển khoản, không có luồng riêng. `BankPaymentAdapter` chỉ chịu trách nhiệm đến bước "xác nhận đã thanh toán", phần sau (ghi bill, trừ kho, in) đi qua `commands/sales/CapturePayment` → `FinalizeOrder` chung, không đặc thù theo phương thức thanh toán.

## 4.5 Quy tắc bất biến
`bankOrderId ≠ operationId` (đã nêu ở `GIEO-SYSTEM-REBUILD-PLAN.md` §14) — `genBankOrderId()` chỉ dùng để định danh giao dịch NGÂN HÀNG, không được dùng làm khóa idempotency cho command nội bộ.

---

# 5. RANH GIỚI ADAPTER vs DOMAIN — TRÁNH LẪN BUSINESS LOGIC VÀO PROTECTED INFRA

Audit cho thấy legacy trộn lẫn "giao tiếp phần cứng" với "quy tắc nghiệp vụ" trong cùng 1 khối hàm. Khi tách thành `packages/protected-adapters`, PHẢI giữ ranh giới:

| Thuộc Adapter (giao tiếp phần cứng thuần túy) | Thuộc Domain/Commands (business rule) |
|---|---|
| Encode canvas → ESC/POS hoặc TSPL bytes | Cửa sổ thời gian cho phép reprint tem (20 phút) |
| Bluetooth/LAN connect, reconnect, keep-alive | Giới hạn hiển thị lịch sử bill (60 phút) |
| `AndroidScanner.scan()` → trả `{code}` thô | Đối chiếu mã trùng (`chanMaTrung`) — thuộc Unit Identity |
| `bank_confirmations` one-shot listen/remove | Đối chiếu số tiền thanh toán (nếu chuyển vào scope rebuild) |
| Print queue tự phục hồi sau lỗi | Log chống gian lận (`label_reprints_gieogieo`, `staffOnShift`) |

`packages/protected-adapters` chỉ chứa cột trái. Cột phải thuộc `packages/commands` (gọi adapter như 1 dependency injected, không tự viết lại giao thức).

---

# 6. VIỆC PHẢI SỬA NGAY — KHÔNG ĐƯỢC "GIỮ NGUYÊN ĐỂ TƯƠNG THÍCH"

1. **Queue in bill tự phục hồi sau lỗi** (§1.2) — bug kỹ thuật thuần túy, đã có sẵn pattern đúng ngay trong chính codebase (label printer) để tham khảo.
2. **Fallback nhập tay khi scanner lỗi** (§3.3) — gap thật, chưa chắc legacy có, nên bổ sung tường minh thay vì để trống.
3. **Ranh giới amount-check cho bank webhook** (§4.2) — không sửa trong phạm vi 2 file HTML này, nhưng phải ghi rõ yêu cầu cho bất kỳ ai viết lại phần webhook ở repo/service khác.

---

# 7. OPEN QUESTIONS

1. APK hiện tại có support đủ `setTemKeepAlive`/`getTemStatus` (watchdog LAN) trên MỌI máy đang chạy production không, hay chỉ bản mới? Ảnh hưởng việc `LabelPrinterAdapter` có thể giả định watchdog luôn sẵn có hay phải feature-detect như legacy.
2. Có cần thêm ô nhập mã tay cho scanner (§3.3) ngay từ Phase đầu, hay để dành review UX riêng?
3. Webhook ghi `bank_confirmations` hiện nằm ở đâu (Cloud Function/service riêng)? Không có trong 2 file đã audit — cần biết để xác định có nằm trong phạm vi rebuild lần này không.

---

# 8. GATE

`packages/protected-adapters` coi là PASS khi:
- [ ] `BillPrinterAdapter` và `LabelPrinterAdapter` có queue độc lập, cả 2 đều tự phục hồi sau lỗi (fix mục 6.1).
- [ ] `BillPrinterAdapter` chỉ có 1 đường Bluetooth qua APK — không còn Web Serial/`XprinterWNN58E` (đã chốt, không cần hỏi lại).
- [ ] Encode TSPL + ESC/POS đều có, không auto-detect, setting theo store (đúng hành vi legacy).
- [ ] Đường gửi tem chỉ 1 đường qua `AndroidPrinter.printRawBytes`, không thêm fallback thứ 2 (đúng bài học lịch sử §2.4).
- [ ] `ScannerAdapter.scan()` không bao giờ reject, luôn có timeout, có fallback nhập tay (fix mục 6.2).
- [ ] `BankPaymentAdapter` giữ đúng one-shot handshake + không tự thêm đối chiếu số tiền phía client (điều đó thuộc phía webhook).
- [ ] Không có business rule nào (reprint window, chống gian lận, đối chiếu mã trùng) rò rỉ vào code adapter — toàn bộ nằm ở `packages/commands` gọi vào adapter.
