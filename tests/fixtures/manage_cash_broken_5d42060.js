// Mốc so sánh cố định từ commit 5d42060 — không sinh lại theo implementation mới.
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
      // Nâng đệm v1: giữ các ngày đã nhận, chỉ bổ sung số đối soát của ngày ĐANG XEM.
      // Không xoá toàn bộ đệm rồi đọc lại lịch sử TC33/XOFA/Gieo.
      if((old && !m[date]) || (m[date] && !m[date].reconciliation)){
        const one = await fstore.collection(ggName('daily_closings_gieogieo', r.id)).doc(date).get();
        if(one.exists) put(one); else delete m[date];
      }
      ggMap[r.id] = m;
    }catch(e){ console.warn('[tiền mặt] không đọc được kết ca', r.id, e); ggMap[r.id] = null; }
  });
  // 3) Phải nộp TC33 / XOFA cho các ngày CHƯA nhận (+ ngày đang xem): doanh thu (đệm sẵn) + chi tại quầy.
  const need = new Set([date]);
  for(let d = start; d <= today; d = dkey(addDays(parseDkey(d), 1))) ['tc33', 'xofa'].forEach(st=>{ if(!(tcxMap[st][d] && tcxMap[st][d].received != null)) need.add(d); });
  // Chỉ đọc đúng các ngày cần, theo từng ĐOẠN liền nhau (trước: liền một khoảng từ ngày sớm nhất tới hôm nay).
  const needList = [...need].filter(d=>d <= today).sort(), segs = [];
  needList.forEach(d=>{ const t = segs[segs.length - 1]; if(t && dkey(addDays(parseDkey(t[1]), 1)) === d) t[1] = d; else segs.push([d, d]); });
  const rev = { tc33: {}, xofa: {} }, spentTc = {}, spentXo = {}, daySummary = {};
  await Promise.all(segs.map(async ([a, b])=>{
    const [r] = await Promise.all([revLoadRange(a, b, null, ['tc33', 'xofa']),
      ...[['tc33', spentTc], ['xofa', spentXo]].map(([st, o])=>fstore.collection(EXP_COLL[st]).where('date','>=',a).where('date','<=',b).get().then(s=>{ s.docs.forEach(doc=>{ const e = doc.data(); if(e.source === 'pos' && e.status !== 'rejected' && e.date) o[e.date] = (o[e.date] || 0) + (Number(e.amount) || 0); }); }))]);
    ['tc33', 'xofa'].forEach(st=>Object.assign(rev[st], r[st] || {}));
  }));
  ['tc33','xofa'].forEach(st=>{ daySummary[st] = cashDaySummary(rev[st][date], st); });
  // TC33/XOFA dùng lại kết quả đã đọc ở trên. Gieo chỉ cần bill của NGÀY ĐANG XEM,
  // dùng chung revLoadRange / BillLive / đệm với Tổng quan, không đọc doanh thu các ngày chưa nhận.
  if(date <= today) await pool(records, 4, async r=>{
    try{ const sums = await revLoadRange(date, date, null, ['gg_' + r.id]); daySummary[r.id] = cashDaySummary(sums['gg_' + r.id]?.[date], r.id); }
    catch(e){ daySummary[r.id] = null; console.warn('[tiền mặt] không đọc được doanh thu ngày', r.id, e); }
  });
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
  return { cfg, start, today, date, records, tcx, gg: ggMap, daySummary };
}
function cashCacheLoad(){ try{ const j = JSON.parse(localStorage.getItem(CASH_CACHE_KEY) || localStorage.getItem('mg_cash_cache_v1') || '{}'); return j && typeof j === 'object' ? j : {}; }catch(e){ return {}; } }
module.exports={readCash,cashCacheLoad};
