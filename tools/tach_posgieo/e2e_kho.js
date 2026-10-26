// e2e Đợt 2 kế hoạch tách posgieo: KHO — so LƯỢT GHI trước / sau tách với bản đang chạy ở cửa hàng (điều kiện qua Đợt 2:
// «snapshot + log ghi trước/sau giống nền; thao tác ở A không đổi S/C của B»).
//   node tools/tach_posgieo/e2e_kho.js [--moc 0bd95a7] [--mua giangsinh] [--chi nhanHang,…]
// Mỗi kịch bản chạy trên hai bộ deploy (hai_ban.js) ở HAI quán (gg01 — tên gốc, gg02 — hậu tố __gg02), Firebase giả có
// dữ liệu mồi (fb_gia.js window.__SEED) → so: lượt ghi Firebase (đường dẫn + dữ liệu, chuẩn hoá theo trường), toast, trạng thái
// sau, lỗi JS. Thêm: ở gg02 mọi lượt ghi vào bảng của quán (S/C theo GieoData) phải mang hậu tố __gg02, không chạm bảng gg01.
// Cổng ca / PIN nhân viên được gán đè GIỐNG NHAU ở hai bản (không phải phần đang kiểm).
// Tự kiểm: bản sao cài lỗi (đổi một trường ghi trong file JS đã tách) → phải báo lệch.
'use strict';
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const { dungHaiBan, moTrang, banSua, ROOT } = require('./hai_ban');
const { chromiumPath } = require(path.join(ROOT, 'tests/lib/e2e'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const MOC = arg('--moc', '0bd95a7'), MUA = arg('--mua', 'giangsinh'), CHI = arg('--chi', '');
let ok = true; const chk = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) ok = false; };

// Chuẩn hoá THEO TRƯỜNG (như e2e_ban, rút kinh nghiệm kiểm toán lượt 07 F07-2): chỉ giá trị phụ thuộc lúc chạy —
// khoá giờ (…At / at / ts / time / date…ISO) mang giá trị giờ; khoá ngẫu nhiên `<tiền tố>_<ms>_<ngẫu nhiên>` (giá trị / khoá / đường dẫn).
const KHOA_GIO = /(?:^|[a-z])At$|^at$|^ts$|^time$|^timestamp$/;
const LA_GIO = v => (typeof v === 'string' && (/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z?$/.test(v) || /^\d\d:\d\d$/.test(v))) || (typeof v === 'number' && v > 1.6e12);
const MA_NN = /\b([a-z][a-z0-9]*)_\d{12,}_[a-z0-9]{4,}/g;
const doiMa = s => String(s).replace(MA_NN, '$1_ID');
function chuanDuLieu(v, k) {
  if (Array.isArray(v)) return v.map(x => chuanDuLieu(x));
  if (v && typeof v === 'object') { const o = {}; for (const [kk, vv] of Object.entries(v)) o[doiMa(kk)] = chuanDuLieu(vv, kk); return o; }
  if (k && KHOA_GIO.test(k) && LA_GIO(v)) return '<giờ>';
  return typeof v === 'string' ? doiMa(v) : v;
}
const chuanGhi = ds => (ds || []).map(g => ({ op: doiMa(g.op), p: doiMa(g.p), d: chuanDuLieu(g.d) }));

const ITEMS = {
  pearl: { id: 'pearl', name: 'Trân châu trắng', unit: 'g', countUnitName: 'Bịch', trackingMode: 'unit', active: true,
    packagingUnits: [{ name: 'Bịch', baseQty: 2000 }, { name: 'Thùng', baseQty: 12000 }], costPerUnit: 30, openShelfLifeHours: 48 },
  milk: { id: 'milk', name: 'Sữa tươi', unit: 'ml', countUnitName: 'Hộp', trackingMode: 'unit', active: true,
    packagingUnits: [{ name: 'Hộp', baseQty: 1000 }], costPerUnit: 40, openShelfLifeHours: 24 }
};

// Kịch bản: hàm chạy TRONG trang (nhận seed + bảng tên bảng), trả { ghi, toasts, sau }.
const KICH_BAN = {
  // 2A — nhận hàng tự do 2 dòng (Bịch / Hộp) → ghi phiếu nhận + sổ kho + mã NL qua Unit Engine
  nhanHang: async ({ ITEMS }) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await openPoReceiveScreen(); await sleep(300);
    KHO_ITEMS_CACHE = Object.values(ITEMS).map(x => JSON.parse(JSON.stringify(x)));
    try { poSelectFree(); } catch (e) {}
    await sleep(100);
    poReceiveState.lines = [
      Object.assign({}, KHO_ITEMS_CACHE[0], { itemId: 'pearl', unitFactor: 2000, goodQty: 0, damagedQty: 0, wrongProduct: false, note: '' }),
      Object.assign({}, KHO_ITEMS_CACHE[1], { itemId: 'milk', unitFactor: 1000, goodQty: 0, damagedQty: 0, wrongProduct: false, note: '' })];
    renderPoReceiveForm(); await sleep(50);
    poReceiveLineChangeField(0, 'goodQty', 3); poReceiveLineChangeField(0, 'damagedQty', 1); poReceiveLineChangeField(1, 'goodQty', 2);
    const note = document.getElementById('poReceiveNote'); if (note) note.value = 'e2e nhận hàng';
    window.__ghi = [];
    await submitPoReceive(); await sleep(800);
    return { sau: { lines: (poReceiveState.lines || []).length, idem: poReceiveState.idemKey || null, man: (document.querySelector('.screen.active') || {}).id || null } };
  }
};

async function chay(b, base, store, ten) {
  const t = await moTrang(b, base, { authNgay: true, store, ngauNhienCo: true });
  const r = await t.page.evaluate(async ({ ten, src, ITEMS }) => {
    const toasts = []; const _t = window.toast;
    window.toast = function (m) { toasts.push(String(m)); try { return _t.apply(this, arguments); } catch (e) {} };
    window.requireShiftOpened = () => true; window.requireOpeningChecklistDone = () => true;
    window.requireSomeoneCheckedIn = () => true; window.requireSomeoneCheckedInAsync = async () => true;
    window.resolveStaffPinAndCheckin = async () => ({ id: 'e2e_nv', fullName: 'NV E2E', pin: '0000' });
    const S = {}; const fs = n => GieoData.fsPath ? GieoData.fsPath(n) : n;
    for (const [id, it] of Object.entries(ITEMS)) { S['inventory_items_gieogieo/' + id] = it; try { S[fs('inventory_items_gieogieo') + '/' + id] = it; } catch (e) {} }
    window.__SEED = S;
    let loiKB = null, kq = {};
    try { kq = await (0, eval)('(' + src + ')')({ ITEMS }); } catch (e) { loiKB = String(e && e.message || e); }
    // Bảng ghi tới (đã qua lớp GieoData) — bảng tên GỐC mà GieoData sẽ đổi tên ở quán này = ghi lọt sang bảng riêng của gg01
    const lot = [];
    for (const g of (window.__ghi || [])) {
      const at = String(g.op).indexOf('@'), duong = at >= 0 ? String(g.op).slice(at + 1) : g.p, T = String(duong).split('/')[0];
      if (!T || /__gg\d\d$/.test(T)) continue;
      let doi = T; try { doi = (g.rt && at < 0 ? GieoData.rtPath(T) : GieoData.fsPath(T)).split('/')[0]; } catch (e) { doi = '!' + e.message; }
      const dong = T + ' → phải là ' + doi; if (doi !== T && !lot.includes(dong)) lot.push(dong);
    }
    return { ghi: (window.__ghi || []).map(g => ({ op: g.op, p: g.p, d: g.d })), toasts, sau: kq.sau || null, loiKB, lot };
  }, { ten, src: KICH_BAN[ten].toString(), ITEMS });
  r.loi = t.loi.slice().sort(); r.qua = t.qua; await t.ctx.close();
  r.ghi = chuanGhi(r.ghi); r.sau = chuanDuLieu(r.sau);
  return r;
}
const SO = ['ghi', 'toasts', 'sau', 'loiKB', 'loi'];
// In phần tử lệch ĐẦU TIÊN (mảng) — không cắt cụt chuỗi dài trước chỗ lệch
function chiLech(x, y) {
  if (Array.isArray(x) && Array.isArray(y)) {
    const i = [...Array(Math.max(x.length, y.length)).keys()].find(k => JSON.stringify(x[k]) !== JSON.stringify(y[k]));
    return `\n   (mốc ${x.length} / nay ${y.length} phần tử) lệch đầu tiên ở #${i}:\n   mốc ${JSON.stringify(x[i])}\n   nay ${JSON.stringify(y[i])}`;
  }
  return '\n   mốc ' + JSON.stringify(x) + '\n   nay ' + JSON.stringify(y);
}
const lechMuc = (m, n) => SO.filter(p => JSON.stringify(m[p]) !== JSON.stringify(n[p]));
const tenBang = p => String(p).replace(/^(?:tx|batch)\.\w+@/, '').split('/')[0];

(async () => {
  const hb = await dungHaiBan(MOC, MUA);
  const b = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
  const dsKB = CHI ? CHI.split(',') : Object.keys(KICH_BAN);
  const goc = {};
  try {
    for (const kb of dsKB) for (const store of ['gg01', 'gg02']) {
      const m = await chay(b, hb.base.moc, store, kb), n = await chay(b, hb.base.nay, store, kb);
      const nhan = `(${kb} · ${store})`;
      chk(m.qua && n.qua && !n.loiKB, `${nhan} qua chốt dừng, kịch bản chạy hết` + (n.loiKB ? ' — ' + n.loiKB : ''));
      chk(n.ghi.length >= 3, `${nhan} bản tách có ghi Firebase thật (${n.ghi.length} lượt: ${[...new Set(n.ghi.map(g => g.op.split('@')[0] + ' ' + tenBang(g.op.includes('@') ? g.op.split('@')[1] : g.p)))].join(', ')})`);
      for (const p of SO) { const a = JSON.stringify(m[p]), c = JSON.stringify(n[p]); chk(a === c, `${nhan} giống bản ${MOC}: ${p}` + (a === c ? '' : chiLech(m[p], n[p]))); }
      chk(!n.lot.length, `${nhan} mọi lượt ghi đi qua GieoData đúng quán (không lọt sang bảng riêng quán khác)` + (n.lot.length ? ': ' + n.lot.join(' | ') : ''));
      if (store === 'gg02') {
        const bang = [...new Set(n.ghi.map(g => tenBang(g.op.includes('@') ? g.op.split('@')[1] : g.p)))];
        chk(bang.some(x => /__gg02$/.test(x)), `${nhan} có ghi vào bảng riêng quán gg02 (${bang.filter(x => /__gg02$/.test(x)).join(', ')})`);
      } else goc[kb] = n;
    }
    // TỰ KIỂM: bản sao đổi trường `supplier` ghi trên phiếu nhận trong file JS đã tách → phải báo lệch ở `ghi`
    if (dsKB.includes('nhanHang')) {
      const sua = await banSua(hb.dir.nay, d => {
        const f = path.join(d, 'js', 'posgieo', 'pos_receive.v1.js'); const t = fs.readFileSync(f, 'utf8');
        const a = "fstore.collection('receiving_records_gieogieo')"; if (!t.includes(a)) throw new Error('tự kiểm: không thấy ' + a);
        fs.writeFileSync(f, t.replace(/(\bnote:\s*generalNote)/, "$1 + '·hỏng'"));
        if (fs.readFileSync(f, 'utf8') === t) throw new Error('tự kiểm: không cài được lỗi (không thấy note: generalNote)');
      });
      try { const h = await chay(b, sua.base, 'gg01', 'nhanHang'); const l = lechMuc(goc.nhanHang, h); chk(l.includes('ghi'), '(tự kiểm) bản cài lỗi đổi ghi chú phiếu nhận → báo lệch mục ghi' + (l.length ? '' : ': KHÔNG thấy lệch')); }
      finally { sua.dong(); }
    }
  } finally { await b.close(); hb.dong(); }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
