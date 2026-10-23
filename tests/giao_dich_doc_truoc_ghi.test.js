'use strict';
// Firestore thật từ chối transaction có lượt ĐỌC sau lượt GHI. Fake (tests/lib/fakefb.js) nay cũng từ chối (chạy thật trong các test
// Engine 2); test này quét tĩnh mọi runTransaction của store Engine 2 + kho v21 để bắt cả nhánh test không đi tới.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert');
function scan(file){
 const s=fs.readFileSync(path.join(__dirname,'..',file),'utf8'),bad=[];let i=0;
 while((i=s.indexOf('runTransaction(',i))>=0){
  let d=0,j=i+'runTransaction'.length;const st=j;
  for(;j<s.length;j++){if(s[j]==='(')d++;else if(s[j]===')'){d--;if(!d)break;}}
  const body=s.slice(st,j),wr=body.search(/\bt\.(set|update|delete)\(|\bsettle\(t/),re=/\bt\.get\(/g;let m;
  while((m=re.exec(body))){if(wr>=0&&m.index>wr){bad.push(file+':'+s.slice(0,i).split('\n').length);break;}}
  i=j;
 }
 return bad;
}
const bad=['unit_engine2_store_v1.js','unit_engine.v21.js','unit_engine2_v1.js'].flatMap(scan);
assert.deepEqual(bad,[],'transaction đọc sau ghi: '+bad.join(', '));
// Bộ quét phải bắt được lỗi cũ (chống quét hỏng im lặng).
const tmp=path.join(__dirname,'..','.tx_probe.tmp.js');
fs.writeFileSync(tmp,"fs.runTransaction(async t=>{t.set(a,1);const x=await t.get(b);});");
try{assert.equal(scan('.tx_probe.tmp.js').length,1);}finally{fs.unlinkSync(tmp);}
console.log('ok Không transaction nào đọc sau ghi; bộ quét bắt được ca mẫu');
console.log('ALL PASS');
