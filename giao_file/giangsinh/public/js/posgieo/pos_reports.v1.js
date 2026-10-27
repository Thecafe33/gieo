// Tách từ posgieo.html dòng 8727–9246 (tools/tach_posgieo/chuyen.js, 2026-10-27). ĐÃ PHÁT HÀNH thì KHÔNG sửa nội dung —
// tạo pos_reports.v2.js và trỏ HTML tới (sổ tools/js_da_phat_hanh.json). Nạp TRƯỚC <script> chính; CHỈ khai báo.
(window.PosGieoMods = window.PosGieoMods || {}).reports = 'dang';

// ============================================================
// REVENUE
// ============================================================
function todayKey() { const n = vnDate(), p = x => String(x).padStart(2, '0'); return `${p(n.getDate())}/${p(n.getMonth()+1)}/${n.getFullYear()}`; }

/** Trả về Date là thứ 2 đầu tuần hiện tại (00:00:00) */
function weekStart() {
  const d = vnDate(); d.setHours(0,0,0,0);
  const day = d.getDay(); // 0=CN, 1=T2 ... 6=T7
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

function openDatePicker() {
  const n = vnDate(), p2 = x => String(x).padStart(2, '0');
  const today = `${n.getFullYear()}-${p2(n.getMonth() + 1)}-${p2(n.getDate())}`;   // ngày theo giờ máy (không dùng UTC: 0–7h sáng VN sẽ lệch về hôm trước)
  document.getElementById('dpFrom').value = today;
  document.getElementById('dpTo').value = today;
  document.getElementById('datePopup').classList.add('show');
}

function closeDatePicker() {
  document.getElementById('datePopup').classList.remove('show');
}

function applyDateFilter() {
  const from = document.getElementById('dpFrom').value;
  const to   = document.getElementById('dpTo').value;
  if (!from || !to) return;
  _rvFrom = from; _rvTo = to;
  closeDatePicker();
  const fmt2 = s => { const [y,m,d]=s.split('-'); return `${d}/${m}/${y}`; };
  document.getElementById('rv-date-label').textContent =
    from === to ? `📅 Ngày ${fmt2(from)}` : `📅 ${fmt2(from)} → ${fmt2(to)}`;

  const fromDate = vnDate(from);
  const toDate   = vnDate(to);
  toDate.setHours(23,59,59,999);

  loadArchiveDates(archiveDatesInRange(fromDate, toDate)).then(() => {
    updRv();
    drawChart('custom');
  });
}

function _ordersInRange(from, to) {
  // from/to: 'YYYY-MM-DD'
  const f = from ? vnDate(from) : null;
  const t = to   ? vnDate(to)   : null;
  if (t) t.setHours(23,59,59,999);
  return orders.filter(o => {
    const [d,m,y] = o.date.split('/');
    const od = vnDate(+y, +m-1, +d);
    if (f && od < f) return false;
    if (t && od > t) return false;
    return true;
  });
}

function updRv(filtered) {
  const list = filtered || (_rvFrom ? _ordersInRange(_rvFrom, _rvTo) : orders.filter(o => o.date === todayKey()));

  let cash = 0, bank = 0;
  let foodCash = 0, foodBank = 0;

  list.forEach(o => {
    const beforeFoodCash=foodCash,beforeFoodBank=foodBank;
    const ft = o.foodTotal || 0;
    const fMethod = o.foodMethod || o.method;
    // Food revenue breakdown
    if (ft > 0) {
      if (fMethod === 'TIỀN MẶT') foodCash += ft;
      else if (fMethod === 'CHUYỂN KHOẢN') foodBank += ft;
      else { // TÍNH RIÊNG hoặc ví — chia theo splitGroups nếu có, else cash
        if (o.splitGroups && o.splitGroups.length) {
          // Heuristic: phân chia food theo tỉ lệ cash/bank của splitGroups
          const sgCash = o.splitGroups.filter(g => g.method === 'TIỀN MẶT').reduce((s,g) => s+(g.total||0),0);
          const sgBank = o.splitGroups.filter(g => g.method === 'CHUYỂN KHOẢN').reduce((s,g) => s+(g.total||0),0);
          const sgTot = sgCash + sgBank || 1;
          foodCash += Math.round(ft * sgCash / sgTot);
          foodBank += Math.round(ft * sgBank / sgTot);
        } else {
          foodCash += ft;
        }
      }
    }

    // Net revenue (excluding food)
    const netAmt = ft > 0 ? (o.total - ft) : o.total;
    if (o.addons && o.addons.length) {
      cash += orderCashAmountPOS(o) - (foodCash-beforeFoodCash);
      bank += orderBankAmountPOS(o) - (foodBank-beforeFoodBank);
    } else if (o.method === 'TIỀN MẶT') {
      cash += netAmt;
    } else if (o.method === 'CHUYỂN KHOẢN') {
      bank += netAmt;
    } else if (o.method === 'TÍNH RIÊNG' && o.splitGroups && o.splitGroups.length) {
      o.splitGroups.forEach(g => {
        const ratio = o.total > 0 ? (netAmt / o.total) : 1;
        if (g.method === 'TIỀN MẶT') cash += Math.round((g.total || 0) * ratio);
        else if (g.method === 'CHUYỂN KHOẢN') bank += Math.round((g.total || 0) * ratio);
      });
    } else {
      cash += netAmt;
    }
  });

  const foodTotal = foodCash + foodBank;
  const total = list.reduce((a,o) => a + (o.total - (o.foodTotal||0)), 0);

  document.getElementById('rv-cash').textContent    = cash.toLocaleString('vi-VN');
  document.getElementById('rv-bank').textContent    = bank.toLocaleString('vi-VN');
  document.getElementById('rvtb').textContent       = fmt(total);

  // Cập nhật vùng Food riêng
  const foodSec = document.getElementById('rv-food-section');
  if (foodSec) {
    document.getElementById('rv-food-total').textContent = fmt(foodTotal);
    document.getElementById('rv-food-cash').textContent  = foodCash.toLocaleString('vi-VN');
    document.getElementById('rv-food-bank').textContent  = foodBank.toLocaleString('vi-VN');
    foodSec.style.display = foodTotal > 0 ? 'block' : 'none';
  }
  _updShipStats();
}

function _updShipStats() {
  const now = vnDate();
  const p2 = x => String(x).padStart(2,'0');
  const todayKey_  = `${p2(now.getDate())}/${p2(now.getMonth()+1)}/${now.getFullYear()}`;
  const yd = vnDate(now); yd.setDate(yd.getDate()-1);
  const yestKey = `${p2(yd.getDate())}/${p2(yd.getMonth()+1)}/${yd.getFullYear()}`;
  const weekMon = weekStart ? weekStart() : vnDate(now.setDate(now.getDate() - now.getDay() + 1));
  const now2 = vnDate();
  const mm = p2(now2.getMonth()+1), yyyy = String(now2.getFullYear());
  const shipOrders = orders.filter(o => o.isShip === true);
  const todayCnt = shipOrders.filter(o => o.date === todayKey_).length;
  const yesterdayCnt = shipOrders.filter(o => o.date === yestKey).length;
  const weekCnt = shipOrders.filter(o => {
    const [d,m,y] = o.date.split('/');
    return vnDate(+y,+m-1,+d) >= weekMon;
  }).length;
  const monthOrders = shipOrders.filter(o => {
    const parts = o.date.split('/');
    return parts[1] === mm && parts[2] === yyyy;
  });
  const monthCnt = monthOrders.length;
  const monthRevenue = monthOrders.reduce((s,o) => s + (o.total||0), 0);
  const el = id => document.getElementById(id);
  if (el('rv-ship-today'))         el('rv-ship-today').textContent = todayCnt;
  if (el('rv-ship-yesterday'))     el('rv-ship-yesterday').textContent = yesterdayCnt;
  if (el('rv-ship-week'))          el('rv-ship-week').textContent = weekCnt;
  if (el('rv-ship-month'))         el('rv-ship-month').textContent = monthCnt;
  if (el('rv-ship-month-revenue')) el('rv-ship-month-revenue').textContent = fmt(monthRevenue);
}

function setTab(btn, period) {
  document.querySelectorAll('.tbb').forEach(b => b.classList.remove('active')); btn.classList.add('active');
  _rvFrom = null; _rvTo = null;
  const now = vnDate();
  const p2 = x => String(x).padStart(2,'0');

  // Gán label ngày tháng cho từng tab
  if (period === 'today') {
    document.getElementById('rv-date-label').textContent = `Hôm nay: ${p2(now.getDate())}/${p2(now.getMonth()+1)}/${now.getFullYear()}`;
  } else if (period === 'week') {
    const fromW = weekStart();
    document.getElementById('rv-date-label').textContent = `Tuần này: ${p2(fromW.getDate())}/${p2(fromW.getMonth()+1)} – ${p2(now.getDate())}/${p2(now.getMonth()+1)}`;
  } else if (period === 'month') {
    document.getElementById('rv-date-label').textContent = `Tháng ${now.getMonth()+1}/${now.getFullYear()}`;
  } else {
    document.getElementById('rv-date-label').textContent = `Năm ${now.getFullYear()}`;
  }

  const render = () => {
    let filtered;
    if (period === 'today') {
      filtered = orders.filter(o => o.date === todayKey());
    } else if (period === 'week') {
      const cutoff = weekStart();
      filtered = orders.filter(o => { const [d,m,y]=o.date.split('/'); return vnDate(+y,+m-1,+d) >= cutoff; });
    } else if (period === 'month') {
      const mm = String(now.getMonth()+1).padStart(2,'0'), yyyy = now.getFullYear();
      filtered = orders.filter(o => o.date.slice(3,10) === `${mm}/${yyyy}`);
    } else {
      const yyyy = String(now.getFullYear());
      filtered = orders.filter(o => o.date.endsWith(yyyy));
    }
    updRv(filtered);
    drawChart(period, filtered);
  };

  if (period === 'today') {
    render();
  } else if (period === 'week') {
    const from = weekStart();
    loadArchiveDates(archiveDatesInRange(from, now)).then(render);
  } else if (period === 'month') {
    const from = vnDate(now.getFullYear(), now.getMonth(), 1);
    loadArchiveDates(archiveDatesInRange(from, now)).then(render);
  } else { // year
    const from = vnDate(now.getFullYear(), 0, 1);
    loadArchiveDates(archiveDatesInRange(from, now)).then(render);
  }
}

// ============================================================
// ITEM RANKING
// ============================================================
function openItemRanking() {
  showScreen('rv-items');
  const activeTab = document.querySelector('#rv .tbb.active');
  let period = 'today';
  if (activeTab) {
    const txt = activeTab.textContent.trim();
    if (txt === 'TUẦN') period = 'week';
    else if (txt === 'THÁNG') period = 'month';
    else if (txt === 'NĂM') period = 'year';
  }
  document.querySelectorAll('#rv-items-tabs .tbb').forEach(b => {
    b.classList.toggle('active', b.getAttribute('onclick').includes("'" + period + "'"));
  });
  renderItemRanking(period);
}

function setItemTab(btn, period) {
  document.querySelectorAll('#rv-items-tabs .tbb').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderItemRanking(period);
}

function renderItemRanking(period) {
  const now = vnDate();
  const p2 = x => String(x).padStart(2,'0');
  const lbl = document.getElementById('rv-items-date-label');
  const doLoad = (from, labelTxt, filterFn) => {
    lbl.textContent = labelTxt;
    const doRender = () => _doRenderItemRanking(orders.filter(filterFn));
    if (period === 'today') { doRender(); }
    else {
      showLoading(document.getElementById('rv-items-list'));
      loadArchiveDates(archiveDatesInRange(from, now)).then(doRender);
    }
  };

  if (period === 'today') {
    doLoad(null, 'Hôm nay: ' + p2(now.getDate()) + '/' + p2(now.getMonth()+1) + '/' + now.getFullYear(),
      o => o.date === todayKey());
  } else if (period === 'week') {
    const from = weekStart();
    doLoad(from, 'Tuần này: ' + p2(from.getDate()) + '/' + p2(from.getMonth()+1) + ' – ' + p2(now.getDate()) + '/' + p2(now.getMonth()+1),
      o => { const [d,m,y]=o.date.split('/'); return vnDate(+y,+m-1,+d) >= from; });
  } else if (period === 'month') {
    const mm = String(now.getMonth()+1).padStart(2,'0'), yyyy = now.getFullYear();
    const from = vnDate(yyyy, now.getMonth(), 1);
    doLoad(from, 'Tháng ' + (now.getMonth()+1) + '/' + yyyy,
      o => o.date.slice(3,10) === mm + '/' + yyyy);
  } else {
    const yyyy = String(now.getFullYear());
    const from = vnDate(now.getFullYear(), 0, 1);
    doLoad(from, 'Năm ' + yyyy, o => o.date.endsWith(yyyy));
  }
}

function _doRenderItemRanking(filteredOrders) {
  const container = document.getElementById('rv-items-list');
  const map = {};
  filteredOrders.forEach(o => {
    (o.items || []).forEach(it => {
      if (!it || !it.name) return;
      const key = it.name + (it.size ? '|' + it.size : '');
      if (!map[key]) map[key] = { name: it.name, size: it.size || '', qty: 0, total: 0 };
      const toppingSum = tpSum(it.toppings);
      map[key].qty += (it.qty || 1);
      map[key].total += (it.price + toppingSum) * (it.qty || 1);
    });
  });

  const ranked = Object.values(map).sort((a, b) => b.total - a.total);
  if (!ranked.length) {
    container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#bbb;font-size:14px;font-weight:600;">Không có dữ liệu trong khoảng thời gian này</div>';
    return;
  }

  const maxTotal = ranked[0].total;
  const medals = ['🥇','🥈','🥉'];
  container.innerHTML = ranked.map((item, i) => {
    const pct = maxTotal > 0 ? (item.total / maxTotal * 100) : 0;
    const badge = i < 3
      ? '<span style="font-size:22px;line-height:1;flex-shrink:0;">' + medals[i] + '</span>'
      : '<span style="width:28px;height:28px;background:#f0f0f0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#999;flex-shrink:0;">' + (i+1) + '</span>';
    const sizeTag = item.size
      ? '<span style="font-size:10px;background:var(--gl);color:var(--gd);border-radius:6px;padding:2px 7px;font-weight:700;margin-left:6px;">' + item.size + '</span>'
      : '';
    const barColor = i === 0 ? 'var(--gm)' : i === 1 ? '#60b07a' : '#9ecfad';
    return '<div style="background:#fff;border-radius:18px;padding:16px 18px;">'
      + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">'
      + badge
      + '<div style="flex:1;min-width:0;"><div style="font-size:14px;font-weight:700;color:var(--td);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + item.name + sizeTag + '</div></div>'
      + '<div style="text-align:right;flex-shrink:0;">'
      + '<div style="font-size:15px;font-weight:700;color:var(--gd);">' + item.total.toLocaleString('vi-VN') + ' đ</div>'
      + '<div style="font-size:11px;color:var(--gt);font-weight:600;">× ' + item.qty + ' phần</div>'
      + '</div></div>'
      + '<div style="background:#f0f0f0;border-radius:99px;height:5px;overflow:hidden;">'
      + '<div style="width:' + pct.toFixed(1) + '%;height:100%;background:' + barColor + ';border-radius:99px;"></div>'
      + '</div></div>';
  }).join('');
}

function drawChart(period, filteredOrders) {
  const _orders = filteredOrders || orders;
  const canvas = document.getElementById('rvc2'); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 360, H = 180;
  canvas.width = W * devicePixelRatio; canvas.height = H * devicePixelRatio; ctx.scale(devicePixelRatio, devicePixelRatio);
  canvas.style.height = H + 'px';

  const pl = 28, pr = 8, pt = 20, pb = 36;
  const cW = W - pl - pr, cH = H - pt - pb;
  const now = vnDate();

  // Helper: net revenue of an order (excluding food)
  const netRv = o => o.total - (o.foodTotal || 0);

  let hd, labels;
  if (!period || period === 'today') {
    // 12 khung 2 giờ trong ngày
    hd = Array(12).fill(0);
    const tk = todayKey();
    _orders.filter(o => o.date === tk).forEach(o => {
      const h = parseInt(o.time.split(':')[0]);
      hd[Math.min(Math.floor(h / 2), 11)] += netRv(o);
    });
    labels = ['0H','2H','4H','6H','8H','10H','12H','14H','16H','18H','20H','22H'];
  } else if (period === 'week') {
    // Thứ 2 → Chủ Nhật của tuần hiện tại
    const mon = weekStart();
    const dayLabels = ['T2','T3','T4','T5','T6','T7','CN'];
    hd = Array(7).fill(0);
    labels = [];
    for (let i = 0; i < 7; i++) {
      const d = vnDate(mon); d.setDate(mon.getDate() + i);
      const key = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      hd[i] = _orders.filter(o => o.date === key).reduce((a, o) => a + netRv(o), 0);
      labels.push(dayLabels[i]);
    }
  } else if (period === 'month') {
    // Các tuần trong tháng
    const daysInMonth = vnDate(now.getFullYear(), now.getMonth()+1, 0).getDate();
    const weeks = Math.ceil(daysInMonth / 7);
    hd = Array(weeks).fill(0); labels = [];
    const mm = String(now.getMonth()+1).padStart(2,'0'), yyyy = now.getFullYear();
    _orders.filter(o => o.date.slice(3,10) === `${mm}/${yyyy}`).forEach(o => {
      const day = parseInt(o.date.split('/')[0]);
      const wi = Math.min(Math.floor((day - 1) / 7), weeks - 1);
      hd[wi] += netRv(o);
    });
    for (let i = 0; i < weeks; i++) labels.push(`T${i+1}`);
  } else if (period === 'year') {
    hd = Array(12).fill(0);
    const yyyy = String(now.getFullYear());
    _orders.filter(o => o.date.endsWith(yyyy)).forEach(o => {
      const m = parseInt(o.date.split('/')[1]) - 1;
      hd[m] += netRv(o);
    });
    labels = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'];
  } else {
    // custom date range — nhóm theo ngày
    const byDate = {};
    _orders.forEach(o => { byDate[o.date] = (byDate[o.date]||0) + netRv(o); });
    const keys = Object.keys(byDate).sort((a,b)=>{
      const [da,ma,ya]=a.split('/'), [db,mb,yb]=b.split('/');
      return vnDate(+ya,+ma-1,+da) - vnDate(+yb,+mb-1,+db);
    });
    hd = keys.map(k => byDate[k]);
    labels = keys.map(k => k.slice(0,5));
  }

  const n = hd.length, bw = cW / n, max = Math.max(...hd, 1);
  ctx.clearRect(0, 0, W, H);

  // Gridlines
  ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = pt + (cH / 3) * i;
    ctx.beginPath(); ctx.moveTo(pl, y); ctx.lineTo(W - pr, y); ctx.stroke();
  }

  // Bars
  hd.forEach((v, i) => {
    if (!v) return;
    const bh = (v / max) * cH, x = pl + i * bw + bw * .1, bwA = bw * .8;
    const y = pt + cH - bh, r = Math.min(4, bh / 2);
    ctx.fillStyle = v === Math.max(...hd) ? '#C22B49' : '#b8d8b8';
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + bwA - r, y);
    ctx.quadraticCurveTo(x + bwA, y, x + bwA, y + r);
    ctx.lineTo(x + bwA, y + bh); ctx.lineTo(x, y + bh);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath(); ctx.fill();
    if (bh > 14) {
      ctx.fillStyle = '#444'; ctx.font = `bold 9px "Google Sans",sans-serif`;
      ctx.textAlign = 'center'; ctx.fillText(fmtK(v), x + bwA / 2, y - 4);
    }
  });

  // Labels
  ctx.fillStyle = '#aaa'; ctx.font = `9px "Google Sans",sans-serif`; ctx.textAlign = 'center';
  labels.forEach((l, i) => ctx.fillText(l, pl + i * bw + bw / 2, pt + cH + 20));
}

// ============================================================
// HISTORY
// ============================================================
function renderH(f = '') {
  const list = document.getElementById('hl'), fl = f.toLowerCase().trim();
  // [NEW-GUARD Lớp 2] KHÔNG gõ gì → chỉ hiện đơn trong HISTORY_VISIBLE_MIN phút
  // gần nhất. Vì sao: một danh sách đầy đủ là thứ cộng tay ra được doanh thu
  // ngày — đúng con số đã cố ý giấu khỏi POS.
  //
  // Có gõ thì tra được cả đơn cũ, nhưng theo LUẬT KHÁC HẲN đơn mới:
  //
  //   Đơn còn trong 60 phút — tìm lỏng như cũ (khớp một phần mã / SĐT / số tiền).
  //     Chúng vốn đã hiện sẵn, tìm chỉ để lọc cho nhanh, không lộ thêm gì.
  //
  //   Đơn cũ hơn — chỉ khớp ĐÚNG VÀ ĐỦ: nguyên mã bill, hoặc đủ số điện thoại.
  //     Tìm lỏng trên đơn cũ chính là một lỗ thủng bằng cả lớp chặn này: mã bill
  //     có dạng "#40-07.09.26" nên phần ngày GIỐNG NHAU ở mọi bill trong ngày —
  //     gõ ".09." là ra sạch danh sách. Số tiền cũng vậy, gõ "000" khớp gần hết.
  //     Ba phím là vượt lớp chặn.
  //
  // Tra đúng một đơn (khách quay lại hỏi bill) thì vẫn làm được như thường; cái
  // không làm được là quét ra một danh sách để cộng.
  const timKiem = fl.length >= 3;
  const chuMa  = x => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const chuSo  = x => String(x || '').replace(/\D/g, '');
  const maTim = chuMa(fl), sdtTim = chuSo(fl);

  const khopMoi = o =>
    o.total.toString().includes(fl) ||
    (o.phone && o.phone.includes(fl)) ||
    (o.billCode && String(o.billCode).toLowerCase().includes(fl)) ||
    String(o.id).includes(fl);

  // Bỏ dấu chấm/gạch/thăng hai bên rồi so bằng: nhân viên gõ "40-07.09.26" hay
  // "4007092 6" đều ra đúng một bill, nhưng không có cách nào gõ ra nhiều bill.
  const khopCu = o =>
    (maTim.length >= 4 && chuMa(o.billCode) === maTim) ||
    (sdtTim.length >= 9 && chuSo(o.phone) === sdtTim) ||
    (fl.length >= 15 && String(o.id).toLowerCase() === fl);

  const filtered = timKiem
    ? orders.filter(o => (billIsFresh(o) ? khopMoi(o) : khopCu(o)))
    : orders.filter(billIsFresh);
  if (!filtered.length) {
    // Chỉ khi tìm KHÔNG RA mới nói luật tra đơn cũ — lúc đó nhân viên đang thật
    // sự cần nó. Không treo sẵn một dòng hướng dẫn ở đầu danh sách: dòng đó vừa
    // chỉ luôn đường lách, vừa (nếu kèm số đơn đang ẩn) tự khai ra số bill của
    // ngày, mà số bill × giá trung bình chính là doanh thu — thứ lớp này giấu.
    list.innerHTML = `<div style="text-align:center;padding:40px 26px;color:#bbb;line-height:1.6">${timKiem
      ? 'Không tìm thấy đơn nào khớp.<br><span style="font-size:12.5px">Đơn cũ hơn ' + HISTORY_VISIBLE_MIN + ' phút phải gõ <b>đúng mã bill</b> hoặc <b>đủ số điện thoại</b>.</span>'
      : 'Chưa có đơn nào trong ' + HISTORY_VISIBLE_MIN + ' phút gần đây'}</div>`;
    return;
  }
  const grp = {}; filtered.forEach(o => { if (!grp[o.date]) grp[o.date] = []; grp[o.date].push(o); });
  list.innerHTML = Object.keys(grp).map(d =>
    `<div class="hdg"><div class="hdl">${d}</div>${grp[d].map(o => {
      const isShipOrder = o.isShip === true;
      const isAppOrder  = o.isAppSale === true;
      // Bill "TÍNH RIÊNG" — một bill tách nhiều nhóm thanh toán khác nhau.
      // Xét cả method lẫn splitGroups để bắt được bill cũ ghi thiếu một trong hai.
      const isSplitOrder = o.method === 'TÍNH RIÊNG'
        || !!(o.splitGroups && o.splitGroups.length);
      // [NEW] Nhận diện bill có phần chuyển khoản — dùng .includes vì method của
      // bill CŨ có thể là combo (vd 'VÍ CƠ BẢN + CHUYỂN KHOẢN' từ trước khi gỡ ví).
      // [FIX] Bill "TÍNH RIÊNG" có method = 'TÍNH RIÊNG', KHÔNG chứa chuỗi 'CHUYỂN
      // KHOẢN' — nên vẫn phải xét splitGroups: chỉ cần 1 nhóm trả bằng chuyển khoản
      // là cả bill được tính là có chuyển khoản (dùng cho mã CK hiện bên dưới).
      const isBankOrder = (o.method || '').includes('CHUYỂN KHOẢN')
        || !!(o.splitGroups && o.splitGroups.some(g => g && g.method === 'CHUYỂN KHOẢN'));
      // Một bill có thể thuộc nhiều loại (vd đơn app trả chuyển khoản). Chỉ gán
      // MỘT class màu theo thứ tự ưu tiên dưới đây — trước kia gán chồng cả
      // app-order lẫn bank-order rồi để thứ tự khai báo CSS tự quyết, ai sắp xếp
      // lại khối CSS là màu đổi theo mà không ai ngờ.
      //   tính riêng > chuyển khoản > app > tiền mặt
      // Chuyển khoản đứng trên app vì mục đích chính của màu là soi bill cần đối
      // soát ngân hàng; đơn app vẫn nhận ra được nhờ badge 📱 APP bên cạnh giờ.
      const billClass = isSplitOrder ? ' split-order'
                      : isBankOrder  ? ' bank-order'
                      : isAppOrder   ? ' app-order' : '';
      const shipBadge   = isShipOrder ? '<span style="background:#f59e0b;color:#78350f;font-size:10px;font-weight:700;border-radius:6px;padding:2px 6px;margin-left:4px;">🚚 SHIP</span>' : '';
      const appBadge    = isAppOrder  ? '<span style="background:#16a34a;color:#fff;font-size:10px;font-weight:700;border-radius:6px;padding:2px 6px;margin-left:4px;">📱 APP</span>' : '';
      // [NEW-addon] Bill đã được thêm topping sau khi bấm — hiện ngay ở danh sách để
      // không phải mở từng đơn mới biết đơn nào đã bị chỉnh.
      const addonBadge  = (o.addons && o.addons.length) ? '<span style="background:#1d4ed8;color:#fff;font-size:10px;font-weight:700;border-radius:6px;padding:2px 6px;margin-left:4px;">➕ BỔ SUNG</span>' : '';
      // [MỚI] Nhận diện CK được xác nhận THỦ CÔNG (bill thường hoặc bất kỳ nhóm nào
      // trong Tính riêng) — cần thấy ngay ở danh sách, không phải mở từng bill mới biết.
      const isManualBank = o.bankConfirmMethod === 'manual_staff'
        || !!(o.splitGroups && o.splitGroups.some(g => g && g.bankConfirmMethod === 'manual_staff'));
      const manualBankBadge = isManualBank ? '<span style="background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;border-radius:6px;padding:2px 6px;margin-left:4px;">⚠️ CK THỦ CÔNG</span>' : '';
      const iconStroke  = isSplitOrder ? '#7c3aed' : (isBankOrder ? 'var(--gm)' : (isAppOrder ? '#16a34a' : '#8a8474'));
      const priceHtml   = `<div class="hip">${o.total.toLocaleString('vi-VN')}<sup>đ</sup></div>`;
      const billCodeHtml = o.billCode ? `<span style="color:var(--gm);font-weight:700;">${o.billCode}</span> · ` : '';
      // [NEW] Hiện mã CK ngay trong danh sách để rà soát nhanh không cần mở chi tiết.
      // Bill thường: lấy o.bankOrderId. Bill Tính riêng: có thể nhiều mã (mỗi nhóm 1
      // mã) — gom hết lại, ngăn cách bằng dấu phẩy.
      let bankCodeHtml = '';
      // Mã CK lấy màu theo đúng màu thẻ bill đang đứng trên, để không chỏi màu:
      // thẻ tím (tính riêng) → mã tím, thẻ hồng (chuyển khoản) → mã hồng đậm.
      const bankCodeColor = isSplitOrder ? '#7c3aed' : 'var(--gm)';
      if (o.method === 'TÍNH RIÊNG' && o.splitGroups && o.splitGroups.length) {
        const codes = o.splitGroups.filter(g => g.method === 'CHUYỂN KHOẢN' && g.bankOrderId).map(g => g.bankOrderId);
        if (codes.length) bankCodeHtml = `<span style="color:${bankCodeColor};font-weight:700;">🏦 ${codes.join(', ')}</span> · `;
      } else if (isBankOrder && o.bankOrderId) {
        bankCodeHtml = `<span style="color:${bankCodeColor};font-weight:700;">🏦 ${o.bankOrderId}</span> · `;
      }
      return `<div class="hit${billClass}" onclick="showDet('${o.id}')">
        <div class="hii"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${iconStroke}" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg></div>
        <div class="hin"><div class="hitime">${o.time}${shipBadge}${appBadge}${addonBadge}${manualBankBadge}</div><div class="himeta">${bankCodeHtml}${billCodeHtml}${o.phone||'Khách vãng lai'}</div></div>
        <div style="text-align:right;flex-shrink:0;min-width:110px;">${priceHtml}<div class="him">${o.method}</div></div>
      </div>`;
    }).join('')}</div>`).join('');
}

function filterH() { renderH(document.getElementById('hsi').value); }

PosGieoMods.reports = true;
