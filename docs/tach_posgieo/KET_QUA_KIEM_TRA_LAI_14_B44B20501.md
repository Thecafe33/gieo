# Kiểm tra lại phản hồi lượt 14

- Ngày: 27/10/2026, giờ Việt Nam.
- SHA kiểm: `b44b20501efe713193b59240466dd991dc8e0170`, nhánh `Phan-tach-unit-engine`.
- Worktree detached riêng: `/workspace/work/retest14`.

## Kết luận

**ĐẠT phản hồi 14.** Mock `add()` đã cài lỗi thật; hai probe mở két đã vào công cụ chính và bắt được lệnh mở két nhân đôi. Không phát hiện finding mới.

Diff của commit chỉ gồm tài liệu, test và công cụ. Không thay app/JS phát hành/bộ deploy. Kiểm tập trung thay đổi này, không chạy lại toàn bộ bộ kho hoặc 151 file test; kết quả 910 khẳng định đầy đủ trước đó thuộc báo cáo `KET_QUA_KIEM_TRA_14_DOC_LAP.md`, không nhận là kết quả chạy lại ở đây.

## Bài đã thực hiện

| Bài | Kết quả |
| --- | --- |
| `node tests/tach_posgieo_fb_gia.test.js` | 36 khẳng định, ALL PASS |
| `node tools/tach_posgieo/e2e_kho.js --chi moKetPin,moKetNhatKyLoi` | 51 khẳng định, ALL PASS; GG01/GG02 so mốc Giáng sinh `0bd95a7` |
| `node tools/tach_posgieo/e2e_ban.js` | 36 khẳng định, ALL PASS; kiểm đường bán dùng add bình thường và tự kiểm |
| Test mock mới chạy với mock cũ ở lượt 14 | Trượt đúng ca mới: add bỏ qua __HONG; trước reject=false, seed có 1 bản ghi lỗi và 2 bản ghi sau retry |
| Probe Node VM độc lập | 4/4 PASS: lỗi nhắm GG02 không áp sang GG01; hai lần reject không ghi seed; hết số lần lỗi thì retry ghi đúng một lần; lượt lỗi không tính vào __ghiAdd thành công |

Bốn dump của hai ca × hai cửa hàng khớp `ghi`, `toasts`, `sau`, `loiKB`, `loi` giữa mốc và bản hiện tại:

- `moKetPin`: PIN sai gửi 0 lệnh; PIN đúng e2 gửi 1 lệnh và ghi đúng 1 nhật ký; tấm đóng. Phạm vi REG đúng quán. Cài hai lần `openDrawer()` bị bắt ở mục `sau`, không phụ thuộc việc nhật ký có đổi.
- `moKetNhatKyLoi`: đúng 1 lệnh két, tấm đóng, duy nhất `add!hong`, không có add thành công; cảnh báo CHƯA ghi được nhật ký xuất hiện ở cả hai quán.

Mock gọi `hong('add', path)` trước ghi log thành công, tạo ID và áp seed. Do đó lỗi không tạo bản ghi giả thành công như bản cũ. Probe retry kiểm thêm việc phạm vi đường dẫn và số lần lỗi thực sự được tôn trọng.

## Giới hạn

- Máy in/két giả, không kiểm thiết bị hay APK thật.
- Reject Promise không chứng minh offline persistence/hàng đợi retry của Firebase SDK.
- Increment vẫn chỉ ghi số gia, orderBy/limit và listener còn hạn chế như báo cáo trước.
- Không chứng nhận toàn bộ 8 bước kết ca hoặc hai cửa hàng production chạy đồng thời.
- Không chạy lại file://; giới hạn môi trường của lượt trước vẫn còn.

Log `/workspace/work/retest14-{mock,target,sale,oldmock,add}.log`; dump `retest14-dump/`. Không sửa app, không deploy, không ghi sổ phát hành.
