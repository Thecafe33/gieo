// Gợi ý đặt hàng (quanlygieo Kho ▸ Đặt hàng, [GỢI-Ý-ĐẶT], mẫu duyệt v5 19/11): hàm thuần gydTinh lấy từ quanlygieo.html.
// Chủ dự án chốt: đặt ngày nào hàng về ngày đó; đơn tuần đặt thứ Hai, đủ dùng thứ Hai → Chủ nhật; đặt lẻ = món không đủ tới thứ Hai.
'use strict';
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const src = extract('quanlygieo.html', ['gydTinh']);
const GYD = { soNgay: 28, z90: 1.2816, thuDat: 1 };
const gydTinh = new Function('GYD', src + '\nreturn gydTinh;')(GYD);

// 29 ngày (28 ngày qua + hôm nay). luong(dow, i) = lượng dùng của ngày đó; hôm nay dùng `homNay`.
function ngay(todayDow, luong, homNay) {
  const days = [];
  for (let i = 0; i <= 28; i++) {
    const dow = ((todayDow - (28 - i)) % 7 + 7) % 7, key = 'k' + String(i).padStart(2, '0');
    days.push({ key, dow, q: i === 28 ? { a: homNay } : { a: luong(dow, i) } });
  }
  return { days, todayKey: 'k28', todayDow };
}
const chay = (o) => {
  const base = ngay(o.dow == null ? 4 : o.dow, o.luong || (() => 1000), o.homNay == null ? 400 : o.homNay);
  return gydTinh(Object.assign(base, {
    items: [Object.assign({ id: 'a', name: 'Sữa', unit: 'ml', stock: 3000, min: 0 }, o.item || {})],
    incoming: o.incoming || {}, e2: o.e2 || {}, pack: o.pack || {}
  }));
};
const tuan = r => (r.week.can[0] || { packs: 0 }).packs, le = r => (r.day.can[0] || { packs: 0 }).packs;

// Thứ Năm, dùng đều 1.000/ngày, hôm nay đã dùng 400 → còn 600 hôm nay; tới thứ Hai cần 600 + T6 T7 CN = 3.600.
let r = chay({});
eq([r.toiThu2, le(r), tuan(r)], [4, 600, 7000], 'T5: đặt lẻ 600 (3.600 − 3.000); đơn thứ Hai = đủ 7 ngày T2→CN (về lúc đặt = 0)');
r = chay({ pack: { a: { factor: 1000, name: 'hộp' } } });
eq([le(r), tuan(r), r.week.can[0].packName, r.week.can[0].factor], [1, 7, 'hộp', 1000], 'làm tròn LÊN theo quy cách đặt');
r = chay({ incoming: { a: 1000 } });
eq([r.day.can.length, r.day.du.length, tuan(r)], [0, 1, 6600], 'đơn chưa nhận đủ tính vào «có»: đủ tới thứ Hai, đơn tuần bớt 400');
r = chay({ item: { min: 5000 } });
eq(tuan(r), 12000, 'đơn tuần không thấp hơn tồn tối thiểu (7.000 + dự trữ 5.000)');
eq(le(r), 600, 'đặt lẻ không cộng tồn tối thiểu — chỉ cầm cự tới thứ Hai');
r = chay({ e2: { a: { estimate: 0.1, high: 0.2 } } });
eq(tuan(r), 9100, 'Engine 2: dùng ×(1+hao hụt thường) + dự trữ = hao hụt mức cao × chu kỳ (7.700 + 1.400)');
eq(le(r), Math.ceil(3600 * 1.1 + 0.2 * 3600 - 3000), 'Engine 2 cũng vào đặt lẻ');
// Thứ Hai: chính là ngày đặt đơn tuần → không có đặt lẻ; chu kỳ = phần còn lại hôm nay + T3..CN.
r = chay({ dow: 1 });
eq([r.toiThu2, r.day.can.length + r.day.du.length, tuan(r)], [0, 0, 600 + 6000 - 3000], 'thứ Hai: không có đặt lẻ, đơn = còn hôm nay + 6 ngày − tồn');
// Theo TỪNG THỨ: cuối tuần dùng nhiều hơn.
r = chay({ luong: d => (d === 0 || d === 6) ? 3000 : 1000, homNay: 0 });
eq(le(r), 1000 + 1000 + 3000 + 3000 - 3000, 'trung bình theo từng thứ (T5 1.000, T6 1.000, T7 3.000, CN 3.000)');
// Ngày quán không dùng gì (đóng cửa) không kéo trung bình xuống.
r = chay({ luong: (d, i) => i % 7 === 0 ? 0 : 1000 });
eq([le(r), tuan(r)], [600, 7000], 'ngày không có dùng bị loại khỏi trung bình');
// Không dùng trong 28 ngày, không khai tồn tối thiểu → không đưa vào; có tồn tối thiểu → xét theo ngưỡng.
r = chay({ luong: () => 0, homNay: 0, item: { min: 0 } });
eq([r.week.can.length, r.week.du.length], [0, 0], 'không dùng + không định mức → bỏ qua');
r = chay({ luong: () => 0, homNay: 0, item: { min: 5000 } });
eq(tuan(r), 2000, 'không dùng nhưng có tồn tối thiểu 5.000 mà còn 3.000 → mua 2.000');
r = chay({ luong: () => 0, homNay: 0, item: { min: 2000 } });
eq([r.week.can.length, r.week.du.length], [0, 1], 'còn trên tồn tối thiểu → đủ');
// Có dao động → dự trữ > 0.
r = chay({ luong: (d, i) => i % 2 ? 1400 : 600 });
eq(tuan(r) > 7000, true, 'ngày dao động → đơn tuần có thêm dự trữ');
// Hai nhóm xếp theo tên.
const nhieu = gydTinh(Object.assign(ngay(4, () => 1000, 0), { items: [
  { id: 'b', name: 'Trà', unit: 'g', stock: 99999, min: 0 }, { id: 'a', name: 'Ống hút', unit: 'cái', stock: 0, min: 0 }, { id: 'c', name: 'Bột', unit: 'g', stock: 0, min: 0 }
], incoming: {}, e2: {}, pack: {} }));
// mọi item dùng q.a → chỉ 'a' có lượng dùng; b, c không dùng, không định mức → bỏ qua
eq(nhieu.week.can.map(x => x.id), ['a'], 'chỉ món có dùng hoặc có tồn tối thiểu');

console.log(ok ? 'ALL PASS' : 'SOME FAIL');
process.exit(ok ? 0 : 1);
