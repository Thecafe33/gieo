// Tách từ posgieo.html dòng 10543–10862, 10881–10954 (tools/tach_posgieo/chuyen.js, 2026-10-27). ĐÃ PHÁT HÀNH thì KHÔNG sửa nội dung —
// tạo pos_catalog_admin.v2.js và trỏ HTML tới (sổ tools/js_da_phat_hanh.json). Nạp TRƯỚC <script> chính; CHỈ khai báo.
(window.PosGieoMods = window.PosGieoMods || {}).catalogAdmin = 'dang';

// ============================================================
// MENU MANAGEMENT
// ============================================================
let _mnEditId = null;

let _mnColor = '#E23A5D';

// Reload menu data từ Firebase và refresh UI ngay lập tức (không cần out/vào tab)
function reloadMenuAndRefresh() {
  Promise.all([
    db.ref('menu_gieogieo').once('value'),
    db.ref('menu_togo_gieogieo').once('value'),
    db.ref('toppings_gieogieo').once('value'),
    db.ref('food_gieogieo').once('value')
  ]).then(([snapNormal, snapTogo, snapToppings, snapFood]) => {
    MENU      = parseMenuSnap(snapNormal.val());
    MENU_TOGO = parseMenuSnap(snapTogo.val());
    FOOD_MENU = parseFoodMenuSnap(snapFood.val());
    const tData = snapToppings.val();
    TOPPINGS = tData ? Object.entries(tData).map(([id, v]) => ({ id, name: v.name || '', price: Number(v.price) || 0, priceTogo: Number(v.priceTogo) || 0 })) : [];
    // Refresh tab đang mở trong menu manager
    if (_curMenuTab === 'topping') renderMnToppingList();
    else renderMnList();
    // Refresh giao diện bán hàng luôn
    buildFilterBar();
    renderMenu();
  }).catch(err => console.error('Lỗi reload menu:', err));
}

function switchMnTab(tab, btn) {
  _curMenuTab = tab;
  document.querySelectorAll('#mn .tbb').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // Nút thêm: đổi label + action theo tab
  const addBtn = document.querySelector('#mn .btn-add-item');
  if (addBtn) {
    if (tab === 'topping') {
      addBtn.textContent = '+ Thêm topping';
      addBtn.onclick = () => openToppingForm(null);
    } else {
      addBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Thêm món';
      addBtn.onclick = () => openMenuForm(null);
    }
  }
  if (tab === 'topping') renderMnToppingList();
  else renderMnList();
}

function renderMnList() {
  const el = document.getElementById('mn-list');
  const menuSrc = _curMenuTab === 'togo' ? MENU_TOGO : MENU;
  const tabLabel = _curMenuTab === 'togo' ? 'To Go' : 'Tại quán';
  if (!menuSrc.length && !FOOD_MENU.length) {
    el.innerHTML = `<div style="text-align:center;padding:40px;color:#bbb;font-size:14px;">Chưa có món ${tabLabel} nào</div>`;
    return;
  }
  // Nhóm theo type
  const grp = {};
  menuSrc.forEach(m => {
    const t = m.type || 'Khác';
    if (!grp[t]) grp[t] = [];
    grp[t].push(m);
  });
  let html = Object.entries(grp).map(([type, items]) => `
    <div style="margin-bottom:20px;">
      <div style="font-size:12px;font-weight:700;color:var(--gt);text-transform:uppercase;letter-spacing:.7px;padding:8px 4px 10px;">${type}</div>
      ${items.map(m => {
        const priceM = m.sizes.find(s => s.label==='M');
        const priceL = m.sizes.find(s => s.label==='L');
        return `<div onclick="openMenuForm('${m.id}')" style="background:#fff;border-radius:18px;padding:16px 18px;display:flex;align-items:center;gap:14px;margin-bottom:10px;cursor:pointer;transition:transform .12s;active:scale(.98);">
          <div style="width:44px;height:44px;border-radius:12px;background:${m.color||'#E23A5D'};flex-shrink:0;"></div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:16px;font-weight:700;color:var(--td);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${m.name}</div>
            <div style="font-size:12px;color:var(--gt);margin-top:3px;">
              ${priceM ? 'M: '+priceM.price.toLocaleString('vi-VN') : ''}${priceM && priceL ? ' · ' : ''}${priceL ? 'L: '+priceL.price.toLocaleString('vi-VN') : ''}đ
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="2.5" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
        </div>`;
      }).join('')}
    </div>`).join('');

  // Food section — cố định ở cuối, dùng nút thêm riêng
  html += `
    <div style="margin-bottom:20px;" id="mn-food-section">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 4px 10px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:12px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:.7px;">Food</span>
          <span style="font-size:10px;background:#fef3c7;color:#b45309;border-radius:8px;padding:2px 8px;font-weight:700;">Tách doanh thu riêng</span>
        </div>
        <button onclick="openFoodForm(null)" style="background:#b45309;color:#fff;border:none;border-radius:14px;padding:6px 14px;font-family:'Google Sans',sans-serif;font-size:12px;font-weight:700;cursor:pointer;">+ Thêm món food</button>
      </div>
      ${FOOD_MENU.length ? FOOD_MENU.map(f => `
        <div onclick="openFoodForm('${f.id}')" style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:18px;padding:16px 18px;display:flex;align-items:center;gap:14px;margin-bottom:10px;cursor:pointer;">
          <div style="width:44px;height:44px;border-radius:12px;background:${f.color||'#b45309'};flex-shrink:0;"></div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:16px;font-weight:700;color:var(--td);">${f.name}</div>
            <div style="font-size:12px;color:#b45309;margin-top:3px;font-weight:600;">${f.price.toLocaleString('vi-VN')}đ · Food</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="2.5" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
        </div>`).join('')
      : `<div style="text-align:center;padding:20px;color:#d97706;font-size:13px;">Chưa có món Food nào</div>`}
    </div>`;

  el.innerHTML = html;
}

const MN_COLORS = ['#E23A5D','#2d6a4f','#1a5276','#6c3483','#922b21','#784212','#0e6655','#4a235a','#2e4057','#d35400','#1a6b6b','#5d4037'];

function buildColorPicker() {
  const picker = document.getElementById('mn-color-picker');
  picker.innerHTML = '';
  MN_COLORS.forEach(c => {
    const el = document.createElement('div');
    el.dataset.color = c;
    el.style.cssText = 'width:32px;height:32px;border-radius:50%;cursor:pointer;transition:all .15s;flex-shrink:0;';
    el.style.background = c;
    el.onclick = () => selectMenuColor(c);
    picker.appendChild(el);
  });
}

function getMnMenuSrc() {
  return _curMenuTab === 'togo' ? MENU_TOGO : MENU;
}

function getMnFirebaseRef() {
  return _curMenuTab === 'togo' ? 'menu_togo_gieogieo' : 'menu_gieogieo';
}

function openMenuForm(id) {
  _mnEditId = id;
  buildColorPicker();
  hideTypeDropdown();

  const tabLabel = _curMenuTab === 'togo' ? ' (To Go)' : ' (Tại quán)';
  const title = document.getElementById('mn-form-title');
  const delBtn = document.getElementById('mn-f-del');

  if (id) {
    const m = getMnMenuSrc().find(x => x.id === id);
    if (!m) return;
    title.textContent = 'Chỉnh sửa món' + tabLabel;
    document.getElementById('mn-f-name').value = m.name;
    document.getElementById('mn-f-type').value = m.type || '';
    const pm = m.sizes.find(s => s.label === 'M');
    const pl = m.sizes.find(s => s.label === 'L');
    document.getElementById('mn-f-pm').value = pm ? pm.price.toLocaleString('vi-VN') : '';
    document.getElementById('mn-f-pl').value = pl ? pl.price.toLocaleString('vi-VN') : '';
    _mnColor = m.color || '#E23A5D';
    delBtn.style.display = 'block';
  } else {
    title.textContent = 'Thêm món mới' + tabLabel;
    document.getElementById('mn-f-name').value = '';
    document.getElementById('mn-f-type').value = '';
    document.getElementById('mn-f-pm').value = '';
    document.getElementById('mn-f-pl').value = '';
    _mnColor = '#E23A5D';
    delBtn.style.display = 'none';
  }
  refreshColorPicker();
  document.getElementById('mn-popup').style.display = 'flex';
}

function refreshColorPicker() {
  document.querySelectorAll('#mn-color-picker div').forEach(el => {
    const sel = el.dataset.color === _mnColor;
    el.style.outline = sel ? '3px solid var(--gm)' : 'none';
    el.style.outlineOffset = sel ? '2px' : '0';
    el.style.transform = sel ? 'scale(1.15)' : 'scale(1)';
  });
}

function closeMenuForm() {
  document.getElementById('mn-popup').style.display = 'none';
  hideTypeDropdown();
}

function selectMenuColor(c) {
  _mnColor = c;
  refreshColorPicker();
}

// ---- Type dropdown ----
function getExistingTypes() {
  return [...new Set(getMnMenuSrc().map(m => m.type).filter(Boolean))];
}

function showTypeDropdown() {
  filterTypeDropdown(document.getElementById('mn-f-type').value);
}

function filterTypeDropdown(val) {
  const dd = document.getElementById('mn-type-dropdown');
  const types = getExistingTypes().filter(t => t.toLowerCase().includes(val.toLowerCase()));
  if (!types.length) { dd.style.display = 'none'; return; }
  dd.innerHTML = types.map(t =>
    '<div onclick="pickType(\'' + t.replace(/'/g,"\\'") + '\')" style="padding:12px 16px;font-family:\'Google Sans\',sans-serif;font-size:15px;font-weight:600;color:var(--td);cursor:pointer;border-bottom:1px solid #f5f5f5;">' + t + '</div>'
  ).join('');
  dd.style.display = 'block';
}

function pickType(t) {
  document.getElementById('mn-f-type').value = t;
  hideTypeDropdown();
}

function hideTypeDropdown() {
  const dd = document.getElementById('mn-type-dropdown');
  if (dd) dd.style.display = 'none';
}

function fmtPriceInput(el) {
  const raw = el.value.replace(/[^0-9]/g, '');
  const num = parseInt(raw) || 0;
  el.value = num > 0 ? num.toLocaleString('vi-VN') : '';
}

function getPriceVal(id) {
  const raw = document.getElementById(id).value.replace(/[^0-9]/g, '');
  return parseInt(raw) || 0;
}

function saveMenuItem() {
  const name = document.getElementById('mn-f-name').value.trim();
  if (!name) { toast('Vui lòng nhập tên món!'); return; }
  const priceM = getPriceVal('mn-f-pm');
  const priceL = getPriceVal('mn-f-pl');
  if (!priceM && !priceL) { toast('Vui lòng nhập ít nhất 1 giá!'); return; }

  const data = {
    name,
    type: document.getElementById('mn-f-type').value.trim(),
    color: _mnColor,
    priceM: priceM || 0,
    priceL: priceL || 0
  };

  const fbNode = getMnFirebaseRef();
  const ref = _mnEditId
    ? db.ref(fbNode + '/' + _mnEditId)
    : db.ref(fbNode).push();

  ref.set(data).then(() => {
    toast(_mnEditId ? '✅ Đã cập nhật món!' : '✅ Đã thêm món mới!');
    closeMenuForm();
    reloadMenuAndRefresh();
  }).catch(err => toast('❌ Lỗi: ' + err.message));
}

async function deleteMenuItem() {
  if (!_mnEditId) return;
  const tabLabel = _curMenuTab === 'togo' ? 'menu To Go' : 'menu';
  // [FIX-confirm-webview] Ba nút xoá dưới đây trước giờ bấm không có tác dụng trong app.
  if (!(await posConfirm('Xoá món này khỏi ' + tabLabel + '?', { danger: true, okText: 'Xoá' }))) return;
  db.ref(getMnFirebaseRef() + '/' + _mnEditId).remove().then(() => {
    toast('🗑 Đã xoá món');
    closeMenuForm();
    reloadMenuAndRefresh();
  }).catch(err => toast('❌ Lỗi: ' + err.message));
}

// ============================================================
// FOOD MENU — Phân loại tách doanh thu riêng
// ============================================================
let _foodEditId = null;

function openFoodForm(id) {
  _foodEditId = id;
  const popup = document.getElementById('food-popup');
  const title = document.getElementById('food-form-title');
  const delBtn = document.getElementById('food-f-del');
  if (id) {
    const f = FOOD_MENU.find(x => x.id === id);
    if (!f) return;
    title.textContent = 'Chỉnh sửa món Food';
    document.getElementById('food-f-name').value = f.name;
    document.getElementById('food-f-price').value = f.price ? f.price.toLocaleString('vi-VN') : '';
    delBtn.style.display = 'block';
  } else {
    title.textContent = 'Thêm món Food mới';
    document.getElementById('food-f-name').value = '';
    document.getElementById('food-f-price').value = '';
    delBtn.style.display = 'none';
  }
  popup.style.display = 'flex';
}

function closeFoodForm() {
  document.getElementById('food-popup').style.display = 'none';
}

function saveFoodItem() {
  const name = document.getElementById('food-f-name').value.trim();
  if (!name) { toast('Vui lòng nhập tên món!'); return; }
  const priceRaw = document.getElementById('food-f-price').value.replace(/[^0-9]/g, '');
  const price = parseInt(priceRaw) || 0;
  if (!price) { toast('Vui lòng nhập giá món!'); return; }
  const data = { name, price, color: '#b45309' };
  const ref = _foodEditId ? db.ref('food_gieogieo/' + _foodEditId) : db.ref('food_gieogieo').push();
  ref.set(data).then(() => {
    toast(_foodEditId ? '✅ Đã cập nhật món Food!' : '✅ Đã thêm món Food mới!');
    closeFoodForm();
    reloadMenuAndRefresh();
  }).catch(err => toast('❌ Lỗi: ' + err.message));
}

async function deleteFoodItem() {
  if (!_foodEditId) return;
  if (!(await posConfirm('Xoá món Food này?', { danger: true, okText: 'Xoá' }))) return;
  db.ref('food_gieogieo/' + _foodEditId).remove().then(() => {
    toast('🗑 Đã xoá món Food');
    closeFoodForm();
    reloadMenuAndRefresh();
  }).catch(err => toast('❌ Lỗi: ' + err.message));
}

function renderMnToppingList() {
  const el = document.getElementById('mn-list');
  if (!TOPPINGS.length) {
    el.innerHTML = `<div style="text-align:center;padding:40px;color:#bbb;font-size:14px;">Chưa có topping nào</div>`;
    return;
  }
  el.innerHTML = TOPPINGS.map(t => `
    <div onclick="openToppingForm('${t.id}')" style="background:#fff;border-radius:18px;padding:16px 18px;display:flex;align-items:center;gap:14px;margin-bottom:10px;cursor:pointer;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:16px;font-weight:700;color:var(--td);">${t.name}</div>
        <div style="font-size:12px;color:var(--gt);margin-top:3px;">Tại quán: ${t.price.toLocaleString('vi-VN')}đ · To Go: ${t.priceTogo.toLocaleString('vi-VN')}đ</div>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="2.5" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
    </div>`).join('');
}

function openToppingForm(id) {
  _tpEditId = id;
  const title = document.getElementById('tp-form-title');
  const delBtn = document.getElementById('tp-f-del');
  if (id) {
    const t = TOPPINGS.find(x => x.id === id);
    if (!t) return;
    title.textContent = 'Chỉnh sửa topping';
    document.getElementById('tp-f-name').value = t.name;
    document.getElementById('tp-f-price').value = t.price > 0 ? t.price.toLocaleString('vi-VN') : '';
    document.getElementById('tp-f-price-togo').value = t.priceTogo > 0 ? t.priceTogo.toLocaleString('vi-VN') : '';
    delBtn.style.display = 'block';
  } else {
    title.textContent = 'Thêm topping';
    document.getElementById('tp-f-name').value = '';
    document.getElementById('tp-f-price').value = '';
    document.getElementById('tp-f-price-togo').value = '';
    delBtn.style.display = 'none';
  }
  document.getElementById('tp-popup').style.display = 'flex';
}

function closeToppingForm() {
  document.getElementById('tp-popup').style.display = 'none';
}

function saveTopping() {
  const name = document.getElementById('tp-f-name').value.trim();
  if (!name) { toast('Vui lòng nhập tên topping!'); return; }
  const price     = parseInt(document.getElementById('tp-f-price').value.replace(/[^0-9]/g,'')) || 0;
  const priceTogo = parseInt(document.getElementById('tp-f-price-togo').value.replace(/[^0-9]/g,'')) || 0;
  const data = { name, price, priceTogo };
  const ref = _tpEditId ? db.ref('toppings_gieogieo/' + _tpEditId) : db.ref('toppings_gieogieo').push();
  ref.set(data).then(() => {
    toast(_tpEditId ? '✅ Đã cập nhật topping!' : '✅ Đã thêm topping!');
    closeToppingForm();
    // Reload toppings
    db.ref('toppings_gieogieo').once('value').then(snap => {
      const d = snap.val();
      TOPPINGS = d ? Object.entries(d).map(([id, v]) => ({ id, name: v.name||'', price: Number(v.price)||0, priceTogo: Number(v.priceTogo)||0 })) : [];
      renderMnToppingList();
    });
  }).catch(err => toast('❌ ' + err.message));
}

async function deleteTopping() {
  if (!_tpEditId) return;
  if (!(await posConfirm('Xoá topping này?', { danger: true, okText: 'Xoá' }))) return;
  db.ref('toppings_gieogieo/' + _tpEditId).remove().then(() => {
    toast('🗑 Đã xoá topping');
    closeToppingForm();
    db.ref('toppings_gieogieo').once('value').then(snap => {
      const d = snap.val();
      TOPPINGS = d ? Object.entries(d).map(([id, v]) => ({ id, name: v.name||'', price: Number(v.price)||0, priceTogo: Number(v.priceTogo)||0 })) : [];
      renderMnToppingList();
    });
  }).catch(err => toast('❌ ' + err.message));
}

PosGieoMods.catalogAdmin = true;
