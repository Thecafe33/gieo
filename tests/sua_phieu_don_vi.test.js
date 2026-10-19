// QR -> đơn vị kiểm kê trên mã; không QR -> đơn vị thực nhập trên phiếu.
'use strict';
const assert=require('assert/strict');
const {extract}=require('./lib/extract');
const names=['itemCountUnit','fixRecHeSo','fixRecDonViNhan','fixRecLichSuSua','fixRecWizDongs',
  'fixRecWizTinh','fixRecWizB1','fixRecWizB2','fixRecWizB3','fixRecWizSetUnit','fixRecWizRenderTomTat'];
const source=extract('quanlygieo.html',names);
function make({unit='ml',countName='Chai',size=340,mode='unit',inputName,inputFactor,tags=true,qty=3,catalogSize=size}={}){
  const item={id:'i',name:'NL thử',unit,trackingMode:mode,countUnitName:mode==='none'?'Thùng':countName,
    packagingUnits:[{name:countName,baseQty:catalogSize},{name:'Thùng',baseQty:catalogSize*6}],currentStock:qty*size};
  const line={itemId:'i',name:item.name,unit,qtyGoodBase:qty*size,
    ...(inputName?{receiveUnitName:inputName,receiveUnitFactor:inputFactor}: {})};
  const tem=tags?Array.from({length:qty},(_,i)=>({id:'t'+i,itemId:'i',code:'CODE'+i,trackingMode:mode,
    countUnitName:countName,baseQty:size,status:'sealed',labelPrinted:false})):[];
  const w={rec:{lines:[line],poId:'po',corrections:[]},lineIdx:0,tem,soDung:'2',lyDo:'Sửa số lượng'};
  const body={innerHTML:''},summary={innerHTML:''};
  const env={INVENTORY_ITEMS:[item],FIXREC_WIZ:w,
    document:{getElementById:id=>id==='fixrecTomTat'?summary:body},
    fmtNum:(n,d=1)=>Number(n||0).toLocaleString('vi-VN',{maximumFractionDigits:d}),
    escapeHtmlAttr:s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),ic:()=>''};
  const keys=Object.keys(env);
  const api=new Function(...keys,source+'\nreturn {'+names.join(',')+'};')(...keys.map(k=>env[k]));
  return {api,w,body,summary,line,item,tem};
}
{
  const h=make({unit:'g',countName:'Bịch',size:2000,qty:6,inputName:'Thùng',inputFactor:12000});
  h.item.countUnitName='Thùng';
  h.api.fixRecWizB1(h.body); assert.match(h.body.innerHTML,/Đã ghi nhận <b>6 Bịch<\/b>/);
  h.w.rec.corrections=[{itemId:'i',fromBase:72000,toBase:12000,reason:'Nhầm'}];
  h.api.fixRecWizB1(h.body); assert.match(h.body.innerHTML,/<b>36 → 6 Bịch<\/b>/);
  const c=h.api.fixRecWizTinh(); assert.equal(c.factor,2000); assert.equal(c.donVi,'Bịch');
  console.log('ok QR dùng Bịch trên mã, không lấy Thùng từ phiếu/danh mục; lịch sử 36 -> 6 Bịch');
}
{
  const h=make(); h.api.fixRecWizB1(h.body); assert.match(h.body.innerHTML,/<b>3 Chai<\/b>/);
  h.api.fixRecWizB2(h.body); assert.match(h.body.innerHTML,/Số Chai thực nhận đúng/);
  assert.match(h.body.innerHTML,/3 Chai = 1.020 ml/);
  const c=h.api.fixRecWizTinh(); assert.equal(c.baseDung,680); assert.equal(c.huy.length,1);
  assert.match(h.summary.innerHTML,/trừ <b>1 Chai/);
  h.api.fixRecWizB3(h.body); assert.match(h.body.innerHTML,/3 Chai → <b>2 Chai<\/b>/);
  console.log('ok QR 340ml/Chai: xem 3 Chai, nhập 2, tự quy đổi 680ml và huỷ đúng 1 mã');
}
{
  const h=make({mode:'none',tags:false,inputName:'Chai',inputFactor:340});
  const c=h.api.fixRecWizTinh(); assert.equal(c.donVi,'Chai');assert.equal(c.factor,340);assert.equal(c.baseDung,680);
  h.api.fixRecWizB1(h.body); assert.match(h.body.innerHTML,/<b>3 Chai<\/b>/);
  console.log('ok không QR dùng đúng 3 Chai đã nhập, không lấy đơn vị kiểm kê Thùng trong danh mục');
}
{
  const h=make({mode:'none',tags:false,qty:6,inputName:'Thùng',inputFactor:2040});
  assert.equal(h.api.fixRecWizTinh().donVi,'Thùng');
  h.api.fixRecWizB1(h.body); assert.match(h.body.innerHTML,/<b>1 Thùng<\/b>/);
  console.log('ok cùng nguyên liệu không QR, phiếu nhập bằng Thùng thì hiển thị Thùng');
}
{
  const h=make({mode:'none',tags:false});
  assert.equal(h.api.fixRecWizTinh().needsUnit,true); assert.equal(h.api.fixRecWizTinh().hopLe,false);
  h.api.fixRecWizB2(h.body); assert.match(h.body.innerHTML,/Phiếu cũ chưa lưu đơn vị nhập/);
  assert.match(h.body.innerHTML,/id="fixrecQty" disabled/);
  h.api.fixRecWizSetUnit(340,'Chai'); h.w.soDung='2';
  assert.equal(h.api.fixRecWizTinh().factor,340);assert.equal(h.api.fixRecWizTinh().baseDung,680);
  console.log('ok phiếu cũ không lưu đơn vị: không đoán từ danh mục, chọn Chai một lần rồi nhập số chai');
}
{
  const h=make({catalogSize:375});
  assert.equal(h.api.fixRecWizTinh().factor,340);
  console.log('ok tem cũ 340ml giữ đúng quy cách của mã dù danh mục đã đổi 375ml');
}
for(const [unit,size]of [['cái',1],['l',0.34]]){
  const h=make({unit,size});const c=h.api.fixRecWizTinh();
  assert.equal(c.donVi,'Chai');assert.equal(c.factor,size);assert.equal(c.baseDung,2*size);
  console.log('ok QR hệ số '+size+' '+unit+': vẫn nhập theo số Chai kiểm kê');
}
{
  const h=make();h.w.soDung='1.5';assert.equal(h.api.fixRecWizTinh().hopLe,false);
  const n=make({mode:'none',tags:false,inputName:'Chai',inputFactor:340});n.w.soDung='1.5';
  assert.equal(n.api.fixRecWizTinh().hopLe,true);assert.equal(n.api.fixRecWizTinh().baseDung,510);
  console.log('ok QR sửa theo số mã nguyên; không QR vẫn cho số lẻ theo đơn vị đã nhập');
}
console.log('ALL PASS');
