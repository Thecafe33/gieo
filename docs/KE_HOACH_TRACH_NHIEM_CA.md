# Kế hoạch: tự động quy trách nhiệm hao hụt/lệch theo ca (bản v3, CHƯA làm)

Mục tiêu: hệ thống tự biết ai làm, nguyên nhân, vì sao; tự chốt; chủ nhận thông báo và giữ vài nút sửa phòng khi nhân viên nhập sai.
Nguyên tắc cứng: **mọi phần quy cho một người phải có cơ sở dữ liệu; không đủ cơ sở thì để "chưa quy", không đổ đại. Bán hàng luôn được ưu tiên: không có bước nào chặn bán.**

## 0. Hiện trạng (đã đọc code)
- Có sẵn: `employee_shifts_gieogieo` (vào/ra ca có giờ, tối đa 2 lần/ngày, có snapshot `payTerms`), `employees_gieogieo`, mốc cân/đếm có giờ và người, `usageEvents` trên mẻ/tem (BTP chỉ từ 19/9), `responsibility` + `responsibilityHistory` trên sổ NL, cơ chế cân lại `prepCountRecountIds`, báo cáo tháng `thangKetTrachNhiemNL`.
- **Cân mù đã có**: màn đếm BTP không hiện số sổ và không có đường gõ tay, số chỉ đến từ cân (`renderPrepCountCard`, `countMode:'blind'`). Mọi bước mới phải giữ mù.
- Thiếu: lệch đếm BTP cuối ca chỉ gắn 1 người và không vào báo cáo trách nhiệm; chưa có chức năng nhân viên; chưa chia theo ca; chưa tách lỗi định mức/lỗi nhập/lỗi dùng; check-in chưa kích hoạt kiểm tra lại số nghi lệch.
- BTP hiện chỉ đếm lúc kết ca. Cân lại lúc check-in là luồng MỚI.

## 1. Chức năng nhân viên (chủ quyết định)
- Hồ sơ nhân viên có `roles` **cố định**: pha chế, order (tích nhiều được). Chủ sửa ở hồ sơ.
- Lúc check-in, bản sao `roles` hiện hành được chụp vào `employee_shifts` (chỉ để lịch sử không đổi khi sửa hồ sơ về sau, không phải để nhân viên chọn).
- **Chỉ người có chức năng "pha chế" chịu hao hụt định lượng** trong khoảng thời gian họ có mặt. Order không chịu lệch định lượng.
- Ca không có ai là pha chế: dự phòng = tất cả người trong ca, độ tin cậy "vừa", ghi rõ lý do.
- Danh sách chọn người ở mọi nút chỉnh = toàn bộ nhân viên đang hoạt động của cửa hàng.

## 2. Ghi nhận và phân rã một vụ lệch
- **Ghi và quy mọi lệch**, kể cả 1%. Không có dung sai để bỏ qua. Chỉ bỏ phần dưới 1 đơn vị đo nhỏ nhất của cân (làm tròn). Thông báo chủ là việc khác (mục 4).
- Phân rã từ chắc đến yếu:
  1. **Lỗi nhập số** (mục 3): thuộc người cân sai.
  2. **Hao hụt đã khai**: thuộc người khai (đã có).
  3. **Lỗi định mức**: lệch cùng chiều ≥5 khoảng đo liên tiếp → phần bằng độ lệch nền thuộc công thức. **Trước khi kết luận, so lệch giữa các ca/người**: nếu lệch dồn vào một ca hoặc một người thì là thói quen cá nhân, không phải công thức. Khi công thức đổi, đặt lại nền từ mốc thời gian đổi.
  4. **Phần dư chia theo tiếp xúc**: trọng số mỗi ca = Σ lượng theo sổ ca đó dùng trong khoảng đo (ví dụ 10 ly : 2 ly → 10/12 : 2/12). Trong ca chia cho người pha chế có mặt theo tỉ lệ thời gian. Mẻ nấu sai khác định mức thì gán người nấu.
- Giờ tính ca lấy theo **giờ tạo bill**, không dùng `at` của `usageEvents` (với bill bổ sung sau đóng ngày, `at` là giờ lúc bổ sung, sai ca). Bill không rõ giờ hoặc khoản không có bill → độ tin cậy Yếu.
- Ca mở quá lâu mà quên check-out: cắt theo giờ đóng ngày.
- **Độ tin cậy**: Mạnh (người nhập/khai trực tiếp, khoảng đo sạch), Vừa (chia theo tiếp xúc), Yếu (thiếu check-in/`usageEvents`, khoảng đo lẫn thao tác khác) → "chưa quy".
- Báo cáo **tách hai khoản**: "thất thoát thật" và "sai số liệu" (ví dụ nhập 185 g thay 20 g làm sổ trừ oan 165 g nhưng NL chưa mất thật).

## 3. Cân lại một lần và xác minh khi người khác check-in
1. A cân/đếm. Nếu lệch ≥ ngưỡng cân lại (mặc định ≥50% lượng dùng và ≥150 g) → yêu cầu A **cân lại một lần**. Lời nhắc chỉ nói "cân lại", **không nêu số, hướng hay mức lệch** (giữ cân mù).
2. A cân lại ra số khác → dùng số mới. Vẫn số cũ → **chấp nhận luôn**, đánh dấu "nghi lệch, chờ xác minh", người cân là A.
3. Khi **người khác** check-in, mục "nghi lệch" hiện thành **việc chờ** trong danh sách việc của POS. **Không chặn check-in, không chặn bán, không khoá NL/BTP.** B làm khi rảnh. B phải khác A; chưa có người khác thì chờ.
4. **Sổ đúng khi cân lúc đang bán**: lúc B đọc cân, hệ thống chụp mốc `{sổ, các lần bán}`; số so sánh = sổ tại giờ cân, đã trừ mọi lần bán đã ghi từ lúc A chốt. Nhờ đó B cân đúng lượng thực tế còn lại dù đã bán xen giữa. Ghi `qty − drift` theo cách đã dùng cho đối chiếu NL, nhưng **không có khoá**.
5. So số B với sổ tại giờ cân:
   - Lệch dưới ngưỡng cân lại và khoảng giữa **sạch** (chỉ có bán đã ghi) → **toàn bộ phần lệch quy cho A**, độ tin cậy Mạnh. Khoảng giữa không sạch → vẫn ghi, độ tin cậy Vừa, chia theo mục 2.
   - Lệch ≥ ngưỡng cân lại → **tranh chấp**: số của B không tự quyết. Hệ thống báo chủ; **chủ chọn quy cho A, cho B, hoặc cả hai (chia %), hoặc "định mức/miễn"**. Chưa chọn thì khoản đó ở "chờ quy", không cộng vào ai. Số tồn lấy theo số B cân (số thực tế mới nhất); chủ có nút sửa tồn nếu B sai.
   - B cân trùng số A → coi là thực tế, chuyển sang mục 2.
6. Không ai xác minh trong 48 giờ → tự đóng, chuyển "chưa quy". BTP đã bỏ/hết hạn không còn để cân → "không xác minh được", chuyển "chưa quy".
7. Tuỳ chọn: thỉnh thoảng yêu cầu cân lại cả mục KHÔNG lệch, để lời nhắc cân lại tự nó không báo hiệu có lệch.

## 4. Thông báo và nút của chủ
- Mọi vụ đều được ghi và quy (mục 2). **Chỉ báo chủ khi**: lệch vượt 100% lượng dùng theo sổ (kèm tối thiểu 50 g), hoặc có **tranh chấp** cần chọn người.
- Báo một dòng/ngày/BTP, loại `duty_case` trong `alerts_gieogieo`: ai, vì sao, bao nhiêu, bằng chứng.
- **Tự chốt**: chủ không phải bấm gì, trừ vụ tranh chấp. Hồ sơ vụ lệch (`responsibility_cases_gieogieo`) lưu khoảng đo, phân rã, người + % + giá trị, bằng chứng (mã bill, ca, mẻ, mốc), độ tin cậy.
- Nút chủ (chỉ phòng nhân viên nhập sai hoặc muốn đổi): sửa tồn BTP/NL, chia lại % cho một hoặc nhiều người (bắt lý do, ghi `responsibilityHistory`), đánh dấu "định mức / lỗi nhập / miễn".
- Nhân viên xem được phần của chính mình và **phản đối kèm lý do**; phản đối đưa vụ về trạng thái chờ chủ xem.
- Hệ thống **không tự trừ lương**. Nút thưởng/phạt chỉ đề xuất từ vụ độ tin cậy Mạnh. Nên đối chiếu nội quy và quy định pháp luật về khấu trừ lương trước khi dùng cho tiền.

## 5. Báo cáo tháng
- Theo nhân viên: phần chịu theo loại (khai, nhập sai, chia theo ca) + độ tin cậy + bằng chứng.
- Tách riêng không tính vào ai: "lỗi định mức" (kèm hệ số), "chưa quy", "chờ quy".
- `thangKetTrachNhiemNL` đọc thêm `ADJUSTMENT fromPrepCount`.
- Rà lại luật mỗi tháng bằng bộ vụ có đáp án.

## 6. Các bước làm (mỗi bước có test, chủ duyệt rồi mới sang bước sau)
- **B1 (Quản lý, không đụng engine)**: báo cáo tháng đọc lệch đếm BTP; file xuất thêm người đếm/cân, giờ vào/ra ca.
- **B2 (cấu hình)**: thêm `roles` vào hồ sơ nhân viên (Quản lý), chụp vào `employee_shifts` lúc check-in (POS).
- **B3 (module tính thuần)**: `attributeInterval(...)` theo mục 2, chạy thử trên file xuất 18/9–1/10 và bộ vụ có đáp án (Cốt trà lài 22/9…), so với phán đoán của chủ trước khi nối vào app.
- **B4 (engine v4 + POS)**: cân lại một lần, "nghi lệch", việc chờ khi check-in, chụp mốc sổ lúc cân (không khoá), ghi hồ sơ vụ lệch.
- **B5 (Quản lý)**: thông báo `duty_case`, màn vụ lệch + nút chủ + phản đối, báo cáo tháng.
- **B6**: đo lại sau 2 tuần: tỉ lệ "chưa quy", vụ bị đổi/phản đối, số lần cân lại.

## 7. Mặc định đang dùng (đổi thì nói)
1. Ngưỡng bắt cân lại: ≥50% lượng dùng và ≥150 g (đo trên dữ liệu 22/9–1/10: 16% số lần đếm, khoảng 1–2 BTP/ngày).
2. Ngưỡng báo chủ: >100% lượng dùng và ≥50 g (12% số lần đếm, khoảng 1 vụ/ngày).
3. Người xác minh phải khác người cân đầu.
4. "Cửa hàng đó": `employees_gieogieo` chưa có `storeId`; hiện coi một cửa hàng, lọc theo `storeId` khi làm đa cửa hàng.

## 8. Giới hạn dữ liệu (nói thẳng)
- `usageEvents` BTP chỉ có từ 19/9; trước đó chỉ chia được theo định mức/chưa quy.
- Hệ thống biết ai là pha chế đang có mặt, không biết ai pha ly nào. Kết quả là phân bổ theo tiếp xúc có độ tin cậy, không phải bằng chứng từng ly.
- Người quên check-in không nằm trong ca → không bị quy; vụ rơi vào "chưa quy".
- Hao tự nhiên của BTP qua đêm (thạch hút nước, bay hơi) không được trừ riêng (chủ xác nhận nhân viên đã được tập huấn); phần này, nếu có, sẽ rơi vào lệch của người cân trước.
