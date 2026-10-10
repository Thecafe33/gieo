// ĐA CỬA HÀNG — các chỗ phải xong trước khi mở GG02 (rà 08/10, docs/KE_HOACH_DA_CUA_HANG.md Bước 3):
//  1. Tạo cửa hàng đứt giữa chừng: "Tiếp tục thiết lập" chỉ THÊM phần thiếu, không đưa tồn đã có về 0, xong bật catalogReady.
//  2. Đổi cấu hình giá vốn (dùng chung): xoá bộ đệm doanh thu của MỌI quán.
//  3. Ngừng sử dụng NL / BTP: xoá chỉ cho món chưa từng dùng; ô chọn bỏ món ngừng dùng (giữ món đang chọn).
//  4. POS: máy đổi quán → bỏ dữ liệu lưu trên máy của quán cũ (cache máy in, việc dở…), giữ cấu hình máy in tem.
'use strict';
const fs = require('fs'), path = require('path');
const { makeFake } = require('./lib/fakefb');
const { extract } = require('./lib/extract');
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) fail = 1; };
const ROOT = path.join(__dirname, '..');
const BAN = fs.readdirSync(ROOT).filter(f => /^data_access\.v\d+\.js$/.test(f)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]).pop();
const nap = () => { const m = { exports: {} }; new Function('window', 'module', fs.readFileSync(path.join(ROOT, BAN), 'utf8'))({}, m); return m.exports.GieoData; };
const quiet = { log() {}, warn() {}, error() {}, info() {} };
const stubsChung = (G, f, them) => Object.assign({ GieoData: G, fstore: f.fstore, confirm: () => true, alert() {}, ensureAuth: async () => {}, toast() {}, logAudit() {},
  renderEntryStores() {}, showError(m) { throw new Error(m); }, console: quiet, window: { GieoData: G } }, them || {});
const chay = (src, ret, stubs) => { const ks = Object.keys(stubs); return new Function(...ks, src + '\nreturn ' + ret + ';')(...ks.map(k => stubs[k])); };

(async () => {
  // ── 1. Tiếp tục thiết lập ──
  {
    const f = makeFake({ fs: {
      'stores_gieogieo/gg01': { name: 'Q1', code: 'AAAAAA', active: true, catalogReady: true },
      'stores_gieogieo/gg02': { name: 'Q2', code: 'BBBBBB', active: true, catalogReady: false },
      'inventory_items_gieogieo/A': { name: 'Sữa', unit: 'ml', minStock: 500, currentStock: 900 },
      'inventory_items_gieogieo/B': { name: 'Đường', unit: 'g', minStock: 100, currentStock: 50 },
      'prep_items_gieogieo/P': { name: 'Cốt trà', unit: 'ml', batchYield: 1000, currentStock: 300 },
      'refill_rules_gieogieo/r1': { itemId: 'A', minBase: 100 },
      'storage_locations_gieogieo/l1': { name: 'Kho' },
      // GG02 đã chép được 1 món trước khi mạng đứt — và đã có tồn (không được về 0)
      'inventory_items_gieogieo__gg02/A': { name: 'Sữa', unit: 'ml', minStock: 500, currentStock: 40 }
    }, rt: {} });
    const G = nap(); G.install({ fstore: f.fstore, db: f.db, storeId: 'gg01', catalogMirror: true });
    const src = extract('quanlygieo.html', ['storeCopyFinance', 'storeResumeSetup']);
    const run = chay('const STORE_SETUP_COPY = ["refill_rules_gieogieo", "storage_locations_gieogieo"];\n' + src, 'storeResumeSetup',
      stubsChung(G, f, { FINANCE_COPY_FIELDS: ['cashToleranceAmount'], FINANCE: { cashToleranceAmount: 5000, initialInvestment: 9e8 } }));
    await run('gg02');
    const FS = f.FS;
    ok(FS['inventory_items_gieogieo__gg02/A'].currentStock === 40, 'món đã có ở GG02 giữ nguyên tồn (không về 0)');
    ok(FS['inventory_items_gieogieo__gg02/B'] && FS['inventory_items_gieogieo__gg02/B'].currentStock === 0 && FS['inventory_items_gieogieo__gg02/B'].minStock === 100, 'món còn thiếu được thêm, tồn 0');
    ok(FS['prep_items_gieogieo__gg02/P'] && FS['prep_items_gieogieo__gg02/P'].currentStock === 0, 'BTP còn thiếu được thêm, tồn 0');
    ok(FS['refill_rules_gieogieo__gg02/r1'] && FS['storage_locations_gieogieo__gg02/l1'], 'quy tắc refill + vị trí kho chép sang');
    ok(FS['finance_gieogieo__gg02/current'] && FS['finance_gieogieo__gg02/current'].cashToleranceAmount === 5000 && !('initialInvestment' in FS['finance_gieogieo__gg02/current']), 'ngưỡng tài chính chép sang, vốn đầu tư không chép');
    ok(FS['stores_gieogieo/gg02'].catalogReady === true, 'xong mới bật catalogReady (POS nhập mã được)');
    ok(FS['inventory_items_gieogieo/A'].currentStock === 900, 'GG01 không bị đụng');
  }
  // ── 2. Xoá bộ đệm doanh thu ở mọi quán ──
  {
    const f = makeFake({ fs: { 'daily_sales_cache_gieogieo/2026-10-01': { r: 1 }, 'daily_sales_cache_gieogieo__gg02/2026-10-01': { r: 2 }, 'daily_sales_cache_gieogieo__gg02/2026-10-02': { r: 3 } }, rt: {} });
    const G = nap(); G.install({ fstore: f.fstore, db: f.db, storeId: 'gg01', catalogMirror: true });
    const src = extract('quanlygieo.html', ['clearSalesCache', 'invalidateSalesCache']);
    const st = stubsChung(G, f, { firebase: { firestore: { FieldPath: { documentId: () => '__name__' } } }, QL_STORES: [{ id: 'gg01' }, { id: 'gg02' }] });
    const run = chay('let _costMemo = {};\n' + src, 'invalidateSalesCache', st);
    await run('định mức');
    const con = Object.keys(f.FS).filter(k => /daily_sales_cache/.test(k));
    ok(!con.length, 'đổi cấu hình giá vốn: bộ đệm của GG01 lẫn GG02 đều bị xoá (còn ' + con.join(',') + ')');
  }
  // ── 3. Ngừng sử dụng ──
  {
    const f = makeFake({ fs: { 'stock_containers_gieogieo/c1': { itemId: 'T', status: 'used_up' }, 'prep_batches_gieogieo/b1': { prepId: 'PB' } }, rt: {} });
    const G = nap(); G.install({ fstore: f.fstore, db: f.db, storeId: 'gg01' });
    const src = extract('quanlygieo.html', ['catalogLyDoKhongXoa', 'conDung']);
    const st = stubsChung(G, f, { INVENTORY_ITEMS: [{ id: 'S', currentStock: 12, unit: 'g' }, { id: 'T', currentStock: 0 }, { id: 'M', currentStock: 0 }], PREP_ITEMS: [{ id: 'PB', currentStock: 0 }, { id: 'PM', currentStock: 0 }], fmtNum: x => String(x) });
    const F = chay(src, '{ catalogLyDoKhongXoa, conDung }', st);
    ok(/còn tồn 12/.test(await F.catalogLyDoKhongXoa('item', 'S')), 'NL còn tồn ở QUÁN ĐANG XEM → không xoá');
    ok(/đã có tem/.test(await F.catalogLyDoKhongXoa('item', 'T')), 'NL hết tồn nhưng từng có tem → không xoá');
    ok(await F.catalogLyDoKhongXoa('item', 'M') === '', 'NL chưa từng dùng (tạo nhầm) → xoá được');
    ok(/lô nấu/.test(await F.catalogLyDoKhongXoa('prep', 'PB')) && await F.catalogLyDoKhongXoa('prep', 'PM') === '', 'BTP: từng nấu → không xoá; chưa từng dùng → xoá được');
    const L = [{ id: 'a' }, { id: 'b', active: false }, { id: 'c', active: true }];
    ok(F.conDung(L).map(x => x.id).join() === 'a,c' && F.conDung(L, 'b').map(x => x.id).join() === 'a,b,c', 'ô chọn: bỏ món ngừng dùng, giữ món đang chọn sẵn ở dòng cũ');
    const P = chay(extract('posgieo.html', ['POS_PREP_CON_DUNG']), 'POS_PREP_CON_DUNG', { PREP_ITEMS_CACHE_POS: L });
    ok(P().map(x => x.id).join() === 'a,c' && P('b').length === 3, 'POS nấu mẻ mới: bỏ BTP ngừng dùng (danh sách đầy đủ vẫn giữ cho engine)');
    const pos = fs.readFileSync(path.join(ROOT, 'posgieo.html'), 'utf8');
    ok(!/PREP_ITEMS_CACHE_POS = [^;\n]*\.filter\([a-z] => [a-z]\.active !== false\)/.test(pos) && !/PREP_ITEMS_CACHE_POS = [^\n]*\n\s*\.filter\(\w => \w\.active !== false\)/.test(pos), 'POS nạp ĐỦ BTP vào PREP_ITEMS_CACHE_POS (engine dò BTP qua getPreps)');
  }
  // ── 4. POS: dữ liệu lưu trên máy theo quán ──
  {
    const pos = fs.readFileSync(path.join(ROOT, 'posgieo.html'), 'utf8');
    const i = pos.indexOf('const POS_LS_STORE_KEY'), j = pos.indexOf('function posLsViecDo');
    const khoi = pos.slice(i, j) + pos.slice(j, pos.indexOf('\n}\n', j) + 2);
    const thu = (kho, storeId) => {
      const ls = { getItem: k => (k in kho ? kho[k] : null), setItem: (k, v) => { kho[k] = String(v); }, removeItem: k => { delete kho[k]; } };
      return new Function('localStorage', 'POS_STORE', 'console', khoi + '\nreturn posLsViecDo;')(ls, { storeId }, quiet);
    };
    const kho = { gieo_ls_store_v1: 'gg01', pos_printer_layout_cache: '{"header":"GG01"}', gieo_prepStartScanState_v1: '{"prepId":"P"}', pos_tem_dpi: '203', pos_loyalty_pending_v1: '[{"billId":"x"}]', togoSettings_gieogieo: '{}' };
    thu(kho, 'gg02');
    ok(!('pos_printer_layout_cache' in kho) && !('gieo_prepStartScanState_v1' in kho), 'máy đổi GG01 → GG02: bỏ cache máy in + mẻ quét dở của GG01');
    ok(kho.pos_tem_dpi === '203' && kho.pos_loyalty_pending_v1 && kho.togoSettings_gieogieo && kho.gieo_ls_store_v1 === 'gg02', 'giữ cấu hình máy in tem, hàng đợi tích điểm, cấu hình chung chuỗi; ghi dấu quán mới');
    const kho2 = { pos_printer_layout_cache: 'x', dwPending_pos: '{"sig":"s"}' };
    const viecDo = thu(kho2, 'gg01');
    ok(kho2.pos_printer_layout_cache === 'x' && kho2.gieo_ls_store_v1 === 'gg01', 'máy cũ chưa có dấu: coi là của quán hiện tại, không xoá gì');
    ok(viecDo().length === 1 && /đổ ly/.test(viecDo()[0]), 'đăng xuất: liệt kê việc dở chưa gửi (đổ ly)');
    const pos2 = pos.slice(pos.indexOf('async function tim()'), pos.indexOf("$('psGo').onclick"));
    ok(/st\.catalogReady === false/.test(pos2), 'POS: mã của quán chưa thiết lập xong → không cho vào');
  }
  // ── 5. (10/10) Tên khách độc hại không chạy được trong gợi ý trợ lý ──
  {
    const html = fs.readFileSync(path.join(ROOT, 'posgieo.html'), 'utf8');
    const i0 = html.indexOf('function assistEsc(s) {');
    const escSrc = html.slice(i0, html.indexOf('\n}\n', i0) + 3);   // nguyên văn hàm thật (bộ tách hàm không đọc được regex /"/g)
    ok(i0 > 0 && /&lt;/.test(escSrc), 'tìm được assistEsc thật trong posgieo.html');
    const src = escSrc + '\n' + extract('posgieo.html', ['assistProviderCustomerCheck']);
    const doc = '<img src=x onerror="window.__xss=1">';
    const ds = [];
    const st = { assistConfig: { customerCheck: {} }, curCustomer: { name: doc }, loyaltyCustomer: { assist_profile: { orders: 5, ice: { it: 5 }, toppings: {}, items: {}, sizes: {} } },
      assistDrinkLines: () => [{ c: { ice: 'chung' } }], assistCartLines: () => [{ c: { ice: 'chung', itemId: 'a', size: 'M', toppings: [] } }], assistPaidLines: () => [{ c: { ice: 'chung', itemId: 'a', size: 'M', toppings: [] } }], iceMode: c => c.ice, ICE_LABELS: { it: 'Ít đá' }, assistMenuItem: () => null, getActiveMenu: () => [] };
    const ks = Object.keys(st);
    new Function(...ks, src + '\nassistProviderCustomerCheck(arguments[arguments.length - 1]);')(...ks.map(k => st[k]), ds);
    ok(ds.length >= 1 && ds.every(x => !/<img/i.test(x.text)) && /&lt;img/.test(ds[0].text), 'gợi ý trợ lý: tên khách có thẻ HTML bị escape (không còn <img>)');
    const ds2 = []; st.curCustomer = { name: 'Lan' };
    new Function(...ks, src + '\nassistProviderCustomerCheck(arguments[arguments.length - 1]);')(...ks.map(k => st[k]), ds2);
    ok(ds2.length >= 1 && /Lan thường chọn/.test(ds2[0].text), 'tên khách bình thường vẫn hiện đúng');
  }
  // ── 6. (10/10) Quán đã ngừng: chốt chặn xoá + kiểm lệch riêng một quán ──
  {
    const f = makeFake({ fs: {
      'stores_gieogieo/gg01': { code: 'AAAAAA', active: true, catalogReady: true },
      'stores_gieogieo/gg02': { code: 'BBBBBB', active: false, catalogReady: true, name: 'Q2' },
      'stores_gieogieo/gg03': { code: 'CCCCCC', active: true, catalogReady: true },
      'inventory_items_gieogieo/M': { name: 'Sữa', unit: 'ml', minStock: 500, currentStock: 0 },
      'inventory_items_gieogieo__gg02/M': { name: 'Sữa cũ tên', unit: 'ml', minStock: 100, currentStock: 70 },
      'inventory_items_gieogieo__gg03/M': { name: 'Sữa cũ tên', unit: 'ml', minStock: 100, currentStock: 0 } }, rt: {} });
    const G = nap(); G.install({ fstore: f.fstore, db: f.db, storeId: 'gg01', catalogMirror: true });
    let loi = ''; try { await f.fstore.collection('inventory_items_gieogieo').doc('M').delete(); } catch (e) { loi = e.message; }
    ok(/Q2 \(đã ngừng\) còn tồn 70/.test(loi) && f.FS['inventory_items_gieogieo/M'], 'xoá món khi quán ĐÃ NGỪNG còn tồn → bị chặn, nói rõ quán đã ngừng');
    const only = await G.catalogDiff(true, 'gg03');
    ok(only.length === 1 && only[0].storeId === 'gg03' && f.FS['inventory_items_gieogieo__gg03/M'].name === 'Sữa' && f.FS['inventory_items_gieogieo__gg02/M'].name === 'Sữa cũ tên', 'catalogDiff(apply, gg03): chỉ sửa gg03, quán khác không đụng');
    await f.fstore.collection('stores_gieogieo').doc('gg02').update({ active: true }); await G.stores(true);
    const sau = await G.catalogDiff(true, 'gg02');
    ok(sau.length === 1 && f.FS['inventory_items_gieogieo__gg02/M'].name === 'Sữa' && f.FS['inventory_items_gieogieo__gg02/M'].currentStock === 70, 'mở lại quán: kiểm lệch sửa danh mục, tồn 70 giữ nguyên');
    // quán ngừng KHÔNG nhận đồng bộ (đúng như văn bản "thôi đồng bộ")
    await f.fstore.collection('stores_gieogieo').doc('gg02').update({ active: false }); await G.stores(true);
    await f.fstore.collection('inventory_items_gieogieo').doc('M').update({ name: 'Sữa đổi tên' });
    ok(f.FS['inventory_items_gieogieo__gg03/M'].name === 'Sữa đổi tên' && f.FS['inventory_items_gieogieo__gg02/M'].name === 'Sữa', 'sửa danh mục: quán đang chạy nhận đồng bộ, quán ngừng thì không');
  }
  // ── 7. (10/10) Gợi ý SĐT khách: bản trong máy → bản dùng chung → đọc cả bảng ──
  {
    const src = extract('posgieo.html', ['_custAcPack', '_custAcUnpack', 'fetchAllCustomersCache']);
    const TODAY = '2026-10-10';
    const mk = ({ local, shared, sharedErr, customers }) => {
      const dem = { shared: 0, customers: 0, ghi: [] }, kho = {};
      if (local) kho.custAc_gieogieo_v1 = JSON.stringify(local);
      const docs = customers.map(c => ({ id: c.id, data: () => c }));
      const fst = { collection: n => n === 'customers'
        ? { get: async () => { dem.customers += docs.length; return { forEach: fn => docs.forEach(fn) }; } }
        : { doc: () => ({ get: async () => { dem.shared++; if (sharedErr) throw new Error('mất mạng'); return { exists: !!shared, data: () => shared }; }, set: async x => { dem.ghi.push(x); } }) } };
      const stubs = { fstore: fst, posDateKey: () => TODAY, console: quiet, TextEncoder,
        localStorage: { getItem: k => (k in kho ? kho[k] : null), setItem: (k, v) => { kho[k] = v; } },
        CUST_AC_LS: 'custAc_gieogieo_v1', CUST_AC_SHARED: 'customer_ac_cache_gieogieo', CUST_AC_MAX_BYTES: 900000 };
      const ks = Object.keys(stubs);
      const F = new Function(...ks, 'let allCustomersCache = [], _custAcDay = null, _custAcLoading = null;\nfunction _custAcSave() { localStorage.setItem(CUST_AC_LS, JSON.stringify({ day: _custAcDay, list: allCustomersCache })); }\n' + src
        + '\nreturn { run: fetchAllCustomersCache, lay: () => allCustomersCache, cho: () => _custAcLoading };')(...ks.map(k => stubs[k]));
      return { dem, F };
    };
    const KH = [{ id: '0901', name: 'An', total_points: 10 }, { id: '0902', nickname: 'Bi', name: 'Bình', total_points: 50 }, { id: '0903', name: 'Ca Đặng Ơi', total_points: 0 }];
    let t = mk({ local: { day: TODAY, list: [{ id: 'x' }] }, customers: KH }); t.F.run();
    ok(t.dem.shared === 0 && t.dem.customers === 0, 'bản trong máy còn mới (hôm nay): 0 lượt đọc');
    const chung = { day: TODAY, json: JSON.stringify([['0902', 'Bình', 'Bi', 50], ['0901', 'An', '', 10]]) };
    t = mk({ local: { day: '2026-10-09', list: [{ id: 'cu' }] }, shared: chung, customers: KH }); t.F.run(); await t.F.cho();
    ok(t.dem.shared === 1 && t.dem.customers === 0 && t.F.lay().map(c => c.id).join() === '0902,0901' && t.F.lay()[0].nickname === 'Bi', 'trong máy cũ + có bản dùng chung hôm nay: đọc 1 doc, KHÔNG đọc bảng khách');
    t = mk({ shared: { day: '2026-10-09', json: '[]' }, customers: KH }); t.F.run(); await t.F.cho();
    const g = t.dem.ghi[0];
    ok(t.dem.customers === 3 && t.dem.ghi.length === 1 && g.day === TODAY && g.count === 3 && JSON.parse(g.json)[0][0] === '0902' && t.F.lay().length === 3, 'bản dùng chung cũ: đọc cả bảng 1 lần rồi GHI bản mới cho các máy khác (xếp theo điểm)');
    t = mk({ sharedErr: true, customers: KH }); t.F.run(); await t.F.cho();
    ok(t.dem.customers === 3 && t.F.lay().length === 3, 'không đọc được bản dùng chung (mạng): lùi về đọc cả bảng như trước, vẫn có gợi ý');
    const lon = Array.from({ length: 30000 }, (_, i) => ({ id: '09' + String(i).padStart(8, '0'), name: 'Nguyễn Thị Hồng Ánh ' + i, total_points: i }));
    t = mk({ shared: null, customers: lon }); t.F.run(); await t.F.cho();
    ok(t.dem.ghi.length === 0 && t.F.lay().length === 30000, 'danh sách quá lớn (>900KB): không chia sẻ, máy này vẫn dùng bình thường');
  }
  console.log(fail ? 'SOME FAIL' : 'ALL PASS');
  process.exitCode = fail;
})().catch(e => { console.log('FAIL lỗi', e && e.stack || e); process.exitCode = 1; });
