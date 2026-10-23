#!/usr/bin/env node
'use strict';
// Chạy học & suy luận Engine 2 (cấp 3–5) trên «Bản kiểm toán kho» thật — không nối Firebase, không ghi gì.
//   node tools/automation/engine2_learn.js <ban_kiem_toan_kho.json> [--out <thư mục>]
// Quan sát khoảng (unit_engine2_obs_v1.js) → baseline gộp tầng + trạng thái tin cậy, món vượt nhóm, bất thường + giả thuyết kiểm được
// (phần dư không có %), drift, phủ khoảng dự báo đi tiến theo thời gian. Tham số: bản phát hành unit_engine2_params_v1.js nếu có.
const fs=require('node:fs'),path=require('node:path');
const L=require('../../unit_engine2_learn_v1.js'),O=require('../../unit_engine2_obs_v1.js'),A=require('../../unit_engine2_audit_v1.js');
function rowsOf(docs,prefix){return Object.entries(docs).filter(([k])=>k.startsWith(prefix+'/')&&!k.slice(prefix.length+1).includes('/')).map(([k,v])=>({...v,id:k.slice(prefix.length+1)}));}
function params(){try{return L.withDefaults(require('../../unit_engine2_params_v1.js'));}catch(e){return L.DEFAULT_PARAMS;}}
function learn(dump,P=params()){
 const m=dump.manifest||{},store=m.store||'gg01',docs=dump.docs||dump,n=k=>A.collName(k,store);
 const items=Object.fromEntries(rowsOf(docs,n('inventory_items')).map(i=>[i.id,i]));
 const e2=n('duty_digests')+'/_engine2';
 const built=O.build({txs:rowsOf(docs,n('stock_transactions')),containers:rowsOf(docs,n('stock_containers')),items,shifts:rowsOf(docs,n('employee_shifts')),anomalies:rowsOf(docs,n('stock_anomalies')),checkpoints:rowsOf(docs,e2+'/checkpoints'),from:m.range?.from});
 const obs=built.obs.sort((a,b)=>a.at.localeCompare(b.at)),usable=obs.filter(o=>o.verified);
 // Mã cùng loại cùng phiếu nhận như lúc quan sát xảy ra (chỉ coi «đã dùng xong» khi báo hết TRƯỚC quan sát) — giả thuyết sai quy cách.
 // Phiếu nhận THẬT: bản xuất có receiving_records (export v2) thì theo đó; bản cũ không có → chỉ nhận mã dạng recv_* (RESET_TON_KHO… là phiếu giả).
 const recs=rowsOf(docs,n('receiving_records')),realRef=recs.length?new Set(recs.map(r=>r.id)):null,isReal=ref=>realRef?realRef.has(ref):/^recv_/.test(String(ref));
 const lotRows={};for(const c of rowsOf(docs,n('stock_containers')))if(c.receiveRefId&&isReal(c.receiveRefId)&&!['voided','cancelled'].includes(c.status))(lotRows[c.itemId+'|'+c.receiveRefId]=lotRows[c.itemId+'|'+c.receiveRefId]||[]).push(c);
 const lotsAt=o=>{const k=o.itemId+'|'+o.receiveRefId,rows=o.receiveRefId?lotRows[k]||[]:[];return rows.length?{[k]:{size:rows.length,units:rows.map(c=>({id:c.id,finished:c.status==='finished'&&!!c.finishedAt&&String(c.finishedAt)<=o.at,frac:Number(c.baseQty)>0?(Number(c.wasteBase)||0)/Number(c.baseQty):0}))}}:{};};
 // Đi tiến theo thời gian: mỗi quan sát chấm bằng baseline học từ quan sát TRƯỚC nó; bất thường bị đánh dấu (không học).
 const flagged=[];let S={};const accounting=usable.filter(o=>o.ctx.fifoDebt);
 for(let i=0;i<usable.length;i++){const o=usable[i],base=L.baseline(usable.slice(0,i),P),s=L.score(o,base,P),acc=L.accumulate(S[o.itemId],s,P);S[o.itemId]=acc.S;
  if(s.abnormal||acc.alarm){o.flagged=true;const hy=L.hypotheses(o,base,{lots:lotsAt(o)},P);flagged.push({o,s,accumulated:acc.alarm,hy});}}
 const base=L.baseline(usable,P),evalM=L.evaluate(usable,P),half=usable.filter(o=>o.at<(usable[Math.floor(usable.length/2)]||{}).at);
 return {store,range:m.range||null,params:P.version,origin:P.origin||P.record?.origin,obs:obs.length,usable:usable.length,skipped:built.skipped,
  unverified:obs.filter(o=>!o.verified).reduce((a,o)=>{a[o.reason]=(a[o.reason]||0)+1;return a;},{}),
  bySource:obs.reduce((a,o)=>{a[o.source]=(a[o.source]||0)+1;return a;},{}),base,items,flagged,outliers:L.outlierItems(base),drift:L.drift(usable,L.baseline(half,P),P),coverage:evalM.coverage90,
  weighed:usable.filter(o=>o.nWeigh>0).length,accounting:accounting.length,minutesKnown:obs.filter(o=>o.minutes!=null).length};
}
function report(r){
 const fmt=(x,d=1)=>x==null||!Number.isFinite(x)?'—':(Math.round(x*Math.pow(10,d))/Math.pow(10,d)).toLocaleString('vi-VN'),name=id=>r.items[id]?.name||id,L2=[];
 const states=Object.values(r.base.items).reduce((a,b)=>{a[b.state]=(a[b.state]||0)+1;return a;},{});
 L2.push('# Học & suy luận Engine 2 trên dữ liệu thật','',`Quán ${r.store} · ${r.range?r.range.from+' → '+r.range.to:''} · tham số \`${r.params}\` (${r.origin||'tiên nghiệm khai báo'})`,'',
  '## Dữ liệu học','',`- Quan sát khoảng: **${r.obs}** (theo nguồn: ${Object.entries(r.bySource).map(([k,v])=>k+' '+v).join(', ')}); dùng được: **${r.usable}**; có cân: ${r.weighed}.`,
  `- Không dùng để học: ${Object.entries(r.unverified).map(([k,v])=>k+' '+v).join(', ')||'—'}; tem bỏ: ${Object.entries(r.skipped).map(([k,v])=>k+' '+v).join(', ')||'—'}.`,
  `- Nợ FIFO / sổ âm (dư so với sổ) → nhánh kiểm sổ, không học mức hao hụt: ${r.accounting} quan sát.`,
  `- Thời gian thao tác có ghi: ${r.minutesKnown} lượt (B1 sẽ ghi cho mọi lượt cân mới).`,
  `- Trạng thái baseline theo món: ${Object.entries(states).map(([k,v])=>({cold_start:'mới (co về nhóm)',learning:'đang học',trusted:'đủ tin cậy'}[k]||k)+' '+v).join(' · ')}. Phủ khoảng dự báo 90% (đi tiến): ${r.coverage==null?'chưa đủ mẫu':fmt(r.coverage*100)+'%'}.`,'',
  '## Mức hao hụt thường theo món (baseline)','','| Nguyên liệu | Quan sát | Có thông tin | Ngày | Ước lượng | Khoảng 90% | Trạng thái | Ghi chú |','|---|---:|---:|---:|---:|---|---|---|');
 for(const b of Object.values(r.base.items).sort((a,b)=>b.n-a.n))L2.push(`| ${name(b.itemId)} | ${b.n} | ${b.informative} | ${b.days} | ${fmt(b.estimate*100,2)}% | ${fmt(b.low*100,1)}% → ${fmt(b.high*100,1)}% | ${({cold_start:'mới',learning:'đang học',trusted:'đủ tin cậy'})[b.state]} | ${b.capped?'chặn trần nhóm — cần xác minh':''} |`);
 if(r.outliers.length){L2.push('','## Món có hao hụt thường cao hơn hẳn nhóm','');for(const o of r.outliers)L2.push(`- ${name(o.itemId)}: trung vị ${fmt(o.median*100,2)}% so với nhóm ${fmt(o.groupMedian*100,2)}% → đề xuất cân phần định mức (không tự sửa định mức).`);}
 L2.push('','## Quan sát bất thường + giả thuyết kiểm được','','Xác suất chỉ in khi giả thuyết đã hiệu chuẩn đủ nhãn (hiện chưa có nhãn thật → chỉ xếp hạng). Phần dư = chưa giải thích, **không quy nguyên nhân, không có %**.','','| Ngày | Nguyên liệu | Lượng bán | Thiếu | Vượt kỳ vọng | Nguồn | Giả thuyết đứng đầu | Phép đo đề xuất | Phần dư |','|---|---|---:|---:|---:|---|---|---|---:|');
 for(const f of r.flagged)L2.push(`| ${f.o.day} | ${name(f.o.itemId)} | ${fmt(f.o.used)} ${f.o.unit} | ${fmt(f.o.loss)} | ${fmt(f.s.excess)}${f.accumulated?' (cộng dồn)':''} | ${f.o.source} | ${f.hy.explainedBy?f.hy.explainedBy+' — '+f.hy.ranking[0].why:'không giả thuyết kiểm được nào đáng kể'} | ${f.hy.next?.test||'giữ kiểm soát M2'} | ${fmt(f.hy.residual.qty)} |`);
 if(!r.flagged.length)L2.push('| — | | | | | | | | |');
 L2.push('','## Drift (thiếu tăng dần)','',r.drift.length?r.drift.map(d=>`- ${name(d.itemId)} từ ${d.at.slice(0,10)} (CUSUM ${d.cusum})`).join('\n'):'- Không phát hiện.');
 return L2.join('\n')+'\n';
}
if(require.main===module){
 const args=process.argv.slice(2),file=args.find(a=>!a.startsWith('--')),oi=args.indexOf('--out'),out=oi>=0?args[oi+1]:null;
 if(!file){console.error('Cách dùng: node tools/automation/engine2_learn.js <ban_kiem_toan_kho.json> [--out <thư mục>]');process.exit(2);}
 const r=learn(JSON.parse(fs.readFileSync(path.resolve(file),'utf8'))),md=report(r);
 if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'engine2_learn.md'),md);fs.writeFileSync(path.join(out,'engine2_learn.json'),JSON.stringify({...r,flagged:r.flagged.map(f=>({obs:f.o,score:f.s,ranking:f.hy.ranking,residual:f.hy.residual,next:f.hy.next}))},null,1));}
 console.log(md.split('\n## Mức hao hụt')[0]);
}
module.exports={learn,report};
