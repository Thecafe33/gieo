'use strict';
// Luật «nhập sai quy cách» (chủ quán 23/10). Quán KHÔNG cân hàng nhập → không kết luận từ một mã:
//   · mã DUY NHẤT của nguyên liệu trong phiếu nhận → hao hụt (như ca báo hết còn 300 g);
//   · còn mã cùng loại cùng phiếu chưa dùng xong → CHỜ (không phân bổ, không nâng kiểm soát);
//   · mã đó dùng xong cũng còn dư gần cùng tỷ lệ → nghi sai quy cách (không quy pha chế, giao đối chiếu nhãn bao);
//     mã đó dùng xong bình thường → hao hụt; chờ quá 45 ngày → hao hụt.
const assert=require('node:assert');
const E=require('../unit_engine2_v1');
const A=require('../unit_engine2_audit_v1');
const {create}=require('../unit_engine2_store_v1');
const {makeFake}=require('./lib/fakefb');
const ROOT=E.rootPath('gg01');
const clone=v=>JSON.parse(JSON.stringify(v));
const start='2026-10-14T07:17:00.000Z',end='2026-10-22T02:49:00.000Z';

function base(extra={}){
 const shifts=['a','b'].map((id,i)=>['employee_shifts_gieogieo/s'+id,{employeeId:id,employeeName:id.toUpperCase(),roles:['barista'],checkedInAt:'2026-10-'+(15+i)+'T02:30:00.000Z',checkedOutAt:'2026-10-'+(15+i)+'T13:00:00.000Z'}]);
 return makeFake({fs:{
  [ROOT]:{enabled:true,mode:'active',protocolVersion:1,fleetConfirmed:true,fromDate:'2026-10-01',controlledItemIds:[],settingsRevision:3},
  'stock_transactions_gieogieo/finish_u_WASTE':{itemId:'pearl',referenceId:'u',type:'WASTE',qty:-1000,createdAt:end,businessDate:'2026-10-22',note:'Báo hết'},
  'stock_containers_gieogieo/u':{itemId:'pearl',itemName:'Trân châu',unit:'g',baseQty:2000,openedAt:start,finishedAt:end,status:'finished',wasteBase:1000,wasteBasis:'unit_engine',receiveRefId:'R1'},
  'inventory_items_gieogieo/pearl':{name:'Trân châu',unit:'g',costPerUnit:20},
  'price_history_gieogieo/p':{itemId:'pearl',effectiveFrom:'2026-09-01',price:20},
  'employee_shifts_gieogieo/sc':{employeeId:'c',employeeName:'C',roles:[],checkedInAt:'2026-10-22T04:00:00.000Z',checkedOutAt:'2026-10-22T13:00:00.000Z'},
  ...Object.fromEntries(shifts),...extra}});
}
const finishSibling=(f,left,at='2026-10-23T03:00:00.000Z')=>{
 f.FS['stock_containers_gieogieo/u2']={...f.FS['stock_containers_gieogieo/u2'],status:'finished',openedAt:'2026-10-22T03:00:00.000Z',finishedAt:at,wasteBase:left,wasteBasis:'unit_engine'};
 f.FS['stock_transactions_gieogieo/finish_u2_WASTE']={itemId:'pearl',referenceId:'u2',type:'WASTE',qty:-left,createdAt:at,businessDate:'2026-10-23',note:'Báo hết'};
};
const sib={'stock_containers_gieogieo/u2':{itemId:'pearl',itemName:'Trân châu',unit:'g',baseQty:2000,status:'sealed',receiveRefId:'R1'},'receiving_records_gieogieo/R1':{createdAt:start,items:[{itemId:'pearl',qty:2}]}};
const caseOf=(f,id)=>f.FS[ROOT+'/cases/'+E.key('finish',id)];

(async()=>{
 // Luật thuần ở lõi.
 const c={id:'u',itemId:'pearl',receiveRefId:'R1',baseQty:2000,finishedAt:end};
 assert.strictEqual(E.specCheck(c,1000,[],Date.parse(end)).reason,'only_unit');
 assert.strictEqual(E.specCheck(c,1000,[{id:'u2',itemId:'pearl',receiveRefId:'R1',status:'open',baseQty:2000}],Date.parse(end)).action,'wait');
 assert.strictEqual(E.specCheck(c,1000,[{id:'u2',itemId:'pearl',receiveRefId:'R2',status:'open',baseQty:2000}],Date.parse(end)).reason,'only_unit','phiếu nhận khác không tính');
 assert.strictEqual(E.specCheck(c,1000,[{id:'u2',itemId:'milk',receiveRefId:'R1',status:'open',baseQty:2000}],Date.parse(end)).reason,'only_unit','khác nguyên liệu không tính');
 assert.strictEqual(E.specCheck(c,1000,[{id:'u2',itemId:'pearl',receiveRefId:'R1',status:'finished',baseQty:2000,wasteBase:960}],0).action,'spec');
 assert.strictEqual(E.specCheck(c,1000,[{id:'u2',itemId:'pearl',receiveRefId:'R1',status:'finished',baseQty:2000,wasteBase:30}],0).reason,'sibling_normal');
 assert.strictEqual(E.specCheck(c,200,[{id:'u2',itemId:'pearl',receiveRefId:'R1',status:'open',baseQty:2000}],0).reason,'normal','dư dưới ngưỡng tỷ lệ → hao hụt thường, không chờ');
 assert.strictEqual(E.specCheck(c,1000,[{id:'u2',itemId:'pearl',receiveRefId:'R1',status:'open',baseQty:2000}],Date.parse(end)+46*86400000).reason,'wait_timeout');
 console.log('ok Lõi: mã duy nhất / chờ / sai quy cách / bình thường / dưới ngưỡng / quá hạn chờ — chỉ tính cùng loại cùng phiếu nhận');

 // 1) Mã duy nhất của phiếu → hao hụt như cũ (chia đều pha chế).
 {const f=base();await create({storeId:'gg01',fstore:f.fstore,now:()=>Date.parse(end)+1000}).finish('finish_u_WASTE');
  const k=caseOf(f,'finish_u_WASTE');assert.deepStrictEqual([k.status,k.basis,k.allocations.length],['decided','policy_equal_share',2]);assert.strictEqual(k.spec?.reason,undefined);
  assert.strictEqual(f.FS[ROOT+'/controls/pearl'].level,2,'hao hụt → nâng kiểm soát như cũ');
  console.log('ok Mã duy nhất của phiếu nhận → kết luận hao hụt, chia đều pha chế, nâng kiểm soát');}

 // 2) Còn mã cùng phiếu chưa dùng → CHỜ; mã đó dùng xong cũng dư ~cùng tỷ lệ → cả hai thành «nghi sai quy cách».
 {const f=base(sib);let t=Date.parse(end)+1000;const s=create({storeId:'gg01',fstore:f.fstore,now:()=>t});
  await s.finish('finish_u_WASTE');let k=caseOf(f,'finish_u_WASTE');
  assert.deepStrictEqual([k.status,k.basis,k.allocations.length,k.pending.qty,k.waitLot],['checking','waiting_sibling',0,1000,'pearl|R1']);
  assert.strictEqual(f.FS[ROOT+'/controls/pearl'],undefined,'đang chờ → không nâng kiểm soát, không quy ai');assert.match(k.explanation,/CHỜ mã đó dùng xong/);
  finishSibling(f,980);t=Date.parse('2026-10-23T03:00:01Z');await s.finish('finish_u2_WASTE');
  const k2=caseOf(f,'finish_u2_WASTE');k=caseOf(f,'finish_u_WASTE');
  assert.deepStrictEqual([k2.status,k2.basis,k2.allocations.length],['decided','spec_mismatch',0]);
  assert.deepStrictEqual([k.status,k.basis,k.allocations.length,k.pending.qty],['decided','spec_mismatch',0,1000],'hồ sơ đang chờ được tính lại ngay khi mã cùng phiếu báo hết');
  assert.ok(k.statusEvents.includes('EVIDENCE_READY'));assert.match(k.explanation,/nghi nhập sai quy cách/);
  const task=f.FS[ROOT+'/tasks/'+E.key('spec_confirm','R1','pearl')];assert.deepStrictEqual([task.kind,task.recordedQty,task.resolves],['spec_confirm',2000,'spec']);
  assert.strictEqual(f.FS[ROOT+'/controls/pearl'],undefined,'sai quy cách → không nâng kiểm soát hao hụt');
  const audit=await A.run({storeId:'gg01',from:'2026-10-14',to:'2026-10-24',fstore:f.fstore,limit:5000});
  assert.deepStrictEqual(audit.violations,0,JSON.stringify(audit.issues||audit,null,1).slice(0,800));
  console.log('ok Còn mã cùng phiếu → chờ (không phân bổ); mã đó cũng dư cùng tỷ lệ → nghi sai quy cách, giao đối chiếu nhãn bao; kiểm toán độc lập 0 vi phạm');}

 // 3) Mã cùng phiếu dùng xong bình thường → hồ sơ chờ kết luận hao hụt.
 {const f=base(sib);let t=Date.parse(end)+1000;const s=create({storeId:'gg01',fstore:f.fstore,now:()=>t});
  await s.finish('finish_u_WASTE');finishSibling(f,20);t=Date.parse('2026-10-23T03:00:01Z');await s.finish('finish_u2_WASTE');
  const k=caseOf(f,'finish_u_WASTE');assert.deepStrictEqual([k.status,k.basis,k.allocations.length],['decided','policy_equal_share',2]);
  assert.strictEqual(f.FS[ROOT+'/controls/pearl'].level,2);
  console.log('ok Mã cùng phiếu dùng xong bình thường → kết luận hao hụt (chia đều, nâng kiểm soát)');}

 // 4) Chờ quá 45 ngày (mã kia chưa dùng) → lượt học hằng ngày kết luận hao hụt.
 {const f=base(sib);await create({storeId:'gg01',fstore:f.fstore,now:()=>Date.parse(end)+1000}).finish('finish_u_WASTE');
  await create({storeId:'gg01',fstore:f.fstore,now:()=>Date.parse(end)+46*86400000}).learnDay({force:true});
  const k=caseOf(f,'finish_u_WASTE');assert.deepStrictEqual([k.status,k.basis],['decided','policy_equal_share']);
  console.log('ok Chờ quá hạn → lượt học hằng ngày kết luận hao hụt');}
 // 4b) Mã cùng phiếu đã được CÂN giữa chừng (hụt ghi ở lượt cân) → lúc báo hết dư ít, nhưng tổng hụt suốt đời vẫn ~50% → nghi sai quy cách.
 {const f=base(sib);let t=Date.parse(end)+1000;const s=create({storeId:'gg01',fstore:f.fstore,now:()=>t});
  await s.finish('finish_u_WASTE');finishSibling(f,30);
  f.FS[ROOT+'/cases/m_u2']={originKind:'measurement',containerId:'u2',status:'decided',quantity:950,itemId:'pearl'};
  t=Date.parse('2026-10-23T03:00:01Z');await s.finish('finish_u2_WASTE');
  assert.strictEqual(caseOf(f,'finish_u_WASTE').basis,'spec_mismatch','tổng hụt suốt đời (950 + 30) ≈ mã này → nghi sai quy cách');
  console.log('ok So TỔNG hụt suốt đời mã (lượt cân + báo hết), không chỉ phần dư lúc báo hết');}
 // 5) Mã thuộc «phiếu» giả (vd RESET_TON_KHO — không có phiếu nhận thật) → hao hụt dù có mã cùng mã phiếu.
 {const f=base({'stock_containers_gieogieo/u2':{...sib['stock_containers_gieogieo/u2']}});await create({storeId:'gg01',fstore:f.fstore,now:()=>Date.parse(end)+1000}).finish('finish_u_WASTE');
  const k=caseOf(f,'finish_u_WASTE');assert.deepStrictEqual([k.status,k.basis],['decided','policy_equal_share'],'không có phiếu nhận thật (reset tồn) → hao hụt');
  console.log('ok Phiếu giả (reset tồn kho, không có phiếu nhận thật) → hao hụt, không ghép lô');}
 // 6) Đã nghi sai quy cách → pha chế đối chiếu nhãn bao: nhãn = khai báo → bác bỏ, chuyển thành hao hụt; nhãn khác → giữ nghi sai quy cách.
 for(const [label,expect] of [[2000,'policy_equal_share'],[1000,'spec_mismatch']]){
  const f=base(sib);let t=Date.parse(end)+1000;const s=create({storeId:'gg01',fstore:f.fstore,now:()=>t});
  await s.finish('finish_u_WASTE');finishSibling(f,980);t=Date.parse('2026-10-23T03:00:01Z');await s.finish('finish_u2_WASTE');
  await s.submitEvidence(E.key('spec_confirm','R1','pearl'),{labelQty:label},{id:'c'});
  assert.strictEqual(caseOf(f,'finish_u_WASTE').basis,expect);assert.strictEqual(caseOf(f,'finish_u2_WASTE').basis,expect);
 }
 console.log('ok Nhãn bao = khai báo → bác bỏ sai quy cách, chuyển hao hụt; nhãn khác → giữ nghi sai quy cách (quản lý sửa danh mục)');
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exit(1)});
