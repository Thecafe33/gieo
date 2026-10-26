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
const { napREG, kiemPhamVi, bangGoc } = require('./pham_vi');
const { chromiumPath } = require(path.join(ROOT, 'tests/lib/e2e'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const MOC = arg('--moc', '0bd95a7'), MUA = arg('--mua', 'giangsinh'), CHI = arg('--chi', '');
let ok = true; const chk = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) ok = false; };

// Chuẩn hoá THEO TRƯỜNG (như e2e_ban, rút kinh nghiệm kiểm toán lượt 07 F07-2): chỉ giá trị phụ thuộc lúc chạy —
// khoá giờ (…At / at / ts / time / date…ISO) mang giá trị giờ; khoá ngẫu nhiên `<tiền tố>_<ms>_<ngẫu nhiên>` (giá trị / khoá / đường dẫn).
const KHOA_GIO = /(?:^|[a-z])At$|^at$|^ts$|^time$|^timestamp$|^rev$/;   // rev = mốc giờ RT (ms × 1000) của mã đang mở
const LA_GIO = v => (typeof v === 'string' && (/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z?$/.test(v) || /^\d\d:\d\d$/.test(v))) || (typeof v === 'number' && v > 1.6e12);
const MA_NN = /\b([a-z][a-z0-9]*)_\d{12,}_[a-z0-9]{4,}/g;
const doiMa = s => String(s).replace(MA_NN, '$1_ID');
function chuanDuLieu(v, k) {
  if (Array.isArray(v)) return v.map(x => chuanDuLieu(x));
  if (v && typeof v === 'object') { const o = {}; for (const [kk, vv] of Object.entries(v)) o[doiMa(kk)] = chuanDuLieu(vv, kk); return o; }
  if (k && KHOA_GIO.test(k) && LA_GIO(v)) return '<giờ>';
  return typeof v === 'string' ? doiMa(v) : v;
}
const chuanGhi = ds => (ds || []).map(g => ({ op: doiMa(g.op), p: doiMa(g.p), d: chuanDuLieu(g.d) }));   // cờ rt chỉ dùng cho kiểm phạm vi (ghiTho)

const PREP = { id: 'tcd', name: 'Trân châu đường', code: 'TCD', unit: 'g', batchYield: 2000, active: true, shelfLifeType: 'hours', shelfLifeHours: 8,
  costPerUnit: 20, batchInputs: [{ itemId: 'pearl', qty: 1000 }, { itemId: 'milk', qty: 0 }] };
const BATCH = id => ({ prepId: 'tcd', prepName: 'Trân châu đường', prepCode: 'TCD', unit: 'g', batchRatio: 1, status: 'cooking',
  startedAt: '2026-10-26T01:00:00.000Z', businessDate: '2026-10-26', startedBy: 'NV E2E', reconcileInputs: {}, shelfLifeType: 'hours', shelfLifeHours: 8 });
const ITEMS = {
  pearl: { id: 'pearl', name: 'Trân châu trắng', unit: 'g', countUnitName: 'Bịch', trackingMode: 'unit', active: true,
    packagingUnits: [{ name: 'Bịch', baseQty: 2000 }, { name: 'Thùng', baseQty: 12000 }], costPerUnit: 30, openShelfLifeHours: 48 },
  milk: { id: 'milk', name: 'Sữa tươi', unit: 'ml', countUnitName: 'Hộp', trackingMode: 'unit', active: true,
    packagingUnits: [{ name: 'Hộp', baseQty: 1000 }], costPerUnit: 40, openShelfLifeHours: 24 }
};

// Kịch bản: hàm chạy TRONG trang (nhận { ITEMS, SEED }), trả { sau }. Lượt ghi gom ở window.__ghi (fb_gia), mồi tự cập nhật theo ghi.
const KB_DAU = async ({ ITEMS }) => {   // phần chung: mở màn nhận hàng tự do, 2 dòng (Bịch / Hộp), trân châu 3 tốt + 1 hỏng, sữa 2
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  await openPoReceiveScreen(); await sleep(300);
  KHO_ITEMS_CACHE = Object.values(ITEMS).map(x => JSON.parse(JSON.stringify(x)));
  try { await poSelectFree(); } catch (e) {}
  poReceiveState.lines = [
    Object.assign({}, KHO_ITEMS_CACHE[0], { itemId: 'pearl', unitFactor: 2000, goodQty: 0, damagedQty: 0, wrongProduct: false, note: '' }),
    Object.assign({}, KHO_ITEMS_CACHE[1], { itemId: 'milk', unitFactor: 1000, goodQty: 0, damagedQty: 0, wrongProduct: false, note: '' })];
  renderPoReceiveForm(); await sleep(50);
  poReceiveLineChangeField(0, 'goodQty', 3); poReceiveLineChangeField(0, 'damagedQty', 1); poReceiveLineChangeField(1, 'goodQty', 2);
  const note = document.getElementById('poReceiveNote'); if (note) note.value = 'e2e nhận hàng';
};
const KICH_BAN = {
  // 2A — nhận hàng tự do → phiếu nhận + sổ kho (RECEIVING + WASTE hư hỏng) + mã NL qua Unit Engine
  nhanHang: {
    mo: '',
    chay: async (ctx) => {
      await KB_DAU(ctx); window.__ghi = [];
      await submitPoReceive(); await new Promise(r => setTimeout(r, 800));
      return { lines: poReceiveState.lines.length, man: (document.querySelector('.screen.active') || {}).id || null };
    },
    bang: ['inventory_items_gieogieo', 'receiving_records_gieogieo', 'stock_containers_gieogieo', 'stock_transactions_gieogieo'],
    kiem: (n) => [
      [n.toasts.includes('✅ Đã ghi nhận hàng'), 'toast «Đã ghi nhận hàng»'],
      [maMa(n, 'pearl') === 3 && maMa(n, 'milk') === 2, `đúng số mã NL: trân châu 3 (chỉ hàng tốt), sữa 2 — thấy ${maMa(n, 'pearl')} / ${maMa(n, 'milk')}`],
      [soGhi(n, /stock_transactions_gieogieo[^/]*\/[^/]*pearl_RECEIVING$/) === 1 && soGhi(n, /stock_transactions_gieogieo[^/]*\/[^/]*pearl_WASTE$/) === 1, 'sổ kho trân châu: 1 RECEIVING + 1 WASTE hư hỏng'],
      [phieu(n).some(d => JSON.stringify(d).includes('"status":"completed"')) && !phieu(n).some(d => JSON.stringify(d).includes('"status":"failed"')), 'phiếu nhận: các dòng completed, không dòng failed'],
      [n.sau && n.sau.lines === 0 && n.sau.man === 'stockLabelScreen', 'xong thì xoá phiếu + sang màn Tem chờ dán (NL dán tem theo đơn vị) — thấy ' + JSON.stringify(n.sau)]
    ]
  },
  // 2A — nhận theo ĐƠN ĐẶT HÀNG (nhận một phần) + 1 ảnh chứng từ (Storage — không qua data_access)
  nhanHangPO: {
    mo: 'po',
    chay: async ({ ITEMS }) => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      await openPoReceiveScreen(); await sleep(400);
      KHO_ITEMS_CACHE = Object.values(ITEMS).map(x => JSON.parse(JSON.stringify(x)));
      poSelectPO('po1'); await sleep(50);
      poReceiveLineChangeField(0, 'goodQty', 1);   // 1 Thùng = 12000 g (đủ)
      poReceiveLineChangeField(1, 'goodQty', 1);   // 1 Hộp / đặt 2 → nhận một phần
      poReceiveState.photoFiles = [new File(['hoadon'], 'hd.jpg', { type: 'image/jpeg' })];
      window.__ghi = [];
      await submitPoReceive(); await sleep(800);
      return { lines: poReceiveState.lines.length, poCache: (POS_PENDING_PO_CACHE || []).length };
    },
    bang: ['inventory_items_gieogieo', 'purchase_orders_gieogieo', 'receiving_photos_gieogieo', 'receiving_records_gieogieo', 'stock_containers_gieogieo', 'stock_transactions_gieogieo'],
    kiem: (n) => [
      [n.toasts.includes('✅ Đã ghi nhận hàng'), 'toast «Đã ghi nhận hàng»'],
      [n.ghi.some(g => /^tx\.update@purchase_orders_gieogieo[^/]*\/po1$/.test(g.op) && g.d && g.d.status === 'partial'), 'đơn đặt hàng cập nhật «partial» (nhận một phần) trong transaction'],
      [n.ghi.filter(g => g.op === 'storage.put').map(g => g.p).join() === 'receiving_photos_gieogieo/recv_ID/0_hd.jpg', 'ảnh lên Storage đúng đường cố định theo mã phiếu: ' + n.ghi.filter(g => g.op === 'storage.put').map(g => g.p).join()],
      [phieu(n).some(d => JSON.stringify(d).includes('https://gia.storage/receiving_photos_gieogieo/')), 'phiếu nhận lưu URL ảnh'],
      [maMa(n, 'pearl') === 6 && maMa(n, 'milk') === 1, `mã NL theo đơn vị đếm: 1 Thùng = 6 Bịch → 6 mã, sữa 1 — thấy ${maMa(n, 'pearl')} / ${maMa(n, 'milk')}`]
    ]
  },
  // 2A — BẤM LẠI sau lỗi giữa chừng: lượt 1 sổ kho dòng sữa lỗi (giả rớt mạng), lượt 2 ghi nốt — không cộng đôi
  nhanHangThuLai: {
    mo: '',
    chay: async (ctx) => {
      await KB_DAU(ctx); window.__ghi = [];
      window.__HONG = [{ op: 'tx.set', re: 'milk_RECEIVING$' }];
      await submitPoReceive(); await new Promise(r => setTimeout(r, 600));
      const lan1 = { lines: poReceiveState.lines.length, daGhi: Object.keys(poReceiveState.appliedLines || {}).sort() };
      await submitPoReceive(); await new Promise(r => setTimeout(r, 800));
      return { lan1, lines: poReceiveState.lines.length };
    },
    bang: ['inventory_items_gieogieo', 'receiving_records_gieogieo', 'stock_containers_gieogieo', 'stock_transactions_gieogieo'],
    kiem: (n) => [
      [n.toasts.some(t => /Đã ghi 1\/2 dòng/.test(t)) && n.toasts[n.toasts.length - 1] === '✅ Đã ghi nhận hàng', 'lượt 1 báo «Đã ghi 1/2 dòng», lượt 2 «Đã ghi nhận hàng»'],
      [n.sau && n.sau.lan1 && n.sau.lan1.lines === 2 && JSON.stringify(n.sau.lan1.daGhi) === '["pearl"]', 'sau lượt 1: giữ phiếu, chỉ trân châu đã vào kho'],
      [n.ghi.some(g => g.op === 'tx.set!hong'), 'lỗi cài đúng lượt ghi sổ kho sữa'],
      [soGhi(n, /stock_transactions_gieogieo[^/]*\/[^/]*pearl_RECEIVING$/) === 1 && soGhi(n, /stock_transactions_gieogieo[^/]*\/[^/]*milk_RECEIVING$/) === 1, `KHÔNG cộng đôi: sổ kho mỗi dòng ghi đúng 1 lần qua 2 lượt (trân châu ${soGhi(n, /pearl_RECEIVING$/)}, sữa ${soGhi(n, /milk_RECEIVING$/)})`],
      [maMa(n, 'pearl') === 3 && maMa(n, 'milk') === 2, `mã NL không nhân đôi: ${maMa(n, 'pearl')} / ${maMa(n, 'milk')}`]
    ]
  },
  // 2B — HOÀN THÀNH mẻ đang nấu: gõ số thu được → engine prep.finishBatch (giành lô, PRODUCTION, lô active, tồn BTP)
  hoanThanhMe: {
    mo: 'prep', lo: ['b1'],
    chay: async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      window.posConfirm = async () => true;
      showScreen('prepBatchScreen');
      PREP_ITEMS_CACHE_POS = [JSON.parse(JSON.stringify(window.__E2E.PREP))];
      PREP_BATCHES_CACHE_POS = [Object.assign({ id: 'b1' }, window.__E2E.BATCH)];
      openPrepFinishForm('b1'); await sleep(50);
      document.getElementById('prepFinishQty').value = '1950';
      window.__ghi = [];
      await submitPrepFinish(); await sleep(900);
      const b = PREP_BATCHES_CACHE_POS.find(x => x.id === 'b1') || {};
      return { status: b.status || null, qty: b.qtyRemaining == null ? null : b.qtyRemaining, code: b.batchCode || null };
    },
    bang: ["active_units_gieogieo", "prep_batches_gieogieo", "prep_items_gieogieo", "prep_transactions_gieogieo"],
    kiem: (n) => [
      [n.sau && n.sau.status === 'active' && n.sau.qty === 1950, 'lô chuyển active, còn 1950 g — thấy ' + JSON.stringify(n.sau)],
      [n.ghi.some(g => /prep_transactions_gieogieo/.test(duongGhi(g)) && g.d && g.d.type === 'PRODUCTION' && Number(g.d.qty) === 1950), 'sổ BTP có dòng PRODUCTION 1950'],
      [n.ghi.some(g => /prep_batches_gieogieo[^/]*\/b1$/.test(duongGhi(g))), 'cập nhật lô b1']
    ]
  },
  // 2B — HUỶ mẻ đang nấu: lý do + PIN → giành lô (claimCancel) → hoàn NL đã trừ theo giao dịch gốc
  huyMe: {
    mo: 'prep', lo: ['b2'], tieuHao: true,
    chay: async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      window.posConfirm = async () => true;
      showScreen('prepBatchScreen');
      KHO_ITEMS_CACHE = Object.values(window.__E2E.ITEMS).map(x => JSON.parse(JSON.stringify(x)));
      PREP_ITEMS_CACHE_POS = [JSON.parse(JSON.stringify(window.__E2E.PREP))];
      PREP_BATCHES_CACHE_POS = [Object.assign({ id: 'b2' }, window.__E2E.BATCH)];
      openPrepCancelForm('b2'); await sleep(50);
      const r = document.getElementById('prepCancelReason'); if (r) r.value = 'e2e nấu nhầm';
      window.__ghi = [];
      await submitPrepCancel(); await sleep(900);
      return { coForm: !!r };
    },
    bang: ["inventory_items_gieogieo", "prep_batches_gieogieo", "stock_anomalies_gieogieo", "stock_transactions_gieogieo"],   // sổ lệch: mã NL của khoản hoàn không có trong mồi (như nhau ở hai bản)
    kiem: (n) => [
      [n.sau && n.sau.coForm, 'form huỷ có ô lý do'],
      [n.ghi.some(g => /prep_batches_gieogieo[^/]*\/b2$/.test(duongGhi(g)) && g.d && g.d.status === 'cancelled'), 'lô b2 → cancelled'],
      [n.ghi.some(g => /stock_transactions_gieogieo/.test(duongGhi(g)) && g.d && Number(g.d.qty) === 500), 'hoàn +500 g trân châu vào sổ kho']
    ]
  },
  // 2B — ĐỔ BỎ BTP theo lô (Hao hụt trong ngày › Bán thành phẩm) → engine prep.discardByLots
  doBoBTP: {
    mo: 'prep', lo: ['b3'], loActive: true,
    chay: async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      window.posConfirm = async () => true;
      KHO_ITEMS_CACHE = Object.values(window.__E2E.ITEMS).map(x => JSON.parse(JSON.stringify(x)));
      PREP_ITEMS_CACHE_POS = [JSON.parse(JSON.stringify(window.__E2E.PREP))];
      PREP_BATCHES_CACHE_POS = [Object.assign({ id: 'b3' }, window.__E2E.BATCH, { status: 'active', batchCode: 'TCD-261026-1', qtyInitial: 1000, qtyRemaining: 1000, finishedAt: '2026-10-26T02:00:00.000Z', expiresAt: '2026-10-26T10:00:00.000Z' })];
      showScreen('khoTxScreen');
      khoTxState = { type: 'WASTE', target: 'prep', prepId: 'tcd' };
      try { renderKhoTxForm(); } catch (e) { renderPrepWasteForm(); }
      await sleep(80);
      const o = document.getElementById('pwB_b3'); if (o) { o.value = '300'; o.dispatchEvent(new Event('input')); }
      const sel = document.getElementById('pwReasonSelect'); if (sel) { if (![...sel.options].some(x => x.value === '__other__')) sel.add(new Option('Khác', '__other__')); sel.value = '__other__'; sel.dispatchEvent(new Event('change')); }
      await sleep(30); const ly = document.getElementById('pwReason'); if (ly) ly.value = 'e2e hỏng';
      window.__ghi = [];
      await submitPrepWaste(); await sleep(900);
      return { coO: !!o, coLyDo: !!(sel || ly) };
    },
    bang: ["active_units_gieogieo", "prep_batches_gieogieo", "prep_items_gieogieo", "prep_transactions_gieogieo"],
    kiem: (n) => [
      [n.sau && n.sau.coO && n.sau.coLyDo, 'form có ô số lượng theo lô + lý do'],
      [n.toasts.some(t => /^✅ Đã ghi huỷ 300 g lô TCD-261026-1/.test(t)), 'toast «Đã ghi huỷ 300 g lô …»'],
      [n.ghi.some(g => /prep_transactions_gieogieo/.test(duongGhi(g)) && g.d && g.d.type === 'WASTE'), 'sổ BTP có dòng WASTE']
    ]
  }
};
// Đếm trên lượt ghi đã chuẩn hoá
const duongGhi = g => (String(g.op).includes('@') ? String(g.op).split('@')[1] : g.p);
const soGhi = (n, re) => n.ghi.filter(g => /^tx\.set@|^set$/.test(g.op.replace(/@.*/, '@')) && re.test(duongGhi(g))).length;
const maMa = (n, item) => new Set(n.ghi.filter(g => /^(set|tx\.set@)/.test(g.op) && /stock_containers_gieogieo/.test(duongGhi(g)) && g.d && g.d.itemId === item).map(duongGhi)).size;
const phieu = n => n.ghi.filter(g => /receiving_records_gieogieo/.test(duongGhi(g))).map(g => g.d);

async function chay(b, base, store, ten) {
  const t = await moTrang(b, base, { authNgay: true, store, ngauNhienCo: true });
  const r = await t.page.evaluate(async ({ src, dau, mo, ITEMS, PO, E2E }) => {
    const toasts = []; const _t = window.toast;
    window.toast = function (m) { toasts.push(String(m)); try { return _t.apply(this, arguments); } catch (e) {} };
    window.requireShiftOpened = () => true; window.requireOpeningChecklistDone = () => true;
    window.requireSomeoneCheckedIn = () => true; window.requireSomeoneCheckedInAsync = async () => true;
    window.resolveStaffPinAndCheckin = async () => ({ id: 'e2e_nv', fullName: 'NV E2E', pin: '0000' });
    const S = {}; const ten = n => GieoData.fsPath(n);   // mồi đặt ĐÚNG tên bảng của quán đang chạy (đọc qua lớp GieoData)
    for (const [id, it] of Object.entries(ITEMS)) S[ten('inventory_items_gieogieo') + '/' + id] = it;
    if (mo === 'po') S[ten('purchase_orders_gieogieo') + '/po1'] = PO;
    window.__E2E = { ITEMS, PREP: E2E.PREP, BATCH: E2E.BATCH };
    if (mo === 'prep') {
      S[ten('prep_items_gieogieo') + '/tcd'] = E2E.PREP;
      for (const id of E2E.lo) S[ten('prep_batches_gieogieo') + '/' + id] = Object.assign({}, E2E.BATCH, E2E.loActive ? { status: 'active', batchCode: 'TCD-261026-1', qtyInitial: 1000, qtyRemaining: 1000, finishedAt: '2026-10-26T02:00:00.000Z', expiresAt: '2026-10-26T10:00:00.000Z' } : {});
      if (E2E.tieuHao) S[ten('stock_transactions_gieogieo') + '/cons_b2_pearl'] = { itemId: 'pearl', type: 'CONSUMPTION', qty: -500, referenceId: 'b2', prepBatchId: 'b2', businessDate: '2026-10-26', createdAt: '2026-10-26T01:00:00.000Z', status: 'posted' };
    }
    window.__SEED = S; window.__SEED_GHI = true; window.__HONG = [];
    window.KB_DAU = (0, eval)('(' + dau + ')');
    let loiKB = null, sau = null;
    try { sau = await (0, eval)('(' + src + ')')({ ITEMS }); } catch (e) { loiKB = String(e && e.message || e); }
    return { ghi: (window.__ghi || []).map(g => ({ op: g.op, p: g.p, rt: !!g.rt, d: g.d })), toasts, sau, loiKB };
  }, { src: KICH_BAN[ten].chay.toString(), dau: KB_DAU.toString(), mo: KICH_BAN[ten].mo, ITEMS, PO, E2E: { PREP, BATCH: BATCH(), lo: KICH_BAN[ten].lo || [], loActive: !!KICH_BAN[ten].loActive, tieuHao: !!KICH_BAN[ten].tieuHao } });
  r.loi = t.loi.slice().sort(); r.qua = t.qua; await t.ctx.close();
  r.ghiTho = r.ghi; r.ghi = chuanGhi(r.ghi); r.sau = chuanDuLieu(r.sau);
  return r;
}
const PO = { status: 'pending', supplier: 'NCC E2E', createdAt: '2026-10-20T03:00:00.000Z', lines: [
  { itemId: 'pearl', name: 'Trân châu trắng', unit: 'g', qtyExpectedBase: 12000, orderUnitName: 'Thùng', orderUnitFactor: 12000, receivedGoodBase: 0 },
  { itemId: 'milk', name: 'Sữa tươi', unit: 'ml', qtyExpectedBase: 2000, orderUnitName: 'Hộp', orderUnitFactor: 1000, receivedGoodBase: 0 }] };
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

(async () => {
  const hb = await dungHaiBan(MOC, MUA);
  const REG = napREG(hb.dir.nay);   // bảng đăng ký của bộ đang kiểm, đọc ở Node — độc lập với trang (F08-1)
  const b = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
  const dsKB = CHI ? CHI.split(',') : Object.keys(KICH_BAN);
  const goc = {};
  try {
    for (const kb of dsKB) for (const store of ['gg01', 'gg02']) {
      const m = await chay(b, hb.base.moc, store, kb), n = await chay(b, hb.base.nay, store, kb);
      const nhan = `(${kb} · ${store})`;
      chk(m.qua && n.qua && !n.loiKB, `${nhan} qua chốt dừng, kịch bản chạy hết` + (n.loiKB ? ' — ' + n.loiKB : ''));
      for (const [c, msg] of KICH_BAN[kb].kiem(n)) chk(c, `${nhan} bản tách: ${msg}`);
      for (const p of SO) { const a = JSON.stringify(m[p]), c = JSON.stringify(n[p]); chk(a === c, `${nhan} giống bản ${MOC}: ${p}` + (a === c ? '' : chiLech(m[p], n[p]))); }
      const vi = kiemPhamVi(n.ghiTho, store, REG), viM = kiemPhamVi(m.ghiTho, store, REG);
      chk(!vi.length && !viM.length, `${nhan} phạm vi quán (độc lập, theo REG): mọi lượt ghi S/C đúng ${store === 'gg01' ? 'tên gốc' : 'hậu tố __' + store}, G/X không hậu tố — ${n.ghiTho.length} lượt` + (vi.length || viM.length ? ': ' + [...vi, ...viM].join(' | ') : ''));
      const bg = bangGoc(n.ghiTho);
      if (KICH_BAN[kb].bang) chk(JSON.stringify(bg) === JSON.stringify(KICH_BAN[kb].bang), `${nhan} đúng tập bảng mong đợi: ${bg.join(', ')}`);
      else console.log(`   ${nhan} bảng ghi tới: ${JSON.stringify(bg)}`);
      // Nối dây: chèn lượt ghi sang quán khác vào chính log này → bộ kiểm phạm vi PHẢI bắt (không chỉ test đơn vị)
      const khac = store === 'gg01' ? 'gg02' : 'gg03';
      chk(kiemPhamVi([...n.ghiTho, { op: 'set', p: 'receiving_records_gieogieo__' + khac + '/probe' }], store, REG).length === 1, `${nhan} (tự kiểm) chèn 1 lượt ghi sang __${khac} → bộ kiểm phạm vi bắt đúng 1`);
      if (store === 'gg01') goc[kb] = n;
    }
    // TỰ KIỂM: bản sao cài lỗi nhỏ vào file JS đã tách → kịch bản tương ứng PHẢI báo lệch ở `ghi`
    const TU_KIEM = [
      { kb: 'nhanHang', file: 'pos_receive.v1.js', tim: /(\bnote:\s*generalNote)/, thay: "$1 + '·hỏng'", mo: 'đổi ghi chú phiếu nhận' },
      { kb: 'huyMe', file: 'pos_prep.v1.js', tim: /Hoàn kho do HUỶ MẺ/, thay: 'Hoàn kho do HUY ME', mo: 'đổi ghi chú dòng hoàn kho khi huỷ mẻ' }
    ];
    for (const tk of TU_KIEM) {
      if (!dsKB.includes(tk.kb)) continue;
      const sua = await banSua(hb.dir.nay, d => {
        const f = path.join(d, 'js', 'posgieo', tk.file); const t = fs.readFileSync(f, 'utf8');
        fs.writeFileSync(f, t.replace(tk.tim, tk.thay));
        if (fs.readFileSync(f, 'utf8') === t) throw new Error('tự kiểm: không cài được lỗi vào ' + tk.file);
      });
      try { const h = await chay(b, sua.base, 'gg01', tk.kb); const l = lechMuc(goc[tk.kb], h); chk(l.includes('ghi'), `(tự kiểm ${tk.kb}) bản cài lỗi ${tk.mo} → báo lệch mục ghi` + (l.length ? '' : ': KHÔNG thấy lệch')); }
      finally { sua.dong(); }
    }
  } finally { await b.close(); hb.dong(); }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
