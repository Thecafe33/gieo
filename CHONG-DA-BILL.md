# Chống "đá bill" và chống dò doanh thu

Hai lỗ hổng cần bịt:

1. **Dò doanh thu.** Doanh thu ngày đã có mật khẩu, nhưng tab *Lịch sử đơn* ở POS
   liệt kê từng bill kèm số tiền — cộng tay là ra tổng ngày.
2. **Đá bill.** Pha nước, dán tem, đưa khách, không bấm bill, bỏ túi tiền mặt.
   Camera chỉ thấy "có tem" nên coi như hợp lệ; tem đó lấy từ một bill cũ bấm
   **in lại**.

Bốn lớp đầu không bắt được quả tang — chúng đóng đường đi và **để lại dấu**, để
việc gian phải trả giá bằng một dấu vết Quản lý nhìn thấy được. Lớp 5 thì đối
chiếu hai con số độc lập và chỉ thẳng ra số ly không có bill.

---

## Năm lớp đang chạy

| Lớp | Bịt cái gì | Ở đâu |
|---|---|---|
| 1 | Tem chỉ in lại được trong **20 phút**; mọi lượt in lại đều vào sổ | POS + Quản lý → Kiểm toán |
| 2 | Danh sách bill ở POS chỉ hiện đơn trong **60 phút** gần nhất | POS → Lịch sử đơn |
| 3 | Toàn bộ màn Lịch sử đơn được clone sang Quản lý, có quyền xoá | Quản lý → Lịch sử bill |
| 4 | Đếm tiền cuối ca tối đa **2 lần**, hết lượt thì ghi nhận mức lệch | POS + Quản lý → Sổ quỹ |
| 5 | Đối chiếu **bao bì đã dùng thật ↔ số bill lẽ ra phải dùng** | Quản lý → Kiểm toán |

Ba con số 20 / 60 / 2 nằm cạnh nhau ở đầu khối `[NEW-GUARD]` trong `posgieo.html`
(`TEM_REPRINT_WINDOW_MIN`, `HISTORY_VISIBLE_MIN`, `CASH_COUNT_MAX_ATTEMPTS`) —
muốn nới hay siết chỉ sửa đúng ba dòng đó.

---

## Lớp 1 — cửa sổ in lại tem 20 phút

Bốn đường in tem (mở bảng chọn, in một ly, in một món, in cả đơn) đều đi qua
`temReprintGuard()`. Đặt chốt ở **từng hàm** chứ không chỉ ở nút bấm: nút chỉ là
một trong bốn đường vào, và đường nào cũng gọi được từ console trình duyệt.

Đơn **không có `createdAt`** (bill rất cũ, từ trước khi có trường này) thì không
in lại được — không xác định được tuổi thì không thể nói là còn trong cửa sổ.

In lại trong 20 phút vẫn là việc bình thường (tem kẹt giấy, tem mờ, khách làm
rơi), nên không chặn nốt được. Cái chặn được là sự khuất mắt: mỗi lượt ghi một
bản vào `label_reprints_gieogieo`.

```jsonc
{ "orderId": "-Nxx", "billCode": "GG0101", "businessDate": "2026-09-08",
  "orderCreatedAt": "...", "minutesSinceBill": 4,
  "kind": "tem",            // "tem" | "bill"
  "scope": "unit",          // "all" | "item" | "unit"
  "detail": "Ly 1/2 · Trà đào cam sả (M)",
  "staffOnShift": ["Nguyễn Thị Lan"],   // ai đang check-in lúc đó
  "at": "..." }
```

Ghi sổ hỏng (mất mạng) **không** chặn in — tem là thứ nhân viên đang cần ngay.

**Xem ở đâu:** Quản lý → **Kiểm toán** → *In lại tem / bill*, theo ngày đang
chọn. Màn này tự gom nhóm và tô vàng những bill bị in lại **từ 3 lượt trở lên** —
đó mới là thứ đáng mở camera ra đối chiếu, chứ không phải một hai lượt lẻ.

## Lớp 2 — danh sách bill 60 phút

`renderH()` chỉ liệt kê đơn mới hơn 60 phút. Vẫn chừa lối tra cứu — khách quay
lại hỏi bill là việc thật — nhưng **đơn cũ và đơn mới đi theo hai luật khác hẳn
nhau**:

| | Luật khớp |
|---|---|
| Đơn còn trong 60 phút | tìm lỏng như cũ: khớp một phần mã bill / SĐT / số tiền |
| Đơn cũ hơn | chỉ khớp **đúng và đủ**: nguyên mã bill (≥ 4 ký tự sau khi bỏ `#`, `-`, `.`) hoặc **đủ** số điện thoại (≥ 9 số) |

Đây không phải cầu kỳ thừa. Tìm lỏng trên đơn cũ là một lỗ thủng bằng **cả lớp
chặn này**: mã bill có dạng `#40-07.09.26`, phần ngày giống nhau ở mọi bill trong
ngày — gõ `.09.` là ra sạch danh sách. Khớp theo số tiền cũng vậy, gõ `000` khớp
gần hết. Ba phím là vượt.

Chuẩn hoá trước khi so nên gõ `40-07.09.26`, `40 07 09 26` hay `#40-07.09.26`
đều ra **đúng một** bill — tiện cho người tra thật, mà không có cách nào gõ ra
nhiều bill cùng lúc.

**Không** treo dòng "N đơn cũ đã ẩn" ở đầu danh sách. Dòng đó vừa chỉ luôn đường
lách, vừa tự khai ra số bill của ngày — mà số bill × giá trung bình chính là
doanh thu, thứ lớp này sinh ra để giấu. Luật tra đơn cũ chỉ hiện khi tìm **không
ra**, đúng lúc nhân viên thật sự cần đến nó.

## Lớp 3 — Lịch sử bill bên Quản lý

Màn Lịch sử đơn của POS được **clone nguyên** sang Quản lý (`screen-bills`), kèm
quyền xoá bill có hoàn kho. Ẩn bớt ở POS mà không có chỗ nào xem đủ thì lại thành
cản trở công việc thật. Xem `quanlygieo.html` §15.

## Lớp 4 — đếm tiền cuối ca tối đa 2 lần

Trước đây vòng "đếm lại" **không có giới hạn**: chưa khớp thì bắt đếm lại mãi tới
khi khớp. Hai hậu quả, cả hai đều tệ:

* Người trung thực bị kẹt — lệch 2.000đ do thối nhầm cũng không kết ca được.
* Người muốn gian có thể **rà**: tăng/giảm đúng một mệnh giá rồi thử lại tới khi
  hệ thống báo khớp. Mỗi lần thử vẫn được ghi vào `attempts`, nhưng vì cuối cùng
  bao giờ cũng "khớp" nên bản ghi đó thành vô nghĩa.

Nay: đếm tối đa **2 lần**. Lần cuối hiện thêm ô **lý do lệch** (bắt buộc, ≥ 5 ký
tự). Đếm xong, dù còn lệch, hệ thống ghi nhận **đúng số đã đếm** và cho kết ca
với trạng thái `cash_variance_recorded` — khác `cash_passed`, nên Quản lý phân
biệt được ngay. Thiếu dòng ghi chú thì **không** bắt đếm lại từ đầu: số vừa đếm
được giữ nguyên, chỉ đòi phần còn thiếu.

Ghi vào `daily_closings_gieogieo/{ngày}`:

```jsonc
{ "status": "cash_variance_recorded",
  "attempts": [ { "actualCash": 1980000, "expectedCash": 2000000, "variance": -20000,
                  "passed": false, "staff": "...", "enteredAt": "...", "note": "..." } ],
  "finalActualCash": 1990000, "finalVariance": -10000,
  "varianceAccepted": true, "varianceNote": "...", "attemptCount": 2 }
```

`cash_variance_recorded` được **coi là bước tiền mặt đã xong** ở mọi nhánh
(`cashStepDone()` bên POS, `cashDone` bên Quản lý) — nếu không, ngày lệch sẽ bị
đá về đếm lại từ đầu, đúng cái vòng lặp lớp này sinh ra để cắt.

**Xem ở đâu:** Quản lý → **Sổ quỹ** → chọn ngày → thẻ *Các lần đếm tiền mặt*.
Bung từng lần: số thực đếm, mức lệch, và **bước nhảy so với lần trước**. Người
đếm nhầm thật nhảy một bước rồi dừng; người rà đi từng nấc 10.000đ / 20.000đ về
phía 0 — hai kiểu đó trông khác hẳn nhau, mà nhìn con số "đã thử 2 lần" thì
không thấy gì.

---

## Lớp 5 — đối chiếu bao bì với bill

Lớp **duy nhất** thực sự *bắt* được đá bill. Bốn lớp trên chỉ làm việc đó khó và
để lại dấu; lớp này đối chiếu hai con số độc lập và nói thẳng có bao nhiêu ly ra
khỏi quầy mà không có bill.

Cả hai vế đã có sẵn trong hệ thống từ trước, chỉ chưa ai nối lại:

| Vế | Lấy từ | Công thức |
|---|---|---|
| **Thật** | đếm giao ca (`handover_counts_gieogieo`) | đếm đầu ca + refill trong ngày − đếm cuối ca |
| **Bill** | engine bao bì đang trừ kho (`packaging_rules_gieogieo`) | mỗi ly → đúng 1 loại ly theo size |

**Vì sao không dùng sổ kho `CONSUMPTION` làm vế đối chứng**, dù nó có sẵn và dễ
đọc hơn: sổ đó do *chính việc bấm bill* sinh ra. Không bấm bill thì cũng không có
dòng sổ. Nó luôn khớp với bill kể cả khi đá bill — lấy nó làm đối chứng là tự lừa
mình. Chỉ số **đếm tay** mới là quan sát độc lập.

Vế bill chạy đúng engine đang trừ kho, nên **"size M dùng ly PP500, size L dùng
ly PP700" không phải khai lại** ở đây — nhóm `ly` trong Kho → Bao bì là
*exclusive* (mỗi ly ra đúng một kết quả) và đã lọc theo size. Sửa ở đó là báo cáo
này đi theo.

**Hao hụt đã khai (WASTE) được trừ ra khỏi vế thật.** Không trừ thì một ca làm vỡ
chồng ly hiện lên y hệt một ca đá bill — và cảnh báo sai kiểu đó giết chết cả
tính năng, vài lần là không ai thèm đọc nữa.

**Bật ở đâu:** Kho → Refill → **⚙ Cấu hình** của dòng ly:

1. Bật **"Phải đếm tay khi giao ca"**, chọn **Đếm lúc nào = Cuối ca** (hoặc Cả hai).
   Không có số đếm cuối ca thì không có gì để trừ — ô đối chiếu sẽ không hiện.
2. Bật **"Đối chiếu số đã dùng với số bán ra theo bill"**.
3. Đặt **dung sai**. Rơi vỡ và đếm nhầm một hai cái là chuyện thường; để 0 thì
   lệch một cái cũng bị nêu tên.

Hai field mới trên refill rule: `varianceCheck` (boolean), `varianceTolerance` (số).

**Xem ở đâu:** Quản lý → **Kiểm toán** → *Đối chiếu bao bì với bill*, theo ngày
đang chọn. Mỗi nguyên liệu hiện đủ phép trừ từ trên xuống, kèm chi tiết theo size
(`M: 141 ly`), và một trong bốn kết luận:

| Kết luận | Nghĩa |
|---|---|
| **Khớp** | lệch trong dung sai |
| **Dùng nhiều hơn bill** | 🔴 ly ra khỏi quầy mà không có bill — đối chiếu camera |
| **Dùng ít hơn bill** | đếm nhầm, hoặc refill đã bấm mà chưa chuyển thật. Không phải dấu hiệu đá bill |
| **Thiếu đếm đầu / cuối ca** | không đủ dữ liệu — nói thẳng là thiếu, không đoán bừa |

Trước khi kết luận từ một con số dương, báo cáo tự nhắc loại trừ ba thứ: rơi vỡ
chưa khai hao hụt, ly dùng cho việc khác (test, nhân viên uống), và refill đã
chuyển thật mà chưa bấm ghi nhận.

---

## Sửa code ở đâu

* `posgieo.html` — khối `[NEW-GUARD]` (ngay trước `printerReprintOrder`): ba hằng
  số, `temReprintInfo/Guard`, `logReprint`, `billIsFresh`, `cashStepDone`.
  Lớp 4 nằm trong `_submitShiftCloseImpl` + `renderShiftCloseCountForm(canGhiChu)`.
* `quanlygieo.html` — `renderAuditReprints()` và `computeBaoBiVariance()` /
  `baoBiVarianceHTML()` (tab Kiểm toán), `cashAttemptsCardHTML()` (tab Sổ quỹ),
  hai field cấu hình ở `addRefillRule` / `updateRefillRuleConfig`.
* Kiểm thử: `guards.test.js` (logic + đọc file, 90 mục) và `guards.browser.js`
  (POS thật trong Chromium, 22 mục — trong đó 7 mục thử đúng các đường lách của
  ô tìm: `.09.`, `08.09`, `000`, `09`, `#`, SĐT thiếu số, mã thiếu ký tự), và
  `lop5.test.js` (41 mục — chạy chính engine bóc từ file trên Firebase giả).
