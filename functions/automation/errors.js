'use strict';
const {createHash}=require('node:crypto');
const errorRef=(root,path)=>root.collection('errors').doc(createHash('sha256').update(path).digest('hex'));
async function readError(tx,root,path){
 const ref=errorRef(root,path),snap=await tx.get(ref);
 return {root,ref,path,previous:snap.exists?snap.data():null};
}
// Call after ALL transaction reads. Repeated failures/recoveries change the count
// only when the individual source crosses the active/inactive boundary.
function writeError(tx,state,summary,message,at){
 const active=!!message,wasActive=state.previous?.active===true;
 if(!active&&!wasActive)return false;
 const count=Math.max(0,(Number(summary.sourceErrorCount)||0)+(active?1:0)-(wasActive?1:0));
 tx.set(state.ref,{path:state.path,kind:state.path.startsWith(state.root.path+'/jobs/')?'job':'source',active,message:String(message||'').slice(0,800),at});
 tx.set(state.root,{sourceErrorCount:count,errorRevision:(Number(summary.errorRevision)||0)+1,
  ...(!summary.errorStateVersion&&!summary.legacyErrorCaptured?{legacyErrorCaptured:true,legacySourceError:summary.lastSourceError||null}:{}),
  lastSourceError:active?{path:state.path,message:String(message).slice(0,800),at}:count?{path:'',message:count+' nguồn công việc còn lỗi; đang chờ thử lại.',at}:null},{merge:true});
 return true;
}
async function setError(db,root,path,message,at){
 return db.runTransaction(async tx=>{const state=await readError(tx,root,path);if(!message&&!state.previous?.active)return false;const sum=await tx.get(root);return writeError(tx,state,sum.exists?sum.data():{},message,at);});
}
module.exports={readError,writeError,setError,errorRef};
