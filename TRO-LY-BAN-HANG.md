# Trợ lý bán hàng (gợi ý bán hàng thông minh)

POS tự đọc giỏ hàng, lịch sử khách, khuyến mãi và tem tích luỹ rồi đưa cho nhân
viên **câu nói sẵn**, thay vì để mỗi người tự nhớ tự nghĩ nên upsale gì.

Toàn bộ chính sách (gợi ý cái gì, ưu tiên ra sao, chương trình nào đang chạy)
nằm ở app **Quản lý → Menu & Khuyến mãi → Trợ lý bán hàng**. POS chỉ chạy.

---

## Bốn nguyên tắc được cưỡng chế bằng code

| Nguyên tắc | Chỗ cưỡng chế |
|---|---|
| Tối đa **3 gợi ý** cùng lúc | `ASSIST_MAX_HARD` trong `posgieo.html` — cấu hình chỉ hạ xuống được, không nâng lên |
| **Không tự sửa giỏ hàng** | Mọi đường sửa cart đều nằm sau một `onclick` của nhân viên (`assistAccept` / `assistChip`) |
| **Không hard-code chương trình** | Mọi điều kiện, câu chữ, trọng số đều đọc từ Firebase |
| **Ghi nhận đủ để đánh giá** | Mỗi đơn ghi một bản nhật ký vào `sales_assist_logs_gieogieo` |

Ngoài ra POS **không** gợi ý bán topping cho món đang thuộc chương trình *tặng*
topping cho thành viên — mời khách mua đúng cái quán sẵn sàng tặng là tự bắn
vào chân.

---

## Sáu nguồn gợi ý và thứ tự ưu tiên mặc định

| Ưu tiên | Loại | Lấy dữ liệu từ |
|---|---|---|
| 1 | Xác nhận thông tin khách (đá / size / topping quen) | `customers/{sđt}.assist_profile` |
| 2 | Khuyến mãi gần đạt điều kiện | `togoSettings_gieogieo` + `campaigns` |
| 3 | Quyền lợi tem tích luỹ | `customers/{sđt}` (`stamp_count`, `free_drink_available`) |
| 4 | Upsale tăng AOV (nâng size, luật tự khai) | `upsell` |
| 5 | Topping hợp món | `topping.pairs` + `sales_assist_stats_gieogieo` + hồ sơ khách |
| 6 | Gợi ý bổ sung (món ruột) | `customers/{sđt}.assist_profile` |

Cùng lúc có nhiều gợi ý thì xếp theo ưu tiên rồi cắt còn ≤ 3. Ở màn order chỉ
hiện gợi ý **quan trọng nhất**; hai cái còn lại nằm sau nút "Còn N gợi ý nữa".
Trong giỏ hàng và màn thanh toán thì hiện đủ.

Gợi ý tem bám sát đúng luật đang chạy thật trong `loyaltyAddStamps()`: trần
2 tem/ngày/khách, và bill đã hưởng "mua X tặng Y" thì không tích tem — nếu
không sẽ hứa với khách một đằng, cộng tem một nẻo.

---

## Dữ liệu trên Firebase

### `sales_assist_config_gieogieo` (Realtime Database)

Do app Quản lý ghi, POS lắng nghe realtime — sửa xong là mọi máy POS nhận ngay,
không cần tải lại app.

```jsonc
{
  "enabled": true,
  "maxSuggestions": 3,          // trần cứng 3
  "logEnabled": true,
  "kinds": {                     // bật/tắt + thứ tự ưu tiên từng loại
    "customer_check": { "enabled": true, "rank": 1 },
    "promo_near":     { "enabled": true, "rank": 2 },
    "loyalty":        { "enabled": true, "rank": 3 },
    "upsell":         { "enabled": true, "rank": 4 },
    "topping":        { "enabled": true, "rank": 5 },
    "other":          { "enabled": true, "rank": 6 }
  },
  "topping": {
    "maxCards": 2,               // mấy MÓN được gợi ý topping cùng lúc
    "maxPerCard": 3,             // mấy topping trong một gợi ý
    "minRate": 0.12,             // tỉ lệ khách chọn tối thiểu
    "minSample": 5,              // số ly đã bán tối thiểu mới đủ tin
    "pairs": { "<itemId>": ["<toppingId>"] },   // cặp quán tự khai, thắng số liệu
    "pushToppingIds": [], "pushBoost": 30,      // topping đang cần đẩy bán
    "customerBoost": 45,                        // topping chính khách đó hay dùng
    "excludeToppingIds": []
  },
  "upsell": {
    "autoUpsize": { "enabled": true, "minGapPrice": 0 },
    "rules": [{
      "id": "ups_x", "name": "...", "enabled": true,
      "kind": "custom",            // "custom" | "attach"
      "say": "Đơn đang có {qty} ly — mời khách lấy thêm một phần bánh.",
      "when": { "itemIds": [], "minQty": 0, "minAmount": 0, "requireNoFood": false }
    }]
  },
  "campaigns": [ /* xem bên dưới */ ],
  "loyalty": { "enabled": true, "stampTarget": 6, "dailyCap": 2, "nearGap": 2 },
  "customerCheck": { "ice": true, "topping": true, "size": true, "favItem": false,
                     "minOrders": 2, "minRatio": 0.6 }
}
```

### Chiến dịch — chỗ khai 8.8 / 9.9 mà không đụng vào code

```jsonc
{
  "id": "sale99", "name": "Ưu đãi 9.9", "enabled": true,
  "from": "2026-09-09", "to": "2026-09-09",
  "weekdays": [],              // rỗng = mọi ngày; 0=CN … 6=T7
  "scope": "all",              // "all" | "togo" | "dinein"
  "conditions": [              // AND — phải đạt đủ tất cả
    { "type": "qty_size", "size": "L", "min": 2 }
  ],
  "nearGap": 1,                // còn thiếu ≤ ngần này mới mời thêm
  "swapFromSize": "M",
  "sayMet":  "Đơn đã đủ 2 ly size L — báo khách nhận 1 ly size M miễn phí.",
  "sayNear": "Thêm {thieu} ly size L nữa để nhận thêm 1 ly size M miễn phí.",
  "saySwap": "Nếu khách đổi {doi} ly sang size L, khách được tặng 1 ly size M."
}
```

Kiểu điều kiện: `qty_total`, `qty_size` (+`size`), `qty_item` (+`itemId`),
`qty_type` (+`menuType`), `amount`.

Chỗ điền trong câu nói: `{thieu}` `{can}` `{co}` `{size}` `{doi}`.

Cách POS chọn câu:

* đủ hết điều kiện → `sayMet`
* thiếu **đúng một** điều kiện, khoảng thiếu ≤ `nearGap` → `sayNear`
* thiếu điều kiện theo size, mà giỏ đã có sẵn ngần ấy ly ở `swapFromSize` →
  `saySwap` (đúng tình huống "khách đang có 2 ly M")
* thiếu từ hai điều kiện trở lên → im, còn xa quá

### `sales_assist_stats_gieogieo` (Realtime Database)

Bảng tần suất món ↔ topping, dựng từ tab **Hiệu quả**. POS đọc để biết tỉ lệ
khách chọn topping nào với món nào. Chưa dựng thì POS tự tính tạm từ các đơn
gần nhất đang có trong bộ nhớ — bật lên là dùng được ngay.

```jsonc
{ "items": { "<itemId>": { "name": "...", "cups": 120,
                           "toppings": { "<toppingId>": { "name": "...", "cups": 34 } } } },
  "toppings": { "<toppingId>": { "name": "...", "cups": 210 } },
  "days": 60, "orders": 3120, "updatedAt": "..." }
```

### `customers/{sđt}.assist_profile` (Firestore)

Hồ sơ thói quen, POS cộng dồn sau mỗi đơn có SĐT (transaction, không chạm tới
điểm/tem/voucher của khách).

```jsonc
{ "orders": 12, "ice": { "rieng": 10, "chung": 2 }, "sizes": { "M": 12 },
  "toppings": { "<toppingId>": 7 }, "items": { "<itemId>": 9 }, "lastAt": "..." }
```

### `sales_assist_logs_gieogieo` (Firestore)

Một bản ghi cho mỗi đơn có gợi ý. `applied` **không** lấy từ cú bấm nút mà suy
ra bằng cách so giỏ hàng lúc gợi ý hiện ra với đơn lúc chốt — nhân viên bấm
"đã hỏi khách" rồi khách vẫn từ chối thì vẫn tính là không.

---

## Bật tính năng lần đầu

1. Vào **Quản lý → Trợ lý bán hàng → Hiệu quả**, bấm **Dựng lại bảng tần suất
   món – topping** (60 ngày là đủ).
2. Bấm **Dựng lại hồ sơ thói quen khách** — chạy **một lần** để khách cũ cũng
   được cá nhân hoá ngay. Sau đó POS tự cộng dồn, không cần chạy lại.
   *(Nút này ghi đè hồ sơ hiện có bằng số đọc được trong khoảng ngày đã chọn.)*
3. Sang tab **Cấu hình**, khai vài **cặp món – topping** cho những món quán biết
   chắc là hợp nhau, và kiểm tra hai số của phần tem cho khớp luật đang chạy
   thật (hiện là 6 tem, trần 2 tem/ngày).
4. Bấm **Lưu**. Các máy POS nhận ngay, không cần tải lại.

Sau 1–2 tuần, quay lại tab **Hiệu quả** để xem loại gợi ý nào nhân viên hay bỏ
qua (câu chữ khó nói hoặc sai thời điểm) và loại nào khách hay từ chối (nội
dung chưa hợp), rồi chỉnh thứ tự ưu tiên / ngưỡng cho phù hợp.

---

## Sửa code ở đâu

* `posgieo.html` — cuối khối `<script>` chính, khối `[NEW-ASSIST]`. Bộ máy gợi
  ý, giao diện, ghi nhật ký, và một khối `assistHookIntoPOS()` gom **toàn bộ**
  chỗ móc vào luồng bán hàng có sẵn (bọc hàm, không rải lời gọi khắp file). Gỡ
  tính năng chỉ cần xoá đúng khối đó + ba thẻ `assistBar*` trong HTML.
* `quanlygieo.html` — khối `[NEW-ASSIST]` cuối file + màn `screen-assist`.

`ASSIST_DEFAULT_CONFIG` (POS) và `ASSIST_DEFAULT_CFG` (Quản lý) **phải khớp
nhau** — hai app đọc chung một node Firebase, lệch mặc định thì máy chưa cấu
hình sẽ chạy theo một luật khác với màn hình đang hiển thị bên Quản lý.
