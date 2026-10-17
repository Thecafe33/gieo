// Giao diện quanlygieo.html đồng bộ với manage.html (16–17/10/2026): bảng màu / font / khối CSS cuối / thanh điều hướng dưới.
// Test chỉ khoá những thứ dễ vỡ khi sửa tiếp: (1) màu chủ đạo không bị trả về hồng, (2) khối CSS đồng bộ phải là khối CUỐI (thắng mọi khối trên),
// (3) hai màn POS gốc (#screen-tg, #screen-mn) vẫn giữ màu hồng, (4) thanh dưới chỉ trỏ tới màn có thật, (5) font Inter nhúng.
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const h = fs.readFileSync(path.join(ROOT, 'quanlygieo.html'), 'utf8');
let ok = true; const chk = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) ok = false; };

const css = h.slice(h.indexOf('<style>'), h.indexOf('</style>'));
const root = css.slice(css.indexOf(':root{'), css.indexOf('/* ---------- Reset ---------- */'));
chk(/--gd:#006241;/.test(root) && /--bg:#eef1ee;/.test(root), ':root: màu chủ đạo xanh #006241 + nền #eef1ee (như manage)');
chk(!/#E23A5D/i.test(root.replace(/\/\*[\s\S]*?\*\//g, '')), ':root không còn màu chủ đạo hồng #E23A5D');
chk(/--font:"Inter Local"/.test(root), ':root: --font dùng Inter Local (nhúng sẵn như manage)');
chk((css.match(/font-family:\s*'Inter Local'/g) || []).length === 3, 'nhúng đủ 3 bộ ký tự Inter (Việt / Latin mở rộng / Latin)');

const B = '/* [MANAGE-SKIN:BEGIN] */', E = '/* [MANAGE-SKIN:END] */';
chk(h.split(B).length === 2 && h.split(E).length === 2, 'có đúng 1 khối [MANAGE-SKIN] (BEGIN/END)');
const iE = h.indexOf(E);
chk(h.slice(iE + E.length, iE + E.length + 12).trim().startsWith('</style>'), 'khối [MANAGE-SKIN] nằm CUỐI <style> chính — mọi rule giao diện mới viết TRƯỚC nó sẽ bị nó đè');
const skin = h.slice(h.indexOf(B), iE);
chk(/#screen-tg,#screen-mn\{--gd:#E23A5D;/.test(skin), 'hai màn POS gốc (#screen-tg, #screen-mn) giữ màu hồng (cố ý — "hoàn nguyên theo yêu cầu")');
chk(/\.bottom-nav\{display:none;\}/.test(skin) && /html\.phone-ui \.bottom-nav\{/.test(skin), 'thanh dưới chỉ hiện ở giao diện điện thoại (html.phone-ui)');

// thanh điều hướng dưới: mỗi nút phải trỏ đúng màn có trong menu chính
chk(/<nav class="bottom-nav" id="bottomNav"/.test(h), 'có <nav id="bottomNav">');
const bn = h.slice(h.indexOf('const BOTTOM_NAV = ['), h.indexOf('function renderBottomNav'));
const items = [...bn.matchAll(/\{key:'([a-z0-9:]+)',\s*ic:'(\w+)',\s*label:'([^']+)',\s*go:"([^"]+)"\}/g)];
chk(items.length === 3, 'BOTTOM_NAV có 3 mục (+ "Thêm" mở menu)');
const navSec = h.slice(h.indexOf('const NAV_SECTIONS = ['), h.indexOf('const NAV_LABEL'));
for (const m of items) chk(navSec.includes(`key:'${m[1]}'`) && navSec.includes(`go:"${m[4]}"`), `BOTTOM_NAV "${m[3]}" trỏ đúng mục menu ${m[1]} (${m[4]})`);
const rs = h.slice(h.indexOf('function renderSidebarNav(){'), h.indexOf('function renderSidebarNav(){') + 300);
chk(rs.includes('renderBottomNav();'), 'renderSidebarNav gọi renderBottomNav (đổi màn → nút sáng theo)');
const sbs = h.slice(h.indexOf('function renderSbStore()'), h.indexOf('// Mở bảng chọn quán.'));
chk(sbs.includes('class="sb-store') && !/#f3c6cf|#fdf1f3|#eef4ff/i.test(sbs), 'nút chọn quán dùng class .sb-store, không còn style inline hồng');
for (const sel of ['.sb-store{', '.sidebar-item', '.shift-badge{']) chk(skin.includes(sel), `khối [MANAGE-SKIN] có ${sel}`);
console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
