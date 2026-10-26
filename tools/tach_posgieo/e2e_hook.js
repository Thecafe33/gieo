// e2e Đợt 1D kế hoạch tách posgieo (5.2): CHỤP CHUỖI BỌC HÀM trước / sau tách và so khớp.
//   node tools/tach_posgieo/e2e_hook.js [--moc 0bd95a7] [--mua giangsinh]
// Mỗi lớp bọc (trợ lý `assistHookIntoPOS` → Gấu Noel → automation → Engine 2) giữ hàm trước nó trong biến closure
// (`goc` / `cu` / `fn`). Công cụ đi ngược chuỗi qua CDP [[Scopes]]: từ window[tên] tới hàm gốc, mỗi lớp ghi chữ ký
// mã nguồn (băm + độ dài + đầu đoạn). Chạy CÙNG một kịch bản trên bộ deploy của mốc (bản đang chạy ở cửa hàng) và bộ
// deploy hiện tại → mọi tên phải có chuỗi GIỐNG HỆT (cùng số lớp, cùng thứ tự, cùng mã từng lớp, cùng hàm gốc).
// Hai biến thể: (A) đăng nhập chậm (auth không trả về), (B) auth trả về ngay. Máy đã gắn gg01 → qua chốt dừng.
// Firebase / CDN giả (fb_gia.js). Cần git (worktree mốc dựng tạm ở thư mục tạm, xoá khi xong) + Playwright.
'use strict';
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const { dungHaiBan, moTrang, ROOT } = require('./hai_ban');
const { chromiumPath } = require(path.join(ROOT, 'tests/lib/e2e'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const MOC = arg('--moc', '0bd95a7'), MUA = arg('--mua', 'giangsinh');
let ok = true; const chk = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) ok = false; };

// Tên ứng viên: mọi chuỗi dạng định danh trong các file bọc + khối assistHookIntoPOS (lọc lúc chạy: chỉ giữ tên có ≥ 2 lớp).
function ungVien(dir) {
  const s = new Set(); const them = t => { const re = /['"]([A-Za-z_$][\w$]*)['"]/g; let m; while ((m = re.exec(t))) s.add(m[1]); };
  for (const f of ['gau_noel_giangsinh.v2.js', 'gieo_automation_pos.v3.js', 'gieo_engine2_pos_v1.js']) if (fs.existsSync(path.join(dir, f))) them(fs.readFileSync(path.join(dir, f), 'utf8'));
  const h = fs.readFileSync(path.join(dir, 'posgieo.html'), 'utf8'); const i = h.indexOf('(function assistHookIntoPOS'); if (i > 0) them(h.slice(i, i + 6000));
  return [...s];
}

const KY = 'function(){var s=Function.prototype.toString.call(this),h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return (h>>>0).toString(16)+":"+s.length+":"+s.slice(0,70).replace(/\\s+/g," ")}';
async function chuoi(cdp, ten) {
  const { result } = await cdp.send('Runtime.evaluate', { expression: 'typeof window[' + JSON.stringify(ten) + "]==='function'?window[" + JSON.stringify(ten) + ']:null' });
  const lop = []; let o = result;
  while (o && o.type === 'function' && lop.length < 12) {
    const ky = (await cdp.send('Runtime.callFunctionOn', { objectId: o.objectId, functionDeclaration: KY, returnByValue: true })).result.value;
    const pr = await cdp.send('Runtime.getProperties', { objectId: o.objectId, ownProperties: false });
    const sc = (pr.internalProperties || []).find(p => p.name === '[[Scopes]]'); let ke = null, qua = null;
    if (sc) for (const s of (await cdp.send('Runtime.getProperties', { objectId: sc.value.objectId, ownProperties: true })).result) {
      if (!s.value || /^(Global|Script)/.test(s.value.description || '')) continue;   // biến cấp cao trùng tên không phải lớp trước
      const v = (await cdp.send('Runtime.getProperties', { objectId: s.value.objectId, ownProperties: true })).result.find(x => ['goc', 'cu', 'fn'].includes(x.name) && x.value && x.value.type === 'function');
      if (v) { ke = v.value; qua = v.name; break; }
    }
    lop.push((qua ? '[' + qua + '] ' : '[gốc] ') + ky); o = ke;
  }
  return lop;
}

async function chup(b, base, ten, authNgay) {
  const { ctx, page, loi, canh, qua } = await moTrang(b, base, { authNgay, canh: /không tìm thấy hàm để móc|app không có hàm|bỏ qua phần gắn/ });
  const cdp = await ctx.newCDPSession(page); const kq = {};
  for (const t of ten) { const c = await chuoi(cdp, t); if (c.length) kq[t] = c; }
  await ctx.close(); return { kq, loi, canh, qua };
}

(async () => {
  const hb = await dungHaiBan(MOC, MUA); const thuMuc = hb.dir;
  const ten = [...new Set([...ungVien(thuMuc.moc), ...ungVien(thuMuc.nay)])].sort();
  const b = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
  try {
    for (const [nhan, authNgay] of [['A auth chậm', false], ['B auth ngay', true]]) {
      const m = await chup(b, hb.base.moc, ten, authNgay);
      const n = await chup(b, hb.base.nay, ten, authNgay);
      chk(m.qua && n.qua, `(${nhan}) cả hai bản qua chốt dừng (gắn gg01, không màn đỏ)`);
      const bocM = Object.keys(m.kq).filter(t => m.kq[t].length > 1), bocN = Object.keys(n.kq).filter(t => n.kq[t].length > 1);
      chk(bocM.length >= 15, `(${nhan}) mốc ${MOC}: chụp được ${bocM.length} hàm có bọc (≥ 15 — chứng tỏ công cụ thật sự đi được chuỗi)`);
      chk(JSON.stringify(bocM) === JSON.stringify(bocN), `(${nhan}) cùng tập hàm bị bọc (${bocN.length})` + (JSON.stringify(bocM) === JSON.stringify(bocN) ? '' : ': chỉ mốc ' + bocM.filter(t => !bocN.includes(t)) + ' | chỉ nay ' + bocN.filter(t => !bocM.includes(t))));
      const lech = bocM.filter(t => JSON.stringify(m.kq[t]) !== JSON.stringify(n.kq[t]));
      chk(!lech.length, `(${nhan}) chuỗi bọc giống hệt từng lớp + hàm gốc` + (lech.length ? ': lệch ' + lech.map(t => t + '\n   mốc ' + m.kq[t].join('\n        ') + '\n   nay ' + n.kq[t].join('\n        ')).join('\n') : ''));
      chk(JSON.stringify(m.canh) === JSON.stringify(n.canh), `(${nhan}) cùng cảnh báo «bỏ qua phần gắn» (${n.canh.length})` + (n.canh.length ? ': ' + n.canh.join(' | ') : ''));
      chk(JSON.stringify(m.loi.sort()) === JSON.stringify(n.loi.sort()), `(${nhan}) cùng lỗi JS (${n.loi.length})` + (JSON.stringify(m.loi) === JSON.stringify(n.loi) ? '' : ': mốc ' + m.loi.join(' | ') + ' || nay ' + n.loi.join(' | ')));
      if (process.env.E2E_DEBUG) for (const t of bocN) console.log(t, '\n  ' + n.kq[t].join('\n  '));
      if (nhan[0] === 'A') console.log('   hàm bị bọc: ' + bocN.map(t => t + '×' + (n.kq[t].length - 1)).join(', '));
    }
  } finally {
    await b.close(); hb.dong();
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
