// Tách từ posgieo.html dòng 8649–8851 (tools/tach_posgieo/chuyen.js, 2026-10-26). ĐÃ PHÁT HÀNH thì KHÔNG sửa nội dung —
// tạo pos_expiry.v2.js và trỏ HTML tới (sổ tools/js_da_phat_hanh.json). Nạp TRƯỚC <script> chính; CHỈ khai báo.
(window.PosGieoMods = window.PosGieoMods || {}).expiry = 'dang';

// ══════════════════════════════════════════════════════════════════════════
// [BTP ÂM — chủ quán 23/10, docs/KE_HOACH_BTP_AM.md]
// A. HẠN DÙNG — KHÔNG hỏi gì lúc thanh toán (khách đang chờ; chủ quán 23/10 bỏ popup lúc bấm bill).
//    • Mở ca (Việc đầu ca, chặn bán như các bước đầu ca khác): mọi lô BTP / mã NL đang mở sẽ hết hạn TRONG HÔM NAY hoặc đã
//      quá hạn → nhân viên kiểm tra và xác nhận «Còn dùng được» (PIN, gia hạn thêm PREP_EXTEND_HOURS giờ tính từ hạn cũ —
//      đã quá hạn thì từ bây giờ — in tem gia hạn, không giới hạn số lần) hoặc «Bỏ đi» (BTP: ghi đổ bỏ phần còn của lô;
//      NL: mở đúng màn Báo hết hiện có). Loại hết hạn CUỐI NGÀY: lô của hôm nay không hỏi (dùng trong ngày), lô ngày cũ
//      chỉ có «Bỏ đi». Lỗi đọc → bỏ qua bước này, không chặn bán.
//    • Trong ngày: lô sắp hết hạn (≤ EXP_SOON_MIN phút) / đã quá hạn hiện ở chuông thông báo sẵn có — chỉ dùng dữ liệu đã có
//      trong máy (không đọc thêm), nhân viên bấm lúc rảnh.
//    • Check-out: còn lô ĐÃ quá hạn đang mở → xử lý rồi mới check-out (không để ca sau dùng nhầm).
// B. Bán BTP lúc KHÔNG còn lô → người có ca lúc đó phải trả lời khi check-out (dùng loại nào thay theo cấu hình ở Quản lý /
//    nấu mẻ mới kịp / không dùng gì). Câu trả lời lưu vào phiếu đối chiếu BTP âm; kết ca dùng lại, Engine 2 tự xác nhận.
// ══════════════════════════════════════════════════════════════════════════
const PREP_EXTEND_HOURS = 24;

const EXP_SOON_MIN = 30;

function prepLotExpired(b, nowMs, today) {
  if (!b || b.shelfLifeType === 'none') return false;
  if (b.shelfLifeType === 'endOfDay') return !!b.businessDate && b.businessDate < today;   // hết hạn khi đóng ngày
  const t = b.expiresAt ? Date.parse(b.expiresAt) : NaN;
  return Number.isFinite(t) && t <= nowMs;
}

// Hàm THUẦN: lô BTP 'active' / mã NL 'open' cần kiểm hạn. Mặc định tới hết hôm nay (giờ VN);
// opts.untilMs = mốc khác (chuông: bây giờ + EXP_SOON_MIN); opts.expiredOnly = chỉ lô đã quá hạn (check-out).
function expiryCheckLines(batches, containers, nowMs, today, opts) {
  const o = opts || {};
  const until = o.expiredOnly ? nowMs : (Number.isFinite(o.untilMs) ? o.untilMs : Date.parse(today + 'T23:59:59.999+07:00'));
  const out = [];
  (batches || []).forEach(b => {
    if (!b || b.status !== 'active' || !b.shelfLifeType || b.shelfLifeType === 'none') return;
    const left = Number(b.qtyRemaining);
    if (!(left > 0.005)) return;
    if (b.shelfLifeType === 'endOfDay') { if (!prepLotExpired(b, nowMs, today)) return; }
    else { const t = Date.parse(b.expiresAt || ''); if (!Number.isFinite(t) || t > until) return; }
    out.push({ kind: 'prep', id: b.id, name: b.prepName || '', code: b.batchCode || '', unit: b.unit || '', left: round2(left),
      expiresAt: b.expiresAt || null, endOfDay: b.shelfLifeType === 'endOfDay', expired: prepLotExpired(b, nowMs, today),
      extendable: b.shelfLifeType !== 'endOfDay', ref: b });
  });
  (containers || []).forEach(c => {
    if (!c || c.status !== 'open') return;
    const t = Date.parse(c.expiresAt || '');
    if (!Number.isFinite(t) || t > until) return;
    const left = Number(c.unitBase);
    out.push({ kind: 'item', id: c.id, name: c.itemName || '', code: c.code || '', unit: c.unit || '', left: Number.isFinite(left) ? round2(left) : null,
      expiresAt: c.expiresAt, endOfDay: false, expired: t <= nowMs, extendable: true, ref: c });
  });
  const at = x => x.endOfDay ? 0 : (Date.parse(x.expiresAt || '') || 0);
  return out.sort((a, b) => at(a) - at(b));
}

// Gia hạn thêm PREP_EXTEND_HOURS tính từ hạn cũ; đã quá hạn thì tính từ bây giờ.
function expiryExtendTo(expiresAt, nowMs) {
  const t = Date.parse(expiresAt || '');
  return new Date(Math.max(nowMs, Number.isFinite(t) ? t : 0) + PREP_EXTEND_HOURS * 3600000).toISOString();
}

let _expWatchPrep = [];

async function loadExpiryCheckLinesPOS(opts) {
  const [bs] = await Promise.all([fstore.collection('prep_batches_gieogieo').where('status', '==', 'active').get(), loadOpenContainers()]);
  _expWatchPrep = bs.docs.map(d => ({ id: d.id, ...d.data() }));
  return expiryCheckLines(_expWatchPrep, STOCK_OPEN_LIST, Date.now(), posDateKey(), opts);
}

// Chuông: chỉ dữ liệu trong máy (bước đầu ca + danh sách lô / mã đã nạp ở màn Kho, Chế biến).
function expirySoonLines() {
  const by = new Map();
  [..._expWatchPrep, ...(PREP_BATCHES_CACHE_POS || [])].forEach(b => { if (b && b.id) by.set(b.id, b); });
  const now = Date.now();
  return expiryCheckLines([...by.values()], STOCK_OPEN_LIST, now, posDateKey(), { untilMs: now + EXP_SOON_MIN * 60000 });
}

let _expSoonSig = '';

function expirySoonTick() {
  if (document.hidden) return;
  const sig = expirySoonLines().map(x => x.id + (x.expired ? '!' : '')).join(',');
  if (sig !== _expSoonSig) { _expSoonSig = sig; renderFifoAlertBar(); }
}

function fmtPrepTime(iso) { const d = iso ? vnDate(iso) : null; if (!d || isNaN(d)) return '—'; const p = n => String(n).padStart(2, '0'); return p(d.getHours()) + ':' + p(d.getMinutes()) + ' ' + p(d.getDate()) + '/' + p(d.getMonth() + 1); }

function expiryLineWhen(x) {
  if (x.endOfDay) return 'Hết hạn khi đóng ngày ' + (x.ref.businessDate ? posDateKeyToDisplay(x.ref.businessDate) : '') + ' — không được gia hạn';
  return (x.expired ? 'Đã hết hạn lúc ' : 'Hết hạn lúc ') + fmtPrepTime(x.expiresAt);
}

// Màn kiểm hạn — phase 'open' (trong Việc đầu ca), 'soon' (từ chuông), 'checkout' (trước khi check-out).
let _expCheck = null, _expAfterSheet = null;

function expiryCheckHTML(st) {
  const T = { open: ['Kiểm hạn dùng đầu ca', 'Các lô dưới đây hết hạn trong hôm nay. Kiểm tra ngay bây giờ để lúc bán không phải dừng lại: còn dùng được thì gia hạn thêm ' + PREP_EXTEND_HOURS + ' giờ và dán tem mới, không dùng được thì bỏ đi.'],
    soon: ['Lô sắp hết hạn', 'Kiểm tra lúc rảnh: còn dùng được thì gia hạn thêm ' + PREP_EXTEND_HOURS + ' giờ và dán tem mới, không dùng được thì bỏ đi.'],
    checkout: ['Còn lô đã quá hạn', 'Xử lý trước khi check-out để ca sau không dùng nhầm.'] }[st.phase];
  return `<div class="kc-card" style="margin:0">
    <div class="kc-title" style="color:#c0392b;padding-bottom:6px">${T[0]}</div>
    <div style="font-size:13px;line-height:1.55;color:var(--td);margin-bottom:12px">${T[1]}</div>
    ${renderPinInput('expChkStaff_' + st.phase)}
    <div id="expChkMsg_${st.phase}" style="font-size:12.5px;color:#c0392b;min-height:16px;margin:8px 0"></div>
    ${st.lines.map((x, i) => `<div class="kc-sub" style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-size:15px">${escHtmlPos(x.name)}</b><span class="kc-pill" style="background:${x.expired ? '#c0392b' : '#d97706'}">${x.kind === 'prep' ? 'Lô ' : 'Mã '}${escHtmlPos(x.code)}</span></div>
      <div style="font-size:13px;color:#555;margin:6px 0 10px">${escHtmlPos(expiryLineWhen(x))}${x.left != null ? ' · còn ' + fmtPrepQty(x.left) + ' ' + escHtmlPos(x.unit) : ''}</div>
      <div style="display:flex;gap:8px">
        ${x.extendable ? `<button class="kc-btn" style="flex:1;margin:0;background:var(--gd);color:#fff" onclick="expiryCheckAct(${i},'keep')">Còn dùng được</button>` : ''}
        <button class="kc-btn" style="flex:1;margin:0;background:#fff;color:#c0392b;border:1.5px solid #f3b2bf" onclick="expiryCheckAct(${i},'discard')">Bỏ đi</button>
      </div></div>`).join('')}
    ${st.phase === 'open' ? '' : `<button class="kc-btn" style="background:none;color:#888;font-size:14px;font-weight:700;padding:12px" onclick="expiryCheckClose()">${st.phase === 'checkout' ? 'Quay lại' : 'Để sau'}</button>`}
  </div>`;
}

function expiryCheckShow(st) {
  _expCheck = st;
  if (st.phase === 'open') { const box = document.getElementById('shiftBody'); if (box) box.innerHTML = expiryCheckHTML(st); return; }
  let ov = document.getElementById('exp-check-overlay');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'exp-check-overlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:900;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px);';
    document.body.appendChild(ov);
  }
  ov.innerHTML = `<div style="width:100%;max-width:460px;max-height:92vh;overflow:auto;animation:pi .18s ease;">${expiryCheckHTML(st)}</div>`;
}

function expiryCheckClose() { document.getElementById('exp-check-overlay')?.remove(); _expCheck = null; }

// Đọc lại (sự thật mới nhất) rồi vẽ lại; hết việc → bước tiếp theo của phase.
async function expiryCheckRefresh() {
  const st = _expCheck; if (!st) return;
  let lines;
  try { lines = await loadExpiryCheckLinesPOS(st.phase === 'checkout' ? { expiredOnly: true } : st.phase === 'soon' ? { untilMs: Date.now() + EXP_SOON_MIN * 60000 } : null); }
  catch (err) { console.warn('[Hạn dùng] không đọc lại được lô', err); lines = st.lines; }
  _expSoonSig = ''; renderFifoAlertBar();
  if (_expCheck !== st) return;
  if (lines.length) { expiryCheckShow({ ...st, lines }); return; }
  if (st.phase === 'open') { _expCheck = null; await expiryOpenDone().catch(err => console.warn('[Hạn dùng] chưa ghi được dấu đã kiểm', err)); renderOpeningChecklist(true); return; }
  expiryCheckClose();
  if (st.phase === 'checkout') doCheckOut();
  else toast('✅ Đã kiểm xong các lô sắp hết hạn');
}

async function expiryCheckAct(i, action) {
  const st = _expCheck, x = st && st.lines[i]; if (!x || st.busy) return;
  const msg = t => { const m = document.getElementById('expChkMsg_' + st.phase); if (m) m.textContent = t; };
  if (x.kind === 'item' && action === 'discard') {   // NL: đúng màn Báo hết hiện có (đủ nhánh mã nguyên / mẻ đang nấu / còn thừa)
    _expAfterSheet = () => expiryCheckRefresh();
    if (st.phase !== 'open') document.getElementById('exp-check-overlay')?.remove();
    openConfirmFinishSheet(x.ref, false);
    return;
  }
  st.busy = true;
  try {
    const who = await resolveStaffPinWorkedToday('expChkStaff_' + st.phase); if (!who) { st.busy = false; return; }
    const source = 'pos_' + st.phase;
    if (x.kind === 'prep') {
      if (action === 'keep') await prepExtendLotPOS(x.ref, who, source);
      else await prepDiscardExpiredLotPOS(x.ref, x.left, who, 'Hết hạn — nhân viên xác nhận không dùng được (' + (st.phase === 'open' ? 'kiểm đầu ca' : st.phase === 'checkout' ? 'trước check-out' : 'trong ca') + ')');
    } else await nlExtendOpenUnitPOS(x.ref, who, source);
    st.busy = false;
    await expiryCheckRefresh();
  } catch (err) { console.error('[Hạn dùng]', err); msg('Chưa lưu được: ' + (err.message || err)); st.busy = false; }
}

async function expiryCheckOpenSoon() {
  _fifoAlertExpanded = false; renderFifoAlertBar();
  expiryCheckShow({ phase: 'soon', lines: expirySoonLines() });
  await expiryCheckRefresh();
}

// Dấu «đã kiểm hạn đầu ca hôm nay» — sau đó lô mới trong ngày chỉ nhắc ở chuông, không chặn bán.
// update() (KHÔNG set): bản ghi mở ca TỒN TẠI = đã mở ca (_watchShiftOpenedStatus) — không bao giờ tự tạo nó ở đây.
function expiryOpenDone() {
  return fstore.collection('daily_openings_gieogieo').doc(posDateKey()).update({ expiryCheckedAt: vnDate().toISOString() });
}

// Check-out: true = đang hiện màn kiểm hạn (dừng check-out; xử lý xong tự check-out lại). Lỗi đọc → không chặn.
async function expiryAskOnCheckOut() {
  let lines;
  try { lines = await loadExpiryCheckLinesPOS({ expiredOnly: true }); }
  catch (err) { console.warn('[Hạn dùng] không đọc được lô — không chặn check-out', err); return false; }
  if (!lines.length) return false;
  expiryCheckShow({ phase: 'checkout', lines });
  return true;
}

function _expSyncCaches(kind, id, patch) {
  const lists = kind === 'prep' ? [PREP_BATCHES_CACHE_POS, _expWatchPrep] : [STOCK_OPEN_LIST];
  lists.forEach(l => (l || []).forEach((x, j) => { if (x.id === id) l[j] = { ...x, ...patch }; }));
}

async function prepExtendLotPOS(b, who, source) {
  if (b.shelfLifeType === 'endOfDay') throw new Error('Loại hết hạn cuối ngày không được gia hạn');
  const to = expiryExtendTo(b.expiresAt, Date.now());
  const ext = { at: vnDate().toISOString(), by: who.fullName || '', byId: who.id || '', from: b.expiresAt || null, to, source: source || 'pos' };
  await UnitEngine.batches.annotate(b.id, { expiresAt: to, expiryExtensions: firebase.firestore.FieldValue.arrayUnion(ext) });
  const nb = { ...b, expiresAt: to, expiryExtensions: [...(b.expiryExtensions || []), ext] };
  _expSyncCaches('prep', b.id, { expiresAt: to, expiryExtensions: nb.expiryExtensions });
  try { if (await POSTemPrinter.printPrepBatchLabel(nb, 1) === false) toast('⚠️ Đã gia hạn — chưa in được tem gia hạn, in lại ở màn Chế biến'); else toast('✅ Đã gia hạn tới ' + fmtPrepTime(to) + ' — dán tem gia hạn lên khay'); }
  catch (e) { toast('⚠️ Đã gia hạn — chưa in được tem gia hạn'); }
}

async function nlExtendOpenUnitPOS(c, who, source) {
  const to = expiryExtendTo(c.expiresAt, Date.now());
  const ext = { at: vnDate().toISOString(), by: who.fullName || '', byId: who.id || '', from: c.expiresAt || null, to, source: source || 'pos' };
  await UnitEngine.containers.annotate(c.id, { expiresAt: to, expiryExtensions: firebase.firestore.FieldValue.arrayUnion(ext) });
  const nc = { ...c, expiresAt: to, expiryExtensions: [...(c.expiryExtensions || []), ext] };
  _expSyncCaches('item', c.id, { expiresAt: to, expiryExtensions: nc.expiryExtensions });
  try { if (await POSTemPrinter.printOpenLabel(nc, 1) === false) toast('⚠️ Đã gia hạn — chưa in được tem gia hạn'); else toast('✅ Đã gia hạn tới ' + fmtPrepTime(to) + ' — dán tem gia hạn lên chai / gói'); }
  catch (e) { toast('⚠️ Đã gia hạn — chưa in được tem gia hạn'); }
}

async function prepDiscardExpiredLotPOS(b, left, who, reason) {
  const qty = round2(Number(b.qtyRemaining) > 0 ? Number(b.qtyRemaining) : 0);
  if (!(qty > 0.005)) { toast('Lô này đã hết trên sổ — bỏ qua'); return; }
  let p = (PREP_ITEMS_CACHE_POS || []).find(i => i.id === b.prepId);
  if (!p) { const d = await fstore.collection('prep_items_gieogieo').doc(b.prepId).get(); p = d.exists ? { id: d.id, ...d.data() } : { id: b.prepId, name: b.prepName || '', unit: b.unit || '' }; }
  await UnitEngine.prep.discardByLots(p, { qty, lines: [{ batchId: b.id, batchCode: b.batchCode || '', qty }],
    reason: reason || 'Hết hạn — nhân viên xác nhận không dùng được', totalCost: round2(qty * (Number(p.costPerUnit) || 0)),
    ingredientBreakdown: [], weighings: {}, staffEmp: who });
  _expSyncCaches('prep', b.id, { qtyRemaining: 0, status: 'used_up' });
  toast('✅ Đã ghi huỷ lô ' + (b.batchCode || '') + ' — ' + fmtPrepQty(qty) + ' ' + (b.unit || ''));
}

PosGieoMods.expiry = true;
