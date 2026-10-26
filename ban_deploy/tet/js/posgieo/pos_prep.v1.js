// Tách từ posgieo.html dòng 7638–11104 (tools/tach_posgieo/chuyen.js, 2026-10-26). ĐÃ PHÁT HÀNH thì KHÔNG sửa nội dung —
// tạo pos_prep.v2.js và trỏ HTML tới (sổ tools/js_da_phat_hanh.json). Nạp TRƯỚC <script> chính; CHỈ khai báo.
(window.PosGieoMods = window.PosGieoMods || {}).prep = 'dang';

// ============================================================
// [NEW] NẤU CHẾ BIẾN — tầng bán thành phẩm (prep_items_gieogieo)
//
// Một lần "nấu mẻ" sinh ra HAI vế, cố ý ghi vào HAI nơi khác nhau:
//   1. Vế TIÊU HAO nguyên liệu thô → ghi vào stock_transactions_gieogieo như
//      mọi giao dịch kho khác (type CONSUMPTION). Nhờ vậy tồn nguyên liệu thô
//      và mọi báo cáo kho hiện có tự đúng, không phải sửa gì.
//   2. Vế SINH RA bán thành phẩm → ghi vào collection RIÊNG
//      prep_transactions_gieogieo + cộng prep_items_gieogieo.currentStock.
//
// Vì sao tách vế 2 ra collection riêng thay vì nhét chung 1 ledger: mọi chỗ
// đang đọc stock_transactions_gieogieo đều ngầm giả định `itemId` trỏ tới
// inventory_items_gieogieo (màn Lịch sử bên Management, các hàm tổng hợp...).
// Nhét dòng có `prepId` vào đó sẽ làm chúng hiển thị "(nguyên liệu đã xoá)"
// hoặc tính sai âm thầm — kiểu lỗi khó phát hiện nhất. Đánh đổi: ledger bị
// tách làm hai, muốn xem toàn cảnh phải đọc 2 collection.
// ============================================================
let PREP_ITEMS_CACHE_POS = [];

// [NGỪNG SỬ DỤNG] PREP_ITEMS_CACHE_POS giữ ĐỦ mọi BTP, kể cả Quản lý đã "Ngừng sử dụng" (active === false): engine dò
// "mã này là BTP?" qua getPreps (_ueIsPrepId) và mọi màn tra lô đang mở / đối chiếu / hao hụt tìm BTP theo mã — thiếu là
// trừ kho nhầm sang nguyên liệu. Chỉ chỗ BẮT ĐẦU NẤU MẺ MỚI (chọn món, gợi ý nấu) bỏ BTP ngừng dùng — trừ món đang chọn dở.
function POS_PREP_CON_DUNG(dangChon) { return PREP_ITEMS_CACHE_POS.filter(x => x.active !== false || (dangChon && x.id === dangChon)); }

// [GĐ2] ratio thay cho batches: cho nấu 0,4 mẻ / 0,75 mẻ... Định lượng nguyên liệu
// giữ NGUYÊN SỐ LẺ (quán có cân tiểu ly), không làm tròn — làm tròn sẽ sai đáng kể
// với nguyên liệu định lượng nhỏ khi nấu mẻ nhỏ.
let prepBatchState = { prepId: null, ratio: 1, actualYield: 0 };

let PREP_BATCHES_CACHE_POS = [];

// [MỚI] "Lô đang còn" mặc định chỉ hiện 5 lô hoàn thành gần nhất — quán nấu nhiều
// BTP dồn tới 50 lô là một danh sách dài ngoằn phải cuộn qua hết mới tới được ô
// chọn thành phẩm cần nấu. Bấm "Xem thêm" mới bung hết. Reset về false mỗi lần mở
// lại màn (openPrepBatchScreen) — không cần nhớ qua phiên khác.
let _prepActiveListExpanded = false;

const PREP_ACTIVE_PREVIEW = 2;

// Nút góc trên màn Nấu chế biến. Ở danh sách chính là X về tab Kho; ở mọi trang con
// (tem, sửa, in, công thức, hoàn thành, huỷ, cân...) đổi thành ← về lại danh sách chính,
// để bấm nhầm không văng ra tận tab Kho. `fn` là đúng thao tác "quay lại" của trang đó.
let _prepBackFn = null;

function prepSetBack(fn) {
  _prepBackFn = fn || null;
  const btn = document.getElementById('prepHeadBtn');
  if (!btn) return;
  btn.setAttribute('aria-label', fn ? 'Quay lại' : 'Đóng');
  btn.innerHTML = fn
    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
}

function prepHeadBtnClick() {
  const fn = _prepBackFn;
  if (fn) fn(); else showScreen('khoScreen');
}

function togglePrepActiveList() { _prepActiveListExpanded = !_prepActiveListExpanded; renderPrepBatchForm(); }

// Thời gian chế biến thật (từ lúc bắt đầu tới lúc hoàn thành) — hiển thị ở "Lô đang
// còn" để nhân viên biết mẻ đó nấu mất bao lâu, không chỉ mỗi mốc giờ hoàn thành.
function fmtPrepCookDuration(startedAtISO, finishedAtISO) {
  if (!startedAtISO || !finishedAtISO) return '';
  const ms = vnDate(finishedAtISO) - vnDate(startedAtISO);
  if (!(ms > 0)) return '';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}p` : `${m} phút`;
}

// Hạn dùng tính theo ĐỒNG HỒ THẬT, không dính gì tới ngày lịch:
//   hours    → nấu xong + N giờ
//   endOfDay → hết hạn khi ĐÓNG NGÀY (sự kiện có thật), trả null ở đây
//   none     → không hạn
function computePrepExpiry(prepItem, finishedAtISO) {
  const t = prepItem && prepItem.shelfLifeType;
  if (t === 'hours') {
    const h = Number(prepItem.shelfLifeHours) || 0;
    if (h > 0) return vnDate(vnDate(finishedAtISO).getTime() + h * 3600000).toISOString();
  }
  return null; // endOfDay / none / chưa cấu hình → không có mốc giờ cụ thể
}

function prepExpiryLabel(batch) {
  if (batch.shelfLifeType === 'endOfDay') return 'Cuối ca hôm nay';
  if (batch.shelfLifeType === 'none' || !batch.expiresAt) return 'Không hạn';
  const d = vnDate(batch.expiresAt);
  const p2 = n => String(n).padStart(2, '0');
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

function fmtDateTimeShort(iso) {
  const d = vnDate(iso);
  const p2 = n => String(n).padStart(2, '0');
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

// ── GỢI Ý MẺ NẤU THEO NHỊP BÁN (dùng chung POS + quanlygieo — 2 file độc lập nên chép
// y hệt, sửa 1 bên nhớ sửa bên kia). Hàm thuần, không đọc/ghi gì.
//   · Bản tổng hợp ngày (ledger_day_summaries_gieogieo/prep_{ngày}):
//       { h:[24] tổng lượng BTP dùng theo giờ, prep:[{p, c:dùng, w:đổ, pr:nấu, sp:đổ vì hỏng}] }
//   · Nhịp bán trong ngày: rem[phút] = tỷ lệ lượng dùng CÒN LẠI sau phút đó (trung bình
//     các ngày) — dùng chung mọi BTP (dữ liệu cho thấy các BTP gần như cùng nhịp).
//   · Lượng/ngày: trung vị các ngày có bán; trong ngày trộn dần với nhịp thật hôm nay.
//   · Hàng hết hạn cuối ngày: sáng nấu đủ tới 17h, chiều nấu bù khi sắp hết.
//     Hàng để nhiều ngày: nấu khi sắp hết, không nấu nhiều hơn lượng bán kịp trong hạn.
//   · Tự ngừng gợi ý khi phần còn lại của ngày < 8% (không cài giờ).
const PREP_SUG = { s:0.10, morningUntilMin:17*60, stopShare:0.08, bufMin:30, bufMinMulti:120, step:0.25, minDays:7, maxRatio:10 };

function prepSugProfile(sums){
  const acc = new Array(1441).fill(0); let n = 0;
  (sums||[]).forEach(s=>{
    const h = (s && s.h) || []; const T = h.reduce((a,b)=>a+Math.max(0,Number(b)||0),0);
    if(!(T > 0)) return; n++;
    // phần còn lại sau phút m: giờ sau nguyên vẹn + phần chưa qua của giờ hiện tại
    const after = new Array(25).fill(0);
    for(let H=23; H>=0; H--) after[H] = after[H+1] + Math.max(0,Number(h[H])||0);
    for(let m=0; m<=1440; m++){
      const H = Math.min(23, Math.floor(m/60)), f = m>=1440 ? 1 : (m%60)/60;
      acc[m] += (after[H+1] + Math.max(0,Number(h[H])||0)*(1-f)) / T;
    }
  });
  return n ? { rem: acc.map(x=>x/n), days: n } : null;
}

function prepSugDemand(sums, prepId){
  const v = [];
  (sums||[]).forEach(s=>{
    const T = ((s && s.h) || []).reduce((a,b)=>a+Math.max(0,Number(b)||0),0);
    if(!(T > 0)) return;           // ngày quán không bán gì → bỏ, không kéo trung vị xuống 0
    const r = (s.prep||[]).find(x=>x.p===prepId);
    v.push(Math.max(0, Number(r && r.c) || 0));
  });
  if(!v.length) return { d:0, n:0 };
  v.sort((a,b)=>a-b);
  const mid = Math.floor(v.length/2);
  return { d: v.length%2 ? v[mid] : (v[mid-1]+v[mid])/2, n: v.length };
}

// Số mẻ hợp lệ theo NL đếm được: A (quét mã, 1 tem = 1 cái) và B (đơn vị "cái", công
// thức dùng số NGUYÊN) phải ra số cái nguyên; C (công thức đã lẻ sẵn) không ràng buộc.
function prepSugRatioOk(prep, r, khoItems, isAtomic){
  const per = {};
  (prep.batchInputs||[]).forEach(x=>{ if(x.itemId && Number(x.qty)>0) per[x.itemId]=(per[x.itemId]||0)+Number(x.qty); });
  for(const [id, q] of Object.entries(per)){
    const it = (khoItems||[]).find(i=>i.id===id);
    if(!it || it.stockManaged===false) continue;
    const r2 = x => Math.round(x*100)/100;
    // [NẤU NGUYÊN GÓI] NL bật "Nấu dùng nguyên gói": số mẻ phải ra tròn gói (chép y hệt ở 2 app).
    const pkNg = it.prepWholePack===true ? (it.packagingUnits||[]).find(x=>x.name===it.countUnitName) : null;
    const goiNg = pkNg && Number(pkNg.baseQty)>1 ? Number(pkNg.baseQty) : 0;
    if(goiNg){ if(!Number.isInteger(r2(q*r/goiNg))) return false; continue; }
    const u = String(it.unit||'').trim().toLowerCase();
    if(u!=='cái' && u!=='miếng') continue;
    const need = isAtomic(it) || Number.isInteger(r2(q));
    if(need && !Number.isInteger(r2(q*r))) return false;
  }
  return true;
}

function prepSugPickRatio(prep, raw, dir, khoItems, isAtomic){
  const st = PREP_SUG.step, max = PREP_SUG.maxRatio;
  if(dir === 'up'){
    for(let k=Math.max(1, Math.ceil(raw/st - 1e-9)); k*st<=max; k++) if(prepSugRatioOk(prep, k*st, khoItems, isAtomic)) return k*st;
    return null;
  }
  for(let k=Math.floor(raw/st + 1e-9); k>=1; k--) if(prepSugRatioOk(prep, k*st, khoItems, isAtomic)) return k*st;
  return null;
}

// o: { prep, rem, dest, nDays, nowMin, used, stock, pending, cookedToday, leadMin, khoItems, isAtomic }
function prepSugEvaluate(o){
  const P = PREP_SUG, prep = o.prep, Y = Number(prep.batchYield)||0;
  if(!(Y > 0) || !o.rem || o.nDays < P.minDays || !(o.dest > 0)) return null;
  const rem = o.rem, at = m => rem[Math.max(0, Math.min(1440, Math.round(m)))];
  const now = o.nowMin, L = o.leadMin;
  if(at(now + L) < P.stopShare) return null;                        // cuối ngày: thôi gợi ý
  const done = 1 - at(now);
  const pace = done > 0.1 ? (o.used||0)/done : o.dest;
  const w = Math.min(1, done/0.5);
  const Dt = w*pace + (1-w)*o.dest;                                 // lượng cả ngày ước theo nhịp hôm nay
  const avail = Math.max(0, o.stock||0) + Math.max(0, o.pending||0);
  const eod = prep.shelfLifeType === 'endOfDay';
  // Cần đủ tới lúc mẻ mới kịp xong + đệm. Hàng hết hạn cuối ngày đệm ngắn (nấu sớm là
  // dễ đổ); hàng để nhiều ngày đệm dài (dư không mất gì, thiếu mới mất khách).
  const soon = Dt*(at(now) - at(now + L + (eod ? P.bufMin : P.bufMinMulti)));
  if(avail >= soon) return null;
  const coverLead = Math.max(0, avail - Dt*(at(now) - at(now + L)));  // phần tồn còn lại sau thời gian nấu
  let need, kind, capped = false, ratio;
  if(eod){
    if(!o.cookedToday){ kind = 'morning';
      need = Dt*(at(now) - at(Math.max(P.morningUntilMin, now + L + P.bufMin)))*(1+P.s) - avail;
    } else { kind = 'topup'; need = Dt*at(now + L)*(1+P.s) - coverLead; }
    ratio = prepSugPickRatio(prep, Math.max(0.01, need)/Y, 'up', o.khoItems, o.isAtomic);
  } else {
    kind = 'restock';
    const shelfDays = prep.shelfLifeType === 'hours' ? Math.max(0.5, (Number(prep.shelfLifeHours)||0)/24) : 7;
    need = Dt*(at(now + L) + 1)*(1+P.s) - coverLead;                 // hết hôm nay + thêm 1 ngày
    const capRatio = (o.dest*shelfDays)/Y;                           // không hơn lượng bán kịp trong hạn
    ratio = prepSugPickRatio(prep, Math.max(0.01, need)/Y, 'up', o.khoItems, o.isAtomic);
    if(ratio != null && ratio > capRatio){ const dn = prepSugPickRatio(prep, capRatio, 'down', o.khoItems, o.isAtomic); if(dn != null){ ratio = dn; capped = true; } }
  }
  if(ratio == null) return null;
  let runout = null;                                                 // giờ dự kiến hết
  for(let m=now; m<=1440; m+=5){ if(Dt*(at(now)-at(m)) > avail){ runout = m; break; } }
  return { ratio, qty: ratio*Y, kind, capped, runoutMin: runout, dayEst: Dt, avail };
}

// ── Lịch sử cho gợi ý mẻ: bản tổng hợp ngày (dùng CHUNG collection với loại stock_
// bên quanlygieo). Chỉ ngày đã quá 3 ngày (bill không còn sửa/huỷ). Mỗi máy đọc tối đa
// 14 bản mỗi ngày, rồi lưu trong máy; ngày nào chưa có bản thì máy cần trước tự dựng 1
// lần từ sổ BTP và lưu lại cho các máy sau. RT KHÔNG dùng để lưu lịch sử.
const PREP_DAY_SUM_COLL = 'ledger_day_summaries_gieogieo';

const PREP_DAY_SUM_V = 1;

const PREP_SUG_BUFFER_DAYS = 3;

const PREP_SUG_HIST_DAYS = 14;

const PREP_SPOIL_RE = /chua|hôi|hỏng|mốc|thiu|ôi|nhớt/i;

function prepDaySumFromRows(dateKey, rows) {
  const h = new Array(24).fill(0), per = {};
  let maxCreatedAt = '';
  (rows || []).forEach(t => {
    if (typeof t.createdAt === 'string' && t.createdAt > maxCreatedAt) maxCreatedAt = t.createdAt;
    if (!t.prepId) return;
    const x = per[t.prepId] || (per[t.prepId] = { p: t.prepId, c: 0, w: 0, pr: 0, sp: 0 });
    const q = Number(t.qty) || 0, note = String(t.reason || t.note || '');
    if (t.type === 'CONSUMPTION') {
      x.c += -q;
      const d = vnDate(t.createdAt); if (!isNaN(d)) h[d.getHours()] += -q;
    } else if (t.type === 'ADJUSTMENT' && /XOÁ ĐƠN/.test(note)) x.c -= q;
    else if (t.type === 'WASTE' && q < 0) { x.w += -q; if (PREP_SPOIL_RE.test(note)) x.sp += -q; }
    else if (t.type === 'PRODUCTION' && q > 0) x.pr += q;
  });
  const r1 = v => Math.round(v * 10) / 10;
  return { v: PREP_DAY_SUM_V, kind: 'prep', date: dateKey, maxCreatedAt, rowCount: (rows || []).length,
    h: h.map(r1), prep: Object.values(per).map(x => ({ p: x.p, c: r1(x.c), w: r1(x.w), pr: r1(x.pr), sp: r1(x.sp) })) };
}

function _prepSugShift(k, n) { const d = vnDate(k + 'T00:00:00'); d.setDate(d.getDate() + n); return posDateKey(d); }

const _prepSug = { histDay: '', sums: [], hist: null, usedDay: '', used: {}, usedReady: false, list: [], busy: false, lastAt: 0, again: false,
  rt: {}, rtAt: 0, touched: new Set(), full: true };

async function prepSugLoadHistory() {
  const today = posDateKey();
  if (_prepSug.histDay === today && _prepSug.hist) return;
  try {
    const c = JSON.parse(localStorage.getItem('prepSugHist_v1') || 'null');
    if (c && c.day === today && Array.isArray(c.sums)) { _prepSug.sums = c.sums; _prepSug.hist = prepSugProfile(c.sums); _prepSug.histDay = today; return; }
  } catch (e) {}
  const end = _prepSugShift(today, -(PREP_SUG_BUFFER_DAYS + 1)), start = _prepSugShift(end, -(PREP_SUG_HIST_DAYS - 1));
  const FP = firebase.firestore.FieldPath.documentId();
  const snap = await fstore.collection(PREP_DAY_SUM_COLL).where(FP, '>=', 'prep_' + start).where(FP, '<=', 'prep_' + end).get();
  const have = {};
  snap.forEach(d => { const x = d.data(); if (x && x.v === PREP_DAY_SUM_V && x.date) have[x.date] = x; });
  const segs = [];
  for (let k = start; k <= end; k = _prepSugShift(k, 1)) {
    if (have[k]) continue;
    const last = segs[segs.length - 1];
    if (last && last.b === _prepSugShift(k, -1)) last.b = k; else segs.push({ a: k, b: k });
  }
  const builtAt = vnDate().toISOString();
  for (const { a, b } of segs) {
    const rows = (await fstore.collection('prep_transactions_gieogieo').where('businessDate', '>=', a).where('businessDate', '<=', b).get()).docs.map(d => d.data());
    const byDay = {};
    rows.forEach(t => { if (t.businessDate) (byDay[t.businessDate] = byDay[t.businessDate] || []).push(t); });
    for (let k = a; k <= b; k = _prepSugShift(k, 1)) {
      const sum = { ...prepDaySumFromRows(k, byDay[k] || []), builtAt };
      have[k] = sum;
      fstore.collection(PREP_DAY_SUM_COLL).doc('prep_' + k).set(sum).catch(err => console.warn('[Gợi ý mẻ] không lưu được tổng hợp ngày', k, err));
    }
  }
  const sums = Object.values(have).sort((x, y) => String(x.date).localeCompare(String(y.date)));
  _prepSug.sums = sums; _prepSug.hist = prepSugProfile(sums); _prepSug.histDay = today;
  try { localStorage.setItem('prepSugHist_v1', JSON.stringify({ day: today, sums })); } catch (e) {}
}

// Lượng BTP đã dùng HÔM NAY — tính từ bill hôm nay POS đang giữ sẵn (không đọc thêm),
// sau đó cộng dồn theo từng lượt bán.
async function _prepSugInitUsed() {
  const today = posDateKey(), display = posDateKeyToDisplay(today);
  const [recipes, toppingRecipes, packagingPresets, packagingItemOverrides, baggingRules, pkgRulesPack, baggingTable] = await Promise.all([ensureRecipesLoadedPOS(), ensureToppingRecipesLoadedPOS(), ensurePackagingPresetsLoadedPOS(), ensurePackagingItemOverridesLoadedPOS(), ensurePackagingBaggingRulesLoadedPOS(), ensurePackagingRulesLoadedPOS(), ensurePackagingBaggingTableLoadedPOS()]);
  const used = {};
  (orders || []).filter(o => o && o.date === display && !o.backfilled).forEach(o => {
    try {
      const { prepAgg } = computeConsumptionForOrder(o, recipes, toppingRecipes, packagingPresets, packagingItemOverrides, baggingRules, pkgRulesPack.rules, pkgRulesPack.config, baggingTable);
      Object.entries(prepAgg || {}).forEach(([id, q]) => { used[id] = (used[id] || 0) + Math.abs(Number(q) || 0); });
    } catch (e) {}
  });
  _prepSug.used = used; _prepSug.usedDay = today; _prepSug.usedReady = true;
}

function prepSugOnUsage(prepAgg) {
  try {
    if (_prepSug.usedReady && _prepSug.usedDay === posDateKey())
      Object.entries(prepAgg || {}).forEach(([id, q]) => { _prepSug.used[id] = (_prepSug.used[id] || 0) + Math.abs(Number(q) || 0); });
    Object.keys(prepAgg || {}).forEach(id => _prepSug.touched.add(id));
    if (Object.keys(prepAgg || {}).length) prepSugRefresh(false);
  } catch (e) { console.warn('[Gợi ý mẻ] ghi lượt dùng lỗi', e); }
}

// Thời gian nấu thực tế (bắt đầu → xong) — học từ các lô đang còn mỗi lần nạp màn Chế biến.
function _prepSugLearnLead(batches) {
  try {
    const m = JSON.parse(localStorage.getItem('prepSugLead_v1') || '{}');
    const by = {};
    (batches || []).forEach(b => {
      const a = Date.parse(b.startedAt || ''), f = Date.parse(b.finishedAt || '');
      if (a && f && f > a) (by[b.prepId] = by[b.prepId] || []).push((f - a) / 60000);
    });
    Object.entries(by).forEach(([id, v]) => { v.sort((x, y) => x - y); m[id] = Math.round(Math.min(120, Math.max(10, v[Math.floor(v.length / 2)]))); });
    localStorage.setItem('prepSugLead_v1', JSON.stringify(m));
  } catch (e) {}
}

function _prepSugLead(prep) {
  try { const m = JSON.parse(localStorage.getItem('prepSugLead_v1') || '{}'); if (m[prep.id]) return m[prep.id]; } catch (e) {}
  return Math.max(30, (Number(prep.prepTimeMinutes) || 0) + 20);
}

// Tính lại danh sách "Nên nấu". Gọi sau lượt bán có BTP, khi mở màn Chế biến, khi bắt đầu/
// xong mẻ. KHÔNG hẹn giờ quét. Chạy nền, lỗi thì bỏ qua — không bao giờ chặn bán hàng.
// full=false (sau lượt bán): chỉ đọc lại RT của đúng BTP vừa bị trừ; các BTP khác dùng số
// đã đọc trước (tồn của chúng không đổi vì không bán). full (mặc định): đọc lại tất cả.
function prepSugRefresh(full) {
  if (full !== false) _prepSug.full = true;
  if (_prepSug.busy) { _prepSug.again = true; return; }
  _prepSug.busy = true;
  setTimeout(() => { _prepSugRefreshImpl().catch(err => console.warn('[Gợi ý mẻ] lỗi', err))
    .finally(() => { _prepSug.busy = false; if (_prepSug.again) { _prepSug.again = false; prepSugRefresh(false); } }); }, 1500);
}

async function _prepSugRefreshImpl() {
  if (!fstore || !db) return;
  await prepSugLoadHistory();
  if (!_prepSug.hist) { _prepSug.list = []; renderFifoAlertBar(); return; }
  if (!_prepSug.usedReady || _prepSug.usedDay !== posDateKey()) await _prepSugInitUsed();
  if (!PREP_ITEMS_CACHE_POS.length) {
    const ps = await fstore.collection('prep_items_gieogieo').get();
    PREP_ITEMS_CACHE_POS = ps.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''), 'vi'));
  }
  if (typeof ensureKhoItemsPOS === 'function') await ensureKhoItemsPOS().catch(() => {});
  const now = vnDate(), nowMin = now.getHours() * 60 + now.getMinutes();
  const dayStart = vnDate(now); dayStart.setHours(0, 0, 0, 0);
  const found = [];
  const full = _prepSug.full || Date.now() - _prepSug.rtAt > 10 * 60000 || vnDate(_prepSug.rtAt).getDate() !== now.getDate();
  const touched = _prepSug.touched; _prepSug.touched = new Set(); _prepSug.full = false;
  if (full) _prepSug.rtAt = Date.now();
  for (const prep of POS_PREP_CON_DUNG()) {
    const dm = prepSugDemand(_prepSug.sums, prep.id);
    if (dm.n < PREP_SUG.minDays || !(dm.d > 0)) continue;
    if (full || touched.has(prep.id) || !_prepSug.rt[prep.id]) {
      const snap = await UnitEngine.units.ref(prep.id).once('value');   // RT: đúng vai trò "lô đang còn"
      let st = 0, ck = false;
      Object.entries(snap.val() || {}).forEach(([id, u]) => {
        if (id === '__prepLock' || !u || u.finishedDebt || u.discardPending) return;
        st += Math.max(0, Number(u.unitBase) || 0);
        if (Number(u.openedAt) >= dayStart.getTime()) ck = true;
      });
      _prepSug.rt[prep.id] = { stock: st, cooked: ck };
    }
    const { stock, cooked } = _prepSug.rt[prep.id];
    const base = { prep, rem: _prepSug.hist.rem, dest: dm.d, nDays: dm.n, nowMin, used: _prepSug.used[prep.id] || 0,
      stock, pending: 0, cookedToday: cooked, leadMin: _prepSugLead(prep), khoItems: KHO_ITEMS_CACHE, isAtomic: UnitEngine.classify.isAtomic };
    if (prepSugEvaluate(base)) found.push(base);
  }
  // Có món cần nấu mới hỏi Firestore mẻ đang nấu (thường 0–2 lô) — tránh gợi ý trùng mẻ
  // mà máy khác vừa bắt đầu.
  if (found.length) {
    const cs = await fstore.collection('prep_batches_gieogieo').where('status', '==', 'cooking').get();
    const pend = {};
    cs.forEach(d => { const b = d.data(), p = PREP_ITEMS_CACHE_POS.find(x => x.id === b.prepId);
      const q = Number(b.qtyInitial) || (Number(b.batchRatio) || 1) * (Number(p && p.batchYield) || 0);   // lô ghi số mẻ ở batchRatio
      pend[b.prepId] = (pend[b.prepId] || 0) + q; if (p) found.find(f => f.prep.id === b.prepId && (f.cookedToday = true)); });
    found.forEach(f => { f.pending = pend[f.prep.id] || 0; });
  }
  _prepSug.list = found.map(f => ({ o: f, r: prepSugEvaluate(f) })).filter(x => x.r)
    .map(({ o, r }) => ({ prepId: o.prep.id, name: o.prep.name || '', unit: o.prep.unit || '', ...r, stock: o.stock }))
    .sort((a, b) => (a.runoutMin ?? 9999) - (b.runoutMin ?? 9999));
  _prepSug.lastAt = Date.now();
  renderFifoAlertBar();
  const box = document.getElementById('prepSugCard');
  if (box) box.outerHTML = prepSugCardHTML();
}

function prepSugRefreshThrottled() {
  if (Date.now() - _prepSug.lastAt > 10 * 60000) prepSugRefresh();
}

function _prepSugTime(m) { return m == null ? '' : String(Math.floor(m / 60)).padStart(2, '0') + 'h' + String(m % 60).padStart(2, '0'); }

function prepSugLineText(x) {
  const soMe = fmtPrepQty(x.ratio) + ' mẻ', luong = fmtPrepQty(Math.round(x.qty)) + ' ' + x.unit;
  const con = 'còn ~' + fmtPrepQty(Math.round(x.stock)) + ' ' + x.unit;
  const why = x.kind === 'morning' ? 'nấu đầu ngày, đủ bán tới khoảng 17h — chiều sẽ nhắc nấu bù nếu bán chạy'
    : x.kind === 'topup' ? con + (x.runoutMin != null ? ', dự kiến hết lúc ' + _prepSugTime(x.runoutMin) : '')
    : con + (x.runoutMin != null ? ', dự kiến hết lúc ' + _prepSugTime(x.runoutMin) : '') + (x.capped ? ' · giới hạn theo lượng bán kịp trong hạn dùng' : '');
  return { title: x.name + ' — nấu ' + soMe + ' (~' + luong + ')', why };
}

function prepSugGo(prepId, ratio) {
  _fifoAlertExpanded = false; renderFifoAlertBar();
  window._prepSugPreselect = { prepId, ratio };
  openPrepBatchScreen();
}

function prepSugCardHTML() {
  const list = _prepSug.list || [];
  if (!list.length) return '<div id="prepSugCard"></div>';
  return `<div id="prepSugCard" class="wal-section" style="margin:0 0 14px;border:1.5px solid #f59e0b;background:#fffbeb;">
    <div class="wal-section-title" style="color:#92400e;">🔔 Nên nấu</div>
    ${list.map(x => { const t = prepSugLineText(x); return `<button onclick="prepSugPick('${x.prepId}',${x.ratio})" style="width:100%;text-align:left;padding:11px 12px;margin-top:6px;background:#fff;border:1.5px solid #fcd34d;border-radius:12px;font-family:'Google Sans',sans-serif;cursor:pointer;">
      <div style="font-size:14.5px;font-weight:800;color:#78350f;">${escHtmlPos(t.title)}</div>
      <div style="font-size:12px;color:#92400e;margin-top:2px;">${escHtmlPos(t.why)}</div></button>`; }).join('')}
    <div style="font-size:11px;color:#a16207;margin-top:6px;">Chỉ là gợi ý — vẫn chọn số mẻ khác được.</div>
  </div>`;
}

function prepSugPick(prepId, ratio) {
  if (!PREP_ITEMS_CACHE_POS.find(x => x.id === prepId)) return;
  prepBatchState.prepId = prepId;
  prepBatchSetRatio(ratio);
}

async function openPrepBatchScreen() {
  showScreen('prepBatchScreen');
  _prepActiveListExpanded = false;
  const box = document.getElementById('prepBatchBody');
  prepSetBack(null);
  showLoading(box);
  try {
    const [prepSnap, itemSnap] = await Promise.all([
      fstore.collection('prep_items_gieogieo').get(),
      fstore.collection('inventory_items_gieogieo').get()
    ]);
    PREP_ITEMS_CACHE_POS = prepSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''), 'vi'));
    KHO_ITEMS_CACHE = itemSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('openPrepBatchScreen load failed', err);
    box.innerHTML = `<div style="text-align:center;padding:40px;color:#e74c3c;font-size:13px;">⚠️ Không tải được danh sách chế biến<br><span style="color:#aaa;font-size:12px">${err.message || ''}</span></div>`;
    return;
  }
  if (!PREP_ITEMS_CACHE_POS.length) {
    box.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#888;"><div style="font-size:40px;margin-bottom:12px;">🥣</div><div style="font-weight:700;font-size:15px;color:var(--td);margin-bottom:8px;">Chưa có công thức chế biến nào</div><div style="font-size:13.5px;line-height:1.6;">Quản lý cần khai ở mục "Chế biến cấp 1" trước khi nhân viên báo nấu mẻ.</div></div>';
    return;
  }
  // [GĐ2] Nạp cả lô đang mở để hiện mục "Lô đang còn" + đồng hồ đếm ngược
  await loadPrepBatchesPOS();
  // [NL-RECON] Lượt chốt đã lưu xong nhưng mất mạng khi xóa khóa: dọn lại khi
  // quay vào màn nấu. Chỉ xóa khóa đúng chủ và đúng NL có trạng thái done.
  PREP_BATCHES_CACHE_POS.filter(b=>b.status==='cooking').forEach(b=>{
    const done=Object.entries(b.reconcileInputs||{}).filter(([,r])=>r.status==='done').map(([id])=>id);
    if(done.length)UnitEngine.prep.reconRelease(b.id,done).catch(err=>console.warn('Khôi phục khóa NL lỗi',err));
  });
  // [MỚI] Thư viện dụng cụ đựng + nạp trước ảnh. KHÔNG await ảnh — nút cân hiện
  // ngay, ảnh về sau; chờ ảnh ở đây là bắt bếp đứng nhìn màn trắng.
  await ensurePrepVesselsPOS();
  preloadVesselImagesPOS(PREP_ITEMS_CACHE_POS.map(x => x.id));
  const first = POS_PREP_CON_DUNG()[0] || PREP_ITEMS_CACHE_POS[0];
  prepBatchState = { prepId: first.id, ratio: 1, actualYield: Number(first.batchYield) || 0 };
  _prepSugLearnLead(PREP_BATCHES_CACHE_POS);
  const pre = window._prepSugPreselect; window._prepSugPreselect = null;
  const preP = pre && PREP_ITEMS_CACHE_POS.find(x => x.id === pre.prepId);
  if (preP) prepBatchState = { prepId: preP.id, ratio: pre.ratio, actualYield: round2((Number(preP.batchYield) || 0) * pre.ratio) };
  prepSugRefresh();

  // [MỚI] Có tiến trình quét mã dở dang được lưu tạm (xem prepStartGateScan) — khôi
  // phục đúng thành phẩm/tỷ lệ mẻ đang quét dở và mở thẳng màn quét, thay vì màn
  // chọn công thức mặc định khiến tưởng như mọi thứ đã mất.
  const savedScan = loadPrepStartScanState();
  const savedP = savedScan && PREP_ITEMS_CACHE_POS.find(x => x.id === savedScan.prepId);
  if (savedScan && savedP) {
    prepBatchState = { prepId: savedP.id, ratio: savedScan.ratio, actualYield: round2((Number(savedP.batchYield) || 0) * savedScan.ratio) };
    prepStartScanState = savedScan;
    toast('↩️ Đã khôi phục tiến trình quét mã dở dang');
    renderPrepStartScanGate();
    return;
  } else if (savedScan) {
    // Công thức đã bị xoá/tắt trong lúc bỏ dở — bỏ luôn bản lưu tạm, không có gì để khôi phục.
    clearPrepStartScanState();
  }

  renderPrepBatchForm();
}

// Nạp lô 'cooking' + 'active'. Không lấy lô đã dùng hết/bỏ — màn này chỉ phục vụ
// việc đang làm, lịch sử đầy đủ để bên Management xem.
// [KẸT Ở 'finishing'] Nạp cả lô 'finishing' (bấm Hoàn thành rồi rớt mạng/tắt app sau bước giành
// lô) để hiện nút "Tiếp tục lưu" — xem resumePrepFinish. Mọi chỗ đọc bộ nhớ này đều lọc theo
// trạng thái nên lô 'finishing' không lọt vào danh sách lô đang còn / lô để huỷ.
//
// [FIX "Bấm chế biến nhưng không hiện ô Đang chế biến"] Lỗi đọc lại danh sách này
// (permission-denied, mất mạng, index thiếu...) TRƯỚC ĐÂY chỉ console.warn rồi âm
// thầm coi như "không có lô nào đang nấu" — y hệt giao diện lúc thật sự trống,
// nhân viên không có cách nào phân biệt "chưa nấu gì" với "vừa trừ kho xong nhưng
// không đọc lại được để hiện thẻ". Giữ lại lỗi để renderPrepBatchForm() báo rõ.
let _prepBatchesLoadError = null;

async function loadPrepBatchesPOS() {
  try {
    const snap = await fstore.collection('prep_batches_gieogieo')
      .where('status', 'in', ['cooking', 'finishing', 'active']).get();
    PREP_BATCHES_CACHE_POS = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(a.finishedAt || a.startedAt || '').localeCompare(String(b.finishedAt || b.startedAt || '')));
    _prepBatchesLoadError = null;
    // [v18] Mẻ đã huỷ mà hoàn kho chưa xong (cancelSettled:false) — hiện thẻ "Hoàn tiếp". Lỗi đọc phần này không
    // được làm hỏng danh sách chính.
    try {
      const un = await fstore.collection('prep_batches_gieogieo').where('cancelSettled', '==', false).get();
      un.docs.forEach(d => { if (!PREP_BATCHES_CACHE_POS.some(x => x.id === d.id)) PREP_BATCHES_CACHE_POS.push({ id: d.id, ...d.data() }); });
    } catch (e) { console.warn('loadPrepBatchesPOS: không đọc được mẻ huỷ chưa hoàn xong', e); }
  } catch (err) {
    console.warn('loadPrepBatchesPOS lỗi:', err);
    PREP_BATCHES_CACHE_POS = [];
    _prepBatchesLoadError = err.code || err.message || 'Lỗi không rõ';
  }
}

function prepBatchSelect(prepId) {
  const p = PREP_ITEMS_CACHE_POS.find(x => x.id === prepId);
  prepBatchState.prepId = prepId;
  prepBatchState.ratio = 1;
  prepBatchState.actualYield = Number(p && p.batchYield) || 0;
  renderPrepBatchForm();
}

// Đổi TỶ LỆ MẺ → gợi ý lại sản lượng. Ghi đè ô sản lượng là CỐ Ý: nhân viên chọn
// tỷ lệ trước rồi mới cân, nên số gợi ý mới hữu ích hơn số cũ.
function prepBatchSetRatio(val) {
  const p = PREP_ITEMS_CACHE_POS.find(x => x.id === prepBatchState.prepId);
  prepBatchState.ratio = Number(val) || 0;
  prepBatchState.actualYield = round2((Number(p && p.batchYield) || 0) * prepBatchState.ratio);
  renderPrepBatchForm();
}

// Chiều NGƯỢC LẠI: nhập lượng CẦN THU → suy ra tỷ lệ mẻ. Đây là chiều nhân viên
// dùng nhiều nhất khi làm theo checklist đầu ca ("cần nấu 2.200g" → bấm 1 nút).
function prepBatchSetTargetQty(val) {
  const p = PREP_ITEMS_CACHE_POS.find(x => x.id === prepBatchState.prepId);
  const y = Number(p && p.batchYield) || 0;
  const want = Number(val) || 0;
  if (y > 0) prepBatchState.ratio = round2(want / y);
  prepBatchState.actualYield = want;
  renderPrepBatchForm();
}

function prepBatchSetYield(val) {
  prepBatchState.actualYield = Number(val) || 0; // không render lại — giữ focus khi đang gõ
}

// Làm tròn 2 chữ số chỉ để HIỂN THỊ tỷ lệ/sản lượng cho gọn. Định lượng NGUYÊN
// LIỆU thì KHÔNG làm tròn (xem renderPrepBatchForm) — quán cân bằng cân tiểu ly.
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// [FIX] Lô CHÉP đơn vị của bán thành phẩm vào lúc tạo (`unit: p.unit`). Đổi đơn vị
// BTP về sau (vd Kem phô mai từ ml sang g) thì lô cũ vẫn hiện đơn vị cũ — nhìn màn
// Quản lý báo "600 g/mẻ" mà màn POS ghi "1.000 ml" là tưởng hai app lệch nhau.
// Nguy hơn cả cái nhãn: SỐ trong lô cũ cũng đang đo bằng đơn vị cũ, mà currentStock
// thì cộng chung tất cả — nên phải nói thẳng chỗ nào đang lẫn đơn vị.
function prepUnitInfoPOS(b) {
  const p = PREP_ITEMS_CACHE_POS.find(x => x.id === b.prepId);
  const cur = (p && p.unit) || '';
  const snap = b.unit || '';
  return { unit: cur || snap, stale: !!(cur && snap && cur !== snap), oldUnit: snap };
}

function renderPrepBatchForm() {
  const box = document.getElementById('prepBatchBody');
  prepSetBack(null);
  const p = PREP_ITEMS_CACHE_POS.find(x => x.id === prepBatchState.prepId);
  if (!p) { box.innerHTML = '<div style="text-align:center;padding:40px;color:#bbb">Chọn thành phẩm</div>'; return; }
  const nameOf = id => (KHO_ITEMS_CACHE.find(x => x.id === id) || {}).name || '(nguyên liệu đã xoá)';
  const unitOf = id => (KHO_ITEMS_CACHE.find(x => x.id === id) || {}).unit || '';
  const r = prepBatchState.ratio;

  // Lô đang chế biến / còn hạn của TẤT CẢ thành phẩm (không chỉ cái đang chọn) —
  // nhân viên cần thấy toàn cảnh để biết còn gì đang trên bếp, khỏi nấu trùng.
  const cooking = PREP_BATCHES_CACHE_POS.filter(b => b.status === 'cooking' || b.status === 'finishing');
  const unsettled = PREP_BATCHES_CACHE_POS.filter(b => b.status === 'cancelled' && b.cancelSettled === false);
  const active  = PREP_BATCHES_CACHE_POS.filter(b => b.status === 'active' && Number(b.qtyRemaining) > 0);

  const ratioBtn = (label, val) => `<button onclick="prepBatchSetRatio(${val})" style="flex:1;min-width:64px;min-height:44px;padding:11px 6px;border-radius:12px;border:1.5px solid ${Math.abs(r-val)<0.001?'var(--gd)':'#e6e1d2'};background:${Math.abs(r-val)<0.001?'#FDE6EA':'#fff'};color:${Math.abs(r-val)<0.001?'var(--gd)':'#888'};font-family:'Google Sans',sans-serif;font-weight:700;font-size:13.5px;cursor:pointer;">${label}</button>`;

  box.innerHTML = `
    ${prepSugCardHTML()}
    ${_prepBatchesLoadError ? `
    <div class="wal-section" style="margin:0 0 14px;border:1.5px solid #fca5a5;background:#fee2e2;">
      <div class="wal-section-title" style="color:#b91c1c;">⚠️ Không tải được danh sách lô đang chế biến</div>
      <div style="font-size:12px;color:#991b1b;line-height:1.6;">Lỗi: ${escHtmlPos(_prepBatchesLoadError)}<br>Nếu vừa bấm "Bắt đầu chế biến" mà không thấy thẻ hiện ra ở dưới: nguyên liệu <b>có thể đã bị trừ kho rồi</b>, chỉ là màn này không đọc lại được để hiện thẻ. Đừng bấm chế biến lại — thử bấm nút tải lại ở góc trên hoặc thoát vào lại màn này trước.</div>
      <button onclick="loadPrepBatchesPOS().then(renderPrepBatchForm)" style="width:100%;margin-top:8px;padding:11px;background:#fff;color:#b91c1c;border:1.5px solid #fca5a5;border-radius:12px;font-weight:700;font-size:13px;cursor:pointer;">Tải lại</button>
    </div>` : ''}
    ${unsettled.length ? `
    <div class="wal-section" style="margin:0 0 14px;border:1.5px solid #fca5a5;background:#fef2f2;">
      <div class="wal-section-title" style="color:#b91c1c;font-size:15px;">⚠️ Mẻ đã huỷ — hoàn kho chưa xong (${unsettled.length})</div>
      ${unsettled.map(b => `
        <div style="background:#fff;border:1.5px solid #fca5a5;border-radius:18px;padding:14px;margin-top:10px;">
          <div style="font-size:18px;font-weight:800;color:#7f1d1d;">${escHtmlPos(b.prepName || '')}</div>
          <div style="font-size:12.5px;color:#991b1b;margin-top:3px;">Huỷ ${b.cancelledAt ? fmtDateTimeShort(b.cancelledAt) : ''}${b.cancelledBy ? ' · ' + escHtmlPos(b.cancelledBy) : ''}${b.cancelReason ? ' · ' + escHtmlPos(b.cancelReason) : ''}</div>
          <div style="font-size:12.5px;color:#7f1d1d;margin-top:6px;line-height:1.5;">Còn nguyên liệu / tem chưa hoàn về kho (mất mạng hoặc tắt app giữa lúc huỷ). Bấm Hoàn tiếp — làm đúng như lúc huỷ, không cần nhập lại.</div>
          <button id="prepCancelRetry_${b.id}" onclick="retryPrepCancelSettle('${b.id}')" style="width:100%;min-height:52px;margin-top:10px;background:#b91c1c;color:#fff;border:none;border-radius:99px;font-family:'Google Sans',sans-serif;font-weight:800;font-size:15.5px;cursor:pointer;">Hoàn tiếp</button>
        </div>`).join('')}
    </div>` : ''}

    ${cooking.length ? `
    <div class="wal-section" style="margin:0 0 14px;border:1.5px solid #fcd34d;background:#fffbeb;">
      <div class="wal-section-title" style="color:#92400e;font-size:15px;">🔥 Đang chế biến (${cooking.length})</div>
      ${cooking.map(b => {
        if (b.status === 'finishing') return prepFinishingCardHTML(b);
        // [MỚI] Công thức mẻ này có dùng nguyên liệu "cái" (đơn vị nguyên, cần
        // dán tem) không — nếu có, nhắc quét ngay tại đây thay vì bắt nhân viên
        // nhớ quay lại màn Container sau. Bắt đầu chế biến chính là lúc gói/hộp
        // đó thực sự bị mở ra dùng.
        // [MỚI] Lô nào đã quét đủ ở cổng quét bắt buộc lúc bắt đầu (atomicScanDone)
        // thì khỏi nhắc lại — chỉ lô cũ tạo trước khi có cổng quét (thiếu cờ này)
        // mới còn cần banner nhắc quét ở đây.
        const atomicInputs = b.atomicScanDone ? [] : atomicUnitInputsForPrep(b.prepId);
        const reconPending = Object.entries(b.reconcileInputs || {}).filter(([,v])=>v.status!=='done');
        const pendingNames = reconPending.map(([itemId]) => (KHO_ITEMS_CACHE.find(x=>x.id===itemId)||{}).name||itemId);
        return `
        <div style="background:#fff;border:1.5px solid #fde68a;border-radius:22px;padding:16px;margin-top:12px;box-shadow:0 2px 10px rgba(146,64,14,.06);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
            <div style="min-width:0;">
              <div style="font-size:21px;font-weight:800;color:#78350f;line-height:1.25;">${escHtmlPos(b.prepName || '')}</div>
              <div style="font-size:13px;color:#a16207;margin-top:4px;">Bắt đầu ${fmtDateTimeShort(b.startedAt)}</div>
            </div>
            <span class="prep-countdown" data-ready="${b.expectedReadyAt || ''}" data-pending="${reconPending.length}" style="flex-shrink:0;padding:7px 12px;border-radius:99px;background:#fef3c7;color:#92400e;font-size:13.5px;font-weight:800;white-space:nowrap;">—</span>
          </div>
          ${reconPending.length?`<div id="prepRecon_${b.id}" style="margin-top:14px;padding:14px;background:#EAF3FA;border-radius:18px;">
            <div style="font-size:14px;font-weight:800;color:#0062AD;margin-bottom:10px;">⚖️ Cân lại NL đã lấy · còn ${reconPending.length}</div>
            ${reconPending.map(([itemId,row],i)=>{
              const act=row.status==='processing'?'Tiếp tục chốt':prepReconIsCountable(KHO_ITEMS_CACHE.find(x=>x.id===itemId))?'Đếm còn lại':'Cân còn lại';
              return `<button onclick="openPrepReconForm('${b.id}','${itemId}')" style="width:100%;min-height:64px;padding:12px 12px 12px 18px;margin-top:${i?8:0}px;background:#fff;border:2px solid #0062AD;border-radius:18px;display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;font-family:'Google Sans',sans-serif;">
                <span style="font-size:19px;font-weight:800;color:#0b2540;text-align:left;">${escHtmlPos(pendingNames[i])}${prepReconLowHint(row)}</span>
                <span style="flex-shrink:0;padding:10px 14px;border-radius:99px;background:#0062AD;color:#fff;font-size:14px;font-weight:800;">${act} →</span>
              </button>`;}).join('')}
          </div>`:''}
          <button onclick="openPrepRecipeView('${b.id}')" class="pbt-recipe-btn" style="margin-top:12px;min-height:50px;border-radius:99px;font-size:15px;">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>
            Xem công thức &amp; cách chế biến
          </button>
          <div style="display:flex;gap:10px;margin-top:12px;">
            <button onclick="openPrepCancelForm('${b.id}')" style="flex:1;min-height:56px;background:#fff;color:#b91c1c;border:2px solid #fca5a5;border-radius:99px;font-family:'Google Sans',sans-serif;font-weight:800;font-size:16px;cursor:pointer;">Huỷ mẻ</button>
            <button onclick="${reconPending.length?`prepFinishBlocked('${b.id}')`:`openPrepFinishForm('${b.id}')`}" style="flex:1.6;min-height:56px;background:#16a34a;color:#fff;opacity:${reconPending.length?'.45':'1'};border:none;border-radius:99px;font-family:'Google Sans',sans-serif;font-weight:800;font-size:16px;cursor:pointer;box-shadow:${reconPending.length?'none':'0 4px 12px rgba(22,163,74,.35)'};">Hoàn thành</button>
          </div>
          ${atomicInputs.length ? `
          <div style="margin-top:8px;padding:8px 10px;background:#fff7ed;border:1.5px solid #fdba74;border-radius:10px;">
            <div style="font-size:11.5px;font-weight:700;color:#9a3412;margin-bottom:4px;">📦 Mẻ này dùng nguyên liệu cần báo tem — quét mã gói vừa mở</div>
            ${atomicInputs.map(r => `
            <button onclick="scanToFinishContainerForItem('${r.itemId}')" style="width:100%;display:flex;justify-content:space-between;align-items:center;padding:12px 12px;min-height:48px;margin-top:6px;background:#fff;border:1.5px solid #fdba74;border-radius:11px;font-size:13.5px;font-weight:700;color:#9a3412;cursor:pointer;">
              <span>${(r.item && r.item.name) || ''}</span><span>🔍 Quét mã</span>
            </button>`).join('')}
          </div>` : ''}
        </div>`;
      }).join('')}
    </div>` : ''}

    ${active.length ? `
    <div class="wal-section" style="margin:0 0 14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <div style="font-size:20px;font-weight:800;color:var(--td);">Lô đang còn <span style="display:inline-block;min-width:28px;text-align:center;font-size:14px;font-weight:800;color:var(--gd);background:var(--gl);border-radius:999px;padding:3px 9px;margin-left:4px;vertical-align:3px;">${active.length}</span></div>
        ${active.length > PREP_ACTIVE_PREVIEW ? `<button onclick="togglePrepActiveList()" style="flex-shrink:0;display:flex;align-items:center;gap:5px;height:42px;padding:0 15px;background:#F6F4EF;color:var(--td);border:none;border-radius:999px;font-family:'Google Sans',sans-serif;font-size:14.5px;font-weight:800;cursor:pointer;">
          ${_prepActiveListExpanded ? 'Thu gọn' : 'Xem tất cả'}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="${_prepActiveListExpanded ? 'transform:rotate(180deg);' : ''}"><path d="M6 9l6 6 6-6"/></svg>
        </button>` : ''}
      </div>
      ${(() => {
        // [MỚI] Nấu nhiều BTP dồn lại có thể tới 40-50 lô còn hạn — liệt kê hết là một
        // danh sách dài ngoằn phải cuộn qua trước khi tới được ô chọn thành phẩm cần
        // nấu bên dưới. Mặc định chỉ hiện 5 lô hoàn thành GẦN NHẤT, bấm "Xem thêm" mới
        // bung hết — luôn sắp theo đúng thời gian chế biến (finishedAt), mới nhất trước.
        const sorted = active.slice().sort((x, y) => String(y.finishedAt || '').localeCompare(String(x.finishedAt || '')));
        const shown = _prepActiveListExpanded ? sorted : sorted.slice(0, PREP_ACTIVE_PREVIEW);
        return `
        ${shown.map(b => {
          const nvNgan = (b.finishedBy || '').trim();
          const cookDur = fmtPrepCookDuration(b.startedAt, b.finishedAt);
          return `
        <div class="pbt-card" onclick="showPrepLabelCard('${b.id}')">
          <div class="pbt-card-top">
            <div style="min-width:0;">
              <div class="pbt-name">${escHtmlPos(b.prepName || '')}</div>
              ${b.batchCode ? `<div class="pbt-code">${escHtmlPos(b.batchCode)}</div>` : ''}
              <div class="pbt-meta">
                ${cookDur ? `Nấu <b>${cookDur}</b> · ` : ''}${fmtDateTimeShort(b.finishedAt)}<br>
                HSD <b>${prepExpiryLabel(b)}</b>${nvNgan ? ` · Người nấu <b>${escHtmlPos(nvNgan)}</b>` : ''}
              </div>
              ${prepUnitInfoPOS(b).stale ? `<div style="font-size:11px;color:#c0392b;font-weight:700;margin-top:4px;">Lô cũ đo bằng ${prepUnitInfoPOS(b).oldUnit} — nay tính bằng ${prepUnitInfoPOS(b).unit}. Dùng hết hoặc bỏ lô này rồi đếm lại.</div>` : ''}
            </div>
            <div class="pbt-qty">${Number(b.qtyRemaining).toLocaleString('vi-VN')} ${prepUnitInfoPOS(b).oldUnit || prepUnitInfoPOS(b).unit}</div>
          </div>
          <div class="pbt-actions">
            <button class="pbt-btn pbt-edit" onclick="event.stopPropagation(); openPrepYieldEditForm('${b.id}')" title="Sửa định lượng thu được (cần mã quản lý)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              Sửa
            </button>
            <button class="pbt-btn pbt-print" onclick="event.stopPropagation(); printPrepBatchLabelNow('${b.id}')" title="In lại tem">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              In tem
            </button>
          </div>
        </div>`;
        }).join('')}
`;
      })()}
      <div style="font-size:11px;color:#bbb;margin-top:8px;">Bấm vào lô để xem lại nội dung tem; bấm Sửa để sửa định lượng thu được nếu ghi sai lúc Hoàn thành (cần mã quản lý); bấm In tem để in lại khi bị bong/mờ hoặc khi chia lô sang hũ khác.</div>
    </div>` : ''}

    <div class="wal-section" style="margin:0 0 14px;">
      <div class="wal-section-title">Thành phẩm cần nấu</div>
      <div class="wal-input-group" style="padding:4px 14px;">
        <select onchange="prepBatchSelect(this.value)" style="width:100%;border:none;outline:none;font-family:'Google Sans',sans-serif;font-size:15px;font-weight:600;color:var(--td);background:transparent;padding:10px 0;">
          ${POS_PREP_CON_DUNG(p.id).map(x => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${x.code || ''} · ${x.name || ''}</option>`).join('')}
        </select>
      </div>
      <div style="font-size:11.5px;color:#999;margin-top:8px;">1 mẻ ra ${Number(p.batchYield || 0).toLocaleString('vi-VN')} ${p.unit || ''} · HSD ${prepExpiryLabel({ shelfLifeType: p.shelfLifeType, shelfLifeHours: p.shelfLifeHours, expiresAt: null })}${Number(p.prepTimeMinutes) > 0 ? ` · nấu ~${p.prepTimeMinutes} phút` : ''}</div>

      <div class="wal-input-label" style="margin:12px 0 6px;">Nấu bao nhiêu mẻ?</div>
      <!-- [FIX-UI] Ký hiệu phân số (¼ ½ ¾ 1½) trước đây dễ đọc nhầm/lẫn với nhau lúc đang
           bận tay pha chế — đổi hẳn sang số thập phân (0,25/0,5/0,75/1,5), viết theo đúng
           dấu phẩy thập phân tiếng Việt như mọi số khác trong app (xem toLocaleString('vi-VN')
           ở dòng ngay trên) để nhân viên đọc quen mắt, không phải suy ra phân số là bao nhiêu. -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${ratioBtn('0,25 mẻ', 0.25)}${ratioBtn('0,5 mẻ', 0.5)}${ratioBtn('0,75 mẻ', 0.75)}${ratioBtn('1 mẻ', 1)}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
        ${ratioBtn('1,5 mẻ', 1.5)}${ratioBtn('2 mẻ', 2)}${ratioBtn('3 mẻ', 3)}${ratioBtn('4 mẻ', 4)}
      </div>
      <div style="display:flex;gap:10px;margin-top:8px;">
        <div style="flex:1;">
          <div class="wal-input-label" style="margin:0 0 4px;">Tỷ lệ mẻ</div>
          <div class="wal-input-group" style="margin-bottom:0;">
            <input type="number" inputmode="decimal" step="0.05" value="${r}" oninput="prepBatchSetRatio(this.value)">
          </div>
        </div>
        <div style="flex:1;">
          <div class="wal-input-label" style="margin:0 0 4px;">Hoặc cần thu (${p.unit || ''})</div>
          <div class="wal-input-group" style="margin-bottom:0;">
            <input type="number" inputmode="decimal" step="1" value="${prepBatchState.actualYield}" oninput="prepBatchSetTargetQty(this.value)">
          </div>
        </div>
      </div>
    </div>

    <div class="wal-section" style="margin:0 0 14px;">
      <div class="wal-section-title">Nguyên liệu cần cân</div>
      ${(p.batchInputs || []).map(row => {
        const exact = (Number(row.qty) || 0) * r;
        // [MỚI] Đối chiếu với tồn kho. Trước đây chỉ nấu được tối đa 1 mẻ nên hiếm
        // khi thiếu; giờ chọn được 4 mẻ thì rất dễ vượt tồn — mà kho vẫn trừ tuốt
        // xuống âm, không ai hay cho tới lúc kiểm kê.
        const it = KHO_ITEMS_CACHE.find(x => x.id === row.itemId);
        // NL không quản lý tồn (nước lọc, đá lấy từ máy) không có tồn kho → không báo thiếu.
        const ton = it && it.stockManaged !== false ? (Number(it.currentStock) || 0) : null;
        const thieu = (ton !== null) && exact > ton;
        return `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 14px;margin-top:8px;background:${thieu ? '#fef2f2' : '#FFFCF0'};border:1.5px solid ${thieu ? '#fca5a5' : '#f0ead9'};border-radius:16px;">
          <span style="min-width:0;font-size:17px;font-weight:800;color:var(--td);line-height:1.3;">${nameOf(row.itemId)}${prepWholePackSize(it) ? `<span style="display:block;font-size:12.5px;color:#9a3412;font-weight:700;margin-top:2px;">Dùng nguyên ${escHtmlPos(it.countUnitName || 'gói')} — quét mã, không cân</span>` : ''}${thieu ? `<span style="display:block;font-size:12.5px;color:#c0392b;font-weight:700;margin-top:2px;">Kho chỉ còn ${fmtPrepQty(ton)} ${unitOf(row.itemId)}</span>` : ''}</span>
          <span style="flex-shrink:0;padding:8px 14px;border-radius:99px;background:${thieu ? '#c0392b' : 'var(--gd)'};color:#fff;font-size:16px;font-weight:800;white-space:nowrap;">${fmtPrepQty(exact)} ${unitOf(row.itemId)}</span>
        </div>`;
      }).join('') || '<div style="font-size:12.5px;color:#bbb;padding:8px 0;">Công thức mẻ chưa khai nguyên liệu nào.</div>'}
      ${(() => {
        const thieuList = (p.batchInputs || []).filter(row => {
          const it = KHO_ITEMS_CACHE.find(x => x.id === row.itemId);
          return it && it.stockManaged !== false && (Number(row.qty) || 0) * r > (Number(it.currentStock) || 0);
        });
        return thieuList.length
          ? `<div style="margin-top:10px;padding:10px 12px;background:#fdf2f2;border:1.5px solid #f5c2c2;border-radius:10px;font-size:12px;color:#c0392b;font-weight:700;">Kho không đủ cho ${fmtPrepQty(r)} mẻ (${thieuList.length} nguyên liệu thiếu). Vẫn nấu được nhưng tồn kho sẽ âm — nên giảm số mẻ hoặc nhập hàng trước.</div>`
          : '';
      })()}
      <div style="font-size:11px;color:#999;margin-top:8px;">Số lẻ giữ nguyên — cân bằng cân tiểu ly, không làm tròn để khỏi lệch công thức khi nấu mẻ nhỏ.</div>
    </div>

    ${(p.instructions || '').trim() ? `
    <div class="wal-section" style="margin:0 0 14px;">
      <div class="wal-section-title">Cách chế biến</div>
      <div style="font-size:13.5px;color:var(--td);line-height:1.7;white-space:pre-wrap;">${escHtmlPos(p.instructions.trim())}</div>
    </div>` : ''}

    <div class="wal-section" style="margin:0 0 14px;">
      ${renderPinInput('prepBatchStaff')}
    </div>
    <button id="prepStartBtn" onclick="startPrepBatchGate()" style="width:100%;padding:16px;min-height:54px;background:var(--gd);color:#fff;border:none;border-radius:14px;font-weight:700;font-size:16px;cursor:pointer;">🔥 Bắt đầu chế biến</button>
    <div style="font-size:11.5px;color:#999;margin-top:8px;text-align:center;">Nguyên liệu bị trừ kho ngay khi bắt đầu. Nấu xong bấm "Hoàn thành" để cân và lấy mã lô.</div>
  `;
  startPrepCountdownTicker();
}

// Hiển thị định lượng: giữ số lẻ, chỉ bỏ đuôi .00 cho gọn mắt.
function fmtPrepQty(n) {
  const v = Number(n) || 0;
  const r2 = Math.round(v * 100) / 100;
  return Number.isInteger(r2) ? r2.toLocaleString('vi-VN') : r2.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

// Bấm Hoàn thành khi còn NL chưa cân lại: không mở form, báo rõ cần cân gì và
// làm ô "Cân lại NL" của đúng mẻ đó nháy lên để nhân viên thấy ngay chỗ cần bấm.
function prepFinishBlocked(batchId) {
  const b = PREP_BATCHES_CACHE_POS.find(x => x.id === batchId);
  if (!b) return;
  const names = Object.entries(b.reconcileInputs || {}).filter(([, v]) => v.status !== 'done')
    .map(([id]) => (KHO_ITEMS_CACHE.find(x => x.id === id) || {}).name || id);
  toast('⚠️ Cần cân ' + names.join(', ') + ' trước khi Hoàn thành');
  const box = document.getElementById('prepRecon_' + batchId);
  if (box) {
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    box.animate([{ boxShadow: '0 0 0 0 rgba(0,98,173,.6)' }, { boxShadow: '0 0 0 10px rgba(0,98,173,0)' }], { duration: 700, iterations: 3 });
  }
}

// Thẻ lô kẹt ở 'finishing' (đã bấm Hoàn thành, số cân đã chốt trong _pendingFinish, nhưng lưu
// chưa xong). Không cho cân lại/huỷ — chỉ một nút làm tiếp đúng số đã chốt (xem resumePrepFinish).
function prepFinishingCardHTML(b) {
  const pf = b._pendingFinish || null;
  const unit = escHtmlPos(b.unit || '');
  return `
        <div style="background:#fff;border:2px solid #fca5a5;border-radius:22px;padding:16px;margin-top:12px;">
          <div style="font-size:21px;font-weight:800;color:#78350f;line-height:1.25;">${escHtmlPos(b.prepName || '')}</div>
          <div style="font-size:13px;color:#a16207;margin-top:4px;">Bắt đầu ${fmtDateTimeShort(b.startedAt)}</div>
          <div style="margin-top:12px;padding:12px 14px;background:#fef2f2;border-radius:14px;font-size:13.5px;font-weight:700;color:#b91c1c;line-height:1.5;">
            Đã bấm Hoàn thành nhưng lưu chưa xong (mất mạng giữa chừng).${pf ? ` Số đã cân: <b>${fmtPrepQty(pf.qty)} ${unit}</b>${pf.staffFullName ? ' · ' + escHtmlPos(pf.staffFullName) : ''} — không cần cân lại.` : ''}
          </div>
          <button id="prepResume_${b.id}" onclick="${pf ? `resumePrepFinish('${b.id}')` : `openPrepFinishForm('${b.id}')`}" style="width:100%;min-height:56px;margin-top:12px;background:#16a34a;color:#fff;border:none;border-radius:99px;font-family:'Google Sans',sans-serif;font-weight:800;font-size:16px;cursor:pointer;">${pf ? 'Tiếp tục lưu' : 'Hoàn thành'}</button>
        </div>`;
}

// Đồng hồ đếm ngược cho lô đang nấu. Dùng 1 interval CHUNG cho mọi lô (không mỗi
// lô một timer) và tự dọn khi rời màn — tránh rò rỉ timer khi vào/ra màn nhiều lần.
let _prepCountdownTimer = null;

function startPrepCountdownTicker() {
  if (_prepCountdownTimer) clearInterval(_prepCountdownTimer);
  const tick = () => {
    const els = document.querySelectorAll('.prep-countdown');
    if (!els.length) { clearInterval(_prepCountdownTimer); _prepCountdownTimer = null; return; }
    els.forEach(el => {
      const ready = el.getAttribute('data-ready');
      if (!ready) { el.textContent = 'đang nấu'; return; }
      const ms = vnDate(ready) - vnDate();
      if (ms <= 0) {
        el.textContent = Number(el.getAttribute('data-pending')) > 0 ? 'Đủ giờ · cân NL' : 'Đủ giờ';
        el.style.color = '#15803d'; el.style.background = '#dcfce7'; return;
      }
      const m = Math.floor(ms / 60000), sec = Math.floor((ms % 60000) / 1000);
      el.textContent = `còn ${m}:${String(sec).padStart(2, '0')}`;
    });
  };
  tick();
  _prepCountdownTimer = setInterval(tick, 1000);
}

// ============================================================================
// [MỚI] CỔNG QUÉT MÃ BẮT BUỘC TRƯỚC KHI BẮT ĐẦU CHẾ BIẾN
// ----------------------------------------------------------------------------
// VẤN ĐỀ vận hành thật: nguyên liệu "cái" (đơn vị nguyên, có tem riêng từng gói)
// trước đây chỉ được NHẮC quét SAU khi mẻ đã bắt đầu (banner "🔥 Đang chế biến"
// ở renderPrepBatchForm), và banner đó chỉ hiện MỘT nút quét chung — nấu 2 mẻ
// hay 1 mẻ đều y hệt nhau, không ai biết cần quét mấy cái mới đủ, cũng không
// thấy đã quét được bao nhiêu. Kết quả: nhân viên bấm nút cho có, tem thật
// ngoài kệ không được quét, tồn kho theo tem lệch khỏi tồn thật mà không ai
// phát hiện cho tới lúc kiểm kê.
//
// CÁCH SỬA: chặn NGAY LÚC bấm "Bắt đầu chế biến" — nếu công thức có nguyên liệu
// "cái", tính đúng số cái cần cho ĐÚNG số mẻ sắp nấu rồi bắt quét đủ số đó mới
// cho nấu tiếp, luôn hiện "đã quét x/N, còn thiếu y" để nhân viên biết chắc còn
// thiếu bao nhiêu chứ không phải đoán.
// ============================================================================
//
// [SỬA — bán hàng ưu tiên chen ngang lúc đang quét] TRƯỚC ĐÂY prepStartGateScan()
// ghi 'finished' lên Firestore NGAY MỖI LẦN quét — nên nếu nhân viên thoát ra bán
// hàng (ưu tiên số 1) giữa chừng rồi quay lại, các tem ĐÃ quét đã bị chốt hết thật
// trên hệ thống, còn prepBatchState/prepStartScanState (chỉ là biến JS) lại bị
// openPrepBatchScreen() reset về công thức đầu danh sách mỗi lần vào lại màn —
// nhân viên bị bắt quét lại từ đầu, mà 2/3 mã cũ giờ báo "đã hết" không quét lại
// được nữa → kẹt cứng.
// CÁCH SỬA (đúng như yêu cầu chủ quán): (1) chỉ NHỚ TẠM mã đã quét, lưu cả vào
// localStorage để sống sót qua việc thoát/vào lại màn hay tắt mở app — KHÔNG ghi
// 'finished' lên Firestore lúc quét; (2) quét ĐỦ số lượng thì TỰ ĐỘNG chuyển sang
// chế biến luôn (xem prepStartGateScan cuối hàm), đúng lúc đó mới thật sự báo "đã
// mở & hết" lên hệ thống (xem confirmPrepStartAfterScan) — không cần thêm thao tác
// bấm nút nào, cũng không có tem nào bị chốt hết trước khi mẻ thật sự bắt đầu nấu.
const PREP_START_SCAN_LS_KEY = 'gieo_prepStartScanState_v1';

function savePrepStartScanState() {
  try {
    if (prepStartScanState) localStorage.setItem(PREP_START_SCAN_LS_KEY, JSON.stringify(prepStartScanState));
    else localStorage.removeItem(PREP_START_SCAN_LS_KEY);
  } catch (e) { /* localStorage không dùng được thì thôi, không chặn luồng chính */ }
}

function loadPrepStartScanState() {
  try {
    const raw = localStorage.getItem(PREP_START_SCAN_LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function clearPrepStartScanState() {
  prepStartScanState = null;
  try { localStorage.removeItem(PREP_START_SCAN_LS_KEY); } catch (e) {}
}

let prepStartScanState = null;

// Số CÁI cần quét cho ĐÚNG tỷ lệ mẻ sắp nấu. Cổng bắt đầu chặn kết quả
// phân số trước khi quét, nên số tem chốt phải khớp đúng lượng ghi sổ.
// [NẤU NGUYÊN GÓI — chủ quán chốt 02/10/2026] NL có tem, có quy cách đếm > 1 đơn vị (vd bí đao: 1 gói = 600 g) và
// được bật "Nấu dùng nguyên gói" ở Quản lý (prepWholePack): công thức chế biến luôn dùng TRỌN gói, không có gói dở.
// Khi nấu, xử lý như NL "cái rời": bắt quét đủ N gói CHƯA MỞ → báo hết luôn (tồn giảm đúng N × quy cách theo tổng
// tem), không cân, không khoá NL, không qua đối chiếu. Huỷ mẻ trả gói về chưa mở (cùng đường với cái rời).
// Trả số đơn vị cơ bản của 1 gói (600), 0 nếu NL không thuộc loại này.
function prepWholePackSize(item) {
  if (!item || item.prepWholePack !== true || item.stockManaged === false) return 0;
  if (item.trackingMode !== 'unit' && item.trackingMode !== 'batch') return 0;
  if (UnitEngine.classify.isAtomic(item)) return 0;
  const pk = (item.packagingUnits || []).find(x => x.name === item.countUnitName);
  const b = pk ? Number(pk.baseQty) : 0;
  return b > 1 ? b : 0;
}

function computeAtomicRequirementsForPrep(p, ratio) {
  const grouped=new Map();
  (p && p.batchInputs || []).filter(r=>r.itemId&&Number(r.qty)>0).forEach(r=>
    grouped.set(r.itemId,(grouped.get(r.itemId)||0)+Number(r.qty)));
  return [...grouped].map(([itemId,qty])=>({itemId,qty,
    item:KHO_ITEMS_CACHE.find(x=>x.id===itemId)}))
    .filter(r => UnitEngine.classify.isAtomic(r.item) || prepWholePackSize(r.item) > 0)
    .map(r => {
      const goi = prepWholePackSize(r.item);
      return {
        itemId: r.itemId,
        name: (r.item && r.item.name) || '',
        // Nguyên gói: số GÓI = lượng cần ÷ quy cách (prepCountQuantityError đã chặn trường hợp ra số gói lẻ).
        required: Math.max(1, Math.round(r.qty * (Number(ratio) || 0) / (goi || 1))),
        ...(goi ? { wholePack: goi, packName: r.item.countUnitName || 'gói', unit: r.item.unit || '' } : {})
      };
    });
}

// ══════════════════════════════════════════════════════════════════════════
// [NL-RECON] ĐỐI CHIẾU NL KHI NẤU — toàn bộ chính sách, khóa và form ở cùng khối.
// g/kg và ml/l có tỷ trọng + quản kho + NV phải kiểm kê; nguyên cái đã quét và
// nước/đá không quản kho không vào đây. Mốc trước chỉ yêu cầu khi thiếu,
// <=10% bao, hoặc đổi mã.
// ══════════════════════════════════════════════════════════════════════════
const PREP_RECON_LOCK_COLL = 'prep_ingredient_locks_gieogieo';

let prepReconGate = null, prepReconForm = null;

// Lỗi ở luồng đối chiếu NL chia 2 loại để nhân viên KHÔNG phải tự xử lý:
//   'reload' : mẻ vừa đổi ở máy khác/mất mạng → hệ thống TỰ tải lại màn hình.
//   'manager': tình huống nhân viên không tự sửa được (tránh trừ hai lần...) → hệ
//              thống TỰ gửi cảnh báo cho Quản lý (alerts_gieogieo), nhân viên chỉ
//              cần biết là đã báo. Không đụng luồng bán hàng.
function prepFlowError(msg, kind) { const e = new Error(msg); e.kind = kind; return e; }

function prepBlockedAlertId(batchId, itemId) { return ('pos_prep_blocked_' + (batchId || 'x') + '_' + (itemId || 'x')).replace(/[^\w\-]/g, '_').slice(0, 180); }

// [v18 — phương án A] NL của mẻ đang kẹt (đã gặp lỗi loại 'manager'): key 'mẻ|NL' → lý do. Màn đối chiếu thấy key
// này (hoặc cảnh báo kẹt còn mở trên máy chủ) thì hiện khối "Tự chốt theo số cân hiện có" — xem prepForcePanelHTML.
const _prepReconStuck = {};

async function prepFlowToastError(err, prefix) {
  const msg = (prefix || '') + (err && err.message || err);
  const st = prepReconForm;
  if (err && err.kind === 'reload') {
    toast('🔄 Mẻ vừa được cập nhật — đã tự tải lại màn hình');
    try {
      if (st && st.batchId && st.itemId) { prepReconForm = null; await openPrepReconForm(st.batchId, st.itemId); }
      else if (typeof openPrepBatchScreen === 'function') openPrepBatchScreen();
    } catch (e) { console.warn('[NL-RECON] tự tải lại lỗi', e); }
    return;
  }
  if (err && err.kind === 'manager') {
    const it = st && KHO_ITEMS_CACHE.find(x => x.id === st.itemId);
    const docId = prepBlockedAlertId(st && st.batchId, st && st.itemId);
    if (st && st.batchId && st.itemId) _prepReconStuck[st.batchId + '|' + st.itemId] = String(err.message || err);
    try {
      await fstore.collection('alerts_gieogieo').doc(docId).set({
        type: 'pos_prep_blocked', severity: 'warning', status: 'new',
        title: 'Đối chiếu NL khi nấu cần Quản lý xử lý',
        message: String(err.message || err), batchId: (st && st.batchId) || '', itemId: (st && st.itemId) || '',
        itemName: (it && it.name) || '', businessDate: posDateKey(), createdAt: vnDate().toISOString()
      }, { merge: true });
      toast('⚠️ ' + msg + ' — đã báo Quản lý. Có thể tự chốt theo số cân hiện có ở khung đỏ trên màn này');
    } catch (e) {
      console.warn('[NL-RECON] gửi cảnh báo Quản lý lỗi', e);
      toast('⚠️ ' + msg + ' — chưa gửi được cảnh báo. Có thể tự chốt theo số cân hiện có ở khung đỏ trên màn này');
    }
    // Vẽ lại màn đối chiếu để hiện khối tự chốt (openPrepReconForm tự bắt lỗi của nó — không lặp lại vào đây).
    if (st && st.batchId && st.itemId) openPrepReconForm(st.batchId, st.itemId).catch(() => {});
    return;
  }
  toast('❌ ' + msg);
}

function prepReconIsCountable(item) {
  return ['cái','miếng'].includes(String(item&&item.unit||'').trim().toLowerCase());
}

// Đếm NL "cái" không bắt quét: nhân viên chỉ nhập số cái CÒN NGUYÊN và số cái
// ĐANG DÙNG DỞ (đếm nguyên, không ước 0,5/0,75). Phần lẻ của cái dùng dở lấy theo
// sổ/định mức (ref = số dự kiến còn lại của mã): 24,5 dự kiến + đếm 24 nguyên, 1 dở
// = 24,5. Sổ không có phần lẻ mà vẫn có cái dở (hoặc dở hơn 1 cái) thì mỗi cái dở
// ngoài phần lẻ đó tính 0,5 — lệch sẽ hiện ra ở bước giải trình như bình thường.
function prepCountPartsToQty(whole,partial,ref) {
  const w=Number(whole),pc=Number(partial);
  if(!Number.isInteger(w)||w<0||!Number.isInteger(pc)||pc<0)return NaN;
  if(!pc)return w;
  const r=Math.max(0,Number(ref)||0),f=round2(r-Math.floor(r+0.005));
  const first=f>0.005&&f<0.995?f:0.5;
  return round2(w+first+(pc-1)*0.5);
}

function prepCountInputsHtml(idPrefix,v,onEvent,handler) {
  const st='width:100%;min-width:0;box-sizing:border-box;padding:11px;border:1.5px solid #0062AD55;border-radius:12px';
  return `<div style="display:flex;gap:6px;flex:1;min-width:0">
    <label style="flex:1;min-width:0;font-size:11px;color:#0062AD;font-weight:700">Còn nguyên
      <input id="${idPrefix}_w" type="number" min="0" step="1" inputmode="numeric" value="${Number.isInteger(v?.whole)?v.whole:''}" placeholder="0" ${onEvent}="${handler}" style="${st}"></label>
    <label style="flex:1;min-width:0;font-size:11px;color:#0062AD;font-weight:700">Đang dùng dở
      <input id="${idPrefix}_p" type="number" min="0" step="1" inputmode="numeric" value="${Number.isInteger(v?.partial)?v.partial:''}" placeholder="0" ${onEvent}="${handler}" style="${st}"></label>
  </div>`;
}

function prepCountReadInputs(idPrefix) {
  const w=document.getElementById(idPrefix+'_w'),pc=document.getElementById(idPrefix+'_p');
  const wv=w?w.value:'',pv=pc?pc.value:'';
  if(wv===''&&pv==='')return null;
  return {whole:wv===''?0:Number(wv),partial:pv===''?0:Number(pv)};
}

// Chặn nấu khi số mẻ làm NL đếm được ra số cái LẺ:
//   A. NL bắt quét mã (isAtomicUnitItem: 1 tem = 1 cái, kiểm kê theo cái) — luôn chặn.
//   B. NL đơn vị "cái/miếng" (kiểm kê theo hộp/thùng) mà CÔNG THỨC dùng số cái NGUYÊN
//      (vd 3 túi trà/mẻ) — cũng chặn: không có nửa túi trà.
//   C. Công thức đã lẻ sẵn (vd bột rau câu 0,25 cái/mẻ) — không chặn, nấu mẻ lẻ bình thường.
// Gợi ý mẻ (prepSugRatioOk) dùng đúng quy tắc này để không bao giờ gợi ý số mẻ bị chặn.
function prepCountQuantityError(p,ratio) {
  const per=new Map();
  (p.batchInputs||[]).filter(r=>r.itemId&&Number(r.qty)>0).forEach(r=>
    per.set(r.itemId,(per.get(r.itemId)||0)+Number(r.qty)));
  for(const [id,perBatch] of per){
    const item=KHO_ITEMS_CACHE.find(x=>x.id===id);
    const goi=prepWholePackSize(item);
    if(goi){   // [NẤU NGUYÊN GÓI] số mẻ phải ra tròn gói
      const soGoi=round2(perBatch*ratio/goi);
      if(!Number.isInteger(soGoi))
        return item.name+' dùng nguyên '+(item.countUnitName||'gói')+' ('+fmtPrepQty(goi)+' '+(item.unit||'')+'): '+fmtPrepQty(perBatch*ratio)+' '+(item.unit||'')+' = '+fmtPrepQty(soGoi)+' '+(item.countUnitName||'gói')+' — chọn số mẻ ra tròn '+(item.countUnitName||'gói');
      continue;
    }
    if(!item||item.stockManaged===false||!prepReconIsCountable(item))continue;
    const qty=round2(perBatch*ratio);
    if(!(UnitEngine.classify.isAtomic(item)||Number.isInteger(round2(perBatch))))continue;   // loại C
    if(!Number.isInteger(qty))
      return 'Định mức '+item.name+' × tỷ lệ mẻ ra '+qty+' cái lẻ — chọn số mẻ khác để ra số cái nguyên';
  }
  return '';
}

function prepReconRows(p, ratio) {
  const grouped=new Map();
  (p.batchInputs||[]).filter(r=>r.itemId&&Number(r.qty)>0).forEach(r=>
    grouped.set(r.itemId,(grouped.get(r.itemId)||0)+Number(r.qty)*ratio));
  return [...grouped].map(([itemId,expected])=>({itemId,expected,
    item:KHO_ITEMS_CACHE.find(x=>x.id===itemId)})).filter(r=>
    r.item && r.item.stockManaged !== false && r.item.staffCounts !== false
    && (posItemWeighFactor(r.item)>0 || prepReconIsCountable(r.item))
    && !UnitEngine.classify.isAtomic(r.item) && !prepWholePackSize(r.item));
}

// Mã còn <=10% dung tích = "sắp hết": xếp lên đầu để định mức trừ vào mã này trước,
// đúng thứ tự nhân viên được nhắc lấy (vét mã sắp hết trước rồi mới sang mã khác),
// kể cả khi mã đó mở sau. Mã sắp hết KHÔNG bắt cân trước nữa — hết giữa mẻ thì báo
// hết ngay ở màn cân sau khi lấy (prepReconFinishUnit).
function prepReconLowHint(row) {
  if(!row||row.status!=='pending')return '';
  const units=(row.units||[]).filter(u=>u.id!=='__aggregate');
  const low=units.filter(UnitEngine.prep.reconIsLow);
  if(!low.length)return '';
  const others=units.filter(u=>!low.includes(u));
  return `<span style="display:block;margin-top:4px;font-size:12.5px;font-weight:700;color:#b45309;line-height:1.4">⚠️ Dùng hết ${low.map(u=>'mã '+escHtmlPos(u.code)+' (sổ còn ~'+fmtPrepQty(u.baseline)+')').join(', ')} trước${others.length?', rồi mới lấy sang '+others.map(u=>'mã '+escHtmlPos(u.code)).join(', '):''}. Hết thì bấm "Đã dùng hết" ở màn cân.</span>`;
}

// Chỉ bắt cân trước khi TỔNG sổ các mã đang mở không đủ cho mẻ (nguy cơ thiếu thật).
// Khi đó cân mọi mã sẽ bị lấy tới, theo đúng thứ tự trừ.
function prepReconRiskUnits(units,expected) {
  const total=units.reduce((n,u)=>n+Math.max(0,u.unitBase),0);
  if(total>=expected-0.005)return [];
  const out=[];let left=expected;
  for(const u of units){if(left<=0)break;out.push({unit:u,need:left});left-=Math.max(0,u.unitBase);}
  return out;
}

// Hao hụt đáy bao: báo hết mã trong mẻ mà tổng dùng vượt định mức một chút (phần
// dính đáy bao/chai) thì tự ghi hao hụt, không bắt giải trình. Ngưỡng = 2% dung
// tích các mã đã báo hết trong mẻ. Chỉ áp dụng khi mẻ dùng VƯỢT, không mã nào hụt.
const PREP_RESIDUE_RATIO = 0.02;

function prepReconResidueAuto(units,finishedIds,comparison,expected) {
  const fin=units.filter(u=>finishedIds.has(u.id));
  if(!fin.length||!comparison)return null;
  const diff=round2(comparison.observed-expected);
  const limit=round2(fin.reduce((n,u)=>n+(Number(u.capacity)||0)*PREP_RESIDUE_RATIO,0));
  if(!(diff>0.015)||diff>limit+0.005)return null;
  if(comparison.lotBreakdown.some(u=>u.delta< -0.015))return null;
  return {kind:'waste',note:'Hao hụt đáy bao (tự ghi, ≤'+Math.round(PREP_RESIDUE_RATIO*100)+'% dung tích) · '+fin.map(u=>u.code).join(', ')};
}

async function prepReconBeforeGate(p, ratio) {
  const countError=prepCountQuantityError(p,ratio);
  if(countError)throw new Error(countError);
  const key=p.id+':'+ratio;
  if(prepReconGate && prepReconGate.key===key && prepReconGate.ready) return true;
  if(!prepReconGate || prepReconGate.key!==key) {
    await ensureOriginalPacksPOS().catch(err=>{ throw new Error('Không tải được bì bao gói: '+(err.message||err)); });
    const rows=prepReconRows(p,ratio), targets=[];
    for(const r of rows) {
      if(!prepReconIsCountable(r.item)&&!itemCanWeighPOS(r.itemId))
        throw new Error('NL '+r.item.name+' cần cân nhưng chưa có dụng cụ hoặc bì bao gói gốc trong Quản lý');
      if(r.item.trackingMode==='unit' || r.item.trackingMode==='batch') {
        const units=await UnitEngine.prep.reconReadUnits(r.itemId);
        if(!units.length) throw new Error('Mở mã '+r.item.name+' trong Kho trước khi bắt đầu nấu');
        for(const {unit:u,need} of prepReconRiskUnits(units,r.expected))
          targets.push({itemId:r.itemId,itemName:r.item.name,unit:r.item.unit,...u,
            expected:need,multiOpen:units.length>1,
            fromCheckpoint:await UnitEngine.prep.reconCheckpointAtStart(u)});
      } else {
        const doc=await fstore.collection('inventory_items_gieogieo').doc(r.itemId).get();
        const book=Number(doc.data().currentStock)||0;
        if(book<r.expected)targets.push({itemId:r.itemId,itemName:r.item.name,unit:r.item.unit,id:'__aggregate',
          code:'Tồn chung',unitBase:book,expected:r.expected});
      }
    }
    prepReconGate={key,targets,values:{},ready:!targets.length};
  }
  if(!prepReconGate.ready) { renderPrepReconPreflight(); return false; }
  return true;
}

function renderPrepReconPreflight() {
  const st=prepReconGate,box=document.getElementById('prepBatchBody');if(!st||!box)return;
  prepSetBack(() => { prepReconGate = null; renderPrepBatchForm(); });
  // Màn này thay thế form mẻ (nơi có ô PIN) — phải vẽ lại ô PIN ở đây, không thì
  // bấm Tiếp tục sẽ không xác thực được người bắt đầu mẻ. Giữ PIN đã gõ qua lượt vẽ lại.
  const pinEl=document.getElementById('prepBatchStaffPin');
  const pinTyped=pinEl&&pinEl.type!=='hidden'?pinEl.value:'';
  box.innerHTML=`<div class="wal-section" style="--gd:#0062AD;--gl:#EAF3FA;border:1.5px solid #0062AD;background:#EAF3FA">
    <div class="wal-section-title" style="color:#0062AD">Cân trước khi lấy NL</div>
    <div style="font-size:12px;color:#345">Tổng các mã đang mở có nguy cơ không đủ cho mẻ. Cân hoặc đếm xong mới bắt đầu mẻ.</div>
    ${st.targets.map((x,i)=>`<div style="padding:12px 0;border-bottom:1px solid #0062AD44;display:flex;align-items:center;gap:10px">
      <div style="flex:1"><b>${escHtmlPos(x.itemName)}</b><div style="font-size:12px">${escHtmlPos(x.code)} · sổ ${fmtPrepQty(x.unitBase)} ${escHtmlPos(x.unit)} · cần ${fmtPrepQty(x.expected)}</div>
      ${Number.isFinite(st.values[i]?.qty)?`<b style="color:#0062AD">Đã ghi: ${fmtPrepQty(st.values[i].qty)} ${escHtmlPos(x.unit)}</b>`:''}
      ${prepReconIsCountable(KHO_ITEMS_CACHE.find(it=>it.id===x.itemId))?`<b id="prepReconPre${i}_q" style="display:block;color:#0062AD;font-size:12px">${Number.isFinite(st.values[i]?.qty)?'= '+fmtPrepQty(st.values[i].qty)+' '+escHtmlPos(x.unit):''}</b>`:''}
      ${Number.isFinite(st.values[i]?.qty)&&Math.abs(st.values[i].qty-x.unitBase)>0.015?`<div style="font-size:12px;color:#0062AD">Lệch mốc ${fmtPrepQty(round2(st.values[i].qty-x.unitBase))} ${escHtmlPos(x.unit)} · người bắt đầu mẻ chịu trách nhiệm giải trình</div>
        <input placeholder="Lý do chênh lệch" value="${escHtmlPos(st.values[i].reason||'')}" oninput="prepReconPreReason(${i},this.value)" style="width:100%;box-sizing:border-box;padding:9px;margin-top:6px;border:1px solid #0062AD;border-radius:10px">`:''}
      ${x.multiOpen?`<div style="font-size:12px;color:#0062AD">${st.values[i]?.verifiedUnitId===x.id?'Đã quét đúng tem':'Quét đúng tem '+escHtmlPos(x.code)+' trước khi cân/đếm'}</div>`:''}</div>
      ${prepReconIsCountable(KHO_ITEMS_CACHE.find(it=>it.id===x.itemId))
        ? `${x.multiOpen?`<button onclick="prepReconPreScan(${i})" style="padding:10px;background:#fff;color:#0062AD;border:1px solid #0062AD;border-radius:10px">Quét tem</button>`:''}${prepCountInputsHtml('prepReconPre'+i,st.values[i],'oninput','prepReconPreCount('+i+')')}`
        : `<button onclick="prepReconPreWeigh(${i})" style="padding:10px;background:#0062AD;color:#fff;border:0;border-radius:10px">Cân</button>`}
    </div>`).join('')}</div>
    <div class="wal-section" style="margin:12px 0">${renderPinInput('prepBatchStaff')}</div>
    <button id="prepReconPreContinue" onclick="prepReconPreflightDone()" ${prepReconGateReady(st)?'':'disabled'} style="width:100%;padding:14px;border:0;border-radius:12px;background:#0062AD;color:#fff">Tiếp tục</button>
    <button onclick="prepReconGate=null;renderPrepBatchForm()" style="width:100%;padding:12px;border:0;background:none;color:#0062AD">Quay lại</button>`;
  const pinNew=document.getElementById('prepBatchStaffPin');
  if(pinTyped&&pinNew&&pinNew.type!=='hidden'){pinNew.value=pinTyped;if(typeof onPinFieldInput==='function')onPinFieldInput('prepBatchStaff');}
}

function prepReconGateReady(st) {
  return !!st&&st.targets.every((x,i)=>Number.isFinite(st.values[i]?.qty)
    &&(Math.abs(st.values[i].qty-x.unitBase)<=0.015||!!(st.values[i].reason||'').trim())
    &&(!x.multiOpen||st.values[i].verifiedUnitId===x.id));
}

function prepReconPreReason(i,value) {
  if(!prepReconGate?.values[i])return;
  prepReconGate.values[i].reason=value;
  const btn=document.getElementById('prepReconPreContinue');
  if(btn)btn.disabled=!prepReconGateReady(prepReconGate);
}

async function prepReconScanExact(itemId,unitId,code) {
  if(typeof posScan!=='function'){toast('⚠️ Máy này chưa quét được tem');return false;}
  const scan=await posScan();
  if(!scan.ok){if(scan.error!=='cancelled')toast('⚠️ '+posScanErrorText(scan.error));return false;}
  const container=await UnitEngine.codes.find(scan.code);
  if(!container||container.id!==unitId||container.itemId!==itemId||container.status!=='open'){
    toast('⚠️ Cần quét đúng tem '+code+' đang mở, không dùng số cân của mã khác');return false;
  }
  return true;
}

async function prepReconPreScan(i) {
  const x=prepReconGate?.targets[i];if(!x||!x.multiOpen)return;
  try{
    if(!await prepReconScanExact(x.itemId,x.id,x.code))return;
    prepReconGate.values[i]={...(prepReconGate.values[i]||{}),verifiedUnitId:x.id};
    renderPrepReconPreflight();
  }catch(err){toast('❌ Không kiểm tra được tem: '+(err.message||err));}
}

async function prepReconPreWeigh(i) {
  const x=prepReconGate&&prepReconGate.targets[i];if(!x)return;
  if(x.multiOpen){
    try{if(!await prepReconScanExact(x.itemId,x.id,x.code))return;}
    catch(err){toast('❌ Không kiểm tra được tem: '+(err.message||err));return;}
  }
  openWeighPad({itemId:x.itemId,unit:x.unit,title:'Cân trước · '+x.itemName+' · '+x.code,
    reconcileMode:true,allowZero:true,onDone:(qty,lines)=>{prepReconGate.values[i]={qty,lines,
      reason:prepReconGate.values[i]?.reason||'',verifiedUnitId:x.multiOpen?x.id:''};renderPrepReconPreflight();}});
}

function prepReconPreCount(i) {
  if(!prepReconGate)return;
  const x=prepReconGate.targets[i],c=prepCountReadInputs('prepReconPre'+i);
  const qty=c?prepCountPartsToQty(c.whole,c.partial,x&&x.unitBase):NaN;
  prepReconGate.values[i]={...(prepReconGate.values[i]||{}),qty,manual:true,
    whole:c?c.whole:undefined,partial:c?c.partial:undefined};
  const hint=document.getElementById('prepReconPre'+i+'_q');
  if(hint)hint.textContent=Number.isFinite(qty)?'= '+fmtPrepQty(qty)+' '+(x&&x.unit||''):'';
  const btn=document.getElementById('prepReconPreContinue');
  if(btn)btn.disabled=!prepReconGateReady(prepReconGate);
}

function prepReconPreflightDone() {
  if(!prepReconGateReady(prepReconGate))return;
  prepReconGate.ready=true;startPrepBatchGate();
}

async function prepReconBaseline(row) {
  if(row.item.trackingMode==='unit'||row.item.trackingMode==='batch'){
    const units=await UnitEngine.prep.reconReadUnits(row.itemId);
    if(!units.length)throw new Error('Chưa có mã đang mở cho '+row.item.name);
    const pre=prepReconGate&&prepReconGate.targets||[];
    return {status:'pending',expected:row.expected,unit:row.item.unit,units:await Promise.all(units.map(async u=>({
      id:u.id,code:u.code,baseline:u.unitBase,heldAtBook:u.held||0,capacity:u.capacity,
      startCheckpoint:await UnitEngine.prep.reconCheckpointAtStart(u),
      preVerified:pre.some(x=>x.itemId===row.itemId&&x.id===u.id)})))};
  }
  const snap=await fstore.collection('inventory_items_gieogieo').doc(row.itemId).get();
  return {status:'pending',expected:row.expected,unit:row.item.unit,
    units:[{id:'__aggregate',code:'Tồn chung',baseline:Number(snap.data().currentStock)||0,capacity:0,
      preVerified:!!(prepReconGate&&prepReconGate.targets.some(x=>x.itemId===row.itemId&&x.id==='__aggregate'))}]};
}

async function prepReconCheckNewRisk(rows, gate) {
  const pre=gate&&gate.targets||[];
  for(const r of rows) {
    if(r.item.trackingMode==='unit'||r.item.trackingMode==='batch') {
      for(const {unit:u} of prepReconRiskUnits(await UnitEngine.prep.reconReadUnits(r.itemId),r.expected))
        if(!pre.some(x=>x.itemId===r.itemId&&x.id===u.id))
          throw new Error('Tồn '+r.item.name+' vừa thay đổi — cân trước lại rồi bắt đầu mẻ');
    }else{
      const doc=await fstore.collection('inventory_items_gieogieo').doc(r.itemId).get();
      if((Number(doc.data().currentStock)||0)<r.expected
          && !pre.some(x=>x.itemId===r.itemId&&x.id==='__aggregate'))
        throw new Error('Tồn '+r.item.name+' vừa xuống dưới lượng mẻ — cân trước lại');
    }
  }
}

// [NL-RECON] Cân mã mới ngay khi đổi mã. Phải quét mở ở Kho trước, sau đó về
// màn này ghi mốc TRƯỚC khi lấy từ mã mới; không suy mốc từ số đang còn sau dùng.
async function prepReconRegisterNew(batchId,itemId,unitId) {
  const doc=await fstore.collection('prep_batches_gieogieo').doc(batchId).get();
  if(!doc.exists)return;const b=doc.data(),row=b.reconcileInputs&&b.reconcileInputs[itemId];
  const it=KHO_ITEMS_CACHE.find(x=>x.id===itemId);
  if(!row||!it||row.status!=='pending')return;
  const live=(await UnitEngine.prep.reconReadUnits(itemId)).find(u=>u.id===unitId);
  if(!live){toast('⚠️ Mã mới chưa được quét mở');return;}
  const save=async(qty,lines)=>{
      const opId='prep_new_'+batchId+'_'+unitId;
      try{
        const checkpoint={stage:'new_open',at:vnDate().toISOString(),batchId,
          employeeId:b.staffEmployeeId||'',employeeName:b.staff||''};
        const changed=await UnitEngine.prep.reconSetUnit(itemId,unitId,qty,opId,live.unitBase,checkpoint,live.held||0);
        const delta=round2(qty-changed.before);
        if(Math.abs(delta)>0.005) await UnitEngine.ledger.apply({itemId,type:'ADJUSTMENT',qty:delta,
          note:'Cân mã mới trước khi dùng cho mẻ '+b.prepName+' · '+live.code,
          staff:b.staff,staffEmployeeId:b.staffEmployeeId,referenceId:batchId,
          deriveFromUnits:true,txId:opId,meta:{prepReconStage:'new_unit',containerId:unitId,weighings:lines,needsReview:true}});
        // [E4.6] Ghi mã mới vào mẻ đang đối chiếu — unit_engine.v1.js (prep.reconAddUnit).
        await UnitEngine.prep.reconAddUnit(batchId,itemId,{id:unitId,code:live.code,baseline:qty,heldAtBook:live.held||0,
          capacity:live.capacity,preVerified:true,preWeighings:lines,startCheckpoint:checkpoint});
        toast('✅ Đã ghi mốc mã mới — có thể lấy NL');openPrepReconForm(batchId,itemId);
      }catch(err){toast('❌ '+(err.message||err));}
    };
  if(prepReconIsCountable(it)) {
    const input=document.getElementById('reconNewCount_'+unitId);
    const value=input&&input.value;
    if(value===''||!Number.isInteger(Number(value))||Number(value)<0){toast('⚠️ Đếm số còn lại của mã mới');return;}
    await save(Number(value),[]);
  }else openWeighPad({itemId,unit:it.unit,title:'Cân TRƯỚC khi lấy · '+it.name+' · '+live.code,
    reconcileMode:true,allowZero:true,onDone:save});
}

async function prepReconOpenNext(batchId,itemId) {
  const st=prepReconForm;
  if(!st||st.batchId!==batchId||st.itemId!==itemId)return;
  const batchRef=fstore.collection('prep_batches_gieogieo').doc(batchId);
  const doc=await batchRef.get(),row=doc.data()&&doc.data().reconcileInputs&&doc.data().reconcileInputs[itemId];
  if(!row||row.status!=='pending'){prepFlowToastError(prepFlowError('NL đã được chốt','reload'));return;}
  const live=await UnitEngine.prep.reconReadUnits(itemId);
  if(live.some(u=>!row.units.some(x=>x.id===u.id))){toast('⚠️ Ghi mốc mã vừa mở trước khi quét tiếp');return;}
  const exhausted=row.units.find(u=>u.id!=='__aggregate'&&st.values[u.id]
    && Math.abs(st.values[u.id].qty)<0.005&&!(row.transitionCounts||{})[u.id]);
  if(!exhausted){toast('⚠️ Ghi số còn 0 của mã cũ trước khi mở mã tiếp theo');return;}
  if(st.values[exhausted.id].manual&&!(st.note||'').trim()){
    toast('⚠️ Nhập lý do khi ghi hết mã bằng tay');return;
  }
  if(typeof posScan!=='function'){toast('⚠️ Máy này chưa quét được');return;}
  const r=await posScan();if(!r.ok)return;
  const c=await UnitEngine.codes.find(r.code);
  if(!c||c.itemId!==itemId||c.status!=='sealed'){
    toast('⚠️ Quét đúng mã còn nguyên seal của nguyên liệu này');return;
  }
  try{
    // [E4.6] Ghi mốc "mã cũ đã hết" vào mẻ — unit_engine.v1.js (prep.reconMarkExhausted).
    await UnitEngine.prep.reconMarkExhausted(batchId,itemId,exhausted.id,{after:0,code:exhausted.code,at:vnDate().toISOString(),
      manual:!!st.values[exhausted.id].manual,reason:(st.note||'').trim(),
      weighings:st.values[exhausted.id].lines||[]});
  }catch(err){prepFlowToastError(err,'Không ghi được mốc mã cũ: ');return;}
  prepReconOpeningContext={batchId,itemId,exhaustedId:exhausted.id};
  openStockScanSheet(`<div class="wal-section" style="--gd:#0062AD;--gl:#EAF3FA;border:1.5px solid #0062AD;background:#EAF3FA">
    <div class="wal-section-title" style="color:#0062AD">Mở mã tiếp theo · ${escHtmlPos(c.itemName||'')}</div>
    <div>${escHtmlPos(c.code||'')} · ${fmtPrepQty(c.baseQty)} ${escHtmlPos(c.unit||'')}</div>
    <div style="font-size:12px;margin-top:8px">Sau khi mở, quay lại mẻ và ghi mốc ${prepReconIsCountable(KHO_ITEMS_CACHE.find(x=>x.id===itemId))?'đếm':'cân'} mã này <b>trước khi lấy</b>.</div></div>
    <div class="wal-section"><div class="wal-input-label">Lý do mở tiếp</div>
      <input id="openOverrideReason" value="Mẻ chế biến cần chuyển sang mã tiếp theo" style="width:100%;padding:11px;border:1px solid #0062AD;border-radius:10px"></div>
    <div class="wal-section">${renderPinInput('openCtStaff')}</div>
    <button onclick="submitOpenContainer('${c.id}',true)" style="width:100%;padding:15px;background:#0062AD;color:#fff;border:0;border-radius:12px">Xác nhận mở mã mới</button>
    <button onclick="prepReconOpeningContext=null;closeStockScanSheet()" style="width:100%;padding:12px;border:0;background:none;color:#0062AD">Quay lại</button>`);
}

// ── Màn "Đối chiếu NL sau khi lấy" — bố cục theo thứ bậc hành động:
//   · Mỗi mã chỉ có MỘT nút chính (Cân trừ bì / ô đếm). Việc phụ (Quét tem, Đã dùng hết)
//     là nút nhỏ dạng thẻ, không tranh chỗ với nút chính.
//   · "Mở mã mới" là dòng chữ phụ dưới danh sách — chỉ dùng khi mã đang dùng hết giữa chừng.
//   · Nút cuối "Chốt đối chiếu" xanh lá, to, tách hẳn ở dưới; chưa đủ điều kiện thì xám và
//     ghi rõ còn thiếu gì.
// [Bán trong lúc NL khoá cân] Khung cho nhân viên thấy hệ thống ĐÃ BIẾT những bill nào bán NL này trong lúc chờ cân
// (bill nào, món gì, bao nhiêu) — phần này đã được tách khỏi lượng mẻ dùng, không cần giải trình.
function prepReconWindowSalesHTML(list,unit) {
  if(!list||!list.length)return '';
  const total=round2(list.reduce((n,x)=>n+x.qty,0));
  const orderOf=id=>(typeof orders!=='undefined'?orders:[]).find(x=>x.id===id);
  const rows=list.slice(0,6).map(x=>{
    const o=orderOf(x.orderId),arr=o&&(o.itemsArray||o.items);
    const dishes=Array.isArray(arr)?[...new Set(arr.filter(i=>i&&!i.isFood).map(i=>i.name))].slice(0,3).join(', '):'';
    return `<div style="display:flex;justify-content:space-between;gap:10px;margin-top:5px;font-size:12.5px"><span style="min-width:0">${escHtmlPos((o&&o.billCode)||x.orderId)}${dishes?' · '+escHtmlPos(dishes):''}</span><b style="flex-shrink:0">${fmtPrepQty(x.qty)} ${unit}</b></div>`;
  }).join('');
  return `<div style="margin-top:12px;padding:12px;background:#F0F7FF;border:1.5px solid #bcd6ee;border-radius:14px;color:#004b86">
    <div style="font-size:13px;font-weight:800">🛒 Trong lúc chờ đã bán ${fmtPrepQty(total)} ${unit} (${list.length} bill)</div>
    <div style="font-size:12px;margin-top:2px;color:#33607f">Hệ thống đã trừ phần này khỏi lượng mẻ dùng — không cần giải trình.</div>
    ${rows}${list.length>6?`<div style="font-size:12px;margin-top:5px;color:#33607f">…và ${list.length-6} bill nữa</div>`:''}
  </div>`;
}

function prepReconFormHTML(c){
  const {it,b,row,batchId,itemId,finishedUnits,values,countable,multiCode,complete,changedLots,observed,diff,compared,residue,staleUnits,processingUncommitted,windowSales}=c;
  const blue='#0062AD', unit=escHtmlPos(row.unit||'');
  const pending=row.status==='pending';
  const units=row.units||[];
  const doneOf=u=>finishedUnits.has(u.id)||Number.isFinite(values[u.id]?.qty);
  const soXong=units.filter(doneOf).length;
  const needExplain=complete&&changedLots.length&&pending;
  const chip=(onclick,label,tone)=>{
    const t={amber:['#fff7ed','#b45309','#fdba74'],blue:['#fff',blue,'#9cc3e4'],ok:['#ecfdf5','#15803d','#86efac'],grey:['#fff','#6b6b6b','#ddd']}[tone||'grey'];
    return `<button onclick="${onclick}" style="padding:8px 12px;border-radius:99px;background:${t[0]};color:${t[1]};border:1.5px solid ${t[2]};font:800 12.5px 'Google Sans',sans-serif;cursor:pointer;white-space:nowrap">${label}</button>`;
  };
  const cards=units.map(u=>{
    const finished=finishedUnits.has(u.id),v=values[u.id],done=doneOf(u),low=u.id!=='__aggregate'&&UnitEngine.prep.reconIsLow(u);
    const status=finished?['Đã báo hết','#ad7542']:done?[countable?'Đã đếm':'Đã cân','#16834a']:[countable?'Chưa đếm':'Chưa cân','#9a9a9a'];
    const verified=v?.verifiedUnitId===u.id;
    let body='';
    if(finished) body=`<div style="margin-top:10px;font-size:13px;color:#8a4b16;font-weight:700">Đã báo hết · tính còn 0 ${unit}</div>`;
    else if(done) body=`<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px">
        <div><span style="font-size:12px;color:#999;font-weight:700">Còn lại</span><div style="font-size:26px;font-weight:900;color:#1f1f1f;line-height:1.1">${fmtPrepQty(v.qty)} <span style="font-size:14px;color:#999;font-weight:700">${unit}</span></div></div>
        ${pending&&!countable?chip(`prepReconWeigh('${u.id}')`,'Cân lại'):''}
      </div>`;
    if(!finished&&pending&&(countable||!done)){
      body+=countable
        ?`<div style="margin-top:10px">${prepCountInputsHtml('prepReconCnt_'+u.id,v,'onchange',"prepReconCount('"+u.id+"')")}</div>`
        :`<button onclick="prepReconWeigh('${u.id}')" style="width:100%;margin-top:12px;padding:15px;border-radius:14px;background:#1f1f1f;color:#fff;border:0;font:800 15.5px 'Google Sans',sans-serif;cursor:pointer">Cân trừ bì${multiCode?' · quét tem trước':''}</button>`;
    }
    const extra=[];
    if(!finished&&pending&&multiCode&&countable) extra.push(verified?chip('',"✓ Đã quét tem",'ok'):chip(`prepReconVerifyCode('${u.id}')`,'Quét tem','blue'));
    if(!finished&&pending&&u.id!=='__aggregate') extra.push(chip(`prepReconFinishUnit('${u.id}')`,'Đã dùng hết · quét tem',low?'amber':'grey'));
    return `<div style="padding:14px;background:#fff;border:1.5px solid ${done?'#cfe9d8':'#EDE8DD'};border-radius:18px;margin-top:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div style="min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <b style="font-size:16px;font-family:ui-monospace,Menlo,monospace;color:#1f1f1f">${escHtmlPos(u.code)}</b>
          ${low&&!finished?'<span style="padding:3px 8px;border-radius:99px;background:#fff7ed;color:#b45309;font-size:11px;font-weight:800">Sắp hết · dùng trước</span>':''}
        </div>
        <span style="flex-shrink:0;padding:4px 10px;background:${status[1]};color:#fff;border-radius:99px;font-size:12px;font-weight:800">${status[0]}</span>
      </div>
      ${body}
      ${extra.length?`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;padding-top:10px;border-top:1px dashed #EDE8DD">${extra.join('')}</div>`:''}
    </div>`;
  }).join('');
  const kind=c.varianceKind||'';
  const opt=(val,label)=>`<option value="${val}" ${kind===val?'selected':''}>${label}</option>`;
  const sur=compared&&compared.surplusLots&&compared.surplusLots.length?compared.surplusLots:null;
  const surplusPanel=sur?`<div style="margin-top:14px;padding:14px;background:#fffbeb;border:1.5px solid #fcd34d;border-radius:16px">
      <div style="font-size:14px;font-weight:800;color:#92400e">Thực tế NHIỀU HƠN sổ</div>
      <div style="font-size:13px;color:#78350f;margin-top:4px">${sur.map(l=>`Mã <b>${escHtmlPos(l.code)}</b>: cân ${fmtPrepQty(c.values[l.containerId]?.qty)} ${unit}, sổ chỉ ghi ${fmtPrepQty((row.units.find(x=>x.id===l.containerId)||{}).baseline)} ${unit} (hơn ${fmtPrepQty(l.qty)})`).join('<br>')}</div>
      <div style="font-size:12.5px;color:#92400e;margin-top:6px;line-height:1.5">Hệ thống hiểu sổ lần cân trước ghi thiếu. Mẻ này tính dùng đúng định mức <b>${fmtPrepQty(row.expected)} ${unit}</b>; tồn mã đặt theo số cân thật. Phần chênh vẫn tính cho người cân mốc trước${(()=>{const n=[...new Set(sur.map(l=>(row.units.find(x=>x.id===l.containerId)||{}).startCheckpoint).filter(Boolean).map(cp=>cp.employeeName).filter(Boolean))];return n.length?' (<b>'+n.map(escHtmlPos).join(', ')+'</b>)':'';})()} và được báo Quản lý.</div>
      <input placeholder="Ghi ngắn lý do (bắt buộc)" value="${escHtmlPos(c.note||'')}" oninput="prepReconForm.note=this.value;prepReconForm.varianceKind='book_understated'" style="width:100%;box-sizing:border-box;margin-top:8px;padding:11px;border:1.5px solid #fcd34d;border-radius:12px;background:#fff;color:#1f1f1f;font:600 14px 'Google Sans',sans-serif">
    </div>`:'';
  const explain=needExplain&&sur?surplusPanel:needExplain?`<div style="margin-top:14px;padding:14px;background:#fffbeb;border:1.5px solid #fcd34d;border-radius:16px">
      <div style="font-size:14px;font-weight:800;color:#92400e">Cần giải trình chênh lệch</div>
      <div style="font-size:13px;color:#78350f;margin-top:4px">Đã giảm <b>${fmtPrepQty(observed)} ${unit}</b> · so với định mức <b>${diff>0?'+':''}${fmtPrepQty(diff)} ${unit}</b></div>
      <div style="font-size:12.5px;color:#92400e;margin-top:4px">${changedLots.map(u=>`${escHtmlPos(u.code)}: ${u.delta>0?'+':''}${fmtPrepQty(u.delta)}`).join(' · ')}</div>
      <select onchange="prepReconForm.varianceKind=this.value" style="width:100%;margin-top:10px;padding:11px;border:1.5px solid #fcd34d;border-radius:12px;background:#fff;color:#1f1f1f;font:600 14px 'Google Sans',sans-serif">
        <option value="">Chọn nguyên nhân…</option>
        ${diff>0.015?opt('extra_usage','Mẻ dùng thêm')+opt('waste','Hao hụt khi nấu')+(compared.lotBreakdown.some(u=>u.delta>0.015&&!u.preVerified)?opt('prior_variance','Tồn thiếu từ mốc trước'):''):''}
        ${diff< -0.015?opt('under_usage','Mẻ dùng ít hơn'):''}
        ${Math.abs(diff)<=0.015?opt('lot_shift','Lấy khác thứ tự mã'):''}
        ${opt('uncertain','Tôi chịu trách nhiệm giải trình')}
      </select>
      <input placeholder="Ghi ngắn lý do" value="${escHtmlPos(c.note||'')}" oninput="prepReconForm.note=this.value" style="width:100%;box-sizing:border-box;margin-top:8px;padding:11px;border:1.5px solid #fcd34d;border-radius:12px;font:600 14px 'Google Sans',sans-serif">
    </div>`:'';
  const notice=(txt,btn)=>`<div style="margin-top:12px;padding:12px;background:#EAF3FA;border-radius:14px;color:#004b86;font-size:13px;display:flex;align-items:center;justify-content:space-between;gap:10px"><span>${txt}</span>${btn}</div>`;
  const blocked=staleUnits.length||processingUncommitted||(pending&&!complete);
  const hint=staleUnits.length?'Mốc mã đã đổi — nạp mốc trước':processingUncommitted?'Lượt chốt trước đang dở — bấm Thử lưu lại':(pending&&!complete)?`Còn ${units.length-soXong} mã chưa ${countable?'đếm':'cân'}`:'';
  return `<div class="kc-title">Đối chiếu nguyên liệu</div>
    <div class="kc-card" style="margin:0 0 12px">
      <div style="font-size:12px;font-weight:800;color:#999;text-transform:uppercase;letter-spacing:.4px">Cân/đếm phần còn lại sau khi lấy</div>
      <div style="font-size:23px;font-weight:900;color:#1f1f1f;margin-top:4px">${escHtmlPos(it.name||'Nguyên liệu')}</div>
      <div style="font-size:13px;font-weight:700;color:${blue};margin-top:3px">Mẻ ${escHtmlPos(b.prepName||'')} · cần ${fmtPrepQty(row.expected)} ${unit}</div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:12px">
        <div style="flex:1;height:8px;background:#F0EAD9;border-radius:99px;overflow:hidden"><div style="width:${units.length?Math.round(soXong/units.length*100):0}%;height:100%;background:#16a34a"></div></div>
        <span style="font-size:12.5px;font-weight:800;color:#555">${soXong}/${units.length} mã</span>
      </div>
      ${cards}
      ${units[0]&&units[0].id!=='__aggregate'&&pending?`<button onclick="prepReconOpenNext('${batchId}','${itemId}')" style="width:100%;margin-top:12px;padding:10px;background:none;border:1.5px dashed #9cc3e4;border-radius:14px;color:${blue};font:700 13px 'Google Sans',sans-serif;cursor:pointer">+ Mã đang dùng hết giữa chừng? Mở mã mới</button>`:''}
      ${prepReconWindowSalesHTML(windowSales,unit)}
      ${explain}
      ${residue&&pending?`<div style="margin-top:14px;padding:12px;background:#ecfdf5;border-radius:14px;color:#166534;font-size:13px">Đã giảm ${fmtPrepQty(observed)} ${unit} · vượt định mức ${fmtPrepQty(diff)} ${unit} — trong ngưỡng đáy bao, hệ thống tự ghi hao hụt, không cần giải trình.</div>`:''}
      ${staleUnits.length?notice('Mốc mã đã đổi.',chip(`prepReconRefreshStale('${batchId}','${itemId}')`,'Nạp mốc và cân lại','blue')):''}
      ${processingUncommitted?notice('Lượt chốt trước đang dở.',chip(`prepReconRetryUncommitted('${batchId}','${itemId}')`,'Thử lưu lại','blue')):''}
    </div>
    <div class="kc-card" style="margin:0 0 12px">${renderPinInput('prepReconStaff')}</div>
    ${hint?`<div style="text-align:center;font-size:12.5px;font-weight:700;color:#999;margin:0 0 8px">${hint}</div>`:''}
    <button id="prepReconSaveBtn" onclick="prepReconPostSave()" ${blocked?'disabled':''} style="width:100%;min-height:64px;padding:20px;background:${blocked?'#e5e7eb':'#16a34a'};color:${blocked?'#9ca3af':'#fff'};border:0;border-radius:99px;font:800 18px 'Google Sans',sans-serif;box-shadow:${blocked?'none':'0 6px 16px -6px rgba(22,163,74,.6)'};cursor:${blocked?'not-allowed':'pointer'}">${row.status==='processing'?'Tiếp tục lưu số đã cân':'✓ Chốt đối chiếu & mở khóa NL'}</button>
    <button onclick="openPrepBatchScreen()" style="width:100%;padding:13px;background:none;border:0;color:#999;font:700 13px 'Google Sans',sans-serif">‹ Quay lại mẻ đang nấu</button>`;
}

async function openPrepReconForm(batchId,itemId) {
  try{
    let doc=await fstore.collection('prep_batches_gieogieo').doc(batchId).get();
    if(!doc.exists)throw new Error('Không thấy mẻ');
    let b={id:batchId,...doc.data()},row=b.reconcileInputs&&b.reconcileInputs[itemId];
    if(!row||row.status==='done'){openPrepBatchScreen();return;}
    const live=row.units[0]?.id==='__aggregate'?[]:await UnitEngine.prep.reconReadUnits(itemId);
    // Mã mở ở tab Kho được đưa vào mẻ ngay khi mở. Nếu lần ghi đó rớt mạng,
    // gắn lại từ RT trước khi vẽ form; không để nhân viên cân nhầm tồn chung.
    for(const unit of live.filter(u=>!row.units.some(x=>x.id===u.id)))
      await UnitEngine.prep.reconAttachOpenUnit(batchId,itemId,unit.id);
    if(live.some(u=>!row.units.some(x=>x.id===u.id))){
      doc=await fstore.collection('prep_batches_gieogieo').doc(batchId).get();
      b={id:batchId,...doc.data()};row=b.reconcileInputs[itemId];
    }
    if(!prepReconForm||prepReconForm.batchId!==batchId||prepReconForm.itemId!==itemId)
      prepReconForm={batchId,itemId,values:{},note:row.note||'',varianceKind:row.varianceKind||''};
    if(row.status==='processing'&&row.submitted?.length){
      prepReconForm.note=row.note||'';
      prepReconForm.varianceKind=row.varianceKind||'';
      for(const u of row.submitted)prepReconForm.values[u.id]={qty:u.after,
        lines:u.weighings||[],manual:!!u.manual,verifiedUnitId:u.verifiedUnitId||u.id,
        finished:!!u.finished,
        ...(Number.isFinite(u.heldAtMeasure)?{book:u.bookBaseline??u.baseline,held:u.heldAtMeasure}:{})};
    }
    const it=KHO_ITEMS_CACHE.find(x=>x.id===itemId)||{};
    const countable=prepReconIsCountable(it);
    const finishedUnits=new Map();
    await Promise.all(row.units.filter(u=>u.id!=='__aggregate'&&!live.some(x=>x.id===u.id))
      .map(async u=>{
        const unitDoc=await fstore.collection(STOCK_CONTAINERS_COLL).doc(u.id).get();
        const data=unitDoc.data();
        if(unitDoc.exists&&data.status==='finished'&&data.prepReconPendingBatchId===batchId)
          finishedUnits.set(u.id,data);
      }));
    prepReconForm.finishedUnits=finishedUnits;
    // Số dự kiến còn lại của từng mã sau mẻ (trừ định mức lần lượt theo thứ tự
    // mã) — làm mốc suy phần lẻ khi nhân viên đếm "cái đang dùng dở".
    prepReconForm.countRefs={};
    {let left=Number(row.expected)||0;
      for(const u of row.units){const cur=live.find(x=>x.id===u.id),base=Number(cur?cur.unitBase:u.baseline)||0,take=Math.min(Math.max(0,left),Math.max(0,base));
        prepReconForm.countRefs[u.id]=round2(base-take);left-=take;}}
    const staleUnits=row.units.filter(u=>{
      if(u.id==='__aggregate')return false;
      const current=live.find(x=>x.id===u.id);
      if(!current)return !finishedUnits.has(u.id);
      const opId='prep_after_'+batchId+'_'+itemId+'_'+u.id;
      const submitted=(row.submitted||[]).find(x=>x.id===u.id);
      if(submitted && current.lastPrepReconOp===opId && Math.abs(current.unitBase-submitted.after)<=0.015)return false;
      // Tồn đổi vì BÁN trong lúc khoá (đã ghi bộ đếm saleHeld) không phải mốc lệch: mốc lúc cân/đầu mẻ trừ đúng phần đã bán.
      const v=prepReconForm.values[u.id],hasBook=v&&Number.isFinite(v.book);
      const book=hasBook?v.book:(u.bookBaseline??u.baseline),heldRef=hasBook?(v.held||0):(u.heldAtBook||0);
      return Math.abs(current.unitBase-(book-Math.max(0,(current.held||0)-heldRef)))>0.015;
    });
    // Mốc sổ dùng để tính lượng mẻ đã dùng: mốc chụp lúc cân (đã trừ phần bán trước lúc cân); mã đã báo hết thì
    // mốc lúc báo hết; còn lại mốc đầu mẻ.
    const bookOf=u=>{const v=prepReconForm.values[u.id];
      if(v&&Number.isFinite(v.book))return v.book;
      const f=finishedUnits.get(u.id);if(f&&Number.isFinite(Number(f.prepReconFinishBookBase)))return Number(f.prepReconFinishBookBase);
      return u.baseline;};
    const windowSales=await UnitEngine.prep.reconWindowSales(batchId,itemId).catch(()=>[]);
    const processingUncommitted=row.status==='processing' && row.units[0]?.id!=='__aggregate'
      && !row.units.some(u=>live.some(current=>current.id===u.id
        && current.lastPrepReconOp==='prep_after_'+batchId+'_'+itemId+'_'+u.id));
    for(const u of row.units)if(finishedUnits.has(u.id))
      prepReconForm.values[u.id]={qty:0,lines:[],verifiedUnitId:u.id,finished:true};
    const complete=row.units.every(u=>Number.isFinite(prepReconForm.values[u.id]?.qty));
    const observed=complete?round2(row.units.reduce((sum,u)=>sum+bookOf(u)-prepReconForm.values[u.id].qty,0)):0;
    const diff=round2(observed-row.expected);
    const compared=complete?prepReconClassifyUsage(row.units.map(u=>({
      id:u.id,code:u.code,baseline:bookOf(u),after:prepReconForm.values[u.id].qty,
      startCheckpoint:u.startCheckpoint,preVerified:u.preVerified
    })),row.expected,prepReconForm.varianceKind):null;
    const residue=compared?prepReconResidueAuto(row.units,finishedUnits,compared,row.expected):null;
    const changedLots=residue?[]:(compared?.lotBreakdown.filter(u=>Math.abs(u.delta)>0.015)||[]);
    const multiCode=row.units.filter(u=>u.id!=='__aggregate').length>1;
    const palette='#0062AD';
    const box=document.getElementById('prepBatchBody');
    prepSetBack(openPrepBatchScreen);
    // [v18 — phương án A] NL đang kẹt → khối "Tự chốt theo số cân hiện có" ở đầu màn.
    prepForcePrepare(await prepReconStuckReason(batchId,itemId,row),{batchId,itemId,it,b,row,live,finishedUnits,countable});
    box.innerHTML=prepForcePanelHTML()+prepReconFormHTML({it,b,row,batchId,itemId,finishedUnits,values:prepReconForm.values,countable,multiCode,
      complete,changedLots,observed,diff,compared,residue,staleUnits,processingUncommitted,windowSales,
      varianceKind:prepReconForm.varianceKind,note:prepReconForm.note});
    if(row.status==='processing'&&!processingUncommitted)toast('↩️ Đang tiếp tục lượt chốt số cân trước đó');
  }catch(err){toast('❌ '+(err.message||err));}
}

// Chỉ cho nạp lại mốc nếu lượt chốt CHƯA ghi bất kỳ mã/ledger nào. Như vậy
// số đã ghi thật ở RT/Firestore không bị tính lần nữa khi nhân viên cân lại.
async function prepReconRefreshStale(batchId,itemId) {
  if(_posSubmitBusy)return;
  _posSubmitBusy=true;
  try{
    // [E4.6] Nạp lại mốc / huỷ lượt chốt dở — unit_engine.v1.js (prep.reconRebase).
    const rebased=await UnitEngine.prep.reconRebase(batchId,itemId);
    if(rebased&&prepReconForm&&prepReconForm.batchId===batchId&&prepReconForm.itemId===itemId)
      prepReconForm.values={};
    toast(rebased?'✅ Đã hủy lượt chốt dở / nạp mốc tồn — cân lại rồi chốt':'Mốc đã khớp — kiểm tra số còn lại rồi chốt');
    await openPrepReconForm(batchId,itemId);
  }catch(err){prepFlowToastError(err);}
  finally{_posSubmitBusy=false;}
}

async function prepReconRetryUncommitted(batchId,itemId) {
  if(_posSubmitBusy)return;
  try{
    const batch=await fstore.collection('prep_batches_gieogieo').doc(batchId).get();
    const row=batch.data()&&batch.data().reconcileInputs&&batch.data().reconcileInputs[itemId];
    if(!row||row.status!=='processing'||!row.submitted?.length)
      throw prepFlowError('Lượt chốt đã thay đổi — mở lại mẻ đang nấu','reload');
    const live=await UnitEngine.prep.reconReadUnits(itemId);
    for(const u of row.submitted.filter(x=>x.finished)){
      const d=await fstore.collection(STOCK_CONTAINERS_COLL).doc(u.id).get();
      if(!d.exists||d.data().status!=='finished'||d.data().prepReconPendingBatchId!==batchId)
        throw prepFlowError('Mã đã báo hết đổi trạng thái — báo Quản lý kiểm tra','manager');
    }
    if(row.submitted.filter(u=>!u.finished).some(u=>{
      const current=live.find(x=>x.id===u.id);
      const op='prep_after_'+batchId+'_'+itemId+'_'+u.id;
      const sold=Math.max(0,(current?.held||0)-(Number.isFinite(u.heldAtMeasure)?u.heldAtMeasure:((row.units.find(x=>x.id===u.id)||{}).heldAtBook||0)));
      return !current||(current.lastPrepReconOp===op
        ? Math.abs(current.unitBase-(u.after-sold))>0.015
        : Math.abs(current.unitBase-((u.bookBaseline??u.baseline)-sold))>0.015);
    }))throw prepFlowError('Mốc mã đã đổi so với số cân đã lưu — mở lại mẻ để kiểm tra','reload');
    if(!prepReconForm||prepReconForm.batchId!==batchId||prepReconForm.itemId!==itemId)
      prepReconForm={batchId,itemId,values:{},note:row.note||'',varianceKind:row.varianceKind||''};
    await prepReconPostSave();
  }catch(err){prepFlowToastError(err);}
}

async function prepReconVerifyCode(unitId) {
  const st=prepReconForm;if(!st)return;
  try {
    const doc=await fstore.collection('prep_batches_gieogieo').doc(st.batchId).get();
    const row=doc.data()?.reconcileInputs?.[st.itemId];
    if(!row||row.status!=='pending')throw prepFlowError('Mẻ đã đổi trạng thái — mở lại màn đối chiếu','reload');
    const unit=row.units.find(u=>u.id===unitId);
    if(!unit)throw new Error('Mã này không còn trong mẻ');
    if(!await prepReconScanExact(st.itemId,unitId,unit.code))return;
    if(prepReconForm!==st)return;
    st.values[unitId]={...(st.values[unitId]||{}),verifiedUnitId:unitId};
    await openPrepReconForm(st.batchId,st.itemId);
  } catch(err){prepFlowToastError(err);}
}

// Báo hết một mã ngay trong màn cân sau khi lấy: bắt quét đúng tem đang mở (cầm
// đúng bao/chai rỗng), rồi đóng mã với dấu mẻ đang nấu — số sổ còn lại của mã được
// tính là đã lấy cho mẻ, chênh lệch đi qua bước đối chiếu (đáy bao tự ghi).
async function prepReconFinishUnit(unitId) {
  const st=prepReconForm;if(!st||_posSubmitBusy)return;
  try {
    const batchRef=fstore.collection('prep_batches_gieogieo').doc(st.batchId);
    const doc=await batchRef.get(),row=doc.data()?.reconcileInputs?.[st.itemId];
    if(!row||row.status!=='pending')throw prepFlowError('Mẻ đã đổi trạng thái — mở lại màn đối chiếu','reload');
    const unit=row.units.find(u=>u.id===unitId);
    if(!unit||unit.id==='__aggregate')throw new Error('Mã này không còn trong mẻ');
    if(st.finishedUnits?.has(unitId))throw new Error('Mã đã báo hết rồi');
    const staffEmp=await resolveStaffPinAndCheckin('prepReconStaff');
    if(!staffEmp)return;
    toast('📷 Quét tem '+unit.code+' để báo hết');
    if(!await prepReconScanExact(st.itemId,unitId,unit.code))return;
    if(prepReconForm!==st)return;
    const ref=fstore.collection(STOCK_CONTAINERS_COLL).doc(unitId);
    const cDoc=await ref.get();
    if(!cDoc.exists||cDoc.data().status!=='open')throw new Error('Mã '+unit.code+' không còn đang mở');
    _posSubmitBusy=true;
    try{ await UnitEngine.lifecycle.finish(unitId,{id:unitId,...cDoc.data()},staffEmp,'prep_reconcile',true,ref,st.batchId,true); }
    finally{ _posSubmitBusy=false; }
    st.values[unitId]={qty:0,lines:[],finished:true,verifiedUnitId:unitId};
    toast('✅ Đã báo hết '+unit.code);
    await openPrepReconForm(st.batchId,st.itemId);
  } catch(err){prepFlowToastError(err);}
}

// [Bán trong lúc NL khoá cân] Chụp mốc sổ + bộ đếm "đã bán" của mã NGAY LÚC cân/đếm xong: bước chốt tính lượng mẻ
// dùng theo mốc này (phần đã bán trước lúc cân đã nằm sẵn trong mốc), còn phần bán SAU lúc cân vẫn bị trừ.
async function prepReconSnapBook(itemId,unitId,target) {
  try{ const b=await UnitEngine.prep.reconBookOf(itemId,unitId); if(b){target.book=b.book;target.held=b.held;} }
  catch(err){console.warn('[NL-RECON] chưa chụp được mốc sổ lúc cân — dùng mốc đầu mẻ',unitId,err);}
}

async function prepReconCount(unitId) {
  const st=prepReconForm;if(!st)return;
  const c=prepCountReadInputs('prepReconCnt_'+unitId);
  const qty=c?prepCountPartsToQty(c.whole,c.partial,st.countRefs&&st.countRefs[unitId]):NaN;
  st.values[unitId]={...(st.values[unitId]||{}),qty,manual:true,lines:[],
    whole:c?c.whole:undefined,partial:c?c.partial:undefined};
  if(Number.isFinite(qty))await prepReconSnapBook(st.itemId,unitId,st.values[unitId]);
  openPrepReconForm(st.batchId,st.itemId);
}

async function prepReconWeigh(unitId) {
  const st=prepReconForm;if(!st)return;
  try {
    const doc=await fstore.collection('prep_batches_gieogieo').doc(st.batchId).get();
    const row=doc.data()?.reconcileInputs?.[st.itemId];
    if(!row||row.status!=='pending')throw prepFlowError('Mẻ đã đổi trạng thái — mở lại màn đối chiếu','reload');
    const unit=row.units.find(u=>u.id===unitId);
    if(!unit)throw new Error('Mã này không còn trong mẻ');
    if(st.finishedUnits?.has(unitId))throw new Error('Mã đã báo hết, không cân lại mã này');
    const multiCode=row.units.filter(u=>u.id!=='__aggregate').length>1;
    if(multiCode && !await prepReconScanExact(st.itemId,unitId,unit.code))return;
    if(prepReconForm!==st)return;
    const it=KHO_ITEMS_CACHE.find(x=>x.id===st.itemId);if(!it)return;
    openWeighPad({itemId:st.itemId,unit:it.unit,title:'Cân còn lại · '+it.name+' · '+unit.code,
      reconcileMode:true,allowZero:true,onDone:async(qty,lines)=>{
        if(prepReconForm!==st)return;
        st.values[unitId]={qty,lines,verifiedUnitId:multiCode?unitId:''};
        await prepReconSnapBook(st.itemId,unitId,st.values[unitId]);
        openPrepReconForm(st.batchId,st.itemId);
      }});
  } catch(err){prepFlowToastError(err);}
}

// [NL-RECON] Mỗi tem là một khoảng giữa hai mốc cân. Phân định mức theo FIFO
// của lượng THỰC giảm; mọi phần vượt định mức gắn đúng tem phát sinh và PIN
// người chốt mẻ. Nguyên nhân do nhân viên chọn, không tự suy là tem cũ hỏng.
// "Mẻ dùng thêm" đưa cả phần dư vào giá vốn của mẻ, không ghi hao hụt. Dùng thêm
// quá ngưỡng này so với định lượng thì gắn cờ để Quản lý duyệt trong quanlygieo
// (Tháng kết → Đối chiếu NL). POS không chặn, không đòi thêm mã.
const PREP_EXTRA_REVIEW_RATIO = 0.05;

function prepReconExtraNeedsReview(kind, observed, expected) {
  if (kind !== 'extra_usage') return false;
  const exp = Number(expected) || 0, extra = (Number(observed) || 0) - exp;
  if (extra <= 0.015) return false;
  return exp <= 0 || extra > exp * PREP_EXTRA_REVIEW_RATIO;
}

function prepReconClassifyUsage(submitted, expected, kind='') {
  let plannedLeft=Number(expected)||0,recipeLeft=Number(expected)||0;
  const lotBreakdown=submitted.map(u=>{
    const observed=round2(Math.max(0,u.baseline-u.after));
    const planned=round2(Math.min(Math.max(0,u.baseline),Math.max(0,plannedLeft)));
    plannedLeft=round2(plannedLeft-planned);
    const recipeQty=round2(Math.min(observed,Math.max(0,recipeLeft)));
    recipeLeft=round2(recipeLeft-recipeQty);
    return {containerId:u.id,code:u.code,baseline:u.baseline,after:u.after,
      observed,planned,delta:round2(observed-planned),recipeQty,extraQty:round2(observed-recipeQty),
      fromCheckpoint:u.startCheckpoint||null,preVerified:!!u.preVerified};
  });
  const observed=round2(lotBreakdown.reduce((n,u)=>n+u.observed,0));
  // [Cân ra NHIỀU HƠN sổ] Mã có số cân lớn hơn mốc sổ = sổ lần trước ghi thiếu (VD lần trước cân sai). Lượng mẻ
  // dùng không đo được → tính theo định mức; phần dư xử lý riêng (ghi điều chỉnh tăng + truy người cân mốc trước).
  const surplusLots=submitted.filter(u=>!u.finished&&u.after>u.baseline+0.015)
    .map(u=>({containerId:u.id,code:u.code,qty:round2(u.after-u.baseline)}));
  if(surplusLots.length){
    return {observed,variance:0,actual:round2(Number(expected)||0),
      allocations:lotBreakdown.filter(u=>u.planned>0.005).map(u=>({containerId:u.containerId,code:u.code,qty:u.planned})),
      varianceAllocations:[],lotBreakdown,shortfall:0,surplusLots};
  }
  const variance=kind==='extra_usage'?0:Math.max(0,round2(observed-expected));
  const actual=round2(observed-variance);
  const allocations=lotBreakdown.filter(u=>u.containerId!=='__aggregate')
    .map(u=>({containerId:u.containerId,code:u.code,
      qty:kind==='extra_usage'?u.observed:u.recipeQty})).filter(u=>u.qty>0.005);
  let varianceLeft=variance;
  const varianceAllocations=[];
  for(const u of lotBreakdown.filter(x=>x.delta>0.005).reverse()){
    const qty=round2(Math.min(u.delta,varianceLeft));
    if(qty>0.005)varianceAllocations.push({containerId:u.containerId,code:u.code,qty,
      fromCheckpoint:u.fromCheckpoint});
    varianceLeft=round2(varianceLeft-qty);
  }
  return {observed,variance,actual,allocations,varianceAllocations,lotBreakdown,
    shortfall:Math.max(0,round2(expected-observed))};
}

async function prepReconPostSave() {
  if(_posSubmitBusy)return;
  const st=prepReconForm;if(!st)return;
  _posSubmitBusy=true;
  // Khoá nút ngay khi bấm + hiện đang xử lý — lượt chốt ghi nhiều bước (RT, sổ kho), bấm
  // lần 2 lúc đang chờ mạng là dễ gây nhầm. Màn được vẽ lại sau khi xong/lỗi.
  const restoreBtn=setBtnBusy('prepReconSaveBtn','⏳ Đang chốt đối chiếu…');
  try{
    const ref=fstore.collection('prep_batches_gieogieo').doc(st.batchId);
    let doc=await ref.get(),b=doc.data(),row=b&&b.reconcileInputs&&b.reconcileInputs[st.itemId];
    if(!row||b.status!=='cooking')throw new Error('Mẻ không còn ở trạng thái đang nấu');
    if(row.status==='done'){await UnitEngine.prep.reconRelease(st.batchId,[st.itemId]);openPrepBatchScreen();return;}
    let submitted=row.submitted;
    if(row.status==='pending') {
      const live=row.units[0]&&row.units[0].id==='__aggregate'?[]:await UnitEngine.prep.reconReadUnits(st.itemId);
      if(live.some(u=>!row.units.some(x=>x.id===u.id)))throw new Error('Có mã mới chưa ghi mốc trước khi lấy');
      const finished=new Map();
      for(const u of row.units.filter(u=>u.id!=='__aggregate'&&!live.some(x=>x.id===u.id))){
        const snapshot=await fstore.collection(STOCK_CONTAINERS_COLL).doc(u.id).get();
        const data=snapshot.data();
        if(snapshot.exists&&data.status==='finished'&&data.prepReconPendingBatchId===st.batchId)
          finished.set(u.id,data);
      }
      if(row.units.some(u=>u.id!=='__aggregate'&&!live.some(x=>x.id===u.id)&&!finished.has(u.id)))
        throw prepFlowError('Một mã đã mất khỏi danh sách đang mở — kiểm tra tem trước khi chốt','manager');
      for(const u of row.units)if(finished.has(u.id))
        st.values[u.id]={qty:0,lines:[],finished:true,verifiedUnitId:u.id};
      if(row.units.some(u=>!st.values[u.id]||!Number.isFinite(st.values[u.id].qty)||st.values[u.id].qty<0))
        throw new Error('Cân phần còn lại của tất cả mã');
      if(row.units.filter(u=>u.id!=='__aggregate').length>1
          && row.units.some(u=>!finished.has(u.id)&&st.values[u.id].verifiedUnitId!==u.id))
        throw new Error('Có nhiều mã cùng mở — quét đúng tem từng mã trước khi cân/đếm');
      if(prepReconIsCountable(KHO_ITEMS_CACHE.find(x=>x.id===st.itemId))
          && row.units.some(u=>{const v=st.values[u.id];
            return v.whole!==undefined&&!(Number.isInteger(v.whole)&&Number.isInteger(v.partial));}))
        throw new Error('Số cái còn nguyên và đang dùng dở phải là số nguyên');
      const countable=prepReconIsCountable(KHO_ITEMS_CACHE.find(x=>x.id===st.itemId));
      if(!countable && row.units.some(u=>!finished.has(u.id)
          && (st.values[u.id].manual||!st.values[u.id].lines?.length)))
        throw new Error('Phải cân trừ bì từng mã; không được nhập số còn lại bằng tay');
      if(Object.keys(row.transitionCounts||{}).some(id=>!st.values[id]||Math.abs(st.values[id].qty)>0.005))
        throw new Error('Mã đã ghi hết khi chuyển sang mã mới phải giữ số còn 0');
      // [Bán trong lúc NL khoá cân] Mốc để tính lượng mẻ đã dùng = mốc sổ chụp NGAY LÚC cân/đếm mã đó (đã trừ phần
      // bán trước lúc cân); mã báo hết = mốc lúc báo hết; không chụp được thì dùng mốc đầu mẻ như cũ.
      submitted=row.units.map(u=>{
        const v=st.values[u.id]||{},fin=finished.get(u.id),hasBook=Number.isFinite(v.book);
        const book=hasBook?v.book:(fin&&Number.isFinite(Number(fin.prepReconFinishBookBase))?Number(fin.prepReconFinishBookBase):(u.bookBaseline??u.baseline));
        return {id:u.id,code:u.code,baseline:book,preVerified:!!u.preVerified,
          after:round2(v.qty),weighings:v.lines||[],manual:!!v.manual,
          verifiedUnitId:v.verifiedUnitId||'',finished:finished.has(u.id),
          bookBaseline:book,...(hasBook?{heldAtMeasure:v.held||0}:{}),startCheckpoint:u.startCheckpoint||null};
      });
      const changed=submitted.find(u=>{
        if(u.id==='__aggregate'||u.finished)return false;
        const cur=live.find(x=>x.id===u.id);if(!cur)return true;
        const heldRef=Number.isFinite(u.heldAtMeasure)?u.heldAtMeasure:((row.units.find(x=>x.id===u.id)||{}).heldAtBook||0);
        const sold=Math.max(0,(cur.held||0)-heldRef);
        if(!Number.isFinite(u.heldAtMeasure)&&sold>0.015)return true;   // có hàng bán mà không chụp được mốc lúc cân → cân lại
        return Math.abs(cur.unitBase-(u.bookBaseline-sold))>0.015;
      });
      if(changed){
        const current=live.find(x=>x.id===changed.id);
        const err=new Error(`Mã ${changed.code}: mốc ${fmtPrepQty(changed.baseline)}, tồn hiện ${current?fmtPrepQty(current.unitBase):'không còn mở'}. Nạp mốc mới và cân lại trước khi chốt.`);
        err.code='PREP_RECON_STALE';throw err;
      }
      // Số cân lớn hơn sổ KHÔNG còn bị chặn: chốt theo nhánh "sổ ghi thấp hơn thực tế" (xem prepReconClassifyUsage) —
      // tồn = số cân, mẻ dùng theo định mức, phần dư truy người cân mốc trước, báo Quản lý. Bắt buộc ghi lý do.
      const surplusMode=submitted.some(u=>!u.finished&&u.after>u.baseline+0.015);
      if(surplusMode)st.varianceKind='book_understated';
      let comparison=prepReconClassifyUsage(submitted,row.expected,st.varianceKind);
      const residue=prepReconResidueAuto(row.units,finished,comparison,row.expected);
      if(residue){st.varianceKind=residue.kind;st.note=residue.note;
        comparison=prepReconClassifyUsage(submitted,row.expected,st.varianceKind);}
      if(comparison.lotBreakdown.some(u=>Math.abs(u.delta)>0.015)&&!(st.note||'').trim())
        throw new Error('Một hoặc nhiều mã lệch định mức — ghi lý do trước khi chốt');
      const diff=round2(comparison.observed-row.expected);
      const kinds=surplusMode?['book_understated']:diff>0.015?['prior_variance','extra_usage','waste','uncertain']
        :diff< -0.015?['under_usage','uncertain']:['lot_shift','uncertain'];
      if(comparison.lotBreakdown.some(u=>Math.abs(u.delta)>0.015)&&!kinds.includes(st.varianceKind))
        throw new Error('Một hoặc nhiều mã lệch định mức — chọn nguyên nhân và nhận trách nhiệm');
      if(st.varianceKind==='prior_variance'
          && !comparison.lotBreakdown.some(u=>u.delta>0.015&&!u.preVerified))
        throw new Error('Không có mã thiếu tồn thuộc khoảng chưa cân trước — chọn nguyên nhân khác');
      const staffEmp=await resolveStaffPinAndCheckin('prepReconStaff');
      if(!staffEmp)return;
      const checkpointAt=vnDate().toISOString();
      submitted=submitted.map(u=>({...u,toCheckpoint:{stage:'after',at:checkpointAt,
        batchId:st.batchId,employeeId:staffEmp.id,employeeName:staffEmp.fullName}}));
      // [E4.6] Đánh dấu "đang chốt" + lưu số đã cân — unit_engine.v1.js (prep.reconMarkProcessing).
      await UnitEngine.prep.reconMarkProcessing(st.batchId,st.itemId,{submitted,note:(st.note||'').trim(),
        varianceKind:st.varianceKind||'',weighedBy:staffEmp.fullName,weighedById:staffEmp.id});
      doc=await ref.get();b=doc.data();row=b.reconcileInputs[st.itemId];submitted=row.submitted;
    }
    // [E4.6] Chốt đối chiếu (ghi số từng mã, sổ hao hụt/tiêu hao, vết mẻ, đóng tem đã báo hết,
    // nhả khoá) — unit_engine.v1.js (prep.reconCommit). Idempotent theo opId/txId cố định.
    const {actual}=await UnitEngine.prep.reconCommit(st.batchId,st.itemId,{b,row,submitted});
    prepReconForm=null;toast('✅ Đã đối chiếu '+actual+' '+row.unit+' và mở khóa NL');
    refreshFifoAlert().catch(()=>{});
    openPrepBatchScreen();
  }catch(err){
    if(err.kind){prepFlowToastError(err);}
    else{
      toast('❌ '+(err.message||err));
      if(['PREP_RECON_STALE','PREP_RECON_RETRY'].includes(err.code)) await openPrepReconForm(st.batchId,st.itemId);
    }
  }
  finally{_posSubmitBusy=false;restoreBtn();}
}

// ══════════════════════════════════════════════════════════════════════════
// [v18 — PHƯƠNG ÁN A, chủ dự án chốt 01/10/2026] TỰ CHỐT NL KHI ĐỐI CHIẾU BỊ KẸT
// Trước đây gặp lỗi loại "báo Quản lý" (mã mất khỏi danh sách đang mở, lượt chốt ghi dở rồi tồn đổi...) thì mẻ kẹt
// vĩnh viễn: không Hoàn thành/Huỷ được, NL khoá (chặn nấu mẻ mới dùng NL đó, chặn cân cuối ca) mà Quản lý cũng
// không có nút gỡ. Nay nhân viên tự gỡ ngay trên POS: cân/đếm lại MỌI mã đang mở của NL rồi bấm chốt — engine đặt
// tồn mã = số cân, ghi phần mẻ dùng + phần chênh ("chưa quy", Sổ lệch), mở khoá NL và báo Quản lý
// (UnitEngine.prep.reconForceSettle). Chỉ hiện khi NL thật sự đang kẹt (đã gặp lỗi đó, hoặc cảnh báo kẹt còn mở).
// ══════════════════════════════════════════════════════════════════════════
let _prepForce = null;

async function prepReconStuckReason(batchId, itemId, row) {
  if (!row || row.status === 'done' || (row.units || [])[0]?.id === '__aggregate') return '';
  const key = batchId + '|' + itemId;
  if (_prepReconStuck[key]) return _prepReconStuck[key];
  try {
    const d = await fstore.collection('alerts_gieogieo').doc(prepBlockedAlertId(batchId, itemId)).get();
    if (d.exists && d.data().status === 'new') return (_prepReconStuck[key] = String(d.data().message || 'Đối chiếu NL bị kẹt'));
  } catch (err) { console.warn('[Tự chốt] không đọc được cảnh báo kẹt', err); }
  return '';
}

function prepForcePrepare(msg, c) {
  if (!msg) { _prepForce = null; return; }
  const key = c.batchId + '|' + c.itemId;
  const cu = _prepForce && _prepForce.key === key ? _prepForce : null;
  const live = c.live || [];
  _prepForce = {
    key, batchId: c.batchId, itemId: c.itemId, itemName: (c.it && c.it.name) || '', unit: (c.it && c.it.unit) || c.row.unit || '',
    batchName: c.b.prepName || '', countable: !!c.countable, multi: live.length > 1, msg,
    units: live.map(u => { const o = cu && cu.units.find(x => x.id === u.id); return o || { id: u.id, code: u.code, book: u.unitBase, qty: null, held: null, lines: [], manual: false, verified: false }; }),
    vanished: (c.row.units || []).filter(u => u.id !== '__aggregate' && !live.some(x => x.id === u.id) && !c.finishedUnits.has(u.id)).map(u => ({ id: u.id, code: u.code })),
    finished: (c.row.units || []).filter(u => c.finishedUnits.has(u.id)).map(u => ({ id: u.id, code: u.code }))
  };
}

function prepForceUnitsHTML() {
  const f = _prepForce; if (!f) return '';
  const unit = escHtmlPos(f.unit);
  const rows = f.units.map((u, j) => {
    let right;
    if (Number.isFinite(u.qty)) right = `<b style="color:#b91c1c">${fmtPrepQty(u.qty)} ${unit}</b><button onclick="prepForceRedo(${j})" style="margin-left:8px;padding:7px 11px;border-radius:10px;border:1px solid #b91c1c;background:#fff;color:#b91c1c;font-size:12.5px;font-weight:700">${f.countable ? 'Đếm lại' : 'Cân lại'}</button>`;
    else if (f.countable) right = `<input id="prepForceCount_${j}" type="number" inputmode="decimal" min="0" step="0.01" placeholder="Còn lại" style="width:90px;padding:9px;border:1.5px solid #b91c1c;border-radius:10px">
        <button onclick="prepForceMeasure(${j})" style="margin-left:6px;padding:9px 12px;border-radius:10px;border:0;background:#b91c1c;color:#fff;font-weight:800">Lưu</button>`;
    else right = `<button onclick="prepForceMeasure(${j})" style="padding:10px 16px;border-radius:10px;border:0;background:#b91c1c;color:#fff;font-weight:800">⚖️ Cân</button>`;
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 0;border-top:1px dashed #fca5a5">
      <span style="font-size:14px"><b>mã ${escHtmlPos(u.code)}</b><br><span style="font-size:12px;color:#7f1d1d">sổ hiện ${fmtPrepQty(u.book)} ${unit}${f.multi && !u.verified && !Number.isFinite(u.qty) ? ' · quét đúng tem trước' : ''}</span></span>
      <span style="text-align:right;white-space:nowrap">${right}</span></div>`;
  }).join('');
  const other = f.finished.map(u => `<div style="font-size:12.5px;color:#7f1d1d;padding:4px 0">mã ${escHtmlPos(u.code)} — đã báo hết trong mẻ (tính vào mẻ)</div>`).join('')
    + f.vanished.map(u => `<div style="font-size:12.5px;color:#7f1d1d;padding:4px 0">mã ${escHtmlPos(u.code)} — không còn mở, không cân được (ghi Sổ lệch)</div>`).join('');
  return rows + other;
}

function prepForcePanelHTML() {
  const f = _prepForce; if (!f) return '';
  const xong = f.units.every(u => Number.isFinite(u.qty));
  return `<div id="prepForcePanel" class="kc-card" style="margin:0 0 12px;border:2px solid #fca5a5;background:#fef2f2">
    <div style="font-size:16px;font-weight:900;color:#b91c1c">⚠️ Không chốt bình thường được</div>
    <div style="font-size:13px;color:#7f1d1d;margin-top:6px;line-height:1.5">Lý do: ${escHtmlPos(f.msg)}</div>
    <div style="font-size:13px;color:#7f1d1d;margin-top:6px;line-height:1.5">Tự chốt: ${f.countable ? 'đếm' : 'cân'} lại <b>các mã đang mở</b> của ${escHtmlPos(f.itemName)} rồi bấm nút dưới. Tồn mã đặt theo số ${f.countable ? 'đếm' : 'cân'}; phần không khớp ghi Sổ lệch (chưa quy cho ai) và báo Quản lý. NL được mở khoá, mẻ Hoàn thành / Huỷ như thường.</div>
    <div id="prepForceUnits" style="margin-top:8px">${prepForceUnitsHTML()}</div>
    <div style="margin-top:10px">${renderPinInput('prepForceStaff')}</div>
    <button id="prepForceBtn" onclick="prepForceSubmit()" ${xong ? '' : 'disabled'} style="width:100%;min-height:56px;margin-top:10px;background:${xong ? '#b91c1c' : '#e5e7eb'};color:${xong ? '#fff' : '#9ca3af'};border:0;border-radius:99px;font:800 16px 'Google Sans',sans-serif">Chốt theo số ${f.countable ? 'đếm' : 'cân'} hiện có</button>
  </div>`;
}

function prepForceRerender() {
  const f = _prepForce, box = document.getElementById('prepForceUnits'), btn = document.getElementById('prepForceBtn');
  if (box) box.innerHTML = prepForceUnitsHTML();
  if (btn && f) {
    const xong = f.units.every(u => Number.isFinite(u.qty));
    btn.disabled = !xong; btn.style.background = xong ? '#b91c1c' : '#e5e7eb'; btn.style.color = xong ? '#fff' : '#9ca3af';
  }
}

function prepForceRedo(j) {
  const u = _prepForce && _prepForce.units[j]; if (!u) return;
  Object.assign(u, { qty: null, held: null, lines: [], manual: false });
  prepForceRerender();
}

async function prepForceMeasure(j) {
  const f = _prepForce, u = f && f.units[j]; if (!u) return;
  if (f.multi && !u.verified) {   // nhiều mã cùng mở: quét đúng tem trước khi cân/đếm — không lấy số của mã khác
    try { if (!await prepReconScanExact(f.itemId, u.id, u.code)) return; u.verified = true; }
    catch (err) { toast('❌ Không kiểm tra được tem: ' + (err.message || err)); return; }
  }
  if (f.countable) {
    const el = document.getElementById('prepForceCount_' + j), v = el ? el.value : '';
    if (v === '' || !(Number(v) >= 0)) { toast('⚠️ Nhập số còn lại của mã ' + u.code); return; }
    return prepForceSet(j, Number(v), [], true);
  }
  openWeighPad({ itemId: f.itemId, unit: f.unit, title: 'Cân lại · ' + f.itemName + ' · ' + u.code, reconcileMode: true, allowZero: true,
    onDone: (qty, lines) => prepForceSet(j, qty, lines, false) });
}

// Ghi số cân/đếm + chụp bộ đếm "đã bán trong lúc khoá" NGAY LÚC đó (engine trừ phần bán sau lúc cân).
async function prepForceSet(j, qty, lines, manual) {
  const f = _prepForce, u = f && f.units[j]; if (!u) return;
  let bk = null;
  try { bk = await UnitEngine.prep.reconBookOf(f.itemId, u.id); }
  catch (err) { toast('❌ Không đọc được tồn hiện tại của mã — kiểm tra mạng rồi cân lại'); return; }
  if (!bk) { toast('⚠️ Mã ' + u.code + ' không còn đang mở — đã tải lại màn'); openPrepReconForm(f.batchId, f.itemId); return; }
  Object.assign(u, { qty: round2(Number(qty) || 0), lines: lines || [], manual: !!manual, held: bk.held, book: bk.book });
  prepForceRerender();
}

async function prepForceSubmit() {
  const f = _prepForce; if (!f) return;
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  const chua = f.units.find(u => !Number.isFinite(u.qty));
  if (chua) { toast('⚠️ ' + (f.countable ? 'Đếm' : 'Cân') + ' mã ' + chua.code + ' trước'); return; }
  const staffEmp = await resolveStaffPinAndCheckin('prepForceStaff');
  if (!staffEmp) return;
  const ds = f.units.map(u => '• mã ' + u.code + ': sổ ' + fmtPrepQty(u.book) + ' → ' + (f.countable ? 'đếm ' : 'cân ') + fmtPrepQty(u.qty) + ' ' + f.unit).join('\n');
  if (!(await posConfirm(`Tự chốt ${f.itemName} của mẻ ${f.batchName} theo số ${f.countable ? 'đếm' : 'cân'} hiện có?\n\n${ds}${f.vanished.length ? '\n• ' + f.vanished.length + ' mã không còn mở → ghi Sổ lệch' : ''}\n\nPhần không khớp ghi Sổ lệch và báo Quản lý.`,
    { okText: 'Chốt', cancelText: 'Không' }))) return;
  _posSubmitBusy = true;
  const restoreBtn = setBtnBusy('prepForceBtn', '⏳ Đang chốt...');
  try {
    const kq = await UnitEngine.prep.reconForceSettle(f.batchId, f.itemId, { staffEmp, reason: f.msg,
      units: f.units.map(u => ({ unitId: u.id, qty: u.qty, lines: u.lines || [], heldAt: u.held, manual: !!u.manual })) });
    // Cảnh báo "kẹt" đã được xử lý bằng tự chốt — chỉ cập nhật nếu có (update không tạo doc mới).
    fstore.collection('alerts_gieogieo').doc(prepBlockedAlertId(f.batchId, f.itemId))
      .update({ status: 'resolved', resolvedBy: 'pos_force_settle', resolvedByName: staffEmp.fullName, resolvedAt: vnDate().toISOString() }).catch(() => {});
    delete _prepReconStuck[f.key];
    _prepForce = null; prepReconForm = null;
    toast(kq && kq.already ? 'ℹ️ Nguyên liệu này đã được chốt rồi' : `✅ Đã tự chốt ${f.itemName} — NL đã mở khoá, đã báo Quản lý`);
    refreshFifoAlert().catch(() => {});
    openPrepBatchScreen();
  } catch (err) {
    console.error('prepForceSubmit', err);
    toast('❌ ' + (err.message || err));
    if (err && err.code === 'PREP_FORCE_UNWEIGHED') openPrepReconForm(f.batchId, f.itemId);
  } finally { _posSubmitBusy = false; restoreBtn(); }
}

// Bấm "Bắt đầu chế biến" đi qua đây trước — công thức không có nguyên liệu
// "cái" nào thì bắt đầu luôn như cũ, khỏi làm phiền vô ích.
async function startPrepBatchGate() {
  const p = PREP_ITEMS_CACHE_POS.find(x => x.id === prepBatchState.prepId);
  if (!p) { toast('⚠️ Chưa chọn thành phẩm'); return; }
  if (!(prepBatchState.ratio > 0)) { toast('⚠️ Tỷ lệ mẻ phải lớn hơn 0'); return; }
  try { if(!(await prepReconBeforeGate(p,prepBatchState.ratio)))return; }
  catch(err){ toast('⚠️ '+(err.message||err)); return; }
  const requirements = computeAtomicRequirementsForPrep(p, prepBatchState.ratio);
  if (!requirements.length) { startPrepBatch(); return; }
  // Xác thực PIN NGAY Ở ĐÂY (một lần), vì màn quét tiếp theo không còn ô PIN —
  // quét xong bấm "Bắt đầu chế biến thật" sẽ dùng lại đúng người này.
  const staffEmp = await resolveStaffPinAndCheckin('prepBatchStaff');
  if (!staffEmp) return;
  prepStartScanState = {
    prepId: p.id, ratio: prepBatchState.ratio, staffEmp,
    requirements: requirements.map(r => ({ ...r, scannedIds: [] }))
  };
  savePrepStartScanState();
  renderPrepStartScanGate();
}

function renderPrepStartScanGate() {
  const box = document.getElementById('prepBatchBody');
  prepSetBack(cancelPrepStartGate);
  const st = prepStartScanState;
  if (!st || !box) { renderPrepBatchForm(); return; }
  const p = PREP_ITEMS_CACHE_POS.find(x => x.id === st.prepId);
  const allDone = st.requirements.every(r => r.scannedIds.length >= r.required);
  box.innerHTML = `
    <div class="wal-section" style="margin:0 0 14px;border:1.5px solid #fdba74;background:#fff7ed;">
      <div class="wal-section-title" style="color:#9a3412;">📦 Quét mã nguyên liệu trước khi nấu</div>
      <div style="font-size:12.5px;color:#9a3412;line-height:1.6;margin-bottom:12px;">
        ${p ? escHtmlPos(p.name || '') : ''} — nấu ${fmtPrepQty(st.ratio)} mẻ. Vui lòng quét đủ mã nguyên liệu dưới đây rồi mới tiến hành chế biến mẻ này.
      </div>
      ${st.requirements.map((r, idx) => {
        const done = r.scannedIds.length >= r.required;
        const remain = Math.max(0, r.required - r.scannedIds.length);
        return `
        <div style="padding:12px 0;${idx === 0 ? '' : 'border-top:1px solid #fdba74;'}">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
            <div style="min-width:0;">
              <div style="font-size:14.5px;font-weight:700;color:var(--td);">${escHtmlPos(r.name)}${r.wholePack ? ` <span style="font-size:12.5px;color:#9a3412;">· ${r.required} ${escHtmlPos(r.packName)} còn nguyên (1 ${escHtmlPos(r.packName)} = ${fmtPrepQty(r.wholePack)} ${escHtmlPos(r.unit)})</span>` : ''}</div>
              <div style="font-size:13px;font-weight:700;color:${done ? '#16a34a' : '#c2410c'};margin-top:3px;">
                ${done ? ('✅ Đã quét đủ ' + r.required) : ('Đã quét ' + r.scannedIds.length + '/' + r.required + ' — còn thiếu ' + remain + ', quét tiếp tục')}
              </div>
            </div>
            <button onclick="prepStartGateScan('${r.itemId}')" ${done ? 'disabled' : ''} style="flex-shrink:0;padding:14px 18px;min-height:52px;min-width:96px;background:${done ? '#e5e7eb' : 'var(--gd)'};color:${done ? '#9ca3af' : '#fff'};border:none;border-radius:14px;font-family:'Google Sans',sans-serif;font-weight:700;font-size:14.5px;cursor:${done ? 'default' : 'pointer'};white-space:nowrap;">${done ? '✅ Xong' : '🔍 Quét mã'}</button>
          </div>
        </div>`;
      }).join('')}
    </div>
    <button id="prepStartBtn" onclick="confirmPrepStartAfterScan()" ${allDone ? '' : 'disabled'} style="width:100%;padding:16px;min-height:54px;background:${allDone ? 'var(--gd)' : '#e5e7eb'};color:${allDone ? '#fff' : '#9ca3af'};border:none;border-radius:14px;font-family:'Google Sans',sans-serif;font-weight:700;font-size:16px;cursor:${allDone ? 'pointer' : 'not-allowed'};">${allDone ? '🔥 Đã quét đủ — Bắt đầu chế biến' : 'Quét đủ mã ở trên để tiếp tục'}</button>
    <button onclick="cancelPrepStartGate()" style="width:100%;padding:13px;min-height:48px;background:none;border:1px solid #ddd;color:#888;border-radius:14px;font-family:'Google Sans',sans-serif;font-weight:700;font-size:14px;cursor:pointer;margin-top:8px;">← Huỷ, quay lại</button>
  `;
}

async function prepStartGateScan(itemId) {
  const st = prepStartScanState;
  if (!st) return;
  const reqRow = st.requirements.find(r => r.itemId === itemId);
  if (!reqRow || reqRow.scannedIds.length >= reqRow.required) return;
  if (typeof posScan !== 'function') { toast('⚠️ Máy này chưa quét được'); return; }
  const r = await posScan();
  if (!r.ok) { if (r.error !== 'cancelled') toast('⚠️ ' + posScanErrorText(r.error)); return; }
  const c = await UnitEngine.codes.find(r.code);
  if (chanMaTrung(c)) return;
  if (!c) { toast('❌ Không có mã ' + r.code + ' trong hệ thống'); return; }
  if (c.itemId !== itemId) {
    toast('⚠️ Mã này là "' + (c.itemName || '') + '", không phải "' + reqRow.name + '" — quét đúng mã của nguyên liệu đang cần');
    return;
  }
  if (c.status === 'voided') { toast('⛔ ' + c.code + ' đã bị huỷ (phiếu nhận ghi thừa) — bóc tem này bỏ đi, đừng dùng'); return; }
  if (c.status === 'lost') { toast('⚠️ ' + c.code + ' đang ở trạng thái "báo mất" — dùng nút "Quét mã hàng tìm lại được" ở Kiểm kê để phục hồi'); return; }
  if (c.status === 'finished') { toast('ℹ️ ' + c.code + ' đã báo hết trước đó'); return; }
  if (c.status !== 'sealed' && c.status !== 'open') { toast('⚠️ ' + c.code + ' đang chờ xử lý huỷ — không dùng được'); return; }
  if (reqRow.wholePack) {
    // [NẤU NGUYÊN GÓI] chỉ nhận gói CHƯA MỞ, đúng quy cách (công thức dùng trọn gói — không có gói dở).
    if (c.status !== 'sealed') { toast('⚠️ ' + c.code + ' đã mở — mẻ này dùng nguyên ' + reqRow.packName + ', quét ' + reqRow.packName + ' còn nguyên'); return; }
    if (Math.abs((Number(c.baseQty) || 0) - reqRow.wholePack) > 0.005) {
      toast('⚠️ Tem ' + c.code + ' là ' + fmtPrepQty(c.baseQty) + ' ' + (c.unit || '') + ', không phải 1 ' + reqRow.packName + ' (' + fmtPrepQty(reqRow.wholePack) + ' ' + reqRow.unit + ')'); return;
    }
  } else if (!isAtomicUnitContainer(c)) { toast('⚠️ ' + c.code + ' không phải nguyên liệu đếm theo "cái" — không dùng ở bước này'); return; }
  if (reqRow.scannedIds.includes(c.id) || st.requirements.some(rr => rr.scannedIds.includes(c.id))) {
    toast('⚠️ Mã ' + c.code + ' vừa được quét rồi, không tính thêm lần nữa'); return;
  }
  // [SỬA — xem ghi chú đầu file ở khai báo prepStartScanState] KHÔNG ghi 'finished'
  // lên Firestore ngay lúc quét nữa — chỉ nhớ tạm mã đã quét (và lưu localStorage) để
  // tem vẫn còn nguyên 'sealed' nếu lỡ thoát ra bán hàng ưu tiên rồi quay lại quét
  // tiếp. Hệ thống chỉ thật sự báo "đã mở & hết" khi quét đủ và tự động chuyển sang
  // chế biến ngay bên dưới (xem confirmPrepStartAfterScan).
  reqRow.scannedIds.push(c.id);
  // [MỚI — FIX "KIT bột sữa/Sữa gạo quét rồi mà Chi tiết lô không thấy tem"] Giữ lại
  // luôn mã + đơn vị của tem vừa quét, không chỉ mỗi id — xem lý do đầy đủ ở
  // confirmPrepStartAfterScan().
  (reqRow.scannedContainers = reqRow.scannedContainers || []).push({ id: c.id, code: c.code || '', unit: c.unit || '', baseQty: Number(c.baseQty) || 1 });
  savePrepStartScanState();
  toast('✅ Đã quét ' + c.code);
  const allDone = st.requirements.every(x => x.scannedIds.length >= x.required);
  if (allDone) {
    // [MỚI] Quét đủ là TỰ ĐỘNG chuyển sang chế biến luôn — không bắt bấm thêm nút nào
    // nữa (nhân viên quên bấm "Bắt đầu chế biến" sau khi quét đủ chính là vòng lặp lỗi
    // ban đầu: quét đủ rồi bỏ dở, quay lại bị bắt quét lại).
    toast('🔥 Đã quét đủ — tự động bắt đầu chế biến...');
    await confirmPrepStartAfterScan();
    return;
  }
  renderPrepStartScanGate();
}

async function confirmPrepStartAfterScan() {
  const st = prepStartScanState;
  if (!st) return;
  if (!st.requirements.every(r => r.scannedIds.length >= r.required)) { toast('⚠️ Quét đủ mã trước khi bắt đầu'); return; }
  const staffEmp = st.staffEmp;
  // [MỚI] Gom lại ĐÚNG những tem đã quét ở cổng này, gắn vào lô sắp tạo (xem
  // _startPrepBatchImpl) — để lỡ sau này bấm "Huỷ mẻ" thì biết đường hoàn lại đúng
  // những tem đó về 'sealed', thay vì để chúng kẹt vĩnh viễn ở 'finished' dù mẻ
  // chưa từng thực sự nấu (xem _reverseAtomicContainerFinish).
  const scannedContainerIds = st.requirements.reduce((acc, r) => acc.concat(r.scannedIds), []);
  // [MỚI — FIX "KIT bột sữa/Sữa gạo quét rồi mà Chi tiết lô không thấy tem"] Trước đây
  // scannedContainerIds bị GỘP PHẲNG mất luôn liên kết itemId -> tem nào, nên
  // _startPrepBatchImpl không có gì để ghi vào inputTrace[itemId].allocations ngoài
  // mảng rỗng — Chi tiết lô hiện "KIT..." mà không có "Xem tem" lẫn nhãn "Không gắn
  // tem" (vì untracked cũng bị tính sai thành false). Giữ NGUYÊN scannedContainerIds
  // phẳng cho đúng mục đích cũ của nó (hoàn tem lúc "Huỷ mẻ"), chỉ THÊM map theo
  // itemId để nối đúng tem vào đúng nguyên liệu trong inputTrace.
  const atomicAllocationsByItem = {};
  st.requirements.forEach(r => {
    atomicAllocationsByItem[r.itemId] = (r.scannedContainers || []).map(c => ({
      containerId: c.id, code: c.code, itemName: r.name || '', unit: c.unit || '', qty: r.wholePack ? (Number(c.baseQty) || r.wholePack) : 1
    }));
  });

  // [MỚI] Giờ mới THẬT SỰ báo "đã mở & hết" lên hệ thống cho từng tem đã quét — trước
  // đó (prepStartGateScan) chỉ nhớ tạm, không ghi gì lên Firestore. Đọc lại trạng thái
  // mới nhất trước khi chốt, phòng trường hợp hiếm: tem bị đổi trạng thái ở nơi khác
  // trong lúc đang bỏ dở (ví dụ bị báo mất/huỷ phiếu nhận).
  const allScanned = [];
  st.requirements.forEach(r => (r.scannedContainers || []).forEach(c => allScanned.push({ ...c, reqRow: r })));
  for (const sc of allScanned) {
    let cData;
    try {
      const cDoc = await fstore.collection(STOCK_CONTAINERS_COLL).doc(sc.id).get();
      if (!cDoc.exists) { toast('❌ Mã ' + sc.code + ' không còn tồn tại — bấm huỷ và quét lại'); renderPrepStartScanGate(); return; }
      cData = { id: cDoc.id, ...cDoc.data() };
      // 'open' (cái rời lỡ bị quét mở ở Kho) vẫn dùng được — writeAtomicContainerFinish tự gỡ RT.
      // [NẤU NGUYÊN GÓI] gói phải còn nguyên tới lúc chốt — bị mở ở nơi khác trong lúc chờ thì quét lại.
      const goiDaMo = sc.reqRow.wholePack && cData.status === 'open';
      if (goiDaMo || (cData.status !== 'sealed' && cData.status !== 'open')) {
        // [FIX] Bấm lại sau khi lượt trước lỡ đứt mạng giữa chừng (một số mã đã kịp
        // ghi 'finished', số khác thì chưa) — mã NÀY đã do chính người này chốt xong ở
        // lượt trước rồi thì coi là ổn, bỏ qua chứ không báo lỗi/bắt huỷ lại từ đầu.
        const daXongTuTruoc = cData.status === 'finished' && cData.finishScanned && cData.finishedByEmployeeId === staffEmp.id;
        if (!daXongTuTruoc) {
          toast('⚠️ Mã ' + sc.code + ' đã đổi trạng thái (' + (cData.status || '?') + ') trong lúc chờ — bấm huỷ, quét lại từ đầu');
          renderPrepStartScanGate();
          return;
        }
      } else {
        await UnitEngine.lifecycle.finishAtomic(fstore.collection(STOCK_CONTAINERS_COLL).doc(sc.id), cData, staffEmp, 'scanned', true);
      }
    } catch (err) {
      console.error('confirmPrepStartAfterScan: ghi nhận container lỗi', err);
      toast('❌ Không lưu được mã ' + sc.code + ': ' + (err.message || err) + ' — bấm lại "Bắt đầu chế biến" để thử tiếp');
      renderPrepStartScanGate();
      return;
    }
  }
  refreshFifoAlert().catch(() => {});

  clearPrepStartScanState();
  await startPrepBatch(staffEmp, true, scannedContainerIds, atomicAllocationsByItem);
}

// [SỬA] TRƯỚC ĐÂY mỗi lần quét ghi 'finished' ngay lập tức, nên huỷ ở bước này phải tự
// hoàn lại từng tem đã quét về 'sealed'. Giờ prepStartGateScan() chỉ NHỚ TẠM mã đã quét
// (xem ghi chú ở khai báo prepStartScanState) — tem vẫn nguyên 'sealed' suốt, nên huỷ chỉ
// cần xoá tiến trình tạm là xong, không có gì để hoàn cả.
// Vẫn dò hoàn phòng hờ trường hợp hiếm: bấm "Bắt đầu chế biến" bị đứt mạng giữa chừng
// (một số mã đã kịp ghi 'finished' ở confirmPrepStartAfterScan) rồi mới bấm Huỷ.
async function cancelPrepStartGate() {
  const st = prepStartScanState;
  const scannedIds = st ? st.requirements.reduce((acc, r) => acc.concat(r.scannedIds), []) : [];
  if (scannedIds.length && !confirm('Đã quét ' + scannedIds.length + ' mã — huỷ sẽ bỏ tiến trình quét này. Vẫn huỷ và quay lại?')) return;
  clearPrepStartScanState();
  if (scannedIds.length) {
    const staffEmp = st.staffEmp;
    const results = await Promise.allSettled(
      scannedIds.map(cid => UnitEngine.lifecycle.reverseAtomicFinish(cid, '', staffEmp, 'Huỷ ở bước quét trước khi bắt đầu chế biến'))
    );
    const reverted = results.filter(r => r.status === 'fulfilled' && r.value).length;
    if (reverted) {
      // Có ít nhất 1 mã thật sự bị 'finished' (do đứt mạng giữa chừng lúc xác nhận) và
      // vừa được hoàn lại — báo rõ, còn lại (đa số) chỉ đang 'sealed' nên không có gì để
      // hoàn, _reverseAtomicContainerFinish() tự bỏ qua (xem điều kiện status!=='finished').
      refreshFifoAlert().catch(() => {});
      toast(`✅ Đã huỷ, hoàn lại ${reverted} mã lỡ bị chốt hết do đứt giữa chừng`);
    } else {
      toast('✅ Đã huỷ tiến trình quét');
    }
  }
  renderPrepBatchForm();
}

// ============================================================
// [GĐ2] BƯỚC 1 — BẮT ĐẦU CHẾ BIẾN
// Trừ nguyên liệu thô NGAY tại đây (chúng đã thực sự bị lấy ra khỏi kho để nấu),
// tạo lô status='cooking'. Chưa cộng tồn thành phẩm vì chưa cân được.
// ============================================================
// preResolvedStaff — khi gọi tiếp sau bước quét mã bắt buộc (xem
// startPrepBatchGate/confirmPrepStartAfterScan), danh tính đã xác thực PIN một
// lần ở đầu bước quét rồi, không hỏi lại PIN lần 2 vì màn quét không còn ô PIN.
async function startPrepBatch(preResolvedStaff, atomicScanDone, atomicScannedContainerIds, atomicAllocationsByItem) {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  _posSubmitBusy = true;
  const restoreBtn = setBtnBusy('prepStartBtn', '⏳ Đang trừ kho nguyên liệu...');
  try { await _startPrepBatchImpl(preResolvedStaff, atomicScanDone, atomicScannedContainerIds, atomicAllocationsByItem); } finally { _posSubmitBusy = false; restoreBtn(); }
}

async function _startPrepBatchImpl(preResolvedStaff, atomicScanDone, atomicScannedContainerIds, atomicAllocationsByItem) {
  const p = PREP_ITEMS_CACHE_POS.find(x => x.id === prepBatchState.prepId);
  if (!p) { toast('⚠️ Chưa chọn thành phẩm'); return; }
  if (!(prepBatchState.ratio > 0)) { toast('⚠️ Tỷ lệ mẻ phải lớn hơn 0'); return; }
  const staffEmp = preResolvedStaff || await resolveStaffPinAndCheckin('prepBatchStaff');
  if (!staffEmp) return;

  const ratio = prepBatchState.ratio;
  const batchRef = fstore.collection('prep_batches_gieogieo').doc();
  // [NL-RECON] Một NL có thể xuất hiện hai dòng trong công thức; gộp trước khi
  // trừ kho/ghi trace để không ghi đè một phần lượng đã lấy.
  const inputTotals=new Map();
  (p.batchInputs||[]).filter(r=>r.itemId&&Number(r.qty)>0).forEach(r=>
    inputTotals.set(r.itemId,(inputTotals.get(r.itemId)||0)+Number(r.qty)));
  const inputs=[...inputTotals].map(([itemId,qty])=>({itemId,qty}));
  const reconRows = prepReconRows(p, ratio);
  const reconIds = new Set(reconRows.map(r=>r.itemId));
  let reconLockHeld = false, batchCreated = false;
  const reconcileInputs = {};

  try {
    const countError=prepCountQuantityError(p,ratio);
    if(countError)throw new Error(countError);
    // [NL-RECON] Giành mọi NL cần cân cùng lúc. Cân trước chỉ được ghi sau khi
    // đã giành khóa, và trừ định mức bị hoãn đến lúc có số cân sau khi lấy.
    await UnitEngine.prep.reconAcquire(batchRef.id, reconRows);
    reconLockHeld = reconRows.length > 0;
    const pre = prepReconGate && prepReconGate.key===p.id+':'+ratio ? prepReconGate : null;
    await prepReconCheckNewRisk(reconRows,pre);
    if(pre) for(let i=0;i<pre.targets.length;i++) {
      const x=pre.targets[i],v=pre.values[i];if(!v)throw new Error('Thiếu số cân trước của '+x.itemName);
      const delta=round2(v.qty-x.unitBase),opId='prep_pre_'+batchRef.id+'_'+x.id;
      if(x.id==='__aggregate'){
        const fresh=await fstore.collection('inventory_items_gieogieo').doc(x.itemId).get();
        if(Math.abs((Number(fresh.data().currentStock)||0)-x.unitBase)>0.015)
          throw new Error('Tồn '+x.itemName+' đã đổi từ lúc mở cân — cân lại trước khi bắt đầu');
      }
      const checkpoint={stage:'before',at:vnDate().toISOString(),batchId:batchRef.id,
        employeeId:staffEmp.id,employeeName:staffEmp.fullName};
      if(x.id!=='__aggregate') await UnitEngine.prep.reconSetUnit(x.itemId,x.id,v.qty,opId,x.unitBase,checkpoint);
      if(Math.abs(delta)>0.005) await UnitEngine.ledger.apply({itemId:x.itemId,type:'ADJUSTMENT',qty:delta,
        note:'Cân trước mẻ '+(p.name||'')+' · mã '+x.code+' · sổ '+x.unitBase+' → thật '+v.qty,
        staff:staffEmp.fullName,staffEmployeeId:staffEmp.id,referenceId:batchRef.id,
        deriveFromUnits:x.id!=='__aggregate',txId:opId,
        meta:{prepReconStage:'before',containerId:x.id,containerCode:x.code,
          bookBefore:x.unitBase,weighedBefore:v.qty,possiblePriorShortage:Math.max(0,-delta),
          reason:(v.reason||'').trim(),resolutionStatus:'assigned',
          fromCheckpoint:x.fromCheckpoint||null,toCheckpoint:checkpoint,
          responsibleEmployeeId:staffEmp.id,responsibleEmployeeName:staffEmp.fullName,
          responsibilityRole:'người chốt cân và giải trình chênh lệch',
          weighings:v.lines||[],needsReview:true}});
      else if(x.id!=='__aggregate') await UnitEngine.stock.recompute(x.itemId,STOCK_CONTAINERS_COLL);
    }
    for(const row of reconRows) reconcileInputs[row.itemId]=await prepReconBaseline(row);
    // Trừ nguyên liệu TRƯỚC: nếu thiếu/lỗi mạng thì dừng luôn, chưa tạo lô —
    // tránh lô "cooking" mà nguyên liệu chưa hề bị trừ.
    // [MỚI] Phân bổ FIFO vào đúng tem đang mở trước khi ghi sổ — cùng cơ chế với lúc bán
    // hàng (xem fifoAllocateConsumption), để biết mẻ này lấy nguyên liệu từ đúng tem nào.
    // [BUG "RT trừ nhưng ledger fail — mất tồn" — chuẩn bị fix] Giữ lại allocations của TỪNG
    // input ngay khi vừa phân bổ xong, kể cả khi applyStockTransactionPOS() của CHÍNH input
    // đó thất bại ngay sau — trước đây bước cuộn ngược chỉ dựa vào ledger đã ghi
    // (referenceId=batchId), nên input nào chưa kịp có ledger (applyStockTransactionPOS tự nó
    // lỗi) thì RT đã bị trừ ở allocate() lại không có cách nào được hoàn.
    const perInputAllocations = {};
    const results = await Promise.allSettled(inputs.map(async r => {
      const qty = Math.abs((Number(r.qty) || 0) * ratio);
      const item = KHO_ITEMS_CACHE.find(x=>x.id===r.itemId);
      if(item && item.stockManaged===false){
        perInputAllocations[r.itemId]={qty,allocations:[],unmanaged:true};return;
      }
      if(reconIds.has(r.itemId)){
        perInputAllocations[r.itemId]={qty,allocations:[],pending:true};return;
      }
      // [FIX "KIT bột sữa/Sữa gạo âm dù kho thật còn hàng" — nguyên liệu "cái rời" (isAtomicUnitItem)
      // đã bị BẮT BUỘC quét mã ở cổng startPrepBatchGate TRƯỚC khi vào tới đây — writeAtomicContainerFinish()
      // đã chốt đúng tem đó 'finished' và recompute currentStock đúng NGAY LÚC QUÉT rồi (khớp thực tế).
      // Trước đây bước này vẫn cứ gọi unitEngineAllocateConsumption() cho MỌI input như thường — nhưng
      // hàm đó chỉ tìm tem "đang mở" trong RTDB, mà nguyên liệu quét-chốt-nguyên-cái không bao giờ đi qua
      // RTDB (không có khái niệm "mở dần") nên luôn trả về [] → deriveFromUnits=false → applyStockTransactionPOS
      // tưởng nhầm khoản này "không có tem nào đại diện" rồi CỘNG DỒN THÊM vào untrackedPendingDelta, dù
      // tem thật đã bị trừ đúng 1 lần rồi qua đường quét. Mỗi lần nấu là một khoản nợ ảo -1 cộng dồn vĩnh
      // viễn (không tự hồi phục), kéo currentStock ngày càng âm sâu so với số tem 'sealed' thật sự còn lại
      // — đúng nguyên nhân "-17 cái" dù quầy vẫn còn 8 gói. Bỏ qua unitEngineAllocateConsumption (không có
      // gì để phân bổ) và báo deriveFromUnits=true thẳng cho các input này để formula tự suy lại đúng theo
      // tem sealed, không cộng thêm nợ ảo — đồng thời tránh luôn cảnh báo giả "không có tem nào đang mở".
      const alreadyAtomicScanned = !!atomicScanDone && (UnitEngine.classify.isAtomic(item) || prepWholePackSize(item) > 0);
      // [FIX "Chi tiết lô không thấy tem của KIT bột sữa/Sữa gạo dù đã quét bắt buộc"]
      // TRƯỚC ĐÂY luôn là [] — đúng cho việc TRỪ KHO (tem đã chốt 'finished' ngay lúc
      // quét ở cổng, không cần allocate lại), nhưng lại làm inputTrace của lô không có
      // gì để hiện: allocations rỗng VÀ untracked=false (vì alreadyAtomicScanned=true)
      // nên màn Chi tiết lô không hiện "Xem tem" mà cũng không hiện "Không gắn tem".
      // Giờ lấy đúng tem đã quét cho ITEM NÀY từ atomicAllocationsByItem (gói ở
      // confirmPrepStartAfterScan) để nối vào inputTrace — không đổi gì ở việc trừ kho.
      const allocations = alreadyAtomicScanned
        ? ((atomicAllocationsByItem && atomicAllocationsByItem[r.itemId]) || [])
        : await UnitEngine.consume.allocate(r.itemId, qty, undefined, { type: 'prep_batch', id: batchRef.id })
          .catch(err => { console.warn('[FIFO] phân bổ lỗi', r.itemId, err); return []; });
      perInputAllocations[r.itemId] = { allocations, qty, alreadyAtomicScanned };
      return UnitEngine.ledger.apply({
        itemId: r.itemId, type: 'CONSUMPTION',
        // KHÔNG làm tròn — cân tiểu ly cân được số lẻ, làm tròn sẽ lệch công thức
        qty: -qty,
        note: `Nấu ${p.code || ''} ${p.name || ''} (${Number(ratio).toLocaleString('vi-VN')} mẻ)`,
        staff: staffEmp.fullName, staffEmployeeId: staffEmp.id, referenceId: batchRef.id,
        deriveFromUnits: alreadyAtomicScanned || allocations.length > 0,
        ...(allocations.length ? { meta: { fifoAllocations: allocations } } : {}),
        ...(alreadyAtomicScanned ? { meta: { atomicScanned: true } } : {})
      });
    }));
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length) {
      console.error('startPrepBatch: trừ nguyên liệu thất bại', failed);
      // [FIX-batch-rollback] TRƯỚC ĐÂY chỉ `return` — những nguyên liệu ĐÃ trừ xong
      // trước khi gặp lỗi thì nằm lại luôn, mà lô thì không được tạo nên chẳng có gì
      // để bấm huỷ. Kho hụt âm thầm, không dấu vết nào ngoài dòng log này.
      // Giờ cuộn ngược đúng những giao dịch đã ghi được (gắn referenceId = id lô).
      let backOk = 0;
      try {
        const rb = await _reversePrepBatchInputsPOS(batchRef.id,
          `Hoàn kho do BẮT ĐẦU MẺ LỖI ${p.code || ''} ${p.name || ''}`);
        backOk = rb.ok;
      } catch (e) { console.warn('startPrepBatch: cuộn ngược lỗi', e); }
      // [BUG "RT trừ nhưng ledger fail — mất tồn" — FIX] _reversePrepBatchInputsPOS() ở trên
      // chỉ hoàn được input CÓ ledger (kể cả khi promise reject vì mất gói tin ack nhưng
      // Firestore đã ghi thật — tự an toàn nhờ đọc đúng ledger thật, không đoán). Input nào
      // THẬT SỰ không có ledger (applyStockTransactionPOS tự nó lỗi hẳn) thì không nằm trong
      // đó — kiểm lại đúng những input KHÔNG có ledger rồi hoàn thẳng allocations đã tự lưu.
      let existingTxItemIds = new Set();
      try {
        existingTxItemIds = new Set((await _loadBatchConsumptionTxPOS(batchRef.id)).map(t => t.itemId));
      } catch (err) { console.warn('startPrepBatch: đọc lại ledger để đối chiếu lỗi', err); }
      const failedItemIds = inputs.filter((r, i) => results[i].status === 'rejected').map(r => r.itemId);
      const trulyMissingIds = failedItemIds.filter(id => !existingTxItemIds.has(id));
      await Promise.allSettled(trulyMissingIds.map(async itemId => {
        const rec = perInputAllocations[itemId];
        if (!rec || !rec.allocations.length) return;
        // [FIX] rec.allocations của nguyên liệu atomic-scanned giờ KHÔNG còn rỗng nữa
        // (đã nối tem vào để hiện đúng ở Chi tiết lô — xem allocations ở trên), nhưng
        // đó là tem "cái rời" chưa từng đi qua RTDB. unitEngineReverseAllocations() chỉ
        // biết hoàn vào RTDB — gọi nhầm cho loại này sẽ CỘNG QUA tem đang mở KHÁC (ăn
        // nhầm currentStock của tem không liên quan) thay vì không làm gì. Loại đã có
        // cơ chế hoàn riêng, đúng (huỷ mẻ → _reverseAtomicContainerFinish qua
        // atomicScannedContainerIds), nên bỏ qua ở đây.
        if (rec.alreadyAtomicScanned) return;
        try {
          // Cùng claimId với _reverseIngredientConsumptionPOS (bước hoàn theo sổ ở trên): nếu lần
          // đọc sổ thứ hai lỗi khiến một input ĐÃ được hoàn bị coi nhầm là "không có sổ", claim
          // đã tồn tại → không cộng vào tem lần hai.
          const rv = await UnitEngine.consume.reverseClaimed(batchRef.id + '_ing_' + itemId, itemId, rec.allocations);
          if (rv.ambiguous || rv.appliedQty >= rv.totalQty - 1e-6) await UnitEngine.stock.recompute(itemId, STOCK_CONTAINERS_COLL).catch(() => {});
          backOk++;
        } catch (err) { console.warn('[FIFO] hoàn allocations của input không có ledger lỗi', itemId, err); }
      }));
      toast(backOk
        ? `❌ Trừ kho thất bại ${failed.length}/${inputs.length} nguyên liệu — đã hoàn lại ${backOk}, chưa tạo lô`
        : `❌ Trừ kho thất bại ${failed.length}/${inputs.length} nguyên liệu — chưa tạo lô`);
      return;
    }

    const now = vnDate();
    const mins = Number(p.prepTimeMinutes) || 0;
    try {
      // [E4.6] Tạo lô 'cooking' qua engine (prep.createBatch) — dữ liệu lô do engine ghi.
      await UnitEngine.prep.createBatch(batchRef.id, {
        prepId: p.id, prepCode: p.code || '', prepName: p.name || '', unit: p.unit || '',
        batchRatio: ratio,
        qtyInitial: 0, qtyRemaining: 0,       // chưa cân → điền ở bước Hoàn thành
        startedAt: now.toISOString(),
        expectedReadyAt: mins > 0 ? vnDate(now.getTime() + mins * 60000).toISOString() : null,
        finishedAt: null, expiresAt: null,
        // Chép cấu hình hạn dùng vào lô để hiện tem & tra lịch sử về sau mà không
        // phải join ngược sang prep_items.
        shelfLifeType: p.shelfLifeType || 'endOfDay',
        shelfLifeHours: Number(p.shelfLifeHours) || 0,
        status: 'cooking',
        // [NL-RECON] Mỗi NL chốt độc lập; lô cooking vẫn hiện khi chờ cân.
        reconcileInputs, reconcileMode: reconRows.length>0,
        staff: staffEmp.fullName, staffEmployeeId: staffEmp.id,
        // [MỚI] true khi nguyên liệu "cái" của công thức đã được quét đủ ở cổng
        // quét bắt buộc TRƯỚC lúc tạo lô này (xem startPrepBatchGate) — banner
        // "🔥 Đang chế biến" (renderPrepBatchForm) dựa vào cờ này để khỏi nhắc
        // quét lại một việc đã xong, chỉ còn nhắc cho lô cũ tạo trước khi có cổng
        // quét này (không có cờ).
        atomicScanDone: !!atomicScanDone,
        // [MỚI] Đúng những container "cái" đã bị quét-chốt (status → 'finished') ở
        // cổng quét lúc bắt đầu — xem _reverseAtomicContainerFinish(): "Huỷ mẻ" đọc
        // đúng danh sách này để hoàn tem về 'sealed', không thì tem coi như dùng hết
        // vĩnh viễn dù mẻ chưa từng thực sự được nấu.
        atomicScannedContainerIds: Array.isArray(atomicScannedContainerIds) ? atomicScannedContainerIds : [],
        businessDate: posDateKey(), source: 'pos',
        // [MỚI — Tuần 4 truy xuất] Nối "nguyên liệu → lô BTP": allocations đã tính sẵn trong
        // perInputAllocations lúc trừ nguyên liệu ở trên (đúng tem/không tem nào), gắn thẳng vào
        // chính lô ngay lúc sinh ra — không phải dò lại qua stock_transactions.referenceId==
        // batchId mỗi lần cần tra. Đây là mắt xích còn thiếu duy nhất trong chuỗi truy xuất đầy
        // đủ "tem nguyên liệu → lô BTP → bill" (2 đoạn còn lại — lô BTP→bill và tem→bill — đã có
        // từ unitAllocations/fifoAllocations + order_stock_traces_gieogieo, xem Tuần 2).
        inputTrace: Object.fromEntries(inputs.map(r => {
          const rec = perInputAllocations[r.itemId] || { qty: Math.abs((Number(r.qty) || 0) * ratio), allocations: [] };
          const itName = (KHO_ITEMS_CACHE.find(x => x.id === r.itemId) || {}).name || '';
          return [r.itemId, { itemName: itName, qty: rec.qty, allocations: rec.allocations,
            untracked: !rec.allocations.length && !rec.alreadyAtomicScanned && !rec.pending && !rec.unmanaged,
            pending:!!rec.pending,unmanaged:!!rec.unmanaged,
            estimated:(KHO_ITEMS_CACHE.find(x=>x.id===r.itemId)||{}).staffCounts===false }];
        }))
      });
      batchCreated = true;
      prepReconGate = null;
    } catch (setErr) {
      // [BUG "trừ kho thành công nhưng không có mẻ" — FIX] TRƯỚC ĐÂY: lỗi ở đúng bước này rơi
      // thẳng xuống catch ngoài cùng, chỉ toast lỗi — mọi nguyên liệu đã trừ RT+ledger THÀNH CÔNG
      // ở vòng lặp trên nằm lại luôn, không có lô "cooking" nào để bấm Huỷ mẻ mà hoàn. Kho hụt
      // âm thầm đúng bằng cả mẻ, không dấu vết nào ngoài lỗi console.
      // Mọi input ở trên đã CHẮC CHẮN có ledger (chỉ tới được đây khi failed.length===0), nên
      // cuộn ngược qua đúng cơ chế dựa-vào-ledger đã có sẵn (_reversePrepBatchInputsPOS) là đủ,
      // không cần đường vòng qua perInputAllocations như nhánh lỗi-giữa-chừng ở trên.
      console.error('startPrepBatch: ghi lô cooking thất bại, đang hoàn lại nguyên liệu đã trừ', setErr);
      // [Sửa lỗi mất phản hồi mạng] "Ghi lô lỗi" chưa chắc là lô CHƯA được ghi: lệnh có thể đã thành công
      // ở máy chủ, chỉ mất phản hồi. Đọc lại đúng lô đó trước khi hoàn nguyên liệu — hoàn khi lô vẫn tồn tại
      // thì vừa có lô đang nấu vừa có nguyên liệu quay lại kho (kho dư đúng bằng cả mẻ).
      let batchState = 'unknown';
      try { const chk = await batchRef.get(); batchState = chk.exists ? 'exists' : 'missing'; }
      catch (chkErr) { console.warn('startPrepBatch: không đọc lại được lô để kiểm tra', chkErr); }
      if (batchState === 'exists') {
        batchCreated = true;   // lô đã có thật → coi như tạo xong, KHÔNG hoàn nguyên liệu, KHÔNG nhả khoá
        prepReconGate = null;
        toast('⚠️ Mạng chập chờn nhưng lô đã được tạo — kiểm tra thẻ "Đang chế biến"');
        refreshFifoAlert().catch(() => {});
        await loadPrepBatchesPOS();
        renderPrepBatchForm();
        return;
      }
      if (batchState === 'unknown') {
        batchCreated = true;   // không biết lô có hay không → không được hoàn/nhả gì (hoàn nhầm nguy hiểm hơn để nguyên)
        posAutoReportManager('Bắt đầu mẻ: không xác định được lô đã tạo chưa',
          `${p.name || ''}: nguyên liệu đã trừ, chưa đọc lại được lô ${batchRef.id}. Kiểm tra tab Chế biến; nếu không có lô "đang nấu" thì hoàn nguyên liệu tay.`,
          { ref: batchRef.id, prepName: p.name || '' }).catch(() => {});
        toast('⚠️ Mạng lỗi — chưa xác định được lô đã tạo chưa. Đã báo Quản lý, đừng bấm bắt đầu lại.');
        return;
      }
      let backOk = 0;
      try {
        const rb = await _reversePrepBatchInputsPOS(batchRef.id,
          `Hoàn kho do BẮT ĐẦU MẺ LỖI (không tạo được lô) ${p.code || ''} ${p.name || ''}`);
        backOk = rb.ok;
      } catch (e) { console.warn('startPrepBatch: cuộn ngược sau lỗi tạo lô cũng lỗi', e); }
      toast(backOk >= inputs.length
        ? `❌ Tạo lô thất bại — đã hoàn lại toàn bộ ${backOk} nguyên liệu, chưa tạo lô`
        : `❌ Tạo lô thất bại — chỉ hoàn được ${backOk}/${inputs.length} nguyên liệu (đã tự báo Quản lý)`);
      if (backOk < inputs.length) posAutoReportManager('Tạo lô BTP thất bại, hoàn kho chưa đủ',
        `${p.name || ''}: hoàn được ${backOk}/${inputs.length} nguyên liệu`, { ref: batchRef.id, prepName: p.name || '' }).catch(() => {});
      return;
    }

    toast(mins > 0 ? `🔥 Bắt đầu chế biến — dự kiến ${mins} phút` : '🔥 Đã bắt đầu chế biến');
    refreshFifoAlert().catch(() => {}); // mẻ này có thể vừa làm cạn tem nguyên liệu nào đó
    prepSugRefresh();                    // mẻ vừa bắt đầu → bỏ gợi ý trùng
    await loadPrepBatchesPOS();
    renderPrepBatchForm();
  } catch (err) {
    console.error('startPrepBatch failed', err);
    if (err && err.kind === 'manager') toastAutoReport('❌ Chưa bắt đầu được mẻ ' + (p.name || '') + ': ' + err.message, 'Bắt đầu mẻ bị chặn', { ref: batchRef.id, prepName: p.name || '' });
    else toast('❌ Lỗi: ' + (err.code || err.message || err));
  } finally {
    if(reconLockHeld && !batchCreated){
      await UnitEngine.prep.reconRelease(batchRef.id,reconRows.map(r=>r.itemId)).catch(err=>console.warn('Không giải phóng được khóa NL sau lỗi bắt đầu',err));
      prepReconGate=null;
    }
    if(!batchCreated && atomicScanDone && Array.isArray(atomicScannedContainerIds) && atomicScannedContainerIds.length){
      await Promise.allSettled(atomicScannedContainerIds.map(id=>
        UnitEngine.lifecycle.reverseAtomicFinish(id,batchRef.id,staffEmp,'Bắt đầu mẻ không thành công')));
    }
  }
}

// ============================================================
// [GĐ2] BƯỚC 2 — HOÀN THÀNH: cân thật → sinh mã lô → hiện thẻ tem
// ============================================================
let _finishingBatchId = null;

// ============================================================================
// 🆕 GIÁ VỐN BÁN THÀNH PHẨM TÍNH THEO YIELD THẬT (không theo số khai)
// ----------------------------------------------------------------------------
// VẤN ĐỀ: costPerUnit của BTP đang = tổng giá vốn nguyên liệu ÷ batchYield KHAI.
// Số tiền bỏ ra cho một mẻ là CỐ ĐỊNH (đã trừ kho đúng bằng công thức × số mẻ);
// thứ thay đổi là mẻ đó ra được bao nhiêu gram. Chia cho số khai thay vì số cân
// thật làm giá vốn mỗi gram sai đúng bằng tỷ lệ lệch yield.
//
// Số thật đo được ở quán: cốt sữa gạo khai 1682 nhưng luôn cân ra 1995 (+19%),
// cốt trà sữa khai 1721 cân ra 1995 (+16%) → COGS đang bị thổi lên gần 1/5.
// Ngược lại kem phô mai khai 800 mà chỉ ra 550 (−31%) → COGS bị tính thiếu.
//
// CÁCH CHỮA: mỗi lô nấu xong tự ghi lại giá vốn thật của chính nó
//     actualCostPerUnit = (giá vốn nguyên liệu của mẻ) ÷ (số CÂN THẬT)
// rồi cập nhật costPerUnit của BTP thành trung bình các lô gần đây. Từ đó mọi
// báo cáo COGS đang chạy tự đúng theo thực tế mà không phải sửa gì ở tầng báo cáo.
//
// batchYield KHAI vẫn giữ nguyên vai trò cũ: đó là MỤC TIÊU sản xuất (dùng để
// gợi ý cần nấu mấy mẻ), không còn dùng để tính tiền nữa.
// ============================================================================
const PREP_YIELD_WINDOW = 8;

const PREP_YIELD_MIN_SAMPLES = 3;

const PREP_YIELD_ALERT_PCT = 10;

const PREP_FINISH_CONFIRM_PCT = 30;

let _prepFinishSuggest = 0;

// Giá vốn nguyên liệu của một mẻ, theo công thức × số mẻ × đơn giá hiện tại.
function prepBatchInputCostPOS(p, ratio, batch) {
  const grouped=new Map();
  (p&&p.batchInputs||[]).filter(r=>r.itemId&&Number(r.qty)>0).forEach(r=>
    grouped.set(r.itemId,(grouped.get(r.itemId)||0)+Number(r.qty)));
  return [...grouped].reduce((sum,[itemId,formulaQty])=>{
    const it=KHO_ITEMS_CACHE.find(x=>x.id===itemId);
    const trace=batch&&batch.inputTrace&&batch.inputTrace[itemId];
    const qty=trace&&trace.reconciled?Number(trace.qty)||0:formulaQty*(Number(ratio)||1);
    return sum+qty*(Number(it&&it.costPerUnit)||0);
  },0);
}

// Hiện đối chiếu SAU KHI nhân viên đã gõ số — trước đó tuyệt đối không cho thấy
// số gợi ý, vì thấy trước là gõ theo luôn (đó chính là lý do 6 loại cốt có số
// "cân thật" trùng khít số khai đến từng số lẻ).
// goTay = true khi nhân viên tự gõ vào ô (khác với khi bộ cân đổ số vào).
function onPrepFinishQtyInput(goTay) {
  const el = document.getElementById('prepFinishQty');
  const box = document.getElementById('prepFinishCompare');
  if (!el || !box) return;
  const qty = Number(el.value) || 0;
  // Sửa tay sau khi đã cân → bảng kê lần cân không còn khớp với số sắp lưu nữa.
  // Vứt nó đi chứ KHÔNG lưu kèm: một bảng kê cộng ra 2.485 nằm cạnh con số 2.000
  // là thứ đánh lừa người đọc lịch sử về sau, tệ hơn hẳn không có bảng kê nào.
  if (goTay && _prepFinishWeighLines.length) {
    const cu = _prepFinishWeighLines.reduce((s, l) => s + (Number(l.net) || 0), 0);
    if (Math.abs(cu - qty) > 0.005) {
      _prepFinishWeighLines = [];
      const info = document.getElementById('prepFinishWeighInfo');
      if (info) info.innerHTML = '';
    }
  }
  const sug = _prepFinishSuggest;
  if (!(qty > 0) || !(sug > 0)) { box.innerHTML = ''; return; }
  const pct = (qty - sug) / sug * 100;
  const mau = Math.abs(pct) <= 10 ? ['#f0faf4', '#86efac', '#15803d'] : ['#fef3c7', '#fcd34d', '#92400e'];
  box.innerHTML = `
    <div style="background:${mau[0]};border:1.5px solid ${mau[1]};border-radius:12px;padding:10px 12px;margin:8px 0 2px;">
      <div style="font-size:12.5px;color:${mau[2]};font-weight:700;">Công thức dự kiến ${fmtPrepQty(sug)} · bạn cân ${fmtPrepQty(qty)} → ${pct > 0 ? '+' : ''}${pct.toFixed(0)}%</div>
      <div style="font-size:11.5px;color:${mau[2]};margin-top:3px;line-height:1.5;">${Math.abs(pct) <= 10
        ? 'Khớp với công thức.'
        : 'Lệch nhiều. Nếu cân đúng thì cứ lưu — hệ thống sẽ lấy số này để tính giá vốn và sẽ báo Quản lý xem lại công thức.'}</div>
    </div>`;
}

// Cập nhật giá vốn + yield thật của BTP từ các lô đã nấu xong. Chạy NỀN sau khi
// lưu lô (không chặn nhân viên), lỗi thì bỏ qua — lô đã ghi đúng rồi.
async function refreshPrepYieldStatsPOS(prepId) {
  const p = PREP_ITEMS_CACHE_POS.find(x => x.id === prepId);
  if (!p) return;
  const snap = await fstore.collection('prep_batches_gieogieo').where('prepId', '==', prepId).get();
  const done = snap.docs.map(d => d.data())
    .filter(b => b.status !== 'cancelled' && Number(b.qtyInitial) > 0 && Number(b.batchRatio) > 0)
    .sort((a, b) => String(b.finishedAt || '').localeCompare(String(a.finishedAt || '')))
    .slice(0, PREP_YIELD_WINDOW);
  if (!done.length) return;

  const sumQty = done.reduce((s, b) => s + Number(b.qtyInitial), 0);
  const sumRatio = done.reduce((s, b) => s + Number(b.batchRatio), 0);
  // Lô cũ (nấu trước khi có tính năng này) không có inputCost → tính bù theo công
  // thức hiện tại. Không chính xác bằng nhưng vẫn tốt hơn là bỏ cả lô ra khỏi mẫu.
  const sumCost = done.reduce((s, b) => s + (Number(b.inputCost) || prepBatchInputCostPOS(p, Number(b.batchRatio) || 1)), 0);
  const yieldActualAvg = sumQty / sumRatio;
  const costPerUnit = sumQty > 0 ? sumCost / sumQty : 0;
  const khai = Number(p.batchYield) || 0;
  const lechPct = khai > 0 ? (yieldActualAvg - khai) / khai * 100 : null;

  const patch = {
    yieldActualAvg, yieldSampleCount: done.length,
    yieldVariancePct: lechPct == null ? null : Math.round(lechPct * 10) / 10,
    yieldStatsAt: vnDate().toISOString()
  };
  // Chỉ ghi đè giá vốn khi đã đủ mẫu — một lô lẻ cân sai sẽ kéo lệch cả giá vốn.
  if (done.length >= PREP_YIELD_MIN_SAMPLES && costPerUnit > 0) patch.costPerUnit = costPerUnit;
  await fstore.collection('prep_items_gieogieo').doc(prepId).update(patch);
  Object.assign(p, patch);

  if (lechPct != null && Math.abs(lechPct) > PREP_YIELD_ALERT_PCT && done.length >= PREP_YIELD_MIN_SAMPLES) {
    // 1 cảnh báo/BTP/ngày — nấu 3 mẻ trong ngày không đẻ ra 3 cảnh báo giống nhau.
    const docId = ('prep_yield_' + posDateKey() + '_' + prepId).replace(/[^\w\-]/g, '_');
    await fstore.collection('alerts_gieogieo').doc(docId).set({
      type: 'prep_yield_mismatch', severity: 'warning', status: 'new',
      businessDate: posDateKey(), createdAt: vnDate().toISOString(),
      title: `Yield khai lệch thực tế: ${p.name || p.code || ''}`,
      prepId, prepCode: p.code || '', prepName: p.name || '', unit: p.unit || '',
      declaredYield: khai, actualYield: Math.round(yieldActualAvg * 100) / 100,
      variancePct: Math.round(lechPct * 10) / 10, sampleCount: done.length,
      costPerUnitOld: Number(p.costPerUnit) || 0,
      costPerUnitNew: Math.round(costPerUnit * 10000) / 10000
    }, { merge: true });
  }
}

// [MỚI] Bảng kê các lần cân của form Hoàn thành. Lưu kèm lô để sau này tra ngược
// được "sao mẻ hôm đó ra ít thế" — thấy luôn đã cân mấy khay, khay nào.
let _prepFinishWeighLines = [];

function openPrepFinishForm(batchId) {
  const b = PREP_BATCHES_CACHE_POS.find(x => x.id === batchId);
  if (!b) { toast('⚠️ Không tìm thấy lô'); return; }
  const pending=Object.entries(b.reconcileInputs||{}).find(([,r])=>r.status!=='done');
  if(pending){toast('⚠️ Cân và chốt NL trước khi hoàn thành');openPrepReconForm(batchId,pending[0]);return;}
  _finishingBatchId = batchId;
  _prepFinishWeighLines = [];
  const p = PREP_ITEMS_CACHE_POS.find(x => x.id === b.prepId);
  const suggest = round2((Number(p && p.batchYield) || 0) * (Number(b.batchRatio) || 1));
  _prepFinishSuggest = suggest;   // giữ trong biến, chỉ hiện SAU khi nhân viên đã gõ số
  const box = document.getElementById('prepBatchBody');
  prepSetBack(openPrepBatchScreen);
  box.innerHTML = `
    <div class="wal-section" style="margin:0 0 14px;">
      <div class="wal-section-title">Hoàn thành: ${b.prepName || ''}</div>
      <div style="font-size:12.5px;color:#999;margin-bottom:10px;">Bắt đầu lúc ${fmtDateTimeShort(b.startedAt)} · ${Number(b.batchRatio).toLocaleString('vi-VN')} mẻ</div>
      <div class="wal-input-label" style="margin:0 0 6px;">Thực tế thu được (cân/đong)</div>
      ${prepCanWeighPOS(b.prepId)
        ? weighBtnWide('openPrepFinishWeigh()', 'Cân cả khay vừa nấu', 'Đặt nguyên khay/nồi lên cân — máy tự trừ bì') + '<div style="height:9px;"></div>'
        : prepWeighHintHTML(b.prepId)}
      <div class="wal-input-group" style="margin-bottom:2px;display:flex;align-items:center;gap:8px;">
        ${prepCanWeighPOS(b.prepId) ? '<span style="font-size:11.5px;color:#aaa;font-weight:600;flex-shrink:0;">hoặc</span>' : ''}
        <input id="prepFinishQty" type="number" inputmode="decimal" step="0.01" placeholder="Gõ tay số đã cân" oninput="onPrepFinishQtyInput(true)" style="flex:1;">
        <span style="font-size:13px;font-weight:700;color:var(--gd);white-space:nowrap;">${b.unit || ''}</span>
      </div>
      <div id="prepFinishWeighInfo"></div>
      <div style="font-size:11.5px;color:#999;margin:4px 2px 0;"><b>Cân/đong rồi gõ số thật.</b> Số này là số cộng vào kho VÀ là số dùng để tính giá vốn mỗi ${b.unit || 'đơn vị'}.</div>
      <div id="prepFinishCompare"></div>
      ${renderPinInput('prepFinishStaff')}
    </div>
    <button id="prepFinishBtn" onclick="submitPrepFinish()" style="width:100%;padding:14px;background:var(--gd);color:#fff;border:none;border-radius:14px;font-weight:700;font-size:15px;cursor:pointer;">✅ Xác nhận nấu xong</button>
    <button onclick="openPrepBatchScreen()" style="width:100%;padding:12px;background:none;border:1px solid #ddd;color:var(--gt);border-radius:14px;font-weight:600;font-size:13px;cursor:pointer;margin-top:8px;">← Quay lại</button>
  `;
}

// [MỚI] Mở bộ cân cho bước Hoàn thành. Cân xong đổ thẳng số vào ô đang có rồi
// gọi lại onPrepFinishQtyInput() — mọi thứ phía sau (so với công thức, cảnh báo
// lệch %) chạy y như khi nhân viên gõ tay, không phải sửa gì.
function openPrepFinishWeigh() {
  const b = PREP_BATCHES_CACHE_POS.find(x => x.id === _finishingBatchId);
  if (!b) { toast('⚠️ Không tìm thấy lô'); return; }
  openWeighPad({
    prepId: b.prepId, unit: b.unit,
    title: 'Cân ' + (b.prepName || 'mẻ vừa nấu'),
    onDone: (total, lines) => {
      _prepFinishWeighLines = lines;
      const el = document.getElementById('prepFinishQty');
      if (el) el.value = total;
      const info = document.getElementById('prepFinishWeighInfo');
      if (info) info.innerHTML = weighSummaryHTML(lines, b.unit, 'openPrepFinishWeigh()');
      onPrepFinishQtyInput();
    },
    onManual: () => { const el = document.getElementById('prepFinishQty'); if (el) el.focus(); }
  });
}

// ══════════════════════════════════════════════════════════════════════════
// [MỚI] XEM LẠI CÔNG THỨC + CÁCH CHẾ BIẾN của MỘT lô đang nấu.
// BTP nhiều bước (ví dụ nấu → ủ → lọc) thì nhân viên bấm "Bắt đầu chế biến" xong là
// màn hình chỉ còn nút Huỷ/Hoàn thành — không còn cách nào xem lại đã cần bỏ đúng
// nguyên liệu gì, càng không có "làm bước nào tiếp theo" nếu quên giữa chừng. Trước
// đây phải nhớ hết hoặc nhờ Quản lý mở "Chế biến cấp 1" hộ (màn POS không vào được).
// Giờ mở thẳng từ thẻ "Đang chế biến", tính lại đúng theo tỷ lệ mẻ CỦA LÔ ĐÓ (không
// phải theo lựa chọn hiện tại ở form chọn thành phẩm, có thể đang là mẻ khác).
// ══════════════════════════════════════════════════════════════════════════
function openPrepRecipeView(batchId) {
  const b = PREP_BATCHES_CACHE_POS.find(x => x.id === batchId);
  if (!b) { toast('⚠️ Không tìm thấy lô'); return; }
  const p = PREP_ITEMS_CACHE_POS.find(x => x.id === b.prepId) || {};
  const ratio = Number(b.batchRatio) || 1;
  const nameOf = id => (KHO_ITEMS_CACHE.find(x => x.id === id) || {}).name || '(nguyên liệu đã xoá)';
  const unitOf = id => (KHO_ITEMS_CACHE.find(x => x.id === id) || {}).unit || '';
  const box = document.getElementById('prepBatchBody');
  prepSetBack(renderPrepBatchForm);
  box.innerHTML = `
    <div class="wal-section" style="margin:0 0 14px;border:1.5px solid #fcd34d;background:#fffbeb;">
      <div class="wal-section-title" style="color:#92400e;">${b.prepName || ''}</div>
      <div style="font-size:12.5px;color:#a16207;">Bắt đầu ${fmtDateTimeShort(b.startedAt)} · ${ratio.toLocaleString('vi-VN')} mẻ</div>
    </div>
    <div class="wal-section" style="margin:0 0 14px;">
      <div class="wal-section-title">Nguyên liệu (đã tính đúng mẻ này)</div>
      ${(p.batchInputs || []).map(row => `
        <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f0f0f0;font-size:13px;">
          <span style="color:var(--td);">${nameOf(row.itemId)}</span>
          <span style="font-weight:700;color:var(--gd);white-space:nowrap;">${fmtPrepQty((Number(row.qty) || 0) * ratio)} ${unitOf(row.itemId)}</span>
        </div>`).join('') || '<div style="font-size:12.5px;color:#bbb;padding:8px 0;">Công thức mẻ chưa khai nguyên liệu nào.</div>'}
    </div>
    ${(p.instructions || '').trim() ? `
    <div class="wal-section" style="margin:0 0 14px;">
      <div class="wal-section-title">Cách chế biến</div>
      <div style="font-size:13.5px;color:var(--td);line-height:1.7;white-space:pre-wrap;">${escHtmlPos(p.instructions.trim())}</div>
    </div>` : `
    <div class="wal-section" style="margin:0 0 14px;">
      <div style="font-size:12.5px;color:#bbb;">Chưa có hướng dẫn cách chế biến cho thành phẩm này — Quản lý khai ở "Chế biến cấp 1".</div>
    </div>`}
    <button onclick="renderPrepBatchForm()" style="width:100%;padding:12px;background:none;border:1px solid #ddd;color:var(--gt);border-radius:14px;font-weight:600;font-size:13px;cursor:pointer;">← Quay lại</button>
  `;
}

// Đọc các giao dịch TRỪ KHO gốc của một lô. Ném lỗi nếu không đọc được — nơi gọi
// phải dừng lại chứ tuyệt đối không được huỷ lô mà bỏ qua việc hoàn nguyên liệu.
async function _loadBatchConsumptionTxPOS(batchId) {
  const out = [];
  const snap = await fstore.collection('stock_transactions_gieogieo')
    .where('referenceId', '==', batchId).get();
  snap.docs.forEach(d => {
    const tx = d.data();
    if (tx.prepRecon === true) return; // NL đã thực lấy không tự hồi sinh khi huỷ BTP.
    if (tx.reversal === true) return;          // bỏ qua chính các bản ghi hoàn
    if (tx.type !== 'CONSUMPTION') return;
    const q = Number(tx.qty) || 0;
    if (q >= 0) return;                        // chỉ lấy giao dịch TRỪ (qty âm)
    out.push({
      itemId: tx.itemId,
      qty: Math.abs(q),
      // [Sửa lỗi 3] Trả quầy về đúng vị trí đã trừ ({vị trí: lượng}); dòng cũ không ghi vị trí → số như trước.
      locDeducted: (typeof tx.locDeducted === 'number') ? (tx.locDeductedAt ? { [tx.locDeductedAt]: tx.locDeducted } : tx.locDeducted) : undefined,
      fifoAllocations: Array.isArray(tx.fifoAllocations) ? tx.fifoAllocations : null,
      // [FIX cùng đợt với "KIT bột sữa/Sữa gạo âm ảo"] Đánh dấu khoản trừ này đã có tem
      // quét-chốt đại diện (xem _startPrepBatchImpl) — khi hoàn (Huỷ mẻ), _reverseAtomicContainerFinish
      // ở BƯỚC 3.5 tự lo phần tem quay lại 'sealed' + recompute rồi, _reverseIngredientConsumptionPOS
      // không ghi Sổ lệch và không recompute sớm cho khoản này.
      atomicScanned: tx.atomicScanned === true
    });
  });
  return out;
}

// Hoàn lại toàn bộ nguyên liệu đã trừ cho một lô. Dùng chung cho 2 tình huống:
// huỷ mẻ (dưới đây) và cuộn ngược khi bắt đầu mẻ bị lỗi giữa chừng.
async function _reversePrepBatchInputsPOS(batchId, note) {
  const txs = await _loadBatchConsumptionTxPOS(batchId);
  if (!txs.length) return { ok: 0, failed: 0 };
  const results = await Promise.allSettled(txs.map(t =>
    UnitEngine.consume.reverseIngredient(t.itemId, t.qty, note, batchId, t.locDeducted, t.fifoAllocations, t.atomicScanned)
  ));
  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length) console.warn('[Huỷ mẻ] hoàn nguyên liệu lỗi:', failed.map(f => f.reason));
  refreshFifoAlert().catch(() => {}); // huỷ mẻ có thể vừa "mở lại" phần tem chưa thật sự cạn
  return { ok: results.length - failed.length, failed: failed.length };
}

let _cancellingBatchId = null;

function openPrepCancelForm(batchId) {
  const b = PREP_BATCHES_CACHE_POS.find(x => x.id === batchId);
  if (!b) { toast('⚠️ Không tìm thấy lô'); return; }
  const pending=Object.entries(b.reconcileInputs||{}).find(([,r])=>r.status!=='done');
  if(pending){toast('⚠️ Chốt lượng NL đã lấy trước khi hủy mẻ');openPrepReconForm(batchId,pending[0]);return;}
  _cancellingBatchId = batchId;
  const p = PREP_ITEMS_CACHE_POS.find(x => x.id === b.prepId) || {};
  const ratio = Number(b.batchRatio) || 1;
  const nameOfItem = id => (KHO_ITEMS_CACHE.find(x => x.id === id) || {}).name || '(nguyên liệu đã xoá)';
  const unitOfItem = id => (KHO_ITEMS_CACHE.find(x => x.id === id) || {}).unit || '';
  // Danh sách xem trước dựng từ công thức — chỉ để nhân viên hình dung. Số hoàn THẬT
  // lấy từ giao dịch gốc lúc bấm nút, nên nếu hai bên lệch thì bản ghi mới là đúng.
  // NL lấy qua cân đối chiếu KHÔNG hoàn theo công thức — có khối riêng "cân lại" bên dưới.
  const reconIds = new Set(Object.keys(b.reconcileInputs || {}));
  _prepCancelRecon = prepCancelReconState(b);
  const rows = (p.batchInputs || []).filter(r => r.itemId && Number(r.qty) > 0 && !reconIds.has(r.itemId)).map(r =>
    `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:12.5px;">
       <span style="color:var(--td);">${nameOfItem(r.itemId)}</span>
       <span style="font-weight:700;color:#16a34a;white-space:nowrap;">+${fmtPrepQty((Number(r.qty) || 0) * ratio)} ${unitOfItem(r.itemId)}</span>
     </div>`).join('');
  const chip = txt => `<button onclick="prepCancelPickReason('${txt}')" style="padding:8px 12px;border-radius:11px;border:1.5px solid #e6e1d2;background:#fff;color:#666;font-family:'Google Sans',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer;">${txt}</button>`;
  const box = document.getElementById('prepBatchBody');
  prepSetBack(openPrepBatchScreen);
  box.innerHTML = `
    <div class="wal-section" style="margin:0 0 14px;border:1.5px solid #fca5a5;background:#fef2f2;">
      <div class="wal-section-title" style="color:#b91c1c;">Huỷ mẻ: ${b.prepName || ''}</div>
      <div style="font-size:12.5px;color:#a16207;margin-bottom:10px;">Bắt đầu ${fmtDateTimeShort(b.startedAt)} · ${Number(ratio).toLocaleString('vi-VN')} mẻ</div>
      <div style="font-size:12.5px;color:#b91c1c;font-weight:700;margin-bottom:6px;">Nguyên liệu sẽ được hoàn về kho</div>
      ${rows || '<div style="font-size:12.5px;color:#bbb;padding:6px 0;">Lô này không trừ nguyên liệu nào.</div>'}
      <div style="font-size:11px;color:#999;margin-top:8px;">Số hoàn thật lấy đúng theo bản ghi trừ kho lúc bắt đầu, không tính lại từ công thức.</div>
    </div>
    <div id="prepCancelReconBox"></div>

    <div class="wal-section" style="margin:0 0 14px;">
      <div class="wal-input-label" style="margin:0 0 6px;">Lý do huỷ (bắt buộc)</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
        ${chip('Bấm nhầm thành phẩm')}${chip('Nhầm số mẻ')}${chip('Thiếu nguyên liệu')}${chip('Hỏng giữa chừng')}
      </div>
      <div class="wal-input-group" style="margin-bottom:0;">
        <input id="prepCancelReason" type="text" placeholder="Chọn nhanh bên trên hoặc gõ lý do khác" style="width:100%;">
      </div>
    </div>

    <div class="wal-section" style="margin:0 0 14px;">
      ${renderPinInput('prepCancelStaff')}
    </div>
    <button id="prepCancelBtn" onclick="submitPrepCancel()" style="width:100%;padding:14px;background:#b91c1c;color:#fff;border:none;border-radius:14px;font-weight:700;font-size:15px;cursor:pointer;">Huỷ mẻ &amp; hoàn nguyên liệu</button>
    <button onclick="openPrepBatchScreen()" style="width:100%;padding:12px;background:none;border:1px solid #ddd;color:var(--gt);border-radius:14px;font-weight:600;font-size:13px;cursor:pointer;margin-top:8px;">← Quay lại</button>
  `;
  renderPrepCancelRecon();
}

// ── [Huỷ mẻ — NL đã cân đối chiếu] ─────────────────────────────────────────────────────────
// NL lấy qua cân đối chiếu không tự hoàn khi huỷ (có thể đã đổ vào nồi). Chủ dự án chốt: hỏi RIÊNG từng NL
//   "Đã hoàn trả"        → BẮT cân lại từng mã; hoàn = số cân lại − tồn mã lúc cân (≤ lượng đã lấy mã đó);
//                          phần lấy mà không trả lại được → HAO HỤT;
//   "Không thể hoàn trả" → toàn bộ lượng đã lấy của NL đó → HAO HỤT (không cần cân).
// Phần ghi (mã + sổ) nằm trong engine: UnitEngine.prep.cancelSettleRecon.
let _prepCancelRecon = null;

function prepCancelReconState(b) {
  const items = [];
  for (const [itemId, r] of Object.entries(b.reconcileInputs || {})) {
    if (!r || r.status !== 'done') continue;
    const it = KHO_ITEMS_CACHE.find(x => x.id === itemId) || {};
    const g = { itemId, itemName: it.name || r.itemName || itemId, unit: it.unit || r.unit || '', countable: prepReconIsCountable(it),
      taken: 0, answer: '', units: [], blocked: [] };
    for (const u of (r.submitted || [])) {
      const taken = round2((Number(u.bookBaseline ?? u.baseline) || 0) - (Number(u.after) || 0));
      if (!(taken > 0.005)) continue;
      g.taken = round2(g.taken + taken);
      const base = { unitId: u.id, code: u.code || '', taken };
      if (u.id === '__aggregate' || u.finished) g.blocked.push(base);
      else g.units.push({ ...base, weighed: null, live: null, returned: 0, lines: [], gone: false });
    }
    if (!(g.taken > 0.005)) continue;
    if (!g.units.length) g.answer = 'khong_tra';   // mọi mã đã báo hết → không trả lại được
    items.push(g);
  }
  return items.length ? { batchId: b.id, items } : null;
}

// Tổng kết 1 NL: trả lại bao nhiêu, hao hụt bao nhiêu (theo câu trả lời + số cân lại).
function prepCancelReconSum(g) {
  const tra = g.answer === 'da_tra' ? round2(g.units.reduce((a, x) => a + (x.gone ? 0 : (Number(x.returned) || 0)), 0)) : 0;
  return { tra, hao: round2(Math.max(0, g.taken - tra)) };
}

function renderPrepCancelRecon() {
  const st = _prepCancelRecon, box = document.getElementById('prepCancelReconBox');
  if (!box) return;
  if (!st) { box.innerHTML = ''; return; }
  const q = (n, u) => fmtPrepQty(n) + ' ' + escHtmlPos(u || '');
  const btn = (on, txt, act) => `<button onclick="${act}" style="flex:1;padding:10px 6px;border-radius:12px;border:1.5px solid ${on ? '#0062AD' : '#cbd5e1'};background:${on ? '#0062AD' : '#fff'};color:${on ? '#fff' : '#334155'};font-weight:700;font-size:13px;cursor:pointer;">${txt}</button>`;
  const unitRow = (g, x, i, j) => {
    let right;
    if (x.gone) right = `<span style="color:#b91c1c;font-weight:700;font-size:12px;">Mã không còn mở — không hoàn</span>`;
    else if (x.weighed != null) right = `<span style="font-size:12px;">Cân lại <b>${q(x.weighed, g.unit)}</b> → hoàn <b style="color:#16a34a;">+${q(x.returned, g.unit)}</b></span>
        <button onclick="prepCancelReconMeasure(${i},${j})" style="margin-left:6px;padding:6px 10px;border-radius:10px;border:1px solid #0062AD;background:#fff;color:#0062AD;font-size:12px;">${g.countable ? 'Đếm lại' : 'Cân lại'}</button>`;
    else if (g.countable) right = `<input id="pcrCount_${i}_${j}" type="number" inputmode="numeric" min="0" placeholder="Đếm còn" style="width:84px;padding:8px;border:1px solid #0062AD;border-radius:10px;">
        <button onclick="prepCancelReconMeasure(${i},${j})" style="margin-left:6px;padding:8px 12px;border-radius:10px;border:0;background:#0062AD;color:#fff;font-weight:700;font-size:12px;">Lưu</button>`;
    else right = `<button onclick="prepCancelReconMeasure(${i},${j})" style="padding:8px 14px;border-radius:10px;border:0;background:#0062AD;color:#fff;font-weight:700;font-size:13px;">⚖️ Cân lại</button>`;
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0 6px 10px;font-size:12.5px;">
      <span>mã ${escHtmlPos(x.code)}<br><span style="color:#64748b;">đã lấy ${q(x.taken, g.unit)}</span></span>
      <span style="text-align:right;white-space:nowrap;">${right}</span></div>`;
  };
  const item = (g, i) => {
    const s = prepCancelReconSum(g);
    const choose = g.units.length
      ? `<div style="display:flex;gap:8px;margin:8px 0 4px;">${btn(g.answer === 'da_tra', 'Đã hoàn trả', `prepCancelReconAnswer(${i},'da_tra')`)}${btn(g.answer === 'khong_tra', 'Không thể hoàn trả', `prepCancelReconAnswer(${i},'khong_tra')`)}</div>`
      : `<div style="font-size:12px;color:#b91c1c;margin:6px 0;">Mã đã báo hết — không trả lại được</div>`;
    const detail = g.answer === 'da_tra'
      ? `<div style="font-size:12px;color:#0062AD;font-weight:700;margin-top:4px;">Trả lại vào đúng bao / vị trí cũ, rồi cân lại từng mã:</div>${g.units.map((x, j) => unitRow(g, x, i, j)).join('')}`
      : '';
    const blocked = g.blocked.map(x => `<div style="font-size:12px;color:#64748b;padding:4px 0 4px 10px;">mã ${escHtmlPos(x.code)} · đã lấy ${q(x.taken, g.unit)} — mã đã báo hết, không trả lại được</div>`).join('');
    const ketQua = g.answer
      ? `<div style="font-size:12px;margin-top:6px;">→ ${s.tra > 0.005 ? `hoàn <b style="color:#16a34a;">+${q(s.tra, g.unit)}</b>` : ''}${s.tra > 0.005 && s.hao > 0.005 ? ' · ' : ''}${s.hao > 0.005 ? `ghi <b style="color:#b91c1c;">HAO HỤT ${q(s.hao, g.unit)}</b>` : ''}</div>`
      : '';
    return `<div style="padding:10px 0;border-bottom:1px solid #dbe7f3;">
      <div style="font-size:13.5px;"><b>${escHtmlPos(g.itemName)}</b> — đã lấy ${q(g.taken, g.unit)}</div>
      ${choose}${detail}${blocked}${ketQua}</div>`;
  };
  box.innerHTML = `<div class="wal-section" style="margin:0 0 14px;border:1.5px solid #0062AD;background:#EAF3FA;">
    <div class="wal-section-title" style="color:#0062AD;">Nguyên liệu đã cân lấy ra (đối chiếu)</div>
    <div style="font-size:12.5px;color:#334155;">Với <b>từng nguyên liệu</b>: đã trả lại vào bao / vị trí cũ chưa? <b>Đã hoàn trả</b> → cân lại từng mã, hệ thống hoàn đúng phần cân lại tăng thêm. <b>Không thể hoàn trả</b> → ghi hao hụt.</div>
    ${st.items.map(item).join('')}
  </div>`;
}

function prepCancelReconAnswer(i, v) {
  const g = _prepCancelRecon && _prepCancelRecon.items[i];
  if (g && g.units.length) { g.answer = v; renderPrepCancelRecon(); }
}

async function prepCancelReconMeasure(i, j) {
  const g = _prepCancelRecon && _prepCancelRecon.items[i], x = g && g.units[j];
  if (!x) return;
  if (g.countable) {
    const el = document.getElementById('pcrCount_' + i + '_' + j);
    if (x.weighed != null && !el) { x.weighed = null; x.returned = 0; renderPrepCancelRecon(); return; }   // "Đếm lại"
    const v = el ? el.value : '';
    if (v === '' || !Number.isInteger(Number(v)) || Number(v) < 0) { toast('⚠️ Đếm số còn lại của mã ' + x.code); return; }
    return prepCancelReconSet(i, j, Number(v), []);
  }
  await openWeighPad({ itemId: g.itemId, unit: g.unit, title: 'Cân lại sau khi huỷ · ' + g.itemName + ' · ' + x.code,
    reconcileMode: true, allowZero: true, onDone: (qty, lines) => prepCancelReconSet(i, j, qty, lines) });
}

async function prepCancelReconSet(i, j, qty, lines) {
  const g = _prepCancelRecon && _prepCancelRecon.items[i], x = g && g.units[j];
  if (!x) return;
  let live = null;
  try { live = (await UnitEngine.prep.reconReadUnits(g.itemId)).find(u => u.id === x.unitId); }
  catch (err) { toast('❌ Không đọc được tồn hiện tại của mã — kiểm tra mạng rồi cân lại'); return; }
  if (!live) { x.gone = true; toast('⚠️ Mã ' + x.code + ' không còn đang mở — phần này ghi hao hụt, báo Quản lý'); renderPrepCancelRecon(); return; }
  const w = round2(Number(qty) || 0), cur = Number(live.unitBase) || 0;
  if (w < cur - 0.015) { toast(`⚠️ Cân lại ${fmtPrepQty(w)} ${g.unit} nhỏ hơn tồn hiện tại của mã (${fmtPrepQty(cur)} ${g.unit}) — kiểm tra bì / đúng mã rồi cân lại`); return; }
  if (w - cur > x.taken + 0.015) { toast(`⚠️ Cân lại tăng ${fmtPrepQty(w - cur)} ${g.unit} — nhiều hơn lượng đã lấy (${fmtPrepQty(x.taken)} ${g.unit}). Kiểm tra bì / đúng mã rồi cân lại`); return; }
  x.weighed = w; x.live = cur; x.lines = lines || []; x.returned = Math.max(0, round2(w - cur));
  renderPrepCancelRecon();
}

function prepCancelPickReason(txt) {
  const el = document.getElementById('prepCancelReason');
  if (el) { el.value = txt; el.focus(); }
}

async function submitPrepCancel() {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  _posSubmitBusy = true;
  const restoreBtn = setBtnBusy('prepCancelBtn', '⏳ Đang hoàn nguyên liệu...');
  try { await _submitPrepCancelImpl(); } finally { _posSubmitBusy = false; restoreBtn(); }
}

async function _submitPrepCancelImpl() {
  const b = PREP_BATCHES_CACHE_POS.find(x => x.id === _cancellingBatchId);
  if (!b) { toast('⚠️ Không tìm thấy lô'); return; }
  if(Object.values(b.reconcileInputs||{}).some(r=>r.status!=='done')){
    toast('⚠️ NL còn chờ cân — chưa thể hủy mẻ');return;
  }
  const reason = (document.getElementById('prepCancelReason')?.value || '').trim();
  if (!reason) { toast('⚠️ Phải ghi lý do huỷ'); return; }
  // [Huỷ mẻ — NL đã cân đối chiếu] từng NL phải có câu trả lời; "Đã hoàn trả" thì phải cân lại đủ từng mã.
  const rc = (_prepCancelRecon && _prepCancelRecon.batchId === b.id && _prepCancelRecon.items.length) ? _prepCancelRecon : null;
  if (rc) {
    const chuaTraLoi = rc.items.find(g => !g.answer);
    if (chuaTraLoi) { toast('⚠️ ' + chuaTraLoi.itemName + ': chọn "Đã hoàn trả" hoặc "Không thể hoàn trả"'); return; }
    const chuaCan = rc.items.filter(g => g.answer === 'da_tra').flatMap(g => g.units.filter(x => !x.gone && x.weighed == null).map(x => [g, x]));
    if (chuaCan.length) { toast('⚠️ Cân lại ' + chuaCan.length + ' mã trước khi huỷ (vd ' + chuaCan[0][0].itemName + ' · mã ' + chuaCan[0][1].code + ')'); return; }
  }
  const staffEmp = await resolveStaffPinAndCheckin('prepCancelStaff');
  if (!staffEmp) return;
  let reconNote = '';
  if (rc) {
    reconNote = '\n\nNL đã cân lấy ra:' + rc.items.map(g => {
      const s = prepCancelReconSum(g), p = [];
      if (s.tra > 0.005) p.push(`hoàn +${fmtPrepQty(s.tra)} ${g.unit}`);
      if (s.hao > 0.005) p.push(`HAO HỤT ${fmtPrepQty(s.hao)} ${g.unit}`);
      return `\n• ${g.itemName}: ${p.join(' · ') || '—'}` + (g.answer === 'da_tra' && !(s.tra > 0.005) ? ' (chọn "Đã hoàn trả" nhưng cân lại không tăng)' : '');
    }).join('');
  }
  if (!(await posConfirm(
    `Huỷ mẻ ${b.prepName || ''} và hoàn nguyên liệu về kho?\n\nLý do: ${reason}${reconNote}`,
    { danger: true, okText: 'Huỷ mẻ', cancelText: 'Không' }))) return;

  // BƯỚC 1 — đọc giao dịch gốc TRƯỚC khi đụng vào bất cứ thứ gì. Đọc lỗi thì dừng
  // hẳn, chưa có gì thay đổi, nhân viên thử lại được.
  let txs;
  try {
    txs = await _loadBatchConsumptionTxPOS(b.id);
  } catch (err) {
    console.error('submitPrepCancel: không đọc được giao dịch gốc', err);
    toast('❌ Không đọc được dữ liệu trừ kho của lô — chưa huỷ, thử lại');
    return;
  }

  // BƯỚC 2 — GIÀNH lô bằng transaction trước khi hoàn. Hai tablet cùng bấm huỷ một
  // lô thì chỉ một bên qua được cửa này; nếu hoàn trước rồi mới đổi trạng thái thì
  // cả hai cùng hoàn và kho dư gấp đôi — sai nặng hơn nhiều so với việc huỷ hụt.
  // [v18] Kế hoạch huỷ (lý do, người, câu trả lời từng NL đã cân + phần cân lại) ghi CÙNG transaction —
  // app tắt/rớt mạng giữa lúc hoàn thì mẻ vẫn hiện "Hoàn tiếp" (cancelSettled:false), làm tiếp đúng kế hoạch.
  const cancelledAt = vnDate().toISOString();
  const plan = { reason, staffName: staffEmp.fullName, staffId: staffEmp.id,
    recon: rc ? rc.items.map(g => ({ itemId: g.itemId, itemName: g.itemName, unit: g.unit, answer: g.answer, taken: g.taken,
      returns: g.answer === 'da_tra' ? g.units.filter(x => !x.gone && x.returned > 0.005).map(x => ({ unitId: x.unitId, code: x.code, returned: x.returned })) : [] })) : [] };
  try {
    // [E4.6] Giành lô 'cooking' → 'cancelled' (transaction) — unit_engine.v1.js (prep.claimCancel).
    await UnitEngine.prep.claimCancel(b.id, { cancelledAt, reason, staffEmp, plan });
  } catch (err) {
    console.warn('submitPrepCancel: không giành được lô', err);
    toast('⚠️ ' + (err.message || err));
    openPrepBatchScreen();   // hàm này tự nạp lại danh sách lô
    return;
  }

  // BƯỚC 3 → 3.5 — tới đây lô đã chắc chắn là của mình.
  const note = `Hoàn kho do HUỶ MẺ ${b.prepName || ''}${b.prepCode ? ' (' + b.prepCode + ')' : ''} — ${reason}`;
  const reconDetail = rc ? { cancelReconAnswer: Object.fromEntries(rc.items.map(g => [g.itemId, g.answer])),
    cancelReconWeighed: rc.items.flatMap(g => g.units.map(x => ({ itemId: g.itemId, containerId: x.unitId, code: x.code, taken: x.taken, answer: g.answer,
      weighed: x.weighed, liveBefore: x.live, returned: (g.answer === 'da_tra' && !x.gone) ? x.returned : 0, gone: !!x.gone })).concat(
      g.blocked.map(x => ({ itemId: g.itemId, containerId: x.unitId, code: x.code, taken: x.taken, answer: g.answer, returned: 0, finished: true })))) } : null;
  const r = await _runPrepCancelSettle(b, { txs, plan, staffEmp, note, reason, retry: false, reconDetail });
  const { ok, failed, reconFail, reconTxt, atomicIds, atomicOk, atomicFailed } = r;

  const atomicMsg = atomicIds.length
    ? (atomicFailed ? ` — ${atomicFailed}/${atomicIds.length} tem đã quét CHƯA hoàn lại được` : `, ${atomicOk} tem đã quét cũng được hoàn lại`)
    : '';
  const conLai = r.allOk ? '' : ' · bấm "Hoàn tiếp" ở màn Nấu chế biến để làm nốt';
  if (rc) {
    _prepCancelRecon = null;
    const reconMsg = reconTxt.length ? ` · ${reconTxt.join(' · ')}` : '';
    if (failed || reconFail) toastAutoReport(`⚠️ Đã huỷ mẻ nhưng ${failed + reconFail} NL hoàn kho lỗi${reconMsg}${atomicMsg}${conLai}`, 'Huỷ mẻ: hoàn kho lỗi', { ref: String(Date.now()) });
    else toast(`✅ Đã huỷ mẻ${ok ? ` và hoàn ${ok} nguyên liệu về kho` : ''}${reconMsg}${atomicMsg}${conLai}`);
  } else if (failed) {
    toastAutoReport(`⚠️ Đã huỷ mẻ nhưng ${failed}/${ok + failed} nguyên liệu hoàn kho lỗi${atomicMsg}${conLai}`, 'Huỷ mẻ: hoàn kho lỗi', { ref: String(Date.now()) });
  } else if (ok) {
    toast(`✅ Đã huỷ mẻ và hoàn ${ok} nguyên liệu về kho${atomicMsg}${conLai}`);
  } else {
    toast(`✅ Đã huỷ mẻ (lô này không trừ nguyên liệu nào)${atomicMsg}${conLai}`);
  }
  openPrepBatchScreen();     // hàm này tự nạp lại danh sách lô
}

// Các bước hoàn kho của Huỷ mẻ — dùng chung cho lần huỷ đầu và "Hoàn tiếp". Mọi bước đều chạy lại an toàn:
//   · hoàn NL theo dòng trừ gốc: claim + dòng hoàn id cố định theo (mẻ + NL) — đã hoàn thì bỏ qua;
//   · NL đã cân đối chiếu (cancelSettleRecon): RT theo op trên mã, sổ theo dấu trong lý do sửa; lượt Hoàn tiếp bỏ qua
//     mã không còn nhận được (phần đó thành hao hụt) để mẻ không kẹt mãi;
//   · tem "cái rời" đã quét: engine nhận ra tem đã hoàn cho CHÍNH mẻ này (không hoàn nhầm khi tem đã được mẻ khác dùng lại).
// Xong hết → cancelSettled:true (hết hiện "Hoàn tiếp"); còn bước lỗi → false.
async function _runPrepCancelSettle(b, o) {
  const { txs, plan, staffEmp, note, reason, retry } = o;
  let ok = 0, failed = 0;
  if (txs.length) {
    const results = await Promise.allSettled(txs.map(t =>
      UnitEngine.consume.reverseIngredient(t.itemId, t.qty, note, b.id, t.locDeducted, t.fifoAllocations, t.atomicScanned)
    ));
    failed = results.filter(x => x.status === 'rejected').length;
    ok = results.length - failed;
    if (failed) console.warn('[Huỷ mẻ] hoàn lỗi:', results.filter(x => x.status === 'rejected').map(f => f.reason));
    refreshFifoAlert().catch(() => {}); // huỷ mẻ có thể vừa "mở lại" phần tem chưa thật sự cạn
  }

  // [NL đã cân đối chiếu] từng NL: hoàn phần đã trả (cân lại) vào đúng mã, phần còn lại → HAO HỤT (engine).
  let reconOk = 0, reconFail = 0; const reconTxt = [];
  for (const g of ((plan && plan.recon) || [])) {
    try {
      const kq = await UnitEngine.prep.cancelSettleRecon(b.id, g.itemId, {
        answer: g.answer, staffEmp, batchName: b.prepName || '', reason, returns: g.returns || [], ...(retry ? { skipMissing: true } : {}) });
      reconOk++;
      const p = [];
      if (kq.returned > 0.005) p.push(`hoàn +${fmtPrepQty(kq.returned)} ${g.unit || ''}`);
      if (kq.lost > 0.005) p.push(`hao hụt ${fmtPrepQty(kq.lost)} ${g.unit || ''}`);
      if (kq.skipped && kq.skipped.length) p.push(`mã ${kq.skipped.join(', ')} không còn mở — tính hao hụt`);
      if (p.length) reconTxt.push(`${g.itemName || g.itemId} ${p.join(', ')}`);
    } catch (err) { reconFail++; console.warn('[Huỷ mẻ] xử lý NL đã cân lỗi', g.itemId, err); }
  }

  // Hoàn lại đúng những tem "cái" đã quét ở cổng quét bắt buộc lúc bắt đầu về 'sealed'. Số LƯỢNG nguyên liệu đã
  // được cộng lại ở bước trên, nhưng thiếu bước này thì CHÍNH CÁI TEM đã quét vẫn kẹt ở 'finished' (coi như đã
  // dùng hết) dù mẻ chưa từng thực sự được nấu.
  const atomicIds = Array.isArray(b.atomicScannedContainerIds) ? b.atomicScannedContainerIds : [];
  let atomicOk = 0, atomicFailed = 0;
  if (atomicIds.length) {
    const results = await Promise.allSettled(
      atomicIds.map(cid => UnitEngine.lifecycle.reverseAtomicFinish(cid, b.id, staffEmp, note))
    );
    results.forEach(x => { if (x.status === 'fulfilled' && x.value) atomicOk++; else atomicFailed++; });
  }

  const allOk = !failed && !reconFail && !atomicFailed;
  // Ghi lại kết quả hoàn lên chính lô — để Quản lý rà được lô nào hoàn hụt; cancelSettled quyết định "Hoàn tiếp".
  const reconDetail = o.reconDetail || ((plan && plan.recon && plan.recon.length)
    ? { cancelReconAnswer: Object.fromEntries(plan.recon.map(g => [g.itemId, g.answer])), cancelReconWeighed: b.cancelReconWeighed || [] } : null);
  try {
    await UnitEngine.prep.recordCancelResult(b.id, {   // [E4.6]
      cancelReversedCount: ok, cancelReverseFailedCount: failed,
      cancelAtomicRevertedCount: atomicOk, cancelAtomicRevertFailedCount: atomicFailed,
      ...(reconDetail ? { ...reconDetail, cancelReconReturnedCount: reconOk, cancelReconReturnFailedCount: reconFail } : {}),
      cancelSettled: allOk
    });
  } catch (err) { console.warn('submitPrepCancel: không ghi được kết quả hoàn', err); }
  return { ok, failed, reconOk, reconFail, reconTxt, atomicIds, atomicOk, atomicFailed, allOk };
}

// [v18] "Hoàn tiếp" — mẻ đã huỷ mà bước hoàn kho chưa xong (lỗi mạng, app tắt giữa chừng...). Trước đây lô đã
// 'cancelled' thì không còn nút nào: phần NL chưa hoàn nằm lại mất, chỉ có một cảnh báo mà Quản lý cũng không có
// nút làm lại. Làm tiếp đúng kế hoạch đã ghi lúc huỷ (cancelPlan) — không hỏi lại, không cần PIN (người huỷ đã ký).
async function retryPrepCancelSettle(batchId) {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  _posSubmitBusy = true;
  const restoreBtn = setBtnBusy('prepCancelRetry_' + batchId, '⏳ Đang hoàn tiếp...');
  try {
    const doc = await fstore.collection('prep_batches_gieogieo').doc(batchId).get();
    const b = doc.exists ? { id: doc.id, ...doc.data() } : null;
    if (!b || b.status !== 'cancelled' || b.cancelSettled !== false) {
      toast('ℹ️ Mẻ này đã hoàn xong — đã tải lại');
      await loadPrepBatchesPOS(); renderPrepBatchForm();
      return;
    }
    const plan = b.cancelPlan || { recon: [] };
    const reason = plan.reason || b.cancelReason || '';
    const staffEmp = { id: plan.staffId || b.cancelledByEmployeeId || '', fullName: plan.staffName || b.cancelledBy || '' };
    let txs;
    try { txs = await _loadBatchConsumptionTxPOS(b.id); }
    catch (err) { toast('❌ Không đọc được dữ liệu trừ kho của lô — thử lại khi có mạng'); return; }
    const note = `Hoàn kho do HUỶ MẺ ${b.prepName || ''}${b.prepCode ? ' (' + b.prepCode + ')' : ''} — ${reason}`;
    const r = await _runPrepCancelSettle(b, { txs, plan, staffEmp, note, reason, retry: true });
    const conLoi = r.failed + r.reconFail + r.atomicFailed;
    toast(r.allOk ? `✅ Đã hoàn xong mẻ huỷ ${b.prepName || ''}${r.reconTxt.length ? ' · ' + r.reconTxt.join(' · ') : ''}`
      : `⚠️ Vẫn còn ${conLoi} bước chưa hoàn được — thử lại sau (có thể NL đang chờ cân ở mẻ khác)`);
    await loadPrepBatchesPOS(); renderPrepBatchForm();
  } catch (err) {
    console.error('retryPrepCancelSettle', err);
    toast('❌ Chưa hoàn tiếp được: ' + (err.message || err));
  } finally { _posSubmitBusy = false; restoreBtn(); }
}

async function submitPrepFinish() {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  _posSubmitBusy = true;
  const restoreBtn = setBtnBusy('prepFinishBtn', '⏳ Đang lưu lô...');
  try { await _submitPrepFinishImpl(); } finally { _posSubmitBusy = false; restoreBtn(); }
}

async function _submitPrepFinishImpl() {
  const b = PREP_BATCHES_CACHE_POS.find(x => x.id === _finishingBatchId);
  if (!b) { toast('⚠️ Không tìm thấy lô'); return; }
  const freshRecon=await fstore.collection('prep_batches_gieogieo').doc(b.id).get();
  if(Object.values((freshRecon.data()||{}).reconcileInputs||{}).some(r=>r.status!=='done')){
    toast('⚠️ NL còn chờ cân — chưa thể hoàn thành');return;
  }
  const qty = Number(document.getElementById('prepFinishQty').value) || 0;
  if (!(qty > 0)) { toast('⚠️ Cân/đong rồi nhập số thật thu được'); return; }
  const staffEmp = await resolveStaffPinAndCheckin('prepFinishStaff');
  if (!staffEmp) return;

  // Chụp lại bảng kê NGAY, trước mọi await: nhân viên có thể bấm mở bộ cân lần
  // nữa trong lúc đang chờ mạng, biến _prepFinishWeighLines thành của lần khác.
  const _weighLines = (_prepFinishWeighLines || []).slice(0);
  const p = PREP_ITEMS_CACHE_POS.find(x => x.id === b.prepId) || {};
  // Lệch quá lớn thì hỏi lại ĐÚNG MỘT lần — gõ nhầm 1 chữ số (199 thay vì 1995)
  // sẽ kéo lệch giá vốn của cả BTP đó, mà không ai phát hiện ra ngay.
  const ratio = Number(b.batchRatio) || 1;
  const sug = round2((Number(p.batchYield) || 0) * ratio);
  const lechPct = sug > 0 ? (qty - sug) / sug * 100 : 0;
  if (sug > 0 && Math.abs(lechPct) > PREP_FINISH_CONFIRM_PCT) {
    if (!(await posConfirm(
      `Công thức dự kiến ra ${fmtPrepQty(sug)} ${b.unit || ''} mà bạn nhập ${fmtPrepQty(qty)} ${b.unit || ''} (lệch ${lechPct > 0 ? '+' : ''}${lechPct.toFixed(0)}%).\n\nSố này sẽ được dùng để tính giá vốn. Đúng là số vừa cân chứ?`,
      { okText: 'Đúng, lưu', cancelText: 'Để nhập lại' }))) return;
  }
  const inputCost = prepBatchInputCostPOS(p, ratio, freshRecon.data());
  const finishedAt = vnDate().toISOString();
  const batchCode = await UnitEngine.codes.batchCode({ id: b.prepId, code: b.prepCode }, b.businessDate || posDateKey());
  const expiresAt = computePrepExpiry({ shelfLifeType: b.shelfLifeType, shelfLifeHours: b.shelfLifeHours }, finishedAt);

  try {
    // [E4.6] Giành lô (transaction), ghi PRODUCTION id cố định, cập nhật lô, đăng ký RT + hấp thụ
    // nợ, chốt tồn — unit_engine.v1.js (prep.finishBatch). Ở đây chỉ xử lý kết quả cho màn hình.
    const fin = await UnitEngine.prep.finishBatch(b, { qty, batchCode, expiresAt, inputCost, weighLines: _weighLines,
      staffEmp, sug, lechPct, finishedAt });
    if (fin.status === 'not_found') { toast('⚠️ Lô không tồn tại (có thể vừa bị xoá)'); return; }
    if (fin.status === 'taken') {
      toast('ℹ️ Lô này vừa được hoàn thành/xử lý ở máy khác rồi');
      openPrepBatchScreen();
      return;
    }
    if (fin.status === 'no_finish') { toast('❌ Lỗi nội bộ: thiếu dữ liệu hoàn thành, thử lại'); return; }
    _prepAfterFinishOK(b, fin.finish);
  } catch (err) {
    console.error('submitPrepFinish failed', err);
    toast('❌ Lỗi: ' + (err.code || err.message || err));
  }
}

// Sau khi engine lưu xong lô (Hoàn thành hoặc Tiếp tục lưu): cập nhật màn hình.
function _prepAfterFinishOK(b, finish) {
  // [TỐI ƯU] Trước đây gọi loadPrepBatchesPOS() — tải lại TOÀN BỘ lô từ Firestore
  // chỉ để đọc lại đúng 1 lô vừa ghi, cộng thêm ~1 lượt mạng vào chuỗi 4 lượt đã có
  // (PIN → sinh số lô → transaction → update lô) khiến nút đứng im tới ~3 giây.
  // Ta đã biết chính xác mọi field vừa ghi, nên cập nhật thẳng cache tại chỗ.
  Object.assign(b, {
    batchCode: finish.batchCode, qtyInitial: finish.qty, qtyRemaining: finish.qty,
    finishedAt: finish.finishedAt, expiresAt: finish.expiresAt, status: 'active',
    finishedBy: finish.staffFullName, finishedByEmployeeId: finish.staffEmployeeId
  });
  showPrepLabelCard(b.id);   // hiện thẻ tem để nhân viên chép tay
  // Tính lại giá vốn/yield thật của BTP — chạy nền, KHÔNG chặn nhân viên; lỗi ở
  // đây không ảnh hưởng lô vừa lưu.
  refreshPrepYieldStatsPOS(b.prepId).catch(err => console.warn('[Yield] cập nhật giá vốn lỗi:', err));
  // Đồng bộ lại nền cho chắc (lô do máy khác tạo...) — KHÔNG await, không chặn UI.
  loadPrepBatchesPOS().catch(err => console.warn('loadPrepBatchesPOS (nền) lỗi:', err));
  prepSugRefresh();   // mẻ vừa xong → tồn BTP đổi, tính lại gợi ý
}

// [KẸT Ở 'finishing'] Bấm Hoàn thành mà rớt mạng/tắt app SAU bước giành lô thì lô nằm ở 'finishing'
// với số đã chốt trong _pendingFinish. Engine vốn làm tiếp được (prep.finishBatch đọc lại đúng số đã
// chốt, dòng PRODUCTION id cố định nên không cộng tồn hai lần) — nhưng màn này trước đây chỉ nạp lô
// 'cooking'/'active' nên lô kẹt biến mất, không ai bấm làm tiếp: BTP đã nấu không lên lô, bán ra ghi âm.
// Làm tiếp đúng số đã chốt — không hỏi số mới, không cần PIN (người chốt đã ký lúc Hoàn thành).
async function resumePrepFinish(batchId) {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  _posSubmitBusy = true;
  const restoreBtn = setBtnBusy('prepResume_' + batchId, '⏳ Đang lưu tiếp...');
  try {
    const doc = await fstore.collection('prep_batches_gieogieo').doc(batchId).get();
    const fresh = doc.exists ? { id: doc.id, ...doc.data() } : null;
    const pf = fresh && fresh._pendingFinish;
    if (!fresh || fresh.status !== 'finishing' || !pf) {
      toast('ℹ️ Lô này đã được xử lý ở máy khác — đã tải lại');
      await loadPrepBatchesPOS(); renderPrepBatchForm();
      return;
    }
    const fin = await UnitEngine.prep.finishBatch(fresh, {
      qty: pf.qty, batchCode: pf.batchCode, expiresAt: pf.expiresAt, inputCost: pf.inputCost,
      weighLines: pf.weighLines || [], finishedAt: pf.finishedAt,
      staffEmp: { id: pf.staffEmployeeId, fullName: pf.staffFullName },
      sug: Number(pf.declaredYieldTotal) || 0, lechPct: Number(pf.yieldVariancePct) || 0
    });
    if (fin.status !== 'ok') {
      toast('ℹ️ Lô này đã được xử lý ở máy khác — đã tải lại');
      await loadPrepBatchesPOS(); renderPrepBatchForm();
      return;
    }
    let b = PREP_BATCHES_CACHE_POS.find(x => x.id === batchId);
    if (!b) { b = fresh; PREP_BATCHES_CACHE_POS.push(b); }
    delete b._pendingFinish;
    toast('✅ Đã lưu xong lô ' + (fin.finish.batchCode || ''));
    _prepAfterFinishOK(b, fin.finish);
  } catch (err) {
    console.error('resumePrepFinish failed', err);
    toast('❌ Chưa lưu được: ' + (err.code || err.message || err) + ' — bấm "Tiếp tục lưu" lại');
  } finally { _posSubmitBusy = false; restoreBtn(); }
}

// ============================================================================
// [MỚI] SỬA ĐỊNH LƯỢNG THU ĐƯỢC CỦA LÔ ĐÃ HOÀN THÀNH
// ----------------------------------------------------------------------------
// Vấn đề vận hành thật: nhân viên bấm nấu 2 mẻ (trừ nguyên liệu theo đúng 2 mẻ), nhưng
// thực tế chỉ nấu 1 mẻ mà không ai để ý. Lúc "Hoàn thành" họ cân đúng số THẬT (của 1
// mẻ) rồi nhập vào — số đó đúng với cân nặng thật, nhưng THẤP hơn hẳn kỳ vọng của "2
// mẻ", nên báo cáo hiện ra như một khoản hao hụt 50% không có lý do, trong khi lý do
// thật chỉ là khai nhầm số mẻ chứ không mất mát gì.
//
// Trước đây một khi đã "Hoàn thành" thì không có đường sửa lại — muốn đúng số phải nhờ
// Quản lý can thiệp thẳng dữ liệu. Giờ thêm nút sửa NGAY tại đây, nhưng giới hạn quyền
// bằng mã quản lý (MANAGER_OVERRIDE_PIN, dùng chung với tab Doanh thu theo đúng yêu
// cầu) — có đúng mã này thì không cần thêm PIN nhân viên nữa, vì bản thân việc biết mã
// quản lý đã là định danh đủ cho hành động có rủi ro cao này (sửa thẳng sản lượng đã
// chốt, ảnh hưởng giá vốn).
// ============================================================================
let _yieldEditingBatchId = null;

let _yieldEditOpId = null;

function openPrepYieldEditForm(batchId) {
  const b = PREP_BATCHES_CACHE_POS.find(x => x.id === batchId);
  if (!b) { toast('⚠️ Không tìm thấy lô'); return; }
  _yieldEditingBatchId = batchId;
  _yieldEditOpId = 'yld_' + batchId + '_' + Date.now();
  const box = document.getElementById('prepBatchBody');
  prepSetBack(openPrepBatchScreen);
  box.innerHTML = `
    <div class="wal-section" style="margin:0 0 14px;border:1.5px solid #fca5a5;background:#fef2f2;">
      <div class="wal-section-title" style="color:#b91c1c;">Sửa định lượng thu được</div>
      <div style="font-size:12.5px;color:#7f1d1d;margin-bottom:4px;">${b.batchCode || ''} · ${b.prepName || ''}</div>
      <div style="font-size:12.5px;color:#7f1d1d;">Đang ghi nhận: <b>${fmtPrepQty(b.qtyInitial)} ${b.unit || ''}</b></div>
      <div style="font-size:11px;color:#991b1b;margin-top:8px;line-height:1.6;">Chỉ dùng khi số đã "Hoàn thành" bị ghi sai (VD: khai nấu 2 mẻ nhưng thực tế chỉ nấu 1 mẻ) — không phải chỗ để ghi hao hụt/đổ bỏ.</div>
    </div>
    <div class="wal-section" style="margin:0 0 14px;">
      <div class="wal-input-label" style="margin:0 0 6px;">Mã xác nhận (quản lý)</div>
      <div class="wal-input-group" style="margin-bottom:0;">
        <input id="yieldEditPass" type="password" inputmode="numeric" maxlength="4" placeholder="••••" autocomplete="off"
          style="width:100%;border:none;outline:none;font-family:'Google Sans',sans-serif;font-size:18px;font-weight:700;letter-spacing:8px;color:var(--td);background:transparent;padding:10px 0;">
      </div>
      <div style="font-size:11px;color:#999;margin-top:4px;">Đúng mã này thì khỏi cần nhập thêm mã nhân viên.</div>
    </div>
    <div class="wal-section" style="margin:0 0 14px;">
      <div class="wal-input-label" style="margin:0 0 6px;">Định lượng ĐÚNG thực tế (${b.unit || ''})</div>
      <div class="wal-input-group" style="margin-bottom:0;">
        <input id="yieldEditQty" type="number" inputmode="decimal" step="0.01" value="${b.qtyInitial}"
          style="width:100%;border:none;outline:none;font-family:'Google Sans',sans-serif;font-size:18px;font-weight:700;color:var(--td);background:transparent;padding:10px 0;">
      </div>
    </div>
    <div class="wal-section" style="margin:0 0 14px;">
      <div class="wal-input-label" style="margin:0 0 6px;">Lý do sửa (bắt buộc)</div>
      <div class="wal-input-group" style="margin-bottom:0;">
        <input id="yieldEditReason" type="text" placeholder="VD: khai nấu 2 mẻ nhưng thực tế chỉ nấu 1 mẻ"
          style="width:100%;border:none;outline:none;font-family:'Google Sans',sans-serif;font-size:14px;color:var(--td);background:transparent;padding:10px 0;">
      </div>
    </div>
    <div id="yieldEditError" style="display:none;font-size:12.5px;font-weight:700;color:#c0392b;margin-bottom:8px;text-align:center;">❌ Sai mã xác nhận</div>
    <button id="yieldEditSaveBtn" onclick="submitPrepYieldEdit()" style="width:100%;padding:14px;background:#b91c1c;color:#fff;border:none;border-radius:14px;font-weight:700;font-size:15px;cursor:pointer;">Lưu định lượng đã sửa</button>
    <button onclick="openPrepBatchScreen()" style="width:100%;padding:12px;background:none;border:1px solid #ddd;color:var(--gt);border-radius:14px;font-weight:600;font-size:13px;cursor:pointer;margin-top:8px;">← Quay lại</button>
  `;
  setTimeout(() => document.getElementById('yieldEditPass')?.focus(), 120);
}

async function submitPrepYieldEdit() {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  const pass = (document.getElementById('yieldEditPass')?.value || '').trim();
  const errEl = document.getElementById('yieldEditError');
  if (pass !== MANAGER_OVERRIDE_PIN) {
    if (errEl) errEl.style.display = 'block';
    return;
  }
  if (errEl) errEl.style.display = 'none';
  const newQty = Number(document.getElementById('yieldEditQty')?.value);
  if (!(newQty > 0)) { toast('⚠️ Nhập định lượng đúng, lớn hơn 0'); return; }
  const reason = (document.getElementById('yieldEditReason')?.value || '').trim();
  if (!reason) { toast('⚠️ Phải ghi rõ lý do sửa'); return; }
  const batchId = _yieldEditingBatchId;
  const b = PREP_BATCHES_CACHE_POS.find(x => x.id === batchId);
  if (!b) { toast('⚠️ Không tìm thấy lô'); return; }
  if (Math.abs(newQty - (Number(b.qtyInitial) || 0)) < 0.005) { toast('⚠️ Số mới trùng số cũ — không có gì để sửa'); return; }
  if (!(await posConfirm(
    `Sửa định lượng lô ${b.batchCode || ''} từ ${fmtPrepQty(b.qtyInitial)} thành ${fmtPrepQty(newQty)} ${b.unit || ''}?\n\nLý do: ${reason}`,
    { danger: true, okText: 'Lưu', cancelText: 'Không' }))) return;

  _posSubmitBusy = true;
  const restoreBtn = setBtnBusy('yieldEditSaveBtn', '⏳ Đang lưu...');
  try {
    await _applyPrepYieldEdit(batchId, newQty, reason, _yieldEditOpId);
    toast('✅ Đã sửa định lượng — nhớ in lại tem mới cho lô này');
    showPrepLabelCard(batchId);
  } catch (err) {
    console.error('submitPrepYieldEdit lỗi', err);
    toast('❌ Không lưu được: ' + (err.message || err));
  } finally { _posSubmitBusy = false; restoreBtn(); }
}

// Áp dụng thật sự.
//
// [SIẾT LẠI — soi lại đường đi dữ liệu lần 2, thấy 3 lỗ hổng so với bản đầu]
//
// 1) TRƯỚC ĐÂY tính "đã bán/dùng mất bao nhiêu" từ MỘT lần đọc RT rời (`once('value')`)
//    RỒI MỚI truyền số đã tính sẵn vào `.transaction()`. Nếu đúng lúc đó có một lượt
//    BÁN HÀNG đang trừ FIFO vào cùng lô này (unitEngineAllocateConsumption ghi RT),
//    transaction sẽ CHẠY LẠI với `cur` mới hơn nhưng ta vẫn trả về số `newRemaining`
//    đã chốt cứng từ lần đọc CŨ — vô tình ghi đè, "hồi sinh" đúng phần vừa bán mất
//    giữa chừng. Giờ tính "đã dùng" NGAY TRONG callback, dùng `cur` của đúng lần chạy
//    sẽ được commit (RTDB tự chạy lại callback tới khi không còn tranh chấp).
//
// 2) TRƯỚC ĐÂY đọc `b` từ CACHE cục bộ (PREP_BATCHES_CACHE_POS) cho oldQtyInitial và
//    không kiểm tra lại status — mở form lúc lô đang "active" nhưng giữa lúc gõ lý do
//    và bấm Lưu, lô có thể đã bị "Huỷ mẻ"/kiểm kê cuối ngày đóng lại ở máy khác. Giờ
//    đọc THẲNG Firestore ngay trước khi ghi, và CHẶN nếu status không còn 'active'.
//
// 3) TRƯỚC ĐÂY chỉ set `status:'used_up'` khi số dư mới về 0, nhưng KHÔNG xử lý chiều
//    ngược lại: nếu lô đã lỡ thành 'used_up' (bán hết) trước khi sửa, sửa tăng số lên
//    sẽ để lại một lô "còn hàng thật" (RT/currentStock đều tăng) nhưng status vẫn
//    'used_up' — biến mất khỏi mục "Lô đang còn" (lọc theo status==='active'), coi như
//    tồn kho ma, không nơi nào bán được. Giờ luôn đồng bộ lại status theo đúng số dư
//    mới, cả hai chiều.
async function _applyPrepYieldEdit(batchId, newQty, reason, opId) {
  // [E4.6] Bước 1–4 (đọc tươi lô, ghi RT, Firestore, suy tồn, dòng sổ ADJUSTMENT id cố định) nằm
  // trong unit_engine.v1.js (UnitEngine.prep.editYield). Ở đây chỉ còn phần của màn hình POS.
  const r = await UnitEngine.prep.editYield(batchId, newQty, reason, {
    opId, batchInputCost: (p, ratio) => prepBatchInputCostPOS(p, ratio)
  });
  // 5) Cập nhật cache tại chỗ — màn hình + tem in ngay sau đó phải phản ánh số mới.
  const b = PREP_BATCHES_CACHE_POS.find(x => x.id === batchId);
  if (b) {
    Object.assign(b, {
      qtyInitial: newQty, qtyRemaining: r.finalRemaining, unitBase: r.finalRemaining,
      actualCostPerUnit: r.newActualCostPerUnit, status: r.status
    });
  }

  // 6) Số cũ (sai) đã từng được tính vào trung bình yield/giá vốn lúc Hoàn thành —
  // tính lại với số đã sửa để giá vốn BTP không còn lệch theo sai số cũ.
  refreshPrepYieldStatsPOS(r.prepId).catch(() => {});
}

// ============================================================
// [GĐ2] THẺ TEM sau khi nấu xong.
// Bản gốc CHỈ cho chép tay, với lý do ghi trong code: tem nhiệt gặp bán thành
// phẩm nóng là bay chữ. Nay bổ sung nút IN TEM (theo yêu cầu vận hành: chép tay
// mỗi lô quá chậm) nhưng CỐ Ý GIỮ NGUYÊN phần chép tay bên dưới làm đường lui —
// máy in tem hỏng/hết giấy giữa ca thì bếp vẫn chạy tiếp được, không phải chờ.
// ============================================================
// Số tem sẽ in ở màn tem lô (chia lô ra nhiều hũ thì mỗi hũ một tem).
let _prepLabelCopies = 1;

function prepLabelSetCopies(batchId, n) { _prepLabelCopies = n; showPrepLabelCard(batchId, true); }

function showPrepLabelCard(batchId, keepCopies) {
  const b = PREP_BATCHES_CACHE_POS.find(x => x.id === batchId);
  if (!b) { toast('⚠️ Không tìm thấy lô'); return; }
  if (!keepCopies) _prepLabelCopies = 1;
  const box = document.getElementById('prepBatchBody');
  prepSetBack(openPrepBatchScreen);
  const n = _prepLabelCopies;
  const row = (label, val, style) => `
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:6px 0;">
        <span style="font-size:15px;color:#8A8A90;font-weight:600;">${label}</span>
        <span style="font-size:17px;font-weight:800;color:var(--td);text-align:right;${style || ''}">${val}</span>
      </div>`;
  const soTem = k => `<button onclick="prepLabelSetCopies('${b.id}', ${k})" style="width:56px;height:56px;border-radius:50%;border:2px solid ${n === k ? 'var(--gd)' : '#e6e1d2'};background:${n === k ? 'var(--gl)' : '#fff'};color:${n === k ? 'var(--gd)' : 'var(--td)'};font-family:'Google Sans',sans-serif;font-size:19px;font-weight:800;cursor:pointer;">${k}</button>`;
  // Nội dung đặt giữa màn: khối cao tối đa đúng vùng cuộn, căn giữa theo chiều dọc,
  // bề ngang giới hạn để trên máy tính bảng không bị kéo dãn hết màn.
  box.innerHTML = `
    <div style="min-height:calc(100dvh - 130px);display:flex;flex-direction:column;justify-content:center;">
    <div style="width:100%;max-width:420px;margin:0 auto;">
      <div style="display:flex;justify-content:center;margin-bottom:14px;">
        <span style="display:inline-flex;align-items:center;gap:7px;padding:8px 14px;border-radius:99px;background:#dcfce7;color:#15803d;font-size:14.5px;font-weight:800;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          Đã nấu xong, dán tem cho lô này
        </span>
      </div>

      <div style="background:#fff;border:3px solid var(--td);border-radius:22px;padding:22px 20px;box-shadow:0 6px 20px rgba(35,28,26,.08);">
        <div style="font-size:32px;font-weight:900;color:var(--td);letter-spacing:.5px;line-height:1.15;word-break:break-all;">${escHtmlPos(b.batchCode || '')}</div>
        <div style="font-size:21px;font-weight:800;color:var(--td);margin-top:6px;">${escHtmlPos(b.prepName || '')}</div>
        <div style="height:1.5px;background:#e6e1d2;margin:16px 0 10px;"></div>
        ${row('Nấu lúc', fmtDateTimeShort(b.finishedAt))}
        ${row('Nhân viên', escHtmlPos(b.finishedBy || ''))}
        ${row('HSD', prepExpiryLabel(b), 'color:#c0392b;font-size:19px;')}
        ${row('Số lượng', fmtPrepQty(b.qtyInitial) + ' ' + escHtmlPos(b.unit || ''))}
      </div>
      <div style="font-size:12.5px;color:#9A9AA0;text-align:center;margin-top:8px;">Máy in lỗi thì chép tay đúng nội dung tem ở trên.</div>

      <div style="margin-top:22px;text-align:center;">
        <div style="font-size:15px;font-weight:800;color:var(--td);">Số tem cần in</div>
        <div style="font-size:12.5px;color:#9A9AA0;margin-top:2px;">Chia lô ra nhiều hũ thì mỗi hũ một tem</div>
        <div style="display:flex;justify-content:center;gap:14px;margin-top:12px;">${soTem(1)}${soTem(2)}${soTem(3)}</div>
      </div>

      <div style="display:flex;gap:10px;margin-top:22px;">
        <button onclick="openPrepBatchScreen()" style="flex:1;min-height:56px;background:#fff;color:var(--td);border:2px solid #e6e1d2;border-radius:99px;font-family:'Google Sans',sans-serif;font-weight:800;font-size:16px;cursor:pointer;">Đã dán xong</button>
        <button onclick="printPrepBatchLabelNow('${b.id}'${n > 1 ? ', ' + n : ''})" style="flex:1.6;min-height:56px;display:flex;align-items:center;justify-content:center;gap:8px;background:var(--gd);color:#fff;border:none;border-radius:99px;font-family:'Google Sans',sans-serif;font-weight:800;font-size:16px;cursor:pointer;box-shadow:0 4px 12px rgba(226,58,93,.3);">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          In ${n} tem
        </button>
      </div>
      <div style="font-size:12.5px;color:#9A9AA0;margin-top:10px;text-align:center;">Xem lại tem này bất cứ lúc nào ở mục "Lô đang còn".</div>
    </div>
    </div>
  `;
}

// In tem lô — lấy lô từ cache theo id để luôn dùng dữ liệu mới nhất (batchCode,
// expiresAt chỉ có SAU khi submitPrepFinish ghi xong).
async function printPrepBatchLabelNow(batchId, copies) {
  const b = PREP_BATCHES_CACHE_POS.find(x => x.id === batchId);
  if (!b) { toast('⚠️ Không tìm thấy lô'); return; }
  if (!b.batchCode) { toast('⚠️ Lô chưa có số lô — chưa hoàn thành mẻ'); return; }
  const n = Math.max(1, Number(copies) || 1);
  try {
    // [FIX-tem-interleave] Xếp hàng chung với tem bán hàng: bếp bấm in tem lô đúng lúc thu ngân
    // đang in tem cho một đơn thì trước đây hai luồng chèn xen kẽ nhau, tem lô lẫn vào giữa tem
    // ly của khách. Qua hàng đợi thì lượt nào xong hẳn mới tới lượt sau.
    const r = await POSTemPrinter._enqueue(async () => {
      // [FIX-tem-lo-silent] Tem lô in RẤT THƯA (có khi cách nhau vài tiếng) nên socket LAN gần
      // như chắc chắn đã bị máy in tự đóng do nhàn rỗi. Nối lại trước khi in.
      try { await temEnsureConnected(); } catch (e) { console.warn('[tem lô] nối lại lỗi', e); }
      let failed = 0;
      // In tuần tự, nghỉ giữa các tem cho máy kịp xử lý — cùng cách với tem ly.
      for (let i = 0; i < n; i++) {
        // Một tem lỗi không được làm mất các tem còn lại của lô (xem [FIX-tem-partial-loss]).
        try {
          if (await POSTemPrinter.printPrepBatchLabel(b, 1) === false) failed++;
        }
        catch (e) { failed++; console.warn('[tem lô] lỗi tem ' + (i + 1) + '/' + n, e); }
        // [FIX-tem-flowcontrol] Cùng cách với tem ly: chờ app gửi hết rồi mới đi tiếp.
        await _temWaitDrain(8000);
        if (i < n - 1) await new Promise(r2 => setTimeout(r2, 700));
      }
      return failed;
    });
    if (r > 0) toast(`⚠ ${r}/${n} tem lô chưa in được — chép tay theo nội dung bên dưới`);
    else toast(`🖨 Đã gửi ${n} tem cho lô ${b.batchCode}`);
  } catch (err) {
    console.error('printPrepBatchLabelNow failed', err);
    toast('❌ Không in được tem — chép tay theo nội dung bên dưới');
  }
}

// [NEW — mục 3] Huỷ bán thành phẩm, kèm SUY NGƯỢC ra hao hụt từng nguyên liệu.
//
// ⚠️ ĐIỂM QUAN TRỌNG NHẤT: phần suy ngược chỉ để BÁO CÁO, KHÔNG trừ kho lần nữa.
// Nguyên liệu thô đã bị trừ khỏi kho ngay lúc NẤU MẺ rồi. Nếu huỷ cốt mà trừ
// nguyên liệu thêm lần nữa thì kho bị trừ hai lần cho cùng một lượng hàng —
// tồn kho sẽ âm dần một cách vô lý và không ai hiểu vì sao. Vì vậy ở đây chỉ:
//   - trừ tồn BÁN THÀNH PHẨM (thứ thực sự mất đi), và
//   - LƯU KÈM bảng quy đổi `ingredientBreakdown` để Management biết mẻ cốt đổ đi
//     đó tương đương bao nhiêu gam trà, bao nhiêu ml sữa, tốn bao nhiêu tiền.
//
// Tỷ lệ suy ngược = số lượng huỷ ÷ batchYield (sản lượng 1 mẻ theo công thức).
// Tổng thiệt hại = qty × costPerUnit — bằng đúng tổng tiền của bảng quy đổi, vì
// costPerUnit vốn được tính từ chính các nguyên liệu đó chia cho batchYield.
async function submitPrepWaste() {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  _posSubmitBusy = true;
  try { await _submitPrepWasteImpl(); } finally { _posSubmitBusy = false; }
}

async function _submitPrepWasteImpl() {
  const p = PREP_ITEMS_CACHE_POS.find(x => x.id === khoTxState.prepId);
  if (!p) { toast('⚠️ Chưa chọn bán thành phẩm'); return; }

  // Hai chế độ loại trừ nhau: còn lô thì huỷ THEO LÔ, không còn lô nào thì mới cho gõ tổng.
  const lines = pwReadLines(p.id);
  const coLo = pwBatchesFor(p.id).length > 0;
  const qty = lines.length ? lines.reduce((t, l) => t + l.qty, 0)
                           : (Number(document.getElementById('pwQty')?.value) || 0);
  if (coLo && !lines.length) { toast('⚠️ Chọn lô bị huỷ — bấm "Cả lô" hoặc gõ số lượng của lô đó'); return; }
  if (qty <= 0) { toast('⚠️ Nhập số lượng huỷ'); return; }
  const qua = lines.find(l => l.qty > l.con + 0.001);
  if (qua) { toast(`⚠️ Lô ${qua.batchCode} chỉ còn ${fmtPrepQty(qua.con)} ${p.unit || ''}`); return; }

  const sel = document.getElementById('pwReasonSelect');
  let reason = '';
  if (sel && sel.value !== '__other__') {
    reason = (WASTE_REASONS_CACHE.find(r => r.id === sel.value) || {}).label || '';
  } else {
    reason = (document.getElementById('pwReason')?.value || '').trim();
  }
  if (!reason) { toast('⚠️ Chọn hoặc nhập lý do huỷ'); return; }

  const staffEmp = await resolveStaffPinAndCheckin('pwStaff');
  if (!staffEmp) return;

  const batchYield = Number(p.batchYield) || 0;
  const ratio = batchYield > 0 ? qty / batchYield : 0;
  const nameOf = id => (KHO_ITEMS_CACHE.find(x => x.id === id) || {}).name || '';
  const unitOf = id => (KHO_ITEMS_CACHE.find(x => x.id === id) || {}).unit || '';
  const costOf = id => Number((KHO_ITEMS_CACHE.find(x => x.id === id) || {}).costPerUnit) || 0;
  // Bảng quy đổi — chỉ để báo cáo, không sinh giao dịch kho nào.
  const ingredientBreakdown = (p.batchInputs || []).map(r => {
    const q = (Number(r.qty) || 0) * ratio;
    return { itemId: r.itemId, name: nameOf(r.itemId), unit: unitOf(r.itemId), qty: q, cost: q * costOf(r.itemId) };
  });
  const totalCost = qty * (Number(p.costPerUnit) || 0);

  try {
    // [E4.6] Trừ tồn + trừ đúng từng lô + dòng sổ WASTE (một transaction) + đồng bộ RT + chốt tồn
    // — unit_engine.v1.js (prep.discardByLots). Ở đây chỉ đọc form và báo kết quả.
    await UnitEngine.prep.discardByLots(p, { qty, lines, reason, totalCost, ingredientBreakdown,
      weighings: _pwWeighings, staffEmp });
    const moTa = lines.length === 1
      ? ` lô ${lines[0].batchCode}`
      : (lines.length > 1 ? ` ${lines.length} lô` : '');
    toast(`✅ Đã ghi huỷ ${fmtPrepQty(qty)} ${p.unit || ''}${moTa} — thiệt hại ${Math.round(totalCost).toLocaleString('vi-VN')}đ`);
    // Cache lô đang giữ số cũ; không nạp lại thì lần huỷ kế tiếp trong cùng phiên sẽ thấy
    // lô vẫn còn nguyên số. Chạy nền, không chặn.
    loadPrepBatchesPOS().catch(() => {});
    showScreen('khoScreen');
  } catch (err) {
    console.error('submitPrepWaste failed', err);
    toast('❌ Lỗi: ' + (err.code || err.message || err));
  }
}

PosGieoMods.prep = true;
