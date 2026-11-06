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

const { normalizeScan, buildNote, receiptSchema, extractJson, mergeDuplicates } = load('supabase/functions/scan-receipt/normalize.ts');
const TODAY = '2026-11-06';
const IDS = ['cat-food', 'cat-shop'];
const CATS = [{ id: 'cat-food', name: 'Makanan' }, { id: 'cat-shop', name: 'Belanja' }];
const WALLETS = [
  { id: 'w-dana', name: 'Dana', type: 'e-wallet', currency: 'IDR' },
  { id: 'w-bca', name: 'BCA', type: 'bank', currency: 'IDR' },
  { id: 'w-cash', name: 'Dompet', type: 'cash', currency: 'IDR' },
  { id: 'w-usd', name: 'Wise USD', type: 'bank', currency: 'USD' }
];

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
  const scan = normalizeScan(receipt(), CATS, WALLETS, TODAY);
  assert.equal(scan.isReceipt, true);
  assert.equal(scan.merchant, 'Indomaret Fresh');
  assert.equal(scan.date, '2026-11-05');
  assert.equal(scan.total, 25000);
  assert.equal(scan.currency, 'IDR');
  assert.equal(scan.categoryId, 'cat-food');
  assert.equal(scan.note, 'Indomaret Fresh – Aqua 600ml, Roti Tawar, Teh Botol, +1 item');
});

test('category outside the user\'s list is dropped', () => {
  assert.equal(normalizeScan(receipt({ category_id: 'someone-elses' }), CATS, WALLETS, TODAY).categoryId, null);
});

test('future, invalid and very old dates are dropped', () => {
  assert.equal(normalizeScan(receipt({ date: '2026-11-07' }), CATS, WALLETS, TODAY).date, null);
  assert.equal(normalizeScan(receipt({ date: '2026-02-30' }), CATS, WALLETS, TODAY).date, null);
  assert.equal(normalizeScan(receipt({ date: '05/11/2026' }), CATS, WALLETS, TODAY).date, null);
  assert.equal(normalizeScan(receipt({ date: '1999-12-31' }), CATS, WALLETS, TODAY).date, null);
  assert.equal(normalizeScan(receipt({ date: TODAY }), CATS, WALLETS, TODAY).date, TODAY);
});

test('total must be a positive finite number, rounded to cents', () => {
  assert.equal(normalizeScan(receipt({ total: 0 }), CATS, WALLETS, TODAY).total, null);
  assert.equal(normalizeScan(receipt({ total: -5 }), CATS, WALLETS, TODAY).total, null);
  assert.equal(normalizeScan(receipt({ total: '25000' }), CATS, WALLETS, TODAY).total, 25000);
  // "25.000" could mean 25 or 25000 — rejected rather than guessed.
  assert.equal(normalizeScan(receipt({ total: '25.000' }), CATS, WALLETS, TODAY).total, null);
  assert.equal(normalizeScan(receipt({ total: 'Rp 25.000' }), CATS, WALLETS, TODAY).total, null);
  assert.equal(normalizeScan(receipt({ total: 12.345 }), CATS, WALLETS, TODAY).total, 12.35);
});

test('unsupported currency is reported separately, not passed off as a supported one', () => {
  const vnd = normalizeScan(receipt({ currency: 'vnd', total: 88000 }), CATS, WALLETS, TODAY);
  assert.equal(vnd.currency, null);
  assert.equal(vnd.otherCurrency, 'VND');
  assert.equal(vnd.total, 88000);
  const idr = normalizeScan(receipt(), CATS, WALLETS, TODAY);
  assert.equal(idr.currency, 'IDR');
  assert.equal(idr.otherCurrency, null);
  assert.equal(normalizeScan(receipt({ currency: 'Rupiah' }), CATS, WALLETS, TODAY).otherCurrency, null);
});

test('not a receipt clears everything', () => {
  const scan = normalizeScan(receipt({ is_receipt: false }), CATS, WALLETS, TODAY);
  assert.deepEqual(
    JSON.parse(JSON.stringify([scan.isReceipt, scan.merchant, scan.total, scan.categoryId, scan.note, scan.items.length])),
    [false, '', null, null, '', 0]
  );
});

test('garbage input does not throw', () => {
  for (const raw of [null, undefined, 'text', 42, []]) {
    assert.equal(normalizeScan(raw, CATS, WALLETS, TODAY).isReceipt, false);
  }
});

test('note falls back to merchant or items alone', () => {
  assert.equal(buildNote('Kopi Kenangan', []), 'Kopi Kenangan');
  assert.equal(buildNote('', ['Nasi Goreng']), 'Nasi Goreng');
  assert.equal(buildNote('', []), '');
});

test('schema limits category_id to the user\'s ids, or null when there are none', () => {
  const withIds = receiptSchema(IDS, []).properties.category_id;
  // JSON round-trip: objek dari konteks vm punya prototype berbeda.
  assert.deepEqual(JSON.parse(JSON.stringify(withIds.anyOf[0].enum)), IDS);
  assert.deepEqual(JSON.parse(JSON.stringify(receiptSchema([], []).properties.category_id)), { type: 'null' });
});

test('category name is accepted when a model returns it instead of the id', () => {
  const pick = (category_id, cats = CATS) => normalizeScan(receipt({ category_id }), cats, WALLETS, TODAY).categoryId;
  assert.equal(pick(' makanan '), 'cat-food');
  assert.equal(pick('Transport'), null);
  // Similar names: contained either way, only when exactly one category matches.
  assert.equal(pick('Makanan & Minuman'), 'cat-food');
  assert.equal(pick('belanja'), 'cat-shop');
  const foodAndDrinks = [{ id: 'cat-fd', name: 'Food & Drinks' }, { id: 'cat-bills', name: 'Bills' }];
  assert.equal(pick('Food', foodAndDrinks), 'cat-fd');
  const ambiguous = [{ id: 'a', name: 'Food Delivery' }, { id: 'b', name: 'Food Groceries' }];
  assert.equal(pick('Food', ambiguous), null);
});

test('extractJson finds the object inside prose or code fences', () => {
  const plain = (value) => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(extractJson('{"total": 5}')), { total: 5 });
  assert.deepEqual(plain(extractJson('Here you go:\n```json\n{"total": 5, "items": []}\n```')), { total: 5, items: [] });
  assert.equal(extractJson('no json here'), null);
  assert.equal(extractJson('{broken'), null);
});

test('wallet: model pick is kept when it is one of the user\'s wallets in the receipt currency', () => {
  assert.equal(normalizeScan(receipt({ wallet_id: 'w-bca', payment_method: 'Debit BCA' }), CATS, WALLETS, TODAY).walletId, 'w-bca');
  assert.equal(normalizeScan(receipt({ wallet_id: 'someone-elses' }), CATS, WALLETS, TODAY).walletId, null);
  // USD wallet for an IDR receipt is rejected.
  assert.equal(normalizeScan(receipt({ wallet_id: 'w-usd' }), CATS, WALLETS, TODAY).walletId, null);
});

test('wallet: matched from the payment method when the model returns none', () => {
  const pick = (payment_method) => normalizeScan(receipt({ wallet_id: null, payment_method }), CATS, WALLETS, TODAY);
  assert.equal(pick('QRIS DANA').walletId, 'w-dana');
  assert.equal(pick('Bayar (Cash)').walletId, 'w-cash');
  assert.equal(pick('Tunai').walletId, 'w-cash');
  assert.equal(pick('Debit BCA').walletId, 'w-bca');
  assert.equal(pick('OVO').walletId, null);
  // Spaces and dashes in the wallet name are ignored.
  const goPay = WALLETS.concat({ id: 'w-gopay', name: 'Go-Pay', type: 'e-wallet', currency: 'IDR' });
  assert.equal(normalizeScan(receipt({ wallet_id: null, payment_method: 'Gopay' }), CATS, goPay, TODAY).walletId, 'w-gopay');
  assert.equal(normalizeScan(receipt({ wallet_id: null, payment_method: 'QRIS GOPAY' }), CATS, goPay, TODAY).walletId, 'w-gopay');
  assert.equal(pick('Debit BCA').paymentMethod, 'Debit BCA');
});

test('wallet: stays empty without a payment method, or when cash is ambiguous', () => {
  assert.equal(normalizeScan(receipt({ wallet_id: null, payment_method: null }), CATS, WALLETS, TODAY).walletId, null);
  const twoCash = WALLETS.concat({ id: 'w-cash2', name: 'Celengan', type: 'cash', currency: 'IDR' });
  assert.equal(normalizeScan(receipt({ wallet_id: null, payment_method: 'Cash' }), CATS, twoCash, TODAY).walletId, null);
});

test('repeated items are merged with a count', () => {
  const plain = (value) => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(mergeDuplicates(['Almondmilk Hazelnut Latte', 'almondmilk hazelnut latte', 'Croissant'])),
    ['2x Almondmilk Hazelnut Latte', 'Croissant']);
  const scan = normalizeScan(receipt({ merchant: 'Starbucks', items: ['Latte', 'Latte'] }), CATS, WALLETS, TODAY);
  assert.equal(scan.note, 'Starbucks – 2x Latte');
});

test('paylater: purchase paid with PayLater goes to that PayLater category', () => {
  const cats = CATS.concat(
    { id: 'cat-spl', name: 'Shopee Paylater' },
    { id: 'cat-gpl', name: 'Gopay Paylater' },
    { id: 'cat-tpl', name: 'Tiktok Paylater' }
  );
  const pick = (payment_method, category_id = 'cat-food') =>
    normalizeScan(receipt({ payment_method, category_id, wallet_id: null }), cats, WALLETS, TODAY).categoryId;
  assert.equal(pick('SPayLater Bayar Nanti'), 'cat-spl');
  assert.equal(pick('Shopee PayLater'), 'cat-spl');
  assert.equal(pick('GoPay PayLater'), 'cat-gpl');
  assert.equal(pick('GoPayLater'), 'cat-gpl');
  assert.equal(pick('TikTok PayLater'), 'cat-tpl');
  // Plain e-wallet payments keep the model's category.
  assert.equal(pick('GoPay'), 'cat-food');
  assert.equal(pick('ShopeePay'), 'cat-food');
  // PayLater without a matching category keeps the model's category.
  assert.equal(pick('Kredivo'), 'cat-food');
});

test('paylater: never matched to a regular wallet with the same brand', () => {
  const wallets = WALLETS.concat({ id: 'w-gopay', name: 'GoPay', type: 'e-wallet', currency: 'IDR' });
  const scan = (payment_method, wallet_id = null) =>
    normalizeScan(receipt({ payment_method, wallet_id }), CATS, wallets, TODAY).walletId;
  assert.equal(scan('GoPay PayLater'), null);
  assert.equal(scan('GoPay PayLater', 'w-gopay'), null);
  assert.equal(scan('GoPay'), 'w-gopay');
  const withPaylaterWallet = wallets.concat({ id: 'w-gpl', name: 'GoPay PayLater', type: 'e-wallet', currency: 'IDR' });
  assert.equal(normalizeScan(receipt({ payment_method: 'GoPay PayLater', wallet_id: null }), CATS, withPaylaterWallet, TODAY).walletId, 'w-gpl');
});
