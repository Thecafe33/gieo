# HỢP ĐỒNG TIẾP NHẬN DỮ LIỆU CŨ — V1

## Quyết định đã chốt

> Lấy `unitBase` hiện tại làm tồn đầu, để `costBasis` trống. FIFO chạy đúng về
> **lượng** ngay; COGS thực tế có dần khi nhập lô mới.
>
> Dữ liệu cũ được **đánh dấu**. Từ mốc tiếp nhận trở đi, hệ mới truy được mọi
> thứ nó đã nhận đi về đâu. **Tuyệt đối không truy ngược vào hệ cũ.**
>
> Đây là phần chấp nhận đánh mất — hy sinh cho tương lai, không bám vào quá khứ.

Mục tiêu KHÔNG phải migrate 100%. Mục tiêu là lấy FIFO làm gốc cho tương lai.

---

## 1. Cái gì được tiếp nhận

| Loại | Mang sang | Ghi chú |
|---|---|---|
| Mã sản phẩm / mặt hàng | ✅ | kèm đơn vị, quy cách, tồn tối thiểu |
| Định lượng / công thức | ✅ | version đầu hiệu lực TỪ mốc cutover |
| Nhân viên | ✅ | kèm điều khoản lương; **PIN không mang sang** |
| Doanh thu đã chốt | ✅ | đóng băng nguyên trạng, hệ mới không tính lại |
| Tồn đầu kỳ theo lô | ✅ | `unitBase` hiện tại, `costBasis` trống |

## 2. Cái gì KHÔNG tiếp nhận

- Bút toán kho cũ
- Allocation FIFO cũ
- Lịch sử tiêu thụ cũ
- Lô đã dùng hết
- Lô có lượng ≤ 0 (gồm cả lô đang mang nợ âm)

Lý do chung: mang sang nửa vời tạo ra **một nửa sự thật trông như sự thật**. Lô
âm mang sang là nhập khẩu luôn một cái nợ không ai giải thích được.

---

## 3. Ranh giới được cài vào đâu

### 3.1 Cửa riêng, không nới cửa cũ
`unit.seedUnitFromLegacy()` là đường DUY NHẤT tạo Unit không có giá vốn.
`unit.createUnit()` giữ nguyên `costBasis` **bắt buộc**.

Nếu thay vào đó thêm một cờ vào `createUnit`, thì đường nhận hàng bình thường
cũng nới theo, và gap §10b.1 quay lại qua chính cái cửa vừa mở.

### 3.2 Mọi Unit khai xuất xứ
```
origin: 'NATIVE'       -> sinh trong hệ mới, truy được toàn bộ vòng đời
origin: 'LEGACY_SEED'  -> tiếp nhận, truy được TỪ seededAt trở đi
```
Không có Unit nào "không rõ từ đâu".

### 3.3 Trace NÓI RA ranh giới
`trace.traceability` có `complete: false` + `completeFrom` + `note` cho lô seed.

Không nói ra thì màn truy vết hiện một lịch sử cụt **trông y hệt** một lịch sử
đầy đủ, và người đọc kết luận sai từ một khoảng trống mà họ không biết là trống.

### 3.4 Câu hỏi về quá khứ không tính là lỗi
`trace.unanswered()` bỏ qua "nhận từ đâu / giá vốn nào / ai mở" với lô seed —
đó là ngoài ranh giới, không phải thiếu sót. Tính chúng vào sẽ tạo một danh
sách lỗi vĩnh viễn không ai sửa được, và danh sách như vậy chỉ dạy người ta bỏ
qua danh sách lỗi.

Nhưng quãng đời **sau** mốc tiếp nhận vẫn phải trả lời được đầy đủ — đó là phần
hệ mới chịu trách nhiệm.

### 3.5 Giá hệ cũ không thành giá lô
`inventory_items.costPerUnit` được giữ lại dưới tên `suggestedCostPerUnit` —
gợi ý cho lần nhập tới, KHÔNG phải giá vốn lô. Dùng nó làm giá lô đúng là lỗi
"quy hết về giá scalar gần nhất" mà audit đã chỉ ra.

---

## 4. Ai chạy việc này

**Hệ mới tự chạy**, một lần, lúc cutover. Không có bước export tay, không có
file trung gian, không cần ai chuẩn bị dữ liệu sẵn.

```
bootstrap/legacy-takeover.run()     đọc đủ nguồn hệ cũ qua read port (CHỈ ĐỌC)
        ↓
commands/takeover.buildPlan()       luật tiếp nhận — không biết dữ liệu từ đâu
        ↓
persistence-firebase/atomic-commit  ĐÚNG đường ghi của mọi mutation khác
```

Tách làm hai tầng vì luật tiếp nhận phải kiểm được mà không cần Firebase, còn
phần nối thì kiểm bằng một reader giả.

`operationId` xác định theo ngày cutover: bật app lại lần hai ghi vào đúng các
path cũ, **không** nhân đôi tồn đầu.

Đọc hụt một nguồn thì DỪNG — không tiếp nhận một phần. Tiếp nhận thiếu công
thức còn tệ hơn chưa tiếp nhận.

---

## 5. Hệ quả cần biết trước khi bấm nút

- **COGS thực tế = null cho toàn bộ 137 lô tiếp nhận.** Không phải lỗi. Báo cáo
  sẽ hiện "chưa đủ" ở vế thực tế cho tới khi hàng cũ dùng hết và lô mới vào.
  Vế lý thuyết vẫn chạy bình thường ngay từ ngày đầu.
- **Tồn đầu đúng bằng số hệ cũ đang có**, kể cả chỗ hệ cũ đang sai. Muốn số sạch
  hơn thì kiểm kê tại ngày cutover — nhưng đó là quyết định riêng, không bắt buộc.
- **137 lô mang `needsReview: SEEDED_WITHOUT_COST`.** Đây là nhãn trạng thái, không
  phải hàng đợi việc cần làm.
