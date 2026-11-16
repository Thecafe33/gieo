// Mã lớp «Tự động & Engine 2» của quanlygieo.html (gộp 16/11 — trước là ui.js / engine2_ui.js / ui.css riêng).
// Test và e2e lấy đúng mã đang chạy trong app qua đây, không giữ bản chép thứ hai.
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../../quanlygieo.html'),'utf8');
function khoi(ten){const a='// ['+ten+':BEGIN]\n',b='// ['+ten+':END]',i=html.indexOf(a),j=html.indexOf(b);if(i<0||j<i)throw Error('quanlygieo.html thiếu mốc '+ten);return html.slice(i+a.length,j);}
const css=/<style id="ql-tu-dong">\n([\s\S]*?)<\/style>/.exec(html);if(!css)throw Error('quanlygieo.html thiếu <style id="ql-tu-dong">');
module.exports={ui:khoi('TỰ ĐỘNG-UI'),engine2:khoi('ENGINE2-UI'),css:css[1],html};
