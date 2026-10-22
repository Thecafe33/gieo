'use strict';
// Lộ trình Engine 2 — B2 đường 1: đối chiếu tương thích (tools/automation/engine2_compat.js).
const assert=require('node:assert');
const fs=require('node:fs');
const X=require('../unit_engine2_export_v2');
const {compat,report,costOn}=require('../tools/automation/engine2_compat');
const {cleanState}=require('./lib/engine2_fixture');
const clone=v=>JSON.parse(JSON.stringify(v));

(async()=>{
 // itemCostOn chép đúng lai_lo.v6.js (so với mã nguồn để không trôi).
 const src=fs.readFileSync(require.resolve('../lai_lo.v6.js'),'utf8');
 assert.match(src,/if\(chon\) return Number\(chon\.price\)\|\|0;\s*const dau = list\[0\];\s*return dau\.oldPrice != null \? Number\(dau\.oldPrice\)\|\|0 : \(Number\(dau\.price\)\|\|0\);/,'itemCostOn của lai_lo đã đổi — cập nhật costOn');
 assert.match(src,/ghiNhan\(t, Math\.abs\(Number\(t\.qty\)\|\|0\) \* itemCostOn\(t\.itemId, t\.businessDate\)\);/);
 assert.match(src,/ghiNhan\(t, Math\.abs\(Number\(t\.totalCost\)\|\|0\)\);/);
 const items={a:{costPerUnit:9}},prices=[{itemId:'a',effectiveFrom:'2026-09-10',price:5,oldPrice:4},{itemId:'a',effectiveFrom:'2026-09-20',price:6}];
 assert.equal(costOn(prices,items,'a','2026-09-01'),4);assert.equal(costOn(prices,items,'a','2026-09-15'),5);assert.equal(costOn(prices,items,'a','2026-09-25'),6);assert.equal(costOn([],items,'a','2026-09-25'),9);
 console.log('ok Định giá chép đúng itemCostOn + cách sổ lãi/lỗ cộng hao hụt (đối chiếu mã nguồn lai_lo.v6.js)');

 const f=await cleanState();
 const dump=await X.build({storeId:'gg01',from:'2026-10-14',to:'2026-10-22',coll:k=>f.fstore.collection(X.physName(k,'gg01')),rtRef:n=>f.db.ref(n+'_gieogieo')});
 const r=compat(dump);
 assert.equal(r.loss.unexplained,0);assert.equal(r.loss.legacyTotal,r.loss.engine2Total);
 assert.equal(r.loss.kinds.bao_het.n,1);assert.equal(r.loss.kinds.can_ca.n,2,'hai lượt cân Engine 2 thiếu 50 g + 30 g');
 const j=r.tem.items.find(t=>t.id==='j');assert(j,'NL theo tem được đối chiếu');assert.equal(j.ok,true,JSON.stringify(j));assert.equal(j.computed,200);
 console.log('ok Dữ liệu sạch từ luồng thật: hao hụt khớp sổ lãi/lỗ, tồn danh mục = Σ tem (RT 200 g sau hai lượt cân)');

 {
  const bad=clone(dump);bad.docs['inventory_items_gieogieo/j'].currentStock=215;
  const x=compat(bad).tem.items.find(t=>t.id==='j');assert.equal(x.ok,false);assert.equal(x.diff,15);
  const sealed=clone(dump);sealed.docs['stock_containers_gieogieo/s1']={itemId:'j',status:'sealed',baseQty:500};
  assert.equal(compat(sealed).tem.items.find(t=>t.id==='j').diff,-500,'tem nguyên chưa vào tồn → lệch');
  const opened=clone(dump);opened.docs['stock_containers_gieogieo/s2']={itemId:'j',status:'sealed',baseQty:500};opened.rt.active_units_gieogieo.j.s2={unitBase:480};opened.docs['inventory_items_gieogieo/j'].currentStock=680;
  assert.equal(compat(opened).tem.items.find(t=>t.id==='j').ok,true,'tem vừa mở còn sealed trên FS nhưng đã có RT → chỉ tính RT (không đếm đôi)');
  const orphan=clone(dump);orphan.docs['stock_containers_gieogieo/o1']={itemId:'j',status:'open',unitBase:40};orphan.docs['inventory_items_gieogieo/j'].currentStock=240;
  assert.equal(compat(orphan).tem.items.find(t=>t.id==='j').ok,true,'tem mở thiếu node RT → cộng unitBase Firestore như engine');
  const discard=clone(dump);discard.rt.active_units_gieogieo.j.n.discardPending=true;discard.docs['inventory_items_gieogieo/j'].currentStock=0;
  assert.equal(compat(discard).tem.items.find(t=>t.id==='j').ok,true,'tem chờ huỷ không tính');
  console.log('ok Tem = sự thật theo đúng công thức engine: lệch bị bắt; tem vừa mở / mở thiếu RT / chờ huỷ tính như engine');
 }
 {
  const v=clone(dump);const k=Object.keys(v.docs).find(p=>p.startsWith('stock_transactions_gieogieo/')&&v.docs[p].type==='WASTE');v.docs[k].voided=true;
  v.docs['stock_transactions_gieogieo/manual1']={type:'WASTE',qty:-10,itemId:'j',businessDate:'2026-10-20',note:'Hao hụt / Huỷ 10 g · Lý do: đổ',createdAt:'2026-10-20T03:00:00Z'};
  const x=compat(v);assert.equal(x.findings.length,1);assert.equal(x.findings[0].code,'PL_COUNTS_VOIDED_WASTE');assert(x.loss.legacyTotal>x.loss.engine2Total);
  assert.equal(x.loss.kinds.khai_huy.n,1);
  const md=report(x);assert.match(md,/PL_COUNTS_VOIDED_WASTE/);assert.match(md,/Khai huỷ \/ hao hụt không gắn tem/);
  console.log('ok WASTE đã huỷ: sổ lãi/lỗ vẫn cộng, Engine 2 không → ghi thành phát hiện (không ép khớp); khai huỷ có nhãn riêng');
 }
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exit(1)});
