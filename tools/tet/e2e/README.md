# Test E2E lì xì Tết 2027 (trình duyệt thật — cần Playwright + Chromium)

Chạy trên máy có `playwright` (không thuộc `tests/run_all.sh` vì cần trình duyệt). Firebase giả trong bộ nhớ
(`mockfb.js` + `rtmem.js` = Realtime Database có ghi/đọc thật, `lixi_fake_inpage.js` = Firestore của bảng lì xì), không nối mạng.

```sh
node tools/tao_ban_tet.js                       # sinh lại 3 bản _tet trước
node tools/tet/e2e/lx_pos_full.js  [thư_mục_ảnh] # pos_tet:  upsize / giảm 10K / +1h bed, thanh toán thật (saveOrderToFirebase)
node tools/tet/e2e/lx_posx_full.js [thư_mục_ảnh] # PosX_tet: upsize / giảm 5K / To Go, thanh toán thật (confirmPay)
node tools/tet/e2e/lx_idx_bed.js   [thư_mục_ảnh] # index_tet: đặt bed có +1h → lịch kéo dài, chặn trùng, huỷ / đổi giờ
```
Mỗi file in `ok` / `FAIL` từng kịch bản, dòng cuối `FAIL: 0 / N` là đạt (mã thoát 1 nếu có FAIL).
Lỗi trang `snap.forEach is not a function` / `updateClock` là do Firebase giả thiếu hàm, không phải lỗi app.
