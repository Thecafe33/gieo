// Nạp unit_engine.v1.js trong một vm riêng (chưa init) — dùng cho test cần hàm thuần của engine
// hoặc cần tự init với Firebase giả.
const fs = require('fs'); const path = require('path'); const vm = require('vm');
function loadEngineModule(file = require('./engine_file')) {
  const sb = { console: process.env.DEBUG ? console : { log() {}, warn() {}, error() {}, info() {} }, setTimeout, clearTimeout, setImmediate, Promise, Uint8Array };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '..', '..', file), 'utf8'), sb, { filename: file });
  return sb.UnitEngine;
}
module.exports = { loadEngineModule };
