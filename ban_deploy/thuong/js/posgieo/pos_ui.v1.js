// POS Gieo — tiện ích giao diện dùng chung, tách từ posgieo.html (kế hoạch docs/KE_HOACH_TACH_POSGIEO_DA_CUA_HANG.md, bước 0D).
// Nạp TRƯỚC <script> chính; CHỈ khai báo (không lệnh tự chạy). ĐÃ PHÁT HÀNH thì KHÔNG sửa nội dung — tạo pos_ui.v2.js
// và trỏ posgieo.html tới (sổ tools/js_da_phat_hanh.json, test js_bat_bien).
(window.PosGieoMods = window.PosGieoMods || {}).ui = 'dang';

// escHtmlPos — escape HTML cho chữ hiển thị (tên món, tên khách… chèn vào innerHTML). Dùng cả ở màn nhập mã quán
// (posStoreLoginScreen chạy TRƯỚC chốt dừng chưa gắn quán) → phải có trước script chính.
function escHtmlPos(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

PosGieoMods.ui = true;
