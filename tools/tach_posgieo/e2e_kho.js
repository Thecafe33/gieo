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
  // 3A — CHECK-IN qua ô PIN thật (màn Ca làm việc → khối Check-in, gõ 1234 → doCheckIn): ca mới kèm điều khoản lương + chức năng
  caCheckIn: {
    mo: 'ca', gioCo: HAN_T,
    chay: async () => window.KB_CA('in'),
    bang: ["employee_shifts_gieogieo"],
    kiem: (n) => { const g = n.ghi.find(x => x.op === 'add' && /employee_shifts_gieogieo/.test(x.p)); return [
      // GHI NHẬN (có sẵn ở 0bd95a7, không do tách): resolvePinToEmployee chỉ trả {id, fullName} → payTerms rỗng (payType null), roles [].
      // quanlygieo empPayTermsOn bỏ ảnh chụp khi thiếu payType → lương vẫn theo hồ sơ / payHistory.
      [!!g && g.d.employeeId === 'e1' && g.d.employeeName === 'NV Một' && g.d.checkedOutAt === null && g.d.businessDate === '2026-10-26' && g.d.payTerms && g.d.payTerms.payType === null && Array.isArray(g.d.roles), 'thêm ca e1 hôm nay (payTerms rỗng như bản đang chạy) — ' + JSON.stringify(g && g.d)],
      [n.toasts.some(t => /^✅ NV Một đã check-in/.test(t)), 'toast «NV Một đã check-in»'],
      [n.sau && n.sau.trong === 1 && n.sau.pin === '', 'khối check-in vẽ lại: 1 người trong ca, ô PIN đã xoá']]; }
  },
  // 3A — CHECK-OUT qua ô PIN thật: người cuối, ngày chưa đóng → hộp xác nhận (đồng ý) → cập nhật giờ ra
  caCheckOut: {
    mo: 'ca', gioCo: HAN_T, caMo: true,
    chay: async () => window.KB_CA('out'),
    bang: ["employee_shifts_gieogieo"],
    kiem: (n) => { const g = n.ghi.find(x => x.op === 'update' && /employee_shifts_gieogieo[^/]*\/s1$/.test(x.p)); return [
      [!!g && g.d && typeof g.d.checkedOutAt === 'string', 'cập nhật ca s1 { checkedOutAt } — ' + JSON.stringify(g && g.d)],
      [n.sau && n.sau.hoi === 1, 'người cuối + ngày chưa đóng → hỏi xác nhận đúng một lần'],
      [n.toasts.some(t => /^✅ NV Một đã check-out/.test(t)), 'toast «NV Một đã check-out» — ' + JSON.stringify(n.toasts)]]; }
  },
  // 3A — MỞ CA: đếm tiền quỹ (2 × 500.000 + 1 × 200.000) → submitShiftOpen → bản ghi mở ca + đoạn ca số 1
  caMoCa: {
    mo: 'ca', gioCo: HAN_T, caMo: true,
    chay: async () => window.KB_CA('moca'),
    bang: ["daily_openings_gieogieo", "shift_segments_gieogieo", "staff_target_days_gieogieo"],
    kiem: (n) => { const g = n.ghi.find(x => x.op === 'set' && /daily_openings_gieogieo[^/]*\/2026-10-26$/.test(x.p)); return [
      [!!g && g.d.openingCash === 1200000 && g.d.businessDate === '2026-10-26' && g.d.staffEmployeeId === 'e2e_nv', 'bản ghi mở ca 26/10: tiền quỹ 1.200.000 — ' + JSON.stringify(g && g.d)],
      [n.toasts.some(t => /^✅ Đã mở ca/.test(t)), 'toast «Đã mở ca» — ' + JSON.stringify(n.toasts)]]; }
  },
  // 3A — TICK VIỆC ĐẦU CA: mục «Lau quầy» → daily_openings.checklistDone (arrayUnion) + nhật ký việc
  caTickViec: {
    mo: 'ca', gioCo: HAN_T, caMo: true,
    chay: async () => window.KB_CA('tick'),
    bang: ["daily_openings_gieogieo"],
    kiem: (n) => { const g = n.ghi.find(x => x.op === 'set' && /daily_openings_gieogieo[^/]*\/2026-10-26$/.test(x.p)); return [
      [!!g && g.d.checklistDone && g.d.checklistDone.__fv === 'arrayUnion' && g.d.checklistDone.v[0].id === 'lau' && g.d.checklistDone.v[0].staffEmployeeId === 'e2e_nv', 'daily_openings 26/10: checklistDone arrayUnion { id: lau, người ký } — ' + JSON.stringify(g && g.d)]]; }
  },
  // 3B — KẾT CA: đối soát tiền mặt MÙ khớp — mở ca 1.000.000 − chi tiền mặt 100.000 = 900.000; đếm 1 × 500.000 + 2 × 200.000, PIN thật e1
  ketDoiSoatKhop: {
    mo: 'ket', gioCo: HAN_T,
    chay: async () => window.KB_KET('khop'),
    bang: ["daily_closings_gieogieo", "shift_segments_gieogieo"],
    kiem: (n) => { const g = n.ghi.find(x => x.op === 'set' && /daily_closings_gieogieo[^/]*\/2026-10-26$/.test(x.p)); return [
      [!!g && g.d.status === 'cash_passed' && g.d.finalActualCash === 900000 && g.d.finalExpectedCash === 900000 && g.d.finalVariance === 0 && g.d.attempts && g.d.attempts.__fv === 'arrayUnion' && g.d.attempts.v[0].passed === true, 'daily_closings 26/10: cash_passed, thực 900.000 = kỳ vọng 900.000, lần đếm passed — ' + JSON.stringify(g && g.d)],
      [n.ghi.some(x => /shift_segments_gieogieo[^/]*\/2026-10-26_1$/.test(x.p) && x.d && x.d.status === 'closed' && x.d.endCash === 900000), 'chốt đoạn ca 1: closed, endCash 900.000'],
      [n.toasts.some(t => /^✅ Đã đối soát tiền mặt/.test(t)), 'toast «Đã đối soát tiền mặt» — ' + JSON.stringify(n.toasts)]]; }
  },
  // 3B — KẾT CA: đếm lệch (850.000), lần đầu → pending + «còn 1 lần đếm», không chốt đoạn ca
  ketDoiSoatLech: {
    mo: 'ket', gioCo: HAN_T,
    chay: async () => window.KB_KET('lech'),
    bang: ["daily_closings_gieogieo"],
    kiem: (n) => { const g = n.ghi.find(x => x.op === 'set' && /daily_closings_gieogieo[^/]*\/2026-10-26$/.test(x.p)); return [
      [!!g && g.d.status === 'pending' && !('cashPassedAt' in g.d) && g.d.attempts.v[0].passed === false && g.d.attempts.v[0].variance === -50000, 'daily_closings: pending, lần đếm lệch −50.000, chưa chốt — ' + JSON.stringify(g && g.d)],
      [!n.ghi.some(x => /shift_segments_gieogieo/.test(x.p) && x.d && x.d.status === 'closed'), 'không chốt đoạn ca'],
      [n.toasts.some(t => /còn 1 lần đếm/.test(t)), 'toast «còn 1 lần đếm»']]; }
  },
  // 3B — GIAO CA GIỮA NGÀY: e1 (giữ két) đếm 900.000 → PIN thật 1234; e2 đếm 900.000 → PIN thật 5678; khớp sổ → chốt đoạn 1, mở đoạn 2 cho e2
  ketGiaoCa: {
    mo: 'ket', gioCo: HAN_T,
    chay: async () => window.KB_KET('giaoca'),
    bang: ["shift_segments_gieogieo", "shift_workflows_gieogieo"],
    kiem: (n) => { const s1 = n.ghi.find(x => /shift_segments_gieogieo[^/]*\/2026-10-26_1$/.test(x.p) && x.d && x.d.endType); const s2 = n.ghi.find(x => /shift_segments_gieogieo[^/]*\/2026-10-26_2$/.test(x.p)); return [
      [n.sau && JSON.stringify(n.sau.phaSau) === '["out","in"]', 'pha đếm: giao (out) → nhận (in) — ' + JSON.stringify(n.sau && n.sau.phaSau)],
      [!!s1 && s1.d.endCash === 900000, 'đoạn 1 chốt endCash 900.000 — ' + JSON.stringify(s1 && s1.d)],
      [!!s2 && s2.d.custodianId === 'e2' && s2.d.startCash === 900000 && s2.d.status === 'open', 'đoạn 2 mở: e2 giữ két, startCash 900.000 — ' + JSON.stringify(s2 && s2.d)]]; }
  },
  // 3B — ĐÓNG NGÀY: đã bàn giao, không ai trong ca → màn checklist thật → tick «không còn bill dở» → PIN thật e1 → closed
  ketDongNgay: {
    mo: 'ket', gioCo: HAN_T, ketDong: true,
    chay: async () => window.KB_KET('dong'),
    bang: ["alerts_gieogieo", "daily_closings_gieogieo", "duty_digests_gieogieo"],
    kiem: (n) => { const g = n.ghi.find(x => x.op === 'set' && /daily_closings_gieogieo[^/]*\/2026-10-26$/.test(x.p) && x.d && x.d.status === 'closed'); return [
      [!!g && g.d.closedByEmployeeId === 'e1' && typeof g.d.closedAt === 'string', 'daily_closings 26/10: closed, người ký e1 — ' + JSON.stringify(g && g.d)],
      [n.sau && n.sau.coO, 'màn đóng ngày có ô «không còn bill dở»'],
      [n.toasts.some(t => /^✅ Đã đóng ngày/.test(t)), 'toast «Đã đóng ngày» — ' + JSON.stringify(n.toasts)]]; }
  },
  // 3B — DỌN CA TREO ngày cũ: ca e2 hôm 25/10 chưa check-out, ngày đó đã đóng lúc 15:10Z → check-out hộ đúng giờ đóng ngày
  ketCaTreo: {
    mo: 'ket', gioCo: HAN_T, ketTreo: true,
    chay: async () => window.KB_KET('treo'),
    bang: ["employee_shifts_gieogieo"],
    kiem: (n) => { const g = n.ghi.find(x => x.op === 'update' && /employee_shifts_gieogieo[^/]*\/s0$/.test(x.p)); return [
      [!!g && g.d.checkedOutAt === '2026-10-25T15:10:00.000Z' && g.d.autoCheckOut === true, 'ca s0 (25/10) check-out hộ đúng giờ đóng ngày 15:10Z — ' + JSON.stringify(g && g.d)],
      [n.sau && n.sau.so === 1, 'trả về 1 ca đã chốt'],
      [n.toasts.some(t => /Đã chốt hộ 1 ca/.test(t)), 'toast «Đã chốt hộ 1 ca»']]; }
  },
  // 3A/3B (kiểm lượt 13 đề nghị) — MỞ CA ĐẦY ĐỦ: mở ca (PIN thật) → kiểm kê đầu ca 900 g (PIN thật) → tick việc bắt buộc (PIN thật)
  // → nút «Xong việc đầu ca» → về màn bán; chờ HOÀN TẤT từng bước (không cắt 4 giây), đếm số lần gọi bước tiếp sau kiểm kê
  caMoCaDayDu: {
    mo: 'ca', gioCo: HAN_T, caMo: true, caDayDu: true,
    chay: async () => window.KB_CA('mocaFull'),
    bang: ["daily_openings_gieogieo", "shift_inventory_counts_gieogieo", "shift_segments_gieogieo", "shift_workflows_gieogieo", "staff_target_days_gieogieo"],
    kiem: (n) => { const op = n.ghi.find(x => x.op === 'set' && /daily_openings_gieogieo[^/]*\/2026-10-26$/.test(x.p) && x.d && x.d.openingCash); const kk = n.ghi.find(x => /shift_inventory_counts_gieogieo[^/]*\/2026-10-26_open$/.test(duongGhi(x))); return [
      [!!op && op.d.openingCash === 1200000 && op.d.staffEmployeeId === 'e1', 'mở ca 1.200.000 do e1 (PIN thật qua resolveStaffPinAndCheckin) — ' + JSON.stringify(op && op.d)],
      [!!kk && kk.d.lines.length === 1 && kk.d.lines[0].itemId === 'tra' && kk.d.lines[0].countedQty === 900, 'phiếu kiểm kê đầu ca: Trà lài 900 — ' + JSON.stringify(kk && kk.d.lines)],
      [n.ghi.some(x => x.op === 'set' && /daily_openings_gieogieo/.test(x.p) && x.d && x.d.checklistDone && x.d.checklistDone.v[0].id === 'lau'), 'việc «Lau quầy» đã tick'],
      [n.sau && n.sau.dong === 1 && n.sau.coNut, 'màn kiểm kê có 1 dòng; có nút «Xong việc đầu ca»'],
      [n.sau && n.sau.cb === 1, 'bước tiếp sau kiểm kê gọi ĐÚNG 1 lần — ' + (n.sau && n.sau.cb)],
      [n.sau && n.sau.busy1 === false && n.sau.busy2 === false && n.sau.busy === false, 'khoá bấm được nhả sau mở ca / kiểm kê / cuối luồng'],
      [n.sau && n.sau.man === 'sm', 'về màn bán (sm) — ' + (n.sau && n.sau.man)]]; }
  },
  // 3B (kiểm lượt 13 F13-1) — ĐẾM BTP CUỐI CA trên màn thật: lô b1 (sổ 500 g) → nút «Cân trừ bì» (bộ cân giả trả 480 g, giống nhau
  // ở hai bản) → PIN thật → «Xác nhận & tiếp tục kết ca» → lưu → bước tiếp (_continueAfterPrepCount) gọi đúng 1 lần
  ketDemBTP: {
    mo: 'ket', gioCo: HAN_T, ketBTP: true,
    chay: async () => window.KB_KET('demBTP'),
    bang: ["active_units_gieogieo", "alerts_gieogieo", "daily_closings_gieogieo", "duty_cases_gieogieo", "prep_batches_gieogieo", "prep_items_gieogieo", "prep_transactions_gieogieo"],
    kiem: (n) => { const lo = n.ghi.find(x => /prep_batches_gieogieo[^/]*\/b1$/.test(duongGhi(x)) && x.d && x.d.qtyRemaining === 480); return [
      [n.sau && n.sau.dong === 1 && n.sau.coCan && n.sau.coNut, 'màn đếm BTP: 1 dòng, có nút cân và nút xác nhận'],
      [!!lo, 'lô b1 ghi qtyRemaining 480 (số cân) — ' + JSON.stringify(n.ghi.filter(x => /prep_batches/.test(duongGhi(x))).map(x => x.d))],
      [n.ghi.some(x => /daily_closings_gieogieo/.test(x.p) && x.d && x.d.prepCountLines && x.d.prepCountLines[0].countedQty === 480 && x.d.prepCountLines[0].varianceQty === -20), 'phiếu cuối ngày: BTP đếm 480, lệch −20 so với sổ 500'],
      [n.sau && n.sau.cb === 1, 'bước tiếp sau đếm BTP gọi ĐÚNG 1 lần — ' + (n.sau && n.sau.cb)],
      [n.sau && n.sau.busy === false, 'khoá bấm được nhả']]; }
  },
  // 3C — QUỸ TIỀN MẶT (màn ẩn ở sidebar, vẫn mở được bằng showScreen): chưa có quỹ hôm nay → form «Bắt đầu ca» tự do
  // (không mật khẩu) → 2 × 500.000 + 1 × 100.000 → Xác nhận (posConfirm) → set cashfund/2026-10-26
  quyMoCa: {
    mo: 'quy', gioCo: HAN_T,
    chay: async () => window.KB_QUY('moca'),
    bang: ["cashfund_gieogieo"],
    kiem: (n) => { const g = n.ghi.find(x => x.op === 'set' && /cashfund_gieogieo[^/]*\/2026-10-26$/.test(x.p)); return [
      [n.sau && n.sau.coForm, 'chưa có quỹ → hiện form nhập tiền đầu ca (không hỏi mật khẩu)'],
      [!!g && g.d.date === '2026-10-26' && g.d.open && g.d.open.total === 1100000 && g.d.open.locked === true && g.d.currentDenominations['500000'] === 2 && g.d.currentDenominations['100000'] === 1, 'cashfund 26/10: quỹ đầu ca 1.100.000 (2 × 500k + 1 × 100k), khoá — ' + JSON.stringify(g && g.d)],
      [n.sau && n.sau.hoi === 1, 'hỏi xác nhận đúng 1 lần'],
      [n.toasts.some(t => /^✅ Đã lưu tiền quỹ đầu ca/.test(t)), 'toast «Đã lưu tiền quỹ đầu ca» — ' + JSON.stringify(n.toasts)]]; }
  },
  // 3C — GHI CHI TIÊU: quỹ đã mở 1.000.000 → bấm «+ Ghi chi tiêu» (mật khẩu SAI trước: không vào form) → mật khẩu đúng →
  // lấy ra 1 × 100.000, thối về 1 × 20.000 → update expenses (arrayUnion) + currentDenominations (increment)
  quyChiTieu: {
    mo: 'quy', gioCo: HAN_T, quyDoc: true,
    chay: async () => window.KB_QUY('chi'),
    bang: ["cashfund_gieogieo"],
    kiem: (n) => { const g = n.ghi.find(x => x.op === 'update' && /cashfund_gieogieo[^/]*\/2026-10-26$/.test(x.p)); const e = g && g.d.expenses && g.d.expenses.v && g.d.expenses.v[0]; return [
      [n.sau && n.sau.saiMK === false && n.toasts.some(t => /^❌ Sai mật khẩu/.test(t)), 'mật khẩu sai → toast «Sai mật khẩu», không vào form'],
      [!!e && g.d.expenses.__fv === 'arrayUnion' && e.note === 'Mua đá' && e.takenOutTotal === 100000 && e.changeTotal === 20000 && e.netAmount === 80000, 'expenses arrayUnion: Mua đá, lấy 100.000, thối 20.000, chi 80.000 — ' + JSON.stringify(g && g.d)],
      [!!g && g.d['currentDenominations.100000'] === -1 && g.d['currentDenominations.20000'] === 1 && Object.keys(g.d).length === 3, 'tồn mệnh giá: 100k −1, 20k +1 (increment — Firebase giả ghi số gia), không đụng mệnh giá khác'],
      [n.toasts.some(t => /^✅ Đã ghi chi tiêu/.test(t)), 'toast «Đã ghi chi tiêu»']]; }
  },
  // 3C — KẾT CA QUỸ: quỹ 1.000.000, một bill tiền mặt 50.000 hôm nay → «Kết ca ngày hôm nay» (mật khẩu đúng) → đếm 1.000.000
  // → close { cashRevenueToday 50.000, expectedTotal 1.050.000, diff −50.000 }
  quyKetCa: {
    mo: 'quy', gioCo: HAN_T, quyDoc: true,
    chay: async () => window.KB_QUY('ket'),
    bang: ["cashfund_gieogieo"],
    kiem: (n) => { const g = n.ghi.find(x => x.op === 'set' && /cashfund_gieogieo[^/]*\/2026-10-26$/.test(x.p)); const c = g && g.d.close; return [
      [!!c && c.total === 1000000 && c.cashRevenueToday === 50000 && c.expectedTotal === 1050000 && c.diff === -50000, 'close: đếm 1.000.000, doanh thu tiền mặt 50.000, kỳ vọng 1.050.000, lệch −50.000 — ' + JSON.stringify(g && g.d)],
      [n.toasts.some(t => /^✅ Đã kết ca/.test(t)), 'toast «Đã kết ca»']]; }
  },
  // 3C — MỞ KÉT TAY: máy in Bill giả đã kết nối (giống nhau ở hai bản) → tấm Mở két → «Khác» không ghi chú (bị chặn) → «Đổi tiền lẻ»
  // → người ký tự điền (một mình trong ca) → lệnh mở két đúng 1 lần → nhật ký cash_drawer_logs
  moKet: {
    mo: 'quy', gioCo: HAN_T,
    chay: async () => window.KB_QUY('ket_tien'),
    bang: ["cash_drawer_logs_gieogieo"],
    kiem: (n) => { const g = n.ghi.find(x => x.op === 'add' && /cash_drawer_logs_gieogieo/.test(x.p)); return [
      [n.sau && n.sau.lyDo === 4 && n.sau.kyTen === 'NV Một', 'tấm Mở két: 4 lý do, người ký tự điền NV Một'],
      [n.toasts.some(t => /Ghi rõ lý do vào ô ghi chú/.test(t)), '«Khác» không ghi chú → bị chặn'],
      [n.sau && n.sau.lenh === 1 && n.sau.conTam === false, 'gửi lệnh mở két đúng 1 lần, đóng tấm'],
      [!!g && g.d.reason === 'Đổi tiền lẻ' && g.d.employeeId === 'e1' && g.d.employeeName === 'NV Một' && g.d.businessDate === '2026-10-26' && g.d.note === '', 'nhật ký: Đổi tiền lẻ, e1, 26/10 — ' + JSON.stringify(g && g.d)],
      [n.toasts.some(t => /^✅ Đã mở két — đã ghi nhật ký/.test(t)), 'toast «Đã mở két — đã ghi nhật ký»']]; }
  },
  // 3C — MỞ KÉT lỗi lệnh (máy in giả ném lỗi): không ghi nhật ký, nút Mở két bật lại, tấm còn; máy in chưa kết nối → không mở tấm
  moKetLoi: {
    mo: 'quy', gioCo: HAN_T,
    chay: async () => window.KB_QUY('ket_loi'),
    bang: [],
    kiem: (n) => [
      [n.ghi.length === 0, 'không có lượt ghi'],
      [n.sau && n.sau.tamChuaKetNoi === false && n.toasts.some(t => /Máy in Bill chưa kết nối/.test(t)), 'chưa kết nối máy in → không mở tấm, báo'],
      [n.sau && n.sau.conTam === true && n.sau.nutBat === true, 'lệnh lỗi → tấm còn, nút Mở két bật lại'],
      [n.toasts.some(t => /^❌ Không gửi được lệnh mở két/.test(t)), 'toast «Không gửi được lệnh mở két»']]
  },
  // 3C (kiểm lượt 14 đề nghị) — MỞ KÉT hai người trong ca: không tự điền → PIN sai (không lệnh, không nhật ký) → PIN đúng e2 → nhật ký e2
  moKetPin: {
    mo: 'quy', gioCo: HAN_T, quyHai: true,
    chay: async () => window.KB_QUY('ket_pin'),
    bang: ["cash_drawer_logs_gieogieo"],
    kiem: (n) => { const g = n.ghi.filter(x => x.op === 'add' && /cash_drawer_logs_gieogieo/.test(x.p)); return [
      [n.sau && n.sau.oPin === true, 'hai người trong ca → hiện ô PIN (không tự điền)'],
      [n.sau && n.sau.lenhSai === 0 && n.toasts.some(t => /Mã PIN không tồn tại/.test(t)), 'PIN sai → không gửi lệnh, báo'],
      [n.sau && n.sau.lenh === 1 && n.sau.conTam === false, 'PIN đúng → đúng 1 lệnh mở két, đóng tấm'],
      [g.length === 1 && g[0].d.employeeId === 'e2' && g[0].d.reason === 'Kiểm đếm két', 'đúng một nhật ký: e2, Kiểm đếm két — ' + JSON.stringify(g.map(x => x.d))]]; }
  },
  // 3C (kiểm lượt 14 đề nghị) — MỞ KÉT được nhưng GHI NHẬT KÝ LỖI (Firebase giả cài lỗi add): đúng 1 lệnh, tấm đóng, cảnh báo «CHƯA ghi được nhật ký»
  moKetNhatKyLoi: {
    mo: 'quy', gioCo: HAN_T,
    chay: async () => window.KB_QUY('ket_nhatky_loi'),
    bang: ["cash_drawer_logs_gieogieo"],   // chỉ lượt bị cài lỗi (add!hong)
    kiem: (n) => [
      [n.ghi.some(x => x.op === 'add!hong' && /cash_drawer_logs_gieogieo/.test(x.p)) && !n.ghi.some(x => x.op === 'add'), 'lỗi thật sự được cài vào lượt ghi nhật ký (add!hong), không có nhật ký nào ghi được'],
      [n.sau && n.sau.lenh === 1 && n.sau.conTam === false, 'két vẫn mở đúng 1 lần, tấm đóng'],
      [n.toasts.some(t => /Két đã mở nhưng CHƯA ghi được nhật ký/.test(t)), 'toast cảnh báo «Két đã mở nhưng CHƯA ghi được nhật ký» — ' + JSON.stringify(n.toasts)]]
  },
  // 4A — SỬA DANH MỤC món To Go: thêm (thiếu tên bị chặn) → sửa giá L món m1 → xoá món m1 (posConfirm) — nút bấm thật trên màn Quản lý menu
  menuMon: {
    mo: 'menu', gioCo: HAN_T,
    chay: async () => window.KB_MENU('mon'),
    bang: ["menu_togo_gieogieo"],
    kiem: (n) => { const g = n.ghi.filter(x => /menu_togo_gieogieo/.test(x.p)); return [
      [n.toasts.some(t => /Vui lòng nhập tên món/.test(t)), 'thiếu tên → chặn, báo'],
      [g.some(x => x.op === 'set' && /\/push$/.test(x.p) && x.d.name === 'Trà vải E2E' && x.d.type === 'Trà' && x.d.priceM === 32000 && x.d.priceL === 0), 'thêm món: Trà vải E2E, Trà, M 32.000 — ' + JSON.stringify(g)],
      [g.some(x => x.op === 'set' && /\/m1$/.test(x.p) && x.d.name === 'Trà đào' && x.d.priceL === 40000 && x.d.priceM === 30000), 'sửa m1: L 40.000, giữ M 30.000'],
      [g.some(x => x.op === 'remove' && /\/m1$/.test(x.p)) && n.sau && n.sau.hoi === 1, 'xoá m1 sau 1 lần xác nhận'],
      [n.sau && JSON.stringify(n.sau.mon) === '["Trà vải E2E"]', 'danh sách To Go sau cùng: chỉ Trà vải E2E — ' + JSON.stringify(n.sau && n.sau.mon)],
      [n.toasts.some(t => /^✅ Đã thêm món mới/.test(t)) && n.toasts.some(t => /^✅ Đã cập nhật món/.test(t)) && n.toasts.some(t => /^🗑 Đã xoá món/.test(t)), 'toast thêm / cập nhật / xoá']]; }
  },
  // 4A — SỬA DANH MỤC Food: thêm (thiếu giá bị chặn) → sửa giá f1 → xoá f1
  menuFood: {
    mo: 'menu', gioCo: HAN_T,
    chay: async () => window.KB_MENU('food'),
    bang: ["food_gieogieo"],
    kiem: (n) => { const g = n.ghi.filter(x => /food_gieogieo/.test(x.p)); return [
      [n.toasts.some(t => /Vui lòng nhập giá món/.test(t)), 'thiếu giá → chặn, báo'],
      [g.some(x => x.op === 'set' && /\/push$/.test(x.p) && x.d.name === 'Bánh E2E' && x.d.price === 18000 && x.d.color === '#b45309'), 'thêm Food: Bánh E2E 18.000'],
      [g.some(x => x.op === 'set' && /\/f1$/.test(x.p) && x.d.price === 22000), 'sửa f1: 22.000'],
      [g.some(x => x.op === 'remove' && /\/f1$/.test(x.p)), 'xoá f1'],
      [n.sau && JSON.stringify(n.sau.food) === '["Bánh E2E"]', 'Food sau cùng: chỉ Bánh E2E — ' + JSON.stringify(n.sau && n.sau.food)]]; }
  },
  // 4A — SỬA DANH MỤC topping (tab Toppings): thêm → sửa giá To Go t1 → xoá t1
  menuTopping: {
    mo: 'menu', gioCo: HAN_T,
    chay: async () => window.KB_MENU('topping'),
    bang: ["toppings_gieogieo"],
    kiem: (n) => { const g = n.ghi.filter(x => /toppings_gieogieo/.test(x.p)); return [
      [g.some(x => x.op === 'set' && /\/push$/.test(x.p) && x.d.name === 'Thạch E2E' && x.d.price === 5000 && x.d.priceTogo === 6000), 'thêm topping: Thạch E2E 5.000 / To Go 6.000'],
      [g.some(x => x.op === 'set' && /\/t1$/.test(x.p) && x.d.name === 'Trân châu' && x.d.priceTogo === 8000), 'sửa t1: To Go 8.000'],
      [g.some(x => x.op === 'remove' && /\/t1$/.test(x.p)), 'xoá t1'],
      [n.sau && JSON.stringify(n.sau.tp) === '["Thạch E2E"]', 'topping sau cùng: chỉ Thạch E2E — ' + JSON.stringify(n.sau && n.sau.tp)],
      [n.sau && n.sau.tabTp === true, 'màn danh sách topping hiện đúng tab']]; }
  },
  // 4B — MUA THÊM topping sau khi bấm bill: đơn o1 (Trà sữa E2E M, tiền mặt 30.000, tạo 2 phút trước) → mở tấm bổ sung → chọn ly 1
  // → Trân châu × 1 → thanh toán tiền mặt khách đưa 10.000 → xác nhận (PIN gán đè như mọi kịch bản) → transaction node bill + trừ kho phần thêm
  muaThem: {
    mo: 'ban', gioCo: HAN_T,
    chay: async () => window.KB_BAN('them'),
    bang: ["active_units_gieogieo", "order_stock_traces_gieogieo", "orders_gieogieo", "prep_batches_gieogieo", "prep_items_gieogieo", "prep_transactions_gieogieo"],
    kiem: (n) => { const g = n.ghi.find(x => x.op === 'transaction' && /orders_gieogieo[^/]*\/oct\/26\/o1$/.test(x.p) && x.d && x.d.addons); const a = g && g.d.addons[0]; return [
      [!!g && g.d.total === 37000 && a && a.amount === 7000 && a.method === 'TIỀN MẶT' && a.cashGiven === 10000 && a.cashChange === 3000 && a.staffEmployeeId === 'e2e_nv', 'node bill o1: tổng 37.000, addon 7.000 TM, khách đưa 10.000 thối 3.000 — ' + JSON.stringify(g && g.d)],
      [!!g && g.d.itemsArray[0].toppings && g.d.itemsArray[0].toppings.length === 1 && g.d.itemsArray[0].toppings[0].name === 'Trân châu', 'ly 1 có topping Trân châu'],
      [!!g && g.d.consumeJobs && Object.values(g.d.consumeJobs).some(j => j.status === 'pending'), 'việc trừ kho bền (pending) ghi cùng transaction'],
      [rtCuoi(n, 'tcd', 'b3') === 970 && soPrepCons(n).length === 1 && soPrepCons(n)[0].d.qty === -30, 'trừ kho phần thêm: lô BTP b3 1000 → 970, đúng MỘT dòng sổ BTP CONSUMPTION −30 g (GOGS topping) — ' + rtCuoi(n, 'tcd', 'b3')],
      [n.ghi.filter(x => x.op === 'transaction' && /orders_gieogieo[^/]*\/oct\/26\/o1$/.test(x.p)).map(x => Object.values((x.d && x.d.consumeJobs) || {}).map(j => j.status).join()).join('|') === 'pending|running|running|done', 'việc trừ kho bền: pending → running → (kế hoạch) → done'],
      [n.sau && n.sau.hoi === 1, 'hỏi xác nhận đúng 1 lần'],
      [n.toasts.some(t => /^✅ Đã thêm 7\.000đ/.test(t)), 'toast «Đã thêm 7.000đ» — ' + JSON.stringify(n.toasts)]]; }
  },
  // 4B — XOÁ BILL: chi tiết đơn o1 → Xoá → mã sai (báo lỗi, không ghi) → mã đúng → cờ xoá dở → hoàn kho (engine) → xoá node bill → về Lịch sử
  xoaBill: {
    mo: 'ban', gioCo: HAN_T,
    chay: async () => window.KB_BAN('xoa'),
    bang: ["orders_gieogieo"],
    kiem: (n) => { const p = /orders_gieogieo[^/]*\/oct\/26\/o1$/; const iCo = n.ghi.findIndex(x => x.op === 'transaction' && p.test(x.p) && x.d && x.d.deletionPending === true); const iXoa = n.ghi.findIndex(x => x.op === 'remove' && p.test(x.p)); return [
      [n.sau && n.sau.saiMa === true && n.sau.ghiKhiSai === 0, 'mã sai → báo lỗi, chưa ghi gì'],
      [iCo >= 0 && iXoa > iCo, 'cờ xoá dở ghi TRƯỚC, xoá node bill SAU — ' + iCo + ' / ' + iXoa],
      [n.sau && n.sau.conTrongRam === false && n.sau.man === 'hi', 'bỏ khỏi RAM, về màn Lịch sử — ' + (n.sau && n.sau.man)],
      [n.toasts.some(t => /^🗑 Đã xoá đơn/.test(t)), 'toast «Đã xoá đơn» — ' + JSON.stringify(n.toasts)]]; }
  },
  // 4B — DOANH THU + LỊCH SỬ (chỉ đọc): 3 đơn hôm nay (TM 30.000 / CK 45.000 / Food TM 20.000 trên bill CK) → updRv; danh sách Lịch sử (không gõ, gõ mã bill)
  doanhThu: {
    mo: 'ban', gioCo: HAN_T,
    chay: async () => window.KB_BAN('doanhthu'),
    bang: [],
    kiem: (n) => [
      [n.ghi.length === 0, 'không ghi gì'],
      [n.sau && n.sau.rv && /30\.000|50\.000|95\.000/.test(n.sau.rv), 'màn doanh thu có số tiền — ' + (n.sau && n.sau.rv)],
      [n.sau && n.sau.hi1 > 0, 'lịch sử (không gõ) có đơn — ' + (n.sau && n.sau.hi1)],
      [n.sau && n.sau.hiMa >= 1, 'gõ mã bill tìm ra đơn — ' + (n.sau && n.sau.hiMa)]]
  },
  // 4A (kiểm lượt 15, probe 5.1) — LƯU MÓN LỖI RỒI THỬ LẠI: cài đúng MỘT lỗi ghi RT ở món mới → toast «Lỗi», form CÒN, danh sách chưa có món; lưu lại → thành công, form đóng, màn bán (#mg) có món mới
  menuLoiThuLai: {
    mo: 'menu', gioCo: HAN_T,
    chay: async () => window.KB_MENU('loi'),
    bang: ["menu_togo_gieogieo"],
    kiem: (n) => [
      [n.ghi.some(x => x.op === 'set!hong' && x.rt === true) || n.ghi.some(x => x.op === 'set!hong'), 'lượt ghi bị cài lỗi được ghi nhận (set!hong)'],
      [n.sau && n.sau.formConSauLoi === true && n.sau.cuaSauLoi === false, 'lỗi → form CÒN mở, món chưa vào danh sách'],
      [n.toasts.some(t => /^❌ Lỗi:/.test(t)), 'toast «Lỗi» — ' + JSON.stringify(n.toasts)],
      [n.sau && n.sau.formDongSauThu === true && n.sau.cuaSauThu === true && n.sau.manBanCo === true, 'thử lại → form đóng, món có trong danh sách và màn bán (#mg)'],
      [n.ghi.filter(x => x.op === 'set' && /\/push$/.test(x.p) && x.d && x.d.name === 'Trà lỗi E2E').length === 1, 'đúng MỘT lượt ghi thành công (lượt lỗi không tính)']]
  },
  // 4B (kiểm lượt 16, probe 5.3) — XOÁ BILL KHI CÒN VIỆC TRỪ KHO ĐANG CHẠY: node bill có consumeJobs.j1 running (còn hạn) → xoá (mã đúng) phải DỪNG ở nhánh chờ: không cờ xoá dở, không hoàn kho, không xoá bill, báo «Đang trừ kho»
  xoaBillJobChay: {
    mo: 'ban', gioCo: HAN_T,
    chay: async () => window.KB_BAN('xoaJob'),
    bang: [],
    kiem: (n) => [
      [!n.ghi.some(x => x.op === 'remove') && !n.ghi.some(x => x.op === 'transaction' && x.d && x.d.deletionPending), 'không xoá node bill, không ghi cờ xoá dở'],
      [n.toasts.some(t => /Đang trừ kho phần bổ sung topping/.test(t)), 'toast «Đang trừ kho phần bổ sung topping … CHƯA xoá» — ' + JSON.stringify(n.toasts)],
      [n.sau && n.sau.conTrongRam === true && n.sau.jobConNguyen === true, 'bill còn trong RAM + RT, việc trừ kho vẫn running']]
  },
  // 4C — TRA CỨU KHÁCH (chỉ đọc): gõ SĐT có thành viên (0901234567: 5 tem) → tên + «5/6 Stamp»; gõ SĐT lạ → gợi ý «thêm thành viên»; gõ +84… chuẩn về 0…
  khachTraCuu: {
    mo: 'khach', gioCo: HAN_T,
    chay: async () => window.KB_KHACH('tracuu'),
    bang: ["customer_ac_cache_gieogieo"],   // gõ SĐT lần đầu trong ngày → dựng bản gợi ý DÙNG CHUNG (hành vi có sẵn ở mốc); không ghi gì vào customers
    kiem: (n) => [
      [n.ghi.length >= 1 && n.ghi.every(x => /customer_ac_cache_gieogieo/.test(duongGhi(x))) && !n.ghi.some(x => /(^|\/)customers\//.test(duongGhi(x))), 'chỉ ghi bản gợi ý dùng chung, KHÔNG ghi vào customers — ' + n.ghi.map(x => duongGhi(x)).join(',')],
      [n.sau && n.sau.ten === 'Lan' && /5\/6 Stamp/.test(n.sau.pts) && /1\.200 Point/.test(n.sau.pts), 'khách có thành viên: tên «Lan», 1.200 Point, 5/6 Stamp — ' + (n.sau && n.sau.pts)],
      [n.sau && n.sau.chuaCoGoiY === true && n.sau.goiYSdt === '0999999999', 'SĐT lạ → hiện gợi ý thêm thành viên đúng SĐT'],
      [n.sau && n.sau.chuan84 === 'Lan', '+84901234567 → chuẩn về 0901234567, tìm ra «Lan»']]
  },
  // 4C — THÊM THÀNH VIÊN MỚI: SĐT 0911111111 chưa có → gợi ý → popup → thiếu tên bị chặn → «Minh Anh» → customers/0911111111 đủ trường, tự chọn vào đơn
  khachThemThanhVien: {
    mo: 'khach', gioCo: HAN_T,
    chay: async () => window.KB_KHACH('them'),
    bang: ["customers"],
    kiem: (n) => { const g = n.ghi.find(x => x.op === 'set' && /customers\/0911111111$/.test(x.p)); return [
      [n.toasts.some(t => /Vui lòng nhập tên thành viên/.test(t)), 'thiếu tên → chặn, báo'],
      [!!g && g.d.nickname === 'Minh Anh' && g.d.total_points === 0 && g.d.stamp_count === 0 && g.d.free_drink_available === 0 && g.d.source === 'pos_gieogieo', 'ghi customers/0911111111: Minh Anh, 0 điểm / 0 tem, nguồn pos_gieogieo — ' + JSON.stringify(g && g.d)],
      [n.sau && n.sau.ten === 'Minh Anh' && n.sau.popupDong === true, 'đóng popup, tự chọn thành viên mới vào đơn'],
      [n.toasts.some(t => /^✅ Đã thêm thành viên: Minh Anh/.test(t)), 'toast «Đã thêm thành viên»']]; }
  },
  // 4C — TÍCH TEM SAU THANH TOÁN: Lan 5 tem, bill1 hai ly 30.000 → +2 (đủ 6 → +1 ly miễn phí, còn 1) → bấm LẠI cùng bill1 (idempotent, không cộng lần hai) → bill2 trong cùng ngày (đã đạt trần 2 tem/ngày → không cộng, báo)
  khachTichTem: {
    mo: 'khach', gioCo: HAN_T,
    chay: async () => window.KB_KHACH('tichtem'),
    bang: ["customers", "loyalty_bill_effects_gieogieo"],
    kiem: (n) => { const up = n.ghi.filter(x => /customers\/0901234567$/.test(duongGhi(x)) && /update/.test(x.op)); const u = up[0] && up[0].d; const mk = n.ghi.filter(x => /loyalty_bill_effects_gieogieo\/bill[12]$/.test(duongGhi(x))); return [
      [up.length === 1 && u.stamp_count === 1 && u.stamps_today === 2 && u.free_drink_available === 1 && u.free_drink_caps.length === 1 && u.stamp_prices.length === 1, 'đúng MỘT lần cập nhật khách: tem 5 → 1, hôm nay 2, +1 ly miễn phí (1 trần ly) — ' + JSON.stringify(u)],
      [mk.length === 2 && mk[0].d.added === 2 && mk[0].d.freeDrink === true && mk[1].d.added === 0, 'dấu bill: bill1 added 2 + freeDrink, bill2 added 0 (không lặp bill1) — ' + JSON.stringify(mk.map(x => x.d))],
      [n.toasts.some(t => /^☕ \+2 Stamp! Đã có 1\/6 🎉/.test(t)), 'toast «+2 Stamp … 1 Ly MIỄN PHÍ» — ' + JSON.stringify(n.toasts)],
      [n.toasts.some(t => /Đã đạt 2 Stamp hôm nay/.test(t)), 'bill2 → «Đã đạt 2 Stamp hôm nay — không thể thêm»']]; }
  },
  // 4C — DANH SÁCH KHÁCH (chỉ đọc): mở màn → đọc cả bảng → 3 khách → ô đếm; gõ «0902» lọc còn 1; xoá ô tìm → đủ 3
  khachDanhSach: {
    mo: 'khach', gioCo: HAN_T,
    chay: async () => window.KB_KHACH('danhsach'),
    bang: [],
    kiem: (n) => [
      [n.ghi.length === 0, 'chỉ đọc — không lượt ghi nào'],
      [n.sau && n.sau.tong === 3 && /3/.test(n.sau.nhan), 'tải đủ 3 khách, nhãn đếm — ' + (n.sau && n.sau.nhan)],
      [n.sau && n.sau.loc === 1 && n.sau.locSdt === '0902222222', 'gõ «0902» → còn 1 khách đúng SĐT'],
      [n.sau && n.sau.xoaLoc === 3, 'xoá ô tìm → đủ 3 khách']]
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
// Phần chung ca 3A (chạy TRONG trang). check-in / check-out đi qua ô PIN THẬT (resolveStaffPinField, danh mục nhân viên mồi);
// mở ca / tick việc đầu ca dùng resolveStaffPinAndCheckin đã gán đè giống nhau ở hai bản (như mọi kịch bản kho).
const KB_CA = async (viec) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let hoi = 0; window.posConfirm = async () => { hoi++; return true; };
  window.__buoc = 'nạp nhân viên';
  ['employees', 'empShifts'].forEach(k => _posLiveStop(k));   // đăng ký lúc mở trang (chưa có ảnh đầu) → gắn lại sau khi đã mồi
  await loadEmployeesCachePOS();
  if (viec === 'in' || viec === 'out') {
    showScreen('caLamViecScreen'); await renderCheckinBlock(); await sleep(100);
    document.getElementById('checkinPin').value = '1234';
    window.__ghi = []; window.__buoc = 'check-' + viec;
    if (viec === 'in') await doCheckIn(); else await doCheckOut();
    await sleep(600);
    return { hoi, trong: _employeeShiftsTodayCache.filter(x => !x.checkedOutAt).length, pin: (document.getElementById('checkinPin') || {}).value, busy: _posSubmitBusy };
  }
  showScreen('caLamViecScreen');
  shiftState = { businessDate: posDateKey(), opening: null, closing: null };
  if (viec === 'mocaFull') {
    const pin = (id, v) => { const el = document.getElementById(id + 'Pin'); if (el) { el.value = v; el.dispatchEvent(new Event('input')); } return !!el; };
    Object.keys(_posLive).forEach(k => _posLiveStop(k));   // mọi bộ đệm sống gắn lại sau khi mồi (kiểm lượt 13)
    await loadEmployeesCachePOS(); await loadEmployeeShiftsTodayCache();
    window.resolveStaffPinAndCheckin = window.__goc.resolveStaffPinAndCheckin;   // PIN THẬT cho cả luồng
    let cb = 0; const gocTiep = window._continueAfterShiftInventoryOpenPOS;
    window._continueAfterShiftInventoryOpenPOS = async function () { cb++; return gocTiep.apply(this, arguments); };
    renderShiftOpenForm(); await sleep(50);
    shiftChangeOpenDenom(500000, 1); shiftChangeOpenDenom(500000, 1); shiftChangeOpenDenom(200000, 1); pin('shiftOpenStaff', '1234');
    window.__ghi = []; window.__buoc = 'mở ca';
    await Promise.race([submitShiftOpen(), sleep(15000)]); await sleep(100);
    const busy1 = _posSubmitBusy, dong = ((_shiftInventoryCountStatePOS || {}).lines || []).length;
    window.__buoc = 'kiểm kê';
    shiftInventoryCountSetQtyPOS(0, 900); await sleep(50); pin('shiftInventoryOpenStaff', '1234');
    await Promise.race([submitShiftInventoryCountPOS(), sleep(15000)]); await sleep(100);
    const busy2 = _posSubmitBusy;
    window.__buoc = 'việc đầu ca';
    pin('openChecklistStaff', '1234'); await Promise.race([tickChecklistItem('lau'), sleep(15000)]); await sleep(200);
    const nut = [...document.querySelectorAll('#shiftBody button')].find(b => (b.getAttribute('onclick') || '').includes('finishOpeningChecklist()'));
    if (nut) nut.click(); await sleep(500);
    return { hoi, cb, busy1, busy2, busy: _posSubmitBusy, dong, coNut: !!nut, man: (document.querySelector('.screen.active') || {}).id || null };
  }
  if (viec === 'moca') {
    renderShiftOpenForm(); await sleep(50);
    shiftChangeOpenDenom(500000, 1); shiftChangeOpenDenom(500000, 1); shiftChangeOpenDenom(200000, 1);
    window.__ghi = []; window.__buoc = 'mở ca';
    // phần chạy tiếp sau khi ghi (đếm giao ca / kiểm kê đầu ca — module khác) có thể chờ dữ liệu không mồi → chờ có giới hạn
    await Promise.race([submitShiftOpen(), sleep(4000)]); await sleep(300);
    return { hoi, busy: _posSubmitBusy };   // busy true = phần chạy tiếp (module khác) chưa xong lúc lấy log — giới hạn đã ghi (kiểm lượt 12)
  }
  _openChecklistState = { items: [{ id: 'lau', label: 'Lau quầy', minDurationSec: 0 }], loaded: true, staff: null };
  window.__ghi = [];
  window.__buoc = 'tick'; await Promise.race([tickChecklistItem('lau'), sleep(4000)]); await sleep(300);
  return { hoi, busy: _posSubmitBusy };
};
// Phần chung kết ca 3B (chạy TRONG trang). Mọi ô PIN đi qua resolveStaffPinWorkedToday THẬT (danh mục + ca hôm nay mồi).
const KB_KET = async (viec) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const pin = (id, v) => { const el = document.getElementById(id + 'Pin'); if (el) { el.value = v; el.dispatchEvent(new Event('input')); } return !!el; };
  let hoi = 0; window.posConfirm = async () => { hoi++; return true; };
  window.__buoc = 'nạp';
  Object.keys(_posLive).forEach(k => _posLiveStop(k));   // mọi bộ đệm sống đăng ký lúc mở trang (chưa có ảnh đầu) → gắn lại sau khi mồi
  await loadEmployeesCachePOS(); await loadEmployeeShiftsTodayCache();
  showScreen('caLamViecScreen');
  const bd = posDateKey();
  const op = (await fstore.collection('daily_openings_gieogieo').doc(bd).get()).data();
  const cl = await fstore.collection('daily_closings_gieogieo').doc(bd).get();
  shiftState = { businessDate: bd, opening: op, closing: cl.exists ? cl.data() : null };
  if (viec === 'treo') { window.__ghi = []; const so = await closeStaleEmployeeShifts(); return { so }; }
  if (viec === 'demBTP') {
    window.openWeighPad = o => o.onDone(480, [{ gross: 600, tare: 120, net: 480 }]);   // bộ cân giả, giống nhau ở hai bản
    let cb = 0; const gocTiep = window._continueAfterPrepCount;
    window._continueAfterPrepCount = async function () { cb++; return gocTiep.apply(this, arguments); };
    window.__buoc = 'màn đếm BTP';
    PREP_ITEMS_CACHE_POS = []; PREP_VESSELS_CACHE_POS = [];   // nạp lại danh mục + dụng cụ từ mồi (như luồng kết ca không qua màn Chế biến)
    const lines = await computePrepCountLinesPOS(); renderPrepCountScreen(lines); await sleep(100);
    const nutCan = [...document.querySelectorAll('#shiftBody button')].find(b => /^prepCountWeighBatch\(0,/.test(b.getAttribute('onclick') || ''));
    window.__ghi = [];
    if (nutCan) { nutCan.click(); await sleep(300); }
    pin('prepCountStaff', '1234');
    const nut = [...document.querySelectorAll('#shiftBody button')].find(b => (b.getAttribute('onclick') || '') === 'prepCountGoNext()');
    window.__buoc = 'xác nhận đếm BTP';
    if (nut) { nut.click(); for (let k = 0; k < 60 && (_posSubmitBusy || !cb); k++) await sleep(100); await sleep(300); }
    return { hoi, dong: lines.length, coCan: !!nutCan, coNut: !!nut, cb, busy: _posSubmitBusy };
  }
  if (viec === 'khop' || viec === 'lech') {
    renderShiftCloseCountForm(); await sleep(50);
    shiftChangeCloseDenom(500000, 1); shiftChangeCloseDenom(200000, viec === 'khop' ? 2 : 1); if (viec === 'lech') { shiftChangeCloseDenom(100000, 1); shiftChangeCloseDenom(50000, 1); }
    pin('shiftCloseStaff', '1234');
    window.__ghi = []; window.__buoc = 'đối soát';
    await Promise.race([submitShiftClose(), sleep(4000)]); await sleep(300);
    return { hoi, busy: _posSubmitBusy };
  }
  if (viec === 'giaoca') {
    await openHandoverPOS('manual'); await sleep(50);
    window.__ghi = []; window.__buoc = 'giao ca';
    beginHandoverCountPOS(); await sleep(50);
    const phaSau = [];
    const dem = () => { _handover[_handover.phase === 'in' ? 'inDenoms' : 'outDenoms'] = Object.assign(cfEmptyDenoms(), { 500000: 1, 200000: 2 }); };
    phaSau.push(_handover.phase); dem(); pin('handoverSigner', '1234'); await submitHandoverCountPOS(); await sleep(100);
    phaSau.push(_handover && _handover.phase); dem(); pin('handoverSigner', '5678');
    await Promise.race([submitHandoverCountPOS(), sleep(4000)]); await sleep(300);
    return { hoi, phaSau, busy: _handoverBusy };
  }
  // đóng ngày
  window.__buoc = 'màn đóng ngày';
  await Promise.race([renderDailyClosingChecklist(), sleep(4000)]); await sleep(100);
  const o = document.getElementById('dcNoMoreBills'); if (o) o.checked = true;
  if (!o) return { hoi, coO: false, man: ((document.getElementById('shiftBody') || {}).textContent || '').replace(/\s+/g, ' ').slice(0, 300) };
  pin('closeFinalStaff', '1234');
  window.__ghi = []; window.__buoc = 'đóng ngày';
  await Promise.race([submitDailyClose(), sleep(4000)]); await sleep(300);
  return { hoi, coO: !!o, busy: _posSubmitBusy };
};
// Phần chung 3C quỹ tiền mặt / mở két (chạy TRONG trang)
const KB_QUY = async (viec) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let hoi = 0; window.posConfirm = async () => { hoi++; return true; };
  const bam = (re) => { const b = [...document.querySelectorAll('#cf-content button')].find(x => re.test(x.getAttribute('onclick') || '')); if (b) b.click(); return !!b; };
  window.__buoc = 'nạp';
  Object.keys(_posLive).forEach(k => _posLiveStop(k));
  await loadEmployeesCachePOS(); await loadEmployeeShiftsTodayCache();
  if (viec === 'ket_tien' || viec === 'ket_loi' || viec === 'ket_pin' || viec === 'ket_nhatky_loi') {
    let lenh = 0;
    if (viec === 'ket_pin') {
      POSPrinter.connected = true; POSPrinter.engine = { openDrawer: async () => { lenh++; } };
      openCashDrawerSheetPOS(); await sleep(50);
      const o = document.getElementById('cashDrawerPin'); const oPin = !!o && o.type !== 'hidden';
      cashDrawerPickReasonPOS(document.querySelector('#cdReasons button[data-r="Kiểm đếm két"]'));
      window.__ghi = []; window.__buoc = 'mở két PIN sai';
      if (o) { o.value = '9999'; o.dispatchEvent(new Event('input')); } await confirmCashDrawerOpenPOS(); await sleep(100);
      const lenhSai = lenh;
      const o2 = document.getElementById('cashDrawerPin'); if (o2) { o2.value = '5678'; o2.dispatchEvent(new Event('input')); }
      window.__buoc = 'mở két PIN đúng'; document.getElementById('cdGo').click(); await sleep(400);
      return { lenh, lenhSai, oPin, conTam: !!document.getElementById('cashDrawerSheet') };
    }
    if (viec === 'ket_nhatky_loi') {
      POSPrinter.connected = true; POSPrinter.engine = { openDrawer: async () => { lenh++; } };
      openCashDrawerSheetPOS(); await sleep(50);
      cashDrawerPickReasonPOS(document.querySelector('#cdReasons button[data-r="Đổi tiền lẻ"]'));
      window.__HONG = [{ op: 'add', re: 'cash_drawer_logs_gieogieo' }];
      window.__ghi = []; window.__buoc = 'mở két, nhật ký lỗi';
      document.getElementById('cdGo').click(); await sleep(400);
      return { lenh, conTam: !!document.getElementById('cashDrawerSheet') };
    }
    if (viec === 'ket_loi') {
      POSPrinter.connected = false; window.__ghi = [];
      openCashDrawerSheetPOS(); const tamChuaKetNoi = !!document.getElementById('cashDrawerSheet');
      POSPrinter.connected = true; POSPrinter.engine = { openDrawer: async () => { lenh++; throw new Error('máy in giả lỗi'); } };
      openCashDrawerSheetPOS(); await sleep(50);
      cashDrawerPickReasonPOS(document.querySelector('#cdReasons button[data-r="Kiểm đếm két"]'));
      window.__buoc = 'mở két lỗi'; await confirmCashDrawerOpenPOS(); await sleep(300);
      const nut = document.getElementById('cdGo');
      return { lenh, tamChuaKetNoi, conTam: !!document.getElementById('cashDrawerSheet'), nutBat: !!nut && !nut.disabled };
    }
    POSPrinter.connected = true; POSPrinter.engine = { openDrawer: async () => { lenh++; } };
    openCashDrawerSheetPOS(); await sleep(50);
    const lyDo = document.querySelectorAll('#cdReasons button').length;
    const kyTen = ((document.getElementById('cashDrawerBox') || {}).textContent || '').includes('NV Một') ? 'NV Một' : null;
    window.__ghi = []; window.__buoc = 'mở két';
    cashDrawerPickReasonPOS(document.querySelector('#cdReasons button[data-r="Khác"]'));
    await confirmCashDrawerOpenPOS();
    cashDrawerPickReasonPOS(document.querySelector('#cdReasons button[data-r="Đổi tiền lẻ"]'));
    document.getElementById('cdGo').click(); await sleep(400);
    return { lenh, lyDo, kyTen, conTam: !!document.getElementById('cashDrawerSheet') };
  }
  if (viec === 'ket') orders = [{ id: 'o1', date: todayKey(), total: 50000, method: 'TIỀN MẶT' }];   // một bill tiền mặt hôm nay (giống nhau ở hai bản)
  window.__buoc = 'màn quỹ';
  showScreen('cashfundScreen'); for (let k = 0; k < 40 && !document.querySelector('#cf-content button'); k++) await sleep(50);
  if (viec === 'moca') {
    const coForm = !!document.getElementById('cf-form-grid');
    cfChangeFormDenom(500000, 1); cfChangeFormDenom(500000, 1); cfChangeFormDenom(100000, 1);
    window.__ghi = []; window.__buoc = 'lưu quỹ đầu ca';
    bam(/^cfSubmitForm\(\)$/); await sleep(600);
    return { hoi, coForm };
  }
  if (viec === 'chi') {
    window.__ghi = [];
    window.prompt = () => '0000'; bam(/cfShowExpenseForm/); await sleep(50);
    const saiMK = !!document.getElementById('cf-exp-note');
    window.prompt = () => '3368'; bam(/cfShowExpenseForm/); await sleep(50);
    document.getElementById('cf-exp-note').value = 'Mua đá';
    cfChangeExpenseOut(100000, 1); cfChangeExpenseChange(20000, 1);
    window.__buoc = 'ghi chi tiêu'; bam(/^cfSubmitExpense\(\)$/); await sleep(600);
    return { hoi, saiMK };
  }
  // kết ca quỹ
  window.prompt = () => '3368'; bam(/mode:'close'/); await sleep(50);
  cfChangeFormDenom(500000, 2);
  window.__ghi = []; window.__buoc = 'kết ca quỹ';
  bam(/^cfSubmitForm\(\)$/); await sleep(600);
  return { hoi };
};
// Phần chung 4A sửa danh mục (chạy TRONG trang) — bấm nút thật trên màn Quản lý menu
const KB_MENU = async (viec) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let hoi = 0; window.posConfirm = async () => { hoi++; return true; };
  const dat = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input')); };
  const nap = async () => { MENU_TOGO = parseMenuSnap((await db.ref('menu_togo_gieogieo').once('value')).val()); FOOD_MENU = parseFoodMenuSnap((await db.ref('food_gieogieo').once('value')).val());
    const t = (await db.ref('toppings_gieogieo').once('value')).val(); TOPPINGS = t ? Object.entries(t).map(([id, v]) => ({ id, name: v.name || '', price: Number(v.price) || 0, priceTogo: Number(v.priceTogo) || 0 })) : []; };
  window.__buoc = 'nạp danh mục'; await nap();
  showScreen('mn'); await sleep(100);
  window.__ghi = [];
  if (viec === 'mon') {
    window.__buoc = 'thêm món'; openMenuForm(null); await sleep(50);
    document.querySelector('#mn-popup button[onclick="saveMenuItem()"]') ? document.querySelector('#mn-popup button[onclick="saveMenuItem()"]').click() : saveMenuItem(); await sleep(50);
    dat('mn-f-name', 'Trà vải E2E'); dat('mn-f-type', 'Trà'); dat('mn-f-pm', '32000');
    saveMenuItem(); await sleep(400);
    window.__buoc = 'sửa món'; openMenuForm('m1'); await sleep(50); dat('mn-f-pl', '40000'); saveMenuItem(); await sleep(400);
    window.__buoc = 'xoá món'; openMenuForm('m1'); await sleep(50); await deleteMenuItem(); await sleep(400);
    return { hoi, mon: MENU_TOGO.map(m => m.name) };
  }
  if (viec === 'loi') {
    window.__buoc = 'form món'; openMenuForm(null); await sleep(50);
    dat('mn-f-name', 'Trà lỗi E2E'); dat('mn-f-type', 'Trà'); dat('mn-f-pm', '33000');
    window.__HONG = [{ op: 'set', re: 'menu_togo_gieogieo.*/push$' }];   // đúng MỘT lỗi ghi RT ở lượt đầu
    window.__buoc = 'lưu lỗi'; saveMenuItem(); await sleep(500);
    const formConSauLoi = document.getElementById('mn-popup').style.display !== 'none', cuaSauLoi = MENU_TOGO.some(m => m.name === 'Trà lỗi E2E');
    window.__buoc = 'lưu lại'; saveMenuItem(); await sleep(800);
    return { hoi, formConSauLoi, cuaSauLoi, formDongSauThu: document.getElementById('mn-popup').style.display === 'none', cuaSauThu: MENU_TOGO.some(m => m.name === 'Trà lỗi E2E'), manBanCo: /Trà lỗi E2E/.test((document.getElementById('mg') || {}).textContent || '') };
  }
  if (viec === 'food') {
    window.__buoc = 'thêm Food'; openFoodForm(null); await sleep(50); dat('food-f-name', 'Bánh E2E'); saveFoodItem(); await sleep(50);
    dat('food-f-price', '18000'); saveFoodItem(); await sleep(400);
    window.__buoc = 'sửa Food'; openFoodForm('f1'); await sleep(50); dat('food-f-price', '22000'); saveFoodItem(); await sleep(400);
    window.__buoc = 'xoá Food'; openFoodForm('f1'); await sleep(50); await deleteFoodItem(); await sleep(400);
    return { hoi, food: FOOD_MENU.map(f => f.name) };
  }
  window.__buoc = 'tab topping'; document.getElementById('mn-tab-topping').click(); await sleep(50);
  const tabTp = /Trân châu/.test((document.getElementById('mn-list') || {}).textContent || '');
  window.__buoc = 'thêm topping'; document.querySelector('#mn .btn-add-item').click(); await sleep(50);
  dat('tp-f-name', 'Thạch E2E'); dat('tp-f-price', '5000'); dat('tp-f-price-togo', '6000'); saveTopping(); await sleep(400);
  window.__buoc = 'sửa topping'; openToppingForm('t1'); await sleep(50); dat('tp-f-price-togo', '8000'); saveTopping(); await sleep(400);
  window.__buoc = 'xoá topping'; openToppingForm('t1'); await sleep(50); await deleteTopping(); await sleep(400);
  return { hoi, tp: TOPPINGS.map(t => t.name), tabTp };
};
// Phần chung 4B sau bán (chạy TRONG trang): đơn hôm nay trong RAM (orders) + node bill RT
const KB_BAN = async (viec) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let hoi = 0; window.posConfirm = async () => { hoi++; return true; };
  const now = Date.now(), iso = d => new Date(now - d * 60000).toISOString();
  const mk = (id, extra) => Object.assign({ id, date: todayKey(), businessDate: posDateKey(), createdAt: iso(2), method: 'TIỀN MẶT', isToGo: true, billCode: 'B' + id.toUpperCase(),
    itemsArray: [{ itemId: 'tsm', name: 'Trà sữa E2E', size: 'M', qty: 1, price: 30000, toppings: [] }], total: 30000 }, extra || {});
  const vaoRam = o => Object.assign({}, o, { items: o.itemsArray });   // RAM giữ items = MẢNG (như _attachRtListener), RT giữ chuỗi
  const o1 = mk('o1');
  const ghiBill = async o => { const { id, ...v } = o; await db.ref('orders_gieogieo/oct/26/' + id).set(Object.assign({}, v, { items: 'Trà sữa E2E(M)x1' })); };
  TOPPINGS = [{ id: 't1', name: 'Trân châu', price: 7000, priceTogo: 7000 }];
  window.__buoc = 'mồi đơn';
  await ghiBill(o1); orders = [vaoRam(o1)];
  if (viec === 'them') {
    window.__ghi = []; window.__buoc = 'mở tấm bổ sung';
    await openAddonSheet('o1'); await sleep(50);
    _addonPickCup(0, 0); await sleep(20); _addonSetToppingQty('t1', 1); _addonGoPay(); _addonSetMethod('TIỀN MẶT'); _addonSetCash('10000');
    window.__buoc = 'xác nhận bổ sung'; await submitAddon();
    // chờ việc trừ kho phần thêm (trackConsumptionPOS) tới trạng thái cuối trên node bill — tối đa 15 giây
    for (let k = 0; k < 150; k++) { const v = (await db.ref('orders_gieogieo/oct/26/o1').once('value')).val() || {}; if (Object.values(v.consumeJobs || {}).some(j => j.status === 'done' || j.status === 'failed')) break; await sleep(100); }
    await sleep(300);
    return { hoi };
  }
  if (viec === 'xoaJob') {
    await db.ref('orders_gieogieo/oct/26/o1/consumeJobs/j1').set({ status: 'running', at: Date.now(), owner: 'wkhac', startedAt: Date.now(), tries: 1 });   // việc trừ kho của máy khác, còn hạn
    window.__buoc = 'chi tiết đơn'; showDet('o1'); await sleep(50);
    window.__ghi = [];
    delOrder(); await sleep(150);
    document.getElementById('del-pin-input').value = '3367';
    window.__buoc = 'xoá khi job chạy'; await delOrderConfirm(); await sleep(800);
    const cur = (await db.ref('orders_gieogieo/oct/26/o1').once('value')).val() || {};
    return { hoi, conTrongRam: orders.some(x => x.id === 'o1'), jobConNguyen: !!(cur.consumeJobs && cur.consumeJobs.j1 && cur.consumeJobs.j1.status === 'running') };
  }
  if (viec === 'xoa') {
    window.__buoc = 'chi tiết đơn'; showDet('o1'); await sleep(50);
    window.__ghi = [];
    delOrder(); await sleep(150);
    document.getElementById('del-pin-input').value = '1111'; await delOrderConfirm();
    const saiMa = document.getElementById('del-pin-error').style.display === 'block', ghiKhiSai = (window.__ghi || []).length;
    delOrder(); await sleep(150);
    document.getElementById('del-pin-input').value = '3367';
    window.__buoc = 'xoá bill'; await delOrderConfirm(); await sleep(800);
    return { hoi, saiMa, ghiKhiSai, conTrongRam: orders.some(x => x.id === 'o1'), man: (document.querySelector('.screen.active') || {}).id || null };
  }
  orders = [vaoRam(o1), vaoRam(mk('o2', { method: 'CHUYỂN KHOẢN', total: 45000, createdAt: iso(5) })), vaoRam(mk('o3', { method: 'CHUYỂN KHOẢN', total: 65000, foodTotal: 20000, foodMethod: 'TIỀN MẶT', createdAt: iso(8) }))];
  window.__ghi = []; window.__buoc = 'doanh thu';
  updRv(); await sleep(50);
  const rv = ((document.getElementById('rv') || {}).textContent || '').replace(/\s+/g, ' ').slice(0, 600);
  window.__buoc = 'lịch sử';
  showScreen('hi'); renderH(''); await sleep(50);
  const hi1 = document.querySelectorAll('#hl [onclick*="showDet"]').length;
  renderH('BO2'); await sleep(50);
  const hiMa = document.querySelectorAll('#hl [onclick*="showDet"]').length;
  return { hoi, rv, hi1, hiMa };
};
// Phần chung 4C khách (chạy TRONG trang) — gõ ô SĐT thật, gọi hàm như nút bấm
const KB_KHACH = async (viec) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let hoi = 0; window.posConfirm = async () => { hoi++; return true; };
  const dat = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input')); };
  const txt = id => ((document.getElementById(id) || {}).textContent || '').replace(/\s+/g, ' ').trim();
  window.checkFreeToppingMemberPromo = window.checkFreeToppingMemberPromo || (() => {});
  window.__buoc = 'nạp';
  window.__ghi = [];
  if (viec === 'tracuu') {
    dat('cuph', '0901234567'); window.__buoc = 'tra cứu'; lookupCustomer(); await sleep(400);
    const ten = txt('custName'), pts = txt('custPts');
    clearCustomer(); await sleep(50);
    dat('cuph', '0999999999'); lookupCustomer(); await sleep(400);
    const chuaCoGoiY = document.getElementById('addMemberHint').style.display === 'block', goiYSdt = txt('addMemberHintPhone');
    clearCustomer(); await sleep(50);
    dat('cuph', '+84901234567'); lookupCustomer(); await sleep(400);
    return { hoi, ten, pts, chuaCoGoiY, goiYSdt, chuan84: txt('custName') };
  }
  if (viec === 'them') {
    dat('cuph', '0911111111'); lookupCustomer(); await sleep(400);
    window.__buoc = 'popup thêm'; openAddMemberPopup(); await sleep(50);
    window.__ghi = [];
    await confirmAddMember();   // thiếu tên
    dat('addMem-name', 'Minh Anh'); window.__buoc = 'xác nhận thêm'; await confirmAddMember(); await sleep(400);
    return { hoi, ten: txt('custName'), popupDong: document.getElementById('addMemberPopup').style.display === 'none' };
  }
  if (viec === 'tichtem') {
    loyaltyCustomer = { id: '0901234567' };
    window.__buoc = 'tích bill1'; await loyaltyProcessAfterPay('0901234567', 60000, 2, 'bill1', [30000, 30000]); await sleep(1300);
    window.__buoc = 'tích lại bill1'; await loyaltyProcessAfterPay('0901234567', 60000, 2, 'bill1', [30000, 30000]); await sleep(1300);
    window.__buoc = 'tích bill2'; await loyaltyProcessAfterPay('0901234567', 30000, 1, 'bill2', [30000]); await sleep(1300);
    return { hoi };
  }
  window.__buoc = 'danh sách'; showScreen('customers'); loadCustomerList(); await sleep(600);
  const cont = () => document.getElementById('customer-list-container').textContent || '';
  const dem = () => ['0901234567', '0902222222', '0903333333'].filter(p => cont().includes(p)).length;
  const tong = dem(), nhan = txt('cust-count-label');
  const o = document.getElementById('cust-search-input'); o.value = '0902'; o.dispatchEvent(new Event('input')); await sleep(500);
  const loc = dem(), locSdt = cont().includes('0902222222') ? '0902222222' : null;
  clearCustSearch(); await sleep(500);
  return { hoi, tong, nhan, loc, locSdt, xoaLoc: dem() };
};
// Dòng sổ kho WASTE đã ghi thành công (bỏ lượt bị cài lỗi), theo itemId → qty; dòng sổ BTP WASTE
const soWaste = n => n.ghi.filter(g => !/!hong$/.test(g.op) && /stock_transactions_gieogieo/.test(duongGhi(g)) && g.d && g.d.type === 'WASTE');
const soPrepCons = n => n.ghi.filter(g => !/!hong$/.test(g.op) && /prep_transactions_gieogieo/.test(duongGhi(g)) && g.d && g.d.type === 'CONSUMPTION');
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
  const r = await t.page.evaluate(async ({ src, dau, doly, han, ca, ket, quy, menu, ban, khach, mo, ITEMS, PO, E2E }) => {
    const toasts = []; const _t = window.toast;
    window.toast = function (m) { toasts.push(String(m)); try { return _t.apply(this, arguments); } catch (e) {} };
    window.requireShiftOpened = () => true; window.requireOpeningChecklistDone = () => true;
    window.requireSomeoneCheckedIn = () => true; window.requireSomeoneCheckedInAsync = async () => true;
    window.__goc = { resolveStaffPinAndCheckin: window.resolveStaffPinAndCheckin };   // kịch bản luồng đầy đủ dùng lại hàm THẬT
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
    if (mo === 'ca') {   // 3A: nhân viên thật trong danh mục (PIN 1234 / 5678), đọc qua bộ đệm sống (__SNAP)
      S['employees_gieogieo/e1'] = { fullName: 'NV Một', pin: '1234', active: true, payType: 'hourly', hourlyRate: 25000, otEnabled: false, roles: ['barista'] };
      S['employees_gieogieo/e2'] = { fullName: 'NV Hai', pin: '5678', active: true, payType: 'hourly', hourlyRate: 22000, roles: [] };
      if (E2E.caDayDu) {   // NL kiểm kê đầu ca + một việc đầu ca bắt buộc
        S[ten('inventory_items_gieogieo') + '/tra'] = Object.assign({}, E2E.NL_KHO.tra, { shiftCountTiming: 'open' });
        S[ten('shift_checklists_gieogieo') + '/lau'] = { phase: 'open', label: 'Lau quầy', blocking: true, minDurationSec: 0, order: 1, active: true };
      }
      if (E2E.caMo) S[ten('employee_shifts_gieogieo') + '/s1'] = { employeeId: 'e1', employeeName: 'NV Một', businessDate: '2026-10-26', checkedInAt: '2026-10-26T03:30:00.000Z', checkedOutAt: null, roles: ['barista'] };
      window.__SNAP = true;
    }
    if (mo === 'ket') {   // 3B: hai nhân viên đã làm hôm nay (ca đã check-out), mở ca 1.000.000 do e1 giữ két, chi tiền mặt 100.000
      S['employees_gieogieo/e1'] = { fullName: 'NV Một', pin: '1234', active: true, roles: [] };
      S['employees_gieogieo/e2'] = { fullName: 'NV Hai', pin: '5678', active: true, roles: [] };
      S[ten('employee_shifts_gieogieo') + '/s1'] = { employeeId: 'e1', employeeName: 'NV Một', businessDate: '2026-10-26', checkedInAt: '2026-10-26T00:20:00.000Z', checkedOutAt: '2026-10-26T07:00:00.000Z' };
      S[ten('employee_shifts_gieogieo') + '/s2'] = { employeeId: 'e2', employeeName: 'NV Hai', businessDate: '2026-10-26', checkedInAt: '2026-10-26T03:00:00.000Z', checkedOutAt: '2026-10-26T07:10:00.000Z' };
      S[ten('daily_openings_gieogieo') + '/2026-10-26'] = { businessDate: '2026-10-26', openingCash: 1000000, staff: 'NV Một', staffEmployeeId: 'e1', createdAt: '2026-10-26T00:30:00.000Z' };
      S[ten('shift_segments_gieogieo') + '/2026-10-26_1'] = { businessDate: '2026-10-26', seq: 1, custodianId: 'e1', custodianName: 'NV Một', startAt: '2026-10-26T00:30:00.000Z', startType: 'open', startCash: 1000000, status: 'open', createdAt: '2026-10-26T00:30:00.000Z' };
      S[ten('expenses_gieogieo') + '/x1'] = { date: '2026-10-26', amount: 100000, baseType: 'cash', status: 'approved', note: 'Mua đá' };
      if (E2E.ketDong) S[ten('daily_closings_gieogieo') + '/2026-10-26'] = { businessDate: '2026-10-26', status: 'handed_over', cashPassedAt: '2026-10-26T07:20:00.000Z', finalActualCash: 900000, closingStaff: 'NV Một' };
      if (E2E.ketBTP) {   // một lô BTP đang dùng còn 500 g (sổ + RT) để đếm cuối ca
        S[ten('prep_items_gieogieo') + '/tcd'] = Object.assign({}, E2E.PREP, { vesselIds: ['khay'] });   // có dụng cụ → hiện nút «Cân trừ bì»
        S[ten('prep_vessels_gieogieo') + '/khay'] = { name: 'Khay inox', variants: [{ id: 'k1', name: 'Khay nhỏ', tare: 120 }] };
        S[ten('prep_batches_gieogieo') + '/b1'] = Object.assign({}, E2E.BATCH, { status: 'active', batchCode: 'TCD-261026-1', qtyInitial: 1000, qtyRemaining: 500, finishedAt: '2026-10-26T02:00:00.000Z', expiresAt: '2026-10-26T20:00:00.000Z', shelfLifeType: 'hours' });
        S[GieoData.rtPath('active_units_gieogieo') + '/tcd/b1'] = { code: 'TCD-261026-1', itemName: 'Trân châu đường', unit: 'g', capacity: 1000, openedAt: 1792980000000, unitBase: 500 };
      }
      if (E2E.ketTreo) {
        S[ten('employee_shifts_gieogieo') + '/s0'] = { employeeId: 'e2', employeeName: 'NV Hai', businessDate: '2026-10-25', checkedInAt: '2026-10-25T08:00:00.000Z', checkedOutAt: null };
        S[ten('daily_closings_gieogieo') + '/2026-10-25'] = { businessDate: '2026-10-25', status: 'closed', closedAt: '2026-10-25T15:10:00.000Z' };
      }
      window.__SNAP = true;
    }
    if (mo === 'quy') {   // 3C: e1 một mình trong ca (người ký mở két tự điền); quỹ hôm nay đã mở 1.000.000 (quyDoc)
      S['employees_gieogieo/e1'] = { fullName: 'NV Một', pin: '1234', active: true, roles: [] };
      S['employees_gieogieo/e2'] = { fullName: 'NV Hai', pin: '5678', active: true, roles: [] };
      S[ten('employee_shifts_gieogieo') + '/s1'] = { employeeId: 'e1', employeeName: 'NV Một', businessDate: '2026-10-26', checkedInAt: '2026-10-26T03:30:00.000Z', checkedOutAt: null };
      if (E2E.quyHai) S[ten('employee_shifts_gieogieo') + '/s2'] = { employeeId: 'e2', employeeName: 'NV Hai', businessDate: '2026-10-26', checkedInAt: '2026-10-26T03:40:00.000Z', checkedOutAt: null };
      if (E2E.quyDoc) S[ten('cashfund_gieogieo') + '/2026-10-26'] = { date: '2026-10-26', open: { denominations: { 500000: 1, 200000: 2, 100000: 1 }, total: 1000000, enteredAt: 1792990000000, locked: true },
        currentDenominations: { 500000: 1, 200000: 2, 100000: 1, 50000: 0, 20000: 0, 10000: 0, 5000: 0, 2000: 0, 1000: 0 }, mid: [], expenses: [] };
      window.__SNAP = true;
    }
    if (mo === 'menu') {   // 4A: danh mục RT (đường qua GieoData.rtPath — đúng bảng của quán / bảng chung)
      S[GieoData.rtPath('menu_togo_gieogieo') + '/m1'] = { name: 'Trà đào', type: 'Trà', color: '#E23A5D', priceM: 30000, priceL: 35000 };
      S[GieoData.rtPath('food_gieogieo') + '/f1'] = { name: 'Bánh mì', price: 20000, color: '#b45309' };
      S[GieoData.rtPath('toppings_gieogieo') + '/t1'] = { name: 'Trân châu', price: 7000, priceTogo: 7000 };
    }
    if (mo === 'ban') {   // 4B: công thức món + mã sữa đang mở + lô BTP (như đổ ly) để phần trừ kho của mua thêm / hoàn kho chạy thật
      for (const [id, it] of Object.entries(E2E.NL_KHO)) S[ten('inventory_items_gieogieo') + '/' + id] = it;
      S[ten('stock_containers_gieogieo') + '/ctn_d1'] = E2E.DOLY.ctn;
      S[GieoData.rtPath('active_units_gieogieo') + '/milk/ctn_d1'] = E2E.DOLY.rt;
      S[ten('prep_items_gieogieo') + '/tcd'] = E2E.PREP;
      S[ten('recipes_gieogieo') + '/togo:tsm'] = E2E.DOLY.recipe;
      S[GieoData.rtPath('active_units_gieogieo') + '/tcd/b3'] = E2E.DOLY.rtLo;
      S[ten('prep_batches_gieogieo') + '/b3'] = Object.assign({}, E2E.BATCH, E2E.DOLY.lo);
      S[ten('topping_recipes_gieogieo') + '/t1'] = { batchYield: 1000, yieldMode: 'weight', qtyPerServing: 30, batchInputs: [{ refType: 'prep', prepId: 'tcd', qty: 1000 }] };   // 1 phần Trân châu = 30 g BTP lô b3
      window.__SNAP = true;
    }
    if (mo === 'khach') {   // 4C: khách (collection chung `customers`) — Lan 5 tem; hai khách khác cho danh sách
      const kh = (id, ten, diem, tem) => ({ phone: id, nickname: ten, name: ten, total_points: diem, stamp_count: tem, stamps_today: 0, last_stamp_date: '', free_drink_available: 0, stamp_prices: tem ? Array(tem).fill(30000) : [], free_drink_caps: [] });
      S['customers/0901234567'] = kh('0901234567', 'Lan', 1200, 5);
      S['customers/0902222222'] = kh('0902222222', 'Minh', 300, 2);
      S['customers/0903333333'] = kh('0903333333', 'Hoa', 50, 0);
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
    window.KB_DAU = (0, eval)('(' + dau + ')'); window.KB_DOLY = (0, eval)('(' + doly + ')'); window.KB_HAN = (0, eval)('(' + han + ')'); window.KB_CA = (0, eval)('(' + ca + ')'); window.KB_KET = (0, eval)('(' + ket + ')'); window.KB_QUY = (0, eval)('(' + quy + ')'); window.KB_MENU = (0, eval)('(' + menu + ')'); window.KB_BAN = (0, eval)('(' + ban + ')'); window.KB_KHACH = (0, eval)('(' + khach + ')');
    let loiKB = null, sau = null;
    window.__buoc = '';   // kịch bản treo (lời hứa không bao giờ xong) → báo lỗi sau 45 giây kèm bước cuối, không treo cả bài
    try { sau = await Promise.race([(0, eval)('(' + src + ')')({ ITEMS }), new Promise((_, rej) => setTimeout(() => rej(new Error('kịch bản quá 45 giây — bước: ' + window.__buoc)), 45000))]); } catch (e) { loiKB = String(e && e.message || e); }
    return { ghi: (window.__ghi || []).map(g => ({ op: g.op, p: g.p, rt: !!g.rt, d: g.d })), toasts, sau, loiKB };
  }, { src: KICH_BAN[ten].chay.toString(), dau: KB_DAU.toString(), doly: KB_DOLY.toString(), han: KB_HAN.toString(), ca: KB_CA.toString(), ket: KB_KET.toString(), quy: KB_QUY.toString(), menu: KB_MENU.toString(), ban: KB_BAN.toString(), khach: KB_KHACH.toString(), mo: KICH_BAN[ten].mo, ITEMS, PO, E2E: { PREP, BATCH: BATCH(), NL_NAU, PREP_NAU, NL_KHO, DOLY, HAN, CTN1: CTN('sealed'), CTN2: CTN('open', { unitBase: 0, openedAt: '2026-10-25T05:00:00.000Z', openedBy: 'NV E2E', expiresAt: '2026-10-26T05:00:00.000Z' }), lo: KICH_BAN[ten].lo || [], loActive: !!KICH_BAN[ten].loActive, tieuHao: !!KICH_BAN[ten].tieuHao, caMo: !!KICH_BAN[ten].caMo, ketDong: !!KICH_BAN[ten].ketDong, ketTreo: !!KICH_BAN[ten].ketTreo, caDayDu: !!KICH_BAN[ten].caDayDu, ketBTP: !!KICH_BAN[ten].ketBTP, quyDoc: !!KICH_BAN[ten].quyDoc, quyHai: !!KICH_BAN[ten].quyHai } });
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
      { kb: 'caCheckIn', file: 'pos_shift.v1.js', tim: /otThresholdHours: Number\(emp\.otThresholdHours\) \|\| 8,/, thay: 'otThresholdHours: Number(emp.otThresholdHours) || 9,', mo: 'đổi ngưỡng OT mặc định chụp vào ca' },
      { kb: 'ketDoiSoatKhop', file: 'pos_shift_closing.v1.js', tim: /status: passed \? 'cash_passed'/, thay: "status: passed ? 'cash_ok'", mo: 'đổi trạng thái đối soát khớp' },
      { kb: 'ketCaTreo', file: 'pos_handover.v1.js', tim: /'Tự chốt ca bỏ quên từ ngày '/, thay: "'Tu chot ca '", mo: 'đổi lý do chốt hộ ca treo' },
      { kb: 'caMoCaDayDu', file: 'pos_shift_closing.v1.js', tim: /if\(phase==='open'\)await _continueAfterShiftInventoryOpenPOS\(\);/, thay: "if(phase==='open'){await _continueAfterShiftInventoryOpenPOS();await _continueAfterShiftInventoryOpenPOS();}", mo: 'gọi bước tiếp sau kiểm kê đầu ca hai lần' },
      { kb: 'caMoCaDayDu', file: 'pos_shift_closing.v1.js', tim: /expectedQty:l\.expectedQty,countedQty:l\.counted,/, thay: 'expectedQty:l.expectedQty,countedQty:l.counted+1,', mo: 'lệch số kiểm kê đầu ca +1' },
      { kb: 'ketDemBTP', file: 'pos_shift_closing.v1.js', tim: /await _continueAfterPrepCount\(\);(\n  \} catch \(err\) \{\n    console\.error\('submitPrepCount failed')/, thay: 'await _continueAfterPrepCount(); await _continueAfterPrepCount();$1', mo: 'gọi bước tiếp sau đếm BTP hai lần' },
      { kb: 'quyChiTieu', file: 'pos_cashfund.v1.js', tim: /const netAmount = takenOutTotal - changeTotal;/, thay: 'const netAmount = takenOutTotal - changeTotal + 1;', mo: 'lệch số tiền chi thực tế +1' },
      { kb: 'moKetPin', file: 'pos_cashfund.v1.js', tim: /await POSPrinter\.engine\.openDrawer\(\);/, thay: 'await POSPrinter.engine.openDrawer(); await POSPrinter.engine.openDrawer();', mo: 'gửi lệnh mở két hai lần', muc: 'sau' },
      { kb: 'moKet', file: 'pos_cashfund.v1.js', tim: /employeeId: emp\.id \|\| '', employeeName/, thay: "employeeId: 'x', employeeName", mo: 'đổi người mở két trong nhật ký' },
      { kb: 'menuMon', file: 'pos_catalog_admin.v1.js', tim: /priceL: priceL \|\| 0\n/, thay: 'priceL: (priceL || 0) + 1\n', mo: 'lệch giá L khi lưu món' },
      { kb: 'menuTopping', file: 'pos_catalog_admin.v1.js', tim: /const data = \{ name, price, priceTogo \};/, thay: 'const data = { name, price, priceTogo: priceTogo + 1 };', mo: 'lệch giá To Go topping' },
      { kb: 'muaThem', file: 'pos_orders.v1.js', tim: /const cashChange = isCash \? cashGiven - amount : 0;/, thay: 'const cashChange = isCash ? cashGiven - amount + 1 : 0;', mo: 'lệch tiền thối khi mua thêm' },
      { kb: 'xoaBill', file: 'pos_orders.v1.js', tim: /return \{ \.\.\.cur, consumeJobs: jobs, deletionPending: true \};/, thay: 'return { ...cur, consumeJobs: jobs, deletionPending: 1 };', mo: 'đổi cờ xoá dở' },
      { kb: 'xoaBillJobChay', file: 'pos_orders.v1.js', tim: /if \(busy\) return;/, thay: '/* bỏ chặn busy */', mo: 'bỏ chặn xoá khi việc trừ kho đang chạy' },
      { kb: 'khachTichTem', file: 'pos_customers.v1.js', tim: /const canAdd = Math\.min\(drinkCount, Math\.max\(0, 2 - stampsToday\)\);/, thay: 'const canAdd = Math.min(drinkCount, Math.max(0, 3 - stampsToday));', mo: 'đổi trần tem mỗi ngày 2 → 3' },
      { kb: 'khachThemThanhVien', file: 'pos_customers.v1.js', tim: /source: 'pos_gieogieo'/, thay: "source: 'pos_khac'", mo: 'đổi nguồn tạo thành viên' },
      { kb: 'batDauMe', file: 'pos_prep.v1.js', tim: /note: `Nấu \$\{p\.code/, thay: 'note: `NAU ${p.code', mo: 'đổi ghi chú dòng trừ NL khi bắt đầu nấu' }
    ];
    for (const tk of TU_KIEM) {
      if (!dsKB.includes(tk.kb)) continue;
      const sua = await banSua(hb.dir.nay, d => {
        const f = path.join(d, 'js', 'posgieo', tk.file); const t = fs.readFileSync(f, 'utf8');
        fs.writeFileSync(f, t.replace(tk.tim, tk.thay));
        if (fs.readFileSync(f, 'utf8') === t) throw new Error('tự kiểm: không cài được lỗi vào ' + tk.file);
      });
      try { const h = await chay(b, sua.base, 'gg01', tk.kb); const l = lechMuc(goc[tk.kb], h); chk(l.includes(tk.muc || 'ghi'), `(tự kiểm ${tk.kb}) bản cài lỗi ${tk.mo} → báo lệch mục ${tk.muc || 'ghi'}` + (l.length ? '' : ': KHÔNG thấy lệch')); }
      finally { sua.dong(); }
    }
  } finally { await b.close(); hb.dong(); }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
