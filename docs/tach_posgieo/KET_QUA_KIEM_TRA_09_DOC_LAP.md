# Kết quả kiểm tra độc lập lượt 09 — Chế biến BTP

- Ngày kiểm: 26/10/2026, giờ Việt Nam.
- Nhánh: `Phan-tach-unit-engine`; SHA: `d44b09691fc1994e67d8dffc129cea2d046ea0f7`.
- Đối chứng phần di chuyển: commit cha `47dce41e`; baseline e2e: bộ Giáng sinh `0bd95a7`.
- Đã đọc `KIEM_TRA_09_CHE_BIEN.md`, phần nguồn được tách và các công cụ/test đổi kèm.
- Chỉ kiểm tra, không sửa app/JS phát hành, không deploy, không ghi sổ phát hành.

## Kết luận

**Đạt phần chuyển mã R và các nhánh hoàn thành mẻ / huỷ mẻ / đổ bỏ đã kiểm ở mức phần mềm. Không phát hiện hồi quy mới cần chặn các phần này.** Chưa đủ bằng chứng để gọi toàn bộ luồng chế biến 2B đã được nghiệm thu từ đầu đến cuối: cần bổ sung bài tích hợp bắt đầu nấu trước khi kết luận đầy đủ.

Phân biệt rõ nghiệm thu chuyển mã và nghiệm thu toàn bộ nhánh chế biến: chưa có bài browser so trước/sau cho đường bắt đầu nấu đầy đủ, cổng quét mã/đối chiếu, gợi ý, sửa định lượng và in tem lô thật. Không tuyên bố các phần chưa chạy đã đạt.

## Các kiểm tra thực hiện

Chạy các lệnh ở mục 4 tài liệu lượt 09 trong Git worktree đúng SHA, cộng audit xuyên app và các phép đối chiếu độc lập bên dưới.

| Kiểm tra | Kết quả |
| --- | --- |
| Sinh lại + toàn suite | TẤT CẢ ĐẠT, 150 file test |
| Ranh giới / đường dẫn | Sạch; 109 tên, 875 lời gọi, 54 động đã duyệt |
| Audit xuyên app | 0 trường hợp lỗi, 9 kiểm tra đạt |
| e2e_kho | 158 assertion đạt, 6 kịch bản × GG01/GG02 + 2 tự kiểm |
| e2e_0d | 30 assertion đạt; 1 thất bại do file:// bị môi trường chặn, không coi toàn bài đã đạt |
| e2e_ban | 36 assertion đạt, ALL PASS |
| e2e_hook | 13 assertion đạt, ALL PASS, đủ 25 hàm và tự kiểm |
| BTP âm | ALL PASS, PC/mobile |
| FIFO | 28/28 |
| Nhận hàng | 80/80 |
| Engine 2 | Đạt ở 1366px/390px |
| Gấu Noel | 71/72; Gieo G1–G14 đạt, lỗi kiosk K3 như nền |
| Cú pháp pos_prep.v1.js | Đạt |
| Checksum file prep ở 3 bộ mùa | Giống nhau |

Sinh lại không gây diff tracked; nguồn sạch chỉ có bản test Gấu Noel tạm untracked.

## 168 khai báo và thời điểm khởi tạo

- So nguyên văn từng statement khai báo ở script chính commit cha với file mới: **168/168 giống nhau**, không thấy tên bị đổi trong tập di chuyển.
- Các state đầu file là literal/array/object/regex; `_prepSug.touched` tạo Set rỗng. Không phát hiện initializer đọc localStorage/Firebase/DOM tương tự hồi quy máy in trước đây.
- Các phép đọc `prepSugHist_v1`, `prepSugLead_v1`, `PREP_START_SCAN_LS_KEY` nằm trong hàm, chỉ chạy khi được gọi sau bootstrap/lớp thử/dọn theo quán.
- Script chính vẫn có một phép gán cache `PREP_ITEMS_CACHE_POS`; đây là cập nhật state dùng chung, không phải định nghĩa thứ hai. Không thấy main gán lại các hàm đối chiếu Engine cần dùng.
- `UnitEngine.init` dùng arrow callback `getPreps: () => PREP_ITEMS_CACHE_POS`; `appFns.prepReconClassifyUsage` và `prepReconExtraNeedsReview` cũng là các arrow gọi hàm theo tên lúc chạy. Hàm file mới có trước main; không có bằng chứng Engine giữ một bản hàm cũ đã bị thay sau init.
- File prep thiết yếu vì cả các helper chung lẫn nghiệp vụ sử dụng trực tiếp. Các ca thiếu/chạy dở prep đã được đưa vào e2e_0d, thay vì cho phép main chạy tiếp nửa chừng.

## Kiểm các test đọc nguồn không mất độ phủ

Tạo worktree âm riêng cùng SHA, chỉ thêm một hàm không được gọi vào file prep mới:

```js
function testerForbiddenPrep() {
  PREP_ITEMS_CACHE_POS = list.filter(x => x.active !== false);
  fstore.collection('prep_items_gieogieo').doc('probe')
    .update({ tester_unknown_field: 1 });
}
```

- `da_cua_hang_mo_quan.test.js` thất bại đúng assertion phải nạp đủ BTP.
- `da_cua_hang_b2.test.js` thất bại đúng trường chưa phân loại, báo vị trí trong `js/posgieo/pos_prep.v1.js`.
- Nguồn release không chứa hàm thử. Suite nguồn sạch là bằng chứng riêng, không dùng kết quả bản âm để báo test sản phẩm hỏng.
- `engine_api` đã tìm hằng qua nguồn nối; cách runner bắt dòng FAIL kể cả test exit 0 vẫn là cơ chế hiện có. Không sửa test runner trong lượt tester.

## Các kịch bản mới của bài kho

Hoàn thành mẻ, huỷ mẻ và đổ bỏ BTP được kiểm ở GG01/GG02 với cùng đầu vào trên hai bộ deploy, đồng thời giữ ba kịch bản nhận hàng của lượt 08. Bộ kiểm phạm vi độc lập theo REG vẫn được gọi cho baseline và bản mới, có record sai quán tự chèn để kiểm nối dây.

- Hoàn thành mẻ: kiểm lô active/1950 g, sổ PRODUCTION và bảng cập nhật lô.
- Huỷ mẻ: kiểm lô cancelled và hoàn 500 g theo giao dịch gốc. Việc fixture không có mã NL gây stock_anomalies đã được ghi rõ; không coi nó là thử đầy đủ mọi kiểu hoàn FIFO.
- Đổ bỏ: kiểm UI/lý do, toast huỷ 300 g và sổ WASTE.
- Tự kiểm đổi ghi chú hoàn kho phải làm lệch mục ghi; không thay mã nguồn release để cài lỗi.

`rev` được chuẩn hóa theo trường vì là mốc RT suy từ giờ; không đổi tiền/số lượng hay xóa toàn bộ nội dung giờ như điểm mù F07-2 cũ. Tuy vậy phép so vẫn dựa trên fixture và mock có giới hạn, không chứng nhận mọi metadata backend.

## Trả lời ba câu hỏi của người triển khai

1. **Tham chiếu Engine:** cách truyền hiện tại không cho thấy stale reference; không thấy hai hàm bị gán lại. Giữ test nguồn và e2e sử dụng context thật. Không cần đổi adapter Engine để xử lý lượt R này.
2. **Helper chung trong file prep:** chưa cần thêm file chỉ để rút gọn tên/phụ thuộc. File đang là thiết yếu và có chốt lỗi. Nếu sau này chuyển `round2`/`fmtPrepQty`/`fmtDateTimeShort` sang module tiện ích, làm R riêng, giữ thứ tự tải, cập nhật một định nghĩa, version và các test đọc nguồn. Không mở rộng phạm vi lượt này.
3. **Bắt đầu nấu:** nên có bài browser so trước/sau trước khi đánh dấu **toàn bộ 2B đã nghiệm thu đầy đủ**. Đây là cửa tạo mẻ và trừ NL, có scan/recon/khôi phục. Bộ Node hiện đã có `bat_dau_me`, `nau_nguyen_goi`, `nau_che_bien` kiểm những phần liên quan, nên không đúng nếu nói hoàn toàn chưa có test bắt đầu mẻ. Nhưng chúng trích hàm và stub một số cổng; không thay bài tích hợp browser từ cổng quét/đối chiếu tới tạo lô.

Đề nghị bài tiếp theo bao gồm ít nhất: nấu bình thường theo công thức, NL phải quét nguyên gói, lỗi trước/sau tạo lô và quay lại, nhận diện đúng scope/cache của quán; đối chiếu lượng trừ, txId/inputTrace và trạng thái cooking. Không cần sửa thao tác bán/nấu hiện tại để tạo bài này.

## Giới hạn còn giữ

- Chưa so đầy đủ bắt đầu nấu, sửa yield, prepSug/localStorage theo quán và in tem lô trên thiết bị thật.
- Mock bỏ qua bộ lọc truy vấn, không đủ ngữ nghĩa increment/concurrency/transaction retry; chưa hai quán đồng thời trên backend chung.
- Chưa APK, máy in/quét thật hoặc Firebase production.
- Gấu Noel dùng bản test tạm HTTP thay file:// và đường Chromium phù hợp môi trường; assertion giữ nguyên. Lỗi kiosk đã có không được quy thành lỗi tách BTP.
- `file://` bị browser môi trường chặn; không đánh dấu phần đó đã nghiệm thu.

## Bằng chứng

Worktree nguồn: `/workspace/work/review09` tại SHA đầu tài liệu. Worktree âm: `/workspace/work/review09-negative`. Bản tạm Gấu Noel là file untracked, không thuộc release.

Logs: `/workspace/work/review09-suite.log`, `review09-kho.log`, `review09-0d.log`, `review09-sale.log`, `review09-hook.log`, `review09-btp.log`, `review09-fifo.log`, `review09-receiving.log`, `review09-e2.log`, `review09-gau.log`, `review09-boundaries.log`, `review09-paths.log`, `review09-cross.log`, `review09-negative-active.log`, `review09-negative-fields.log`.

Không thực hiện bước tách tiếp theo. Báo cáo này không tự phê duyệt deploy hoặc bỏ qua nghiệm thu thiết bị.
