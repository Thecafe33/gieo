// Lỗi vận hành: 6 bịch (2.000g/bịch) bị hiểu thành 6 thùng (12.000g/thùng).
// Chạy hàm POS thật -> ledger/phiếu nhận/PO -> Unit Engine thật trên Firebase giả.
'use strict';
const assert = require('assert/strict');
const { extract } = require('./lib/extract');
const { makeFake } = require('./lib/fakefb');
const { loadCore } = require('./lib/core_loader');
const ITEM = { id: 'pearl', name: 'Trân châu trắng', unit: 'g', trackingMode: 'unit',
  countUnitName: 'Bịch', packagingUnits: [{ name: 'Bịch', baseQty: 2000 }, { name: 'Thùng', baseQty: 12000 }], currentStock: 0 };
const COLL = 'stock_containers_gieogieo/';
const names = ['escHtmlPos', 'poReceiveDefaultUnit', 'poReceiveUnitOptions', 'poReceiveQuantities', 'poReceivePreviewHtml',
  'poReceiveAddFreeLine', 'poReceiveLineChangeItem', 'poReceiveLineChangeField', 'poReceiveRefreshLinePreview',
  'poReceiveLineCardHtml', 'poReceiveStepperHtml', 'poReceiveStepQty', 'poLineQtyText', 'poSelectPO',
  'poReceiveMergeRecord', 'poReceiveUpdatePODoc', 'submitPoReceive', '_submitPoReceiveImpl'];
const source = extract('posgieo.html', names);
function make({ item = ITEM, po = null, confirm = true, failPO = false, onResolve, onUpload, validStaff = true } = {}) {
  item = JSON.parse(JSON.stringify(item));
  const items = [item], pending = po ? [po] : [];
  const fake = makeFake({ fs: { ['inventory_items_gieogieo/' + item.id]: item,
    ...(po ? { ['purchase_orders_gieogieo/' + po.id]: po } : {}) } });
  const UE = loadCore('engine', fake, { items, businessDate: '2026-10-19' }).__UE;
  const calls = { toast: [], confirms: [], printed: 0, rendered: 0 };
  const chips = { innerHTML: '' };
  const body = { innerHTML: '', inert: false };
  const env = { UnitEngine: UE, fstore: fake.fstore, firebase: fake.firebase, console: { ...console, error() {} },
    document: { getElementById: id => id==='poReceiveBody' ? body : (id.startsWith('polChips') ? chips : { value: '' }) },
    renderPoReceiveForm: () => calls.rendered++, dsOpenItemPicker: o => o.onPick(item),
    resolveStaffPinAndCheckin: async () => { if(onResolve) await onResolve(api, item, body); return validStaff ? { id: 'staff', fullName: 'Nhân viên thử' } : null; },
    toast: msg => calls.toast.push(msg), posConfirm: async text => { calls.confirms.push(text); return confirm; },
    poReceiveUploadPhotos: async () => { if(onUpload) await onUpload(api, item); return []; }, posDateKey: () => '2026-10-19',
    openStockLabelScreen: () => calls.printed++, showScreen() {}, loadKhoScreen() {},
    fmtPrepQty: n => Number(n).toLocaleString('vi-VN'), round2: n => Math.round(n * 100) / 100 };
  const ks = Object.keys(env);
  const api = new Function(...ks, 'items', 'pending', 'failPO', `
    let KHO_ITEMS_CACHE=items, POS_PENDING_PO_CACHE=pending, _stockLabelQueue=[], _posSubmitBusy=false;
    let poReceiveState={poId:null,supplier:'',lines:[],photoFiles:[],idemKey:'recv_case'};
    const STOCK_CONTAINERS_COLL='stock_containers_gieogieo';
    ${source}
    const updatePO=poReceiveUpdatePODoc;
    poReceiveUpdatePODoc=async (...args)=>{if(failPO){failPO=false;throw new Error('mất mạng thử');}return updatePO(...args);};
    return {${names.join(',')}, get state(){return poReceiveState;},
      setState(v){poReceiveState=v;KHO_ITEMS_CACHE=items;}, get tags(){return _stockLabelQueue;}};
  `)(...ks.map(k => env[k]), items, pending, failPO);
  const tags = () => Object.entries(fake.FS).filter(([p]) => p.startsWith(COLL)).map(([, d]) => d);
  return { api, fake, calls, chips, tags, item, body };
}
function addSelected(h, factor = 2000) {
  h.api.poReceiveAddFreeLine();
  h.api.poReceiveLineChangeField(0, 'unitFactor', factor);
}
const poOf = (factor = 2000, qty = 6) => ({ id: 'po1', status: 'pending', supplier: 'NCC thử', lines: [{
  itemId: ITEM.id, name: ITEM.name, unit: 'g', orderUnitName: factor === 2000 ? 'Bịch' : 'Thùng',
  orderUnitFactor: factor, qtyExpectedBase: factor * qty, receivedGoodBase: 0 }] });
function checkReceipt(h, qty, grams) {
  assert.equal(h.tags().length, qty);
  assert.ok(h.tags().every(t => t.baseQty === 2000 && t.unitBase === 2000 && t.countUnitName === 'Bịch'));
  assert.equal(h.fake.FS['inventory_items_gieogieo/pearl'].currentStock, grams);
  const row = h.fake.FS['receiving_records_gieogieo/recv_case'].lines[0];
  assert.equal(row.qtyGoodBase, grams);
  assert.equal(row.qtyGoodReceived * row.receiveUnitFactor, grams);
}
(async () => {
  {
    const h = make(); addSelected(h);
    assert.equal(h.api.state.lines[0].unitFactor, 2000);
    h.api.poReceiveLineChangeField(0, 'goodQty', 6);
    assert.match(h.chips.innerHTML, /Nhận 6 Bịch/); assert.match(h.chips.innerHTML, /Tạo 6 mã NL/);
    const html = h.api.poReceiveLineCardHtml(h.api.state.lines[0], 0, true);
    assert.match(html, /Số Bịch tốt/); assert.match(html, /Thùng = 12.000 g/);
    h.api.state.lines[0].note = 'Kiểm "6 bịch" <đúng>';
    assert.match(h.api.poReceiveLineCardHtml(h.api.state.lines[0], 0, true), /value="Kiểm &quot;6 bịch&quot; &lt;đúng&gt;"/);
    await h.api._submitPoReceiveImpl(); checkReceipt(h, 6, 12000);
    assert.equal(h.calls.printed, 1); assert.equal(h.calls.confirms.length, 0);
    console.log('ok nhận tự do 6 Bịch = 12.000g = 6 mã Bịch; phiếu/kho/preview đồng nhất');
  }
  {
    const h = make(); addSelected(h); h.api.state.lines[0].goodQty = 6;
    h.api.poReceiveLineChangeField(0, 'unitFactor', 12000);
    assert.equal(h.api.state.lines[0].goodQty, 0);
    h.api.poReceiveLineChangeField(0, 'goodQty', 1);
    assert.match(h.chips.innerHTML, /Nhận 1 Thùng/); assert.match(h.chips.innerHTML, /Tạo 6 mã NL/);
    await h.api._submitPoReceiveImpl(); checkReceipt(h, 6, 12000);
    console.log('ok đổi Bịch -> Thùng xoá số cũ; nhận 1 Thùng vẫn đúng 6 mã Bịch');
  }
  {
    const h = make({ po: poOf() }); h.api.poSelectPO('po1'); h.api.state.lines[0].goodQty = 6;
    await h.api._submitPoReceiveImpl(); checkReceipt(h, 6, 12000);
    const po = h.fake.FS['purchase_orders_gieogieo/po1'];
    assert.equal(po.lines[0].receivedGoodBase, 12000); assert.equal(po.status, 'received');
    console.log('ok đơn đặt 6 Bịch -> nhận 6 Bịch; PO nhận đủ, không nhân thêm hệ số');
  }
  {
    const h = make({ po: poOf(12000, 1) }); h.api.poSelectPO('po1');
    assert.equal(h.api.state.lines[0].unitFactor, 12000);
    h.api.poReceiveLineChangeField(0, 'unitFactor', 2000); h.api.state.lines[0].goodQty = 6;
    await h.api._submitPoReceiveImpl(); checkReceipt(h, 6, 12000);
    assert.equal(h.fake.FS['purchase_orders_gieogieo/po1'].status, 'received');
    console.log('ok đặt 1 Thùng, nhận theo 6 Bịch -> 6 mã, PO đủ đúng 12.000g');
  }
  {
    const h = make({ po: poOf(12000, 1), confirm: false }); h.api.poSelectPO('po1');
    h.api.state.lines[0].goodQty = 6;
    await h.api._submitPoReceiveImpl();
    assert.equal(h.calls.confirms.length, 1); assert.match(h.calls.confirms[0], /đang nhận 6 Thùng/);
    assert.equal(h.fake.log.length, 0); assert.equal(h.tags().length, 0);
    console.log('ok đơn 1 Thùng nhưng nhập 6 Thùng: cảnh báo trước mọi lượt ghi; bấm sửa chưa thay kho');
  }
  {
    const h = make({ po: poOf(12000, 1), confirm: true }); h.api.poSelectPO('po1');
    h.api.state.lines[0].goodQty = 2;
    await h.api._submitPoReceiveImpl(); checkReceipt(h, 12, 24000);
    assert.equal(h.calls.confirms.length, 1);
    assert.equal(h.fake.FS['purchase_orders_gieogieo/po1'].lines[0].receivedGoodBase, 24000);
    console.log('ok giao dư thực tế 2 Thùng, đã xác nhận -> 24.000g, 12 mã Bịch, PO đúng');
  }
  {
    const h = make({ po: poOf(), failPO: true }); h.api.poSelectPO('po1');
    h.api.state.lines[0].goodQty = 6; h.api.state.idemKey = 'recv_case';
    await h.api._submitPoReceiveImpl(); assert.equal(h.api.state.lines.length, 1);
    h.api.poReceiveLineChangeField(0, 'unitFactor', 12000);
    assert.equal(h.api.state.lines[0].unitFactor, 2000);
    await h.api._submitPoReceiveImpl(); checkReceipt(h, 6, 12000);
    assert.equal(h.fake.FS['purchase_orders_gieogieo/po1'].lines[0].receivedGoodBase, 12000);
    console.log('ok lỗi mạng cập nhật PO -> thử lại không nhân tồn/tem; dòng đã ghi không đổi đơn vị');
  }
  {
    const h = make(); addSelected(h); Object.assign(h.api.state.lines[0], { goodQty: 5, damagedQty: 1 });
    await h.api._submitPoReceiveImpl(); checkReceipt(h, 5, 10000);
    assert.equal(h.fake.FS['receiving_records_gieogieo/recv_case'].lines[0].qtyDamagedBase, 2000);
    console.log('ok 5 Bịch tốt + 1 Bịch hỏng: 5 mã, tồn ròng 10.000g');
  }
  for (const changes of [{ unitFactor: 9999 }, { goodQty: -1, damagedQty: 1 }, { goodQty: Infinity }, { goodQty: 0.5 }]) {
    const h = make(); addSelected(h); Object.assign(h.api.state.lines[0], { goodQty: 6 }, changes);
    await h.api._submitPoReceiveImpl(); assert.equal(h.fake.log.length, 0); assert.equal(h.tags().length, 0);
    console.log('ok số/đơn vị sai hoặc không tròn Bịch bị chặn trước ghi kho: ' + JSON.stringify(changes));
  }
  {
    const h = make();
    assert.equal(h.api.poReceiveDefaultUnit({ unit: 'ml', packagingUnits: [{ name: 'Thùng', baseQty: 6000 }, { name: 'Chai', baseQty: 500 }] }).baseQty, 6000);
    assert.equal(h.api.poReceiveDefaultUnit({ unit: 'cái' }).baseQty, 1);
    assert.equal(h.api.poReceiveDefaultUnit({ unit: 'g', packagingUnits: [{ name: 'Lon', baseQty: 1280 }] }).baseQty, 1280);
    console.log('ok mặc định lúc thêm mới giữ như trước; không ép mọi nguyên liệu thành Bịch');
  }
  for (const [name, unit, amount, outer] of [['Bịch','g',2000,12000], ['Chai','ml',340,2040], ['Lon','g',1280,7680]]) {
    const item = { ...ITEM, name:'NL thử '+name, unit, countUnitName:name,
      packagingUnits:[{name,baseQty:amount},{name:'Thùng',baseQty:outer}] };
    const h=make({item}); addSelected(h,amount); h.api.state.lines[0].goodQty=6;
    h.api.state.lines[0].note='Giữ nguyên lựa chọn';
    h.api.poReceiveLineChangeItem(0, item.id); // nhánh đã tái hiện bản cũ tự đổi sang Thùng
    assert.equal(h.api.state.lines[0].unitFactor,amount); assert.equal(h.api.state.lines[0].goodQty,6);
    assert.equal(h.api.state.lines[0].note,'Giữ nguyên lựa chọn');
    await h.api.submitPoReceive();
    assert.equal(h.tags().length,6); assert.ok(h.tags().every(t=>t.baseQty===amount && t.countUnitName===name));
    assert.equal(h.fake.FS['receiving_records_gieogieo/recv_case'].lines[0].qtyGoodBase,6*amount);
    console.log('ok chọn 6 '+name+', chọn lại cùng NL, nhận cuối vẫn đúng 6 mã '+name);
  }
  {
    const h=make({onResolve(api,item,body){
      assert.equal(body.inert,true); assert.equal(api.state.submitting,true);
      api.poReceiveLineChangeField(0,'unitFactor',12000);
      assert.equal(api.state.lines[0].unitFactor,2000);
    }});
    addSelected(h); h.api.state.lines[0].goodQty=6;
    await h.api.submitPoReceive(); checkReceipt(h,6,12000);
    assert.equal(h.body.inert,false);
    console.log('ok chờ kiểm tra nhân viên: khoá sửa đơn vị, xong tự mở lại form');
  }
  {
    const h=make({onResolve(api){api.state.lines[0].unitFactor=12000;}, onUpload(api,item){
      item.packagingUnits[0].baseQty=12000; item.countUnitName='Thùng';
    }});
    addSelected(h); h.api.state.lines[0].goodQty=6;
    await h.api._submitPoReceiveImpl(); checkReceipt(h,6,12000);
    console.log('ok snapshot trước await: dòng/quy cách cache đổi cũng không biến 6 Bịch thành Thùng');
  }
  {
    const h=make({validStaff:false}); addSelected(h); h.api.state.lines[0].goodQty=6;
    await h.api.submitPoReceive(); assert.equal(h.body.inert,false); assert.equal(h.api.state.submitting,false);
    assert.equal(h.fake.log.length,0);
    console.log('ok PIN/ca không hợp lệ: không ghi, mở lại form để nhập tiếp');
  }
  {
    const item={...ITEM,unit:'ml',trackingMode:'none',countUnitName:'Thùng',packagingUnits:[{name:'Chai',baseQty:340},{name:'Thùng',baseQty:2040}]};
    const h=make({item}); addSelected(h,340); h.api.state.lines[0].goodQty=3;
    await h.api.submitPoReceive(); const row=h.fake.FS['receiving_records_gieogieo/recv_case'].lines[0];
    assert.equal(row.receiveUnitName,'Chai'); assert.equal(row.receiveUnitFactor,340); assert.equal(row.qtyGoodReceived,3); assert.equal(row.qtyGoodBase,1020);
    assert.equal(h.tags().length,0);
    console.log('ok không QR: lưu đúng 3 Chai đã chọn, không đổi theo đơn vị kiểm kê Thùng của danh mục');
  }
  console.log('ALL PASS');
})().catch(e => { console.error(e); process.exitCode = 1; });
