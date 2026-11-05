/* ============================================================
   WalletsPage.tsx — salinan section #page-wallets dari
   personal-wallet/index.html + logika render.wallets().
   ============================================================ */

import { useCallback } from 'react';
import { t } from '../i18n';
import { useReport } from '../hooks/useReport';
import { useAppData } from '../context/AppDataContext';
import { useUi } from '../context/UiContext';
import { withBalances } from '../lib/selectors';
import { EmptyState } from '../components/Ui';
import { AddWalletRow, WalletRow } from '../components/rows';
import { useReorderableList } from '../hooks/useReorderableList';

export function WalletsPage() {
  const { wallets, transactions, reorderWallets } = useAppData();
  const { openModal, formatBalance, toast } = useUi();

  const list = withBalances(wallets, transactions);
  const handleReorder = useCallback((ids: string[]) => {
    void reorderWallets(ids)
      .then(() => toast(t('Wallet order updated')))
      .catch((reason) => toast(reason instanceof Error ? reason.message : t('Could not reorder wallets.'), { variant: 'error' }));
  }, [reorderWallets, toast]);
  const walletIds = list.map((wallet) => wallet.id);
  const { order, containerRef, draggingId } = useReorderableList(walletIds, handleReorder);
  const sameSet = order.length === list.length && order.every((id) => list.some((wallet) => wallet.id === id));
  const orderedList = sameSet ? order.map((id) => list.find((wallet) => wallet.id === id)!) : list;
  const { total, formatBalance: reportBalance, currency } = useReport();

  return (
    <section className="page active" id="page-wallets" aria-label={t('Wallets')}>
      <div className="stack">
        <article className="card">
          <div className="card-head">
            <div><h2>{t('Combined balance ({currency})', { currency })}</h2><p>{t('Estimated using manual wallet rates')}</p></div>
          </div>
          <div className="stat-grid">
            <div className="stat">
              <small>{t('Total balance')}</small>
              <strong className="num" id="wallets-total">{reportBalance(total)}</strong>
            </div>
            <div className="stat">
              <small>{t('Wallets')}</small>
              <strong className="num" id="wallets-count">{list.length}</strong>
            </div>
            <div className="stat">
              <small>{t('Transactions')}</small>
              <strong className="num" id="wallets-tx-count">{transactions.length}</strong>
            </div>
          </div>
        </article>

        <article className="card">
          <div className="card-head">
            <div><h2>{t('All wallets')}</h2><p>{t('Balances update automatically as you add transactions')}</p></div>
          </div>
          <div className="wallet-list" id="wallets-list" ref={containerRef}>
            {list.length ? (
              <>
                {orderedList.map((wallet) => (
                  <WalletRow
                    key={wallet.id}
                    wallet={wallet}
                    formatBalance={formatBalance}
                    onOpen={(id) => openModal({ kind: 'wallet-detail', id })}
                    dragging={draggingId === wallet.id}
                  />
                ))}
                <AddWalletRow onClick={() => openModal({ kind: 'wallet' })} />
              </>
            ) : (
              <EmptyState
                icon="wallet"
                title={t('No wallets yet')}
                message={t('Create one for each place you keep money — a bank, an e-wallet, or cash.')}
                actionLabel={t('Add wallet')}
                onAction={() => openModal({ kind: 'wallet' })}
              />
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
