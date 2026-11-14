'use strict';
// Duyệt máy — phần lõi, không phụ thuộc Firebase (để test bằng đồ giả).
// Kế hoạch: docs/KE_HOACH_BAO_MAT_BACKEND_14-11.md
//
// Trạng thái một máy (tài liệu trong collection `cfg.collection`):
//   cho        máy mới xin duyệt, chờ quản lý bấm ở manage
//   duyet      quản lý đã duyệt, máy chưa tới lấy vé đăng nhập
//   hoat_dong  máy đã lấy vé (đang dùng)
//   tu_choi    quản lý từ chối
//   thu_hoi    quản lý thu hồi (tài khoản của máy bị vô hiệu)
const crypto = require('crypto');

const CHU_MA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ 0/O/1/I dễ nhầm
// kiosk.html KHÔNG nằm trong danh sách (chủ dự án chốt 14/11): màn hình phụ khó nhập liệu, khách không thể chờ duyệt —
// kiosk giữ cách đăng nhập cũ.
const APP_HOP_LE = new Set(['posgieo', 'pos', 'posx', 'quanlygieo', 'kiem_toan_kho']);

class LoiBaoMat extends Error {
  constructor(ma, http) { super(ma); this.ma = ma; this.http = http || 400; }
}
const bam = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const bangNhau = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const gonChu = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const uidCuaMay = id => 'may_' + id;

function createCore({ db, auth, cfg, now = () => Date.now(), randomBytes = n => crypto.randomBytes(n) }) {
  const col = () => db.collection(cfg.collection);
  const hanMs = cfg.hanXinDuyetPhut * 60 * 1000;
  const laQuanLy = nguoi => !!(nguoi && nguoi.email && cfg.quanLyEmails.includes(String(nguoi.email).toLowerCase()));
  const doiQuanLy = nguoi => { if (!laQuanLy(nguoi)) throw new LoiBaoMat('khong_co_quyen', 403); };
  const taoMa = () => Array.from(randomBytes(4), b => CHU_MA[b % CHU_MA.length]).join('');
  const kiemApp = app => { const a = String(app || '').toLowerCase(); if (!APP_HOP_LE.has(a)) throw new LoiBaoMat('app_khong_hop_le'); return a; };

  // Máy mới (chưa đăng nhập) gửi yêu cầu. Trả mã 4 ký tự để hiện lên màn hình + khoá riêng để lát lấy vé.
  async function xinDuyet({ ten, app }) {
    app = kiemApp(app);
    const t = now();
    const cho = await col().where('trangThai', '==', 'cho').get();
    let conHan = 0;
    for (const d of cho.docs) {
      if ((d.data().hetHan || 0) <= t) await d.ref.delete();   // dọn yêu cầu quá hạn
      else conHan++;
    }
    if (conHan >= cfg.toiDaChoDuyet) throw new LoiBaoMat('qua_nhieu_yeu_cau', 429);
    const khoa = randomBytes(24).toString('hex');
    const ref = col().doc();
    const ma = taoMa();
    await ref.set({ trangThai: 'cho', ma, ten: gonChu(ten, 40) || 'Máy chưa đặt tên', app, khoaBam: bam(khoa), taoLuc: t, hetHan: t + hanMs, nguon: 'xin_duyet' });
    return { id: ref.id, ma, khoa, hetHan: t + hanMs };
  }

  // Máy hỏi «đã được duyệt chưa» — được rồi thì nhận vé đăng nhập (custom token).
  async function nhanQuyen({ id, khoa }) {
    if (!id || !khoa) throw new LoiBaoMat('thieu_thong_tin');
    const ref = col().doc(String(id));
    const snap = await ref.get();
    if (!snap.exists) return { trangThai: 'khong_co' };
    const d = snap.data();
    if (!d.khoaBam || !bangNhau(d.khoaBam, bam(khoa))) throw new LoiBaoMat('sai_khoa', 403);
    const t = now();
    if (d.trangThai === 'cho') return t >= d.hetHan ? { trangThai: 'het_han' } : { trangThai: 'cho' };
    if (d.trangThai === 'duyet' || (d.trangThai === 'hoat_dong' && t - (d.capLuc || 0) <= cfg.capLaiTrongGiay * 1000)) {
      // «hoat_dong» trong vài phút đầu vẫn cấp lại: phòng vé lần trước rơi giữa đường (mạng chập chờn).
      const ve = await auth.createCustomToken(uidCuaMay(ref.id), { may: true, app: d.app });
      if (d.trangThai === 'duyet') await ref.update({ trangThai: 'hoat_dong', capLuc: t });
      return { trangThai: 'hoat_dong', ve };
    }
    return { trangThai: d.trangThai === 'hoat_dong' ? 'da_cap' : d.trangThai };   // tu_choi / thu_hoi / da_cap
  }

  // Máy ĐANG chạy bằng tài khoản chung cũ → âm thầm đổi sang danh tính riêng (không cần ai duyệt).
  async function tuChuyen({ ten, app }, nguoi) {
    doiQuanLy(nguoi);
    app = kiemApp(app);
    const t = now(), ref = col().doc();
    const ve = await auth.createCustomToken(uidCuaMay(ref.id), { may: true, app });
    await ref.set({ trangThai: 'hoat_dong', ten: gonChu(ten, 40) || 'Máy chưa đặt tên', app, taoLuc: t, capLuc: t, nguon: 'tu_chuyen' });
    return { id: ref.id, ve };
  }

  // Quản lý (manage.html): duyệt / từ chối / thu hồi / đổi tên.
  async function quanLy({ viec, id, ten }, nguoi) {
    doiQuanLy(nguoi);
    if (!id) throw new LoiBaoMat('thieu_thong_tin');
    const ref = col().doc(String(id));
    const snap = await ref.get();
    if (!snap.exists) throw new LoiBaoMat('khong_co', 404);
    const d = snap.data(), t = now();
    if (viec === 'duyet' || viec === 'tu_choi') {
      if (d.trangThai !== 'cho') throw new LoiBaoMat('khong_con_cho');
      if (viec === 'duyet' && t >= d.hetHan) throw new LoiBaoMat('het_han');
      await ref.update({ trangThai: viec, xuLyLuc: t, xuLyBoi: nguoi.email });
      return { trangThai: viec };
    }
    if (viec === 'thu_hoi') {
      const uid = uidCuaMay(ref.id);
      try { await auth.updateUser(uid, { disabled: true }); await auth.revokeRefreshTokens(uid); }
      catch (e) { if (!e || e.code !== 'auth/user-not-found') throw e; }   // máy chưa từng đăng nhập thì chưa có tài khoản
      await ref.update({ trangThai: 'thu_hoi', xuLyLuc: t, xuLyBoi: nguoi.email });
      return { trangThai: 'thu_hoi' };
    }
    if (viec === 'doi_ten') {
      const moi = gonChu(ten, 40);
      if (!moi) throw new LoiBaoMat('thieu_thong_tin');
      await ref.update({ ten: moi });
      return { ten: moi };
    }
    throw new LoiBaoMat('viec_khong_hop_le');
  }

  return { xinDuyet, nhanQuyen, tuChuyen, quanLy, laQuanLy };
}

module.exports = { createCore, LoiBaoMat, uidCuaMay, CHU_MA };
