// Tách từ posgieo.html dòng 3003–3185, 3428–3442, 4882–5103 (tools/tach_posgieo/chuyen.js, 2026-10-26). ĐÃ PHÁT HÀNH thì KHÔNG sửa nội dung —
// tạo pos_print_content.v2.js và trỏ HTML tới (sổ tools/js_da_phat_hanh.json). Nạp TRƯỚC <script> chính; CHỈ khai báo.
(window.PosGieoMods = window.PosGieoMods || {}).printContent = 'dang';

function renderReceiptCanvas(content, widthPx = 384) {
  const PAD = 8, lineGap = 6;
  const fontStr = (size, bold) => `${bold ? '700' : '400'} ${size}px 'Google Sans', Arial, sans-serif`;

  // Ước lượng chiều cao trước (dư ra một chút, sẽ crop lại sau khi vẽ xong)
  let estH = PAD * 2 + 20;
  content.forEach(c => {
    if (c.type === 'divider') { estH += 14; return; }
    if (c.type === 'lineItem') {
      estH += (18) + lineGap + 4;
      if (c.toppings && c.toppings.length) estH += c.toppings.length * 16;
      if (c.ice) estH += 16; // [NEW-ICE]
      return;
    }
    if (c.type === 'row') {
      const size = Math.max(c.left?.size || 16, c.right?.size || 16);
      estH += size + lineGap;
      return;
    }
    const size = c.size || 16;
    const approxCharsPerLine = Math.max(1, Math.floor(widthPx / (size * 0.55)));
    const lines = Math.max(1, Math.ceil(String(c.text || '').length / approxCharsPerLine));
    estH += lines * (size + lineGap);
  });

  const draft = document.createElement('canvas');
  draft.width = widthPx; draft.height = estH;
  const ctx = draft.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, draft.width, draft.height);
  ctx.fillStyle = '#000';

  function wrapText(text, size, bold) {
    ctx.font = fontStr(size, bold);
    const maxW = widthPx - PAD * 2;
    const words = String(text).split(' ');
    const lines = []; let cur = '';
    words.forEach(w => {
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
      else cur = test;
    });
    if (cur) lines.push(cur);
    return lines;
  }

  let y = PAD;
  content.forEach(c => {
    if (c.type === 'divider') {
      const dy = y + 6;
      if (c.style === 'dashed') {
        for (let x = PAD; x < widthPx - PAD; x += 7) ctx.fillRect(x, dy, 4, 2);
      } else {
        ctx.fillRect(PAD, dy, widthPx - PAD * 2, 2);
      }
      y += 14;
      return;
    }
    if (c.type === 'lineItem') {
      const size = 18;
      ctx.font = fontStr(size, true);
      ctx.textAlign = 'left';
      const nameStr = `${c.name}${c.size && c.size !== '-' ? ' (' + c.size + ')' : ''} x${c.qty}`;
      ctx.fillText(nameStr, PAD, y + size);
      ctx.font = fontStr(16, false);
      ctx.textAlign = 'right';
      ctx.fillText(fmt((c.price || 0) * (c.qty || 1)), widthPx - PAD, y + size);
      y += size + lineGap;
      (c.toppings || []).forEach(t => {
        ctx.font = fontStr(13, false);
        ctx.textAlign = 'left';
        ctx.fillText('  + ' + tpLabel(t), PAD, y + 13);
        if (t.price) { ctx.textAlign = 'right'; ctx.fillText('+' + fmt((Number(t.price)||0) * tpQty(t)), widthPx - PAD, y + 13); }
        y += 16;
      });
      if (c.ice) { // [NEW-ICE] chỉ in khi khác mặc định đá chung
        ctx.font = fontStr(13, true);
        ctx.textAlign = 'left';
        ctx.fillText('  ' + (ICE_LABELS[c.ice] || c.ice).toUpperCase(), PAD, y + 13);
        y += 16;
      }
      y += 4;
      return;
    }
    // 1 dòng có nội dung bên trái + nội dung bên phải, cùng chung 1 baseline
    // (VD: phương thức thanh toán bên trái, "Khách đưa: ..." bên phải)
    if (c.type === 'row') {
      const size = Math.max(c.left?.size || 16, c.right?.size || 16);
      if (c.left && c.left.text) {
        ctx.font = fontStr(c.left.size || 16, !!c.left.bold);
        ctx.textAlign = 'left';
        ctx.fillText(c.left.text, PAD, y + size);
      }
      if (c.right && c.right.text) {
        ctx.font = fontStr(c.right.size || 16, !!c.right.bold);
        ctx.textAlign = 'right';
        ctx.fillText(c.right.text, widthPx - PAD, y + size);
      }
      y += size + lineGap;
      return;
    }
    // text
    const size = c.size || 16, bold = !!c.bold, align = c.align || 'left';
    const lines = wrapText(c.text ?? '', size, bold);
    ctx.font = fontStr(size, bold);
    ctx.textAlign = align;
    const xPos = align === 'center' ? widthPx / 2 : (align === 'right' ? widthPx - PAD : PAD);
    lines.forEach(ln => { y += size; ctx.fillText(ln, xPos, y); y += lineGap; });
  });

  const finalH = Math.min(draft.height, y + PAD + 10);
  if (finalH < draft.height) {
    const trimmed = document.createElement('canvas');
    trimmed.width = widthPx; trimmed.height = finalH;
    trimmed.getContext('2d').drawImage(draft, 0, 0);
    return trimmed;
  }
  return draft;
}

// Che số điện thoại khách khi in bill: giữ 4 số đầu, phần còn lại thay bằng x
// VD: 0912345678 -> 0912xxxxxx
function maskPhoneForPrint(phone) {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  if (digits.length <= 4) return digits;
  return digits.slice(0, 4) + 'x'.repeat(digits.length - 4);
}

// order object (đã lưu Firebase) → danh sách lệnh in trừu tượng — xem plan mục 3.2/8.4
function buildReceiptContent(order, layout) {
  const lay = layout || POSPrinter.layout;
  // Khách: gộp tên + SĐT (đã che) trên CÙNG 1 dòng — VD: "Khách: Lan - 0988xxxx"
  const custBits = [];
  if (order.customerName) custBits.push(order.customerName);
  if (order.phone) custBits.push(maskPhoneForPrint(order.phone));
  const custLine = custBits.length ? `Khách: ${custBits.join(' - ')}` : null;

  // Dòng phương thức thanh toán + Khách đưa: cùng 1 dòng, PT bên trái (to bằng dòng TỔNG),
  // "Khách đưa" bên phải. Nếu không phải tiền mặt (không có Khách đưa) thì in PT 1 mình bên phải.
  const isCash = order.method === 'TIỀN MẶT' && order.cashGiven;
  const payRow = isCash
    ? { type: 'row',
        left:  { text: order.method, size: 24, bold: true },
        right: { text: `Khách đưa: ${fmt(order.cashGiven)}`, size: 17, bold: true } }
    : { type: 'text', text: `${order.method}`, size: 16, align: 'right', bold: true };

  return [
    lay.showLogo ? { type: 'text', text: 'GIEO GIEO', size: lay.fontSizeTitle || 28, align: 'center', bold: true } : null,
    order.billCode ? { type: 'text', text: order.billCode, size: 20, align: 'center', bold: true } : null,
    { type: 'divider', style: 'dashed' },
    { type: 'text', text: `${order.date}  ${order.time}`, size: lay.fontSizeBody || 16 },
    custLine ? { type: 'text', text: custLine, size: lay.fontSizeBody || 16 } : null,
    { type: 'divider', style: 'dashed' },
    ...(order.itemsArray || []).map(it => ({
      type: 'lineItem', name: it.name, size: it.size, qty: it.qty, price: it.price,
      toppings: it.toppings || [],
      // [NEW-ICE] chỉ in nhãn đá khi KHÁC mặc định (đá chung) — đỡ rối bill khi cả đơn đều đá chung
      ice: (!it.isFood && it.ice && it.ice !== 'chung') ? it.ice : null
    })),
    { type: 'divider', style: 'solid' },
    order.discountAmt ? { type: 'text', text: `Giảm giá: -${fmt(order.discountAmt)}`, size: 14, align: 'right' } : null,
    order.voucherUsed ? { type: 'text', text: `Voucher: ${stampPromotionLabel(order.voucherUsed)}`, size: 14, align: 'right' } : null,
    { type: 'text', text: `TỔNG: ${fmt(order.total)}`, size: 24, bold: true, align: 'right' },
    payRow,
    (order.cashChange && order.method === 'TIỀN MẶT') ? { type: 'text', text: `Thối lại: ${fmt(order.cashChange)}`, size: 17, bold: true, align: 'right' } : null,
    { type: 'text', text: 'Mua 5 tặng 1 mỗi ngày', size: 15, align: 'center' },
    ...buildFooterLines(lay),
  ].filter(Boolean);
}

// Nội dung khuyến mãi/thông báo do quán tự cấu hình trong tab Máy in (KHÔNG hardcode)
// — mỗi dòng người dùng nhập trong ô "Nội dung thêm cuối bill" sẽ thành 1 dòng in riêng
function buildFooterLines(lay) {
  const raw = (lay && lay.footerText) || '';
  const lines = raw.split('\n').map(s => s.trim()).filter(Boolean);
  if (!lines.length) return [];
  return [
    { type: 'divider', style: 'dashed' },
    ...lines.map(text => ({ type: 'text', text, size: 13, align: 'center', bold: !!(lay && lay.footerBold) }))
  ];
}

const TEM_LABEL_WIDTH_MM = 40;

const TEM_LABEL_HEIGHT_MM = 30;

// Độ phân giải máy in (dots/mm) — ảnh hưởng trực tiếp đến kích thước tem in ra thực tế.
// 203dpi (~8 dots/mm) là phổ biến nhất; một số máy in tem đời mới/cao cấp hơn là 300dpi
// (~11.8 dots/mm). Nếu tem in ra sai tỉ lệ dù đã đúng TSPL/ESC-POS, hãy thử đổi DPI.
const TEM_DPI_TO_DOTS_PER_MM = { 203: 8, 300: 11.8 };

function temDotsPerMm() {
  // [FIX-tem-settings-cloud] Đọc qua getter (cloud → localStorage → mặc định) thay vì đọc
  // thẳng localStorage, để DPI dùng khi dựng bitmap luôn khớp với DPI hiện trên màn cấu hình.
  const dpi = POSTemPrinter.getDpi();
  return TEM_DPI_TO_DOTS_PER_MM[dpi] || 8;
}

function temPxW() { return Math.round(TEM_LABEL_WIDTH_MM * temDotsPerMm()); }

function temPxH() { return Math.round(TEM_LABEL_HEIGHT_MM * temDotsPerMm()); }

function drawQrOnCanvas(ctx, text, x, y, box, measureOnly) {
  const data = String(text == null ? '' : text);
  if (!data) return 0;
  if (typeof qrcode !== 'function') { console.warn('[tem] thiếu thư viện qrcode-generator'); return 0; }
  let qr;
  try {
    // typeNumber 0 = tự chọn phiên bản nhỏ nhất đủ chứa. Mức sửa lỗi 'M' (~15%) — đủ chịu
    // tem hơi nhoè/xước mà không phình mã lên quá to như mức 'Q'/'H'.
    qr = qrcode(0, 'M');
    qr.addData(data);
    qr.make();
  } catch (e) { console.warn('[tem] dựng QR lỗi', e); return 0; }
  const n = qr.getModuleCount();
  // Tối thiểu 2 dot/ô. Dưới mức đó thì in ra là một vũng mực, quét không nổi — thà QR tràn
  // hơi to còn hơn in ra một mã chết.
  const cell = Math.max(2, Math.floor(box / n));
  const side = cell * n;
  if (measureOnly) return side;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(x + c * cell, y + r * cell, cell, cell);
    }
  }
  return side;
}

function renderTemCanvas(lines) {
  const w = temPxW(), h = temPxH();
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  // [FIX-tem-topmargin] Lề TRÊN trước đây bằng lề dưới/2 bên (~5% bề rộng tem) — với tem chỉ
  // cao 30mm thì phần lề thừa này ăn mất chỗ của các dòng cuối (giá, ngày giờ), khiến máy in
  // tràn tem và MẤT hẳn nội dung phía dưới (cắt ngay giữa danh sách topping, không thấy giá).
  // Giờ lề trên chỉ còn vài dot tượng trưng (không dính sát mép) — dư ra bao nhiêu dồn hết
  // xuống cho nội dung, đỡ phí tem.
  const PAD_LEFT = Math.max(8, Math.round(w * 0.045));
  // [FIX-tem-rightmargin] Chữ căn phải (giá, mã bill) trước đây in sát mép phải hơn hẳn so với
  // mép trái — lề phải cần rộng hơn lề trái một chút mới ra đều 2 bên khi in thật.
  const PAD_RIGHT = PAD_LEFT + Math.max(4, Math.round(w * 0.02));
  const PAD_TOP = Math.max(3, Math.round(w * 0.012));
  const PAD_BOTTOM = Math.max(6, Math.round(w * 0.03));
  const maxW = w - PAD_LEFT - PAD_RIGHT;
  const availH = h - PAD_TOP - PAD_BOTTOM;

  function fontStr(size, bold) { return `${bold ? '700' : '400'} ${size}px 'Google Sans', Arial, sans-serif`; }

  function wrapText(text, size, bold) {
    ctx.font = fontStr(size, bold);
    const words = String(text ?? '').split(' ');
    const wlines = []; let cur = '';
    words.forEach(word => {
      const test = cur ? cur + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && cur) { wlines.push(cur); cur = word; }
      else cur = test;
    });
    if (cur) wlines.push(cur);
    return wlines;
  }

  // [FIX-tem-namewrap] Tên món dài (VD "Trà sữa nguyên lá (M)") trước đây tự xuống dòng 2 —
  // dòng 2 này chiếm thêm chỗ ngoài dự tính, dễ vỡ layout / đẩy tràn các dòng bên dưới.
  // Với dòng đánh dấu noWrap (tên món), thay vì xuống dòng thì THU NHỎ cỡ chữ dần cho tới
  // khi vừa đúng 1 dòng — tối đa xuống 60% cỡ gốc, đủ để giữ layout luôn ổn định.
  // Co chữ cho vừa một bề rộng cho trước (dùng cho 2 bên của hàng trái-phải).
  // Khác fitOneLine ở chỗ nhận limitW riêng thay vì luôn dùng cả bề ngang tem.
  function fitWidth(text, size, bold, limitW) {
    let s = size;
    ctx.font = fontStr(s, bold);
    while (s > 8 && ctx.measureText(String(text ?? '')).width > limitW) {
      s -= 1;
      ctx.font = fontStr(s, bold);
    }
    return s;
  }

  function fitOneLine(text, size, bold) {
    const minSize = Math.max(8, Math.round(size * 0.6));
    let s = size;
    ctx.font = fontStr(s, bold);
    while (s > minSize && ctx.measureText(String(text ?? '')).width > maxW) {
      s -= 1;
      ctx.font = fontStr(s, bold);
    }
    return s;
  }

  // Dựng danh sách lệnh vẽ đã tính toạ độ y ở 1 hệ số scale cho trước, đồng thời trả về tổng
  // chiều cao cần dùng — dùng lại y hệt cho cả bước "đo" lẫn bước "vẽ thật" để không lệch nhau.
  function buildOps(scale) {
    let y = 0; const ops = [];
    (lines || []).forEach(ln => {
      if (!ln) return;
      if (ln.type === 'divider') { ops.push({ type: 'divider', y }); y += Math.round(10 * scale); return; }
      // [NEW] Khối mã QR cho tem kho. Chiếm một ô VUÔNG, co giãn theo cùng hệ số `scale`
      // như chữ nên không phá luật "nội dung luôn lấp vừa khung tem" ở dưới.
      // Quy ước y giống hệt chữ: y là ĐÁY của khối, vì fillText cũng vẽ phía trên baseline.
      if (ln.type === 'qr') {
        const box = Math.max(40, Math.round((ln.size || 90) * scale));
        y += box;
        ops.push({ type: 'qr', y, text: ln.text, box, align: ln.align || 'center' });
        y += Math.round(4 * scale);
        return;
      }
      if (ln.type === 'row') {
        const L = ln.left || {}, R = ln.right || {};
        // [FIX] Trước đây row KHÔNG hề chống tràn: chữ hai bên cứ vẽ nguyên cỡ,
        // gặp nội dung dài (tên nhân viên, ngày giờ đầy đủ) là đè chồng lên nhau
        // thành một đống không đọc được. Giờ mỗi bên tự co cho vừa phần chỗ của
        // mình, chừa GAP ở giữa để hai bên không dính sát nhau.
        const GAP = Math.max(6, Math.round(10 * scale));
        // Chia chỗ theo tỉ lệ độ dài chữ, nhưng mỗi bên luôn được ít nhất 30%
        // để bên ngắn không bị bóp đến mức vô nghĩa.
        const lLen = String(L.text ?? '').length, rLen = String(R.text ?? '').length;
        const tong = lLen + rLen || 1;
        const tyLe = Math.min(0.7, Math.max(0.3, lLen / tong));
        const Lmax = Math.floor((maxW - GAP) * tyLe);
        const Rmax = maxW - GAP - Lmax;
        const Lsize = L.text ? fitWidth(L.text, Math.max(8, Math.round((L.size || 12) * scale)), !!L.bold, Lmax) : 8;
        const Rsize = R.text ? fitWidth(R.text, Math.max(8, Math.round((R.size || 12) * scale)), !!R.bold, Rmax) : 8;
        const size = Math.max(Lsize, Rsize);
        y += size;
        ops.push({ type: 'row', y, L: { ...L, size: Lsize }, R: { ...R, size: Rsize } });
        y += Math.round(4 * scale);
        return;
      }
      const baseSize = Math.max(8, Math.round((ln.size || 14) * scale)), bold = !!ln.bold, align = ln.align || 'left';
      if (ln.noWrap) {
        const size = fitOneLine(ln.text, baseSize, bold);
        y += size;
        ops.push({ type: 'text', y, text: ln.text, size, bold, align });
        y += Math.round(4 * scale);
        return;
      }
      wrapText(ln.text, baseSize, bold).forEach(wl => {
        y += baseSize;
        ops.push({ type: 'text', y, text: wl, size: baseSize, bold, align });
        y += Math.round(4 * scale);
      });
    });
    return { ops, total: y };
  }

  // Đo ở scale gốc (1.0) rồi suy ra hệ số co giãn để nội dung lấp gần đầy khung tem:
  // dư chỗ → phóng to, tràn khung → thu nhỏ đến khi VỪA ĐỦ để KHÔNG BAO GIỜ bị
  // cắt mất nội dung (trước đây có sàn 0.62x, món nhiều topping vẫn tràn và bị mất hẳn dòng
  // giá/ngày giờ phía dưới — giờ bỏ sàn, thà chữ nhỏ hơn còn hơn mất nội dung).
  // [FIX] Trần phóng to nâng 1.35 → 2.6: tem ít dòng (tem lô bán thành phẩm chỉ 4
  // dòng, tem ly không topping) trước đây bị chặn ở 1.35x nên chỉ lấp ~52% chiều
  // cao tem, chữ cao 3.4mm — dán lên hũ trong bếp thiếu sáng rất khó đọc, trong
  // khi gần nửa tem để trống. Chỉ nới TRẦN nên tem nhiều dòng không đổi gì.
  //
  // [FIX] Tinh chỉnh nhiều vòng thay vì tính một phát. Lần tính đầu chưa biết
  // chữ sẽ bị co bao nhiêu theo BỀ NGANG (fitOneLine/fitWidth cắt cỡ chữ xuống
  // cho vừa tem), nên chiều cao ước lượng luôn thừa và tem còn trống ~25% mà chữ
  // vẫn bé. Mỗi vòng đo lại chiều cao THẬT rồi nới/thu cho khớp.
  const { total: baseTotal } = buildOps(1);
  let scale = baseTotal > 0 ? Math.min(2.6, availH / baseTotal) : 1;
  for (let i = 0; i < 5; i++) {
    const t = buildOps(scale).total;
    if (t <= 0) break;
    const k = availH / t;
    if (k > 1.02 && scale < 2.6) scale = Math.min(2.6, scale * k);
    else if (k < 1) scale = scale * k;   // tràn khung → thu lại
    else break;
  }
  // Chốt an toàn: dù vòng trên có hội tụ kiểu gì, tuyệt đối không để tràn tem
  // (tràn = mất nội dung, tệ hơn nhiều so với chữ bé hơn một chút).
  const finalTotal = buildOps(scale).total;
  if (finalTotal > availH) scale = scale * (availH / finalTotal);
  const { ops } = buildOps(scale);

  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#000';

  ops.forEach(op => {
    const yy = PAD_TOP + op.y;
    if (yy > h - 1) return; // an toàn tuyệt đối — không vẽ tràn ra ngoài viền dưới của tem
    if (op.type === 'divider') {
      for (let x = PAD_LEFT; x < w - PAD_RIGHT; x += 6) ctx.fillRect(x, yy + 4, 3, Math.max(1.5, 1.5 * scale));
      return;
    }
    if (op.type === 'row') {
      if (op.L.text) { ctx.font = fontStr(op.L.size, op.L.bold); ctx.textAlign = 'left'; ctx.fillText(String(op.L.text), PAD_LEFT, yy); }
      if (op.R.text) { ctx.font = fontStr(op.R.size, op.R.bold); ctx.textAlign = 'right'; ctx.fillText(String(op.R.text), w - PAD_RIGHT, yy); }
      return;
    }
    if (op.type === 'qr') {
      const drawn = drawQrOnCanvas(ctx, op.text, 0, 0, op.box, true); // đo trước, chưa vẽ
      const x = op.align === 'left' ? PAD_LEFT
              : op.align === 'right' ? (w - PAD_RIGHT - drawn)
              : Math.round((PAD_LEFT + (w - PAD_RIGHT) - drawn) / 2);
      drawQrOnCanvas(ctx, op.text, x, yy - drawn, op.box);
      return;
    }
    ctx.font = fontStr(op.size, op.bold);
    ctx.textAlign = op.align;
    const xPos = op.align === 'center' ? (PAD_LEFT + (w - PAD_RIGHT)) / 2 : (op.align === 'right' ? w - PAD_RIGHT : PAD_LEFT);
    ctx.fillText(op.text, xPos, yy);
  });

  return canvas;
}

PosGieoMods.printContent = true;
