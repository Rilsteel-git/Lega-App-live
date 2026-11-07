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
  const globals = { document: { visibilityState: 'visible', ...listeners }, window: { ...listeners } };
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
    '../lib/dataCache': cache,
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

test('successful save followed by failed reload reports saved-but-unsynced', async () => {
  let writes = 0;
  const h = provider({ createWallet: async () => { writes++; }, loadAppData: async () => { throw new Error('offline'); } });
  await assert.rejects(h.value().addWallet({ name: 'Test' }), /Changes were saved/);
  assert.equal(writes, 1);
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

test('saving a change blocks with a loader until the reload finishes', async () => {
  const reload = deferred();
  let loads = 0;
  const h = provider({
    createWallet: async () => {},
    loadAppData: () => (++loads === 1 ? Promise.resolve(data('before')) : reload.promise)
  });
  await h.value().refresh();
  assert.equal(h.value().loading, false);
  const saving = h.value().addWallet({ name: 'Test' });
  assert.equal(h.value().loading, true);
  reload.resolve(data('after')); await saving;
  assert.equal(h.value().loading, false);
  assert.equal(h.value().profile.name, 'after');
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
