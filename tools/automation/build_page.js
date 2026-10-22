// quanlygieo2 is a second entry point over the existing app, not a fork of its business logic.
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'../..');
let s=fs.readFileSync(path.join(root,'quanlygieo.html'),'utf8');
for(const name of ['renderStoreHealth','renderAlertInbox','renderTodayHealthInbox','reloadCurrent','_expWriteDone','_ctnDetailRender']){
 if(!s.includes('function '+name+'('))throw Error('Thiếu điểm ghép '+name);
 s=s.replace('function '+name+'(','function '+name+'Legacy(');
}
s=s.replace('<script src="unit_engine.v21.js"></script>','<script src="unit_engine.v21.js"></script>\n<script src="gieo_automation.v3.js"></script>\n<script src="unit_engine2_v1.js"></script>\n<script src="unit_engine2_store_v1.js"></script>');
s=s.replace('</style>',fs.readFileSync(path.join(__dirname,'ui.css'),'utf8')+'</style>');
s=s.replace('</body>','<script>\n'+fs.readFileSync(path.join(__dirname,'ui.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'engine2_ui.js'),'utf8')+'\n</script>\n</body>');
s=s.replace('Chịu trách nhiệm: người báo</span>',"Người ghi nhận: ${escapeHtmlAttr(t.staff||'Chưa rõ')}</span>");
fs.writeFileSync(path.join(root,'quanlygieo2.html'),s);
