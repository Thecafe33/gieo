# Kế hoạch: Lãi/lỗ theo ngày — và hoà vốn là hệ quả của nó

> **Chưa code gì.** Đây là bản để bạn duyệt. Chỗ nào sai ý, nói tôi sửa trước khi bắt đầu.

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
| 🟢 **Đã chốt tháng** | Đã có hoá đơn điện/nước/… của tháng | Thật | **Thật**, thay số dự đoán |

Mỗi con số lãi/lỗ luôn đi kèm một trong ba dấu này. Ngày hôm nay lúc 3 giờ chiều là 🟡 —
vẫn xem được, nhưng bạn biết nó chưa chốt.

Khi bạn nhập hoá đơn điện thật của tháng 9, **các ngày trong tháng 9 được tính lại** và
chuyển sang 🟢. Đó là lý do tháng là con số chuẩn cuối cùng, đúng như bạn nói.

---

## 6. Chi phí dự đoán vs thực tế — phần cần làm mới

Đây là **thứ duy nhất thật sự chưa có**. Cần thêm khái niệm *chi phí định kỳ*:

```
Khoản: "Tiền điện"
  Chu kỳ:        hằng tháng
  Số dự đoán:    2.000.000 đ/tháng
  Thực tế:
     Tháng 8 → 2.150.000 đ  (đã có hoá đơn)  🟢
     Tháng 9 → chưa có       → dùng 2.000.000 dự đoán  🟡
```

Có số thật thì số thật thắng, các ngày trong tháng đó tính lại. Chưa có thì dùng dự
đoán, và **màn hình phải ghi rõ là dự đoán** chứ không hiện như số đã đo.

Gợi ý: số dự đoán tháng sau **tự lấy trung bình 3 tháng gần nhất** đã có số thật, thay
vì bắt bạn gõ lại — nhưng vẫn sửa tay được.

---

## 7. Chi phí trả trước dài hạn (mặt bằng trả theo năm)

Cơ chế **đã có sẵn** trong app: chi phí "Có kỳ hạn" với ngày bắt đầu → ngày kết thúc,
tự chia đều theo ngày. Mặt bằng 120tr trả cho 1/1/2026 → 31/12/2026 sẽ tự thành
328.767đ/ngày.

Cần bổ sung đúng **hai trường**:
- **Ngày thực chi** — hôm nào tiền thật sự rời két (để màn Tiền mặt dùng)
- **Đã chi / chưa chi** — khoản chưa chi vẫn tính vào lãi/lỗ nhưng chưa trừ tiền mặt

Nhờ vậy: mặt bằng A trả trước cả năm và mặt bằng B trả hằng tháng đều ghi nhận được, và
đều phân bổ đúng vào từng ngày.

---

## 8. Hiển thị ở đâu

| Màn | Nội dung |
|---|---|
| **Hôm nay** | Thẻ lớn **"Lãi/lỗ hôm nay"** kèm dấu 🟡/🔵. Bấm vào xem tách từng dòng (doanh thu − COGS − lương − …). Thẻ hoà vốn ngày giữ nguyên, đặt ngay dưới |
| **Sức khoẻ tài chính** | Bảng **lãi/lỗ từng ngày** trong kỳ đang xem + biểu đồ cột (cột đỏ = ngày lỗ). Dòng tổng cuối bảng chính là lãi kỳ đó |
| **Báo cáo kỳ** | Tổng tuần/tháng, so với kỳ trước |
| **Chi phí** | Khu vực mới: **Chi phí định kỳ** — khai dự đoán, nhập số thực tế từng tháng |

---

## 9. Chia làm 4 đợt — mỗi đợt xong bạn duyệt rồi mới đi tiếp

| Đợt | Nội dung | Kết quả nhìn thấy được |
|---|---|---|
| **1** | Máy tính lãi/lỗ theo ngày, dùng dữ liệu đang có. Thẻ "Lãi/lỗ hôm nay" ở tab Hôm nay | Biết hôm nay lãi hay lỗ |
| **2** | Bảng + biểu đồ lãi/lỗ từng ngày ở Sức khoẻ tài chính; tổng tuần/tháng | Cộng ra lãi tháng |
| **3** | Chi phí định kỳ: dự đoán vs thực tế, ba mức tin cậy 🟡🔵🟢 | Số tháng thành số chuẩn |
| **4** | Ngày thực chi + đã chi/chưa chi; nối lại điểm hoà vốn cho khớp cách tính mới | Đủ như bạn mô tả |

Làm đợt 1 trước cũng có ích ngay, kể cả khi chưa làm 3 và 4.

---

## 10. Cần bạn chốt trước khi tôi bắt đầu

1. **Nguyên liệu nhập kho tính khi bán, không tính khi mua** (mục 4) — đồng ý không?
   Đây là quyết định ảnh hưởng lớn nhất tới con số hằng ngày.

2. **Lương ngày chưa kết ca lấy dự đoán từ đâu?**
   (a) Lịch làm việc đã xếp cho ngày đó, hay
   (b) Trung bình lương/ngày của 7 ngày gần nhất, hay
   (c) Chưa kết ca thì để trống, không đoán.

3. **Khấu hao có trừ vào "lãi hôm nay" không?**
   Trừ → đúng kế toán, nhưng số lãi thấp hơn tiền thật còn trong két.
   Không trừ → giống cảm giác tiền mặt, nhưng quên mất máy móc đang mòn dần.
   Tôi nghiêng về **hiện lãi ĐÃ trừ khấu hao, kèm một dòng nhỏ "trước khấu hao"**.

4. **Tiền bạn rút ra hằng tháng** có tính là chi phí không? Nếu bạn tự đứng quán và
   không nhận lương, thì "lãi" hiện tại đang bao gồm cả công sức của bạn.

5. **Bán qua app (GrabFood…) có phí sàn** — có tách riêng để tính biên đúng cho từng
   kênh không, hay gộp chung như hiện tại?

---

## 11. Việc tôi làm sai lần trước, và cách tránh lặp lại

Lần trước tôi hỏi 2 câu hẹp rồi tự quyết công thức, cách tính lương, cửa sổ dữ liệu và
vị trí hiển thị — bạn chỉ thấy kết quả sau khi mọi thứ đã viết xong. Với chỉ số tài
chính, công thức phải được duyệt trước.

Từ đây: mọi việc lớn hơn một chỗ sửa nhỏ đều đi qua **kế hoạch → bạn duyệt → code**, và
kế hoạch luôn có phần "những gì tôi tự quyết" để bạn bác được.
