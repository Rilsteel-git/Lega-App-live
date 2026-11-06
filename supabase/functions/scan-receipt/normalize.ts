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

/** What the function returns to the app. Every field can be empty: the app only pre-fills the form. */
export interface ReceiptScan {
  isReceipt: boolean;
  merchant: string;
  date: string | null;
  total: number | null;
  currency: ScanCurrency | null;
  items: string[];
  categoryId: string | null;
  note: string;
}

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

/** JSON schema for Claude's structured output. */
export function receiptSchema(categoryIds: string[]) {
  return {
    type: 'object',
    properties: {
      is_receipt: { type: 'boolean' },
      merchant: nullable({ type: 'string' }),
      date: nullable({ type: 'string' }),
      total: nullable({ type: 'number' }),
      currency: nullable({ type: 'string', enum: [...CURRENCIES] }),
      items: { type: 'array', items: { type: 'string' } },
      category_id: categoryIds.length ? nullable({ type: 'string', enum: categoryIds }) : { type: 'null' }
    },
    required: ['is_receipt', 'merchant', 'date', 'total', 'currency', 'items', 'category_id'],
    additionalProperties: false
  };
}

export function receiptPrompt(categories: CategoryChoice[], today: string): string {
  const list = categories.length
    ? categories.map((category) => `- ${category.id}: ${category.name}`).join('\n')
    : '(the user has no expense categories)';
  return [
    'Read this shopping receipt / bill / invoice photo and extract the purchase for a personal expense tracker.',
    '',
    'Rules:',
    '- is_receipt: false if the image is not a receipt, bill or invoice (then set every other field to null / []).',
    '- merchant: store or business name as printed, in normal capitalisation. null if not visible.',
    `- date: transaction date as YYYY-MM-DD. Indonesian receipts usually print DD/MM/YY or DD-MM-YYYY. Today is ${today}; if the year is missing, assume the most recent date that is not in the future. null if not visible.`,
    '- total: the final amount actually paid (after discounts, tax and service charge; e.g. "TOTAL", "Total Bayar", "Grand Total", "Jumlah"), as a plain number. Ignore cash tendered and change ("Tunai", "Kembali"). Indonesian receipts use "." as thousands separator: "Rp 25.000" is 25000, "25.000,50" is 25000.5. null if unreadable.',
    '- currency: currency of the total. Default to IDR for Indonesian receipts. null if unsure.',
    '- items: up to 5 main purchased item names, short and human-readable (e.g. "Aqua 600ml"), most expensive first. [] if not readable.',
    '- category_id: the id of the ONE category below that best fits the purchase overall, or null if none fits.',
    '',
    'Expense categories (id: name):',
    list
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
  ' "currency": "IDR"|"KRW"|"USD"|"EUR"|"JPY"|"SGD"|"MYR"|null, "items": string[], "category_id": string|null}',
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

/** "Indomaret – Aqua 600ml, Roti Tawar, +2 item" (max 200 chars, the note column has no limit but keep it readable). */
export function buildNote(merchant: string, items: string[]): string {
  const shown = items.slice(0, 3);
  const rest = items.length - shown.length;
  const list = shown.join(', ') + (rest > 0 ? `, +${rest} item` : '');
  const note = merchant && list ? `${merchant} – ${list}` : merchant || list;
  return note.slice(0, 200);
}

/** Category id from the model, or the category name if a weaker model returned that instead. */
function matchCategory(value: unknown, categories: CategoryChoice[]): string | null {
  if (typeof value !== 'string') return null;
  const byId = categories.find((category) => category.id === value);
  if (byId) return byId.id;
  const name = value.trim().toLowerCase();
  return categories.find((category) => category.name.trim().toLowerCase() === name)?.id ?? null;
}

/** Plain JSON number, or a digits-only string ("25000", "12.5"). Anything ambiguous like "25.000" is rejected. */
function readTotal(value: unknown): number | null {
  const number = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d+(\.\d{1,2})?$/.test(value.trim()) ? Number(value.trim()) : NaN;
  return Number.isFinite(number) && number > 0 && number < 1e13 ? Math.round(number * 100) / 100 : null;
}

/** Validate the model's JSON so nothing outside the user's own categories or a sane range reaches the app. */
export function normalizeScan(raw: unknown, categories: CategoryChoice[], today: string): ReceiptScan {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const isReceipt = data.is_receipt === true;
  const merchant = isReceipt ? cleanText(data.merchant, 60) : '';
  const items = isReceipt && Array.isArray(data.items)
    ? data.items.map((item) => cleanText(item, 40)).filter(Boolean).slice(0, 5)
    : [];
  const total = isReceipt ? readTotal(data.total) : null;
  const currency = isReceipt && (CURRENCIES as readonly unknown[]).includes(data.currency)
    ? data.currency as ScanCurrency
    : null;
  const categoryId = isReceipt ? matchCategory(data.category_id, categories) : null;
  return {
    isReceipt,
    merchant,
    date: isReceipt ? validDate(data.date, today) : null,
    total,
    currency,
    items,
    categoryId,
    note: buildNote(merchant, items)
  };
}
