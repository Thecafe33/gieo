'use strict';
// Popup chi tiết TC33 / XOFA: dòng «Tổng chi · Lãi» chỉ hiện khi MỌI ngày trong kỳ đã tính COGS theo món.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {extract}=require('./lib/extract');
const file=path.join(__dirname,'../manage.html'),html=fs.readFileSync(file,'utf8');
const ctx={money:n=>Math.round(n||0).toLocaleString('vi-VN')};vm.createContext(ctx);
vm.runInContext(extract(file,['beProfit'])+';globalThis.beProfit=beProfit',ctx);
const base={doanhThu:1262000,chiPhiCoDinh:100000,khauHao:0,cogs:209536,soNgay:1,hoaVon:119909};
const s=o=>({be:{...base,...(o.be||{})},cogs:o.cogs===undefined?{activeDays:1}:o.cogs});
let h=ctx.beProfit(s({}));
assert(/309\.536/.test(h)&&/952\.464/.test(h)&&/Lãi/.test(h)&&!/Lỗ/.test(h),'chi 100.000 + 209.536 = 309.536; lãi 1.262.000 − 309.536 = 952.464');
h=ctx.beProfit(s({be:{doanhThu:200000}}));assert(/Lỗ/.test(h)&&/109\.536/.test(h),'doanh thu 200K → lỗ 109.536');
h=ctx.beProfit(s({be:{khauHao:10000}}));assert(/319\.536/.test(h),'khấu hao cộng vào tổng chi');
assert.equal(ctx.beProfit(s({be:{cogs:undefined}})),'','chưa bật COGS → không hiện');
assert.equal(ctx.beProfit(s({be:{cogsMissing:true}})),'','thiếu giá vốn → không hiện');
assert.equal(ctx.beProfit(s({be:{cogsNoRevenue:true}})),'');
assert.equal(ctx.beProfit(s({be:{soNgay:3},cogs:{activeDays:1}})),'','kỳ có ngày chưa áp dụng COGS → không hiện (lãi sẽ ảo)');
assert.equal(ctx.beProfit({be:null,cogs:null}),'');
assert(/\+beProfit\(s\)\}/.test(html),'storeDetails gọi beProfit');
// Nhập nhiều ngày: nút chỉ hiện từ 2 ngày; ngày chưa kết ca / chưa phân loại không vào danh sách
assert(/nReady>=2\?`<button class="cash-bulk"/.test(html),'nút chỉ khi ≥ 2 ngày chờ nhập');
assert(/\.filter\(x=>!\(storeId!=='tc33'&&storeId!=='xofa'&&x\.r\.unclassified\)\)/.test(html),'bỏ ngày Gieo còn bill chưa phân loại');
assert(/writeCashReceipt\(id,t\.d,t\.n,\{expected:t\.r\.expected,sales:t\.r\.sales,spent:t\.r\.spent\}\)/.test(html),'ghi từng ngày bằng đúng writeCashReceipt của nhập 1 ngày');
console.log('ALL PASS');
