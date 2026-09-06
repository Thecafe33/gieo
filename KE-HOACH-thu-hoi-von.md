# KẾ HOẠCH — Cơ chế THU HỒI VỐN (chạy song song với khấu hao)

> Trạng thái: **CHỦ QUÁN ĐÃ DUYỆT — ĐÃ CODE XONG**.
> Viết theo đúng quy tắc §2 CONTEXTMASTER: kế hoạch → chủ quán duyệt → code.
>
> Bốn lựa chọn chủ quán chốt:
> 1. Tiền thu hồi/ngày = **lãi trước khấu hao** ✔
> 2. Ngày lỗ **trừ vào luỹ kế** ✔
> 3. Tổng vốn đầu tư = **LUÔN lấy tổng CAPEX tài sản** (không dùng ô "Vốn đầu tư ban đầu")
> 4. Mua thêm tài sản sau khi đạt mốc → **tiến độ tụt xuống, có ghi chú rõ** ✔

---

## 0. Tóm tắt một câu

Thêm một sổ thứ hai chạy song song: mỗi ngày quán làm ra bao nhiêu **tiền mặt thật**
thì cộng hết vào **tiền đã thu hồi vốn**; khi luỹ kế đủ 100% vốn đầu tư thì đánh dấu
"Đã thu hồi vốn" và chuyển sang Giai đoạn 2. **Sổ lãi/lỗ cũ giữ nguyên 100%**, không
sửa một con số nào.

---

## 1. Tiền thu hồi vốn của MỘT NGÀY lấy từ đâu

```
Tiền thu hồi vốn (ngày) = Doanh thu
                        − Giá vốn hàng bán
                        − Hao hụt & huỷ
                        − Chi phí biến đổi
                        − Phí sàn
                        − Lương
                        − Chi phí cố định phân bổ
                        ( KHÔNG trừ khấu hao )
```

Tức là **đúng bằng dòng "Trước khấu hao"** đã có sẵn trên thẻ Lãi/lỗ hôm nay:

```
Tiền thu hồi vốn (ngày) = lai + khauHao = pl.laiTruocKhauHao
```

### Ví dụ bằng số (một ngày thật)

| Dòng | Số tiền |
|---|---:|
| Doanh thu | 800.000 |
| − Giá vốn (33%) | 264.000 |
| − Hao hụt & huỷ | 20.000 |
| − Chi phí biến đổi | 10.000 |
| − Lương | 200.000 |
| − Chi phí cố định (thuê, điện…) | 150.000 |
| **= Tiền mặt quán làm ra** | **156.000** ← tiền thu hồi vốn của ngày |
| − Khấu hao (6tr/tháng ÷ 30) | 200.000 |
| **= Lãi theo phương án cũ** | **−44.000** |

Ngày này **theo sổ cũ là lỗ 44.000**, nhưng **thu hồi vốn được 156.000**. Hai con số
này cùng đúng, chỉ trả lời hai câu hỏi khác nhau:

- Sổ cũ trả lời: *"tính cả hao mòn máy móc thì tháng này quán có lời không?"*
- Sổ mới trả lời: *"tôi đã lấy lại được bao nhiêu trong 50 triệu bỏ ra?"*

### Vì sao lấy con số TRƯỚC khấu hao, không phải lãi sau khấu hao

- Khấu hao **không phải tiền ra khỏi túi**. Tháng nào cũng trừ 6tr khấu hao nhưng
  không ai cầm 6tr đó đi đâu — nó nằm lại trong két. Chính khoản nằm lại đó **là**
  tiền thu hồi vốn.
- Nếu lấy **lãi sau khấu hao** làm tiền thu hồi thì bị đếm thiếu: phần khấu hao đã
  bị trừ ra rồi, mà nó lại đúng là tiền thu hồi.
- Nếu lấy **chỉ phần khấu hao phân bổ** (6tr/tháng) thì thu hồi 50tr luôn luôn mất
  đúng bằng "thời gian sử dụng" đã khai — mâu thuẫn thẳng với yêu cầu §3 của chủ quán
  ("không quan trọng thời gian khấu hao dự kiến là bao nhiêu tháng").

Cách chọn ở trên khiến **quán bán tốt thì thu hồi vốn nhanh hơn dự kiến, bán kém thì
chậm hơn** — đúng tinh thần yêu cầu.

---

## 2. Luỹ kế và tiến độ

```
Đã thu hồi   = TỔNG tiền thu hồi vốn của TẤT CẢ các ngày, từ mốc bắt đầu → hôm nay
% thu hồi    = Đã thu hồi / Tổng vốn đầu tư × 100%
Còn cần      = Tổng vốn đầu tư − Đã thu hồi
```

Ví dụ chủ quán đưa: vốn 50.000.000, đã thu hồi 30.000.000 → **60%**, còn **20.000.000**.

Vẫn giữ đúng ràng buộc bất di bất dịch của app: **kỳ = TỔNG CÁC NGÀY**, không có công
thức riêng cho tháng.

---

## 3. Ngày lỗ thì sao

Ngày nào doanh thu **không đắp nổi chi phí vận hành** (con số ở §1 ra **âm**) thì hôm
đó quán **không tạo ra đồng nào để thu hồi**, mà còn phải bù thêm tiền vào.

→ **Cộng cả số âm vào luỹ kế** (luỹ kế đi lùi), chứ không làm tròn thành 0.

Lý do: làm tròn thành 0 thì một quán lỗ 15 ngày / lãi 15 ngày vẫn hiện "đang thu hồi
vốn đều đặn" — đúng lúc cần sự thật nhất thì màn hình lại nói dối. Màn hình sẽ ghi rõ
số ngày âm trong kỳ.

---

## 4. Mốc bắt đầu tính thu hồi vốn

Mặc định: **ngày mua sớm nhất trong các tài sản đã khai**.
Có ô cho chủ quán tự khai đè (`Ngày bắt đầu tính thu hồi vốn` ở màn Cấu hình → Tài chính).

Lý do mặc định như vậy: đó là ngày đồng vốn đầu tiên bỏ ra. Nếu để trống mà app tự
quét từ ngày có đơn hàng đầu tiên thì mỗi lần POS có dữ liệu cũ lạ, mốc lại nhảy.

---

## 5. Tổng vốn đầu tư gồm những gì — CHỦ QUÁN CHỐT

```
Tổng vốn đầu tư = TỔNG NGUYÊN GIÁ các tài sản đang active  (totalCapex)
```

**Luôn** lấy tổng CAPEX. Ô "Vốn đầu tư ban đầu" ở màn Cấu hình → Tài chính **không**
tham gia vào cơ chế này (nó vẫn dùng cho màn What-if như cũ).

Hai điểm phải nói rõ:
- Lấy **nguyên giá**, **không trừ giá trị thu hồi (residual)**. Chủ quán nói "thu hồi
  100% vốn cố định đã đầu tư" — bỏ ra 50tr thì phải lấy lại 50tr.
- Khoản **không nằm trong danh sách tài sản** (cọc mặt bằng, sửa chữa, biển hiệu) muốn
  được tính vào tiến độ thu hồi thì **phải khai thành tài sản**. Nếu ô "Vốn đầu tư ban
  đầu" đang khai một con số khác tổng CAPEX, thẻ Thu hồi vốn **nói thẳng ra sự chênh
  lệch đó** thay vì để chủ quán tưởng app đang đòi thu hồi con số kia.

---

## 6. Đạt 100% → Giai đoạn 2

- Ngày đầu tiên luỹ kế **≥ tổng vốn đầu tư** → app **ghi mốc lại** (ngày đạt + số vốn
  tại thời điểm đạt) vào `finance_gieogieo/current`, và trạng thái đổi thành
  **"Đã thu hồi 100% vốn đầu tư"**.
- Mốc đã ghi thì **không tự xoá**.
- Từ Giai đoạn 2 trở đi thẻ đổi nội dung: thay vì "tiến độ thu hồi vốn", nó hiện
  **"Tiền thật quán mang lại kể từ ngày [ngày đạt mốc]"** = tổng tiền ở §1 tính từ
  ngày đạt mốc trở đi. Không cộng dồn tiếp vào tiến độ thu hồi nữa.
- Sổ lãi/lỗ cũ (có trừ khấu hao) **vẫn chạy y nguyên** ở Giai đoạn 2 — nó vẫn là chỉ
  số tham chiếu để đánh giá hiệu quả (yêu cầu §5 của chủ quán).

**Trường hợp mua thêm tài sản SAU khi đã đạt mốc:** tổng vốn đầu tư tăng lên → tiến độ
tụt xuống dưới 100%. App **không im lặng**: hiện đúng một dòng
*"Đã từng đạt 100% ngày 12/03/2026. Sau đó khai thêm tài sản 12.000.000 nên tiến độ
hiện tại là 81%."* — chủ quán tự quyết coi đó là vốn của quán này hay của quán sau.

---

## 7. Hiển thị ở đâu

**a) Màn "Hôm nay"** — thêm MỘT thẻ rộng ngay dưới thẻ Lãi/lỗ:

```
THU HỒI VỐN ĐẦU TƯ                          [Chưa thu hồi đủ]
30.000.000 / 50.000.000
[███████████████░░░░░░░░░░]  60%
Còn cần 20.000.000 · hôm nay góp thêm 156.000
Tốc độ 30 ngày gần nhất: 4.680.000/tháng → dự kiến còn ~4,3 tháng
```

Bấm "Xem cách tính" mở ra bảng tách dòng + câu giải thích chênh lệch với sổ cũ.

**b) Màn "Sức khoẻ tài chính"** — khối "Thu hồi vốn" đặt ngay dưới khối Lãi/lỗ kỳ:
tiền thu hồi **của kỳ đang xem**, luỹ kế tới cuối kỳ, %, bảng **từng tháng**
(tháng · tiền thu hồi · luỹ kế · %), và số ngày âm.

**c) Màn Cấu hình → Tài chính** — thêm ô `Ngày bắt đầu tính thu hồi vốn`, và ghi chú
giải thích ô `Vốn đầu tư ban đầu` như §5.

---

## 8. Dữ liệu mới

Không thêm collection mới. Thêm 4 trường vào `finance_gieogieo/current`:

```js
{
  recoveryStartDate: 'YYYY-MM-DD' | null,   // mốc bắt đầu, null = tự lấy ngày mua tài sản sớm nhất
  recoveryReachedDate: 'YYYY-MM-DD' | null, // ngày đầu tiên đạt 100%
  recoveryReachedAt: ISO string,            // lúc app ghi mốc
  recoveryReachedCapital: number            // tổng vốn đầu tư tại thời điểm đạt mốc
}
```

Bản ghi cũ không có 4 trường này → coi như **chưa đạt mốc, mốc bắt đầu tự tính**.

---

## 9. Hiệu năng (chỗ dễ làm app chậm)

Luỹ kế phải cộng **mọi ngày từ mốc bắt đầu tới hôm nay** — có thể vài trăm ngày, trong
khi màn Hôm nay hiện chỉ đọc đúng 1 ngày.

Cách xử lý:
- Ngày cũ đã nằm sẵn ở `daily_sales_cache_gieogieo` → chỉ tốn **một** truy vấn dải.
- Nạp **nền**, y hệt cách khối hoà vốn 30 ngày đang làm: thẻ hiện khung chờ trước, có
  số thì vẽ lại. Màn Hôm nay **không chờ** nó.
- Nhớ trong bộ nhớ phiên (`_thvCache`, khoá theo ngày hôm nay), có nút làm mới.
- Giới hạn an toàn: tối đa **730 ngày** đổ về trước. Vượt quá thì nói rõ trên màn.

---

## 10. NHỮNG GÌ TÔI TỰ QUYẾT — chủ quán bác được

| # | Tôi quyết | Bác thì thành |
|---|---|---|
| 1 | Tiền thu hồi/ngày = **lãi trước khấu hao** (§1) | Chỉ lấy phần khấu hao phân bổ / hoặc lãi sau khấu hao |
| 2 | Ngày lỗ **trừ vào luỹ kế** (§3) | Ngày lỗ tính bằng 0, luỹ kế chỉ đi lên |
| 3 | Mốc bắt đầu = **ngày mua tài sản sớm nhất** (§4) | Chủ quán gõ tay ngày khai trương |
| 4 | ~~Tổng vốn = ô "Vốn đầu tư ban đầu"~~ → **chủ quán chốt: LUÔN lấy tổng CAPEX** (§5) | — đã chốt |
| 5 | Dùng **nguyên giá**, không trừ residual (§5) | Trừ residual |
| 6 | Mua thêm tài sản sau mốc → tiến độ tụt, có ghi chú (§6) | Khoá cứng mốc 100%, tài sản mới không tính |
| 7 | Giai đoạn 2 hiện "tiền thật mang lại từ ngày đạt mốc" (§6) | Chỉ hiện chữ "đã thu hồi đủ", không đếm tiếp |
| 8 | Đặt thẻ ngay **dưới** thẻ Lãi/lỗ ở màn Hôm nay (§7) | Đặt chỗ khác / gộp vào thẻ Lãi/lỗ |

---

## 11. KHÔNG đụng vào

- `computeDayPL`, `plSumDays`, `plBreakEven`, `plLaiCardHTML` — **không sửa công thức**.
  Thẻ Lãi/lỗ hôm nay hiện y như cũ (yêu cầu §5 của chủ quán).
- Ngưỡng hoà vốn vẫn cộng khấu hao như hiện tại.
- Chốt sổ, công nợ, cân trừ bì: không liên quan, không đụng.

---

## 12. Kiểm thử dự kiến (`thvtest`)

1. `thvTienNgay(pl)` đúng bằng `pl.lai + pl.khauHao` trên 5 bộ số ngẫu nhiên.
2. Ví dụ của chủ quán: vốn 50tr, thu hồi 30tr → 60%, còn 20tr, trạng thái "chưa đủ".
3. Đúng 50tr → 100%, trạng thái "đã thu hồi", ghi mốc đúng ngày.
4. 51tr → vẫn 100% (không hiện 102%), phần dư chảy sang Giai đoạn 2.
5. Ngày lỗ kéo luỹ kế xuống.
6. Thời gian khấu hao 12 tháng nhưng thu đủ trong 7 tháng → mốc rơi đúng tháng 7
   (chứng minh mốc **không** phụ thuộc số tháng khấu hao — yêu cầu §3).
7. Tổng vốn = 0 (chưa khai gì) → không chia cho 0, hiện "chưa khai vốn đầu tư".
8. Sổ lãi/lỗ cũ **không đổi một đồng** trước và sau khi thêm tính năng.

---

## 13. ĐÃ LÀM (bám đúng kế hoạch trên)

| Nơi | Nội dung |
|---|---|
| `FINANCE_DEFAULTS` | +4 trường `recoveryStartDate / recoveryReachedDate / recoveryReachedAt / recoveryReachedCapital` |
| `thvTienNgay(pl)` | tiền thu hồi của một ngày = `pl.lai + pl.khauHao` |
| `thvTongVon(assets)` | = `totalCapex(assets)` |
| `thvMocBatDau(assets, khaiTay)` | ngày mua sớm nhất, hoặc ngày chủ quán khai đè |
| `thvCompute({days, tongVon, mocDaDat})` | **hàm thuần** — luỹ kế, %, mốc đạt, tiền sau mốc, tốc độ 30 ngày, bảng theo tháng |
| `computeCapitalRecovery(force)` | nạp dữ liệu + cache phiên `_thvCache`, tự ghi mốc khi vừa chạm 100% |
| `thvCardHTML` / `thvChiTietHTML` / `thvBarHTML` / `thvToggleChiTiet` | thẻ ở màn **Hôm nay** (`#todayThv`), nạp NỀN |
| `thvHealthHTML` | khối ở màn **Sức khoẻ tài chính** (`#healthThv`), có bảng từng tháng |
| màn Cấu hình → Tài chính | thêm ô "Ngày bắt đầu tính thu hồi vốn" + ghi chú mẫu số là tổng CAPEX |
| màn Tài sản | dòng "Tổng CAPEX" nói rõ đây cũng là tổng vốn cần thu hồi |
| `addAsset/toggleAsset/deleteAsset`, `submitFinance` | xoá `_thvCache` khi tổng vốn/mốc đổi |

**Kiểm thử:** `thvtest.mjs` 49 assertion (hàm thuần) · `thv2test.mjs` 32 assertion
(dựng HTML thật) · `thvboot.mjs` 10 assertion (mở file HTML thật trong Chromium).
Có kiểm chứng bằng máy rằng `computeDayPL`, `plSumDays`, `plBreakEven`,
`plLaiCardHTML`, `plHealthHTML`, `monthlyDepreciation`, `computeKPIs`,
`computeDailyPLRange` **giữ nguyên từng ký tự** — sổ lãi/lỗ cũ không đổi một đồng.
