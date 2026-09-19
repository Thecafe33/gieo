# P12 SHADOW — KẾT QUẢ LẦN CHẠY ĐẦU TRÊN DỮ LIỆU PRODUCTION

Nguồn: export Firestore + RTDB ngày 2026-09-15 (11.309 entity, lấy ra 1.431 doc
thuộc 7 collection cần cho chuỗi FIFO). Dữ liệu KHÔNG nằm trong repo.

Chạy lại: `node tools/run-shadow.js <thư-mục-export>`

**Trạng thái cổng: CHƯA ĐẠT.** Mới phủ 1/121 ô ma trận, và ô đã chạy có lệch vật
chất chưa giải thích. Đây là kết quả đúng, không phải lỗi công cụ.

---

## 1. Kết quả đọc được

| Mục | Số |
|---|---|
| Unit legacy map sang canonical | 172/172 |
| Unit bị từ chối (status không nhận ra) | 0 |
| Bút toán kho | 1.165 |

## 2. Sáu phát hiện

### 2.1 — 100% Unit không có giá vốn
`NO_COST_BASIS` trên **172/172** container. Legacy chưa bao giờ lưu giá vốn ở
mức lô. Hệ quả trực tiếp: **COGS thực tế không tính được cho bất kỳ lô nào đang
tồn**. Đây đúng là gap "COGS actual chưa từng tồn tại" của §4.1, nay có số.

Không bịa giá: `mapUnit` trả `costBasis: null` kèm cờ, không lấy giá gần nhất
đắp vào.

### 2.2 — 74,5% tiêu thụ không quy được về lô nào

| Loại | Có lô | Không có lô |
|---|---|---|
| CONSUMPTION | 294 | **861 (74,5%)** |
| WASTE | 0 | 5 (100%) |
| RECEIVING | 0 | 4 (100%) |
| ADJUSTMENT | 0 | 1 (100%) |

`untrackedPendingDelta = -95.896,5` — gần 96 nghìn đơn vị đã trừ khỏi kho mà
không biết trừ từ lô nào. Trong khi đó tồn có lô chỉ là 66.184 (sealed) +
9.451 (đang mở).

Nói cách khác: **phần kho không truy vết được LỚN HƠN phần truy vết được.** FIFO
ở legacy chạy trên thiểu số giao dịch.

### 2.3 — 89,7% bút toán không có người thực hiện
**1.045/1.165** bút toán kho không có `staffEmployeeId`, và cũng không có cả tên
nhân viên. Hệ mới bắt buộc `actorId` cho mọi mutation.

→ **Migrate nguyên trạng là bất khả.** Cần quyết định trước P13 (xem §4).

### 2.4 — 7 Unit lệch giữa Firestore và RTDB
Hai nguồn cùng mô tả một hũ nhưng không khớp:

| Mã | Firestore | RTDB | Lệch |
|---|---|---|---|
| D5AQ0GMP | -20 | 0 | 20 |
| CN3CJR75 | 480 | 510 | 30 |
| TN8714SJ | -150 | 50 | 200 |
| 8GNWKBPK | -40 | 60 | 100 |
| 55VPC9GJ | -1851 | -1826 | 25 |

Legacy không có phép đối chiếu nào giữa hai tầng, nên lệch này chỉ lộ ra khi có
người tình cờ nhìn thấy.

### 2.5 — 5 Unit đang mang số dư âm
`NEGATIVE_UNIT_BASE` — legacy biểu diễn nợ FIFO bằng `unitBase` âm, không có
field riêng. Nặng nhất là **-1.851**. Không tra được nợ phát sinh lúc nào hay
bởi thao tác nào, vì legacy không lưu.

### 2.6 — 14/37 Unit dựng lại từ sổ KHÔNG khớp số đang lưu
Trong 37 Unit có đủ bút toán gắn lô để dựng lại, **14 lệch**. 135 Unit còn lại
không có bút toán gắn lô nào nên không kiểm được.

---

## 3. Vì sao cổng vẫn ĐÓNG

Mới chạy 1/121 ô (FIFO × normal). Còn 120 ô chưa chạy, gồm toàn bộ lớp kịch bản
`concurrent`, `retry`, `double-submit`, `lost-ack`, `partial-failure` — đúng
những lớp mà bug legacy sống trong đó.

Bản export tĩnh **không dựng được** các lớp đó. Muốn phủ thì phải chạy shadow
song song với hệ thật, hoặc dựng kịch bản mô phỏng có chủ đích.

---

## 4. Ba câu cần chủ quán quyết trước P13

1. **1.045 bút toán không có người thực hiện** — migrate bằng actor giả định
   `KHONG-CO-NGUOI-THUC-HIEN` (giữ được số, mất trách nhiệm), hay coi dữ liệu
   trước mốc X là "chỉ đọc, không migrate"?

2. **172 Unit không có giá vốn** — nhập giá vốn tay cho các lô đang tồn, hay
   chấp nhận COGS thực tế chỉ có từ ngày cutover trở đi?

3. **7 Unit lệch RT/Firestore + 5 Unit âm + 14 Unit lệch khi dựng lại** — kiểm
   kê thực tế để chốt số trước khi cutover, hay mang nguyên trạng sang rồi sửa
   bằng correction có audit?

Không câu nào tôi được quyết thay.
