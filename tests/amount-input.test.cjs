const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Muat modul TS dengan bahasa tertentu (i18n membaca localStorage saat dimuat).
function loader(language) {
  const cache = new Map();
  const window = { localStorage: { getItem: () => language, setItem() {} } };
  return function load(file) {
    const absolute = path.resolve(__dirname, '..', file);
    if (cache.has(absolute)) return cache.get(absolute);
    const exports = {};
    cache.set(absolute, exports);
    const output = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText;
    vm.runInNewContext(output, { exports, Intl, window, require(name) {
      const target = path.resolve(path.dirname(absolute), name);
      return load(fs.existsSync(target + '.ts') ? target + '.ts' : path.join(target, 'index.ts'));
    } });
    return exports;
  };
}
const id = loader('id')('src/lib/amountInput.ts');
const en = loader('en')('src/lib/amountInput.ts');

// Simulasikan mengetik satu karakter di posisi kursor.
function type(lib, previous, caret, char, currency, allowNegative) {
  const text = previous.slice(0, caret) + char + previous.slice(caret);
  return lib.applyAmountEdit({ text, caret: caret + 1, previous, inputType: 'insertText' }, currency, allowNegative);
}
function typeAll(lib, chars, currency, allowNegative) {
  let state = { raw: '', display: '', caret: 0 };
  for (const char of chars) state = type(lib, state.display, state.caret, char, currency, allowNegative);
  return state;
}

test('display uses Rp in Indonesian and IDR in English, with dot thousands', () => {
  assert.equal(id.displayAmount('5000', 'IDR'), 'Rp5.000');
  assert.equal(id.displayAmount('1250000', 'IDR'), 'Rp1.250.000');
  assert.equal(id.displayAmount('-5000', 'IDR'), '-Rp5.000');
  assert.equal(en.displayAmount('5000', 'IDR'), 'IDR 5.000');
  assert.equal(id.displayAmount('12.5', 'USD'), 'USD 12,5');
  assert.equal(id.displayAmount('', 'IDR'), '');
});

test('typing digits formats as you go and keeps the plain value', () => {
  const state = typeAll(id, '1250000', 'IDR');
  assert.equal(state.raw, '1250000');
  assert.equal(state.display, 'Rp1.250.000');
  assert.equal(state.caret, state.display.length);
});

test('whole-number currencies ignore dots and commas', () => {
  assert.equal(typeAll(id, '5.000,5', 'IDR').raw, '50005');
  assert.equal(id.parseAmountText('Rp1.250.000', 'IDR'), '1250000');
});

test('decimal currencies accept comma or a typed dot as the decimal mark', () => {
  assert.equal(typeAll(id, '1234,56', 'USD').raw, '1234.56');
  assert.equal(typeAll(id, '1234.56', 'USD').display, 'USD 1.234,56');
  assert.equal(typeAll(id, '1,239', 'USD').raw, '1.23');
});

test('pasting 12.50 into a decimal currency keeps the decimals', () => {
  const pasted = id.applyAmountEdit({ text: '12.50', caret: 5, previous: '', inputType: 'insertFromPaste' }, 'USD');
  assert.equal(pasted.raw, '12.50');
  const grouped = id.applyAmountEdit({ text: '1.250.000', caret: 9, previous: '', inputType: 'insertFromPaste' }, 'IDR');
  assert.equal(grouped.raw, '1250000');
});

test('backspace over a thousands dot deletes the digit before it', () => {
  // "Rp12.500", caret right after the dot; backspace removes the dot, then the "2".
  const result = id.applyAmountEdit({ text: 'Rp12500', caret: 4, previous: 'Rp12.500', inputType: 'deleteContentBackward' }, 'IDR');
  assert.equal(result.raw, '1500');
  assert.equal(result.display, 'Rp1.500');
  assert.equal(result.display.slice(0, result.caret), 'Rp1');
});

test('editing in the middle keeps the caret next to the same digit', () => {
  // Insert "9" after "Rp1." in "Rp1.250" -> "Rp19.250"
  const result = type(id, 'Rp1.250', 4, '9', 'IDR');
  assert.equal(result.raw, '19250');
  assert.equal(result.display, 'Rp19.250');
  assert.equal(result.display.slice(0, result.caret), 'Rp19');
});

test('minus sign only where negatives are allowed', () => {
  assert.equal(typeAll(id, '-5000', 'IDR', true).display, '-Rp5.000');
  assert.equal(typeAll(id, '-5000', 'IDR', false).raw, '5000');
});
