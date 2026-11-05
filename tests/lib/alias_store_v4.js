'use strict';
// Chạy các test viết cho unit_engine2_store_v1 / v2 / v3 trên unit_engine2_store_v4 (dùng: node -r ./lib/alias_store_v4.js <test>).
const Module=require('module'),orig=Module._resolveFilename;
Module._resolveFilename=function(request,...rest){
 if(/unit_engine2_store_v[123](?:\.js)?$/.test(request))request=request.replace(/unit_engine2_store_v[123]/,'unit_engine2_store_v4');
 return orig.call(this,request,...rest);
};
