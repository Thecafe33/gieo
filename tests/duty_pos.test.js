// POS — cổng "cân lại một lần" (cân mù: không nói số/mức lệch), nghi lệch sau lần cân thứ hai, và xác minh bởi người khác.
'use strict';
const { extract } = require('./lib/extract');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a).slice(0, 500), '!=', JSON.stringify(b).slice(0, 500)); } else console.log('ok', m); };
const names = ['_prepCountState', '_prepCountCardIdx', '_prepVerifyMode', '_prepCountNextBusy', 'UnitEngine', 'toast', 'renderPrepCountCard', 'submitPrepCount', '_prepCountRefreshLineCounted', 'submitPrepVerify',
  'resolveStaffPinAndCheckin', 'exitPrepVerifyPOS', '_posSubmitBusy', 'posDateKey', 'console'];
const load = (g, fns) => { const src = extract('posgieo.html', fns); const f = new Function(...Object.keys(g), src + '\nreturn {' + fns.join(',') + '};'); return f(...Object.values(g)); };
const mkLine = counted => { const l = { prepId: 'P', prepName: 'Cốt trà lài', sysQty: 864, activeBatches: [{ id: 'b1' }], batchQty: { b1: counted }, batchDone: { b1: false }, batchWeighings: { b1: [{ w: counted }] }, weighings: [], discardAll: false, counted }; return l; };

(async () => {
  const toasts = []; let submitted = 0, rendered = 0, idx = 0;
  const mkEnv = (needsFn) => ({
    _prepCountState: [], _prepCountCardIdx: 0, _prepVerifyMode: null, _prepCountNextBusy: false,
    UnitEngine: { duty: { gateCheck: async l => ({ needs: needsFn(l), variance: 1, usage: 1, book: 1 }) } },
    toast: m => toasts.push(m), renderPrepCountCard: () => { rendered++; }, submitPrepCount: async () => { submitted++; }, console: { warn() {}, log() {}, error() {} }
  });
  // load hàm thật
  const fnsNeeded = ['prepCountGoNext', '_prepCountGoNextImpl', '_prepCountResetLine'];
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
  // 8. bấm "Tiếp tục" hai lần khi mạng chậm → chỉ qua MỘT thẻ (không nhảy qua BTP chưa cân)
  {
    let release; const slow = new Promise(r => { release = r; }); const S = { idx: 0, cards: [mkLine(860), mkLine(500), mkLine(300)] }; let renders = 0;
    const src = extract('posgieo.html', ['prepCountGoNext', '_prepCountGoNextImpl', '_prepCountResetLine']).replace(/_prepCountCardIdx/g, 'S.idx').replace(/_prepCountState/g, 'S.cards');
    const fn = new Function('S', 'toast', 'renderPrepCountCard', 'submitPrepCount', 'submitPrepVerify', '_prepCountRefreshLineCounted', 'UnitEngine', 'console', 'let _prepCountNextBusy=false; let _prepVerifyMode=null;\n' + src + '\nreturn {prepCountGoNext};');
    const F = fn(S, () => {}, () => { renders++; }, async () => {}, async () => {}, () => {}, { duty: { gateCheck: async () => { await slow; return { needs: false }; } } }, { warn() {} });
    const a = F.prepCountGoNext(), b2 = F.prepCountGoNext();
    release(); await Promise.all([a, b2]);
    eq([S.idx, renders], [1, 1], 'bấm Tiếp tục hai lần khi chờ mạng → chỉ qua 1 thẻ, không nhảy qua thẻ chưa cân');
    // thẻ bị đổi trong lúc chờ mạng (VD quay lại thẻ trước) → không tự đi tiếp
    let release2; const slow2 = new Promise(r => { release2 = r; }); const S2 = { idx: 0, cards: [mkLine(860), mkLine(500)] }; renders = 0;
    const src2 = extract('posgieo.html', ['prepCountGoNext', '_prepCountGoNextImpl', '_prepCountResetLine']).replace(/_prepCountCardIdx/g, 'S.idx').replace(/_prepCountState/g, 'S.cards');
    const F2 = new Function('S', 'toast', 'renderPrepCountCard', 'submitPrepCount', 'submitPrepVerify', '_prepCountRefreshLineCounted', 'UnitEngine', 'console', 'let _prepCountNextBusy=false; let _prepVerifyMode=null;\n' + src2 + '\nreturn {prepCountGoNext};')(
      S2, () => {}, () => { renders++; }, async () => {}, async () => {}, () => {}, { duty: { gateCheck: async () => { await slow2; return { needs: false }; } } }, { warn() {} });
    const p2 = F2.prepCountGoNext(); S2.cards[0] = mkLine(861);   // thẻ hiện tại bị thay trong lúc chờ
    release2(); await p2;
    eq([S2.idx, renders], [0, 0], 'thẻ đổi trong lúc chờ cổng → không đi tiếp');
  }
  // 9. xác minh dùng khoá RIÊNG, không giữ khoá thanh toán
  {
    const busy = {}; const l = mkLine(834); const task = { id: 'verify_P', firstById: 'B' };
    const src = extract('posgieo.html', ['submitPrepVerify', '_submitPrepVerifyImpl']);
    const fn = new Function('busy', 'l', 'task', 'toast', 'resolveStaffPinAndCheckin', 'exitPrepVerifyPOS', 'posDateKey', 'console',
      'let _posSubmitBusy=false; let _dutyVerifyBusy=false; const _prepCountState=[l]; const _prepVerifyMode={task, session:1};\n' +
      'const UnitEngine={clock:{now:()=>1},duty:{verifyCommit:async()=>{busy.pos=_posSubmitBusy; busy.duty=_dutyVerifyBusy; return {};}}};\n' + src + '\nreturn {submitPrepVerify};');
    await fn(busy, l, task, () => {}, async () => ({ id: 'C', fullName: 'Chi' }), () => {}, () => 'd', console).submitPrepVerify();
    eq([busy.pos, busy.duty], [false, true], 'xác minh giữ khoá riêng (_dutyVerifyBusy), KHÔNG giữ _posSubmitBusy → thanh toán không bị chặn');
  }
  // 10. dựng màn đếm cuối ca luôn xoá chế độ xác minh cũ
  {
    const src = extract('posgieo.html', ['renderPrepCountScreen']);
    const fn = new Function('lines', 'verifyTask', 'let _prepVerifyMode={task:{id:"cũ"}}; let _prepVerifySeq=0; let _prepCountState=[]; let _prepCountCardIdx=0; const _prepCountApplyDiscardAll=()=>{}; const preloadVesselImagesPOS=()=>{}; const renderPrepCountCard=()=>{};\n' + src + '\nrenderPrepCountScreen(lines, verifyTask); return _prepVerifyMode;');
    const L = [{ prepId: 'P', activeBatches: [{ id: 'b1' }] }];
    eq([fn(L, undefined), fn(L, { id: 'T' })], [null, { task: { id: 'T' }, session: 1 }], 'dựng màn đếm cuối ca → bỏ chế độ xác minh dính từ trước; mở cân lại → đặt đúng việc');
  }
  // 11. xác minh hoàn tất MUỘN khi nhân viên đã sang màn đếm kết ca → không xoá danh sách cân mới
  {
    let release; const slow = new Promise(r => { release = r; }); const calls = [];
    const l = mkLine(834); const task = { id: 'verify_P', firstById: 'B' };
    const src = extract('posgieo.html', ['submitPrepVerify', '_submitPrepVerifyImpl']);
    const fn = new Function('l', 'task', 'slow', 'calls', 'toast', 'resolveStaffPinAndCheckin', 'exitPrepVerifyPOS', 'renderDutyTasksPOS', 'posDateKey', 'console',
      'let _posSubmitBusy=false; let _dutyVerifyBusy=false; const _prepCountState=[l]; let _prepVerifyMode={task, session:1};\n' +
      'const UnitEngine={clock:{now:()=>1},duty:{verifyCommit:async()=>{await slow; return {};}}};\n' + src + '\nreturn {submitPrepVerify, newScreen(){ _prepVerifyMode=null; _prepCountState.length=0; _prepCountState.push({prepId:"Q"}); }, state(){ return _prepCountState.map(x=>x.prepId); }};');
    const F = fn(l, task, slow, calls, () => {}, async () => ({ id: 'C', fullName: 'Chi' }), () => calls.push('exit'), () => calls.push('tasks'), () => 'd', console);
    const p = F.submitPrepVerify();
    await new Promise(r => setImmediate(r));
    F.newScreen();                       // nhân viên sang màn đếm kết ca và cân được BTP khác
    release(); await p;
    eq([calls, F.state()], [['tasks'], ['Q']], 'xác minh cũ xong muộn → không gọi exit (không xoá màn cân mới), chỉ làm mới danh sách việc');
  }
  // 12. kết ca: bước chuyển tiếp lỗi vẫn nhả khoá thanh toán
  {
    const src = extract('posgieo.html', ['continueAfterRefillChecklist']);
    const mk = failing => new Function('toast', 'console', '_failing',
      'let _posSubmitBusy=false; const clRemainingSec=()=>0; const _refillClearCountdown=()=>{}; const clLogComplete=async()=>{}; const fstore={collection:()=>({doc:()=>({set:async()=>{}})})};' +
      'const shiftState={businessDate:"d",closing:{}}; const firebase={firestore:{FieldValue:{arrayUnion:x=>x}}}; const _refillChecklistState=[];' +
      'const _continueAfterCashPass=async()=>{ if(_failing) throw new Error("ghi lỗi"); };\n' + src + '\nreturn {run: continueAfterRefillChecklist, busy: ()=>_posSubmitBusy};');
    const toasts2 = [];
    const bad = mk(true)((m) => toasts2.push(m), { warn() {}, error() {} }, true); await bad.run();
    eq([bad.busy(), toasts2.some(m => /thử/.test(m))], [false, true], 'chuyển bước lỗi → vẫn nhả _posSubmitBusy và báo để thử lại');
    const good = mk(false)(() => {}, { warn() {}, error() {} }, false); await good.run();
    eq(good.busy(), false, 'chuyển bước thành công → nhả khoá');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL'); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception', e && e.stack); process.exit(1); });
