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
const KHOA_GIO = /(?:^|[a-z])At$|^at$|^ts$|^t$|^time$|^timestamp$|^rev$|[a-z]Rev$/;   // rev / rtRev = mốc giờ RT (ms × 1000) của mã đang mở; t = giờ một lần đổi (chg[].t)
const LA_GIO = v => (typeof v === 'string' && (/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z?$/.test(v) || /^\d\d:\d\d$/.test(v))) || (typeof v === 'number' && v > 1.6e12);
const MA_NN = /(^|[^a-z0-9])([a-z][a-z0-9]*)_\d{12,}_[a-z0-9]{4,}/g;   // đầu chuỗi hoặc sau ký tự không phải chữ/số — gồm '_' / '/' (mã lồng trong ID, kiểm lượt 10)
const doiMa = s => String(s).replace(MA_NN, '$1$2_ID');
function chuanDuLieu(v, k, giuGio) {   // giuGio: kịch bản chạy giờ CỐ ĐỊNH (gioCo) → giữ nguyên giá trị giờ (tất định ở hai bản, so được cả hạn mới)
  if (Array.isArray(v)) return v.map(x => chuanDuLieu(x, undefined, giuGio));
  if (v && typeof v === 'object') { const o = {}; for (const [kk, vv] of Object.entries(v)) o[doiMa(kk)] = chuanDuLieu(vv, kk, giuGio); return o; }
  if (!giuGio && k && KHOA_GIO.test(k) && LA_GIO(v)) return '<giờ>';
  return typeof v === 'string' ? doiMa(v) : v;
}
const chuanGhi = (ds, giuGio) => (ds || []).map(g => ({ op: doiMa(g.op), p: doiMa(g.p), d: chuanDuLieu(g.d, undefined, giuGio) }));   // cờ rt chỉ dùng cho kiểm phạm vi (ghiTho)

const PREP = { id: 'tcd', name: 'Trân châu đường', code: 'TCD', unit: 'g', batchYield: 2000, active: true, shelfLifeType: 'hours', shelfLifeHours: 8,
  costPerUnit: 20, batchInputs: [{ itemId: 'pearl', qty: 1000 }, { itemId: 'milk', qty: 0 }] };
const BATCH = id => ({ prepId: 'tcd', prepName: 'Trân châu đường', prepCode: 'TCD', unit: 'g', batchRatio: 1, status: 'cooking',
  startedAt: '2026-10-26T01:00:00.000Z', businessDate: '2026-10-26', startedBy: 'NV E2E', reconcileInputs: {}, shelfLifeType: 'hours', shelfLifeHours: 8 });
// Bắt đầu nấu: NL số lượng lớn không đếm (không vào đối chiếu / nguyên gói) + NL nguyên gói phải quét mã
const NL_NAU = {
  sugar: { id: 'sugar', name: 'Đường cát', unit: 'g', trackingMode: 'bulk', staffCounts: false, active: true, costPerUnit: 25, currentStock: 50000 },
  syrup: { id: 'syrup', name: 'Siro nền', unit: 'ml', trackingMode: 'bulk', staffCounts: false, active: true, costPerUnit: 30, currentStock: 20000 },
  pearlg: { id: 'pearlg', name: 'Trân châu gói', unit: 'g', countUnitName: 'Bịch', trackingMode: 'unit', prepWholePack: true, active: true,
    packagingUnits: [{ name: 'Bịch', baseQty: 2000 }], costPerUnit: 30, openShelfLifeHours: 48 }
};
const PREP_NAU = {
  syr: { id: 'syr', name: 'Siro đường', code: 'SYR', unit: 'ml', batchYield: 1500, active: true, shelfLifeType: 'hours', shelfLifeHours: 24, costPerUnit: 18,
    batchInputs: [{ itemId: 'sugar', qty: 1000 }, { itemId: 'syrup', qty: 500 }] },
  tcq: { id: 'tcq', name: 'Trân châu nguyên gói', code: 'TCQ', unit: 'g', batchYield: 3000, active: true, shelfLifeType: 'hours', shelfLifeHours: 8, costPerUnit: 22,
    batchInputs: [{ itemId: 'pearlg', qty: 2000 }] }
};
// 2C: NL dán tem theo đơn vị (mở / báo hết) + NL đếm theo số lượng (kiểm kê mù)
const NL_KHO = {
  milk: { id: 'milk', name: 'Sữa tươi', unit: 'ml', countUnitName: 'Hộp', trackingMode: 'unit', active: true,
    packagingUnits: [{ name: 'Hộp', baseQty: 1000 }], costPerUnit: 40, openShelfLifeHours: 24 },
  tra: { id: 'tra', name: 'Trà lài', unit: 'g', active: true, costPerUnit: 300, currentStock: 1000,
    packagingUnits: [{ name: 'Gói', baseQty: 500 }] }
};
const CTN = (st, extra) => Object.assign({ code: st === 'open' ? 'SUA00002' : 'SUA00001', itemId: 'milk', itemName: 'Sữa tươi', unit: 'ml', trackingMode: 'unit', countUnitName: 'Hộp',
  baseQty: 1000, unitBase: 1000, status: st, labelPrinted: true, receivedAt: '2026-10-25T03:00:00.000Z', businessDate: '2026-10-25', openShelfLifeHours: 24 }, extra || {});
// 2C — ĐỔ LY (kiểm lượt 10 đề nghị): món Trà sữa E2E size M = 25 ml sữa (NL có tem, mã đang mở còn 800 → FIFO lượng thật)
// + 10 g trà (NL thường) + 30 g BTP Trân châu đường (lô đang dùng 1000 g); đổ 2 ly, chưa rót vào ly, lý do cấu hình sẵn.
const DOLY = {
  menu: [{ id: 'tsm', name: 'Trà sữa E2E', sizes: [{ label: 'M', price: 30000 }] }],
  recipe: { sizes: { M: [{ itemId: 'milk', qty: 25 }, { itemId: 'tra', qty: 10 }, { refType: 'prep', prepId: 'tcd', qty: 30 }] } },
  ctn: { code: 'SUA00003', itemId: 'milk', itemName: 'Sữa tươi', unit: 'ml', trackingMode: 'unit', countUnitName: 'Hộp', baseQty: 1000, unitBase: 800, status: 'open',
    labelPrinted: true, receivedAt: '2026-10-25T03:00:00.000Z', businessDate: '2026-10-25', openedAt: '2026-10-26T01:00:00.000Z', openedBy: 'NV E2E', expiresAt: '2026-10-27T01:00:00.000Z', openShelfLifeHours: 24 },
  rt: { code: 'SUA00003', itemName: 'Sữa tươi', unit: 'ml', unitBase: 800, capacity: 1000, openedAt: 1793000000000, rev: 1 },
  rtLo: { code: 'TCD-261026-1', itemName: 'Trân châu đường', unit: 'g', capacity: 1000, openedAt: 1793001000000, unitBase: 1000 },
  lo: { status: 'active', batchCode: 'TCD-261026-1', qtyInitial: 1000, qtyRemaining: 1000, finishedAt: '2026-10-26T02:00:00.000Z', expiresAt: '2026-10-26T10:00:00.000Z' }
};
// 2D — HẠN DÙNG (giờ cố định HAN_T = 14:33 giờ VN 26/10): lô BTP b1 đã quá hạn 1 giờ, b2 sắp hết hạn (20 phút), mã sữa đang mở ctn_h1 sắp hết hạn
const HAN_T = 1793000000000, isoT = d => new Date(HAN_T + d * 60000).toISOString();
const HAN = {
  lo: { b1: { qtyRemaining: 400, expiresAt: isoT(-60), batchCode: 'TCD-261026-1' }, b2: { qtyRemaining: 600, expiresAt: isoT(20), batchCode: 'TCD-261026-2' } },
  ctn: { code: 'SUA00004', itemId: 'milk', itemName: 'Sữa tươi', unit: 'ml', trackingMode: 'unit', countUnitName: 'Hộp', baseQty: 1000, unitBase: 700, status: 'open',
    labelPrinted: true, receivedAt: '2026-10-25T03:00:00.000Z', businessDate: '2026-10-25', openedAt: isoT(-1420), openedBy: 'NV E2E', expiresAt: isoT(20), openShelfLifeHours: 24 }
};
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
  },
  // 2B — BẮT ĐẦU NẤU theo công thức (NL không đối chiếu / không nguyên gói): cổng startPrepBatchGate → trừ NL → tạo lô cooking
  batDauMe: {
    mo: 'nau',
    chay: async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      window.posConfirm = async () => true;
      KHO_ITEMS_CACHE = Object.values(window.__E2E.NL_NAU).map(x => JSON.parse(JSON.stringify(x)));
      PREP_ITEMS_CACHE_POS = Object.values(window.__E2E.PREP_NAU).map(x => JSON.parse(JSON.stringify(x)));
      PREP_BATCHES_CACHE_POS = [];
      showScreen('prepBatchScreen');
      prepBatchState = { prepId: 'syr', ratio: 1, actualYield: 0 };
      try { renderPrepBatchForm(); } catch (e) {}
      window.__ghi = [];
      await startPrepBatchGate(); await sleep(1500);
      return { lo: PREP_BATCHES_CACHE_POS.map(b => ({ prepId: b.prepId, status: b.status })) };
    },
    bang: ["active_units_gieogieo", "inventory_items_gieogieo", "prep_batches_gieogieo", "stock_transactions_gieogieo"],
    kiem: (n) => [
      [n.ghi.some(g => /prep_batches_gieogieo/.test(duongGhi(g)) && g.d && g.d.status === 'cooking' && g.d.prepId === 'syr'), 'tạo lô cooking Siro đường'],
      [n.ghi.filter(g => /stock_transactions_gieogieo/.test(duongGhi(g)) && g.d && g.d.type === 'CONSUMPTION').map(g => g.d.itemId + ':' + g.d.qty).sort().join() === 'sugar:-1000,syrup:-500', 'trừ NL theo công thức: đường −1000, siro −500 — thấy ' + n.ghi.filter(g => /stock_transactions_gieogieo/.test(duongGhi(g)) && g.d && g.d.type === 'CONSUMPTION').map(g => g.d.itemId + ':' + g.d.qty).join()],
      [n.ghi.some(g => /prep_batches_gieogieo/.test(duongGhi(g)) && g.d && g.d.inputTrace), 'lô ghi inputTrace (truy NL đã dùng)']
    ]
  },
  // 2B — BẮT ĐẦU NẤU với NL NGUYÊN GÓI: PIN → cổng quét mã (máy quét giả) → đủ gói tự bắt đầu → gói 'finished' + lô cooking
  batDauMeQuet: {
    mo: 'nau',
    chay: async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      window.posConfirm = async () => true;
      window.AndroidScanner = { getScannerVersion: () => 1, scan: id => setTimeout(() => window.__androidScanResult({ id, ok: true, code: 'TCG00001', format: 'QR_CODE' }), 10) };
      KHO_ITEMS_CACHE = Object.values(window.__E2E.NL_NAU).map(x => JSON.parse(JSON.stringify(x)));
      PREP_ITEMS_CACHE_POS = Object.values(window.__E2E.PREP_NAU).map(x => JSON.parse(JSON.stringify(x)));
      PREP_BATCHES_CACHE_POS = [];
      showScreen('prepBatchScreen');
      prepBatchState = { prepId: 'tcq', ratio: 1, actualYield: 0 };
      try { renderPrepBatchForm(); } catch (e) {}
      window.__ghi = [];
      await startPrepBatchGate(); await sleep(200);
      const coCong = !!(prepStartScanState && prepStartScanState.requirements && prepStartScanState.requirements.length);
      await prepStartGateScan('pearlg'); await sleep(1500);
      return { coCong, conCong: !!prepStartScanState, lo: PREP_BATCHES_CACHE_POS.map(b => ({ prepId: b.prepId, status: b.status })) };
    },
    bang: ["active_units_gieogieo", "inventory_items_gieogieo", "prep_batches_gieogieo", "stock_containers_gieogieo", "stock_transactions_gieogieo"],
    kiem: (n) => [
      [n.sau && n.sau.coCong, 'mở cổng quét mã (cần 1 Bịch nguyên)'],
      [n.ghi.some(g => /stock_containers_gieogieo[^/]*\/ctn_tcg1$/.test(duongGhi(g)) && g.d && g.d.status === 'finished'), 'gói đã quét → finished'],
      [n.ghi.some(g => /prep_batches_gieogieo/.test(duongGhi(g)) && g.d && g.d.status === 'cooking' && g.d.prepId === 'tcq'), 'tạo lô cooking Trân châu nguyên gói'],
      [n.sau && n.sau.conCong === false, 'xong thì xoá trạng thái cổng quét']
    ]
  },
  // 2B — BẮT ĐẦU NẤU LỖI giữa chừng: lượt ghi sổ kho đầu tiên lỗi (giả rớt mạng) → cuộn ngược phần đã trừ, KHÔNG tạo lô
  batDauMeLoi: {
    mo: 'nau',
    chay: async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      window.posConfirm = async () => true;
      KHO_ITEMS_CACHE = Object.values(window.__E2E.NL_NAU).map(x => JSON.parse(JSON.stringify(x)));
      PREP_ITEMS_CACHE_POS = Object.values(window.__E2E.PREP_NAU).map(x => JSON.parse(JSON.stringify(x)));
      PREP_BATCHES_CACHE_POS = [];
      showScreen('prepBatchScreen');
      prepBatchState = { prepId: 'syr', ratio: 1, actualYield: 0 };
      try { renderPrepBatchForm(); } catch (e) {}
      window.__ghi = [];
      window.__HONG = [{ op: 'tx.set', re: '^stock_transactions_gieogieo', con: 1 }];   // lượt ghi sổ kho ĐẦU TIÊN lỗi (thứ tự trong Promise.allSettled)
      await startPrepBatchGate(); await sleep(1500);
      return { lo: PREP_BATCHES_CACHE_POS.length };
    },
    bang: ["active_units_gieogieo", "inventory_items_gieogieo", "stock_transactions_gieogieo"],
    kiem: (n) => [
      [n.ghi.some(g => /!hong$/.test(g.op)), 'lỗi cài đúng một lượt ghi sổ kho'],
      [!n.ghi.some(g => /prep_batches_gieogieo/.test(duongGhi(g)) && g.d && g.d.status === 'cooking'), 'KHÔNG tạo lô cooking khi trừ NL lỗi'],
      [(() => { const st = n.ghi.filter(g => /stock_transactions_gieogieo/.test(duongGhi(g)) && g.d && g.d.itemId); const tru = st.filter(g => g.d.type === 'CONSUMPTION' && g.d.qty < 0);
        return tru.length === 1 && st.some(g => g.d.itemId === tru[0].d.itemId && Number(g.d.qty) === -tru[0].d.qty); })(),
        'cuộn ngược: NL đã trừ được (1 trong 2) có dòng hoàn đúng lượng — sổ kho: ' + n.ghi.filter(g => /stock_transactions_gieogieo|!hong/.test(duongGhi(g) + g.op)).map(g => g.op.replace(/@.*/, '') + ' ' + (g.d ? g.d.itemId + ':' + g.d.type + ':' + g.d.qty : '')).join(' | ')]
    ]
  },
  // 2C — MỞ mã NL (sealed → open): PIN → engine lifecycle mở + RT mã đang mở + hạn dùng sau mở
  moMa: {
    mo: 'kho',
    chay: async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      window.posConfirm = async () => true;
      KHO_ITEMS_CACHE = Object.values(window.__E2E.NL_KHO).map(x => JSON.parse(JSON.stringify(x)));
      window.__ghi = [];
      await submitOpenContainer('ctn_m1'); await sleep(900);
      return {};
    },
    bang: ["active_units_gieogieo", "inventory_items_gieogieo", "stock_containers_gieogieo"],
    kiem: (n) => [
      [n.ghi.some(g => /stock_containers_gieogieo[^/]*\/ctn_m1$/.test(duongGhi(g)) && g.d && g.d.status === 'open'), 'mã ctn_m1 → open — toast: ' + JSON.stringify(n.toasts) + ' lỗi: ' + JSON.stringify(n.loi)],
      [n.ghi.some(g => /active_units_gieogieo/.test(duongGhi(g))), 'ghi RT mã đang mở']
    ]
  },
  // 2C — BÁO HẾT mã NL đang mở (đã quét, còn 0): engine lifecycle.finish → finished + gỡ RT
  baoHet: {
    mo: 'kho',
    chay: async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      window.posConfirm = async () => true;
      KHO_ITEMS_CACHE = Object.values(window.__E2E.NL_KHO).map(x => JSON.parse(JSON.stringify(x)));
      window.__ghi = [];
      await submitFinishContainer('ctn_m2', true); await sleep(900);
      return {};
    },
    bang: ["active_units_gieogieo", "inventory_items_gieogieo", "stock_containers_gieogieo"],   // inventory_items: tính lại tồn theo mã (RT mồi dạng cây, fb_gia lượt 10)
    kiem: (n) => [
      [n.ghi.some(g => /stock_containers_gieogieo[^/]*\/ctn_m2$/.test(duongGhi(g)) && g.d && g.d.status === 'finished'), 'mã ctn_m2 → finished']
    ]
  },
  // 2C — BÁO HẾT mã còn DƯ (kiểm lượt 10 đề nghị): mã sữa đang mở còn 300 ml theo RT → báo hết (đã quét) → phần dư thành hao hụt
  baoHetConDu: {
    mo: 'kho',
    chay: async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      window.posConfirm = async () => true;
      const S = window.__SEED, rt = GieoData.rtPath('active_units_gieogieo') + '/milk/ctn_m2', fsP = GieoData.fsPath('stock_containers_gieogieo') + '/ctn_m2';
      S[rt] = Object.assign({}, S[rt], { unitBase: 300 }); S[fsP] = Object.assign({}, S[fsP], { unitBase: 300 });
      KHO_ITEMS_CACHE = Object.values(window.__E2E.NL_KHO).map(x => JSON.parse(JSON.stringify(x)));
      STOCK_OPEN_LIST = [Object.assign({ id: 'ctn_m2' }, S[fsP])];
      await openConfirmFinishSheet(STOCK_OPEN_LIST[0], true); await sleep(200);   // tấm xác nhận thật: hiện «còn 300 ml» + ô xác nhận hao hụt
      const ack = document.getElementById('finishPositiveWasteAck'); const chu = ack ? ack.closest('div').textContent.replace(/\s+/g, ' ') : '';
      if (ack) ack.checked = true;
      window.__ghi = [];
      await submitFinishContainer('ctn_m2', true); await sleep(900);
      return { coAck: !!ack, chu };
    },
    bang: ["active_units_gieogieo", "inventory_items_gieogieo", "stock_containers_gieogieo", "stock_transactions_gieogieo"],
    kiem: (n) => {
      const ctn = n.ghi.filter(g => /stock_containers_gieogieo[^/]*\/ctn_m2$/.test(duongGhi(g)) && g.d && g.d.status === 'finished');
      const w = n.ghi.filter(g => /stock_transactions_gieogieo/.test(duongGhi(g)) && g.d && g.d.type === 'WASTE' && g.d.itemId === 'milk');
      return [
        [n.sau && n.sau.coAck && /còn 300 ml/.test(n.sau.chu), 'tấm báo hết hiện «còn 300 ml» + ô xác nhận hao hụt — ' + (n.sau && n.sau.chu)],
        [ctn.length === 1 && ctn[0].d.wasteBase === 300, 'mã ctn_m2 → finished, wasteBase 300 — ' + JSON.stringify(ctn.map(g => g.d.wasteBase))],
        [w.length === 1 && w[0].d.qty === -300, 'sổ kho: một dòng WASTE sữa −300 — ' + JSON.stringify(w.map(g => g.d.qty))],
        [n.ghi.some(g => /active_units_gieogieo/.test(duongGhi(g)) && (g.op === 'transaction' || g.op === 'remove') && !(g.d && g.d.ctn_m2)), 'gỡ mã khỏi RT đang mở']
      ];
    }
  },
  // 2C — ĐỔ LY thành phẩm (màn Hao hụt › Đổ ly): công thức thật (computeConsumptionForOrder) → NL có tem phân bổ FIFO + NL thường + BTP
  doLy: {
    mo: 'doly',
    chay: async () => window.KB_DOLY(false),
    kiem: (n) => kiemDoLy(n, false)
  },
  // 2C — ĐỔ LY lỗi một phần: lần ghi sổ dòng Trà lài rớt mạng → giữ «chờ ghi lại» (dwPending_pos) → bấm Ghi lại chỉ ghi phần lỗi, dọn pending
  doLyGhiLai: {
    mo: 'doly',
    chay: async () => window.KB_DOLY(true),
    kiem: (n) => kiemDoLy(n, true).concat([
      [n.sau && n.sau.pendingSauLoi && /"eventId":"dw_ID"/.test(n.sau.pendingSauLoi), 'sau lỗi: localStorage dwPending_pos giữ wasteEventId — ' + (n.sau && n.sau.pendingSauLoi)],
      [n.toasts.some(t => /1\/3 nguyên liệu chưa trừ được/.test(t)), 'toast «1/3 nguyên liệu chưa trừ được — bấm Ghi lại»'],
      [n.ghi.some(g => /!hong$/.test(g.op)), 'đúng một lượt ghi bị cài lỗi'],
      [n.sau && n.sau.pendingSauCung === null, 'ghi lại xong: dọn dwPending_pos']
    ])
  },
  // 2D — HẠN DÙNG trong ca (chuông «Lô sắp hết hạn»): danh sách lô / mã sắp hết hạn → «Còn dùng được» lô BTP b2 (PIN, gia hạn +24 giờ, in tem)
  hanGiaHan: {
    mo: 'han', gioCo: HAN_T,
    chay: async () => window.KB_HAN('soon', 'prep:b2', 'keep'),
    bang: ["prep_batches_gieogieo"],
    kiem: (n) => kiemHan(n, ['prep:b1:true', 'prep:b2:false', 'item:ctn_h1:false']).concat([
      [n.ghi.some(g => /prep_batches_gieogieo[^/]*\/b2$/.test(duongGhi(g)) && g.d && g.d.expiresAt === '2026-10-27T07:53:20.000Z'), 'lô b2: hạn mới = hạn cũ + 24 giờ (2026-10-27T07:53:20Z)'],
      [n.sau && JSON.stringify(n.sau.sau) === '["prep:b1:true","item:ctn_h1:false"]', 'đọc lại: b2 không còn trong danh sách — ' + JSON.stringify(n.sau && n.sau.sau)]
    ])
  },
  // 2D — mã NL đang mở sắp hết hạn → «Còn dùng được» (gia hạn mã sữa, in tem gia hạn)
  hanGiaHanNL: {
    mo: 'han', gioCo: HAN_T,
    chay: async () => window.KB_HAN('soon', 'item:ctn_h1', 'keep'),
    bang: ["stock_containers_gieogieo"],
    kiem: (n) => kiemHan(n, ['prep:b1:true', 'prep:b2:false', 'item:ctn_h1:false']).concat([
      [n.ghi.some(g => /stock_containers_gieogieo[^/]*\/ctn_h1$/.test(duongGhi(g)) && g.d && g.d.expiresAt === '2026-10-27T07:53:20.000Z'), 'mã ctn_h1: hạn mới = hạn cũ + 24 giờ']
    ])
  },
  // 2D — CHECK-OUT còn lô đã quá hạn: chỉ hiện lô quá hạn (b1) → «Bỏ đi» (ghi huỷ phần còn 400 g) → hết việc thì check-out lại
  hanCheckOut: {
    mo: 'han', gioCo: HAN_T,
    chay: async () => window.KB_HAN('checkout', 'prep:b1', 'discard'),
    bang: ["active_units_gieogieo", "prep_batches_gieogieo", "prep_items_gieogieo", "prep_transactions_gieogieo"],
    kiem: (n) => kiemHan(n, ['prep:b1:true']).concat([
      [n.ghi.some(g => /prep_transactions_gieogieo/.test(duongGhi(g)) && g.d && g.d.type === 'WASTE' && Math.abs(g.d.qty) === 400), 'sổ BTP: dòng huỷ 400 g lô b1 — ' + JSON.stringify(n.ghi.filter(g => /prep_transactions/.test(duongGhi(g))).map(g => g.d && g.d.type + ':' + g.d.qty))],
      [n.sau && n.sau.checkOut === 1 && !n.sau.conOverlay, 'hết lô quá hạn → đóng màn, gọi check-out lại đúng một lần'],
      [n.toasts.some(t => /^✅ Đã ghi huỷ lô TCD-261026-1 — 400 g/.test(t)), 'toast «Đã ghi huỷ lô … 400 g» — ' + JSON.stringify(n.toasts)]
    ])
  },
  // 2D — dấu «đã kiểm hạn đầu ca hôm nay» (update, không tạo bản ghi mở ca)
  hanDauCa: {
    mo: 'han', gioCo: HAN_T,
    chay: async () => { window.__ghi = []; await expiryOpenDone(); return {}; },
    bang: ["daily_openings_gieogieo"],
    kiem: (n) => [[n.ghi.length === 1 && n.ghi[0].op === 'update' && /daily_openings_gieogieo[^/]*\/2026-10-26$/.test(n.ghi[0].p) && n.ghi[0].d && 'expiryCheckedAt' in n.ghi[0].d, 'update daily_openings/2026-10-26 { expiryCheckedAt } — ' + JSON.stringify(n.ghi)]]
  },
  // 2C — KIỂM KÊ MÙ: mở màn (đọc danh mục) → đếm Trà lài 900 g → gửi phiếu chờ duyệt
  kiemKe: {
    mo: 'kho',
    chay: async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      window.posConfirm = async () => true;
      await openStockCountScreen(); await sleep(400);
      const l = (stockCountState.items || []).find(x => x.itemId === 'tra');
      if (l) { l.countedBase = 900; l.countedInput = 900; l.unitFactor = (l.unitOptions && l.unitOptions[0] && l.unitOptions[0].baseQty) || 1; }
      window.__ghi = [];
      await submitStockCount(); await sleep(900);
      return { coDong: !!l, soDong: (stockCountState.items || []).length };
    },
    bang: ["stock_counts_gieogieo"],
    kiem: (n) => [
      [n.sau && n.sau.coDong, 'màn kiểm kê có dòng Trà lài'],
      [n.ghi.some(g => /stock_counts_gieogieo/.test(duongGhi(g)) && g.d && g.d.status === 'pending_review' && JSON.stringify(g.d.items).includes('"countedBase":900')), 'gửi phiếu kiểm kê chờ duyệt, Trà lài đếm 900']
    ]
  }
};
// Phần chung đổ ly (chạy TRONG trang): mở màn Hao hụt (mặc định Đổ ly, nạp lý do từ Firebase giả) → 2 ly, chưa rót vào ly → Ghi.
// loi = true: cài lỗi lần ghi sổ đầu của dòng Trà lài (__HONG) → kiểm pending → bấm Ghi lần 2 (cùng lựa chọn).
const KB_DOLY = async (loi) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  window.posConfirm = async () => true;
  try { localStorage.removeItem('dwPending_pos'); } catch (e) {}
  MENU_TOGO = JSON.parse(JSON.stringify(window.__E2E.DOLY.menu));
  KHO_ITEMS_CACHE = Object.values(window.__E2E.NL_KHO).map(x => JSON.parse(JSON.stringify(x)));
  PREP_ITEMS_CACHE_POS = [JSON.parse(JSON.stringify(window.__E2E.PREP))];
  PREP_BATCHES_CACHE_POS = [Object.assign({ id: 'b3' }, window.__E2E.BATCH, window.__E2E.DOLY.lo)];
  window.__buoc = 'mở màn'; await openWasteScreen(); await sleep(300);
  const q = document.getElementById('dwQty'); if (q) { q.value = '2'; q.dispatchEvent(new Event('input')); }
  const cup = [...document.querySelectorAll('#khoTxBody input[type=checkbox]')].find(x => /drinkNoCup/.test(x.getAttribute('onchange') || ''));
  if (cup) { cup.checked = true; cup.dispatchEvent(new Event('change')); }
  await sleep(150);
  const xemTruoc = (document.getElementById('dwPreview') || {}).textContent || '';
  const lyDo = (document.getElementById('dwReasonSelect') || {}).value || null;
  window.__ghi = [];
  if (loi) window.__HONG = [{ op: 'tx.set', re: 'stock_transactions_gieogieo[^/]*/dw_.*_ing_tra$' }];
  window.__buoc = 'ghi lần 1'; await submitDrinkWaste(); await sleep(900);
  let pendingSauLoi = null, pendingSauCung;
  if (loi) {
    pendingSauLoi = localStorage.getItem('dwPending_pos');
    window.__buoc = 'ghi lại'; await submitDrinkWaste(); await sleep(900);
  }
  window.__buoc = 'xong'; pendingSauCung = localStorage.getItem('dwPending_pos');
  return { coCup: !!cup, xemTruoc, lyDo, pendingSauLoi, pendingSauCung, man: (document.querySelector('.screen.active') || {}).id || null };
};
// Phần chung hạn dùng (chạy TRONG trang): đọc danh sách thật (loadExpiryCheckLinesPOS) → màn kiểm hạn thật (phase soon / checkout)
// → bấm nút của dòng `dich` ('prep:b2' / 'item:ctn_h1') → hàm thật gia hạn / bỏ đi → đọc lại. PIN gán đè giống nhau ở hai bản.
const KB_HAN = async (phase, dich, viec) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  window.posConfirm = async () => true;
  window.resolveStaffPinWorkedToday = async () => ({ id: 'e2e_nv', fullName: 'NV E2E', pin: '0000' });
  let checkOut = 0; window.doCheckOut = () => { checkOut++; };
  KHO_ITEMS_CACHE = Object.values(window.__E2E.NL_KHO).map(x => JSON.parse(JSON.stringify(x)));
  PREP_ITEMS_CACHE_POS = [JSON.parse(JSON.stringify(window.__E2E.PREP))];
  const ma = ds => ds.map(x => x.kind + ':' + x.id + ':' + x.expired);
  let truoc;
  if (phase === 'checkout') { const co = await expiryAskOnCheckOut(); truoc = co ? ma(_expCheck.lines) : []; }
  else { await expiryCheckOpenSoon(); await sleep(300); truoc = ma(_expCheck ? _expCheck.lines : []); }
  const i = _expCheck ? _expCheck.lines.findIndex(x => x.kind + ':' + x.id === dich) : -1;
  const nut = [...document.querySelectorAll('#exp-check-overlay button')].filter(x => (x.getAttribute('onclick') || '') === 'expiryCheckAct(' + i + ",'" + viec + "')");
  window.__ghi = [];
  if (nut.length === 1) {
    const st0 = _expCheck; nut[0].click();
    for (let k = 0; k < 100 && (st0.busy || _expCheck === st0); k++) await sleep(100);   // chờ lưu + đọc lại xong (_expCheck đổi / đóng)
    await sleep(300);
  }
  const sau = _expCheck ? ma(_expCheck.lines) : null;
  return { truoc, i, coNut: nut.length, sau, checkOut, conOverlay: !!document.getElementById('exp-check-overlay'), loiMan: (document.querySelector('[id^=expChkMsg_]') || {}).textContent || '' };
};
function kiemHan(n, dsTruoc) {
  return [
    [n.sau && JSON.stringify(n.sau.truoc) === JSON.stringify(dsTruoc), 'danh sách kiểm hạn đúng: ' + JSON.stringify(n.sau && n.sau.truoc)],
    [n.sau && n.sau.coNut === 1, 'màn kiểm hạn có đúng một nút cho dòng cần bấm']
  ];
}
// Dòng sổ kho WASTE đã ghi thành công (bỏ lượt bị cài lỗi), theo itemId → qty; dòng sổ BTP WASTE
const soWaste = n => n.ghi.filter(g => !/!hong$/.test(g.op) && /stock_transactions_gieogieo/.test(duongGhi(g)) && g.d && g.d.type === 'WASTE');
const soPrepWaste = n => n.ghi.filter(g => !/!hong$/.test(g.op) && /prep_transactions_gieogieo/.test(duongGhi(g)) && g.d && g.d.type === 'WASTE');
// unitBase cuối cùng của một mã đang mở theo các transaction RT đã ghi (bản ghi đã chuẩn hoá)
const rtCuoi = (n, item, id) => { let v; for (const g of n.ghi) if (g.op === 'transaction' && new RegExp('active_units_gieogieo[^/]*/' + item + '$').test(g.p) && g.d && g.d[id]) v = g.d[id].unitBase; return v; };
function kiemDoLy(n, loi) {
  const w = soWaste(n), pw = soPrepWaste(n);
  const theo = id => w.filter(g => g.d.itemId === id).map(g => g.d.qty);
  const ev = new Set([...w, ...pw].map(g => g.d.wasteEventId));
  const milk = w.find(g => g.d.itemId === 'milk');
  return [
    [n.sau && n.sau.coCup && n.sau.lyDo === 'r1', 'màn Đổ ly có ô «Chưa rót vào ly» + lý do cấu hình sẵn (r1)'],
    [n.sau && /Sẽ trừ 3 loại nguyên liệu/.test(n.sau.xemTruoc), 'xem trước «Sẽ trừ 3 loại nguyên liệu» — ' + (n.sau && n.sau.xemTruoc)],
    [JSON.stringify(theo('milk')) === '[-50]' && JSON.stringify(theo('tra')) === '[-20]', 'sổ kho: đúng MỘT dòng WASTE mỗi NL — sữa −50, trà −20 (không ghi lặp) — ' + JSON.stringify(w.map(g => g.d.itemId + ':' + g.d.qty))],
    [pw.length === 1 && Math.abs(Math.abs(pw[0].d.qty) - 60) < 1e-9, 'sổ BTP: một dòng WASTE 60 g Trân châu đường — ' + JSON.stringify(pw.map(g => g.d.qty))],
    [ev.size === 1, 'mọi dòng chung một wasteEventId'],
    [!!milk && JSON.stringify(milk.d.fifoAllocations) === JSON.stringify([{ containerId: 'ctn_d1', code: 'SUA00003', itemName: 'Sữa tươi', unit: 'ml', qty: 50 }]), 'sữa: phân bổ FIFO đúng 50 ml vào mã đang mở ctn_d1 — ' + JSON.stringify(milk && milk.d.fifoAllocations)],
    [rtCuoi(n, 'milk', 'ctn_d1') === 750 && rtCuoi(n, 'tcd', 'b3') === 940, 'RT sau thao tác: mã sữa 800 → 750, lô BTP 1000 → 940 — ' + rtCuoi(n, 'milk', 'ctn_d1') + ' / ' + rtCuoi(n, 'tcd', 'b3')],
    [n.ghi.filter(g => /prep_batches_gieogieo[^/]*\/b3$/.test(duongGhi(g)) && g.d && g.d.qtyRemaining === 940).length === 1, 'lô BTP b3: qtyRemaining 940'],
    [n.toasts.some(t => /^✅ Đã ghi hao hụt 2 ly Trà sữa E2E \(M\)/.test(t)), 'toast «Đã ghi hao hụt 2 ly …» — ' + JSON.stringify(n.toasts)],
    [n.sau && n.sau.man === 'khoScreen', 'xong về màn Kho — ' + (n.sau && n.sau.man)]
  ];
}
// Đếm trên lượt ghi đã chuẩn hoá
const duongGhi = g => (String(g.op).includes('@') ? String(g.op).split('@')[1] : g.p);
const soGhi = (n, re) => n.ghi.filter(g => /^tx\.set@|^set$/.test(g.op.replace(/@.*/, '@')) && re.test(duongGhi(g))).length;
const maMa = (n, item) => new Set(n.ghi.filter(g => /^(set|tx\.set@)/.test(g.op) && /stock_containers_gieogieo/.test(duongGhi(g)) && g.d && g.d.itemId === item).map(duongGhi)).size;
const phieu = n => n.ghi.filter(g => /receiving_records_gieogieo/.test(duongGhi(g))).map(g => g.d);

async function chay(b, base, store, ten) {
  const t = await moTrang(b, base, KICH_BAN[ten].gioCo ? { authNgay: true, store, gioCo: KICH_BAN[ten].gioCo } : { authNgay: true, store, ngauNhienCo: true });
  const r = await t.page.evaluate(async ({ src, dau, doly, han, mo, ITEMS, PO, E2E }) => {
    const toasts = []; const _t = window.toast;
    window.toast = function (m) { toasts.push(String(m)); try { return _t.apply(this, arguments); } catch (e) {} };
    window.requireShiftOpened = () => true; window.requireOpeningChecklistDone = () => true;
    window.requireSomeoneCheckedIn = () => true; window.requireSomeoneCheckedInAsync = async () => true;
    window.resolveStaffPinAndCheckin = async () => ({ id: 'e2e_nv', fullName: 'NV E2E', pin: '0000' });
    const S = {}; const ten = n => GieoData.fsPath(n);   // mồi đặt ĐÚNG tên bảng của quán đang chạy (đọc qua lớp GieoData)
    for (const [id, it] of Object.entries(ITEMS)) S[ten('inventory_items_gieogieo') + '/' + id] = it;
    if (mo === 'po') S[ten('purchase_orders_gieogieo') + '/po1'] = PO;
    window.__E2E = { ITEMS, PREP: E2E.PREP, BATCH: E2E.BATCH, NL_NAU: E2E.NL_NAU, PREP_NAU: E2E.PREP_NAU, NL_KHO: E2E.NL_KHO, DOLY: E2E.DOLY, HAN: E2E.HAN };
    if (mo === 'kho') {
      for (const [id, it] of Object.entries(E2E.NL_KHO)) S[ten('inventory_items_gieogieo') + '/' + id] = it;
      S[ten('stock_containers_gieogieo') + '/ctn_m1'] = E2E.CTN1; S[ten('stock_containers_gieogieo') + '/ctn_m2'] = E2E.CTN2;
      S[GieoData.rtPath('active_units_gieogieo') + '/milk/ctn_m2'] = { code: 'SUA00002', itemName: 'Sữa tươi', unit: 'ml', unitBase: 0, capacity: 1000, openedAt: 1793000000000, rev: 1 };
    }
    if (mo === 'doly') {
      for (const [id, it] of Object.entries(E2E.NL_KHO)) S[ten('inventory_items_gieogieo') + '/' + id] = it;
      S[ten('stock_containers_gieogieo') + '/ctn_d1'] = E2E.DOLY.ctn;
      S[GieoData.rtPath('active_units_gieogieo') + '/milk/ctn_d1'] = E2E.DOLY.rt;
      S[ten('prep_items_gieogieo') + '/tcd'] = E2E.PREP;
      S[ten('prep_batches_gieogieo') + '/b3'] = Object.assign({}, E2E.BATCH, E2E.DOLY.lo);
      S[GieoData.rtPath('active_units_gieogieo') + '/tcd/b3'] = E2E.DOLY.rtLo;
      S[ten('recipes_gieogieo') + '/togo:tsm'] = E2E.DOLY.recipe;
      S[ten('waste_reasons_gieogieo') + '/r1'] = { label: 'Làm đổ khi pha', active: true };
      window.__SNAP = true;   // bộ đệm sống công thức / bao bì (_posLiveSubscribe) chờ ảnh đầu của onSnapshot
    }
    if (mo === 'han') {
      for (const [id, it] of Object.entries(E2E.NL_KHO)) S[ten('inventory_items_gieogieo') + '/' + id] = it;
      S[ten('prep_items_gieogieo') + '/tcd'] = E2E.PREP;
      for (const [id, l] of Object.entries(E2E.HAN.lo)) {
        S[ten('prep_batches_gieogieo') + '/' + id] = Object.assign({}, E2E.BATCH, { status: 'active', qtyInitial: 1000, finishedAt: '2026-10-26T01:00:00.000Z' }, l);
        S[GieoData.rtPath('active_units_gieogieo') + '/tcd/' + id] = { code: l.batchCode, itemName: 'Trân châu đường', unit: 'g', capacity: 1000, openedAt: 1792990000000, unitBase: l.qtyRemaining };
      }
      S[ten('stock_containers_gieogieo') + '/ctn_h1'] = E2E.HAN.ctn;
      S[GieoData.rtPath('active_units_gieogieo') + '/milk/ctn_h1'] = { code: 'SUA00004', itemName: 'Sữa tươi', unit: 'ml', unitBase: 700, capacity: 1000, openedAt: 1792914800000, rev: 1 };
      S[ten('daily_openings_gieogieo') + '/2026-10-26'] = { openedAt: '2026-10-26T00:30:00.000Z' };
    }
    if (mo === 'nau') {
      for (const [id, it] of Object.entries(E2E.NL_NAU)) S[ten('inventory_items_gieogieo') + '/' + id] = it;
      for (const [id, it] of Object.entries(E2E.PREP_NAU)) S[ten('prep_items_gieogieo') + '/' + id] = it;
      S[ten('stock_containers_gieogieo') + '/ctn_tcg1'] = { code: 'TCG00001', itemId: 'pearlg', itemName: 'Trân châu gói', unit: 'g', trackingMode: 'unit', countUnitName: 'Bịch',
        baseQty: 2000, unitBase: 2000, status: 'sealed', labelPrinted: true, receivedAt: '2026-10-25T03:00:00.000Z', businessDate: '2026-10-25', openShelfLifeHours: 48 };
    }
    if (mo === 'prep') {
      S[ten('prep_items_gieogieo') + '/tcd'] = E2E.PREP;
      for (const id of E2E.lo) S[ten('prep_batches_gieogieo') + '/' + id] = Object.assign({}, E2E.BATCH, E2E.loActive ? { status: 'active', batchCode: 'TCD-261026-1', qtyInitial: 1000, qtyRemaining: 1000, finishedAt: '2026-10-26T02:00:00.000Z', expiresAt: '2026-10-26T10:00:00.000Z' } : {});
      if (E2E.tieuHao) S[ten('stock_transactions_gieogieo') + '/cons_b2_pearl'] = { itemId: 'pearl', type: 'CONSUMPTION', qty: -500, referenceId: 'b2', prepBatchId: 'b2', businessDate: '2026-10-26', createdAt: '2026-10-26T01:00:00.000Z', status: 'posted' };
    }
    window.__SEED = S; window.__SEED_GHI = true; window.__HONG = [];
    window.KB_DAU = (0, eval)('(' + dau + ')'); window.KB_DOLY = (0, eval)('(' + doly + ')'); window.KB_HAN = (0, eval)('(' + han + ')');
    let loiKB = null, sau = null;
    window.__buoc = '';   // kịch bản treo (lời hứa không bao giờ xong) → báo lỗi sau 45 giây kèm bước cuối, không treo cả bài
    try { sau = await Promise.race([(0, eval)('(' + src + ')')({ ITEMS }), new Promise((_, rej) => setTimeout(() => rej(new Error('kịch bản quá 45 giây — bước: ' + window.__buoc)), 45000))]); } catch (e) { loiKB = String(e && e.message || e); }
    return { ghi: (window.__ghi || []).map(g => ({ op: g.op, p: g.p, rt: !!g.rt, d: g.d })), toasts, sau, loiKB };
  }, { src: KICH_BAN[ten].chay.toString(), dau: KB_DAU.toString(), doly: KB_DOLY.toString(), han: KB_HAN.toString(), mo: KICH_BAN[ten].mo, ITEMS, PO, E2E: { PREP, BATCH: BATCH(), NL_NAU, PREP_NAU, NL_KHO, DOLY, HAN, CTN1: CTN('sealed'), CTN2: CTN('open', { unitBase: 0, openedAt: '2026-10-25T05:00:00.000Z', openedBy: 'NV E2E', expiresAt: '2026-10-26T05:00:00.000Z' }), lo: KICH_BAN[ten].lo || [], loActive: !!KICH_BAN[ten].loActive, tieuHao: !!KICH_BAN[ten].tieuHao } });
  r.loi = t.loi.slice().sort(); r.qua = t.qua; await t.ctx.close();
  r.ghiTho = r.ghi; r.ghi = chuanGhi(r.ghi, !!KICH_BAN[ten].gioCo); r.sau = chuanDuLieu(r.sau, undefined, !!KICH_BAN[ten].gioCo);
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
      if (process.env.E2E_KHO_DUMP) fs.writeFileSync(path.join(process.env.E2E_KHO_DUMP, kb + '_' + store + '.json'), JSON.stringify({ moc: m, nay: n }, null, 1));   // gỡ lỗi: lượt ghi đã chuẩn hoá hai bản
    }
    // TỰ KIỂM: bản sao cài lỗi nhỏ vào file JS đã tách → kịch bản tương ứng PHẢI báo lệch ở `ghi`
    const TU_KIEM = [
      { kb: 'nhanHang', file: 'pos_receive.v1.js', tim: /(\bnote:\s*generalNote)/, thay: "$1 + '·hỏng'", mo: 'đổi ghi chú phiếu nhận' },
      { kb: 'huyMe', file: 'pos_prep.v1.js', tim: /Hoàn kho do HUỶ MẺ/, thay: 'Hoàn kho do HUY ME', mo: 'đổi ghi chú dòng hoàn kho khi huỷ mẻ' },
      { kb: 'kiemKe', file: 'pos_count.v1.js', tim: /countedBy: staff, status: 'pending_review'/, thay: "countedBy: staff, status: 'pending'", mo: 'đổi trạng thái phiếu kiểm kê (chỗ ghi phiếu)' },
      { kb: 'doLy', file: 'pos_kho.v1.js', tim: /qty: -qtyUsed, txId/, thay: 'qty: -(qtyUsed + 1), txId', mo: 'đổi lượng trừ NL khi đổ ly' },
      { kb: 'hanGiaHan', file: 'pos_expiry.v1.js', tim: /const PREP_EXTEND_HOURS = 24;/, thay: 'const PREP_EXTEND_HOURS = 25;', mo: 'đổi số giờ gia hạn' },
      { kb: 'batDauMe', file: 'pos_prep.v1.js', tim: /note: `Nấu \$\{p\.code/, thay: 'note: `NAU ${p.code', mo: 'đổi ghi chú dòng trừ NL khi bắt đầu nấu' }
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
