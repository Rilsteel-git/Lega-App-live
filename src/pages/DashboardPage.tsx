/* ============================================================
   DashboardPage.tsx — salinan section #page-dashboard dari
   personal-wallet/index.html, diisi dengan logika render.dashboard().
   ============================================================ */

import { useReport } from '../hooks/useReport';
import { useAppData } from '../context/AppDataContext';
import { useUi } from '../context/UiContext';
import {
  formatPercent,
  today
} from '../lib/format';
import { recentTransactions, transferPeers, withBalances } from '../lib/selectors';
import { comparison, periodTotals, range } from '../lib/stats';
import { Icon } from '../components/IconSprite';
import { EmptyState } from '../components/Ui';
import { AddWalletCard, TransactionRow, WalletCard } from '../components/rows';
import { useDeleteTransfer } from '../components/Modals';

export function DashboardPage() {
  const { wallets, categories, transactions: nativeTransactions } = useAppData();
  const { openModal, balanceHidden, toggleBalance, formatBalance: nativeFormatBalance } = useUi();
  const removeTransfer = useDeleteTransfer();

  const { transactions, total, formatBalance, formatCurrency, currency } = useReport();
  const walletCards = withBalances(wallets, nativeTransactions);

  const month = range('monthly', 0);
  const monthTotals = periodTotals(transactions, month);
  const compare = comparison(transactions, month);

  const hasSpendingHistory = Boolean(compare.before.expense || compare.current.expense);
  const delta = compare.expenseDelta;

  const recent = recentTransactions(nativeTransactions, today());
  const peers = transferPeers(nativeTransactions);

  const badge = !monthTotals.income && !monthTotals.expense
    ? { className: 'badge gray', label: 'No data yet' }
    : monthTotals.net >= 0
      ? { className: 'badge green', label: 'On track' }
      : { className: 'badge red', label: 'Overspending' };

  return (
    <section className="page active" id="page-dashboard" aria-label="Dashboard">
      <div className="hero-grid">
        <article className="hero">
          <div className="hero-top">
            <span className="hero-label">Total balance ({currency})
              <button
                className="hero-eye"
                type="button"
                id="hero-balance-toggle"
                aria-pressed={balanceHidden}
                aria-label={balanceHidden ? 'Show balance' : 'Hide balance'}
                title={balanceHidden ? 'Show balance' : 'Hide balance'}
                onClick={toggleBalance}
              >
                <Icon name={balanceHidden ? 'eye-off' : 'eye'} />
              </button>
            </span>
            <span
              className="change"
              id="hero-change"
              title={hasSpendingHistory ? `Change in spending compared with ${compare.previous.label}` : undefined}
            >
              {hasSpendingHistory ? (
                <>
                  <Icon name={delta >= 0 ? 'arrow-out' : 'arrow-in'} />
                  <span>{formatPercent(Math.abs(delta))} spending</span>
                </>
              ) : 'This month'}
            </span>
          </div>
          <div className="hero-amount num" id="hero-balance">{formatBalance(total)}</div>
          <div className="hero-meta" id="hero-meta">
            {walletCards.length
              ? `${walletCards.length} wallet${walletCards.length > 1 ? 's' : ''} · estimated using manual wallet rates`
              : 'No wallets yet — add your first one to get started'}
          </div>
          <div className="quick-actions">
            <button
              className="quick"
              type="button"
              onClick={() => openModal({ kind: 'transaction', type: 'income' })}
            >
              <b><Icon name="plus" /></b>Income
            </button>
            <button
              className="quick"
              type="button"
              onClick={() => openModal({ kind: 'transaction', type: 'expense' })}
            >
              <b><Icon name="minus" /></b>Expense
            </button>
            <button className="quick" type="button" onClick={() => openModal({ kind: 'wallet' })}>
              <b><Icon name="wallet-plus" /></b>New wallet
            </button>
          </div>
        </article>

        <article className="card monthly">
          <div className="card-head">
            <div><h2>This month</h2><p id="month-summary-label">{month.label}</p></div>
            <span className={badge.className} id="month-summary-badge">{badge.label}</span>
          </div>
          <div className="mini-grid">
            <div className="mini">
              <small>Income</small>
              <strong className="income num" id="month-income">{formatCurrency(monthTotals.income)}</strong>
            </div>
            <div className="mini">
              <small>Expenses</small>
              <strong className="expense num" id="month-expense">{formatCurrency(monthTotals.expense)}</strong>
            </div>
          </div>
          <div>
            <div className="divider" />
            <p className="muted" style={{ fontSize: 12, margin: '12px 0 0' }}>
              Net cash flow{' '}
              <strong className={`num ${monthTotals.net < 0 ? 'expense' : 'income'}`} id="month-net">
                {formatCurrency(monthTotals.net)}
              </strong>
            </p>
          </div>
        </article>
      </div>

      <div className="dashboard-grid">
        <article className="card">
          <div className="card-head">
            <div><h2>Your wallets</h2><p>Every money source in one place</p></div>
            <a className="btn ghost" href="#/wallets">Manage <Icon name="chevron-right" /></a>
          </div>
          <div className="wallet-grid" id="dashboard-wallets">
            {walletCards.length ? (
              <>
                {walletCards.slice(0, 3).map((wallet) => (
                  <WalletCard
                    key={wallet.id}
                    wallet={wallet}
                    formatBalance={nativeFormatBalance}
                    onOpen={(id) => openModal({ kind: 'wallet-detail', id })}
                  />
                ))}
                <AddWalletCard onClick={() => openModal({ kind: 'wallet' })} />
              </>
            ) : (
              <EmptyState
                icon="wallet"
                title="No wallets yet"
                message="Add your first wallet so transactions have somewhere to live."
                actionLabel="Add wallet"
                onAction={() => openModal({ kind: 'wallet' })}
              />
            )}
          </div>
        </article>

        <article className="card">
          <div className="card-head">
            <div><h2>Recent activity</h2><p>Your last 5 transactions</p></div>
            <a className="btn ghost" href="#/transactions">See all <Icon name="chevron-right" /></a>
          </div>
          <div className="transactions" id="dashboard-transactions">
            {recent.length ? (
              recent.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  categories={categories}
                  wallets={wallets}
                  showDate
                  transfer={transaction.transferPairId ? peers.get(transaction.transferPairId) : undefined}
                  onOpen={(id) => transaction.transferPairId
                    ? removeTransfer(transaction.transferPairId)
                    : openModal({ kind: 'transaction', id })}
                />
              ))
            ) : (
              <EmptyState
                icon="receipt"
                title="No transactions yet"
                message="Record your first one to start seeing the pattern."
                actionLabel="Add transaction"
                onAction={() => openModal({ kind: 'transaction' })}
              />
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
