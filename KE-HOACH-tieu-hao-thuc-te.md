# KẾ HOẠCH — TIÊU HAO THỰC TẾ · LỆCH KHO · ĐỀ XUẤT ĐỊNH LƯỢNG · DỰ BÁO MẺ

> Trạng thái: **CHỦ QUÁN ĐÃ DUYỆT ĐỢT 1 — ĐÃ CODE XONG**. Đợt 2 (dự báo) để sau.
> Quy tắc §2 CONTEXTMASTER: kế hoạch → chủ quán duyệt → code.
>
> Chủ quán chốt: (1) làm Đợt 1 — ghi nhận + đối chiếu + JSON; (2) thiếu phiếu kiểm kê
> thì **báo "chưa đủ dữ liệu"**, không lấy tạm ledger; (3) mã nguyên liệu — **POS đã tự
> sinh rồi**, xem §0b.

---

## 0b. HAI PHÁT HIỆN TỪ FILE POS — đổi thiết kế theo hướng NHẸ HƠN

**a) POS đã tự trừ kho theo bill.** `applySalesConsumptionPOS` nở định mức món ra
nguyên liệu / bán thành phẩm / topping / bao bì / túi, ghi thẳng `CONSUMPTION` vào
`stock_transactions_gieogieo` ngay lúc thanh toán, và ghi cảnh báo `missing_recipe`
(kèm `hitCount`) cho món chưa khai định mức.

→ **Tiêu hao lý thuyết đã nằm sẵn trong sổ kho.** Không cần đọc lại từng bill để tính
lại một lần nữa — vừa nhẹ hơn nhiều, vừa tránh việc app Quản lý và app POS có hai cách
nở định mức khác nhau rồi ra hai con số khác nhau.
(Ghi chú trong `quanlygieo.html` nói "POS chưa có itemId, chưa bật trừ kho tự động" là
**đã lạc hậu** — đã sửa lại.)

**b) "Mã riêng cho từng nguyên liệu" thực chất là MÃ TEM TỪNG CHAI/GÓI.**
`stock_containers_gieogieo`: mỗi lần nhận hàng, POS sinh mã **8 ký tự ngẫu nhiên** từ
bảng 32 chữ đã bỏ I, L, O, U (hay đọc nhầm thành 1, 1, 0, V trên tem in nhiệt), kiểm
tra trùng rồi in tem. Mỗi chai có vòng đời riêng: `sealed → open → finished`, có
`expiresAt` tính từ lúc mở, có `wasteBase` (phần còn thừa lúc báo hết) và cờ
`needsReview` khi báo hết lúc còn trên 25%.

→ **KHÔNG thêm ô "Mã" vào `inventory_items`** như kế hoạch ban đầu. Dựng thêm một hệ
mã thứ hai chỉ tạo ra hai thứ cùng tên "mã" mà không khớp nhau. Thay vào đó dữ liệu tem
được đưa vào file JSON (`tem_kho`) để phân tích hạn dùng và phần thừa.

---

## 0. Cái đã có sẵn (khảo sát code, không phải đoán)

Chủ quán yêu cầu "bật và hoàn thiện" — hoá ra **phần lớn đã dựng rồi**, thiếu đúng
khâu đối chiếu và khâu xuất cho Claude. Liệt kê để không làm lại từ đầu:

| Đã có | Ở đâu |
|---|---|
| Danh mục nguyên liệu, tồn, giá vốn, quy cách đóng gói | `inventory_items_gieogieo` |
| **Nhật ký kho không sửa/xoá**: RECEIVING · CONSUMPTION · WASTE · ADJUSTMENT · TRANSFER · LOC_SET, có `businessDate` | `stock_transactions_gieogieo` |
| **Kiểm kê**: đếm tay ở POS, có `countedBase` / `expectedBase` / `varianceBase`, phải Quản lý **duyệt** mới thành ADJUSTMENT | `stock_counts_gieogieo` |
| Định mức món theo size, 3 loại thành phần (`item` / `prep` / `topping`) | `recipes_gieogieo` |
| Bán thành phẩm: công thức mẻ, `batchYield` khai, **`yieldActualAvg` cân thật**, HSD (`shelfLifeType`/`shelfLifeHours`), `prepTimeMinutes`, `dailyTarget` | `prep_items_gieogieo` |
| **Lô sản xuất từng mẻ**: giờ nấu, số mẻ, cân thật, còn lại, trạng thái | `prep_batches_gieogieo` |
| Nhật ký bán thành phẩm (gồm huỷ) | `prep_transactions_gieogieo` |
| Topping: công thức mẻ, yield theo phần/gram, giá vốn mỗi lần thêm | `topping_recipes_gieogieo` |
| Bill có **`itemId` + `size` + `toppings`** (ghi chú cũ trong code nói POS chưa có itemId — **đã lạc hậu**, `aggregateOrders` đang dùng nó) | RTDB `orders_gieogieo` |
| Màn **Trích xuất JSON** (bản gọn / bản đầy đủ), đã gom bán hàng · ledger · lô chế biến | `renderEntryExport` |
| Học yield thật: đủ 3 lô thì giá vốn tự tính theo số cân thật, **không đè số khai** | `prepEffectiveYield` |

**Thiếu đúng 6 thứ:**
1. **Mã nguyên liệu** — `inventory_items` chưa có trường `code` (bán thành phẩm thì có).
2. **Phép đối chiếu lý thuyết ↔ thực tế** — chưa có ở bất cứ đâu.
3. **`huong_dan_phan_tich`** trong file JSON.
4. **Ngày đặc biệt** (lễ / Tết / khuyến mãi) — chưa có chỗ khai.
5. **Sổ đề xuất** (định lượng Claude gợi ý) tách khỏi công thức gốc.
6. **Dự báo + đối chiếu dự báo với thực tế.**

---

## 1. CÔNG THỨC — tiêu hao LÝ THUYẾT

Đi từ bill, nở ra theo đúng 4 tầng app đang có: **Món → (nguyên liệu | bán thành phẩm | topping) → nguyên liệu thô**.

```
Với mỗi dòng hàng đã bán (itemId, size, qty):
    rows = recipes['togo:'+itemId].sizes[size]
    row.refType='item'    → NGUYÊN LIỆU[itemId]  += qty × row.qty
    row.refType='prep'    → BTP[prepId]          += qty × row.qty
    row.refType='topping' → TOPPING[toppingId]   += qty × row.qty     (topping tặng sẵn trong công thức)

Với mỗi topping khách gọi thêm:  TOPPING[toppingId] += số lần thêm

Quy BTP về nguyên liệu thô:
    số mẻ tương đương = BTP_qty ÷ yieldHiệuLực(prep)
    NGUYÊN LIỆU[itemId] += số mẻ tương đương × batchInputs[itemId].qty
    (yieldHiệuLực = yieldActualAvg khi đã đủ 3 lô cân thật, ngược lại batchYield —
     DÙNG LẠI hàm prepEffectiveYield đã có, không viết công thức thứ hai)

Quy TOPPING về đầu vào:
    yieldMode='servings' → số mẻ tương đương = số phần ÷ batchYield
    yieldMode='weight'   → số mẻ tương đương = (số phần × qtyPerServing) ÷ batchYield
    rồi cộng batchInputs (item → nguyên liệu, prep → BTP → lại quy tiếp một bậc nữa)
```

### Ví dụ bằng số (đúng ví dụ chủ quán đưa)

100 ly trà sữa M, định mức 50g bột sữa/ly:

| | |
|---|---:|
| Tiêu hao **lý thuyết** | 100 × 50g = **5.000 g** |
| Tiêu hao **thực tế** (đo bằng kiểm kê, §2) | **5.500 g** |
| Hao hụt đã ghi nhận (WASTE ở ledger) | 200 g |
| **Chênh chưa giải thích được** | 5.500 − 5.000 − 200 = **300 g** |
| Tỷ lệ chênh / lý thuyết | 300 / 5.000 = **6,0 %** |
| Định lượng thực tế mỗi ly | 5.500 / 100 = **55 g/ly** |

Ba con số cuối là thứ Claude cần để đề xuất sửa định mức. **Tách riêng "hao hụt đã
ghi nhận" khỏi "chênh chưa giải thích"** — trộn hai thứ này lại thì không phân biệt
được *đổ vỡ* với *định mức khai sai*, mà hai nguyên nhân đó xử lý hoàn toàn khác nhau.

---

## 2. CÔNG THỨC — tiêu hao THỰC TẾ

Chuẩn vàng là **kiểm kê**, không phải ledger — vì ledger chỉ biết những gì đã được
khai, còn kiểm kê biết cả những gì biến mất mà không ai khai.

```
Cần HAI phiếu kiểm kê kẹp hai đầu kỳ (phiếu đã DUYỆT):

  Thực tế = Tồn đầu (đếm tay phiếu đầu) + Nhập trong kỳ (RECEIVING) − Tồn cuối (đếm tay phiếu cuối)

  · TRANSFER và LOC_SET KHÔNG tính — chỉ chuyển chỗ, không đổi tổng.
  · ADJUSTMENT KHÔNG tính — nó là HỆ QUẢ của chính phiếu kiểm kê, cộng vào là đếm hai lần.
  · WASTE tách ra thành một cột RIÊNG, không trừ khỏi "thực tế".
```

**Thiếu phiếu kiểm kê thì không có số thực tế.** Lúc đó hệ thống ghi rõ
`nguon: 'ledger'` và `duLieuDu: false`, chỉ hiện `CONSUMPTION + WASTE` từ ledger kèm
chữ "chưa đủ dữ liệu" — **không bịa** một con số thực tế rồi để Claude tưởng là thật.

### Độ phủ — phải nói ra, không được giấu

Một dòng bán chỉ vào được vế lý thuyết khi có đủ `itemId` + `size` + đã khai định mức
cho đúng size đó. Vì vậy mỗi kỳ đối chiếu đều kèm:

```
độ phủ định mức = số ly tính được lý thuyết ÷ tổng số ly bán ra
```

Độ phủ 70% mà chênh 6% thì con số 6% đó vô nghĩa — 30% số ly còn lại chưa được tính
đã có thể ăn hết phần chênh. Con số này đi kèm mọi kết quả, cả trên màn lẫn trong JSON.

---

## 3. Đề xuất định lượng (§3 của chủ quán) — ĐỀ XUẤT, không tự sửa

```
hệ số hiệu chỉnh = tiêu hao thực tế ÷ tiêu hao lý thuyết        (vd 5.500/5.000 = 1,10)
định lượng đề xuất = định lượng hiện tại × hệ số                (50g × 1,10 = 55g)
```

**Chỉ đề xuất khi tách bạch được**: nguyên liệu chỉ dùng cho MỘT món/size thì hệ số
gán thẳng cho món đó. Dùng cho nhiều món thì hệ thống **chỉ đưa hệ số chung** và nói
rõ "không tách được món nào gây lệch" — việc tách là của Claude khi có nhiều kỳ dữ liệu.

**Độ tin cậy** (§3 chủ quán yêu cầu):

| Điều kiện | Nhãn |
|---|---|
| < 3 kỳ có đủ 2 phiếu kiểm kê | **Chưa đủ dữ liệu** — không đề xuất |
| ≥ 3 kỳ, hệ số biến thiên (CV) của tỷ lệ > 20% | **Dao động mạnh** — đề xuất kèm cảnh báo |
| ≥ 3 kỳ, CV ≤ 20% | **Đáng tin** |
| Độ phủ định mức < 80% | Hạ một bậc tin cậy |

`CV = độ lệch chuẩn ÷ trung bình` của hệ số qua các kỳ. Giá trị đề xuất lấy **trung vị**
(median) chứ không phải trung bình — một ngày đổ nguyên nồi không được kéo lệch cả tháng.

**Lưu ở đâu:** collection MỚI `recipe_suggestions_gieogieo`, hoàn toàn tách khỏi
`recipes_gieogieo`:

```js
{ scope:'recipe'|'prep'|'topping', targetKey:'togo:<itemId>', size:'M', itemId:'<nguyên liệu>',
  giaTriGoc: 50, giaTriDeXuat: 55, heSo: 1.10,
  nguon:'app'|'claude', doTinCay:'du'|'daoDong'|'chuaDu', soKy: 6, cv: 0.08,
  kyTu:'2026-09-06', kyDen:'2026-10-05', ghiChu:'...',
  trangThai:'de_xuat'|'da_ap_dung'|'tu_choi',
  taoLuc, apDungLuc, giaTriTruocKhiApDung }
```

Bấm **Áp dụng** mới ghi vào `recipes_gieogieo`, và **lưu lại giá trị cũ** trong chính
bản ghi đề xuất → truy ngược được, quay lại được. Đúng nguyên tắc §10 của chủ quán.

---

## 4. Ngày đặc biệt (§5) — collection mới `special_days_gieogieo`

```js
{ date:'2026-09-02', loai:'le'|'tet'|'khuyenmai'|'su_kien'|'thoi_tiet'|'khac',
  ten:'Quốc khánh', ghiChu:'', heSoQuanSat: null }
```

App **không tự biết lịch Âm** (Tết ta đổi mỗi năm) — bịa ra một bảng lịch âm nhúng
trong file HTML là chỗ sẽ sai âm thầm. Chủ quán khai tay từng ngày, mỗi ngày mất 5 giây.
Ngày nào chưa khai thì trong JSON ghi `null`, **không mặc định là ngày thường**.

Thứ trong tuần thì app tự tính, không cần khai.

---

## 5. Dự báo & số mẻ (§5–§7) — ĐỢT SAU, có lý do

Hôm nay 06/09/2026 là ngày **đầu tiên** chủ quán bắt đầu ghi nhận theo mã mới. Dự báo
"thứ 7 nên nấu 2 mẻ" cần tối thiểu **4–6 tuần** lịch sử để phân biệt được *thứ 7 đông
hơn thật* với *tuần đó vừa có khuyến mãi*. Làm ngay hôm nay thì con số đầu tiên nó đưa
ra là số bịa, và đó đúng là thứ chủ quán bảo không được làm.

Vì vậy đề nghị: **Đợt 1 làm ghi nhận + đối chiếu + xuất JSON. Đợt 2 (sau ~4 tuần dữ
liệu) làm dự báo.** Công thức dự báo đã chốt sẵn ở đây để đợt 2 không phải bàn lại:

```
Dự báo tiêu thụ ngày D của một BTP/topping:
   nền     = TRUNG VỊ lượng dùng của CÙNG THỨ trong 4–8 tuần gần nhất
   xu hướng= tổng 14 ngày gần nhất ÷ tổng 14 ngày trước đó, kẹp trong [0,80 – 1,25]
   đặc biệt= nếu ngày D đã khai là lễ/Tết/khuyến mãi → trung bình hệ số của các ngày
             CÙNG LOẠI đã có; chưa có ngày nào cùng loại → 1,00 và NÓI RÕ là chưa có căn cứ
   dự báo  = nền × xu hướng × đặc biệt

Cần sản xuất = max(0, dự báo × (1 + đệm) − tồn đầu ngày CÒN HẠN DÙNG ĐƯỢC)
   đệm mặc định 5%  (hàng HSD ngắn) / 10% (hàng để được sang ngày sau)

Số mẻ (§6 — ưu tiên ít huỷ hơn ít thiếu):
   mẻ thô = cần sản xuất ÷ yieldHiệuLực
   · HSD ngắn (endOfDay / hours):  làm tròn XUỐNG nếu phần thiếu ≤ 25% một mẻ
   · Để được sang ngày sau:        làm tròn LÊN
   Luôn hiện kèm: dự kiến dư · nguy cơ thiếu · dự kiến phải huỷ.
```

Ví dụ (số của chủ quán): tồn đầu 15 phần · dự báo 70 · mẻ 30 phần
→ cần 70×1,05 − 15 = 58,5 → 1,95 mẻ → **2 mẻ = 60 phần** → tổng 75 → **dư 5**.

Mỗi lần đưa dự báo, ghi luôn vào `prep_forecasts_gieogieo` để hôm sau so với thực tế:

```js
{ date, prepId|toppingId, duBao, tonDau, deXuatSanXuat, soMe,
  thucTeDung, thucTeHuy, tonCuoi, saiSo, taoLuc }
```

Đây chính là mục "dữ liệu dự báo trước đó + kết quả thực tế" ở §8 — không có nó thì
không bao giờ biết dự báo đang tốt lên hay xấu đi.

---

## 6. File JSON cho Claude (§8, §9)

Giữ nguyên màn Trích xuất đang có, **thêm 4 khối**:

```
huong_dan_phan_tich   ← 22 việc chủ quán liệt kê, viết thành nhiệm vụ cụ thể cho Claude
                         + nguyên tắc "chưa đủ dữ liệu thì phải nói chưa đủ"
nguyen_tac_du_lieu    ← dữ liệu gốc / dữ liệu tính / phân tích / đề xuất là 4 tầng riêng
doi_chieu_dinh_muc    ← kết quả §1+§2 theo từng nguyên liệu: lý thuyết · thực tế · chênh ·
                         hao hụt đã ghi · chênh chưa giải thích · độ phủ · nguồn · đủ/thiếu dữ liệu
lich_su_theo_ngay     ← mỗi ngày: thứ, ngày/tháng, ngày đặc biệt (nếu đã khai), số ly,
                         bán theo món/size, dùng từng BTP/topping, mẻ đã nấu, huỷ, tồn cuối
```

Cộng thêm vào phần đã có: `special_days`, `recipe_suggestions`, `prep_forecasts`,
`prep_batches` kèm **giờ nấu · HSD tính sẵn · giờ hết hạn · lượng huỷ do hết hạn**.

**Bảo toàn dữ liệu gốc:** mọi khối tính toán nằm trong `doi_chieu_dinh_muc` /
`lich_su_theo_ngay` — dữ liệu gốc vẫn nằm nguyên ở `cauHinh` và `duLieuTheoNgay` như
hiện nay. Không có bước nào ghi đè, không có bước nào lọc bỏ dòng bất thường: dòng
bất thường được **gắn cờ** `batThuong: true` kèm lý do, vẫn nằm trong file.

Cờ bất thường (ngưỡng ban đầu, sửa được): chênh > 30% lý thuyết · thực tế âm ·
kiểm kê lệch > ngưỡng đã khai ở Tài chính · mẻ cân lệch > 20% so với yield ·
một ngày dùng gấp > 3 lần trung vị.

---

## 7. Làm gì trong ĐỢT 1 (đề nghị làm ngay)

| # | Việc | Nơi |
|---|---|---|
| 1 | Thêm **Mã** cho nguyên liệu (`code`), hiện trong danh sách, tìm được theo mã, cảnh báo mã trùng | Kho → Nguyên liệu |
| 2 | Màn **Ngày đặc biệt** — khai lễ/Tết/khuyến mãi | Cấu hình |
| 3 | Bộ máy **đối chiếu lý thuyết ↔ thực tế** (hàm thuần, kiểm thử được) | mới |
| 4 | Màn **Lệch kho** — bảng theo nguyên liệu, cờ bất thường, giải thích từng cột | Kho (mục con mới) |
| 5 | Sổ **đề xuất định lượng** + nút Áp dụng có lưu giá trị cũ | Kho → Định mức |
| 6 | JSON: thêm `huong_dan_phan_tich`, `nguyen_tac_du_lieu`, `doi_chieu_dinh_muc`, `lich_su_theo_ngay` | Trích xuất |
| 7 | Mốc **bắt đầu ghi nhận 06/09/2026** lưu ở `finance_gieogieo/current`, mọi phân tích nói rõ dữ liệu trước mốc là dữ liệu cũ | Cấu hình |

ĐỢT 2 (sau ~4 tuần): dự báo, số mẻ, thời điểm nấu, sổ dự báo–thực tế.

---

## 8. NHỮNG GÌ TÔI TỰ QUYẾT — chủ quán bác được

| # | Tôi quyết | Bác thì thành |
|---|---|---|
| 1 | Tiêu hao thực tế đo bằng **kiểm kê**, thiếu phiếu thì báo "chưa đủ dữ liệu" | Dùng luôn ledger (CONSUMPTION+WASTE) làm số thực tế |
| 2 | Tách **hao hụt đã ghi** khỏi **chênh chưa giải thích** | Gộp một cột "lệch" |
| 3 | Kèm **độ phủ định mức** vào mọi kết quả | Không cần, cứ đưa số |
| 4 | Đề xuất dùng **trung vị**, cần ≥ 3 kỳ, CV ≤ 20% mới gọi là đáng tin | Ngưỡng khác |
| 5 | Ngày lễ/Tết **khai tay**, app không nhúng lịch Âm | App tự đoán theo lịch Âm |
| 6 | **Dự báo để đợt 2**, sau ~4 tuần dữ liệu | Làm luôn bây giờ, chấp nhận số đầu tiên chưa chắc |
| 7 | Đề xuất **không tự áp dụng**, phải bấm Áp dụng | Cho tự áp dụng khi đủ tin cậy |
| 8 | Dòng bất thường **gắn cờ, giữ nguyên trong file** | Lọc bỏ khỏi phần tính trung bình |
| 9 | Mã nguyên liệu **chủ quán tự gõ** (app chỉ cảnh báo trùng) | App tự sinh NL01, NL02… |

---

## 9. KHÔNG đụng vào

- `computeDayPL`, `plBreakEven`, thu hồi vốn, chốt sổ — không liên quan.
- `aggregateOrders` / `computeUnitCogsFromRecipe` — **đọc lại chứ không sửa**.
- `recipes_gieogieo`, `prep_items_gieogieo` — chỉ ghi khi chủ quán bấm Áp dụng.
- Màn Trích xuất hiện tại — chỉ **thêm** khối, không bỏ khối nào.

---

## 10. ĐÃ LÀM — ĐỢT 1

| Nơi | Nội dung |
|---|---|
| `thGomLedger` · `thCongLedger` · `thPhieuCuaItem` · `thTinhMotKy` | Bộ máy đối chiếu, **hàm thuần** |
| `thDoiChieu({items,txs,counts,tuKey,denKey})` | Kết quả từng nguyên liệu: từng kỳ · hệ số · trung vị · dao động · độ tin cậy · cờ bất thường, xếp theo **TIỀN** lệch |
| `thTrungVi` · `thCV` · `thDoTinCay` | Trung vị (không phải trung bình), hệ số biến thiên, 3 mức tin cậy |
| `thDoPhu(alerts, soLy, …)` | Độ phủ định mức từ cảnh báo `missing_recipe` của POS |
| `thLoadDuLieu` | Đọc ledger + kiểm kê (rộng thêm 60 ngày về trước) + cảnh báo |
| Màn **Kho → Lệch kho & định lượng** | Bảng đối chiếu, mở xem từng kỳ, cờ bất thường, độ phủ, phiếu chờ duyệt |
| `special_days_gieogieo` + màn **Cấu hình → Ngày đặc biệt** | 7 loại ngày, khai tay |
| `recipe_suggestions_gieogieo` + `thNoiDungNguyenLieu` + `thApDungDeXuat` | Sổ đề xuất tách khỏi công thức gốc, áp dụng được cho **định mức món · mẻ chế biến · mẻ topping**, lưu giá trị cũ |
| `_expHuongDanPhanTich` · `_expNguyenTacDuLieu` | 22 nhiệm vụ + 7 nguyên tắc bắt buộc trong file JSON |
| `_expLichSuTheoNgay` · `_expTomTatTem` | Lịch sử theo ngày (thứ, ngày đặc biệt, mẻ nấu, huỷ) + tem kho |
| `FINANCE.usageTrackingStart` | Mốc bắt đầu ghi nhận, mặc định 06/09/2026 |

**Kiểm thử:** `thtest.mjs` 53 assertion (hàm thuần) · `th2test.mjs` 49 assertion
(mở file HTML thật trong Chromium: màn Lệch kho, tạo/áp dụng đề xuất, khối JSON).

**Chưa làm (Đợt 2, sau ~4 tuần dữ liệu):** dự báo nhu cầu theo thứ/xu hướng/ngày đặc
biệt, đề xuất số phần và số mẻ, thời điểm nấu, sổ `prep_forecasts_gieogieo` để đối
chiếu dự báo với thực tế. Công thức đã chốt sẵn ở §5.
