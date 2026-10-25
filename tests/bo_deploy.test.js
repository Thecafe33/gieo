// ban_deploy/{thuong,giangsinh,tet} phải khớp file gốc hiện tại (sinh bằng node tools/tao_bo_deploy.js) — sửa gốc mà quên sinh lại thì báo.
const fs = require('fs'); const path = require('path');
const { dung, OUT } = require('../tools/tao_bo_deploy.js');
let ok = true; const chk = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) ok = false; };
const kq = dung();
// liệt kê ĐỆ QUY (bộ có thư mục con js/posgieo/… — kế hoạch tách posgieo T13)
const lietKe = (d, pre = '') => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? lietKe(path.join(d, e.name), pre + e.name + '/') : [pre + e.name]);
const { jsCucBoCua } = require('../tools/tach_posgieo/nguon');
for (const ten of Object.keys(kq)) {
  const dir = path.join(OUT, ten), co = fs.existsSync(dir) ? lietKe(dir).sort() : [];
  const can = Object.keys(kq[ten]).sort();
  chk(JSON.stringify(co) === JSON.stringify(can), 'ban_deploy/' + ten + ': đủ đúng các file (thiếu / thừa → chạy node tools/tao_bo_deploy.js)');
  const lech = can.filter(f => co.includes(f) && !fs.readFileSync(path.join(dir, f)).equals(Buffer.from(kq[ten][f])));
  chk(!lech.length, 'ban_deploy/' + ten + ': nội dung khớp file gốc' + (lech.length ? ' — lệch: ' + lech.join(', ') + ' (chạy node tools/tao_bo_deploy.js)' : ''));
  const eng=require('./lib/engine_file'),n=Number(/v(\d+)/.exec(eng)[1]);
  chk(n<2 || !!kq[ten]['unit_engine.v'+(n-1)+'.js'], 'ban_deploy/'+ten+': giữ engine trước để quay lui/HTML cũ');
}
const s = (ten, f) => String(kq[ten][f] || '');
// mọi JS cục bộ mà HTML trong bộ nạp (kể cả js/… và chuỗi nạp lại) đều có trong bộ, đúng đường đầy đủ
for (const ten of Object.keys(kq)) {
  const thieu = Object.keys(kq[ten]).filter(f => f.endsWith('.html')).flatMap(h => jsCucBoCua(s(ten, h)).filter(f => !kq[ten][f]).map(f => h + '→' + f));
  chk(!thieu.length, 'ban_deploy/' + ten + ': mọi JS cục bộ HTML nạp đều có trong bộ' + (thieu.length ? ' — thiếu: ' + thieu.join(', ') : ''));
  const ds = s(ten, 'DANH_SACH.txt');
  chk(Object.keys(kq[ten]).filter(f => f.includes('/')).every(f => ds.includes('  ' + f + '\n')), 'ban_deploy/' + ten + ': DANH_SACH ghi đủ đường tương đối của file trong thư mục con');
}
// lõi POS Gieo (js/posgieo/…) GIỐNG HỆT nhau ở ba bộ mùa
{
  const lo = ten => Object.keys(kq[ten]).filter(f => f.startsWith('js/posgieo/')).sort();
  const cung = JSON.stringify(lo('thuong')) === JSON.stringify(lo('giangsinh')) && JSON.stringify(lo('thuong')) === JSON.stringify(lo('tet'))
    && lo('thuong').every(f => Buffer.from(kq.thuong[f]).equals(Buffer.from(kq.giangsinh[f])) && Buffer.from(kq.thuong[f]).equals(Buffer.from(kq.tet[f])));
  chk(cung, 'js/posgieo/… giống hệt nhau ở ba bộ mùa (' + lo('thuong').length + ' file)');
}
chk(['pos.html', 'PosX.html', 'posgieo.html', 'kiosk.html', 'index.html', 'posgieo_thu.html'].every(f => !/gau_noel_giangsinh/.test(s('thuong', f)) && !/lixi\.v\d/.test(s('thuong', f))), 'bản thường: không Gấu Noel, không lì xì');
chk(['pos.html', 'PosX.html', 'posgieo.html', 'kiosk.html', 'index.html'].every(f => /gau_noel_giangsinh\.v\d+\.js/.test(s('giangsinh', f))) && !!kq.giangsinh['gau_noel_giangsinh.v2.js'], 'bản Giáng sinh: 5 app nạp Gấu Noel + có file .js');
chk(/BẢN GIÁNG SINH/.test(s('giangsinh', 'index.html')) && /BẢN TẾT 2027/.test(s('tet', 'index.html')), 'index đúng mùa (Giáng sinh / Tết)');
chk(['pos.html', 'PosX.html', 'index.html'].every(f => /lixi\.v1\.js/.test(s('tet', f))) && !Object.keys(kq.tet).some(f => /gau_noel/.test(f) || (/\.html$/.test(f) && /gau_noel_giangsinh/.test(s('tet', f)))), 'bản Tết: lì xì ở pos / PosX / index, không Gấu Noel');
console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
