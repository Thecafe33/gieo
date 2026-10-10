// Kết ca — ĐẾM TIỀN MẶT (11/10): hàm thật _submitShiftCloseImpl từ posgieo.html, DOM / Firestore giả.
//  · Lệch lần 1 → báo đếm lại (chưa chốt). Lệch lần 2 (lần cuối) → GHI NHẬN số đã đếm + CHO QUA, dù có hay không có ghi chú.
//  · Ghi chú là TUỲ CHỌN và phải được LƯU nếu có. Lỗi cũ: ô ghi chú nằm trong #shiftBody mà hàm ghi đè #shiftBody
//    ("Đang đối soát...") TRƯỚC khi đọc nó → ghi chú luôn rỗng → bị đòi "ghi rõ lý do" mãi, không bao giờ qua được.
'use strict';
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const src = extract('posgieo.html', ['_submitShiftCloseImpl']);

// Máy POS giả. `denoms` = tổng tiền đếm được (cfDenomTotal đọc thẳng số này). `expected` = số hệ thống tính.
function may({ expected = 1000000, tolerance = 0, truoc = [] }) {
  const log = { toast: [], qua: 0, dem: 0, xemLai: 0, doc: { attempts: truoc.slice() } };
  const els = {};
  // Giống trình duyệt: gán innerHTML của #shiftBody xoá mọi phần tử con (kể cả ô ghi chú).
  const shiftBody = { _h: '', get innerHTML() { return this._h; }, set innerHTML(v) { this._h = v; delete els.shiftCloseNote; } };
  els.shiftBody = shiftBody;
  const setDoc = d => { Object.keys(d).forEach(k => { if (k === 'attempts') log.doc.attempts = log.doc.attempts.concat(d.attempts.__u); else log.doc[k] = d[k]; }); };
  const stubs = {
    document: { getElementById: id => els[id] || null },
    resolveStaffPinWorkedToday: async () => ({ id: 'e1', fullName: 'Quách Khánh Duy' }),
    cfDenomTotal: d => d.total, _shiftCloseDenomsRef: null,
    fstore: { collection: n => n === 'finance_gieogieo'
      ? { doc: () => ({ get: async () => ({ exists: tolerance > 0, data: () => ({ cashToleranceAmount: tolerance }) }) }) }
      : { doc: () => ({ get: async () => ({ exists: log.doc.attempts.length > 0, data: () => log.doc }), set: async d => setDoc(d) }) } },
    firebase: { firestore: { FieldValue: { arrayUnion: x => ({ __u: [x] }) } } },
    recheckCloseAfterSalesPOS: async () => {}, loadCloseDayOrdersPOS: async () => {}, loadSegmentsPOS: async () => {},
    ensureOpeningSegmentPOS: async () => null, computeExpectedCashPOS: async () => expected, computeSegmentExpectedPOS: async () => ({ expected }),
    shiftState: { businessDate: '2026-10-11', opening: { openingCash: expected }, closing: null },
    CASH_COUNT_MAX_ATTEMPTS: 2, SEG_COLL: 'shift_segments_gieogieo', segDocId: (d, n) => d + '_' + n,
    toast: m => log.toast.push(m), proceedAfterCashPass: () => { log.qua++; },
    renderShiftCloseReview: () => { log.xemLai++; }, renderShiftCloseCountForm: () => { log.dem++; }, console: { warn() {}, error() {}, log() {} }
  };
  const ks = Object.keys(stubs);
  const F = new Function(...ks, 'let _shiftCloseDenoms = { total: 0 };\n' + src + '\nreturn { chay: (tong) => { _shiftCloseDenoms = { total: tong }; return _submitShiftCloseImpl(); } };')(...ks.map(k => stubs[k]));
  return { F, log, els };
}

(async () => {
  // 1. Khớp ngay lần đầu → qua, trạng thái "khớp".
  let m = may({}); await m.F.chay(1000000);
  eq([m.log.doc.status, m.log.qua, m.log.doc.varianceAccepted], ['cash_passed', 1, null], 'khớp lần 1: cash_passed, qua bước sau');

  // 2. Lệch lần 1 → CHƯA chốt, báo còn 1 lần đếm.
  m = may({}); await m.F.chay(900000);
  eq([m.log.doc.status, m.log.qua, m.log.doc.attempts.length, m.log.toast.some(t => /còn 1 lần đếm/.test(t))], ['pending', 0, 1, true], 'lệch lần 1: chưa chốt, báo đếm lại');

  // 3. Lệch lần 2 + CÓ ghi chú gõ vào ô → qua, ghi chú được LƯU (đây là ca bị kẹt trước đây).
  m = may({ truoc: [{ variance: -100000, passed: false }] });
  m.els.shiftCloseNote = { value: '  Thối nhầm cho khách 20.000đ lúc trưa  ' };
  await m.F.chay(900000);
  eq([m.log.doc.status, m.log.qua, m.log.doc.varianceAccepted, m.log.doc.varianceNote, m.log.doc.finalVariance], ['cash_variance_recorded', 1, true, 'Thối nhầm cho khách 20.000đ lúc trưa', -100000], 'lệch lần 2 + có ghi chú: QUA, lưu ghi chú và mức lệch');
  eq(m.log.doc.attempts[m.log.doc.attempts.length - 1].note, 'Thối nhầm cho khách 20.000đ lúc trưa', 'ghi chú nằm trong bản ghi lần đếm cuối');

  // 4. Lệch lần 2 + KHÔNG ghi chú → vẫn qua (không bắt lý do).
  m = may({ truoc: [{ variance: -100000, passed: false }] });
  await m.F.chay(900000);
  eq([m.log.doc.status, m.log.qua, m.log.doc.varianceNote, m.log.toast.some(t => /lý do/.test(t))], ['cash_variance_recorded', 1, null, false], 'lệch lần 2 + để trống: QUA, không đòi lý do');

  // 5. Thừa tiền cũng như vậy (lệch dương).
  m = may({ truoc: [{ variance: 50000, passed: false }] });
  await m.F.chay(1050000);
  eq([m.log.doc.status, m.log.doc.finalVariance, m.log.qua], ['cash_variance_recorded', 50000, 1], 'thừa tiền lần 2: ghi nhận +50.000 và qua');

  // 6. Trong dung sai → khớp ngay, không tính là lệch.
  m = may({ tolerance: 5000 }); await m.F.chay(997000);
  eq([m.log.doc.status, m.log.qua], ['cash_passed', 1], 'lệch trong dung sai: coi là khớp');

  // 7. Ghi chú gõ ở lần đếm ĐẦU (chưa phải lần cuối) không bị lưu nhầm vào lần 1 chưa chốt.
  m = may({}); m.els.shiftCloseNote = { value: 'gõ nhầm sớm' }; await m.F.chay(900000);
  eq([m.log.doc.status, m.log.doc.varianceNote === undefined, m.log.doc.attempts[0].note], ['pending', true, undefined], 'lần 1 (chưa chốt) không lưu ghi chú / không chốt lệch');

  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
