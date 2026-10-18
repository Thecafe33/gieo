// Nhãn đổi 6 tem: chạy hàm POS thật và biểu thức tạo bill; không Firebase.
const assert=require('assert/strict'),vm=require('vm'),acorn=require('acorn'),walk=require('acorn-walk'),{extract}=require('./lib/extract');
let n=0;const check=(v,m)=>{assert.ok(v,m);n++;console.log('ok '+m)};
const key='__free_stamp__1792309355252',label='Ly miễn phí (6 tem)';
for(const file of ['posgieo.html','quanlygieo.html','manage.html']){
 const format=new Function(extract(file,['stampPromotionLabel'])+';return stampPromotionLabel')();
 check(format(key)===label,file+': bill cũ có mã đổi tem hiện nhãn dễ đọc');
 check(['Ly miễn phí (6 Stamp)','Mua 5 tặng 1','__free_stamp__abc','prefix'+key].every(x=>format(x)===x),file+': giữ nguyên các chương trình khác, chỉ nhận đúng mã số');
 check(format(null)===''&&format('')==='',file+': thiếu khuyến mãi không tạo nhãn giả');
}
const c={togoGiftSelected:'drink',getActiveMenu:()=>[{id:'drink',name:'Bí đao'}],giftBlockReasonPOS:()=>null,giftSizeForPOS:()=>({label:'L',price:30000}),document:{getElementById:()=>({_opts:{stampVKey:key},classList:{remove(){}}})},cart:{},renderMenu(){},renderCartDrawer(){},updFooter(){},toast(){}};
vm.createContext(c);vm.runInContext(extract('posgieo.html',['confirmTogoGift']),c);c.confirmTogoGift();const cup=Object.values(c.cart)[0];
check(cup._giftLabel===label&&cup._vKey===key,'POS gắn nhãn nhưng giữ nguyên khoá định danh đổi tem');
check(cup.price===0&&cup.qty===1&&cup._originalPrice===30000&&cup._giftType==='item_free'&&!cup.isFree,'giữ giá 0, số lượng, loại đổi tem; không biến thành quà mua-tặng');
for(const fn of ['confirmPay','finalizeSplitPay']){
 const src=extract('posgieo.html',[fn]);let found=0;
 walk.simple(acorn.parse(src,{ecmaVersion:'latest'}),{Property(p){if(p.key.name!=='voucherUsed')return;const expr=src.slice(p.value.start,p.value.end);if(!expr.includes('_stampFreeVKey'))return;found++;
 const value=new Function('cart','_stampFreeVKey','return '+expr);
 check(value(c.cart,key)===label&&value({a:{_vKey:key}},key)===label&&value({},null)===null,fn+': lưu nhãn cho giỏ mới/cũ, không có đổi tem thì null');
 }});assert.equal(found,1);
}
const receipt=new Function('fmt',extract('posgieo.html',['stampPromotionLabel','buildReceiptContent','buildFooterLines'])+';return buildReceiptContent')(String);
const bill={voucherUsed:key,total:0,itemsArray:[],method:'TIỀN MẶT'},before=JSON.stringify(bill);
check(receipt(bill,{}).some(r=>r.text==='Voucher: '+label),'in lại bill cũ cũng dùng nhãn dễ đọc');
const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const details=new Function('esc','money','bfItems','bfGuest',extract('manage.html',['stampPromotionLabel','bfDetails'])+';return bfDetails')(esc,String,()=>[],()=> '');
check(details({o:bill}).includes(label)&&!details({o:bill}).includes(key),'manage Bill chung sửa nhãn bill cũ khi hiển thị');
check(details({o:{voucherUsed:'<b>Khác</b>'}}).includes('&lt;b&gt;'),'nhãn chương trình khác vẫn escape trước khi hiển thị');
const gieo=new Function('escapeHtmlAttr','fmt',extract('quanlygieo.html',['stampPromotionLabel','bfChiTiet'])+';return bfChiTiet')(esc,String);
check(gieo(bill).includes(label)&&!gieo(bill).includes(key),'quanlygieo Bill bán hàng sửa nhãn bill cũ khi hiển thị');
check(JSON.stringify(bill)===before,'hiển thị và in lại không thay dữ liệu bill gốc');
console.log('ALL PASS '+n);
