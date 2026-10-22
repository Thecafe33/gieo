// Print indexes to merge with the project's existing indexes, never replace them.
// Usage: node tools/automation/indexes.js gg01 gg02 > /tmp/gieo-automation-indexes.json
const A=require('../../gieo_automation.v3.js');
const stores=process.argv.slice(2);if(!stores.length)stores.push('gg01');
const index=(collectionGroup,fields)=>({collectionGroup,queryScope:'COLLECTION',fields:fields.map(([fieldPath,order])=>({fieldPath,order}))});
const indexes=[index('cases',[['interval.to','ASCENDING'],['interval.from','ASCENDING']]),index('cases',[['group','ASCENDING'],['visible','ASCENDING'],['updatedAt','DESCENDING']]),index('jobs',[['dirty','ASCENDING'],['nextTryAt','ASCENDING']])];
indexes.push(index('requests',[['dirty','ASCENDING'],['nextTryAt','ASCENDING']]),index('tasks',[['pending','ASCENDING'],['createdAt','DESCENDING']]),index('tasks',[['itemId','ASCENDING'],['pending','ASCENDING']]));
for(const store of stores)for(const kind of ['stock_transactions','prep_transactions'])indexes.push(index(A.collection(kind,store),[['type','ASCENDING'],['businessDate','ASCENDING']]));
for(const store of stores)indexes.push(index(A.collection('employee_shifts',store),[['employeeId','ASCENDING'],['checkedInAt','ASCENDING']]));
console.log(JSON.stringify({indexes,fieldOverrides:[]},null,2));
