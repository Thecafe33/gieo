// Tách từ posgieo.html dòng 7641–8347, 9538–9911 (tools/tach_posgieo/chuyen.js, 2026-10-27). ĐÃ PHÁT HÀNH thì KHÔNG sửa nội dung —
// tạo pos_customers.v2.js và trỏ HTML tới (sổ tools/js_da_phat_hanh.json). Nạp TRƯỚC <script> chính; CHỈ khai báo.
(window.PosGieoMods = window.PosGieoMods || {}).customers = 'dang';

function lookupCustomer() {
  let phone = document.getElementById('cuph').value.trim().replace(/[^0-9]/g, '');
  if (/^84\d{9}$/.test(phone)) phone = '0' + phone.slice(2);
  if (!phone) return;

  fstore.collection('customers').doc(phone).get().then(snap => {
    if (!snap.exists) {
      showAddMemberHint(phone);
      return;
    }
    const fsData = { id: phone, ...snap.data() };
    loyaltyCustomer = fsData;

    const name    = fsData.nickname || fsData.name || 'Khách hàng';
    const note    = fsData.note || '';

    curCustomer = { phone, name, note };
    renderCustomerInfo(fsData.total_points || 0, fsData.stamp_count || 0);
    checkFreeToppingMemberPromo();
  }).catch(err => {
    console.error('Lỗi tra cứu:', err);
    toast('Lỗi tra cứu: ' + err.message);
  });
}

function renderCustomerInfo(totalPoints, stampCount) {
  if (!curCustomer) return;
  const panel = document.getElementById('custInfo');

  // Tên: đã được resolve đúng trong lookupCustomer
  const displayName = (loyaltyCustomer && loyaltyCustomer.nickname) || curCustomer.name;
  document.getElementById('custName').textContent = displayName;

  // Hiển thị loyalty info
  let ptsHtml = '';
  if (totalPoints > 0) ptsHtml += `🏆 ${totalPoints.toLocaleString('vi-VN')} Point`;
  if (stampCount  > 0) ptsHtml += `${ptsHtml ? '  |  ' : ''}☕ ${stampCount}/6 Stamp`;
  const freeDrink = loyaltyCustomer ? (loyaltyCustomer.free_drink_available || 0) : 0;
  if (freeDrink > 0) ptsHtml += `${ptsHtml ? '  |  ' : ''}🎁 ${freeDrink} ly miễn phí`;
  document.getElementById('custPts').textContent = ptsHtml;
  document.getElementById('custNote').textContent = curCustomer.note;

  const vList = document.getElementById('voucherList');
  const _dbFree  = loyaltyCustomer ? (loyaltyCustomer.free_drink_available || 0) : 0;
  const _dbStamp = loyaltyCustomer ? (loyaltyCustomer.stamp_count || 0) : 0;
  // Tính tổng ly miễn phí: DB + stamp chưa convert (tránh trường hợp DB chưa cập nhật)
  const effectiveFree = _dbFree + Math.floor(_dbStamp / 6);

  // Phần 1: Ly To-Go Miễn Phí — PIN trên cùng, không bị scroll ẩn
  let stampHtml = '';
  if (effectiveFree > 0) {
    stampHtml = '<div style="border:2px solid #34d399;background:#ecfdf5;border-radius:10px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">'
      + '<div>'
      + '<div style="font-size:13px;font-weight:800;color:#065f46;">\u2615 ' + effectiveFree + ' Ly To-Go Mi\u1ec5n Ph\u00ed</div>'
      + '<div style="font-size:10px;color:#059669;font-weight:600;margin-top:2px;">T\u00edch \u0111\u1ee7 6 Stamp \u2022 Th\u00eam m\u00f3n v\u00e0o gi\u1ecf r\u1ed3i b\u1ea5m \u0110\u1ed5i ngay</div>'
      + '</div>'
      + '<button style="background:#10b981;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-family:\'Google Sans\',sans-serif;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;" onclick="consumeFreeToGoDrink(\'' + curCustomer.phone + '\')">\u0110\u1ed5i ngay</button>'
      + '</div>';
  }

  // [F4] Đã gỡ danh sách quà `myGifts` (quà của hệ khác — Gieo Gieo không dùng mã/voucher).
  vList.innerHTML = stampHtml
    || `<div style="font-size:12px;color:#bbb;text-align:center;padding:4px">Không có ly miễn phí</div>`;
  panel.classList.add('show');
}

// ── Thêm thành viên mới ──────────────────────────────────────────
function showAddMemberHint(phone) {
  const hint = document.getElementById('addMemberHint');
  document.getElementById('addMemberHintPhone').textContent = phone;
  hint.style.display = 'block';
  // Ẩn hint khi nhập lại
  document.getElementById('cuph').addEventListener('input', function hide() {
    hint.style.display = 'none';
    document.getElementById('cuph').removeEventListener('input', hide);
  }, { once: true });
}

function openAddMemberPopup() {
  const phone = document.getElementById('cuph').value.trim();
  document.getElementById('addMem-phone').value = phone;
  document.getElementById('addMem-name').value = '';
  document.getElementById('addMemberHint').style.display = 'none';
  document.getElementById('addMemberPopup').style.display = 'flex';
  setTimeout(() => document.getElementById('addMem-name').focus(), 200);
}

function closeAddMemberPopup() {
  document.getElementById('addMemberPopup').style.display = 'none';
}

async function confirmAddMember() {
  const phone = document.getElementById('addMem-phone').value.trim();
  const name  = document.getElementById('addMem-name').value.trim();

  if (!phone || phone.length < 9) { toast('SĐT không hợp lệ!'); return; }
  if (!name) { toast('Vui lòng nhập tên thành viên!'); return; }

  const btn = document.querySelector('#addMemberPopup button:last-child');
  btn.disabled = true;
  btn.textContent = 'Đang tạo...';

  try {
    // Ghi vào Firestore customers (single source of truth)
    await fstore.collection('customers').doc(phone).set({
      phone,
      nickname: name,
      name,
      total_points: 0,
      stamp_count: 0,
      stamps_today: 0,
      last_stamp_date: '',
      free_drink_available: 0,
      joinDate: vnDate().toISOString(),
      lastVisit: vnDate().toISOString(),
      source: 'pos_gieogieo'
    });

    closeAddMemberPopup();
    toast('✅ Đã thêm thành viên: ' + name);

    // Cập nhật cache autocomplete ngay (không cần refetch toàn bộ)
    const newEntry = {
      id: phone, _src: 'fs', phone, nickname: name, name,
      total_points: 0, stamp_count: 0, free_drink_available: 0
    };
    allCustomersCache = allCustomersCache.filter(c => c.id !== phone);
    allCustomersCache.unshift(newEntry);
    _custAcSave();   // [GIẢM-ĐỌC] bản gợi ý trong máy có luôn khách mới, không chờ lần làm mới hôm sau

    // Tự chọn thành viên vừa tạo vào đơn hiện tại
    document.getElementById('cuph').value = phone;
    loyaltyCustomer = {
      id: phone, phone, nickname: name, name,
      total_points: 0, stamp_count: 0, free_drink_available: 0
    };
    curCustomer = { phone, name, note: '' };
    renderCustomerInfo(0, 0);
    checkFreeToppingMemberPromo();

  } catch(err) {
    toast('❌ Lỗi tạo thành viên: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '✅ Thêm thành viên & chọn vào đơn';
  }
}

// [FIX-freeTp-confirmBeforeClear] Điểm vào DUY NHẤT để xoá khách hàng hiện tại:
// nếu giỏ đang có topping được tặng, phải hỏi xác nhận trước; nếu không thì xoá luôn.
let _phoneClearPending = false;

function requestClearCustomer() {
  if (curCustomer && cartHasFreeToppingApplied()) {
    if (!_phoneClearPending) {
      _phoneClearPending = true;
      openPhoneClearConfirmPopup();
    }
    return;
  }
  clearCustomer();
}

function openPhoneClearConfirmPopup() {
  const popup = document.getElementById('phoneClearConfirmPopup');
  if (popup) popup.style.display = 'flex';
}

function phoneClearConfirmCancel() {
  const popup = document.getElementById('phoneClearConfirmPopup');
  if (popup) popup.style.display = 'none';
  _phoneClearPending = false;
  // Khôi phục lại đúng SĐT của khách đang chọn (nhân viên có thể đã gõ/xoá dở trong lúc chờ xác nhận)
  if (curCustomer && curCustomer.phone) {
    const input = document.getElementById('cuph');
    if (input) input.value = curCustomer.phone;
  }
}

function phoneClearConfirmProceed() {
  const popup = document.getElementById('phoneClearConfirmPopup');
  if (popup) popup.style.display = 'none';
  _phoneClearPending = false;
  const input = document.getElementById('cuph');
  if (input) input.value = '';
  clearCustomer();
}

function clearCustomer() {
  // [FIX-freeTp-revertOnClear] Trước khi bỏ curCustomer: gỡ mọi topping đã được
  // tặng qua chương trình free-topping-cho-thành-viên (đánh dấu _freeTpMark) ra khỏi
  // giỏ hàng, vì điều kiện tặng (khách có SĐT tích điểm) không còn đúng nữa.
  // Nếu không revert, nhân viên có thể: nhập SĐT -> được tặng topping -> xoá SĐT
  // -> topping tặng vẫn còn nguyên trong giỏ dù khách giờ là khách vãng lai.
  let revertedCount = 0;
  Object.values(cart).forEach(c => {
    if (c && c.freeTpApplied) {
      const before = (c.toppings || []).length;
      c.toppings = (c.toppings || []).filter(t => !t._freeTpMark);
      if ((c.toppings || []).length !== before) revertedCount++;
      c.freeTpApplied = false;
      delete c._freeTpName;
    }
  });
  // Đóng popup chọn topping đang mở (nếu có) và xoá danh sách ly đang xử lý dở
  _freeTpUnits = [];
  _freeTpActiveKey = null;
  _freeTpSelectedId = null;
  const unitsPopup = document.getElementById('freeTpUnitsPopup');
  if (unitsPopup) unitsPopup.classList.remove('show');
  const pickPopup = document.getElementById('freeTpPopup');
  if (pickPopup) pickPopup.classList.remove('show');

  curCustomer = null;
  loyaltyCustomer = null;
  document.getElementById('custInfo').classList.remove('show');
  document.getElementById('addMemberHint').style.display = 'none';
  document.getElementById('voucherList').innerHTML = '';
  renderFreeTpReminder();

  if (revertedCount > 0) {
    toast(`⚠ Đã bỏ topping tặng (khách không còn là thành viên)`);
    renderCartDrawer();
    updCoTotal();
  }
}

// [F4] Chỉ còn dọn ý định đổi ly miễn phí theo tem (mã giảm giá / voucher đã gỡ).
// Ly tem đang nằm trong giỏ thì trả về giá gốc (giữ đúng hành vi cũ của removeGiftVoucher).
function resetDiscountState() {
  if (_stampFreeVKey) {
    Object.keys(cart).forEach(k => {
      const ci = cart[k];
      if (ci && ci._vKey === _stampFreeVKey) {
        if (ci._originalPrice !== undefined) {
          ci.price = ci._originalPrice;
          delete ci._vKey; delete ci._giftType; delete ci._giftLabel;
          delete ci._originalPrice; delete ci._originalName;
        } else {
          delete cart[k];
        }
      }
    });
  }
  _stampFreeVKey = null;
  _stampFreePhone = null;
  _stampFreeNeedConvert = false;
  _stampFreeOriginalStamp = 0;
}

// _stampFreePhone: phone cần trừ free_drink_available sau khi order hoàn thành
// _stampFreeNeedConvert: true nếu cần convert stamp_count → free_drink_available
let _stampFreePhone = null;

let _stampFreeNeedConvert = false;

let _stampFreeOriginalStamp = 0;

// [F4] Khoá _vKey của ly đổi tem đang nằm trong giỏ. TRƯỚC ĐÂY dùng chung _giftVoucherKey/
// _giftVoucherPhone với voucher myGifts → sau thanh toán _finalizeDiscountAfterPay ghi rác
// `myGifts.__free_stamp__<ts>.used` vào customers (dùng chung với The Cafe 33).
let _stampFreeVKey = null;

// [F4] Ly đổi tem đã rời giỏ (xoá / "−" về 0) → huỷ ý định trừ tem. TRƯỚC ĐÂY vẫn trừ 1 ly
// miễn phí dù khách không nhận ly nào.
function _stampFreeSyncCart() {
  if (!_stampFreeVKey) return;
  if (Object.values(cart).some(ci => ci && ci._vKey === _stampFreeVKey)) return;
  _stampFreeVKey = null;
  _stampFreePhone = null;
  _stampFreeNeedConvert = false;
  _stampFreeOriginalStamp = 0;
}

function consumeFreeToGoDrink(phone) {
  // [SỬA] TRƯỚC ĐÂY bắt buộc giỏ phải có món trước, rồi mở modal chọn TỪ GIỎ —
  // nghĩa là nhân viên phải thoát ra màn order, thêm món khách muốn, quay lại,
  // rồi mới bấm đổi được. Giờ bấm "Đổi ngay" là hiện thẳng menu quà tặng, chọn
  // xong ly được thêm vào giỏ luôn.
  // Dùng CHUNG menu quà tặng với chương trình mua-X-tặng-Y (togoSettings.giftMenu)
  // — cùng là "một ly tặng", không có lý do gì hai chương trình lại được chọn
  // trong hai danh sách khác nhau.
  fstore.collection('customers').doc(phone).get().then(snap => {
    if (!snap.exists) { toast('❌ Không tìm thấy khách hàng!'); return; }
    const data = snap.data();
    const curFree  = data.free_drink_available || 0;
    const curStamp = data.stamp_count || 0;
    const effectiveFree = curFree + Math.floor(curStamp / 6);

    if (effectiveFree <= 0) { toast('❌ Khách không còn ly miễn phí nào.'); return; }
    // Mỗi lượt đổi 1 ly. Bấm lại nút "Đổi ngay" để đổi tiếp nếu khách còn nhiều ly.
    if (Object.values(cart).some(ci => ci._giftType === 'item_free' && ci._vKey)) {
      toast('ℹ️ Bill này đã có 1 ly miễn phí rồi — thanh toán xong rồi đổi tiếp nhé.');
      return;
    }

    // Trần giá ly đổi: ly miễn phí cũ nhất trước; chưa quy đổi thì lấy 6 tem đầu.
    const stampCap = (curFree > 0)
      ? _freeCapsSynced(data.free_drink_caps, curFree)[0]
      : _capOfSixStamps(_stampPricesSynced(data.stamp_prices, curStamp).slice(0, 6));

    const tempVKey = '__free_stamp__' + Date.now();
    // Lưu intent TRƯỚC, và chỉ ghi DB sau khi thanh toán xong (_finalizeStampFreeAfterPay).
    // Nếu nhân viên đóng popup mà không chọn gì thì dọn lại ở nhánh else bên dưới.
    _stampFreeVKey = tempVKey;

    openTogoGiftPopup(1, () => {
      const applied = Object.values(cart).some(ci => ci._vKey === tempVKey);
      if (applied) {
        _stampFreePhone = phone;
        _stampFreeNeedConvert = (curFree <= 0 && curStamp >= 6);
        _stampFreeOriginalStamp = curStamp;
        renderCartDrawer();
        updFooter();
        updCoTotal();
      } else {
        _stampFreeVKey    = null;
        _stampFreePhone   = null;
        toast('ℹ️ Chưa chọn món — ly miễn phí chưa được đổi.');
      }
    }, { stampVKey: tempVKey, stampCap });

  }).catch(err => toast('❌ Có lỗi xảy ra: ' + err.message));
}

// Gọi sau khi order lưu thành công — ghi DB trừ stamp/free_drink.
// [BUG "xoá intent trước khi ghi DB thành công" — FIX] TRƯỚC ĐÂY `_stampFreePhone = null` chạy
// NGAY ĐẦU hàm, trước cả khi biết update() bên dưới có thành công hay không — nếu Firestore lỗi
// giữa chừng (mất mạng), nghĩa vụ "phải trừ đúng 1 ly miễn phí này" biến mất khỏi RAM vĩnh viễn,
// không còn cách nào phát hiện/khôi phục — khách có thể đổi lại đúng ly/tem đó ở lượt mua sau,
// tức hưởng 2 lần cho 1 lượt tích đủ. Giờ sửa theo 3 lớp:
//  1) Idempotent theo billId (doc `stamp_free_redemptions_gieogieo/{billId}`, cùng transaction với
//     việc trừ customer) — phòng khi hàm bị gọi lại (vd. đợt retry side-effect của BUG#17).
//  2) Retry vài lần qua _ueRetryAsync trước khi bỏ cuộc, thay vì thử đúng 1 lần rồi thôi.
//  3) Chỉ khi retry vẫn lỗi mới ghi 1 cảnh báo DURABLE (alerts_gieogieo, cùng mẫu với GOGS ở
//     _ueWarnGogsConsumptionFailed) để Quản lý tự đối soát tay — không còn "mất trong im lặng".
// `_stampFreePhone` (RAM) chỉ bị xoá SAU khi biết chắc kết quả (thành công hoặc đã ghi cảnh báo).
async function _finalizeStampFreeAfterPay(billId, items) {
  if (!_stampFreePhone) return;
  // [F4] Chốt chặn cuối: bill không có ly đổi tem nào → không trừ (ý định còn sót lại).
  if (Array.isArray(items) && !items.some(c => c && c._vKey && c._vKey === _stampFreeVKey)) {
    _stampFreePhone = null; _stampFreeVKey = null;
    return;
  }
  const phone = _stampFreePhone;
  try {
    const markerRef = billId ? fstore.collection('stamp_free_redemptions_gieogieo').doc(billId) : null;
    await UnitEngine.util.retry(async () => {
      await fstore.runTransaction(async t => {
        if (markerRef) {
          const mdoc = await t.get(markerRef);
          if (mdoc.exists) return; // đã xử lý ở lượt trước (hàm bị gọi lại) — no-op, tránh trừ đúp
        }
        const custRef = fstore.collection('customers').doc(phone);
        const snap = await t.get(custRef);
        if (!snap.exists) {
          if (markerRef) t.set(markerRef, { phone, at: vnDate().toISOString(), skipped: 'customer_not_found' });
          return;
        }
        const data = snap.data();
        const curFree  = data.free_drink_available || 0;
        const curStamp = data.stamp_count || 0;
        if (curFree > 0) {
          // Trường hợp thường: trừ 1 ly có sẵn (bỏ trần của ly cũ nhất — ly vừa đổi)
          t.update(custRef, {
            free_drink_available: curFree - 1,
            free_drink_caps: _freeCapsSynced(data.free_drink_caps, curFree).slice(1)
          });
        } else if (curStamp >= 6) {
          // Trường hợp stamp chưa convert: convert rồi trừ luôn
          const bonus = Math.floor(curStamp / 6);
          const L = _stampLedgerAdd(data, []);
          t.update(custRef, {
            free_drink_available: bonus - 1, stamp_count: curStamp % 6,
            stamp_prices: L.stamp_prices, free_drink_caps: L.free_drink_caps.slice(1)
          });
        }
        if (markerRef) t.set(markerRef, { phone, at: vnDate().toISOString() });
      });
    }, 3);
  } catch(e) {
    console.warn('[_finalizeStampFreeAfterPay]', e);
    if (billId) {
      fstore.collection('alerts_gieogieo').doc('stampfree_failed_' + billId).set({
        type: 'stampfree_failed', severity: 'danger', status: 'new',
        title: 'Trừ ly miễn phí/stamp thất bại',
        note: 'Bill ' + billId + ' đã hưởng đổi ly miễn phí/stamp cho khách ' + phone + ' nhưng ghi DB trừ thất bại sau nhiều lần thử lại — cần đối soát tay (kiểm tra free_drink_available/stamp_count của khách này).',
        billId, phone, at: vnDate().toISOString()
      }, { merge: true }).catch(() => {});
    }
  } finally {
    _stampFreePhone = null;
    _stampFreeVKey = null;
  }
}

/** Lấy ngày hôm nay dạng 'YYYY-MM-DD' (giờ VN) */
function loyaltyTodayStr() {
  const now = vnDate();
  const y = now.getFullYear();
  const m = String(now.getMonth()+1).padStart(2,'0');
  const d = String(now.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

// ============================================================
// [BUG#29 FIX] LOYALTY LỖI KHÔNG ĐƯỢC "NUỐT" NỮA
//
// TRƯỚC ĐÂY loyaltyAddPoints()/loyaltyAddStamps() bắt mọi lỗi rồi `return 0` / `return {added:0}`
// — không throw. Caller await xong thấy "êm", chạy tiếp và ghi claim side-effect = 'done'. Kể từ
// lúc đó KHÔNG CÒN LƯỢT NÀO chạy lại loyalty cho bill đó nữa (claim 'done' là chặn cuối), nên một
// lần Firestore chập chờn = khách MẤT ĐIỂM/STAMP vĩnh viễn, và không ai biết: không cảnh báo,
// không hàng đợi, chỉ một dòng console.warn trên đúng cái máy đó.
//
// Vì sao KHÔNG chọn cách "throw ra tận confirmPay()": bill đã ghi xong rồi, throw ở đó làm cả
// luồng rơi vào catch "❌ Lỗi lưu đơn — thử lại!" (giỏ không xoá, nhân viên tưởng mất đơn), mà
// bấm lại trong vòng _CHECKOUT_SIDE_EFFECTS_STALE_MS thì claim vẫn 'processing' nên khối
// side-effect bị BỎ QUA hoàn toàn — loyalty vẫn không chạy, lại thêm một lượt hoảng loạn ở quầy.
//
// Nên chọn đúng khuôn mẫu đã dùng cho _finalizeStampFreeAfterPay/GOGS:
//   1) retry vài lần (_ueRetryAsync) thay vì thử đúng một lần rồi thôi;
//   2) thất bại hẳn thì GHI NỢ BỀN VỮNG: hàng đợi localStorage (sống sót cả khi Firestore đang
//      chết — đây mới là tình huống thật) + doc `loyalty_pending_retry_gieogieo` + cảnh báo
//      durable `alerts_gieogieo` cho Quản lý đối soát tay;
//   3) tự chạy lại hàng đợi lúc mở app và định kỳ sau đó (marker theo billId làm việc chạy lại
//      hoàn toàn an toàn — không bao giờ cộng đúp);
//   4) báo cho nhân viên ngay tại quầy biết là "chưa tích được, đã ghi nhận để tích lại".
// Checkout vẫn KHÔNG bị chặn, nhưng quyền lợi của khách không còn biến mất trong im lặng.
// ============================================================
const _LOYALTY_PENDING_LS_KEY = 'pos_loyalty_pending_v1';

function _loyaltyPendingRead() {
  try { const raw = localStorage.getItem(_LOYALTY_PENDING_LS_KEY); const a = raw ? JSON.parse(raw) : []; return Array.isArray(a) ? a : []; }
  catch (e) { return []; }
}

function _loyaltyPendingWrite(arr) {
  try { localStorage.setItem(_LOYALTY_PENDING_LS_KEY, JSON.stringify((arr || []).slice(-50))); } catch (e) {}
}

function _loyaltyPendingDrop(billId, kind) {
  _loyaltyPendingWrite(_loyaltyPendingRead().filter(x => !(x && x.billId === billId && x.kind === kind)));
}

function _loyaltyAlertId(entry) { return 'loyalty_failed_' + entry.kind + '_' + (entry.billId || 'nobill'); }

// Ghi nợ quyền lợi: localStorage TRƯỚC (chắc chắn ghi được), rồi mới thử ghi Firestore.
async function _loyaltyGhiNo(entry, err) {
  const e = Object.assign({ at: vnDate().toISOString() }, entry);
  if (e.billId) {
    const arr = _loyaltyPendingRead().filter(x => !(x && x.billId === e.billId && x.kind === e.kind));
    arr.push(e);
    _loyaltyPendingWrite(arr);
  }
  const moTa = e.kind === 'points'
    ? `tích ${e.billAmount ? 'điểm cho bill ' + Number(e.billAmount).toLocaleString('vi-VN') + 'đ' : 'điểm'}`
    : `tích ${e.drinkCount || 0} stamp`;
  try {
    await fstore.collection('loyalty_pending_retry_gieogieo').doc((e.billId || 'nobill') + '_' + e.kind)
      .set(Object.assign({}, e, { status: 'pending', lastError: String((err && (err.message || err)) || err).slice(0, 300) }), { merge: true });
    await fstore.collection('alerts_gieogieo').doc(_loyaltyAlertId(e)).set({
      type: 'loyalty_failed', severity: 'warn', status: 'new',
      title: 'Chưa tích được điểm/stamp cho khách',
      note: `Bill ${e.billId || '(không rõ)'} · khách ${e.phone}: ${moTa} thất bại sau nhiều lần thử lại (${String((err && (err.message || err)) || err).slice(0, 200)}). Máy POS sẽ tự chạy lại khi có mạng; nếu cảnh báo này vẫn còn thì cộng tay cho khách.`,
      billId: e.billId || null, phone: e.phone, kind: e.kind, at: e.at
    }, { merge: true });
  } catch (e2) {
    // Firestore đang chết thì đây là điều hiển nhiên — hàng đợi localStorage ở trên mới là chỗ
    // giữ chắc, lượt flush sau sẽ ghi lại cả cảnh báo này.
    console.warn('[loyalty] ghi nợ lên Firestore lỗi (đã giữ trong hàng đợi máy này):', e2);
  }
}

// Chạy lại hàng đợi. An toàn tuyệt đối vì loyaltyAddPoints/loyaltyAddStamps idempotent theo
// billId (marker `loyalty_bill_effects_gieogieo/{billId}`): chạy lại 10 lần vẫn cộng đúng 1 lần.
let _loyaltyFlushing = false;

async function loyaltyFlushPending() {
  if (_loyaltyFlushing) return;
  const arr = _loyaltyPendingRead();
  if (!arr.length) return;
  _loyaltyFlushing = true;
  try {
    for (const e of arr) {
      if (!e || !e.phone || !e.billId) { _loyaltyPendingDrop(e && e.billId, e && e.kind); continue; }
      try {
        if (e.kind === 'points') await loyaltyAddPoints(e.phone, Number(e.billAmount) || 0, !!e.isWallet, e.billId, true);
        else await loyaltyAddStamps(e.phone, Number(e.drinkCount) || 0, e.billId, true, e.cupPrices);
      } catch (err) {
        // Vẫn lỗi ⇒ GIỮ NGUYÊN hàng đợi và dừng vòng lặp (mạng đang hỏng, thử tiếp chỉ tốn thời
        // gian). Không bao giờ xoá một món chưa chạy được.
        console.warn('[loyalty] chạy lại hàng đợi chưa được, để dành lượt sau:', err);
        break;
      }
      _loyaltyPendingDrop(e.billId, e.kind);
      fstore.collection('loyalty_pending_retry_gieogieo').doc(e.billId + '_' + e.kind)
        .set({ status: 'done', doneAt: vnDate().toISOString() }, { merge: true }).catch(() => {});
      fstore.collection('alerts_gieogieo').doc(_loyaltyAlertId(e))
        .set({ status: 'resolved', resolvedAt: vnDate().toISOString(), resolveNote: 'POS đã tự tích lại thành công.' }, { merge: true }).catch(() => {});
      console.log('[loyalty] đã tích lại được cho bill', e.billId, e.kind);
    }
  } finally { _loyaltyFlushing = false; }
}

/** Tích điểm Tại quán: 100đ = 5 điểm. Thanh toán Ví: x2 (100đ = 10 điểm).
 * [BUG#21 FIX] TRƯỚC ĐÂY cộng thẳng bằng FieldValue.increment(earned) không theo billId nào — gọi
 * lại hàm này cho ĐÚNG 1 bill (claim side-effect ở #20 giành lại sau khi "hết hạn" trong khi lượt
 * trước thật ra đã chạy xong, hoặc race hiếm khác) sẽ cộng điểm ĐÚP. Giờ dùng transaction với
 * marker `loyalty_bill_effects_gieogieo/{billId}` — đã cộng cho đúng bill này rồi thì no-op. */
async function loyaltyAddPoints(phone, billAmount, isWallet = false, billId, laChayLai) {
  if (!phone || billAmount <= 0) return 0;
  const base   = Math.floor(billAmount / 100) * 5;
  const earned = isWallet ? base * 2 : base;
  if (earned <= 0) return 0;
  try {
    const ref = fstore.collection('customers').doc(phone);
    const markerRef = billId ? fstore.collection('loyalty_bill_effects_gieogieo').doc(billId) : null;
    let actuallyEarned = 0;
    // [BUG#29 FIX] Thử lại vài lần trước khi coi là thất bại (mạng quán hay chập một nhịp).
    await UnitEngine.util.retry(async () => { actuallyEarned = 0; return await fstore.runTransaction(async t => {
      if (markerRef) {
        const mdoc = await t.get(markerRef);
        if (mdoc.exists) return; // đã cộng cho đúng bill này rồi — no-op, tránh cộng đúp
      }
      const snap = await t.get(ref);
      if (!snap.exists) return;
      const cur = Number(snap.data().total_points) || 0;
      t.update(ref, { total_points: cur + earned, lastVisit: vnDate().toISOString() });
      if (markerRef) t.set(markerRef, { phone, kind: 'points', earned, at: vnDate().toISOString() });
      actuallyEarned = earned;
    }); }, 3);
    if (actuallyEarned > 0 && loyaltyCustomer) loyaltyCustomer.total_points = (loyaltyCustomer.total_points || 0) + actuallyEarned;
    return actuallyEarned;
  } catch(e) {
    console.warn('Loyalty points error:', e);
    // [BUG#29 FIX] KHÔNG `return 0` như trước (caller tưởng xong, claim side-effects thành 'done',
    // khách mất điểm vĩnh viễn trong im lặng). Ghi nợ bền vững + THROW để lượt chạy lại/caller
    // biết là chưa tích được.
    if (laChayLai) throw e;             // đang chạy lại từ hàng đợi — giữ nguyên món đó, đừng ghi nợ thêm
    await _loyaltyGhiNo({ kind: 'points', phone, billId: billId || null, billAmount, isWallet }, e);
    throw e;
  }
}

/** Kiểm tra và tích Stamp To Go
 *  - 1 ly = 1 Stamp, max 2 Stamp/ngày/khách
 *  - 6 Stamp = 1 ly miễn phí (tích vào free_drink_available)
 *  Trả về { added, newCount, freeDrink }
 * [BUG#21 FIX] Cùng nguyên tắc với loyaltyAddPoints() — đọc-rồi-update KHÔNG transaction, KHÔNG
 * marker theo billId, nên gọi lại là cộng đúp stamp/ly miễn phí. Giờ transaction + marker
 * `loyalty_bill_effects_gieogieo/{billId}`; nếu marker đã tồn tại thì trả lại ĐÚNG kết quả đã ghi
 * lần trước (không cộng lại, không trả {added:0} sai khiến UI báo nhầm "không tích được gì"). */
// ============================================================
// [TRẦN LY TEM] Tem trước đây chỉ là SỐ ĐẾM → khách mua toàn ly 15K vẫn đổi được ly 35K.
// Giờ mỗi tem ghi kèm GIÁ ly đã tích (customers.stamp_prices, song song stamp_count); đủ 6 tem
// → trần của ly miễn phí = trung bình 6 giá + 3K, ghi vào customers.free_drink_caps (song song
// free_drink_available, ly cũ nhất đứng đầu). Tem / ly cũ không có giá ghi lại (tích trước bản
// này, hoặc app khác tích) → coi tem = 16K, ly miễn phí cũ = trần 19K. Hai mảng luôn được ép về
// đúng độ dài số đếm, nên app khác sửa số đếm cũng không làm lệch.
// ============================================================
const STAMP_LEGACY_PRICE = 16000;

const STAMP_CAP_MARGIN = 3000;

const FREE_DRINK_LEGACY_CAP = STAMP_LEGACY_PRICE + STAMP_CAP_MARGIN;

function _numList(arr) { return Array.isArray(arr) ? arr.map(Number).filter(n => isFinite(n) && n > 0) : []; }

function _stampPricesSynced(arr, count) {
  const a = _numList(arr), n = Math.max(0, count | 0);
  if (a.length >= n) return a.slice(a.length - n);
  return Array(n - a.length).fill(STAMP_LEGACY_PRICE).concat(a);
}

function _freeCapsSynced(arr, n) {
  const a = _numList(arr); n = Math.max(0, n | 0);
  if (a.length >= n) return a.slice(a.length - n);
  return Array(n - a.length).fill(FREE_DRINK_LEGACY_CAP).concat(a);
}

function _capOfSixStamps(six) {
  const a = _stampPricesSynced(six, 6);
  return Math.round(a.reduce((x, y) => x + y, 0) / 6) + STAMP_CAP_MARGIN;
}

// Giá các tem một bill tạo ra: tối đa `canAdd` tem. 1–2 ly → chính các ly đó; 3 ly trở lên → ly
// đắt nhất + ly rẻ nhất; chỉ còn 1 tem trong ngày → lấy ly RẺ nhất (chặt, không cho nâng trần).
function _stampPricesPick(cupPrices, canAdd) {
  const a = _numList(cupPrices).sort((x, y) => x - y);
  if (!a.length) return Array(Math.max(0, canAdd)).fill(STAMP_LEGACY_PRICE);
  let pick;
  if (canAdd >= a.length) pick = a;
  else if (canAdd <= 1) pick = [a[0]];
  else pick = [a[0], a[a.length - 1]];
  while (pick.length < canAdd) pick = pick.concat(STAMP_LEGACY_PRICE);
  return pick.slice(0, canAdd);
}

// Giá từng ly (đơn giá, lặp theo số lượng) của các món được tính tem trong bill.
function stampCupPricesOf(items) {
  const out = [];
  (items || []).forEach(c => {
    if (!c || c.isFree || c._vKey) return;
    for (let i = 0; i < (Number(c.qty) || 0); i++) out.push(Number(c.price) || 0);
  });
  return out;
}

// Sổ tem sau khi cộng `newPrices`: đủ 6 tem thì chốt thành 1 trần ly miễn phí.
function _stampLedgerAdd(data, newPrices) {
  const sp = _stampPricesSynced(data.stamp_prices, data.stamp_count || 0).concat(newPrices || []);
  const caps = _freeCapsSynced(data.free_drink_caps, data.free_drink_available || 0);
  while (sp.length >= 6) caps.push(_capOfSixStamps(sp.splice(0, 6)));
  return { stamp_prices: sp, free_drink_caps: caps };
}

async function loyaltyAddStamps(phone, drinkCount, billId, laChayLai, cupPrices) {
  if (!phone || drinkCount <= 0) return { added: 0, newCount: 0, freeDrink: false };
  try {
    const ref  = fstore.collection('customers').doc(phone);
    const markerRef = billId ? fstore.collection('loyalty_bill_effects_gieogieo').doc(billId) : null;
    let result = { added: 0, newCount: 0, freeDrink: false };
    // [BUG#29 FIX] Thử lại vài lần trước khi coi là thất bại — xem chú thích ở loyaltyAddPoints.
    await UnitEngine.util.retry(async () => { result = { added: 0, newCount: 0, freeDrink: false }; return await fstore.runTransaction(async t => {
      if (markerRef) {
        const mdoc = await t.get(markerRef);
        if (mdoc.exists) {
          const md = mdoc.data();
          result = { added: Number(md.added) || 0, newCount: Number(md.newCount) || 0, freeDrink: !!md.freeDrink };
          return;
        }
      }
      const snap = await t.get(ref);
      if (!snap.exists) return;
      const data = snap.data();

      const today = loyaltyTodayStr();
      const lastDate = data.last_stamp_date || '';
      let stampsToday = (lastDate === today) ? (data.stamps_today || 0) : 0;

      // Tối đa 2 stamp hôm nay
      const canAdd = Math.min(drinkCount, Math.max(0, 2 - stampsToday));
      if (canAdd <= 0) {
        result = { added: 0, newCount: data.stamp_count || 0, freeDrink: false };
        if (markerRef) t.set(markerRef, { phone, kind: 'stamps', added: 0, newCount: result.newCount, freeDrink: false, at: vnDate().toISOString() });
        return;
      }

      const oldStamp = data.stamp_count || 0;
      let newStamp = oldStamp + canAdd;
      let freeDrinkCount = data.free_drink_available || 0;
      let freeDrink = false;

      // Xử lý khi đủ 6 stamp
      while (newStamp >= 6) {
        newStamp -= 6;
        freeDrinkCount += 1;
        freeDrink = true;
      }

      const ledger = _stampLedgerAdd(data, _stampPricesPick(cupPrices, canAdd));
      t.update(ref, {
        stamp_count:          newStamp,
        stamps_today:         stampsToday + canAdd,
        last_stamp_date:      today,
        free_drink_available: freeDrinkCount,
        stamp_prices:         ledger.stamp_prices,
        free_drink_caps:      ledger.free_drink_caps,
        lastVisit:            vnDate().toISOString()
      });
      result = { added: canAdd, newCount: newStamp, freeDrink };
      if (markerRef) t.set(markerRef, { phone, kind: 'stamps', added: canAdd, newCount: newStamp, freeDrink, at: vnDate().toISOString() });
    }); }, 3);
    return result;
  } catch(e) {
    console.warn('Loyalty stamp error:', e);
    // [BUG#29 FIX] Xem chú thích ở loyaltyAddPoints — ghi nợ bền vững rồi throw, KHÔNG trả
    // {added:0} như thể đã xử lý xong.
    if (laChayLai) throw e;
    await _loyaltyGhiNo({ kind: 'stamps', phone, billId: billId || null, drinkCount, cupPrices: cupPrices || null }, e);
    throw e;
  }
}

/** Gọi sau khi thanh toán thành công để tích điểm/stamp.
 * [BUG#21 FIX] Nhận thêm billId, truyền xuống loyaltyAddPoints/loyaltyAddStamps để tự idempotent
 * theo đúng bill — xem chú thích ở 2 hàm đó. Caller giờ PHẢI await hàm này (trước đây bị gọi kiểu
 * fire-and-forget ở confirmPay()/finalizeSplitPay(), khiến claim side-effect có thể coi là "done"
 * trước khi loyalty ghi xong). */
// [F5] Chỉ bán To Go → chỉ tích Stamp. Nhánh tích Point (Tại quán, x2 Ví) đã gỡ; loyaltyAddPoints vẫn
// giữ để hàng đợi cũ (mục kind:'points' còn nợ) chạy nốt — xem loyaltyFlushPending.
async function loyaltyProcessAfterPay(phone, billAmount, itemCount, billId, cupPrices) {
  if (!phone) return;
  let msg = '';
  try {
    const result = await loyaltyAddStamps(phone, itemCount, billId, false, cupPrices);
    if (result.added > 0) {
      msg = `☕ +${result.added} Stamp! Đã có ${result.newCount}/6`;
      if (result.freeDrink) msg += ` 🎉 Chúc mừng! Đã đủ 6 Stamp — 1 Ly MIỄN PHÍ!`;
    } else if (itemCount > 0) {
      msg = `⚠️ Đã đạt 2 Stamp hôm nay — không thể thêm`;
    }
  } catch (err) {
    // [BUG#29 FIX] Hai hàm bên trong giờ THROW khi ghi thất bại (sau khi đã ghi nợ bền vững +
    // cảnh báo Quản lý + xếp vào hàng đợi tự chạy lại). Ở đây chặn lại để KHÔNG làm hỏng luồng
    // thanh toán của bill đã ghi xong, nhưng phải nói rõ cho nhân viên tại quầy biết.
    console.warn('[loyalty] chưa tích được cho bill', billId, err);
    setTimeout(() => toast('⚠️ Chưa tích được điểm/stamp cho khách — đã ghi nhận, máy sẽ tự tích lại khi có mạng'), 800);
    return;
  }
  if (msg) { setTimeout(() => toast(msg), 800); }
  // Tích được cho bill này ⇒ mạng đang tốt: tranh thủ chạy nốt các bill còn nợ (nếu có).
  loyaltyFlushPending().catch(() => {});
}

// ============================================================
// AUTOCOMPLETE PHONE NUMBER — gộp cả Firestore + RTDB
// ============================================================
let allCustomersCache = [];

// [GIẢM-ĐỌC] Danh sách gợi ý SĐT (chỉ để TÌM số — tem / ly miễn phí luôn đọc thẳng doc(sđt) ở
// lookupCustomer). Trước đây đọc TOÀN BỘ `customers` (~1.000 khách, dùng chung 3 thương hiệu)
// 5 giây sau MỖI lần mở app, và mỗi lần gõ SĐT trong lúc lượt tải đầu chưa xong lại đọc thêm
// một lượt toàn bộ. Giờ:
//   · chỉ nạp khi vào màn thanh toán (showScreen('sc')) hoặc gõ SĐT;
//   · lời gọi trùng trong lúc đang tải dùng chung một lượt;
//   · giữ trong máy (localStorage, chỉ 4 trường gợi ý dùng) — làm mới tối đa 1 lần / ngày.
// Gợi ý vẫn lọc trên danh sách đầy đủ như cũ; chỉ số điểm trong dòng gợi ý có thể cũ tối đa 1 ngày.
const CUST_AC_LS = 'custAc_gieogieo_v1';

let _custAcDay = null;

let _custAcLoading = null;

function _custAcSave() {
  try { localStorage.setItem(CUST_AC_LS, JSON.stringify({ day: _custAcDay, list: allCustomersCache })); } catch (e) {}
}

// [GIẢM-ĐỌC · DÙNG CHUNG CẢ CHUỖI] Trước đây MỖI máy POS tự đọc cả bảng `customers` (~1.000 doc) mỗi ngày → thêm quán / máy là
// tăng gấp bội, mà hạn mức đọc dùng chung 3 thương hiệu. Giờ ba tầng, tầng sau chỉ chạy khi tầng trước không có bản của HÔM NAY:
//   1. bản trong máy (localStorage)                       → 0 lượt đọc
//   2. bản dùng chung `customer_ac_cache_gieogieo/current` → 1 lượt đọc (máy nào cũng dùng, mọi quán)
//   3. đọc cả bảng `customers` rồi GHI bản dùng chung       → ~1.000 lượt, chỉ máy đầu tiên của ngày
// Bản dùng chung là MỘT trường chuỗi JSON (không phải mảng doc / mảng map: mỗi trường con bị lập chỉ mục, vài chục nghìn
// khách sẽ chạm trần chỉ mục của doc); quá ~900KB thì không chia sẻ (mỗi máy tự đọc như trước). Lỗi ở tầng 2 → rơi xuống
// tầng 3 như cũ. Hai máy dựng cùng lúc chỉ tốn thêm một lượt đọc, kết quả giống nhau nên ghi đè vô hại.
const CUST_AC_SHARED = 'customer_ac_cache_gieogieo';

const CUST_AC_MAX_BYTES = 900000;

function _custAcPack(list) { return JSON.stringify(list.map(c => [c.id, c.name || '', c.nickname || '', Number(c.total_points) || 0])); }

function _custAcUnpack(json) {
  const a = JSON.parse(json);
  if (!Array.isArray(a)) throw new Error('bản dùng chung hỏng');
  return a.map(r => ({ id: r[0], _src: 'fs', name: r[1] || undefined, nickname: r[2] || undefined, total_points: r[3] || 0 }));
}

function fetchAllCustomersCache() {
  const today = posDateKey();
  if (_custAcDay === today || _custAcLoading) return;
  let c = null;
  try { c = JSON.parse(localStorage.getItem(CUST_AC_LS) || 'null'); } catch (e) {}
  if (c && Array.isArray(c.list)) {
    if (!allCustomersCache.length) allCustomersCache = c.list;   // bản hôm trước vẫn gợi ý được trong lúc tải bản mới
    if (c.day === today) { _custAcDay = today; return; }
  }
  const dungBan = list => {
    allCustomersCache = list.slice().sort((a, b) => (b.total_points || 0) - (a.total_points || 0));
    _custAcDay = today;
    _custAcSave();
  };
  const docChung = fstore.collection(CUST_AC_SHARED).doc('current');
  _custAcLoading = docChung.get()
    .then(d => {
      const v = d && d.exists ? d.data() : null;
      if (!v || v.day !== today || typeof v.json !== 'string') return false;   // chưa có bản hôm nay → dựng
      dungBan(_custAcUnpack(v.json));
      return true;
    })
    .catch(err => { console.warn('[gợi ý SĐT] không đọc được bản dùng chung — đọc cả bảng như cũ:', err); return false; })
    .then(xong => {
      if (xong) return;
      return fstore.collection('customers').get().then(snap => {
        const list = [];
        snap.forEach(doc => { const d = doc.data() || {}; list.push({ id: doc.id, _src: 'fs', nickname: d.nickname, name: d.name, total_points: d.total_points }); });
        dungBan(list);
        // Chia sẻ cho các máy khác (lỗi ghi không ảnh hưởng máy này).
        try {
          const json = _custAcPack(allCustomersCache);
          const bytes = new TextEncoder().encode(json).length;   // giới hạn doc Firestore tính theo BYTE (tiếng Việt có dấu 2–3 byte / ký tự)
          if (bytes < CUST_AC_MAX_BYTES) docChung.set({ day: today, count: allCustomersCache.length, json, builtAt: vnDate().toISOString() }).catch(e => console.warn('[gợi ý SĐT] không ghi được bản dùng chung:', e));
          else console.warn('[gợi ý SĐT] danh sách khách quá lớn để chia sẻ (' + bytes + ' byte) — mỗi máy tự đọc');
        } catch (e) { console.warn('[gợi ý SĐT] không đóng gói được bản dùng chung:', e); }
      });
    })
    .catch(err => console.error('Cache error', err))
    .then(() => { _custAcLoading = null; });
}

function onPhoneInput(val) {
  const ac = document.getElementById('phone-autocomplete');
  if (!ac) return;

  // Loại bỏ ký tự không phải số, normalize 84xxxxxxxxx → 0xxxxxxxxx
  let cleanVal = val.replace(/[^0-9]/g, '');
  if (/^84\d{9}$/.test(cleanVal)) cleanVal = '0' + cleanVal.slice(2);
  document.getElementById('cuph').value = cleanVal;

  // Load nếu chưa từng load
  if (allCustomersCache.length === 0) fetchAllCustomersCache();

  if (cleanVal.length === 10) { lookupCustomer(); }
  if (cleanVal.length < 6)   {
    // [FIX-freeTp-confirmBeforeClear] Đi qua điểm xác nhận chung thay vì xoá thẳng.
    requestClearCustomer();
  } else {
    _phoneClearPending = false; // đang gõ lại số hợp lệ → huỷ trạng thái chờ xác nhận cũ (nếu có)
  }

  if (cleanVal.length >= 3) {
    // [Bảo mật] `customers` dùng chung với XOFA: chỉ nhận id toàn chữ số (SĐT) — id lạ không bao giờ lọt vào onclick/HTML.
    const matches = allCustomersCache.filter(c => /^\d+$/.test(String(c.id)) &&
      (c.id.startsWith(cleanVal) || c.id.includes(cleanVal)));
    if (matches.length > 0) {
      ac.innerHTML = matches.slice(0, 8).map(c => {
        const displayName = escHtmlPos(c.nickname || c.name || 'Khách hàng');   // [Bảo mật] tên khách do bên ngoài nhập — luôn lọc ký tự HTML
        const pts         = c.total_points || 0;
        const srcBadge    = '';
        const hlPhone = c.id.replace(
          new RegExp('(' + cleanVal + ')'),
          '<span style="color:var(--gm);font-weight:900;">$1</span>'
        );
        return `
        <div onclick="selectPhone('${c.id}')"
             style="padding:14px 18px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;justify-content:space-between;cursor:pointer;transition:background .15s;"
             onmousedown="this.style.background='#f5f5f5'" onmouseup="this.style.background='#fff'"
             ontouchstart="this.style.background='#f5f5f5'" ontouchend="this.style.background='#fff'">
          <div style="display:flex;flex-direction:column;gap:3px;min-width:0;">
            <div style="font-size:17px;font-weight:700;color:var(--td);">${hlPhone}</div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span style="font-size:13px;color:var(--gt);">${displayName}</span>
              ${srcBadge}
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0;margin-left:8px;">
            <div style="font-size:14px;color:var(--gm);font-weight:700;">⭐ ${Number(pts).toLocaleString('vi-VN')}</div>
          </div>
        </div>`;
      }).join('');
      ac.style.display = 'block';
      return;
    }
  }
  ac.style.display = 'none';
  ac.innerHTML = '';
}

function selectPhone(phone) {
  document.getElementById('cuph').value = phone;
  document.getElementById('phone-autocomplete').style.display = 'none';
  // Tự động nhấn nút Tìm
  lookupCustomer();
}

// ============================================================
// CUSTOMER LIST TAB — Infinite scroll + Search by phone
// ============================================================
const CUST_PAGE_SIZE = 50;

let _custAllDocs = [];

let _custFiltered = [];

let _custRenderedCount = 0;

let _custLoaded = false;

let _custSearchTimer = null;

function loadCustomerList() {
  const container = document.getElementById('customer-list-container');
  if (!container) return;
  _custAllDocs = [];
  _custFiltered = [];
  _custRenderedCount = 0;
  _custLoaded = false;
  const searchInput = document.getElementById('cust-search-input');
  if (searchInput) searchInput.value = '';
  const clearBtn = document.getElementById('cust-search-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  _updateCustCountLabel(null);
  showLoading(container);
  _custFetchAll();
}

function _custFetchAll(lastDoc) {
  let q = fstore.collection('customers').orderBy('total_points', 'desc').limit(200);
  if (lastDoc) q = q.startAfter(lastDoc);
  q.get().then(snap => {
    snap.forEach(doc => _custAllDocs.push(doc));
    if (snap.size === 200) {
      _custFetchAll(snap.docs[snap.docs.length - 1]);
    } else {
      _custLoaded = true;
      _custFiltered = [..._custAllDocs];
      _custRenderedCount = 0;
      _updateCustCountLabel(_custFiltered.length);
      _custRenderNextPage(true);
    }
  }).catch(err => {
    const container = document.getElementById('customer-list-container');
    if (container) container.innerHTML = `<div style="text-align:center;color:#e74c3c;margin-top:50px;">Lỗi tải dữ liệu: ${err.message}</div>`;
  });
}

function _custRenderNextPage(reset) {
  const container = document.getElementById('customer-list-container');
  if (!container) return;
  if (reset) { container.innerHTML = ''; _custRenderedCount = 0; }
  if (!_custFiltered.length) {
    container.innerHTML = '<div style="text-align:center;color:#bbb;margin-top:50px;font-size:14px;font-weight:600;">Không tìm thấy khách hàng nào</div>';
    return;
  }
  const slice = _custFiltered.slice(_custRenderedCount, _custRenderedCount + CUST_PAGE_SIZE);
  if (!slice.length) return;
  const oldSentinel = document.getElementById('cust-scroll-sentinel');
  if (oldSentinel) oldSentinel.remove();
  const oldEnd = document.getElementById('cust-list-end');
  if (oldEnd) oldEnd.remove();
  slice.forEach(doc => {
    const d = doc.data();
    const phone = doc.id;
    const nick = escHtmlPos(d.nickname || d.name || 'Khách hàng');   // [Bảo mật] xem onPhoneInput
    const pts = Number(d.total_points || 0).toLocaleString('vi-VN');
    const stamps = Number(d.stamp_count || 0);
    const free = Number(d.free_drink_available || 0);
    const lastVisit = d.lastVisit ? vnDate(d.lastVisit).toLocaleDateString('vi-VN') : '';
    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:18px;padding:16px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 2px 8px rgba(0,0,0,0.03);margin-bottom:10px;';
    card.innerHTML = `
      <div style="min-width:0;flex:1;margin-right:10px;">
        <div style="font-size:16px;font-weight:700;color:var(--td);margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${nick}</div>
        <div style="font-size:13px;color:var(--gt);font-weight:600;">${escHtmlPos(phone)}</div>
        ${lastVisit ? `<div style="font-size:11px;color:#bbb;margin-top:2px;">Lần cuối: ${lastVisit}</div>` : ''}
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-size:14px;font-weight:700;color:var(--gm);margin-bottom:4px;">⭐ ${pts}</div>
        <div style="font-size:12px;font-weight:700;color:#c8820a;">☕ ${stamps}/6${free > 0 ? ` · 🎁 ${free}` : ''}</div>
      </div>`;
    container.appendChild(card);
  });
  _custRenderedCount += slice.length;
  if (_custRenderedCount < _custFiltered.length) {
    const sentinel = document.createElement('div');
    sentinel.id = 'cust-scroll-sentinel';
    sentinel.style.cssText = 'text-align:center;padding:16px 0 8px;color:#bbb;font-size:13px;font-weight:600;';
    sentinel.textContent = `Đang tải thêm... (${_custRenderedCount}/${_custFiltered.length})`;
    container.appendChild(sentinel);
  } else {
    const end = document.createElement('div');
    end.id = 'cust-list-end';
    end.style.cssText = 'text-align:center;padding:20px 0 100px;color:#ddd;font-size:12px;';
    end.textContent = `— Đã hiển thị tất cả ${_custFiltered.length} khách hàng —`;
    container.appendChild(end);
  }
}

function onCustListScroll(el) {
  if (!_custLoaded || _custRenderedCount >= _custFiltered.length) return;
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 150) _custRenderNextPage(false);
}

function onCustSearchInput(val) {
  clearTimeout(_custSearchTimer);
  const clearBtn = document.getElementById('cust-search-clear');
  if (clearBtn) clearBtn.style.display = val ? 'block' : 'none';
  _custSearchTimer = setTimeout(() => _custApplySearch(val), 250);
}

function _custApplySearch(val) {
  if (!_custLoaded) return;
  const q = val.trim().replace(/[^0-9]/g, '');
  _custFiltered = q ? _custAllDocs.filter(doc => doc.id.includes(q)) : [..._custAllDocs];
  _custRenderedCount = 0;
  _updateCustCountLabel(_custFiltered.length);
  _custRenderNextPage(true);
}

function clearCustSearch() {
  const input = document.getElementById('cust-search-input');
  if (input) { input.value = ''; input.focus(); }
  const clearBtn = document.getElementById('cust-search-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  _custApplySearch('');
}

function _updateCustCountLabel(count) {
  const el = document.getElementById('cust-count-label');
  if (!el) return;
  el.textContent = count === null ? '' : count > 0 ? `${count.toLocaleString('vi-VN')} khách hàng` : 'Không tìm thấy';
}

PosGieoMods.customers = true;
