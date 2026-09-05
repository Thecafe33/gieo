# Kế hoạch: Cân bán thành phẩm theo dụng cụ đựng (trừ bì tự động)

> Trạng thái: **kế hoạch, chưa code**. Mốc so sánh: commit `6aad9fd` (bản POS + Quản lý đang chạy thật ở quán).

---

## 1. Vấn đề đang có

Ba chỗ nhân viên phải tự tính ngược ra số thật, và cả ba đều đang là một ô số trống:

| Luồng | Ở đâu | Hiện tại |
|---|---|---|
| Nhập BTP thu được thực tế | `openPrepFinishForm()` — POS dòng ~7884 | 1 ô `prepFinishQty`, gõ tay |
| Đếm BTP khi kết ca | `renderPrepCountScreen()` — POS dòng ~11466 | 1 ô mỗi lô, gõ tay |
| Huỷ BTP | `renderPrepWasteForm()` — POS dòng ~7128 | 1 ô mỗi lô, gõ tay |

Thực tế ở quán: BTP nằm rải trong nhiều dụng cụ (thạch trà: khay nhựa lớn + khay inox; cốt trà sữa: ca 2L). Nhân viên phải bê từng thứ lên cân, nhẩm trừ bì, cộng lại rồi mới gõ. Nhẩm sai là sai thẳng vào tồn kho và giá vốn — mà không ai phát hiện ra.

## 2. Việc cần làm

Cho phép **cân cả vật đựng**, hệ thống tự trừ bì và cộng nhiều lần cân lại thành một số ròng.

### Quyết định đã chốt

| Điểm | Chốt |
|---|---|
| Khai dụng cụ ở đâu | **Thư viện dùng chung** — 1 danh mục riêng, mỗi BTP chọn tối đa 5 dụng cụ từ đó |
| Số bì | **Khoá cứng theo số Quản lý khai** — nhân viên không sửa được |
| Kết ca | **Giữ nguyên nhập đúng từng lô**, chỉ thêm nút cân cho mỗi ô |

---

## 3. Mô hình dữ liệu

### 3.1 Collection mới — `prep_vessels_gieogieo` (thư viện dụng cụ đựng)

```js
{
  code: 'DC01',
  name: 'Khay nhựa lớn',
  imageUrl: 'https://firebasestorage.../prep_vessels/xxx.jpg',
  imagePath: 'prep_vessels/<id>/1735.jpg',   // giữ để xoá ảnh cũ khi thay
  note: 'Khay trắng vuông, dùng để đổ thạch',
  active: true,
  // Phân loại cân — LUÔN có ít nhất 1. Mỗi phân loại là một cách cân khác nhau
  // của CÙNG một dụng cụ, nên bì khác nhau (VD ca 2L: có nắp 310g / không nắp 245g).
  variants: [
    { id:'v1', label:'Cân cả nắp',    tareG: 310, imageUrl:'...', imagePath:'...' },
    { id:'v2', label:'Không có nắp',  tareG: 245, imageUrl:'...', imagePath:'...' }
  ],
  createdAt, updatedAt
}
```

**Vì sao là thư viện dùng chung, không nhét vào từng BTP:** khay inox dùng cho 6 loại thạch. Khai riêng thì phải upload cùng một tấm ảnh 6 lần và gõ lại 130g 6 lần; hôm nào đổi khay khác là phải nhớ sửa đủ 6 chỗ — sót một chỗ là lệch ngầm, không có gì báo.

⚠️ **Không đặt tên là `stock_containers_gieogieo`** — tên đó đã có rồi và là thứ hoàn toàn khác (chai nguyên liệu đã mở + tem, màn "Chai & tem kho"). Trùng khái niệm là nguồn gốc của mọi lỗi khó truy sau này.

### 3.2 `prep_items_gieogieo` — thêm 2 field

```js
vesselIds: ['id1','id2','id3'],   // tối đa 5, thứ tự = thứ tự hiện trên POS
gramsPerUnit: 1                   // xem 3.3
```

### 3.3 Bẫy đơn vị: cân ra **gam**, mà BTP có thể tính bằng **ml**

Cân bao giờ cũng cho ra gam. Nhưng `unit` của BTP đang có cả `ml` (cốt trà sữa, syrup). Trừ bì gam ra khỏi số gam rồi cộng thẳng vào tồn tính bằng ml là lẫn đơn vị — đúng loại lỗi mà file POS đã phải ghi chú xử lý ở `prepUnitInfoPOS()`.

**Xử lý:** thêm `gramsPerUnit` vào BTP (mặc định `1`).

```
số ròng (theo đơn vị BTP) = (số trên cân tính bằng g − bì tính bằng g) / gramsPerUnit
```

- `unit === 'g'` → ô này ẩn hẳn, luôn = 1, nhân viên không thấy gì khác.
- `unit === 'ml'` → form Quản lý hiện ô "1 ml nặng bao nhiêu gam?" kèm giải thích: *"Nước = 1. Cốt trà sữa có đường ≈ 1,03. Để 1 nếu quán quy ước 1ml = 1g."*
- `unit` là `phần`/`cái` → **không cho gắn dụng cụ**, ẩn hẳn tính năng cân (cân đếm được cái thì không cần trừ bì).

### 3.4 Ghi vết mọi lần cân

Mỗi chỗ lưu số ròng đều lưu kèm chi tiết, để sau này tra ngược được "sao hôm đó ra ít thế":

```js
weighMethod: 'vessel',            // 'vessel' = cân theo dụng cụ | 'manual' = gõ tay
weighings: [
  { vesselId, vesselName:'Khay inox', variantId, variantLabel:'Không nắp',
    grossG: 1430, tareG: 130, netG: 1300, net: 1300 }   // net = theo đơn vị BTP
]
```

Ghi vào: `prep_batches_gieogieo` (lúc hoàn thành mẻ), `prep_transactions_gieogieo` (dòng PRODUCTION), bản ghi đếm cuối ca, và bản ghi huỷ.

---

## 4. Phần Quản lý (`quanlygieo.html`)

### 4.1 Màn mới: **Kho → Dụng cụ đựng**

Chèn vào sidebar ngay dưới "Chế biến cấp 1" (dòng ~4454) + nhánh `renderKhoVessels()` trong `renderEntryKho()` (dòng ~9031).

Form mỗi dụng cụ:
- Mã (tự gợi ý DC01, DC02… — cùng cách với CB01 hiện có)
- Tên
- Ảnh chính (upload)
- Ghi chú
- **Danh sách phân loại cân** — nút "+ Thêm phân loại", mỗi dòng: nhãn + bì (g) + ảnh riêng (tuỳ chọn, không có thì dùng ảnh chính)

Chặn khi lưu: phải có ≥1 phân loại; mọi bì phải > 0; tên không trống.

Xoá: nếu dụng cụ đang được BTP nào gắn thì cảnh báo có tên các BTP đó, bắt xác nhận (không xoá ngầm — POS đang trỏ vào id đó).

### 4.2 Upload ảnh

`quanlygieo.html` chưa nạp `firebase-storage-compat.js` và **không cần nạp**: POS đã có sẵn cách upload bằng REST + idToken (`kcDoUpload()`, POS dòng ~18780). Chép nguyên cách đó sang, chỉ đổi đường dẫn:

```
prep_vessels/<vesselId>/<timestamp>.jpg
```

**Nén trước khi upload** (bắt buộc — POS chạy trên tablet, ảnh 4MB từ điện thoại sẽ làm màn cân giật):
1. Đọc file → `createImageBitmap`
2. Vẽ lên canvas, cạnh dài nhất **≤ 720px**
3. **Nền trắng** — vẽ `fillRect` trắng trước rồi mới vẽ ảnh lên (ảnh PNG nền trong suốt sẽ thành nền đen trên POS nếu không làm bước này; đây đúng là yêu cầu "nền trắng" của bạn)
4. `toBlob('image/jpeg', 0.82)` → thường ra 40–80KB

Có thanh tiến trình + xem trước ngay sau khi chọn file. Thay ảnh thì xoá ảnh cũ theo `imagePath`.

### 4.3 Sửa form "Chế biến cấp 1"

Thêm một khối mới vào `renderKhoPrep()` (dòng ~9877), đặt ngay dưới mục "Hạn dùng & Kế hoạch ngày":

> **Dụng cụ đựng khi cân** (tối đa 5)
> [lưới ô vuông ảnh, bấm để chọn/bỏ chọn từ thư viện]
> [khi `unit ≠ 'g'`: ô "1 {unit} nặng ? gam"]
> *Chưa chọn dụng cụ nào → POS vẫn cho gõ tay như hiện tại, không chặn gì.*

Lưu thêm `vesselIds` + `gramsPerUnit` trong `submitPrepItem()` (dòng ~9958). Nhớ thêm `gramsPerUnit` vào `PREP_NUMERIC_FIELDS` (dòng ~9774) — field số mà quên khai vào mảng đó là đúng cái bẫy đã có ghi chú sẵn ở ngay trên dòng đó.

---

## 5. Phần POS (`posgieo.html`) — bộ cân dùng chung

### 5.1 `PrepWeighPad` — viết MỘT lần, dùng ở cả 3 luồng

```js
openWeighPad({
  prepId, unit, gramsPerUnit,
  title: 'Cân cốt trà sữa vừa nấu',
  initialLines: [],           // mở lại để sửa
  onDone: ({ netTotal, lines }) => { ... }
})
```

Dùng lại kiểu overlay đã có sẵn trong POS (`pos-confirm-overlay`, dòng ~17632) để không đẻ thêm một cơ chế modal thứ hai.

### 5.2 Màn hình bộ cân

```
┌──────────────────────────────────────┐
│  Cân cốt trà sữa vừa nấu         ✕  │
├──────────────────────────────────────┤
│  Đang đựng bằng gì?                  │
│  ┌────┐ ┌────┐ ┌────┐               │  ← ô vuông bo tròn lớn, ảnh nền trắng
│  │ 🖼 │ │ 🖼 │ │ 🖼 │               │
│  └────┘ └────┘ └────┘               │
│   Ca 2L  Khay   Khay                │
│          nhựa   inox                │
├──────────────────────────────────────┤
│  ┌────────────────────────────────┐  │
│  │                                │  │  ← thẻ lớn: ảnh phân loại đang chọn
│  │          [ ẢNH LỚN ]           │  │
│  │                                │  │
│  └────────────────────────────────┘  │
│  ( Cân cả nắp )  ( Không có nắp )    │  ← chỉ hiện khi có ≥2 phân loại
│  Bì 245 g                            │
├──────────────────────────────────────┤
│  Số trên cân        [  1430  ] g     │
│  1.430 g − 245 g bì = 1.185 g ✓      │  ← hiện ngay khi gõ
│                                      │
│           [ ＋ Thêm lần cân ]        │
├──────────────────────────────────────┤
│  Đã cân 2 lần                        │
│   Ca 2L · không nắp   1.185 g   ✕   │
│   Khay inox           1.300 g   ✕   │
│  ────────────────────────────────    │
│  TỔNG THỰC TẾ         2.485 g        │
│                                      │
│  [        Xong — dùng số này       ] │
│  [   Bỏ qua, gõ tay số tổng        ] │
└──────────────────────────────────────┘
```

### 5.3 Phần nhìn (kiểu ghép AirPods)

- Ô chọn dụng cụ: vuông, `border-radius: 26px`, nền `#fff`, viền `1.5px #EDE9E0`, `box-shadow: 0 2px 10px rgba(0,0,0,.05)`
- Ảnh `object-fit: contain`, padding trong 12% — ảnh nền trắng của bạn sẽ hoà liền vào ô, không thấy mép
- **Đang chọn:** viền `2px var(--gd)`, `transform: scale(1.04)`, shadow đậm hơn, dấu ✓ tròn góc trên phải
- **Thẻ ảnh lớn:** `border-radius: 32px`, ảnh vào bằng `cross-fade 240ms + translateY(6px→0)` — đổi phân loại thì ảnh trượt đổi mềm chứ không nháy
- Bấm xuống: `scale(0.97)` 120ms
- Ảnh đang tải: khối xám bo tròn nhấp nháy nhẹ (skeleton), **không** để layout nhảy
- Ảnh lỗi/chưa khai: hiện chữ cái đầu tên dụng cụ trên nền be — không bao giờ vỡ khung
- `@media (prefers-reduced-motion: reduce)` → tắt hết chuyển động
- **Nạp trước ảnh** (`new Image().src = ...`) của mọi dụng cụ thuộc BTP ngay khi mở màn Chế biến, để lúc bấm vào là ảnh có sẵn

### 5.4 Chặn lỗi

| Tình huống | Xử lý |
|---|---|
| Số cân ≤ bì | Chặn Xong, hiện đỏ: *"1.20 g nhỏ hơn bì 245 g — có phải bạn quên chưa đặt lên cân?"* |
| Tổng = 0 | Chặn |
| Cùng dụng cụ + phân loại cân 2 lần | Cho, nhưng nhắc nhẹ *"Đã cân khay này rồi — cân 2 khay giống nhau thì đúng, bấm bỏ qua"* |
| BTP chưa gắn dụng cụ nào | Không hiện nút ⚖️, giữ nguyên ô gõ tay — **không chặn ai** |
| Mất mạng khi tải ảnh | Vẫn cân được bằng tên + số bì, chỉ mất ảnh |

Nguyên tắc xuyên suốt của app này là **cảnh báo chứ không khoá** — giữ đúng vậy. Riêng "số cân nhỏ hơn bì" thì chặn, vì đó chắc chắn là sai chứ không phải trường hợp lạ.

---

## 6. Ráp vào 3 luồng

### 6.1 Nhập BTP thu được thực tế — `openPrepFinishForm()`

Thêm nút **⚖️ Cân bằng dụng cụ** ngay trên ô `prepFinishQty`. Cân xong: điền số vào ô + hiện dòng tóm tắt *"2 lần cân · Ca 2L 1.185 + Khay inox 1.300"* có nút sửa.

Giữ nguyên hết phần đang có: cảnh báo lệch quá `PREP_FINISH_CONFIRM_PCT`, `weighedSuspect`, tính `actualCostPerUnit`. Chỉ ghi thêm `weighMethod` + `weighings` vào lô và vào `prep_transactions_gieogieo`.

**Lợi thêm:** `weighedSuspect` hiện đang đoán "trùng khít số công thức = chắc không cân thật". Có `weighMethod:'vessel'` thì biết chắc chắn, khỏi đoán.

### 6.2 Kết ca — đếm BTP — `renderPrepCountScreen()`

Giữ nguyên cấu trúc từng lô (đúng như bạn chốt). Chỉ thêm:
- Dòng 1 lô (`renderPrepCountLineSingle`): nút ⚖️ cạnh ô `pcQty{i}`
- Dòng nhiều lô (`renderPrepCountLinePerBatch`): nút ⚖️ nhỏ cạnh **từng** ô `pcBatch{i}_{bi}`

Cân xong đổ số vào đúng ô đó rồi gọi `prepCountSetQty` / `prepCountSetBatchQty` như bình thường — mọi logic phía sau (`prepCountRefreshBatchSum`, cảnh báo lệch, `submitPrepCount`) **không phải sửa gì**.

Ô "Tổng cân nhanh" (`pcSmart{i}`) cũng gắn được nút ⚖️: cân tổng các khay rồi để `prepDistributeSmartFIFO` gợi ý chia — nhân viên vẫn soát lại từng lô như hiện nay.

### 6.3 Huỷ BTP bằng hình thức cân — `renderPrepWasteForm()`

- Nút ⚖️ cạnh mỗi ô lô `pwB_{id}` và cạnh ô `pwQty`
- Thêm cách cân thứ hai, hợp thực tế hơn khi đổ bỏ: **"Cân phần còn lại rồi lấy hiệu"**
  → nhân viên cân khay *sau khi* đã đổ bớt, hệ thống lấy `số lô đang ghi − số vừa cân = số đã huỷ`. Đây mới là thao tác thật khi đổ nửa khay: không ai đi hót phần đã đổ ra để cân.

Ghi `weighings` vào bản ghi huỷ. Phần suy ngược ra hao hụt nguyên liệu (`ingredientBreakdown`) giữ nguyên, không đụng.

---

## 7. Thứ tự làm — 5 bước, mỗi bước xong là chạy được

| # | Việc | File | Xong thì có gì |
|---|---|---|---|
| 1 | Màn "Dụng cụ đựng" + upload/nén ảnh | quanlygieo | Khai được thư viện dụng cụ, chưa ai dùng tới |
| 2 | Gắn `vesselIds` + `gramsPerUnit` vào form Chế biến cấp 1 | quanlygieo | Cấu hình đủ, POS chưa đổi |
| 3 | `PrepWeighPad` + ráp vào luồng **Nhập BTP thu được** | posgieo | Luồng quan trọng nhất chạy thật, đo phản hồi nhân viên |
| 4 | Ráp vào **Kết ca** | posgieo | Kết ca nhanh hơn |
| 5 | Ráp vào **Huỷ BTP** (kèm cách "lấy hiệu") | posgieo | Đủ 3 luồng |

Bước 3 là bước đáng chạy thử vài ngày trước khi làm 4–5: nếu ảnh/thao tác có gì vướng thì sửa một chỗ, chưa lan ra hai màn kia.

---

## 8. Rủi ro cần canh

| Rủi ro | Xử lý |
|---|---|
| **Lẫn đơn vị g/ml** — nguy hiểm nhất, sai ngầm không ai thấy | `gramsPerUnit` + chặn gắn dụng cụ cho BTP đơn vị `phần`/`cái` + hiện rõ phép tính trên màn cân |
| Bì khai sai 1 lần → sai mọi lần cân của mọi BTP dùng khay đó | Màn Quản lý hiện *"Đang dùng cho N bán thành phẩm"*; sửa bì thì bắt xác nhận |
| Khay ướt/dính làm bì lệch | Đã chốt khoá cứng số bì. Nếu về sau thấy lệch thật thì mở lại — nhưng phải có vết ghi lại, không sửa ngầm |
| Ảnh làm POS chậm | Nén ≤720px/~60KB + nạp trước + skeleton |
| Firebase Storage rules chặn đường dẫn mới `prep_vessels/` | **Kiểm tra trước khi làm bước 1** — nếu rules chỉ mở cho `kiosk/` thì phải sửa rules |
| Dữ liệu cũ không có `weighings` | Mọi chỗ đọc đều phải chịu được thiếu field (`weighings \|\| []`) |
| Xoá dụng cụ mà BTP còn trỏ vào | Cảnh báo khi xoá; POS gặp id lạ thì bỏ qua dụng cụ đó, không vỡ màn |

## 9. Kiểm thử

1. Khay nhựa bì 130g, cân 1.430g → ra đúng **1.300 g**
2. Ca 2L hai phân loại: đổi có nắp ↔ không nắp → số ròng đổi đúng theo bì, ảnh đổi mềm
3. Cân 3 lần (ca 2L + 2 khay) → tổng đúng bằng tổng 3 số ròng
4. Cốt trà sữa đơn vị `ml`, `gramsPerUnit = 1.03`, cân 1.235g − bì 245g → **961 ml**
5. Gõ số cân nhỏ hơn bì → bị chặn, có chữ giải thích
6. BTP chưa gắn dụng cụ → không thấy nút ⚖️, gõ tay vẫn chạy y như cũ
7. Kết ca, BTP có 3 lô → cân riêng từng lô, tổng khớp, `submitPrepCount` ghi đúng từng lô
8. Huỷ nửa khay bằng cách "cân phần còn lại" → số huỷ = số lô ghi − số cân
9. Ngắt mạng khi mở bộ cân → vẫn cân được bằng tên + bì
10. Mở Quản lý sửa bì từ 130 → 135 → lần cân sau ra số mới, lần cân cũ đã lưu **không** đổi
