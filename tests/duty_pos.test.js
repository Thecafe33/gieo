// POS — cổng "cân lại một lần" (cân mù: không nói số/mức lệch), nghi lệch sau lần cân thứ hai, và xác minh bởi người khác.
'use strict';
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 500), '!=', JSON.stringify(b).slice(0, 500)); } else console.log('ok', m); };
const names = ['_prepCountState', '_prepCountCardIdx', '_prepVerifyMode', 'UnitEngine', 'toast', 'renderPrepCountCard', 'submitPrepCount', '_prepCountRefreshLineCounted', 'submitPrepVerify',
  'resolveStaffPinAndCheckin', 'exitPrepVerifyPOS', '_posSubmitBusy', 'posDateKey', 'console'];
const load = (g, fns) => { const src = extract('posgieo.html', fns); const f = new Function(...Object.keys(g), src + '\nreturn {' + fns.join(',') + '};'); return f(...Object.values(g)); };
const mkLine = counted => { const l = { prepId: 'P', prepName: 'Cốt trà lài', sysQty: 864, activeBatches: [{ id: 'b1' }], batchQty: { b1: counted }, batchDone: { b1: false }, batchWeighings: { b1: [{ w: counted }] }, weighings: [], discardAll: false, counted }; return l; };

(async () => {
  const toasts = []; let submitted = 0, rendered = 0, idx = 0;
  const mkEnv = (needsFn) => ({
    _prepCountState: [], _prepCountCardIdx: 0, _prepVerifyMode: null,
    UnitEngine: { duty: { gateCheck: async l => ({ needs: needsFn(l), variance: 1, usage: 1, book: 1 }) } },
    toast: m => toasts.push(m), renderPrepCountCard: () => { rendered++; }, submitPrepCount: async () => { submitted++; }, console: { warn() {}, log() {}, error() {} }
  });
  // load hàm thật
  const fnsNeeded = ['prepCountGoNext', '_prepCountResetLine'];
  const mkF = needs => {
    const env = mkEnv(needs); const l = mkLine(7463.6); env._prepCountState = [l];
    const refresh = ln => { const all = ln.activeBatches.every(b => ln.batchQty[b.id] !== null); ln.counted = all ? ln.activeBatches.reduce((s, b) => s + (Number(ln.batchQty[b.id]) || 0), 0) : null; };
    const scope = { ...env, _prepCountRefreshLineCounted: refresh, submitPrepVerify: async () => {} };
    const F = load(scope, fnsNeeded);
    return { F, l, env };
  };
  // 1. lần đầu lệch → bắt cân lại, xoá số cũ, không nói số
  {
    toasts.length = 0; submitted = 0;
    const { F, l } = mkF(x => x.counted > 1000);
    await F.prepCountGoNext();
    eq([l.recountDone, l.counted, l.batchQty.b1, l.attempt1, l.suspect, submitted], [true, null, null, 7463.6, false, 0], 'lần 1 lệch → xoá số đã cân, bắt cân lại, chưa ghi');
    eq(toasts.length === 1 && !/\d{3}/.test(toasts[0]), true, 'lời nhắc không nêu số/mức lệch (cân mù)');
    // 2. cân lại vẫn như cũ → ghi nhận nhưng nghi lệch
    l.batchQty.b1 = 7470; l.counted = 7470;
    await F.prepCountGoNext();
    eq([l.suspect, submitted], [true, 1], 'lần 2 vẫn lệch → nghi lệch, vẫn ghi nhận (không cân lần 3)');
  }
  // 3. cân lại ra số gần sổ → không nghi
  {
    submitted = 0;
    const { F, l } = mkF(x => x.counted > 1000);
    await F.prepCountGoNext(); l.batchQty.b1 = 870; l.counted = 870;
    await F.prepCountGoNext();
    eq([l.suspect, submitted], [false, 1], 'lần 2 về gần sổ → dùng số mới, không nghi');
  }
  // 4. lần đầu không lệch → đi tiếp luôn
  {
    submitted = 0;
    const { F, l } = mkF(() => false); l.batchQty.b1 = 860; l.counted = 860;
    await F.prepCountGoNext();
    eq([l.recountDone, l.suspect, submitted], [undefined, undefined, 1], 'không lệch → không hỏi lại');
  }
  // 5. bỏ hết có chủ đích → không qua cổng
  {
    submitted = 0;
    const { F, l } = mkF(() => true); l.discardAll = true;
    await F.prepCountGoNext();
    eq([l.recountDone, submitted], [undefined, 1], 'bỏ hết có chủ đích → không bắt cân lại');
  }
  // 6. gateCheck lỗi (mất mạng) → không chặn kết ca
  {
    submitted = 0;
    const env = mkEnv(() => true); env.UnitEngine.duty.gateCheck = async () => { throw new Error('mạng'); };
    const l = mkLine(7463.6); env._prepCountState = [l];
    const F = load({ ...env, _prepCountRefreshLineCounted: () => {}, submitPrepVerify: async () => {} }, fnsNeeded);
    await F.prepCountGoNext();
    eq(submitted, 1, 'gateCheck lỗi → vẫn đi tiếp, không chặn');
  }
  // 7. xác minh: người cân đầu không tự xác minh; người khác thì gọi engine
  {
    const calls = []; const l = mkLine(834); l.snaps = { b1: { book: 7433.6 } };
    const task = { id: 'verify_P', firstById: 'B', prepId: 'P' };
    const mk = emp => load({ _prepCountState: [l], _prepVerifyMode: { task }, _posSubmitBusy: false, UnitEngine: { clock: { now: () => 1 }, duty: { verifyCommit: async (...a) => { calls.push(a); return {}; } } },
      toast: m => toasts.push(m), resolveStaffPinAndCheckin: async () => emp, exitPrepVerifyPOS: () => { calls.push('exit'); }, posDateKey: () => '2026-09-23', console }, ['_submitPrepVerifyImpl'])._submitPrepVerifyImpl;
    toasts.length = 0;
    await mk({ id: 'B', fullName: 'Bình' })();
    eq([calls.length, /khác/.test(toasts[0] || '')], [0, true], 'người cân lần trước không tự xác minh');
    await mk({ id: 'C', fullName: 'Chi' })();
    eq([calls[0][0] === l, calls[0][1].id, calls[0][2].staff.id, calls[0][2].businessDate, calls[1]], [true, 'verify_P', 'C', '2026-09-23', 'exit'], 'người khác → gọi engine với mốc sổ đã chụp rồi thoát màn');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
