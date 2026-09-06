# Đặc tả: Điểm hoà vốn — bản để bạn soát lại

> Đây là thứ lẽ ra phải đưa bạn duyệt TRƯỚC khi code. Code đã viết xong và đang nằm ở
> nhánh `claude/semi-product-container-input-r1be70`, **chưa merge**. Mọi quyết định
> dưới đây đều sửa được — chỗ nào bạn thấy sai, nói tôi đổi.

---

## 1. Công thức

```
                        Chi phí cố định
Doanh thu hoà vốn  =  ─────────────────────
                        Biên đóng góp %


Biên đóng góp %  =  1  −   Giá vốn hàng bán + Biến phí khác
                          ──────────────────────────────────
                                    Doanh thu
```

**Đọc thành lời:** biên đóng góp là phần trăm mỗi đồng doanh thu còn lại *sau khi* trả
biến phí, để đắp vào chi phí cố định. Bán thêm 1 ly chỉ góp được đúng phần đó, nên cần
(cố định ÷ biên) đồng doanh thu mới đắp đủ tiền thuê + lương.

### Ví dụ bằng số thật của quán (30 ngày)

| Khoản | Số tiền | Ghi chú |
|---|---:|---|
| Doanh thu | 90.000.000 | 30 ngày × 3tr |
| − Giá vốn hàng bán | 29.700.000 | 33% |
| − Biến phí khác (đá cây, ship…) | 3.000.000 | |
| **= Biến phí** | **32.700.000** | **36,3% doanh thu** |
| **Biên đóng góp** | | **63,7%** |
| Chi phí cố định: tiền thuê | 20.000.000 | |
| Chi phí cố định: lương | 8.962.581 | |
| **= Chi phí cố định** | **28.962.581** | |

→ **Hoà vốn = 28.962.581 ÷ 0,637 = 45.467.000 đ / 30 ngày ≈ 1.516.000 đ/ngày**

Kiểm chứng: bán đúng 45.467.000 → biến phí 36,3% = 16.504.000 → còn lại 28.963.000 →
đắp vừa đủ chi phí cố định → lãi bằng 0. ✔

---

## 2. Những gì tôi TỰ QUYẾT — cần bạn duyệt

| # | Quyết định | Tôi chọn | Nếu chọn khác thì sao |
|---|---|---|---|
| 1 | **Lương là chi phí gì?** | **Cố định** — kể cả lương giờ | Nếu coi lương giờ là biến phí: ngưỡng hoà vốn **thấp hơn** hiện tại. Tôi chọn cố định vì lịch làm đặt trước theo ca, không co giãn theo từng ly. Nhưng nếu quán bạn thật sự cắt/thêm ca theo lượng khách thì lựa chọn của tôi đang làm ngưỡng **cao hơn thực tế** |
| 2 | **Lấy dữ liệu bao nhiêu ngày?** | **30 ngày gần nhất** | Lấy riêng hôm nay: ngày trả tiền thuê ngưỡng vọt lên trời, 29 ngày kia tưởng không mất tiền thuê. Lấy 90 ngày: mượt hơn nhưng phản ứng chậm khi giá thuê/giá vốn đổi |
| 3 | **Biên đóng góp lấy từ đâu?** | Số bán **thật** 30 ngày; chưa có dữ liệu thì lùi về target COGS% và **ghi rõ là ước tính** | Nếu luôn dùng target COGS%: số ổn định nhưng không phản ánh việc giá vốn thật đang trôi |
| 4 | **Marketing là cố định hay biến đổi?** | Theo nhãn bạn đặt cho danh mục đó (mặc định đoán = **cố định**) | |
| 5 | **Đặt ở đâu** | Màn **Hôm nay** (thẻ hoà vốn ngày) + **Sức khoẻ tài chính** (khối đầy đủ). Cả hai đều đặt hoà vốn **trên** target | |
| 6 | **Danh mục chưa gắn nhãn cố định/biến đổi** | Coi là **cố định** | Phía an toàn: nhầm chiều này chỉ làm ngưỡng cao hơn thực tế. Nhầm chiều ngược lại → tưởng đã lãi trong khi đang lỗ |

### Hai câu tôi đã hỏi bạn và bạn đã chốt
- Chi phí cố định: **tự tính từ chi phí thật** (không gõ tay)
- Khấu hao: **hiện cả hai mức** — hoà vốn tiền mặt là chính, hoà vốn có khấu hao là phụ

---

## 3. Số lấy từ đâu

| Thành phần | Nguồn |
|---|---|
| Doanh thu, giá vốn | Đơn hàng thật 30 ngày (`fetchSalesRange` + `computeKPIs`) |
| Biến phí khác | `expenses_gieogieo`, các danh mục gắn nhãn **Biến đổi** |
| Chi phí cố định | `expenses_gieogieo` nhãn **Cố định** + toàn bộ lương |
| Lương | Ước lượng ở Mục tiêu, hoặc lương thật từ chấm công nếu bạn đã bật ở tab Lương |
| Khấu hao | `assets_gieogieo` — nguyên giá ÷ số tháng sử dụng |

Chi phí có kỳ hạn (tiền thuê ghi 1 lần cho cả tháng) được **phân bổ đều theo ngày**,
không dồn hết vào ngày ghi.

---

## 4. Ba trường hợp nguy hiểm — xử lý riêng, không để công thức tự chạy

| Tình huống | Hành vi |
|---|---|
| Biến phí ≥ doanh thu (biên ≤ 0) | Báo **"không tồn tại điểm hoà vốn"** — bán thêm một ly là lỗ thêm. Không chia cho số âm rồi in ra một con số vô nghĩa |
| Biên đúng bằng 0 | Như trên, không chia cho 0 |
| **Chưa khai chi phí cố định nào** | Ngưỡng ra 0đ, nhưng màn hình ghi rõ **"KHÔNG PHẢI đã hoà vốn"** kèm nút đi tới mục Chi phí. Một số 0 im lặng ở đây là thứ nguy hiểm nhất của cả tính năng |

---

## 5. Giới hạn — nói trước để bạn không tin quá mức

- **Không có lịch sử lương.** Đổi lương một nhân viên thì các ngày trước đó cũng tính
  theo mức mới. Đây là giới hạn sẵn có của app, không phải do phần hoà vốn.
- **Phân loại cố định/biến đổi là do bạn khai.** Tôi chỉ đoán sẵn theo tên. Khai sai
  thì ngưỡng sai, và không có cách nào máy tự phát hiện.
- **Không tách theo kênh bán.** Bán tại quán và bán qua app có biên khác nhau (phí sàn),
  nhưng ngưỡng hiện tại gộp chung.
- **Hoà vốn ≠ đủ sống.** Nó là mức không lỗ, chưa gồm tiền bạn muốn rút ra hằng tháng.

---

## 6. Việc bạn cần làm một lần

Vào **Chi phí → Cấu hình Danh mục**: mỗi danh mục có hai nút **Cố định / Biến đổi**,
đã đoán sẵn theo tên. Soát lại chừng một phút. Danh mục nào chưa bấm sẽ hiện dòng
"đang đoán theo tên, bấm để chốt".

---

## 7. Từ đây trở đi

Với mọi việc lớn hơn một chỗ sửa nhỏ, tôi sẽ đưa **kế hoạch + công thức + các quyết
định cần chốt** cho bạn duyệt trước, rồi mới code.

---

## 8. [Cập nhật — đợt 5 của kế hoạch lãi/lỗ theo ngày] Hoà vốn nay lấy số từ bảng lãi/lỗ

Khi làm xong bảng **lãi/lỗ theo ngày**, khối hoà vốn này trở thành **cách tính thứ hai**
chạy song song — và hai cách tính khác nhau thì sớm muộn ra hai con số khác nhau. Đã nối
lại: hoà vốn giờ đọc thẳng cùng bộ số của bảng lãi/lỗ.

**Hai thứ đổi, và đều là sửa sai:**

| | Trước | Nay |
|---|---|---|
| Hao hụt & huỷ | **Không tính vào đâu cả** → ngưỡng hoà vốn thấp hơn thực tế đúng bằng phần hàng bị hư | Tính vào **biến phí** |
| Khấu hao của kỳ | Lấy tròn 1 tháng | Cộng theo **từng ngày** (nguyên giá ÷ số tháng ÷ số ngày của đúng tháng đó), cùng cách với bảng lãi/lỗ |

Sai sót về hao hụt là sai **về phía nguy hiểm**: ngưỡng thấp hơn thật nghĩa là có lúc
màn hình báo "đã qua hoà vốn" trong khi quán vẫn đang lỗ.

**Đẳng thức luôn đúng từ nay** (có bài kiểm thử canh):

```
Lãi = (Doanh thu − Doanh thu hoà vốn) × Biên đóng góp
```

Bán đúng ngưỡng hoà vốn thì lãi bằng **0** — không phải xấp xỉ 0.

---

## 9. [Sửa lỗi — chủ quán phát hiện] Hai chỗ sai và một chỗ tôi nói quá lời

Chủ quán hỏi: *"điểm hoà vốn và lãi không khớp với doanh thu?"* — bán 773.000đ, ngưỡng
444.199đ, màn hình ghi "đã qua hoà vốn", nhưng lãi chỉ 81.383đ. Nhẩm theo công thức
thì phải ra ~220.000đ. Kiểm lại thì đúng là có lỗi.

### Lỗi 1 — Khấu hao trong ngưỡng lấy trung bình quá khứ (ĐÃ SỬA)

Ngưỡng "kể cả khấu hao" hiện **454.248đ/ngày**, tức chỉ nhích thêm 10.049đ so với mức
tiền mặt. Trong khi khấu hao thật của **một ngày** đã là 202.266đ. Đúng ra ngưỡng phải
là **745.639đ/ngày**.

Nguyên nhân: tài sản vừa được nhập vào app, nên trong cửa sổ 30 ngày chỉ có ~1 ngày
mang khấu hao. Lấy trung bình quá khứ cho một câu hỏi **hướng tới phía trước** là sai:
máy vừa mua thì 30 ngày qua chưa gánh gì, nhưng từ nay tháng nào cũng phải gánh.

Đã sửa: khấu hao trong ngưỡng lấy **mức đang chạy của hôm nay**. Các dòng khác (thuê,
lương) vẫn lấy trung bình 30 ngày vì chúng ổn định; riêng khấu hao nhảy bậc đúng hôm
mua tài sản.

### Lỗi 2 — Tôi nói quá lời ở đợt 5 (ĐÃ SỬA CÂU CHỮ)

Tôi viết "hai khối luôn khớp nhau: lãi = (doanh thu − hoà vốn) × biên đóng góp". Đẳng
thức đó chỉ đúng **trong chính cửa sổ 30 ngày**, không đúng khi nhẩm chéo giữa *lãi hôm
nay* và *ngưỡng 30 ngày*. Chủ quán nhẩm chéo là hoàn toàn hợp lý vì tôi đã viết như thế.

### Không phải lỗi — nhưng phải giải thích trên màn hình

Hai con số trả lời hai câu hỏi khác nhau:

| | Ngưỡng hoà vốn | Lãi hôm nay |
|---|---|---|
| Chi phí lấy từ | **trung bình 30 ngày** | **đúng hôm nay** |
| Khấu hao | **chưa trừ** | **đã trừ** |

Đã thêm **bảng đối chiếu** ngay trong thẻ hoà vốn, ba dòng cộng lại đúng bằng lãi thật:

```
Theo mức trung bình 30 ngày                    + 242.101
Chi phí thật hôm nay cao/thấp hơn trung bình   −   7.914
Khấu hao tài sản hôm nay                       − 200.000
= Lãi hôm nay                                     34.187
```

---

## 10. [Viết lại — chủ quán phát hiện lỗi logic] Hoà vốn nay CỘNG THẲNG khấu hao

Chủ quán: *"nếu là điểm hoà vốn phải + trực tiếp khấu hao vào, chứ tại sao lại bỏ khấu
hao ra rồi mở rộng ra mới cộng khấu hao vào… nếu điểm hoà vốn là 444K, khi tôi bán được
450K → chưa trừ khấu hao 220K vậy lãi lại là lỗ?"*

Đúng. **Một ngưỡng mang tên "hoà vốn" mà bán đúng ngưỡng vẫn lỗ thì ngưỡng đó sai**,
không có cách nào biện hộ. Đã viết lại:

| | Trước | Nay |
|---|---|---|
| Khấu hao | ngưỡng chính **chưa trừ**, có một ngưỡng phụ "kể cả khấu hao" bên dưới | **cộng thẳng vào chi phí cố định**, chỉ còn MỘT ngưỡng |
| Số liệu | chi phí và biên **trung bình 30 ngày** | **của chính ngày đó**, cùng bộ số với lãi/lỗ |
| Hệ quả | "đã qua hoà vốn" mà vẫn lỗ | trên ngưỡng là **lãi thật**, dưới ngưỡng là lỗ |

```
Biên đóng góp = 1 − (giá vốn + hao hụt + biến phí) / doanh thu
Hoà vốn       = (lương + chi phí cố định + khấu hao) / biên đóng góp
```

Đẳng thức tự nhiên đúng, không cần bảng đối chiếu nào để giải thích:
`lãi = (doanh thu − hoà vốn) × biên đóng góp`

**Đánh đổi đã cân nhắc:** lấy số của chính ngày thì ngưỡng nhích lên xuống theo ngày.
Nhưng đó là sự thật — hôm nay có khoản sửa chữa thì hôm nay đúng là phải bán nhiều hơn
mới hết lỗ. Chi phí dài hạn (thuê, lương tháng) đã chia đều theo ngày từ đợt 1 nên không
gây nhảy vọt. Đổi lại được thứ quan trọng hơn: **hai con số không bao giờ đá nhau nữa**.

Mục 8 và 9 ở trên nói về cách tính CŨ (cửa sổ 30 ngày) — giữ lại để đối chiếu lịch sử;
khối hoà vốn ở màn Sức khoẻ tài chính vẫn dùng cách đó cho cả KỲ, còn màn Hôm nay dùng
cách mới cho từng NGÀY.
