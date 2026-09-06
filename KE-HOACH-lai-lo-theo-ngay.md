# Kế hoạch: Lãi/lỗ theo ngày — và hoà vốn là hệ quả của nó

> **Chưa code gì.** Đây là bản để bạn duyệt. Chỗ nào sai ý, nói tôi sửa trước khi bắt đầu.
>
> Cập nhật lần này: thêm mục **§7 Tính lại** và **§8 Chờ số thực tế → Chốt sổ** theo hai
> quyết định bạn vừa chốt.

---

## 1. Tôi hiểu bạn muốn gì

Không phải một ngưỡng hoà vốn tĩnh, mà là **một cuốn sổ lãi/lỗ theo từng ngày**:

> Hôm nay lãi 420k → mai lỗ 130k → mốt lãi 610k → … → cộng 30 ngày lại **chính là**
> tiền lãi thật của tháng đó.

Điểm hoà vốn chỉ là một câu hỏi rút ra từ cuốn sổ đó: *"doanh thu bao nhiêu thì con số
lãi/lỗ này bằng 0?"* — chứ không phải một tính năng riêng.

Cái tôi làm tuần trước tính hoà vốn **trung bình 30 ngày**, không cho bạn biết **từng
ngày** lãi hay lỗ. Đó là chỗ hụt.

---

## 2. Điểm mấu chốt phải chốt trước mọi thứ khác

Bạn đã tự nhận ra điều này khi viết *"có chi phí đã chi, và chi phí sẽ phát sinh hằng
tháng chưa chi"*. Nó là gốc của cả thiết kế:

| | **Chi phí phân bổ** | **Tiền thực chi** |
|---|---|---|
| Trả lời câu hỏi | Hôm nay **lãi** bao nhiêu? | Két **còn** bao nhiêu tiền? |
| Mặt bằng trả 1 năm 120tr | 328k **mỗi ngày**, suốt 365 ngày | 120tr **một lần**, ngày ký hợp đồng |
| Nhập 10 bao bột 5tr | 0đ hôm nhập. Vào dần theo từng ly bán ra | 5tr hôm trả tiền |
| Tiền điện tháng 9 | Chia đều 30 ngày của tháng 9 | Ngày 5/10 khi đi đóng |

**Quyết định:** con số "lãi hôm nay" dùng **chi phí phân bổ**. Nếu dùng tiền thực chi
thì ngày trả tiền thuê sẽ lỗ 120 triệu, còn 364 ngày kia lãi ảo — cộng lại vẫn ra đúng
tổng năm, nhưng từng ngày thì vô dụng.

**Dòng tiền vẫn cần**, nhưng là **màn riêng**, không trộn vào lãi/lỗ. App đã có tab
Tiền mặt cho việc đó.

---

## 3. Công thức lãi/lỗ một ngày

```
Lãi/lỗ ngày  =   Doanh thu bán hàng
               − Giá vốn hàng bán (COGS)
               − Hao hụt & huỷ trong ngày
               − Chi phí biến đổi phát sinh trong ngày
               − Lương ngày đó
               − Chi phí cố định phân bổ cho ngày đó
               − Khấu hao phân bổ cho ngày đó
```

Cộng 30 dòng như vậy ra đúng lãi tháng. Cộng 7 dòng ra lãi tuần. Không có phép tính
riêng cho tuần hay tháng — chỉ là cộng các ngày lại. **Đó là điều kiện để con số cộng
được**, và là lý do phải làm theo ngày ngay từ đầu.

### Từng dòng lấy ở đâu

| Dòng | Nguồn | Đã có chưa |
|---|---|---|
| Doanh thu | Đơn hàng POS ngày đó | ✅ có |
| Giá vốn hàng bán | Công thức món × số bán thật; món chưa khai định mức thì ước theo target COGS% | ✅ có |
| Hao hụt & huỷ | Ledger hao hụt nguyên liệu + huỷ bán thành phẩm + ly đổ | ✅ có |
| Chi phí biến đổi | Chi phí nhân viên gửi từ POS, bạn **đã duyệt**, danh mục gắn nhãn Biến đổi | ✅ có (thiếu nhãn) |
| Lương ngày | Chấm công thật ngày đó × lương từng người | ✅ có |
| Chi phí cố định | Chi phí có kỳ hạn, chia đều theo ngày | ✅ có sẵn cơ chế |
| Khấu hao | Nguyên giá ÷ số tháng sử dụng ÷ 30 | ✅ có |

**Không có dòng nào phải xây từ đầu.** Việc chính là ghép lại và làm rõ độ tin cậy.

---

## 4. Nguyên liệu nhập: tính khi MUA hay khi BÁN?

Bạn viết: *"nếu món nào bán ra đang sử dụng loại nguyên liệu đó, hoặc waste là mã
nguyên liệu đó → phải tính vào"*. Tôi hiểu đúng ý bạn và đồng ý — nhưng phải nói rõ
**hệ quả gây bất ngờ** của nó:

> **Hôm bạn chi 5 triệu nhập bột, con số "lãi hôm nay" KHÔNG giảm 5 triệu.**

Vì 5 triệu đó chưa mất đi — nó biến thành bao bột đang nằm trong kho. Nó chỉ thành chi
phí khi:
- **bán ra** một ly có dùng bột đó → vào COGS, hoặc
- **hư/đổ/hết hạn** → vào hao hụt.

Đây chính là "khá tương tự COGS" mà bạn nói. Tab **PO** đóng vai trò *cập nhật đơn giá*
nguyên liệu, không phải nguồn chi phí trực tiếp. Ngày chi 5 triệu sẽ hiện ở màn **Tiền
mặt** (dòng tiền), không hiện ở lãi/lỗ.

⚠️ Nếu bạn muốn ngược lại — nhập hàng là trừ tiền ngay — thì con số ngày sẽ nhảy loạn
theo lịch nhập hàng và **không cộng ra lãi tháng đúng** được. Tôi khuyên giữ như trên.

---

## 5. Ba mức tin cậy của một ngày

Đây là cách giải quyết yêu cầu *"chưa kết ca thì lương ở mức dự đoán"* và *"tháng là số
chuẩn nhất cuối cùng"*:

| Mức | Khi nào | Lương | Chi phí định kỳ |
|---|---|---|---|
| 🟡 **Đang chạy** | Ngày chưa kết ca | **Dự đoán** theo lịch làm việc đã xếp | Dự đoán |
| 🔵 **Đã chốt ngày** | Đã kết ca | **Thật** theo chấm công | Dự đoán |
| 🟢 **Đã chốt tháng** | Đã có đủ hoá đơn điện/nước/… của tháng | Thật | **Thật**, thay số dự đoán |

Mỗi con số lãi/lỗ luôn đi kèm một trong ba dấu này. Ngày hôm nay lúc 3 giờ chiều là 🟡 —
vẫn xem được, nhưng bạn biết nó chưa chốt.

---

## 6. Chi phí dự đoán vs thực tế — phần cần làm mới

Đây là **thứ duy nhất thật sự chưa có**. Form chi phí hiện tại chỉ có **một trục thời
gian** (ngày ghi, hoặc kỳ bắt đầu → kết thúc), nên không tách được *kỳ sử dụng* khỏi
*ngày trả tiền*. Cần bốn trường:

```
Khoản:        Tiền điện
Kỳ sử dụng:   1/9  →  30/9        ← chi phí rơi vào đây, chia đều theo ngày
Số tiền:      2.150.000
Loại số:      ● thực tế   ○ dự đoán
Ngày trả:     5/10        (để trống = chưa trả)
```

Ba mốc ngày hoàn toàn khác nhau, và trước giờ app gộp làm một:

| Mốc | Ví dụ tiền điện tháng 9 | Dùng để làm gì |
|---|---|---|
| **Kỳ sử dụng** | 1/9 → 30/9 | Chi phí rơi vào 30 ngày này |
| **Ngày có hoá đơn** | 5/10 | Số dự đoán bị thay bằng số thật |
| **Ngày trả tiền** | 5/10 | Tiền rời két — chỉ màn Tiền mặt dùng |

Đơn nhập hàng (PO) **để trống kỳ sử dụng** — nó phân bổ theo lượng bán/hao thật (§4),
không chia đều theo ngày.

Gợi ý: số dự đoán tháng sau **tự lấy trung bình 3 tháng gần nhất** đã có số thật, thay
vì bắt bạn gõ lại — nhưng vẫn sửa tay được.

---

## 7. Hoá đơn về muộn → **TÍNH LẠI** (bạn đã chốt)

> *"tôi chọn tính lại, tháng nào phải gánh đúng chi phí tháng đó"*

**Quy tắc:** số thật về lúc nào cũng được, nó luôn quay về **đúng kỳ sử dụng** của nó.
Các ngày trong kỳ đó được tính lại. Không có chuyện đẩy chênh lệch sang tháng sau.

### Ví dụ bằng số

Dự đoán tiền điện tháng 9 là **2.000.000**. Trong suốt tháng 9, mỗi ngày gánh
`2.000.000 ÷ 30 = 66.667đ`, đánh dấu 🟡.

Ngày 5/10 hoá đơn về: **2.150.000**.

| | Trước 5/10 | Sau 5/10 |
|---|---:|---:|
| Điện/ngày của tháng 9 | 66.667 🟡 | **71.667** 🟢 |
| Lãi ngày 12/9 (ví dụ) | 420.000 | **415.000** |
| Lãi cả tháng 9 | 8.500.000 | **8.350.000** |

Tháng 9 giảm đúng 150.000. **Tháng 10 không bị dính gì cả.**

### Hệ quả phải nói trước

- **Con số của một tháng đã xem có thể đổi.** Bạn xem lãi tháng 9 hôm 1/10 là 8,50tr;
  xem lại hôm 6/10 thành 8,35tr. Đây là **đúng như bạn yêu cầu**, không phải lỗi — nhưng
  app phải nói rõ vì sao đổi, nên mỗi tháng sẽ có dòng *"đã tính lại ngày 5/10: tiền điện
  2.000.000 → 2.150.000"*.
- **Tháng đã chốt sổ (§8) thì không tự đổi nữa.** Nếu có số thật về sau khi đã chốt, app
  hỏi bạn trước rồi mới mở lại tháng đó.

---

## 8. "Chờ số thực tế" → **Chốt sổ** (bạn đã chốt)

> *"hết tháng ở bảng sức khoẻ quán sẽ phải luôn hiện ra thông báo có chi phí chưa có
> thực tế … khi đó đầy đủ những thứ cần số liệu thực tế → bảng lời lãi cuối cùng mới
> chính xác và lúc này chốt sổ"*

### Một tháng có đúng ba trạng thái

| Trạng thái | Điều kiện | Bảng Sức khoẻ quán hiện gì |
|---|---|---|
| 🟡 **Đang chạy** | Tháng chưa hết | Lãi/lỗ tạm tính, ghi rõ "chưa hết tháng" |
| 🟠 **Chờ số thực tế** | Tháng đã hết, còn ≥1 khoản đang là dự đoán | **Băng cảnh báo luôn hiện**, liệt kê từng khoản còn thiếu |
| 🟢 **Đã chốt sổ** | Không còn khoản dự đoán nào + bạn bấm **Chốt sổ** | Con số cuối cùng, khoá lại |

### Băng "Chờ số thực tế" — hình dung

```
┌────────────────────────────────────────────────────────┐
│ ⚠  THÁNG 9 CHƯA CHỐT — còn 2 khoản chờ số thực tế      │
│                                                        │
│   Tiền điện     dự đoán 2.000.000   [ Nhập số thật ]   │
│   Tiền nước     dự đoán   350.000   [ Nhập số thật ]   │
│                                                        │
│   Lãi tạm tính 8.500.000 — có thể lệch tới ±235.000    │
│   khi có đủ hoá đơn.                                   │
└────────────────────────────────────────────────────────┘
```

Ba điểm trong thiết kế này:

1. **Luôn hiện, không tắt được**, từ ngày 1 của tháng sau cho tới khi đủ số thật. Đúng ý
   *"sẽ phải luôn hiện ra"*. Tắt được là sẽ có ngày bạn tắt rồi quên.
2. **Nói được sai lệch tối đa.** App biết dự đoán là 2.000.000, và biết 3 tháng trước
   dao động thế nào → ước được biên độ. Con số "±235.000" đáng tin hơn một cảnh báo suông.
3. **Nút nhập số thật nằm ngay trong băng**, không bắt bạn đi tìm mục Chi phí.

### Nút "Chốt sổ"

Chỉ **bật lên được khi không còn khoản dự đoán nào**. Bấm vào:
- Ghi lại con số lãi/lỗ cuối cùng của tháng đó + ngày chốt + ai chốt.
- Từ đó tháng hiện màu 🟢, và mọi màn hình đọc số **đã chốt** thay vì tính lại mỗi lần —
  nhanh hơn, và quan trọng hơn: con số bạn đã đọc sẽ không tự đổi sau lưng.

Nếu sau khi chốt vẫn có hoá đơn về: app **không tự sửa**, mà hiện dòng
*"Có 1 số thật về sau ngày chốt — mở lại tháng 9?"* để bạn quyết.

### Tháng đã chốt hiển thị khác tháng chưa chốt

| | Chưa chốt | Đã chốt |
|---|---|---|
| Con số | "Lãi **tạm tính**" | "Lãi tháng 9" |
| Màu/dấu | 🟠 kèm băng cảnh báo | 🟢 kèm "chốt ngày 6/10" |
| Có tính lại không | Có, mỗi lần mở | Không, đọc số đã ghi |

---

## 9. Chi phí trả trước dài hạn (mặt bằng trả theo năm)

Cơ chế **đã có sẵn** trong app: chi phí "Có kỳ hạn" với ngày bắt đầu → ngày kết thúc,
tự chia đều theo ngày. Mặt bằng 120tr trả cho 1/1/2026 → 31/12/2026 sẽ tự thành
328.767đ/ngày.

Với bốn trường ở §6, hai kiểu mặt bằng ghi nhận khác nhau đúng như bạn cần:

| | Mặt bằng A — trả cả năm | Mặt bằng B — trả hằng tháng |
|---|---|---|
| Kỳ sử dụng | 1/1/2026 → 31/12/2026 | 1/9 → 30/9 |
| Số tiền | 120.000.000 (thực tế) | 10.000.000 (thực tế) |
| Ngày trả | 28/12/2025 — **đã chi** | để trống — **chưa chi** |
| Vào lãi/lỗ | 328.767đ/ngày, cả 365 ngày | 333.333đ/ngày, 30 ngày tháng 9 |
| Vào tiền mặt | −120tr ngày 28/12/2025 | chưa trừ, đang nợ |

---

## 10. Hiển thị ở đâu

| Màn | Nội dung |
|---|---|
| **Hôm nay** | Thẻ lớn **"Lãi/lỗ hôm nay"** kèm dấu 🟡/🔵. Bấm vào xem tách từng dòng (doanh thu − COGS − lương − …). Thẻ hoà vốn ngày giữ nguyên, đặt ngay dưới |
| **Sức khoẻ quán** | Băng **"Chờ số thực tế"** (§8) trên cùng · bảng **lãi/lỗ từng ngày** + biểu đồ cột (cột đỏ = ngày lỗ) · dòng tổng cuối bảng chính là lãi kỳ đó · nút **Chốt sổ** |
| **Báo cáo kỳ** | Tổng tuần/tháng, so với kỳ trước, có nhãn đã chốt / chưa chốt |
| **Chi phí** | Khu vực mới: **Chi phí định kỳ** — khai dự đoán, nhập số thực tế từng tháng, xem tháng nào còn thiếu |

---

## 11. Chia làm 5 đợt — mỗi đợt xong bạn duyệt rồi mới đi tiếp

| Đợt | Nội dung | Kết quả nhìn thấy được |
|---|---|---|
| **1** | Máy tính lãi/lỗ theo ngày, dùng dữ liệu đang có. Thẻ "Lãi/lỗ hôm nay" ở tab Hôm nay | Biết hôm nay lãi hay lỗ |
| **2** | Bảng + biểu đồ lãi/lỗ từng ngày ở Sức khoẻ quán; tổng tuần/tháng | Cộng ra lãi tháng |
| **3** | Chi phí định kỳ: 4 trường ở §6, dự đoán vs thực tế, ba mức 🟡🔵🟢, **tính lại** khi số thật về | Số tháng thành số chuẩn |
| **4** | Băng **Chờ số thực tế** + nút **Chốt sổ** + trạng thái tháng | Không bao giờ quên hoá đơn về muộn |
| **5** | Ngày thực chi / đã chi–chưa chi cho màn Tiền mặt; nối lại điểm hoà vốn cho khớp cách tính mới | Đủ như bạn mô tả |

Làm đợt 1 trước cũng có ích ngay, kể cả khi chưa làm 3–5.

---

## 12. Năm câu đã chốt — và đợt 1 đã làm xong

| # | Câu hỏi | Bạn chốt | Đã cài vào code thế nào |
|---|---|---|---|
| 1 | Nguyên liệu tính khi mua hay khi bán? | **Khi bán** | Bảng lãi/lỗ **không có dòng nào đọc đơn nhập hàng**. Tiền nhập vào giá vốn khi bán, vào hao hụt khi hư/đổ. Thẻ ghi rõ điều này để không ai tưởng là quên |
| 2 | Lương ngày chưa kết ca lấy từ đâu? | **Lịch làm việc đã xếp** | `plPredictedLaborByDate()` — giờ theo lịch × đơn giá, có áp ngưỡng OT theo ngày; lương cứng chia đều theo tháng. Ngày đã qua thì lấy chấm công thật |
| 3 | Khấu hao có trừ vào lãi hôm nay? | **Có** | Trừ vào con số chính, kèm dòng phụ *"Trước khấu hao"* để vẫn đọc được cảm giác tiền mặt |
| 4 | Tiền chủ quán rút có phải chi phí? | **Không** | Không có dòng nào cho khoản này. Thẻ ghi rõ: đây là lợi nhuận quán làm ra, rút tiền là **chia** lợi nhuận đó |
| 5 | Phí sàn (GrabFood…) | **Chưa bán qua sàn, nhưng ghi chú sẵn** | Có sẵn dòng `phiKenh` và hàm `plChannelFeeForDay(day)` làm **một chỗ cắm duy nhất** — khi nào bán qua sàn chỉ điền hàm đó, dòng "Phí sàn" tự hiện, lãi/lỗ tự trừ. Ghi rõ luôn điều kiện tiên quyết: POS phải ghi doanh thu **theo kênh** trước đã, chứ đoán một tỷ lệ phí ở đó còn tệ hơn để 0 |

### Đợt 1 — đã xong

- Máy tính lãi/lỗ theo ngày (`computeDayPL`, `plSumDays`, `computeDailyPLRange`) — hàm
  thuần, kiểm thử được bằng số cụ thể.
- Thẻ **"Lãi/lỗ hôm nay"** trên tab Hôm nay, đặt trên thẻ hoà vốn, có dấu mức tin cậy
  và bảng tách từng dòng bấm ra xem.
- Hao hụt giờ gom được **theo từng ngày** (`wasteByDate`), để đợt 2 vẽ bảng từng ngày
  mà không phải đọc ledger lần thứ hai.
- 51 kiểm thử: công thức, lương dự đoán từ lịch (kể cả ca qua đêm và OT), cộng ngày ra
  kỳ, và chạy thật trên màn Hôm nay.

Còn lại đợt 2 → 5 như bảng ở §11.

---

## 13. Việc tôi làm sai lần trước, và cách tránh lặp lại

Lần trước tôi hỏi 2 câu hẹp rồi tự quyết công thức, cách tính lương, cửa sổ dữ liệu và
vị trí hiển thị — bạn chỉ thấy kết quả sau khi mọi thứ đã viết xong. Với chỉ số tài
chính, công thức phải được duyệt trước.

Từ đây: mọi việc lớn hơn một chỗ sửa nhỏ đều đi qua **kế hoạch → bạn duyệt → code**, và
kế hoạch luôn có phần "những gì tôi tự quyết" để bạn bác được.
