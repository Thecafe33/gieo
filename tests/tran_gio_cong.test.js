const assert=require('assert/strict'),vm=require('vm'),{extract}=require('./lib/extract');
let count=0;
for(const file of ['manage.html','quanlygieo.html']){
 const c={Date,PAY_SCHED_MISSING:new Map(),dkey:d=>new Date(+d+7*3600000).toISOString().slice(0,10)};vm.createContext(c);
 vm.runInContext(extract(file,['shiftWorkedHours','isShiftInProgress','shiftPaidHours','computeWageForDayHours']),c);
 const shift=(date,a,b)=>({employeeId:'e',businessDate:date,checkedInAt:date+'T'+a+':00+07:00',checkedOutAt:b?date+'T'+b+':00+07:00':null});
 const sc={startTime:'09:30',endTime:'20:00'},date='2026-10-01';
 const check=(v,n)=>{assert.ok(v,file+': '+n);count++;console.log('ok '+file+': '+n)};
 let s=shift(date,'09:20','20:15'),raw=JSON.stringify(s);
 check(c.shiftPaidHours(s,sc)===10.5,'đến sớm/về muộn chỉ trả 10.5h');
 check(JSON.stringify(s)===raw,'giữ giờ chấm công gốc');
 check(Math.abs(c.shiftPaidHours(shift(date,'09:40','19:50'),sc)-10-1/6)<1e-8,'đến trễ về sớm còn 10h10');
 check(c.shiftPaidHours(shift(date,'08:00','09:00'),sc)===0,'ngoài lịch hoàn toàn bằng 0');
 check(c.shiftPaidHours(s,{isOff:true})===0,'ngày nghỉ không trả lương theo giờ');
 assert.throws(()=>c.shiftPaidHours(s,null),/Cần bổ sung lịch/);count++;
 assert.throws(()=>c.shiftPaidHours(s,{startTime:'09:30'}),/Cần bổ sung lịch/);count++;
 if(file==='quanlygieo.html'){
  // Tab Lương (lenient): thiếu lịch KHÔNG làm trắng màn — ca đó không cộng giờ (không lấy giờ chấm công thay lịch) + ghi danh sách thiếu lịch.
  check(c.shiftPaidHours(s,null,undefined,{lenient:true})===0,'thiếu lịch (tab Lương): không cộng, không thay bằng giờ thật');
  check(c.PAY_SCHED_MISSING.has('e|'+date),'thiếu lịch được ghi vào danh sách cảnh báo');
  check(c.shiftPaidHours(s,sc)===10.5&&!c.PAY_SCHED_MISSING.has('e|'+date),'bổ sung lịch → bỏ khỏi danh sách');
 }
 check(c.shiftPaidHours(shift('2026-09-30','09:20','20:15'),null)===10+55/60,'trước 1/10 giữ quy tắc cũ');
 const night={businessDate:date,checkedInAt:date+'T21:50:00+07:00',checkedOutAt:'2026-10-02T06:30:00+07:00'};
 check(c.shiftPaidHours(night,{startTime:'22:00',endTime:'06:00'})===8,'ca qua đêm trần 8h');
 const pay=c.computeWageForDayHours({payType:'hourly_part',hourlyRate:20000,otEnabled:true,otThresholdHours:8,otRate:25000},c.shiftPaidHours(s,sc));
 check(pay.amount===222500&&pay.otHours===2.5,'OT 8h x20K +2.5h x25K =222500');
 const today=c.dkey(new Date());
 check(c.shiftPaidHours(shift(today,'09:20',null),sc,Date.parse(today+'T20:30:00+07:00'))===10.5,'ca đang chạy dừng cộng sau giờ lịch');
 check(c.shiftPaidHours(shift(date,'09:20',null),sc)===0,'ca treo ngày cũ không đoán giờ ra');
}
// manage giữ bản chặt (tự bắt pay/schedule-missing); quanlygieo thêm nhánh lenient cho tab Lương — bỏ nhánh đó thì phải giống hệt.
const qlStrict=extract('quanlygieo.html',['shiftPaidHours']).replace('nowMs, opts)','nowMs)')
 .replace(/\n\s*if\(opts && opts\.lenient\)\{[\s\S]*?return 0;\n\s*\}/,'').replace(/\n\s*PAY_SCHED_MISSING\.delete\([^\n]*/,'');
assert.equal(extract('manage.html',['shiftPaidHours']),qlStrict);
const migration=new Function(`const PL_LABOR_VERSION=2;${extract('quanlygieo.html',['plNgayLuongCanTinhLai'])};return plNgayLuongCanTinhLai;`)();
const old={mucTinCay:'chot-thang',laborVersion:1,luong:100,laborCheckedAmount:100};
assert.deepEqual(migration({'2026-09-30':old,'2026-10-01':old,'2026-10-02':{...old,laborVersion:2}},'2026-09-01','2026-10-18',{now:Date.parse('2026-10-19T12:00:00+07:00')}),['2026-10-01']);count++;
console.log('ALL PASS '+count);
