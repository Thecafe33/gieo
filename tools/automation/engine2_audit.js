#!/usr/bin/env node
'use strict';
// Kiểm toán độc lập Engine 2 (lộ trình B0) trên một BẢN XUẤT dữ liệu, không nối Firebase.
//   node tools/automation/engine2_audit.js <ban_xuat.json> <quán> <từ YYYY-MM-DD> <đến YYYY-MM-DD> [--json]
// ban_xuat.json = file «Bản kiểm toán kho» (Quản lý › Trích xuất dữ liệu; lấy mục docs), hoặc thẳng
// { "đường/dẫn/doc": {...trường} } — cùng dạng bộ Firebase giả của test
// (vd. "stock_transactions_gieogieo/finish_u_WASTE", "duty_digests_gieogieo/_engine2/cases/x").
// Thoát mã 1 khi CHƯA ĐẠT (có vi phạm hoặc dữ liệu chưa đủ). Chỉ đọc.
const fs=require('node:fs'),path=require('node:path');
const A=require('../../unit_engine2_audit_v1.js');
const {makeFake}=require('../../tests/lib/fakefb.js');
const [file,store,from,to]=process.argv.slice(2).filter(a=>!a.startsWith('--'));
if(!file||!store||!from||!to){console.error('Cách dùng: node tools/automation/engine2_audit.js <ban_xuat.json> <gg01> <từ> <đến> [--json]');process.exit(2);}
(async()=>{
 const dump=JSON.parse(fs.readFileSync(path.resolve(file),'utf8'));
 const report=await A.run({storeId:store,from,to,fstore:makeFake({fs:dump.docs&&dump.manifest?dump.docs:dump}).fstore});
 if(dump.manifest&&!dump.manifest.complete)Object.assign(report,{ok:false,complete:false,truncated:[...report.truncated,'ban_xuat_chua_du']});
 console.log(process.argv.includes('--json')?JSON.stringify(report,null,1):A.summary(report));
 process.exit(report.ok?0:1);
})().catch(e=>{console.error(e.message);process.exit(2);});
