# Chống "đá bill" và chống dò doanh thu

Hai lỗ hổng cần bịt:

1. **Dò doanh thu.** Doanh thu ngày đã có mật khẩu, nhưng tab *Lịch sử đơn* ở POS
   liệt kê từng bill kèm số tiền — cộng tay là ra tổng ngày.
2. **Đá bill.** Pha nước, dán tem, đưa khách, không bấm bill, bỏ túi tiền mặt.
   Camera chỉ thấy "có tem" nên coi như hợp lệ; tem đó lấy từ một bill cũ bấm
   **in lại**.

Không lớp nào dưới đây bắt được quả tang. Chúng đóng đường đi và **để lại dấu**,
để việc gian phải trả giá bằng một dấu vết Quản lý nhìn thấy được.

---

## Bốn lớp đang chạy

| Lớp | Bịt cái gì | Ở đâu |
|---|---|---|
| 1 | Tem chỉ in lại được trong **20 phút**; mọi lượt in lại đều vào sổ | POS + Quản lý → Kiểm toán |
| 2 | Danh sách bill ở POS chỉ hiện đơn trong **60 phút** gần nhất | POS → Lịch sử đơn |
| 3 | Toàn bộ màn Lịch sử đơn được clone sang Quản lý, có quyền xoá | Quản lý → Lịch sử bill |
| 4 | Đếm tiền cuối ca tối đa **2 lần**, hết lượt thì ghi nhận mức lệch | POS + Quản lý → Sổ quỹ |

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

`renderH()` chỉ liệt kê đơn mới hơn 60 phút, và hiện một dòng vàng nói thẳng còn
bao nhiêu đơn đang ẩn — ẩn im lặng sẽ khiến nhân viên tưởng mất đơn rồi bấm lại.

Vẫn chừa lối tra cứu: **gõ từ 3 ký tự** vào ô tìm thì tra được **mọi** đơn theo
mã bill / SĐT / số tiền. Khách quay lại hỏi bill là việc thật, và nhân viên vẫn
cần tìm được bill bấm nhầm để xoá. Cái mất đi chỉ là *một danh sách để cộng dồn*.

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

## Còn lại gì

**Lớp 5 — đếm nắp/ly cuối ca.** Đây là lớp **duy nhất** thực sự bắt được việc đá
bill: số ly đã bán theo bill phải khớp số nắp/ly đã dùng thật. Bốn lớp trên chỉ
làm việc đó khó và để lại dấu, không chứng minh được.

Chưa làm, vì cần chốt trước hai điều với quán:

1. Mã bao bì nào là **1 ly = 1 cái** — nắp hay ly?
2. Đầu ca có sẵn số tồn của mã đó để so cuối ca không?

---

## Sửa code ở đâu

* `posgieo.html` — khối `[NEW-GUARD]` (ngay trước `printerReprintOrder`): ba hằng
  số, `temReprintInfo/Guard`, `logReprint`, `billIsFresh`, `cashStepDone`.
  Lớp 4 nằm trong `_submitShiftCloseImpl` + `renderShiftCloseCountForm(canGhiChu)`.
* `quanlygieo.html` — `renderAuditReprints()` (tab Kiểm toán) và
  `cashAttemptsCardHTML()` (tab Sổ quỹ).
* Kiểm thử: `guards.test.js` (logic + đọc file, 84 mục) và `guards.browser.js`
  (POS thật trong Chromium, 13 mục).
