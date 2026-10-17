// Phân nhóm hồ sơ điểm bán không thay check-in/lương. Kiểm ghi metadata và tương thích hồ sơ cũ.
'use strict';
const assert=require('assert');const {extract}=require('./lib/extract');
const names=['nvStoreIds','nvStoreOptions','submitEmployeeForm'];
const source=extract('quanlygieo.html',names);
function env({editing=null,checked=['gg01','gg02']}={}){
 const writes=[],messages=[];
 const vals={nvFullName:'Lan',nvPin:'1234',nvPayType:'hourly_part',nvHourlyRate:'25000',nvOtEnabled:false,nvPayFrom:'2026-10-17'};
 const document={getElementById:id=>id in vals?{value:vals[id],checked:vals[id]===true}:null,querySelectorAll:()=>checked.map(value=>({value}))};
 const cur={id:'e1',fullName:'Cũ',pin:'1234',homeStore:'gg01',payType:'hourly_part',hourlyRate:25000,otEnabled:false,otThresholdHours:0,otRate:0,fixedMonthlySalary:0,payHistory:[{effectiveFrom:'2026-01-01',hourlyRate:25000}]};
 const setup={document,nvEditingId:editing,nvEmployeesCache:[cur],nvFormDraft:{},NV_ROLES:[],QL_ALL:false,QL_VIEW:'gg01',
 qlActiveStores:()=>[{id:'gg01'},{id:'gg02'}],qlStoreName:id=>id,toast:s=>messages.push(s),logAudit(){},renderEntryNv(){},dkey:()=> '2026-10-17',
 payTermsOfRecord:e=>Object.fromEntries(['payType','hourlyRate','fixedMonthlySalary','otEnabled','otThresholdHours','otRate'].map(k=>[k,e[k]])),
 PAY_FIELDS:['payType','hourlyRate','fixedMonthlySalary','otEnabled','otThresholdHours','otRate'],
 addEmployee:async(...args)=>{writes.push(args);return{id:'new'}},updateEmployee:async(...args)=>writes.push(args)};
 const api=new Function(...Object.keys(setup),source+'\nreturn {nvStoreIds,nvStoreOptions,submitEmployeeForm};')(...Object.values(setup));
 return {...api,writes,messages,cur};
}
(async()=>{
 let e=env();assert.deepStrictEqual(e.nvStoreIds(null),['gg01']);assert.deepStrictEqual(e.nvStoreIds({homeStore:'gg02'}),['gg02']);
 assert.deepStrictEqual(e.nvStoreIds({storeTags:['gg02','gg02','tc33',null,2]}),['gg02']);
 assert.deepStrictEqual(e.nvStoreIds({storeTags:[]}),['gg01']);console.log('ok hồ sơ cũ / dữ liệu sai kiểu / trùng điểm bán');
 assert.deepStrictEqual(e.nvStoreOptions(['gg03']).map(x=>x.id),['gg01','gg02','gg03']);console.log('ok giữ điểm đã gắn ngay cả khi điểm không còn active');
 await e.submitEmployeeForm();assert.strictEqual(e.writes.length,1);assert.deepStrictEqual(e.writes[0][2].storeTags,['gg01','gg02']);assert.strictEqual(e.writes[0][2].hourlyRate,25000);assert.ok(!('homeStore' in e.writes[0][2]));console.log('ok tạo hồ sơ lưu phân nhóm, không tự đổi quán phân bổ lương');
 e=env({editing:'e1'});await e.submitEmployeeForm();assert.strictEqual(e.writes.length,1);assert.deepStrictEqual(e.writes[0][3].storeTags,['gg01','gg02']);assert.ok(!('payHistory' in e.writes[0][3]));console.log('ok chỉ đổi phân nhóm không thêm mốc lương hoặc sửa lịch sử');
 e=env({checked:[]});await e.submitEmployeeForm();assert.strictEqual(e.writes.length,0);assert.ok(e.messages[0].includes('ít nhất một'));console.log('ok không ghi khi bỏ hết điểm bán');
 e=env({checked:['gg99']});await e.submitEmployeeForm();assert.strictEqual(e.writes.length,0);console.log('ok không ghi điểm bán không tồn tại');
 console.log('ALL PASS');
})().catch(e=>{console.error('FAIL',e);process.exit(1)});
