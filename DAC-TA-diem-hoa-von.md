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
