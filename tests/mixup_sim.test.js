'use strict';
// Mô phỏng có sự thật biết trước cho luật «pha nhầm trong nhóm dễ nhầm» (tools/automation/mixup_sim.js).
// Hạt giống 11–13 KHÔNG dùng khi chỉnh ngưỡng (đã chỉnh trên 1, 2, 3, 7). Ngưỡng nghiệm thu ghi trung thực — xem
// docs/KE_HOACH_PHA_NHAM_NHOM.md «Kết quả mô phỏng»: nhiễu đếm càng lớn thì càng ít bắt được và càng nhiều báo «nghi» sai.
const assert=require('node:assert');
const {simulate}=require('../tools/automation/mixup_sim');
for(const noise of ['sales','real']){
 const runs=[11,12,13].map(seed=>simulate({days:3000,seed,noise}));
 const sum=k=>runs.reduce((a,r)=>a+r[k],0),claims=runs.reduce((a,r)=>a+r.claims.wrong,0),falseC=runs.reduce((a,r)=>a+r.claims.falseWrong,0);
 const det=sum('detected')/runs.reduce((a,r)=>a+r.truth.mixup,0),prec=(claims-falseC)/claims,fpd=falseC/sum('days');
 assert.equal(sum('crossGroup'),0,'không bao giờ ghép khác nhóm');
 if(noise==='sales'){assert(det>=0.55,'bắt được '+det);assert(prec>=0.75,'đúng '+prec);assert(fpd<=0.02,'báo nghi sai / ngày '+fpd);}
 else{assert(det>=0.3,'bắt được '+det);assert(prec>=0.55,'đúng '+prec);assert(fpd<=0.03,'báo nghi sai / ngày '+fpd);}
 console.log('ok Nhiễu «'+noise+'»: bắt được '+(det*100).toFixed(0)+'% pha nhầm thật, '+(prec*100).toFixed(0)+'% kết luận «nghi» là đúng, báo nghi sai '+(fpd*100).toFixed(1)+' / 100 ngày, 0 ghép khác nhóm');
}
console.log('ALL PASS');
