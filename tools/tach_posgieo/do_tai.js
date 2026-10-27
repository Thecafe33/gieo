#!/usr/bin/env node
// Đợt 5 — ĐO thời gian tải posgieo.html: bản mốc (bộ deploy ở commit --moc) so với bản hiện tại, CPU giảm tốc (--cpu, mặc định 4 = điện thoại tầm trung).
// Lạnh = lần mở đầu của context mới; "mở lại" = mở lần hai cùng context — KHÔNG phải số đo HTTP cache (page.route làm Playwright tắt cache HTTP, F5-1) nên chỉ cho biết mở lại cùng phiên. Firebase / CDN giả (fb_gia) → đo phần TẢI + PHÂN TÍCH + KHỞI ĐỘNG mã app, không đo mạng Firebase.
//   node tools/tach_posgieo/do_tai.js [--moc 0bd95a7] [--mua giangsinh] [--lan 7] [--cpu 4]
const path = require('path');
const { chromium } = require('playwright');
const { dungHaiBan, ROOT } = require('./hai_ban');
const { chromiumPath } = require(path.join(ROOT, 'tests/lib/e2e'));
const { FB_STUB } = require('./fb_gia');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const MOC = arg('--moc', '0bd95a7'), MUA = arg('--mua', 'giangsinh'), LAN = +arg('--lan', 7), CPU = +arg('--cpu', 4);
const trungVi = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

async function mot(b, base, ctx) {
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  let byte = 0, nReq = 0; const cho = [];
  await page.route('**/*', async r => { const u = r.request().url();
    if (/gstatic\.com\/firebasejs\/[\d.]+\/firebase-app-compat\.js/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: FB_STUB.replace('onAuthStateChanged:function(){}', "onAuthStateChanged:function(cb){setTimeout(function(){cb({uid:'e2e',email:'e2e@x'})},0);return function(){}}") });
    if (/^https?:\/\/(www\.gstatic\.com|cdn\.jsdelivr\.net)/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: '' });
    if (!u.startsWith(base)) return r.abort();
    nReq++; return r.continue(); });
  page.on('response', rs => { if (rs.url().startsWith(base)) cho.push(rs.body().then(b => { byte += b.length; }, () => {})); });   // cộng SAU khi body về (F5-2: `byte += await` mất cập nhật khi nhiều handler chờ)
  await page.goto(base + '/posgieo.html', { waitUntil: 'load' }); await page.waitForTimeout(800); await Promise.all(cho);
  const t = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd, js: performance.getEntriesByType('resource').filter(e => /\.js(\?|$)/.test(e.name) && /posgieo|js\//.test(e.name) === true).length }; });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await page.close();
  return { dcl: t.dcl, load: t.load, nReq, byte };
}
async function ban(b, base) {
  const lanh = [], am = [];
  for (let i = 0; i < LAN; i++) {
    const c1 = await b.newContext(); await c1.addInitScript(() => { try { localStorage.setItem('gieo_store_v1', JSON.stringify({ storeId: 'gg01', name: 'Gieo' })); } catch (e) {} });
    lanh.push(await mot(b, base, c1)); am.push(await mot(b, base, c1)); await c1.close();
  }
  const g = (a, k) => Math.round(trungVi(a.map(x => x[k])));
  return { lanh: { dcl: g(lanh, 'dcl'), load: g(lanh, 'load'), nReq: lanh[0].nReq, kb: Math.round(lanh[0].byte / 1024)   /* tổng body đã giải nén, không phải byte trên dây */ }, am: { dcl: g(am, 'dcl'), load: g(am, 'load') } };
}
(async () => {
  const hb = await dungHaiBan(MOC, MUA);
  const b = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
  try {
    await ban(b, hb.base.moc);   // khởi động trình duyệt / làm nóng
    const m = await ban(b, hb.base.moc), n = await ban(b, hb.base.nay);
    console.log(`CPU ×${CPU}, trung vị ${LAN} lần, ms (DCL = DOMContentLoaded, load = sự kiện load)`);
    console.log(`            | lạnh DCL | lạnh load | mở lại DCL | mở lại load | số request | KB body`);
    for (const [ten, x] of [[MOC + ' (mốc)', m], ['hiện tại   ', n]]) console.log(`${ten.padEnd(12)}| ${String(x.lanh.dcl).padStart(8)} | ${String(x.lanh.load).padStart(9)} | ${String(x.am.dcl).padStart(6)} | ${String(x.am.load).padStart(7)} | ${String(x.lanh.nReq).padStart(10)} | ${x.lanh.kb}`);
  } finally { await b.close(); hb.dong(); }
})().catch(e => { console.error(e); process.exit(1); });
