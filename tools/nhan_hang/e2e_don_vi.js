// Màn nhận hàng thật + fixture danh mục tại máy; chặn toàn bộ mạng, không truy cập Firebase.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { extract } = require('../../tests/lib/extract');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'posgieo.html'), 'utf8');
const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
const funcs = extract('posgieo.html', ['escHtmlPos', 'poReceiveDefaultUnit', 'poReceiveUnitOptions', 'poReceiveQuantities',
  'poReceivePreviewHtml', 'poReceiveLineChangeField', 'poReceiveRefreshLinePreview', 'poReceiveStepQty',
  'poReceiveLineCardHtml', 'poReceiveStepperHtml', 'renderPoReceiveForm', 'poLineQtyText']);
const item = { id: 'pearl', name: 'Trân châu trắng', unit: 'g', countUnitName: 'Bịch', trackingMode: 'unit',
  packagingUnits: [{ name: 'Bịch', baseQty: 2000 }, { name: 'Thùng', baseQty: 12000 }] };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium' });
  try {
    let checks = 0;
    for (const [width, height] of [[1366, 768], [768, 1024], [390, 844], [320, 640]]) {
      const p = await b.newPage({ viewport: { width, height } });
      const errors = []; p.on('pageerror', e => errors.push(e.message));
      await p.route('**/*', r => r.abort());
      await p.setContent(`<meta charset="UTF-8"><style>${css}</style><div id="poReceiveScreen" class="screen active"><div id="poReceiveBody"></div></div>`);
      await p.addScriptTag({ content: `
        const KHO_ITEMS_CACHE=[${JSON.stringify(item)}];
        let poReceiveState={poId:null,supplier:'',lines:[{...KHO_ITEMS_CACHE[0],itemId:'pearl',unitFactor:2000,goodQty:0,damagedQty:0,wrongProduct:false,note:''}]};
        const fmtPrepQty=n=>Number(n).toLocaleString('vi-VN'), round2=n=>Math.round(n*100)/100;
        const toast=()=>{}, renderPinInput=()=>'<input placeholder="PIN nhân viên">';
        ${funcs}
        renderPoReceiveForm();` });
      const good = p.locator('.ds-qty-box.good input'), bad = p.locator('.ds-qty-box.bad input');
      assert.match(await p.locator('.ds-qty-box.good .lbl').textContent(), /Bịch/); checks++;
      await good.fill('6');
      assert.match(await p.locator('#polChips0').textContent(), /Nhận 6 Bịch.*12.000 g.*Tạo 6 mã NL/s); checks++;
      assert.equal(await good.evaluate(el => document.activeElement === el), true); checks++;
      await bad.fill('1');
      await p.getByRole('button', { name: 'Thùng = 12.000 g', exact: true }).click();
      assert.equal(await good.inputValue(), '0'); assert.equal(await bad.inputValue(), '0'); checks += 2;
      assert.match(await p.locator('.ds-qty-box.good .lbl').textContent(), /Thùng/); checks++;
      await good.fill('1');
      assert.match(await p.locator('#polChips0').textContent(), /Nhận 1 Thùng.*12.000 g.*Tạo 6 mã NL/s); checks++;
      const overflow = await p.evaluate(() => {
        const els = [...document.querySelectorAll('#poReceiveScreen .ds-card, #poReceiveScreen .ds-seg button, #poReceiveScreen .ds-qty-box')];
        return els.some(el => { const r = el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 2; });
      });
      assert.equal(overflow, false); checks++;
      assert.deepEqual(errors, []); checks++;
      if (process.env.SCREENSHOT_DIR) {
        fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
        await p.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `nhan-hang-${width}.png`), fullPage: true });
      }
      console.log(`ok ${width}×${height}: nhập Bịch/đổi Thùng, preview đúng 6 mã, giữ focus, không tràn`);
      await p.close();
    }
    console.log(`ALL PASS (${checks} checks)`);
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
