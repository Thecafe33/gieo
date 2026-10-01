# Kế hoạch: tự động quy trách nhiệm hao hụt/lệch theo ca (bản nháp, CHƯA làm)

Mục tiêu: hệ thống tự biết ai chịu trách nhiệm cho lệch BTP/NL, tự báo chủ, chủ chỉ can thiệp khi cần.
Nguyên tắc cứng: **mọi phần quy cho một người phải có cơ sở dữ liệu kèm theo; không đủ cơ sở thì để "chưa quy", không đổ đại.**

## 0. Hiện trạng (đã đọc code)
- Có sẵn: `employee_shifts_gieogieo` (ai vào/ra ca, giờ), mốc cân/đếm có giờ và người (`daily_closings.prepCountLines`, `prep_batches.reconcileInputs`), `usageEvents` trên mẻ/tem (bill nào, bao nhiêu, lúc nào; BTP chỉ từ 19/9), `responsibility` + `responsibilityHistory` trên sổ NL, báo cáo tháng `thangKetTrachNhiemNL`, nút thưởng/phạt `thangKetAdjust`.
- Thiếu: (1) lệch đếm BTP cuối ca (`ADJUSTMENT fromPrepCount`) chỉ gắn 1 người đếm, không vào báo cáo trách nhiệm; (2) không có phép chia theo ca; (3) không tách lỗi định mức/lỗi nhập số khỏi lỗi người; (4) chưa có "hồ sơ vụ lệch" tự sinh + thông báo.
- Chưa xác minh: bill có ghi người bán/người pha hay không. Kế hoạch **không phụ thuộc** vào điều này (dùng người đang trong ca theo giờ).

## 1. Khái niệm
- **Khoảng đo**: từ mốc cân/đếm tin cậy trước đến mốc này, của một BTP/NL. Lệch chỉ có nghĩa trong một khoảng đo.
- **Tiếp xúc (exposure)**: mọi thứ trong khoảng đo có thể làm lệch: các bill dùng BTP đó (từ `usageEvents`, có giờ và lượng theo sổ), mẻ nấu thêm (PRODUCTION, có người nấu), các lần cân/đếm.
- **Ca**: ghép theo GIỜ với `employee_shifts` (không theo ngày): ai có mặt tại thời điểm từng bill/mẻ.

## 2. Thứ tự phân rã một vụ lệch (từ chắc đến yếu)
1. **Dung sai**: |lệch| nhỏ hơn max(5% lượng dùng, 30 g) → bỏ qua, không lập vụ.
2. **Hao hụt đã khai** (WASTE): thuộc người khai. Đã có.
3. **Lỗi nhập số**: số đếm/cân lệch cực đoan so với sổ và hôm sau tự về (hoặc dấu hiệu ×10) → thuộc **người nhập mốc đó**, truy qua mốc (đã có cơ chế cho trường hợp dư từ v3, mở rộng cho thiếu và cho đếm cuối ca).
4. **Lỗi định mức (hệ thống)**: lệch cùng chiều ≥5 khoảng đo liên tiếp, độ lệch trung vị ổn định → phần lệch bằng "độ lệch nền" gán vào **định mức/công thức**, không ai chịu; hiện đề xuất hệ số chỉnh. Phần vượt nền mới xét tiếp.
5. **Phần dư còn lại** chia theo tiếp xúc:
   - Trọng số mỗi ca = Σ lượng BTP theo sổ mà ca đó đã dùng trong khoảng đo (ví dụ ca sáng 10 ly, ca chiều 2 ly → 10:2).
   - Trong một ca: chia đều cho những người có mặt, nhân tỉ lệ thời gian có mặt trong phần ca đó.
   - Mẻ nấu có sai khác thành phẩm so với định mức: phần đó gán người nấu (có `staffEmployeeId`).
6. **Độ tin cậy** gắn từng phần: Mạnh (có người nhập/khai trực tiếp), Vừa (chia theo tiếp xúc, ≥3 khoảng đo cùng người ở trong ca có lệch), Yếu (ít mẫu, thiếu check-in, thiếu `usageEvents`). **Yếu → vào quỹ "chưa quy"**, hiện cho chủ nhưng không cộng vào ai.

## 3. Tự động và thông báo
- Chạy ngay sau khi đếm BTP cuối ca và sau mỗi lần chốt mẻ: sinh **hồ sơ vụ lệch** (`responsibility_cases_gieogieo`): khoảng đo, số lệch, phân rã (mục 2), danh sách người + % + giá trị + bằng chứng (mã bill, ca, mẻ, mốc), độ tin cậy, trạng thái.
- Thông báo: `alerts_gieogieo` loại mới `duty_case` (chỉ vụ vượt ngưỡng tiền hoặc độ tin cậy Mạnh/Vừa), một dòng/ngày/BTP, không spam.
- Tự chốt: vụ không bị chủ đổi trong 48 giờ → trạng thái "đã chốt tự động". Chủ vẫn mở lại được.
- Hệ thống **không tự trừ lương**; chỉ ghi trách nhiệm và hiện ở báo cáo tháng. Phạt dùng nút thưởng/phạt sẵn có.

## 4. Nút chủ (chỉ phòng nhân viên nhập sai)
- Sửa tồn BTP/NL (có sẵn: chỉ tách "nhập sai" khỏi "thất thoát").
- Đổi người chịu / chia lại % cho 1 hoặc nhiều người (ghi `responsibilityHistory`, bắt lý do).
- Đánh dấu vụ là "định mức", "lỗi nhập", "miễn" (bắt lý do).
- Yêu cầu cân lại (mở lại màn cân của BTP đó).

## 5. Báo cáo
- Báo cáo tháng theo nhân viên: phần chịu theo từng loại (khai, nhập sai, chia theo ca) + độ tin cậy + bấm xem bằng chứng.
- Hai khoản tách riêng, không tính vào ai: "lỗi định mức" (kèm hệ số đề xuất) và "chưa quy".
- Sửa `thangKetTrachNhiemNL` để đọc cả `ADJUSTMENT fromPrepCount`.

## 6. Các bước làm (mỗi bước độc lập, có test, chủ duyệt rồi mới sang bước sau)
- **B1 (Quản lý, không đụng engine)**: báo cáo tháng đọc lệch đếm BTP; file xuất thêm người đếm/cân từng dòng. Rủi ro thấp.
- **B2 (module tính thuần, test bằng dữ liệu thật 18/9–1/10)**: hàm `attributeInterval(...)` theo mục 2; chạy thử trên file xuất, so kết quả với phán đoán của chủ trước khi nối vào app.
- **B3 (engine v4)**: ghi hồ sơ vụ lệch, gọi từ lúc đếm/chốt mẻ; tôn trọng B1–B15, `check_boundaries`.
- **B4 (POS)**: chốt chặn nhập số bất thường (ngưỡng đã đề xuất: đếm lệch >50% và >300 g; dùng vượt định mức >3 lần và >50 g) và bắt chọn lý do.
- **B5 (Quản lý)**: màn "Vụ lệch" + nút chủ + thông báo + báo cáo tháng.
- **B6**: đo lại sau 2 tuần: tỉ lệ vụ ở "chưa quy", vụ bị chủ đổi (đo độ đúng của luật).

## 7. Điều cần chủ quyết định (đổi nghiệp vụ)
1. Trọng số: theo lượng dùng theo sổ (đề xuất) hay theo số bill?
2. Trong một ca nhiều người: chia đều theo thời gian có mặt (đề xuất) hay có "người phụ trách pha chế" chọn tay?
3. Dung sai (5% / 30 g) và ngưỡng tiền để báo.
4. Tự chốt sau 48 giờ hay chủ luôn phải bấm?
5. Người quên check-in: xếp vào "chưa quy" (đề xuất) hay suy từ bill?

## 8. Giới hạn dữ liệu (nói thẳng)
- `usageEvents` BTP chỉ có từ 19/9: trước đó chỉ chia được theo định mức/chưa quy.
- Hệ thống không biết **ai pha ly nào**; chỉ biết ai đang trong ca. Kết quả là xác suất theo tiếp xúc, không phải bằng chứng cá nhân. Vì vậy phần "chia theo ca" luôn mang nhãn độ tin cậy và có thể bị chủ đổi.
- Hoàn toàn có thể có lệch nhỏ không giải thích nổi; đó là dung sai, không phải lỗi.
