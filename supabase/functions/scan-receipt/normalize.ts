/* ============================================================
   normalize.ts — pure helpers for the scan-receipt function.
   No Deno/Node APIs and no imports, so tests/receipt-scan.test.cjs
   can load it directly.
   ============================================================ */

export const CURRENCIES = ['IDR', 'KRW', 'USD', 'EUR', 'JPY', 'SGD', 'MYR'] as const;
export type ScanCurrency = typeof CURRENCIES[number];

export interface CategoryChoice {
  id: string;
  name: string;
}

export interface WalletChoice {
  id: string;
  name: string;
  /** 'bank' | 'e-wallet' | 'cash' */
  type: string;
  currency: string;
}

/** What the function returns to the app. Every field can be empty: the app only pre-fills the form. */
export interface ReceiptScan {
  isReceipt: boolean;
  merchant: string;
  date: string | null;
  total: number | null;
  currency: ScanCurrency | null;
  /** ISO code the receipt is in when the app does not support it (e.g. "VND"); currency is then null. */
  otherCurrency: string | null;
  items: string[];
  categoryId: string | null;
  /** Payment method as printed ("Cash", "QRIS DANA", "Debit BCA"), or '' if the receipt doesn't say. */
  paymentMethod: string;
  /** One of the user's wallets that matches the payment method, or null. */
  walletId: string | null;
  note: string;
}

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

/** JSON schema for Claude's structured output. */
export function receiptSchema(categoryIds: string[], walletIds: string[]) {
  return {
    type: 'object',
    properties: {
      is_receipt: { type: 'boolean' },
      merchant: nullable({ type: 'string' }),
      date: nullable({ type: 'string' }),
      total: nullable({ type: 'number' }),
      currency: nullable({ type: 'string' }),
      items: { type: 'array', items: { type: 'string' } },
      category_id: categoryIds.length ? nullable({ type: 'string', enum: categoryIds }) : { type: 'null' },
      payment_method: nullable({ type: 'string' }),
      wallet_id: walletIds.length ? nullable({ type: 'string', enum: walletIds }) : { type: 'null' }
    },
    required: ['is_receipt', 'merchant', 'date', 'total', 'currency', 'items', 'category_id', 'payment_method', 'wallet_id'],
    additionalProperties: false
  };
}

export function receiptPrompt(categories: CategoryChoice[], wallets: WalletChoice[], today: string): string {
  const list = categories.length
    ? categories.map((category) => `- ${category.id}: ${category.name}`).join('\n')
    : '(the user has no expense categories)';
  const walletList = wallets.length
    ? wallets.map((wallet) => `- ${wallet.id}: ${wallet.name} (type ${wallet.type}, ${wallet.currency})`).join('\n')
    : '(the user has no wallets)';
  return [
    'Read this shopping receipt / bill / invoice photo and extract the purchase for a personal expense tracker.',
    '',
    'Rules:',
    '- is_receipt: false if the image is not a receipt, bill or invoice (then set every other field to null / []).',
    '- merchant: store or business name as printed, in normal capitalisation. null if not visible.',
    `- date: transaction date as YYYY-MM-DD. Indonesian receipts usually print DD/MM/YY or DD-MM-YYYY. Today is ${today}; if the year is missing, assume the most recent date that is not in the future. null if not visible.`,
    '- total: the final amount actually paid (after discounts, tax and service charge; e.g. "TOTAL", "Total Bayar", "Grand Total", "Jumlah"), as a plain number. Ignore cash tendered and change ("Tunai", "Kembali"). Indonesian receipts use "." as thousands separator: "Rp 25.000" is 25000, "25.000,50" is 25000.5. null if unreadable.',
    '- currency: ISO 4217 code of the total, from the symbol, the printed currency, or the country of the address (e.g. IDR for Indonesia, VND for Vietnam, THB for Thailand). Never assume IDR for a receipt from another country. null only if truly unclear.',
    '- items: up to 5 main purchased item names, short and human-readable (e.g. "Aqua 600ml"), most expensive first. [] if not readable.',
    '- category_id: the id of the ONE category below that is most closely related to the purchase overall, even if it is not an exact fit (e.g. a minimarket or grocery receipt -> a shopping/groceries category; coffee, snacks or instant noodles -> a food/drinks category; fuel or parking -> a transport category). Prefer a specific related category over a generic "Other" one. Use null ONLY if no category is related at all.',
    '- payment_method: how it was paid, as printed (e.g. "Cash", "Tunai", "QRIS DANA", "GoPay", "OVO", "Debit BCA", "Kartu Kredit Mandiri"). null if the receipt does not say.',
    '- wallet_id: the id of the ONE wallet below that the payment method clearly points to: the wallet name appears in it (e.g. "QRIS DANA" -> a wallet named Dana), or it is cash/tunai and there is a wallet of type cash. null if the receipt shows no payment method, or no wallet clearly matches. Do not guess.',
    '',
    'Expense categories (id: name):',
    list,
    '',
    "User's wallets (id: name (type, currency)):",
    walletList
  ].join('\n');
}

/**
 * Extra instructions for models without enforced structured output (Cloudflare
 * Workers AI vision models): the shape has to be asked for in the prompt.
 */
export const JSON_ONLY_INSTRUCTIONS = [
  '',
  'Respond with ONLY one JSON object, no markdown and no explanation, with exactly these keys:',
  '{"is_receipt": boolean, "merchant": string|null, "date": "YYYY-MM-DD"|null, "total": number|null,',
  ' "currency": 3-letter ISO 4217 code|null, "items": string[], "category_id": string|null,',
  ' "payment_method": string|null, "wallet_id": string|null}',
  'total must be a plain JSON number without thousands separators (25000, not "25.000").'
].join('\n');

/** Pull the JSON object out of a model reply that may wrap it in prose or ``` fences. */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function validDate(value: unknown, today: string): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
  // A receipt cannot be from the future, and very old dates are almost always misreads.
  if (value > today || value < '2000-01-01') return null;
  return value;
}

/** Lowercase words only, for loose name matching ("Food & Drinks" -> "food drinks"). */
const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** "Indomaret – Aqua 600ml, Roti Tawar, +2 item" (max 200 chars, the note column has no limit but keep it readable). */
export function buildNote(merchant: string, items: string[]): string {
  const shown = items.slice(0, 3);
  const rest = items.length - shown.length;
  const list = shown.join(', ') + (rest > 0 ? `, +${rest} item` : '');
  const note = merchant && list ? `${merchant} – ${list}` : merchant || list;
  return note.slice(0, 200);
}

/**
 * Category id from the model. Weaker models sometimes return a name instead: an exact name
 * match wins, otherwise a name that contains (or is contained in) the returned text, as long
 * as exactly one category matches ("Food & Drinks" -> Food).
 */
function matchCategory(value: unknown, categories: CategoryChoice[]): string | null {
  if (typeof value !== 'string') return null;
  const byId = categories.find((category) => category.id === value);
  if (byId) return byId.id;
  const text = normalizeName(value);
  if (!text) return null;
  const exact = categories.find((category) => normalizeName(category.name) === text);
  if (exact) return exact.id;
  const padded = ` ${text} `;
  const similar = categories.filter((category) => {
    const name = normalizeName(category.name);
    return name.length >= 3 && (padded.includes(` ${name} `) || ` ${name} `.includes(padded));
  });
  return similar.length === 1 ? similar[0].id : null;
}

const CASH_WORDS = /\b(cash|tunai|kontan)\b/i;

/**
 * The wallet the payment method points to: the model's pick if it is one of the user's wallets,
 * otherwise a conservative match done here (weaker models often return only the method).
 * A wallet in a different currency than the receipt is never picked.
 */
function matchWallet(value: unknown, method: string, currency: string | null, wallets: WalletChoice[]): string | null {
  const usable = wallets.filter((wallet) => !currency || wallet.currency === currency);
  const byId = typeof value === 'string' ? usable.find((wallet) => wallet.id === value) : undefined;
  if (byId) return byId.id;
  if (!method) return null;
  const text = ` ${normalizeName(method)} `;
  // Wallet name inside the method ("QRIS DANA" -> Dana). Only when exactly one wallet matches.
  const named = usable.filter((wallet) => {
    const name = normalizeName(wallet.name);
    return name.length >= 3 && text.includes(` ${name} `);
  });
  if (named.length === 1) return named[0].id;
  if (named.length > 1) return null;
  // Cash -> the user's only cash wallet.
  if (CASH_WORDS.test(method)) {
    const cash = usable.filter((wallet) => wallet.type === 'cash');
    if (cash.length === 1) return cash[0].id;
  }
  return null;
}

/** Plain JSON number, or a digits-only string ("25000", "12.5"). Anything ambiguous like "25.000" is rejected. */
function readTotal(value: unknown): number | null {
  const number = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d+(\.\d{1,2})?$/.test(value.trim()) ? Number(value.trim()) : NaN;
  return Number.isFinite(number) && number > 0 && number < 1e13 ? Math.round(number * 100) / 100 : null;
}

/** Validate the model's JSON so nothing outside the user's own categories or a sane range reaches the app. */
export function normalizeScan(raw: unknown, categories: CategoryChoice[], wallets: WalletChoice[], today: string): ReceiptScan {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const isReceipt = data.is_receipt === true;
  const merchant = isReceipt ? cleanText(data.merchant, 60) : '';
  const items = isReceipt && Array.isArray(data.items)
    ? data.items.map((item) => cleanText(item, 40)).filter(Boolean).slice(0, 5)
    : [];
  const total = isReceipt ? readTotal(data.total) : null;
  const code = isReceipt && typeof data.currency === 'string' ? data.currency.trim().toUpperCase() : '';
  const currency = (CURRENCIES as readonly string[]).includes(code) ? code as ScanCurrency : null;
  const otherCurrency = !currency && /^[A-Z]{3}$/.test(code) ? code : null;
  const categoryId = isReceipt ? matchCategory(data.category_id, categories) : null;
  const paymentMethod = isReceipt ? cleanText(data.payment_method, 40) : '';
  const walletId = isReceipt ? matchWallet(data.wallet_id, paymentMethod, currency ?? otherCurrency, wallets) : null;
  return {
    isReceipt,
    merchant,
    date: isReceipt ? validDate(data.date, today) : null,
    total,
    currency,
    otherCurrency,
    items,
    categoryId,
    paymentMethod,
    walletId,
    note: buildNote(merchant, items)
  };
}
