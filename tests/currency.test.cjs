const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const cache = new Map();
function load(file) {
  const absolute = path.resolve(__dirname, '..', file);
  if (cache.has(absolute)) return cache.get(absolute);
  const exports = {};
  cache.set(absolute, exports);
  const output = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(output, { exports, Intl, require(name) {
    return load(path.resolve(path.dirname(absolute), name + '.ts'));
  } });
  return exports;
}
const money = load('src/lib/currency.ts');
const selectors = load('src/lib/selectors.ts');
const format = load('src/lib/format.ts');
const stats = load('src/lib/stats.ts');
const wallets = [
  { id: 'krw', name: 'Korea', currency: 'KRW', initialBalance: 100000, exchangeRate: 12, type: 'bank' },
  { id: 'idr', name: 'BCA', currency: 'IDR', initialBalance: 500000, exchangeRate: 1, type: 'bank' }
];
const txs = [
  { id: '1', walletId: 'krw', categoryId: null, type: 'expense', amount: 10000, currency: 'KRW', exchangeRate: 11, date: '2026-09-21', createdAt: '2026-09-21', note: '' },
  { id: '2', walletId: 'idr', categoryId: null, type: 'income', amount: 200000, currency: 'IDR', exchangeRate: 1, date: '2026-09-21', createdAt: '2026-09-21', note: '' }
];
test('native balance stays KRW while combined balance uses manual wallet valuation rates', () => {
  assert.equal(selectors.balanceOf(wallets[0], txs), 90000);
  assert.equal(money.convertedBalance(wallets, txs, 1), 1780000);
  assert.equal(money.convertedBalance(wallets, txs, 10, 'KRW'), 160000);
});
test('report conversion preserves original values and historical rates', () => {
  const before = JSON.stringify(txs);
  const idr = money.reportTransactions(txs, 'IDR', 1);
  assert.equal(idr[0].amount, 110000);
  assert.equal(selectors.totals(idr).net, 90000);
  assert.equal(money.reportTransactions(txs, 'KRW', 10)[0].amount, 10000);
  assert.equal(JSON.stringify(txs), before);
});
test('currency filter selects original denomination, including when reporting in IDR', () => {
  const result = selectors.filterTransactions(txs, wallets, [], { currency: 'KRW' });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, '1');
  assert.equal(money.reportTransactions(result, 'IDR', 1)[0].amount, 110000);
});
test('decimal and rate validation rejects invalid, ambiguous and nonfinite inputs', () => {
  assert.equal(money.readDecimal('12,50'), 12.5);
  assert.ok(Number.isNaN(money.readDecimal('1,000.50')));
  assert.equal(money.validAmount(12.5, 'USD'), true);
  assert.equal(money.validAmount(12.5, 'KRW'), false);
  assert.equal(money.validAmount(12.345, 'USD'), false);
  for (const value of [0, -1, Infinity, NaN]) assert.equal(money.validRate(value), false);
});
test('formatting labels foreign amounts and retains fractional dollars', () => {
  assert.match(format.formatCurrency(12.5, 'USD'), /USD.*12,50/);
  assert.match(format.formatSigned(10000, 'expense', 'KRW'), /KRW.*10.000/);
});
test('statistics aggregates converted entries, not mixed original numbers', () => {
  const converted = money.reportTransactions(txs, 'IDR', 1);
  const period = { from: '2026-09-01', to: '2026-09-30' };
  assert.equal(stats.periodTotals(converted, period).expense, 110000);
  assert.equal(stats.periodTotals(converted, period).income, 200000);
});

test('empty foreign wallet has zero value even if past transaction rates differed', () => {
  const spent = [{ ...txs[0], amount: 100000, exchangeRate: 11 }];
  assert.equal(money.convertedBalance([wallets[0]], spent, 1), 0);
});

test('recentTransactions hides future-dated entries but keeps today and the past', () => {
  const tx = (id, date, createdAt, extra = {}) => ({
    id, walletId: 'idr', categoryId: null, type: 'expense', amount: 1000,
    currency: 'IDR', exchangeRate: 1, date, createdAt, note: '', ...extra
  });
  const list = [
    tx('future', '2026-12-01', '2026-11-01T10:00:00Z'),
    tx('today', '2026-11-06', '2026-11-06T01:00:00Z'),
    tx('past', '2026-11-05', '2026-11-05T09:00:00Z')
  ];
  const ids = selectors.recentTransactions(list, '2026-11-06').map((t) => t.id);
  assert.deepEqual(ids, ['today', 'past']);
  // satu hari kemudian transaksi 1 Des belum tiba; pada 1 Des baru muncul
  assert.deepEqual(selectors.recentTransactions(list, '2026-11-30').map((t) => t.id), ['today', 'past']);
  assert.deepEqual(selectors.recentTransactions(list, '2026-12-01').map((t) => t.id), ['future', 'today', 'past']);
});

test('recentTransactions orders same-day entries by created_at and caps the list at 5', () => {
  const tx = (id, createdAt) => ({
    id, walletId: 'idr', categoryId: null, type: 'expense', amount: 1,
    currency: 'IDR', exchangeRate: 1, date: '2026-11-05', createdAt, note: ''
  });
  const list = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, i) => tx(id, `2026-11-05T0${i}:00:00Z`));
  const ids = selectors.recentTransactions(list, '2026-11-06').map((t) => t.id);
  assert.deepEqual(ids, ['g', 'f', 'e', 'd', 'c']);
});

test('recentTransactions still collapses a transfer pair into one row', () => {
  const leg = (id, walletId, type) => ({
    id, walletId, categoryId: null, type, amount: 5000, currency: 'IDR', exchangeRate: 1,
    date: '2026-11-05', createdAt: '2026-11-05T08:00:00Z', note: '', isTransfer: true, transferPairId: 'pair-1'
  });
  const list = [leg('out', 'idr', 'expense'), leg('in', 'krw', 'income')];
  assert.equal(selectors.recentTransactions(list, '2026-11-06').length, 1);
});
