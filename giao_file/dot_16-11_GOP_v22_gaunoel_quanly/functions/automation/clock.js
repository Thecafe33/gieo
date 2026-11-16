'use strict';
/* [v5 11/11/2026 — docs/KE_HOACH_TOI_UU_ENGINE2_11-11.md, «cổng tín hiệu»] Nhịp đồng hồ 15 phút chỉ còn là NGƯỜI GÁC CỔNG.
 * Trước: mỗi nhịp, MỖI quán đều chạy đủ ba phần (Engine 2, hàng đợi, worker tự động hoá) dù không có việc: ~11 lượt đọc + 4 lần ghi.
 * Nay: mỗi nhịp đọc MỘT tài liệu «bảng tín hiệu chuỗi» cho mọi quán; chỉ quán CÓ TÍN HIỆU mới chạy ba phần đó (mã ba phần giữ nguyên):
 *   - poke     : trigger vừa xếp việc tự động hoá / một việc vừa lỗi và được hẹn thử lại (ghi mù, không đọc trước);
 *   - nextDue  : tới giờ hẹn sớm nhất đã ghi ở lần kiểm trước (việc thử lại, hồ sơ tới nextCheckAt);
 *   - learn    : sang ngày mới (lượt học + bốn lượt quét — một lần / ngày, mốc BỀN ở bảng tín hiệu → khởi động lạnh không quét lại);
 *   - bad      : lần kiểm trước có phần lỗi → kiểm lại mỗi nhịp như cũ cho tới khi sạch;
 *   - safety   : lưới an toàn — dù không có tín hiệu nào vẫn kiểm đủ mỗi 6 giờ.
 * Quán không có tín hiệu: chỉ ghi dấu «còn sống» (ghi mù) — mỗi nhịp khi quán đang có người trong ca, 30 phút / lần khi quán đóng
 * (POS / quanlygieo2 đòi dấu Engine 2 < 45 phút, dấu tự động hoá < 60 phút — giữ nguyên ngưỡng ở phía đọc). */
const A=require('./shared/gieo_automation.v3');
const FLEET='duty_digests_gieogieo/_fleet';
const TICK=15*60000,SAFETY=6*3600000,OPEN_FOR=18*3600000,LEARN_RETRY=3600000;
const vnDay=ms=>new Date(ms+7*3600000).toISOString().slice(0,10);
function createFleet(db,{now=Date.now,path=FLEET}={}){
 const ref=()=>db.doc(path);
 async function read(){const s=await ref().get();return s.exists?(s.data().stores||{}):{};}
 const patch=(store,fields)=>ref().set({v:1,stores:{[store]:fields}},{merge:true});
 // Ghi mù, không đọc trước; lỗi ghi không được làm hỏng việc chính (lưới an toàn 6 giờ + nhịp «bad» lo phần sót).
 const poke=store=>patch(store,{poke:now()}).catch(e=>{console.error('Gieo fleet poke',store,e&&e.message);});
 return {read,patch,poke,path};
}
// Lý do quán phải được kiểm đủ ở nhịp này ('' = không có tín hiệu).
function reason(st,now){
 st=st||{};
 if(!st.checkedAt)return 'first';
 if(st.ok===false)return 'bad';
 if((st.poke||0)>st.checkedAt)return 'poke';
 if(st.nextDue>0&&st.nextDue<=now)return 'due';
 if(st.learnDay!==vnDay(now)&&now>=(st.learnTryAt||0))return 'learn';
 if(now-st.checkedAt>=SAFETY)return 'safety';
 return '';
}
function createClock({db,stores,engine2,queue,worker,rootPath,now=Date.now,fleet=createFleet(db,{now}),log=console.error}){
 async function run(){
  const all=await fleet.read(),out={};
  for(const store of stores){
   const st=all[store]||{},t=now(),why=reason(st,t);
   if(!why){
    // Không có tín hiệu: không vào quán. Chỉ giữ dấu «còn sống» — mỗi nhịp khi có người trong ca, 30 phút / lần khi đóng.
    const open=Number(st.openUntil)>t,beat=open||Math.floor(t/TICK)%2===0;
    // Dấu Engine 2 (ngưỡng đọc 45 phút): mỗi nhịp khi mở. Dấu tự động hoá (ngưỡng đọc 60 phút): 30 phút / lần là đủ, kể cả khi mở.
    if(beat)await engine2.beat(store).catch(e=>log('Gieo clock beat e2',store,e.message));
    if(st.autoOn&&Math.floor(t/TICK)%2===0)await worker.beat(store).catch(e=>log('Gieo clock beat auto',store,e.message));
    out[store]={ran:false,beat};continue;
   }
   const wantLearn=st.learnDay!==vnDay(t)&&t>=(st.learnTryAt||0);let ok=true,learned=false;
   // Mỗi phần một khối lỗi riêng (như bản trước): Engine 2 lỗi không làm bỏ nhịp của hàng đợi / worker tự động hoá và ngược lại.
   for(const [name,part] of [['engine2',async()=>{const r=await engine2.tick(store,{learn:wantLearn});learned=!!(r&&r.learned);}],['queue',()=>queue.retryDue(store)],['worker',()=>worker.tickStore(store)]])try{await part();}catch(e){
    ok=false;await db.doc(rootPath(store)).set({lastError:String(e.message||e),errorAt:new Date(now()).toISOString(),errorPart:name},{merge:true}).catch(()=>{});log('Gieo automation',store,name,e);
   }
   // Giờ hẹn sớm nhất còn lại của quán (ba truy vấn giới hạn 1). Không đọc được → coi như nhịp sau phải kiểm lại.
   let next=0,autoOn=false;
   try{const a=await worker.due(store);autoOn=a.enabled;const list=[await engine2.nextDue(store),await queue.nextDue(store),a.nextDue].filter(x=>x>0);next=list.length?Math.max(Math.min(...list),t+1):0;}catch(e){ok=false;log('Gieo clock nextDue',store,e.message);}
   const patch={checkedAt:t,nextDue:next,ok,autoOn,why};
   // Lần đầu sau deploy chưa có tín hiệu vào ca của hôm nay → coi quán đang mở (dấu còn sống mỗi nhịp) cho tới khi có tín hiệu ra ca / hết 18 giờ.
   if(why==='first'&&!(Number(st.openUntil)>0))patch.openUntil=t+OPEN_FOR;
   if(wantLearn){if(learned)Object.assign(patch,{learnDay:vnDay(t),learnTryAt:0});else patch.learnTryAt=t+LEARN_RETRY;}
   await fleet.patch(store,patch).catch(e=>log('Gieo fleet patch',store,e.message));
   out[store]={ran:true,why,ok,next};
  }
  return out;
 }
 // Tín hiệu vào / ra ca (trigger employee_shifts): vào ca → quán «đang mở» + ghi dấu còn sống NGAY (người mở ca không gặp dấu cũ);
 // ra ca → nếu ngày đó không còn ai trong ca thì quán «đóng». openUntil có trần 18 giờ phòng ca quên ra.
 async function shiftSignal(store,before,after){
  const openNow=d=>!!(d&&d.checkedInAt&&!d.checkedOutAt);
  if(openNow(after)&&!openNow(before)){await fleet.patch(store,{openUntil:now()+OPEN_FOR});await engine2.beat(store).catch(()=>{});return 'open';}
  if(after&&after.checkedOutAt&&!(before&&before.checkedOutAt)&&after.businessDate){
   const s=await db.collection(A.collection('employee_shifts',store)).where('businessDate','==',after.businessDate).limit(50).get();
   if(!s.docs.some(d=>openNow(d.data()))){await fleet.patch(store,{openUntil:0});return 'closed';}
  }
  return '';
 }
 return {run,shiftSignal,fleet,reason};
}
module.exports={createClock,createFleet,reason,FLEET,TICK,SAFETY};
