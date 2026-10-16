// SINH lai_lo.v{N}.js — bộ tính LÃI / LỖ TỪNG NGÀY của quán Gieo, dùng chung cho manage.html (quanlygieo giữ bản gốc).
//   node tools/tao_lai_lo.js            → ghi file
//   node tools/tao_lai_lo.js --check    → chỉ so (test lai_lo.test.js gọi): file đã sinh còn khớp quanlygieo.html không
//
// CÁCH LÀM: chép NGUYÊN VĂN từ quanlygieo.html mọi hàm / biến cấp cao mà computeDailyPLRange (lãi/lỗ từng ngày — giá vốn
// theo công thức + lịch sử giá, chi phí, lương, khấu hao, hao hụt) cần tới, theo đúng thứ tự trong file gốc → số tính ra
// Y HỆT quanlygieo, không có công thức thứ hai. Chỉ thay những chỗ gắn với app:
//   · fstore / db           → lớp bọc đổi tên bảng theo quán (GieoData.fsPath / rtPath của data_access.v7.js);
//   · QL_VIEW / QL_ALL      → quán đang tính; plLuuTomTat → bỏ (manage tự ghi pl_days);
//   · loadExpensesAll       → chỉ đọc chi phí CHẠM khoảng ngày đang tính (cùng kết quả: mỗi ngày chỉ dùng khoản chạm ngày đó);
//   · 3 bảng lịch sử (giá, định mức món, công thức mẻ — CHỈ THÊM, không bao giờ sửa / xoá) → giữ trong máy, mỗi lần
//     chỉ đọc mốc mới (createdAt > mốc lớn nhất đã có).
// quanlygieo đổi một hàm trong nhóm này → --check báo lệch → tăng VERSION (file đã deploy là immutable), sinh lại,
// sửa manage.html trỏ tới bản mới.
'use strict';
const fs = require('fs'), path = require('path');
const acorn = require('acorn');
const walk = require('acorn-walk');
const VERSION = 1;
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'lai_lo.v' + VERSION + '.js');
const ROOTS = ['computeDailyPLRange', 'plTomTatNgay', 'plBreakEven', 'plSumDays', 'configForDate', 'qlAllNapChung', 'memoDropAll',
  'loadInventoryItems', 'loadPrepItems', 'loadCogsMaps', 'loadConfig'];
const EXCLUDE = new Set(['fstore', 'db', 'QL_VIEW_KEY', 'QL_VIEW', 'QL_ALL', 'plLuuTomTat', 'loadExpensesAll']);

function build(){
  const html = fs.readFileSync(path.join(ROOT, 'quanlygieo.html'), 'utf8');
  const re = /<script>([\s\S]*?)<\/script>/g; let m, order = 0; const tops = {};
  while((m = re.exec(html))){
    const src = m[1], ast = acorn.parse(src, { ecmaVersion: 'latest' });
    for(const st of ast.body){
      if(st.type === 'FunctionDeclaration') tops[st.id.name] = { node: st, text: src.slice(st.start, st.end), order: order++ };
      else if(st.type === 'VariableDeclaration'){
        if(st.declarations.length !== 1) { for(const d of st.declarations) if(d.id.type === 'Identifier') tops[d.id.name] = { node: d, text: st.kind + ' ' + src.slice(d.start, d.end) + ';', order: order++ }; }
        else { const d = st.declarations[0]; if(d.id.type === 'Identifier') tops[d.id.name] = { node: d, text: src.slice(st.start, st.end), order: order++ }; }
      }
    }
  }
  const refs = node => { const s = new Set(); walk.full(node, n => { if(n.type === 'Identifier') s.add(n.name); }); return s; };
  const seen = new Set(), q = ROOTS.slice();
  while(q.length){ const k = q.pop(); if(seen.has(k) || !tops[k]) continue; if(!tops[k]) throw new Error('Không thấy ' + k); seen.add(k); if(EXCLUDE.has(k)) continue; for(const r of refs(tops[k].node)) if(tops[r] && !seen.has(r)) q.push(r); }
  ROOTS.forEach(r => { if(!tops[r]) throw new Error('quanlygieo.html không còn hàm ' + r); });
  const names = [...seen].filter(k => !EXCLUDE.has(k)).sort((a, b) => tops[a].order - tops[b].order);
  const body = names.map(k => tops[k].text).join('\n');
  return `// lai_lo.v${VERSION}.js — SINH TỰ ĐỘNG bằng node tools/tao_lai_lo.js từ quanlygieo.html. KHÔNG SỬA TAY (sửa quanlygieo rồi sinh lại,
// đã deploy thì tăng phiên bản). Bộ tính lãi / lỗ từng ngày của quán Gieo — chép nguyên văn ${names.length} hàm / biến của quanlygieo,
// manage.html gọi để tự tính (không phải chờ mở quanlygieo). Cần data_access.v7.js (GieoData.fsPath / rtPath) nạp trước.
(function(root){
// ---- chỗ gắn với app (do tools/tao_lai_lo.js thêm) ----
let _quan = 'gg01', _fs = null, _rt = null, _khoang = null;
let QL_VIEW = 'gg01', QL_ALL = false;
const GieoData = { storeId: () => _quan };
function plLuuTomTat(){}
const _DA = () => { const g = root.GieoData; if(!g || !g.fsPath) throw new Error('lai_lo: cần data_access.v7.js'); return g; };
const _LS_HIST = { price_history_gieogieo: 1, recipe_history_gieogieo: 1, prep_recipe_history_gieogieo: 1 };
function _histColl(name){
  // Bảng CHỈ THÊM: giữ trong máy (localStorage), mỗi lần chỉ đọc mốc createdAt mới hơn mốc lớn nhất đã có.
  const real = _fs.collection(_DA().fsPath(name, _quan)), key = 'lai_lo_hist_v1_' + name;
  return { where: (...a) => real.where(...a), orderBy: (...a) => real.orderBy(...a), doc: (...a) => real.doc(...a), add: (...a) => real.add(...a),
    get: async () => {
      let c = null; try{ c = JSON.parse(root.localStorage.getItem(key) || 'null'); }catch(e){ c = null; }
      if(!c || !c.docs) c = { docs: {}, max: '' };
      const snap = c.max ? await real.where('createdAt', '>', c.max).get() : await real.get();
      snap.docs.forEach(d => { const x = d.data(); c.docs[d.id] = x; if(typeof x.createdAt === 'string' && x.createdAt > c.max) c.max = x.createdAt; });
      try{ root.localStorage.setItem(key, JSON.stringify(c)); }catch(e){}
      const docs = Object.keys(c.docs).map(id => ({ id, data: () => JSON.parse(JSON.stringify(c.docs[id])) }));
      return { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f) };
    } };
}
const fstore = {
  collection: name => _LS_HIST[name] ? _histColl(name) : _fs.collection(_DA().fsPath(name, _quan)),
  doc: p => _fs.doc(_DA().fsPath(p, _quan)),
  batch: () => _fs.batch()
};
const db = { ref: p => _rt.ref(_DA().rtPath(p, _quan)) };
// Chi phí: chỉ khoản CHẠM khoảng đang tính (một lần: date / startDate trong khoảng; theo kỳ: endDate ≥ đầu khoảng).
async function loadExpensesAll(){
  const col = fstore.collection('expenses_gieogieo'), [a, b] = _khoang;
  const [s1, s2, s3] = await Promise.all([col.where('date', '>=', a).where('date', '<=', b).get(), col.where('startDate', '>=', a).where('startDate', '<=', b).get(), col.where('endDate', '>=', a).get()]);
  const m = new Map(); [s1, s2, s3].forEach(s => s.docs.forEach(d => m.set(d.id, { id: d.id, ...d.data() })));
  return [...m.values()];
}
// ---- chép nguyên văn từ quanlygieo.html ----
${body}
// ---- API ----
let _khoa = Promise.resolve(), _napChungLuc = 0, _quanTruoc = null;
const _dmQuan = {};   // danh mục NL / BTP + giá vốn nhập tay của từng quán, nhớ 10 phút (đổi quán không phải đọc lại)
// Lãi / lỗ từng ngày [from, to] ('YYYY-MM-DD') của quán storeId. Trả { days (computeDayPL), tomTat (y bản quanlygieo ghi pl_days) }.
// Chạy TUẦN TỰ (trạng thái dùng chung như chế độ Xem tất cả của quanlygieo). Dữ liệu dùng chung nạp lại sau 10 phút.
function tinh(opts){
  const p = _khoa.then(async () => {
    _fs = opts.fstore; _rt = opts.db; _quan = opts.storeId; QL_VIEW = opts.storeId; _khoang = [opts.from, opts.to];
    if(Date.now() - _napChungLuc > 600000){ _qlAllChungDaNap = false; _napChungLuc = Date.now(); }
    await qlAllNapChung();
    if(_quanTruoc !== _quan){ memoDropAll(); _costMemo = {}; _quanTruoc = _quan; }
    const dm = _dmQuan[_quan];
    if(dm && Date.now() - dm.at < 600000){ INVENTORY_ITEMS = dm.items; PREP_ITEMS = dm.preps; COGS_TOGO = dm.cogs; }
    else {
      memoDropAll(); _costMemo = {};
      const [items, preps] = await Promise.all([loadInventoryItems(), loadPrepItems(), loadCogsMaps(), loadConfig().catch(() => null)]);
      INVENTORY_ITEMS = items; PREP_ITEMS = preps;
      _dmQuan[_quan] = { at: Date.now(), items, preps, cogs: COGS_TOGO };
    }
    const r = await computeDailyPLRange(new Date(opts.from + 'T00:00:00'), new Date(opts.to + 'T00:00:00'));
    const tomTat = r.days.map(d => plTomTatNgay(d, plBreakEven(d, 1 - ((configForDate(d.date).targets.cogsPct) || 0) / 100)));
    return { days: r.days, tomTat };
  });
  _khoa = p.catch(() => {});
  return p;
}
root.LaiLo = { VERSION: ${VERSION}, tinh, PL_TOM_TAT_KEYS };
})(typeof window !== 'undefined' ? window : globalThis);
`;
}
const out = build();
if(process.argv.includes('--check')){
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if(cur !== out){ console.log('LỆCH: ' + path.basename(OUT) + ' không còn khớp quanlygieo.html — chạy node tools/tao_lai_lo.js (đã deploy thì tăng VERSION)'); process.exit(1); }
  console.log('KHỚP ' + path.basename(OUT));
} else { fs.writeFileSync(OUT, out); console.log('✅ ' + path.basename(OUT) + ' (' + out.split('\n').length + ' dòng)'); }
