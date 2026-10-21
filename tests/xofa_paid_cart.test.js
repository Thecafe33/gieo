// Hồi quy: chọn size món bán không được lọc theo danh sách ly tặng hoặc lấy giá menu khác.
const assert=require('assert/strict'),vm=require('vm');
const {extract}=require('./lib/extract');
for(const file of ['PosX.html','PosX_tet.html','ban_deploy/thuong/PosX.html','ban_deploy/giangsinh/PosX.html','ban_deploy/tet/PosX.html']){
 const ctx={cart:{},active:[],document:{getElementById:()=>({classList:{remove(){}}})},getActiveMenu(){return this.active},updFooter(){},refreshMenuBadges(){},toast(){},syncDisplay(){},sharedGiftItems(){throw Error('Món bán không dùng danh sách tặng')}};
 // Hàm được gọi trong VM không giữ this; dùng closure menu rõ ràng.
 ctx.getActiveMenu=()=>ctx.active;
 vm.createContext(ctx);vm.runInContext(extract(file,['onSize','addCart']),ctx);
 for(const price of [27000,25000]){
  ctx.cart={};ctx.active=[{id:'paid',name:'Món bán',sizes:[{label:'M',price:price-5000},{label:'L',price}]}];
  vm.runInContext("onSize('paid','L');onSize('paid','L');onSize('paid','M');onSize('missing','M');onSize('paid','XL');",ctx);
  assert.equal(ctx.cart.paid_L.qty,2);assert.equal(ctx.cart.paid_L.price,price);
  assert.equal(ctx.cart.paid_M.price,price-5000);assert.equal(Object.keys(ctx.cart).length,2);
 }
 console.log('ok',file,'chọn size bán đúng menu/giá, độc lập quà');
}
