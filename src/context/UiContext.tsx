/* ============================================================
   UiContext.tsx — state UI global yang di app vanilla dipegang
   oleh js/ui.js + js/main.js: toast, confirm dialog, modal yang
   bisa dibuka dari halaman mana saja, dan preferensi
   "sembunyikan saldo" (localStorage `lega:hide-balance`).
   ============================================================ */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import type { Currency, TransactionFilters, TransactionType } from '../types';
import { formatCurrency } from '../lib/format';

export const EMPTY_FILTERS: TransactionFilters = {
  search: '', walletId: '', categoryId: '', type: '', from: '', to: '', currency: ''
};

const HIDE_KEY = 'lega:hide-balance';
/** Key sebelum rebranding; dibaca sekali supaya preferensi lama tidak hilang. */
const LEGACY_HIDE_KEY = 'mani:hide-balance';
const MASK = 'Rp' + '•'.repeat(6);

function readHidden(): boolean {
  try {
    const current = window.localStorage.getItem(HIDE_KEY);
    if (current !== null) return current === '1';
    const legacy = window.localStorage.getItem(LEGACY_HIDE_KEY);
    if (legacy === null) return false;
    window.localStorage.setItem(HIDE_KEY, legacy);
    window.localStorage.removeItem(LEGACY_HIDE_KEY);
    return legacy === '1';
  } catch { return false; }
}

function writeHidden(value: boolean) {
  try { window.localStorage.setItem(HIDE_KEY, value ? '1' : '0'); } catch { /* storage penuh/diblokir */ }
}

export interface ToastItem {
  id: number;
  title: string;
  message: string;
  variant: 'success' | 'error';
}

export interface ConfirmOptions {
  title?: string;
  message?: string;
  confirmLabel?: string;
  onConfirm: () => void;
}

export type ActiveModal =
  | { kind: 'wallet'; id?: string }
  | { kind: 'wallet-detail'; id: string }
  | { kind: 'category'; id?: string }
  | { kind: 'transaction'; id?: string; type?: TransactionType }
  | { kind: 'transfer'; fromWalletId?: string }
  | { kind: 'profile' }
  | null;

interface UiValue {
  toasts: ToastItem[];
  toast: (message: string, options?: { variant?: 'success' | 'error'; title?: string }) => void;
  dismissToast: (id: number) => void;
  confirmState: ConfirmOptions | null;
  confirm: (options: ConfirmOptions) => void;
  closeConfirm: () => void;
  modal: ActiveModal;
  openModal: (modal: ActiveModal) => void;
  closeModal: () => void;
  balanceHidden: boolean;
  toggleBalance: () => void;
  /** Format uang yang menghormati mode sembunyikan saldo. */
  formatBalance: (value: number, currency?: Currency) => string;
  /** Filter & halaman daftar transaksi — bisa diubah dari halaman lain. */
  filters: TransactionFilters;
  setFilters: (filters: TransactionFilters) => void;
  txPage: number;
  setTxPage: (page: number) => void;
}

const UiContext = createContext<UiValue | null>(null);

let toastId = 0;

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const [modal, setModal] = useState<ActiveModal>(null);
  const [balanceHidden, setBalanceHidden] = useState(readHidden);
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS);
  const [txPage, setTxPage] = useState(1);
  const toastTimers = useRef(new Map<number, number>());

  const closeConfirm = useCallback(() => setConfirmState(null), []);
  const closeModal = useCallback(() => setModal(null), []);

  useEffect(() => {
    return () => {
      toastTimers.current.forEach((timer) => window.clearTimeout(timer));
      toastTimers.current.clear();
    };
  }, []);

  const dismissToast = useCallback((id: number) => {
    window.clearTimeout(toastTimers.current.get(id));
    toastTimers.current.delete(id);
    setToasts((list) => list.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback<UiValue['toast']>((message, options = {}) => {
    const variant = options.variant || 'success';
    const id = ++toastId;
    const title = variant === 'error'
      ? (options.title || '× Error')
      : (options.title || '✓ Done');
    setToasts((list) => list.concat({ id, title, message, variant }));
    const timer = window.setTimeout(() => dismissToast(id), variant === 'error' ? 6000 : 3400);
    toastTimers.current.set(id, timer);
  }, [dismissToast]);

  const toggleBalance = useCallback(() => {
    setBalanceHidden((hidden) => !hidden);
  }, []);
  useEffect(() => { writeHidden(balanceHidden); }, [balanceHidden]);

  const formatBalance = useCallback(
    (value: number, currency: Currency = 'IDR') => (balanceHidden ? currency + MASK.slice(2) : formatCurrency(value, currency)),
    [balanceHidden]
  );

  const value = useMemo<UiValue>(() => ({
    toasts,
    toast,
    dismissToast,
    confirmState,
    confirm: setConfirmState,
    closeConfirm,
    modal,
    openModal: setModal,
    closeModal,
    balanceHidden,
    toggleBalance,
    formatBalance,
    filters,
    setFilters,
    txPage,
    setTxPage
  }), [
    toasts, toast, dismissToast, confirmState, closeConfirm, modal, closeModal,
    balanceHidden, toggleBalance, formatBalance, filters, txPage
  ]);

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi() {
  const value = useContext(UiContext);
  if (!value) throw new Error('useUi must be used inside UiProvider');
  return value;
}

/** Tumpukan toast — markup sama seperti #toast-stack di app vanilla. */
export function ToastStack() {
  const { toasts, dismissToast } = useUi();
  return (
    <div className="toast-stack" id="toast-stack" role="status" aria-live="polite">
      {toasts.map((item) => (
        <div className="toast" key={item.id}>
          <div>
            <b style={item.variant === 'error' ? { color: '#ffb4b4' } : undefined}>{item.title}</b>
            <br />
            {item.message}
          </div>
          <button
            type="button"
            className="toast-close"
            aria-label="Dismiss notification"
            onClick={() => dismissToast(item.id)}
          >
            {'×'}
          </button>
        </div>
      ))}
    </div>
  );
}

/** Kunci body saat popover/modal terbuka tidak diperlukan di sini;
 *  hook kecil ini hanya memastikan Escape menutup confirm dialog. */
export function useEscape(active: boolean, close: () => void) {
  useEffect(() => {
    if (!active) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, close]);
}
