// ban_deploy/{thuong,giangsinh,tet} phải khớp file gốc hiện tại (sinh bằng node tools/tao_bo_deploy.js) — sửa gốc mà quên sinh lại thì báo.
const fs = require('fs'); const path = require('path');
const { dung, OUT } = require('../tools/tao_bo_deploy.js');
let ok = true; const chk = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) ok = false; };
const kq = dung();
for (const ten of Object.keys(kq)) {
  const dir = path.join(OUT, ten), co = fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
  const can = Object.keys(kq[ten]).sort();
  chk(JSON.stringify(co) === JSON.stringify(can), 'ban_deploy/' + ten + ': đủ đúng các file (thiếu / thừa → chạy node tools/tao_bo_deploy.js)');
  const lech = can.filter(f => co.includes(f) && !fs.readFileSync(path.join(dir, f)).equals(Buffer.from(kq[ten][f])));
  chk(!lech.length, 'ban_deploy/' + ten + ': nội dung khớp file gốc' + (lech.length ? ' — lệch: ' + lech.join(', ') + ' (chạy node tools/tao_bo_deploy.js)' : ''));
}
const s = (ten, f) => String(kq[ten][f] || '');
chk(['pos.html', 'PosX.html', 'posgieo.html', 'kiosk.html', 'index.html', 'posgieo_thu.html'].every(f => !/gau_noel_giangsinh/.test(s('thuong', f)) && !/lixi\.v\d/.test(s('thuong', f))), 'bản thường: không Gấu Noel, không lì xì');
chk(['pos.html', 'PosX.html', 'posgieo.html', 'kiosk.html', 'index.html'].every(f => /gau_noel_giangsinh\.v\d+\.js/.test(s('giangsinh', f))) && !!kq.giangsinh['gau_noel_giangsinh.v2.js'], 'bản Giáng sinh: 5 app nạp Gấu Noel + có file .js');
chk(/BẢN GIÁNG SINH/.test(s('giangsinh', 'index.html')) && /BẢN TẾT 2027/.test(s('tet', 'index.html')), 'index đúng mùa (Giáng sinh / Tết)');
chk(['pos.html', 'PosX.html', 'index.html'].every(f => /lixi\.v1\.js/.test(s('tet', f))) && !Object.keys(kq.tet).some(f => /gau_noel/.test(f) || (/\.html$/.test(f) && /gau_noel_giangsinh/.test(s('tet', f)))), 'bản Tết: lì xì ở pos / PosX / index, không Gấu Noel');
console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
