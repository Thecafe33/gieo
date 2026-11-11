'use strict';
// Đ0 (docs/KE_HOACH_TOI_UU_ENGINE2_11-11.md) — MỐC ĐO TẢI của Engine 2 bản đang chạy (cầu nối POS v4 + store v4), bằng mã thật trên
// Firebase giả (tools/automation/engine2_do_tai.js). Test này KHOÁ bốn ưu tiên của chủ dự án ở mức đo được và ghi mốc để các bản
// tối ưu sau (v5…) phải TỐT HƠN mốc, không được tệ đi:
//   1. Bán hàng: bán một bill → Engine 2 + worker không đọc / ghi gì.
//   2. Thời gian nhân viên: mỗi dòng cân Engine 2 chỉ được thêm một số vòng mạng có trần; không dòng nào bị POS tự ghi ở thế giới sạch.
//   (3, 4 — không luồng riêng, không giải thích — đã khoá ở engine2_pos_v4.test.js.)
const assert=require('node:assert');
const {run,report}=require('../tools/automation/engine2_do_tai');
const MOC={nhipThuongDoc:11,nhipThuongGhi:4,themMoiDongVong:4,themMoiDongDoc:11,dungDanhSachDoc:19,motQuanDoc:1810,motQuanGhi:650};
(async()=>{
 const r=await run({pos:'v4',store:'v4',cong:false});   // MỐC: cầu nối v4 + store v4 + nhịp kiểu cũ (mỗi quán mỗi nhịp)
 console.log(report(r).split('\n').map(l=>'   '+l).join('\n'));
 // Ưu tiên 1
 assert.deepEqual({reads:r.tinHieu.banMotBill.reads,writes:r.tinHieu.banMotBill.writes},{reads:0,writes:0},'bán một bill: trigger của Engine 2 / worker không được đọc hay ghi');
 console.log('ok 1. Bán một bill: Engine 2 + worker tự động hoá 0 lượt đọc, 0 lần ghi');
 // Ưu tiên 2
 assert.equal(r.ketCa.dongEngine2,7);assert.equal(r.ketCa.posTuGhi,0,'thế giới sạch: mọi dòng Engine 2 được giao lượt');assert.equal(r.ketCa.luotCanXong,7,'worker hoàn tất đủ 7 lượt cân');
 assert(r.ketCa.engine2ThemMoiDong.trips<=MOC.themMoiDongVong,'Engine 2 thêm mỗi dòng cân ≤ '+MOC.themMoiDongVong+' vòng mạng (đo: '+r.ketCa.engine2ThemMoiDong.trips.toFixed(1)+')');
 assert(r.ketCa.engine2ThemMoiDong.reads<=MOC.themMoiDongDoc,'Engine 2 thêm mỗi dòng cân ≤ '+MOC.themMoiDongDoc+' lượt đọc');
 assert(r.ketCa.dungDanhSach.reads<=MOC.dungDanhSachDoc,'dựng danh sách cân cuối ca ≤ '+MOC.dungDanhSachDoc+' lượt đọc');
 console.log('ok 2. Kết ca 7 dòng Engine 2: không dòng nào POS tự ghi; Engine 2 thêm '+r.ketCa.engine2ThemMoiDong.trips.toFixed(1)+' vòng mạng / dòng (mốc ≤ '+MOC.themMoiDongVong+')');
 // Chi phí: không được tệ hơn mốc
 assert(r.nhipAm.nhipThuong.reads<=MOC.nhipThuongDoc&&r.nhipAm.nhipThuong.writes<=MOC.nhipThuongGhi,'một nhịp không việc ≤ mốc '+MOC.nhipThuongDoc+' đọc / '+MOC.nhipThuongGhi+' ghi');
 assert(r.motQuanMotNgay.tong.reads<=MOC.motQuanDoc*1.02&&r.motQuanMotNgay.tong.writes<=MOC.motQuanGhi*1.02,'một quán / ngày ≤ mốc '+MOC.motQuanDoc+' đọc / '+MOC.motQuanGhi+' ghi (đo: '+Math.round(r.motQuanMotNgay.tong.reads)+' / '+Math.round(r.motQuanMotNgay.tong.writes)+')');
 console.log('ok 3. Mốc v4: nhịp không việc '+r.nhipAm.nhipThuong.reads+' đọc / '+r.nhipAm.nhipThuong.writes+' ghi; một quán / ngày '+Math.round(r.motQuanMotNgay.tong.reads)+' đọc / '+Math.round(r.motQuanMotNgay.tong.writes)+' ghi ('+Math.round(r.motQuanMotNgay.tiLeKhongViec.reads*100)+'% đọc là «không có việc»)');
 // Bản hiện hành (cầu nối v5 + store v5 + cổng tín hiệu) phải TỐT HƠN mốc ở mọi mục, và giữ ưu tiên 1.
 const n=await run({pos:'v5',store:'v5'});
 assert.deepEqual({reads:n.tinHieu.banMotBill.reads,writes:n.tinHieu.banMotBill.writes},{reads:0,writes:0});
 assert.equal(n.ketCa.posTuGhi,0);assert.equal(n.ketCa.luotCanXong,7);
 assert(n.ketCa.engine2ThemMoiDong.trips<r.ketCa.engine2ThemMoiDong.trips/3,'kết ca: Engine 2 thêm vòng mạng mỗi dòng giảm hơn 3 lần');
 assert(n.motQuanMotNgay.tong.reads<r.motQuanMotNgay.tong.reads*0.55&&n.motQuanMotNgay.tong.writes<r.motQuanMotNgay.tong.writes*0.7,'một quán / ngày: đọc < 55%, ghi < 70% mốc');
 assert.equal(n.nhipLanh.tong.reads,n.nhipAm.tong.reads,'A1: instance lạnh không còn quét lặp');
 console.log('ok 4. Bản hiện hành (v5 + cổng tín hiệu): một quán / ngày '+Math.round(n.motQuanMotNgay.tong.reads)+' đọc / '+Math.round(n.motQuanMotNgay.tong.writes)+' ghi (mốc '+Math.round(r.motQuanMotNgay.tong.reads)+' / '+Math.round(r.motQuanMotNgay.tong.writes)+'); Engine 2 thêm '+n.ketCa.engine2ThemMoiDong.trips.toFixed(1)+' vòng mạng / dòng cân (mốc '+r.ketCa.engine2ThemMoiDong.trips.toFixed(1)+'); instance lạnh = ấm');
 console.log('ALL PASS');
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
