/**
 * GIEO module registry — hệ thống module tối thiểu cho HTML tự chứa.
 *
 * Vì sao tồn tại: đã chốt stack HTML thuần, không build/bundler, nên không có
 * `dependency-cruiser` để enforce import-direction. Blueprint §2 quy tắc 5 nói
 * rõ vi phạm import-direction phải FAIL chứ không phải "review sau". Registry
 * này enforce đúng luật đó NGAY LÚC NẠP TRANG, bằng chính bộ luật ở
 * src/layer-rules.json — cùng 1 nguồn với checker offline tools/.
 *
 * Đây KHÔNG phải cấu trúc code legacy. Legacy là 50k dòng phẳng, mọi hàm gọi
 * thẳng mọi hàm, không có ranh giới nào. Ở đây mỗi module phải khai báo tường
 * minh nó thuộc layer nào và phụ thuộc gì, và khai báo sai thì trang không chạy.
 */
(function (global) {
  'use strict';

  /* Build script thay thế token dưới bằng nội dung src/layer-rules.json.
     Khi chạy trực tiếp trong Node (checker/test) thì nạp qua GIEO._loadRules(). */
  var LAYER_RULES = /*__LAYER_RULES__*/ null;

  var modules = Object.create(null);
  var cache = Object.create(null);
  var loading = Object.create(null);

  function fail(msg) {
    throw new Error('[GIEO] ' + msg);
  }

  function layerOf(id) {
    var i = id.indexOf('/');
    if (i <= 0) fail('id module phải dạng "<layer>/<ten>", nhận được: "' + id + '"');
    return id.slice(0, i);
  }

  function rulesFor(layer) {
    if (!LAYER_RULES) fail('chưa nạp layer-rules');
    var r = LAYER_RULES.layers[layer];
    if (!r) fail('layer không tồn tại trong layer-rules.json: "' + layer + '"');
    return r;
  }

  /**
   * Kiểm tra 1 cạnh phụ thuộc. Tách riêng để checker offline dùng lại y hệt —
   * runtime và CI không được phép hiểu luật khác nhau.
   */
  function checkEdge(fromId, toId) {
    var from = layerOf(fromId);
    var to = layerOf(toId);
    if (from === to) return null; // trong cùng layer: tự do
    var allowed = rulesFor(from).canImport;
    rulesFor(to);
    if (allowed.indexOf(to) === -1) {
      return 'VI PHẠM IMPORT-DIRECTION: "' + fromId + '" (layer ' + from +
        ') không được import "' + toId + '" (layer ' + to + '). ' +
        'Layer ' + from + ' chỉ được import: [' + allowed.join(', ') + ']. ' +
        'Xem GIEO-CODE-STRUCTURE-BLUEPRINT-V1.md §2 và src/layer-rules.json.';
    }
    return null;
  }

  function define(id, deps, factory) {
    if (typeof id !== 'string') fail('define() cần id dạng chuỗi');
    if (!Array.isArray(deps)) fail('define("' + id + '") cần mảng deps (dùng [] nếu không có)');
    if (typeof factory !== 'function') fail('define("' + id + '") cần factory là hàm');
    if (modules[id]) fail('module trùng id: "' + id + '"');
    layerOf(id);

    for (var i = 0; i < deps.length; i++) {
      var err = checkEdge(id, deps[i]);
      if (err) fail(err);
    }
    modules[id] = { deps: deps, factory: factory };
  }

  function require(id) {
    if (cache[id]) return cache[id];
    var m = modules[id];
    if (!m) fail('không tìm thấy module "' + id + '". Thiếu khai báo define() hoặc sai thứ tự nạp?');
    if (loading[id]) fail('phụ thuộc vòng khi nạp "' + id + '"');
    loading[id] = true;

    var resolved = [];
    for (var i = 0; i < m.deps.length; i++) resolved.push(require(m.deps[i]));

    var exports = m.factory.apply(null, resolved);
    if (exports === undefined) fail('module "' + id + '" không return gì. Factory phải return object exports.');
    delete loading[id];
    cache[id] = exports;
    return exports;
  }

  /** Báo cáo toàn bộ module đã đăng ký — dùng cho self-test lúc khởi động. */
  function inventory() {
    return Object.keys(modules).sort().map(function (id) {
      return { id: id, layer: layerOf(id), deps: modules[id].deps.slice() };
    });
  }

  global.GIEO = {
    define: define,
    require: require,
    inventory: inventory,
    checkEdge: checkEdge,
    layerOf: layerOf,
    _setRules: function (r) { LAYER_RULES = r; },
    _getRules: function () { return LAYER_RULES; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.GIEO;
