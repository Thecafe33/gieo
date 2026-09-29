// E6 — engine biết storeId + giờ máy chủ (C1, mục 6.5) + R3 cho Quản lý.
'use strict';
const { makeFake } = require('./lib/fakefb');
const { loadEngineModule } = require('./lib/engine');
let ok = true;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', m); };
const INV = 'inventory_items_gieogieo', CTN = 'stock_containers_gieogieo';
const ITEM = { name: 'Sữa', unit: 'ml', trackingMode: 'unit', currentStock: 999, countUnitName: 'Hộp', packagingUnits: [{ name: 'Hộp', baseQty: 1000 }] };
const seed = extra => ({
  rt: { active_units_gieogieo: { X: { A: { code: 'AAA', unitBase: 300, capacity: 1000, openedAt: 1 } } }, ...(extra || {}) },
  fs: { [INV + '/X']: { ...ITEM }, [CTN + '/A']: { itemId: 'X', code: 'AAA', status: 'open', unitBase: 300, baseQty: 1000 }, [CTN + '/S']: { itemId: 'X', code: 'SSS', status: 'sealed', baseQty: 1000 } }
});
const mk = (cfg, extraRt) => {
  const fake = makeFake(seed(extraRt)); const UE = loadEngineModule();
  UE.init({ fstore: fake.fstore, db: fake.db, FieldValue: fake.FieldValue, businessDate: () => '2026-09-28', ...cfg });
  return { fake, UE };
};
(async () => {
  // ── Giờ máy chủ ──
  {
    const { UE } = mk({ app: 'pos', serverClock: true }, { '.info': { serverTimeOffset: 3600000 } });
    const d = UE.clock.now() - Date.now();
    eq(d > 3599000 && d < 3601000, true, 'C1 now() = giờ máy + .info/serverTimeOffset');
    eq([UE.clock.offset(), UE.clock.isServer()], [3600000, true], 'C1 offset đọc từ RT');
  }
  {
    const { UE } = mk({ app: 'pos', serverClock: true });
    eq(UE.clock.offset(), 0, 'C1 chưa có offset → 0 (không chờ)');
  }
  {
    const { UE } = mk({ app: 'pos' }, { '.info': { serverTimeOffset: 3600000 } });
    eq([UE.clock.offset(), UE.clock.isServer()], [0, false], 'C1 không bật serverClock → giờ máy');
  }
  // ── Mốc B9 / R3 ──
  const T = 1790000000000;
  const withClock = app => { let t = T; return mk({ app, serverClock: true, now: () => (t += 1000) }); };
  {
    const { fake, UE } = withClock('quanly');
    await fake.fstore.collection(INV).doc('X').update({ _ueLastRecomputeStart: T + 30000, currentStock: 777 });
    const v = await UE.stock.recompute('X');
    eq([v, fake.FS[INV + '/X'].currentStock], [777, 777], 'R3 Quản lý: có lượt MỚI HƠN → không đè, trả tồn mới hơn (không null)');
  }
  {
    const { fake, UE } = withClock('quanly');
    const v = await UE.stock.recompute('X');
    eq([v, fake.FS[INV + '/X'].currentStock, typeof fake.FS[INV + '/X']._ueLastRecomputeStart], [1300, 1300, 'number'], 'R3 Quản lý: ghi tồn theo mã + ghi mốc');
  }
  {
    const { fake, UE } = withClock('pos');
    await fake.fstore.collection(INV).doc('X').update({ _ueLastRecomputeStart: T + 11 * 60000, currentStock: 777 });
    const v = await UE.stock.recompute('X');
    eq([v, fake.FS[INV + '/X'].currentStock, fake.FS[INV + '/X']._ueLastRecomputeStart < T + 11 * 60000], [1300, 1300, true], '6.5 mốc "tương lai" (> now+10 phút) bị bỏ qua và ghi đè');
  }
  {
    // chưa bật giờ máy chủ: KHÔNG bỏ qua mốc tương lai (giờ các máy chưa thống nhất)
    let t = T; const { fake, UE } = mk({ app: 'pos', now: () => (t += 1000) });
    await fake.fstore.collection(INV).doc('X').update({ _ueLastRecomputeStart: T + 11 * 60000, currentStock: 777 });
    const v = await UE.stock.recompute('X');
    eq([v, fake.FS[INV + '/X'].currentStock], [null, 777], 'không serverClock: mốc tương lai vẫn chặn (như trước E6)');
  }
  // ── storeId ──
  {
    let t = T; const { fake, UE } = mk({ app: 'pos', now: () => (t += 1000), storeId: 'gg01' });
    eq(UE.P.storeId(), 'gg01', 'P.storeId()');
    await UE.ledger.apply({ itemId: 'X', type: 'WASTE', qty: -100, note: 'đổ', staff: 'NV', referenceId: 'A', txId: 'w1', deriveFromUnits: true });
    await UE.anomaly.log('an1', { itemId: 'X', qty: -5, kind: 'test' });
    eq([fake.FS['stock_transactions_gieogieo/w1'].storeId, fake.FS['stock_anomalies_gieogieo/an1'].storeId], ['gg01', 'gg01'], 'bản ghi mới mang storeId');
    eq(fake.FS[INV + '/X'].storeId, undefined, 'doc có sẵn (update) không bị gắn thêm storeId');
  }
  {
    let t = T; const { fake, UE } = mk({ app: 'pos', now: () => (t += 1000), storeId: 'gg02' });
    await UE.ledger.apply({ itemId: 'X', type: 'WASTE', qty: -100, note: 'đổ', staff: 'NV', referenceId: 'A', txId: 'w2', deriveFromUnits: true });
    eq(fake.FS['stock_transactions_gieogieo/w2'].storeId, 'gg02', 'storeId lấy theo cấu hình init');
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL');
})();
