'use strict';
// Một hàm HTTP duy nhất cho việc duyệt máy. KHÔNG nằm trong luồng bán hàng:
// chỉ được gọi lúc máy mới xin duyệt, lúc máy cũ tự chuyển (một lần) và từ manage.html.
const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { createCore, LoiBaoMat } = require('./core');
const cfg = require('./cau_hinh.json');

initializeApp();
const core = createCore({ db: getFirestore(), auth: getAuth(), cfg });

async function nguoiGoi(req) {
  const m = /^Bearer (.+)$/.exec(req.get('Authorization') || '');
  if (!m) return null;
  try { const t = await getAuth().verifyIdToken(m[1]); return { uid: t.uid, email: t.email || '' }; }
  catch (e) { throw new LoiBaoMat('phien_khong_hop_le', 401); }
}

exports.gieoBaoMat = onRequest({ region: 'asia-southeast1', cors: true, maxInstances: 3, timeoutSeconds: 30, memory: '256MiB' }, async (req, res) => {
  try {
    if (req.method !== 'POST') throw new LoiBaoMat('chi_nhan_post', 405);
    const b = (req.body && typeof req.body === 'object') ? req.body : {};
    let kq;
    if (b.viec === 'xin_duyet') kq = await core.xinDuyet(b);
    else if (b.viec === 'nhan_quyen') kq = await core.nhanQuyen(b);
    else if (b.viec === 'tu_chuyen') kq = await core.tuChuyen(b, await nguoiGoi(req));
    else kq = await core.quanLy(b, await nguoiGoi(req));
    res.json(Object.assign({ ok: true }, kq));
  } catch (e) {
    if (e instanceof LoiBaoMat) { res.status(e.http).json({ ok: false, loi: e.ma }); return; }
    console.error('[gieoBaoMat]', e);
    res.status(500).json({ ok: false, loi: 'loi_may_chu' });
  }
});
