// Đếm lượt ĐỌC Firestore của posgieo / quanlygieo theo collection + hàm gọi + màn hình (T1, docs/KE_HOACH_TOI_UU_DOC.md).
// KHÔNG sửa app, KHÔNG ghi Firebase, KHÔNG cần deploy. Chỉ đếm Firestore (RTDB tính tiền theo dung lượng, không theo lượt).
//
// CÁCH CHẠY: mở app đã đăng nhập → DevTools Console → dán toàn bộ file này → Enter. Dùng app bình thường, rồi gõ:
//   demLuotDoc.bang()          bảng lượt đọc theo collection + hàm, nhiều nhất trước (mặc định 30 dòng; bang(100) để xem thêm)
//   demLuotDoc.theoMan()       tổng theo màn hình (Quản lý: curScreen; POS: màn .screen đang hiện)
//   demLuotDoc.theoCollection()
//   demLuotDoc.moc('tên việc') in lượt đọc TỪ MỐC TRƯỚC tới giờ (kèm 10 dòng tốn nhất) rồi đặt mốc mới —
//                              vd moc('bắt đầu') → mở Tháng kết → moc('mở Tháng kết')
//   demLuotDoc.xuat()          JSON để gửi lại (tự chép vào clipboard nếu Console hỗ trợ copy())
//   demLuotDoc.datLai()        xoá số đã đếm (cả bản lưu trong máy)
//   demLuotDoc.tat()           gỡ bộ đếm, app trở lại như cũ
// Số đếm lưu trong máy (localStorage, theo ngày): app tải lại → dán lại file này → đếm TIẾP từ số cũ của hôm nay.
//
// Cách tính (theo bảng giá Firestore, gần đúng):
//   · doc.get / transaction.get: 1 lượt mỗi tài liệu (kể cả tài liệu không tồn tại).
//   · query.get: số tài liệu trả về, tối thiểu 1 (truy vấn rỗng vẫn tính 1).
//   · listener tài liệu: 1 lượt mỗi lần máy chủ gửi bản mới.
//   · listener truy vấn: lần đầu = số tài liệu (tối thiểu 1); sau đó = số tài liệu thêm/sửa.
//   · Bản lấy từ cache trong máy (offline) và bản do chính máy vừa ghi (chưa lên máy chủ): 0 lượt.
//   Không đếm được: listener gắn lại sau khi mất mạng > 30 phút (máy chủ tính lại cả kết quả).
(function (root) {
  const KHOA_LUU = 'demLuotDoc_v1';
  // Dòng stack bỏ qua: bộ đếm này, thư viện Firebase (gstatic / file firebase-*.js), dòng nội bộ của trình duyệt.
  // KHÔNG lọc chữ "firebase" chung chung — app chạy trên tên miền *.firebaseapp.com / *.web.app.
  const BO_QUA = /__dld|dem_luot_doc|gstatic\.com|firebase-[\w-]*\.js|\/node_modules\/|<anonymous>|^\s*at (new )?Promise|Generator|asyncGeneratorStep|processTicksAndRejections|node:internal/;

  // ns = firebase.firestore (compat); env = { now, stack, man, luu, docLuu, ngay } — tách ra để test được trong Node.
  function cai(ns, env) {
    env = env || {};
    const now = env.now || (() => Date.now());
    const ngay = env.ngay || (() => { const d = new Date(now()); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
    const layStack = env.stack || function __dldStack() { return String(new Error().stack || ''); };
    const layMan = env.man || (() => '?');
    const luu = env.luu || (() => {});
    const docLuu = env.docLuu || (() => null);

    const goc = {
      dGet: ns.DocumentReference.prototype.get, dSnap: ns.DocumentReference.prototype.onSnapshot,
      qGet: ns.Query.prototype.get, qSnap: ns.Query.prototype.onSnapshot, tGet: ns.Transaction.prototype.get
    };
    let st = { ngay: ngay(), batDau: now(), tong: 0, dong: {}, man: {} };
    let cu = null; try { cu = docLuu(); } catch (e) {}
    if (cu && cu.ngay === st.ngay && cu.dong) st = cu;
    let moc = { at: now(), tong: st.tong, dong: {} };
    Object.keys(st.dong).forEach(k => { moc.dong[k] = st.dong[k].luot; });

    function __dldNoiGoi() {
      const dongs = layStack().split('\n').slice(1).map(s => s.trim()).filter(s => s && !BO_QUA.test(s));
      let ten = '', noi = '';
      for (const s of dongs) {
        const m = /^at (?:async )?([^\s(]+) \((.*):(\d+):\d+\)$/.exec(s) || /^([^@\s]+)@(.*):(\d+):\d+$/.exec(s);
        const a = m ? null : (/^at (?:async )?(.*):(\d+):\d+$/.exec(s));
        const file = m ? m[2] : (a ? a[1] : ''), line = m ? m[3] : (a ? a[2] : '');
        if (!noi && file) noi = file.split('/').pop().split('?')[0] + ':' + line;
        if (m && m[1] && !/^(Object\.|Array\.|Map\.|Set\.)/.test(m[1])) { ten = m[1].replace(/^Object\./, ''); if (!noi) noi = file.split('/').pop() + ':' + line; break; }
      }
      return { ten: ten || '(ẩn danh)', noi: noi || '?' };
    }
    function collOfRef(ref) { try { return ref.parent ? ref.parent.path : '?'; } catch (e) { return '?'; } }
    function collOfQuery(q) {
      try { const iq = q._delegate && q._delegate._query; if (iq) return iq.collectionGroup ? '*/' + iq.collectionGroup : iq.path.canonicalString(); } catch (e) {}
      try { if (q.path) return q.path; } catch (e) {}
      return '?';
    }
    function ghi(ctx, n) {
      if (!(n > 0)) return;
      const k = ctx.kieu + '|' + ctx.coll + '|' + ctx.ten + '|' + ctx.noi;
      const d = st.dong[k] || (st.dong[k] = { kieu: ctx.kieu, coll: ctx.coll, ham: ctx.ten, noi: ctx.noi, luot: 0, lan: 0 });
      d.luot += n; d.lan++;
      st.tong += n;
      st.man[ctx.man] = (st.man[ctx.man] || 0) + n;
      if (st.tong % 50 < n) { try { luu(st); } catch (e) {} }
    }
    // Mọi lỗi của bộ đếm bị chặn tại đây — không bao giờ làm hỏng lượt đọc của app.
    function __dldCtx(kieu, layColl) {
      try { const g = __dldNoiGoi(); let man = '?'; try { man = layMan(); } catch (e) {} return { kieu, coll: layColl(), ten: g.ten, noi: g.noi, man }; }
      catch (e) { return null; }
    }
    function dem(ctx, n) { try { if (ctx) ghi(ctx, n); } catch (e) {} }
    const tuMayChu = s => !(s && s.metadata && (s.metadata.fromCache || s.metadata.hasPendingWrites));

    // Bọc hàm nhận snapshot của onSnapshot (đủ các dạng gọi: (next, err), (opts, next, err), ({next, error}), (opts, {next})).
    function bocNghe(args, xuLy) {
      const a = Array.prototype.slice.call(args);
      if (!a.length) return a;
      for (let i = 0; i < a.length; i++) {
        if (typeof a[i] === 'function') { const f = a[i]; a[i] = function (s) { try { xuLy(s); } catch (e) {} return f.apply(this, arguments); }; return a; }
        if (a[i] && typeof a[i].next === 'function') { const o = a[i], f = o.next; a[i] = Object.assign({}, o, { next: function (s) { try { xuLy(s); } catch (e) {} return f.apply(o, arguments); } }); return a; }
      }
      return a;
    }

    ns.DocumentReference.prototype.get = function __dldDocGet() {
      const ctx = __dldCtx('doc.get', () => collOfRef(this));
      return goc.dGet.apply(this, arguments).then(s => { if (tuMayChu(s)) dem(ctx, 1); return s; });
    };
    ns.Query.prototype.get = function __dldQueryGet() {
      const ctx = __dldCtx('query.get', () => collOfQuery(this));
      return goc.qGet.apply(this, arguments).then(s => { if (tuMayChu(s)) dem(ctx, Math.max(1, (s && s.size) || 0)); return s; });
    };
    ns.Transaction.prototype.get = function __dldTxGet(ref) {
      const ctx = __dldCtx('tx.get', () => collOfRef(ref));
      return goc.tGet.apply(this, arguments).then(s => { dem(ctx, 1); return s; });
    };
    ns.DocumentReference.prototype.onSnapshot = function __dldDocSnap() {
      const ctx = __dldCtx('nghe.doc', () => collOfRef(this));
      return goc.dSnap.apply(this, bocNghe(arguments, s => { if (tuMayChu(s)) dem(ctx, 1); }));
    };
    ns.Query.prototype.onSnapshot = function __dldQuerySnap() {
      const ctx = __dldCtx('nghe.query', () => collOfQuery(this));
      let dau = true;
      return goc.qSnap.apply(this, bocNghe(arguments, s => {
        if (!tuMayChu(s)) return;
        if (dau) { dau = false; dem(ctx, Math.max(1, s.size || 0)); return; }
        const n = (typeof s.docChanges === 'function' ? s.docChanges() : []).filter(c => c.type === 'added' || c.type === 'modified').length;
        dem(ctx, n);
      }));
    };

    const sapXep = (o, n) => Object.keys(o).map(k => o[k]).sort((a, b) => b.luot - a.luot).slice(0, n);
    const phut = () => Math.max(1, Math.round((now() - st.batDau) / 60000));
    const api = {
      bang(n) {
        const ds = sapXep(st.dong, n || 30).map(d => ({ luot: d.luot, lan: d.lan, kieu: d.kieu, collection: d.coll, ham: d.ham, noi: d.noi }));
        if (typeof console !== 'undefined' && console.table) console.table(ds);
        console.log('[demLuotDoc] Tổng ' + st.tong + ' lượt đọc trong ' + phut() + ' phút (ngày ' + st.ngay + ').');
        return ds;
      },
      theoMan() {
        const ds = Object.keys(st.man).map(m => ({ man: m, luot: st.man[m] })).sort((a, b) => b.luot - a.luot);
        if (console.table) console.table(ds); return ds;
      },
      theoCollection() {
        const by = {};
        Object.keys(st.dong).forEach(k => { const d = st.dong[k]; by[d.coll] = (by[d.coll] || 0) + d.luot; });
        const ds = Object.keys(by).map(c => ({ collection: c, luot: by[c] })).sort((a, b) => b.luot - a.luot);
        if (console.table) console.table(ds); return ds;
      },
      moc(ten) {
        const delta = [];
        Object.keys(st.dong).forEach(k => { const d = st.dong[k], n = d.luot - (moc.dong[k] || 0); if (n > 0) delta.push({ luot: n, kieu: d.kieu, collection: d.coll, ham: d.ham, noi: d.noi }); });
        delta.sort((a, b) => b.luot - a.luot);
        const kq = { ten: ten || '', luot: st.tong - moc.tong, giay: Math.round((now() - moc.at) / 1000), top: delta.slice(0, 10) };
        console.log('[demLuotDoc] MỐC "' + kq.ten + '": ' + kq.luot + ' lượt đọc trong ' + kq.giay + ' giây kể từ mốc trước.');
        if (console.table && kq.top.length) console.table(kq.top);
        (st.moc = st.moc || []).push({ ten: kq.ten, luot: kq.luot, giay: kq.giay, at: new Date(now()).toISOString() });
        moc = { at: now(), tong: st.tong, dong: {} };
        Object.keys(st.dong).forEach(k => { moc.dong[k] = st.dong[k].luot; });
        try { luu(st); } catch (e) {}
        return kq;
      },
      xuat() {
        const s = JSON.stringify(st);
        try { if (typeof root.copy === 'function') { root.copy(s); console.log('[demLuotDoc] Đã chép JSON vào clipboard.'); } } catch (e) {}
        return s;
      },
      datLai() {
        st = { ngay: ngay(), batDau: now(), tong: 0, dong: {}, man: {} };
        moc = { at: now(), tong: 0, dong: {} };
        try { luu(null); } catch (e) {}
        console.log('[demLuotDoc] Đã xoá số đếm.');
      },
      tat() {
        try { luu(st); } catch (e) {}
        ns.DocumentReference.prototype.get = goc.dGet; ns.DocumentReference.prototype.onSnapshot = goc.dSnap;
        ns.Query.prototype.get = goc.qGet; ns.Query.prototype.onSnapshot = goc.qSnap; ns.Transaction.prototype.get = goc.tGet;
        console.log('[demLuotDoc] Đã gỡ bộ đếm.');
      },
      _st: () => st
    };
    return api;
  }

  if (typeof module !== 'undefined' && module.exports) { module.exports = { cai }; return; }
  if (!root.firebase || !root.firebase.firestore) { console.error('[demLuotDoc] Chưa có firebase.firestore — mở đúng trang app rồi dán lại.'); return; }
  if (root.demLuotDoc && typeof root.demLuotDoc.tat === 'function') root.demLuotDoc.tat();   // dán lại lần 2: gỡ bản cũ trước
  root.demLuotDoc = cai(root.firebase.firestore, {
    man: () => {
      try { if (typeof curScreen !== 'undefined') return 'QL:' + curScreen; } catch (e) {}   // eslint-disable-line no-undef
      const s = document.querySelector('.screen.active');
      return s ? 'POS:' + s.id : '?';
    },
    luu: st => { try { if (st) localStorage.setItem(KHOA_LUU, JSON.stringify(st)); else localStorage.removeItem(KHOA_LUU); } catch (e) {} },
    docLuu: () => { try { return JSON.parse(localStorage.getItem(KHOA_LUU) || 'null'); } catch (e) { return null; } }
  });
  { const tat0 = root.demLuotDoc.tat; root.demLuotDoc.tat = function () { tat0(); try { const n = document.getElementById('__dld_nut'); if (n) n.remove(); } catch (e) {} }; }
  const luuNgay = () => { try { localStorage.setItem(KHOA_LUU, JSON.stringify(root.demLuotDoc._st())); } catch (e) {} };
  if (typeof root.addEventListener === 'function') {
    root.addEventListener('pagehide', luuNgay);
    document.addEventListener('visibilitychange', () => { if (document.hidden) luuNgay(); });
  }

  // ── Bảng trên màn hình (cho máy không mở được Console, vd máy tính bảng) ──
  // Nút 📊 nổi góc dưới trái, luôn hiện tổng lượt đọc; bấm → bảng xếp hạng + Đặt mốc / Chép kết quả / Xoá số đếm.
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function veBang() {
    const D = root.demLuotDoc, st = D._st();
    const dong = Object.keys(st.dong).map(k => st.dong[k]).sort((a, b) => b.luot - a.luot).slice(0, 40);
    const man = Object.keys(st.man).map(m => [m, st.man[m]]).sort((a, b) => b[1] - a[1]);
    const td = 'padding:4px 6px;border-bottom:1px solid #eee;vertical-align:top';
    const phut = Math.max(1, Math.round((Date.now() - st.batDau) / 60000));
    return '<div style="font:700 16px sans-serif;margin-bottom:6px">📊 ' + st.tong.toLocaleString('vi-VN') + ' lượt đọc · ' + phut + ' phút · ngày ' + esc(st.ngay) + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">'
      + '<button data-dld="moc" style="padding:10px 14px;font-weight:700">Đặt mốc</button>'
      + '<button data-dld="chep" style="padding:10px 14px;font-weight:700">Chép kết quả</button>'
      + '<button data-dld="xoa" style="padding:10px 14px">Xoá số đếm</button>'
      + '<button data-dld="dong" style="padding:10px 14px;margin-left:auto">Đóng</button></div>'
      + '<div id="__dld_chep"></div>'
      + ((st.moc || []).length ? '<div style="font-weight:700;margin-top:6px">Các mốc</div><table style="border-collapse:collapse;width:100%;font-size:13px">'
        + st.moc.map(m => '<tr><td style="' + td + '">' + esc(m.ten) + '</td><td style="' + td + ';text-align:right">' + m.luot + ' lượt</td><td style="' + td + ';text-align:right">' + m.giay + ' giây</td></tr>').join('') + '</table>' : '')
      + '<div style="font-weight:700;margin-top:10px">Theo màn</div><table style="border-collapse:collapse;width:100%;font-size:13px">'
      + man.map(m => '<tr><td style="' + td + '">' + esc(m[0]) + '</td><td style="' + td + ';text-align:right">' + m[1] + '</td></tr>').join('') + '</table>'
      + '<div style="font-weight:700;margin-top:10px">Tốn nhất (lượt · số lần · collection · hàm · nơi gọi)</div><table style="border-collapse:collapse;width:100%;font-size:12px">'
      + dong.map(d => '<tr><td style="' + td + ';text-align:right;font-weight:700">' + d.luot + '</td><td style="' + td + ';text-align:right">' + d.lan + '</td><td style="' + td + '">' + esc(d.coll) + '<br><span style="color:#888">' + esc(d.kieu) + '</span></td><td style="' + td + '">' + esc(d.ham) + '</td><td style="' + td + ';color:#888">' + esc(d.noi) + '</td></tr>').join('') + '</table>';
  }
  function moBang() {
    let ov = document.getElementById('__dld_ov');
    if (!ov) {
      ov = document.createElement('div'); ov.id = '__dld_ov';
      ov.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto';
      ov.innerHTML = '<div id="__dld_box" style="background:#fff;color:#111;max-width:900px;width:100%;border-radius:12px;padding:14px;font:14px sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.3)"></div>';
      ov.addEventListener('click', ev => {
        const b = ev.target.closest && ev.target.closest('[data-dld]');
        if (ev.target === ov) { ov.remove(); return; }
        if (!b) return;
        const k = b.getAttribute('data-dld'), D = root.demLuotDoc;
        if (k === 'dong') { ov.remove(); return; }
        if (k === 'moc') { const ten = prompt('Tên việc VỪA LÀM xong (vd: mở Tháng kết):', ''); if (ten == null) return; D.moc(ten); }
        if (k === 'xoa') { if (!confirm('Xoá toàn bộ số đã đếm hôm nay?')) return; D.datLai(); }
        if (k === 'chep') {
          const s = D.xuat();
          const hien = () => { const c = document.getElementById('__dld_chep'); if (c) { c.innerHTML = '<div style="margin:6px 0">Chưa chép tự động được — chạm vào ô, chọn tất cả rồi chép:</div><textarea readonly style="width:100%;height:120px;font:11px monospace">' + esc(s) + '</textarea>'; const t = c.querySelector('textarea'); t.focus(); t.select(); } };
          try { navigator.clipboard.writeText(s).then(() => alert('Đã chép kết quả — dán vào tin nhắn gửi Claude.'), hien); } catch (e) { hien(); }
          return;
        }
        document.getElementById('__dld_box').innerHTML = veBang();
      });
      document.body.appendChild(ov);
    }
    document.getElementById('__dld_box').innerHTML = veBang();
  }
  function ganNut() {
    if (!document.body || document.getElementById('__dld_nut')) return;
    const nut = document.createElement('button'); nut.id = '__dld_nut'; nut.type = 'button';
    nut.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483645;background:rgba(17,24,39,.85);color:#fff;border:0;border-radius:18px;padding:6px 10px;font:700 13px sans-serif';
    nut.addEventListener('click', ev => { ev.stopPropagation(); moBang(); });
    document.body.appendChild(nut);
    const capNhat = () => { try { nut.textContent = '📊 ' + root.demLuotDoc._st().tong.toLocaleString('vi-VN'); } catch (e) {} };
    capNhat(); setInterval(capNhat, 2000);
  }
  if (typeof document !== 'undefined') {
    if (document.body) ganNut(); else document.addEventListener('DOMContentLoaded', ganNut);
  }
  const daCo = root.demLuotDoc._st().tong;
  console.log('[demLuotDoc] Đang đếm' + (daCo ? ' (tiếp từ ' + daCo + ' lượt đã đếm hôm nay)' : '') + '. Gõ demLuotDoc.bang() để xem.');
})(typeof window !== 'undefined' ? window : this);
