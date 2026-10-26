// e2e Đợt 1D kế hoạch tách posgieo (5.2): CHỤP CHUỖI BỌC HÀM trước / sau tách và so khớp.
//   node tools/tach_posgieo/e2e_hook.js [--moc 0bd95a7] [--mua giangsinh]
// Mỗi lớp bọc (trợ lý `assistHookIntoPOS` → Gấu Noel → automation → Engine 2) giữ hàm trước nó trong biến closure
// (`goc` / `cu` / `fn`, Engine 2 còn `old` / `count`). CẠNH về lớp trước lấy TĨNH từ mã nguồn (`const V = window.N` → riêng
// tên N; `const V = window[biến]` → mọi tên) — kiểm toán lượt 07 F07-1: trước chỉ theo goc/cu/fn và chỉ thu tên trong
// dấu nháy nên sót 2 lớp Engine 2. Công cụ đi ngược chuỗi qua CDP [[Scopes]]: từ window[tên] tới hàm gốc, mỗi lớp ghi chữ ký
// mã nguồn (băm + độ dài + đầu đoạn). Chạy CÙNG một kịch bản trên bộ deploy của mốc (bản đang chạy ở cửa hàng) và bộ
// deploy hiện tại → mọi tên phải có chuỗi GIỐNG HỆT (cùng số lớp, cùng thứ tự, cùng mã từng lớp, cùng hàm gốc).
// Hai biến thể: (A) đăng nhập chậm (auth không trả về), (B) auth trả về ngay. Máy đã gắn gg01 → qua chốt dừng.
// Firebase / CDN giả (fb_gia.js). Cần git (worktree mốc dựng tạm ở thư mục tạm, xoá khi xong) + Playwright.
'use strict';
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const { dungHaiBan, moTrang, banSua, chenDauHam, ROOT } = require('./hai_ban');
const { chromiumPath } = require(path.join(ROOT, 'tests/lib/e2e'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const MOC = arg('--moc', '0bd95a7'), MUA = arg('--mua', 'giangsinh');
let ok = true; const chk = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) ok = false; };

// Danh sách hàm có bọc KỲ VỌNG ở mốc mặc định (0bd95a7 · giangsinh) — kiểm tra đúng tập, không chỉ đếm (F07-1).
const KY_VONG = ['_afterIceChange', '_continueAfterPrepCount', 'addCart', 'addFoodToCart', 'assistFinalizeOrder', 'buildReceiptContent', 'cartAdj', 'cartClear',
  'cartDel', 'clearCustomer', 'computeShiftInventoryCountLinesPOS', 'delOrderConfirm', 'doSplitAndOpen', 'onCheckoutClick', 'openCaLamViecScreen',
  'removeCartTopping', 'renderCartDrawer', 'renderCustomerInfo', 'renderDailyClosingChecklist', 'renderOpeningChecklist', 'renderReceiptCanvas',
  'renderScCartPreview', 'renderShiftHandoverForm', 'setCartToppingQty', 'updCoTotal'];

// Nguồn có thể bọc: file bọc ở gốc + MỌI mã app (script trần posgieo.html + js/posgieo/*).
function nguonBoc(dir) {
  const out = [];
  for (const f of ['gau_noel_giangsinh.v2.js', 'gieo_automation_pos.v3.js', 'gieo_engine2_pos_v1.js']) if (fs.existsSync(path.join(dir, f))) out.push({ f, t: fs.readFileSync(path.join(dir, f), 'utf8'), boc: true });
  const h = fs.readFileSync(path.join(dir, 'posgieo.html'), 'utf8'); out.push({ f: 'posgieo.html', t: h });
  const i = h.indexOf('(function assistHookIntoPOS'); if (i > 0) out.push({ f: 'assistHookIntoPOS', t: h.slice(i, i + 6000), boc: true });
  const jd = path.join(dir, 'js', 'posgieo'); if (fs.existsSync(jd)) for (const f of fs.readdirSync(jd)) out.push({ f: 'js/posgieo/' + f, t: fs.readFileSync(path.join(jd, f), 'utf8') });
  return out;
}
// Tên ứng viên + cạnh: chuỗi định danh trong file bọc / khối trợ lý; `window.N` (đọc / gán) trong mọi nguồn.
// canh[N] = biến closure giữ lớp trước của N (`const V = window.N`); dong = biến của `const V = window[…]` (áp mọi tên).
function phanTich(dir) {
  const ten = new Set(), canh = {}, dong = new Set(['goc', 'cu', 'fn']); let m;
  for (const { t, boc } of nguonBoc(dir)) {
    if (boc) { const re = /['"]([A-Za-z_$][\w$]*)['"]/g; while ((m = re.exec(t))) ten.add(m[1]); }
    const r1 = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*window\.([A-Za-z_$][\w$]*)\s*[;,\n]/g;
    while ((m = r1.exec(t))) { ten.add(m[2]); (canh[m[2]] = canh[m[2]] || new Set()).add(m[1]); }
    const r2 = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*window\[/g; while ((m = r2.exec(t))) dong.add(m[1]);
    const r3 = /\bwindow\.([A-Za-z_$][\w$]*)\s*=(?!=)/g; while ((m = r3.exec(t))) ten.add(m[1]);
  }
  return { ten, canh, dong };
}

const KY = 'function(){var s=Function.prototype.toString.call(this),h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return (h>>>0).toString(16)+":"+s.length+":"+s.slice(0,70).replace(/\\s+/g," ")}';
async function chuoi(cdp, ten, pt) {
  const choPhep = new Set([...pt.dong, ...(pt.canh[ten] || [])]);
  const { result } = await cdp.send('Runtime.evaluate', { expression: 'typeof window[' + JSON.stringify(ten) + "]==='function'?window[" + JSON.stringify(ten) + ']:null' });
  const lop = []; let o = result;
  while (o && o.type === 'function' && lop.length < 12) {
    const ky = (await cdp.send('Runtime.callFunctionOn', { objectId: o.objectId, functionDeclaration: KY, returnByValue: true })).result.value;
    const pr = await cdp.send('Runtime.getProperties', { objectId: o.objectId, ownProperties: false });
    const sc = (pr.internalProperties || []).find(p => p.name === '[[Scopes]]'); let ke = null, qua = null;
    if (sc) for (const s of (await cdp.send('Runtime.getProperties', { objectId: sc.value.objectId, ownProperties: true })).result) {
      if (!s.value || /^(Global|Script)/.test(s.value.description || '')) continue;   // biến cấp cao trùng tên không phải lớp trước
      const v = (await cdp.send('Runtime.getProperties', { objectId: s.value.objectId, ownProperties: true })).result.find(x => choPhep.has(x.name) && x.value && x.value.type === 'function');
      if (v) { ke = v.value; qua = v.name; break; }
    }
    lop.push((qua ? '[' + qua + '] ' : '[gốc] ') + ky); o = ke;
  }
  return lop;
}

async function chup(b, base, ten, authNgay, pt) {
  const { ctx, page, loi, canh, qua } = await moTrang(b, base, { authNgay, canh: /không tìm thấy hàm để móc|app không có hàm|bỏ qua phần gắn/ });
  const cdp = await ctx.newCDPSession(page); const kq = {};
  for (const t of ten) { const c = await chuoi(cdp, t, pt); if (c.length) kq[t] = c; }
  await ctx.close(); return { kq, loi, canh, qua };
}

(async () => {
  const hb = await dungHaiBan(MOC, MUA); const thuMuc = hb.dir;
  const p1 = phanTich(thuMuc.moc), p2 = phanTich(thuMuc.nay);
  const pt = { ten: new Set([...p1.ten, ...p2.ten]), dong: new Set([...p1.dong, ...p2.dong]), canh: {} };
  for (const c of [p1.canh, p2.canh]) for (const [k, v] of Object.entries(c)) pt.canh[k] = new Set([...(pt.canh[k] || []), ...v]);
  const ten = [...pt.ten].sort(); const macDinh = MOC === '0bd95a7' && MUA === 'giangsinh';
  const b = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
  let goc = null;
  try {
    for (const [nhan, authNgay] of [['A auth chậm', false], ['B auth ngay', true]]) {
      const m = await chup(b, hb.base.moc, ten, authNgay, pt);
      const n = await chup(b, hb.base.nay, ten, authNgay, pt);
      chk(m.qua && n.qua, `(${nhan}) cả hai bản qua chốt dừng (gắn gg01, không màn đỏ)`);
      const bocM = Object.keys(m.kq).filter(t => m.kq[t].length > 1), bocN = Object.keys(n.kq).filter(t => n.kq[t].length > 1);
      if (macDinh) chk(JSON.stringify(bocM) === JSON.stringify(KY_VONG), `(${nhan}) mốc ${MOC}: đúng ${KY_VONG.length} hàm có bọc theo bảng kỳ vọng` + (JSON.stringify(bocM) === JSON.stringify(KY_VONG) ? '' : ': thiếu ' + KY_VONG.filter(t => !bocM.includes(t)) + ' | thừa ' + bocM.filter(t => !KY_VONG.includes(t))));
      else chk(bocM.length >= 15, `(${nhan}) mốc ${MOC}: chụp được ${bocM.length} hàm có bọc (≥ 15)`);
      chk(JSON.stringify(bocM) === JSON.stringify(bocN), `(${nhan}) cùng tập hàm bị bọc (${bocN.length})` + (JSON.stringify(bocM) === JSON.stringify(bocN) ? '' : ': chỉ mốc ' + bocM.filter(t => !bocN.includes(t)) + ' | chỉ nay ' + bocN.filter(t => !bocM.includes(t))));
      const lech = bocM.filter(t => JSON.stringify(m.kq[t]) !== JSON.stringify(n.kq[t]));
      chk(!lech.length, `(${nhan}) chuỗi bọc giống hệt từng lớp + hàm gốc` + (lech.length ? ': lệch ' + lech.map(t => t + '\n   mốc ' + m.kq[t].join('\n        ') + '\n   nay ' + n.kq[t].join('\n        ')).join('\n') : ''));
      chk(JSON.stringify(m.canh) === JSON.stringify(n.canh), `(${nhan}) cùng cảnh báo «bỏ qua phần gắn» (${n.canh.length})` + (n.canh.length ? ': ' + n.canh.join(' | ') : ''));
      chk(JSON.stringify(m.loi.sort()) === JSON.stringify(n.loi.sort()), `(${nhan}) cùng lỗi JS (${n.loi.length})` + (JSON.stringify(m.loi) === JSON.stringify(n.loi) ? '' : ': mốc ' + m.loi.join(' | ') + ' || nay ' + n.loi.join(' | ')));
      if (process.env.E2E_DEBUG) for (const t of bocN) console.log(t, '\n  ' + n.kq[t].join('\n  '));
      if (nhan[0] === 'A') console.log('   hàm bị bọc: ' + bocN.map(t => t + '×' + (n.kq[t].length - 1)).join(', '));
      if (nhan[0] === 'A') goc = n;
    }
    // TỰ KIỂM (kiểm toán lượt 07): cài lỗi vào bản sao bộ hiện tại — hỏng HÀM GỐC của 2 lớp Engine 2 từng bị sót, gỡ một lớp
    // trợ lý, gán đè một hàm sau Engine 2 → công cụ PHẢI báo đúng các tên đó (không thì chính công cụ đang mù).
    const sua = await banSua(thuMuc.nay, d => {
      const h = path.join(d, 'posgieo.html');
      chenDauHam(h, '_continueAfterPrepCount', "throw Error('tu-kiem-goc');");
      chenDauHam(h, 'computeShiftInventoryCountLinesPOS', "throw Error('tu-kiem-goc');");
      let t = fs.readFileSync(h, 'utf8'); const bo = "boc('cartClear', () => assistResetSession());";
      if (!t.includes(bo)) throw new Error('tự kiểm: không thấy lớp trợ lý cartClear'); t = t.replace(bo, '/*tu-kiem*/');
      const e2 = '<script src="gieo_engine2_pos_v1.js"></script>'; if (!t.includes(e2)) throw new Error('tự kiểm: không thấy thẻ Engine 2');
      fs.writeFileSync(h, t.replace(e2, e2 + '\n<script>window.updCoTotal = function(){};</script>'));
    });
    try {
      const h = await chup(b, sua.base, ten, false, pt);
      const lech = ten.filter(t => JSON.stringify(goc.kq[t] || null) !== JSON.stringify(h.kq[t] || null)).sort();
      const can = ['_continueAfterPrepCount', 'cartClear', 'computeShiftInventoryCountLinesPOS', 'updCoTotal'];
      chk(JSON.stringify(lech) === JSON.stringify(can), '(tự kiểm) bản cài lỗi → báo lệch ĐÚNG ' + can.join(', ') + ' (hỏng hàm gốc 2 lớp Engine 2 / gỡ lớp trợ lý / gán đè)' + (JSON.stringify(lech) === JSON.stringify(can) ? '' : ': thấy ' + lech.join(', ')));
    } finally { sua.dong(); }
  } finally {
    await b.close(); hb.dong();
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
