// Generated server policy is byte-identical to the script loaded by quanlygieo2.
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'functions/automation/shared');
fs.mkdirSync(out,{recursive:true});
fs.copyFileSync(path.join(root,'gieo_automation.v2.js'),path.join(out,'gieo_automation.v2.js'));

fs.copyFileSync(path.join(root,'unit_engine.v20.js'),path.join(out,'unit_engine.v20.js'));
