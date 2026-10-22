#!/usr/bin/env node
'use strict';
// Chạy lại Engine 2 (lộ trình B2, đường 2 — CHÍNH SÁCH MỚI) trên «Bản kiểm toán kho», không nối Firebase, không ghi gì.
//   node tools/automation/engine2_replay.js <ban_kiem_toan_kho.json> [--out <thư mục>]
// Báo hết còn dư (mã mới finish_<tem>_WASTE lẫn mã ngẫu nhiên của engine cũ) → khoảng từ mốc cân ca gần nhất / lúc mở tem
// đến lúc báo hết → chia đều pha chế có ca giao khoảng (ca không ghi chức năng = pha chế, chủ quán 22/10) → định giá như
// store (totalCost nguồn, rồi lịch sử giá theo ngày; không có thì «chưa đủ giá», không coi là 0đ).
// Quyết định dựng bằng CHÍNH các hàm lõi unit_engine2_v1.js, rồi đưa qua bộ kiểm toán ĐỘC LẬP để soát chéo.
// --out ghi engine2_replay.json + engine2_replay.md (có tên nhân viên — không đưa lên GitHub).
const fs=require('node:fs'),path=require('node:path');
const E=require('../../unit_engine2_v1.js');
const A=require('../../unit_engine2_audit_v1.js');
const {makeFake}=require('../../tests/lib/fakefb.js');
const TEN_MIN=10*60000;

function rowsOf(docs,prefix){return Object.entries(docs).filter(([k])=>k.startsWith(prefix+'/')&&!k.slice(prefix.length+1).includes('/')).map(([k,v])=>({...v,id:k.slice(prefix.length+1)}));}
function priceOf(prices,itemId,day,source){
 if(E.finite(source.totalCost)&&Number(source.totalCost)>=0)return {status:'known',amount:E.round(Math.abs(Number(source.totalCost))),method:'source_totalCost',sourceId:source.id};
 const rows=prices.filter(p=>p.itemId===itemId&&p.effectiveFrom&&p.effectiveFrom<=day&&E.finite(p.price)&&Number(p.price)>=0).sort((a,b)=>String(a.effectiveFrom).localeCompare(String(b.effectiveFrom))||String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
 if(rows.length){const p=rows.at(-1);return {status:'known',amount:E.round(-Number(source.qty)*Number(p.price)),method:'price_history',priceId:p.id,price:Number(p.price),effectiveFrom:p.effectiveFrom};}
 return {status:'missing',amount:null,method:'missing_effective_price'};
}

// Giá TẠM theo đúng cách sổ lãi/lỗ đang tính (itemCostOn của lai_lo.v6.js): lịch sử giá ≤ ngày; có lịch sử nhưng đều sau ngày
// → oldPrice (hoặc price) của dòng đầu; không có lịch sử → giá hiện tại. CHỈ để tham khảo — Engine 2 không dùng giá hiện tại
// làm giá lịch sử (đặc tả 2.3), hồ sơ vẫn «chưa đủ giá».
function plCostOn(prices,items,itemId,day){
 const now=Number(items[itemId]?.costPerUnit)||0,list=prices.filter(p=>p.itemId===itemId&&p.effectiveFrom).sort((a,b)=>String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)));
 if(!list.length)return {price:now,basis:'current_price'};
 let pick=null;for(const r of list){if(String(r.effectiveFrom)<=day)pick=r;else break;}
 if(pick)return {price:Number(pick.price)||0,basis:'price_history'};
 return {price:list[0].oldPrice!=null?Number(list[0].oldPrice)||0:Number(list[0].price)||0,basis:'first_old_price'};
}

/* dump = file «Bản kiểm toán kho» ({manifest, docs, rt}). Trả {decisions, skipped, stats, audit, docs}. */
async function replay(dump){
 const m=dump.manifest||{},store=m.store||'gg01',docs=dump.docs||dump;
 const name=k=>A.collName(k,store);
 const tx=rowsOf(docs,name('stock_transactions')),C=Object.fromEntries(rowsOf(docs,name('stock_containers')).map(c=>[c.id,c]));
 const shifts=rowsOf(docs,name('employee_shifts')),prices=rowsOf(docs,name('price_history')),items=Object.fromEntries(rowsOf(docs,name('inventory_items')).map(i=>[i.id,i]));
 // Mốc cân vật lý theo tem — cùng nguồn runtime dùng (dòng cân ca + lastShiftWeigh trên tem).
 const points={};
 const addPoint=(cid,p)=>{(points[cid]=points[cid]||[]).push(p);};
 for(const t of tx)if(t.shiftWeighOp&&t.containerId&&t.measured!==false&&!t.voided&&E.finite(t.weighedQty))addPoint(t.containerId,{id:'legacy_'+t.shiftWeighOp,status:'valid',containerId:t.containerId,countedAt:t.createdAt,quality:'legacy_shift_weigh',sourceTx:t.id});
 for(const c of Object.values(C)){const w=c.lastShiftWeigh;if(w&&w.op&&E.finite(w.weighed)&&Number.isFinite(E.ms(w.at))&&!(points[c.id]||[]).some(p=>p.id==='legacy_'+w.op))addPoint(c.id,{id:'legacy_'+w.op,status:'valid',containerId:c.id,countedAt:w.at,quality:'legacy_recorded'});}
 const decisions=[],skipped=[],stats={wasteLines:0,finishLines:0,byIdPattern:0,byNote:0,byTime:0};
 for(const t of tx){
  if(t.type!=='WASTE'||t.voided||!(Number(t.qty)<0))continue;stats.wasteLines++;
  const c=C[t.containerId||t.referenceId];
  if(!c||c.status!=='finished'||!E.finite(c.wasteBase)||Math.abs(Number(c.wasteBase)+Number(t.qty))>0.01)continue;
  // Huỷ tem có quét mã (waste_unit_ / scanned_discard) cũng đóng tem đúng lúc ghi WASTE — KHÔNG phải báo hết còn dư (case A2).
  if(/^waste_unit_/.test(t.id)||c.wasteBasis==='scanned_discard')continue;
  const byId=/^finish_.+_WASTE$/.test(t.id),byNote=/^Báo hết\b/.test(String(t.note||'')),byTime=/^unit_engine/.test(String(c.wasteBasis||''))&&Math.abs(E.ms(t.createdAt)-E.ms(c.finishedAt))<=TEN_MIN;
  if(!byId&&!byNote&&!byTime)continue;
  stats.finishLines++;if(byId)stats.byIdPattern++;else if(byNote)stats.byNote++;else stats.byTime++;
  try{
   const cp=(points[c.id]||[]).filter(p=>E.ms(p.countedAt)>E.ms(c.openedAt)&&E.ms(p.countedAt)<E.ms(c.finishedAt)).sort((a,b)=>E.ms(b.countedAt)-E.ms(a.countedAt))[0]||null;
   const range=E.interval(c,cp,c.finishedAt),g=E.group(shifts,range.from,range.to);
   if(!g.people.length){skipped.push({sourceId:t.id,code:c.code,itemName:c.itemName,reason:'Không có ca giao khoảng '+range.from+' → '+range.to});continue;}
   const quantity=E.round(-Number(t.qty)),valuation=priceOf(prices,t.itemId,t.businessDate,t),amount=valuation.status==='known'?valuation.amount:null;
   const q=E.split(quantity,g.people.map(p=>p.id)),money=amount===null?null:E.split(amount,g.people.map(p=>p.id));
   const caseId=E.key('finish',t.id),decisionId=caseId+'_replay';
   const flow=E.caseFlow(null,'decided'),d={schemaVersion:1,policyVersion:E.POLICY,storeId:store,status:flow.status,statusEvents:flow.events,decisionMode:'auto',basis:'policy_equal_share',mode:'replay',originKind:'finish',originId:t.id,
    id:caseId,decisionId,sourceId:t.id,sourcePath:name('stock_transactions')+'/'+t.id,containerId:c.id,containerCode:c.code||'',itemId:t.itemId,itemName:c.itemName||items[t.itemId]?.name||t.itemId,unit:c.unit||items[t.itemId]?.unit||'',
    quantity,valuation,amount,interval:range,intervalStart:cp?cp.quality:'opened_at',shiftIds:g.shiftIds,businessDate:t.businessDate,matchedBy:byId?'id':byNote?'note':'time',
    allocations:q.map((p,i)=>({employeeId:p.employeeId,employeeName:g.people.find(e=>e.id===p.employeeId).name,qty:p.value,value:money?money[i].value:null,basis:'policy_equal_share',roleBasis:g.people.find(e=>e.id===p.employeeId).roleBasis})),
    createdAt:t.createdAt,updatedAt:t.createdAt};
   const pl=plCostOn(prices,items,t.itemId,t.businessDate);d.plReference={amount:E.round(quantity*pl.price),price:pl.price,basis:pl.basis};
   if(['assigned_by_manager','manual'].includes(t.responsibility?.status))Object.assign(d,{decisionMode:'manual',basis:'manual_source',manualSource:t.responsibility,allocations:[],pending:{qty:d.quantity,value:d.amount}});
   const faults=E.audit(d);if(faults.length){skipped.push({sourceId:t.id,code:c.code,itemName:c.itemName,reason:'Lõi tự kiểm: '+faults.join(', ')});continue;}
   decisions.push(d);
  }catch(e){skipped.push({sourceId:t.id,code:c.code,itemName:c.itemName,reason:e.message});}
 }
 // Soát chéo: ghi quyết định thành hồ sơ Engine 2 giả lập (chỉ trong bộ nhớ) rồi chạy bộ kiểm toán độc lập.
 const sim={...docs},root=name('duty_digests')+'/_engine2';
 for(const d of decisions){sim[root+'/cases/'+d.id]=d;sim[root+'/decisions/'+d.decisionId]=d;}
 const audit=await A.run({storeId:store,from:m.range?.from||'2000-01-01',to:m.range?.to||'2100-01-01',fstore:makeFake({fs:JSON.parse(JSON.stringify(sim))}).fstore,limit:100000});
 const roles={total:shifts.length,recorded:shifts.filter(s=>Array.isArray(s.roles)&&s.roles.length).length};
 return {store,range:m.range||null,exportSha256:m.sha256||null,stats,roles,decisions,skipped,audit};
}

function report(r){
 const fmt=n=>n===null||n===undefined?'—':Number(n).toLocaleString('vi-VN');
 const known=r.decisions.filter(d=>d.amount!==null),missing=r.decisions.filter(d=>d.amount===null);
 const per={};for(const d of r.decisions)for(const a of d.allocations){const p=per[a.employeeId]=per[a.employeeId]||{name:a.employeeName,cases:0,value:0,missing:0,roles:new Set()};p.cases++;p.roles.add(a.roleBasis);if(a.value===null)p.missing++;else p.value+=a.value;}
 const byItem={};for(const d of r.decisions){const k=d.itemName+' ('+d.unit+')';const x=byItem[k]=byItem[k]||{n:0,qty:0,value:0};x.n++;x.qty+=d.quantity;x.value+=d.amount||0;}
 const L=[];
 L.push('# Chạy lại Engine 2 — chính sách mới','',`Quán ${r.store} · ${r.range?r.range.from+' → '+r.range.to:''} · mã kiểm bản xuất \`${String(r.exportSha256||'').slice(0,16)}…\``,'',
  'Chính sách: chia đều pha chế có ca giao khoảng (mốc cân ca gần nhất hoặc lúc mở tem → lúc báo hết). Ca không ghi chức năng = pha chế (chủ quán 22/10). **Phân bổ theo chính sách, không kết luận hành vi cá nhân; không tự thu tiền / trừ lương.**','',
  '## Tổng quan','',
  `- Dòng WASTE hiệu lực: ${r.stats.wasteLines}; nhận diện là báo hết còn dư: **${r.stats.finishLines}** (mã mới ${r.stats.byIdPattern} · ghi chú «Báo hết» ${r.stats.byNote} · khớp giờ ${r.stats.byTime}).`,
  `- Chạy lại thành công: **${r.decisions.length}**; bỏ qua: ${r.skipped.length}.`,
  `- Có giá: ${known.length} hồ sơ · tổng **${fmt(known.reduce((s,d)=>s+d.amount,0))}đ**; chưa đủ giá: ${missing.length} (không coi là 0đ).`,
  `- Tham khảo — giá tạm theo cách sổ lãi/lỗ đang tính: **${fmt(E.round(r.decisions.reduce((s,d)=>s+(d.plReference?.amount||0),0)))}đ** (lịch sử giá ${r.decisions.filter(d=>d.plReference?.basis==='price_history').length} · giá đầu cũ ${r.decisions.filter(d=>d.plReference?.basis==='first_old_price').length} · giá hiện tại ${r.decisions.filter(d=>d.plReference?.basis==='current_price').length} hồ sơ).`,
  `- Ca ghi chức năng: ${r.roles.recorded}/${r.roles.total} (còn lại áp luật «không ghi = pha chế»).`,
  `- Đầu khoảng: mốc cân ca ${r.decisions.filter(d=>d.intervalStart!=='opened_at').length} · lúc mở tem ${r.decisions.filter(d=>d.intervalStart==='opened_at').length}.`,
  `- Chia đều theo chính sách: **${r.decisions.filter(d=>d.basis==='policy_equal_share').length}** hồ sơ; quản lý đã quy trách nhiệm tay trên dòng gốc (Engine 2 **giữ nguyên, không chia lại**): **${r.decisions.filter(d=>d.basis==='manual_source').length}** hồ sơ.`,
  `- Hệ hiện hành (automation v3): báo hết còn dư không tự phân bổ — chỉ các hồ sơ quản lý gán tay mới có người chịu; phần còn lại là phần chính sách mới thêm vào.`,
  `- Bộ kiểm toán độc lập trên các hồ sơ chạy lại: **${r.audit.ok?'ĐẠT':'CHƯA ĐẠT'}** — ${r.audit.violations} vi phạm, ${r.audit.warnings} cảnh báo.`,'');
 // Quyết định tay trên dòng gốc: tính cho người quản lý đã gán (giữ nguyên) — cột riêng để cộng dọc khớp tổng.
 for(const d of r.decisions)for(const a of d.allocations){const share=d.quantity?a.qty/d.quantity:0;per[a.employeeId].pl=(per[a.employeeId].pl||0)+share*(d.plReference?.amount||0);}
 for(const d of r.decisions.filter(d=>d.basis==='manual_source')){const ms=d.manualSource||{},id=ms.employeeId||'?';const p=per[id]=per[id]||{name:ms.employeeName||id,cases:0,value:0,missing:0,roles:new Set()};p.manualCases=(p.manualCases||0)+1;p.manualPl=(p.manualPl||0)+(d.plReference?.amount||0);}
 L.push('## Theo người','','| Người | Hồ sơ chia đều | Tiền Engine 2 | Chưa đủ giá | Giá tạm — chia đều | Hồ sơ gán tay (giữ nguyên) | Giá tạm — gán tay | Chức năng trong ca |','|---|---:|---:|---:|---:|---:|---:|---|');
 for(const p of Object.values(per).sort((a,b)=>((b.pl||0)+(b.manualPl||0))-((a.pl||0)+(a.manualPl||0))))L.push(`| ${p.name} | ${p.cases} | ${fmt(E.round(p.value))}đ | ${p.missing} | ${fmt(E.round(p.pl||0))}đ | ${p.manualCases||0} | ${fmt(E.round(p.manualPl||0))}đ | ${p.roles.size?[...p.roles].map(x=>x==='recorded'?'có ghi pha chế':'không ghi (suy ra)').join(', '):'—'} |`);
 const tp=Object.values(per).reduce((s,p)=>s+(p.pl||0)+(p.manualPl||0),0);L.push(`| **Cộng** | | | | | | **${fmt(E.round(tp))}đ** (khớp tổng giá tạm) | |`);
 for(const d of r.decisions){const x=byItem[d.itemName+' ('+d.unit+')'];x.pl=(x.pl||0)+(d.plReference?.amount||0);}
 L.push('','## Theo nguyên liệu','','| Nguyên liệu | Lần | Tổng lượng | Tiền (Engine 2) | Tham khảo giá tạm |','|---|---:|---:|---:|---:|');
 for(const [k,x] of Object.entries(byItem).sort((a,b)=>(b[1].pl||0)-(a[1].pl||0)))L.push(`| ${k} | ${x.n} | ${fmt(E.round(x.qty))} | ${fmt(E.round(x.value))}đ | ${fmt(E.round(x.pl||0))}đ |`);
 L.push('','## Từng hồ sơ','','| Ngày | Tem | Nguyên liệu | Lượng | Khoảng | Người (mỗi người) | Tiền | Giá tạm |','|---|---|---|---:|---|---|---:|---:|');
 for(const d of r.decisions.slice().sort((a,b)=>String(a.businessDate).localeCompare(String(b.businessDate)))){
  const days=((E.ms(d.interval.to)-E.ms(d.interval.from))/86400000).toFixed(1);
  L.push(`| ${d.businessDate} | ${d.containerCode} | ${d.itemName} | ${fmt(d.quantity)} ${d.unit} | ${days} ngày (${d.intervalStart==='opened_at'?'từ mở tem':'từ mốc cân'}) | ${d.allocations.length?d.allocations.map(a=>a.employeeName+' '+fmt(a.qty)).join(', '):'gán tay: '+(d.manualSource?.employeeName||'?')+' — «'+String(d.manualSource?.reason||'').slice(0,40)+'»'} | ${d.amount===null?'chưa đủ giá':fmt(d.amount)+'đ'} | ${fmt(d.plReference?.amount)}đ |`);
 }
 if(r.skipped.length){L.push('','## Bỏ qua','');for(const s of r.skipped)L.push(`- ${s.code||s.sourceId} ${s.itemName||''}: ${s.reason}`);}
 if(r.audit.issues.length){L.push('','## Bộ kiểm toán','','```',A.summary(r.audit),'```');}
 return L.join('\n')+'\n';
}

if(require.main===module){
 const args=process.argv.slice(2),file=args.find(a=>!a.startsWith('--')),oi=args.indexOf('--out'),out=oi>=0?args[oi+1]:null;
 if(!file){console.error('Cách dùng: node tools/automation/engine2_replay.js <ban_kiem_toan_kho.json> [--out <thư mục>]');process.exit(2);}
 (async()=>{
  const r=await replay(JSON.parse(fs.readFileSync(path.resolve(file),'utf8'))),md=report(r);
  if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'engine2_replay.json'),JSON.stringify(r,null,1));fs.writeFileSync(path.join(out,'engine2_replay.md'),md);}
  console.log(md.split('\n## Theo người')[0]);process.exit(r.audit.ok?0:1);
 })().catch(e=>{console.error(e.message);process.exit(2);});
}
module.exports={replay,report};
