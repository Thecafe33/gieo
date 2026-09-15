/**
 * QUANLY entry — THIN MANAGEMENT UI.
 *
 * Giai đoạn hiện tại: SCAFFOLD, READ-ONLY. Chưa nối Firebase.
 * Hiển thị bộ luật import-direction đang có hiệu lực, để ranh giới kiến trúc
 * là thứ nhìn thấy được chứ không nằm im trong tài liệu.
 */
GIEO.define('app-quanly/main', [
  'shared-kernel/clock',
  'shared-kernel/result'
], function (clock, R) {
  'use strict';

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
    });
  }

  function start() {
    var c = clock.createClock();
    var el = document.getElementById('app');
    var rules = GIEO._getRules();
    var mods = GIEO.inventory();

    var rows = Object.keys(rules.layers).map(function (name) {
      var allowed = rules.layers[name].canImport;
      var count = mods.filter(function (m) { return m.layer === name; }).length;
      return '<tr>' +
        '<td style="padding:4px 8px"><code>' + name + '</code></td>' +
        '<td style="padding:4px 8px;text-align:right;color:' + (count ? '#000' : '#bbb') + '">' + count + '</td>' +
        '<td style="padding:4px 8px;color:#555">' +
          (allowed.length ? allowed.map(esc).join(', ') : '<em style="color:#999">không phụ thuộc gì</em>') +
        '</td></tr>';
    }).join('');

    el.innerHTML =
      '<h1 style="font-size:18px;margin:0 0 4px">GIEO Quản lý</h1>' +
      '<p style="margin:0 0 16px;color:#666">Scaffold — READ-ONLY. ' + esc(c.calendarDate()) + '</p>' +
      '<p style="padding:8px 12px;border-radius:6px;background:#e8f5e9">' +
        mods.length + ' module đã nạp, 0 vi phạm import-direction ' +
        '<span style="color:#666">(registry chặn ngay lúc nạp trang)</span></p>' +
      '<h2 style="font-size:14px;margin-top:20px">Bộ luật import-direction đang hiệu lực</h2>' +
      '<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:13px;min-width:560px">' +
        '<thead><tr style="text-align:left;border-bottom:1px solid #ddd">' +
          '<th style="padding:4px 8px">Layer</th>' +
          '<th style="padding:4px 8px;text-align:right">Module</th>' +
          '<th style="padding:4px 8px">Được import</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<h2 style="font-size:14px;margin-top:20px">Luật cứng</h2>' +
      '<ul style="padding-left:18px;color:#555">' +
        rules.hardRules.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') +
      '</ul>';

    return R.ok(true);
  }

  return { start: start };
});
