const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Small deterministic hook harness: exercise the actual provider with deferred
// database requests, without a live Supabase account or browser dependency.
function harness(file, mocks = {}) {
  let cursor = 0;
  const slots = [];
  const effects = [];
  const react = {
    createContext: () => ({ Provider: 'provider' }),
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, (value) => {
        slots[index].value = typeof value === 'function' ? value(slots[index].value) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      return slots[index] ??= { current: initial };
    },
    useMemo(factory, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        slots[index] = { value: factory(), deps };
      }
      return slots[index].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) {
      react.useMemo(() => { effects.push(effect); return null; }, deps);
    }
  };
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022
  } }).outputText;
  const exports = {};
  const listeners = { addEventListener() {}, removeEventListener() {} };
  const globals = { document: { visibilityState: 'visible', ...listeners }, window: { ...listeners }, crypto: require('node:crypto') };
  vm.runInNewContext(output, { exports, ...globals, require(name) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
    if (name in mocks) return mocks[name];
    throw new Error('Unexpected import: ' + name);
  } });
  return {
    render(name) { cursor = 0; return exports[name]({ children: null }); },
    mountEffects() { return effects.splice(0).map((effect) => effect()); }
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function data(name) { return { profile: { name }, wallets: [], categories: [], transactions: [] }; }
/** Loads a dependency-free TS module for real (its imports are types only). */
function loadModule(file) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, require() { throw new Error('unexpected import in ' + file); } });
  return exports;
}
const optimistic = loadModule('src/lib/optimistic.ts');

function memoryCache(initial = {}) {
  const store = { ...initial };
  return {
    store,
    readCachedData: (userId) => store[userId] ?? null,
    writeCachedData: (userId, value) => { store[userId] = value; },
    clearCachedData: () => { for (const key of Object.keys(store)) delete store[key]; }
  };
}
function provider(db, cache = memoryCache()) {
  const h = harness('src/context/AppDataContext.tsx', {
    './AuthContext': { useAuth: () => ({ user: { id: 'test-user' } }) }, '../lib/db': db,
    '../lib/dataCache': cache, '../lib/optimistic': optimistic,
    '../i18n': { t: (text) => text, tp: (count, one, other) => (count === 1 ? one : other) }
  });
  return { ...h, value: () => h.render('AppDataProvider').props.value };
}

test('older refresh cannot overwrite the newest data or clear its loading state', async () => {
  const first = deferred(), second = deferred();
  let count = 0;
  const h = provider({ loadAppData: () => (++count === 1 ? first.promise : second.promise) });
  const value = h.value();
  const a = value.refresh(), b = value.refresh();
  first.resolve(data('old')); await a;
  assert.equal(h.value().profile, null);
  assert.equal(h.value().loading, true);
  second.resolve(data('new')); await b;
  assert.equal(h.value().profile.name, 'new');
  assert.equal(h.value().loading, false);
  assert.equal(h.value().initialized, true);
});

test('late older response does not replace a completed newer refresh', async () => {
  const first = deferred(), second = deferred();
  let count = 0;
  const h = provider({ loadAppData: () => (++count === 1 ? first.promise : second.promise) });
  const value = h.value();
  const a = value.refresh(), b = value.refresh();
  second.resolve(data('new')); await b;
  first.resolve(data('old')); await a;
  assert.equal(h.value().profile.name, 'new');
});

test('saved change stays when the background reload fails, and the error is reported', async () => {
  let loads = 0;
  const h = provider({
    createWallet: async () => {},
    loadAppData: async () => { if (++loads === 1) return data('before'); throw new Error('offline'); }
  });
  await h.value().refresh();
  await h.value().addWallet({ name: 'Test', type: 'cash', initialBalance: 0, currency: 'IDR', exchangeRate: 1 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.value().wallets.length, 1);
  assert.equal(h.value().loading, false);
  assert.ok(h.value().error);
});

test('cleanup invalidates a pending initial load', async () => {
  const request = deferred();
  const h = provider({ loadAppData: () => request.promise });
  h.value();
  const cleanups = h.mountEffects();
  cleanups.forEach((cleanup) => cleanup?.());
  request.resolve(data('obsolete'));
  await request.promise;
  await Promise.resolve();
  assert.equal(h.value().profile, null);
});

test('cached data shows immediately and refreshes in the background', async () => {
  const request = deferred();
  const cache = memoryCache({ 'test-user': data('cached') });
  const h = provider({ loadAppData: () => request.promise }, cache);
  const pending = h.value().refresh();
  assert.equal(h.value().profile.name, 'cached');
  assert.equal(h.value().initialized, true);
  assert.equal(h.value().loading, false);
  assert.equal(h.value().syncing, true);
  request.resolve(data('fresh')); await pending;
  assert.equal(h.value().profile.name, 'fresh');
  assert.equal(h.value().syncing, false);
  assert.equal(cache.store['test-user'].profile.name, 'fresh');
});

const wallet = { name: 'Cash', type: 'cash', initialBalance: 0, currency: 'IDR', exchangeRate: 1 };

test('a new transaction shows before the server answers, with the id it is saved under', async () => {
  const write = deferred();
  let savedId;
  let loads = 0;
  const h = provider({
    createTransaction: (_user, _payload, id) => { savedId = id; return write.promise; },
    loadAppData: async () => (++loads === 1 ? data('before') : { ...data('after'), transactions: [{ id: savedId, note: 'Lunch' }] })
  });
  await h.value().refresh();
  const saving = h.value().addTransaction({ walletId: 'w1', categoryId: 'c1', type: 'expense', amount: 5, currency: 'IDR', exchangeRate: 1, note: ' Lunch ', date: '2026-11-07' });
  assert.equal(h.value().transactions.length, 1);
  assert.equal(h.value().transactions[0].id, savedId);
  assert.equal(h.value().transactions[0].note, 'Lunch');
  assert.equal(h.value().loading, true);
  write.resolve(); await saving;
  assert.equal(h.value().loading, false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.value().profile.name, 'after');
});

test('a rejected write puts the previous data back', async () => {
  const h = provider({
    createWallet: async () => { throw new Error('denied'); },
    loadAppData: async () => data('before')
  });
  await h.value().refresh();
  await assert.rejects(h.value().addWallet(wallet), /denied/);
  assert.equal(h.value().wallets.length, 0);
  assert.equal(h.value().loading, false);
});

test('a reload that started before a save cannot undo it on screen', async () => {
  const slowLoad = deferred();
  let loads = 0;
  const h = provider({
    createWallet: async () => {},
    loadAppData: () => (++loads === 1 ? Promise.resolve(data('before')) : loads === 2 ? slowLoad.promise : Promise.resolve({ ...data('after'), wallets: [{ id: 'server', name: 'Cash' }] }))
  });
  await h.value().refresh();
  const stale = h.value().refresh().catch(() => {});
  await h.value().addWallet(wallet);
  slowLoad.resolve(data('stale')); await stale;
  await new Promise((resolve) => setImmediate(resolve));
  assert.notEqual(h.value().profile.name, 'stale');
  assert.equal(h.value().wallets.length, 1);
});

test('local changes follow the database cascades', () => {
  const base = {
    profile: { name: 'A' },
    wallets: [{ id: 'w1', position: 0 }, { id: 'w2', position: 1 }],
    categories: [{ id: 'c1', position: 0 }],
    transactions: [
      { id: 't1', walletId: 'w1', categoryId: 'c1', date: '2026-11-01', createdAt: '1' },
      { id: 't2', walletId: 'w2', categoryId: 'c1', date: '2026-11-02', createdAt: '2' }
    ]
  };
  const noWallet = optimistic.removeWallet(base, 'w1');
  assert.deepEqual([...noWallet.transactions.map((item) => item.id)], ['t2']);
  const noCategory = optimistic.removeCategory(base, 'c1');
  assert.ok(noCategory.transactions.every((item) => item.categoryId === null));
  const reordered = optimistic.reorderWallets(base, ['w2', 'w1']);
  assert.deepEqual([...reordered.wallets.map((item) => item.id)], ['w2', 'w1']);
  const transfer = optimistic.addTransfer(base, { pairId: 'p', fromId: 'out', toId: 'in' }, {
    fromWalletId: 'w1', fromCurrency: 'IDR', fromRate: 1, fromAmount: 10,
    toWalletId: 'w2', toCurrency: 'IDR', toRate: 1, toAmount: 10, note: '', date: '2026-11-05'
  });
  assert.deepEqual([...transfer.transactions.slice(0, 2).map((item) => item.type)].sort(), ['expense', 'income']);
  assert.equal(optimistic.removeTransfer(transfer, 'p').transactions.length, 2);
});

test('editing one field clears only its validation error', () => {
  const h = harness('src/hooks/useFormErrors.ts');
  h.render('useFormErrors').setErrors({ name: 'Required', amount: 'Invalid' });
  h.render('useFormErrors').clearError('name');
  assert.equal(h.render('useFormErrors').errors.name, undefined);
  assert.equal(h.render('useFormErrors').errors.amount, 'Invalid');
  h.render('useFormErrors').clearError('amount');
  assert.equal(Object.keys(h.render('useFormErrors').errors).length, 0);
});
