// T3 tối ưu đọc (docs/KE_HOACH_TOI_UU_DOC.md): danh sách gợi ý SĐT ở POS — chỉ nạp khi vào màn thanh toán,
// gọi trùng dùng chung một lượt, giữ trong máy và làm mới tối đa 1 lần/ngày. Tem / ly miễn phí không lấy từ đây.
const fs = require('fs'), path = require('path');
const { extract } = require('./lib/extract');
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) fail = 1; };

const html = fs.readFileSync(path.join(__dirname, '..', 'posgieo.html'), 'utf8');
const src = extract('posgieo.html', ['_custAcSave', '_custAcPack', '_custAcUnpack', 'fetchAllCustomersCache']);

function mayPos(ls, khach, homNay) {
  const st = { reads: 0, goi: 0, hoan: [] };
  // Bản dùng chung cả chuỗi (10/10): ở đây luôn CHƯA có bản hôm nay → rơi xuống đọc cả bảng như trước (ca có bản dùng chung: da_cua_hang_mo_quan.test.js).
  const chung = { doc: () => ({ get: async () => ({ exists: false }), set: async () => {} }) };
  const fstore = { collection: (c) => c === 'customer_ac_cache_gieogieo' ? chung : ({ get: () => { st.goi++; return new Promise(res => st.hoan.push(() => { st.reads += Math.max(1, khach.length);
    res({ forEach: f => khach.forEach(k => f({ id: k.id, data: () => k })) }); })); } }) };
  const ctx = { fstore, localStorage: ls, posDateKey: () => homNay.v, console: { error() {}, warn() {} }, TextEncoder };
  const F = new Function('ctx', 'with (ctx) { let allCustomersCache = []; const CUST_AC_LS = "custAc_gieogieo_v1"; const CUST_AC_SHARED = "customer_ac_cache_gieogieo"; const CUST_AC_MAX_BYTES = 900000; let _custAcDay = null; let _custAcLoading = null;\n' + src +
    '\n return { fetchAllCustomersCache, list: () => allCustomersCache, them: e => { allCustomersCache.unshift(e); _custAcSave(); } }; }')(ctx);
  const nhip = () => new Promise(r => setTimeout(r, 0));
  st.xong = async () => { await nhip(); while (st.hoan.length) { st.hoan.shift()(); await nhip(); } };   // đọc doc dùng chung trước, rồi mới tới bảng khách
  return { F, st };
}
const lsMoi = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, _m: m }; };
const khach = [
  { id: '0901', nickname: 'An', name: 'An', total_points: 5, stamp_count: 3, free_drink_available: 1, assist_profile: { x: 'nặng' } },
  { id: '0902', name: 'Bình', total_points: 50 },
  { id: '0903', nickname: 'Cúc' }
];

(async () => {
  // Code: không còn tự tải lúc mở app; vào màn thanh toán mới tải; thêm khách mới thì lưu lại bản gợi ý.
  ok(!/setTimeout\(\s*fetchAllCustomersCache/.test(html), 'mở app không còn tự đọc toàn bộ customers');
  const sc = extract('posgieo.html', ['showScreen']);
  ok(/if \(id === 'sc'\) \{[^}]*fetchAllCustomersCache\(\)/.test(sc), "showScreen('sc') nạp gợi ý SĐT");
  const add = extract('posgieo.html', ['confirmAddMember']);
  ok(/allCustomersCache\.unshift\(newEntry\);\s*_custAcSave\(\)/.test(add), 'tạo khách mới → lưu luôn vào bản gợi ý trong máy');
  const look = extract('posgieo.html', ['lookupCustomer']);
  ok(/fstore\.collection\('customers'\)\.doc\(phone\)\.get\(\)/.test(look) && !/allCustomersCache/.test(look), 'tra khách (tem / ly miễn phí) vẫn đọc thẳng doc(sđt), không dùng bản gợi ý');

  // Gọi trùng trong lúc đang tải (vd gõ nhiều số liền) → 1 lượt.
  const homNay = { v: '2026-10-05' };
  const ls = lsMoi();
  const A = mayPos(ls, khach, homNay);
  A.F.fetchAllCustomersCache(); A.F.fetchAllCustomersCache(); A.F.fetchAllCustomersCache();
  await A.st.xong();
  ok(A.st.goi === 1 && A.st.reads === 3, '3 lời gọi trùng → 1 lượt tải (3 lượt đọc)');
  ok(A.F.list().map(c => c.id).join() === '0902,0901,0903', 'sắp theo điểm giảm dần như cũ');
  ok(JSON.stringify(Object.keys(A.F.list()[1]).sort()) === JSON.stringify(['_src', 'id', 'name', 'nickname', 'total_points']), 'chỉ giữ 4 trường gợi ý dùng (không lưu tem, hồ sơ trợ lý…)');
  A.F.fetchAllCustomersCache(); await A.st.xong();
  ok(A.st.goi === 1, 'cùng phiên, cùng ngày: không đọc lại');

  // App tải lại cùng ngày → dùng bản trong máy, 0 lượt đọc.
  const B = mayPos(ls, khach, homNay);
  B.F.fetchAllCustomersCache(); await B.st.xong();
  ok(B.st.goi === 0 && B.F.list().length === 3, 'tải lại app cùng ngày: 0 lượt đọc, vẫn đủ danh sách');

  // Khách mới tạo ở POS → có trong bản lưu.
  B.F.them({ id: '0999', nickname: 'Mới', name: 'Mới', total_points: 0 });
  const C = mayPos(ls, khach, homNay);
  C.F.fetchAllCustomersCache(); await C.st.xong();
  ok(C.st.goi === 0 && C.F.list()[0].id === '0999', 'khách mới tạo có ngay trong gợi ý sau khi tải lại app');

  // Sang ngày mới → làm mới đúng 1 lần; trong lúc tải vẫn gợi ý bằng bản hôm trước.
  homNay.v = '2026-10-06';
  const D = mayPos(ls, khach, homNay);
  D.F.fetchAllCustomersCache();
  ok(D.F.list().length === 4, 'đang tải bản mới: vẫn gợi ý bằng bản hôm trước');
  await D.st.xong();
  D.F.fetchAllCustomersCache(); await D.st.xong();
  ok(D.st.goi === 1 && D.F.list().length === 3, 'ngày mới: làm mới đúng 1 lần, lấy danh sách mới từ máy chủ');

  // Không có localStorage (chặn / lỗi) → vẫn chạy, mỗi phiên tải 1 lần.
  const E = mayPos({ getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } }, khach, homNay);
  E.F.fetchAllCustomersCache(); E.F.fetchAllCustomersCache(); await E.st.xong();
  ok(E.st.goi === 1 && E.F.list().length === 3, 'localStorage lỗi: vẫn gợi ý được, 1 lượt tải/phiên');

  console.log(fail ? 'SOME FAIL' : 'ALL PASS');
  process.exitCode = fail;
})().catch(e => { console.log('FAIL lỗi', e); process.exitCode = 1; });
