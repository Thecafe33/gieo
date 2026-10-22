#!/usr/bin/env node
'use strict';
// Đối chiếu TƯƠNG THÍCH (lộ trình B2, đường 1) trên «Bản kiểm toán kho», không nối Firebase, không ghi gì.
//   node tools/automation/engine2_compat.js <ban_kiem_toan_kho.json> [--out <thư mục>]
// A. Hao hụt: cách Engine 2 nhận khoản mất (dòng WASTE còn hiệu lực, một nguồn) phải khớp sổ lãi/lỗ đang tính
//    (computeWasteByDateRange của lai_lo.v6.js: NL |qty| × itemCostOn, BTP |totalCost|) theo ngày / món, cùng cách định giá cũ.
//    Chênh lệch vốn có giữa hai bên (vd. sổ lãi/lỗ không lọc dòng đã huỷ) ghi thành phát hiện, không sửa số để ép khớp.
// B. Tem = sự thật: tồn NL theo tem trong danh mục = Σ tem nguyên (baseQty, trừ tem đã có trong RT) + Σ unitBase RT
//    (bỏ tem chờ huỷ) + tem mở trên Firestore thiếu node RT (unitBase Firestore) + bù _ueRtStale — đúng công thức
//    _ueRecomputeCurrentStock của Unit Engine v21. Ảnh chụp FS/RT không nguyên tử: bán trong lúc xuất được tách riêng.
const fs=require('node:fs'),path=require('node:path');
const A=require('../../unit_engine2_audit_v1.js');
const EPS=0.01;
const ms=v=>typeof v==='number'?v:Date.parse(v||'');
const r2=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
function rowsOf(docs,prefix){return Object.entries(docs).filter(([k])=>k.startsWith(prefix+'/')&&!k.slice(prefix.length+1).includes('/')).map(([k,v])=>({...v,id:k.slice(prefix.length+1)}));}
// Chép đúng itemCostOn (lai_lo.v6.js): lịch sử ≤ ngày; có lịch sử mà đều sau ngày → oldPrice/price dòng đầu; không lịch sử → giá hiện tại.
function costOn(prices,items,itemId,day){
 const now=items[itemId]?Number(items[itemId].costPerUnit)||0:0,list=prices.filter(p=>p.itemId===itemId).sort((a,b)=>String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)));
 if(!day||!list.length)return now;let pick=null;for(const r of list){if(String(r.effectiveFrom)<=day)pick=r;else break;}
 if(pick)return Number(pick.price)||0;return list[0].oldPrice!=null?Number(list[0].oldPrice)||0:(Number(list[0].price)||0);
}
function kindOf(t,C){
 if(/^finish_.+_WASTE$/.test(t.id)||/^Báo hết\b/.test(String(t.note||'')))return 'bao_het';
 if(t.shiftWeighOp||/^e2sw_/.test(t.id))return 'can_ca';
 if(/^waste_unit_/.test(t.id)||C[t.containerId||t.referenceId]?.wasteBasis==='scanned_discard')return 'huy_tem';
 if(/^prep_variance_/.test(t.id))return 'lech_che_bien';
 if(/^Hao hụt \/ Huỷ\s/.test(String(t.note||'')))return 'khai_huy';
 return 'khac';
}

function compat(dump){
 const m=dump.manifest||{},store=m.store||'gg01',docs=dump.docs||dump,name=k=>A.collName(k,store);
 const stock=rowsOf(docs,name('stock_transactions')),prep=rowsOf(docs,name('prep_transactions'));
 const prices=rowsOf(docs,name('price_history')),items=Object.fromEntries(rowsOf(docs,name('inventory_items')).map(i=>[i.id,i]));
 const preps=Object.fromEntries(rowsOf(docs,name('prep_items')).map(i=>[i.id,i]));
 const containers=rowsOf(docs,name('stock_containers')),C=Object.fromEntries(containers.map(c=>[c.id,c]));
 const from=m.range?.from||'0000-00-00',to=m.range?.to||'9999-99-99',inRange=t=>t.businessDate>=from&&t.businessDate<=to;
 // ---- A. Hao hụt ----
 const day={},item={},kinds={},findings=[];
 const bump=(o,k,f,v)=>{o[k]=o[k]||{legacyQty:0,legacyValue:0,e2Qty:0,e2Value:0,n:0};o[k][f]+=v;};
 for(const [src,rows] of [['nl',stock],['btp',prep]])for(const t of rows){
  if(t.type!=='WASTE'||!inRange(t))continue;
  const qty=Math.abs(Number(t.qty)||0),value=src==='nl'?qty*costOn(prices,items,t.itemId,t.businessDate):Math.abs(Number(t.totalCost)||0);
  const ik=src+':'+(t.itemId||t.prepId||'?');
  bump(day,t.businessDate,'legacyValue',value);bump(item,ik,'legacyQty',qty);bump(item,ik,'legacyValue',value);
  if(t.voided===true){findings.push({code:'PL_COUNTS_VOIDED_WASTE',ref:src+'/'+t.id,detail:{qty,value:r2(value)},message:'Sổ lãi/lỗ vẫn cộng dòng WASTE đã huỷ; Engine 2 không tính.'});continue;}
  bump(day,t.businessDate,'e2Value',value);bump(day,t.businessDate,'n',1);bump(item,ik,'e2Qty',qty);bump(item,ik,'e2Value',value);
  const k=src==='btp'?'btp':kindOf(t,C);kinds[k]=kinds[k]||{n:0,qty:{},value:0};kinds[k].n++;kinds[k].value+=value;
 }
 const dayRows=Object.entries(day).sort(([a],[b])=>a.localeCompare(b)).map(([d,x])=>({day:d,legacy:r2(x.legacyValue),engine2:r2(x.e2Value),diff:r2(x.e2Value-x.legacyValue),n:x.n}));
 const itemRows=Object.entries(item).map(([k,x])=>{const [src,id]=k.split(':');const meta=src==='nl'?items[id]:preps[id];return {src,id,name:meta?.name||id,unit:meta?.unit||'',legacyQty:r2(x.legacyQty),e2Qty:r2(x.e2Qty),legacy:r2(x.legacyValue),engine2:r2(x.e2Value),diff:r2(x.e2Value-x.legacyValue)};});
 const loss={legacyTotal:r2(dayRows.reduce((s,r)=>s+r.legacy,0)),engine2Total:r2(dayRows.reduce((s,r)=>s+r.engine2,0)),days:dayRows,items:itemRows,
  kinds:Object.fromEntries(Object.entries(kinds).map(([k,v])=>[k,{n:v.n,value:r2(v.value)}])),
  unexplained:dayRows.filter(r=>Math.abs(r.diff)>EPS&&!findings.some(f=>f.code==='PL_COUNTS_VOIDED_WASTE')).length};
 // ---- B. Tem = sự thật ----
 const RT=(dump.rt||{})[A.collName('active_units',store).replace('active_units_gieogieo','active_units_gieogieo')]||(dump.rt||{})[Object.keys(dump.rt||{})[0]]||{};
 const startMs=ms(m.startedAt),rtMs=ms(m.rtCapturedAt),tem=[];
 for(const it of Object.values(items)){
  if(it.trackingMode!=='unit'||it.stockManaged===false)continue;
  const rt=RT[it.id]||{};let sealed=0;const sealedById={};
  for(const c of containers)if(c.itemId===it.id&&c.status==='sealed'){const bq=Number(c.baseQty)||0;sealedById[c.id]=bq;sealed+=bq;}
  const carried=new Set();for(const u of Object.values(rt))for(const id of Object.keys((u&&u._fifoCarry&&u._fifoCarry.units)||{}))carried.add(id);
  let open=0;for(const [k,u] of Object.entries(rt)){if(k==='__prepLock')continue;if(sealedById[k]!==undefined)sealed-=sealedById[k];if(!u?.discardPending)open+=Number(u?.unitBase)||0;}
  let orphan=0;for(const c of containers){if(c.itemId!==it.id||c.status!=='open')continue;if(!rt[c.id]){if(!carried.has(c.id))orphan+=Number(c.unitBase)||0;}else if(c._ueRtStale)orphan+=(Number(c.unitBase)||0)-(Number(rt[c.id].unitBase)||0);}
  const computed=r2(sealed+open+orphan),book=Number(it.currentStock)||0,diff=r2(book-computed);
  // Bán / thao tác ghi sổ trong lúc xuất (sau khi đọc danh mục, trước khi chụp RT) — danh mục cũ hơn RT.
  const during=stock.filter(t=>t.itemId===it.id&&ms(t.createdAt)>startMs&&ms(t.createdAt)<=rtMs);
  const lastTx=stock.filter(t=>t.itemId===it.id&&ms(t.createdAt)<=startMs&&Number.isFinite(Number(t.resultingStock))).sort((a,b)=>ms(b.createdAt)-ms(a.createdAt))[0];
  tem.push({id:it.id,name:it.name,unit:it.unit,book,computed,diff,sealed:r2(sealed),open:r2(open),orphan:r2(orphan),
   ok:Math.abs(diff)<=EPS,duringExport:during.length,lastResultingStock:lastTx?Number(lastTx.resultingStock):null,
   flags:Object.fromEntries(['untrackedPendingDelta','temCutoverAt','unrefilledConsumption','pendingShortage'].filter(k=>it[k]!==undefined&&it[k]!==null&&it[k]!==0).map(k=>[k,it[k]]))});
 }
 return {store,range:m.range||null,exportSha256:m.sha256||null,loss,findings,tem:{items:tem.sort((a,b)=>Math.abs(b.diff)-Math.abs(a.diff)),ok:tem.filter(t=>t.ok).length,total:tem.length}};
}

function report(r){
 const fmt=n=>n===null||n===undefined?'—':Number(n).toLocaleString('vi-VN'),L=[];
 const kindName={bao_het:'Báo hết còn dư',can_ca:'Cân ca thiếu',huy_tem:'Huỷ tem (quét)',lech_che_bien:'Lệch khi chế biến (NL)',khai_huy:'Khai huỷ / hao hụt không gắn tem',khac:'Khác (NL)',btp:'BTP (prep_transactions)'};
 L.push('# Đối chiếu tương thích Engine 2 ↔ sổ hiện hành','',`Quán ${r.store} · ${r.range?r.range.from+' → '+r.range.to:''} · mã kiểm bản xuất \`${String(r.exportSha256||'').slice(0,16)}…\``,'',
  '## A. Hao hụt — Engine 2 so với sổ lãi/lỗ (cùng cách định giá cũ)','',
  `- Sổ lãi/lỗ: **${fmt(r.loss.legacyTotal)}đ** · Engine 2 (dòng còn hiệu lực, một nguồn): **${fmt(r.loss.engine2Total)}đ** · chênh **${fmt(r2(r.loss.engine2Total-r.loss.legacyTotal))}đ**.`,
  `- Ngày lệch chưa giải thích: **${r.loss.unexplained}** / ${r.loss.days.length} ngày có hao hụt.`,
  `- Phát hiện vốn có: ${r.findings.length?r.findings.length+' (xem cuối)':'không có trên dữ liệu này'} — sổ lãi/lỗ không lọc dòng WASTE đã huỷ (quy tắc được test giữ; dữ liệu này không có dòng nào như vậy).`,'',
  '| Loại khoản mất | Dòng | Giá trị (giá cũ) | Engine 2 hiện xử lý |','|---|---:|---:|---|');
 const scope={bao_het:'P0 — phân bổ + bật cân',can_ca:'P0 — lượt cân Engine 2 (từ nay); lịch sử: cân ca cũ',huy_tem:'Chưa (A2/P1)',lech_che_bien:'Chưa (B2 — family BTP)',khai_huy:'Chưa (A2/P1)',khac:'Chưa',btp:'Chưa (family BTP)'};
 for(const [k,v] of Object.entries(r.loss.kinds).sort((a,b)=>b[1].value-a[1].value))L.push(`| ${kindName[k]||k} | ${v.n} | ${fmt(v.value)}đ | ${scope[k]||''} |`);
 const badDays=r.loss.days.filter(d=>Math.abs(d.diff)>EPS);
 if(badDays.length){L.push('','| Ngày | Sổ lãi/lỗ | Engine 2 | Chênh |','|---|---:|---:|---:|');for(const d of badDays)L.push(`| ${d.day} | ${fmt(d.legacy)}đ | ${fmt(d.engine2)}đ | ${fmt(d.diff)}đ |`);}
 L.push('','## B. Tem = sự thật — tồn danh mục so với Σ tem (công thức Unit Engine v21)','',
  `- Khớp: **${r.tem.ok}/${r.tem.total}** nguyên liệu theo tem.`,
  '- Ảnh chụp không nguyên tử: danh mục đọc đầu lượt xuất, RT chụp cuối lượt; cột «ghi sổ trong lúc xuất» > 0 thì lệch có thể chỉ do bán xen giữa.','',
  '| Nguyên liệu | Tồn danh mục | Σ tem | Lệch | Tem nguyên | Tem mở (RT) | Mở thiếu RT | Ghi sổ trong lúc xuất | Dấu trạng thái |','|---|---:|---:|---:|---:|---:|---:|---:|---|');
 for(const t of r.tem.items.filter(t=>!t.ok))L.push(`| ${t.name} (${t.unit}) | ${fmt(t.book)} | ${fmt(t.computed)} | **${fmt(t.diff)}** | ${fmt(t.sealed)} | ${fmt(t.open)} | ${fmt(t.orphan)} | ${t.duringExport} | ${Object.keys(t.flags).join(', ')||'—'} |`);
 if(r.findings.length){L.push('','## Phát hiện','');for(const f of r.findings)L.push(`- ${f.code} · ${f.ref} — ${f.message} ${JSON.stringify(f.detail)}`);}
 return L.join('\n')+'\n';
}

if(require.main===module){
 const args=process.argv.slice(2),file=args.find(a=>!a.startsWith('--')),oi=args.indexOf('--out'),out=oi>=0?args[oi+1]:null;
 if(!file){console.error('Cách dùng: node tools/automation/engine2_compat.js <ban_kiem_toan_kho.json> [--out <thư mục>]');process.exit(2);}
 const r=compat(JSON.parse(fs.readFileSync(path.resolve(file),'utf8'))),md=report(r);
 if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'engine2_compat.json'),JSON.stringify(r,null,1));fs.writeFileSync(path.join(out,'engine2_compat.md'),md);}
 console.log(md);process.exit(r.loss.unexplained===0?0:1);
}
module.exports={compat,report,costOn};
