#!/usr/bin/env node
'use strict';
// CHỨNG NHẬN CẤP Engine 2 (lộ trình mục 2 + 5). Chấm từng cấp 1→6 trên HAI mặt:
//   · Mô phỏng (thư viện kịch bản lường trước, hạt giống CHƯA dùng để hiệu chuẩn) — năng lực đã sẵn sàng chưa;
//   · Dữ liệu thật («Bản kiểm toán kho») — đã CHỨNG MINH trên quán thật chưa. Thiếu mẫu → «chưa đủ dữ liệu», không bao giờ báo đạt giả.
//   node tools/automation/engine2_certify.js [ban_kiem_toan_kho.json] [--out <thư mục>] [--seeds 201,202,203]
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const E=require('../../unit_engine2_v1.js'),L=require('../../unit_engine2_learn_v1.js'),A=require('../../unit_engine2_audit_v1.js');
const S=require('./engine2_sim.js'),FSM=require('./engine2_fsm_spec.js');
const {makeFake}=require('../../tests/lib/fakefb.js');
const OK='ĐẠT',SIM='ĐẠT (mô phỏng)',WAIT='CHƯA ĐỦ DỮ LIỆU THẬT',FAIL='CHƯA ĐẠT';
function params(){try{return L.withDefaults(require('../../unit_engine2_params_v1.js'));}catch(e){return L.DEFAULT_PARAMS;}}

async function certify(opts={}){
 const P=params(),seeds=opts.seeds||[201,202,203],lv={};
 // ---------- Mô phỏng (hạt giống chưa dùng) ----------
 const lib=S.runLibrary(P,seeds),agg=S.aggregate(lib),failed=lib.filter(r=>r.fail.length);
 const pass=name=>lib.filter(r=>r.scenario===name).every(r=>!r.fail.length);
 const noAbn=lib.filter(r=>r.metrics.trueAbnormal===0),faPerObs=noAbn.reduce((s,r)=>s+r.metrics.falseAlarm,0)/Math.max(1,noAbn.reduce((s,r)=>s+r.metrics.n,0));
 // Nhãn chẩn đoán gộp theo thứ tự chạy (như một quán trải qua lần lượt các tình huống) → hiệu chỉnh + Brier NGOÀI MẪU (fitCalibration).
 const pairs={};for(const r of lib)for(const x of r.result.evidence.labelLog||[])(pairs[x.h]=pairs[x.h]||[]).push([x.p,x.y]);
 const calib=Object.fromEntries(Object.entries(pairs).map(([h,p])=>[h,L.fitCalibration(p,P)]));
 const auditOut=spawnSync(process.execPath,[path.join(__dirname,'../../tests/unit_engine2_audit.test.js')],{encoding:'utf8'}),faults=/ok (\d+)\/(\d+) lỗi cài sẵn/.exec(auditOut.stdout||'');
 const fsmDev=FSM.deviations(E);
 const rec=P.record||null,modelIssues=rec?L.auditModels([rec],P):[{code:'NO_CALIBRATION_RECORD'}];
 // ---------- Dữ liệu thật ----------
 let real=null;
 if(opts.dump){
  const dump=opts.dump,m=dump.manifest||{},store=m.store||'gg01',docs=dump.docs||dump;
  const audit=await A.run({storeId:store,from:m.range.from,to:m.range.to,fstore:makeFake({fs:JSON.parse(JSON.stringify(docs))}).fstore,limit:100000});
  const compat=require('./engine2_compat.js').compat(dump),{replay}=require('./engine2_replay.js'),r1=await replay(dump),r2=await replay(dump);
  const sameReplay=L.stable(r1.decisions.map(d=>[d.id,d.allocations,d.quantity]))===L.stable(r2.decisions.map(d=>[d.id,d.allocations,d.quantity]));
  const learned=require('./engine2_learn.js').learn(dump,P),model=docs[A.collName('duty_digests',store)+'/_engine2/models/current']||null;
  const versions=Object.entries(docs).filter(([k])=>k.startsWith(A.collName('duty_digests',store)+'/_engine2/model_versions/')).map(([,v])=>v);
  const controls=Object.entries(docs).filter(([k])=>k.startsWith(A.collName('duty_digests',store)+'/_engine2/controls/')).map(([,v])=>v);
  real={store,range:m.range,complete:!!m.complete,audit,compat,replay:r1,sameReplay,learned,model,versions,controls};
 }
 const trusted=real?Object.values(real.learned.base.items).filter(b=>b.state==='trusted').length:0;
 const realLabels=real?.model?.labels||{},calibratedH=Object.entries(realLabels).filter(([,l])=>l.calibrated).map(([h])=>h);
 // ---------- Chấm ----------
 lv[1]={name:'Ghi đủ',sim:faults&&faults[1]===faults[2]?SIM:FAIL,simWhy:faults?faults[1]+'/'+faults[2]+' lỗi cài bị bộ kiểm độc lập bắt':'không chạy được test kiểm toán',
  real:!real?WAIT:real.complete&&real.audit.violations===0&&real.compat.loss.unexplained===0&&real.compat.tem.ok===real.compat.tem.total?OK:FAIL,
  realWhy:!real?'chưa có bản xuất':`kiểm toán ${real.audit.violations} vi phạm · hao hụt Engine 2 = sổ lãi/lỗ (${real.compat.loss.unexplained} ngày lệch) · tem = sự thật ${real.compat.tem.ok}/${real.compat.tem.total}`};
 lv[2]={name:'Luật',sim:fsmDev.length===0?SIM:FAIL,simWhy:'FSM '+fsmDev.length+' lệch đặc tả (335 cặp)',
  real:!real?WAIT:fsmDev.length===0&&real.sameReplay&&real.replay.audit.ok?OK:FAIL,realWhy:!real?'chưa có bản xuất':`chạy lại 2 lần trùng: ${real.sameReplay?'có':'không'} · ${real.replay.decisions.length} hồ sơ chạy lại, kiểm toán ${real.replay.audit.violations} vi phạm`};
 const covOk=agg.coverage90!=null&&agg.coverage90>=0.85&&agg.coverage90<=0.97;
 lv[3]={name:'Học mức thường',sim:covOk&&pass('me_do_mot_lan')&&pass('mon_it_ban')&&pass('drift_mua')?SIM:FAIL,simWhy:`phủ khoảng 90% = ${(agg.coverage90*100).toFixed(1)}% · bền với mẻ lỗi · món ít bán không «đủ tin cậy» · drift`,
  real:!real?WAIT:trusted>=1&&real.learned.coverage!=null&&real.learned.coverage>=0.8?OK:WAIT,realWhy:!real?'chưa có bản xuất':`${trusted} món «đủ tin cậy» (cần ≥ 20 mốc có thông tin / 14 ngày) · ${real.learned.usable} quan sát dùng được, ${real.learned.weighed} có cân`};
 const idOk=['sai_bi','sai_ty_trong','loi_dong_bo','tieu_hao_khong_khai','nhan_hang_sai_dung_tich','can_lech_he_so','dinh_muc_thieu_giua_ky','dinh_muc_thieu_tu_dau','nhieu_loi_cung_luc'].every(pass);
 // Giả thuyết đủ nhãn phải hiệu chỉnh đạt; chưa đủ nhãn thì hệ thống tự KHÔNG in % (không tính là đạt hay trượt).
 const brierOk=Object.values(calib).filter(c=>c.n>=P.calibration.minLabels).every(c=>c.calibrated)&&Object.values(calib).some(c=>c.calibrated);
 lv[4]={name:'Suy luận (giả thuyết kiểm được)',sim:idOk&&brierOk?SIM:FAIL,simWhy:`nhận đúng 7 nhóm giả thuyết + tách lỗi kép · Brier ngoài mẫu sau hiệu chỉnh (thô): ${Object.entries(calib).map(([h,c])=>h+' '+(c.brier==null?'—':c.brier.toFixed(2))+' ('+c.brierRaw.toFixed(2)+', '+c.n+' nhãn'+(c.n<P.calibration.minLabels?', chưa đủ → không in %':'')+')').join(', ')||'—'}`,
  real:!real?WAIT:calibratedH.length>=1?OK:WAIT,realWhy:!real?'chưa có bản xuất':`giả thuyết đủ nhãn thật: ${calibratedH.join(', ')||'chưa có'} (mỗi giả thuyết cần ≥ ${P.calibration.minLabels} nhãn từ phép đo chẩn đoán)`};
 const relOk=pass('that_thoat_sau_ha_muc')&&pass('that_thoat_keo_dai')&&pass('thieu_nho_lap_lai');
 lv[5]={name:'Vòng kín',sim:relOk&&agg.missRate<=0.03&&faPerObs<=0.015?SIM:FAIL,simWhy:`bỏ sót ${(agg.missRate*100).toFixed(1)}% · báo sai ${(faPerObs*100).toFixed(2)}%/quan sát (kịch bản sạch) · hạ mức khi sạch, bắt lại khi tái diễn`,
  real:!real?WAIT:(real.controls.some(c=>c.lastReleaseAt)&&real.controls.some(c=>c.lastEscalationAt||c.reasonCaseIds))?OK:WAIT,realWhy:!real?'chưa có bản xuất':`kiểm soát thật: ${real.controls.length} món · đã có chu kỳ nâng→hạ: ${real.controls.filter(c=>c.lastReleaseAt).length}`};
 lv[6]={name:'Tự hiệu chuẩn / tự kiểm toán',sim:rec&&modelIssues.length===0&&failed.length===0&&faults&&faults[1]===faults[2]?SIM:FAIL,
  simWhy:rec?`tham số «${P.version}» (${rec.origin||P.origin}) · kiểm định ngoài huấn luyện: ${lib.length-failed.length}/${lib.length} kịch bản đạt · kiểm toán mô hình ${modelIssues.length} lỗi`:'chưa có bản ghi hiệu chuẩn',
  real:!real?WAIT:real.versions.length>=1&&L.auditModels(real.versions,P).length===0&&(real.model?.calibration)?OK:WAIT,realWhy:!real?'chưa có bản xuất':`phiên bản hiệu chuẩn thật: ${real.versions.length} · lượt học hằng ngày: ${real.model?'có ('+real.model.day+')':'chưa chạy (Engine 2 chưa bật trên quán)'}`};
 let realLevel=0;for(let i=1;i<=6;i++){if(lv[i].real===OK)realLevel=i;else break;}
 let simLevel=0;for(let i=1;i<=6;i++){if(lv[i].sim===SIM)simLevel=i;else break;}
 return {at:new Date().toISOString(),params:{version:P.version,origin:P.origin||rec?.origin},seeds,levels:lv,simLevel,realLevel,failedScenarios:failed.map(r=>r.scenario+'#'+r.seed+': '+r.fail.join('; ')),aggregate:agg,real:real&&{store:real.store,range:real.range}};
}
function report(c){
 const L2=['# Chứng nhận cấp Engine 2','',`Lập lúc ${c.at} · tham số \`${c.params.version}\` (${c.params.origin||'tiên nghiệm'}) · hạt giống kiểm định ${c.seeds.join(', ')}${c.real?' · dữ liệu thật '+c.real.store+' '+c.real.range.from+' → '+c.real.range.to:''}`,'',
  `**Năng lực (mô phỏng, kịch bản lường trước): cấp ${c.simLevel}/6.** **Chứng minh trên dữ liệu thật: cấp ${c.realLevel}/6.**`,'',
  'Cấp chỉ được tính khi đạt liên tục từ cấp 1. «Chưa đủ dữ liệu thật» nghĩa là năng lực có nhưng quán chưa sinh đủ mẫu / nhãn để chứng minh — không phải lỗi, không được coi là đạt.','',
  '| Cấp | Nội dung | Mô phỏng | Căn cứ | Dữ liệu thật | Căn cứ |','|---|---|---|---|---|---|'];
 for(let i=1;i<=6;i++){const x=c.levels[i];L2.push(`| ${i} | ${x.name} | ${x.sim} | ${x.simWhy} | ${x.real} | ${x.realWhy} |`);}
 L2.push('',`Tổng mô phỏng: ${c.aggregate.runs} lượt kịch bản · bỏ sót ${(c.aggregate.missRate*100).toFixed(1)}% · báo sai ${(c.aggregate.falseAlarmRate*100).toFixed(1)}% số lần báo · phủ khoảng 90% ${(c.aggregate.coverage90*100).toFixed(1)}%.`);
 if(c.failedScenarios.length){L2.push('','## Kịch bản chưa đạt','');for(const f of c.failedScenarios)L2.push('- '+f);}
 return L2.join('\n')+'\n';
}
if(require.main===module){
 const args=process.argv.slice(2),file=args.find(a=>!a.startsWith('--')&&!/^\d/.test(a)),oi=args.indexOf('--out'),out=oi>=0?args[oi+1]:null,si=args.indexOf('--seeds');
 (async()=>{
  const c=await certify({dump:file?JSON.parse(fs.readFileSync(path.resolve(file),'utf8')):null,seeds:si>=0?args[si+1].split(',').map(Number):undefined}),md=report(c);
  if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'engine2_certify.md'),md);fs.writeFileSync(path.join(out,'engine2_certify.json'),JSON.stringify(c,null,1));}
  console.log(md);
 })().catch(e=>{console.error(e);process.exit(2);});
}
module.exports={certify,report};
