// Mọi ngày "hôm nay / khoảng ngày" phải theo GIỜ VIỆT NAM (chủ dự án 16/10/2026: "tất cả phải theo giờ VN").
// toISOString() trả ngày UTC → từ 0h đến 7h sáng VN ra ngày hôm trước; 0h VN đổi ra UTC cũng thành ngày hôm trước.
const fs = require('fs'); const path = require('path');
const { extract } = require('./lib/extract');
const ROOT = path.resolve(__dirname, '..');
let ok = true; const chk = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) ok = false; };

const { _vnYmd } = new Function(extract('pos.html', ['_vnYmd']) + '\nreturn { _vnYmd };')();
const at = s => new Date(s);
chk(_vnYmd(at('2026-10-15T00:30:00+07:00')) === '2026-10-15', 'pos _vnYmd: 0h30 sáng VN 15/10 → 15/10 (UTC là 14/10)');
chk(_vnYmd(at('2026-10-15T06:59:00+07:00')) === '2026-10-15', 'pos _vnYmd: 6h59 sáng VN → đúng ngày');
chk(_vnYmd(at('2026-10-15T23:59:00+07:00')) === '2026-10-15', 'pos _vnYmd: 23h59 VN → đúng ngày');
chk(_vnYmd(at('2026-10-12T00:00:00+07:00')) === '2026-10-12', 'pos _vnYmd: 0h VN đầu tuần → đúng ngày ("Tuần trước" không lệch)');

// Không còn lấy ngày bằng toISOString() ở các file của quán (giữ giờ máy / giờ VN)
const UTC_DATE = /toISOString\(\)\s*\.\s*(split\(\s*['"]T['"]\s*\)|slice\(\s*0\s*,\s*(7|10)\s*\)|substr(ing)?\(\s*0\s*,\s*(7|10)\s*\))/;
for (const f of ['pos.html', 'PosX.html', 'manage.html', 'index.html', 'cham_cong.v3.js']) {
  const p = path.join(ROOT, f); if (!fs.existsSync(p)) continue;
  const bad = fs.readFileSync(p, 'utf8').split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => UTC_DATE.test(l) && !/7 \* 3600000|\+ *7 *\* *36e5|tzOffset/.test(l));
  chk(!bad.length, f + ': không lấy ngày theo UTC' + (bad.length ? ' — dòng ' + bad.map(b => b[0]).join(', ') : ''));
}
console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
