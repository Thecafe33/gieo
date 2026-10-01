# Kế hoạch: tự động quy trách nhiệm hao hụt/lệch theo ca (bản v2, CHƯA làm)

Mục tiêu: hệ thống tự biết ai làm, nguyên nhân, vì sao; tự chốt; chủ chỉ nhận thông báo và giữ vài nút sửa phòng khi nhân viên nhập sai.
Nguyên tắc cứng: **mọi phần quy cho một người phải có cơ sở dữ liệu kèm theo; không đủ cơ sở thì để "chưa quy", không đổ đại.**

## 0. Hiện trạng (đã đọc code)
- Có sẵn: `employee_shifts_gieogieo` (vào/ra ca có giờ, mỗi người tối đa 2 lần/ngày, có snapshot `payTerms`), `employees_gieogieo` (hồ sơ nhân viên), mốc cân/đếm có giờ và người, `usageEvents` trên mẻ/tem (bill nào, lượng, giờ; BTP chỉ từ 19/9), `responsibility` + `responsibilityHistory` trên sổ NL, cơ chế cân lại `prepCountRecountIds`, báo cáo tháng `thangKetTrachNhiemNL`.
- Thiếu: lệch đếm BTP cuối ca chỉ gắn 1 người đếm và không vào báo cáo trách nhiệm; không có chức năng nhân viên; không chia theo ca; không phân biệt lỗi định mức/lỗi nhập/lỗi dùng; check-in không kích hoạt kiểm tra lại số nghi lệch.
- Lưu ý: BTP chỉ đếm lúc kết ca; cân lại lúc check-in là luồng MỚI.

## 1. Chức năng nhân viên (quyết định của chủ)
- Hồ sơ nhân viên thêm `roles`: **pha chế**, **order** (tích nhiều được). Chụp snapshot vào `employee_shifts` lúc check-in (như `payTerms`) để lịch sử không đổi khi sửa hồ sơ.
- **Chỉ người có chức năng "pha chế" chịu hao hụt định lượng** trong khoảng thời gian họ có mặt. "Order" không chịu lệch định lượng.
- Ca không có ai là pha chế: dự phòng = tất cả người trong ca, gắn độ tin cậy "vừa" và ghi rõ lý do.

## 2. Phân rã một vụ lệch (từ chắc đến yếu)
1. **Lỗi nhập số** (xem mục 3): thuộc người cân/đếm sai, truy qua mốc.
2. **Hao hụt đã khai**: thuộc người khai (đã có).
3. **Lỗi định mức**: lệch cùng chiều ≥5 khoảng đo liên tiếp → phần bằng độ lệch nền thuộc công thức, không ai chịu, hiện hệ số đề xuất.
4. **Phần dư còn lại** chia theo tiếp xúc:
   - Trọng số mỗi ca = Σ lượng BTP/NL theo sổ mà ca đó dùng trong khoảng đo (quyết định 1). Ví dụ 10 ly : 2 ly → 10/12 : 2/12.
   - Trong ca: chia đều cho người pha chế có mặt, nhân tỉ lệ thời gian có mặt. Chủ chọn lại được từ **danh sách toàn bộ nhân viên của cửa hàng** (quyết định 5).
   - Mẻ nấu sai khác định mức thì gán người nấu.
5. **Độ tin cậy**: Mạnh (người nhập/khai trực tiếp, khoảng đo sạch), Vừa (chia theo tiếp xúc), Yếu (thiếu check-in, thiếu `usageEvents`, khoảng đo lẫn nhiều thao tác khác). **Yếu → quỹ "chưa quy"**, không cộng vào ai.

## 3. Luồng "cân lại một lần" và xác minh khi người khác check-in (quyết định 3)
1. Nhân viên A cân/đếm. Nếu lệch **≥50% lượng dùng theo sổ và ≥150 g** (đề xuất, đo trên dữ liệu 22/9–1/10: khoảng 16% số lần đếm, tức 1–2 BTP/ngày; xem mục 7) → hệ thống yêu cầu **cân lại đúng 1 lần**.
2. Cân lại ra số khác (về gần sổ) → dùng số mới, không có vụ.
3. Cân lại vẫn ra số cũ → **chấp nhận luôn**, đánh dấu "nghi lệch, chờ xác minh", ghi người cân là A.
4. Khi **một nhân viên khác** check-in (kể cả sáng hôm sau): hệ thống yêu cầu B cân lại đúng các mục "nghi lệch". B phải khác A; nếu chỉ có A thì chờ người khác.
5. So số B cân với **sổ lúc đó** (số A đã chốt trừ các lần bán đã ghi từ lúc A chốt đến lúc B cân). Phần bán xen giữa đã nằm trong sổ nên B cân đúng lượng **thực tế**.
   - Khoảng giữa **sạch** (chỉ có bán đã ghi, không nấu/đổ/điều chỉnh khác) và B lệch so với sổ → **phần lệch quy cho A** (độ tin cậy Mạnh), đúng như chủ mô tả.
   - Khoảng giữa không sạch (có nấu thêm, đổ, dùng không bill) → vẫn ghi nhưng độ tin cậy Vừa, chia theo mục 2.
   - B cân trùng số của A → coi là thực tế; chuyển sang mục 2 (lệch thật, chia theo ca).
6. Không ai xác minh trong 48 giờ → tự đóng, chuyển "chưa quy".
7. Kỹ thuật: cân lúc quán đang mở có bán xen giữa nên cần **chụp mốc sổ lúc cân** (giống cơ chế `{book, held}` đã làm cho đối chiếu NL) rồi ghi `qty − drift`. Phải làm ở engine v4 cho đường đếm BTP; hiện đường đếm cuối ca giả định không còn bán.

## 4. Thông báo và nút của chủ (quyết định 3, 4)
- **Không báo** vụ lệch trong dung sai hay lệch mà luồng cân lại đã xử lý được.
- **Chỉ báo** khi lệch **vượt 100% lượng dùng theo sổ** của khoảng đo (đề xuất thêm ngưỡng tối thiểu 50 g để khỏi báo số nhỏ). Dữ liệu 22/9–1/10: 12/100 lần đếm vượt, khoảng 1 vụ mỗi ngày, gồm cả ca Cốt trà lài +763%.
- Báo một dòng/ngày/BTP loại `duty_case` trong `alerts_gieogieo`, nêu rõ: ai, vì sao, bao nhiêu, bằng chứng.
- **Tự chốt, không cần chủ bấm**. Hồ sơ vụ lệch (`responsibility_cases_gieogieo`) lưu: khoảng đo, phân rã, danh sách người + % + giá trị, bằng chứng (mã bill, ca, mẻ, mốc), độ tin cậy.
- Nút chủ (chỉ dùng khi nhân viên nhập sai hoặc muốn đổi): sửa tồn BTP/NL, chia lại % cho một hoặc nhiều người từ danh sách nhân viên (bắt lý do, ghi `responsibilityHistory`), đánh dấu "định mức/lỗi nhập/miễn".
- Hệ thống **không tự trừ lương**; phạt dùng nút thưởng/phạt đã có.

## 5. Báo cáo tháng
- Theo nhân viên: phần chịu theo loại (khai, nhập sai, chia theo ca) + độ tin cậy + bằng chứng bấm xem được.
- Tách riêng không tính vào ai: "lỗi định mức" (kèm hệ số) và "chưa quy".
- `thangKetTrachNhiemNL` đọc thêm `ADJUSTMENT fromPrepCount`.

## 6. Các bước làm (mỗi bước có test, chủ duyệt rồi mới sang bước sau)
- **B1 (Quản lý, không đụng engine)**: báo cáo tháng đọc lệch đếm BTP; file xuất thêm người đếm/cân từng dòng và các ca/giờ vào-ra.
- **B2 (cấu hình)**: thêm `roles` vào hồ sơ nhân viên (Quản lý), snapshot vào `employee_shifts` lúc check-in (POS).
- **B3 (module tính thuần)**: hàm `attributeInterval(...)` theo mục 2, chạy thử trên file xuất 18/9–1/10, so với phán đoán của chủ trước khi nối vào app.
- **B4 (engine v4 + POS)**: luồng cân lại một lần, "nghi lệch", xác minh khi check-in, chụp mốc sổ khi cân lúc đang bán, ghi hồ sơ vụ lệch.
- **B5 (Quản lý)**: thông báo `duty_case`, màn vụ lệch + nút chủ, báo cáo tháng.
- **B6**: đo lại sau 2 tuần: tỉ lệ "chưa quy", số vụ chủ phải đổi, số lần cân lại.

## 7. Điểm cần chủ xác nhận (có mặc định, không trả lời thì làm theo mặc định)
1. Ngưỡng bắt cân lại: **≥50% lượng dùng và ≥150 g** (mặc định). Hạ xuống 25%/100 g thì thành 32% lần đếm phải cân lại, nhân viên sẽ mệt.
2. Ngưỡng báo chủ: **>100% lượng dùng và ≥50 g** (mặc định).
3. Người xác minh phải khác người cân đầu (mặc định có).
4. Ca không có ai tích "pha chế": chia cho tất cả người trong ca, độ tin cậy "vừa" (mặc định).
5. "Cửa hàng đó": hiện `employees_gieogieo` chưa có `storeId`; hiện coi một cửa hàng. Khi làm đa cửa hàng sẽ lọc theo `storeId`.

## 8. Giới hạn dữ liệu (nói thẳng)
- `usageEvents` BTP chỉ có từ 19/9; trước đó chỉ chia được theo định mức/chưa quy.
- Hệ thống biết ai đang pha chế trong ca (theo tích chức năng), không biết ai pha ly nào. Kết quả là phân bổ theo tiếp xúc có độ tin cậy, không phải bằng chứng từng ly.
- Người quên check-in không có trong ca → không bị quy; vụ rơi vào "chưa quy".
- Lệch rất nhỏ không giải thích nổi là dung sai, không phải lỗi.
