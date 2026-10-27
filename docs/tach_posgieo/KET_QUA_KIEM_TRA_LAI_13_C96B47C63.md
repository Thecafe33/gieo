# Kiểm tra lại phản hồi lượt 13

- Ngày: 27/10/2026, giờ Việt Nam.
- Nhánh: `Phan-tach-unit-engine`.
- SHA kiểm: `c96b47c63e4b88cf867ccd782a4d7c80723fe31e`.
- Detached worktree riêng: `/workspace/work/retest13`.

## Kết luận

**ĐẠT phản hồi, đóng F13-1.** Tài liệu đã đính chính đúng phạm vi của `e2e_btp_am`. Hai ca mới trong công cụ chính có bằng chứng thực thi qua màn thật và so với bộ Giáng sinh `0bd95a7` ở cả GG01/GG02. Chưa phát hiện finding mới.

Diff so với SHA đã kiểm `52176ec52` chỉ gồm tài liệu và `tools/tach_posgieo/e2e_kho.js`; không thay app, module phát hành, mock Firebase hoặc bộ deploy. Lượt này kiểm tập trung thay đổi công cụ; không chạy lại toàn bộ 780 khẳng định/151 file test và không nhận các con số trong phản hồi là kết quả tự chạy lại. Kết quả đầy đủ của lượt trước nằm trong `KET_QUA_KIEM_TRA_13_DOC_LAP.md`.

## Bài đã chạy

```sh
npm install --ignore-scripts
E2E_KHO_DUMP=/workspace/work/retest13-dump node tools/tach_posgieo/e2e_kho.js --chi caMoCaDayDu,ketDemBTP
```

**63 khẳng định, ALL PASS**, gồm hai ca × hai cửa hàng và ba tự kiểm cài lỗi. Bốn dump khớp `ghi`, `toasts`, `sau`, `loiKB`, `loi` giữa mốc và bản hiện tại.

| Ca | Bằng chứng |
| --- | --- |
| `caMoCaDayDu` | Mở 1.200.000 bởi e1 qua PIN thật; kiểm kê Trà lài 900; tick `lau`; về `sm`; `busy1=false`, `busy2=false`, `busy=false`; callback tiếp sau kiểm kê đúng 1 lần. Có 8 lượt ghi, đúng tập bảng và phạm vi cửa hàng. |
| `ketDemBTP` | Đi qua màn đếm BTP, bấm nút cân và nút xác nhận; lô 500 g được chốt 480 g, phiếu lệch −20; callback tiếp sau đếm đúng 1 lần, `busy=false`. Có 11 lượt ghi, đúng tập bảng và phạm vi cửa hàng. |

Cả ba tự kiểm đều bắt lệch: gọi tiếp sau kiểm kê hai lần; số kiểm kê +1; gọi tiếp sau đếm BTP hai lần. Các lượt ghi chèn sang cửa hàng khác cũng bị bộ kiểm REG bắt.

## Probe độc lập: chờ hoàn tất mở ca

Mã mới vẫn dùng `Promise.race([thaoTac(), sleep(15000)])` cho ba thao tác mở ca/kiểm kê/tick checklist, dù phần mô tả nói chờ hoàn tất. Các khẳng định busy và trạng thái cuối đã giúp kiểm việc đi tới đích; để kiểm trực tiếp thêm, tester tạo bản sao runner và thay đúng ba chỗ 15 giây bằng:

```js
await submitShiftOpen();
await submitShiftInventoryCountPOS();
await tickChecklistItem('lau');
```

Giữ giới hạn tổng 45 giây của runner, không sửa app. Chạy lại hai ca và ba tự kiểm: **63 khẳng định, ALL PASS**. Vì vậy fixture hiện tại thực sự hoàn tất, không chỉ hết cửa sổ chờ rồi lấy log. Có thể cải thiện công cụ sau này bằng timeout ném lỗi thay vì timeout resolve, để thông báo rõ hơn nếu xảy ra treo.

Log: `/workspace/work/retest13-target.log`, `/workspace/work/retest13-strict.log`; probe: `retest13/tools/tach_posgieo/e2e_strict.tester.js`. Các file này chỉ ở workspace tester; không sửa mã ứng dụng.

## Giới hạn giữ nguyên

- `ketDemBTP` dùng bộ cân giả trả 480 g, không kiểm thiết bị cân/cân trừ bì thật. Có PIN thật trong fixture, engine thật, Firebase giả.
- Bài đếm BTP bổ sung chứng minh một lô và callback sang bước tiếp, không phải một phiên nối trọn 8 bước kết ca.
- Nhánh mở ca có đếm bàn giao tồn hôm trước/lô hết hạn, giao ca lệch/đếm chung/bill chen giữa, đóng ngày do bill mới/việc bắt buộc, nửa đêm VN, APK/Firebase thật/hai cửa hàng đồng thời vẫn chưa được chứng nhận ở đây.
- Không chạy lại `file://` trong lượt này; giới hạn môi trường `ERR_BLOCKED_BY_ADMINISTRATOR` của lượt trước không được coi là đã giải quyết.
- Probe chặn đóng ngày khi nhân viên quay lại ca của tester lượt trước chưa được đưa vào công cụ chính trong commit này; đó là đề nghị còn có thể bổ sung, không làm mất hiệu lực kết quả đã kiểm trước.

Không deploy, không ghi sổ phát hành, không thay app/JS phát hành.
