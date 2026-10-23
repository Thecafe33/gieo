'use strict';
// BTP âm trên POS (chủ quán 23/10, docs/KE_HOACH_BTP_AM.md):
//   A. Lúc thanh toán, lô BTP sắp trừ (FIFO) đã hết hạn → hỏi: «Vẫn còn dùng được» = gia hạn 24 giờ + tem gia hạn (không giới
//      hạn số lần, loại hết hạn cuối ngày KHÔNG gia hạn) / «Hủy» = ghi đổ bỏ lô, món vẫn bán.
//   B. Bán BTP lúc không còn lô → người có ca phải trả lời khi check-out; kết ca dùng lại câu trả lời.
const assert=require('node:assert'),fs=require('node:fs'),path=require('node:path');
const {extract}=require('./lib/extract');
const round2=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
const F=new Function('round2',extract('posgieo.html',['prepLotExpired','prepExpiryPlan','prepUntrackedSales','prepShortagePrefillFromCheckout'])+'\nreturn {prepLotExpired,prepExpiryPlan,prepUntrackedSales,prepShortagePrefillFromCheckout};')(round2);
const NOW=Date.parse('2026-10-24T08:00:00.000Z'),TODAY='2026-10-24';

// Hết hạn
assert.equal(F.prepLotExpired({shelfLifeType:'hours',expiresAt:'2026-10-24T07:00:00.000Z'},NOW,TODAY),true);
assert.equal(F.prepLotExpired({shelfLifeType:'hours',expiresAt:'2026-10-24T09:00:00.000Z'},NOW,TODAY),false);
assert.equal(F.prepLotExpired({shelfLifeType:'none'},NOW,TODAY),false);
assert.equal(F.prepLotExpired({shelfLifeType:'endOfDay',businessDate:TODAY},NOW,TODAY),false,'cuối ngày: trong ngày còn hạn');
assert.equal(F.prepLotExpired({shelfLifeType:'endOfDay',businessDate:'2026-10-23'},NOW,TODAY),true,'cuối ngày: lô ngày cũ đã hết hạn');
// FIFO: chỉ hỏi lô mà lượt bán THỰC SỰ trừ vào.
const lots={L1:{id:'L1',shelfLifeType:'hours',finishedAt:'2026-10-24T01:00:00.000Z',expiresAt:'2026-10-24T05:00:00.000Z'},
 L2:{id:'L2',shelfLifeType:'hours',finishedAt:'2026-10-24T06:00:00.000Z',expiresAt:'2026-10-24T10:00:00.000Z'},
 E1:{id:'E1',shelfLifeType:'endOfDay',businessDate:'2026-10-23',finishedAt:'2026-10-23T03:00:00.000Z'}};
let p=F.prepExpiryPlan({tc:50},{tc:{L1:{unitBase:100},L2:{unitBase:400},__prepLock:{}}},lots,NOW,TODAY);
assert.deepEqual(p.map(x=>[x.batchId,x.extendable]),[['L1',true]],'lô cũ nhất hết hạn → hỏi');
p=F.prepExpiryPlan({tc:50},{tc:{L1:{unitBase:0},L2:{unitBase:400}}},lots,NOW,TODAY);assert.equal(p.length,0,'lô hết hạn đã hết hàng → không hỏi');
p=F.prepExpiryPlan({tc:50},{tc:{L2:{unitBase:400},L1:{unitBase:100}}},{...lots,L2:{...lots.L2,finishedAt:'2026-10-23T23:00:00.000Z'}},NOW,TODAY);assert.equal(p.length,0,'lô còn hạn trừ trước, đủ lượng → không hỏi');
p=F.prepExpiryPlan({cot:50},{cot:{E1:{unitBase:300}}},lots,NOW,TODAY);assert.equal(p[0].extendable,false,'loại hết hạn cuối ngày → không cho gia hạn');
assert.equal(F.prepExpiryPlan({tc:50},{tc:{X:{unitBase:100}}},{},NOW,TODAY).length,0,'lô chưa có trong bộ nhớ → không đoán (cổng đọc lô trước)');
console.log('ok A: hết hạn theo giờ / cuối ngày; chỉ hỏi lô FIFO sẽ trừ; loại cuối ngày không gia hạn');

// Bán không lô trong ca, bỏ bill đã huỷ, ngoài khoảng ca.
const rows=[{id:'1',type:'CONSUMPTION',qty:-150,createdAt:'2026-10-24T03:00:00.000Z',referenceId:'b1'},
 {id:'2',type:'CONSUMPTION',qty:-150,createdAt:'2026-10-24T04:00:00.000Z',referenceId:'b2'},
 {id:'3',type:'ADJUSTMENT',reversal:true,qty:150,createdAt:'2026-10-24T04:10:00.000Z',referenceId:'b2'},
 {id:'4',type:'CONSUMPTION',qty:-100,createdAt:'2026-10-24T05:00:00.000Z',referenceId:'b3',unitAllocations:[{id:'L'}]},
 {id:'5',type:'CONSUMPTION',qty:-50,createdAt:'2026-10-24T00:30:00.000Z',referenceId:'b0'}];
const u=F.prepUntrackedSales(rows,Date.parse('2026-10-24T01:00:00.000Z'),NOW);
assert.equal(u.qty,150);assert.deepEqual(u.events.map(e=>e.ref),['b1']);
console.log('ok B: chỉ lượt bán không lô trong khoảng ca, bỏ bill đã huỷ / đã trừ lô');

// Kết ca điền sẵn từ câu trả lời lúc check-out.
const row={candidates:[{kind:'prep',id:'cafe'},{kind:'item',id:'dua'}]};
assert.deepEqual([...F.prepShortagePrefillFromCheckout(row,{checkoutAnswers:{s1:{choice:'sub:prep:cafe',employeeName:'A'}}}).answer],['prep:cafe']);
assert.equal(F.prepShortagePrefillFromCheckout(row,{checkoutAnswers:{s1:{choice:'none',employeeName:'A'},s2:{choice:'new_batch',employeeName:'B'}}}).answer,'none');
assert.equal(F.prepShortagePrefillFromCheckout(row,{checkoutAnswers:{s1:{choice:'sub:prep:khac'}}}).answer,'none','chọn loại không còn là ứng viên (không thiếu cuối ca) → coi như không bù');
assert.equal(F.prepShortagePrefillFromCheckout(row,{}),null);
console.log('ok B: kết ca dùng lại câu trả lời lúc check-out');

// Nối luồng.
const html=fs.readFileSync(path.join(__dirname,'../posgieo.html'),'utf8');
assert.match(html,/if \(!_backfillMode && !\(await prepExpiryGateBeforePay\(items\)\)\) return;/,'cổng hết hạn ở onCheckoutClick');
assert.match(html,/if \(await prepUntrackedAskOnCheckOut\(emp, openShift\)\) return;/,'cổng câu hỏi ở check-out');
assert.match(html,/if \(b\.shelfLifeType === 'endOfDay'\) throw new Error\('Loại hết hạn cuối ngày không được gia hạn'\)/);
assert.match(html,/expiryExtensions: firebase\.firestore\.FieldValue\.arrayUnion\(ext\)/,'gia hạn ghi qua UnitEngine.batches.annotate kèm lịch sử');
assert.match(html,/GIA HẠN lần \$\{b\.expiryExtensions\.length\}/,'tem lô ghi lần gia hạn');
assert.match(html,/doc\(id\)\.set\(\{\s*\.\.\.restClean[\s\S]*?\}, \{ merge: true \}\)/,'phiếu đối chiếu giữ câu trả lời lúc check-out');
const ue=fs.readFileSync(path.join(__dirname,'../unit_engine.v21.js'),'utf8');
assert.match(ue,/batches: \['expiresAt', 'needsReview', 'reviewedAt', 'reviewedBy', 'note', 'expiryExtensions'\]/);
console.log('ok Nối luồng: thanh toán, check-out, kết ca, tem gia hạn, kho v21');
console.log('ALL PASS');
