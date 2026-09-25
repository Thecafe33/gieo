# FIFO CHAIN TRACE — CATALOG / MENU / PROMOTION — V1

> Đã biết trước: UI sửa Menu/Khuyến mãi ở POS đã chết, thật sự sửa ở QUANLY; đường ĐỌC menu + auto-promotion tại quầy thu ngân của POS vẫn sống. Trace này đi sâu vào cấu trúc dữ liệu catalog và bộ máy khuyến mãi tự động, KHÔNG lặp lại phần costing/RecipeVersion đã trace ở Sales/COGS.

---

# SƠ ĐỒ CHUỖI THẬT (khảo sát legacy)

```text
[1] Cấu trúc Menu item (posgieo.html:8717-8726, 23773-23798)
      Field tối giản: name, type(=category, free text), color, priceM,
      priceL. KHÔNG có field ảnh, KHÔNG có field sold-out, KHÔNG có
      field recipeId, KHÔNG có danh sách topping riêng theo món (topping
      là 1 list phẳng dùng chung toàn menu, gắn tự do lúc order).
      → KHÔNG ĐỨT về mặt cấu trúc — đơn giản có chủ đích, không phải
      thiếu sót, phù hợp quán 1 loại hình đồ uống.

[2] Category (posgieo.html:19335, 8032)
      GAP — chưa tồn tại như 1 entity riêng: category chỉ là
      [...new Set(menu.map(m=>m.type))] tính lại mỗi lần render, KHÔNG
      có thứ tự hiển thị lưu trữ, KHÔNG có collection category riêng.

[3] Sold-out / hết món (kiểm tra toàn bộ posgieo.html + quanlygieo.html)
      🔴 ĐỨT CHUỖI TẠI ĐÂY — nặng: KHÔNG có field/flag "hết hàng" nào
      trên menu item. renderMenu() render MỌI món luôn bấm được, không
      điều kiện. Kho FIFO và Catalog HOÀN TOÀN tách rời trước khi bán —
      trừ kho chỉ chạy SAU khi xác nhận bán (applyToppingConsumption,
      dòng 17910-17925), không có bước kiểm tra tồn trước khi cho phép
      bấm món. Nhân viên có thể bán vô hạn 1 món dù nguyên liệu = 0,
      kho sẽ chỉ âm dần, không ai chặn ở điểm bán.

[4] togoSettings auto-promotion tại quầy (posgieo.html:8474-8511)
      checkTogoBeforeCheckout(): CHỈ áp dụng khi isToGo=true, CHỈ dựa
      trên SỐ LƯỢNG ly trong giỏ (2 dạng cố định: mua X tặng Y theo bội
      số; đạt ngưỡng số ly → giảm %). Tham số (buyQty/freeQty/pct/
      minQty/maxAmt) cấu hình được qua UI → lưu togoSettings_gieogieo,
      nhưng LOGIC ĐIỀU KIỆN (đúng 2 dạng này) hard-code trong hàm, chủ
      quán không thể tự tạo 1 dạng khuyến mãi thứ 3 qua đường này.
      → KHÔNG ĐỨT cho 2 dạng có sẵn — dữ liệu tham số tách khỏi code
      đúng mức cần thiết, chỉ không tổng quát hoá được điều kiện.

[5] Bộ máy campaign linh hoạt hơn — CHỈ CỐ VẤN, KHÔNG THỰC THI
      🔴 ĐỨT CHUỖI TẠI ĐÂY — quan trọng: assistConfig.campaigns
      (quanlygieo.html:22442-22485) cho phép cấu hình điều kiện phong
      phú (qty_total/qty_size/qty_item/qty_type/amount, khoảng ngày,
      ngày trong tuần, togo/dine-in) — NHƯNG assistProviderCampaigns()
      (posgieo.html:25497-25561) chỉ đẩy ra 1 gợi ý hiển thị cho nhân
      viên, KHÔNG BAO GIỜ tự động trừ tiền/thêm quà vào giỏ. UI editor
      tự ghi chú rõ điều này (quanlygieo.html:22353) — nhưng đây vẫn là
      1 điểm dễ hiểu lầm: chủ quán cấu hình 1 "chiến dịch" tưởng sẽ tự
      chạy như 2 chương trình hằng ngày, thực ra chỉ là gợi ý cho nhân
      viên tự áp dụng bằng tay.

[6] Giảm giá thủ công (posgieo.html:20744-20823, 26439-26443)
      Đồng giá (DG): đã XOÁ HẲN code (không phải ẩn) — xác nhận đúng
      quyết định đã ghi trong DEAD-FEATURE-PRUNING-V1.md.
      Mã giảm giá (discount code): code CÒN SỐNG ĐẦY ĐỦ (item_free/
      item_upsize/item/percent/order — 5 kiểu), nhưng ô nhập bị ẩn
      display:none, không ai chạm tới được trong UI hiện tại.
      → Khớp đúng phân loại "CẦN CẨN THẬN" đã ghi trong
      DEAD-FEATURE-PRUNING-V1.md, không phải phát hiện mới, nhưng giờ
      có đủ chi tiết 5 loại giảm giá cụ thể để quyết định giữ/bỏ khi
      dựng hệ thống mới.

[7] Chồng khuyến mãi (posgieo.html:8491-8507, 20762-20763, 8710-8711)
      Trong togoSettings: quà tặng và giảm % loại trừ nhau theo THỨ TỰ
      CODE (quà tặng luôn được ưu tiên check trước), không phải field
      priority tường minh.
      Discount code tự chặn chồng với chính nó và với voucher khách
      hàng (_appliedDiscountId/_giftVoucherKey) — nhưng KHÔNG có check
      chặn discount code chồng với togoSettings auto-discount (2 biến
      độc lập, không đối chiếu nhau). Hiện vô hại vì discount code đang
      ẩn UI, nhưng là 1 lỗ hổng logic thật nếu bật lại.

[8] Giá tại thời điểm bán (posgieo.html:20028-20032, 21858, 21870-21907)
      ĐÂY LÀ PHẦN LÀM ĐÚNG, không thuộc nhóm lỗi versioning đã thấy 5+
      lần: giá được snapshot vào cart NGAY lúc thêm món, rồi toàn bộ
      itemsArray (kèm price) được sao y nguyên vào order đã lưu. Báo
      cáo đọc thẳng o.itemsArray[].price, KHÔNG join lại giá menu hiện
      tại. → KHÔNG ĐỨT — sửa giá menu sau này không làm trôi số liệu
      bill/báo cáo lịch sử. Đây là mẫu ĐÚNG cần giữ, đối lập hẳn với
      Recipe/Packaging/BTP yield/Payroll/KPI-target đã sai kiểu này.

[9] Liên kết Recipe (posgieo.html:17680, 17910-17912)
      GAP kiến trúc — không phải field liên kết tường minh, mà LÀ KHỚP
      KEY NGẦM: recipe key = 'togo:' + menuItemId. Không có thao tác
      "đổi món sang trỏ recipe khác" như 1 khái niệm độc lập — vì
      không hề có con trỏ để đổi, chỉ có key trùng khớp.

[10] Xoá/đổi tên món — rủi ro mồ côi dữ liệu (posgieo.html:23800-23810)
      Xoá món là .remove() cứng, KHÔNG soft-delete, KHÔNG cascade.
      Bill lịch sử AN TOÀN (nhờ mục 8 snapshot đúng), nhưng:
      🔴 ĐỨT CHUỖI TẠI ĐÂY: xoá-rồi-tạo-lại 1 món (cách duy nhất để
      "đổi tên" nếu không sửa tại chỗ) sinh Firebase key MỚI → recipe
      cũ (khoá theo key cũ) MỒ CÔI VĨNH VIỄN, món "mới" báo
      'chưa có định mức (recipe)' cho tới khi ai đó phát hiện và tạo
      lại recipe theo key mới. Tham chiếu itemId trong togoSettings
      giftMenu/freeTopping và campaign conditions cũng KHÔNG được dọn
      tự động khi xoá món — chỉ có UI campaign editor tự vá bằng nhãn
      "(món đã xoá)", không phải dọn dữ liệu thật.

[11] Migration UI Menu/Promotion POS→QUANLY (posgieo.html:982,987,2311;
     quanlygieo.html:1439-1441,1593-1595)
      Xác nhận bằng dòng code cụ thể (không chỉ suy luận): sidebar POS
      ẩn hẳn 2 mục "Quản lý Menu" và "Khuyến mãi", comment ghi rõ lý do
      "đã bê nguyên giao diện sang app Quản lý...sửa giá/menu giờ là
      việc của chủ quán". Phía quanlygieo.html có comment đối xứng
      "[BÊ TỪ POS]". → KHÔNG ĐỨT, khớp hoàn toàn phân quyền đã định.
```

---

# LUỒNG CHUẨN CHO HỆ THỐNG MỚI (không phải fix, mà thiết kế lại đúng ngay từ đầu)

1. **Recipe link phải là con trỏ tường minh (`recipeVersionId` trên MenuItem), không phải khớp key ngầm.** Đây là điểm khác biệt so với legacy quan trọng nhất của domain này — xoá bỏ hẳn rủi ro mồ côi dữ liệu ở mục 9/10. Đổi tên món không còn cần xoá-tạo-lại (chỉ sửa field `name`), nên vấn đề mồ côi biến mất từ gốc thiết kế, không cần cơ chế dọn dẹp bù đắp.
2. **Sold-out phải là 1 trạng thái dẫn xuất từ FIFO Core, không phải field tay.** `MenuItem.isAvailable` nên được tính từ `currentStock` của các nguyên liệu trong recipe đang hiệu lực (qua read-layer), tự động cập nhật khi FIFO Engine ghi nhận hết hàng — đúng nguyên tắc "1 nguồn sự thật" đã áp cho mọi domain khác, đóng đúng gap nghiêm trọng nhất tìm thấy ở mục 3.
3. **Category là entity thật có thứ tự hiển thị lưu trữ**, không phải suy ra từ `Set` — nhỏ nhưng cần thiết để menu ổn định thứ tự giữa các lần tải.
4. **2 tầng khuyến mãi (auto-execute vs advisory-only) phải được đánh dấu RÕ RÀNG trên UI cấu hình**, không lặp lại sự mơ hồ của legacy (chủ quán tạo "campaign" tưởng tự chạy, thực ra chỉ gợi ý). Nếu giữ cả 2 tầng ở hệ thống mới: tầng auto-execute dùng 1 rule engine TỔNG QUÁT (không hard-code 2 dạng như legacy) để campaign có thể tự thực thi thật nếu muốn, không buộc phải mãi advisory-only.
5. **Chồng khuyến mãi phải có quy tắc ưu tiên tường minh (field `priority`/`exclusivity`), không phải ngầm định theo thứ tự code.** Mọi promotion (togoSettings-style lẫn discount-code-style lẫn voucher khách hàng) phải đi qua CÙNG 1 bộ kiểm tra loại trừ, không phải mỗi loại tự kiểm tra rời rạc như legacy (mục 7).
6. **Giữ nguyên mẫu snapshot-giá-vào-bill (mục 8) làm chuẩn bắt buộc** cho mọi dữ liệu được ghi vào 1 giao dịch đã hoàn tất — đây là ví dụ ĐÚNG hiếm hoi của toàn bộ audit về "không join sống vào dữ liệu hiện tại cho lịch sử", nên dùng làm tài liệu tham chiếu khi giải thích cho các domain khác (Recipe/Payroll/KPI-target) tại sao chúng cần sửa theo hướng này.
7. **Discount-code (5 kiểu) là chỗ nối sẵn, không bắt buộc bật lại ngay** — giữ nguyên thiết kế nghiệp vụ 5 loại đã có, quyết định bật/tắt là quyết định vận hành của chủ quán, không phải quyết định kiến trúc.
