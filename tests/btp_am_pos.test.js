'use strict';
// BTP âm trên POS (chủ quán 23/10, docs/KE_HOACH_BTP_AM.md):
//   A. KHÔNG hỏi lúc thanh toán (khách đang chờ). Mở ca: lô BTP / mã NL hết hạn trong hôm nay → kiểm ngay (còn dùng được =
//      gia hạn 24 giờ tính từ hạn cũ + tem; bỏ đi); loại hết hạn cuối ngày: chỉ lô ngày cũ, chỉ «Bỏ đi». Trong ngày: chuông
//      (≤ 30 phút, dữ liệu trong máy). Check-out: lô đã quá hạn còn mở.
//   B. Bán BTP lúc không còn lô → người có ca phải trả lời khi check-out; kết ca dùng lại câu trả lời.
const assert=require('node:assert'),fs=require('node:fs'),path=require('node:path');
const {extract}=require('./lib/extract');
const round2=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
const F=new Function('round2','const PREP_EXTEND_HOURS=24;'+extract('posgieo.html',['prepLotExpired','expiryCheckLines','expiryExtendTo','prepUntrackedSales','prepShortagePrefillFromCheckout'])+'\nreturn {prepLotExpired,expiryCheckLines,expiryExtendTo,prepUntrackedSales,prepShortagePrefillFromCheckout};')(round2);
const NOW=Date.parse('2026-10-24T08:00:00.000Z'),TODAY='2026-10-24';

// Hết hạn
assert.equal(F.prepLotExpired({shelfLifeType:'hours',expiresAt:'2026-10-24T07:00:00.000Z'},NOW,TODAY),true);
assert.equal(F.prepLotExpired({shelfLifeType:'hours',expiresAt:'2026-10-24T09:00:00.000Z'},NOW,TODAY),false);
assert.equal(F.prepLotExpired({shelfLifeType:'none'},NOW,TODAY),false);
assert.equal(F.prepLotExpired({shelfLifeType:'endOfDay',businessDate:TODAY},NOW,TODAY),false,'cuối ngày: trong ngày còn hạn');
assert.equal(F.prepLotExpired({shelfLifeType:'endOfDay',businessDate:'2026-10-23'},NOW,TODAY),true,'cuối ngày: lô ngày cũ đã hết hạn');
// Danh sách kiểm hạn (giờ VN): tới hết hôm nay; lô hôm nay loại cuối ngày không hỏi; lô ngày cũ cuối ngày chỉ «Bỏ đi».
const iso=ms=>new Date(ms).toISOString();
const B=[{id:'a',status:'active',shelfLifeType:'hours',qtyRemaining:100,expiresAt:'2026-10-24T09:00:00.000Z',prepName:'Thạch Cafe'},   // 16:00 VN hôm nay
 {id:'b',status:'active',shelfLifeType:'hours',qtyRemaining:100,expiresAt:'2026-10-24T18:00:00.000Z'},   // 01:00 VN ngày mai → không
 {id:'c',status:'active',shelfLifeType:'hours',qtyRemaining:100,expiresAt:'2026-10-24T07:00:00.000Z'},   // đã quá hạn
 {id:'d',status:'active',shelfLifeType:'endOfDay',qtyRemaining:300,businessDate:TODAY},
 {id:'e',status:'active',shelfLifeType:'endOfDay',qtyRemaining:300,businessDate:'2026-10-23'},
 {id:'f',status:'active',shelfLifeType:'hours',qtyRemaining:0,expiresAt:'2026-10-24T07:00:00.000Z'},
 {id:'g',status:'used_up',shelfLifeType:'hours',qtyRemaining:50,expiresAt:'2026-10-24T07:00:00.000Z'},
 {id:'h',status:'active',shelfLifeType:'none',qtyRemaining:50}];
const C=[{id:'n1',status:'open',itemName:'Sữa',code:'SU01',unitBase:400,expiresAt:'2026-10-24T12:00:00.000Z'},{id:'n2',status:'open',expiresAt:'2026-10-25T12:00:00.000Z'},{id:'n3',status:'open'},{id:'n4',status:'finished',expiresAt:'2026-10-24T01:00:00.000Z'}];
let L=F.expiryCheckLines(B,C,NOW,TODAY);
assert.deepEqual(L.map(x=>x.id),['e','c','a','n1'],'đầu ca: hết hạn trong hôm nay (VN) + đã quá hạn + lô cuối ngày ngày cũ');
assert.deepEqual(L.map(x=>[x.extendable,x.expired]),[[false,true],[true,true],[true,false],[true,false]]);
assert.deepEqual(F.expiryCheckLines(B,C,NOW,TODAY,{expiredOnly:true}).map(x=>x.id),['e','c'],'check-out: chỉ lô đã quá hạn');
assert.deepEqual(F.expiryCheckLines(B,C,NOW,TODAY,{untilMs:NOW+30*60000}).map(x=>x.id),['e','c'],'chuông 30 phút');
assert.deepEqual(F.expiryCheckLines(B,C,NOW,TODAY,{untilMs:NOW+59*60000}).map(x=>x.id),['e','c'],'16:00 VN (09:00Z) chưa trong 59 phút');
assert.equal(F.expiryExtendTo('2026-10-24T09:00:00.000Z',NOW),iso(Date.parse('2026-10-24T09:00:00.000Z')+24*3600000),'chưa hết hạn: +24 giờ tính từ hạn cũ');
assert.equal(F.expiryExtendTo('2026-10-24T07:00:00.000Z',NOW),iso(NOW+24*3600000),'đã quá hạn: +24 giờ từ bây giờ');
console.log('ok A: kiểm hạn đầu ca (tới hết hôm nay giờ VN), check-out (đã quá hạn), chuông 30 phút; gia hạn +24 giờ');

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
const onCk=html.slice(html.indexOf('async function onCheckoutClick'),html.indexOf('async function onCheckoutClick')+3000);
assert(!/prepExpiry|expiryCheck|expiryAsk/.test(onCk),'thanh toán KHÔNG hỏi hạn dùng (khách đang chờ)');
assert.match(html,/if \(await expiryAskOnCheckOut\(\)\) return;/,'check-out: lô đã quá hạn');
assert.match(html,/expLines = await loadExpiryCheckLinesPOS\(\); if \(!expLines\.length\) await expiryOpenDone\(\)/,'Việc đầu ca: kiểm hạn một lần mỗi ngày');
assert.match(html,/\|\| expLines\.length > 0;/,'cổng đầu ca chặn tới khi kiểm hạn xong');
assert.match(html,/doc\(posDateKey\(\)\)\.update\(\{ expiryCheckedAt/,'dấu đã kiểm: update, không tự tạo bản ghi mở ca');
assert.match(html,/const exp = typeof expirySoonLines === 'function' \? expirySoonLines\(\) : \[\];/,'chuông: lô sắp hết hạn');
assert.match(html,/if \(await prepUntrackedAskOnCheckOut\(emp, openShift\)\) return;/,'cổng câu hỏi ở check-out');
assert.match(html,/if \(b\.shelfLifeType === 'endOfDay'\) throw new Error\('Loại hết hạn cuối ngày không được gia hạn'\)/);
assert.match(html,/UnitEngine\.batches\.annotate\(b\.id, \{ expiresAt: to, expiryExtensions: firebase\.firestore\.FieldValue\.arrayUnion\(ext\) \}\)/,'gia hạn BTP qua kho v21');
assert.match(html,/UnitEngine\.containers\.annotate\(c\.id, \{ expiresAt: to, expiryExtensions: firebase\.firestore\.FieldValue\.arrayUnion\(ext\) \}\)/,'gia hạn NL qua kho v21');
assert.match(html,/GIA HẠN lần \$\{b\.expiryExtensions\.length\}/,'tem lô ghi lần gia hạn');
assert.match(html,/doc\(id\)\.set\(\{\s*\.\.\.restClean[\s\S]*?\}, \{ merge: true \}\)/,'phiếu đối chiếu giữ câu trả lời lúc check-out');
const ue=fs.readFileSync(path.join(__dirname,'../unit_engine.v21.js'),'utf8');
assert.match(ue,/batches: \['expiresAt', 'needsReview', 'reviewedAt', 'reviewedBy', 'note', 'expiryExtensions'\]/);
assert.match(ue,/containers: \[[^\]]*'expiresAt', 'expiryExtensions'\]/);
console.log('ok Nối luồng: thanh toán, check-out, kết ca, tem gia hạn, kho v21');
console.log('ALL PASS');
