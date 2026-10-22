'use strict';
// Bảng mong đợi ba máy trạng thái Engine 2 viết lại từ đặc tả (DAC_TA_TRIEN_KHAI_UNIT_ENGINE2_V1.md mục 3.2–3.4) — KHÔNG chép từ code.
// Dùng chung: tests/unit_engine2_fsm.test.js và tools/automation/engine2_certify.js.
const X='INVALID';
const one=(...s)=>new Set(s);

// ---- 3.2 Case ----
const CASE_EVENTS=['SOURCE_UPSERT','CHECK_START','EVIDENCE_READY','EVIDENCE_MISSING','DUE','DECIDE','RESULTS_CONFIRMED','CONTEST','REVIEW_RESULT','REVIEW_DUE','SOURCE_CORRECTED','SOURCE_REMOVED','EXPLICIT_VOID','CASE_MERGED','RETRY','LATE_EVENT','LATE_ACK','RESTORE_SOURCE'];
function caseSpec(st,ev){
 const terminal=['voided','superseded'].includes(st);
 switch(ev){
  case 'SOURCE_UPSERT':return one(X);                                   // chỉ tạo hồ sơ (chưa có → new), không là chuyển trạng thái
  case 'CHECK_START':return st==='new'?one('checking'):one(X);
  case 'EVIDENCE_READY':return st==='checking'?one('ready'):one(X);
  case 'EVIDENCE_MISSING':case 'DUE':return st==='checking'?one('checking'):one(X);
  case 'DECIDE':return st==='ready'?one('decided'):one(X);
  case 'RESULTS_CONFIRMED':return st==='decided'?one('closed'):one(X);
  case 'CONTEST':return ['decided','closed'].includes(st)?one('review'):one(X);
  case 'REVIEW_RESULT':return st==='review'?one('decided'):one(X);
  case 'REVIEW_DUE':return st==='review'?one('review'):one(X);
  case 'SOURCE_CORRECTED':return ['checking','ready','decided','closed','review'].includes(st)?one('checking','review'):one(X);
  case 'SOURCE_REMOVED':return terminal?one(X):one('checking','review');
  case 'EXPLICIT_VOID':return st==='superseded'?one(X):st==='voided'?one('voided',X):one('voided');
  case 'CASE_MERGED':return st==='superseded'?one('superseded',X):one('superseded');
  case 'RETRY':case 'LATE_EVENT':case 'LATE_ACK':return one(st);           // trùng/stale → quy tắc chung: không đổi trạng thái
  case 'RESTORE_SOURCE':return st==='voided'?one('checking'):one(X);
 }
}
// ---- 3.4 Task ----
const TASK_EVENTS=['CLAIM','START','NEED_INPUT','DEPENDENCY_READY','TRANSIENT_FAILURE','LEASE_EXPIRED','HANDOVER_EXIT_WITH_EXCEPTION','RECOVERY','NEXT_SHIFT','DUE','VALID_RESULT','NEW_REVISION','VALID_VOID','RETRY','LATE_ACK'];
function taskSpec(st,ev){
 const fin=['done','superseded','cancelled'].includes(st);
 switch(ev){
  case 'CLAIM':return ['queued','retry_wait'].includes(st)?one('claimed'):one(X);
  case 'START':return st==='claimed'?one('in_progress'):one(X);
  case 'NEED_INPUT':return ['claimed','in_progress'].includes(st)?one('waiting_dependency'):one(X);
  case 'DEPENDENCY_READY':return st==='waiting_dependency'?one('queued'):one(X);
  case 'TRANSIENT_FAILURE':case 'LEASE_EXPIRED':return ['claimed','in_progress'].includes(st)?one('retry_wait'):one(X);
  case 'HANDOVER_EXIT_WITH_EXCEPTION':return ['queued','claimed','in_progress','waiting_dependency','retry_wait'].includes(st)?one('exception_recorded'):st==='exception_recorded'?one('exception_recorded',X):one(X);
  case 'RECOVERY':case 'NEXT_SHIFT':case 'DUE':return st==='exception_recorded'?one('queued','waiting_dependency'):one(X);
  case 'VALID_RESULT':return st==='in_progress'?one('done'):one(X);
  case 'NEW_REVISION':return fin?one(st,X):one('superseded');
  case 'VALID_VOID':return fin?one(st,X):one('cancelled');
  case 'RETRY':case 'LATE_ACK':return one(st);
 }
}
// ---- 3.3 Control (mức 0–3, manualFloor 0, chưa bật tự hạ) ----
const CONTROL_EVENTS=['NEED_BASELINE','PHYSICAL_LOSS','MEASUREMENT_CONFLICT','MANUAL_FLOOR_SET','ACK','TASK_RESULT','DUE','CLEAN_WINDOW_PASSED','CONFIG_CHANGED','RECIPE_CHANGED','MEASUREMENT_CHANGED','OFFLINE','NO_ACTIVITY','EXCEPTION'];
function controlSpec(lv,ev){
 switch(ev){
  case 'NEED_BASELINE':return one(Math.max(lv,1));
  case 'PHYSICAL_LOSS':return one(Math.max(lv,2));
  case 'MEASUREMENT_CONFLICT':return lv===0?one(X):one(3);              // đặc tả: 1/2 → 3
  case 'MANUAL_FLOOR_SET':case 'ACK':case 'TASK_RESULT':case 'DUE':case 'CLEAN_WINDOW_PASSED':case 'OFFLINE':case 'NO_ACTIVITY':case 'EXCEPTION':return one(lv);
  case 'CONFIG_CHANGED':case 'RECIPE_CHANGED':case 'MEASUREMENT_CHANGED':return new Set([0,1,2,3].filter(x=>x>=lv)); // giữ hoặc tăng
 }
}

function deviations(E){
const actual=(fn)=>{try{return fn();}catch(e){if(/INVALID/.test(e.message))return X;throw e;}};
const deviations=[];
for(const st of E.states.case)for(const ev of CASE_EVENTS){const got=actual(()=>E.transition('case',st,ev)),want=caseSpec(st,ev);if(!want.has(got))deviations.push(`case/${st}/${ev}: code=${got}, đặc tả=${[...want].join('|')}`);}
for(const st of E.states.task)for(const ev of TASK_EVENTS){const got=actual(()=>E.transition('task',st,ev)),want=taskSpec(st,ev);if(!want.has(got))deviations.push(`task/${st}/${ev}: code=${got}, đặc tả=${[...want].join('|')}`);}
for(const lv of [0,1,2,3])for(const ev of CONTROL_EVENTS){const got=actual(()=>E.control({level:lv,manualFloor:0},ev).level),want=controlSpec(lv,ev);if(!want.has(got))deviations.push(`control/${lv}/${ev}: code=${got}, đặc tả=${[...want].join('|')}`);}

 return deviations;
}
module.exports={X,CASE_EVENTS,TASK_EVENTS,CONTROL_EVENTS,caseSpec,taskSpec,controlSpec,deviations};
