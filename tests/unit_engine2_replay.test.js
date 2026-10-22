'use strict';
// Lộ trình Engine 2 — B2 đường 2: chạy lại chính sách mới trên «Bản kiểm toán kho» (tools/automation/engine2_replay.js).
const assert=require('node:assert');
const X=require('../unit_engine2_export_v1');
const {replay,report}=require('../tools/automation/engine2_replay');
const {cleanState,ROOT}=require('./lib/engine2_fixture');

(async()=>{
 {
  // 1) Chạy lại trùng với quyết định runtime đã ghi (cùng lõi, cùng dữ liệu).
  const f=await cleanState();
  const dump=await X.build({storeId:'gg01',from:'2026-10-14',to:'2026-10-22',coll:k=>f.fstore.collection(X.physName(k,'gg01')),rtRef:n=>f.db.ref(n+'_gieogieo')});
  const r=await replay(dump);
  assert.equal(r.stats.finishLines,1,'chỉ dòng báo hết; WASTE của lượt cân (tem còn mở) không tính');
  const d=r.decisions[0],live=Object.entries(f.FS).find(([p,v])=>p.startsWith(ROOT+'/cases/')&&v.originKind==='finish')[1];
  assert.deepEqual(d.allocations.map(a=>[a.employeeId,a.qty,a.value]),live.allocations.map(a=>[a.employeeId,a.qty,a.value]));
  assert.equal(d.quantity,live.quantity);assert.equal(d.amount,live.amount);assert.deepEqual(d.interval,live.interval);
  assert.equal(r.audit.ok,true);assert.equal(r.audit.violations+r.audit.warnings,0);
  console.log('ok Chạy lại trùng quyết định runtime (75 g × 4, 7.500đ/người); bộ kiểm toán ĐẠT');
 }
 {
  // 2) Dữ liệu kiểu engine cũ: mã ngẫu nhiên + ghi chú «Báo hết», ca không ghi chức năng, mốc cân ca cũ, giá chỉ có sau ngày.
  const T=(d,h)=>`2026-09-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:00:00.000Z`;
  const docs={
   'stock_containers_gieogieo/L':{itemId:'pearl',itemName:'Trân châu',unit:'g',baseQty:1000,status:'finished',openedAt:T(2,2),finishedAt:T(6,10),wasteBase:120,code:'ABCD1234',
     lastShiftWeigh:{op:'sw_old',weighed:500,at:T(3,13)}},
   'stock_containers_gieogieo/M':{itemId:'pearl',itemName:'Trân châu',unit:'g',baseQty:1000,status:'finished',openedAt:T(7,2),finishedAt:T(8,10),wasteBase:50,code:'MMMM0000'},
   'stock_containers_gieogieo/N':{itemId:'pearl',itemName:'Trân châu',unit:'g',baseQty:1000,status:'finished',openedAt:T(9,2),finishedAt:T(9,10),wasteBase:30,code:'NNNN0000'},
   'stock_transactions_gieogieo/rand1':{type:'WASTE',qty:-120,itemId:'pearl',referenceId:'L',note:'Báo hết ABCD1234 — còn thừa 120 g (đã quét mã)',createdAt:T(6,10),businessDate:'2026-09-06'},
   'stock_transactions_gieogieo/sw_2026-09-04_x_op_L':{type:'ADJUSTMENT',qty:10,itemId:'pearl',containerId:'L',weighedQty:400,measured:true,shiftWeighOp:'sw_new',createdAt:T(4,13),businessDate:'2026-09-04'},
   'stock_transactions_gieogieo/rand2':{type:'WASTE',qty:-50,itemId:'pearl',referenceId:'M',note:'Báo hết MMMM0000',createdAt:T(8,10),businessDate:'2026-09-08',responsibility:{status:'assigned_by_manager',employeeId:'b',employeeName:'B',reason:'Hao'}},
   'stock_transactions_gieogieo/rand3':{type:'WASTE',qty:-25,itemId:'pearl',referenceId:'N',note:'Báo hết NNNN0000',createdAt:T(9,10),businessDate:'2026-09-09'},
   'stock_containers_gieogieo/Q':{itemId:'pearl',itemName:'Trân châu',unit:'g',baseQty:1000,status:'finished',openedAt:T(10,2),finishedAt:T(10,9),wasteBase:170,wasteBasis:'scanned_discard',code:'QQQQ0000'},
   'stock_transactions_gieogieo/waste_unit_Q':{type:'WASTE',qty:-170,itemId:'pearl',containerId:'Q',note:'Huỷ tem hỏng',createdAt:T(10,9),businessDate:'2026-09-10'},
   'stock_transactions_gieogieo/prep_variance_x':{type:'WASTE',qty:-7,itemId:'pearl',businessDate:'2026-09-05',createdAt:T(5,1)},
   'employee_shifts_gieogieo/s1':{employeeId:'a',employeeName:'A',checkedInAt:T(5,2),checkedOutAt:T(5,12)},
   'employee_shifts_gieogieo/s2':{employeeId:'b',employeeName:'B',roles:[],checkedInAt:T(6,2),checkedOutAt:T(6,12)},
   'employee_shifts_gieogieo/s3':{employeeId:'o',employeeName:'Order',roles:['order'],checkedInAt:T(6,2),checkedOutAt:T(6,12)},
   'employee_shifts_gieogieo/s4':{employeeId:'early',employeeName:'Sớm',checkedInAt:T(3,2),checkedOutAt:T(3,12)},
   'employee_shifts_gieogieo/s5':{employeeId:'a',employeeName:'A',checkedInAt:T(7,2),checkedOutAt:T(8,12)},
   'inventory_items_gieogieo/pearl':{name:'Trân châu',unit:'g',costPerUnit:30},
   'price_history_gieogieo/p1':{itemId:'pearl',effectiveFrom:'2026-09-20',price:25,oldPrice:20}
  };
  const r=await replay({manifest:{store:'gg01',range:{from:'2026-09-01',to:'2026-09-30'},sha256:'x'},docs});
  assert.equal(r.stats.finishLines,2,'rand1 + rand2; rand3 lệch wasteBase, prep_variance / huỷ tem quét mã (trùng giờ đóng tem) không phải báo hết');
  assert.equal(r.stats.byNote,2);
  const d1=r.decisions.find(d=>d.sourceId==='rand1');
  assert.equal(d1.interval.from,T(4,13),'đầu khoảng = mốc cân ca mới nhất trước lúc báo hết (sw_ ngày 4, không phải lastShiftWeigh ngày 3)');
  assert.equal(d1.intervalStart,'legacy_shift_weigh');
  assert.deepEqual(d1.allocations.map(a=>[a.employeeId,a.qty,a.roleBasis]),[['a',60,'not_recorded'],['b',60,'not_recorded']],'không ghi / rỗng = pha chế; order và ca trước mốc không chia');
  assert.equal(d1.amount,null);assert.equal(d1.valuation.status,'missing','giá chỉ có sau ngày → chưa đủ giá, không lấy giá hiện tại');
  assert.deepEqual(d1.plReference,{amount:2400,price:20,basis:'first_old_price'},'tham khảo theo cách sổ lãi/lỗ: oldPrice dòng đầu');
  const d2=r.decisions.find(d=>d.sourceId==='rand2');
  assert.equal(d2.basis,'manual_source');assert.equal(d2.allocations.length,0);assert.equal(d2.pending.qty,50);
  assert.equal(r.audit.ok,true,JSON.stringify(r.audit.issues));
  const md=report(r);
  assert.match(md,/Chia đều theo chính sách: \*\*1\*\*/);assert.match(md,/Engine 2 \*\*giữ nguyên, không chia lại\*\*/);assert.match(md,/\*\*3\.400đ\*\* \(khớp tổng giá tạm\)/);assert.match(md,/gán tay: B — «Hao»/);
  console.log('ok Kiểu cũ: nhận diện theo ghi chú, mốc cân ca, ca không ghi chức năng = pha chế, giá tạm chỉ tham khảo, giữ quyết định tay; cộng dọc khớp');
 }
 console.log('ALL PASS');
})().catch(e=>{console.error(e);process.exit(1)});
