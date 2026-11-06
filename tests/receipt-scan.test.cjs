const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// normalize.ts tidak punya import, jadi cukup ditranspile & dijalankan.
function load(file) {
  const exports = {};
  const output = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(output, { exports });
  return exports;
}

const { normalizeScan, buildNote, receiptSchema } = load('supabase/functions/scan-receipt/normalize.ts');
const TODAY = '2026-11-06';
const IDS = ['cat-food', 'cat-shop'];

const receipt = (overrides = {}) => ({
  is_receipt: true,
  merchant: '  Indomaret   Fresh ',
  date: '2026-11-05',
  total: 25000,
  currency: 'IDR',
  items: ['Aqua 600ml', 'Roti Tawar', 'Teh Botol', 'Chitato'],
  category_id: 'cat-food',
  ...overrides
});

test('valid receipt passes through, cleaned', () => {
  const scan = normalizeScan(receipt(), IDS, TODAY);
  assert.equal(scan.isReceipt, true);
  assert.equal(scan.merchant, 'Indomaret Fresh');
  assert.equal(scan.date, '2026-11-05');
  assert.equal(scan.total, 25000);
  assert.equal(scan.currency, 'IDR');
  assert.equal(scan.categoryId, 'cat-food');
  assert.equal(scan.note, 'Indomaret Fresh – Aqua 600ml, Roti Tawar, Teh Botol, +1 item');
});

test('category outside the user\'s list is dropped', () => {
  assert.equal(normalizeScan(receipt({ category_id: 'someone-elses' }), IDS, TODAY).categoryId, null);
});

test('future, invalid and very old dates are dropped', () => {
  assert.equal(normalizeScan(receipt({ date: '2026-11-07' }), IDS, TODAY).date, null);
  assert.equal(normalizeScan(receipt({ date: '2026-02-30' }), IDS, TODAY).date, null);
  assert.equal(normalizeScan(receipt({ date: '05/11/2026' }), IDS, TODAY).date, null);
  assert.equal(normalizeScan(receipt({ date: '1999-12-31' }), IDS, TODAY).date, null);
  assert.equal(normalizeScan(receipt({ date: TODAY }), IDS, TODAY).date, TODAY);
});

test('total must be a positive finite number, rounded to cents', () => {
  assert.equal(normalizeScan(receipt({ total: 0 }), IDS, TODAY).total, null);
  assert.equal(normalizeScan(receipt({ total: -5 }), IDS, TODAY).total, null);
  assert.equal(normalizeScan(receipt({ total: '25000' }), IDS, TODAY).total, null);
  assert.equal(normalizeScan(receipt({ total: 12.345 }), IDS, TODAY).total, 12.35);
});

test('unknown currency becomes null', () => {
  assert.equal(normalizeScan(receipt({ currency: 'GBP' }), IDS, TODAY).currency, null);
});

test('not a receipt clears everything', () => {
  const scan = normalizeScan(receipt({ is_receipt: false }), IDS, TODAY);
  assert.deepEqual(
    JSON.parse(JSON.stringify([scan.isReceipt, scan.merchant, scan.total, scan.categoryId, scan.note, scan.items.length])),
    [false, '', null, null, '', 0]
  );
});

test('garbage input does not throw', () => {
  for (const raw of [null, undefined, 'text', 42, []]) {
    assert.equal(normalizeScan(raw, IDS, TODAY).isReceipt, false);
  }
});

test('note falls back to merchant or items alone', () => {
  assert.equal(buildNote('Kopi Kenangan', []), 'Kopi Kenangan');
  assert.equal(buildNote('', ['Nasi Goreng']), 'Nasi Goreng');
  assert.equal(buildNote('', []), '');
});

test('schema limits category_id to the user\'s ids, or null when there are none', () => {
  const withIds = receiptSchema(IDS).properties.category_id;
  // JSON round-trip: objek dari konteks vm punya prototype berbeda.
  assert.deepEqual(JSON.parse(JSON.stringify(withIds.anyOf[0].enum)), IDS);
  assert.deepEqual(JSON.parse(JSON.stringify(receiptSchema([]).properties.category_id)), { type: 'null' });
});
