# FIFO CHAIN TRACE — LOYALTY / CUSTOMER — V1

> Cùng chuẩn các chain-trace trước. `myGifts` (voucher cá nhân) đã quyết định CẮT khỏi hệ thống mới — không audit sâu lại ở đây, chỉ xác nhận nó tách biệt khỏi vòng tích điểm/tem lõi. Toàn bộ logic tích/đổi điểm chỉ tồn tại ở **posgieo.html** — quanlygieo.html không có quyền ghi vào collection `customers`, chỉ đọc để làm báo cáo phân khúc khách (đúng ranh giới EXECUTE ở POS / REVIEW ở QUANLY của permission contract).

---

# SƠ ĐỒ CHUỖI THẬT (khảo sát legacy)

```text
[1] Định danh khách (posgieo.html:1033, 20459-20469)
      Nhập SĐT tay → lookup fstore.collection('customers').doc(phone)
      → KHÔNG có scan/QR. Doc key = SĐT chuẩn hoá (84xxx → 0xxx).
      Tab "Khách hàng" ở POS đang ẩn ([HIDDEN-CHANGE] dòng 977) nhưng
      card lookup tại màn thanh toán vẫn sống bình thường.

[2] Tích điểm/tem (posgieo.html:21510-21611, 21628-21660)
      Dine-in: 5 điểm/100đ. To-go: 1 tem/ly (tối đa 2 tem/khách/ngày),
      6 tem → 1 free_drink_available.
      ĐỌC: total SAU discount/voucher (getFinalTotal()/spGrandTotal)
      → KHÔNG ĐỨT: điểm/tem tính đúng trên số tiền khách thực trả,
      không phải tổng gộp trước giảm giá.
      Idempotent qua marker loyalty_bill_effects_gieogieo/{billId}
      trong 1 Firestore transaction + hàng đợi retry tự phục hồi
      (localStorage + collection loyalty_pending_retry_gieogieo).
      → KHÔNG ĐỨT, đây là 1 trong những chuỗi được làm CẨN THẬN NHẤT
      trong toàn bộ legacy (ghi rõ "BUG#21/#29 FIX" trong comment).

[3] Đổi tem lấy ly miễn phí (posgieo.html:21295-21341, 8662-8668,
    21355-21399)
      Ly free được thêm vào cart y hệt món trả tiền (price:0) và ĐI QUA
      CHUNG pipeline applySalesConsumptionPOS/computeConsumptionForOrder
      → CÓ trừ FIFO/COGS như món thường.
      → KHÔNG ĐỨT: đúng nguyên tắc "quà tặng vẫn tiêu tốn kho thật".
      Trừ số dư tem CHỈ SAU khi thanh toán thành công, cũng qua
      transaction + marker stamp_free_redemptions_gieogieo/{billId}
      → idempotent.

[4] Sửa đơn/add-on sau bán (posgieo.html:22848-22919)
      submitAddon() cộng thêm amount vào order.total, GỌI LẠI
      applyAddonConsumptionPOS → FIFO/COGS tính lại đúng phần chênh.
      🔴 ĐỨT CHUỖI TẠI ĐÂY: không có bất kỳ lời gọi
      loyaltyAddPoints/loyaltyAddStamps nào trong toàn bộ
      _submitAddonImpl — khách mua thêm qua add-on nhưng KHÔNG được
      cộng thêm điểm/tem cho phần tiền đó, dù cùng 1 khách đã định danh
      từ đầu bill.

[5] Xoá/huỷ bill (posgieo.html:18295-18328, 23239-23289;
    quanlygieo.html:10633-10745)
      Cả 2 app đều CHỈ hoàn kho (FIFO/COGS), KHÔNG hoàn điểm/tem/voucher.
      🔴 ĐỨT CHUỖI TẠI ĐÂY — nhưng là GAP có ghi nhận công khai, không
      phải bị bỏ sót âm thầm: toast POS (dòng 23277-23279) và cảnh báo
      UI QUANLY (dòng 10608-10610) đều nói thẳng "điểm/tem/voucher
      không tự thu hồi — Quản lý xử lý tay". Vấn đề thật: quanlygieo.html
      KHÔNG CÓ MÀN HÌNH nào để "xử lý tay" — chỉ có 1 dòng ghi
      assist_profile không liên quan (dòng 22863), không có UI xem/sửa
      total_points/stamp_count của khách ở đâu cả.

[6] Tương tác khuyến mãi ↔ tích điểm (posgieo.html:21983-21992)
      Điểm tính trên total SAU giảm giá nên tự nhiên không bị double-dip.
      Riêng kênh tem có guard tường minh: bill có ly "mua X tặng Y"
      (isFree:true) → drinkCount=0, không tích tem cho bill đó — comment
      ghi rõ đây là fix cho bug đã từng cho tem cả ly tặng.
      → KHÔNG ĐỨT, xử lý đúng cho cả 2 kênh dù bằng 2 cơ chế khác nhau.

[7] Hạng thành viên / Tier
      GAP — chưa tồn tại: không có tier/VIP nào ảnh hưởng tốc độ tích
      điểm. Chỉ có 1 nhãn phân khúc thuần đọc-báo-cáo ở QUANLY
      (computeCustomerReport(), quanlygieo.html:9119-9134: loyal/back/
      new theo số lần ghé) — không hề nối vào công thức tích điểm.

[8] Lưu trữ số dư (posgieo.html:21532-21534, 21377-21381, 24794)
      total_points/stamp_count/free_drink_available là field CỘNG DỒN
      TRỰC TIẾP trên doc customers/{phone} — comment tự gọi đây là
      "single source of truth". KHÔNG có ledger lịch sử để tính lại.
      loyalty_bill_effects_gieogieo chỉ là marker chống trùng theo
      billId, không phải sổ cái đầy đủ để reconstruct số dư.
      🔴 ĐỨT CHUỖI TẠI ĐÂY — nặng hơn untrackedPendingDelta của FIFO:
      FIFO còn có stock_transactions_gieogieo để về nguyên tắc dựng lại
      currentStock từ đầu; loyalty THÌ KHÔNG — nếu số dư trôi (ghi lỗi,
      sửa tay Firestore, race hiếm ngoài phạm vi marker theo billId),
      không có cách nào tính lại đúng từ lịch sử, chỉ có thể sửa tay
      không kiểm chứng được.
```

---

# LUỒNG CHUẨN CHO HỆ THỐNG MỚI (không phải fix, mà thiết kế lại đúng ngay từ đầu)

1. **`LoyaltyLedger` là bắt buộc, không phải field cộng dồn.** Đây là phát hiện quan trọng nhất của chain này: legacy tích điểm rất kỷ luật (idempotent, transaction, retry queue) nhưng lưu trữ sai gốc — chỉ có số dư, không có sổ cái. Hệ thống mới: mỗi lần tích/đổi điểm là 1 dòng ledger bất biến (`operationId`, `referenceId` = billId, `delta`, `reason`, `balanceAfter`), số dư hiển thị = tổng ledger hoặc snapshot có thể tái tạo từ ledger — đúng nguyên tắc đã áp cho FIFO Unit/ledger, không phải trường hợp ngoại lệ.
2. **Addon PHẢI trigger lại Loyalty** — đúng nguyên tắc đã ghi trong `FEATURE-TREE-V1.md` dòng 91-92: AddonConsumption bắt buộc gọi lại tích điểm cho đúng phần chênh lệch, cùng lúc với FIFO/COGS, không tách rời như legacy.
3. **`ReverseTransaction` khi xoá bill PHẢI kèm side-effect Loyalty** dưới dạng domain event (`OrderVoided` → `LoyaltyReversalHandler`), đúng pattern đã thiết kế ở `FIFO-CHAIN-TRACE-REVERSAL-CORRECTION-V1.md` — không phải "khác để Quản lý xử lý tay" như legacy, vì tay ở đây chưa từng có màn hình để xử lý. Nếu chủ quán vẫn muốn giữ quyết định nghiệp vụ "không hoàn điểm khi huỷ bill", đó là 1 flag tường minh trong handler, không phải im lặng bỏ qua.
4. **Redemption (ly free) tiếp tục đi qua đúng 1 pipeline FIFO/COGS chung** — đây là phần legacy làm ĐÚNG, giữ nguyên nguyên tắc "quà tặng vẫn là tiêu thụ kho thật", không tạo nhánh riêng.
5. **Tier là chỗ nối sẵn, không bắt buộc dựng ngay**: công thức tích điểm nên nhận thêm 1 tham số `accrualMultiplier` (mặc định 1) đọc từ `Customer.tier`, để sau này bật tier lên không cần sửa lại `loyaltyAddPoints`/`loyaltyAddStamps` — đúng nguyên tắc "chừa vị trí nối vào" của cây tính năng, không phải xây tier ngay.
6. **Redemption gate (đổi tem) dùng `ReviseState`/idempotency chuẩn có sẵn**, không cần pattern mới — legacy đã đúng ở phần transaction+marker, chỉ cần đổi nơi lưu từ field sang ledger (mục 1).
