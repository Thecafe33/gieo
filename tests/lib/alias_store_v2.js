'use strict';
// Chạy các test viết cho unit_engine2_store_v1 trên unit_engine2_store_v2 (dùng: node -r ./lib/alias_store_v2.js <test>). v2 = v1 + nhân sự.
const Module=require('module'),orig=Module._resolveFilename;
Module._resolveFilename=function(request,...rest){
 if(/unit_engine2_store_v1(?:\.js)?$/.test(request))request=request.replace('unit_engine2_store_v1','unit_engine2_store_v2');
 return orig.call(this,request,...rest);
};
