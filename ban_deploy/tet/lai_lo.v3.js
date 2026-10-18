// lai_lo.v3.js — SINH TỰ ĐỘNG bằng node tools/tao_lai_lo.js từ quanlygieo.html. KHÔNG SỬA TAY (sửa quanlygieo rồi sinh lại,
// đã deploy thì tăng phiên bản). Bộ tính lãi / lỗ từng ngày của quán Gieo — chép nguyên văn 141 hàm / biến của quanlygieo,
// manage.html gọi để tự tính (không phải chờ mở quanlygieo). Cần data_access (bản mới nhất — GieoData.fsPath / rtPath) nạp trước.
(function(root){
// ---- chỗ gắn với app (do tools/tao_lai_lo.js thêm) ----
let _quan = 'gg01', _fs = null, _rt = null, _khoang = null;
let QL_VIEW = 'gg01', QL_ALL = false;
const GieoData = { storeId: () => _quan };
function plLuuTomTat(){}
const _DA = () => { const g = root.GieoData; if(!g || !g.fsPath) throw new Error('lai_lo: cần data_access'); return g; };
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
const MONTH_KEYS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
function pad(n){ return String(n).padStart(2,'0'); }
function dkey(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function daysInMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0).getDate(); }
let COGS_TOGO = {};
async function loadCogsMaps(){
  const tSnap = await fstore.collection('cogs_gieogieo').doc('togo').get();
  COGS_TOGO = (tSnap.exists && tSnap.data().items) || {};
}
async function fetchOrdersForDate(d){
  const month = MONTH_KEYS[d.getMonth()], day = pad(d.getDate()), year = d.getFullYear();
  // Một ngày có thể có bill ở CẢ archive lẫn RTDB (bill bổ sung ghi vào RTDB sau khi ngày đó
  // đã archive, hoặc archive xong mà chưa kịp xoá RTDB). Đọc cả hai, gộp theo khoá bill (RTDB
  // thắng) — trước đây RTDB có ≥1 bill là bỏ hẳn archive, bill cũ biến khỏi báo cáo.
  const byKey = {};
  const liveDay = dkey(d)===dkey(new Date()) && typeof window!=='undefined' && window.BillLive;
  if(liveDay)return Object.values(await window.BillLive.read({id:GieoData.storeId(),day:dkey(d),db,path:`orders_gieogieo/${month}/${day}`}));
  const cungNam = o => { if(!o || !o.date) return true; return String(o.date.split('/')[2]) === String(year); };
  try{
    const docId = `${month}_${day}_${year}`;
    const doc = await fstore.collection('orders_gieogieo_archive').doc(docId).get();
    if(doc.exists) Object.entries(doc.data().orders || {}).forEach(([k,o]) => { byKey[k] = o; });
  }catch(e){ console.warn('Archive orders read failed', e); }
  try{
    const snap = await db.ref(`orders_gieogieo/${month}/${day}`).once('value');
    if(snap.exists()) Object.entries(snap.val() || {}).forEach(([k,o]) => { if(cungNam(o)) byKey[k] = o; });
  }catch(e){ console.warn('RTDB orders read failed', e); }
  // POS ghi archive vào `orders_gieogieo_archive/{month}_{day}_{year}` (field `orders` = nguyên
  // node RTDB) rồi xoá các bill đó khỏi RTDB — archive là đường đọc duy nhất của ngày cũ.
  const orders = Object.values(byKey);
  return orders;
}
const PRICE_COLL = 'price_history_gieogieo';
let PRICE_HISTORY = null;
let _priceLoadedAt = 0;
async function ensurePriceHistory(force){
  if(!force && PRICE_HISTORY && Date.now() - _priceLoadedAt < 300000) return PRICE_HISTORY;
  const idx = {};
  try{
    const snap = await fstore.collection(PRICE_COLL).get();
    snap.forEach(d=>{
      const r = { id: d.id, ...d.data() };
      if(!r.itemId || !r.effectiveFrom) return;
      (idx[r.itemId] = idx[r.itemId] || []).push(r);
    });
    Object.values(idx).forEach(list => list.sort((a,b)=>
      String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)) ||
      String(a.createdAt||'').localeCompare(String(b.createdAt||''))));
    PRICE_HISTORY = idx;
    _priceLoadedAt = Date.now();
  }catch(err){
    // Không đọc được thì rơi về giá hiện tại — sai kiểu CŨ, nhưng không được làm
    // trắng báo cáo. Có cảnh báo trong console để còn lần ra.
    console.warn('[Giá] không đọc được lịch sử giá (tạm dùng giá hiện tại):', err);
    PRICE_HISTORY = PRICE_HISTORY || {};
  }
  _costMemo = {};
  return PRICE_HISTORY;
}
function itemCostOn(itemId, dateKey){
  const it = INVENTORY_ITEMS.find(x=>x.id===itemId);
  const hienTai = it ? Number(it.costPerUnit)||0 : 0;
  if(!dateKey) return hienTai;
  const list = PRICE_HISTORY && PRICE_HISTORY[itemId];
  if(!list || !list.length) return hienTai;
  let chon = null;
  for(const r of list){
    if(String(r.effectiveFrom) <= dateKey) chon = r; else break;
  }
  if(chon) return Number(chon.price)||0;
  const dau = list[0];
  return dau.oldPrice != null ? Number(dau.oldPrice)||0 : (Number(dau.price)||0);
}
const RECIPE_HIST_COLL = 'recipe_history_gieogieo';
let RECIPE_HISTORY = null;
let _recipeHistLoadedAt = 0;
async function ensureRecipeHistory(force){
  if(!force && RECIPE_HISTORY && Date.now() - _recipeHistLoadedAt < 300000) return RECIPE_HISTORY;
  const idx = {};
  try{
    const snap = await fstore.collection(RECIPE_HIST_COLL).get();
    snap.forEach(d=>{
      const r = { id: d.id, ...d.data() };
      if(!r.menuRefKey || !r.effectiveFrom) return;
      (idx[r.menuRefKey] = idx[r.menuRefKey] || []).push(r);
    });
    Object.values(idx).forEach(list => list.sort((a,b)=>
      String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)) ||
      String(a.createdAt||'').localeCompare(String(b.createdAt||''))));
    RECIPE_HISTORY = idx;
    _recipeHistLoadedAt = Date.now();
  }catch(err){
    console.warn('[Định mức] không đọc được lịch sử định mức (tạm dùng định mức hiện tại):', err);
    RECIPE_HISTORY = RECIPE_HISTORY || {};
  }
  _costMemo = {};
  return RECIPE_HISTORY;
}
function recipeSizeRowsOn(menuRefKey, size, dateKey){
  if(!dateKey){ const r = RECIPES[menuRefKey]; return r && r.sizes && r.sizes[size]; }
  const list = RECIPE_HISTORY && RECIPE_HISTORY[menuRefKey];
  if(!list || !list.length){ const r = RECIPES[menuRefKey]; return r && r.sizes && r.sizes[size]; }
  let chon = null;
  for(const h of list){ if(String(h.effectiveFrom) <= dateKey) chon = h; else break; }
  const sizesObj = chon ? chon.newSizes : list[0].oldSizes;
  return sizesObj && sizesObj[size];
}
let _costMemo = {};
function _memoCost(key, fn){
  if(key in _costMemo) return _costMemo[key];
  const v = fn();
  _costMemo[key] = v;
  return v;
}
const PREP_RECIPE_HIST_COLL = 'prep_recipe_history_gieogieo';
let PREP_RECIPE_HISTORY = null;
let _prepRecipeHistLoadedAt = 0;
async function ensurePrepRecipeHistory(force){
  if(!force && PREP_RECIPE_HISTORY && Date.now() - _prepRecipeHistLoadedAt < 300000) return PREP_RECIPE_HISTORY;
  const idx = {};
  try{
    const snap = await fstore.collection(PREP_RECIPE_HIST_COLL).get();
    snap.forEach(d=>{
      const r = { id: d.id, ...d.data() };
      if(!r.prepId || !r.effectiveFrom) return;
      (idx[r.prepId] = idx[r.prepId] || []).push(r);
    });
    Object.values(idx).forEach(list => list.sort((a,b)=>
      String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)) ||
      String(a.createdAt||'').localeCompare(String(b.createdAt||''))));
    PREP_RECIPE_HISTORY = idx;
    _prepRecipeHistLoadedAt = Date.now();
  }catch(err){
    console.warn('[BTP] không đọc được lịch sử công thức mẻ (tạm dùng công thức hiện tại):', err);
    PREP_RECIPE_HISTORY = PREP_RECIPE_HISTORY || {};
  }
  _costMemo = {};
  return PREP_RECIPE_HISTORY;
}
function prepRecipeOn(prepId, dateKey){
  const p = PREP_ITEMS.find(x=>x.id===prepId);
  if(!dateKey) return p ? { batchInputs: p.batchInputs||[], batchYield: Number(p.batchYield)||0 } : { batchInputs:[], batchYield:0 };
  const list = PREP_RECIPE_HISTORY && PREP_RECIPE_HISTORY[prepId];
  if(!list || !list.length) return p ? { batchInputs: p.batchInputs||[], batchYield: Number(p.batchYield)||0 } : { batchInputs:[], batchYield:0 };
  let chon = null;
  for(const h of list){ if(String(h.effectiveFrom) <= dateKey) chon = h; else break; }
  if(chon) return { batchInputs: chon.newBatchInputs||[], batchYield: Number(chon.newBatchYield)||0 };
  return { batchInputs: list[0].oldBatchInputs||[], batchYield: Number(list[0].oldBatchYield)||0 };
}
function _costOfPrepInputs(inputs, yieldVal, dateKey){
  if(!inputs || !inputs.length || !(Number(yieldVal)>0)) return null;
  const tong = inputs.reduce((s,r)=> s + (Number(r.qty)||0) * itemCostOn(r.itemId, dateKey), 0);
  return tong / Number(yieldVal);
}
function prepCostOn(prepId, dateKey){
  const p = PREP_ITEMS.find(x=>x.id===prepId);
  if(!p) return 0;
  if(!dateKey) return Number(p.costPerUnit)||0;
  return _memoCost('prep|'+prepId+'|'+dateKey, ()=>{
    // [FIX] Trước đây luôn đọc p.batchInputs/prepEffectiveYield(p) (công thức HIỆN
    // TẠI) dù dateKey là một ngày quá khứ — sửa công thức mẻ hôm nay từng đổi luôn
    // giá vốn của mọi lô đã nấu trước đó. Giờ tra đúng công thức đã có hiệu lực vào
    // NGÀY LÔ ĐÓ PHÁT SINH (prepRecipeOn).
    const rec = prepRecipeOn(prepId, dateKey);
    const c = _costOfPrepInputs(rec.batchInputs, rec.batchYield, dateKey);
    return c != null ? c : Number(p.costPerUnit)||0;   // chưa khai công thức: chỉ còn số đang lưu
  });
}
function toppingCostOn(toppingId, dateKey){
  const rec = TOPPING_RECIPES[toppingId];
  if(!rec) return 0;
  if(!dateKey) return Number(rec.costPerServing)||0;
  return _memoCost('tp|'+toppingId+'|'+dateKey, ()=>{
    const inputs = rec.batchInputs || [];
    if(!inputs.length) return Number(rec.costPerServing)||0;
    const y = Number(rec.batchYield)||0;
    if(!(y > 0)) return Number(rec.costPerServing)||0;
    const tong = inputs.reduce((s,r)=>{
      const gia = r.refType === 'prep' ? prepCostOn(r.prepId, dateKey) : itemCostOn(r.itemId, dateKey);
      return s + (Number(r.qty)||0) * gia;
    }, 0);
    const moiDonVi = tong / y;
    return rec.yieldMode === 'weight' ? moiDonVi * (Number(rec.qtyPerServing)||0) : moiDonVi;
  });
}
function _costOfRecipeRows(rows, dateKey){
  if(!rows || !rows.length) return null;
  let cost = 0;
  for(const row of rows){
    const qty = Number(row.qty)||0;
    if(row.refType==='prep'){
      cost += qty * prepCostOn(row.prepId, dateKey);
    } else if(row.refType==='topping'){
      // [NEW] Topping ĐÍNH KÈM SẴN trong món (vd trà sữa mặc định có trân châu) —
      // khác với topping BÁN THÊM ở giỏ hàng: đây là 1 THÀNH PHẦN CỐ ĐỊNH của công
      // thức, dùng đúng costPerServing đã khai ở GOGS Topping. qty = số phần topping
      // có sẵn trong đúng size này (thường 1, có thể nhiều hơn với size lớn).
      cost += qty * toppingCostOn(row.toppingId, dateKey);
    } else {
      cost += qty * itemCostOn(row.itemId, dateKey);
    }
  }
  return cost;
}
function computeUnitCogsFromRecipe(itemId, size, dateKey){
  // [FIX] Trước đây luôn đọc RECIPES (định mức HIỆN TẠI) dù dateKey là một ngày quá
  // khứ — sửa định mức hôm nay từng đổi luôn giá vốn của mọi bill đã bán trước đó.
  // Giờ tra đúng bản định mức đã có hiệu lực vào NGÀY BILL PHÁT SINH (recipeSizeRowsOn,
  // dùng chung nguyên lý với itemCostOn/prepCostOn/toppingCostOn).
  const rows = recipeSizeRowsOn('togo:'+itemId, size, dateKey);
  return _costOfRecipeRows(rows, dateKey); // null nếu chưa khai định mức cho đúng size này
}
function orderHour(o){
  const m = String((o && o.time) || '').match(/^(\d{1,2}):/);
  if(!m) return null;
  const h = Number(m[1]);
  return (h >= 0 && h <= 23) ? h : null;
}
function demToppingDong(it, out){
  const qty = Number(it && it.qty)||0;
  ((it && it.toppings)||[]).forEach(t=>{
    const tid = t && (t.id || t._freeTpId);
    if(!tid) return;
    out[tid] = (out[tid]||0) + Math.max(1, Number(t.qty)||1) * qty;
  });
  return out;
}
function aggregateOrders(orders, dateKey){
  let revenue=0, bills=0, items=0, toppingBills=0, toppingRevenue=0, cogsActual=0, revenueUncosted=0,
      toppingCogsActual=0, toppingRevenueUncosted=0;
  // [DỰ BÁO TOPPING] Đếm số PHẦN từng topping đã dùng trong ngày — gồm cả topping
  // TẶNG (khách không trả tiền nhưng vẫn ăn hết nguyên liệu như thường).
  // Đếm ở đây vì aggregateOrders là chỗ DUY NHẤT đọc qua từng bill, và kết quả của
  // nó được ghi vào cache ngày — nghĩa là ngày đã chốt về sau vẫn tra được số topping
  // mà không phải đọc lại toàn bộ đơn hàng từ Realtime DB.
  const toppingMix = {};
  // Đếm bill theo từng giờ. Gắn vào ĐÂY chứ không tính riêng ở màn Hôm nay vì hàm này
  // là chỗ duy nhất đọc qua từng bill, và kết quả của nó được ghi vào cache ngày —
  // nghĩa là các ngày đã chốt sổ về sau cũng có sẵn phân bố giờ, khỏi đọc lại RTDB.
  const byHour = {};
  // [MỚI] DOANH THU theo giờ, không chỉ số bill. Số bill nói giờ nào ĐÔNG, doanh
  // thu nói giờ nào ĐÁNG mở cửa — hai chuyện khác nhau khi giờ trưa toàn ly nhỏ
  // còn giờ chiều là bill nhiều món. Ngày đã nằm trong cache trước bản này không
  // có trường mới; nơi vẽ tự rơi về đếm bill và nói rõ đang xem số nào.
  const revByHour = {};
  orders.forEach(o=>{
    bills++;
    const h = orderHour(o);
    if(h != null){
      byHour[h] = (byHour[h] || 0) + 1;
      revByHour[h] = (revByHour[h] || 0) + (Number(o.total)||0);
    }
    revenue += Number(o.total)||0;
    let hasTopping = false;
    const cogsMap = COGS_TOGO;
    (o.itemsArray||[]).forEach(it=>{
      const qty = Number(it.qty)||0;
      items += qty;
      const tsum = (Number(it.toppingSum)||0) * qty;
      toppingRevenue += tsum;
      if(it.toppings && it.toppings.length) hasTopping = true;
      const baseLineRevenue = (Number(it.price)||0) * qty;
      // Vế 1: tự tính từ định mức (ưu tiên) — null nếu chưa khai định mức cho size này.
      const recipeCogs = it.itemId && it.size ? computeUnitCogsFromRecipe(it.itemId, it.size, dateKey) : null;
      // Vế 2: nhập tay (dự phòng) — chỉ dùng khi KHÔNG có định mức.
      const entry = cogsMap[it.itemId];
      const manualCogs = (entry && it.size && entry[it.size]!=null && entry[it.size]!=='') ? Number(entry[it.size]) : null;
      const unitCogs = recipeCogs!=null ? recipeCogs : manualCogs;
      // [NEW-GOGS — SỬA theo yêu cầu] Topping TẶNG kèm và topping BÁN có margin
      // hoàn toàn khác nhau, KHÔNG được gộp chung 1 sổ:
      //  - TẶNG kèm (khuyến mãi Free Topping): coi là chi phí phát sinh của CHÍNH
      //    món đó → cộng thẳng vào giá vốn món (freeCost), vì khách không trả tiền
      //    riêng cho phần này.
      //  - BÁN (khách trả tiền): là một dòng doanh thu + giá vốn RIÊNG của nhóm
      //    Topping → gom vào toppingCogsActual/toppingRevenueUncosted, KHÔNG cộng
      //    vào giá vốn món, để margin của món và margin của nhóm Topping tính đúng,
      //    tách bạch, không lẫn vào nhau.
      const tp = computeToppingsCogsForLine(it.toppings, dateKey);
      // [NEW — Bao bì] Cộng thẳng giá vốn bao bì vào giá vốn món, ĐỘC LẬP với việc
      // món đã khai định mức pha chế hay chưa. Từ GĐ1 "Bao bì phức tạp": ưu tiên
      // override riêng theo món+topping (packagingCostForLine) nếu có khai, rơi về
      // mặc định theo size nếu không — xem ghi chú đầy đủ ở resolvePackagingItemsForLine().
      // hasTopping xét ĐÚNG DÒNG này (không phải cờ hasTopping của cả đơn ở trên).
      // Ưu tiên engine MỚI (quy tắc theo vật tư) nếu đã khai; chưa khai dòng nào
      // thì rơi về mô hình BỘ cũ để không làm gãy báo cáo trong lúc chuyển đổi.
      const lineHasTopping = !!(it.toppings && it.toppings.length);
      const packCost = !it.size ? 0
        : (pkgRulesActive() ? packagingCostForCupLine(it, dateKey)
                            : packagingCostForLine(it.itemId, it.size, lineHasTopping, dateKey));
      if(unitCogs!=null){
        cogsActual += (unitCogs + tp.freeCost + packCost) * qty;
      } else {
        cogsActual += (tp.freeCost + packCost) * qty;
        revenueUncosted += baseLineRevenue;
      }
      toppingCogsActual += tp.paidRealCost * qty;
      toppingRevenueUncosted += tp.paidUncostedRevenue * qty;
      demToppingDong(it, toppingMix);
    });
    // [NEW — GĐ2] Tầng B: chi phí túi/khay tính 1 LẦN CHO CẢ ĐƠN (không phải theo
    // từng dòng như Tầng A ở trên) — vì túi/khay phụ thuộc TOÀN BỘ các ly trong
    // cùng bill (đá chung/riêng + tổng số ly), không gán riêng được cho 1 dòng.
    cogsActual += computeBaggingCostForOrder(o, dateKey);
    if(hasTopping) toppingBills++;
    revenueUncosted += Number(o.foodTotal)||0; // đồ ăn (food_gieogieo) chưa có UI nhập COGS -> tạm ước tính %
  });
  return {revenue,bills,items,toppingBills,toppingRevenue,cogsActual,revenueUncosted,toppingCogsActual,toppingRevenueUncosted,byHour,revByHour,toppingMix};
}
function rawMixFromOrders(orders){
  const map = {};
  orders.forEach(o=>{
    (o.itemsArray||[]).forEach(it=>{
      const key = it.name + (it.size ? ' ('+it.size+')' : '');
      const qty = Number(it.qty)||0;
      const toppingSum = (Number(it.toppingSum)||0) * qty;
      const lineRevenue = (Number(it.price)||0)*qty + toppingSum;
      if(!map[key]) map[key] = {name:key, qty:0, revenue:0};
      map[key].qty += qty;
      map[key].revenue += lineRevenue;
    });
  });
  return Object.values(map);
}
const CACHE_BUFFER_DAYS = 3;
function isCacheable(dateObj){
  const today = new Date(); today.setHours(0,0,0,0);
  const diffDays = Math.round((today - dateObj)/86400000);
  return diffDays > CACHE_BUFFER_DAYS;
}
async function readCachedDays(startKey, endKey){
  const snap = await fstore.collection('daily_sales_cache_gieogieo')
    .where(firebase.firestore.FieldPath.documentId(), '>=', startKey)
    .where(firebase.firestore.FieldPath.documentId(), '<=', endKey)
    .get();
  const result = {};
  snap.forEach(doc=>{ result[doc.id] = doc.data(); });
  return result;
}
function writeCachedDay(dateKey, dayAgg){
  fstore.collection('daily_sales_cache_gieogieo').doc(dateKey).set(dayAgg)
    .catch(err=>console.warn('cache write failed', dateKey, err));
}
function salesFromLive(orders, previous){
  const date=previous.date, delta=Number(previous.substitutionCogsDelta)||0;
  const day={date,...aggregateOrders(orders,date),mix:rawMixFromOrders(orders)};
  if(delta){day.substitutionCogsDelta=delta;day.cogsActual=(Number(day.cogsActual)||0)+delta}
  return {perDay:[day],totals:{revenue:day.revenue,bills:day.bills,items:day.items,toppingBills:day.toppingBills,toppingRevenue:day.toppingRevenue},dayCount:1,cachedCount:0};
}
async function fetchSalesRange(startDate, endDate){
  // Lịch sử giá + lịch sử định mức món + lịch sử công thức mẻ phải có TRƯỚC khi
  // tính bất kỳ ngày nào — thiếu thì mọi ngày rơi về giá/định mức/công thức hiện
  // tại, đúng cái bệnh đang chữa.
  await Promise.all([ensurePriceHistory(), ensureRecipeHistory(), ensurePrepRecipeHistory()]);
  const days = [];
  let d = new Date(startDate);
  while(d <= endDate){ days.push(new Date(d)); d.setDate(d.getDate()+1); }
  const startKey = dkey(days[0]), endKey = dkey(days[days.length-1]);

  let cached = {};
  try{ cached = await readCachedDays(startKey, endKey); }catch(err){ console.warn('read cache failed', err); }

  const missing = days.filter(d=> !isCacheable(d) || !cached[dkey(d)]);
  const fetchedResults = await Promise.all(missing.map(fetchOrdersForDate));

  const perDay = days.map(d=>{
    const key = dkey(d);
    if(isCacheable(d) && cached[key]) return {date:key, ...cached[key]};
    const idx = missing.findIndex(m=>dkey(m)===key);
    const orders = fetchedResults[idx];
    const agg = aggregateOrders(orders, key);
    const mix = rawMixFromOrders(orders);
    const dayAgg = {...agg, mix};
    if(isCacheable(d)) writeCachedDay(key, dayAgg);
    return {date:key, ...dayAgg};
  });

  // [BTP — BÙ LOẠI KHÁC] Bill ghi món A nhưng thực tế dùng BTP B bù (Quản lý đã xác nhận ở
  // Kho ▸ Đối chiếu BTP âm) → giá vốn ngày đó cộng thêm chênh (giá B − giá A). Cộng SAU cache
  // ngày để xác nhận muộn vẫn phản ánh vào ngày cũ.
  try{
    const subSnap = await fstore.collection('prep_shortage_recons_gieogieo')
      .where('businessDate','>=',startKey).where('businessDate','<=',endKey).get();
    const byDay = {};
    subSnap.forEach(d=>{ const r = d.data();
      if(r.status==='substitution_confirmed' && Number(r.cogsDelta)) byDay[r.businessDate] = (byDay[r.businessDate]||0) + Number(r.cogsDelta); });
    perDay.forEach(pd=>{ if(byDay[pd.date]){
      pd.substitutionCogsDelta = byDay[pd.date];
      pd.cogsActual = (Number(pd.cogsActual)||0) + byDay[pd.date];
    }});
  }catch(err){ console.warn('[BTP bù] không đọc được điều chỉnh giá vốn', err); }

  const totals = perDay.reduce((a,c)=>({
    revenue:a.revenue+c.revenue, bills:a.bills+c.bills, items:a.items+c.items,
    toppingBills:a.toppingBills+c.toppingBills, toppingRevenue:a.toppingRevenue+c.toppingRevenue
  }), {revenue:0,bills:0,items:0,toppingBills:0,toppingRevenue:0});
  return {perDay, totals, dayCount: days.length, cachedCount: days.length-missing.length};
}
const DEFAULTS = {
  targets: {aov:46000, billsPerDay:60, ipt:1.73, cogsPct:33, laborCupTarget:3000, laborBillTarget:5200, wasteTargetPct:3, remakeTargetPct:2, stockoutTargetPct:2},
  labor: {fulltimeCost:6500000, parttimeHourly:18000, parttimeCount:2, parttimeHoursPerPerson:75}
};
const FINANCE_DEFAULTS = {cashReserve:0, initialInvestment:0, stockCountVarianceThresholdPct:5, packagingVarianceThresholdPct:8, cashToleranceAmount:0, handoverToleranceAmount:null, openingCashNextDayDefault:0, useActualWaste:false,
  // [THU HỒI VỐN] Bốn trường của cơ chế thu hồi vốn (KE-HOACH-thu-hoi-von.md).
  // Bản ghi cũ không có 4 trường này → coi như CHƯA đạt mốc, mốc bắt đầu tự tính
  // từ ngày mua tài sản sớm nhất. Không được coi null là "đã thu hồi xong".
  recoveryStartDate:null,      // 'YYYY-MM-DD' chủ quán khai đè, null = tự tính
  recoveryReachedDate:null,    // ngày ĐẦU TIÊN luỹ kế chạm 100% — ghi một lần, không tự xoá
  recoveryReachedAt:null,      // ISO, lúc app ghi mốc
  recoveryReachedCapital:0,    // tổng vốn đầu tư TẠI THỜI ĐIỂM đạt mốc
  // [TIÊU HAO] Mốc bắt đầu ghi nhận theo quy trình mới (tem kho + kiểm kê định kỳ).
  // Dữ liệu trước mốc vẫn đọc được, nhưng mọi phân tích phải nói rõ nó thuộc giai
  // đoạn cũ — trộn hai giai đoạn vào một trung bình là cách chắc chắn nhất để ra
  // một con số không mô tả đúng giai đoạn nào.
  usageTrackingStart:'2026-09-06'};
let CONFIG_HISTORY = [];
let CONFIG = JSON.parse(JSON.stringify(DEFAULTS));
let FINANCE = {...FINANCE_DEFAULTS};
async function loadConfig(){
  const [histSnap, finSnap] = await Promise.all([
    fstore.collection('config_history_gieogieo').orderBy('effectiveFrom').get(),
    fstore.collection('finance_gieogieo').doc('current').get()
  ]);
  CONFIG_HISTORY = histSnap.docs.map(d=>({id:d.id, ...d.data()}));
  FINANCE = {...FINANCE_DEFAULTS, ...(finSnap.exists ? finSnap.data() : {})};
  CONFIG = configForDate(dkey(new Date()));
}
function configForDate(dateKeyOrDate){
  const key = typeof dateKeyOrDate === 'string' ? dateKeyOrDate : dkey(dateKeyOrDate);
  let picked = null;
  for(const v of CONFIG_HISTORY){
    if((v.effectiveFrom||'') <= key) picked = v; else break;
  }
  if(!picked) return JSON.parse(JSON.stringify(DEFAULTS));
  return {
    targets: {...DEFAULTS.targets, ...(picked.targets||{})},
    labor: {...DEFAULTS.labor, ...(picked.labor||{})}
  };
}
function laborMonthlyTotal(labor){
  return Number(labor.fulltimeCost||0) + Number(labor.parttimeHourly||0)*Number(labor.parttimeCount||0)*Number(labor.parttimeHoursPerPerson||0);
}
function payTermsOfRecord(o){
  o = o || {};
  return { payType: o.payType||null, hourlyRate: Number(o.hourlyRate)||0, otEnabled: !!o.otEnabled,
    otThresholdHours: Number(o.otThresholdHours)||0, otRate: Number(o.otRate)||0, fixedMonthlySalary: Number(o.fixedMonthlySalary)||0 };
}
function empPayTermsOn(emp, dateKey, snap){
  const hist = (emp && Array.isArray(emp.payHistory) ? emp.payHistory : []).filter(h=>h && h.effectiveFrom)
    .slice().sort((a,b)=>String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)));
  const useSnap = snap && snap.payType;
  if(!hist.length) return payTermsOfRecord(useSnap ? snap : emp);
  let pick = null;
  for(const h of hist){ if(String(h.effectiveFrom) <= String(dateKey)) pick = h; else break; }
  if(!pick) pick = hist[0];
  if(pick.legacy && useSnap) return payTermsOfRecord(snap);
  return payTermsOfRecord(pick);
}
function computeWageForDayHours(emp, hoursInDay){
  const rate = Number(emp && emp.hourlyRate)||0;
  if(!emp || !emp.otEnabled){
    return { amount: hoursInDay*rate, regularHours: hoursInDay, otHours: 0 };
  }
  const threshold = Number(emp.otThresholdHours)||8;
  const otRate = Number(emp.otRate)||0;
  if(hoursInDay <= threshold){
    return { amount: hoursInDay*rate, regularHours: hoursInDay, otHours: 0 };
  }
  const regularHours = threshold;
  const otHours = hoursInDay - threshold;
  return { amount: regularHours*rate + otHours*otRate, regularHours, otHours };
}
function isFixedPayType(emp){
  return !!emp && emp.payType !== 'hourly_full' && emp.payType !== 'hourly_part';
}
function empFixedPayHere(emp){
  const cur = (typeof GieoData !== 'undefined' && GieoData.storeId && GieoData.storeId()) || (typeof QL_VIEW !== 'undefined' ? QL_VIEW : 'gg01');
  return ((emp && emp.homeStore) || 'gg01') === cur;
}
function isShiftInProgress(s){
  return !!s && !s.checkedOutAt && s.businessDate === dkey(new Date());
}
function shiftWorkedHours(s, nowMs){
  if(!s || !s.checkedInAt) return 0;
  const inMs = new Date(s.checkedInAt).getTime();
  if(isNaN(inMs)) return 0;
  let endMs;
  if(s.checkedOutAt){
    endMs = new Date(s.checkedOutAt).getTime();
    if(isNaN(endMs)) return 0;
  } else {
    if(!isShiftInProgress(s)) return 0;   // ca treo ngày cũ — không đoán
    endMs = nowMs || Date.now();
  }
  return Math.max(0, (endMs - inMs) / 3600000);
}
async function computeActualLaborCostByDate(startDate, endDate){
  const [employees, shifts] = await Promise.all([
    loadEmployees(),
    fstore.collection('employee_shifts_gieogieo').where('businessDate','>=',startDate).where('businessDate','<=',endDate).get()
      .then(snap=>snap.docs.map(d=>d.data()))
  ]);
  const empById = {}; employees.forEach(e=>empById[e.id]=e);
  const byDate = {}; // { dateKey: tổng chi phí lương ngày đó }
  const addTo = (date, amount) => { byDate[date] = (byDate[date]||0) + amount; };

  // Vế 1 — LƯƠNG GIỜ: GOM GIỜ theo TỪNG NGƯỜI + TỪNG NGÀY trước (không cộng
  // tiền thẳng theo từng ca như bản cũ) — bắt buộc để áp đúng ngưỡng OT theo
  // ngày khi 1 người có nhiều ca/ngày (xem ghi chú computeWageForDayHours ở trên).
  const hoursByEmpDate = {}; // { "empId|date": tổng giờ }
  const termsByEmpDate = {}; // { "empId|date": mức lương ĐÚNG NGÀY đó } — [LƯƠNG THEO MỐC]
  const _now = Date.now();
  shifts.forEach(s=>{
    const emp = empById[s.employeeId];
    if(!emp) return;
    const terms = empPayTermsOn(emp, s.businessDate, s.payTerms);
    if(terms.payType!=='hourly_full' && terms.payType!=='hourly_part') return; // lương cứng không tính ở đây
    // [FIX-ca-dang-chay] Ca đang chạy của HÔM NAY được tính tạm tới hiện tại — xem
    // shiftWorkedHours(). Ca treo ngày cũ vẫn trả 0 như trước.
    const hours = shiftWorkedHours(s, _now);
    if(hours<=0) return;
    const key = s.employeeId+'|'+s.businessDate;
    hoursByEmpDate[key] = (hoursByEmpDate[key]||0) + hours;
    if(!termsByEmpDate[key]) termsByEmpDate[key] = terms;
  });
  Object.entries(hoursByEmpDate).forEach(([key, hours])=>{
    const sep = key.indexOf('|');
    const date = key.slice(sep+1);
    const { amount } = computeWageForDayHours(termsByEmpDate[key], hours);
    addTo(date, amount);
  });

  // Vế 2 — LƯƠNG CỨNG: chia đều fixedMonthlySalary cho số ngày trong THÁNG CỦA
  // TỪNG NGÀY trong khoảng [startDate,endDate] — cùng phương pháp prorate như
  // laborMonthlyTotal()/dim ở bản cũ, chỉ khác là cộng theo TỪNG NGƯỜI thay vì
  // 1 số tổng ước lượng.
  let cur = new Date(startDate+'T00:00:00');
  const end = new Date(endDate+'T00:00:00');
  while(cur <= end){
    const dateKey = dkey(cur);
    const dim = daysInMonth(cur);
    // [THU HỒI VỐN — 18/10] Đã đọc thành công chấm công của ngày đã qua:
    // không phát sinh lương = 0, không phải thiếu khoá ngày để P&L tự nhét
    // ngân sách mặc định vào quá khứ. Hôm nay vẫn giữ cơ chế dự đoán hiện có.
    if(dateKey < dkey(new Date(_now)) && byDate[dateKey]==null) byDate[dateKey] = 0;
    employees.forEach(emp=>{
      if(emp.active===false) return;
      const terms = empPayTermsOn(emp, dateKey);        // [LƯƠNG THEO MỐC] mức lương cứng đúng ngày
      if(isFixedPayType(terms) && empFixedPayHere(emp)) addTo(dateKey, terms.fixedMonthlySalary / dim);
    });
    cur.setDate(cur.getDate()+1);
  }
  return byDate;
}
let _expMemo = null;
function memoDropExpenses(){ _expMemo = null; }
function daysBetweenInclusive(a,b){ return Math.round((b-a)/86400000)+1; }
function expenseAllocatedAmount(e, rangeStart, rangeEnd){
  if(e.periodType === 'period' && e.startDate && e.endDate){
    const s = new Date(e.startDate+'T00:00:00'), en = new Date(e.endDate+'T00:00:00');
    const totalDays = daysBetweenInclusive(s,en);
    if(totalDays<=0) return 0;
    const dailyAmt = Number(e.amount||0)/totalDays;
    const ovStart = s > rangeStart ? s : rangeStart;
    const ovEnd = en < rangeEnd ? en : rangeEnd;
    const ovDays = daysBetweenInclusive(ovStart, ovEnd);
    if(ovDays<=0) return 0;
    return dailyAmt*ovDays;
  }
  const d = new Date((e.date||e.startDate)+'T00:00:00');
  if(d>=rangeStart && d<=rangeEnd) return Number(e.amount||0);
  return 0;
}
function expenseIsEstimate(e){ return !!e && e.amountKind === 'estimate'; }
async function loadExpenseCategories(){
  const snap = await fstore.collection('expense_categories_gieogieo').get();
  return snap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=>(a.label||'').localeCompare(b.label||'','vi'));
}
async function loadEmployees(){
  const snap = await fstore.collection('employees_gieogieo').get();
  const today = dkey(new Date());
  // [LƯƠNG THEO MỐC] Có lịch sử lương → các trường lương cấp trên = mức ĐANG ÁP DỤNG hôm nay (nhãn/form hiển thị đúng); tính lương luôn đọc payHistory theo ngày.
  return snap.docs.map(d=>{ const e = {id:d.id, ...d.data()}; if(Array.isArray(e.payHistory) && e.payHistory.length) Object.assign(e, empPayTermsOn(e, today)); return e; })
    .sort((a,b)=>(a.fullName||'').localeCompare(b.fullName||'','vi'));
}
async function loadSchedulesForRange(startDate, endDate){
  const snap = await fstore.collection('work_schedules_gieogieo').where('date','>=',startDate).where('date','<=',endDate).get();
  return snap.docs.map(d=>({id:d.id, ...d.data()}));
}
let HR_SETTINGS = { lateGraceMinutes: 10, useActualLaborCost: true };
async function loadHrSettings(){
  const doc = await fstore.collection('hr_settings_gieogieo').doc('current').get();
  HR_SETTINGS = { lateGraceMinutes: 10, useActualLaborCost: true, ...(doc.exists ? doc.data() : {}) };
  return HR_SETTINGS;
}
let INVENTORY_ITEMS = [];
const MEMO_TTL = 20000;
const _memo = { items:null, itemsAt:0, preps:null, prepsAt:0 };
function memoDropItems(){ _memo.items = null; }
function memoDropPreps(){ _memo.preps = null; }
function memoDropAll(){
  memoDropItems(); memoDropPreps();
  try{ memoDropExpenses(); _ledgerRangeInflight.clear(); }catch(e){}   // khai báo nằm phía dưới file
}
async function loadInventoryItems(){
  if(_memo.items && Date.now() - _memo.itemsAt < MEMO_TTL) return _memo.items;
  const snap = await fstore.collection('inventory_items_gieogieo').get();
  const list = snap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=>(a.name||'').localeCompare(b.name||'','vi'));
  _memo.items = list; _memo.itemsAt = Date.now();
  return list;
}
let RECIPES = {};
async function loadRecipes(){
  const snap = await fstore.collection('recipes_gieogieo').get();
  const map = {};
  snap.forEach(d=> map[d.id] = d.data());
  RECIPES = map;
  return map;
}
let PREP_ITEMS = [];
async function loadPrepItems(){
  if(_memo.preps && Date.now() - _memo.prepsAt < MEMO_TTL) return _memo.preps;
  const snap = await fstore.collection('prep_items_gieogieo').get();
  const list = snap.docs.map(d=>({id:d.id, ...d.data()}))
    .sort((a,b)=>String(a.code||'').localeCompare(String(b.code||''),'vi'));
  _memo.preps = list; _memo.prepsAt = Date.now();
  return list;
}
let TOPPING_RECIPES = {};
async function loadToppingRecipes(){
  const snap = await fstore.collection('topping_recipes_gieogieo').get();
  const map = {};
  snap.forEach(d=> map[d.id] = d.data());
  TOPPING_RECIPES = map;
  return map;
}
function computeToppingsCogsForLine(toppings, dateKey){
  let freeCost = 0, paidRealCost = 0, paidUncostedRevenue = 0;
  (toppings||[]).forEach(t=>{
    const isFree = !!(t && t._freeTpMark);
    const tId = t && (t.id || t._freeTpId);
    const rec = tId ? TOPPING_RECIPES[tId] : null;
    const q = Math.max(1, Number(t && t.qty)||1);
    // Giá vốn topping theo ĐÚNG NGÀY của bill (tính lại từ công thức + giá nguyên
    // liệu ngày đó), không lấy costPerServing đang lưu — số đang lưu là giá HÔM NAY.
    const donGia = (rec && tId) ? toppingCostOn(tId, dateKey) : 0;
    const realCost = donGia > 0 ? donGia * q : 0;
    if(isFree){
      // Topping tặng chưa khai GOGS: tạm coi giá vốn = 0 (không có doanh thu để ước
      // tính thay, và không nên tự suy diễn giá trị) — sẽ hiện cảnh báo "Chưa khai GOGS"
      // ở màn danh sách để chủ quán biết cần bổ sung.
      freeCost += realCost;
    } else if(realCost > 0){
      paidRealCost += realCost;
    } else {
      paidUncostedRevenue += (Number(t && t.price)||0) * q;
    }
  });
  return { freeCost, paidRealCost, paidUncostedRevenue };
}
let PACKAGING_PRESETS = {};
function pkgSizeKey(label){ return String(label||'').trim().toUpperCase(); }
async function loadPackagingPresets(){
  const snap = await fstore.collection('packaging_presets_gieogieo').get();
  const map = {};
  snap.forEach(d=> map[d.id] = d.data());
  PACKAGING_PRESETS = map;
  return map;
}
function computePackagingItemsCost(items, dateKey){
  return (items||[]).reduce((s,r)=> s + (Number(r.qty)||0) * itemCostOn(r.itemId, dateKey), 0);
}
let PACKAGING_ITEM_OVERRIDES = {};
async function loadPackagingItemOverrides(){
  const snap = await fstore.collection('packaging_item_overrides_gieogieo').get();
  const map = {};
  snap.forEach(d=> map[d.id] = d.data());
  PACKAGING_ITEM_OVERRIDES = map;
  return map;
}
function resolvePackagingItemsForLine(itemId, size, hasTopping){
  const sizeKey = pkgSizeKey(size);
  const override = itemId ? PACKAGING_ITEM_OVERRIDES['togo:'+itemId] : null;
  const sizeOverride = override && override.sizes && override.sizes[sizeKey];
  const profile = sizeOverride ? (hasTopping ? sizeOverride.withTopping : sizeOverride.noTopping) : null;
  if(profile && profile.items && profile.items.length) return profile.items;
  const def = PACKAGING_PRESETS[sizeKey];
  return (def && def.items) || [];
}
function packagingCostForLine(itemId, size, hasTopping, dateKey){
  return computePackagingItemsCost(resolvePackagingItemsForLine(itemId, size, hasTopping), dateKey);
}
const PKG_GROUPS = ['ly','nap','muong','onghut','hu','da'];
const PKG_GROUP_MODE = { ly:'exclusive', nap:'exclusive', muong:'exclusive', onghut:'exclusive', hu:'additive', da:'exclusive' };
let PACKAGING_RULES = [];
async function loadPackagingRules(){
  const snap = await fstore.collection('packaging_rules_gieogieo').get();
  PACKAGING_RULES = snap.docs.map(d=>({id:d.id, ...d.data()}));
  return PACKAGING_RULES;
}
const PKG_RULES_CONFIG_DEFAULTS = { triggerToppingIds:[], triggerPrepIds:[], jarToppingIds:[] };
let PACKAGING_RULES_CONFIG = {...PKG_RULES_CONFIG_DEFAULTS};
async function loadPackagingRulesConfig(){
  const doc = await fstore.collection('packaging_rules_config_gieogieo').doc('current').get();
  PACKAGING_RULES_CONFIG = { ...PKG_RULES_CONFIG_DEFAULTS, ...(doc.exists ? doc.data() : {}) };
  return PACKAGING_RULES_CONFIG;
}
function normIce(ice){ return ice === 'rieng' ? 'rieng' : 'chung'; }
function lineHasToppingTrigger(menuItemId, size, toppings){
  const cfg = PACKAGING_RULES_CONFIG;
  const trigTp = cfg.triggerToppingIds || [], trigPrep = cfg.triggerPrepIds || [];
  // Nguồn 1 — topping khách gọi thêm ở POS
  if((toppings||[]).some(t=> trigTp.includes(t.toppingId || t.id))) return true;
  // Nguồn 2 + 3 — topping đính kèm sẵn và CB1, đều nằm trong định mức món
  const recipe = menuItemId ? RECIPES['togo:'+menuItemId] : null;
  const rows = recipe && recipe.sizes && recipe.sizes[size];
  return (rows||[]).some(r=>
    (r.refType==='topping' && trigTp.includes(r.toppingId)) ||
    (r.refType==='prep' && trigPrep.includes(r.prepId))
  );
}
function pkgRuleMatches(rule, ctx){
  if(rule.menuItemId && rule.menuItemId !== ctx.menuItemId) return false;
  if(rule.size && rule.size !== 'ANY' && rule.size !== pkgSizeKey(ctx.size)) return false;
  if(rule.ice && rule.ice !== 'any' && rule.ice !== normIce(ctx.ice)) return false;
  if(rule.condition === 'has_tp' && !ctx.hasTopping) return false;
  if(rule.condition === 'no_tp' && ctx.hasTopping) return false;
  return true;
}
function pkgRuleSpecificity(rule){
  let s = 0;
  if(rule.menuItemId) s += 8;
  if(rule.size && rule.size !== 'ANY') s += 4;
  if(rule.ice && rule.ice !== 'any') s += 2;
  if(rule.condition && rule.condition !== 'always') s += 1;
  return s;
}
function pkgRuleQty(rule, ctx){
  if(rule.qtyMode === 'per_jar_topping'){
    const jar = PACKAGING_RULES_CONFIG.jarToppingIds || [];
    return (ctx.toppings||[]).filter(t=> jar.includes(t.toppingId || t.id)).length;
  }
  return Number(rule.qty)||0;
}
function resolvePackagingForCup(ctx){
  const out = {};
  const add = (itemId, qty)=>{ if(itemId && qty>0) out[itemId] = (out[itemId]||0) + qty; };
  PKG_GROUPS.forEach(group=>{
    const matched = PACKAGING_RULES.filter(r=> r.group===group && pkgRuleMatches(r, ctx));
    if(!matched.length) return;
    if(PKG_GROUP_MODE[group] === 'additive'){
      matched.forEach(r=> add(r.itemId, pkgRuleQty(r, ctx)));
    } else {
      // exclusive — chỉ lấy dòng cụ thể nhất, bỏ phần còn lại
      const best = matched.reduce((a,b)=> pkgRuleSpecificity(b) > pkgRuleSpecificity(a) ? b : a);
      add(best.itemId, pkgRuleQty(best, ctx));
    }
  });
  return Object.entries(out).map(([itemId,qty])=>({itemId, qty}));
}
function pkgCtxFromLine(it){
  const menuItemId = it.itemId || null;
  const size = it.size || '';
  const toppings = it.toppings || [];
  return { menuItemId, size, ice: it.ice, toppings,
           hasTopping: lineHasToppingTrigger(menuItemId, size, toppings) };
}
function packagingCostForCupLine(it, dateKey){
  return computePackagingItemsCost(resolvePackagingForCup(pkgCtxFromLine(it)), dateKey);
}
function pkgRulesActive(){ return PACKAGING_RULES.length > 0; }
const PACKAGING_BAGGING_DEFAULTS = { trayThreshold: 6, bagSingle:{items:[]}, bagDouble:{items:[]}, tray:{items:[]} };
let PACKAGING_BAGGING_RULES = {...PACKAGING_BAGGING_DEFAULTS};
async function loadPackagingBaggingRules(){
  const doc = await fstore.collection('packaging_bagging_rules_gieogieo').doc('current').get();
  PACKAGING_BAGGING_RULES = { ...PACKAGING_BAGGING_DEFAULTS, ...(doc.exists ? doc.data() : {}) };
  return PACKAGING_BAGGING_RULES;
}
function isCupLineForBagging(it){
  if(!it || it.isFood || it._discountId) return false;
  const size = String(it.size||'').trim();
  if(!size || size === '-') return false;
  return (Number(it.qty)||0) > 0;
}
function cupsIceListForOrder(order){
  const cups = [];
  (order && order.itemsArray || []).forEach(it=>{
    if(!isCupLineForBagging(it)) return;
    const qty = Number(it.qty)||0;
    for(let i=0;i<qty;i++) cups.push(it.ice || 'chung');
  });
  return cups;
}
const PKG_BAG_TABLE_DEFAULTS = { maxCups: 6, rows: {} };
let PACKAGING_BAGGING_TABLE = {...PKG_BAG_TABLE_DEFAULTS};
async function loadPackagingBaggingTable(){
  const doc = await fstore.collection('packaging_bagging_table_gieogieo').doc('current').get();
  PACKAGING_BAGGING_TABLE = { ...PKG_BAG_TABLE_DEFAULTS, ...(doc.exists ? doc.data() : {}) };
  return PACKAGING_BAGGING_TABLE;
}
function pkgBagTableActive(){
  return Object.keys((PACKAGING_BAGGING_TABLE && PACKAGING_BAGGING_TABLE.rows) || {}).length > 0;
}
function baggingItemsForCount(n, mode, table){
  const out = {};
  const rows = (table && table.rows) || {};
  const maxCups = Number(table && table.maxCups) || 6;
  let left = Number(n)||0;
  let guard = 0; // chặn vòng lặp vô hạn nếu dữ liệu bảng hỏng
  while(left > 0 && guard++ < 200){
    const take = left >= maxCups ? maxCups : left;
    const row = rows[String(take)];
    const items = row && row[mode];
    if(items && items.length){
      items.forEach(r=>{ if(r.itemId) out[r.itemId] = (out[r.itemId]||0) + (Number(r.qty)||0); });
    }
    left -= take;
  }
  return out;
}
function computeBaggingItemsForOrder(order){
  const cups = cupsIceListForOrder(order);
  if(!cups.length) return [];
  const table = PACKAGING_BAGGING_TABLE;
  const riengCount = cups.filter(c=>c==='rieng').length;
  const chungCount = cups.length - riengCount;
  const merged = {};
  const addAll = obj => Object.entries(obj).forEach(([id,q])=>{ merged[id]=(merged[id]||0)+q; });
  if(chungCount>0) addAll(baggingItemsForCount(chungCount,'chung',table));
  if(riengCount>0) addAll(baggingItemsForCount(riengCount,'rieng',table));
  return Object.entries(merged).map(([itemId,qty])=>({itemId,qty}));
}
function computeBaggingPlan(cups, trayThreshold){
  const total = cups.length;
  if(!total) return {bagSingle:0, bagDouble:0, tray:0};
  const threshold = Number(trayThreshold)||0;
  if(threshold>0 && total>=threshold) return {bagSingle:0, bagDouble:0, tray:1};
  const riengCount = cups.filter(c=>c==='rieng').length;
  const chungCount = total - riengCount;
  const chungDouble = Math.floor(chungCount/2);
  const chungSingle = chungCount % 2;
  return { bagSingle: chungSingle, bagDouble: riengCount + chungDouble, tray: 0 };
}
function computeBaggingCostForOrder(order, dateKey){
  // Ưu tiên BẢNG mới nếu đã khai; chưa khai thì dùng công thức cũ.
  if(pkgBagTableActive()) return computePackagingItemsCost(computeBaggingItemsForOrder(order), dateKey);
  const plan = computeBaggingPlan(cupsIceListForOrder(order), PACKAGING_BAGGING_RULES.trayThreshold);
  // Guard `kit && kit.items`: hàm này nằm trong aggregateOrders() — đường tính COGS
  // LÕI của mọi báo cáo. Nếu 1 kit bị thiếu/null trong dữ liệu (doc ghi lỗi, ghi từ
  // phiên bản khác) mà truy cập thẳng .items thì crash cả báo cáo, không chỉ hỏng
  // riêng phần bao bì. Thiếu kit thì coi như chi phí 0 và đi tiếp.
  const kitCost = (kit, count) => {
    if(!count || !kit || !kit.items) return 0;
    return count * computePackagingItemsCost(kit.items, dateKey);
  };
  const r = PACKAGING_BAGGING_RULES;
  return kitCost(r.bagSingle, plan.bagSingle) + kitCost(r.bagDouble, plan.bagDouble) + kitCost(r.tray, plan.tray);
}
async function loadAssetsAll(){
  const snap = await fstore.collection('assets_gieogieo').get();
  return snap.docs.map(d=>({id:d.id, ...d.data()}));
}
function monthlyDepreciation(assets, asOfDateKey){
  return assets.filter(a=>{
    if(a.active===false) return false;
    if(asOfDateKey && a.purchaseDate){
      if(a.purchaseDate > asOfDateKey) return false;
      const life = Number(a.usefulLifeMonths)||1;
      const endDate = new Date(a.purchaseDate+'T00:00:00');
      endDate.setMonth(endDate.getMonth()+life);
      if(asOfDateKey >= dkey(endDate)) return false;
    }
    return true;
  }).reduce((sum,a)=>{
    const life = Number(a.usefulLifeMonths)||1;
    const dep = (Number(a.purchaseCost||0) - Number(a.residualValue||0)) / life;
    return sum + Math.max(dep,0);
  },0);
}
const EXP_VARIABLE_HINTS = ['đá','ship','vận chuyển','giao hàng','bao bì','ly','ống hút',
  'vật tư tiêu hao','nguyên liệu','phí ngân hàng','phí sàn','hoa hồng','chiết khấu','gas','túi'];
function guessCostType(label){
  const s = String(label || '').toLowerCase();
  return EXP_VARIABLE_HINTS.some(k => s.includes(k)) ? 'variable' : 'fixed';
}
function costTypeOf(label, cats){
  const c = (cats || []).find(x => (x.label || '') === label);
  return (c && c.costType) ? c.costType : guessCostType(label);
}
function splitExpensesByCostType(expList, cats, amountOf){
  const tien = amountOf || (e => Number(e.amount || 0));
  let coDinh = 0, bienDoi = 0;
  (expList || []).forEach(e => {
    if (costTypeOf(e.category, cats) === 'variable') bienDoi += tien(e);
    else coDinh += tien(e);
  });
  return { coDinh, bienDoi };
}
function plChannelFeeForDay(day){
  return 0;
}
function plScheduledHours(s){
  if(!s || s.isOff || !s.startTime || !s.endTime) return 0;
  const toMin = t => { const p = String(t).split(':'); return (Number(p[0])||0)*60 + (Number(p[1])||0); };
  let mins = toMin(s.endTime) - toMin(s.startTime);
  if(mins < 0) mins += 24*60;
  return mins/60;
}
function plPredictedLaborByDate(employees, schedules, startKey, endKey){
  const empById = {}; (employees||[]).forEach(e=>{ empById[e.id] = e; });
  const byDate = {};
  const hoursByEmpDate = {};   // { "empId|date": tổng giờ theo lịch }
  const termsByEmpDate = {};   // [LƯƠNG THEO MỐC]
  (schedules||[]).forEach(s=>{
    const emp = empById[s.employeeId];
    // [FIX lịch sót của người đã nghỉ] Màn Lịch chỉ hiện nhân viên đang làm — lịch cũ còn sót của người
    // "Đã nghỉ" không ai thấy để xoá mà vẫn bị cộng tiền. Bỏ qua như phần lương cứng ở dưới.
    if(!emp || emp.active===false) return;
    const terms = empPayTermsOn(emp, s.date);          // [LƯƠNG THEO MỐC]
    if(terms.payType!=='hourly_full' && terms.payType!=='hourly_part') return;
    const h = plScheduledHours(s);
    if(h <= 0) return;
    const k = s.employeeId + '|' + s.date;
    hoursByEmpDate[k] = (hoursByEmpDate[k]||0) + h;
    if(!termsByEmpDate[k]) termsByEmpDate[k] = terms;
  });
  Object.entries(hoursByEmpDate).forEach(([k, h])=>{
    const sep = k.indexOf('|');
    const { amount } = computeWageForDayHours(termsByEmpDate[k], h);
    const date = k.slice(sep+1);
    byDate[date] = (byDate[date]||0) + amount;
  });
  let cur = new Date(startKey+'T00:00:00');
  const end = new Date(endKey+'T00:00:00');
  while(cur <= end){
    const key = dkey(cur), dim = daysInMonth(cur);
    (employees||[]).forEach(emp=>{
      if(emp.active===false) return;
      const terms = empPayTermsOn(emp, key);
      if(isFixedPayType(terms) && empFixedPayHere(emp)) byDate[key] = (byDate[key]||0) + terms.fixedMonthlySalary/dim;
    });
    cur.setDate(cur.getDate()+1);
  }
  return byDate;
}
function computeDayPL({ day, expList, cats, assets, laborActual, laborPredicted, wasteValue, wasteValueThieu, homNayKey }){
  const dateKey = (day && day.date) || homNayKey || dkey(new Date());
  const cfg = configForDate(dateKey);
  const dObj = new Date(dateKey+'T00:00:00');
  const dim = daysInMonth(dObj);
  const doanhThu = Number(day && day.revenue) || 0;
  const dangUocTinh = [];   // liệt kê thứ đang là số ước tính — băng "chờ số thực tế" ở đợt 4 sẽ dùng lại

  // GIÁ VỐN — cùng cách tính với computeKPIs(): phần món đã khai định mức lấy giá
  // vốn THẬT, phần chưa khai ước theo target COGS% của ĐÚNG ngày đó (configForDate,
  // không lấy target hiện tại áp ngược cho quá khứ). Topping bán tính riêng vì
  // margin nhóm topping khác nhóm đồ uống.
  const cogsPct = (cfg.targets.cogsPct||0)/100;
  const chuaKhaiMon = (day && day.revenueUncosted!=null) ? day.revenueUncosted : doanhThu;
  const chuaKhaiTopping = (day && day.toppingRevenueUncosted!=null)
    ? day.toppingRevenueUncosted : (Number(day && day.toppingRevenue)||0);
  const giaVonMon = (Number(day && day.cogsActual)||0) + chuaKhaiMon*cogsPct;
  const giaVonTopping = (Number(day && day.toppingCogsActual)||0) + chuaKhaiTopping*cogsPct;
  const giaVon = giaVonMon + giaVonTopping;
  if(chuaKhaiMon + chuaKhaiTopping > 0) dangUocTinh.push('giá vốn của phần món chưa khai định mức');

  // HAO HỤT & HUỶ — nguyên liệu hư + bán thành phẩm huỷ + ly đổ, lấy từ ledger.
  // KHÔNG trùng với giá vốn: giá vốn là nguyên liệu đi vào ly ĐÃ BÁN, còn đây là
  // phần mất đi mà không bán được.
  // [FIX #D] wasteValueThieu=true nghĩa là KHÔNG đọc được ledger (Firestore lỗi), không phải
  // "đọc được và thật sự bằng 0" — hai chuyện khác hẳn nhau (đúng bài học đã áp dụng cho
  // các chỗ khác: "chưa biết" không được phép biến thành "bằng không"). haoHut vẫn phải là một số để cộng vào tongChiPhi (0 là lựa chọn ít sai nhất khi
  // thiếu dữ liệu — không tự bịa ra một số hao hụt), nhưng liệt kê vào dangUocTinh + hạ trần
  // mucTinCay bên dưới để KHÔNG hiển thị như một con số đã chốt.
  const haoHut = Number(wasteValue) || 0;
  if (wasteValueThieu) dangUocTinh.push('hao hụt (không đọc được sổ kho lúc này — số đang hiện tạm 0đ)');

  // CHI PHÍ trong ngày — phân bổ đúng ngày (khoản có kỳ hạn chia đều theo ngày,
  // xem expenseAllocatedAmount). Chỉ tính khoản ĐÃ DUYỆT, giống hệt filterExpenses:
  // chi phí nhân viên gửi từ POS còn chờ duyệt thì chưa vào lãi/lỗ.
  const expDuyet = (expList||[]).filter(e => e.status!=='pending_review' && e.status!=='rejected');
  const { coDinh, bienDoi } = splitExpensesByCostType(expDuyet, cats,
    e => expenseAllocatedAmount(e, dObj, dObj));
  // [đợt 3] Khoản nào của ĐÚNG ngày này còn là SỐ DỰ ĐOÁN (chưa có hoá đơn). Vẫn
  // được tính vào lãi/lỗ — bỏ ra thì con số thiếu hẳn một khoản và trông đẹp giả
  // tạo — nhưng ngày đó KHÔNG được coi là đã đủ số thật.
  const choSoThat = [];
  expDuyet.forEach(e=>{
    if(!expenseIsEstimate(e)) return;
    const v = expenseAllocatedAmount(e, dObj, dObj);
    if(v > 0) choSoThat.push({ id: e.id, category: e.category, tien: v });
  });
  if(choSoThat.length) dangUocTinh.push('chi phí chưa có hoá đơn: ' + choSoThat.map(x=>x.category).join(', '));

  // LƯƠNG — quyết định số 3. Thứ tự ưu tiên có chủ đích:
  //   · Chưa bật "lương thật" → giữ nguyên cách tính cũ của app (ngân sách lương
  //     tháng ÷ số ngày) để không có hai con số Labor khác nhau trong cùng một app.
  //   · Ngày chưa qua (hôm nay trở đi) và ĐÃ XẾP LỊCH → lấy lịch. Đây là lý do tồn
  //     tại của phần dự đoán: 3 giờ chiều mà lấy chấm công thì lương mới chạy được
  //     nửa ca, lãi hôm nay trông đẹp giả tạo rồi tối mới tụt xuống.
  //   · Ngày đã qua → chấm công thật.
  let luong, luongLaDuDoan = false, luongNguon;
  const luongThat = (laborActual && laborActual[dateKey]!=null) ? laborActual[dateKey] : null;
  const luongLich = (laborPredicted && laborPredicted[dateKey]!=null) ? laborPredicted[dateKey] : null;
  const laNgayDangChay = dateKey >= (homNayKey || dkey(new Date()));
  if(!HR_SETTINGS.useActualLaborCost){
    luong = laborMonthlyTotal(cfg.labor)/dim; luongLaDuDoan = true; luongNguon = 'ngân sách lương tháng';
  } else if(laNgayDangChay && luongLich!=null){
    luong = luongLich; luongLaDuDoan = true; luongNguon = 'lịch làm việc đã xếp';
  } else if(luongThat!=null){
    luong = luongThat; luongNguon = 'chấm công thật';
  } else if(luongLich!=null){
    luong = luongLich; luongLaDuDoan = true; luongNguon = 'lịch làm việc đã xếp';
  } else {
    luong = laborMonthlyTotal(cfg.labor)/dim; luongLaDuDoan = true; luongNguon = 'ngân sách lương tháng';
  }
  if(luongLaDuDoan) dangUocTinh.push('lương (' + luongNguon + ')');

  // KHẤU HAO — nguyên giá ÷ số tháng sử dụng, rồi ÷ số ngày trong tháng đó. Tài sản
  // mua sau ngày này hoặc đã hết thời gian khấu hao không được tính (monthlyDepreciation
  // nhận dateKey để lọc), nên số của tháng 3 không dính máy mua tháng 7.
  const khauHao = monthlyDepreciation(assets||[], dateKey)/dim;
  // Tài sản chỉ được khấu hao KỂ TỪ ngày mua đã khai. Ngày trước ngày mua thì khấu hao
  // bằng 0 — đúng về kế toán, nhưng nhìn vào bảng thì rất khó hiểu: khai tài sản rồi
  // mà cả kỳ 6 ngày chỉ có một ngày mang khấu hao. Ghi lại cờ này để màn hình NÓI RA
  // thay vì để chủ quán tự đoán.
  const coTaiSan = (assets||[]).some(a => a.active !== false);

  const phiKenh = plChannelFeeForDay(day);

  const tongChiPhi = giaVon + haoHut + bienDoi + phiKenh + luong + coDinh + khauHao;
  const lai = doanhThu - tongChiPhi;
  return {
    date: dateKey, doanhThu,
    giaVon, giaVonMon, giaVonTopping, haoHut,
    bienPhiKhac: bienDoi, phiKenh, luong, luongLaDuDoan, luongNguon,
    chiPhiCoDinh: coDinh, khauHao, tongChiPhi,
    coTaiSan,
    lai, laiTruocKhauHao: lai + khauHao,
    bienLaiPct: doanhThu ? lai/doanhThu : 0,
    dangUocTinh, choSoThat, wasteValueThieu: !!wasteValueThieu,
    // Ba mức, theo đúng thứ tự chắc chắn dần:
    //   dang-chay  — ngày chưa xong, hoặc lương còn là số dự đoán
    //   chot-ngay  — ngày đã xong nhưng còn chi phí chờ hoá đơn
    //   chot-thang — không còn khoản chi phí nào là số dự đoán
    // Giá vốn ước theo target COGS% KHÔNG chặn mức cao nhất: nó không phải thứ chờ
    // hoá đơn, mà là hệ quả của việc chưa khai định mức — vẫn liệt kê ở dangUocTinh
    // để nói rõ, nhưng đợi nó thì không ngày nào lên được mức đủ số thật.
    // [FIX #D] wasteValueThieu chỉ HẠ TRẦN xuống 'chot-ngay' (không đẩy lên nếu ngày đang
    // 'dang-chay' — trạng thái đó đã yếu hơn rồi, đè lên là nói dối theo hướng tốt hơn).
    mucTinCay: (() => {
      const muc = (laNgayDangChay || luongLaDuDoan) ? 'dang-chay' : (choSoThat.length ? 'chot-ngay' : 'chot-thang');
      return (wasteValueThieu && muc === 'chot-thang') ? 'chot-ngay' : muc;
    })()
  };
}
function plSumDays(days){
  const keys = ['doanhThu','giaVon','giaVonMon','giaVonTopping','haoHut','bienPhiKhac',
    'phiKenh','luong','chiPhiCoDinh','khauHao','tongChiPhi','lai','laiTruocKhauHao'];
  const out = {}; keys.forEach(k=>{ out[k] = 0; });
  (days||[]).forEach(d=>keys.forEach(k=>{ out[k] += Number(d[k])||0; }));
  out.soNgay = (days||[]).length;
  out.soNgayLo = (days||[]).filter(d=>d.lai < 0).length;
  out.soNgayCoKhauHao = (days||[]).filter(d=>d.khauHao > 0).length;
  out.coTaiSan = (days||[]).some(d=>d.coTaiSan);
  out.bienLaiPct = out.doanhThu ? out.lai/out.doanhThu : 0;
  // Mức tin cậy của cả kỳ = mức YẾU NHẤT trong các ngày. Một ngày chờ hoá đơn là cả
  // tháng chưa chốt được — gộp theo kiểu "đa số ngày đã xong" sẽ nói dối đúng vào
  // lúc chủ quán cần sự thật nhất.
  const mucList = (days||[]).map(d=>d.mucTinCay);
  out.mucTinCay = mucList.includes('dang-chay') ? 'dang-chay'
                : mucList.includes('chot-ngay') ? 'chot-ngay' : 'chot-thang';
  out.coUocTinh = out.mucTinCay !== 'chot-thang';
  // Gộp khoản chờ số thật theo BẢN GHI chi phí: tiền điện trải 30 ngày phải hiện
  // MỘT dòng với tổng tiền của kỳ, không phải 30 dòng giống hệt nhau.
  const gop = new Map();
  (days||[]).forEach(d=>(d.choSoThat||[]).forEach(k=>{
    const cur = gop.get(k.id) || { id:k.id, category:k.category, tien:0 };
    cur.tien += k.tien; gop.set(k.id, cur);
  }));
  out.khoanChoSoThat = [...gop.values()].sort((a,b)=>b.tien-a.tien);
  return out;
}
const PL_TOM_TAT_KEYS = ['doanhThu','giaVon','phiKenh','luong','chiPhiCoDinh','khauHao','haoHut','bienPhiKhac','tongChiPhi','lai','laiTruocKhauHao'];
const PL_LABOR_VERSION = 1;
function plNgayLuongCanTinhLai(by, from, to, opts){
  opts = opts || {};
  const now = opts.now!=null ? opts.now : Date.now();
  const vn = ms=>new Date(ms+7*3600000).toISOString().slice(0,10);
  const today = vn(now), low = opts.back!=null ? vn(now-opts.back*86400000) : from;
  return Object.keys(by||{}).filter(d=>d>=from && d>=low && d<=to && d<today &&
    by[d] && by[d].mucTinCay==='dang-chay' && (Number(by[d].laborVersion||0)<PL_LABOR_VERSION ||
      Number(by[d].laborCheckedAmount)!==Math.round((Number(by[d].luong)||0)*100)/100)).sort();
}
function plTomTatNgay(d, be){
  const r = v => Math.round((Number(v)||0) * 100) / 100;
  const o = { date: d.date };
  PL_TOM_TAT_KEYS.forEach(k=>{ o[k] = r(d[k]); });
  o.mucTinCay = d.mucTinCay || 'dang-chay';
  o.laborVersion = PL_LABOR_VERSION;
  o.laborCheckedAmount = o.luong; // bắt cả trường hợp HTML cũ ghi đè số qua merge
  o.luongNguon = d.luongNguon || null;
  o.luongLaDuDoan = !!d.luongLaDuDoan;
  o.hoaVon = be && be.hoaVon != null ? r(be.hoaVon) : null;
  o.bienDongGop = be ? r(be.bienDongGop * 10000) / 10000 : null;
  o.khongTheHoaVon = !!(be && be.khongTheHoaVon);
  o.uocTinh = !!(be && be.uocTinh);
  return o;
}
async function computeDailyPLRange(startDate, endDate){
  const startKey = dkey(startDate), endKey = dkey(endDate);
  const [salesRes, expAll, assets, cats, employees, schedules, ledgerRes, laborActual] = await Promise.all([
    fetchSalesRange(startDate, endDate),
    loadExpensesAll(),
    loadAssetsAll(),
    loadExpenseCategories().catch(()=>[]),
    loadEmployees().catch(()=>[]),
    loadSchedulesForRange(startKey, endKey).catch(()=>[]),
    // [FIX #D — "ledger fail → waste=0 → lãi thổi cao giả tạo"] TRƯỚC ĐÂY .catch(()=>null) rồi
    // coi im lặng như "không có hao hụt" — Firestore chập chờn vài giây là đủ để cả khối Lãi/lỗ
    // hiện lãi CAO hơn thực tế đúng bằng hao hụt trong ngày, không có dấu hiệu gì báo con số
    // đang sai. Giờ phân biệt rõ "đọc được, waste=0 thật" với "đọc lỗi, không biết waste bao
    // nhiêu" — cờ ok truyền xuống computeDayPL để hạ mức tin cậy thay vì giả vờ đã biết.
    // [GIẢM-ĐỌC] Khối này chỉ dùng wasteByDate — đọc riêng dòng WASTE thay vì cả sổ
    // (dòng CONSUMPTION của từng bill chiếm gần hết sổ mà ở đây bị bỏ đi). Cùng công thức
    // với computeLedgerRealMetrics nên con số không đổi.
    computeWasteByDateRange(startDate, endDate)
      .then(v => ({ ok: true, data: v }))
      .catch(err => { console.warn('[P&L] đọc ledger (waste thật) lỗi — hao hụt sẽ hiện 0 và bị đánh dấu thiếu số liệu:', err); return { ok: false, data: null }; }),
    HR_SETTINGS.useActualLaborCost
      // Lỗi đọc không phải là lương 0 hay ngân sách: không ghi đè sổ cũ bằng
      // một kết quả thiếu nguồn rồi âm thầm làm tụt luỹ kế.
      ? computeActualLaborCostByDate(startKey, endKey)
      : Promise.resolve(null)
  ]);
  const ledger = ledgerRes.data;
  const ledgerThieu = !ledgerRes.ok;
  const laborPredicted = plPredictedLaborByDate(employees, schedules, startKey, endKey);
  const wasteByDate = (ledger && ledger.wasteByDate) || {};
  const homNayKey = dkey(new Date());
  const days = salesRes.perDay.map(day => computeDayPL({
    day, expList: expAll, cats, assets,
    laborActual, laborPredicted,
    wasteValue: wasteByDate[day.date] || 0,
    wasteValueThieu: ledgerThieu,
    homNayKey
  }));
  plLuuTomTat(days);
  return { days, tong: plSumDays(days), salesRes, assets, realtime:{expList:expAll,cats,assets,laborActual,laborPredicted,wasteByDate,wasteValueThieu:ledgerThieu,homNayKey} };
}
function plBreakEven(pl, bienDuPhong){
  if(!pl) return null;
  const dt = Number(pl.doanhThu) || 0;
  // [FIX hoà vốn ngày — 04/10/2026] Chỉ giá vốn + phí kênh thật sự tăng theo TỪNG LY. "Chi phí biến đổi"
  // (khoản chi đã duyệt trong ngày) là số tiền đã tiêu rồi, bán thêm không làm nó tăng — để nó trong biên phí
  // thì 275k chi trên 674k doanh thu kéo biên từ 63% xuống 23%, hoà vốn vọt 1,47tr → 2,9tr. Cùng lý do với hao hụt.
  const bienPhi = (pl.giaVon||0) + (pl.phiKenh||0);
  // Khấu hao, hao hụt VÀ chi phí biến đổi của ngày nằm TRONG phần cần đắp — chi phí thật đã/sẽ
  // phát sinh không phụ thuộc vào việc bán thêm được bao nhiêu ly, doanh thu phải
  // đắp được hết thì mới gọi là hoà vốn.
  const coDinh = (pl.luong||0) + (pl.chiPhiCoDinh||0) + (pl.khauHao||0) + (pl.haoHut||0) + (pl.bienPhiKhac||0);
  // Chưa bán được đồng nào thì không đo được biên của hôm nay — mượn biên tham chiếu
  // (30 ngày gần nhất) và nói rõ là ước tính, chứ không chia cho 0.
  const uocTinh = !(dt > 0);
  const bienDongGop = uocTinh ? (Number(bienDuPhong) || 0) : 1 - bienPhi / dt;
  const khongTheHoaVon = !(bienDongGop > 0.0001);
  const hoaVon = khongTheHoaVon ? null : coDinh / bienDongGop;
  return {
    hoaVon, bienDongGop, coDinh, bienPhi, uocTinh, khongTheHoaVon,
    tyLeBienPhi: 1 - bienDongGop,
    chuaKhaiChiPhi: coDinh <= 0,
    dat: hoaVon != null && dt >= hoaVon,
    conThieu: hoaVon == null ? null : hoaVon - dt
  };
}
const _wasteIndexMissing = {};
async function _ledgerWasteRows(coll, startKey, endKey, type){
  type = type || 'WASTE';
  if(!_wasteIndexMissing[coll]){
    try{
      const snap = await fstore.collection(coll).where('type','==',type)
        .where('businessDate','>=',startKey).where('businessDate','<=',endKey).get();
      return snap.docs.map(d=>d.data());
    }catch(err){
      if(!_histIsMissingIndex(err)) throw err;
      _wasteIndexMissing[coll] = true;
      console.warn(`[hao hụt] ${coll} chưa có composite index (type + businessDate) — tạm đọc từng ngày. Tạo index tại:`, _histIndexUrl(err) || err.message);
    }
  }
  const keys = [];
  const d = new Date(startKey + 'T00:00:00'), end = new Date(endKey + 'T00:00:00');
  while(d <= end){ keys.push(dkey(d)); d.setDate(d.getDate()+1); }
  const rows = [];
  const CHUNK = 20;   // không bắn cả trăm truy vấn cùng lúc
  for(let i=0; i<keys.length; i+=CHUNK){
    const snaps = await Promise.all(keys.slice(i, i+CHUNK).map(k =>
      fstore.collection(coll).where('businessDate','==',k).where('type','==',type).get()));
    snaps.forEach(snap => snap.forEach(doc => rows.push(doc.data())));
  }
  return rows;
}
async function computeWasteByDateRange(startDate, endDate){
  const startKey = dkey(startDate), endKey = dkey(endDate);
  await ensurePriceHistory();
  const [stockRows, prepRows] = await Promise.all([
    _ledgerWasteRows('stock_transactions_gieogieo', startKey, endKey),
    _ledgerWasteRows('prep_transactions_gieogieo', startKey, endKey)
  ]);
  const wasteByDate = {};
  const ghiNhan = (t, val) => {
    const ngay = t && t.businessDate;
    if(!ngay || !val) return;
    wasteByDate[ngay] = (wasteByDate[ngay]||0) + val;
  };
  stockRows.forEach(t => {
    if(t.type !== 'WASTE') return;
    ghiNhan(t, Math.abs(Number(t.qty)||0) * itemCostOn(t.itemId, t.businessDate));
  });
  prepRows.forEach(t => {
    if(t.type !== 'WASTE') return;
    ghiNhan(t, Math.abs(Number(t.totalCost)||0));
  });
  return { wasteByDate };
}
const _ledgerRangeInflight = new Map();
let _qlAllChungDaNap = false;
async function qlAllNapChung(){   // dữ liệu DÙNG CHUNG cần cho giá vốn (init bỏ qua ở chế độ Xem tất cả)
  if(_qlAllChungDaNap) return;
  const [top, pres, ovr, bag, rules, rulesCfg, bagTbl] = await Promise.all([loadToppingRecipes(), loadPackagingPresets(), loadPackagingItemOverrides(),
    loadPackagingBaggingRules(), loadPackagingRules(), loadPackagingRulesConfig(), loadPackagingBaggingTable(),
    loadRecipes(), loadHrSettings().catch(()=>null), ensurePriceHistory().catch(()=>null)]);
  TOPPING_RECIPES = top; PACKAGING_PRESETS = pres; PACKAGING_ITEM_OVERRIDES = ovr; PACKAGING_BAGGING_RULES = bag;
  PACKAGING_RULES = rules; PACKAGING_RULES_CONFIG = rulesCfg; PACKAGING_BAGGING_TABLE = bagTbl;
  _qlAllChungDaNap = true;
}
function _histIsMissingIndex(err){
  const m = String((err && (err.code||err.message)) || '');
  return /failed-precondition|requires an index|index/i.test(m);
}
function _histIndexUrl(err){
  const m = String((err && err.message) || '').match(/https:\/\/\S+/);
  return m ? m[0].replace(/[).,]+$/,'') : '';
}
// ---- API ----
let _khoa = Promise.resolve(), _napChungLuc = 0, _quanTruoc = null;
const _liveCtx = {};
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
    _liveCtx[_quan]={inputs:r.realtime,salesRes:r.salesRes};
    const tomTat = r.days.map(d => plTomTatNgay(d, plBreakEven(d, 1 - ((configForDate(d.date).targets.cogsPct) || 0) / 100)));
    return { days: r.days, tomTat };
  });
  _khoa = p.catch(() => {});
  return p;
}
// No network I/O here: only the affected store's loaded context + current RT snapshot.
function realtime(opts){
  const p=_khoa.then(()=>{
    const c=_liveCtx[opts.storeId],dm=_dmQuan[opts.storeId];
    const previous=c&&c.salesRes.perDay.find(d=>d.date===opts.day);
    if(!previous||!dm)return null;
    _quan=opts.storeId;QL_VIEW=opts.storeId;
    if(_quanTruoc!==_quan){_costMemo={};_quanTruoc=_quan}
    INVENTORY_ITEMS=dm.items;PREP_ITEMS=dm.preps;COGS_TOGO=dm.cogs;
    const sales=salesFromLive(opts.orders,previous),inputs=c.inputs;
    const day=computeDayPL({...inputs,day:sales.perDay[0],wasteValue:inputs.wasteByDate[opts.day]||0});
    const tomTat=plTomTatNgay(day,plBreakEven(day,1-((configForDate(day.date).targets.cogsPct)||0)/100));
    return {day,tomTat};
  });_khoa=p.catch(()=>{});return p;
}
root.LaiLo = { VERSION: 3, tinh, realtime, PL_TOM_TAT_KEYS, plNgayLuongCanTinhLai };
})(typeof window !== 'undefined' ? window : globalThis);
