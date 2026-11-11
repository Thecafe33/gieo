'use strict';
// Chạy các test viết cho unit_engine2_store_v1 … v4 trên unit_engine2_store_v5 (dùng: node -r ./lib/alias_store_v5.js <test>).
const Module=require('module'),orig=Module._resolveFilename;
Module._resolveFilename=function(request,...rest){
 if(/unit_engine2_store_v[1234](?:\.js)?$/.test(request))request=request.replace(/unit_engine2_store_v[1234]/,'unit_engine2_store_v5');
 return orig.call(this,request,...rest);
};
