/* ============================================================
   optimistic.ts — applies a change to the local copy of the
   data the same way the database will, so the UI can show it
   before the server answers. Each function mirrors one write in
   lib/db.ts, including its cascades (see supabase/schema.sql).
   A background refresh afterwards reconciles anything the
   server decides differently (defaults, ordering ties).
   ============================================================ */

import type { AppData, TransferIds } from './db';
import type { Category, CategoryPayload, Currency, Transaction, TransactionPayload, TransferPayload, Wallet, WalletPayload } from '../types';

const now = () => new Date().toISOString();

/** Same order as loadAppData: newest date first, then newest created. */
function sortTransactions(list: Transaction[]) {
  return [...list].sort((a, b) =>
    (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) ||
    (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

function byPosition<T extends { position: number }>(list: T[]) {
  return [...list].sort((a, b) => a.position - b.position);
}

function reorder<T extends { id: string; position: number }>(list: T[], ids: string[]) {
  const positions = new Map(ids.map((id, index) => [id, index]));
  return byPosition(list.map((item) => (positions.has(item.id) ? { ...item, position: positions.get(item.id)! } : item)));
}

// ---------- Wallets ----------

export function addWallet(data: AppData, id: string, payload: WalletPayload): AppData {
  const position = data.wallets.reduce((max, wallet) => Math.max(max, wallet.position), -1) + 1;
  const wallet: Wallet = {
    id, name: payload.name.trim(), type: payload.type, initialBalance: payload.initialBalance,
    currency: payload.currency, exchangeRate: payload.exchangeRate, position, createdAt: now()
  };
  return { ...data, wallets: [...data.wallets, wallet] };
}

export function editWallet(data: AppData, id: string, payload: WalletPayload): AppData {
  return {
    ...data,
    wallets: data.wallets.map((wallet) => (wallet.id === id ? {
      ...wallet, name: payload.name.trim(), type: payload.type, initialBalance: payload.initialBalance,
      currency: payload.currency, exchangeRate: payload.exchangeRate
    } : wallet))
  };
}

/** transactions.wallet_id is `on delete cascade`. */
export function removeWallet(data: AppData, id: string): AppData {
  return {
    ...data,
    wallets: data.wallets.filter((wallet) => wallet.id !== id),
    transactions: data.transactions.filter((transaction) => transaction.walletId !== id)
  };
}

export function reorderWallets(data: AppData, ids: string[]): AppData {
  return { ...data, wallets: reorder(data.wallets, ids) };
}

// ---------- Categories ----------

export function addCategory(data: AppData, id: string, payload: CategoryPayload): AppData {
  // The insert doesn't set position, so the column default (0) applies.
  const category: Category = {
    id, name: payload.name.trim(), type: payload.type, icon: payload.icon,
    position: 0, archived: false, archivedAt: null, createdAt: now()
  };
  return { ...data, categories: byPosition([category, ...data.categories]) };
}

export function editCategory(data: AppData, id: string, payload: CategoryPayload): AppData {
  return {
    ...data,
    categories: data.categories.map((category) => (category.id === id
      ? { ...category, name: payload.name.trim(), type: payload.type, icon: payload.icon }
      : category))
  };
}

export function setCategoryArchived(data: AppData, id: string, archived: boolean): AppData {
  return {
    ...data,
    categories: data.categories.map((category) => (category.id === id
      ? { ...category, archived, archivedAt: archived ? now() : null }
      : category))
  };
}

/** transactions.category_id is `on delete set null`. */
export function removeCategory(data: AppData, id: string): AppData {
  return {
    ...data,
    categories: data.categories.filter((category) => category.id !== id),
    transactions: data.transactions.map((transaction) => (transaction.categoryId === id
      ? { ...transaction, categoryId: null }
      : transaction))
  };
}

export function reorderCategories(data: AppData, ids: string[]): AppData {
  return { ...data, categories: reorder(data.categories, ids) };
}

// ---------- Transactions ----------

function transactionFields(payload: TransactionPayload) {
  return {
    walletId: payload.walletId, categoryId: payload.categoryId || null, type: payload.type,
    amount: payload.amount, currency: payload.currency, exchangeRate: payload.exchangeRate,
    note: payload.note.trim(), date: payload.date
  };
}

export function addTransaction(data: AppData, id: string, payload: TransactionPayload): AppData {
  const transaction: Transaction = {
    id, ...transactionFields(payload), createdAt: now(), isTransfer: false, transferPairId: null
  };
  return { ...data, transactions: sortTransactions([transaction, ...data.transactions]) };
}

export function editTransaction(data: AppData, id: string, payload: TransactionPayload): AppData {
  return {
    ...data,
    transactions: sortTransactions(data.transactions.map((transaction) => (transaction.id === id
      ? { ...transaction, ...transactionFields(payload) }
      : transaction)))
  };
}

export function removeTransaction(data: AppData, id: string): AppData {
  return { ...data, transactions: data.transactions.filter((transaction) => transaction.id !== id) };
}

export function addTransfer(data: AppData, ids: TransferIds, payload: TransferPayload): AppData {
  const createdAt = now();
  const note = payload.note.trim();
  const leg = (id: string, walletId: string, type: Transaction['type'], amount: number, currency: Currency, exchangeRate: number): Transaction => ({
    id, walletId, categoryId: null, type, amount, currency, exchangeRate, note,
    date: payload.date, createdAt, isTransfer: true, transferPairId: ids.pairId
  });
  return {
    ...data,
    transactions: sortTransactions([
      leg(ids.fromId, payload.fromWalletId, 'expense', payload.fromAmount, payload.fromCurrency, payload.fromRate),
      leg(ids.toId, payload.toWalletId, 'income', payload.toAmount, payload.toCurrency, payload.toRate),
      ...data.transactions
    ])
  };
}

export function removeTransfer(data: AppData, pairId: string): AppData {
  return { ...data, transactions: data.transactions.filter((transaction) => transaction.transferPairId !== pairId) };
}

// ---------- Profile ----------

export function saveProfile(data: AppData, name: string, photoUrl?: string): AppData {
  return {
    ...data,
    profile: { ...data.profile, name: name.trim(), ...(photoUrl !== undefined ? { photoUrl } : {}) }
  };
}

export function saveCurrencySettings(data: AppData, currency: Currency, rate: number): AppData {
  return { ...data, profile: { ...data.profile, reportCurrency: currency, reportRate: rate } };
}
