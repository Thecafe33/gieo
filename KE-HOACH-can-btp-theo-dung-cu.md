# Kế hoạch: Cân bán thành phẩm theo dụng cụ đựng (trừ bì tự động)

> Trạng thái: **đã code xong cả 3 luồng**. Mốc so sánh: commit `6aad9fd` (bản POS + Quản lý đang chạy thật ở quán).
>
> **Rules Firebase Storage: không phải sửa gì.** Rules hiện tại dùng `match /{allPaths=**}` nên đã phủ sẵn `prep_vessels/`; `allow write: if request.auth != null` cho cả upload lẫn xoá (hai app đều đăng nhập trước khi làm gì), `allow read: if true` cho POS hiện ảnh không cần token.

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
| Đơn vị | Mọi bán thành phẩm đã quy về **gram** — bỏ hẳn `gramsPerUnit`, không cần khai tỷ trọng |

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

### 3.2 `prep_items_gieogieo` — thêm 1 field

```js
vesselIds: ['id1','id2','id3'],   // tối đa 5, thứ tự = thứ tự hiện trên POS
```

### 3.3 Đơn vị: chỉ cân được thứ quy đổi từ gram

Cân bao giờ cũng cho ra gam. Vì bạn đã quy mọi bán thành phẩm về gram nên **không cần khai tỷ trọng gì cả** — chỉ còn một bảng quy đổi cứng:

```js
const VESSEL_UNIT_FACTOR = { g: 1, kg: 1000 };   // 1 đơn vị BTP = ? gam
```

- `g` / `kg` → cân được, số ròng = `(số trên cân − bì) / hệ số`
- `ml`, `l`, `cái`, `miếng` → **ẩn hẳn tính năng**. Bên Quản lý không cho gắn dụng cụ và nói rõ lý do; bên POS không hiện nút cân. Ẩn đi chứ không hiện ra rồi cho số sai — `ml` cần biết tỷ trọng, `cái` thì đếm chứ không cân.

Chặn ở **cả hai đầu** là cố ý: đơn vị của bán thành phẩm có thể bị đổi *sau khi* đã gắn dụng cụ, chặn một đầu là lọt.

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

### 4.2 Upload ảnh — ba tầng, tự xuống tầng dưới khi tầng trên hỏng

Bản đầu tự gọi REST bằng `XMLHttpRequest` (chép cách `kcDoUpload()` của POS) và **ở máy thật bị chặn ngay ở tầng mạng**: `xhr.onerror`, status 0, không có mã HTTP nào để lần. Đó là dấu hiệu trình duyệt chặn *trước khi* request kịp đi — gần như luôn là CORS (POST kèm `Authorization` + `Content-Type: image/jpeg` bắt buộc phải qua preflight OPTIONS), hoặc trang mở bằng `file://` nên Origin là `null`.

| Tầng | Cách | Khi nào dùng |
|---|---|---|
| 1 | **SDK Storage** (`firebase-storage-compat`) | Mặc định. Đường mà hàng triệu web app đang chạy — Google đã cấu hình sẵn CORS cho nó, SDK tự thử lại và tự lấy đúng tên bucket trong `firebaseConfig` |
| 2 | REST như cũ | Khi SDK không nạp được (mất mạng lúc tải gstatic). Có dò tên bucket `.appspot.com` ↔ `.firebasestorage.app` |
| 3 | **Nhúng thẳng vào Firestore** dạng data URI | Khi cả hai tầng trên hỏng. Xấu hơn nhưng **chắc chắn chạy ở bất cứ đâu Firestore chạy được** — mà cả app đã sống bằng Firestore rồi |

Đường dẫn trên Storage: `prep_vessels/<vesselId>/<timestamp>.jpg`

Ảnh nhúng nén nhỏ hơn (360px thay vì 720px) để không phình tài liệu Firestore, và có trần 140KB. `imagePath` để rỗng nên mọi chỗ dọn ảnh tự bỏ qua — không có file nào trên Storage để mà xoá. **POS không phải sửa gì**: nó chỉ đọc `imageUrl`, mà data URI gán thẳng vào `<img src>` cũng chạy y hệt một đường link.

Rơi xuống tầng 3 thì **nói rõ ra** kèm nguyên văn lỗi Storage trả về, và ô ảnh hiện nhãn "Ảnh nhúng trong dữ liệu" — im lặng ở đây là để chủ quán tưởng mọi thứ bình thường trong khi có một vấn đề hạ tầng cần sửa. Storage hỏng một lần thì lần sau đi thẳng xuống tầng nhúng, không bắt chờ hết timeout mạng cho mỗi tấm ảnh.

**Nén trước khi upload** (bắt buộc — POS chạy trên tablet, ảnh 4MB từ điện thoại sẽ làm màn cân giật):
1. Đọc file → `createImageBitmap`
2. Vẽ lên canvas, cạnh dài nhất **≤ 720px**
3. **Nền trắng** — vẽ `fillRect` trắng trước rồi mới vẽ ảnh lên (ảnh PNG nền trong suốt sẽ thành nền đen trên POS nếu không làm bước này; đây đúng là yêu cầu "nền trắng" của bạn)
4. `toBlob('image/jpeg', 0.82)` → thường ra 40–80KB

Có thanh tiến trình + xem trước ngay sau khi chọn file. Thay ảnh thì xoá ảnh cũ theo `imagePath`.

### 4.3 Sửa form "Chế biến cấp 1"

Thêm một khối mới vào `renderKhoPrep()` (dòng ~9877), đặt ngay dưới mục "Hạn dùng & Kế hoạch ngày":

> **Dụng cụ đựng khi cân** (tối đa 5)
> [lưới ô vuông ảnh, bấm để chọn/bỏ chọn từ thư viện, ô đang chọn có số thứ tự]
> *Chưa chọn dụng cụ nào → POS vẫn cho gõ tay như hiện tại, không chặn gì, nhưng có hiện một dòng nói rõ vì sao chưa có nút cân và cách bật.*
> *Đơn vị không phải g/kg → ẩn hẳn lưới, nói rõ vì sao.*

Lưu thêm `vesselIds` trong `submitPrepItem()`, có lọc bỏ id của dụng cụ vừa bị xoá giữa chừng — lưu lại id chết thì POS hiện ô trống bấm không được.

---

## 5. Phần POS (`posgieo.html`) — bộ cân dùng chung

### 5.1 `PrepWeighPad` — viết MỘT lần, dùng ở cả 3 luồng

```js
openWeighPad({
  prepId, unit,
  title: 'Cân cốt trà sữa vừa nấu',
  onDone: (netTotal, lines) => { ... },   // số ròng + bảng kê từng lần cân
  onManual: () => { ... }                 // nhân viên chọn "tự gõ số tổng"
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

## 7. Đã làm những gì

| # | Việc | File | Commit |
|---|---|---|---|
| 1 | Màn "Kho → Dụng cụ đựng" + upload/nén/xoá ảnh trên Firebase Storage | quanlygieo | `03ce516` |
| 2 | Lưới chọn tối đa 5 dụng cụ trong form Chế biến cấp 1 | quanlygieo | `03ce516` |
| 3 | Bộ cân `openWeighPad` + luồng **Nhập BTP thu được** | posgieo | `ba4addf` |
| 4 | Luồng **Đếm BTP kết ca** (từng lô + ô tổng cân nhanh) | posgieo | `ba4addf` |
| 5 | Luồng **Huỷ BTP**, kèm kiểu "cân phần còn lại rồi lấy hiệu" | posgieo | `ba4addf` |

### Ảnh được xoá thật lúc nào

Nút **Xoá ảnh** và **Đổi ảnh** đều xoá thật khỏi Firebase Storage, nhưng **lúc bấm Lưu** chứ không phải lúc bấm nút. Lý do: xoá ngay lúc bấm sẽ phá mất ảnh của bản ghi đang lưu nếu ngay sau đó bạn bấm Huỷ — để lại một dòng trỏ vào URL chết. Cụ thể:

- **Bấm Lưu** → xoá ảnh cũ bị thay + ảnh upload thừa trong phiên (đổi ảnh 3 lần thì 2 tấm đầu là rác).
- **Bấm Huỷ** → xoá ảnh vừa upload trong phiên; ảnh cũ **giữ nguyên** vì bản ghi vẫn đang dùng.
- **Xoá cả dụng cụ** → xoá hết ảnh của nó, và gỡ id khỏi các bán thành phẩm đang trỏ tới.

## 8. Rủi ro cần canh

| Rủi ro | Xử lý |
|---|---|
| **Lẫn đơn vị** — sai ngầm không ai thấy | Chỉ cho cân `g`/`kg`; `ml`/`cái`/`miếng` bị chặn ở **cả** Quản lý lẫn POS. Màn cân luôn hiện rõ phép tính `1.430 g − 130 g bì = 1.300 g` |
| Bì khai sai 1 lần → sai mọi lần cân của mọi BTP dùng khay đó | Màn Quản lý hiện *"Đang dùng cho N bán thành phẩm"*; sửa bì thì bắt xác nhận |
| Khay ướt/dính làm bì lệch | Đã chốt khoá cứng số bì. Nếu về sau thấy lệch thật thì mở lại — nhưng phải có vết ghi lại, không sửa ngầm |
| Ảnh làm POS chậm | Nén ≤720px/~60KB + nạp trước + skeleton |
| Firebase Storage rules chặn `prep_vessels/` | **Đã kiểm tra: không dính.** `match /{allPaths=**}` phủ mọi đường dẫn. Nếu về sau rules bị siết lại thì upload báo 403 kèm chữ nói rõ nguyên nhân |
| **Tên bucket** — `firebaseConfig` khai `.appspot.com` nhưng code upload đang chạy của POS gõ cứng `.firebasestorage.app` | Không gõ cứng nữa: thử tên trong config trước, gặp 404 thì thử tên kia, rồi nhớ cái nào chạy được. Gõ cứng mà đoán sai thì mọi lần upload đều 404 trong khi rules nhìn vào chẳng thấy gì sai |
| Dữ liệu cũ không có `weighings` | Mọi chỗ đọc đều phải chịu được thiếu field (`weighings \|\| []`) |
| Xoá dụng cụ mà BTP còn trỏ vào | Cảnh báo khi xoá; POS gặp id lạ thì bỏ qua dụng cụ đó, không vỡ màn |

## 9. Kiểm thử

Chạy bằng Chromium (Playwright), dựng đúng đoạn CSS + JS lấy thẳng ra từ hai file thật, không phải bản chép tay.

**Bộ cân POS — 30/30 đạt:**
1. Khay bì 130 g, cân 1.430 → ra đúng **1.300 g**
2. Ca 2L hai phân loại: đổi có nắp ↔ không nắp → số ròng đổi theo đúng bì, ảnh đổi theo phân loại
3. Cân 2 lần (ca 2L 1.120 + khay 1.400) → tổng **2.520**
4. Đơn vị `kg`: (2.310 − 310) / 1000 → **2 kg**
5. Gõ số nhỏ hơn bì → báo đỏ *"nhẹ hơn cả bì"*, bấm Xong không đóng được
6. Ô TỔNG cộng cả lần đang gõ dở; chốt lần cân xong tổng **không nhảy**; bấm Xong **không cộng đúp**
7. Bấm Xong khi còn lần gõ dở → tự gộp nốt, ra 2 dòng
8. Bỏ một lần cân → tổng trừ đúng
9. Bấm ✕ → đóng, **không** gọi callback lưu
10. `ml` không cân được, `g` cân được, id lạ không cân được

**Chạy trên FILE THẬT, không phải bản trích** (Firebase giả có nhớ, nạp trọn `posgieo.html` / `quanlygieo.html`) **— 27/27 đạt:**
- Quản lý (14): khai 10 dụng cụ → ảnh lên Storage → lưới chọn hiện đủ 10 → bấm 2 ô → **`vesselIds` xuống Firestore** → mở lại vẫn nhớ 2 lựa chọn; chưa gắn thì hiện nhắc "còn một bước nữa" kèm nút sang Chế biến cấp 1, gắn xong thì hết nhắc
- POS (13): chưa gắn → không nút, có nói lý do; đã gắn → nút ⚖️ hiện, bộ cân mở, trừ bì đúng, số đổ vào đúng ô của lô; "cân phần còn lại" lấy hiệu đúng; đơn vị ml → ẩn và nói rõ vì sao

**Phía Quản lý (bản trích, tập trung vào ảnh) — 38/38 đạt:**
1. Nén ảnh: PNG **nền trong suốt** 1600×900 → ra JPEG **vuông 720×720**, góc ảnh là **trắng** (không phải đen), dưới 150 KB
2. Tầng 1: SDK chạy được thì dùng SDK, **không đụng** tới REST
3. Tầng 2: không có SDK → rơi xuống REST; tên bucket sai (404) → tự thử sang tên kia
4. Tầng 3: cả SDK lẫn REST hỏng → nhúng vào Firestore, ảnh dưới 140KB, giữ lại nguyên văn lỗi Storage để báo cho chủ quán, và lần sau đi thẳng không chờ timeout lại
5. Ảnh nhúng → `imagePath` rỗng, không gọi xoá Storage vô ích
3. Lưu đúng tên + 2 phân loại kèm bì 310/245 + `imagePath` để xoá được sau
4. Đổi ảnh rồi **bấm Huỷ** → xoá đúng 1 ảnh rác, **không** đụng ảnh đang dùng, bản ghi vẫn trỏ ảnh cũ
5. Đổi ảnh rồi **bấm Lưu** → ảnh cũ bị xoá thật khỏi Storage
6. Nút Xoá ảnh → xoá thật, bản ghi hết `imageUrl`
7. Lưới chọn: bấm là chọn, bấm lại là bỏ, chặn đúng ở 5 dụng cụ, đơn vị `ml` thì ẩn lưới và nói rõ lý do

**Còn phải thử tay ở quán** (không tự động hoá được):
- Kết ca thật với một bán thành phẩm đang có 3 lô
- Huỷ nửa khay bằng kiểu "cân phần còn lại"
- Ngắt mạng khi mở bộ cân → phải vẫn cân được bằng tên + số bì (ảnh thay bằng chữ cái đầu)
