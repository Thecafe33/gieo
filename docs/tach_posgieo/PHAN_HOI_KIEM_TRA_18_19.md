# Phản hồi kiểm tra lượt 18 + 19 + số đo Đợt 5 (`KET_QUA_KIEM_TRA_18_19_DOC_LAP.md`, commit `c8aee30`)

Người kiểm: **ĐẠT** chuyển mã nguyên văn 31/31 + 125/125 khai báo, 1.500 khẳng định `e2e_kho`, 151 file test; không hồi quy do tách. Còn bốn finding **công cụ / kiểm thử** (F19-1, F19-2, F5-1, F5-2) và một quan sát nghiệp vụ có sẵn (O19-1). Phản biện: đồng ý cả bốn finding (đã đối chiếu mã). **Mã app (`pos_cart`, `pos_thanh_toan`) không đổi** — chỉ sửa Firebase giả, kịch bản, công cụ đo, tài liệu.

## F19-1 — Firebase giả thiếu `Reference.key` (đồng ý, đã sửa)
`fb_gia.js`: RT ref nay có `key` = đoạn cuối đường dẫn, gốc = `null` (như SDK); Firestore ref vẫn chỉ có `id`. Test `tach_posgieo_fb_gia`: ca mới (`child().key`, ref cha, gốc `''` / không đối số; Firestore không có key). Hệ quả đúng như báo cáo: trước đây claim hậu thanh toán ghi `auto1/auto3` và dấu đổi ly không ghi; so mốc–bản tách bằng nhau nên không bắt được.

Đưa vào bộ chính (không còn chỉ probe riêng):

| Kịch bản | Đường đi | Khẳng định riêng |
| --- | --- | --- |
| `ttDoiLy` | khách Lan có 1 ly miễn phí (trần 30.000) → `consumeFreeToGoDrink` → popup quà → chọn Cà phê 0đ → tiền mặt | popup «tối đa 30.000»; dòng quà 0đ gốc 20.000, tổng 85.000; MỘT đơn có `voucherUsed`; **dấu đổi ly `stamp_free_redemptions_gieogieo/<đúng mã bill>`**; claim + done hậu thanh toán **cùng mã bill** (không `auto1/auto3`); quyền lợi 1 → 0; giỏ trống, ý định đổi ly dọn |
| `ttMatAck` | server đã ghi bill nhưng client nhận lỗi (đúng một lần) → giỏ + mã đơn còn, khoá nhả → bấm lại | một lần ghi bill dù bấm hai lần; claim / done cùng mã bill; toast «Lỗi lưu đơn» rồi «Thanh toán thành công»; giỏ trống, mã đơn xoá |

Tự kiểm mới: bỏ ghi dấu đổi ly → `ttDoiLy` lệch; bỏ nhánh dùng lại bill đã tồn tại → `ttMatAck` lệch.

## F19-2 — ba oracle nhận giá trị sai là đạt (đồng ý, đã sửa)
- `ttTienMat`: so chính xác màn `cp` (trước: chuỗi truthy).
- `ttChuyenKhoan`: `qrAmount === '85000'` **và** nội dung `TTHD <đúng mã đơn>` bằng `&&` (trước: nhánh `|| /^TTHD /` bỏ qua số tiền).
- `ttGiamGia`: `d.discountAmt === 5000` (trước: `JSON.stringify(d).includes('5000')`).
- Negative control riêng: 4 ca đưa dữ liệu sai (màn `sm`, QR 1đ, nội dung QR khác mã, `discountAmt` 0 nhưng có `5000` ở trường khác) vào đúng hàm `kiem` — phải báo SAI (chạy mỗi lần trước tự kiểm).
- `donhang()` nay nhận hậu tố quán (`orders_gieogieo__gg02`); `cho()` **ném lỗi khi hết giờ** (kèm bước) thay vì lặng lẽ qua — kịch bản không còn «PASS» khi điều kiện chưa xảy ra.

## F5-1, F5-2 — công cụ đo tải (đồng ý, đã sửa / đính chính)
- F5-2: `byte += await …` mất cập nhật → cộng sau khi body về, chờ mọi body trước khi đóng trang. Số mới: ~2,67 MB (mốc) / ~2,70 MB (tách) — đúng bậc với báo cáo (2.666 / 2.700 KiB).
- F5-1: «ấm» thực ra là mở lại cùng phiên (`page.route` tắt cache HTTP) → đổi nhãn «mở lại»; không còn gọi là số đo cache.
- `DOT_5_DO_TAI.md` đính chính: ba lần đo cho −11% đến −29% (dao động) → kết luận chỉ còn «không chậm hơn, xu hướng nhanh hơn, không phải cam kết». Chưa làm bài đo cache đúng (cần server giả có header Hosting, không dùng routing) — chỉ làm nếu chủ dự án thấy chậm ở cửa hàng.

## O19-1 — callback CK 1đ vẫn hoàn tất bill 85.000đ (ghi nhận, KHÔNG sửa)
Xác nhận đọc mã: `startBankListener` chỉ kiểm snapshot tồn tại, `_vietqrOnConfirm` gọi `confirmPay`, không so `data.amount`. Là hành vi **có sẵn từ bản đã deploy** (mốc giống hệt), không phải hồi quy do tách; webhook Cloud Run không có trong repo nên không xác minh được hợp đồng số tiền. Đổi hành vi nghiệp vụ → **hỏi chủ dự án** (xem báo cáo cho chủ dự án). Không tự sửa.

## Ghi nhận đính chính tài liệu
`_bankConfirmMeta` nằm trong `pos_thanh_toan.v1.js`, không ở lại main như dòng liệt kê state trong `KIEM_TRA_19_THANH_TOAN.md` (đúng như báo cáo; chuyển vẫn nguyên văn, không đọc sớm).

## Chạy lại
```sh
node tests/tach_posgieo_fb_gia.test.js                                   # ALL PASS (thêm ca .key)
node tools/tach_posgieo/e2e_kho.js --chi ttDoiLy,ttMatAck,ttTienMat,ttChuyenKhoan,ttChuyenKhoanTay,ttTinhRieng,ttGiamGia   # ALL PASS (211, gồm 4 negative control oracle + 2 tự kiểm mới)
sh tools/sinh_lai_tat_ca.sh                                              # TẤT CẢ ĐẠT
node tools/tach_posgieo/e2e_kho.js                                       # cả bộ: xem dưới
```

## Kết quả cả bộ sau sửa
`node tools/tach_posgieo/e2e_kho.js`: **1568 khẳng định, ALL PASS** (1500 cũ + 68 mới: `ttDoiLy`, `ttMatAck`, 4 negative control oracle, 2 tự kiểm mới); `sinh_lai_tat_ca` TẤT CẢ ĐẠT.
