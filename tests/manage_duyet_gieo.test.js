'use strict';
// manage.html — duyệt chi phí CHỜ DUYỆT của quán Gieo ở tab Chi phí (kế hoạch docs/KE_HOACH_MANAGE_DUYET_GIEO.md, hạng mục 1.1).
//   · Ghi y approveExpense / rejectExpense của quanlygieo (cùng trường).
//   · Dấu «ngày lãi/lỗ bị đổi» đúng luật PL_DAU.expenses_gieogieo của data_access.v9 (manage không bọc fstore).
//   · Đã được xử lý ở nơi khác → không ghi đè; quán gg02 dùng bảng __gg02.
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { extract } = require('./lib/extract');
const { makeFake } = require('./lib/fakefb');
const ROOT = path.join(__dirname, '..');

(async () => {
  // 1) quanlygieo ghi đúng các trường này (đối chiếu mã nguồn để manage không trôi).
  const ql = fs.readFileSync(path.join(ROOT, 'quanlygieo.html'), 'utf8');
  assert.match(ql, /function approveExpense\(id\)\{\s*return _expWriteDone\(fstore\.collection\('expenses_gieogieo'\)\.doc\(id\)\.update\(\{status:'approved', reviewedAt:vnDate\(\)\.toISOString\(\)\}\)\);/, 'approveExpense của quanlygieo đã đổi — cập nhật reviewGieoExpense');
  assert.match(ql, /function rejectExpense\(id, note\)\{\s*return _expWriteDone\(fstore\.collection\('expenses_gieogieo'\)\.doc\(id\)\.update\(\{status:'rejected', reviewedAt:vnDate\(\)\.toISOString\(\), reviewNote: note\|\|''\}\)\);/, 'rejectExpense của quanlygieo đã đổi');
  // Luật khoảng ngày của data_access.v9 (PL_DAU.expenses_gieogieo).
  const da = fs.readFileSync(path.join(ROOT, 'data_access.v9.js'), 'utf8');
  assert.match(da, /expenses_gieogieo: \{ lookup: true, rng: x => x\.periodType === 'period' && x\.startDate && x\.endDate \? \[x\.startDate, x\.endDate\] : \[x\.date \|\| x\.startDate, x\.date \|\| x\.startDate\] \}/, 'PL_DAU.expenses_gieogieo đã đổi — cập nhật ggExpenseRange');
  console.log('ok Trường ghi + luật dấu lãi/lỗ đối chiếu đúng mã nguồn quanlygieo / data_access.v9');

  const NAMES = ['ggName', 'ggExpenseRange', 'ggExpenseDirtyKey', 'reviewGieoExpense'];
  let today = '2026-10-23';
  const make = fake => new Function('fstore', 'ensureAuth', 'gieoStores', 'vnDate', 'dkey', 'GIEO_LEGACY', extract('manage.html', NAMES) + '\nreturn {' + NAMES.join(',') + '};')(
    fake.fstore, async () => {}, async () => [{ id: 'gg01' }, { id: 'gg02' }], () => new Date('2026-10-22T19:30:00Z'), () => today, 'gg01');

  const K = make(makeFake());
  assert.strictEqual(K.ggExpenseDirtyKey({ periodType: 'onetime', date: '2026-10-20' }, today), '2026-10-20_2026-10-20');
  assert.strictEqual(K.ggExpenseDirtyKey({ periodType: 'period', startDate: '2026-10-01', endDate: '2026-12-31', date: '2026-10-01' }, today), '2026-10-01_2026-12-31');
  assert.strictEqual(K.ggExpenseDirtyKey({ periodType: 'onetime', date: '2026-10-23' }, today), null, 'ngày hôm nay → không dấu (như data_access)');
  assert.strictEqual(K.ggExpenseDirtyKey({ periodType: 'onetime' }, today), null);
  console.log('ok Khoá dấu theo kỳ / một lần; hôm nay không dấu');

  const f = makeFake({ fs: {
    'expenses_gieogieo/a': { periodType: 'onetime', date: '2026-10-20', category: 'Đá', amount: 30000, status: 'pending_review', source: 'pos' },
    'expenses_gieogieo/b': { periodType: 'onetime', date: '2026-10-23', category: 'Ly', amount: 50000, status: 'pending_review', source: 'pos' },
    'expenses_gieogieo/c': { periodType: 'onetime', date: '2026-10-19', category: 'Gas', amount: 90000, status: 'approved' },
    'expenses_gieogieo__gg02/d': { periodType: 'onetime', date: '2026-10-21', category: 'Đá', amount: 20000, status: 'pending_review', source: 'pos' }
  } });
  const M = make(f);
  const r = await M.reviewGieoExpense('gg01', 'a', true);
  assert.strictEqual(f.FS['expenses_gieogieo/a'].status, 'approved'); assert.ok(f.FS['expenses_gieogieo/a'].reviewedAt);
  assert.strictEqual(r.dirty, '2026-10-20_2026-10-20'); assert.ok(f.FS['pl_dirty_gieogieo/gg01'].m['2026-10-20_2026-10-20'], 'dấu ghi vào tài liệu quán gg01');
  await M.reviewGieoExpense('gg01', 'b', false, 'trùng');
  assert.deepStrictEqual([f.FS['expenses_gieogieo/b'].status, f.FS['expenses_gieogieo/b'].reviewNote], ['rejected', 'trùng']);
  assert.strictEqual(Object.keys(f.FS['pl_dirty_gieogieo/gg01'].m).length, 1, 'khoản hôm nay không ghi dấu');
  await M.reviewGieoExpense('gg02', 'd', true);
  assert.strictEqual(f.FS['expenses_gieogieo__gg02/d'].status, 'approved'); assert.ok(f.FS['pl_dirty_gieogieo/gg02'].m['2026-10-21_2026-10-21'], 'quán gg02: bảng __gg02 + dấu tài liệu gg02');
  console.log('ok Duyệt / từ chối ghi y quanlygieo, dấu đúng quán; gg02 dùng bảng __gg02');

  await assert.rejects(M.reviewGieoExpense('gg01', 'c', true), /đã được xử lý ở nơi khác/);
  await assert.rejects(M.reviewGieoExpense('gg01', 'zz', true), /không còn/);
  await assert.rejects(M.reviewGieoExpense('gg09', 'a', true), /Không rõ quán Gieo/);
  assert.strictEqual(f.FS['expenses_gieogieo/c'].reviewedAt, undefined, 'khoản đã duyệt từ trước không bị ghi đè');
  console.log('ok Đã xử lý ở nơi khác / không còn / quán lạ → báo, không ghi');

  // 2) Giao diện: hàng Gieo trong khung chờ duyệt không có nút Sửa (sửa ở Quản lý Gieo); readCosts đọc có giới hạn.
  const mg = fs.readFileSync(path.join(ROOT, 'manage.html'), 'utf8');
  assert.match(mg, /ggName\('expenses_gieogieo',r\.id\)\)\.where\('status','==','pending_review'\)\.limit\(100\)/, 'đọc khoản chờ duyệt Gieo có giới hạn');
  const row = mg.slice(mg.indexOf('cost-pend-row is-gieo'), mg.indexOf('cost-pend-row is-gieo') + 900);
  assert.ok(/approveGieoExpense/.test(row) && /rejectGieoExpense/.test(row) && !/editExpense/.test(row), 'hàng Gieo: Duyệt / Từ chối, không Sửa');
  console.log('ok Giao diện: hàng Gieo chung khung chờ duyệt, đọc có giới hạn');
  // 3) «Chờ xử lý · Gieo» — cảnh báo: ghi y markAlertStatus của quanlygieo.
  assert.match(ql, /const fields = \{status, resolvedAt:vnDate\(\)\.toISOString\(\)\};\s*await fstore\.collection\('alerts_gieogieo'\)\.doc\(id\)\.update\(fields\);/, 'markAlertStatus của quanlygieo đã đổi — cập nhật markGieoAlert');
  {
    const N2 = ['ggName', 'readGieoInbox', 'markGieoAlert'];
    const g = makeFake({ fs: {
      'alerts_gieogieo/a1': { type: 'missing_recipe', status: 'new', createdAt: '2026-10-22T01:00:00Z' },
      'alerts_gieogieo/a2': { type: 'duty_case', status: 'seen', createdAt: '2026-10-22T02:00:00Z' },
      'alerts_gieogieo/a3': { type: 'duty_case', status: 'resolved', createdAt: '2026-10-22T03:00:00Z' },
      'alerts_gieogieo__gg02/b1': { type: 'handover_cash_variance', status: 'new', createdAt: '2026-10-22T04:00:00Z' },
      'alerts_gieogieo__gg03/c1': { type: 'missing_recipe', status: 'new' }
    } });
    const A = new Function('fstore', 'ensureAuth', 'gieoStores', 'vnDate', 'dkey', 'parseDkey', 'addDays', 'firebase', 'GIEO_LEGACY', extract('manage.html', N2) + '\nreturn {' + N2.join(',') + '};')(
      g.fstore, async () => {}, async () => [{ id: 'gg01' }, { id: 'gg02' }, { id: 'gg03', active: false }], () => new Date('2026-10-22T19:30:00Z'), () => '2026-10-23', k => k, () => '2026-10-01', { firestore: { FieldPath: { documentId: () => '__name__' } } }, 'gg01');
    const inbox = await A.readGieoInbox();
    assert.deepStrictEqual(inbox.alerts.map(a => a.store + '/' + a.id), ['gg02/b1', 'gg01/a2', 'gg01/a1'], 'mới + đã xem, mới nhất trước; bỏ đã xử lý; bỏ quán ngừng hoạt động');
    await A.markGieoAlert('gg01', 'a1', 'seen'); assert.strictEqual(g.FS['alerts_gieogieo/a1'].status, 'seen'); assert.ok(g.FS['alerts_gieogieo/a1'].resolvedAt);
    await A.markGieoAlert('gg02', 'b1', 'resolved'); assert.strictEqual(g.FS['alerts_gieogieo__gg02/b1'].status, 'resolved');
    await assert.rejects(A.markGieoAlert('gg01', 'a3', 'seen'), /đã được xử lý ở nơi khác/);
    await assert.rejects(A.markGieoAlert('gg01', 'a1', 'deleted'), /không hợp lệ/);
    console.log('ok Chờ xử lý · Gieo: đọc mới + đã xem từng quán đang hoạt động; Đã xem / Đã xử lý ghi y quanlygieo; đã xử lý thì không ghi lại');
  }
  // 4) Ca ngày cũ chưa check-out — ghi như ccSaveEdit của quanlygieo.
  assert.match(ql, /await fstore\.collection\('employee_shifts_gieogieo'\)\.doc\(shiftId\)\.update\(\{\s*checkedInAt, checkedOutAt,\s*manualEdit: true, manualEditAt: vnDate\(\)\.toISOString\(\)\s*\}\);/, 'ccSaveEdit của quanlygieo đã đổi — cập nhật closeGieoShift');
  assert.match(da, /employee_shifts_gieogieo: \{ lookup: true, rng: x => \[x\.businessDate, x\.businessDate\] \}/, 'PL_DAU.employee_shifts_gieogieo đã đổi');
  {
    const N3 = ['ggName', 'ggShiftOutIso', 'closeGieoShift', 'readGieoInbox'];
    const g = makeFake({ fs: {
      'employee_shifts_gieogieo/s1': { employeeId: 'e1', employeeName: 'Minh', businessDate: '2026-10-21', checkedInAt: '2026-10-21T01:00:00.000Z', checkedOutAt: null },
      'employee_shifts_gieogieo/s2': { employeeId: 'e2', employeeName: 'Lan', businessDate: '2026-10-23', checkedInAt: '2026-10-23T00:30:00.000Z', checkedOutAt: null },
      'employee_shifts_gieogieo__gg02/s3': { employeeId: 'e3', employeeName: 'Huy', businessDate: '2026-10-20', checkedInAt: '2026-10-20T13:00:00.000Z', checkedOutAt: null },
      'employee_shifts_gieogieo/s4': { employeeId: 'e4', businessDate: '2026-10-19', checkedInAt: '2026-10-19T01:00:00.000Z', checkedOutAt: '2026-10-19T09:00:00.000Z' }
    } });
    const H = new Function('fstore', 'ensureAuth', 'gieoStores', 'vnDate', 'dkey', 'parseDkey', 'addDays', 'firebase', 'GIEO_LEGACY', extract('manage.html', N3) + '\nreturn {' + N3.join(',') + '};')(
      g.fstore, async () => {}, async () => [{ id: 'gg01' }, { id: 'gg02' }], () => new Date('2026-10-22T19:30:00Z'), () => '2026-10-23', k => k, () => '2026-10-01', { firestore: { FieldPath: { documentId: () => '__name__' } } }, 'gg01');
    const inbox = await H.readGieoInbox();
    assert.deepStrictEqual(inbox.stale.map(x => x.store + '/' + x.id), ['gg02/s3', 'gg01/s1'], 'chỉ ca NGÀY CŨ chưa check-out; ca hôm nay đang làm bỏ qua');
    assert.strictEqual(H.ggShiftOutIso('2026-10-21T01:00:00.000Z', '2026-10-21', '17:30'), '2026-10-21T10:30:00.000Z');
    assert.strictEqual(H.ggShiftOutIso('2026-10-20T13:00:00.000Z', '2026-10-20', '02:00'), '2026-10-20T19:00:00.000Z', 'giờ ra ≤ giờ vào → sang ngày sau (như _ccOutIso)');
    assert.throws(() => H.ggShiftOutIso('2026-10-21T01:00:00.000Z', '2026-10-21', '7h'), /không hợp lệ/);
    await H.closeGieoShift('gg01', 's1', '17:30');
    const s1 = g.FS['employee_shifts_gieogieo/s1'];
    assert.deepStrictEqual([s1.checkedOutAt, s1.manualEdit, s1.manualEditBy, s1.checkedInAt], ['2026-10-21T10:30:00.000Z', true, 'manage', '2026-10-21T01:00:00.000Z']);
    assert.ok(g.FS['pl_dirty_gieogieo/gg01'].m['2026-10-21_2026-10-21'], 'dấu lãi/lỗ ngày ca');
    await H.closeGieoShift('gg02', 's3', '02:00'); assert.ok(g.FS['employee_shifts_gieogieo__gg02/s3'].checkedOutAt); assert.ok(g.FS['pl_dirty_gieogieo/gg02']);
    await assert.rejects(H.closeGieoShift('gg01', 's4', '18:00'), /đã có giờ ra/);
    assert.strictEqual(g.FS['employee_shifts_gieogieo/s4'].checkedOutAt, '2026-10-19T09:00:00.000Z');
    console.log('ok Ca treo Gieo: chỉ ngày cũ; giờ ra ghi như ccSaveEdit (qua đêm sang ngày sau), dấu lãi/lỗ đúng quán; đã check-out thì không ghi đè');
  }
  // 5) Ngày chưa đóng sổ → Đóng ngày (y loadStaleClosingDays / forceCloseStaleDay của quanlygieo).
  assert.match(ql, /await fstore\.collection\('daily_closings_gieogieo'\)\.doc\(dateKey\)\.set\(\{\s*businessDate: dateKey, status:'closed', closedAt: now,\s*forceClosedByManagement: true, forceCloseReason: reason\.trim\(\), forceClosedAt: now\s*\}, \{merge:true\}\);/, 'forceCloseStaleDay của quanlygieo đã đổi — cập nhật forceCloseGieoDay');
  assert.match(ql, /checkedOutAt: mark, autoCheckOut:true,\s*autoCheckOutReason:'Quản lý đóng bù ngày '\+dateKey/, 'chốt hộ ca khi đóng bù đã đổi');
  {
    const g = makeFake({ fs: {
      'daily_openings_gieogieo/2026-10-20': { businessDate: '2026-10-20' }, 'daily_closings_gieogieo/2026-10-20': { status: 'handed_over' },
      'daily_openings_gieogieo/2026-10-21': { businessDate: '2026-10-21' }, 'daily_closings_gieogieo/2026-10-21': { status: 'closed' },
      'daily_openings_gieogieo/2026-10-22': { businessDate: '2026-10-22' },
      'daily_openings_gieogieo/2026-10-23': { businessDate: '2026-10-23' },
      'daily_openings_gieogieo/2026-08-01': { businessDate: '2026-08-01' },
      'employee_shifts_gieogieo/o1': { employeeId: 'e1', businessDate: '2026-10-22', checkedInAt: '2026-10-22T01:00:00.000Z', checkedOutAt: null },
      'employee_shifts_gieogieo/o2': { employeeId: 'e2', businessDate: '2026-10-21', checkedInAt: '2026-10-21T01:00:00.000Z', checkedOutAt: null }
    } });
    // fakefb chưa có lọc theo mã tài liệu → bọc riêng cho truy vấn khoảng FieldPath.documentId().
    const patch = c => { const w = c.where.bind(c); c.where = (f, op, v) => { if (f !== '__name__') return w(f, op, v); const fl = [[op, v]]; const q = { where(f2, op2, v2) { fl.push([op2, v2]); return q; }, async get() { const sn = await c.get(); const docs = sn.docs.filter(d => fl.every(([o, x]) => o === '>=' ? d.id >= x : o === '<=' ? d.id <= x : true)); return { docs, size: docs.length, forEach: fn => docs.forEach(fn) }; } }; return q; }; return c; };
    const fsw = { collection: n => patch(g.fstore.collection(n)), runTransaction: fn => g.fstore.runTransaction(fn) };
    const pDk = k => new Date(k + 'T00:00:00+07:00'), dk = d => new Date(+d + 7 * 3600000).toISOString().slice(0, 10), add = (d, n) => new Date(+d + n * 86400000);
    const N4 = ['ggName', 'readGieoInbox', 'forceCloseGieoDay'];
    const D = new Function('fstore', 'ensureAuth', 'gieoStores', 'vnDate', 'dkey', 'parseDkey', 'addDays', 'firebase', 'GIEO_LEGACY', extract('manage.html', N4) + '\nreturn {' + N4.join(',') + '};')(
      fsw, async () => {}, async () => [{ id: 'gg01' }], () => new Date('2026-10-23T05:00:00Z'), d => d ? dk(d) : '2026-10-23', pDk, add, { firestore: { FieldPath: { documentId: () => '__name__' } } }, 'gg01');
    const inbox = await D.readGieoInbox();
    assert.deepStrictEqual(inbox.openDays.map(x => x.dateKey + ':' + x.status), ['2026-10-20:handed_over', '2026-10-22:null'], 'ngày đã mở ca, chưa đóng, trong 30 ngày trước hôm nay; bỏ ngày đã đóng / hôm nay / quá 30 ngày');
    await assert.rejects(D.forceCloseGieoDay('gg01', '2026-10-22', '  '), /lý do/);
    await assert.rejects(D.forceCloseGieoDay('gg01', '2026-10-23', 'x'), /ngày đã qua/);
    const r = await D.forceCloseGieoDay('gg01', '2026-10-22', 'Quên kết ca');
    const c = g.FS['daily_closings_gieogieo/2026-10-22'];
    assert.deepStrictEqual([c.status, c.forceClosedByManagement, c.forceCloseReason, c.businessDate], ['closed', true, 'Quên kết ca', '2026-10-22']);
    assert.strictEqual(r.shiftsClosed, 1); assert.deepStrictEqual([g.FS['employee_shifts_gieogieo/o1'].checkedOutAt, g.FS['employee_shifts_gieogieo/o1'].autoCheckOut], ['2026-10-22T16:59:00.000Z', true], 'chốt hộ ca còn treo đúng ngày lúc 23:59 giờ VN');
    assert.strictEqual(g.FS['employee_shifts_gieogieo/o2'].checkedOutAt, null, 'ca ngày khác không đụng');
    assert.ok(g.FS['pl_dirty_gieogieo/gg01'].m['2026-10-22_2026-10-22'], 'dấu lãi/lỗ ngày có ca được chốt');
    await new Promise(r => setTimeout(r, 0));
    assert.ok(Object.entries(g.FS).some(([k, v]) => k.startsWith('audit_logs_gieogieo/') && v.entity === 'daily_closing_force' && v.storeId === 'gg01'), 'ghi nhật ký kiểm toán dùng chung kèm quán');
    await assert.rejects(D.forceCloseGieoDay('gg01', '2026-10-21', 'x'), /đã đóng ở nơi khác/);
    console.log('ok Ngày chưa đóng sổ: đúng ngày như quanlygieo; Đóng ngày ghi như forceCloseStaleDay, chốt ca 23:59, dấu lãi/lỗ, nhật ký; đã đóng thì báo');
  }
  console.log('ALL PASS');
})().catch(e => { console.error(e); process.exit(1); });
