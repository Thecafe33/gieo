# CONTEXT MASTER — dự án Gieo Gieo (POS + Quản lý)

> Tài liệu bàn giao. Chỉ chứa thông tin cần để tiếp tục công việc.
> Cập nhật tới commit `623b7b1`.

---

## 1. Bối cảnh kỹ thuật

- **Hai app HTML một file**, dùng chung một Firebase project `the-cafe-33`:
  - `posgieo.html` (~20.400 dòng) — POS cho nhân viên, chạy trên tablet
  - `quanlygieo.html` (~16.300 dòng) — app Quản lý cho chủ quán
- Dữ liệu: **Firestore**. Đơn hàng đọc từ **Realtime Database** (`orders_gieogieo/{month}/{day}`,
  archive `orders_gieogieo_archive/{month}_{day}_{year}`).
- **Firebase Storage KHÔNG truy cập được** từ môi trường của chủ quán (chặn ở tầng mạng,
  cả REST lẫn SDK). Ảnh dụng cụ đựng đang **nhúng base64 vào Firestore** (nén 480px,
  chất lượng 0.78, ~8–12KB/ảnh). Có nhớ trạng thái "Storage hỏng" trong localStorage 24h
  (`ql_vessel_storage_down`) để không thử lại vô ích.
- Nhánh làm việc: **`claude/semi-product-container-input-r1be70`** — CHƯA merge, CHƯA mở PR.
- Ngôn ngữ giao diện + comment code: **tiếng Việt**.

---

## 2. QUY TẮC LÀM VIỆC (chủ quán đã yêu cầu rõ)

> *"bạn tự quyết rất nhiều vấn đề, chưa đưa ra kế hoạch để thực hiện cho tôi biết trước
> khi code! Thậm chí tôi còn không rõ công thức bạn sẽ làm như thế nào!"*

**Mọi việc lớn hơn một chỗ sửa nhỏ: KẾ HOẠCH → CHỦ QUÁN DUYỆT → CODE.**
Kế hoạch luôn phải có phần "những gì tôi tự quyết" để chủ quán bác được, và phải nêu
công thức bằng số cụ thể.

Chủ quán phát hiện lỗi rất tốt — đã bắt được 3 lỗi thật mà kiểm thử không bắt được.
Khi chủ quán nói "sai", kiểm lại bằng số trước khi phản biện.

---

## 3. Tài liệu trong repo

| File | Nội dung |
|---|---|
| `KE-HOACH-lai-lo-theo-ngay.md` | Kế hoạch lãi/lỗ theo ngày, 5 đợt, đã xong cả 5 |
| `DAC-TA-diem-hoa-von.md` | Đặc tả điểm hoà vốn + 3 mục sửa lỗi (§8, §9, §10) |
| `KE-HOACH-can-btp-theo-dung-cu.md` | Kế hoạch cân bán thành phẩm theo dụng cụ đựng |
| `KE-HOACH-thu-hoi-von.md` | Cơ chế THU HỒI VỐN — chủ quán đã duyệt, đã code xong |
| `KE-HOACH-tieu-hao-thuc-te.md` | Tiêu hao thực tế · lệch kho · đề xuất định lượng · dự báo mẻ (đã xong cả 2 đợt) |

---

## 4. CÔNG THỨC CỐT LÕI

### 4.1 Lãi/lỗ một ngày (`computeDayPL`)

```
Lãi/lỗ ngày = Doanh thu
            − Giá vốn hàng bán
            − Hao hụt & huỷ
            − Chi phí biến đổi
            − Phí sàn (hiện = 0)
            − Lương
            − Chi phí cố định phân bổ
            − Khấu hao phân bổ
```

**Ràng buộc bất di bất dịch:** tuần/tháng = **TỔNG CÁC NGÀY**, không có công thức riêng
cho kỳ. Nếu viết hai công thức thì sớm muộn hai con số lệch nhau.

### 4.2 Điểm hoà vốn của NGÀY (`plBreakEven`) — đã sửa lỗi

```
Biên đóng góp = 1 − (giá vốn + hao hụt + biến phí + phí sàn) / doanh thu
Hoà vốn       = (lương + chi phí cố định + KHẤU HAO) / biên đóng góp
```

- **Khấu hao CỘNG THẲNG vào** — chỉ còn MỘT ngưỡng, không còn "ngưỡng chưa trừ khấu hao"
  kèm "ngưỡng kể cả khấu hao".
- Lấy số của **chính ngày đó**, không lấy trung bình 30 ngày.
- Đẳng thức luôn đúng: `lãi = (doanh thu − hoà vốn) × biên đóng góp`.
  **Trên ngưỡng ⟺ có lãi.** Đây là bất biến quan trọng nhất, có test canh.
- Ngày chưa có doanh thu → mượn biên 30 ngày (`computeBreakEvenWindow`) làm tham chiếu,
  hiện kèm chữ "ước tính".

### 4.3 Điểm hoà vốn của KỲ (`computeBreakEvenCore` + `computeBreakEvenWindow`)

Vẫn dùng cửa sổ **30 ngày** cho màn Sức khoẻ tài chính. Lấy số từ `computeDailyPLRange`.
Khấu hao dùng **mức đang chạy hôm nay** (`monthlyDepreciation(assets, homNay)`), KHÔNG
dùng trung bình quá khứ — vì ngưỡng là câu hỏi hướng tới phía trước.

### 4.4 Năm mức sức khoẻ của ngày (`plMucSucKhoe`)

| Mức | Điều kiện | Nhãn |
|---|---|---|
| `red` | doanh thu < hoà vốn | Chưa đủ đắp chi phí — hôm nay đang lỗ |
| `amber` | ≥ hoà vốn, < mục tiêu | Đã hết lỗ, nhưng chưa tới mục tiêu |
| `green` | ≥ mục tiêu | Đạt mục tiêu tối thiểu |
| `blue` | ≥ 1,15 × mục tiêu | Vượt mục tiêu — ngày tốt |
| `top` | ≥ 1,45 × mục tiêu | Vượt xa mục tiêu — ngày rất tốt |

Hằng số: `PL_LV_TOT = 1.15`, `PL_LV_RATTOT = 1.45`. Chọn để khớp ví dụ chủ quán đưa
(mục tiêu 1,68tr → 2,0tr là "tốt", 2,5tr là "rất tốt").
CSS: `.kcard-wide.lv-red|lv-amber|lv-green|lv-blue|lv-top`.

### 4.5 Ba mức tin cậy của một ngày (`mucTinCay`)

| Giá trị | Nhãn | Điều kiện |
|---|---|---|
| `dang-chay` | Đang chạy | ngày chưa xong HOẶC lương là số dự đoán |
| `chot-ngay` | Chờ hoá đơn | ngày đã xong, còn chi phí `amountKind:'estimate'` |
| `chot-thang` | Đủ số thật | không còn khoản dự đoán nào |

Mức của KỲ = **mức yếu nhất** của các ngày.
Giá vốn ước theo target COGS% **KHÔNG** chặn mức cao nhất (nó không chờ hoá đơn).

---

### 4.6 Thu hồi vốn (sổ thứ hai, chạy SONG SONG — không thay sổ cũ)

```
Tiền thu hồi vốn một ngày = lãi/lỗ ngày đó + khấu hao ngày đó
                          = pl.laiTruocKhauHao
Đã thu hồi   = TỔNG tiền thu hồi của mọi ngày, từ mốc bắt đầu → hôm nay
% thu hồi    = Đã thu hồi / Tổng vốn đầu tư × 100%
Tổng vốn     = totalCapex(assets)  — nguyên giá, KHÔNG trừ residual
Mốc bắt đầu  = ngày mua tài sản sớm nhất, hoặc FINANCE.recoveryStartDate
```

- Khấu hao **không** phải tiền ra khỏi túi → nó nằm lại trong két, chính nó **là** vốn
  được thu hồi. Vì vậy một ngày **lỗ theo sổ cũ vẫn có thể thu hồi vốn được**; hai con
  số không mâu thuẫn.
- Mốc 100% **không phụ thuộc** `usefulLifeMonths`: bán tốt thì đủ sớm hơn, bán kém thì
  muộn hơn. Đây là yêu cầu gốc của chủ quán.
- Chạm 100% lần đầu → **ghi mốc** vào `finance_gieogieo/current`, không tự xoá. Mua
  thêm tài sản sau đó làm tiến độ tụt xuống dưới 100% và màn hình **nói ra** chuyện đó.

### 4.7 Lệch kho — ba con số, ba nguồn KHÁC NHAU

```
LÝ THUYẾT = Σ CONSUMPTION trong stock_transactions
            (POS tự nở định mức và trừ kho ngay lúc thanh toán — applySalesConsumptionPOS)
THỰC TẾ   = tồn đầu + nhập − tồn cuối, đo bằng HAI phiếu kiểm kê ĐÃ DUYỆT
HAO HỤT   = Σ WASTE đã ghi — TÁCH RIÊNG, không trộn vào hai số trên

Chênh chưa giải thích = THỰC TẾ − LÝ THUYẾT − HAO HỤT ĐÃ GHI
Hệ số hiệu chỉnh      = THỰC TẾ ÷ LÝ THUYẾT   → định lượng đề xuất = định lượng cũ × hệ số
```

- **Kỳ = khoảng giữa HAI lần đếm tay**, không phải khoảng ngày chủ quán chọn. Phiếu ngày
  a là tồn cuối ngày a, nên tiêu hao của kỳ là các ngày a+1..b.
- `ADJUSTMENT` và `TRANSFER` **không** trừ vào tiêu hao thực tế (một cái là hệ quả của
  chính phiếu kiểm kê, một cái chỉ đổi chỗ) — nhưng có thì phải **gắn cờ nói ra**.
- Thiếu hai phiếu → `duLieuDu:false` + lý do. **Không** lấy tạm ledger gọi là thực tế.
- Đề xuất dùng **TRUNG VỊ**, cần ≥ 3 kỳ và hệ số biến thiên ≤ 20% mới gọi là đáng tin.
- **Độ phủ định mức** (`thDoPhu`, từ cảnh báo `missing_recipe` của POS) đi kèm mọi kết
  quả: độ phủ 70% thì mọi tỷ lệ lệch đều bị thổi lên — nói con số lệch mà giấu độ phủ
  là nói dối bằng số thật.
- Xếp theo **TIỀN** lệch, không theo số lượng: 10g trà ô long nặng hơn 100g đường.

### 4.8 Dự báo & số mẻ

```
Dự báo ngày D = nền × xu hướng × hệ số ngày đặc biệt
   nền      = TRUNG VỊ lượng DÙNG của CÙNG THỨ trong 8 tuần (bỏ ngày đặc biệt)
   xu hướng = TB/ngày 14 ngày trước D  ÷  TB/ngày 14 ngày liền trước đó,
              kẹp [0,80 – 1,25], bỏ ngày đặc biệt khỏi cả hai cửa sổ
   đặc biệt = trung vị tỷ lệ của các ngày CÙNG LOẠI đã xảy ra; chưa có → 1,00 + nói rõ

Cần sản xuất = max(0, dự báo × (1 + đệm) − tồn đầu ngày CÒN DÙNG ĐƯỢC)
   đệm 5% (hàng bỏ trong ngày) · 10% (hàng để được sang mai)
Số mẻ: hàng hạn ngắn → làm tròn XUỐNG nếu thiếu ≤ 25% một mẻ, ngược lại lên
       hàng để được  → luôn làm tròn LÊN
```

- **Dưới 7 ngày dữ liệu → `duBao: null`**, không dự báo. Dưới 2 lần cùng thứ thì hạ
  xuống mức "tạm dùng" và lấy trung vị mọi ngày.
- Ngày đích **không** được dùng chính nó để dự báo nó.
- **Tồn đầu ngày chỉ tính lô còn hạn**; lô quá hạn / không mang sang được tách riêng
  và hiện ra — cộng vào là tự lừa mình rồi hôm sau vừa thiếu vừa phải đổ.
- `dung` / `huy` / `nau` **tách ba cột**: nấu 100 bán 60 đổ 40 mà gộp thành "tiêu thụ
  100" thì hôm sau lại nấu 100 và lại đổ 40.
- Mỗi lần lưu kế hoạch, ghi cả **căn cứ** (nền, xu hướng, độ tin cậy) vào
  `prep_forecasts_gieogieo` — không có nó thì không đánh giá được dự báo tốt lên hay
  xấu đi.
- **Xu hướng cân theo THỨ**: so từng thứ với chính thứ đó rồi mới lấy trung bình. Cửa
  sổ thiếu đúng một ngày thứ 7 là đủ đẻ ra "xu hướng giảm" hoàn toàn tưởng tượng.
  Dưới 4 thứ chung giữa hai cửa sổ thì không so nữa, coi như đi ngang.
- **Topping** cũng được dự báo: `aggregateOrders` đếm `toppingMix` (số phần từng
  topping, **gồm cả topping tặng**) vào bản ghi ngày → nằm trong cache ngày.
  Ngày cache CŨ không có trường này thì **loại khỏi lịch sử** (không phải "bán 0");
  ngày CÓ trường mà topping không xuất hiện thì **điền 0** (bán 0 phần thật).
  Tồn đầu ngày của topping coi như 0 — app không theo dõi tồn topping riêng.
  Số phần mỗi mẻ: `servings` → `batchYield`; `weight` → `batchYield ÷ qtyPerServing`.
  Dự báo topping lưu chung sổ với khoá `tp:<toppingId>`.

## 5. QUYẾT ĐỊNH CHỦ QUÁN ĐÃ CHỐT (không tự đổi)

| # | Quyết định |
|---|---|
| 1 | **Nguyên liệu tính khi BÁN**, không tính khi mua. Nhập 5tr bột → lãi hôm nay KHÔNG giảm 5tr. Thành chi phí khi bán ra (giá vốn) hoặc hư/đổ (hao hụt). Tab PO chỉ để cập nhật đơn giá. |
| 2 | **Lương ngày chưa kết ca lấy từ LỊCH LÀM VIỆC đã xếp**; ngày đã qua lấy chấm công thật. |
| 3 | **Khấu hao CÓ trừ** vào lãi, kèm dòng phụ "trước khấu hao". |
| 4 | **Tiền chủ quán rút KHÔNG phải chi phí** — đó là chia lợi nhuận. |
| 5 | **Chưa bán qua sàn** → phí sàn = 0, nhưng để sẵn chỗ cắm `plChannelFeeForDay(day)`. Điều kiện tiên quyết khi mở rộng: POS phải ghi doanh thu THEO KÊNH trước. |
| 6 | **Hoá đơn về muộn → TÍNH LẠI** đúng kỳ sử dụng. "Tháng nào phải gánh đúng chi phí tháng đó." Không đẩy chênh lệch sang tháng sau. |
| 7 | **Băng "chờ số thực tế" luôn hiện, KHÔNG cho tắt.** Đủ số thật mới bật được nút Chốt sổ. |
| 8 | **Chi phí phân bổ**, không dùng tiền thực chi, cho con số lãi/lỗ. Dòng tiền là màn riêng. |
| 9 | Bán thành phẩm **quy hết về gram**, không dùng ml/tỷ trọng. |
| 11 | **Lệch kho**: thực tế đo bằng kiểm kê, thiếu phiếu thì **báo "chưa đủ dữ liệu"** chứ không lấy ledger; hao hụt đã ghi **tách riêng** khỏi chênh chưa giải thích; đề xuất định lượng **không tự áp dụng**, phải bấm Áp dụng và **lưu giá trị cũ**; dòng bất thường **gắn cờ, không xoá**; ngày lễ/Tết **khai tay** (app không nhúng lịch Âm). |
| 10 | **Thu hồi vốn = lãi TRƯỚC khấu hao**, ngày lỗ **trừ vào** luỹ kế, mẫu số **LUÔN là tổng CAPEX** (không dùng ô "Vốn đầu tư ban đầu"), mua thêm tài sản sau khi đạt mốc thì **tiến độ tụt xuống kèm ghi chú**. Sổ lãi/lỗ cũ **giữ nguyên 100%**. |

---

## 6. MÔ HÌNH DỮ LIỆU (các trường MỚI thêm)

### `expenses_gieogieo`
```js
{
  category, amount, note, status,            // cũ
  periodType: 'onetime' | 'period',          // cũ
  date | startDate + endDate,                // cũ — startDate/endDate = KỲ SỬ DỤNG
  amountKind: 'actual' | 'estimate',         // MỚI (đợt 3)
  paidDate: 'YYYY-MM-DD' | null,             // MỚI (đợt 3) — null = chưa trả
  estimatedAmount: number,                   // MỚI — số dự đoán cũ, giữ để giải thích
  actualAt: ISO string                       // MỚI — lúc thay bằng số thật
}
```
**Bản ghi cũ (không có `amountKind`) = SỐ THẬT và ĐÃ TRẢ.** Không được coi là chưa chốt /
chưa trả, nếu không chủ quán sẽ thấy danh sách công nợ dài toàn khoản đã trả từ đời nào.

### `book_closings_gieogieo` (MỚI, đợt 4)
doc id = `'YYYY-MM'`. Ảnh chụp lãi/lỗ lúc chốt sổ:
```js
{ monthKey, closedAt, closedBy, lai, laiTruocKhauHao, doanhThu, giaVon, haoHut,
  bienPhiKhac, luong, chiPhiCoDinh, khauHao, tongChiPhi, soNgay, soNgayLo }
```
Tháng đã chốt hiện **số đã ghi**, không tính lại. Có số thật về sau → app hỏi
"mở lại tháng?", KHÔNG tự sửa.

### `prep_vessels_gieogieo` (dụng cụ đựng)
```js
{ code, name, imageUrl, imagePath, note, active,
  variants: [{ id, label, tareG, imageUrl, imagePath }] }
```
Prep item có `vesselIds: []` (tối đa **5**, hằng số `PREP_MAX_VESSELS`).

### `prep_forecasts_gieogieo` (MỚI) — doc id = 'YYYY-MM-DD_<prepId>'
```js
{ date, prepId, prepName, unit, duBao, nen, nguonNen, xuHuong, heSoDacBiet,
  soNgayCoDuLieu, soMauCungThu, doTinCay:'du'|'yeu'|'chuaDu',
  tonDau, tonHetHan, canSanXuat, soMe, sanXuat, tongKhaDung,
  duKienDu, duKienHuy, nguyCoThieu, yieldMoiMe, shelfLifeType, ngayDacBiet, luuLuc }
```
Lưu cả **căn cứ**, không chỉ con số — để sau còn truy lại vì sao hôm đó đề xuất thế.

### `special_days_gieogieo` (MỚI) — doc id = 'YYYY-MM-DD'
```js
{ date, loai:'le'|'tet'|'khuyenmai'|'su_kien'|'thoi_tiet'|'dong_cua'|'khac', ten, updatedAt }
```
Ngày CHƯA KHAI → trong JSON là `null`, **không** mặc định là "ngày thường".

### `recipe_suggestions_gieogieo` (MỚI) — sổ đề xuất, TÁCH khỏi công thức gốc
```js
{ scope:'recipe'|'prep'|'topping', targetKey, size, idx, itemId, tenNguyenLieu, donVi,
  giaTriGoc, giaTriDeXuat, heSo, cv, soKy, doTinCay:'du'|'daoDong'|'chuaDu',
  kyTu, kyDen, nguon:'app'|'claude', nhan,
  trangThai:'de_xuat'|'da_ap_dung'|'tu_choi', taoLuc, apDungLuc, giaTriTruocKhiApDung }
```
Bấm **Áp dụng** mới ghi đè công thức, và **chép giá trị cũ** vào `giaTriTruocKhiApDung`.

### `stock_containers_gieogieo` (POS ghi, Quản lý đọc) — TEM TỪNG CHAI/GÓI
Mã **8 ký tự ngẫu nhiên**, bảng 32 chữ đã bỏ I/L/O/U. Vòng đời `sealed → open → finished`,
`expiresAt` tính từ lúc mở, `wasteBase` = phần thừa lúc báo hết, `needsReview` khi báo
hết lúc còn > 25%. **Đây chính là "mã riêng cho từng nguyên liệu"** — không cần thêm
trường `code` vào `inventory_items`.

### `finance_gieogieo/current` (4 trường MỚI — thu hồi vốn)
```js
{
  recoveryStartDate: 'YYYY-MM-DD' | null,   // mốc bắt đầu, null = ngày mua tài sản sớm nhất
  recoveryReachedDate: 'YYYY-MM-DD' | null, // ngày ĐẦU TIÊN chạm 100% — ghi một lần, không tự xoá
  recoveryReachedAt: ISO string,
  recoveryReachedCapital: number,           // tổng vốn TẠI THỜI ĐIỂM đạt mốc
  usageTrackingStart: 'YYYY-MM-DD'          // mốc bắt đầu ghi nhận tiêu hao (mặc định 2026-09-06)
}
```
Bản ghi cũ không có 4 trường này → **chưa đạt mốc**, mốc bắt đầu tự tính.

### `assets_gieogieo`
`purchaseDate` **quyết định từ ngày nào tài sản bắt đầu khấu hao**. Form điền sẵn ngày
hôm nay → đây là cái bẫy đã gây lỗi thật (khấu hao cả kỳ 6 ngày chỉ bằng 1 ngày).
Màn Tài sản nay hiện ngày mua + cảnh báo, và **có nút Sửa** (`openAssetEdit`) — trước
đây khai sai phải xoá rồi thêm lại, rất dễ gõ sai tiếp. Bản ghi sửa có thêm `updatedAt`.

---

## 7. HÀM CHÍNH (quanlygieo.html)

| Hàm | Việc |
|---|---|
| `computeDayPL({day, expList, cats, assets, laborActual, laborPredicted, wasteValue, homNayKey})` | Lãi/lỗ MỘT ngày. Hàm thuần, kiểm thử được. |
| `plSumDays(days)` | Cộng các ngày ra kỳ + mức tin cậy yếu nhất + gộp `khoanChoSoThat` |
| `computeDailyPLRange(start, end)` | Nạp dữ liệu + tính cả dải. Trả `{days, tong, salesRes, assets}` |
| `plBreakEven(pl, bienDuPhong)` | Hoà vốn của ngày (khấu hao đã cộng vào) |
| `plMucSucKhoe(dt, hoaVon, target)` | 5 mức màu |
| `plMeterHTML(dt, hoaVon, target)` | Thanh đo 2 vạch mốc |
| `plLaiCardHTML(pl, be)` | **Thẻ GỘP** lãi + hoà vốn (màn Hôm nay) |
| `plHealthHTML(tong, days, soNgayKy, ghiChuTinhLai, book)` | Khối lãi/lỗ kỳ (Sức khoẻ tài chính) |
| `plChartHTML(rows)` / `plGroupByMonth(days)` | Biểu đồ cột quanh vạch 0; >62 ngày gom theo tháng |
| `plPredictedLaborByDate(emps, scheds, s, e)` / `plScheduledHours(s)` | Lương dự đoán từ lịch (xử lý ca qua đêm, OT theo ngày) |
| `plRecalcNotes(expList, start, end)` | Dòng "đã tính lại: X → Y ngày Z" |
| `expenseIsEstimate` / `expenseIsUnpaid` / `setExpenseActual` / `markExpensePaid` | Dự đoán vs thật, công nợ |
| `trangThaiThang(monthKey, expList, closings)` | 3 trạng thái tháng |
| `chotSoThang(mk)` / `moLaiThang(mk)` / `bookAlertHTML` / `renderBookAlerts(targetId)` | Chốt sổ |
| `plUocSaiLechPct(expList, category)` | Học sai lệch dự đoán từ lịch sử. **Chưa có lịch sử → trả `null`, KHÔNG bịa tỷ lệ.** |
| `computeBreakEvenWindow(force)` / `computeBreakEvenCore(...)` | Hoà vốn KỲ (cửa sổ 30 ngày) |
| `computeLedgerRealMetrics(start, end)` | Nay trả thêm `wasteByDate` (hao hụt theo từng ngày) |
| `thvTienNgay(pl)` | Tiền thu hồi vốn một ngày = `pl.lai + pl.khauHao` |
| `thvTongVon(assets)` / `thvMocBatDau(assets, khaiTay)` | Tổng vốn (= `totalCapex`) / mốc bắt đầu |
| `thvCompute({days, tongVon, mocDaDat})` | **Hàm thuần** — luỹ kế, %, ngày đạt mốc, tiền sau mốc, tốc độ 30 ngày, bảng theo tháng |
| `computeCapitalRecovery(force)` | Nạp dữ liệu + cache phiên `_thvCache`; tự ghi mốc khi vừa chạm 100%. Trần quét `THV_MAX_DAYS = 730` ngày |
| `thvCardHTML(data, plHomNay)` / `thvChiTietHTML` / `thvBarHTML` / `thvToggleChiTiet` | Thẻ Thu hồi vốn ở màn Hôm nay (`#todayThv`) — **nạp NỀN** |
| `thvHealthHTML(data, tienKy, soNgayKy)` | Khối Thu hồi vốn ở màn Sức khoẻ tài chính (`#healthThv`) |
| `assetFormFieldsHTML(a, pre, ghiChuNgay)` | 5 ô của tài sản, **dùng chung** form Thêm (`pre='ast'`) và popup Sửa (`pre='astE'`) |
| `assetFormRead(pre)` / `assetPreviewBind(pre, outId)` | Đọc + kiểm tra 5 ô (trả `null` nếu sai) / dòng xem trước khấu hao cập nhật khi gõ |
| `openAssetEdit(id)` / `submitAssetEdit(id)` / `updateAsset(id, data)` | **Sửa tài sản** (popup dùng chung `openEditSheet`) |
| `removeAsset(id)` | Xoá tài sản — **có hỏi lại**, nói rõ khấu hao quá khứ sẽ biến mất |
| `assetCacheDirty()` | Mọi thay đổi tài sản xoá cả `_thvCache` lẫn `_bepCache` |
| `thDoiChieu({items,txs,counts,tuKey,denKey})` | **Hàm thuần** — đối chiếu lý thuyết/thực tế từng nguyên liệu, từng kỳ |
| `thGomLedger` / `thCongLedger` / `thPhieuCuaItem` / `thTinhMotKy` | Bộ máy con của `thDoiChieu` |
| `thTrungVi` / `thCV` / `thDoTinCay` | Trung vị · hệ số biến thiên · 3 mức tin cậy (`TH_MIN_KY`=3, `TH_CV_MAX`=0,2) |
| `thDoPhu(alerts, soLy, tu, den)` | Độ phủ định mức từ cảnh báo `missing_recipe` |
| `thLoadDuLieu` / `renderKhoLech` / `thChay` / `thVeBang` | Nạp dữ liệu + màn **Lệch kho & định lượng** |
| `thNoiDungNguyenLieu(itemId)` / `thApDungDeXuat(sg)` | Tìm mọi chỗ dùng nguyên liệu / ghi đè có lưu giá trị cũ |
| `loadSpecialDays` / `saveSpecialDay` / `renderEntryNgayDacBiet` | Ngày lễ/Tết/khuyến mãi |
| `_expHuongDanPhanTich` / `_expNguyenTacDuLieu` / `_expLichSuTheoNgay` / `_expTomTatTem` | Bốn khối mới trong file JSON |
| `thLichSuBTP(prepTxs)` | Lịch sử BTP theo ngày — tách `dung` / `huy` / `nau` |
| `demToppingDong(it, out)` | Đếm số phần topping của một dòng hàng — **dùng chung** cho bản ghi ngày và bản trích xuất |
| `thLichSuTopping(perDay)` | Lịch sử topping từ `toppingMix`; loại ngày cache cũ, điền 0 cho ngày bán 0 |
| `thToppingPhanMoiMe(rec)` | Số phần mỗi mẻ topping (2 kiểu khai yield) |
| `thDuBao({lichSuNgay, ngayDich, ngayDacBiet})` | **Hàm thuần** — dự báo một ngày, trả `null` khi chưa đủ dữ liệu |
| `thKeHoachNau({duBao, tonDungDuoc, yieldMoiMe, shelfLifeType})` | Số mẻ · dư · phải đổ · nguy cơ thiếu |
| `thTonDungDuoc(batches, prepId, ngay, shelfLifeType)` | Tồn đầu ngày còn hạn (lô hết hạn tách riêng) |
| `thDoiChieuDuBao(forecasts, lichSu)` | Dự báo đã lưu ↔ thực tế |
| `renderKhoDuBao` / `dbChay` / `dbVeBang` / `dbLuuKeHoach` | Màn **Dự báo & số mẻ** |
| `loadPrepForecasts` / `savePrepForecast` / `loadPrepTxRange` | Sổ dự báo `prep_forecasts_gieogieo` |

Hàm đã **XOÁ** (bị thẻ gộp thay thế, đừng dựng lại):
`plTodayHTML`, `bepTodayHTML`, `bepDoiChieuHTML`.

---

## 8. CẤU TRÚC MÀN HÌNH (sau khi gộp)

**Màn "Hôm nay" = Sức khoẻ quán** (landing, `curScreen = 'today'`):
```
#todayBook     — băng chốt sổ / chờ số thực tế
#todayNudge    — nhắc nguyên liệu sắp hết, chưa cấu hình danh mục…
#todayHealth   — danh sách việc cần xử lý (từ computeStoreHealth)
CHỈ SỐ HÔM NAY (#todayGrid):
   ├ thẻ DOANH THU (wide, 5 màu, 2 vạch mốc)
   ├ thẻ LÃI/LỖ + HOÀ VỐN (gộp, có bảng tách từng dòng)
   └ Số bill · AOV · IPT · Items bán ra
#todayThv      — thẻ THU HỒI VỐN (nạp nền, ngoài #todayGrid)
#todayHourly   — bill theo giờ
#todayAlerts   — cảnh báo KPI
```
- `switchScreen('storehealth')` **tự chuyển hướng** sang `'today'` (mọi nút cũ vẫn chạy).
- `renderStoreHealth(targetId)` và `renderBookAlerts(targetId)` nhận targetId dùng chung.
- Khi ở màn Hôm nay (`targetId === 'todayHealth'`): không có việc gì → **một dòng gọn**;
  lời mời chốt sổ chỉ hiện cho **tháng gần nhất**.
- Sidebar: một mục `{key:'today', label:'Hôm nay · Sức khoẻ quán'}`, chấm đỏ ở đó.

**Nhóm sidebar "Phân tích & dữ liệu"** (tách khỏi Kho và Cấu hình): Lệch kho & định
lượng · Dự báo & số mẻ · Ngày đặc biệt · Trích xuất dữ liệu. Chúng không phải việc kho
hằng ngày cũng không phải cấu hình đặt-một-lần — chúng là việc ĐỌC SỐ. Hai mục đầu vẫn
dùng bộ máy màn Kho (`goKho('lechkho'|'dubao')`, vẽ vào `#khoBody`), chỉ đổi chỗ đứng
trên sidebar; vì không còn nằm trong section `collapsible` nên `KHO_SIDEBAR_SUBS` không
chứa chúng và nhánh Kho không tự bung ra khi mở.

**Màn "Sức khoẻ tài chính"** (`health`): khối "Lãi/lỗ kỳ này" (biểu đồ + bảng ngày +
chốt sổ) → khối hoà vốn 30 ngày → các card KPI cũ.

**Màn "Chi phí"** (`goEntry('exp')`): Chờ duyệt POS → **Chờ số thật** → **Chưa trả tiền**
→ form (4 trường: kỳ sử dụng · số tiền · số thật/dự đoán · ngày trả) → cấu hình danh mục
(Cố định/Biến đổi) → Gần đây.

---

## 9. BA LỖI THẬT CHỦ QUÁN ĐÃ BẮT (đã sửa — đừng để tái diễn)

1. **Khấu hao trong ngưỡng hoà vốn lấy trung bình quá khứ.** Tài sản vừa nhập → cửa sổ
   30 ngày chỉ có ~1 ngày có khấu hao → ngưỡng thấp hơn thực tế gần 300.000đ/ngày.
   → Sửa: dùng **mức đang chạy hôm nay**.
2. **Khấu hao cả kỳ 6 ngày = đúng 1 ngày.** Do form Tài sản điền sẵn ngày mua = hôm nay,
   và danh sách tài sản KHÔNG hiện ngày mua ở đâu cả.
   → Sửa: hiện ngày mua, cảnh báo, và bảng lãi/lỗ ghi rõ "chỉ N/M ngày có khấu hao".
3. **Ngưỡng hoà vốn không cộng khấu hao** → "đã qua hoà vốn" mà vẫn lỗ.
   → Sửa: cộng thẳng vào, và lấy số của chính ngày đó.
4. **Mở app lần đầu không có chỉ số nào**, phải bấm Tải lại mới hiện. `init()` kết thúc
   bằng `renderStoreHealth()` — hàm đó chỉ vẽ danh sách "việc cần xử lý". Màn mặc định
   là `today` nhưng init KHÔNG đi qua `switchScreen()` nên `renderToday()` không bao giờ
   chạy. → Sửa: init gọi `renderToday()` (nó tự gọi `renderStoreHealth('todayHealth')`
   và `renderBookAlerts('todayBook')` bên trong). Có `navtest.mjs` canh.

**Bài học chung:** khi một con số có thể bằng 0 hoặc thấp bất thường vì một điều kiện
ẩn (ngày mua, chưa khai, chưa duyệt), **màn hình phải nói ra**, không để chủ quán tự đoán.

---

## 10. Tính năng CÂN TRỪ BÌ (đã xong, giai đoạn trước)

- Mỗi bán thành phẩm gắn tối đa **5 dụng cụ đựng**; mỗi dụng cụ có nhiều **phân loại cân**
  (vd "ca 2L có nắp" / "không nắp"), mỗi phân loại có `tareG` và ảnh minh hoạ.
- Áp dụng ở 3 luồng POS: nhập BTP thực tế sau nấu, đếm khi kết ca, huỷ BTP.
- Màn huỷ BTP: **3 nút lớn bo tròn** — Nhập tay / Cân trừ bì / Bỏ hết.
  Câu hỏi cân gì rút còn 2 lựa chọn: "Cân phần sẽ huỷ" / "Cân phần còn dùng được".
- **KHÔNG tự mở bàn phím** khi chọn phân loại dụng cụ.
- Icon cân là **cân điện tử** (SVG), không dùng emoji ⚖️.
- `pwMode()` là nguồn mặc định DUY NHẤT (từng có bug: hiển thị mặc định `remain` còn
  tính toán mặc định `discard`).

---

## 11. KIỂM THỬ

Thư mục: `/tmp/claude-0/-home-user-gieo/<session>/scratchpad/`
Chạy: `node <tên>.mjs` (Playwright + Chromium tại `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`)

| File | Số assertion | Nội dung |
|---|---|---|
| `pltest.mjs` | 51 | Công thức ngày, lương dự đoán, cộng ngày ra kỳ |
| `pl2test.mjs` | 27 | Bảng + biểu đồ kỳ |
| `pl3test.mjs` | 38 | Dự đoán vs số thật, tính lại |
| `pl4test.mjs` | 42 | Chốt sổ, băng chờ số thật |
| `pl5test.mjs` | 23 | Công nợ, đẳng thức hoà vốn |
| `pl6test.mjs` | 6 | Khấu hao mức đang chạy |
| `pl7test.mjs` | 15 | Bẫy ngày mua tài sản |
| `pl8test.mjs` | 31 | Hoà vốn ngày, 5 mức màu, gộp thẻ, gộp màn |
| `thvtest.mjs` | 49 | Thu hồi vốn — hàm thuần (luỹ kế, mốc, ngày lỗ, mốc không phụ thuộc số tháng khấu hao) |
| `thv2test.mjs` | 32 | Thu hồi vốn — dựng HTML thật của thẻ + khối, 2 giai đoạn |
| `thvboot.mjs` | 10 | Mở file HTML thật trong Chromium (Firebase giả tối thiểu), cắm thẻ vào DOM |
| `asstest.mjs` | 32 | Sửa tài sản: điền sẵn đúng số, xem trước khấu hao, chặn số vô lý, xoá phải hỏi lại |
| `thtest.mjs` | 53 | Lệch kho — hàm thuần (ví dụ 5kg/5,5kg, thiếu phiếu, cờ bất thường, trung vị/CV, xếp theo tiền) |
| `th2test.mjs` | 49 | Màn Lệch kho, tạo/áp dụng đề xuất (công thức gốc không đổi tới khi bấm Áp dụng), 4 khối JSON |
| `dbtest.mjs` | 55 | Dự báo — hàm thuần (trung vị cùng thứ, kẹp xu hướng, ngày đặc biệt, quy tắc số mẻ) |
| `navtest.mjs` | 19 | Mở app lần đầu có chỉ số ngay (canh đúng lỗi §9.4) + nhóm "Phân tích & dữ liệu" |
| `db2test.mjs` | 57 | Màn Dự báo trên file HTML thật — ví dụ trân châu (tồn 15 · dự báo 70 · mẻ 30 → 2 mẻ, dư 5) + nhánh topping |
| `beptest` 22 · `bepe2e` 13 · `qltest` 14 · `togtest` 23 · `cbtest` 13 · `khotest` 24 · `postest` 20 · `hangtest` 15 · `embedpos` 6 | | các phần trước |

**Phương pháp:** `page.route()` chặn `gstatic.com/firebasejs` → nạp `fbmem.js`
(Firestore giả trong bộ nhớ), rồi mở **file HTML thật**. Lưu ý:
- `fbmem` chỉ hỗ trợ filter `==` và `in`; `>=`/`<=` bị bỏ qua (trả hết).
- `window.__DB` bị closure giữ → **phải mutate**, không được gán lại object mới.
- `loadInventoryItems()` có memo 20s → gọi `memoDropItems()` sau khi seed.
- Đơn hàng đọc từ RTDB (fbmem trả null) → **ghi đè `fetchSalesRange`** để seed doanh thu.
- `innerText` bị `text-transform:uppercase` ảnh hưởng → regex phải dùng cờ `i`.

`chk.sh <file.html>` — trích script lớn nhất rồi `node --check` (kiểm cú pháp nhanh).

---

## 12. GIỚI HẠN ĐÃ BIẾT (nói trước, đừng phóng đại độ chính xác)

- **Không có lịch sử lương.** Đổi lương một nhân viên thì các ngày trước đó cũng tính
  theo mức mới (giới hạn sẵn có của app).
- **Không có lịch sử giá `costPerUnit`** của nguyên liệu.
- Phân loại **Cố định / Biến đổi** do chủ quán khai; đoán sẵn theo tên (`guessCostType`),
  chưa khai thì coi là **cố định** (phía an toàn).
- Băng chốt sổ chỉ quét **3 tháng gần nhất** (`BOOK_LOOKBACK_MONTHS`) và chỉ tháng có
  bản ghi chi phí.
- Hoà vốn của NGÀY nhích theo ngày (đánh đổi có chủ ý, đổi lấy tính nhất quán).
- Chưa tách biên theo kênh bán.

---

## 13. VIỆC CÒN LẠI / GỢI Ý TIẾP

- **Thu hồi vốn chỉ đếm được từ ngày mua tài sản sớm nhất.** Khai sai ngày mua thì luỹ
  kế sai theo. Trần quét là 730 ngày — quá 2 năm thì màn hình nói rõ phần bị cắt.
- Khoản **cọc mặt bằng / sửa chữa / biển hiệu** chưa khai thành tài sản thì **không**
  nằm trong tổng vốn cần thu hồi.
- Chủ quán cần **sửa "Ngày mua" của tài sản** về đúng ngày thật (nay bấm nút Sửa ngay
  trong danh sách, không phải xoá rồi thêm lại), và xem lại
  "Thời gian sử dụng (tháng)" — phải là thời gian **dùng được thật của máy**, không phải
  thời gian muốn thu hồi vốn. (Đang thấy khấu hao ~6tr/tháng so với doanh thu ~773k/ngày
  → nhiều khả năng khai quá ngắn.)
- Nhánh chưa merge, chưa mở PR.
- Chưa có màn dòng tiền đầy đủ (mới có danh sách "Chưa trả tiền" ở màn Chi phí).

---

## 14. BẢN GIẢ FIREBASE TRONG KIỂM THỬ — hai chỗ phải đúng

Test nào để `init()` chạy trọn (vd `navtest.mjs`) thì bản giả phải:
- `onAuthStateChanged(cb)` gọi cb **bất đồng bộ** (`setTimeout(...,0)`) và trả hàm huỷ.
  Gọi đồng bộ sẽ ném `Cannot access 'unsub' before initialization` trong `ensureAuth` —
  lỗi của bản giả, không phải của app.
- Có `signInWithEmailAndPassword` (app dùng hàm này, không dùng `signInAnonymously`).
