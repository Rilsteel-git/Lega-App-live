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

/** Validate Claude's JSON so nothing outside the user's own categories or a sane range reaches the app. */
export function normalizeScan(raw: unknown, categoryIds: string[], today: string): ReceiptScan {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const isReceipt = data.is_receipt === true;
  const merchant = isReceipt ? cleanText(data.merchant, 60) : '';
  const items = isReceipt && Array.isArray(data.items)
    ? data.items.map((item) => cleanText(item, 40)).filter(Boolean).slice(0, 5)
    : [];
  const total = isReceipt && typeof data.total === 'number' && Number.isFinite(data.total)
    && data.total > 0 && data.total < 1e13
    ? Math.round(data.total * 100) / 100
    : null;
  const currency = isReceipt && (CURRENCIES as readonly unknown[]).includes(data.currency)
    ? data.currency as ScanCurrency
    : null;
  const categoryId = isReceipt && typeof data.category_id === 'string' && categoryIds.includes(data.category_id)
    ? data.category_id
    : null;
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
