/* Unit Engine 2 — nhân sự & «không làm việc gì hai lần» v1 (28/10/2026). Thuần: không Firebase, không DOM; POS và worker cùng byte.
 *
 * Nguyên tắc chủ quán chốt (28/10):
 *  - Quán chỉ có MỘT người vận hành xuyên suốt là MÔ HÌNH CHỦ ĐÍCH (tinh gọn), KHÔNG phải «thiếu nhân sự»: không gắn nhãn thiếu, không cảnh báo.
 *    Engine 2 nhận ra mô hình từ ca thật theo từng quán và tự chuyển khi có người thứ hai làm việc.
 *  - Không bắt nhân viên làm việc thừa: người mở ca = người kết ca hôm trước thì KHÔNG yêu cầu cân bất cứ thứ gì ở đầu ca
 *    (cuối ca đã cân hết; cân lại chính người đó chỉ thêm công, không thêm thông tin độc lập).
 *  - Cân độc lập (M3) chỉ có nghĩa khi có NGƯỜI KHÁC cân: không tạo việc không thể hoàn thành; ở mô hình một người dựa vào
 *    bằng chứng khách quan (cân vật mẫu, số học tem, phiếu nhận hàng), không tuyên bố «xác nhận độc lập về người».
 *  - Cân ngẫu nhiên M0 ưu tiên món ĐÃ nằm sẵn trong danh sách cân bắt buộc cuối ca (không tốn thêm lần cân nào).
 * Bản đã phát hành bất biến: sửa sau deploy = unit_engine2_staffing_v2.js. */
(function(root){
'use strict';
const VERSION=1;
const DAY_MS=86400000;
// Cùng định nghĩa với unit_engine2_v1.isBarista: ca KHÔNG ghi chức năng (thiếu/rỗng) = pha chế; có ghi thì theo đúng chức năng.
const isBarista=s=>!!s&&(!Array.isArray(s.roles)||!s.roles.length||s.roles.includes('barista'));
const ms=x=>typeof x==='number'?x:Date.parse(x||'');
const ids=list=>[...new Set(list.filter(Boolean))];

/* Mô hình vận hành theo ca thật. `shifts`: ca (employeeId, roles, checkedInAt, checkedOutAt) trong cửa sổ gần đây.
 * 'single' = trong `recentDays` ngày gần nhất chỉ MỘT pha chế làm việc; 'multi' = từ hai người; 'unknown' = chưa có ca pha chế nào.
 * Chỉ nhìn người đang làm gần đây: người đã nghỉ từ lâu không giữ quán ở mô hình nhiều người; người mới làm một ca là chuyển ngay. */
function operatingModel(shifts,opts={}){
 const now=opts.now??Date.now(),recentDays=opts.recentDays??14,windowDays=opts.windowDays??28;
 const from=now-windowDays*DAY_MS,recentFrom=now-recentDays*DAY_MS;
 const inWindow=(shifts||[]).filter(s=>s&&s.employeeId&&isBarista(s)&&ms(s.checkedInAt)>=from);
 const recent=inWindow.filter(s=>ms(s.checkedInAt)>=recentFrom);
 const hours={};for(const s of inWindow){const a=ms(s.checkedInAt),b=Number.isFinite(ms(s.checkedOutAt))?ms(s.checkedOutAt):a;hours[s.employeeId]=(hours[s.employeeId]||0)+Math.max(0,b-a)/3600000;}
 const people=ids(inWindow.map(s=>s.employeeId)).map(id=>({id,hours:Math.round((hours[id]||0)*10)/10}));
 const recentIds=ids(recent.map(s=>s.employeeId));
 const model=recentIds.length>=2?'multi':recentIds.length===1?'single':'unknown';
 return {model,recentIds,people,windowDays,recentDays,shifts:inWindow.length};
}

/* Người kết ca của một ngày = pha chế có giờ ra muộn nhất (chưa check-out thì tính giờ vào). Rỗng nếu ngày đó không có ca pha chế. */
function lastCloser(dayShifts){
 let best=null,bestAt=-Infinity;
 for(const s of dayShifts||[]){
  if(!s||!s.employeeId||!isBarista(s))continue;
  const at=Number.isFinite(ms(s.checkedOutAt))?ms(s.checkedOutAt):ms(s.checkedInAt);
  if(Number.isFinite(at)&&at>=bestAt){best=s.employeeId;bestAt=at;}
 }
 return best||'';
}
/* Người đang có ca MỞ (chưa check-out) hôm nay và làm được việc pha chế. */
function openBaristas(todayShifts){return ids((todayShifts||[]).filter(s=>s&&!s.checkedOutAt&&isBarista(s)).map(s=>s.employeeId));}
/* Đầu ca mà người mở ca duy nhất chính là người kết ca hôm trước → không được yêu cầu cân bất cứ thứ gì.
 * Thận trọng: chưa biết ai mở (không ai check-in) hoặc có từ hai người đang làm → KHÔNG bỏ (hỏi như thường). */
function sameOperator(openers,closer){return !!closer&&Array.isArray(openers)&&openers.length===1&&openers[0]===closer;}
/* Cân độc lập (M3) làm được khi có ít nhất một người đang mở ca KHÁC người cân trước. */
function independentPossible(openers,excludeId){
 if(!Array.isArray(openers)||!openers.length)return false;
 return !excludeId||openers.some(id=>id!==excludeId);
}

/* Chọn món cân ngẫu nhiên M0. `pool`: món có thể lấy mẫu (đã lọc điều kiện loại trừ). Ưu tiên món ĐÃ có trong danh sách cân bắt buộc
 * (`mandatory`) — lấy mẫu mà không tốn thêm lần cân nào. Chỉ khi không chọn được món nào như vậy mới thêm tối đa `extra` món ngoài danh sách.
 * Xoay vòng: món lâu chưa lấy mẫu trước, hòa thì món dùng nhiều trước. Trả {ids, extraIds} (extraIds = phần phải thêm dòng cân mới). */
function pickM0({pool,mandatory,lastM0={},act={},budget=2,extra=1}){
 const order=list=>[...list].sort((a,b)=>String(lastM0[a]||'').localeCompare(String(lastM0[b]||''))||(act[b]||0)-(act[a]||0)||String(a).localeCompare(String(b)));
 const inList=new Set(mandatory||[]),all=[...pool];
 const free=order(all.filter(id=>inList.has(id))).slice(0,Math.max(0,budget));
 const extraIds=free.length?[]:order(all.filter(id=>!inList.has(id))).slice(0,Math.max(0,Math.min(budget,extra)));
 return {ids:[...free,...extraIds],extraIds};
}

const api={VERSION,isBarista,operatingModel,lastCloser,openBaristas,sameOperator,independentPossible,pickM0};
if(typeof module==='object'&&module.exports)module.exports=api;root.UnitEngine2Staffing=api;
})(typeof window!=='undefined'?window:globalThis);
