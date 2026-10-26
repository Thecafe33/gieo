// Dựng HAI bộ deploy để so hành vi trước / sau tách (Đợt 1D): bộ của mốc (bản đang chạy ở cửa hàng — git worktree tạm)
// và bộ hiện tại, mỗi bộ một máy chủ HTTP cục bộ; moTrang mở posgieo.html với Firebase / CDN giả (fb_gia.js).
// Dùng bởi e2e_hook.js, e2e_ban.js.
'use strict';
const http = require('http'); const fs = require('fs'); const path = require('path'); const os = require('os');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const { serveFile } = require(path.join(ROOT, 'tests/lib/e2e'));
const { FB_STUB } = require('./fb_gia');

async function dungHaiBan(moc, mua) {
  const tam = fs.mkdtempSync(path.join(os.tmpdir(), 'tach_hai_ban_'));
  execFileSync('git', ['-C', ROOT, 'worktree', 'add', '--detach', '-q', tam, moc]);
  const dir = { moc: path.join(tam, 'ban_deploy', mua), nay: path.join(ROOT, 'ban_deploy', mua) };
  const sv = {}, base = {};
  for (const [k, d] of Object.entries(dir)) {
    sv[k] = http.createServer((q, s) => { if (!serveFile(d, new URL(q.url, 'http://x').pathname, s)) { s.statusCode = 404; s.end('404'); } });
    await new Promise(r => sv[k].listen(0, '127.0.0.1', r)); base[k] = 'http://127.0.0.1:' + sv[k].address().port;
  }
  return { dir, base, dong() { for (const s of Object.values(sv)) s.close(); execFileSync('git', ['-C', ROOT, 'worktree', 'remove', '--force', tam]); } };
}

// opts: authNgay (auth trả về ngay), gioCo (Date cố định, ms), ngauNhienCo (Math.random + crypto.getRandomValues theo hạt giống cố định), lechGio (cộng ms vào giờ thật — giả chạy lúc khác), store (mặc định gg01), canh (regex console cần gom)
async function moTrang(b, base, opts) {
  opts = opts || {};
  const ctx = await b.newContext();
  await ctx.addInitScript(o => {
    try { localStorage.setItem('gieo_store_v1', JSON.stringify({ storeId: o.store || 'gg01', name: 'Gieo' })); } catch (e) {}
    if (o.gioCo) {   // giờ + ngẫu nhiên cố định → hai bản cho cùng mã / thời điểm
      const T = o.gioCo, D = Date; let n = 0;
      // eslint-disable-next-line no-global-assign
      Date = class extends D { constructor(...a) { if (!a.length) super(T + (n++)); else super(...a); } static now() { return T + (n++); } };
      let s = 12345; Math.random = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    }
    if (o.ngauNhienCo && !o.gioCo) {   // cùng chuỗi ngẫu nhiên ở hai bản (mã tem / mã lô…) — giờ vẫn là giờ thật
      let s = 987654321; const nx = () => (s = (s * 1103515245 + 12345) % 2147483648);
      Math.random = () => nx() / 2147483648;
      try { const C = window.crypto; const goc = C.getRandomValues.bind(C); C.getRandomValues = a => { if (!a || !a.length) return goc(a); for (let i = 0; i < a.length; i++) a[i] = nx() % 256; return a; }; } catch (e) {}
    }
    if (o.lechGio) {
      const L = o.lechGio, D = Date;
      // eslint-disable-next-line no-global-assign
      Date = class extends D { constructor(...a) { if (!a.length) super(D.now() + L); else super(...a); } static now() { return D.now() + L; } };
    }
  }, { store: opts.store, gioCo: opts.gioCo, lechGio: opts.lechGio, ngauNhienCo: opts.ngauNhienCo });
  const page = await ctx.newPage(); const loi = [], canh = [];
  page.on('pageerror', e => loi.push(e.message));
  if (opts.canh) page.on('console', m => { if (opts.canh.test(m.text())) canh.push(m.text()); });
  let stub = FB_STUB;
  if (opts.authNgay) {
    stub = FB_STUB.replace('onAuthStateChanged:function(){}', "onAuthStateChanged:function(cb){setTimeout(function(){cb({uid:'e2e',email:'e2e@x'})},0);return function(){}}");
    if (stub === FB_STUB) throw new Error('fb_gia: không tìm thấy onAuthStateChanged để bật auth nhanh');
  }
  await page.route('**/*', r => { const u = r.request().url();
    if (/gstatic\.com\/firebasejs\/[\d.]+\/firebase-app-compat\.js/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: stub });
    if (/^https?:\/\/(www\.gstatic\.com|cdn\.jsdelivr\.net)/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: '' });
    return u.startsWith(base) ? r.continue() : r.abort(); });
  await page.goto(base + '/posgieo.html', { waitUntil: 'load' }); await page.waitForTimeout(1500);
  const qua = await page.evaluate(() => !document.getElementById('posStoreLogin') && !document.getElementById('posModThieu'));
  return { ctx, page, loi, canh, qua };
}
// Bản SỬA TẠM của một bộ deploy (chép sang thư mục tạm, sua(thưMục) cài lỗi) — để công cụ tự chứng minh bắt được lỗi.
async function banSua(dirGoc, sua) {
  const tam = fs.mkdtempSync(path.join(os.tmpdir(), 'tach_ban_sua_'));
  fs.cpSync(dirGoc, tam, { recursive: true }); sua(tam);
  const sv = http.createServer((q, s) => { if (!serveFile(tam, new URL(q.url, 'http://x').pathname, s)) { s.statusCode = 404; s.end('404'); } });
  await new Promise(r => sv.listen(0, '127.0.0.1', r));
  return { base: 'http://127.0.0.1:' + sv.address().port, dong() { sv.close(); fs.rmSync(tam, { recursive: true, force: true }); } };
}
// Chèn `chen` ngay sau dấu { mở thân hàm khai báo `ten` trong file (lỗi nếu không thấy đúng một chỗ).
function chenDauHam(file, ten, chen) {
  const t = fs.readFileSync(file, 'utf8'); const re = new RegExp('(?:async\\s+)?function\\s+' + ten + '\\s*\\([^)]*\\)\\s*\\{', 'g');
  const ms = [...t.matchAll(re)]; if (ms.length !== 1) throw new Error('chenDauHam: ' + ten + ' thấy ' + ms.length + ' chỗ trong ' + file);
  const i = ms[0].index + ms[0][0].length; fs.writeFileSync(file, t.slice(0, i) + chen + t.slice(i));
}
module.exports = { dungHaiBan, moTrang, banSua, chenDauHam, ROOT };
