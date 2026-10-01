// Nhóm duty (engine v4) — hàm THUẦN: ngưỡng, phân rã vụ lệch theo ca, lệch nền công thức, xác minh.
'use strict';
const { loadEngineModule } = require('./lib/engine');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 600), '!=', JSON.stringify(b).slice(0, 600)); } else console.log('ok', m); };
const D = loadEngineModule().duty;
const sh = (id, name, a, b, roles) => ({ employeeId: id, employeeName: name, checkedInAt: '2026-09-22T' + a + ':00Z', checkedOutAt: b ? '2026-09-22T' + b + ':00Z' : null, roles });
const ev = (h, q) => ({ at: '2026-09-22T' + h + ':00Z', qty: q, refId: 'b' + h });

// ── Ngưỡng (đối chiếu số thật 22/9–1/10) ──
eq([D.needsRecount({ variance: 6599.4, usage: 490, book: 864 }), D.needsNotify({ variance: 6599.4, usage: 490, book: 864 })], [true, true], 'Cốt trà lài +6599 vs dùng 490 → cân lại + báo chủ');
eq([D.needsRecount({ variance: -176, usage: 390, book: 800 }), D.needsNotify({ variance: -176, usage: 390 })], [false, false], 'Nước đường −176 (45% dùng) → không cân lại, không báo');
eq([D.needsRecount({ variance: -135.5, usage: 49.5 }), D.needsNotify({ variance: -135.5, usage: 49.5 })], [false, true], 'Pudding −135 vs dùng 49 → không cân lại (<150) nhưng vượt 100% dùng → báo');
eq([D.needsRecount({ variance: 200, usage: 0, book: 300 }), D.needsRecount({ variance: 100, usage: 0, book: 300 })], [true, false], 'không có lượng dùng → lấy số sổ làm nền; <150 g không cân lại');
eq([D.sameWeigh(7463, 7470), D.sameWeigh(7463, 864), D.sameWeigh(100, 108)], [true, false, true], 'hai lần cân như nhau trong sai số cân');

// ── Ví dụ của chủ: ca sáng 10 ly, ca chiều 2 ly ──
const shifts = [sh('A', 'An', '07:00', '12:00', ['barista']), sh('B', 'Bình', '12:00', '18:00', ['barista']), sh('C', 'Chi', '07:00', '18:00', ['order'])];
const usage = [...Array.from({ length: 10 }, (_, i) => ({ at: '2026-09-22T' + String(7 + (i % 5)).padStart(2, '0') + ':' + (i < 5 ? '10' : '40') + ':00Z', qty: 30, refId: 'm' + i })), ev('13:00', 30), ev('14:00', 30)];
let r = D.attributeInterval({ variance: -120, costPerUnit: 2, usage, shifts, closeAt: '2026-09-22T18:00:00Z' });
eq(r.allocations.map(a => [a.employeeId, a.qty, a.confidence]), [['A', -100, 'medium'], ['B', -20, 'medium']], '10 ly : 2 ly → An chịu 100, Bình chịu 20; Chi (order) không chịu');
eq([r.value, r.pool.length, r.confidence], [240, 0, 'medium'], 'giá trị = |lệch| × giá, không phần chưa quy');

// ── Lỗi nhập số đã xác minh ──
r = D.attributeInterval({ variance: 6599.4, costPerUnit: 1, usage, shifts, entryError: { qty: 6599.4, byId: 'A', byName: 'An', clean: true } });
eq([r.kind, r.allocations.map(a => [a.employeeId, a.qty, a.confidence]), r.pool], ['entry_error', [['A', 6599.4, 'strong']], []], 'nhập sai đã xác minh → 100% người nhập, độ tin cậy Mạnh');
r = D.attributeInterval({ variance: -165, costPerUnit: 1, usage, shifts, entryError: { qty: -165, byId: 'A', byName: 'An', clean: false } });
eq([r.allocations[0].confidence, r.notes.includes('khoang_khong_sach')], ['medium', true], 'khoảng giữa không sạch → Vừa + ghi chú');
// một phần lỗi nhập + phần còn lại theo ca
r = D.attributeInterval({ variance: -300, costPerUnit: 1, usage, shifts, entryError: { qty: -165, byId: 'B', byName: 'Bình', clean: true } });
eq(r.parts.map(p => [p.kind, p.qty]), [['entry_error', -165], ['exposure', -135]], 'lỗi nhập −165 + phần còn lại −135 chia theo ca');
eq(r.allocations.find(a => a.employeeId === 'B').qty, -165 + -22.5, 'Bình = 165 (nhập sai) + phần ca chiều');

// ── Lệch nền do công thức → không ai chịu ──
r = D.attributeInterval({ variance: -100, costPerUnit: 1, usage, shifts, baseline: { ratio: -0.25 } });
const u = usage.reduce((s, e) => s + e.qty, 0);
eq([r.pool[0].kind, r.pool[0].qty, r.parts[1].qty], ['recipe', -0.25 * u, -100 + 0.25 * u], 'phần bằng độ lệch nền → công thức; phần dư chia theo ca');
r = D.attributeInterval({ variance: 40, costPerUnit: 1, usage, shifts, baseline: { ratio: -0.25 } });
eq(r.pool.some(p => p.kind === 'recipe'), false, 'nền ngược chiều với lệch → không áp');

// ── Lệch cực đoan chưa xác minh → chưa quy; đã xác minh là lệch thật → chia theo ca ──
r = D.attributeInterval({ variance: 6599.4, costPerUnit: 1, usage, shifts, book: 864 });
eq([r.allocations.length, r.pool.map(p => p.kind), r.notes.includes('chua_xac_minh')], [0, ['unverified'], true], 'Cốt trà lài +6599 chưa xác minh → chưa quy, không chia cho ai');
r = D.attributeInterval({ variance: 6599.4, costPerUnit: 1, usage, shifts, book: 864, verified: true });
eq(r.allocations.map(a => a.employeeId).sort(), ['A', 'B'], 'đã xác minh là lệch thật → chia theo ca');

// ── Thiếu cơ sở → "chưa quy", không đổ đại ──
r = D.attributeInterval({ variance: -50, costPerUnit: 1, usage: [], shifts });
eq([r.allocations.length, r.pool.map(p => p.reason), r.confidence], [0, ['khong_co_luot_ban_trong_khoang'], 'weak'], 'không có lượt bán → chưa quy');
r = D.attributeInterval({ variance: -50, costPerUnit: 1, usage: [{ at: '2026-09-22T09:00:00Z', qty: 30, timeUnknown: true }, ev('08:00', 5)], shifts });
eq([r.allocations.length, r.pool[0].reason], [0, 'khong_xac_dinh_duoc_ca_cua_so_ban'], 'giờ bán không rõ chiếm >50% → cả khoản chưa quy');
r = D.attributeInterval({ variance: -100, costPerUnit: 1, usage: [ev('08:00', 80), { at: 'x', qty: 20, timeUnknown: true }], shifts });
eq([r.allocations[0].qty, r.pool[0].qty, r.pool[0].reason], [-80, -20, 'ban_khong_ro_gio_hoac_ca'], 'bán bù sau đóng ngày (giờ không rõ) → phần đó chưa quy, phần còn lại quy theo ca');
r = D.attributeInterval({ variance: -60, costPerUnit: 1, usage: [ev('08:00', 40), ev('09:00', 20)], shifts: [sh('A', 'An', '07:00', '12:00', []), sh('C', 'Chi', '07:00', '18:00', ['order'])] });
eq([r.allocations.map(a => a.employeeId).sort(), r.notes.includes('du_phong_khong_ai_khai_pha_che')], [['A', 'C'], true], 'không ai khai pha chế → dự phòng tất cả người trong ca, có ghi chú');
r = D.attributeInterval({ variance: -60, costPerUnit: 1, usage: [ev('20:00', 40)], shifts });
eq([r.allocations.length, r.pool.length], [0, 1], 'bán lúc không ai check-in → chưa quy');
r = D.attributeInterval({ variance: 0.4, costPerUnit: 1, usage, shifts });
eq(r.kind, 'none', 'dưới 1 đơn vị đo → bỏ (làm tròn)');
r = D.attributeInterval({ variance: 3, costPerUnit: 1, usage, shifts });
eq(r.allocations.reduce((s, a) => s + a.qty, 0) > 0, true, 'lệch 3 g (nhỏ) vẫn được ghi và quy');

// ── Mẻ nấu ghi lệch lớn → người nấu ──
r = D.attributeInterval({ variance: -300, costPerUnit: 1, usage, shifts, production: [{ staffId: 'B', staffName: 'Bình', recorded: 1500, expected: 1200 }] });
eq([r.parts[0].kind, r.parts[0].allocations[0].employeeId, r.parts[0].qty], ['production', 'B', -300], 'mẻ ghi 1500 so với 1200 (+25%) → sổ phồng → người nấu chịu phần thiếu');
r = D.attributeInterval({ variance: -300, costPerUnit: 1, usage, shifts, production: [{ staffId: 'B', staffName: 'Bình', recorded: 1085, expected: 1200 }] });
eq(r.parts.some(p => p.kind === 'production'), false, 'mẻ lệch −9.6% (hệ số mẻ) → không gán người nấu');

// ── Lệch nền: công thức hay thói quen ──
const mk = (n, vr, wts) => Array.from({ length: n }, (_, i) => ({ variance: vr[i % vr.length], usage: 100, weights: wts[i % wts.length] }));
eq(D.detectRecipeBias(mk(4, [-40], [{ A: 1 }])).reason, 'it_mau', 'dưới 5 khoảng đo → chưa kết luận');
let b = D.detectRecipeBias(mk(8, [-40, -45, -35, -42], [{ A: 1 }, { B: 1 }, { A: 0.5, B: 0.5 }]));
eq([b.recipe, b.ratio < 0], [true, true], 'lệch cùng chiều ở cả hai người → lỗi công thức');
b = D.detectRecipeBias(mk(8, [-80, -2, -75, -1], [{ A: 1 }, { B: 1 }]));
eq([b.recipe, b.reason], [false, 'lech_theo_nguoi'], 'chỉ một người lệch → thói quen cá nhân, không miễn');
eq(D.detectRecipeBias(mk(8, [-40], [{ A: 1 }])).reason, 'khong_phan_biet_duoc_voi_nguoi', 'chỉ một người từng pha → không phân biệt được');
eq(D.detectRecipeBias(mk(8, [-40, 30, -35, 20], [{ A: 1 }, { B: 1 }])).reason, 'khong_cung_chieu', 'lệch lúc thiếu lúc dư → không phải công thức');

// ── Xác minh khi người khác cân lại ──
let v = D.resolveVerification({ a: { count: 7463, book: 864 }, b: { count: 880, book: 864 + 0 }, base: 490, clean: true });
eq([v.outcome, v.dB, v.entryErrorQty, v.trueVariance], ['entry_error', 16, -16, 6615], 'B lệch nhỏ so với sổ → A nhập sai phần đó, phần còn lại là lệch thật');
v = D.resolveVerification({ a: { count: 699, book: 864 }, b: { count: 864 - 165 + 0, book: 699 }, base: 490, clean: true });
eq([v.outcome, v.dB], ['confirmed', 0], 'B cân trùng sổ lúc đó → lệch của A là thật');
v = D.resolveVerification({ a: { count: 7463, book: 864 }, b: { count: 730, book: 7463 }, base: 490, clean: true });
eq([v.outcome, v.dB, v.trueVariance], ['dispute', -6733, null], 'B lệch rất nhiều so với số A → tranh chấp, chủ quyết');
v = D.resolveVerification({ a: { count: 1000, book: 835 }, b: { count: 835, book: 1000 }, base: 400, clean: true });
eq([v.outcome, v.vA, v.dB, v.entryErrorQty, v.trueVariance], ['entry_error', 165, -165, 165, 0], 'A cân dư 165 g (ví dụ của chủ) → 165 g là lỗi nhập của A, lệch thật = 0');
console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
