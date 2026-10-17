// Cảnh báo cũ ngoài cửa sổ 40 bản và đồng bộ sau Đã xem/Đã xử lý.
const assert=require('assert/strict'),vm=require('vm');
const {extract}=require('./lib/extract');
const code=extract('quanlygieo.html',['alertUiScope','alertUiState','alertApplyChanges','loadNewAlerts','storeHealthAlertRows','storeHealthWithCurrentAlerts','loadAlerts','markAlertStatus']);
let count=0;const check=(v,label)=>{assert.ok(v,label);console.log('ok '+label);count++};
function setup(){
 let scope='gg01',reads=0,writes=0,fail=false,hold=false,release;
 const db={gg01:{},gg02:{}};
 for(let i=0;i<15;i++)db.gg01['old'+i]={id:'khong-phai-doc-id',status:'new',type:'prep_count_variance',createdAt:'2026-09-'+String(i+1).padStart(2,'0')+'T08:00:00Z'};
 for(let i=0;i<40;i++)db.gg01['recent'+i]={status:'resolved',type:'prep_count_variance',createdAt:'2026-10-17T08:'+String(i).padStart(2,'0')+':00Z'};
 db.gg02.other={status:'new',type:'prep_count_variance',createdAt:'2026-10-17T09:00:00Z'};
 function query(store,filters=[],order=false,limit=Infinity){return{
  where:(f,op,v)=>query(store,[...filters,[f,v]],order,limit),
  orderBy:()=>query(store,filters,true,limit),limit:n=>query(store,filters,order,n),
  get(){reads++;let docs=Object.entries(db[store]).filter(([id,d])=>filters.every(([f,v])=>d[f]===v));
   if(order)docs.sort((a,b)=>b[1].createdAt.localeCompare(a[1].createdAt));
   docs=docs.slice(0,limit).map(([id,d])=>{const copy=structuredClone(d);return{id,data:()=>copy}});
   const snap={docs};if(hold&&filters.length){hold=false;return new Promise(r=>release=()=>r(snap))}return Promise.resolve(snap);
  },
  doc:id=>({async update(fields){if(fail)throw Error('write failed');writes++;Object.assign(db[store][id],fields)}})
 }}
 const ctx=vm.createContext({_alertUiStates:new Map(),QL_VIEW:'gg01',window:{GieoData:true},GieoData:{storeId:()=>scope},fstore:{collection:()=>query(scope)},console:{error(){}},toast(){},showError(){},paintStoreHealth(list){ctx.painted=list},renderAlertInbox(list){ctx.inbox=list}});
 vm.runInContext(code,ctx);
 return{ctx,db,get reads(){return reads},get writes(){return writes},set fail(v){fail=v},hold(){hold=true},release(){release()},scope(v){scope=v}};
}
(async()=>{
 const env=setup(),c=env.ctx;
 const inbox=await c.loadAlerts();
 check(inbox.filter(a=>a.status==='new').length===15,'15 cảnh báo cũ vẫn xuất hiện dù 40 bản mới nhất đã xử lý');
 check(inbox.length===55,'giữ cả toàn bộ chưa xem và cửa sổ 40 lịch sử');
 check(inbox.every(a=>a.id!=='khong-phai-doc-id'),'mã tài liệu thật luôn ưu tiên trường id trong nội dung');
 check(new Set(inbox.map(a=>a.id)).size===55,'gộp danh sách không nhân đôi cảnh báo');
 const state=c.alertUiState();state.health=[...c.storeHealthAlertRows(state.unread),{tier:'red',label:'Tồn kho âm',count:2}];
 const before=env.reads;
 await c.markAlertStatus('old0','seen');
 check(env.db.gg01.old0.status==='seen','Đã xem lưu đúng tài liệu');
 check(state.unread.length===14&&state.inbox.find(a=>a.id==='old0').status==='seen','đồng bộ mục chưa xem và lịch sử tại máy');
 check(c.painted.find(a=>a.fromAlerts).count===14,'số lệch BTP giảm ngay sau khi đã xem');
 await c.markAlertStatus('old1','resolved');
 check(env.db.gg01.old1.status==='resolved'&&c.painted.find(a=>a.fromAlerts).count===13,'Đã xử lý cũng giảm ngay số cảnh báo');
 check(env.reads===before&&env.writes===2,'hai thao tác chỉ ghi hai tài liệu, không đọc lại Firebase');
 for(let i=2;i<15;i++)await c.markAlertStatus('old'+i,'seen');
 check(!c.painted.some(a=>a.fromAlerts),'hết cảnh báo BTP thì bỏ hẳn nhóm đó');
 check(c.painted.some(a=>a.label==='Tồn kho âm'&&a.count===2),'giữ nguyên cảnh báo không liên quan');
 c._alertUiStates.clear();await c.loadAlerts();
 check(c.alertUiState().unread.length===0,'tải lại từ dữ liệu đã lưu không hồi sinh mục đã xem/xử lý');
 const e2=setup(),c2=e2.ctx;await c2.loadAlerts();e2.fail=true;
 await c2.markAlertStatus('old0','seen');
 check(c2.alertUiState().unread.length===15&&e2.db.gg01.old0.status==='new','ghi lỗi không làm mất cảnh báo trên UI');
 e2.fail=false;e2.hold();const pending=c2.loadNewAlerts();
 await c2.markAlertStatus('old0','seen');await c2.markAlertStatus('old1','resolved');e2.release();await pending;
 check(c2.alertUiState().unread.length===13,'lượt nạp cũ trả sau thao tác không hồi sinh cảnh báo');
 e2.hold();const prior=e2.reads,a=c2.loadNewAlerts(),b=c2.loadNewAlerts();e2.release();await Promise.all([a,b]);
 check(e2.reads===prior+1,'hai lượt nạp đồng thời dùng chung một truy vấn');
 e2.scope('gg02');await c2.loadAlerts();await c2.markAlertStatus('other','seen');
 check(c2.alertUiState('gg01').unread.length===13&&e2.db.gg01.old2.status==='new','xử lý quán khác không thay cảnh báo quán trước');
 check(e2.db.gg02.other.status==='seen'&&c2.alertUiState('gg02').unread.length===0,'trạng thái theo đúng quán');
 e2.scope('gg01');e2.db.gg01.old0.status='new';await c2.loadNewAlerts();
 check(c2.alertUiState().unread.some(a=>a.id==='old0'),'lượt nạp mới vẫn nhận sự kiện mới hợp lệ từ máy chủ');
 console.log('ALL PASS '+count);
})().catch(e=>{console.error(e);process.exitCode=1});
