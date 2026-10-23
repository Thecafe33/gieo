'use strict';
// quanlygieo › Hộp thư: thông báo hệ thống đã tự xử lý (Engine 2, chủ quán 23/10) — thẻ mang dòng căn cứ, «để biết» tách nhóm
// riêng và KHÔNG tính vào cảnh báo chưa xem / sức khoẻ quán.
const assert=require('node:assert'),fs=require('node:fs'),path=require('node:path');
const {extract}=require('./lib/extract');
const note=new Function('escapeHtmlAttr','qlFmtDT',extract('quanlygieo.html',['alertAutoNoteHTML'])+'\nreturn alertAutoNoteHTML;')(s=>String(s).replace(/</g,'&lt;'),x=>'T'+x);
assert.equal(note({type:'x'}),'','thông báo thường: không có dòng');
assert.match(note({status:'resolved',autoReview:{by:'engine2',label:'Lệch vừa',reason:'Thiếu 60 g',at:'a'}}),/Hệ thống đã tự xử lý<\/b> · Ta — Lệch vừa\. Thiếu 60 g/);
assert.match(note({fyi:true,autoReview:{by:'engine2',label:'Lệch lớn',reason:'<b>x</b>'}}),/Để biết[\s\S]*&lt;b>x/,'để biết + escape');
assert.match(note({fyi:true,source:'engine2'}),/Để biết<\/b> — hệ thống đã tự xử lý/,'fyi không kèm căn cứ (vd thông báo pha nhầm)');
const html=fs.readFileSync(path.join(__dirname,'../quanlygieo.html'),'utf8');
assert.match(html,/state\.unread = alertApplyChanges\(list,state,version\)\.filter\(a=>a\.status==='new'&&a\.fyi!==true\)/,'để biết không tính là chưa xem');
assert.match(html,/Để biết — hệ thống đã tự xử lý \(\$\{fyis\.length\}\)/);
console.log('ok Hộp thư: dòng căn cứ tự xử lý, nhóm «Để biết» riêng, không tính vào cảnh báo chưa xem');
console.log('ALL PASS');
