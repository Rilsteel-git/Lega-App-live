import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Currency, Category, CategoryPayload, Profile, Transaction, TransactionPayload, TransferPayload, Wallet, WalletPayload } from '../types';
import { useAuth } from './AuthContext';
import * as db from '../lib/db';
import { readCachedData, writeCachedData } from '../lib/dataCache';
import * as local from '../lib/optimistic';
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
  // Mirrors of state that async callbacks read after awaiting.
  const dataRef = useRef(data);
  const savingRef = useRef(0);

  const commit = useCallback((next: db.AppData) => {
    dataRef.current = next;
    setData(next);
    if (userId) writeCachedData(userId, next);
  }, [userId]);

  const startSaving = useCallback(() => { savingRef.current++; setSaving((count) => count + 1); }, []);
  const stopSaving = useCallback(() => { savingRef.current--; setSaving((count) => count - 1); }, []);

  const refresh = useCallback(async ({ whileSaving = false }: { whileSaving?: boolean } = {}) => {
    if (!userId) return;
    const request = ++requestId.current;
    setFetching(true);
    setError('');
    try {
      const next = await db.loadAppData(userId);
      // A save still in flight isn't in this response yet; applying it would
      // briefly undo that save on screen. Its own refresh will follow.
      if (request === requestId.current && (whileSaving || savingRef.current === 0)) {
        lastFetchedAt.current = Date.now();
        commit(next);
      }
    } catch (reason) {
      if (request === requestId.current) setError(reason instanceof Error ? reason.message : t('Could not load app data.'));
      throw reason;
    } finally {
      if (request === requestId.current) setFetching(false);
    }
  }, [commit, userId]);

  useEffect(() => {
    // Jangan tampilkan data user sebelumnya ketika session berganti.
    const cached = userId ? readCachedData(userId) : null;
    dataRef.current = cached;
    setData(cached);
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

  /** For writes whose result can't be predicted locally: wait for the
   *  write and the full reload behind the loader. */
  const run = useCallback(async (action: () => Promise<void>) => {
    if (!userId) throw new Error(t('Please log in again.'));
    startSaving();
    try {
      await action();
      try {
        await refresh({ whileSaving: true });
      } catch {
        throw new Error(t('Changes were saved, but the latest data could not be loaded. Refresh the page before trying again.'));
      }
    } finally {
      stopSaving();
    }
  }, [refresh, startSaving, stopSaving, userId]);

  /** Optimistic write: show the change at once, send it, and put the old data
   *  back if the server rejects it. Afterwards a background refresh picks up
   *  anything the server set differently, without a loader. */
  const mutate = useCallback(async (apply: (current: db.AppData) => db.AppData, action: () => Promise<void>) => {
    if (!userId) throw new Error(t('Please log in again.'));
    const before = dataRef.current;
    const optimistic = before ? apply(before) : null;
    if (optimistic) {
      // Drop any fetch already in flight: it predates this change.
      requestId.current++;
      setFetching(false);
      commit(optimistic);
    }
    startSaving();
    try {
      await action();
    } catch (reason) {
      // Restore the snapshot only if nothing else changed the data since;
      // otherwise reload so later changes aren't thrown away with this one.
      if (optimistic && before && dataRef.current === optimistic) commit(before);
      else void refresh().catch(() => {});
      throw reason;
    } finally {
      stopSaving();
    }
    void refresh().catch(() => { /* The saved change stays; the error banner offers a retry. */ });
  }, [commit, refresh, startSaving, stopSaving, userId]);

  const actions = useMemo((): Omit<AppDataValue, 'loading' | 'syncing' | 'initialized' | 'error' | 'profile' | 'wallets' | 'categories' | 'transactions' | 'refresh'> => ({
    addWallet: (payload) => {
      const id = crypto.randomUUID();
      return mutate((d) => local.addWallet(d, id, payload), () => db.createWallet(userId!, payload, id));
    },
    editWallet: (id, payload) => mutate((d) => local.editWallet(d, id, payload), () => db.updateWallet(id, payload)),
    removeWallet: (id) => mutate((d) => local.removeWallet(d, id), () => db.deleteWallet(id)),
    reorderWallets: (ids) => mutate((d) => local.reorderWallets(d, ids), () => db.reorderWallets(ids)),
    addCategory: (payload) => {
      const id = crypto.randomUUID();
      return mutate((d) => local.addCategory(d, id, payload), () => db.createCategory(userId!, payload, id));
    },
    editCategory: (id, payload) => mutate((d) => local.editCategory(d, id, payload), () => db.updateCategory(id, payload)),
    archiveCategory: (id) => mutate((d) => local.setCategoryArchived(d, id, true), () => db.archiveCategory(id)),
    restoreCategory: (id) => mutate((d) => local.setCategoryArchived(d, id, false), () => db.restoreCategory(id)),
    removeCategory: (id) => mutate((d) => local.removeCategory(d, id), () => db.deleteCategory(id)),
    reorderCategories: (ids) => mutate((d) => local.reorderCategories(d, ids), () => db.reorderCategories(ids)),
    addTransaction: (payload) => {
      const id = crypto.randomUUID();
      return mutate((d) => local.addTransaction(d, id, payload), () => db.createTransaction(userId!, payload, id));
    },
    editTransaction: (id, payload) => mutate((d) => local.editTransaction(d, id, payload), () => db.updateTransaction(id, payload)),
    removeTransaction: (id) => mutate((d) => local.removeTransaction(d, id), () => db.deleteTransaction(id)),
    addTransfer: (payload) => {
      const ids = { pairId: crypto.randomUUID(), fromId: crypto.randomUUID(), toId: crypto.randomUUID() };
      return mutate((d) => local.addTransfer(d, ids, payload), () => db.createTransfer(userId!, payload, ids));
    },
    removeTransfer: (pairId) => mutate((d) => local.removeTransfer(d, pairId), () => db.deleteTransfer(pairId)),
    saveProfile: (name, photoUrl) => mutate((d) => local.saveProfile(d, name, photoUrl), () => db.updateProfile(userId!, name, photoUrl)),
    // reset_my_data decides server-side what is left, so wait for the reload.
    resetData: () => run(db.resetMyData),
    // No run() wrapper: the account (and its session) is gone right after
    // this succeeds, so there's nothing left to refresh.
    deleteAccount: () => db.deleteMyAccount(),
    saveCurrencySettings: (currency, rate) => mutate((d) => local.saveCurrencySettings(d, currency, rate), () => db.updateCurrencySettings(userId!, currency, rate))
  }), [mutate, run, userId]);
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
