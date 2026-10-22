# Đặc tả triển khai Unit Engine 2 v1

> **Lộ trình & trạng thái hiện hành: [LO_TRINH_ENGINE2_CAP6.md](LO_TRINH_ENGINE2_CAP6.md)** (22/10, chủ quán duyệt). Tài liệu này là tham chiếu; thứ tự, phạm vi và định nghĩa cấp theo lộ trình.

Ngày: 22/10/2026. Mã nguồn đối chiếu: `53775f7`, nhánh `Phan-tach-unit-engine`.

**Đặc tả viết trước code.** Runtime P0 đã có sau đó (`282dd00`); mapper/replay nghiệm thu chưa có — xem lộ trình. Tài liệu tiếp nhận năm sản phẩm/tiêu chí chủ quán đề xuất, bổ sung đối chiếu POS thật và sửa các điểm có thể dẫn đến nghiệm thu sai. Chủ quán đã xác nhận ca luôn có nhóm pha chế: việc đo giao nhóm đang ca, việc dở chuyển ca sau, trách nhiệm vẫn theo khoảng lịch sử. **Đủ tài liệu để bắt đầu lõi và luồng P0.** Các con số hiệu chuẩn là tham số thử nghiệm cần kiểm chứng, chưa phải cấu hình có hiệu lực.

Tài liệu đi cùng: [kiến trúc](THIET_KE_UNIT_ENGINE2_V1.md), [ma trận các case và đích cấp 6](MA_TRAN_ENGINE2_TU_DONG_NANG_MUC.md), [15 ngoại lệ đề xuất](NGOAI_LE_UNIT_ENGINE2_DE_XUAT.md).

## 1. Năm điểm cần làm rõ trong đề xuất đầu vào

1. **Một nguồn tài chính có thẩm quyền, cho phép số dẫn xuất.** WASTE/ADJUSTMENT hiệu lực và phiên bản định giá là căn cứ; case, alert, phân bổ và summary chỉ liên kết/chiếu từ nguồn. Có thể lưu số tiền trong snapshot để giảm đọc, nhưng phải kèm nguồn/phiên bản/cách tính và không được cộng nó thành chi phí lần hai. Không xóa các trường `value`, `totalCost` hiện có chỉ để đạt yêu cầu “không có số tiền riêng”.
2. **Giữ trạng thái tương thích, tách các chiều nghĩa.** `auto`/`manual` là cách quyết định; `contested`/`dispute` là phản đối; `no_checkpoint` là thiếu căn cứ. Không ép tất cả thành một chuỗi trạng thái tuyến tính. `closed_pool` hiện có không chứng minh đã quy trách nhiệm/quyết toán đủ.
3. **Dữ liệu chuẩn phải có cấp chất lượng.** Quyết định tay là căn cứ của chính sách trách nhiệm đã chốt, chưa tự là sự thật về nguyên nhân vật lý. Hai lần cân của cùng người không tự trở thành hai phép kiểm độc lập. Lời khai tự do không dùng làm nhãn học.
4. **Một writer là một đường thực thi có thẩm quyền cho một nghiệp vụ.** Cả POS, quản lý và worker có thể gọi cùng writer. Không cấm quản lý gọi Engine chỉ vì POS cũng gọi. `C.app` không phải khóa chuyển Engine, lease ghi kho hoặc cổng phiên bản đội máy.
5. **Nghiệm thu theo hai đường.** Mapper tương thích phải khớp cách đọc sổ cũ trên dữ liệu đủ độ phủ. Chính sách mới được kiểm riêng theo kết quả mong đợi; không bắt phân bổ mới bằng phân bổ cũ vốn chia theo lượng bán. Sửa nguồn phải khớp kết quả tính lại cuối cùng trong cùng điều kiện, không bắt lịch sử các thao tác vật lý đã làm phải giống một quá khứ chưa từng xảy ra.

## 2. Hợp đồng dữ liệu

### 2.1. Quy ước chung

- Mọi bản ghi có `schemaVersion`, `storeId` cố định, ID nguồn, phiên bản nguồn, thời điểm nghiệp vụ và thời điểm hệ thống nhận. Không suy cửa hàng từ biến giao diện tại lúc callback kết thúc.
- `businessDate` là ngày nghiệp vụ tại Việt Nam, có thể khác ngày nhận sự kiện. Thời gian đo cần lưu thời gian thiết bị, dấu đồng bộ máy chủ và chất lượng đồng hồ nếu có; mất mạng không giả là có thời gian máy chủ chính xác.
- Lượng có đơn vị nền, độ chính xác và snapshot đơn vị kiểm kê/nhận kho. Bảo toàn độ chính xác nguồn; không làm tròn từng bước tùy tiện. Tiền có currency/precision; phân bổ phần dư làm tròn vào người theo thứ tự ID ổn định để tổng khớp nguồn.
- Chưa biết giá vốn/đơn vị/thời gian thì là trạng thái thiếu dữ liệu, không thay bằng 0 hoặc giờ hiện tại. Giá vốn 0 có chủ đích phải phân biệt với ô trống.
- Với dữ liệu cũ: giữ payload gốc hoặc con trỏ bản lưu bất biến, danh sách trường, hash và phiên bản adapter. Trường chưa hiểu vẫn giữ trong `extensions`, không tự bỏ hoặc coi là chỉ thị cho hệ thống.

### 2.2. Các bản ghi tối thiểu

| Bản ghi | Trường bắt buộc và ý nghĩa |
|---|---|
| **SourceEvent** | `eventId`, `schemaVersion`, `storeId`, `eventType`, `operationId`, `source:{path,id,revision,hash}`, `occurredAt`, `recordedAt`, `businessDate`, `actor:{employeeId,roleSnapshotRef}`, `entityRefs`, `correlationId`, `causationId`, `payloadRef`, `qualityFlags` |
| **LossLink** | `lossId`, `storeId`, `sourceSlices:[{path,id,revision,qty,unit,classification}]`, `valuation:{status,quantity,costBasisRef,costRevision,amount,currency,precision,method}`, `effective`, `supersedes`, `reversalRefs`. Đây là liên kết/chuẩn hóa nguồn hiện có, không phải sổ ghi giảm kho thứ hai |
| **Decision** | `decisionId`, `caseId`, `caseRevision`, `policyVersion`, `modelVersion` (hoặc null), `inputRefs/inputHash`, `interval`, `result`, `reasonCodes`, `hypotheses`, `responsibilityRef`, `actionRefs`, `mode`, `previousDecisionId`, `effectiveAt`, `createdAt` |
| **Checkpoint** | `checkpointId`, `storeId`, `itemId/prepId`, `containerIds/batchIds`, `scope` (unit hoặc aggregate), `measurementSessionId`, `method`, `countedAt`, `receivedAt`, `clockQuality`, `byEmployeeId`, `vessel:{id,variantId,revision}`, `tareSnapshot`, `gross`, `net`, `densitySnapshot` (hoặc null), `inventoryUnitSnapshot`, `bookAtMeasurement`, `bookProofRef`, `interleavedSalesRef`, `quality`, `supersedes` |
| **Responsibility** | `responsibilityId`, `decisionId`, `lossRefs`, `interval`, `eligibleShiftRefs`, `eligibleEmployeeIds`, `basis` (policy_equal_share, verified_correction hoặc manual), `allocations`, `pool`, `pending`, `valuationRef`, `totalsCheck`. Không tạo giao dịch thu tiền/trừ lương |
| **Control** | `controlId`, `storeId`, `targetType/targetId`, `level:0..3`, `manualFloor`, `reasonCaseRefs`, `policyVersion`, `revision`, `effectiveFrom`, `requirements`, `requiredDeviceVersion`, `ackRefs`, `lastEvaluation`, `nextEvaluationAt`, `deescalationEvidence` |
| **Task** | `taskId`, `storeId`, `caseId/controlId`, `actionType`, `targetRefs`, `assigneeId/role`, `handoverRule` (pha chế ca tiếp theo tại cùng quán), `status`, `deadlineAt`, `dependencyRefs`, `idempotencyKey`, `leaseToken`, `attempt`, `nextTryAt`, `resultRef`, `exceptionRef`, `revision` |

ID tem là containerId ổn định, không dùng riêng chuỗi QR làm danh tính: QR có thể được cấp lại. Khi tệp cũ chỉ có code, adapter phải ghi “chưa nối được ID nguồn”; không tự sinh một tem thật hoặc đoán nối qua một code đang trùng.

Một vụ có thể có nhiều dòng hao hụt thành phần; mỗi thành phần có khóa nguồn duy nhất. Case tổng hợp nhiều NL không bị ép vào một dòng WASTE mới. Ngược lại, WASTE + duty case + alert cùng mô tả một khoản chỉ có một nguồn tài chính hiệu lực.

`pool` giữ được để tương thích/giải thích các quyết định lịch sử. Nó không được dùng làm lối tự kết thúc vô điều kiện của chính sách mới: phải có phân loại khoản, người nhận việc, bước tiếp và phần chưa quyết toán thể hiện rõ. Khoản thuộc công thức/sửa sổ cũng không tự bị coi là khoản nhân viên phải trả.

### 2.3. Phân loại tiền và chênh lệch

- `WASTE` hiệu lực thường là nguồn tổn thất đã ghi. Chênh lệch kiểm kê BTP hiện có thể là `ADJUSTMENT` âm; adapter phải giữ loại cũ và chỉ rõ đây là thiếu vật lý đã xác minh, sửa sổ hay chưa phân loại. Không bỏ sót nó chỉ vì không tên WASTE, cũng không tự đổi tất cả ADJUSTMENT âm thành mất hàng.
- NL hiện được báo cáo bằng `abs(qty) × itemCostOn(itemId,businessDate)` trong `lai_lo.v6.js`; BTP dùng `abs(totalCost)`. Mapper tương thích phải giữ căn cứ này và ghi rõ thiếu lịch sử giá nếu có. Không lấy giá hiện tại để giả là giá lịch sử đã biết.
- Bản mới phải lưu được phiên bản định giá gắn nguồn. Một phép định giá lại có lịch sử/supersedes, không tạo tổn thất thứ hai. Chưa đủ giá: chốt lượng và giao hoàn thiện định giá; giá trị để `missing/provisional`, không hiển thị đã quyết toán đủ.
- Reclassify WASTE sang CONSUMPTION, void/hoàn và sửa nguồn làm vô hiệu phần chiếu tương ứng và cập nhật phân bổ theo phiên bản. Không để WASTE cũ + tiêu hao mới cùng bị cộng cho cùng phần lượng.
- Summary được phép có `amount`, `allocationsTotal`, `pendingTotal`, nhưng bắt buộc `derivedFrom`, `sourceRevision`, `valuationRevision`, `computedAt`. Summary cũ thì đánh dấu cần cập nhật, không lấy hai bản khác phiên bản cộng lại.

### 2.4. Điểm phát sự kiện và bảo toàn nguồn

`SourceEvent` bao phủ finish/discard, lost/found/reprint, nhận/sửa nhận, cân/kiểm kê/bàn giao, reconcile/force settle/hủy/sửa yield, tiêu hao không gắn mã/nợ, hoàn tác, cập nhật ca/role lịch sử, kết quả task và sửa/void nguồn. Không tạo listener đọc lại lịch sử cho mỗi bill.

Ưu tiên event từ kết quả Engine và outbox gắn nghiệp vụ, không từ DOM. Với một commit Firestore có thể ghi ý định cùng transaction. Firestore và RT **không có transaction chung**: nghiệp vụ đổi cả hai cần journal trước đổi, marker chống lặp ở nguồn đang ghi, bước xác nhận và khả năng phát lại phần chưa xong. Không gọi một callback sau commit là bằng chứng đã giao sự kiện thành công.

Nguồn cũ chưa có revision: dựng khóa snapshot theo path + ID + hash nội dung và thời điểm xuất; giữ độ phủ là snapshot. Không bịa chuỗi sự kiện đã bị ghi đè. Sự kiện đến muộn đọc phiên bản nguồn hiện hành trong đúng phạm vi; eventId trùng chỉ tiếp tục phần thiếu. Nguồn bị xóa khác với một yêu cầu void hợp lệ: giữ bản chứng cứ, tạo đối soát, không xóa khoản tiền vì một doc đọc ra 404.

Không đổi nguồn thành “đã giải quyết” chỉ vì một trường status đã terminal. Guard phải xét ý nghĩa nghiệp vụ và kết quả con.

### 2.5. Ánh xạ lưu trữ đề xuất

Root riêng mỗi quán: `duty_digests_gieogieo[__ggNN]/_engine2`; dưới đó là `events`, `loss_links`, `cases`, `decisions`, `checkpoints`, `controls`, `tasks`, `outbox`, `models`, `audits`, `writer_authority`. Giữ nguồn kho hiện tại và root `_automation` hiện có, không chuyển dữ liệu kho sang bộ thứ hai. Ánh xạ phải qua lớp store cố định và kiểm đường dẫn trước runtime; không thêm collection động ngoài registry bằng chuỗi tùy ý.

Các con trỏ `currentDecisionId`, revision case/control và ID tác vụ được cập nhật theo transaction có điều kiện. Lịch sử quyết định/đo append-only; bản sửa tham chiếu bản trước. Một lần hoàn thành nguồn không cần đọc lại toàn bộ subcollection.

## 3. Ba máy trạng thái

### 3.1. Quy tắc chung cho mọi bảng

Ưu tiên kiểm: đúng store → đúng schema/quyền ghi → event/operation đã xử lý → revision hiện hành → guard chính sách → commit. Khóa nghiệp vụ `(storeId, operationFamily, operationId)` khác khóa nhận sự kiện; một nghiệp vụ có thể phát nhiều event, nhưng không được ghi kho lại.

Mỗi transition có expectedRevision và mã intent cố định. Kết quả worker chỉ được ghi khi leaseToken và authority epoch còn hiệu lực. Lease chỉ có quyền với nghiệp vụ mà nó bảo vệ; lease job không tự bảo vệ mọi lần ghi RT.

Trong bảng, `*` là mọi trạng thái trừ ngoại lệ được nêu. Rule ưu tiên: trùng/stale → quy tắc chung → dòng cụ thể → **INVALID_TRANSITION**. Mọi cặp còn lại không thay trạng thái, lưu mã từ chối; không có fallback âm thầm “đánh dấu xong”. Bản đặc tả là đầu vào tạo bảng kiểm tích Descartes trạng thái × sự kiện khi triển khai.

### 3.2. Case hao hụt/lệch

Trạng thái tiến trình: `new`, `checking`, `ready`, `decided`, `review`, `closed`, `voided`, `superseded`. Giữ riêng `decisionMode`, `reviewState`, `evidenceCoverage`, `allocationStatus`, `financialStatus`, `actionStatus`.

| Đầu → cuối | Sự kiện | Điều kiện/hành động | Chống lặp, lỗi và sửa nguồn |
|---|---|---|---|
| chưa có → new | SOURCE_UPSERT | Có nguồn hợp lệ; liên kết loss, tạo việc kiểm dữ liệu | ID case ổn định theo nguồn/ngữ nghĩa, không theo mỗi alert |
| new → checking | CHECK_START | Nhận đúng phiên bản, kiểm sổ/ca/mốc/giá | Claim theo revision; hết lease được nhận lại |
| checking → ready | EVIDENCE_READY | Sổ đáng tin, đủ căn cứ cho chính sách áp dụng | Lưu inputHash; event cũ không thay căn cứ mới |
| checking → checking | EVIDENCE_MISSING / DUE | Tạo/cập nhật việc đo cho pha chế đang ca hoặc việc phục hồi dữ liệu cho hệ thống, có mốc hẹn | Hết hạn không đóng pool tự động; retry không sinh task trùng |
| ready → decided | DECIDE | Ghi một decision hiệu lực, phân bổ và intent control/task | Transaction đổi currentDecisionId; chỉ một revision thắng |
| decided → closed | RESULTS_CONFIRMED | Khoản nguồn đã đối soát; phân bổ/định giá đủ theo chính sách; biện pháp ban đầu có kết quả hợp lệ | ACK đơn thuần không đủ. Control theo dõi dài hạn có vòng đời riêng |
| decided/closed → review | CONTEST | Lưu phản đối gắn người/căn cứ; giữ nguồn tiền, không tự đảo kho | Contest ID chống gửi lại; ghi financialStatus chưa quyết toán nếu cần |
| review → decided | REVIEW_RESULT | Quyết định tay hợp lệ hoặc kết quả xác minh theo chính sách | Tạo revision mới; bảo vệ quyết định tay, giữ lịch sử |
| review → review | REVIEW_DUE | Thiếu chứng cứ: giao người/đo phù hợp theo bảng ngoại lệ | Không suy hết 48 giờ/7 ngày thành chứng minh nguyên nhân |
| checking/ready/decided/closed/review → checking hoặc review | SOURCE_CORRECTED | Chưa có manual lock: tính lại phạm vi bị ảnh hưởng; có manual lock: tạo bản đối chiếu chờ quy tắc sửa được phép | Giữ bản trước; không âm thầm ghi đè quyết định tay |
| Các trạng thái trừ voided/superseded → checking/review | SOURCE_REMOVED | Giữ evidence snapshot, xác minh xóa nhầm hay void hợp lệ | Không xóa loss theo sự vắng mặt của source |
| * → voided | EXPLICIT_VOID | Có thao tác void hợp lệ và các bút toán/phần chiếu đã xử lý đúng | Không thu hồi hàng vật lý giả; task dư được hủy có vết |
| * → superseded | CASE_MERGED | Có case đích cùng nguồn, chuyển liên kết duy nhất | Không cộng hai loss; giữ redirect lịch sử |
| voided/superseded → giữ nguyên | RETRY / LATE_EVENT | ACK hoặc chuyển tới revision/case hiện hành | Không hồi sinh; sửa mới phải qua một sự kiện hợp lệ riêng |
| voided → checking | RESTORE_SOURCE | Có thao tác phục hồi nguồn hợp lệ và các đối ứng khớp, không phải callback cũ | Revision mới, giữ vết void; superseded luôn dẫn về case đích |

Ánh xạ trạng thái cũ để đọc tương thích: `auto/manual` → mode; `contested/dispute` → reviewState; `pending_verify` → checking/review kèm task; `no_checkpoint` → evidenceCoverage; `closed_pool` → quyết định lịch sử với phần chưa phân cá nhân. Không tự nâng legacy `auto` thành case mới đã closed khi pool còn thiếu hoặc action chưa áp dụng.

“Closed” trong bảng là hoàn tất hồ sơ nghiệp vụ, **không phải xác nhận nhân viên đã trả tiền**. Thu/bù trừ là nghiệp vụ tài chính chưa được phép tự triển khai.

### 3.3. Control món/quán, mức 0–3

| Đầu → cuối | Sự kiện và điều kiện | Hành động/khóa/thử lại |
|---|---|---|
| 0 → 1 | Dữ liệu chưa chắc, cần mốc mới; chưa đủ kết luận mất | Một intent lấy mốc đúng đối tượng, target + revision chống lặp |
| 0/1 → 2 | Báo hết còn dương hợp lệ hoặc thiếu vật lý đủ căn cứ; vượt quy tắc nâng mức | Bật cân bàn giao/đóng ngày cho đúng món/quán; giao lấy mốc sớm. Không cần đợi hết cooldown |
| 1/2 → 3 | Số đo bất nhất, tái diễn dù control đã áp dụng hoặc cần kiểm độc lập | Thêm xác minh theo chính sách; cùng người cân hai lần chưa tự tính độc lập |
| 0/1/2/3 → max(level,manualFloor) | MANUAL_FLOOR_SET | Giữ mức sàn, thay đổi có phiên bản; không nhân bản field catalogMirror |
| 1/2/3 → giữ nguyên | POS_ACK / TASK_RESULT / DUE | ACK ghi độ phủ; kết quả cập nhật evidence và lịch đánh giá; chưa đủ điều kiện không hạ |
| 3 → 2; 2 → 1; 1 → 0 | CLEAN_WINDOW_PASSED | Đủ mốc/ngày hoạt động/lượng dùng, không task hoặc loss chưa đối soát, ACK đủ; không dưới manualFloor; mỗi lần một bậc |
| * → giữ nguyên hoặc tăng | CONFIG/RECIPE/MEASUREMENT_CHANGED | Đánh giá lại chất lượng baseline và bước đo; không xóa rủi ro chỉ vì đổi cấu hình |
| * → giữ nguyên | OFFLINE / NO_ACTIVITY / EXCEPTION | Giao lối thoát có ghi nhận; không tính là mẫu sạch, không tự hết hiệu lực |

Khởi điểm thử nghiệm đề xuất: hạ mức cần ≥5 mốc sạch, ≥3 ngày có hoạt động, lượng dùng tối thiểu theo nhóm đơn vị; cách lần hạ trước ít nhất 7 ngày có hoạt động. Thiếu lớn mới bỏ qua khoảng chờ để nâng ngay. Mọi con số phải được replay/đo công thao tác trước khi chốt sản xuất; không dùng chúng làm ngưỡng miễn ghi hao hụt.

### 3.4. Task thực thi

Trạng thái: `queued`, `claimed`, `in_progress`, `waiting_dependency`, `retry_wait`, `exception_recorded`, `done`, `superseded`, `cancelled`.

| Đầu → cuối | Sự kiện/điều kiện | Hành động, chống lặp và mất mạng |
|---|---|---|
| chưa có → queued | INTENT_COMMITTED | ID theo action + target + revision, ghi bền cùng quyết định hoặc journal có phát lại |
| queued/retry_wait → claimed | CLAIM | Đúng người/role và tới hạn; transaction lease, leaseToken mới |
| claimed → in_progress | START | Chụp context dụng cụ/mã/nguồn; không khóa màn bán hàng |
| claimed/in_progress → waiting_dependency | NEED_INPUT | Ghi thiếu gì, giao tác vụ con có ID ổn định và hạn; không để “chờ” không có đường ra |
| waiting_dependency → queued | DEPENDENCY_READY | Dữ liệu đã có, kiểm lại phiên bản trước khi cho làm tiếp |
| claimed/in_progress → retry_wait | TRANSIENT_FAILURE / LEASE_EXPIRED | Lưu phần đã làm, backoff có giới hạn; không thao tác kho lần hai |
| queued/claimed/in_progress/waiting_dependency/retry_wait → exception_recorded | HANDOVER_EXIT_WITH_EXCEPTION | Nhân viên xác nhận tình trạng thật, lý do cấu trúc, actor/time và việc bàn giao ca tiếp theo; cho luồng đóng ca đi tiếp nhưng task kiểm soát chưa đạt |
| exception_recorded → queued/waiting_dependency | RECOVERY / NEXT_SHIFT / DUE | Tự giao lại cho pha chế đang ca/ca tiếp theo; không đưa ngoại lệ vào cửa sổ sạch |
| in_progress → done | VALID_RESULT | Có kết quả nghiệp vụ hợp lệ đúng phiên bản; số đo/sổ đối chiếu được, lưu resultRef rồi đóng |
| * → superseded/cancelled | NEW_REVISION / VALID_VOID | Kiểm nguồn mới, giữ kết quả đã làm, hủy phần chưa cần; gắn task thay thế nếu có |
| done/superseded/cancelled → giữ nguyên | RETRY / LATE_ACK | Trả kết quả cũ hoặc dẫn task mới; không mở lại chỉ vì client thiếu ACK |

Không có trạng thái “lỗi vĩnh viễn rồi bỏ quên”: lỗi không thử lại được phải có exception và việc phục hồi/bàn giao rõ ràng. Không tuyên bố đã giải quyết xong khi chưa có kết quả hợp lệ. Tác vụ nền không nằm trên đường tạo bill.

## 4. Quyền ghi duy nhất và chuyển tiếp

### 4.1. Đường ghi đã đối chiếu

Đã chạy AST hiện tại cho POS/QL, đọc các caller chính và chạy `check_boundaries.js` trên POS + QL + QL2: **RANH GIỚI SẠCH trong phạm vi công cụ hiện có**. Allowlist có 4 mục; kiểm này không chứng minh mọi target động hoặc mọi module ngoài hai HTML đã được bao phủ.

| Nghiệp vụ/dữ liệu | Caller hiện tại → writer | Quy tắc chuyển |
|---|---|---|
| Tiêu hao bill/FIFO, hoàn kho | POS và QL → `UnitEngine.consumption` | Một inventory writer theo family/epoch, không tạo consumer thứ hai cho cùng bill |
| Nhận kho sinh ledger/tem | `_submitPoReceiveImpl` → `ledger.apply`, `lifecycle.createFromReceipt` | Giữ operation/idPrefix; journal các bước phiếu/PO/tem, retry chỉ phần thiếu |
| Phiếu nhận và PO | POS `poReceiveUpdatePODoc`/merge record; QL sửa phiếu qua `lifecycle.fixReceipt` rồi cập nhật chứng từ | Đây là writer chứng từ hiện có, không đồng nghĩa ghi thẳng unit. Mỗi bước có ownership/idempotency riêng |
| Mở/báo hết/hủy, atomic | POS → `lifecycle.openSealed/finish/requestDiscard/finishAtomic` | Giữ B1–B15; chỉ chuyển family sau kiểm tương thích |
| Báo mất/tìm lại/in lại | POS tạo report; Engine `approveLostReports/markFound`, `codes.reprint` đổi trạng thái/mã | Report không là inventory mutation. Phải nối report và kết quả, không giao hai writer đổi cùng unit |
| Chế biến/reconcile/sửa yield/hủy mẻ | POS/QL → `UnitEngine.prep` | Một writer cho locks, units, batches và ledger; giữ pending/recovery khi chuyển |
| Cân NL | POS `submitShiftInventoryCountPOS` → `UnitEngine.shift.applyLine`; POS lưu phiếu ca | Phiếu ca là chứng từ; kết quả kiểm soát cần lấy từ Engine, không chỉ dấu đã lưu form |
| Cân BTP/kiểm kê/điều chỉnh | POS/QL → `prep.countCommitLine`, `containers.adjust`, `prep.setBatchQty`, ledger | Dùng cùng loss/checkpoint refs; không tạo WASTE thêm từ task |
| Duty, phân bổ và phản đối | POS/QL/worker → nhóm `UnitEngine.duty` | Cắt quyền quyết định theo case/domain/version; không cho duty cũ và mới cùng thắng |
| Case/control/task Engine 2 | Chưa có; đề xuất decision service và executors chung hợp đồng | Engine 2 sở hữu quyết định; POS cung cấp phép đo/ACK, không tự viết phân bổ cạnh tranh |
| Cập nhật yield/cost BTP | POS `refreshPrepYieldStatsPOS` còn ghi `prep_items` trực tiếp | Phải chọn một updater khi chuyển học/hiệu chuẩn; không để updater cũ tranh ghi model mới |
| Danh mục, đơn vị, dụng cụ, giá/recipe history | QL và module danh mục, có catalogMirror | Giữ writer danh mục; event thay đổi ảnh hưởng đúng mốc/phiên bản. Control riêng quán không ghi vào field bị mirror |
| Cutover tồn theo tem | QL `soLechCutover` gọi recompute Engine rồi ghi `temCutoverAt/Snapshot` | Là thao tác thiết lập có kiểm soát, không tự khóa như một lỗi kho; audit phải giữ mốc gốc |
| Ca nhân viên/role, sửa ca | POS check-in/out, QL HR; không phải inventory writer | Giữ ca thực tế, phát sự kiện sửa phạm vi liên quan; không kéo dài công vì task kho chưa xong |
| Tiền mặt, chi phí, ownerReceipt, lãi/lỗ | Writer nghiệp vụ tương ứng hiện có | Ngoài chuyển inventory P0; Engine 2 không tự trừ lương/duyệt chi/thay công thức tài chính |

Allowlist đang có: tạo danh mục NL không tem có tồn khởi tạo; tạo BTP tồn 0; lưu phiếu ca dùng collection động; ghi substitutes danh mục dùng collection động. Không xóa allowlist hàng loạt; phải đọc đúng fields/semantics. AST còn cần được mở rộng theo tập trường trạng thái/các shared module khi triển khai, không lấy kết quả sạch hiện tại làm bằng chứng đã khóa được máy cũ.

### 4.2. Thứ tự đổi writer

1. Ban đầu inventory adapter chỉ gọi writer v20 đã kiểm chứng, Engine 2 quyết định/điều hành mới. Shadow không ghi kho/trách nhiệm hiệu lực, không ghi tham số học vào danh mục.
2. Cờ theo **store + operation family**, có `authorityEpoch`, owner, minClientVersion, thời điểm hiệu lực và trạng thái drain. Phiên bản ứng dụng chỉ là một đầu vào; không dùng `C.app` để cấp quyền cạnh tranh.
   Các family cùng sửa một node phải dùng chung giao thức CAS/lock/idempotency/metadata tương thích. Nếu không chứng minh được tương thích, chuyển cùng một nhóm; không chia cờ tùy tiện khiến FIFO, mở tem và cân ghi theo ba giao thức khác nhau.
3. Trước chuyển một family: kiểm các thao tác dở, giữ ID/journal, đợi hoàn tất hoặc giao rõ writer nhận phần còn lại; thu ACK đội máy, kiểm dữ liệu nguồn và khả năng quay lui.
4. Cần cơ chế fence **tại đường ghi thực tế**. Nếu máy cũ ghi thẳng mà không bị ràng buộc epoch, feature flag/gỡ nút trên máy mới không đủ. Phương án fence ở backend/rule/transaction hoặc điều kiện ngừng toàn bộ writer cũ phải được chứng minh ở môi trường thử trước cutover; không tự coi là đã có. Không chuyển family nếu việc chặn writer cũ có thể làm bill mất lượt trừ kho mà chưa có intent/handoff bền sang writer nhận; khi chưa chứng minh được, giữ adapter v20 là writer inventory duy nhất.
5. Một operation đã bắt đầu có owner/version cố định hoặc handoff rõ cùng ID, không chuyển giữa chừng bằng nút bật cờ. Worker hết lease/epoch không được ghi kết quả muộn.
6. Quay lui không xóa decision/control đã có, không phát lại thao tác kho đã commit và không trả client cũ quyền ghi một family nó không hiểu. Nếu chưa bảo toàn được dữ liệu mới thì dừng chuyển family, tiếp tục writer đã được xác nhận.

Engine 2 có lõi quyết định, mô hình, điều hành và kiểm toán riêng; việc tái sử dụng adapter kho được kiểm chứng không biến nó thành đổi tên Engine v20.

## 5. Chính sách ngoại lệ

Bảng 15 dòng nằm tại [NGOAI_LE_UNIT_ENGINE2_DE_XUAT.md](NGOAI_LE_UNIT_ENGINE2_DE_XUAT.md), đã làm rõ cách giao việc theo mô hình ca luôn có pha chế. Không yêu cầu chủ cấu hình thêm cấp quản lý/tuyến dự phòng trước khi xây Engine. Người nhận việc đo hiện tại không mặc định chịu khoản mất của khoảng trước. Chưa có thay đổi runtime nào.

Điều kiện chung: không chặn bán/check-in/check-out; đóng ca có lối thoát ghi nhận được, giữ việc và rủi ro cho bên nhận tiếp. “Đã đóng ca có ngoại lệ” khác “đã kiểm đủ”. Ngoại lệ không làm WASTE biến mất và không tự thành một mẫu sạch. Duyệt chi vẫn dành chủ quán; không mở thêm hàng loạt việc chủ phải duyệt từng ngày.

## 6. Học, ground truth và tự kiểm toán

### 6.1. Nhãn và dữ liệu được học

| Dữ liệu | Dùng được để làm gì | Không được suy ra |
|---|---|---|
| Bán/tiêu hao đã đối soát | Tốc độ dùng, lượng tiếp xúc, dự báo theo món/quán/ngày có hoạt động | Ai trực tiếp lấy/đổ một phần bị mất |
| Số cân/kiểm kê có context và chất lượng | Khoảng thiếu/dư, sai số đo; xác thực mạnh hơn khi độc lập và đã bù bill xen giữa | Hai số nhập giống nhau luôn là đúng |
| Quyết định tay | Chính sách/ngoại lệ trách nhiệm đã được người có quyền chốt | Nhãn nguyên nhân chắc chắn, hoặc tự thay chính sách theo tần suất bị ghi đè |
| Bì/tỷ trọng đo có kiểm chứng | Phát hiện cấu hình sai, đề xuất bản cấu hình mới; tính lượng ròng theo snapshot | Tự sửa bì vật lý từ tỷ lệ thiếu hàng; thay bì lịch sử |
| Yield/công thức thực tế đã xác minh | Dự báo, phát hiện đổi chế độ, đề xuất điều chỉnh định mức | Cứ hụt nhiều thì tự tăng định mức cho hết cảnh báo |
| Lời khai tự do/structured reason tự báo | Dữ kiện tham khảo để chọn phép kiểm tra | Nhãn ground truth nguyên nhân hoặc nhận lỗi mặc định |

Tách bốn nhãn: độ đúng phép đo, sự kiện kho đã xác lập, phân bổ theo chính sách, nguyên nhân đã xác minh. Chia đều bốn barista là nhãn chính sách, không phải bốn nhãn “gây ra mất hàng”. Người sửa tay phải có reason/evidence và đúng phạm vi mới được dùng làm nhãn tương ứng.

### 6.2. Các mốc chấp nhận đề xuất cho giai đoạn thử

| Hạng mục | Mốc đề xuất, chưa phải hằng số sản xuất |
|---|---|
| Baseline một nhóm món/đo/công thức | ≥20 mốc hợp lệ trên ≥14 ngày có hoạt động, có lượng dùng đủ theo nhóm; chưa đủ thì cold_start, dùng mức sàn và khoảng bất định |
| Model xác suất | **Chỉ cho giả thuyết kiểm được bằng phép đo (lộ trình, điều chỉnh 1); mốc thử thay bằng ≥30 nhãn/≥10 ngoài thời gian.** Bản gốc: có nhãn xác minh độc lập; mốc thử ≥100 case cho nhóm đủ tương đồng và ≥30 case kiểm theo thời gian ngoài tập học. Chưa đủ chỉ xếp giả thuyết, không in xác suất chắc chắn |
| Hiệu chuẩn | Báo Brier score, reliability theo nhóm xác suất và sai số kèm độ bất định; ECE mục tiêu thử ≤0,10 trên mẫu đủ. Mẫu nhỏ không được kết luận đã đạt chỉ vì điểm đẹp |
| Tự đổi tham số dự báo | Chỉ tham số được phép, tối đa ±5% mỗi 7 ngày có hoạt động so với bản đã nhận; thay đơn vị/công thức/bì là đổi phiên bản đo, không ép vào quy tắc 5% |
| Tự đổi chính sách liên quan người/tiền/định mức/bì | Không tự áp; tạo đề xuất có căn cứ. Thay chính sách chung có phiên bản; không đòi chủ duyệt mỗi case |
| Độ phủ mốc/control ACK | Bắt buộc đủ đối tượng trong phạm vi của việc muốn chốt; thiếu thì báo thiếu, không dùng trung bình toàn chuỗi để che một quán chưa ACK |
| Yêu cầu đo không cần thiết | Mục tiêu thử ≤10% trong số case có kết quả kiểm độc lập; đo cả phút công. Không suy “nhân viên không phản đối” là yêu cầu đúng |
| Tỷ lệ ghi đè/phản đối | Theo dõi theo rule/phiên bản, reason và kết quả review; ngưỡng đánh giá thử tăng gấp đôi baseline đáng tin hoặc ≥10% trên ≥20 case được review. Không tự coi phản đối là Engine sai hay nhân viên sai |
| Tự kiểm toán tiền/kho/trách nhiệm | 0 vi phạm chưa giải trình; mỗi chênh phải có case và hành động. Không lấy tỷ lệ đúng chung để cho qua một khoản tiền bị cộng đúp |

Các ngưỡng chỉ làm điểm xuất phát để kiểm trên dữ liệu; không lấy số mẫu tối thiểu làm bảo đảm mô hình đúng. Nhóm ca quá ít mẫu phải gộp theo thuộc tính phù hợp, không sao chép trách nhiệm hoặc mất mát thực tế giữa quán.

Model/threshold mới chạy offline rồi shadow; chỉ tự nhận nếu qua điều kiện chất lượng + ngân sách thao tác/đọc. Không có dữ liệu kiểm thì không tự promote. Mỗi phiên bản có training window, data hashes, exclusion log, metrics, phạm vi hiệu lực và rollbackRef. Kiểm lại sau mỗi cửa sổ hoạt động; không quét toàn bộ lịch sử từng bill.

Điều kiện tự về chế độ sàn: bất biến vỡ; dữ liệu/số đo mất chất lượng; drift vượt điều kiện đã xác nhận; chất lượng bộ mới kém hơn bản đang dùng; thiếu độ phủ xác minh. Dừng tự chốt nhánh quyết định bị ảnh hưởng, giữ sổ tổn thất và tác vụ đo; tiếp tục bán hàng. Bộ kiểm độc lập kiểm bất biến, không chỉ chạy lại cùng hàm quyết định.

## 7. Replay và nghiệm thu

### 7.1. Tệp đã có, kiểm được tới đâu

Đã kiểm cấu trúc tệp `gieo-gon-2026-09-01_den_2026-10-18.json` (phiên bản xuất 3, chế độ gọn): 48 ngày; SHA-256 `efed0974ae5d067a2bd000fc90a79286b0c6c8980edbca13a7841face5cdb26f`. Không đưa tệp dữ liệu nhân sự/khách hàng này vào GitHub.

| Có trong tệp | Độ phủ đã đếm |
|---|---|
| Lịch sử ngày | 48 ngày |
| Ca nhân viên | 74 dòng trên 47 ngày; có trường chức năng |
| Lô BTP | 347 dòng; 262 có weighings, 318 có inputCost |
| Phiếu nhận | 54 dòng |
| Kết ca/mở ca/đoạn ca | 46 / 47 / 61 dòng |
| Duty / alerts / Sổ lệch | 164 / 487 / 18 dòng |
| Tem rút gọn | 395 dòng có code/itemId, **không có containerId gốc** |
| Đối chiếu NL rút gọn | 239 dòng; không thay được toàn bộ stock ledger |
| Hai sổ giao dịch stock/prep gốc, RT active_units | **Không có trong cấu trúc xuất này** |
| Phiếu stock_counts | 0 dòng trong tệp; không suy rằng quán chưa từng kiểm kê |

Tệp đủ để dựng một phần fixture đo/BTP/ca/ngoại lệ và kiểm độ phủ mapper. **Chưa đủ** để tuyên bố tổng hao hụt mapper khớp sổ gốc hoặc phát lại đầy đủ FIFO và mọi lần sửa nguồn trong 48 ngày. Case FZFWM9PS báo hết 22/10 nằm ngoài ngày cuối của tệp: dùng thành fixture từ mô tả chủ quán, không giả là event đã có trong export này.

### 7.2. Manifest dữ liệu cần có để nghiệm thu đầy đủ

- Store/engine/app/schema versions, mốc đầu/cuối, múi giờ, phạm vi và danh sách thiếu/lỗi. Khởi tạo tồn/tem/mốc trước đầu cửa sổ phải rõ, kể cả các ngày tháng 8 nếu ảnh hưởng trạng thái đầu tháng 9.
- Raw stock/prep ledger có ID, metadata, amendments, void/reclass/đối ứng và căn cứ định giá; units/batches ổn định, RT/chg/markers, anomalies, traces/claims/locks có liên quan; không chỉ tổng theo ngày.
- Ca thực tế/role lịch sử, mốc cân đầy đủ và context, dữ liệu nhận/đơn vị, recipe/price/vessel histories có thể chứng minh thời điểm hiệu lực. Bill/usage chỉ phạm vi cần cho đối soát, không gom PII không cần thiết.
- Có điểm cắt/marker và danh sách thao tác dở để nhận biết export chụp giữa FS–RT. Không tuyên bố snapshot nguyên tử khi hai hệ thống được đọc ở hai thời điểm khác nhau.
- Nếu lịch sử chỉ còn trạng thái cuối, kiểm được **tái tính trạng thái cuối**; không giả dựng đủ chuỗi sự kiện đã mất. Kiểm sequence đầy đủ cần nhật ký thực có hoặc thu outbox trong giai đoạn shadow tiếp theo.

Chưa đọc Firebase sản xuất cho lượt đặc tả này. Khi làm công cụ xuất/replay phải là thao tác được bấm rõ, có giới hạn và manifest, không thêm quét nền cho POS. Không yêu cầu chủ quán tự gom từng collection bằng tay.

### 7.3. Hai đường đối chiếu

**Đường tương thích:** chuẩn hóa cùng dữ liệu nguồn và cách định giá phiên bản cũ, nhóm theo store/ngày/món/loại; so qty, tiền, void/reclass và danh sách trường. Không mất ID/unknown fields. Sai khác làm tròn phải đối chiếu ở độ chính xác nguồn và giải trình, không dùng dung sai lớn che sai nghiệp vụ. Các khác biệt vốn có giữa legacy duty và legacy P&L ghi thành finding, không sửa số nhập để ép khớp.

**Đường chính sách mới:** oracle từ các case đã chốt, gồm FZFWM9PS: 500 g đầu, 200 g dùng hợp lệ, 300 g báo hết; bốn barista hợp lệ được 75 g/người; tiền theo cùng giá nguồn; nguồn kho chỉ bị ghi một lần; tự bật cân đúng món/quán; mã finished không sống lại; có lối chọn dụng cụ; khoảng tiếp theo mở bằng mốc mới. Phân bổ cũ khác mới là delta phải giải thích theo chính sách, không là lý do bắt Engine mới bắt chước lỗi/luật cũ.

Replay trước 30 ngày có đủ độ phủ, mở tới 60 nếu dữ liệu có. Chạy fixture thiếu dữ liệu vẫn cần, nhưng không đếm nó thành một ngày đã đối soát đầy đủ. Không có nguồn đủ thì báo BLOCKED_DATA, không “PASS dự kiến”.

### 7.4. Bất biến và bộ tình huống

1. Giữ B1–B15 trong kế hoạch Engine hiện tại. Với NL có tem, tồn dựng từ sealed + open/RT và các nhánh nợ/phục hồi hợp lệ; BTP tách tồn dương và pending shortage. Với không tem, đối soát từ mốc đầu + giao dịch có hiệu lực theo đúng loại. **Không dùng duy nhất công thức tồn = cộng thô mọi dòng sổ** vì transfer, backfillNoStockEffect, deriveFromUnits và mốc reset có nghĩa khác nhau.
2. Mỗi phần tổn thất chỉ có một nguồn hiệu lực; tổng ngày bằng tổng nguồn thuộc phạm vi/định nghĩa đã ghi rõ. Case/alert/summary không cộng thêm tiền. Tổng allocations + phần còn lại khớp lượng/tiền nguồn, không dùng pool để giả là đã thu hồi tiền.
3. Chạy lại cùng operation/revision không đổi kết quả kho; retry/mất ACK/worker song song/sự kiện đảo thứ tự không tạo hai quyết định hiệu lực.
4. Sửa nguồn cho projection cuối khớp tái tính từ đầu với cùng chính sách, mốc/giá và dữ liệu đã sửa. Vẫn giữ audit và các thao tác cân thật đã xảy ra; không yêu cầu lịch sử task/những lần nhân viên đo phải biến mất.
5. Hoàn/xóa/reclass không trả lượng sai tem hoặc trừ hai lần; hai dòng cùng bill chưa đủ kết luận trùng.
6. Source mất, thiếu ca/giá/ID, `RESET_TON_KHO`, ml thiếu density, bì đổi, một nhân viên, nghỉ việc và không owner đều có đường xử lý/ngoại lệ, không giả dữ liệu đủ.
7. Control riêng quán không bị catalogMirror lan; manual floor không bị học tự tắt; unconfirmed/exception/no activity không được tính thành mẫu sạch.
8. Không phát sinh chờ task/model/worker trên đường tạo bill; không trì hoãn check-out chấm công vì kiểm kê. Đóng ca có ngoại lệ giữ việc tiếp và căn cứ người giao/nhận.
9. Model không được dùng phỏng đoán của chính mình làm ground truth, học baseline hao hụt thành mức cho phép, hoặc cập nhật tài chính/lương/định mức người mà không có thẩm quyền.

Mỗi dòng ma trận A/B/F/D/T/C là một nhóm fixture có input events, starting state, expected source refs/quantities/allocations/control/tasks/reads và rollback. Thêm phép kiểm toàn bộ cặp trạng thái–event, kiểm vòng phục hồi có lối ra và inject lỗi vào bộ auditor — bước B0 của [lộ trình](LO_TRINH_ENGINE2_CAP6.md), chưa làm.

## 8. Trạng thái sẵn sàng

| Sản phẩm | Hiện tại | Cửa nghiệm thu |
|---|---|---|
| 1 — Hợp đồng dữ liệu | Đã có schema đề xuất, quy tắc nối nguồn/định giá và bản đồ export | Mapper chưa viết/chưa chạy; cần raw data đủ và đối chiếu 30 ngày |
| 2 — Máy trạng thái | Đã có ba bảng, rule mặc định và ràng buộc revision/lease | Cần hiện thực hóa bảng và tests mọi cặp + race/fault |
| 3 — Ngoại lệ | Đã soạn 15 dòng; chốt ca luôn có pha chế, tự giao việc tại quầy và bàn giao ca sau | Hiện thực hóa/kiểm thử nhánh phục hồi; không cần thiết kế nhân sự dự phòng để bắt đầu |
| 4 — Học/kiểm toán | Đã có phân lớp nhãn, chỉ số, giới hạn và các mốc thử đề xuất | Chưa có model/nhãn đủ/đánh giá; chưa thể chứng nhận cấp 4–6 |
| 5 — Chuyển tiếp/kiểm thử | Đã đối chiếu POS/QL, ranh giới AST và writer chính; đặc tả fence/replay | Chưa có fence Engine2, feature flags chuyển family, replay hay rollout sản xuất |

Điểm “chưa đọc POS” đã được xử lý đối với các đường chính trong bảng writer. **Tài liệu đã đủ để bắt đầu triển khai lõi và luồng P0.** Các quyền dữ liệu dùng cơ chế hiện có; không thêm câu hỏi ai chịu khi thiếu nhóm pha chế hoặc yêu cầu chủ thiết kế cấp quản lý khác. Dữ liệu đầy đủ, replay và kiểm chứng cấp 6 là công việc nghiệm thu trong quá trình xây dựng. Sau yêu cầu bắt đầu, đã triển khai [runtime P0 và kiểm thử](UNIT_ENGINE2_P0_22-10.md). Bảng trên giữ mốc thiết kế ban đầu; nghiệm thu đầy đủ của năm sản phẩm vẫn phải đạt các cửa còn lại.

## 9. Bằng chứng đọc và kiểm cục bộ

- `posgieo.html`: init (~2451), nhận kho (~21239–21845), `refreshPrepYieldStatsPOS` (~12259), cân NL (~18944–19130), check-in/out (~15263), tạo báo mất (~13666).
- `quanlygieo.html`: init (~2961), sửa phiếu nhận (~5790), cutover (~10867), sửa ca (~20225), danh mục/price history (~23838).
- `unit_engine.v20.js`: ledger apply (~1402), lifecycle/prep/shift/duty APIs (~5910), init/C.app (~4940), count BTP (~4705), recompute (~420–550). `C.app` dùng chọn source/luồng, không là ownership epoch.
- `lai_lo.v6.js`: `computeWasteByDateRange` (~1311) đọc NL theo lịch sử giá ngày và BTP theo totalCost.
- `functions/automation/engine.js`: instance riêng mỗi store, gọi Engine v20 với app quanly; không tự là inventory writer mới.
- AST chạy từ thư mục tạm ngoài repo: POS 1.140 hàm (66 có FS writes, 16 RT writes); QL 1.384 hàm (126 có FS writes, 12 RT writes). Đây là số hàm AST nhận diện, **không phải số lỗi hay lượt đọc Firebase**.
- `node tools/check_boundaries.js posgieo.html quanlygieo.html quanlygieo2.html`: PASS trong phạm vi kiểm hiện tại. Chưa chạy mapper/replay mới, chưa sửa source app/JS/worker, chưa ghi Firebase thật.
