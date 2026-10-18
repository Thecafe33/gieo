// lai_lo.v4.js (16/10) — bộ tính lãi / lỗ Gieo dùng chung, SINH từ quanlygieo.html (tools/tao_lai_lo.js).
//   · File đã sinh còn khớp quanlygieo (quanlygieo đổi công thức mà quên sinh lại → hỏng ở đây).
//   · Chạy thật với Firestore giả: doanh thu, giá vốn, chi phí theo kỳ, khấu hao ra đúng; đọc đúng bảng của quán gg02.
//   · Chi phí chỉ đọc khoản chạm khoảng ngày; 3 bảng lịch sử lần sau chỉ đọc mốc mới.
//   · Cùng số với computeDayPL của quanlygieo (trích thẳng từ quanlygieo.html).
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const near = (a, b, m) => eq(Math.abs(a - b) < 0.01, true, m + ' (' + a + ' ≈ ' + b + ')');

try { execFileSync('node', [path.join(__dirname, '..', 'tools', 'tao_lai_lo.js'), '--check'], { stdio: 'pipe' }); eq(true, true, 'lai_lo.v4.js khớp quanlygieo.html'); }
catch (e) { eq(String(e.stdout), 'KHỚP', 'lai_lo.v4.js khớp quanlygieo.html'); }

// ---- manage: ngày nào phải tự tính (plNeedDays) ----
{
  const DA0 = require('fs').readdirSync(path.join(__dirname, '..')).filter(f => /^data_access\.v\d+\.js$/.test(f)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]).pop();
  const N = new Function('window', extract('manage.html', ['pad', 'parseDkey', 'addDays', 'dkey', 'plNeedDays']) + '\nconst PL_TODAY_TTL = 10 * 60000, PL_COMPUTE_BACK = 62;\nreturn plNeedDays;')({ GieoData: require(path.join(__dirname, '..', DA0)).GieoData });
  const now = Date.parse('2026-10-16T08:00:00Z');            // 15h giờ VN
  const by = {
    '2026-10-13': { updatedAt: '2026-10-14T02:00:00Z' },      // ghi sau khi ngày 13 đã hết → đủ
    '2026-10-14': { updatedAt: '2026-10-14T09:00:00Z' },      // ghi lúc 16h ngày 14 (còn bán tiếp) → cũ
    '2026-10-16': { updatedAt: '2026-10-16T07:55:00Z' }       // hôm nay, ghi 5 phút trước → còn mới
  };
  eq(N(by, '2026-10-13', '2026-10-16', now), ['2026-10-14', '2026-10-15'], 'Tính: ngày thiếu (15) + ngày ghi giữa chừng (14); bỏ ngày đã đủ (13) và hôm nay còn mới');
  eq(N(by, '2026-10-16', '2026-10-16', now + 6 * 60000), ['2026-10-16'], 'Hôm nay ghi quá 10 phút → tính lại');
  eq(N({}, '2026-01-01', '2026-10-16', now).length, 63, 'Chỉ tự tính 62 ngày gần nhất (+ hôm nay)');
  eq(N({}, '2026-10-16', '2026-10-31', now), ['2026-10-16'], 'Không tính ngày tương lai');
  eq(N(by, '2026-10-13', '2026-10-13', now, { '2026-10-13_': '2026-10-15T00:00:00Z' }), ['2026-10-13'], 'manage dùng dấu thay đổi: ngày 13 đã đủ nhưng có khoản thu-chi ghi sau → tính lại');
}
// ---- Firestore / RT giả, đếm lượt đọc theo bảng ----
const FS = {}, RT = {}, reads = {}, LS = {};
const ID = '__id';
const dataOf = (c, id) => (FS[c] || {})[id];
function query(c, f) {
  return {
    where: (k, op, v) => query(c, f.concat([[k, op, v]])), orderBy: () => query(c, f), limit: () => query(c, f),
    get: async () => {
      const docs = Object.entries(FS[c] || {}).filter(([id, d]) => f.every(([k, op, v]) => { const x = k === ID ? id : d[k]; if (x == null) return false; return op === '>=' ? x >= v : op === '<=' ? x <= v : op === '>' ? x > v : op === '==' ? x === v : true; }))
        .map(([id, d]) => ({ id, exists: true, data: () => JSON.parse(JSON.stringify(d)) }));
      reads[c] = (reads[c] || 0) + Math.max(1, docs.length);
      return { docs, size: docs.length, empty: !docs.length, forEach: fn => docs.forEach(fn) };
    },
    doc: id => ({ id, get: async () => { reads[c] = (reads[c] || 0) + 1; const d = dataOf(c, id); return { id, exists: !!d, data: () => d && JSON.parse(JSON.stringify(d)) }; },
      set: async (d) => { (FS[c] = FS[c] || {})[id] = d; } })
  };
}
const fstore = { collection: c => query(c, []), batch: () => ({ set() {}, commit: async () => {} }) };
const db = { ref: p => ({ once: async () => ({ exists: () => RT[p] !== undefined, val: () => RT[p] }) }) };
global.firebase = { firestore: { FieldPath: { documentId: () => ID } } };
global.localStorage = { getItem: k => (k in LS ? LS[k] : null), setItem: (k, v) => { LS[k] = String(v); } };
const DA = require('fs').readdirSync(path.join(__dirname, '..')).filter(f => /^data_access\.v\d+\.js$/.test(f)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]).pop();
global.GieoData = require(path.join(__dirname, '..', DA)).GieoData;
require(path.join(__dirname, '..', 'lai_lo.v4.js'));
const LaiLo = global.LaiLo;

// Quán gg02: dữ liệu riêng nằm ở tên + '__gg02'; dữ liệu dùng chung (giá, công thức, cấu hình…) giữ tên cũ.
const S = n => n + '__gg02';
FS['config_history_gieogieo'] = { v1: { effectiveFrom: '2026-01-01', targets: { cogsPct: 30 }, labor: {} } };
FS['hr_settings_gieogieo'] = { current: { useActualLaborCost: false } };
FS[S('cogs_gieogieo')] = { togo: { items: { cf: { M: 9000 } } } };        // giá vốn nhập tay: Cà phê size M = 9.000
FS[S('expenses_gieogieo')] = {
  thue: { periodType: 'period', startDate: '2026-10-01', endDate: '2026-10-31', amount: 3100000, category: 'Thuê nhà', status: 'approved' },
  da: { date: '2026-10-15', amount: 50000, category: 'Đá', status: 'approved' },
  cu: { date: '2026-08-02', amount: 999999, category: 'Khác', status: 'approved' },                     // ngoài khoảng: không đọc
  cho: { date: '2026-10-15', amount: 70000, category: 'Khác', status: 'pending_review' }                 // chờ duyệt: chưa vào lãi/lỗ
};
FS[S('assets_gieogieo')] = { may: { purchaseCost: 31000000, usefulLifeMonths: 10, purchaseDate: '2026-01-01' } };
FS['price_history_gieogieo'] = { p1: { itemId: 'sua', effectiveFrom: '2026-01-01', price: 100, createdAt: '2026-01-01T00:00:00Z' } };
RT['orders_gieogieo__gg02/oct/15'] = {
  a: { total: 50000, date: '15/10/2026', time: '09:00', itemsArray: [{ itemId: 'cf', size: 'M', qty: 2, price: 25000 }] },
  b: { total: 30000, date: '15/10/2026', time: '15:00', itemsArray: [{ itemId: 'lạ', size: 'M', qty: 1, price: 30000 }] }       // món chưa có giá vốn
};

(async () => {
  const r = await LaiLo.tinh({ fstore, db, storeId: 'gg02', from: '2026-10-15', to: '2026-10-15' });
  const d = r.days[0], t = r.tomTat[0];
  eq([d.date, d.doanhThu], ['2026-10-15', 80000], 'Doanh thu = tổng bill của đúng quán gg02 (RT orders_gieogieo__gg02)');
  near(d.giaVon, 2 * 9000 + 30000 * 0.30, 'Giá vốn = món có giá vốn 2 × 9k + món chưa khai ước 30% (cogsPct cấu hình)');
  near(d.chiPhiCoDinh + d.bienPhiKhac, 3100000 / 31, 'Chi phí ngày: thuê 3,1tr ÷ 31; mua đá 50k đã nằm trong COGS');
  eq(d.chiMuaDa,50000,'Vẫn theo dõi tiền mua đá, không xoá khoản chi');
  // Mua hàng cho nhiều ngày: giá trị PO/nhận kho không phải chi phí riêng của ngày mua.
  FS[S('purchase_orders_gieogieo')]={po:{status:'received',lines:[{itemId:'sua',qtyExpectedBase:50000,receivedGoodBase:50000,unitPriceBase:100}]}};
  FS[S('receiving_records_gieogieo')]={receive:{poId:'po',businessDate:'2026-10-15',lines:[{itemId:'sua',qtyGoodBase:50000}]}};
  const afterPO=await LaiLo.tinh({fstore,db,storeId:'gg02',from:'2026-10-15',to:'2026-10-15'});
  near(afterPO.days[0].lai,d.lai,'PO 5 triệu + nhận kho không làm ngày mua bị trừ thêm 5 triệu');
  eq([reads[S('purchase_orders_gieogieo')]||0,reads[S('receiving_records_gieogieo')]||0],[0,0],'P&L không đọc PO/nhận hàng để cộng thành chi phí vận hành');
  near(d.khauHao, 3100000 / 31, 'Khấu hao: 31tr ÷ 10 tháng ÷ 31 ngày');
  eq(Object.keys(t).includes('hoaVon') && t.date === '2026-10-15', true, 'Bản tóm tắt y dạng pl_days của quanlygieo');
  eq(reads['expenses_gieogieo'] || 0, 0, 'Không đọc nhầm chi phí của quán gg01');

  // Cùng số với computeDayPL TRÍCH THẲNG từ quanlygieo.html (không qua file sinh)
  const Q = new Function('HR_SETTINGS', 'CONFIG_HISTORY', 'GieoData', 'QL_VIEW',
    "const DEFAULTS = " + require('fs').readFileSync(path.join(__dirname, '..', 'quanlygieo.html'), 'utf8').match(/const DEFAULTS = (\{[\s\S]*?\n\});/)[1] + ";\n" +
    extract('quanlygieo.html', ['pad', 'dkey', 'configForDate', 'daysInMonth', 'laborMonthlyTotal', 'computeDayPL', 'plChannelFeeForDay', 'monthlyDepreciation', 'expenseIsEstimate', 'expenseAllocatedAmount', 'daysBetweenInclusive', 'splitExpensesByCostType', 'expenseCoveredByCogs', 'costTypeOf', 'guessCostType']) +
    "\nconst EXP_VARIABLE_HINTS = " + require('fs').readFileSync(path.join(__dirname, '..', 'quanlygieo.html'), 'utf8').match(/const EXP_VARIABLE_HINTS = (\[[\s\S]*?\]);/)[1] + ";\nreturn computeDayPL;")(
    { useActualLaborCost: false }, [{ effectiveFrom: '2026-01-01', targets: { cogsPct: 30 }, labor: {} }], { storeId: () => 'gg02' }, 'gg02');
  const expAll = Object.entries(FS[S('expenses_gieogieo')]).map(([id, e]) => ({ id, ...e }));
  const assets = Object.entries(FS[S('assets_gieogieo')]).map(([id, e]) => ({ id, ...e }));
  const q = Q({ day: Object.assign({}, d._day || {}, { date: d.date, revenue: 80000, cogsActual: 18000, revenueUncosted: 30000, toppingRevenue: 0 }), expList: expAll, cats: [], assets, laborActual: null, laborPredicted: {}, wasteValue: 0, homNayKey: '2026-10-16' });
  eq(['doanhThu', 'giaVon', 'chiPhiCoDinh', 'bienPhiKhac', 'khauHao', 'luong', 'lai'].map(k => Math.round(q[k])), ['doanhThu', 'giaVon', 'chiPhiCoDinh', 'bienPhiKhac', 'khauHao', 'luong', 'lai'].map(k => Math.round(d[k])),
    'Cùng số với computeDayPL của quanlygieo (đọc TOÀN BỘ chi phí) — đọc chi phí theo khoảng không đổi kết quả');

  const beforeReads=JSON.stringify(reads);
  const rt=await LaiLo.realtime({storeId:'gg02',day:'2026-10-15',orders:[{total:25000,method:'TIỀN MẶT',itemsArray:[{id:'cf',name:'Cà phê',size:'M',qty:1,price:25000}]}]});
  eq(rt.day.doanhThu,25000,'Realtime tính lại bill sửa/xoá từ snapshot thay vì cộng trùng');
  eq(JSON.stringify(reads),beforeReads,'Realtime lãi/lỗ không đọc Firebase thêm');
  eq(await LaiLo.realtime({storeId:'gg01',day:'2026-10-15',orders:[]}),null,'Không mượn ngữ cảnh lãi/lỗ quán khác');
  const empty=await LaiLo.realtime({storeId:'gg02',day:'2026-10-15',orders:[]});
  eq(empty.day.doanhThu,0,'Xoá bill cuối: doanh thu về 0, chi phí vẫn còn');
  near(empty.day.chiPhiCoDinh+empty.day.bienPhiKhac,100000,'Realtime giữ chi phí đã nạp, mua đá không bị trừ hai lần');
  // Lịch sử giá: lần 2 chỉ đọc mốc mới
  const r1 = reads['price_history_gieogieo'];
  FS['price_history_gieogieo'].p2 = { itemId: 'sua', effectiveFrom: '2026-10-16', price: 120, createdAt: '2026-10-16T01:00:00Z' };
  reads['price_history_gieogieo'] = 0;
  delete require.cache[require.resolve(path.join(__dirname, '..', 'lai_lo.v4.js'))]; require(path.join(__dirname, '..', 'lai_lo.v4.js'));   // mở lại app: phiên mới, máy vẫn giữ lịch sử
  await global.LaiLo.tinh({ fstore, db, storeId: 'gg02', from: '2026-10-15', to: '2026-10-15' });
  eq([r1 >= 1, reads['price_history_gieogieo'], Object.keys(JSON.parse(LS['lai_lo_hist_v1_price_history_gieogieo']).docs).length], [true, 1, 2],
    'Lịch sử giá: lần sau chỉ đọc 1 mốc mới (createdAt > mốc đã có), trong máy đủ 2 mốc');
  // Cùng lỗi thu hồi vốn: một khoảng không có lương thật không được tự sinh ngân sách.
  FS['hr_settings_gieogieo'].current.useActualLaborCost=true;
  delete require.cache[require.resolve(path.join(__dirname,'..','lai_lo.v4.js'))];require(path.join(__dirname,'..','lai_lo.v4.js'));
  const zero=await global.LaiLo.tinh({fstore,db,storeId:'gg02',from:'2026-09-01',to:'2026-09-04'});
  eq(zero.days.map(d=>d.luong),[0,0,0,0],'bộ tính dùng chung: ngày cũ không phát sinh lương = 0');
  eq(zero.tomTat.every(d=>d.laborVersion===1&&d.laborCheckedAmount===0),true,'bộ tính dùng chung ghi dấu đã sửa lương');
  const failing={...fstore,collection:c=>{const q=fstore.collection(c);if(c===S('employee_shifts_gieogieo')){const bad=()=>({where:bad,get:async()=>{throw Error('mất mạng chấm công')}});return bad()}return q}};
  let rejected=false;try{await global.LaiLo.tinh({fstore:failing,db,storeId:'gg02',from:'2026-09-01',to:'2026-09-04'})}catch(e){rejected=/mất mạng/.test(e.message)}
  eq(rejected,true,'lỗi đọc lương không tạo bản tổng hợp ngân sách ghi đè sổ thật');
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL lỗi chạy', e && e.stack); process.exit(1); });
