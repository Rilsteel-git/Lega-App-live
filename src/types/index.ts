/* ============================================================
   Bentuk data di sisi aplikasi (camelCase).
   Pemetaan ke/dari kolom Postgres (snake_case) ada di lib/db.ts.
   ============================================================ */

export type WalletType = 'bank' | 'e-wallet' | 'cash';
export type TransactionType = 'income' | 'expense';
export type Currency = 'IDR' | 'KRW' | 'USD' | 'EUR' | 'JPY' | 'SGD' | 'MYR';

export interface Profile {
  reportCurrency: Currency;
  reportRate: number;
  id: string;
  name: string;
  photoUrl: string;
  createdAt: string;
}

export interface Wallet {
  currency: Currency;
  exchangeRate: number;
  id: string;
  name: string;
  position: number;
  type: WalletType;
  /** Saldo awal. Saldo berjalan selalu dihitung ulang dari transaksi. */
  initialBalance: number;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  icon: string;
  position: number;
  archived: boolean;
  archivedAt: string | null;
  createdAt: string;
}

export interface Transaction {
  currency: Currency;
  exchangeRate: number;
  id: string;
  walletId: string | null;
  categoryId: string | null;
  type: TransactionType;
  amount: number;
  note: string;
  /** YYYY-MM-DD */
  date: string;
  createdAt: string;
  /** Transfer legs are excluded from income/expense totals and breakdowns. */
  isTransfer: boolean;
  transferPairId: string | null;
}

/** Wallet + saldo berjalan & jumlah transaksi, siap dirender. */
export interface WalletWithBalance extends Wallet {
  typeLabel: string;
  icon: string;
  balance: number;
  transactionCount: number;
}

export interface WalletDetail extends WalletWithBalance {
  transactions: Transaction[];
  income: number;
  expense: number;
  transfersIn: number;
  transfersOut: number;
}

/** Wallet asal & tujuan dari satu pasangan transfer. */
export interface TransferPeer {
  fromWalletId: string | null;
  toWalletId: string | null;
}

export interface Totals {
  income: number;
  expense: number;
  net: number;
}

export interface TransactionFilters {
  currency: '' | Currency;
  search: string;
  walletId: string;
  categoryId: string;
  type: '' | TransactionType;
  from: string;
  to: string;
}

export type StatsMode = 'weekly' | 'monthly' | 'custom';

/** Rentang tanggal bebas (ISO yyyy-mm-dd) untuk mode 'custom'. */
export interface CustomRange {
  from: string;
  to: string;
}

export interface Period {
  mode: StatsMode;
  offset: number;
  start: Date;
  end: Date;
  from: string;
  to: string;
  label: string;
  rangeLabel: string;
}

export interface BreakdownRow {
  id: string;
  name: string;
  icon: string;
  amount: number;
  count: number;
  percent: number;
  color: string;
}

export interface SeriesRow {
  label: string;
  income: number;
  expense: number;
}

export interface Comparison {
  previous: Period;
  current: Totals;
  before: Totals;
  expenseDelta: number;
  incomeDelta: number;
}

export interface StatsSummary {
  period: Period;
  totals: Totals;
  breakdown: BreakdownRow[];
  series: SeriesRow[];
  comparison: Comparison;
  count: number;
}

export interface WalletPayload {
  currency: Currency;
  exchangeRate: number;
  name: string;
  type: WalletType;
  initialBalance: number;
}

export interface CategoryPayload {
  name: string;
  type: TransactionType;
  icon: string;
}

export interface TransactionPayload {
  currency: Currency;
  exchangeRate: number;
  walletId: string;
  categoryId: string;
  type: TransactionType;
  amount: number;
  note: string;
  date: string;
}

export interface TransferPayload {
  fromWalletId: string;
  fromCurrency: Currency;
  fromRate: number;
  fromAmount: number;
  toWalletId: string;
  toCurrency: Currency;
  toRate: number;
  toAmount: number;
  note: string;
  date: string;
}
