'use strict';
// Store Engine 2 v3 (05/11/2026) giữ nguyên MỌI hành vi đã kiểm của v1 (9 bộ test) và v2 (nhân sự) — chạy lại các bộ đó trên v3.
// Phần mới của v3 kiểm ở tests/engine2_pos_v3.test.js.
const assert=require('node:assert'),path=require('node:path'),{spawnSync}=require('node:child_process');
const alias=path.join(__dirname,'lib/alias_store_v3.js');
// E2_STORE='v2': v3 = v2 + phần mới → các bộ test chọn kỳ vọng hành vi nhân sự của v2.
for(const t of ['unit_engine2','unit_engine2_alert_review','unit_engine2_mixup','unit_engine2_prep_review','unit_engine2_queue','unit_engine2_review_fixes','unit_engine2_runtime','unit_engine2_spec','unit_engine2_sub_review','unit_engine2_staffing']){
 const r=spawnSync(process.execPath,['-r',alias,path.join(__dirname,t+'.test.js')],{env:{...process.env,E2_STORE:'v2'},encoding:'utf8'});
 assert.equal(r.status,0,t+' trên store v3:\n'+(r.stdout+r.stderr).split('\n').slice(-12).join('\n'));
}
// Bí danh phải thực sự đổi sang v3 (chống test «đạt» vì vẫn chạy bản cũ).
const r=spawnSync(process.execPath,['-r',alias,'-e',"console.log(require.resolve('"+path.join(__dirname,'../unit_engine2_store_v2').replace(/\\/g,'/')+"'))"],{encoding:'utf8'});
assert(/unit_engine2_store_v3\.js/.test(r.stdout),'bí danh trỏ store v3: '+r.stdout);
console.log('ok Store v3 giữ nguyên mọi hành vi đã kiểm của v1 (9 bộ) + v2 (nhân sự)');
console.log('ALL PASS');
