'use strict';
// Chạy test cũ (store v1/v2/v3) trên store v4 với công tắc legacyWeighTasks ÉP BẬT (chỉ trong test): v4 khi bật lại việc cũ phải hành
// xử giống hệt bản cũ — chứng minh F1 chỉ tắt đúng các việc baseline~ / handover~ / opened~. Phần mặc định (tắt) kiểm ở unit_engine2_store_v4.test.js.
const Module=require('module'),fs=require('fs'),path=require('path'),orig=Module._resolveFilename;
const V4=path.resolve(__dirname,'../../unit_engine2_store_v4.js');
Module._resolveFilename=function(request,...rest){
 if(/unit_engine2_store_v[1234](?:\.js)?$/.test(request))return V4;
 return orig.call(this,request,...rest);
};
const load=Module._extensions['.js'];
Module._extensions['.js']=function(mod,file){
 if(path.resolve(file)!==V4)return load(mod,file);
 const src=fs.readFileSync(file,'utf8'),on=src.replace(/[\w$.]+\.legacyWeighTasks===true/g,'true').replace(/[\w$.]+\.legacyWeighTasks!==true/g,'false');
 if(on===src)throw Error('alias legacy: không thấy công tắc legacyWeighTasks');
 mod._compile(on,file);
};
