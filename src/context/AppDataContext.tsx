import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Currency, Category, CategoryPayload, Profile, Transaction, TransactionPayload, TransferPayload, Wallet, WalletPayload } from '../types';
import { useAuth } from './AuthContext';
import * as db from '../lib/db';
import { readCachedData, writeCachedData } from '../lib/dataCache';
import { t } from '../i18n';

/** Refetch on return to the app only when the data is older than this. */
const REVALIDATE_AFTER_MS = 30_000;

interface AppDataValue {
  /** Blocking work: the first load with nothing cached, or saving a change. */
  loading: boolean;
  /** Any fetch in flight, including a background refresh over cached data. */
  syncing: boolean;
  initialized: boolean;
  error: string;
  profile: Profile | null;
  wallets: Wallet[];
  categories: Category[];
  transactions: Transaction[];
  refresh: () => Promise<void>;
  addWallet: (payload: WalletPayload) => Promise<void>;
  editWallet: (id: string, payload: WalletPayload) => Promise<void>;
  removeWallet: (id: string) => Promise<void>;
  reorderWallets: (ids: string[]) => Promise<void>;
  addCategory: (payload: CategoryPayload) => Promise<void>;
  editCategory: (id: string, payload: CategoryPayload) => Promise<void>;
  archiveCategory: (id: string) => Promise<void>;
  restoreCategory: (id: string) => Promise<void>;
  removeCategory: (id: string) => Promise<void>;
  reorderCategories: (ids: string[]) => Promise<void>;
  addTransaction: (payload: TransactionPayload) => Promise<void>;
  editTransaction: (id: string, payload: TransactionPayload) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
  addTransfer: (payload: TransferPayload) => Promise<void>;
  removeTransfer: (pairId: string) => Promise<void>;
  saveProfile: (name: string, photoUrl?: string) => Promise<void>;
  resetData: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  saveCurrencySettings: (currency: Currency, rate: number) => Promise<void>;
}

const AppDataContext = createContext<AppDataValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const requestId = useRef(0);
  const lastFetchedAt = useRef(0);
  // Show the data cached on this device right away; refresh() below brings it
  // up to date in the background.
  const [data, setData] = useState<db.AppData | null>(() => (userId ? readCachedData(userId) : null));
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(0);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!userId) return;
    const request = ++requestId.current;
    setFetching(true);
    setError('');
    try {
      const next = await db.loadAppData(userId);
      if (request === requestId.current) {
        lastFetchedAt.current = Date.now();
        setData(next);
        writeCachedData(userId, next);
      }
    } catch (reason) {
      if (request === requestId.current) setError(reason instanceof Error ? reason.message : t('Could not load app data.'));
      throw reason;
    } finally {
      if (request === requestId.current) setFetching(false);
    }
  }, [userId]);

  useEffect(() => {
    // Jangan tampilkan data user sebelumnya ketika session berganti.
    setData(userId ? readCachedData(userId) : null);
    setError('');
    void refresh().catch(() => { /* Error is rendered by the provider consumer. */ });
    return () => { requestId.current++; };
  }, [refresh, userId]);

  // Pick up changes made on another device when the user comes back to the
  // app, without a loader: the cached data stays on screen meanwhile.
  useEffect(() => {
    const revalidate = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastFetchedAt.current < REVALIDATE_AFTER_MS) return;
      void refresh().catch(() => {});
    };
    document.addEventListener('visibilitychange', revalidate);
    window.addEventListener('online', revalidate);
    return () => {
      document.removeEventListener('visibilitychange', revalidate);
      window.removeEventListener('online', revalidate);
    };
  }, [refresh]);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (!userId) throw new Error(t('Please log in again.'));
    setSaving((count) => count + 1);
    try {
      await action();
      try {
        await refresh();
      } catch {
        throw new Error(t('Changes were saved, but the latest data could not be loaded. Refresh the page before trying again.'));
      }
    } finally {
      setSaving((count) => count - 1);
    }
  }, [refresh, userId]);

  const actions = useMemo((): Omit<AppDataValue, 'loading' | 'syncing' | 'initialized' | 'error' | 'profile' | 'wallets' | 'categories' | 'transactions' | 'refresh'> => ({
    addWallet: (payload) => run(() => db.createWallet(userId!, payload)),
    editWallet: (id, payload) => run(() => db.updateWallet(id, payload)),
    removeWallet: (id) => run(() => db.deleteWallet(id)),
    reorderWallets: (ids) => run(() => db.reorderWallets(ids)),
    addCategory: (payload) => run(() => db.createCategory(userId!, payload)),
    editCategory: (id, payload) => run(() => db.updateCategory(id, payload)),
    archiveCategory: (id) => run(() => db.archiveCategory(id)),
    restoreCategory: (id) => run(() => db.restoreCategory(id)),
    removeCategory: (id) => run(() => db.deleteCategory(id)),
    reorderCategories: (ids) => run(() => db.reorderCategories(ids)),
    addTransaction: (payload) => run(() => db.createTransaction(userId!, payload)),
    editTransaction: (id, payload) => run(() => db.updateTransaction(id, payload)),
    removeTransaction: (id) => run(() => db.deleteTransaction(id)),
    addTransfer: (payload) => run(() => db.createTransfer(userId!, payload)),
    removeTransfer: (pairId) => run(() => db.deleteTransfer(pairId)),
    saveProfile: (name, photoUrl) => run(() => db.updateProfile(userId!, name, photoUrl)),
    resetData: () => run(db.resetMyData),
    // No run() wrapper: the account (and its session) is gone right after
    // this succeeds, so there's nothing left to refresh.
    deleteAccount: () => db.deleteMyAccount(),
    saveCurrencySettings: (currency, rate) => run(() => db.updateCurrencySettings(userId!, currency, rate))
  }), [run, userId]);
  const value = useMemo<AppDataValue>(() => ({
    ...actions,
    loading: saving > 0 || (data === null && fetching),
    syncing: fetching,
    initialized: data !== null,
    error,
    profile: data?.profile || null, wallets: data?.wallets || [],
    categories: data?.categories || [], transactions: data?.transactions || [], refresh
  }), [actions, saving, fetching, error, data, refresh]);
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData must be used inside AppDataProvider');
  return value;
}

export type { Category, Transaction, Wallet };
