'use strict';
// Lộ trình Engine 2 — B0: kiểm TÍCH DESCARTES trạng thái × sự kiện của ba FSM.
// Bảng mong đợi ở tools/automation/engine2_fsm_spec.js — viết lại từ đặc tả (DAC_TA 3.2–3.4), không chép từ code.
// KNOWN phải rỗng: mọi cặp trạng thái × sự kiện khớp đặc tả.
const assert=require('node:assert');
const E=require('../unit_engine2_v1');
const {X,CASE_EVENTS,TASK_EVENTS,CONTROL_EVENTS,deviations:dev}=require('../tools/automation/engine2_fsm_spec');
const actual=(fn)=>{try{return fn();}catch(e){if(/INVALID/.test(e.message))return X;throw e;}};
const deviations=dev(E);
// 22/10: 33 lệch cũ đã sửa theo đặc tả (chủ quán duyệt — Engine 2 v1 chưa deploy). Lệch mới = test hỏng.
const KNOWN=[];
const fresh=deviations.filter(d=>!KNOWN.includes(d)),gone=KNOWN.filter(k=>!deviations.includes(k));
assert.deepEqual(fresh,[],'Lệch MỚI giữa code và đặc tả:\n'+fresh.join('\n'));
assert.deepEqual(gone,[],'Lệch đã biết không còn — cập nhật KNOWN:\n'+gone.join('\n'));
const total=E.states.case.length*CASE_EVENTS.length+E.states.task.length*TASK_EVENTS.length+4*CONTROL_EVENTS.length;
console.log(`ok Tích Descartes ${total} cặp (case ${E.states.case.length}×${CASE_EVENTS.length}, task ${E.states.task.length}×${TASK_EVENTS.length}, control 4×${CONTROL_EVENTS.length}); 0 lệch so với đặc tả`);
// No transition ever lands on an undeclared state, and no "fallback to done" exists.
for(const st of E.states.task)for(const ev of TASK_EVENTS){const got=actual(()=>E.transition('task',st,ev));if(got!==X){assert(E.states.task.includes(got));if(got==='done')assert(st==='done'||ev==='VALID_RESULT',st+'/'+ev);}}
for(const st of E.states.case)for(const ev of CASE_EVENTS){const got=actual(()=>E.transition('case',st,ev));if(got!==X){assert(E.states.case.includes(got));if(got==='closed')assert(st==='closed'||ev==='RESULTS_CONFIRMED',st+'/'+ev);}}
for(const f of [1,2,3])for(const lv of [0,1,2,3])for(const ev of CONTROL_EVENTS){const got=actual(()=>E.control({level:lv,manualFloor:f},ev).level);if(got!==X)assert(got>=f,'control dưới sàn '+lv+'/'+f+'/'+ev);}
// path / caseFlow / taskStart: đi qua đúng các bước bảng.
assert.equal(E.caseFlow(null,'decided').status,'decided');assert.deepEqual(E.caseFlow(null,'decided').events,['CHECK_START','EVIDENCE_READY','DECIDE']);
assert.equal(E.caseFlow('decided','decided').status,'decided');assert.equal(E.caseFlow('closed','decided').status,'decided');assert.equal(E.caseFlow('voided','decided').status,'decided');
assert.equal(E.caseFlow('decided','voided').status,'voided');assert.equal(E.caseFlow('voided','voided').status,'voided');assert.equal(E.caseFlow('review','decided').hold,true);
assert.throws(()=>E.caseFlow('superseded','decided'),/INVALID/);assert.throws(()=>E.caseFlow('superseded','voided'),/INVALID/);
for(const s of ['queued','retry_wait','exception_recorded','waiting_dependency','claimed','in_progress'])assert.equal(E.taskStart(s).status,'in_progress',s);
for(const s of ['done','superseded','cancelled'])assert.throws(()=>E.taskStart(s),/INVALID/,s);
console.log('ok Không trạng thái lạ; chỉ VALID_RESULT dẫn tới done, chỉ RESULTS_CONFIRMED dẫn tới closed; control không bao giờ dưới sàn');
console.log('ALL PASS');
