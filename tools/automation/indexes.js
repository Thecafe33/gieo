// Print indexes to merge with the project's existing indexes, never replace them.
// Usage: node tools/automation/indexes.js gg01 gg02 > /tmp/gieo-automation-indexes.json
const A=require('../../gieo_automation.v1.js');
const stores=process.argv.slice(2);if(!stores.length)stores.push('gg01');
const index=(collectionGroup,fields)=>({collectionGroup,queryScope:'COLLECTION',fields:fields.map(([fieldPath,order])=>({fieldPath,order}))});
const indexes=[index('cases',[['group','ASCENDING'],['visible','ASCENDING'],['updatedAt','DESCENDING']]),index('jobs',[['dirty','ASCENDING'],['nextTryAt','ASCENDING']])];
for(const store of stores)for(const kind of ['stock_transactions','prep_transactions'])indexes.push(index(A.collection(kind,store),[['type','ASCENDING'],['businessDate','ASCENDING']]));
console.log(JSON.stringify({indexes,fieldOverrides:[]},null,2));
