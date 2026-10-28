// Generated server policy is byte-identical to the script loaded by quanlygieo2.
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'functions/automation/shared');
fs.mkdirSync(out,{recursive:true});
fs.copyFileSync(path.join(root,'gieo_automation.v3.js'),path.join(out,'gieo_automation.v3.js'));

fs.copyFileSync(path.join(root,'unit_engine.v20.js'),path.join(out,'unit_engine.v20.js'));
for(const f of ['unit_engine.v21.js','unit_engine2_v1.js','unit_engine2_store_v1.js','unit_engine2_store_v2.js','unit_engine2_staffing_v1.js','unit_engine2_learn_v1.js','unit_engine2_obs_v1.js','unit_engine2_params_v1.js'].filter(f=>fs.existsSync(path.join(root,f))))fs.copyFileSync(path.join(root,f),path.join(out,f));
