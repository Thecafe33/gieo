# RUNBOOK CUTOVER — 20/09/2026

Ngày cutover đã chốt: **2026-09-20**.

---

## 0. Việc phải làm ĐÚNG NGÀY 20, không làm trước được

Export bạn đã gửi chụp ngày **2026-09-15**. Tồn kho thay đổi mỗi ca, nên seed
dựng từ bản đó sẽ lệch số ngày bán hàng tính tới ngày 20.

**Cần một export mới, lấy vào đúng thời điểm dừng hệ cũ.** Bản 15/09 chỉ dùng
để dựng và kiểm đường đi — đã làm xong.

Hai nguồn phải chụp CÙNG LÚC, nếu không sẽ sinh chênh lệch giả:
- Firestore: `stock_containers_gieogieo`
- RTDB: `active_units_gieogieo`

---

## 1. Trình tự

```
[1] Dừng hệ cũ ghi          -> writer = NONE
[2] Export tồn tại mốc dừng
[3] Dựng seed               -> node tools/build-seed.js <export> 2026-09-20
[4] Chạy khô                -> node tools/load-seed.js <seed.json>
[5] Đối chiếu lần cuối      -> cutover.finalReconciliation()
[6] Ghi seed                -> node tools/load-seed.js <seed.json> --commit
[7] Hệ mới thành sole writer -> writer = NEW
```

Giữa [1] và [7] **không ai ghi**. Đó là cửa sổ cố ý, không phải sự cố.

`bootstrap/cutover` chặn nhảy cóc: không qua được [7] nếu [5] chưa xong, và
không qua được [1] nếu chưa ghi nhận đủ P0..P12 kèm bằng chứng.

---

## 2. Con số dự kiến (theo bản 15/09 — sẽ đổi ở bản ngày 20)

```
Mặt hàng   : 50
Lô tồn đầu : 137   — tổng lượng 77.586,25
   đang mở dở: 27   (giữ nguyên openedAt)
Công thức  : 24
Nhân viên  : 2
Kỳ doanh thu đã chốt: 1

Không tiếp nhận: 32 lô đã hết, 3 lô lượng <= 0

Thao tác ghi: 352  (215 Firestore + 137 RTDB), trong MỘT transaction
operationId : operation_seed.2026-09-20
```

`operationId` xác định theo ngày cutover — chạy `--commit` hai lần ghi vào đúng
các path cũ, **không** nhân đôi tồn đầu.

---

## 3. Những gì sẽ thấy trong ngày đầu, và đều đúng

| Hiện tượng | Vì sao |
|---|---|
| COGS **thực tế** = "chưa đủ" cho mọi đơn | 137 lô tiếp nhận không có giá vốn. Vế **lý thuyết** chạy bình thường. |
| 137 lô mang cờ `SEEDED_WITHOUT_COST` | Nhãn trạng thái, không phải hàng đợi việc cần làm. |
| Truy vết lô cũ dừng ở 2026-09-20 | Ranh giới đã chốt. Trace nói rõ, không hiện lịch sử cụt. |
| Báo cáo "nhập trong kỳ" ngày 20 = 0 | Tồn đầu KHÔNG sinh bút toán nhập giả. |

---

## 4. Còn thiếu để bấm được

1. **Firebase config + tài khoản đọc/ghi** — `tools/load-seed.js` hiện ghi vào
   in-memory runner. Chưa nối handle thật.
2. **Ghi nhận P0..P12 kèm bằng chứng** vào `bootstrap/cutover` — cổng từ chối
   ô tick trần.
3. **Cửa sổ rollback**: bao lâu? (vd 24h). Quá hạn thì chỉ sửa bằng correction
   có audit, không quay lui hàng loạt.

---

## 5. Lỗi đã chặn được nhờ dựng thử trước

Chạy thử trên dữ liệu thật phát hiện hai lỗi mà nếu để tới ngày 20 sẽ hỏng ca đầu:

- **Seed mọi lô thành `SEALED`**, kể cả 27 hũ đang mở dở. FIFO sắp theo
  `openedAt`, nên hũ mở dở bị đẩy xuống cuối hàng — nhân viên được bảo mở hũ mới
  trong khi hũ cũ còn dở trên kệ. Đã sửa: giữ nguyên trạng thái mở và `openedAt`.
- **`allocation` ném lỗi với lô không có giá vốn.** Nó đọc thẳng
  `u.costBasis.unitCost`. Ca bán đầu tiên sau cutover sẽ crash. Đã sửa: lượng
  vẫn trừ đúng, giá để `null`, `costComplete: false`, kèm `unitsWithoutCost`.
