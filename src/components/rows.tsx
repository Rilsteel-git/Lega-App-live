/* ============================================================
   rows.tsx — partial yang dipakai berulang di beberapa halaman.
   Markup-nya adalah salinan 1:1 dari partial di js/render.js
   (walletCard, walletRow, addWalletRow, transactionRow).
   ============================================================ */

import { t } from '../i18n';
import type { Currency, Category, Transaction, TransferPeer, Wallet, WalletWithBalance } from '../types';
import { formatCurrency, formatSigned, formatDateRelative, txCount } from '../lib/format';
import { resolveCategory } from '../lib/selectors';
import { Icon, type IconName } from './IconSprite';
import { CategoryIcon } from './Ui';

/** Kartu wallet (dashboard). `onEdit`/`onDelete` kosong = tanpa tombol aksi.
 *  `onOpen` kosong = kartu tidak bisa di-tap (dipertahankan buat konteks lain). */
export function WalletCard({
  wallet,
  formatBalance,
  onEdit,
  onDelete,
  onOpen
}: {
  wallet: WalletWithBalance;
  formatBalance: (value: number, currency?: Currency) => string;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onOpen?: (id: string) => void;
}) {
  const negative = wallet.balance < 0;
  const body = (
    <>
      <div className="wallet-top">
        <div className="wallet-name">
          <span className="wallet-icon"><Icon name={wallet.icon as IconName} /></span>
          {wallet.name}
        </div>
        {(onEdit || onDelete) && (
          <div className="wallet-actions">
            {onEdit && (
              <button
                className="wallet-menu"
                type="button"
                aria-label={t('Edit wallet {name}', { name: wallet.name })}
                title={t('Edit')}
                onClick={(event) => { event.stopPropagation(); onEdit(wallet.id); }}
              >
                <Icon name="edit" />
              </button>
            )}
            {onDelete && (
              <button
                className="wallet-menu"
                type="button"
                aria-label={t('Delete wallet {name}', { name: wallet.name })}
                title={t('Delete')}
                onClick={(event) => { event.stopPropagation(); onDelete(wallet.id); }}
              >
                <Icon name="close" />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="wallet-balance num">{formatBalance(wallet.balance, wallet.currency)}</div>
      <div className="wallet-meta">{wallet.typeLabel} · {txCount(wallet.transactionCount)}</div>
      {negative && <div className="wallet-hint">{t('Balance below zero')}</div>}
    </>
  );

  if (!onOpen) {
    return <div className={`wallet${negative ? ' negative' : ''}`}>{body}</div>;
  }

  return (
    <button
      className={`wallet${negative ? ' negative' : ''}`}
      type="button"
      aria-label={t('Open {name}', { name: wallet.name })}
      onClick={() => onOpen(wallet.id)}
    >
      {body}
    </button>
  );
}

export function AddWalletCard({ onClick }: { onClick: () => void }) {
  return (
    <button className="wallet add-wallet" type="button" onClick={onClick}>
      <div className="wallet-name"><span className="wallet-icon"><Icon name="plus" /></span>{t('Add wallet')}</div>
      <div className="wallet-meta" style={{ marginTop: 18 }}>{t('Somewhere new to keep money')}</div>
    </button>
  );
}

/** Baris ringkas untuk halaman Wallets; seluruh baris membuka detail. */
export function WalletRow({
  wallet,
  formatBalance,
  onOpen,
  dragging = false
}: {
  wallet: WalletWithBalance;
  formatBalance: (value: number, currency?: Currency) => string;
  onOpen: (id: string) => void;
  dragging?: boolean;
}) {
  const negative = wallet.balance < 0;
  return (
    <div
      className={`wallet-row wallet-row-item${negative ? ' negative' : ''}${dragging ? ' dragging' : ''}`}
      data-drag-id={wallet.id}
      tabIndex={0}
      role="button"
      aria-label={t('Open {name}. Drag to reorder.', { name: wallet.name })}
      onClick={() => onOpen(wallet.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(wallet.id);
        }
      }}
    >
      <span className="wallet-icon"><Icon name={wallet.icon as IconName} /></span>
      <span className="wallet-row-body">
        <span className="wallet-row-name">{wallet.name}</span>
        <small>{wallet.typeLabel} · {txCount(wallet.transactionCount)}</small>
      </span>
      <span className="wallet-row-balance num">{formatBalance(wallet.balance, wallet.currency)}</span>
      <span className="wallet-row-chevron" aria-hidden="true"><Icon name="chevron-right" /></span>
    </div>
  );
}

export function AddWalletRow({ onClick }: { onClick: () => void }) {
  return (
    <button className="add-wallet-row" type="button" onClick={onClick}>
      <span className="wallet-icon"><Icon name="plus" /></span>
      <span className="wallet-row-body">
        <span className="wallet-row-name">{t('Add wallet')}</span>
        <small>{t('Somewhere new to keep money')}</small>
      </span>
    </button>
  );
}

/**
 * Satu baris transaksi. Seluruh baris bisa ditekan untuk membuka
 * detail/edit; tanpa `onOpen` baris dirender sebagai div statis.
 */
export function TransactionRow({
  transaction,
  categories,
  wallets,
  showDate = false,
  onOpen,
  transfer
}: {
  transaction: Transaction;
  categories: Category[];
  wallets: Wallet[];
  showDate?: boolean;
  onOpen?: (id: string) => void;
  /** Wallet asal & tujuan kalau baris ini bagian dari transfer. */
  transfer?: TransferPeer;
}) {
  const category = resolveCategory(categories, transaction.categoryId);
  const wallet = wallets.find((item) => item.id === transaction.walletId);
  const walletName = wallet ? wallet.name : t('Deleted wallet');
  const isTransfer = transaction.isTransfer;

  function nameOf(id: string | null | undefined) {
    return wallets.find((item) => item.id === id)?.name || t('Deleted wallet');
  }

  // Transfer bukan income/expense — ditampilkan netral (tanpa +/− dan tanpa
  // warna merah/hijau), sebagai satu baris "asal → tujuan".
  const route = isTransfer
    ? (transfer ? `${nameOf(transfer.fromWalletId)} → ${nameOf(transfer.toWalletId)}` : walletName)
    : '';
  const metaParts = isTransfer ? [route] : [category.name, walletName];
  if (showDate) metaParts.unshift(formatDateRelative(transaction.date));
  const title = isTransfer ? (transaction.note || t('Transfer')) : (transaction.note || category.name);

  const body = (
    <>
      <span className="transaction-icon" aria-hidden="true">
        {isTransfer ? <Icon name="transfer" /> : <CategoryIcon icon={category.icon} />}
      </span>
      <span className="transaction-body">
        <span className="transaction-title">{title}</span>
        <span className="transaction-meta">{metaParts.join(' · ')}</span>
      </span>
      <span className={`transaction-amount num ${isTransfer ? 'transfer' : transaction.type}`}>
        {isTransfer
          ? formatCurrency(transaction.amount, transaction.currency)
          : formatSigned(transaction.amount, transaction.type, transaction.currency)}
      </span>
    </>
  );

  if (!onOpen) {
    return <div className="transaction" data-id={transaction.id}>{body}</div>;
  }

  return (
    <button
      className="transaction"
      data-id={transaction.id}
      type="button"
      aria-label={t('Edit {title}', { title })}
      onClick={() => onOpen(transaction.id)}
    >
      {body}
    </button>
  );
}
