// Mốc so sánh cố định từ commit 26edad6 — không sinh lại theo implementation mới.
async function loadCashCfg(force){
  if(CASH_CFG && !force) return CASH_CFG;
  const d = await CASH_CFG_DOC().get();
  if(d.exists && d.data().startDate){ CASH_CFG = d.data(); return CASH_CFG; }
  CASH_CFG = { startDate: dkey(addDays(new Date(), 1)), createdAt: new Date().toISOString() };
  await CASH_CFG_DOC().set(CASH_CFG, { merge: true });
  return CASH_CFG;
}
async function readCash(date, force){
  await ensureAuth(); validDate(date);
  if(force) CASH_CFG = null;
  const cfg = await loadCashCfg(force), today = dkey(new Date()), start = cfg.startDate;
  // [16/10] Mốc truy vấn = mốc theo dõi (không lùi theo ngày đang xem): xem 1 ngày trước mốc chỉ đọc riêng ngày đó (bước 1b / 2b)
  // — trước đây chọn lùi 1 năm là đọc liền cả năm doanh thu + chi phí + phiếu nhận.
  const from = start, old = date < start, records = (await gieoStores()).filter(r=>r.active !== false);
  const cache = force ? {} : cashCacheLoad(); cache.tcx = cache.tcx || {}; cache.gg = cache.gg || {};
  // 1) Thực nhận TC33 / XOFA (1 truy vấn cho cả 2 quán, từ ngày sớm nhất chưa chốt).
  const tcxMap = { tc33: {}, xofa: {} };
  ['tc33', 'xofa'].forEach(st=>Object.entries(cache.tcx[st] || {}).forEach(([d, r])=>{ tcxMap[st][d] = r; }));
  const qT = ['tc33', 'xofa'].map(st=>cashQueryFrom(tcxMap[st], from, today)).sort()[0];
  const recSnap = await fstore.collection(CASH_COLL).where('date','>=',qT).get();
  ['tc33', 'xofa'].forEach(st=>Object.keys(tcxMap[st]).forEach(d=>{ if(d >= qT) delete tcxMap[st][d]; }));
  recSnap.docs.forEach(d=>{ const x = d.data(); if(x && tcxMap[x.store] && x.date) tcxMap[x.store][x.date] = x; });
  if(old) (await fstore.collection(CASH_COLL).where('date','==',date).get()).docs.forEach(d=>{ const x = d.data(); if(x && tcxMap[x.store]) tcxMap[x.store][date] = x; });
  // 2) Kết ca Gieo (1 truy vấn / quán).
  const ggMap = {};
  await pool(records, 4, async r=>{
    const m = {}; Object.entries(cache.gg[r.id] || {}).forEach(([d, v])=>{ m[d] = v; });
    const q = cashQueryFrom(m, from, today);
    Object.keys(m).forEach(d=>{ if(d >= q) delete m[d]; });
    try{
      const s = await fstore.collection(ggName('daily_closings_gieogieo', r.id)).where('businessDate','>=',q).where('businessDate','<=',today).get();
      const put = doc=>{ const cl = doc.data(), d = cl.businessDate || doc.id; m[d] = { ...ggCashExpected(cl), received: cl.ownerReceipt ? cl.ownerReceipt.received : null, receipt: cl.ownerReceipt || null }; };
      s.docs.forEach(put);
      if(old && !m[date]){ const one = await fstore.collection(ggName('daily_closings_gieogieo', r.id)).doc(date).get(); if(one.exists) put(one); }
      ggMap[r.id] = m;
    }catch(e){ console.warn('[tiền mặt] không đọc được kết ca', r.id, e); ggMap[r.id] = null; }
  });
  // 3) Phải nộp TC33 / XOFA cho các ngày CHƯA nhận (+ ngày đang xem): doanh thu (đệm sẵn) + chi tại quầy.
  const need = new Set([date]);
  for(let d = start; d <= today; d = dkey(addDays(parseDkey(d), 1))) ['tc33', 'xofa'].forEach(st=>{ if(!(tcxMap[st][d] && tcxMap[st][d].received != null)) need.add(d); });
  // Chỉ đọc đúng các ngày cần, theo từng ĐOẠN liền nhau (trước: liền một khoảng từ ngày sớm nhất tới hôm nay).
  const needList = [...need].filter(d=>d <= today).sort(), segs = [];
  needList.forEach(d=>{ const t = segs[segs.length - 1]; if(t && dkey(addDays(parseDkey(t[1]), 1)) === d) t[1] = d; else segs.push([d, d]); });
  const rev = { tc33: {}, xofa: {} }, spentTc = {}, spentXo = {};
  await Promise.all(segs.map(async ([a, b])=>{
    const [r] = await Promise.all([revLoadRange(a, b, null, ['tc33', 'xofa']),
      ...[['tc33', spentTc], ['xofa', spentXo]].map(([st, o])=>fstore.collection(EXP_COLL[st]).where('date','>=',a).where('date','<=',b).get().then(s=>{ s.docs.forEach(doc=>{ const e = doc.data(); if(e.source === 'pos' && e.status !== 'rejected' && e.date) o[e.date] = (o[e.date] || 0) + (Number(e.amount) || 0); }); }))]);
    ['tc33', 'xofa'].forEach(st=>Object.assign(rev[st], r[st] || {}));
  }));
  const tcx = {};
  [['tc33', spentTc], ['xofa', spentXo]].forEach(([st, sp])=>{
    tcx[st] = {};
    needList.forEach(d=>{ tcx[st][d] = { ...tcxCashExpected(rev[st] && rev[st][d], st, sp[d]), received: null }; });
    Object.entries(tcxMap[st]).forEach(([d, r])=>{ tcx[st][d] = { ...(tcx[st][d] || {}), ...(r.received != null ? { sales: r.sales, spent: r.spent, expected: r.expected } : {}), received: r.received, receipt: r }; });
  });
  // Lưu đệm các ngày đã nhận.
  const nc = { tcx: { tc33: {}, xofa: {} }, gg: {} };
  ['tc33', 'xofa'].forEach(st=>Object.entries(tcxMap[st]).forEach(([d, r])=>{ if(r && r.received != null) nc.tcx[st][d] = r; }));
  Object.entries(ggMap).forEach(([id, m])=>{ if(!m) return; nc.gg[id] = {}; Object.entries(m).forEach(([d, v])=>{ if(v && v.received != null) nc.gg[id][d] = v; }); });
  cashCacheSave(nc);
  return { cfg, start, today, date, records, tcx, gg: ggMap };
}
async function writeCashReceipt(store, date, received, info){
  await ensureAuth(); validDate(date);
  const n = Math.round(Number(received));
  if(!Number.isSafeInteger(n) || n < 0 || n > 10000000000) throw new Error('Nhập số tiền thực nhận (0 nếu không nhận được đồng nào).');
  const at = new Date().toISOString();
  if(store === 'tc33' || store === 'xofa'){
    const exp = Math.round(Number(info.expected) || 0);
    const rec = { store, date, received: n, expected: exp, variance: n - exp, sales: Math.round(Number(info.sales) || 0), spent: Math.round(Number(info.spent) || 0), at, by: 'manage' };
    const ref = fstore.collection(CASH_COLL).doc(store + '_' + date), old = await ref.get();
    if(old.exists){ rec.createdAt = old.data().createdAt || old.data().at; rec.editedAt = at; rec.prevReceived = old.data().received; }
    await ref.set(rec);
  } else {
    const ref = fstore.collection(ggName('daily_closings_gieogieo', store)).doc(date), cur = await ref.get();
    const e = ggCashExpected(cur.exists ? cur.data() : null);
    if(e.state !== 'ready') throw new Error('Ngày này cửa hàng chưa kết ca / chưa bàn giao tiền — chưa nhập thực nhận được.');
    const old = cur.data().ownerReceipt;
    await ref.set({ ownerReceipt: { received: n, expected: e.expected, variance: n - e.expected, at, by: 'manage', ...(old ? { editedAt: at, prevReceived: old.received } : {}) } }, { merge: true });
  }
  try{ localStorage.removeItem(CASH_CACHE_KEY); }catch(e){}
}
async function writeCashStart(date){ await ensureAuth(); validDate(date); await CASH_CFG_DOC().set({ startDate: date, updatedAt: new Date().toISOString() }, { merge: true }); CASH_CFG = null; try{ localStorage.removeItem(CASH_CACHE_KEY); }catch(e){} }
function cashCacheLoad(){ try{ const j = JSON.parse(localStorage.getItem(CASH_CACHE_KEY) || '{}'); return j && typeof j === 'object' ? j : {}; }catch(e){ return {}; } }
function cashCacheSave(c){ try{ localStorage.setItem(CASH_CACHE_KEY, JSON.stringify(c)); }catch(e){} }
function cashQueryFrom(cacheMap, from, today){
  const fresh = dkey(addDays(parseDkey(today), -CASH_FRESH_DAYS));
  for(let d = from; d <= today; d = dkey(addDays(parseDkey(d), 1))){ if(d >= fresh || !(cacheMap && cacheMap[d] && cacheMap[d].received != null)) return d; }
  return today;
}
function ggCashExpected(cl){
  if(!cl) return { state: 'none' };
  const handed = cl.handedOverAmount, done = handed != null && ['handed_over', 'closed'].includes(cl.status) || (handed != null && cl.closedAt);
  if(!done) return { state: cl.status === 'closed' && cl.forceClosedByManagement ? 'forced' : 'open', status: cl.status || 'pending' };
  const after = Object.values(cl.postCloseBills || {}).filter(b=>b && b.timing === 'after_close').reduce((s, b)=>s + (Number(b.cash) || 0), 0);
  return { state: 'ready', expected: (Number(handed) || 0) + after, handed: Number(handed) || 0, after, retained: Number(cl.retainedAmount) || 0, recipient: cl.handoverRecipient || '' };
}
module.exports={loadCashCfg,readCash,writeCashReceipt,writeCashStart,cashCacheLoad,cashCacheSave,cashQueryFrom,ggCashExpected};
