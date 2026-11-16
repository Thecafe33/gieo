// pos_kho.v2.js (29/10/2026) = pos_kho.v1.js + GIAO DIỆN MỚI màn «Hao hụt trong ngày» (chủ dự án duyệt qua bản xem trước): widget kiểu manage — nền trắng,
// mỗi khối một màu nhạt, ô số lượng lớn; nút lô huỷ BTP (Cân trừ bì / Nhập tay / Bỏ hết) đồng bộ với bước kết ca; nút quét mã báo hao hụt NL có cấu
// trúc như ô «Quét mở»; THÊM luồng «Hủy NL không tem» (chỉ liệt kê NL KHÔNG có kiểm kê tem — NL có tem BẮT BUỘC quét mã QR; nhân viên luôn đếm
// mù: không hiện tồn). Logic ghi kho (UnitEngine.*), id, onclick, tên hàm v1 giữ nguyên; chỉ đổi cách dựng HTML + thêm luồng mới.
// v1 đã phát hành — giữ để quay lui (sổ tools/js_da_phat_hanh.json). Nạp TRƯỚC <script> chính; CHỈ khai báo.
(window.PosGieoMods = window.PosGieoMods || {}).kho = 'dang';

// ============================================================
// [SỬA — mục 2.4] KHO — màn Kho giờ CHỈ là 4 ô chức năng (HTML tĩnh, xem
// #khoScreen), KHÔNG còn load/hiển thị danh sách tồn kho nữa.
//
// loadKhoScreen() vẫn được giữ lại nhưng đổi vai trò: chỉ nạp KHO_ITEMS_CACHE
// vào nền để các màn con (Hao hụt, Kiểm kê) dùng ngay mà không phải chờ load
// lại — KHÔNG render danh sách ra màn hình nữa. renderKhoList() đã bị XOÁ HẲN
// (không còn nơi nào gọi) theo trả lời mục 4.5: tồn kho không hiển thị ở POS
// dưới bất kỳ hình thức nào, kể cả link phụ.
// ============================================================
function loadKhoScreen() {
  fstore.collection('inventory_items_gieogieo').get().then(snap => {
    KHO_ITEMS_CACHE = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
  }).catch(err => {
    console.warn('loadKhoScreen prefetch failed (không chặn — màn con sẽ tự load lại):', err);
  });
  // [NEW] Đếm tem còn chờ dán → chấm đỏ trên ô "Tem kho". Chạy độc lập, hỏng cũng không
  // chặn màn Kho (chỉ mất cái chấm đỏ, mọi thứ khác vẫn dùng được).
  refreshStockLabelBadge().catch(err => console.warn('refreshStockLabelBadge lỗi:', err));
  refreshStockUseBadge().catch(err => console.warn('refreshStockUseBadge lỗi:', err));
}

// ============================================================
// [SỬA — mục 2.4] HAO HỤT TRONG NGÀY (trước đây là "Tạo giao dịch kho" gộp 3 loại).
// Ghi vào stock_transactions_gieogieo qua applyStockTransactionPOS(), dùng
// Firestore runTransaction giống applyStockTransaction() bên Management —
// tuyệt đối KHÔNG sửa currentStock trực tiếp (mục 2.1).
//
// KHO_TX_TYPES giờ chỉ còn ĐÚNG 1 phần tử (WASTE). Vẫn giữ dạng MẢNG + biến
// khoTxState.type thay vì hardcode chuỗi 'WASTE' khắp nơi — vì toàn bộ logic
// bên dưới (sign, qtyLabel, autoNote) đã viết theo cấu trúc này; giữ nguyên
// cấu trúc để dễ thêm lại loại khác sau này nếu nghiệp vụ đổi, và để thay đổi
// lần này là thu hẹp phạm vi chứ không phải viết lại logic đã chạy ổn định.
// ADJUSTMENT đã bỏ hẳn (mục 4.4), RECEIVING đã có màn riêng (poReceiveScreen).
// ============================================================
let KHO_ITEMS_CACHE = [];

let WASTE_REASONS_CACHE = [];

const KHO_TX_TYPES = [
  {value:'WASTE', label:'Hao hụt / Huỷ', hint:'Hàng bị hỏng, đổ, pha sai, hết hạn... — số lượng TRỪ khỏi kho.', sign:-1, qtyLabel:'Số lượng hao hụt'}
];

let khoTxState = { type: 'WASTE' };

// openWasteScreen — điểm vào DUY NHẤT của màn này (ô "🗑️ Hao hụt trong ngày"
// ở màn Kho). Đã rà toàn file: không còn nơi nào gọi tên hàm cũ
// openKhoTxScreen(), nên đổi tên thẳng, không cần giữ alias.
async function openWasteScreen() {
  showScreen('khoTxScreen');
  // target: 'drink' = đổ ly thành phẩm (trừ nguyên liệu theo công thức)
  //       | 'prep'  = huỷ bán thành phẩm | 'item' = hao hụt nguyên liệu thô.
  // Mặc định 'drink': làm đổ/pha sai 1 ly là tình huống hao hụt hay gặp nhất lúc
  // đang bán, và trước đây KHÔNG có đường nào ghi nhận (chỉ ghi được nguyên liệu
  // thô hoặc bán thành phẩm) nên nhân viên hoặc bỏ qua, hoặc phải tự tính ngược
  // ra từng nguyên liệu — vừa mất thời gian vừa dễ sai.
  khoTxState = { type: 'WASTE', target: 'drink' };
  const box = document.getElementById('khoTxBody');
  showLoading(box);
  if (!KHO_ITEMS_CACHE.length) {
    try {
      const snap = await fstore.collection('inventory_items_gieogieo').get();
      KHO_ITEMS_CACHE = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
    } catch (err) {
      console.error('openKhoTxScreen load items failed', err);
      box.innerHTML = `<div style="text-align:center;padding:40px;color:#e74c3c;font-size:13px;">⚠️ Không tải được danh mục nguyên liệu<br><span style="color:#aaa;font-size:12px">${err.message || ''}</span></div>`;
      return;
    }
  }
  if (!WASTE_REASONS_CACHE.length) {
    try {
      const rsnap = await fstore.collection('waste_reasons_gieogieo').where('active', '==', true).get();
      WASTE_REASONS_CACHE = rsnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.label || '').localeCompare(b.label || '', 'vi'));
    } catch (err) {
      console.warn('openKhoTxScreen load waste reasons failed (không chặn, dùng ô tự nhập):', err);
    }
  }
  // Nạp bán thành phẩm cho nhánh huỷ CB — kèm LÔ, vì huỷ BTP phải chỉ đúng lô nào bị đổ
  // (xem renderPrepWasteForm). Chạy song song để không cộng thêm một lượt chờ.
  try {
    const [psnap] = await Promise.all([
      fstore.collection('prep_items_gieogieo').get(),
      loadPrepBatchesPOS()
    ]);
    PREP_ITEMS_CACHE_POS = psnap.docs.map(d => ({ id: d.id, ...d.data() }))   // ĐỦ cả BTP ngừng dùng — xem POS_PREP_CON_DUNG
      .sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''), 'vi'));
    // [MỚI] Dụng cụ đựng để huỷ bằng hình thức cân.
    await ensurePrepVesselsPOS();
    preloadVesselImagesPOS(PREP_ITEMS_CACHE_POS.map(x => x.id));
  } catch (err) {
    console.warn('openWasteScreen load prep items failed:', err);
  }
  // [CHANGED] Trước đây: chưa khai bán thành phẩm nào thì ép về nhánh 'item'.
  // Giờ mặc định là 'drink' (không phụ thuộc prep) nên không cần ép nữa.
  if (!KHO_ITEMS_CACHE.length && !PREP_ITEMS_CACHE_POS.length) {
    box.innerHTML = '<div style="text-align:center;padding:40px;color:#bbb">Chưa có nguyên liệu nào.<br><span style="font-size:12px">Thêm ở app Quản lý trước.</span></div>';
    return;
  }
  renderKhoTxForm();
}

function wasteSetTarget(t) { khoTxState.target = t; if (t !== 'item') { khoTxState.scannedContainer = null; khoTxState.itemMode = null; khoTxState.ntw = null; } renderKhoTxForm(); }

// ============================================================
// [NEW] ĐỔ LY THÀNH PHẨM — hao hụt 1 món trong menu
//
// Vấn đề: trước đây màn Hao hụt chỉ ghi được nguyên liệu thô hoặc bán thành phẩm.
// Làm đổ 1 ly nước / pha sai / khách trả lại thì KHÔNG có đường nào ghi nhận —
// nhân viên hoặc bỏ qua (kho sai dần), hoặc phải tự tính ngược ra từng nguyên
// liệu trong ly đó (mất thời gian, dễ sai, và họ không được xem định mức).
//
// Cách làm: chọn món + size + số ly → hệ thống DÙNG LẠI đúng công thức (recipe)
// của luồng bán hàng để quy ra nguyên liệu, rồi trừ kho thật y như bán 1 ly.
// Khác biệt DUY NHẤT so với bán: type ghi 'WASTE' thay vì 'CONSUMPTION' — nên
// khoản này KHÔNG bị cộng vào unrefilledConsumption (đúng, vì hao hụt làm số liệu
// mất căn cứ, xem chú thích dài ở applyStockTransactionPOS), và báo cáo phân biệt
// được đâu là bán ra đâu là đổ bỏ.
// ============================================================
function _drinkWasteMenu() {
  // Chỉ lấy món đang bán, có size — dùng chung nguồn menu với màn bán hàng để
  // không lệch danh sách giữa 2 nơi.
  return getActiveMenu().filter(m => m && m.sizes && m.sizes.length);
}

function renderDrinkWasteForm() {
  const menu = _drinkWasteMenu();
  if (!menu.length) {
    return '<div class="hh-empty">Chưa có món nào trong menu.</div>';
  }
  const cur = menu.find(m => m.id === khoTxState.drinkId) || menu[0];
  khoTxState.drinkId = cur.id;
  const sizes = cur.sizes.map(s => s.label);
  if (!sizes.includes(khoTxState.drinkSize)) khoTxState.drinkSize = sizes[0];
  return `
    <section class="hh-w" style="--c:#3b6fb6">
      <div class="hh-wt">Món bị đổ / pha sai</div>
      <div class="hh-sel"><select id="dwItem" onchange="khoTxState.drinkId=this.value; renderKhoTxForm()">
        ${menu.map(m => `<option value="${m.id}"${m.id === cur.id ? ' selected' : ''}>${escHtmlPos(m.name)}</option>`).join('')}
      </select></div>
      <div class="hh-lb">Size</div>
      <div class="hh-pills">
        ${sizes.map(s => `<button type="button" class="${khoTxState.drinkSize === s ? 'on' : ''}" onclick="khoTxState.drinkSize='${s}'; renderKhoTxForm()">${escHtmlPos(s)}</button>`).join('')}
      </div>
      <div class="hh-lb">Số ly</div>
      <div class="hh-qty"><input id="dwQty" type="number" inputmode="numeric" min="1" step="1" placeholder="1" value="${khoTxState.drinkQty || 1}" oninput="khoTxState.drinkQty=Number(this.value)||1; drinkWasteUpdatePreview()"><span class="u">ly</span></div>
      ${_drinkWasteToppingPickerHtml()}
      <label class="hh-chk${khoTxState.drinkNoCup ? ' on' : ''}"><input type="checkbox" ${khoTxState.drinkNoCup ? 'checked' : ''} onchange="khoTxState.drinkNoCup=this.checked; drinkWasteUpdatePreview(); this.parentNode.classList.toggle('on', this.checked)"><i></i><div>Chưa rót vào ly<span>Không trừ ly, nắp, ống hút</span></div></label>
      <div id="dwPreview" class="hh-sum"></div>
    </section>
    <section class="hh-w" style="--c:#2f7d6d">
      <div class="hh-wt">Lý do</div>
      ${WASTE_REASONS_CACHE.length ? `
      <div class="hh-sel"><select id="dwReasonSelect" onchange="document.getElementById('dwReasonWrap').style.display=this.value==='__other__'?'block':'none'">
        ${WASTE_REASONS_CACHE.map(r => `<option value="${r.id}">${escHtmlPos(r.label)}</option>`).join('')}
        <option value="__other__">Lý do khác...</option>
      </select></div>
      <div id="dwReasonWrap" style="display:none;margin-top:10px;"><input id="dwReason" class="hh-fld" type="text" placeholder="Nhập lý do"></div>` : `
      <input id="dwReason" class="hh-fld" type="text" placeholder="VD: làm đổ khi pha">`}
      <div class="hh-pin">${renderPinInput('dwStaff')}</div>
    </section>
    <button type="button" class="hh-cta" onclick="submitDrinkWaste()">Ghi hao hụt</button>
  `;
}

// Xem trước: CỐ Ý chỉ hiện số món quy đổi + thiệt hại tiền, KHÔNG hiện định lượng
// từng nguyên liệu và không hiện tồn kho — giữ đúng nguyên tắc không để lộ công
// thức/tồn kho ở POS (mục 4.5), giống cách nhánh huỷ bán thành phẩm đang làm.
// Topping thêm cho MỖI ly bị đổ (topping đính kèm sẵn trong định mức món thì tự trừ).
function _drinkWasteToppingPickerHtml() {
  if (!TOPPINGS.length) return '';
  const chon = khoTxState.drinkToppings || {};
  return `<div class="hh-lb">Topping thêm cho mỗi ly</div>
    <div class="hh-pills">
      ${TOPPINGS.map(t => {
        const q = Number(chon[t.id]) || 0;
        return `<button type="button" class="${q ? 'on' : ''}" onclick="_drinkWasteToggleTopping('${t.id}')">${escHtmlPos(t.name)}${q > 1 ? ' ×' + q : ''}</button>`;
      }).join('')}
    </div>`;
}

function _drinkWasteToggleTopping(id) {
  const chon = khoTxState.drinkToppings = khoTxState.drinkToppings || {};
  if (chon[id]) delete chon[id]; else chon[id] = 1;
  renderKhoTxForm();
}

// Quy 1 lần đổ ly ra nguyên liệu bằng ĐÚNG công thức của luồng bán hàng
// (applySalesConsumptionPOS): định mức món + topping (cả topping đính kèm định mức lẫn
// topping chọn thêm) + bao bì của ly. Trước đây chỉ truyền recipes, nên topping đính
// kèm và ly/nắp/ống hút không bị trừ; phần đó tới kiểm kê mới lòi ra thành "thiếu"
// không rõ nguyên nhân. Túi/khay đựng cả đơn thì không trừ: ly đổ tại quầy không đóng túi.
async function _drinkWasteConsumption(m, size, qty) {
  const [recipes, toppingRecipes, packagingPresets, packagingItemOverrides, pkgRulesPack] = await Promise.all([
    ensureRecipesLoadedPOS(), ensureToppingRecipesLoadedPOS(), ensurePackagingPresetsLoadedPOS(),
    ensurePackagingItemOverridesLoadedPOS(), ensurePackagingRulesLoadedPOS()]);
  const chon = khoTxState.drinkToppings || {};
  const toppings = Object.keys(chon).map(id => {
    const t = TOPPINGS.find(x => x.id === id);
    return t ? { id: t.id, name: t.name, qty: Number(chon[id]) || 1 } : null;
  }).filter(Boolean);
  const noCup = !!khoTxState.drinkNoCup;
  const fake = { itemsArray: [{ itemId: m.id, name: m.name || '', size, qty, toppings }] };
  const r = noCup
    ? computeConsumptionForOrder(fake, recipes, toppingRecipes, {}, {}, null, [], {}, null)
    : computeConsumptionForOrder(fake, recipes, toppingRecipes, packagingPresets, packagingItemOverrides, null, pkgRulesPack.rules, pkgRulesPack.config, null);
  // Không rót vào ly thì "chưa khai bao bì" không phải lỗi.
  const skipped = noCup ? r.skipped.filter(x => !/Bao bì/.test(x.reason || '')) : r.skipped;
  // Chặn khi CHÍNH món chưa có định mức; topping/bao bì thiếu khai chỉ là trừ chưa đủ.
  const missingRecipe = r.skipped.some(x => /^chưa có định mức|^chưa khai định mức cho size/.test(x.reason || ''));
  return { agg: r.agg, prepAgg: r.prepAgg, skipped, missingRecipe, toppings, noCup };
}

async function drinkWasteUpdatePreview() {
  const el = document.getElementById('dwPreview');
  if (!el) return;
  const qty = Number(khoTxState.drinkQty) || 1;
  try {
    const m = _drinkWasteMenu().find(x => x.id === khoTxState.drinkId);
    if (!m) { el.textContent = ''; return; }
    const { agg, prepAgg, skipped, missingRecipe } = await _drinkWasteConsumption(m, khoTxState.drinkSize, qty);
    const n = Object.keys(agg).length + Object.keys(prepAgg).length;
    if (missingRecipe || !n) {
      el.innerHTML = '<span style="color:#c0392b;">⚠️ Món/size này chưa khai định mức — ghi nhận sẽ KHÔNG trừ được nguyên liệu nào. Bấm Ghi để hệ thống tự báo Quản lý khai định mức.</span>';
      return;
    }
    const costOf = id => Number((KHO_ITEMS_CACHE.find(x => x.id === id) || {}).costPerUnit) || 0;
    const prepCostOf = id => Number((PREP_ITEMS_CACHE_POS.find(x => x.id === id) || {}).costPerUnit) || 0;
    let cost = 0;
    Object.keys(agg).forEach(id => { cost += agg[id] * costOf(id); });
    Object.keys(prepAgg).forEach(id => { cost += prepAgg[id] * prepCostOf(id); });
    el.textContent = `Sẽ trừ ${n} loại nguyên liệu · Thiệt hại ước tính: ${Math.round(cost).toLocaleString('vi-VN')}đ`
      + (skipped.length ? ` · ${skipped.length} phần chưa khai định mức, chưa trừ được` : '');
  } catch (err) {
    el.textContent = '';
  }
}

async function submitDrinkWaste() {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi giây lát...'); return; }
  _posSubmitBusy = true;
  try { await _submitDrinkWasteImpl(); } finally { _posSubmitBusy = false; }
}

async function _submitDrinkWasteImpl() {
  const menu = _drinkWasteMenu();
  const m = menu.find(x => x.id === khoTxState.drinkId);
  if (!m) { toast('⚠️ Chưa chọn món'); return; }
  const qty = Number(document.getElementById('dwQty')?.value) || 0;
  if (qty <= 0) { toast('⚠️ Nhập số ly'); return; }

  const sel = document.getElementById('dwReasonSelect');
  let reason = '';
  if (sel && sel.value !== '__other__') {
    reason = (WASTE_REASONS_CACHE.find(r => r.id === sel.value) || {}).label || '';
  } else {
    reason = (document.getElementById('dwReason')?.value || '').trim();
  }
  if (!reason) { toast('⚠️ Chọn hoặc nhập lý do'); return; }

  const staffEmp = await resolveStaffPinAndCheckin('dwStaff');
  if (!staffEmp) return;

  const { agg, prepAgg, skipped, missingRecipe, toppings, noCup } = await _drinkWasteConsumption(m, khoTxState.drinkSize, qty);
  const ingredientIds = Object.keys(agg);
  const prepIds = Object.keys(prepAgg);
  if (missingRecipe || (!ingredientIds.length && !prepIds.length)) {
    // Chặn hẳn: ghi 1 bản ghi hao hụt không trừ được gì chỉ tạo cảm giác "đã ghi
    // rồi" trong khi kho vẫn sai — tệ hơn là báo lỗi để Quản lý khai định mức.
    toastAutoReport('❌ Món/size này chưa khai định mức — chưa ghi được', 'Đổ ly: món chưa khai định mức', { ref: String(khoTxState.drinkId || '') + '_' + String(khoTxState.drinkSize || '') });
    return;
  }

  const tpNote = toppings.length ? ' + ' + toppings.map(t => t.name + (t.qty > 1 ? ' ×' + t.qty : '')).join(', ') : '';
  const note = `Đổ ly thành phẩm: ${qty} × ${m.name} (${khoTxState.drinkSize})${tpNote}${noCup ? ' · chưa rót vào ly' : ''} · Lý do: ${reason}`;
  // [MỚI] Một lần đổ ly sinh ra NHIỀU dòng ledger (mỗi nguyên liệu / bán thành
  // phẩm một dòng). Gắn cùng một wasteEventId để app Quản lý gom lại đúng "1 lần
  // đổ N ly", thay vì đếm số dòng ledger (ra con số vô nghĩa) hoặc bóc chuỗi note.
  // Nhờ vậy chỉ tiêu "Remake" không cần chủ quán gõ tay nữa — nó CHÍNH LÀ số ly
  // nhân viên đã bấm đổ trong ngày, ghi ngay lúc xảy ra chứ không nhớ lại cuối ngày.
  // Ghi lại sau khi lần trước lỗi một phần (cùng món/size/số ly/lý do) → DÙNG LẠI wasteEventId
  // cũ: id dòng sổ cố định theo lần đổ nên dòng đã ghi lần trước tự bỏ qua, chỉ chạy dòng lỗi.
  const dwSig = [m.id, khoTxState.drinkSize, qty, reason, JSON.stringify(toppings.map(t => [t.id, t.qty])), !!noCup].join('|');
  if (!khoTxState.dwPending) { try { khoTxState.dwPending = JSON.parse(localStorage.getItem('dwPending_pos') || 'null'); } catch (e) {} }
  const pendingDw = khoTxState.dwPending && khoTxState.dwPending.sig === dwSig ? khoTxState.dwPending : null;
  const wasteEventId = pendingDw ? pendingDw.eventId : `dw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const meta = {
    wasteKind: 'drink', wasteEventId,
    drinkItemId: m.id, drinkName: m.name, drinkSize: khoTxState.drinkSize,
    drinkQty: qty, reason,
    drinkToppings: toppings.map(t => ({ id: t.id, name: t.name, qty: t.qty })), drinkNoCup: noCup
  };
  // [FIX "đổ ly — nguyên liệu thô không phân bổ FIFO"] _wastePrepQtyPOS() (nhánh BTP ngay dưới)
  // đã phân bổ vào đúng lô đang mở trước khi ghi WASTE từ lâu (xem chú thích của hàm đó), nhưng
  // nhánh nguyên liệu thô ở đây lại ghi thẳng applyStockTransactionPOS() KHÔNG gọi
  // unitEngineAllocateConsumption() trước — currentStock vẫn trừ đúng (không chặn thao tác)
  // nhưng tem/lô đang mở không hề bị đụng tới: lượt Unit Engine kế tiếp coi như tem đó còn
  // nguyên, và không có allocation nào để sau này truy xuất "ly đổ này lấy từ tem nào". Giờ
  // phân bổ FIFO trước, cùng cơ chế applySalesConsumptionPOS/startPrepBatch đang dùng.
  const results = await Promise.allSettled([
    ...ingredientIds.map(async id => {
      const qtyUsed = Math.abs(agg[id]);
      const txId = wasteEventId + '_ing_' + id;
      // Kiểm sổ TRƯỚC khi phân bổ tem (giống bán hàng) — đã ghi ở lần trước thì không trừ tem lần 2.
      if ((await fstore.collection('stock_transactions_gieogieo').doc(txId).get()).exists) return;
      const allocations = await UnitEngine.consume.allocate(id, qtyUsed, undefined, { type: 'drink_waste', id: wasteEventId, note })
        .catch(err => { console.warn('[FIFO] phân bổ lỗi (đổ ly)', id, err); return []; });
      try {
        return await UnitEngine.ledger.apply({
          itemId: id, type: 'WASTE', qty: -qtyUsed, txId,
          note, staff: staffEmp.fullName, staffEmployeeId: staffEmp.id,
          deriveFromUnits: allocations.length > 0,
          meta: allocations.length ? { ...meta, fifoAllocations: allocations } : meta
        });
      } catch (err) {
        // Tem đã bị trừ ở RT mà sổ chưa ghi → hoàn tem ngay (như bán hàng), không thì bấm ghi lại
        // sẽ trừ tem lần hai. Chỉ hoàn khi chắc sổ CHƯA ghi (mất ACK mà đã ghi thật thì giữ nguyên).
        if (allocations.length) {
          let daGhi = true;
          try { daGhi = (await fstore.collection('stock_transactions_gieogieo').doc(txId).get()).exists; } catch (e) {}
          if (!daGhi) await UnitEngine.consume.reverseClaimed('dwfail_' + txId + '_' + Date.now(), id, allocations)
            .then(() => UnitEngine.stock.recompute(id, STOCK_CONTAINERS_COLL)).catch(e => console.warn('[Đổ ly] hoàn tem sau lỗi ghi sổ lỗi', id, e));
        }
        throw err;
      }
    }),
    ...prepIds.map(id => UnitEngine.prep.wasteQty(id, prepAgg[id], note, staffEmp, meta, wasteEventId + '_prep_' + id))
  ]);
  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length) {
    // Giữ nguyên màn + lựa chọn để bấm "Ghi" lại: lần sau dùng lại wasteEventId → chỉ ghi dòng lỗi.
    console.warn('[Đổ ly] Một số nguyên liệu trừ thất bại:', failed.map(f => f.reason));
    khoTxState.dwPending = { sig: dwSig, eventId: wasteEventId };
    try { localStorage.setItem('dwPending_pos', JSON.stringify(khoTxState.dwPending)); } catch (e) {}
    toastAutoReport(`⚠️ ${failed.length}/${results.length} nguyên liệu chưa trừ được — bấm Ghi lại (chỉ ghi phần còn lỗi)`, 'Đổ ly: trừ nguyên liệu lỗi', { ref: wasteEventId });
    return;
  }
  khoTxState.dwPending = null;
  try { localStorage.removeItem('dwPending_pos'); } catch (e) {}
  toast(`✅ Đã ghi hao hụt ${qty} ly ${m.name} (${khoTxState.drinkSize})`);
  if (skipped.length) console.info('[Đổ ly] Bỏ qua:', skipped);
  khoTxState.drinkToppings = {}; khoTxState.drinkNoCup = false;
  showScreen('khoScreen');
  loadKhoScreen();
}

function prepWasteUpdatePreview() {
  const p = PREP_ITEMS_CACHE_POS.find(x => x.id === document.getElementById('pwItem')?.value);
  const el = document.getElementById('pwPreview');
  if (!el || !p) return;
  const lines = pwReadLines(p.id);
  // Ô pwQty chỉ tồn tại khi BTP không còn lô nào — hai chế độ loại trừ nhau.
  const qty = lines.length ? lines.reduce((t, l) => t + l.qty, 0)
                           : (Number(document.getElementById('pwQty')?.value) || 0);
  if (qty <= 0) { el.textContent = ''; el.style.color = 'var(--gm)'; return; }
  // Gõ quá số còn lại của lô là lỗi hay gặp nhất — nói ngay tại chỗ, đừng đợi bấm Xác nhận.
  const qua = lines.filter(l => l.qty > l.con + 0.001);
  if (qua.length) {
    el.style.color = '#c0392b';
    el.textContent = `Lô ${qua[0].batchCode} chỉ còn ${fmtPrepQty(qua[0].con)} ${p.unit || ''} — không huỷ nhiều hơn được`;
    return;
  }
  el.style.color = 'var(--gm)';
  const tien = Math.round(qty * (Number(p.costPerUnit) || 0)).toLocaleString('vi-VN');
  // Chỉ hiện CHI PHÍ quy đổi — cố ý KHÔNG hiện TỒN TỔNG (giữ đúng nguyên tắc không để lộ
  // định lượng/tồn kho ở POS, mục 4.5). Số còn lại của từng lô thì có hiện, vì không nhìn
  // thấy nó thì không chọn được lô để huỷ.
  el.textContent = (lines.length > 1 ? `Huỷ ${lines.length} lô · ` : '') +
    `${fmtPrepQty(qty)} ${p.unit || ''} · thiệt hại ước tính ${tien}đ`;
}

function renderKhoTxForm() {
  const box = document.getElementById('khoTxBody');
  const t = khoTxState.target;
  const tab = (k, label, full) => `<button type="button" class="${t === k ? 'on' : ''}" title="${full}" onclick="wasteSetTarget('${k}')">${label}</button>`;
  box.innerHTML = `
    <div class="hh-page">
      <div class="hh-tabs">
        ${tab('drink', 'Ly thành phẩm', 'Đổ ly thành phẩm')}
        ${PREP_ITEMS_CACHE_POS.length ? tab('prep', 'Bán thành phẩm', 'Huỷ bán thành phẩm') : ''}
        ${tab('item', 'Nguyên liệu', 'Hao hụt nguyên liệu')}
      </div>
      ${t === 'drink' ? renderDrinkWasteForm()
        : t === 'prep' ? renderPrepWasteForm() : renderItemWasteForm()}
    </div>
  `;
  if (t === 'drink') drinkWasteUpdatePreview();
  else if (t === 'prep') prepWasteUpdatePreview();
}

// Form huỷ bán thành phẩm.
//
// TRƯỚC ĐÂY chỉ có một ô "Số lượng huỷ" trống. Hai hậu quả:
//   1. Không ai biết ĐỔ LÔ NÀO. Cùng một BTP có thể đang có 3 lô, lô cũ sắp hết hạn và lô
//      vừa nấu — ghi "đổ 2 lít" không nói lên được lô nào đã mất.
//   2. Nặng hơn: huỷ chỉ trừ currentStock mà KHÔNG trừ qtyRemaining của lô nào, trong khi
//      bán hàng thì có trừ (deductPrepBatchesFIFO). Tổng tồn và tổng các lô lệch dần ra —
//      đúng thứ "tồn ma" mà phần chốt ngày phải đi dọn.
//
// Giờ liệt kê từng lô còn hàng, mỗi lô một ô số lượng + nút "Cả lô". Đổ nguyên nồi thì bấm
// một nút; đổ một phần thì gõ số; đổ nhiều lô cùng lúc thì điền nhiều dòng.
// Có hiện số còn lại của TỪNG LÔ — màn Chế biến ở POS vốn đã hiện số này (renderPrepBatchList),
// và không thấy lô còn bao nhiêu thì không thể chọn lô để huỷ.
function pwBatchesFor(prepId) {
  return (PREP_BATCHES_CACHE_POS || [])
    .filter(b => b.prepId === prepId && b.status === 'active' && Number(b.qtyRemaining) > 0)
    .sort((a, b) => String(a.finishedAt || '').localeCompare(String(b.finishedAt || '')));
}

function renderPrepWasteForm() {
  const p = PREP_ITEMS_CACHE_POS.find(x => x.id === khoTxState.prepId) || PREP_ITEMS_CACHE_POS[0];
  khoTxState.prepId = p.id;
  const lo = pwBatchesFor(p.id);
  const nay = Date.now();

  // Hai kiểu cân (xem pwModeAsk): cân phần sẽ huỷ / cân phần còn dùng được. Ba nút Cân trừ bì · Nhập tay · Bỏ hết
  // ĐỒNG BỘ với thẻ lô ở bước kết ca (đếm BTP): viên thuốc bo tròn hết cỡ, «Cân trừ bì» LUÔN đen (đổi thành «Cân lại» viền trắng
  // khi đã cân xong), «Bỏ hết» nền be (cam khi đang chọn), «Nhập tay» nền be (hồng khi đang chọn). Tô sáng: pwPaintChoice().
  const coCan = prepCanWeighPOS(p.id);
  const boBaNut = (key, con) => `
          <div class="hh-row3">
            ${coCan ? `<button type="button" id="pwBtn_${key}_weigh" class="hh-pl dark" onclick="pwChoose('${key}','weigh',${con})">Cân trừ bì</button>` : ''}
            <button type="button" id="pwBtn_${key}_manual" class="hh-pl soft" onclick="pwChoose('${key}','manual',${con})">Nhập tay</button>
            <button type="button" id="pwBtn_${key}_all" class="hh-pl soft" onclick="pwChoose('${key}','all',${con})">Bỏ hết</button>
          </div>`;
  const khoiCan = coCan ? '' : prepWeighHintHTML(p.id);
  const TINT = ['#3b6fb6', '#2f7d6d', '#b8862f', '#7a5bb0', '#5f7a8a'];

  const khoiLo = lo.length ? `
      ${khoiCan}
      <div class="hh-lb hh-lbo">Lô nào bị huỷ?</div>
      ${lo.map((b, bi) => {
        const con = Number(b.qtyRemaining) || 0;
        const quaHan = b.expiresAt && vnDate(b.expiresAt).getTime() <= nay;
        return `
        <section class="hh-w" style="--c:${quaHan ? '#ae5a4f' : TINT[bi % TINT.length]}">
          <div class="hh-lot-h"><span><span class="hh-lab">Mã lô:</span><span class="hh-code">${escHtmlPos(b.batchCode || '(chưa có mã)')}</span></span><span class="hh-st" id="pwSt_${b.id}">Chưa chọn</span></div>
          <div class="hh-meta">còn <b>${fmtPrepQty(con)} ${escHtmlPos(p.unit || '')}</b> · Nấu ${fmtDateTimeShort(b.finishedAt)} · HSD ${prepExpiryLabel(b)}${quaHan ? ' <span class="hh-chip bad">Quá hạn</span>' : ''}</div>
          ${boBaNut(b.id, con)}
          <div id="pwRow_${b.id}" class="hh-inrow" style="display:none;">
            <div class="hh-qty"><input id="pwB_${b.id}" type="number" inputmode="decimal" step="0.01" min="0" max="${con}" placeholder="0" oninput="pwManualEdit('${b.id}')"><span class="u">${escHtmlPos(p.unit || '')}</span></div>
          </div>
          <div id="pwW_${b.id}"></div>
        </section>`;
      }).join('')}`
    : `
      ${khoiCan}
      <section class="hh-w" style="--c:#b8862f">
        <div class="hh-note">Bán thành phẩm này chưa có lô nào đang còn hàng — có thể nấu từ trước khi bật tính năng lô.
        Nhập thẳng số lượng huỷ bên dưới; hệ thống chỉ trừ tồn tổng, không gắn được vào lô nào.</div>
        <div class="hh-lot-h" style="margin-top:12px"><span class="hh-wt" style="margin:0">Số lượng huỷ</span><span class="hh-st" id="pwSt_plain">Chưa chọn</span></div>
        ${boBaNut('plain', Number(p.currentStock) || 0)}
        <div id="pwRow_plain" class="hh-inrow" style="display:none;">
          <div class="hh-qty"><input id="pwQty" type="number" inputmode="decimal" step="0.01" placeholder="0" oninput="pwManualEdit('plain')"><span class="u">${escHtmlPos(p.unit || '')}</span></div>
        </div>
        <div id="pwW_plain"></div>
      </section>`;

  return `
    <section class="hh-w" style="--c:#7a5bb0">
      <div class="hh-wt">Bán thành phẩm bị huỷ</div>
      <div class="hh-sel"><select id="pwItem" onchange="khoTxState.prepId=this.value; _pwWeighings={}; _pwChoice={}; renderKhoTxForm()">
        ${PREP_ITEMS_CACHE_POS.map(x => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${escHtmlPos((x.code || '') + ' · ' + (x.name || ''))}</option>`).join('')}
      </select></div>
    </section>
    ${khoiLo}
    <section class="hh-w" style="--c:#87918b">
      <div id="pwPreview" class="hh-sum" style="margin:0 0 12px"></div>
      <div class="hh-wt">Lý do huỷ</div>
      ${WASTE_REASONS_CACHE.length ? `
      <div class="hh-sel"><select id="pwReasonSelect" onchange="pwReasonSelectChange()">
        ${WASTE_REASONS_CACHE.map(r => `<option value="${r.id}">${escHtmlPos(r.label)}</option>`).join('')}
        <option value="__other__">Khác (tự nhập)...</option>
      </select></div>
      <div id="pwReasonOtherWrap" style="display:none;margin-top:10px;"><input id="pwReason" class="hh-fld" type="text" placeholder="Nhập lý do khác..."></div>` : `
      <input id="pwReason" class="hh-fld" type="text" placeholder="VD: để qua đêm, nấu hỏng, đổ...">`}
      <div class="hh-pin">${renderPinInput('pwStaff')}</div>
    </section>
    <button type="button" class="hh-cta" onclick="submitPrepWaste()">Xác nhận huỷ</button>
  `;
}

// ---------------------------------------------------------------------------
// [MỚI] HUỶ BÁN THÀNH PHẨM BẰNG HÌNH THỨC CÂN
// Bảng kê từng lần cân, khoá theo id lô ('plain' cho trường hợp không có lô nào).
// ---------------------------------------------------------------------------
let _pwWeighings = {};

// MỘT nguồn duy nhất cho kiểu cân đang chọn — 'discard' = cân phần sẽ huỷ,
// 'remain' = cân phần còn dùng được (máy lấy hiệu). Từng có lúc mặc định được
// viết lặp ở 3 chỗ và lệch nhau: màn hình tô sáng một đằng, máy tính một nẻo.
function pwMode() { return khoTxState.pwWeighMode || 'discard'; }

// Nhân viên đã chọn cách nào cho từng lô — chỉ để tô sáng nút và hiện/ẩn ô số.
let _pwChoice = {};

// Bấm một trong ba nút. KHÔNG vẽ lại cả form (vẽ lại là mất số đang gõ ở các lô
// khác), chỉ sửa đúng mấy phần tử liên quan.
function pwChoose(key, mode, con) {
  const row = document.getElementById('pwRow_' + key);
  const inp = document.getElementById(key === 'plain' ? 'pwQty' : 'pwB_' + key);
  const info = document.getElementById('pwW_' + key);

  // Bấm lại đúng nút đang chọn = bỏ chọn, xoá số. Lỡ tay bấm nhầm lô thì không
  // phải đi xoá số bằng tay.
  if (_pwChoice[key] === mode && mode !== 'weigh') {
    _pwChoice[key] = null;
    if (inp) inp.value = '';
    if (row) row.style.display = 'none';
    if (info) info.innerHTML = '';
    delete _pwWeighings[key];
    pwPaintChoice(key);
    prepWasteUpdatePreview();
    return;
  }

  if (mode === 'weigh') { if (key === 'plain') pwWeighPlain(); else pwWeighBatch(key, con); return; }

  _pwChoice[key] = mode;
  delete _pwWeighings[key];
  if (info) info.innerHTML = '';
  if (row) row.style.display = 'flex';
  if (inp) {
    if (mode === 'all') inp.value = con;
    else { inp.value = ''; inp.focus(); }
  }
  pwPaintChoice(key);
  prepWasteUpdatePreview();
}

// Tô sáng nút đang chọn.
function pwPaintChoice(key) {
  const ch = _pwChoice[key], daCan = !!_pwWeighings[key];
  const w = document.getElementById('pwBtn_' + key + '_weigh');
  const m = document.getElementById('pwBtn_' + key + '_manual');
  const a = document.getElementById('pwBtn_' + key + '_all');
  // Giống bước kết ca: «Cân trừ bì» luôn đen, chỉ đổi thành «Cân lại» viền trắng SAU khi đã cân xong.
  if (w) { w.className = 'hh-pl ' + (daCan ? 'out' : 'dark'); w.textContent = daCan ? 'Cân lại' : 'Cân trừ bì'; }
  if (m) m.className = 'hh-pl ' + (ch === 'manual' ? 'pick' : 'soft');
  if (a) a.className = 'hh-pl ' + (ch === 'all' ? 'warm' : 'soft');
  const st = document.getElementById('pwSt_' + key);
  if (st) {
    const t = daCan ? ['Đã cân xong', 'ok'] : ch === 'manual' ? ['Đã nhập', 'ok'] : ch === 'all' ? ['Bỏ hết', 'warm'] : ['Chưa chọn', ''];
    st.textContent = t[0]; st.className = 'hh-st ' + t[1];
  }
}

// Khối kết quả cân — cùng kiểu «Vừa cân được» ở thẻ lô của bước kết ca.
function pwWeighBoxHTML(lines, unit, qty, remainInfo) {
  const chi = (lines || []).map(l => `${wpEsc(l.vesselName)}${l.variantLabel && l.variantLabel !== 'Mặc định' ? ' (' + wpEsc(l.variantLabel) + ')' : ''} ${fmtG(l.net)}`).join(' + ');
  return `<div class="hh-res"><b>${fmtPrepQty(qty)}</b><span>${escHtmlPos(unit || '')}</span><small>Vừa cân được — bấm "Cân lại" nếu cân nhầm</small></div>
    <div class="hh-sum">${(lines || []).length} lần cân: ${chi} ${escHtmlPos(unit || '')}</div>`
    + (remainInfo ? `<div class="hh-sum">Còn lại ${fmtPrepQty(remainInfo.total)} → đã đổ <b>${fmtPrepQty(remainInfo.qty)} ${escHtmlPos(unit || '')}</b></div>` : '');
}

function pwSetWeighMode(mode) {
  khoTxState.pwWeighMode = mode;
}

function pwManualEdit(key) {
  // Sửa tay thì bảng kê không còn khớp với số sắp lưu.
  if (_pwWeighings[key]) {
    delete _pwWeighings[key];
    const el = document.getElementById('pwW_' + key);
    if (el) el.innerHTML = '';
    _pwChoice[key] = 'manual';
    pwPaintChoice(key);
  }
  prepWasteUpdatePreview();
}

// Đổ kết quả cân vào một ô. `con` = số hệ thống đang ghi cho chỗ đó, dùng khi
// nhân viên chọn kiểu "cân phần còn lại".
function _pwApplyWeigh(key, inputId, con, unit, total, lines, redoExpr) {
  const remain = pwMode() === 'remain';
  let qty = total;
  if (remain) {
    qty = Math.round((con - total) * 100) / 100;
    if (qty < 0) {
      // Cân ra NHIỀU hơn số hệ thống đang ghi → không có gì bị đổ đi cả. Nói thẳng
      // ra thay vì điền một số âm hay im lặng làm tròn về 0.
      toast(`⚠️ Cân được ${fmtPrepQty(total)} ${unit} mà hệ thống chỉ ghi còn ${fmtPrepQty(con)} — không có phần nào bị đổ. Kiểm tra lại tồn.`);
      qty = 0;
    }
  }
  _pwWeighings[key] = { mode: remain ? 'remain' : 'discard', weighedTotal: total, systemQty: con, lines };
  _pwChoice[key] = 'weigh';
  pwPaintChoice(key);
  const row = document.getElementById('pwRow_' + key);
  if (row) row.style.display = 'none';   // [v2] số cân hiện ở khối «Vừa cân được»; ô số vẫn giữ giá trị để tính / gửi
  const el = document.getElementById(inputId);
  if (el) el.value = qty;
  const info = document.getElementById('pwW_' + key);
  if (info) info.innerHTML = pwWeighBoxHTML(lines, unit, qty, remain ? { total, qty } : null);
  prepWasteUpdatePreview();
}

// Câu hỏi hiện trong màn cân. Chỉ hai câu ngắn, không giải thích dài dòng: đứng
// trước cân thì người ta chỉ cần biết đang cân cái sắp bỏ hay cái còn giữ lại.
function pwModeAsk() {
  return {
    current: pwMode(),
    options: [['discard', 'Cân phần sẽ huỷ'], ['remain', 'Cân phần còn dùng được']],
    onPick: v => pwSetWeighMode(v)
  };
}

function pwWeighBatch(batchId, con) {
  const p = PREP_ITEMS_CACHE_POS.find(x => x.id === khoTxState.prepId);
  if (!p) return;
  const b = pwBatchesFor(p.id).find(x => x.id === batchId) || {};
  openWeighPad({
    prepId: p.id, unit: p.unit,
    title: 'Cân lô ' + (b.batchCode || ''),
    modeAsk: pwModeAsk(),
    onDone: (total, lines) => _pwApplyWeigh(batchId, 'pwB_' + batchId, con, p.unit || '', total, lines, `pwWeighBatch('${batchId}',${con})`)
  });
}

function pwWeighPlain() {
  const p = PREP_ITEMS_CACHE_POS.find(x => x.id === khoTxState.prepId);
  if (!p) return;
  openWeighPad({
    prepId: p.id, unit: p.unit,
    title: 'Cân ' + (p.name || ''),
    modeAsk: pwModeAsk(),
    // Không có lô nào thì mốc để lấy hiệu là tồn tổng đang ghi.
    onDone: (total, lines) => _pwApplyWeigh('plain', 'pwQty', Number(p.currentStock) || 0, p.unit || '', total, lines, 'pwWeighPlain()')
  });
}

// Đọc các dòng lô đã điền. Dùng chung cho phần xem trước và lúc gửi, để hai bên
// không bao giờ tính ra hai con số khác nhau.
function pwReadLines(prepId) {
  const out = [];
  pwBatchesFor(prepId).forEach(b => {
    const el = document.getElementById('pwB_' + b.id);
    const q = Number(el && el.value) || 0;
    if (q > 0) out.push({ batchId: b.id, batchCode: b.batchCode || '', qty: q, con: Number(b.qtyRemaining) || 0 });
  });
  return out;
}

function pwReasonSelectChange() {
  const sel = document.getElementById('pwReasonSelect');
  const wrap = document.getElementById('pwReasonOtherWrap');
  if (!sel || !wrap) return;
  wrap.style.display = sel.value === '__other__' ? 'block' : 'none';
}

// Hao hụt nguyên liệu chỉ ghi theo tem đã quét, không nhập số tổng.
const HH_QR_SVG = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8V5.5a2 2 0 0 1 2-2H8M16 3.5h2.5a2 2 0 0 1 2 2V8M20.5 16v2.5a2 2 0 0 1-2 2H16M8 20.5H5.5a2 2 0 0 1-2-2V16"/><rect x="7" y="7" width="4" height="4" rx=".8" stroke-width="1.6"/><rect x="13" y="7" width="4" height="4" rx=".8" stroke-width="1.6"/><rect x="7" y="13" width="4" height="4" rx=".8" stroke-width="1.6"/><path d="M13 13h1.6v1.6H13zM15.4 15.4H17V17h-1.6z" stroke-width="1.4"/></svg>';
const HH_BOX_SVG = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>';
// Hai ô cạnh nhau như «Quét mở | Báo hết»: Quét mã (NL có dán tem — BẮT BUỘC quét QR) | Không tem (NL không dán tem, vd bánh flan).
function _hhTile(onclick, label, sub, chinh, icon) {
  return `<button type="button" class="hh-tile${chinh ? ' primary' : ' alt'}${!chinh && khoTxState.itemMode === 'notem' ? ' on' : ''}" onclick="${onclick}">
    <span class="ic">${icon}</span><span><span class="t">${label}</span><span class="s">${sub}</span></span></button>`;
}
function renderItemWasteForm() {
  const notem = khoTxState.itemMode === 'notem';
  const tiles = `<div class="hh-tiles">
    ${_hhTile('scanIngredientForWaste()', 'Quét mã', 'NL có dán tem', true, HH_QR_SVG)}
    ${_hhTile('wasteNoTemOpen()', 'Không tem', 'Vd: bánh flan', false, HH_BOX_SVG)}
  </div>`;
  return tiles + (notem ? renderNoTemWasteForm() : renderScannedWasteForm());
}

// Phần thông tin mã tem vừa quét (luồng cũ — giữ nguyên id, onclick, logic).
function renderScannedWasteForm() {
  const c = khoTxState.scannedContainer, pending = c?.status === 'discard_pending';
  const rule = c && getPrimaryRefillRulePOS(c.itemId);
  const source = c?.status === 'sealed' || c?.discardPending?.originalStatus === 'sealed';
  if (!c) return `<div class="hh-hint">Quét tem trên bao/chai cần hủy. Hệ thống ghi phần còn lại của đúng mã này là hao hụt. NL không dán tem (vd bánh flan): bấm «Không tem».</div>`;
  return `<section class="hh-w" style="--c:#b8862f">
    <div class="hh-big">${escHtmlPos(c.itemName || '')}</div>
    <div style="margin-top:8px"><span class="hh-mono">${escHtmlPos(c.code || '')}</span></div>
    <div class="hh-res left"><b>${Number.isFinite(Number(c.wastePreview)) ? fmtPrepQty(c.wastePreview) : '…'}</b><span>${escHtmlPos(c.unit || '')}</span><small>${Number.isFinite(Number(c.wastePreview)) ? 'còn lại trên mã này — sẽ ghi là hao hụt' : 'Đang đối chiếu'}</small></div>
    ${pending ? `<div class="hh-note">Lần báo hủy trước đang chờ hoàn tất. Lý do: ${escHtmlPos(c.discardPending?.reason || '—')}. Xác nhận để tiếp tục cùng giao dịch.</div>` : `
      <div class="hh-lb">Lý do hủy (bắt buộc)</div>
      ${WASTE_REASONS_CACHE.length ? `<div class="hh-sel"><select id="ktxReasonSelect" onchange="khoTxReasonSelectChange()">
        <option value="">Chọn lý do...</option>
        ${WASTE_REASONS_CACHE.map(r => `<option value="${escHtmlPos(r.id)}">${escHtmlPos(r.label)}</option>`).join('')}
        <option value="__other__">Khác (ghi rõ)</option>
      </select></div><div id="ktxReasonOtherWrap" style="display:none;margin-top:10px"><input id="ktxReason" class="hh-fld" placeholder="Ghi rõ lý do hủy"></div>` :
      `<input id="ktxReason" class="hh-fld" placeholder="VD: Hết hạn, đổ vỡ, hư hỏng">`}
      <div class="hh-lb">Ghi chú thêm (nếu cần)</div>
      <input id="ktxNote" class="hh-fld" placeholder="Chi tiết thêm">
      ${rule ? `<div class="hh-lb">Hàng hủy đang ở đâu?</div><div class="hh-sel"><select id="ktxLoc">
          <option value="source" ${source ? 'selected' : ''}>${escHtmlPos(rule.sourceLocationName || 'Kho tổng')}</option>
          <option value="dest" ${source ? '' : 'selected'}>${escHtmlPos(rule.destLocationName || 'Quầy pha')}</option>
        </select></div>` : ''}
    `}
  </section>
  <section class="hh-w" style="--c:#2f7d6d">
    <div class="hh-pin">${renderPinInput('ktxStaff')}</div>
    <label class="hh-chk"><input id="ktxDiscardAck" type="checkbox" onchange="this.parentNode.classList.toggle('on', this.checked)"><i></i><div>Tôi xác nhận hủy đúng mã ${escHtmlPos(c.code || '')}<span>Mã sẽ chuyển thành “Đã báo hết · Hủy” và không được báo hết lần nữa.</span></div></label>
  </section>
  <button type="button" class="hh-cta" onclick="submitKhoTx()">${pending ? 'Hoàn tất báo hủy' : 'Xác nhận báo hủy'}</button>`;
}

// ───────────────────────────────────────────────────────────────────────────────
// HỦY NL KHÔNG TEM (chủ dự án 29/10/2026) — một số NL không dán tem (vd bánh flan) nên không có mã để quét.
//   · CHỈ liệt kê NL KHÔNG có kiểm kê tem. NL có tem (trackingMode unit/batch) KHÔNG xuất hiện ở đây — bắt buộc quét mã QR như bình thường.
//   · Nhân viên luôn ĐẾM MÙ: không hiện tồn kho ở bất cứ đâu trong luồng này.
//   · Bắt buộc ô tích xác nhận trước khi ghi; nhập quá tồn KHÔNG bị chặn (giống đổ ly — để kho / Quản lý tự xử lý).
//   · Ghi qua UnitEngine.ledger.apply (WASTE, id giao dịch cố định theo lần hủy → bấm lại sau lỗi không ghi đúp), không đụng kho trực tiếp.
// ───────────────────────────────────────────────────────────────────────────────
function wasteNoTemItems() {
  return (KHO_ITEMS_CACHE || []).filter(it => it && it.active !== false && it.stockManaged !== false && !UnitEngine.classify.isTemTracked(it))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
}
function wasteNoTemOpen() {
  khoTxState.itemMode = 'notem'; khoTxState.scannedContainer = null; khoTxState.ntw = null;
  renderKhoTxForm();
}
function wasteNoTemUnits(it) {
  const opts = [{ name: it.unit, baseQty: 1 }, ...((it.packagingUnits || []).filter(p => p && p.name && Number(p.baseQty) > 0).map(p => ({ name: p.name, baseQty: Number(p.baseQty) })))];
  const seen = new Set();
  return opts.filter(o => o.name && !seen.has(o.baseQty) && seen.add(o.baseQty));
}
// Đơn vị mặc định = đơn vị kiểm kê (countUnitName); không khai → đơn vị pha chế.
function wasteNoTemDefaultFactor(it) {
  const pk = (it.packagingUnits || []).find(p => p && p.name && p.name === it.countUnitName && Number(p.baseQty) > 0);
  return pk ? Number(pk.baseQty) : 1;
}
function wasteNoTemPick(id) {
  const it = KHO_ITEMS_CACHE.find(x => x.id === id);
  if (!it || UnitEngine.classify.isTemTracked(it)) { toast('⛔ Nguyên liệu này có dán tem — quét mã QR để báo hủy'); return; }
  khoTxState.ntw = { itemId: id, factor: wasteNoTemDefaultFactor(it), qty: '', ack: false };
  renderKhoTxForm();
}
function wasteNoTemBack() { khoTxState.ntw = null; renderKhoTxForm(); }
function wasteNoTemFilter(v) {
  khoTxState.ntwFilter = v;
  const box = document.getElementById('ntwList'); if (box) box.innerHTML = _wasteNoTemRowsHtml();
}
function wasteNoTemSetUnit(factor) {
  const st = khoTxState.ntw; if (!st) return;
  st.factor = Number(factor) || 1; renderKhoTxForm();
}
function wasteNoTemQty(v) { if (khoTxState.ntw) khoTxState.ntw.qty = v; }
function _wasteNoTemRowsHtml() {
  const f = String(khoTxState.ntwFilter || '').trim().toLowerCase();
  const list = wasteNoTemItems().filter(it => !f || (it.name || '').toLowerCase().includes(f));
  if (!list.length) return `<div class="hh-empty">${f ? 'Không có nguyên liệu khớp.' : 'Chưa có nguyên liệu nào không dán tem.'}</div>`;
  return list.map(it => `<button type="button" class="hh-row" onclick="wasteNoTemPick('${it.id}')">${escHtmlPos(it.name || '')}<span>${escHtmlPos(it.unit || '')}</span></button>`).join('');
}
function renderNoTemWasteForm() {
  const st = khoTxState.ntw;
  const it = st && KHO_ITEMS_CACHE.find(x => x.id === st.itemId);
  if (!st || !it) {
    const n = wasteNoTemItems().length;
    return `<section class="hh-w" style="--c:#b8862f">
      <div class="hh-wt">Chọn NL không dán tem</div>
      ${n > 8 ? `<input class="hh-fld" type="search" placeholder="Tìm nguyên liệu…" value="${escHtmlPos(khoTxState.ntwFilter || '')}" oninput="wasteNoTemFilter(this.value)" style="margin-bottom:10px">` : ''}
      <div class="hh-list" id="ntwList">${_wasteNoTemRowsHtml()}</div>
      <div class="hh-hint">Chỉ hiện NL không dán tem. NL có dán tem phải quét mã QR ở ô bên trái.</div>
    </section>`;
  }
  const units = wasteNoTemUnits(it);
  const cur = units.find(u => u.baseQty === Number(st.factor)) || units[0];
  const un = escHtmlPos(cur.name);
  return `<section class="hh-w" style="--c:#b8862f">
      <div class="hh-wt">NL không dán tem</div>
      <button type="button" class="hh-row on" onclick="wasteNoTemBack()">${escHtmlPos(it.name || '')}<span>đổi</span></button>
      <div class="hh-lb">Số lượng huỷ</div>
      <div class="hh-qty"><input id="ntwQty" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0" value="${st.qty === '' ? '' : escHtmlPos(String(st.qty))}" oninput="wasteNoTemQty(this.value)"><span class="u">${un}</span></div>
      ${units.length > 1 ? `<div class="hh-pills" style="margin-top:12px">${units.map(u => `<button type="button" class="${u.baseQty === cur.baseQty ? 'on' : ''}" onclick="wasteNoTemSetUnit(${u.baseQty})">${escHtmlPos(u.name)}${u.baseQty > 1 ? `<small>= ${fmtPrepQty(u.baseQty)} ${escHtmlPos(it.unit || '')}</small>` : ''}</button>`).join('')}</div>` : ''}
      <div class="hh-lb">Lý do hủy (bắt buộc)</div>
      ${WASTE_REASONS_CACHE.length ? `<div class="hh-sel"><select id="ntwReasonSelect" onchange="document.getElementById('ntwReasonOtherWrap').style.display=this.value==='__other__'?'block':'none'">
        <option value="">Chọn lý do...</option>
        ${WASTE_REASONS_CACHE.map(r => `<option value="${escHtmlPos(r.id)}">${escHtmlPos(r.label)}</option>`).join('')}
        <option value="__other__">Khác (ghi rõ)</option>
      </select></div><div id="ntwReasonOtherWrap" style="display:none;margin-top:10px"><input id="ntwReason" class="hh-fld" placeholder="Ghi rõ lý do hủy"></div>` :
      `<input id="ntwReason" class="hh-fld" placeholder="VD: Hết hạn, đổ vỡ, hư hỏng">`}
      <div class="hh-lb">Ghi chú thêm (nếu cần)</div>
      <input id="ntwNote" class="hh-fld" placeholder="Chi tiết thêm">
    </section>
    <section class="hh-w" style="--c:#2f7d6d">
      <div class="hh-pin">${renderPinInput('ntwStaff')}</div>
      <label class="hh-chk"><input id="ntwAck" type="checkbox" onchange="this.parentNode.classList.toggle('on', this.checked)"><i></i><div>Tôi xác nhận hủy nguyên liệu này<span>Hao hụt được ghi vào kho ngay và không thể tự hoàn tác.</span></div></label>
    </section>
    <button type="button" class="hh-cta" onclick="submitNoTemWaste()">Xác nhận hủy</button>`;
}
async function submitNoTemWaste() {
  if (_posSubmitBusy) { toast('⏳ Đang xử lý, vui lòng đợi...'); return; }
  _posSubmitBusy = true;
  try { await _submitNoTemWasteImpl(); }
  catch (err) { console.error('Hủy NL không tem lỗi', err); toast('❌ Chưa ghi được hao hụt: ' + (err.message || err)); }
  finally { _posSubmitBusy = false; }
}
async function _submitNoTemWasteImpl() {
  const st = khoTxState.ntw;
  const it = st && KHO_ITEMS_CACHE.find(x => x.id === st.itemId);
  if (!it) { toast('⚠️ Chọn nguyên liệu cần hủy'); return; }
  // Lưới an toàn: NL vừa được đổi sang có tem (Quản lý bật theo dõi tem) thì KHÔNG hủy theo số được nữa — bắt buộc quét mã.
  if (UnitEngine.classify.isTemTracked(it)) { toast('⛔ Nguyên liệu này có dán tem — quét mã QR để báo hủy'); return; }
  const qty = Number(document.getElementById('ntwQty')?.value);
  if (!(qty > 0) || !Number.isFinite(qty)) { toast('⚠️ Nhập số lượng huỷ lớn hơn 0'); return; }
  const units = wasteNoTemUnits(it), unit = units.find(u => u.baseQty === Number(st.factor)) || units[0];
  const baseQty = Math.round(qty * unit.baseQty * 1e6) / 1e6;
  if (!(baseQty > 0) || !Number.isFinite(baseQty)) { toast('⚠️ Số lượng không hợp lệ'); return; }
  const sel = document.getElementById('ntwReasonSelect');
  const reason = sel && sel.value !== '__other__'
    ? (sel.value ? (WASTE_REASONS_CACHE.find(r => r.id === sel.value) || {}).label || '' : '')
    : (document.getElementById('ntwReason')?.value || '').trim();
  if (!reason) { toast('⚠️ Ghi rõ lý do hủy'); return; }
  if (!document.getElementById('ntwAck')?.checked) { toast('⚠️ Tích xác nhận trước khi hủy'); return; }
  const staffEmp = await resolveStaffPinAndCheckin('ntwStaff');
  if (!staffEmp) return;
  const extra = (document.getElementById('ntwNote')?.value || '').trim();
  const note = `Hủy NL không tem: ${fmtPrepQty(qty)} ${unit.name} ${it.name} · Lý do: ${reason}${extra ? ' · ' + extra : ''}`;
  // Lần hủy lỗi giữa chừng → bấm lại dùng LẠI id cũ: dòng sổ id cố định nên đã ghi thì bỏ qua, không trừ kho hai lần.
  const sig = [it.id, qty, unit.baseQty, reason, extra].join('|');
  if (!khoTxState.ntwPending) { try { khoTxState.ntwPending = JSON.parse(localStorage.getItem('ntwPending_pos') || 'null'); } catch (e) {} }
  const pend = khoTxState.ntwPending && khoTxState.ntwPending.sig === sig ? khoTxState.ntwPending : null;
  const eventId = pend ? pend.eventId : `ntw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  khoTxState.ntwPending = { sig, eventId };
  try { localStorage.setItem('ntwPending_pos', JSON.stringify(khoTxState.ntwPending)); } catch (e) {}
  await UnitEngine.ledger.apply({
    itemId: it.id, type: 'WASTE', qty: -baseQty, txId: eventId + '_ing_' + it.id,
    note, staff: staffEmp.fullName, staffEmployeeId: staffEmp.id, deriveFromUnits: false,
    meta: { wasteKind: 'item_no_tem', wasteEventId: eventId, reason, itemName: it.name, enteredQty: qty, enteredUnit: unit.name, unitFactor: unit.baseQty }
  });
  khoTxState.ntwPending = null;
  try { localStorage.removeItem('ntwPending_pos'); } catch (e) {}
  toast(`✅ Đã ghi hao hụt ${fmtPrepQty(qty)} ${unit.name} ${it.name}`);
  khoTxState.ntw = null; khoTxState.ntwFilter = '';
  renderKhoTxForm();
}

function khoTxReasonSelectChange() {
  const sel=document.getElementById('ktxReasonSelect'), wrap=document.getElementById('ktxReasonOtherWrap');
  if(sel&&wrap)wrap.style.display=sel.value==='__other__'?'block':'none';
}

async function scanIngredientForWaste() {
  const r=await posScan();
  if(!r.ok){if(r.error!=='cancelled')toast('⚠️ '+posScanErrorText(r.error));return;}
  const c=await UnitEngine.codes.find(r.code);
  if(chanMaTrung(c))return;
  if(!c){toast('❌ Không tìm thấy mã '+r.code);return;}
  if(c.status==='finished'){
    toast(c.finishReason==='discarded'?'ℹ️ Mã '+c.code+' đã báo hủy, không ghi hao hụt lần nữa':'⛔ Mã '+c.code+' đã báo hết, không thể hủy lại');return;
  }
  if(!['sealed','open','discard_pending'].includes(c.status)){toast('⛔ Mã '+c.code+' không thể báo hủy (trạng thái '+c.status+')');return;}
  try{
    c.wastePreview=c.status==='open'?await finishContainerRemaining(c.id,c):
      c.status==='discard_pending'?(c.discardPending?.wasteBase??NaN):Number(c.baseQty);
  }catch(err){toast('⚠️ Không đọc được lượng còn trên mã — quét lại');return;}
  if(c.status!=='discard_pending'&&!(Number(c.wastePreview)>0)){
    toast('⚠️ Mã không còn lượng dương để hủy — vào Quét mở/hết để báo hết');return;
  }
  khoTxState.scannedContainer=c;khoTxState.itemMode='scan';khoTxState.ntw=null;renderKhoTxForm();
}

async function submitKhoTx() {
  if(_posSubmitBusy){toast('⏳ Đang xử lý, vui lòng đợi...');return;}
  _posSubmitBusy=true;
  try{await _submitKhoTxImpl();}
  catch(err){console.error('Báo hủy mã nguyên liệu lỗi',err);
    const code=(khoTxState.scannedContainer&&khoTxState.scannedContainer.code)||'';
    if(err&&err.autoReport)toastAutoReport('❌ Chưa hoàn tất báo hủy '+code+': '+err.message,'Báo hủy mã NL bị chặn',{ref:code});
    else toast('❌ Chưa hoàn tất báo hủy: '+(err.message||err));}
  finally{_posSubmitBusy=false;}
}

async function _submitKhoTxImpl() {
  const scanned=khoTxState.scannedContainer;
  if(!scanned?.id){toast('⚠️ Phải quét mã nguyên liệu cần hủy');return;}
  if(!document.getElementById('ktxDiscardAck')?.checked){toast('⚠️ Xác nhận đúng mã trước khi báo hủy');return;}
  let reason='';
  if(scanned.status!=='discard_pending'){
    const sel=document.getElementById('ktxReasonSelect');
    reason=sel&&sel.value!=='__other__'?(sel.value?sel.selectedOptions[0]?.textContent||'':''):
      (document.getElementById('ktxReason')?.value||'').trim();
    if(!reason){toast('⚠️ Ghi rõ lý do hủy');return;}
  }
  const staffEmp=await resolveStaffPinAndCheckin('ktxStaff');
  if(!staffEmp)return;
  // [E4.3] Claim discard_pending, chốt số dư (RT), ghi WASTE txId cố định, đóng tem, gỡ mốc RT,
  // chốt tồn — nằm trong unit_engine.v1.js (lifecycle.requestDiscard). Ở đây chỉ đọc form.
  const {c,qty}=await UnitEngine.lifecycle.requestDiscard(scanned,{reason,
    note:(document.getElementById('ktxNote')?.value||'').trim(),
    atSource:document.getElementById('ktxLoc')?.value==='source',staffEmp});
  toast('✅ Đã báo hủy mã '+c.code+' · '+fmtPrepQty(qty)+' '+(c.unit||''));
  khoTxState.scannedContainer=null;renderKhoTxForm();
  refreshFifoAlert().catch(()=>{});_refreshStockUseListIfActive();
}

let PREP_VESSELS_CACHE_POS = [];

let _prepVesselsLoadedAt = 0;

// Cân luôn cho ra GAM. Đơn vị nào không quy đổi được từ gam thì KHÔNG cho cân:
// 'ml'/'l' cần biết tỷ trọng (đoán bừa là sai ngầm), 'cái'/'miếng' thì đếm.
// Bên Quản lý chặn ngay từ lúc gắn dụng cụ; ở đây chặn lần nữa vì đơn vị của bán
// thành phẩm có thể bị đổi SAU khi đã gắn.
const POS_VESSEL_UNIT_FACTOR = { g: 1, kg: 1000 };

function posVesselUnitFactor(unit) { return POS_VESSEL_UNIT_FACTOR[unit] || 0; }

// [NL-RECON] Với nguyên liệu ml/l, quy đổi gam sau trừ bì bằng tỷ trọng đã
// đo và lưu riêng cho đúng NL. Không suy ra 1 ml = 1 g từ đơn vị thể tích.
function posItemWeighFactor(it) {
  const unit=String(it&&it.unit||'').trim().toLowerCase();
  if(unit==='g')return 1;
  if(unit==='kg')return 1000;
  const density=Number(it&&it.densityGPerMl);
  return (unit==='ml'||unit==='l') && Number.isFinite(density) && density>0
    ? density*(unit==='l'?1000:1) : 0;
}

// Nạp thư viện dụng cụ. Nhớ trong 5 phút — cấu hình này gần như không đổi trong
// ca, mà ba màn dùng nó đều gọi tới; đọc lại mỗi lần chỉ tốn thêm một lượt mạng
// ngay lúc nhân viên đang đứng chờ trước cân.
async function ensurePrepVesselsPOS(force) {
  if (!force && PREP_VESSELS_CACHE_POS.length && Date.now() - _prepVesselsLoadedAt < 300000) return PREP_VESSELS_CACHE_POS;
  try {
    const snap = await fstore.collection('prep_vessels_gieogieo').get();
    PREP_VESSELS_CACHE_POS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _prepVesselsLoadedAt = Date.now();
  } catch (err) {
    // Không có dụng cụ thì chỉ mất nút cân, mọi thứ còn lại chạy y như cũ —
    // tuyệt đối không để lỗi này chặn màn nào.
    console.warn('[Dụng cụ] không nạp được (bỏ qua, vẫn gõ tay được):', err);
  }
  return PREP_VESSELS_CACHE_POS;
}

// Dụng cụ đã gắn cho MỘT món, ĐÚNG THỨ TỰ Quản lý đã xếp. Lọc bỏ id chết (dụng
// cụ vừa bị xoá) để lưới không có ô trống bấm không được.
// Dùng chung cho bán thành phẩm và nguyên liệu — hai bên khai cùng một thư viện
// prep_vessels_gieogieo, chỉ khác chỗ lấy danh sách id.
function _vesselsByIdsPOS(ids, unit, item) {
  if (!(item ? posItemWeighFactor(item) : posVesselUnitFactor(unit))) return [];
  return (ids || [])
    .map(id => PREP_VESSELS_CACHE_POS.find(v => v.id === id))
    .filter(v => v && (v.variants || []).length);
}

function vesselsForPrepPOS(prepId) {
  const p = (PREP_ITEMS_CACHE_POS || []).find(x => x.id === prepId);
  return p ? _vesselsByIdsPOS(p.vesselIds, p.unit) : [];
}

function prepCanWeighPOS(prepId) { return vesselsForPrepPOS(prepId).length > 0; }

// [MỚI] NGUYÊN LIỆU DÙNG NGAY cũng cân được.
//
// Vì sao cần: trân châu trắng, thạch dừa Đài Loan... là nguyên liệu đóng gói sẵn,
// mở ra dùng luôn, được khai thẳng làm nguyên liệu thô của topping. Chúng hao
// theo tay múc chứ không theo định mức, nên cuối ca phải cân đúng như bán thành
// phẩm. Trước đây bộ cân khoá cứng theo prepId nên nhóm này chỉ gõ tay được — mà
// gõ tay chính là chỗ sai vào thẳng tồn kho.
// Quản lý gắn dụng cụ ở: Kho → Nguyên liệu → mục "Cân cuối ca".
function vesselsForItemPOS(itemId) {
  const it = (KHO_ITEMS_CACHE || []).find(x => x.id === itemId);
  if (!it) return [];
  const reusable = _vesselsByIdsPOS(it.vesselIds, it.unit, it);
  // [NL-RECON] Bao gói gốc là vật chứa THAY THẾ khay/ca khi cân nguyên liệu ngay
  // trong chai/túi. Nếu đặt nguyên chai trong khay, thêm lựa chọn kết hợp để
  // trừ cả hai bì; mỗi thành phần được lưu tại thời điểm cân.
  const pack = ORIGINAL_PACKS_CACHE_POS.find(x => x.id === it.originalPackId);
  if(!pack || !posItemWeighFactor(it))return reusable;
  const original={...pack,id:'original:'+pack.id,originalPackId:pack.id};
  const combined=reusable.map(v=>({id:'original:'+pack.id+'+vessel:'+v.id,
    name:pack.name+' + '+v.name,imageUrl:pack.imageUrl||v.imageUrl||'',originalPackId:pack.id,
    variants:(pack.variants||[]).flatMap(pv=>(v.variants||[]).map(vv=>({
      id:pv.id+'+'+vv.id,label:(pv.label||'')+' + '+(vv.label||''),
      tareG:(Number(pv.tareG)||0)+(Number(vv.tareG)||0),
      imageUrl:pv.imageUrl||vv.imageUrl||pack.imageUrl||v.imageUrl||'',
      tareComponents:[{kind:'original',id:pack.id,variantId:pv.id,label:pv.label,tareG:Number(pv.tareG)||0},
        {kind:'vessel',id:v.id,variantId:vv.id,label:vv.label,tareG:Number(vv.tareG)||0}]
    })))}));
  return [...reusable,original,...combined];
}

function itemCanWeighPOS(itemId) { return vesselsForItemPOS(itemId).length > 0; }

// ═══ [NL-RECON] Bao gói gốc: cache riêng, cùng phần cân nguyên liệu ═══
let ORIGINAL_PACKS_CACHE_POS = [], _originalPacksLoadedAtPOS = 0;

async function ensureOriginalPacksPOS(force) {
  if (!force && _originalPacksLoadedAtPOS && Date.now() - _originalPacksLoadedAtPOS < 300000) return ORIGINAL_PACKS_CACHE_POS;
  const snap = await fstore.collection('ingredient_original_packs_gieogieo').get();
  ORIGINAL_PACKS_CACHE_POS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  _originalPacksLoadedAtPOS = Date.now();
  return ORIGINAL_PACKS_CACHE_POS;
}

// Nạp danh mục nguyên liệu nếu màn hiện tại chưa có. Hỏng thì chỉ mất nút cân,
// KHÔNG được chặn màn nào — cùng nguyên tắc với ensurePrepVesselsPOS().
async function ensureKhoItemsPOS(force) {
  if (!force && KHO_ITEMS_CACHE.length) return KHO_ITEMS_CACHE;
  try {
    const snap = await fstore.collection('inventory_items_gieogieo').get();
    KHO_ITEMS_CACHE = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
  } catch (err) {
    console.warn('[Dụng cụ] không nạp được nguyên liệu (bỏ qua, vẫn gõ tay được):', err);
  }
  return KHO_ITEMS_CACHE;
}

// Nạp trước ảnh ngay khi mở màn, để lúc bấm vào là ảnh đã có sẵn. Trên tablet ở
// quán (4G, chập chờn) chờ ảnh tải lúc đang cầm khay là đủ để nhân viên bỏ qua
// tính năng và quay về gõ tay.
function preloadVesselImagesPOS(prepIds) { _preloadVesselsPOS((prepIds || []).map(vesselsForPrepPOS)); }

// Bản cho nguyên liệu — cùng lý do, dùng ở màn đếm giao ca.
function preloadVesselImagesForItemsPOS(itemIds) { _preloadVesselsPOS((itemIds || []).map(vesselsForItemPOS)); }

function _preloadVesselsPOS(danhSach) {
  const urls = new Set();
  (danhSach || []).forEach(ds => (ds || []).forEach(v => {
    if (v.imageUrl) urls.add(v.imageUrl);
    (v.variants || []).forEach(x => { if (x.imageUrl) urls.add(x.imageUrl); });
  }));
  urls.forEach(u => { const im = new Image(); im.src = u; });
}

// Bộ icon nhỏ cho các nút cân.
//
// Bỏ hẳn emoji ⚖️: đó là cái CÂN ĐĨA thời xưa (và là ký hiệu cung Thiên Bình —
// chủ quán tưởng đúng như vậy nên không bấm). Quán dùng cân điện tử, nên vẽ đúng
// cái cân điện tử: mặt cân phẳng, thân máy, màn hình số.
function icScalePOS(s) {
  const n = s || 22;
  return `<svg width="${n}" height="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
    <rect x="2.5" y="8" width="19" height="11.5" rx="3"/>
    <path d="M6.6 8V6.7c0-.7.5-1.2 1.2-1.2h8.4c.7 0 1.2.5 1.2 1.2V8"/>
    <rect x="8.4" y="11.3" width="7.2" height="4.5" rx="1.3"/>
    <path d="M10.3 13.5h3.4"/></svg>`;
}

function icPenPOS(s) {
  const n = s || 22;
  return `<svg width="${n}" height="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
    <path d="M4 20h4.2L19 9.2a2.1 2.1 0 0 0-3-3L5.2 17 4 20z"/><path d="M14.5 7.5l2.8 2.8"/></svg>`;
}

function icTrashPOS(s) {
  const n = s || 22;
  return `<svg width="${n}" height="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
    <path d="M4 6.5h16M9.5 6.5V4.8h5v1.7M6.5 6.5l1 13h9l1-13"/><path d="M10.5 10v6M13.5 10v6"/></svg>`;
}

// Nút cân dạng CHIP — luôn có CHỮ đi kèm biểu tượng. Một biểu tượng trơ không nói
// được rằng nó bấm được, càng không nói được bấm vào thì ra gì.
function weighBtnHTML(onclickExpr, size) {
  const cao = (size && size < 42) ? 36 : 42;
  return `<button type="button" onclick="${onclickExpr}" style="flex-shrink:0;height:${cao}px;padding:0 12px;border-radius:12px;border:1.5px solid var(--gd);background:#fff;color:var(--gd);font-family:'Google Sans',sans-serif;font-size:${cao > 38 ? '12.5' : '11.5'}px;font-weight:700;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:5px;">${icScalePOS(cao > 38 ? 17 : 15)}Cân trừ bì</button>`;
}

// Nút cân CHÍNH — to, đầy dòng, có câu giải thích bên dưới. Dùng ở chỗ cân là
// việc chính; ô gõ tay lùi xuống thành phương án phụ, đúng thứ tự thật.
function weighBtnWide(onclickExpr, label, sub) {
  return `<button type="button" onclick="${onclickExpr}" style="width:100%;padding:13px 14px;background:var(--gl);color:var(--gm);border:1.5px solid var(--gd);border-radius:14px;font-family:'Google Sans',sans-serif;cursor:pointer;text-align:left;display:flex;align-items:center;gap:11px;">
      ${icScalePOS(24)}
      <span style="flex:1;min-width:0;">
        <span style="display:block;font-size:14.5px;font-weight:700;">${label}</span>
        ${sub ? `<span style="display:block;font-size:11.5px;font-weight:500;opacity:.9;margin-top:1px;">${sub}</span>` : ''}
      </span>
      <span style="font-size:17px;opacity:.55;">&rsaquo;</span>
    </button>`;
}

// Vì sao bán thành phẩm này chưa cân trừ bì được. Ẩn nút im lặng là thứ khiến
// người dùng tưởng tính năng không tồn tại rồi đi hỏi — thà nói ra một dòng, kèm
// đúng đường đi để bật nó lên. Trả '' khi đã cân được (không ai cần đọc gì thêm).
function prepWeighHintHTML(prepId) {
  if (prepCanWeighPOS(prepId)) return '';
  const p = (PREP_ITEMS_CACHE_POS || []).find(x => x.id === prepId) || {};
  const ten = wpEsc(p.name || 'món này');
  const lyDo = !posVesselUnitFactor(p.unit)
    ? `đang tính bằng <b>${wpEsc(p.unit || '?')}</b>, mà cân chỉ cho ra gam nên không trừ bì được`
    : 'chưa được gắn dụng cụ đựng nào';
  return `<div style="margin:10px 0 2px;padding:9px 11px;background:#fbfaf5;border:1px dashed #ddd6c2;border-radius:11px;font-size:11px;color:#8a8471;line-height:1.55;">
      <b>Cân trừ bì chưa bật cho ${ten}</b> — ${lyDo}.<br>
      Bật ở app Quản lý: <b>Kho → Dụng cụ đựng</b> khai khay/ca kèm trọng lượng bì, rồi <b>Kho → Chế biến cấp 1</b> chọn dụng cụ cho món này.
    </div>`;
}

// ---------------------------------------------------------------------------
// Trạng thái bộ cân. `lines` là các lần cân ĐÃ chốt; `cur` là lần đang gõ dở.
// ---------------------------------------------------------------------------
let _wp = null;

// Tên dụng cụ do Quản lý gõ tay — có thể chứa dấu nháy/ngoặc. Escape trước khi
// nhét vào HTML, kẻo một cái tên như 5" làm vỡ cả bộ cân giữa ca.
function wpEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Ảnh hỏng/mất mạng thì thay bằng chữ cái đầu tên, KHÔNG để khung vỡ hay hiện
// icon ảnh lỗi của trình duyệt — nhân viên vẫn cân được bằng tên và số bì.
function wpImgFail(el) {
  const p = el.parentNode; if (!p) return;
  const fb = el.getAttribute('data-fb') || '?';
  const big = el.classList.contains('wp-hero-el');
  el.remove();
  const s = document.createElement('span');
  s.className = big ? 'wp-noimg' : '';
  if (!big) s.style.cssText = 'font-size:22px;font-weight:900;color:#d9d5cb;';
  s.textContent = fb;
  p.appendChild(s);
}

function fmtG(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return Number.isInteger(v) ? v.toLocaleString('vi-VN') : v.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

// Số ròng của một lần cân, quy về ĐƠN VỊ của bán thành phẩm.
function wpNetOf(line) {
  const g = (Number(line.grossG) || 0) - (Number(line.tareG) || 0);
  return Math.round((g / _wp.factor) * 100) / 100;
}

function wpLinesTotal() {
  return Math.round(_wp.lines.reduce((s, l) => s + wpNetOf(l), 0) * 100) / 100;
}

// TỔNG hiện ở chân màn = các lần đã chốt + lần đang gõ dở (nếu hợp lệ). Chỉ cộng
// lần đã chốt thì nhân viên gõ số vào mà ô TỔNG đứng im, tưởng máy không nhận —
// rồi bấm "Thêm lần cân" hai lần cho chắc. Số này khớp đúng với số bấm Xong ra.
function wpTotal() {
  const r = wpValidateCur();
  return Math.round((wpLinesTotal() + (r.ok ? r.net : 0)) * 100) / 100;
}

// opts: { prepId | itemId, unit, title, onDone(netTotal, lines), onManual() }
// prepId = bán thành phẩm; itemId = nguyên liệu dùng ngay. Truyền đúng MỘT trong hai.
async function openWeighPad(opts) {
  await ensurePrepVesselsPOS();
  if (opts.itemId) {
    await ensureKhoItemsPOS();
    await ensureOriginalPacksPOS().catch(err => console.warn('[Bì gốc] không tải được:', err));
  }
  const vessels = opts.itemId ? vesselsForItemPOS(opts.itemId) : vesselsForPrepPOS(opts.prepId);
  if (!vessels.length) {
    toast(opts.itemId ? '⚠️ Nguyên liệu này chưa gắn dụng cụ đựng nào' : '⚠️ Bán thành phẩm này chưa gắn dụng cụ đựng nào');
    return;
  }
  const goc = (opts.itemId
    ? (KHO_ITEMS_CACHE || []).find(x => x.id === opts.itemId)
    : (PREP_ITEMS_CACHE_POS || []).find(x => x.id === opts.prepId)) || {};
  const unit = opts.unit || goc.unit || 'g';
  _wp = {
    prepId: opts.prepId || null, itemId: opts.itemId || null, unit,
    factor: opts.itemId ? posItemWeighFactor(goc) : posVesselUnitFactor(unit),
    title: opts.title || 'Cân bán thành phẩm',
    vessels, lines: [],
    cur: { vesselId: vessels.length === 1 ? vessels[0].id : null, variantId: null, grossG: '' },
    // Câu hỏi phụ thuộc từng luồng (luồng huỷ hỏi "cân phần sẽ huỷ hay phần còn
    // dùng được"). Hỏi ở ĐÂY chứ không ở form, vì nó chỉ có nghĩa khi người ta đã
    // cầm khay đứng trước cân.
    modeAsk: opts.modeAsk || null, allowZero: !!opts.allowZero,
    onDone: opts.onDone, onManual: opts.onManual
  };
  // Một dụng cụ, một kiểu cân → chọn sẵn luôn, nhân viên mở ra là gõ được ngay.
  if (_wp.cur.vesselId) {
    const v0 = vessels[0];
    if ((v0.variants || []).length === 1) _wp.cur.variantId = v0.variants[0].id;
  }
  const old = document.getElementById('wp-overlay');
  if (old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'wp-overlay';
  ov.className = 'wp-ov';
  if (opts.reconcileMode) {
    ov.classList.add('nlr-weigh');
    ov.style.setProperty('--gd', '#0062AD');
    ov.style.setProperty('--gl', '#EAF3FA');
  }
  ov.onclick = e => { if (e.target === ov) closeWeighPad(); };
  ov.innerHTML = `<div class="wp-sheet">
      <div class="wp-head">
        <h3>${wpEsc(_wp.title)}</h3>
        <button class="wp-x" onclick="closeWeighPad()" aria-label="Đóng">✕</button>
      </div>
      <div class="wp-body" id="wp-body"></div>
      <div class="wp-foot" id="wp-foot"></div>
    </div>`;
  document.body.appendChild(ov);
  renderWeighPad();
}

function closeWeighPad() {
  const ov = document.getElementById('wp-overlay');
  if (ov) ov.remove();
  _wp = null;
}

function wpPickVessel(id) {
  if (!_wp) return;
  // Bấm lại đúng cái đang chọn = bỏ chọn, để đổi sang khay khác mà không phải
  // tìm nút huỷ.
  if (_wp.cur.vesselId === id) { _wp.cur.vesselId = null; _wp.cur.variantId = null; }
  else {
    _wp.cur.vesselId = id;
    const v = _wp.vessels.find(x => x.id === id);
    const vars = (v && v.variants) || [];
    _wp.cur.variantId = vars.length === 1 ? vars[0].id : null;
  }
  renderWeighPad();
}

function wpPickMode(v) {
  if (!_wp || !_wp.modeAsk) return;
  _wp.modeAsk.current = v;
  if (_wp.modeAsk.onPick) _wp.modeAsk.onPick(v);
  renderWeighPad();
}

function wpPickVariant(id) {
  if (!_wp) return;
  _wp.cur.variantId = id;
  renderWeighPad();
}

// Không render lại khi gõ — render lại là mất con trỏ giữa chừng. Chỉ cập nhật
// đúng dòng phép tính bên dưới ô nhập.
function wpSetGross(val) {
  if (!_wp) return;
  _wp.cur.grossG = val;
  wpRefreshCalc();
}

function wpCurVariant() {
  const v = _wp.vessels.find(x => x.id === _wp.cur.vesselId);
  if (!v) return null;
  return (v.variants || []).find(x => x.id === _wp.cur.variantId) || null;
}

// Ảnh đại diện cho phân loại đang chọn: ảnh riêng của phân loại, không có thì
// ảnh chính của dụng cụ.
function wpHeroImage() {
  const v = _wp.vessels.find(x => x.id === _wp.cur.vesselId);
  if (!v) return '';
  const vr = wpCurVariant();
  return (vr && vr.imageUrl) || v.imageUrl || '';
}

// Kiểm tra lần cân đang gõ dở. Trả { ok, net, msg }.
function wpValidateCur() {
  const vr = wpCurVariant();
  if (!vr) return { ok: false, net: 0, msg: '' };
  const raw = String(_wp.cur.grossG == null ? '' : _wp.cur.grossG).trim();
  if (raw === '') return { ok: false, net: 0, msg: '' };
  const gross = Number(raw);
  if (!isFinite(gross) || gross <= 0) return { ok: false, net: 0, msg: 'Số cân phải lớn hơn 0' };
  const tare = Number(vr.tareG) || 0;
  if (gross < tare || (gross === tare && !_wp.allowZero)) {
    // Đây là chỗ DUY NHẤT bộ cân chặn cứng: cân ra nhẹ hơn cả cái khay rỗng thì
    // chắc chắn sai (quên đặt lên cân, gõ thiếu số), không phải trường hợp lạ.
    return { ok: false, net: 0, msg: `${fmtG(gross)} g nhẹ hơn cả bì ${fmtG(tare)} g — đã đặt khay lên cân chưa?` };
  }
  return { ok: true, net: Math.round(((gross - tare) / _wp.factor) * 100) / 100, msg: '' };
}

function wpRefreshCalc() {
  const t = document.getElementById('wp-total-num');
  if (t && _wp) t.textContent = fmtG(wpTotal());
  const el = document.getElementById('wp-calc');
  if (!el || !_wp) return;
  const vr = wpCurVariant();
  const r = wpValidateCur();
  const raw = String(_wp.cur.grossG == null ? '' : _wp.cur.grossG).trim();
  if (!vr || raw === '') { el.innerHTML = ''; return; }
  if (!r.ok) { el.innerHTML = `<span style="color:#c0392b;font-weight:700;">${r.msg}</span>`; return; }
  el.innerHTML = `<span style="color:var(--td);">${fmtG(Number(raw))} g − ${fmtG(vr.tareG)} g bì =
    <b style="color:var(--gd);font-size:15px;">${fmtG(r.net)} ${wpEsc(_wp.unit)}</b></span>`;
}

// Chốt lần cân đang gõ vào danh sách. Dùng cả khi bấm "Thêm lần cân" và khi bấm
// "Xong" (xem lý do ở wpDone).
function wpCommitCur(silent) {
  const vr = wpCurVariant();
  const raw = String(_wp.cur.grossG == null ? '' : _wp.cur.grossG).trim();
  if (!vr || raw === '') { if (!silent) toast('⚠️ Chọn dụng cụ rồi gõ số trên cân'); return false; }
  const r = wpValidateCur();
  if (!r.ok) { if (!silent) toast('⚠️ ' + (r.msg || 'Số cân chưa hợp lệ')); return false; }
  const v = _wp.vessels.find(x => x.id === _wp.cur.vesselId);
  _wp.lines.push({
    vesselId: v.id, vesselName: v.name || '', variantId: vr.id, variantLabel: vr.label || '',
    grossG: Number(raw), tareG: Number(vr.tareG) || 0,
    // [NL-RECON] Snapshot ảnh/biến thể bì gốc tại lúc cân; sửa mẫu sau này
    // không khiến nhật ký cân cũ đổi cách hiểu.
    ...(v.originalPackId ? { originalPackId:v.originalPackId,
      originalPackImageUrl:vr.imageUrl||v.imageUrl||'',
      tareComponents:vr.tareComponents||[{kind:'original',id:v.originalPackId,
        variantId:vr.id,label:vr.label,tareG:Number(vr.tareG)||0}] } : {})
  });
  // Xoá NGAY số đang gõ: wpTotal() cộng cả lần dở dang, để nguyên là wpDone()
  // cộng đúng lần vừa chốt thêm một lượt nữa.
  _wp.cur.grossG = '';
  return true;
}

function wpAddLine() {
  if (!wpCommitCur()) return;
  // Bỏ chọn hẳn để lượt sau nhân viên chủ động chọn đúng cái khay tiếp theo —
  // giữ nguyên lựa chọn cũ dễ dẫn tới cân khay B mà hệ thống trừ bì khay A.
  _wp.cur = { vesselId: null, variantId: null, grossG: '' };
  renderWeighPad();
  const b = document.getElementById('wp-body');
  if (b) b.scrollTop = b.scrollHeight;
}

function wpRemoveLine(i) {
  _wp.lines.splice(i, 1);
  renderWeighPad();
}

function wpDone() {
  // Gộp nốt lần cân đang gõ dở. Nhân viên cân khay cuối rồi bấm thẳng "Xong" là
  // phản xạ tự nhiên; bắt bấm "Thêm lần cân" trước sẽ làm mất đúng khay cuối
  // cùng — kiểu mất số im lặng, không ai phát hiện.
  wpCommitCur(true);
  if (!_wp.lines.length) { toast('⚠️ Chưa cân lần nào'); return; }
  const total = wpLinesTotal();
  if (!(total > 0) && !(_wp.allowZero && total === 0)) { toast('⚠️ Tổng sau khi trừ bì bằng 0'); return; }
  const lines = _wp.lines.map(l => ({
    ...l, net: Math.round(((l.grossG - l.tareG) / _wp.factor) * 100) / 100
  }));
  const cb = _wp.onDone;
  closeWeighPad();
  if (cb) cb(total, lines);
}

function wpManual() {
  const cb = _wp && _wp.onManual;
  closeWeighPad();
  if (cb) cb();
}

function renderWeighPad() {
  if (!_wp) return;
  const body = document.getElementById('wp-body');
  const foot = document.getElementById('wp-foot');
  if (!body || !foot) return;
  const v = _wp.vessels.find(x => x.id === _wp.cur.vesselId);
  const vars = (v && v.variants) || [];
  const hero = wpHeroImage();
  const vr = wpCurVariant();

  const chuCai = nm => wpEsc((String(nm || '?').trim().charAt(0) || '?').toUpperCase());
  const thumb = ves => {
    const url = ves.imageUrl || ((ves.variants || [])[0] || {}).imageUrl || '';
    return url
      ? `<img src="${wpEsc(url)}" alt="" loading="lazy" data-fb="${chuCai(ves.name)}" onerror="wpImgFail(this)">`
      : `<span style="font-size:22px;font-weight:900;color:#d9d5cb;">${chuCai(ves.name)}</span>`;
  };

  body.innerHTML = `
    ${_wp.modeAsk ? `
    <div style="display:flex;gap:7px;margin-bottom:14px;">
      ${_wp.modeAsk.options.map(([v, nhan]) => `
        <button type="button" onclick="wpPickMode('${v}')" style="flex:1;padding:12px 8px;border-radius:14px;border:${_wp.modeAsk.current === v ? '2px solid var(--gd)' : '1.5px solid #EDE9E0'};background:${_wp.modeAsk.current === v ? 'var(--gl)' : '#fff'};color:${_wp.modeAsk.current === v ? 'var(--gd)' : '#888'};font-family:'Google Sans',sans-serif;font-size:13px;font-weight:700;cursor:pointer;">${nhan}</button>`).join('')}
    </div>` : ''}
    <div style="font-size:11px;font-weight:700;color:var(--gt);text-transform:uppercase;letter-spacing:.6px;margin-bottom:9px;">Đang đựng bằng gì?</div>
    <div class="wp-grid">
      ${_wp.vessels.map(ves => `
        <div class="wp-card ${ves.id === _wp.cur.vesselId ? 'on' : ''}" onclick="wpPickVessel('${ves.id}')">
          ${ves.id === _wp.cur.vesselId ? '<div class="wp-tick">✓</div>' : ''}
          <div class="wp-thumb">${thumb(ves)}</div>
          <div class="wp-nm">${wpEsc(ves.name || '')}</div>
        </div>`).join('')}
    </div>

    ${v ? `
    <div class="wp-hero">
      <div class="wp-hero-img">
        ${hero
          ? `<img class="wp-hero-el" src="${wpEsc(hero)}" alt="${wpEsc(v.name || '')}" data-fb="${chuCai(v.name)}" onerror="wpImgFail(this)">`
          : `<span class="wp-noimg">${chuCai(v.name)}</span>`}
      </div>
      ${vars.length > 1 ? `
        <div style="font-size:11px;font-weight:700;color:var(--gt);text-transform:uppercase;letter-spacing:.6px;margin-top:14px;">Đang cân kiểu nào?</div>
        <div class="wp-vars">
          ${vars.map(x => `<button type="button" class="wp-var ${x.id === _wp.cur.variantId ? 'on' : ''}" onclick="wpPickVariant('${x.id}')">${wpEsc(x.label || '')}<div style="font-size:10.5px;font-weight:600;opacity:.85;margin-top:2px;">bì ${fmtG(x.tareG)} g</div></button>`).join('')}
        </div>` : ''}

      ${vr ? `
      <div style="margin-top:14px;">
        <div style="font-size:10px;font-weight:700;color:var(--gt);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Số trên cân (cả ${wpEsc(v.name || 'vật đựng')})</div>
        <div style="display:flex;align-items:center;gap:8px;background:#f5f5f5;border-radius:14px;padding:12px 14px;">
          <input id="wp-gross" type="number" inputmode="decimal" step="0.01" value="${_wp.cur.grossG}" oninput="wpSetGross(this.value)" placeholder="VD: 1430"
                 style="flex:1;border:none;outline:none;background:transparent;font-family:'Google Sans',sans-serif;font-size:19px;font-weight:700;color:var(--td);min-width:0;">
          <span style="font-size:14px;font-weight:700;color:var(--gd);">g</span>
        </div>
        <div id="wp-calc" style="font-size:13px;font-weight:600;margin:7px 2px 0;min-height:18px;"></div>
        <button type="button" onclick="wpAddLine()" style="width:100%;margin-top:10px;padding:12px;background:#fff;color:var(--gd);border:1.5px solid var(--gd);border-radius:14px;font-family:'Google Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer;">＋ Thêm lần cân (còn khay khác)</button>
      </div>` : `<div style="font-size:12.5px;color:var(--gt);text-align:center;margin-top:14px;">Chọn kiểu cân bên trên để nhập số.</div>`}
    </div>` : `
    <div style="text-align:center;padding:24px 10px 8px;color:var(--gt);font-size:13px;line-height:1.6;">
      Bấm vào cái khay/ca bạn đang cầm, rồi đặt <b>cả vật đựng</b> lên cân.<br>Hệ thống tự trừ trọng lượng bì.
    </div>`}

    ${_wp.lines.length ? `
    <div style="margin-top:14px;">
      <div style="font-size:11px;font-weight:700;color:var(--gt);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;">Đã cân ${_wp.lines.length} lần</div>
      ${_wp.lines.map((l, i) => `
        <div class="wp-line">
          <div style="min-width:0;">
            <div style="font-size:13px;font-weight:700;color:var(--td);">${wpEsc(l.vesselName)}${l.variantLabel ? ' · ' + wpEsc(l.variantLabel) : ''}</div>
            <div style="font-size:11px;color:var(--gt);">${fmtG(l.grossG)} g − ${fmtG(l.tareG)} g bì</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
            <span style="font-size:14px;font-weight:800;color:var(--gd);white-space:nowrap;">${fmtG(wpNetOf(l))} ${_wp.unit}</span>
            <button type="button" onclick="wpRemoveLine(${i})" aria-label="Bỏ lần cân này" style="width:30px;height:30px;border-radius:9px;border:1px solid #eee;background:#fff;color:#c0392b;font-size:13px;cursor:pointer;">✕</button>
          </div>
        </div>`).join('')}
    </div>` : ''}
    <div style="height:6px;"></div>
  `;

  const tong = wpTotal();
  foot.innerHTML = `
    <div class="wp-total">
      <span style="font-size:12px;font-weight:700;color:var(--gm);text-transform:uppercase;letter-spacing:.5px;">Tổng thực tế</span>
      <span style="font-size:22px;font-weight:900;color:var(--gd);"><span id="wp-total-num">${fmtG(tong)}</span> <span style="font-size:14px;">${wpEsc(_wp.unit)}</span></span>
    </div>
    <button type="button" onclick="wpDone()" style="width:100%;margin-top:10px;padding:15px;background:var(--gd);color:#fff;border:none;border-radius:16px;font-family:'Google Sans',sans-serif;font-size:16px;font-weight:700;cursor:pointer;">Xong — dùng số này</button>
    <button type="button" onclick="wpManual()" style="width:100%;margin-top:7px;padding:11px;background:none;border:none;color:var(--gt);font-family:'Google Sans',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer;">Bỏ qua, tự gõ số tổng</button>
  `;
  wpRefreshCalc();
  // KHÔNG tự đưa con trỏ vào ô số. Ý định ban đầu là bớt một cú chạm, nhưng thực
  // tế bàn phím bật lên che mất nửa màn ngay lúc nhân viên vừa chọn dụng cụ và
  // còn đang muốn xem ảnh/đổi phân loại. Ai muốn gõ thì tự bấm vào ô.
}

// Dòng tóm tắt hiện dưới ô nhập sau khi cân xong, kèm nút cân lại. Dùng chung cho
// cả ba màn để nhân viên luôn thấy con số đó từ đâu ra.
function weighSummaryHTML(lines, unit, onRedo) {
  if (!lines || !lines.length) return '';
  const chi = lines.map(l => `${wpEsc(l.vesselName)}${l.variantLabel && l.variantLabel !== 'Mặc định' ? ' (' + wpEsc(l.variantLabel) + ')' : ''} ${fmtG(l.net)}`).join(' + ');
  return `<div style="display:flex;align-items:center;gap:8px;margin:7px 2px 0;font-size:11.5px;color:#16a34a;font-weight:700;">
      <span style="flex:1;min-width:0;">${lines.length} lần cân: ${chi} ${unit || ''}</span>
      ${onRedo ? `<button type="button" onclick="${onRedo}" style="flex-shrink:0;padding:5px 10px;border-radius:9px;border:1px solid var(--gd);background:#fff;color:var(--gd);font-family:'Google Sans',sans-serif;font-size:11px;font-weight:700;cursor:pointer;">Cân lại</button>` : ''}
    </div>`;
}

PosGieoMods.kho = true;
