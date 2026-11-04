// e2e hồi quy [FIX QUAY-LẠI-BƯỚC 04/11/2026] — kết ca, bước Kiểm kê cuối ca (Bước 6/8):
//   bấm «<» xem lại bước trước rồi «Tiếp →» về bước đang làm → khung «Người thực hiện» (chữ ký phiên kết ca) phải còn hiệu lực,
//   «Xác nhận kiểm kê» lưu được (trước đây: ô ẩn __signer__ bị dựng lại từ ảnh chụp đã xoá → «⚠️ Nhập đủ mã PIN 4 số», kẹt kết ca).
//   node tools/ket_ca/e2e_quay_lai_buoc.js [--mua giangsinh]
// Chạy trên bộ deploy ban_deploy/<mùa> với Firebase giả (tools/tach_posgieo/fb_gia.js), Engine 2 ở cả «active» lẫn «shadow».
// TỰ KIỂM: bản sao bộ deploy trỏ lại pos_shift_closing.v1.js (bản lỗi) → công cụ PHẢI báo lỗi.
'use strict';
const path = require('path'); const fs = require('fs'); const http = require('http'); const os = require('os');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const { serveFile, chromiumPath } = require(path.join(ROOT, 'tests/lib/e2e'));
const { FB_STUB } = require(path.join(ROOT, 'tools/tach_posgieo/fb_gia'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const MUA = arg('--mua', 'giangsinh');
let ok = true; const chk = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) ok = false; };

async function phucVu(dir) {
  const sv = http.createServer((q, s) => { if (!serveFile(dir, new URL(q.url, 'http://x').pathname, s)) { s.statusCode = 404; s.end('404'); } });
  await new Promise(r => sv.listen(0, '127.0.0.1', r));
  return { base: 'http://127.0.0.1:' + sv.address().port, dong: () => sv.close() };
}

async function chay(b, base, mode, quayLai) {
  const ctx = await b.newContext();
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  await ctx.addInitScript(([mode, today]) => {
    localStorage.setItem('gieo_store_v1', JSON.stringify({ storeId: 'gg01', name: 'Gieo' }));
    window.__SNAP = true; window.__SEED_GHI = true;
    window.__SEED = {
      'duty_digests_gieogieo/_engine2': { enabled: true, mode, protocolVersion: 1, fleetConfirmed: true, controlledItemIds: ['tc'], settingsRevision: 1, revision: 1 },
      'employees_gieogieo/nv1': { fullName: 'NV E2E', pin: '1234', active: true },
      'employee_shifts_gieogieo/s1': { employeeId: 'nv1', employeeName: 'NV E2E', businessDate: today, checkedInAt: new Date(Date.now() - 8 * 3600e3).toISOString(), checkedOutAt: null },
      'inventory_items_gieogieo/tc': { name: 'Trân châu trắng', unit: 'g', trackingMode: 'unit', stockManaged: true, shiftCountTiming: 'close', currentStock: 2000, active: true },
      'stock_containers_gieogieo/c1': { itemId: 'tc', status: 'open', code: 'YWAGSPNT', unitBase: 2000, baseQty: 3000 },
      'active_units_gieogieo/tc': { c1: { code: 'YWAGSPNT', unitBase: 2000, capacity: 3000, openedAt: Date.now() - 3600e3 } },
      'prep_vessels_gieogieo/v': { name: 'Hũ', variants: [{ id: 'a', tareG: 100 }] },
    };
  }, [mode, today]);
  const page = await ctx.newPage(); const loi = [];
  page.on('pageerror', e => loi.push(e.message));
  const stub = FB_STUB.replace('onAuthStateChanged:function(){}', "onAuthStateChanged:function(cb){setTimeout(function(){cb({uid:'e2e',email:'e2e@x'})},0);return function(){}}");
  await page.route('**/*', r => { const u = r.request().url();
    if (/firebase-app-compat\.js/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: stub });
    if (/^https?:\/\/(www\.gstatic\.com|cdn\.jsdelivr\.net)/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: '' });
    return u.startsWith(base) ? r.continue() : r.abort(); });
  await page.goto(base + '/posgieo.html', { waitUntil: 'load' }); await page.waitForTimeout(2000);
  const kq = await page.evaluate(async ([today, quayLai]) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const toasts = []; const g = window.toast; window.toast = function (m) { toasts.push(String(m)); return g && g.apply(this, arguments); };
    window.posConfirm = async () => true;
    await loadEmployeesCachePOS(true); await loadEmployeeShiftsTodayCache();
    showScreen('caLamViecScreen');
    shiftState = { businessDate: today, opening: {}, closing: {} };
    _closeSession = { employeeId: 'nv1', fullName: 'NV E2E', startedAt: new Date().toISOString(), businessDate: today };
    await _continueAfterPrepCount(); await sleep(500);   // → Bước 6 Kiểm kê cuối ca
    // Bước 5 đã đi qua (ảnh chụp có sẵn; đặt SAU khi vào Bước 6 — closeStepEnsureDatePOS xoá ảnh chụp khi đổi ngày)
    closeStepEnsureDatePOS();
    _closeStepScreensPOS[5] = '<div class="kc-nav"><button class="kc-nav-back"></button><div class="kc-nav-pill"><span class="lbl">Bước 5/8</span></div></div><div>Bước 5</div>';
    const l = _shiftInventoryCountStatePOS.lines[0]; if (!l) return { loiKB: 'không có dòng kiểm kê' };
    shiftWeighConfirmPOS(0, 0, 'scan', ''); shiftWeighQtyPOS(0, 0, '1928.8'); await sleep(900);
    l.units[0].weighings = [{ vesselId: 'v', variantId: 'a', tareG: 100, grossG: 2028.8 }];
    const pin = () => (document.getElementById('shiftInventoryCloseStaffPin') || {}).value;
    const r = { truoc: pin() };
    if (quayLai) {
      closeStepNavBack(); await sleep(50); r.xemLai = _closeStepReviewPOS;
      closeStepNavForward(); await sleep(50); r.sau = pin(); r.khungTen = !!document.querySelector('#shiftInventoryCloseStaffBox button');
    }
    await Promise.race([submitShiftInventoryCountPOS(), sleep(15000)]); await sleep(1500);
    r.tieuDe = (document.querySelector('#shiftBody .kc-title') || {}).textContent; r.toasts = toasts;
    return r;
  }, [today, quayLai]);
  await ctx.close(); kq.loi = loi; return kq;
}

(async () => {
  const dir = path.join(ROOT, 'ban_deploy', MUA);
  const b = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
  const sv = await phucVu(dir);
  try {
    for (const mode of ['active', 'shadow']) {
      for (const quayLai of [false, true]) {
        const n = `(${mode}${quayLai ? ', «<» rồi «Tiếp →»' : ''})`;
        const k = await chay(b, sv.base, mode, quayLai);
        chk(!k.loiKB && k.truoc === '__signer__', n + ' khung «Người thực hiện» = phiên kết ca');
        if (quayLai) chk(k.xemLai === 5 && k.sau === '__signer__' && k.khungTen, n + ' quay về Bước 6: chữ ký còn nguyên (' + JSON.stringify(k.sau) + ')');
        chk((k.toasts || []).some(t => /Đã lưu số kiểm kê cuối ca/.test(t)) && !(k.toasts || []).some(t => /PIN/.test(t)), n + ' xác nhận kiểm kê lưu được, không đòi PIN — ' + JSON.stringify(k.toasts));
        chk(k.tieuDe === 'Bàn giao tiền', n + ' sang bước Bàn giao tiền (' + k.tieuDe + ')');
        chk(!k.loi.length, n + ' không lỗi JS' + (k.loi.length ? ': ' + k.loi.join(' | ') : ''));
      }
    }
    // TỰ KIỂM: trỏ lại bản v1 (lỗi cũ) → phải thấy «Nhập đủ mã PIN 4 số» sau khi quay lại.
    const tam = fs.mkdtempSync(path.join(os.tmpdir(), 'quay_lai_buoc_'));
    try {
      fs.cpSync(dir, tam, { recursive: true });
      const v1 = path.join(ROOT, 'js/posgieo/pos_shift_closing.v1.js');
      fs.copyFileSync(v1, path.join(tam, 'js/posgieo/pos_shift_closing.v1.js'));
      const h = path.join(tam, 'posgieo.html'); const t = fs.readFileSync(h, 'utf8');
      if (!t.includes('js/posgieo/pos_shift_closing.v2.js')) throw new Error('tự kiểm: posgieo.html không trỏ pos_shift_closing.v2.js');
      fs.writeFileSync(h, t.split('js/posgieo/pos_shift_closing.v2.js').join('js/posgieo/pos_shift_closing.v1.js'));
      const sv1 = await phucVu(tam);
      try {
        const k = await chay(b, sv1.base, 'active', true);
        chk(k.sau === '' && (k.toasts || []).some(t => /Nhập đủ mã PIN 4 số/.test(t)), '(tự kiểm) bản v1 → công cụ bắt được lỗi cũ: ' + JSON.stringify(k.toasts));
      } finally { sv1.dong(); }
    } finally { fs.rmSync(tam, { recursive: true, force: true }); }
  } finally { await b.close(); sv.dong(); }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
