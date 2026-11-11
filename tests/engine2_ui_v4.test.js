'use strict';
// quanlygieo2 › Engine 2 › Kết quả thực thi (05/11 lượt 3): bảng «Engine 2 nhận / POS tự ghi» theo ngày, cảnh báo máy POS chạy cầu nối cũ.
// Chạy đúng mã nguồn các hàm dựng HTML trong tools/automation/engine2_ui.js (không chép lại) + kiểm quanlygieo2.html đã sinh có chúng.
const assert=require('node:assert'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../tools/automation/engine2_ui.js'),'utf8');
const grab=re=>{const m=re.exec(src);assert(m,'không thấy '+re);return m[0];};
const body=[/ const FALLBACK=\{[\s\S]*?\};\n/,/ const BRIDGE_NOW=\d+;\n/,/ const bridgeLabel=[^\n]*\n/,/ function fleetWarnHTML\(list\)\{[\s\S]*?\n \}\n/,/ function dailyHTML\(cfg\)\{[\s\S]*?\n \}\n/].map(grab).join('');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const F=new Function('esc',body+';return {dailyHTML,fleetWarnHTML,bridgeLabel};')(esc);
const now=new Date().toISOString();
assert(/Chưa có số liệu/.test(F.dailyHTML({})),'chưa có bộ đếm → báo chưa có số liệu');
const h=F.dailyHTML({e2Daily:{'2026-11-04':{e2:3,fb:{manual_entry:1}},'2026-11-05':{e2:1,fb:{manual_entry:2,worker_stale:1},fbTotal:3}}});
assert(h.indexOf('2026-11-05')<h.indexOf('2026-11-04'),'ngày mới nhất lên đầu');
assert(/<td>2026-11-05<\/td><td>1<\/td><td>3<\/td><td>25%<\/td><td>Gõ số tay[^<]*\(2\)/.test(h),'Engine 2 nhận 1 / POS tự ghi 3 → 25%, lý do chính kèm số lần: '+h);
assert(!/<script|onerror/.test(F.dailyHTML({e2Daily:{'<script>':{e2:1}}})),'ngày lạ được escape');
assert.equal(F.fleetWarnHTML([{bridgeVersion:5,ackedAt:now}]),'','mọi máy v5 → không cảnh báo');   // [11/11] cầu nối hiện hành v5 (máy v4 = bản cũ)
assert(/1 máy POS trong 7 ngày qua còn chạy bản cầu nối cũ/.test(F.fleetWarnHTML([{bridgeVersion:5,ackedAt:now},{ackedAt:now},{ackedAt:'2026-01-01T00:00:00Z'}]))&&/2 máy POS/.test(F.fleetWarnHTML([{bridgeVersion:4,ackedAt:now},{ackedAt:now}])),'máy chưa ghi phiên bản (bản cũ) trong 7 ngày → cảnh báo; máy lâu không mở không tính');
assert(/cầu nối v5/.test(F.bridgeLabel({bridgeVersion:5}))&&/cầu nối cũ v4/.test(F.bridgeLabel({bridgeVersion:4}))&&/cầu nối cũ</.test(F.bridgeLabel({})));
const ql2=fs.readFileSync(path.join(__dirname,'../quanlygieo2.html'),'utf8');
assert(ql2.includes('function dailyHTML(cfg)')&&ql2.includes('function fleetWarnHTML(list)'),'quanlygieo2.html (sinh tự động) có phần mới — chạy tools/sinh_lai_tat_ca.sh');
console.log('ok quanlygieo2: bảng Engine 2 nhận / POS tự ghi theo ngày (tỉ lệ, lý do chính, escape); cảnh báo máy POS chạy cầu nối cũ');
console.log('ALL PASS');
