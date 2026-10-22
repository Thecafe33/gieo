// Sinh 3 BỘ FILE DEPLOY theo mùa vào ban_deploy/ (đặt sẵn đúng tên — tải thư mục về, chép đè vào thư mục deploy):
//   ban_deploy/thuong/     — bản BÌNH THƯỜNG (không Gấu Noel, không lì xì)
//   ban_deploy/giangsinh/  — bản GIÁNG SINH 2026 (Gấu Noel ở pos / PosX / posgieo / kiosk + index Giáng sinh)
//   ban_deploy/tet/        — bản TẾT 2027 (lì xì ở pos / PosX / index Tết; không Gấu Noel)
// Mỗi bộ gồm các app trong repo + đúng các file .js mà app trong bộ đó nạp (tự dò thẻ <script src>).
// File gốc vẫn ở gốc repo (tool sinh bản / test / predeploy đọc ở đó) — KHÔNG sửa tay trong ban_deploy/.
//
//   node tools/tao_bo_deploy.js        (chạy sau tools/tao_ban_tet.js, tao_ban_giangsinh.js, tao_ban_thu.js)
// Sửa file gốc → chạy lại; tests/bo_deploy.test.js báo nếu quên.
'use strict';
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'ban_deploy');
const { boGauNoel } = require('./gau_noel/bo_gau.js');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const giu = f => () => rd(f), go = f => () => boGauNoel(rd(f));

// tên trong bộ → cách lấy nội dung
const CHUNG = { 'quanlygieo2.html': giu('quanlygieo2.html'), 'quanlygieo.html': giu('quanlygieo.html'), 'manage.html': giu('manage.html'), 'quanlygieo_thu.html': giu('quanlygieo_thu.html') };
const BO = {
  thuong: Object.assign({}, CHUNG, {
    'pos.html': go('pos.html'), 'PosX.html': go('PosX.html'), 'posgieo.html': go('posgieo.html'), 'posgieo_thu.html': go('posgieo_thu.html'),
    'kiosk.html': go('kiosk.html'), 'index.html': giu('index.html')
  }),
  giangsinh: Object.assign({}, CHUNG, {
    'pos.html': giu('pos.html'), 'PosX.html': giu('PosX.html'), 'posgieo.html': giu('posgieo.html'), 'posgieo_thu.html': giu('posgieo_thu.html'),
    'kiosk.html': giu('kiosk.html'), 'index.html': giu('index_giangsinh.html')
  }),
  tet: Object.assign({}, CHUNG, {
    'pos.html': giu('pos_tet.html'), 'PosX.html': giu('PosX_tet.html'), 'posgieo.html': go('posgieo.html'), 'posgieo_thu.html': go('posgieo_thu.html'),
    'kiosk.html': go('kiosk.html'), 'index.html': giu('index_tet.html')
  })
};
const MO_TA = {
  thuong: 'BẢN BÌNH THƯỜNG — không Gấu Noel, không lì xì',
  giangsinh: 'BẢN GIÁNG SINH 2026 — Gấu Noel (pos / PosX / posgieo / kiosk) + index Giáng sinh',
  tet: 'BẢN TẾT 2027 — lì xì (pos / PosX / index Tết), không Gấu Noel'
};

// .js cục bộ app nạp: <script src="x.js?…"> và document.write('<scr'+'ipt src="x.js?…">')
function jsCuaApp(h) {
  const out = new Set(), re = /src=\\?"([A-Za-z0-9_.-]+\.js)(?:\?[^"\\]*)?\\?"/g; let m;
  const bo = h.replace(/<!--[\s\S]*?-->/g, '');
  while ((m = re.exec(bo))) out.add(m[1]);
  return [...out];
}
/** Nội dung từng bộ: { bo: { tên: Buffer|string } } */
function dung() {
  const kq = {};
  for (const ten of Object.keys(BO)) {
    const files = {}, js = new Set();
    for (const [dst, lay] of Object.entries(BO[ten])) { files[dst] = lay(); jsCuaApp(files[dst]).forEach(f => js.add(f)); }
    // HTML cũ còn trong cache vẫn xin các bộ tính immutable đã phát hành.
    if([...js].some(f=>/^lai_lo\.v\d+\.js$/.test(f)))
      fs.readdirSync(ROOT).filter(f=>/^lai_lo\.v\d+\.js$/.test(f)).forEach(f=>js.add(f));
    if([...js].some(f=>/^cham_cong\.v\d+\.js$/.test(f)))
      fs.readdirSync(ROOT).filter(f=>/^cham_cong\.v\d+\.js$/.test(f)).forEach(f=>js.add(f));
    if([...js].some(f=>/^gieo_automation(?:_pos)?\.v\d+\.js$/.test(f)))
      fs.readdirSync(ROOT).filter(f=>/^gieo_automation(?:_pos)?\.v\d+\.js$/.test(f)).forEach(f=>js.add(f));
    // Giữ các bản Engine immutable đã phát hành: Hosting thay release có thể phục vụ HTML còn cache.
    if([...js].some(f=>/^unit_engine\.v\d+\.js$/.test(f)))
      fs.readdirSync(ROOT).filter(f=>/^unit_engine\.v\d+\.js$/.test(f)).forEach(f=>js.add(f));
    if([...js].some(f=>/^(?:unit_engine2(?:_store)?|gieo_engine2_pos)_v\d+\.js$/.test(f)))
      fs.readdirSync(ROOT).filter(f=>/^(?:unit_engine2(?:_store)?|gieo_engine2_pos)_v\d+\.js$/.test(f)).forEach(f=>js.add(f));
    for (const f of [...js].sort()) {
      if (!fs.existsSync(path.join(ROOT, f))) throw new Error(ten + ': app nạp ' + f + ' nhưng repo không có file này');
      files[f] = fs.readFileSync(path.join(ROOT, f));
    }
    files['DANH_SACH.txt'] = MO_TA[ten] + '\n\nChép TẤT CẢ file dưới đây vào thư mục deploy (ghi đè), rồi firebase deploy --only hosting.\n' +
      'Không xoá các file .js bản cũ đang có trong thư mục deploy (máy còn bản HTML cũ trong bộ nhớ đệm vẫn xin chúng).\n\n' +
      Object.keys(files).filter(f => f !== 'DANH_SACH.txt').sort().map(f => '  ' + f).join('\n') + '\n';
    kq[ten] = files;
  }
  return kq;
}
module.exports = { BO, dung, jsCuaApp, OUT };

if (require.main === module) {
  const kq = dung();
  for (const ten of Object.keys(kq)) {
    const dir = path.join(OUT, ten);
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    for (const [f, c] of Object.entries(kq[ten])) fs.writeFileSync(path.join(dir, f), c);
    console.log('✅ ban_deploy/' + ten + ' — ' + Object.keys(kq[ten]).length + ' file');
  }
}
