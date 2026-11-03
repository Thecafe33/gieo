// Chi tiết tem (quanlygieo): dòng thời gian phải thấy phần NẤU MẺ + chênh lệch dù tem không có usageEvents cho chúng.
// Số liệu mẫu rút từ bản kiểm toán gg01 31/10–03/11/2026 (tem 0260VT73 / DWXG9EKN, mẻ Phô mai tươi 24VC5THV).
const vm = require('vm');
const { extract } = require('./lib/extract');
const code = extract('quanlygieo.html', ['fmtNum', 'ctnPrepEventsFromLedger']);
const ctx = {}; vm.createContext(ctx); vm.runInContext(code + '\nthis.f = ctnPrepEventsFromLedger;', ctx);
const f = ctx.f;
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail = 1; };
const T1 = 'recv_x_ctn_WphK7_2', T2 = 'recv_x_ctn_WphK7_11';
const tem1 = { id: T1, unit: 'g', baseQty: 1023, unitBase: 0, usageEvents: [{ refId: 'bill_a', qty: 240, refType: 'order' }, { refId: 'bill_b', qty: 120, refType: 'order' }] };
const tem2 = { id: T2, unit: 'g', baseQty: 1023, unitBase: 891, usageEvents: [] };
const after = { id: 'prep_after_B_I', type: 'CONSUMPTION', prepRecon: true, referenceId: 'B', createdAt: '2026-11-03T05:31:23.452Z', staff: 'Duy',
  fifoAllocations: [{ containerId: T1, qty: 450, code: '0260VT73' }] };
const vari = { id: 'prep_variance_B_I', type: 'ADJUSTMENT', prepReconVariance: true, varianceKind: 'uncertain', needsReview: true, referenceId: 'B', createdAt: '2026-11-03T05:31:22.229Z',
  responsibility: { employeeName: 'Duy', reason: 'Duy' },
  varianceAllocations: [{ containerId: T2, qty: 132 }, { containerId: T1, qty: 213 }] };
const batches = { B: { prepName: 'Phô mai tươi', batchCode: '24VC5THV' } };

const e1 = f(tem1, [after, vari], batches);
ok(e1.length === 2, 'tem 1: 2 sự kiện (nấu 450 + chênh 213), có ' + e1.length);
const nau = e1.find(e => e.grp === 'nau'), lech = e1.find(e => e.grp === 'lech');
ok(nau && nau.qty === 450 && /Trừ 450 g/.test(nau.label) && /Phô mai tươi/.test(nau.detail) && /24VC5THV/.test(nau.detail), 'nấu mẻ: 450 g, có tên mẻ + mã lô');
ok(lech && lech.qty === 213 && /213/.test(lech.label) && /giải trình/.test(lech.label) && /người giải trình: Duy/.test(lech.detail), 'chênh lệch: 213 g, ghi người giải trình');
ok(nau.goBatch === 'B' && lech.goBatch === 'B', 'có id mẻ để mở "Xem mẻ"');
ok(360 + e1.reduce((n, e) => n + e.qty, 0) === 1023, 'Σ bill 360 + nấu + chênh = 1023 (đúng dung tích tem)');
const e2 = f(tem2, [after, vari], batches);
ok(e2.length === 1 && e2[0].qty === 132 && e2[0].grp === 'lech', 'tem 2: chỉ thấy 132 g chênh (đã thuộc về tem này), không thấy 450 của tem 1');
ok(f({ id: 'khac', unit: 'g' }, [after, vari], batches).length === 0, 'tem không liên quan → không có sự kiện');
ok(f(tem1, [after], {}).length === 1 && /Mẻ chế biến/.test(f(tem1, [after], {})[0].detail), 'thiếu doc mẻ vẫn hiện (không vỡ)');
// tránh lặp: tem đã có usageEvents của chính mẻ đó (đường allocate) thì bỏ
ok(f({ ...tem1, usageEvents: [{ refId: 'B', qty: 450 }] }, [after, vari], batches).length === 0, 'không lặp nếu tem đã ghi usageEvents của mẻ đó');
// waste / prior_variance
ok(/hao hụt lúc nấu/.test(f(tem1, [{ ...vari, type: 'WASTE', varianceKind: 'waste' }], batches)[0].label), 'WASTE → "hao hụt lúc nấu"');
ok(/lệch tồn từ mốc trước/.test(f(tem1, [{ ...vari, varianceKind: 'prior_variance' }], batches)[0].label), 'prior_variance → "lệch tồn từ mốc trước"');
// sổ ghi thiếu: cộng lại
const sur = { type: 'ADJUSTMENT', prepReconSurplus: true, referenceId: 'B', createdAt: '2026-11-03T05:31:24Z', surplusLots: [{ containerId: T1, qty: 40 }] };
const es = f(tem1, [sur], batches);
ok(es.length === 1 && es[0].qty === -40 && es[0].grp === 'cong' && /Cộng lại 40/.test(es[0].label), 'sổ ghi thiếu → "Cộng lại 40 g" (qty âm trong tổng)');
// tự chốt khi đối chiếu kẹt: lấy theo mức giảm từng mã; dòng variance của tự chốt bị bỏ để không đếm đôi
const forced = { type: 'CONSUMPTION', prepRecon: true, forcedSettle: true, referenceId: 'B', createdAt: '2026-11-03T06:00:00Z', staff: 'QL',
  weighings: [{ id: T1, baseline: 663, after: 100, finished: false }, { id: 'kia', baseline: 50, after: 0, finished: true }] };
const ef = f(tem1, [forced, { ...vari, forcedSettle: true }], batches);
ok(ef.length === 1 && ef[0].qty === 563 && /tự chốt/.test(ef[0].label), 'tự chốt: 663−100 = 563 g, bỏ dòng variance của tự chốt');
ok(f({ id: 'kia', unit: 'g' }, [forced], batches)[0].qty === 50, 'tự chốt, mã đã báo hết trong mẻ: lấy baseline');
// thời điểm để sắp xếp
ok(e1.every(e => typeof e.at === 'string' && e.at.startsWith('2026-11-03T05:31')), 'at = giờ ghi sổ (12:31 giờ VN, sau "Báo hết" 12:29)');
// an toàn: id mẻ lạ không được chèn vào onclick
ok(f(tem1, [{ ...after, referenceId: "x');alert(1);//" }], {})[0].goBatch === '', 'id mẻ bất thường → không tạo nút "Xem mẻ"');
console.log(fail ? 'SOME FAIL' : 'ALL PASS'); process.exit(fail);
