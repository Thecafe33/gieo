// Duyệt máy (functions/baomat/core.js) — test bằng Firestore / Auth giả.
const { createCore, uidCuaMay } = require('../functions/baomat/core');
const cfg = require('../functions/baomat/cau_hinh.json');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok   ' + m); else { fail++; console.log('FAIL ' + m); } };
const nem = async (p, ma, m) => { try { await p; ok(false, m + ' (không ném lỗi)'); } catch (e) { ok(e.ma === ma, m + ' → ' + (e.ma || e.message)); } };

function dbGia() {
  const kho = new Map(); let n = 0;
  const ref = id => ({ id,
    get: async () => ({ exists: kho.has(id), data: () => Object.assign({}, kho.get(id)) }),
    set: async d => { kho.set(id, Object.assign({}, d)); },
    update: async d => { if (!kho.has(id)) throw new Error('không có'); Object.assign(kho.get(id), d); },
    delete: async () => { kho.delete(id); } });
  return { kho, collection: () => ({
    doc: id => ref(id || 'm' + (++n)),
    where: (f, op, v) => ({ get: async () => ({ docs: [...kho].filter(([, d]) => d[f] === v).map(([id, d]) => ({ id, ref: ref(id), data: () => Object.assign({}, d) })) }) }) }) };
}
function authGia() {
  const a = { ve: [], voHieu: [], thuHoi: [], coUser: new Set(),
    createCustomToken: async (uid, claims) => { a.ve.push({ uid, claims }); a.coUser.add(uid); return 've:' + uid; },
    updateUser: async (uid, d) => { if (!a.coUser.has(uid)) throw Object.assign(new Error('x'), { code: 'auth/user-not-found' }); if (d.disabled) a.voHieu.push(uid); },
    revokeRefreshTokens: async uid => { a.thuHoi.push(uid); } };
  return a;
}
const QL = { uid: 'u1', email: cfg.quanLyEmails[0] }, LA = { uid: 'may_x', email: '' };

(async () => {
  let t = 1e12; const db = dbGia(), auth = authGia();
  const core = createCore({ db, auth, cfg, now: () => t });

  // 1. Máy mới xin duyệt → chờ → quản lý duyệt → nhận vé
  const y = await core.xinDuyet({ ten: '  Máy <b>quầy</b> 1 ', app: 'posgieo' });
  ok(/^[A-HJ-NP-Z2-9]{4}$/.test(y.ma) && y.khoa.length === 48, 'xin duyệt: mã 4 ký tự + khoá riêng');
  const doc = db.kho.get(y.id);
  ok(doc.ten === 'Máy bquầy/b 1' && !('khoa' in doc) && doc.khoaBam !== y.khoa, 'tên bị lọc ký tự < >, khoá chỉ lưu dạng băm');
  ok((await core.nhanQuyen({ id: y.id, khoa: y.khoa })).trangThai === 'cho', 'chưa duyệt → «cho», không có vé');
  await nem(core.nhanQuyen({ id: y.id, khoa: 'sai' }), 'sai_khoa', 'sai khoá riêng bị chặn');
  await nem(core.quanLy({ viec: 'duyet', id: y.id }, LA), 'khong_co_quyen', 'máy thường không duyệt được');
  await nem(core.quanLy({ viec: 'duyet', id: y.id }, null), 'khong_co_quyen', 'chưa đăng nhập không duyệt được');
  await core.quanLy({ viec: 'duyet', id: y.id }, QL);
  const v = await core.nhanQuyen({ id: y.id, khoa: y.khoa });
  ok(v.trangThai === 'hoat_dong' && v.ve === 've:' + uidCuaMay(y.id) && auth.ve[0].claims.app === 'posgieo', 'đã duyệt → nhận vé đúng uid của máy');
  ok(db.kho.get(y.id).trangThai === 'hoat_dong', 'tài liệu chuyển «hoat_dong»');
  t += 60e3; ok((await core.nhanQuyen({ id: y.id, khoa: y.khoa })).ve, 'vé rơi giữa đường: xin lại trong 3 phút vẫn được');
  t += 200e3; ok((await core.nhanQuyen({ id: y.id, khoa: y.khoa })).trangThai === 'da_cap', 'quá 3 phút: không cấp lại');
  await nem(core.quanLy({ viec: 'duyet', id: y.id }, QL), 'khong_con_cho', 'không duyệt lại máy đã hoạt động');

  // 2. Từ chối, hết hạn
  const y2 = await core.xinDuyet({ ten: 'Lạ', app: 'pos' });
  await core.quanLy({ viec: 'tu_choi', id: y2.id }, QL);
  const r2 = await core.nhanQuyen({ id: y2.id, khoa: y2.khoa });
  ok(r2.trangThai === 'tu_choi' && !r2.ve, 'bị từ chối → không có vé');
  const y3 = await core.xinDuyet({ ten: 'Chậm', app: 'posx' });
  t += cfg.hanXinDuyetPhut * 60e3 + 1;
  ok((await core.nhanQuyen({ id: y3.id, khoa: y3.khoa })).trangThai === 'het_han', 'quá 15 phút → hết hạn');
  await nem(core.quanLy({ viec: 'duyet', id: y3.id }, QL), 'het_han', 'không duyệt được yêu cầu hết hạn');
  await core.xinDuyet({ ten: 'Mới', app: 'pos' });
  ok(!db.kho.has(y3.id), 'yêu cầu hết hạn được dọn khi có yêu cầu mới');

  // 3. Chặn spam + app lạ
  for (let i = 0; i < cfg.toiDaChoDuyet - 1; i++) await core.xinDuyet({ ten: 's' + i, app: 'pos' });
  await nem(core.xinDuyet({ ten: 'tràn', app: 'pos' }), 'qua_nhieu_yeu_cau', 'quá ' + cfg.toiDaChoDuyet + ' yêu cầu chờ → chặn');
  await nem(core.xinDuyet({ ten: 'x', app: 'index' }), 'app_khong_hop_le', 'app không thuộc danh sách bị chặn');
  await nem(core.xinDuyet({ ten: 'x', app: 'kiosk' }), 'app_khong_hop_le', 'kiosk không qua duyệt máy (giữ đăng nhập cũ)');

  // 4. Máy đang chạy tự chuyển
  await nem(core.tuChuyen({ ten: 'x', app: 'posgieo' }, LA), 'khong_co_quyen', 'tự chuyển: phải đang giữ phiên tài khoản chung');
  const c = await core.tuChuyen({ ten: 'Quầy cũ', app: 'PosX' }, QL);
  ok(c.ve === 've:' + uidCuaMay(c.id) && db.kho.get(c.id).nguon === 'tu_chuyen' && db.kho.get(c.id).app === 'posx', 'tự chuyển: có vé ngay, ghi nguồn «tu_chuyen»');

  // 5. Thu hồi
  await nem(core.quanLy({ viec: 'thu_hoi', id: c.id }, LA), 'khong_co_quyen', 'máy thường không thu hồi được');
  await core.quanLy({ viec: 'thu_hoi', id: c.id }, QL);
  ok(auth.voHieu.includes(uidCuaMay(c.id)) && auth.thuHoi.includes(uidCuaMay(c.id)) && db.kho.get(c.id).trangThai === 'thu_hoi', 'thu hồi: vô hiệu tài khoản + huỷ phiên');
  const y5 = await (async () => { db.kho.clear(); return core.xinDuyet({ ten: 'chưa vào', app: 'pos' }); })();
  await core.quanLy({ viec: 'thu_hoi', id: y5.id }, QL);
  ok(db.kho.get(y5.id).trangThai === 'thu_hoi', 'thu hồi máy chưa từng đăng nhập không lỗi');
  ok((await core.nhanQuyen({ id: y5.id, khoa: y5.khoa })).trangThai === 'thu_hoi', 'máy đã thu hồi không nhận được vé');
  await core.quanLy({ viec: 'doi_ten', id: y5.id, ten: 'Tên mới' }, QL);
  ok(db.kho.get(y5.id).ten === 'Tên mới', 'đổi tên máy');
  await nem(core.quanLy({ viec: 'la', id: y5.id }, QL), 'viec_khong_hop_le', 'việc lạ bị chặn');

  console.log(fail ? 'SOME FAIL' : 'ALL PASS'); process.exit(fail ? 1 : 0);
})();
