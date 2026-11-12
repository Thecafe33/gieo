# Rà soát trừ kho và tính hao hụt ở posgieo (12/11/2026)

> Phạm vi: bán hàng (bill → trừ tem FIFO), báo hết, cân cuối ca, xoá bill, Sổ lệch — engine `unit_engine.v21.js` + phần điều phối ở `posgieo.html` / `js/posgieo/`.
> Cách rà: đọc mã + **chạy mã thật trên Firebase giả** theo từng tình huống xấu. Chạy lại được:
> `node tools/ra_soat/tru_kho_luc_ban.js` · `node tools/ra_soat/ban_khi_chua_mo_tem.js` · `node tools/ra_soat/dua_can_cuoi_ca_v5.js`
> **Chỉ báo cáo — chưa sửa gì ở kho** (engine v21 đã phát hành; sửa = v22 và đổi hành vi nghiệp vụ → chờ chủ dự án quyết). Chưa đối chiếu dữ liệu thật của gg01.

## 1. Những chỗ đã kiểm và ĐÚNG

| Tình huống | Kết quả thử |
|---|---|
| Gọi trừ kho hai lần cho cùng một bill | Tem và sổ chỉ trừ một lần |
| Bán vượt lượng còn của tem đang mở (nợ FIFO) rồi mở tem mới | Tem mới tự gánh đúng phần nợ (1000 → 980), không sinh hao hụt |
| Xoá bill | Hoàn đúng về tem; bill không gắn được tem thì hoàn ghi Sổ lệch đối ứng |
| Báo hết / cân cuối ca bị bấm lại, mất mạng giữa chừng | Không ghi đôi (mã lượt cố định, dấu giữ số trên tem) |
| Cân cuối ca khi POS và worker Engine 2 đua nhau (bản v5) | Kho trừ một lần, một dòng hao hụt (mục 10 kế hoạch tối ưu) |

## 2. Lỗ hổng tìm thấy

### L1 — Bán khi tem chưa được quét mở → về sau thành «hao hụt» giả, tính tiền hai lần (NGHIÊM TRỌNG NHẤT)

**Tái hiện** (`ban_khi_chua_mo_tem.js`, tình huống A): hộp 1000 ml. Bán 50 ml lúc hộp chưa quét mở → quét mở → bán tiếp 950 ml (hộp thật đã cạn) → báo hết.

| Bước | Tem | Sổ | Sổ lệch |
|---|---|---|---|
| Bán 50 khi chưa có tem mở | không đổi | `CONSUMPTION −50` (ngoài tem) | `no_open_tem −50`, đang mở |
| Quét mở hộp | **1000** (không trừ 50 đã bán) | | |
| Bán 950 | 50 | `CONSUMPTION −950` | |
| Báo hết (hộp thật rỗng) | đóng, «còn thừa 50» | **`WASTE −50`** | vẫn `−50`, đang mở |

- Hộp 1000 ml nhưng sổ ghi ra **1050** (1000 tiêu hao + 50 hao hụt) → giá vốn / hao hụt bị tính dư đúng bằng lượng bán trước khi mở tem.
- Dòng `WASTE` đó là «báo hết còn dư» — đúng loại sự kiện Engine 2 dùng để **quy trách nhiệm cho nhóm pha chế và nâng mức kiểm soát** món đó. Lõi quyết định của Engine 2 (`unit_engine2_v1.js`) không đọc Sổ lệch.
- Cùng một lượng hàng nằm ở HAI nơi: Sổ lệch (chờ quản lý xử lý tay) và hao hụt (đã quy người).
- Đối chứng (tình huống B, quét mở trước): không hao hụt, không Sổ lệch. Trường hợp nợ FIFO (tình huống C) kho xử lý đúng — chỉ riêng «chưa có tem nào mở» là hở.
- Cân cuối ca cũng vậy: món có dòng Sổ lệch trong ngày được đưa vào danh sách cân (cơ chế sẵn có), nhưng phần hụt cân ra vẫn ghi `WASTE`, không đối trừ với dòng Sổ lệch.

### L2 — RT lỗi đúng lúc bán → y như L1, và bị ghi nhầm lý do

**Tái hiện** (`tru_kho_luc_ban.js`, tình huống 2, 3): tem đang mở bình thường nhưng lệnh trừ tem (RT) lỗi một lần (rớt kết nối).

- Bill 1 (50): tem **không trừ**, tồn sổ không trừ; sổ ghi tiêu hao «ngoài tem» + Sổ lệch loại `no_open_tem` — nhãn «Nhân viên chưa quét mở tem» dù tem ĐANG mở → quản lý đi tìm sai nguyên nhân.
- Bill 2 bán bình thường → tem còn 150 trong khi thực tế còn 100. 50 ml này sẽ thành hao hụt ở lần cân / báo hết kế tiếp (chuỗi L1).
- Lệnh trừ tem **không tự thử lại** (mở tem có thử 3 lần, trừ tem lúc bán thì không).
- Trong lần thử không thấy cảnh báo `allocate_rtdb_error` được ghi dù mã có hàm ghi — chưa rõ do môi trường thử hay do mã; cần kiểm thêm trước khi kết luận.

### L3 — App tắt giữa lúc trừ kho của bill → không ai chạy lại, không có dấu vết

Trừ kho của bill chính chạy nền sau khi bill đã lưu, chỉ theo dõi trong bộ nhớ (`trackConsumptionPOS`). Thêm topping thì có việc bền trên bill (`consumeJobs`), bill chính thì không.

- **Tắt sau khi tem đã trừ, trước khi ghi sổ** (tình huống 5): tem đúng, nhưng **mất dòng tiêu hao** của bill đó (giá vốn thiếu), không cảnh báo; nếu sau này xoá bill thì không có gì để hoàn → tem thiếu.
- **Tắt trước khi tem kịp trừ**: không tem, không sổ, không Sổ lệch — lượng đó chỉ lộ ra ở lần cân / báo hết dưới dạng hao hụt (chuỗi L1). Không có bước nào (mở app, kết ca, quản lý) đối chiếu «bill đã lưu nhưng chưa có vết trừ kho».
- Cửa sổ hở ngắn (vài giây sau khi bấm thanh toán) nên hiếm, nhưng khi xảy ra thì hoàn toàn im lặng.

## 3. Đề xuất (chờ chủ dự án chọn — chưa làm)

| # | Việc | Đụng tới | Ghi chú |
|---|---|---|---|
| Đ1 | **Engine 2 không quy trách nhiệm cho phần hao hụt đã có Sổ lệch giải thích**: khi xét «báo hết còn dư» / hụt cân, trừ đi các dòng Sổ lệch `no_open_tem` còn mở của cùng món phát sinh trong vòng đời tem; phần còn lại mới phân bổ | `unit_engine2_store_v5.js` (chưa deploy → sửa tại chỗ) | Nhanh, không đụng kho. Chưa sửa được việc sổ tính tiền hai lần |
| Đ2 | **Mở tem gánh luôn phần «bán khi chưa có tem mở»** (như đang gánh nợ FIFO): lúc quét mở, trừ các dòng Sổ lệch `no_open_tem` còn mở của món vào tem mới và đóng các dòng đó | engine kho v22 + POS | Sửa tận gốc L1 (hết hao hụt giả, hết tính hai lần). Đổi hành vi kho → cần duyệt |
| Đ3 | Trừ tem lúc bán **thử lại** khi RT lỗi; vẫn lỗi thì ghi Sổ lệch đúng loại «lỗi kết nối» | engine kho v22 | Giảm L2 từ gốc |
| Đ4 | Bill chính có **việc trừ kho bền** như topping (`consumeJobs`), mở app / kết ca thì chạy nốt việc dở | POS (`pos_thanh_toan`) | Đóng L3 |

Thứ tự gợi ý: Đ1 (làm được ngay cùng gói v5) → Đ2 + Đ3 (một bản kho v22) → Đ4.

## 4. Chưa rà

Nấu mẻ BTP (cân NL trước / sau mẻ, khoá NL), bán BTP khi lô âm (`pendingShortage`), nhận hàng, chuyển kho / refill theo vị trí, huỷ đồ uống. Các đường này có nhiều cơ chế riêng; cần một lượt rà riêng theo cùng cách.
