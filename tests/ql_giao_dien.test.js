// Giao diện quanlygieo.html theo HÌNH DÁNG của manage.html (17/10/2026): font Inter, sidebar kính nổi, viên thuốc, thanh điều hướng dưới (điện thoại).
// Chủ dự án 17/10 yêu cầu nền hồng theo cách manage; màu chủ đạo vẫn HỒNG (#E23A5D). Test khoá:
// (1) bảng màu :root giữ accent/chữ/ngữ nghĩa, nền hồng theo yêu cầu 17/10, (2) khối CSS [MANAGE-SKIN] là khối CUỐI (thắng mọi khối trên)
// và KHÔNG chứa màu xanh manage, (3) thanh dưới chỉ trỏ tới màn có thật, (4) font Inter nhúng.
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const h = fs.readFileSync(path.join(ROOT, 'quanlygieo.html'), 'utf8');
let ok = true; const chk = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) ok = false; };

const css = h.slice(h.indexOf('<style>'), h.indexOf('</style>'));
const root = css.slice(css.indexOf(':root{'), css.indexOf('/* ---------- Reset ---------- */'));
chk(/--gd:#E23A5D;/.test(root) && /--gm:#B7284A;/.test(root) && /--gl:#FDECF0;/.test(root), ':root: màu chủ đạo vẫn là HỒNG #E23A5D (không đổi màu app)');
chk(/--bg:#F8EFF2;/.test(root) && /--td:#17151A;/.test(root) && /--bad:#D2333F;/.test(root) && /--ok:#12855A;/.test(root), ':root: nền hồng mới; chữ và màu ngữ nghĩa giữ nguyên');
chk(!/#006241|#eef1ee/i.test(css), 'không có màu xanh #006241 / nền #eef1ee của manage trong CSS');
chk(/--font:"Inter Local"/.test(root), ':root: --font dùng Inter Local (nhúng sẵn như manage)');
chk((css.match(/font-family:\s*'Inter Local'/g) || []).length === 3, 'nhúng đủ 3 bộ ký tự Inter (Việt / Latin mở rộng / Latin)');

const B = '/* [MANAGE-SKIN:BEGIN] */', E = '/* [MANAGE-SKIN:END] */';
chk(h.split(B).length === 2 && h.split(E).length === 2, 'có đúng 1 khối [MANAGE-SKIN] (BEGIN/END)');
const iE = h.indexOf(E);
chk(h.slice(iE + E.length, iE + E.length + 12).trim().startsWith('</style>'), 'khối [MANAGE-SKIN] nằm CUỐI <style> chính — mọi rule giao diện mới viết TRƯỚC nó sẽ bị nó đè');
const skin = h.slice(h.indexOf(B), iE);
chk(!/#006241|#1ba96f|#12855a|#0b6644|--gd\s*:/i.test(skin), 'khối [MANAGE-SKIN] không đặt lại màu chủ đạo / gradient xanh (chỉ hình dáng)');
chk(!/\.kcard\.kcard-wide(\.lv-[a-z]+)?\{[^}]*background/.test(skin), 'khối [MANAGE-SKIN] không đụng nền gradient thẻ doanh thu');
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
for (const sel of ['.sb-store{', '.sidebar-item']) chk(skin.includes(sel), `khối [MANAGE-SKIN] có ${sel}`);
const tile = h.slice(h.indexOf('const SB_TILE = {'), h.indexOf('};', h.indexOf('const SB_TILE = {')));
chk(/stethoscope:'#FF2D55'/.test(tile), 'icon menu (SB_TILE) giữ màu gốc');
const qa = h.slice(h.indexOf('function todayQuickAccessHTML(){'), h.indexOf('// [MỚI] Badge "Ca hiện tại"'));
chk(qa.includes("c:'#0062AD'") && qa.includes('style="background:${x.c}17"'), '«Truy cập nhanh» giữ ô tô màu gốc');
// Widget màn Hôm nay (Bill bán hàng / Hoạt động kho / Hoạt động BTP): đổi GIAO DIỆN, chức năng giữ nguyên
for (const id of ['todayBills', 'todayKhoFeed', 'todayPrepFeed']) chk(new RegExp(`<div id="${id}" class="wdg `).test(h), `#${id} là widget (.wdg)`);
chk(skin.includes('.wdg{') && skin.includes('.wdg:empty{display:none;}'), 'CSS widget có mặt, widget rỗng thì ẩn');
const bf = h.slice(h.indexOf('function bfTieuDe(n){'), h.indexOf('// Nhãn phương thức thanh toán'));
chk(bf.includes('onclick="goBills()"'), 'bill: nút «Xem tất cả» vẫn gọi goBills()');
const rb = h.slice(h.indexOf('function renderBillFeed(){'), h.indexOf('// [NEW] LỊCH SỬ BILL'));
chk(rb.includes("bfToggle('${key}')") && rb.includes('bfChiTiet(o)'), 'bill: bấm hàng vẫn bung chi tiết ngay tại chỗ (bfToggle + bfChiTiet), không mở popup');
const kf = h.slice(h.indexOf('function khoFeedHTML(list){'), h.indexOf('function feedDateLabel'));
chk(kf.includes('openKhoFeedSheet()') && kf.includes('toggleKhoFeed()') && kf.includes("goContainers('open')"), 'kho: còn nút «Mở rộng» / gập-mở / «Xem hàng đang mở»');
const pf = h.slice(h.indexOf('function prepFeedHTML(list){'), h.indexOf('let _prepFeedSheetDate'));
chk(pf.includes('openPrepFeedSheet()') && pf.includes('togglePrepFeed()') && pf.includes("goKho2('prep')") && pf.includes("ctnShowDetail('${b.id}','prep_batches_gieogieo')"), 'BTP: còn nút «Mở rộng» / gập-mở / «Xem tất cả BTP» / bấm dòng mở chi tiết lô');
chk(/<div class="wdg wdg-hour">[\s\S]*?<div id="todayHourly"><\/div>/.test(h), 'biểu đồ theo giờ nằm trong widget, #todayHourly giữ nguyên');
// Tab Tiền mặt + Chi phí thành widget: mọi id / hàm cũ còn nguyên (chỉ đổi khung bao quanh)
const rc = h.slice(h.indexOf('async function renderEntryCash(){'), h.indexOf('// [KẾT CA] Ai kết ca và mất bao lâu'));
for (const id of ['cashKpis', 'cashViewDateInput', 'cashToleranceInput', 'handoverToleranceInput', 'cashRetainInput', 'staleDaysBox', 'segTimeline', 'cashDetail', 'cashDrawerLog', 'cashHistory'])
  chk(rc.includes(`id="${id}"`), `tab Tiền mặt còn #${id}`);
chk(rc.includes('submitCashSettings()') && rc.includes('renderEntryCash();">Xem</button>'), 'tab Tiền mặt: nút «Xem» + lưu cấu hình vẫn như cũ');
chk(rc.includes('cashKpiHTML(detail)'), 'tab Tiền mặt: ô tổng hợp đầu màn được điền từ detail');
const re = h.slice(h.indexOf('async function renderEntryExp(){'), h.indexOf('async function submitExpense(){'));
for (const id of ['expCat', 'expAmt', 'expTypeSeg', 'expKindSeg', 'expOnetimeFields', 'expPeriodFields', 'expDate', 'expStart', 'expEnd', 'expPaid', 'expNote', 'expList'])
  chk(re.includes(`id="${id}"`), `tab Chi phí còn #${id}`);
for (const fn of ['submitExpense()', 'doApproveExpense(', 'doRejectExpense(', 'openExpenseActual(', 'openExpensePaid(', 'expConfigOpen=!expConfigOpen', 'seedExpenseCategories()'])
  chk(re.includes(fn), `tab Chi phí còn gọi ${fn}`);
chk(re.includes('filterExpenses(list, _m0, _m1)') && re.includes('splitExpensesByCostType('), 'tab Chi phí: ô tổng hợp dùng đúng hàm lãi/lỗ (filterExpenses + splitExpensesByCostType), không tự tính riêng');
console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
