'use strict';
// Chạy các test viết cho unit_engine2_store_v1 / v2 trên unit_engine2_store_v3 (dùng: node -r ./lib/alias_store_v3.js <test>).
// v3 = v2 + giao tiếp POS (bì bao gói gốc, posFallback, heartbeat) — mọi hành vi đã kiểm của v1 / v2 phải giữ nguyên.
const Module=require('module'),orig=Module._resolveFilename;
Module._resolveFilename=function(request,...rest){
 if(/unit_engine2_store_v[12](?:\.js)?$/.test(request))request=request.replace(/unit_engine2_store_v[12]/,'unit_engine2_store_v3');
 return orig.call(this,request,...rest);
};
