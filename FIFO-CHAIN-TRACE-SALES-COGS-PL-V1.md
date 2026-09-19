# FIFO CHAIN TRACE — BÁN HÀNG → COGS → P&L — V1

> Cùng chuẩn với `FIFO-CHAIN-TRACE-BTP-V1.md`. Phát hiện quan trọng nhất trong toàn bộ 4 chuỗi đã trace: **"COGS actual" không hề tồn tại** — hệ thống chỉ có 1 con số COGS (theoretical, từ recipe), nhưng đặt tên biến `cogsActual` gây hiểu nhầm nghiêm trọng.

---

# SƠ ĐỒ CHUỖI THẬT

```text
[1] Addon (thêm topping sau khi bill đã lưu, posgieo.html:22587-23047)
      Chỉ THÊM trong 10 phút, KHÔNG sửa/xoá món hay số lượng đã có (add-only).
      Không có tính năng "sửa 1 dòng bill đã lưu" nào khác trong toàn hệ thống.
      ghi orders_gieogieo.itemsArray/total/addons (submitAddon → _submitAddonImpl)
      → KHÔNG ĐỨT: COGS đọc lại đúng itemsArray hiện tại (aggregateOrders không cache
        riêng theo lần bán gốc); FIFO trừ kho theo diff, dùng unitEngineAllocateConsumption
      🔴 ĐỨT CHUỖI: loyaltyProcessAfterPay() KHÔNG được gọi trong submitAddon — khách
      trả thêm tiền qua addon KHÔNG được cộng thêm điểm/tem tương ứng

[2] Actual vs Target Revenue (aov/billsPerDay/ipt)
      → KHÔNG ĐỨT: computeKPIs() tính thật, so target thật ở nhiều tầng (alert ngày,
        dashboard tuần/tháng), tự scale đúng theo số ngày của khoảng xem bất kỳ

[3] COGS actual (FIFO thật) vs COGS theoretical (recipe) — CÂU HỎI CỐT LÕI
      🔴 GAP LỚN NHẤT: "COGS actual từ FIFO" KHÔNG TỒN TẠI. Unit/tem KHÔNG lưu giá
      vốn (createContainersForReceipt không có field cost/price nào; allocation trả
      về từ unitEngineAllocateConsumption cũng không có cost). costPerUnit chỉ có ở
      CẤP MÓN HÀNG, versioned theo NGÀY qua price-history — không theo TỪNG LÔ đã
      nhập. Biến `cogsActual` trong aggregateOrders() THỰC CHẤT là recipe-theoretical
      (định mức × giá lịch sử tại dateKey) — tên gọi gây hiểu nhầm, không phải giá
      vốn lô thật đã tiêu thụ qua FIFO.
      → Hệ quả: nếu công thức khai sai HOẶC giá nhập lô này đắt hơn giá lịch sử đang
      dùng (NCC tăng giá đột xuất giữa 2 lần cập nhật), hệ thống KHÔNG CÓ CƠ CHẾ NÀO
      phát hiện sai lệch — vì chỉ có 1 con số, không có gì để so sánh với nó.

[4] Điều chỉnh hồi tố sau chốt sổ tháng (book_closings_gieogieo)
      chotSoThang() → .set() snapshot, logAudit('close_book',...,{lai})
      moLaiThang() → .delete() snapshot, logAudit('reopen_book',...,{}) RỖNG
      🔴 ĐỨT CHUỖI (xác nhận sâu hơn lần audit trước): không chỉ mất snapshot — audit
      log của hành động MỞ LẠI cũng KHÔNG lưu số cũ (lai/doanhThu/giaVon...). Không có
      v1/v2, không có adjustment record tách biệt — số đã công bố cho chủ quán biến
      mất hoàn toàn khỏi hệ thống, không có cách khôi phục ngoài trí nhớ con người.

[5] P&L tách theo kênh bán (Tại quán/To Go/App)
      POS ghi isToGo/isShip/isAppSale/appFeePct trên mỗi bill — DỮ LIỆU CÓ SẴN.
      🔴 ĐỨT CHUỖI: appFeePct CHỈ ĐƯỢC GHI, KHÔNG BAO GIỜ ĐƯỢC ĐỌC (grep toàn bộ 2
      file: đúng 1 kết quả — chính dòng ghi). plChannelFeeForDay() HARD-CODE return 0,
      tự nhận trong comment: "CHƯA BÁN QUA SÀN... điều kiện tiên quyết: POS phải ghi
      order.channel... Chưa có dữ liệu đó." aggregateOrders() không có field channel/
      byChannel nào — P&L chỉ 1 con số tổng, dù dữ liệu tách kênh đã tồn tại ở tầng bill.

[6] cogsPct — có so sánh thật nhưng chỉ hiển thị thụ động
      → KHÔNG ĐỨT về mặt so sánh (statusLowerBetter(cogsPct thật, target)), nhưng
      GAP về automation: chỉ hiện khi người TỰ mở tab Sức khoẻ, không ghi vào
      alerts_gieogieo (kênh cảnh báo chủ động), không chặn hành động nào.
```

---

# TẠI SAO GAP §3 LÀ NGHIÊM TRỌNG NHẤT TRONG TOÀN BỘ AUDIT

Đối chiếu với `FIFO-CORE-ARCHITECTURE-V2.md` §1 (`Unit.costBasis`) — thiết kế mới ĐÃ quyết định gắn `costBasis` trực tiếp lên Unit tại thời điểm nhận hàng, chính là để **chặn đứt tận gốc gap này**. Audit này xác nhận: đây **không phải cải tiến tuỳ chọn** — nó lấp đúng 1 lỗ hổng chưa từng được giải quyết trong toàn bộ lịch sử hệ thống cũ. Nếu Phase 5 (`packages/recipe-cost-btp`) chỉ chuyển nguyên `computeUnitCogsFromRecipe` sang mà không xây riêng "COGS từ FIFO cost-basis thật", hệ thống mới sẽ **kế thừa nguyên lỗ hổng này**, dù kiến trúc data model đã đúng.

**Fix bắt buộc cụ thể:** `packages/read-layer/get-cogs.ts` phải trả về **2 con số tách biệt**: `cogsTheoretical` (recipe × cost lịch sử, như hiện tại) và `cogsActual` (tổng thật từ `costBasis` của các Unit đã FIFO-allocate cho đúng bill đó) — và `packages/reporting/variance-report.ts` phải hiển thị **variance giữa 2 con số này** làm chỉ số chính, đúng nguyên tắc "Actual vs Theoretical" đã đặt làm nguyên lý trung tâm ở Master Plan §10 nhưng CHƯA từng được lấp cho domain COGS trong toàn bộ audit tới giờ (BTP thiếu tương tự, nguyên liệu thô thì KHÔNG thiếu — có `thDoiChieu` — nhưng đó là actual-vs-theoretical cho SỐ LƯỢNG, không phải cho TIỀN/COGS).

---

# FIX KHÁC CẦN THIẾT KẾ MỚI GIẢI QUYẾT

1. **Addon phải trigger lại `LoyaltyPoints`** — command `RecordAddonConsumption` (packages/commands/sales) phải gọi `ApplyLoyalty` cho đúng phần chênh lệch, không bỏ sót như legacy.
2. **Correction hồi tố sau chốt sổ phải giữ v1** — đúng nguyên tắc đã thiết kế ở `packages/compaction/correction-rebuild.ts` (Snapshot v1 → correction → rebuild → v2, KHÔNG xoá v1). Đây chính là ví dụ cụ thể nhất chứng minh tại sao nguyên tắc đó bắt buộc phải có, không phải lý thuyết suông.
3. **P&L theo kênh bán phải là first-class field** — `Bill.channel` (dine-in/to-go/app-{tên sàn}) bắt buộc ngay từ thiết kế Bill model, `packages/reporting` phải aggregate theo `channel` để biết kênh nào lời/lỗ — dữ liệu đã sẵn sàng ở legacy (`isAppSale`, `appFeePct`), chỉ cần nối đúng đường ống, không cần thiết kế thuật toán mới.
4. **cogsPct/wasteTargetPct vượt ngưỡng nên có tuỳ chọn đẩy vào `alerts` domain** (chủ động) thay vì chỉ hiển thị thụ động khi người tự mở tab — nối vào `packages/alerts` đã thiết kế.
