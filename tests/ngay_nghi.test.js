// Ngày nghỉ từng quán Gieo (16/10) — manage.html đặt, quanlygieo.html đọc.
//   · Lưu special_days_gieogieo/{ngày}.offStores; ngày cũ "Nghỉ / đóng cửa" chưa có offStores = mọi quán nghỉ.
//   · offStoresOf / isStoreOff hai app chép y nhau.
//   · Quán nghỉ → mục tiêu ngày đó = 0 (manage gieoTargetForRange; quanlygieo soNgayMoCua).
//   · Ghi: 1 truy vấn + 1 lần ghi gộp; không đụng loai / ten của quanlygieo; doc chỉ để ghi nghỉ thì xoá hẳn khi bỏ nghỉ.
'use strict';
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };

const norm = s => s.replace(/\s+/g, ' ').trim();
for (const f of ['offStoresOf', 'isStoreOff']) eq(norm(extract('manage.html', [f])), norm(extract('quanlygieo.html', [f])), 'Hai app cùng một hàm ' + f);

const HELP = 'const GIEO_TARGET_DEFAULTS = { aov:46000, billsPerDay:60 };\n';
const M = new Function(HELP + extract('manage.html', ['pad', 'parseDkey', 'addDays', 'dkey', 'offStoresOf', 'isStoreOff', 'gieoTargetsOn', 'gieoTargetForRange', 'offNextList']) +
  '\nreturn { offStoresOf, isStoreOff, gieoTargetForRange, offNextList };')();

eq([M.offStoresOf({ loai: 'dong_cua' }), M.offStoresOf({ loai: 'le' }), M.offStoresOf({ loai: 'dong_cua', offStores: ['gg02'] }), M.offStoresOf({ loai: 'dong_cua', offStores: [] }), M.offStoresOf(null)],
  [['*'], [], ['gg02'], [], []], 'Ngày cũ "Nghỉ / đóng cửa" = mọi quán; có offStores (kể cả rỗng) thì theo đúng danh sách; Lễ không phải nghỉ');
const off = { '2026-10-16': ['gg01'], '2026-10-18': ['*'] };
eq([M.isStoreOff(off, '2026-10-16', 'gg01'), M.isStoreOff(off, '2026-10-16', 'gg02'), M.isStoreOff(off, '2026-10-18', 'gg02'), M.isStoreOff(off, '2026-10-16', null), M.isStoreOff(off, '2026-10-18', null), M.isStoreOff(null, '2026-10-16', 'gg01')],
  [true, false, true, false, true, false], 'Quán nghỉ theo từng quán; "*" = mọi quán; không có quán (xem tất cả) chỉ tính ngày mọi quán nghỉ');

const hist = [{ effectiveFrom: '2026-01-01', targets: { aov: 50000, billsPerDay: 100 } }];
eq(M.gieoTargetForRange(hist, '2026-10-15', '2026-10-18'), 20000000, 'Không truyền ngày nghỉ → như cũ (4 ngày × 5tr)');
eq(M.gieoTargetForRange(hist, '2026-10-15', '2026-10-18', off, 'gg01'), 10000000, 'GG01 nghỉ 16 và 18 (mọi quán) → mục tiêu còn 2 ngày');
eq(M.gieoTargetForRange(hist, '2026-10-15', '2026-10-18', off, 'gg02'), 15000000, 'GG02 chỉ nghỉ ngày 18');
eq(M.gieoTargetForRange(hist, '2026-10-16', '2026-10-16', off, 'gg01'), 0, 'Hôm nay nghỉ → mục tiêu 0');

const ALL = ['gg01', 'gg02', 'gg03'];
eq(M.offNextList([], ALL, ['gg02'], true), ['gg02'], 'Bật nghỉ 1 quán');
eq(M.offNextList(['gg02'], ALL, ['gg01', 'gg02'], true), ['gg01', 'gg02'], 'Bật thêm không trùng');
eq(M.offNextList(['*'], ALL, ['gg02'], false), ['gg01', 'gg03'], 'Ngày cũ mọi quán nghỉ, bỏ GG02 → bung ra các quán còn lại');
eq(M.offNextList(['gg01'], ALL, ['gg01'], false), [], 'Bỏ nghỉ quán cuối → rỗng');

// quanlygieo: số ngày mở cửa thay salesRes.dayCount khi nhân mục tiêu
const Q = new Function(extract('quanlygieo.html', ['pad', 'dkey', 'offStoresOf', 'isStoreOff', 'soNgayMoCua']) + '\nreturn { soNgayMoCua };')();
const D = s => new Date(s + 'T12:00:00');
eq([Q.soNgayMoCua(off, D('2026-10-12'), D('2026-10-18'), 'gg01'), Q.soNgayMoCua(off, D('2026-10-12'), D('2026-10-18'), 'gg02'), Q.soNgayMoCua(off, D('2026-10-12'), D('2026-10-18'), null), Q.soNgayMoCua(null, D('2026-10-12'), D('2026-10-18'), 'gg01')],
  [5, 6, 6, 7], 'quanlygieo: tuần 7 ngày — GG01 mở 5, GG02 mở 6, xem tất cả 6, chưa đọc được ngày nghỉ = 7');

// manage ghi: mock Firestore
(async () => {
  const store = { '2026-10-20': { date: '2026-10-20', loai: 'le', ten: 'Ngày Phụ nữ VN' }, '2026-10-22': { date: '2026-10-22', loai: 'dong_cua' } };
  let queries = 0, commits = 0; const ops = [];
  const FieldPath = { documentId: () => '__id' };
  const coll = name => {
    const q = (f = []) => ({ where: (k, op, v) => q(f.concat([[op, v]])), get: async () => { queries++; return { docs: Object.keys(store).filter(id => f.every(([op, v]) => op === '>=' ? id >= v : id <= v)).map(id => ({ id, data: () => store[id] })) }; } });
    return Object.assign(q(), { doc: id => ({ id, name }) });
  };
  const fstore = { collection: coll, batch: () => ({ set: (ref, data, o) => ops.push(['set', ref.id, data, o]), delete: ref => ops.push(['del', ref.id]), commit: async () => { commits++; ops.forEach(([k, id, data]) => { if (k === 'del') delete store[id]; else store[id] = Object.assign({}, store[id] || {}, data); }); ops.length = 0; } }) };
  const env = { fstore, firebase: { firestore: { FieldPath } }, ensureAuth: async () => {}, gieoStores: async () => [{ id: 'gg01' }, { id: 'gg02' }] };
  const B = new Function(...Object.keys(env), "const OFF_COLL = 'special_days_gieogieo';\n" + extract('manage.html', ['pad', 'parseDkey', 'addDays', 'dkey', 'daysBetween', 'validDate', 'offStoresOf', 'isStoreOff', 'offNextList', 'readOffDays', 'writeOffDays']) +
    '\nreturn { readOffDays, writeOffDays };')(...Object.values(env));

  const n1 = await B.writeOffDays('2026-10-19', '2026-10-21', ['gg01'], true);
  eq([n1, queries, commits], [3, 1, 1], 'Đặt nghỉ 3 ngày: 1 truy vấn + 1 lần ghi gộp');
  eq([store['2026-10-20'].loai, store['2026-10-20'].ten, store['2026-10-20'].offStores], ['le', 'Ngày Phụ nữ VN', ['gg01']], 'Ngày đã khai Lễ vẫn giữ loai / ten');
  eq(store['2026-10-19'].offBy, 'manage', 'Ghi rõ do manage đặt');
  const r = await B.readOffDays('2026-10-15', '2026-10-31');
  eq(Object.fromEntries(Object.entries(r).sort()), { '2026-10-19': ['gg01'], '2026-10-20': ['gg01'], '2026-10-21': ['gg01'], '2026-10-22': ['*'] }, 'Đọc: chỉ ngày có quán nghỉ; ngày cũ "Nghỉ / đóng cửa" = mọi quán');
  queries = 0; commits = 0;
  eq(await B.writeOffDays('2026-10-19', '2026-10-21', ['gg01'], true), 0, 'Đặt lại y như cũ → không ghi gì');
  eq(commits, 0, 'Không đổi → không commit');
  await B.writeOffDays('2026-10-19', '2026-10-20', ['gg01'], false);
  eq(['2026-10-19' in store, store['2026-10-20'] && store['2026-10-20'].loai, store['2026-10-20'] && store['2026-10-20'].offStores], [false, 'le', []], 'Bỏ nghỉ: doc chỉ để ghi nghỉ → xoá hẳn; ngày Lễ giữ lại, offStores rỗng');
  await B.writeOffDays('2026-10-22', '2026-10-22', ['gg02'], false);
  eq([store['2026-10-22'].loai, store['2026-10-22'].offStores], ['dong_cua', ['gg01']], 'Ngày cũ mọi quán nghỉ, bỏ GG02 → còn GG01 (giữ loai cho dự báo)');
  let err = null; try { await B.writeOffDays('2026-10-01', '2026-12-31', ['gg01'], true); } catch (e) { err = e.message; }
  eq(!!err, true, 'Quá 62 ngày mỗi lần → báo lỗi');
  err = null; try { await B.writeOffDays('2026-10-01', '2026-10-01', ['gg09'], true); } catch (e) { err = e.message; }
  eq(!!err, true, 'Quán không có trong danh sách → báo lỗi');
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})();
