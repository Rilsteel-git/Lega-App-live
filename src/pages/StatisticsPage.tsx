/* ============================================================
   StatisticsPage.tsx — salinan section #page-statistics dari
   personal-wallet/index.html, dengan logika render.statistics()
   dan opsi chart yang sama persis dengan js/charts.js.
   ============================================================ */

import { useEffect, useState } from 'react';
import { Chart, type ChartOptions } from 'chart.js/auto';
import { Bar, Doughnut } from 'react-chartjs-2';
import type { StatsMode } from '../types';
import { useReport } from '../hooks/useReport';
import { useAppData } from '../context/AppDataContext';
import { useUi } from '../context/UiContext';
import { formatDateID, formatPercent, percent, txCount } from '../lib/format';
import { range, summary, transactionsIn } from '../lib/stats';
import { Icon } from '../components/IconSprite';
import { EmptyState, Segmented } from '../components/Ui';

Chart.defaults.font.family = 'Inter, ui-sans-serif, system-ui, sans-serif';
Chart.defaults.font.size = 11;
Chart.defaults.color = '#707872';

export function StatisticsPage() {
  const { wallets, categories } = useAppData();
  const { openModal } = useUi();
  const { transactions, formatCurrency, currency } = useReport();
  const [mode, setMode] = useState<StatsMode>('weekly');
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setExpanded({});
  }, [mode, offset]);

  const period = range(mode, offset);
  const report = summary(transactions, categories, period);
  const periodExpenses = transactionsIn(transactions, period).filter((item) => item.type === 'expense');
  const hasSeries = report.series.some((row) => row.income || row.expense);

  const delta = report.comparison.expenseDelta;
  const previousLabel = report.comparison.previous.label;
  const compareText = report.comparison.before.expense || report.totals.expense
    ? `Spending ${delta >= 0 ? 'up' : 'down'} ${formatPercent(Math.abs(delta))} vs ${previousLabel} (${formatCurrency(report.comparison.before.expense)}).`
    : `Nothing to compare with ${previousLabel} yet.`;

  const doughnutOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => {
            const data = context.dataset.data as number[];
            const total = data.reduce((a, b) => a + b, 0);
            const value = context.parsed as unknown as number;
            return ' ' + context.label + ': ' + formatCurrency(value) +
              ' (' + formatPercent(percent(value, total)) + ')';
          }
        }
      }
    }
  };

  const barOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { boxWidth: 9, boxHeight: 9, usePointStyle: true, pointStyle: 'circle', padding: 14 }
      },
      tooltip: {
        callbacks: {
          label: (context) => ' ' + context.dataset.label + ': ' + formatCurrency(context.parsed.y ?? 0)
        }
      }
    },
    scales: {
      x: { grid: { display: false }, border: { display: false } },
      y: {
        beginAtZero: true,
        border: { display: false },
        grid: { color: '#eef1ee' },
        ticks: { callback: (value) => formatCurrency(Number(value)) }
      }
    }
  };

  return (
    <section className="page active" id="page-statistics" aria-label="Statistics">
      <div className="stack">
        <article className="card">
          <div className="card-head">
            <div><h2>Overview</h2><p>Report in {currency} · saved transaction rates</p></div>
            <Segmented
              id="stats-period"
              label="Period"
              value={mode}
              onChange={(value) => { setMode(value); setOffset(0); }}
              options={[{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]}
            />
          </div>

          <div className="period-nav">
            <button className="icon-btn" type="button" aria-label="Previous period" onClick={() => setOffset(offset - 1)}>
              <Icon name="chevron-left" />
            </button>
            <div style={{ textAlign: 'center' }}>
              <strong id="period-label">{period.label}</strong>
              <small id="period-range">{period.rangeLabel}</small>
            </div>
            <button className="icon-btn" type="button" aria-label="Next period" onClick={() => setOffset(offset + 1)}>
              <Icon name="chevron-right" />
            </button>
          </div>

          <div style={{ height: 16 }} />
          <div className="stat-grid">
            <div className="stat">
              <small>Income</small>
              <strong className="income num" id="stats-income">{formatCurrency(report.totals.income)}</strong>
            </div>
            <div className="stat">
              <small>Expenses</small>
              <strong className="expense num" id="stats-expense">{formatCurrency(report.totals.expense)}</strong>
            </div>
            <div className="stat">
              <small>Net</small>
              <strong className={`num ${report.totals.net < 0 ? 'expense' : 'income'}`} id="stats-net">
                {formatCurrency(report.totals.net)}
              </strong>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '14px 0 0' }} id="stats-compare">{compareText}</p>
        </article>

        <div className="grid-2">
          <article className="card">
            <div className="card-head">
              <div><h3>Where it went</h3><p id="breakdown-label">By category · {period.label}</p></div>
              <span className="badge gray num" id="breakdown-total">{formatCurrency(report.totals.expense)} total</span>
            </div>
            <div className="chart-box">
              {report.breakdown.length ? (
                <Doughnut
                  data={{
                    labels: report.breakdown.map((row) => row.name),
                    datasets: [{
                      data: report.breakdown.map((row) => row.amount),
                      backgroundColor: report.breakdown.map((row) => row.color),
                      borderColor: '#fff',
                      borderWidth: 3,
                      hoverOffset: 6
                    }]
                  }}
                  options={doughnutOptions}
                />
              ) : (
                <div className="chart-empty">
                  <EmptyState
                    icon="stats"
                    title="Nothing spent yet"
                    message="No expenses in this period to break down by category."
                    actionLabel="Add expense"
                    onAction={() => openModal({ kind: 'transaction', type: 'expense' })}
                  />
                </div>
              )}
            </div>
            <div className="divider" style={{ margin: '18px 0' }} />
            <div className="breakdown" id="breakdown-list">
              {report.breakdown.map((row) => {
                const open = Boolean(expanded[row.id]);
                const items = periodExpenses
                  .filter((item) => (item.categoryId || 'deleted') === row.id)
                  .slice()
                  .sort((a, b) => (a.date < b.date ? 1 : -1));
                return (
                  <div className={`breakdown-row${open ? ' open' : ''}`} data-category={row.id} key={row.id}>
                    <button
                      className="breakdown-top"
                      type="button"
                      aria-expanded={open}
                      onClick={() => setExpanded({ ...expanded, [row.id]: !open })}
                    >
                      <i className="dot" style={{ background: row.color }} aria-hidden="true" />
                      <span className="breakdown-label">
                        <span className="breakdown-name">{row.icon} {row.name}</span>
                        <small>{txCount(row.count)} · {formatPercent(row.percent)}</small>
                      </span>
                      <span className="breakdown-value num">{formatCurrency(row.amount)}</span>
                      <span className="breakdown-chevron" aria-hidden="true"><Icon name="chevron-down" /></span>
                    </button>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{ width: `${Math.max(row.percent, 2)}%`, background: row.color }}
                      />
                    </div>
                    <div className="breakdown-items">
                      {items.length ? items.map((item) => {
                        const wallet = wallets.find((entry) => entry.id === item.walletId);
                        const note = item.note ||
                          (categories.find((entry) => entry.id === item.categoryId)?.name || 'Deleted category');
                        return (
                          <button
                            className="breakdown-item"
                            type="button"
                            key={item.id}
                            onClick={() => openModal({ kind: 'transaction', id: item.id })}
                          >
                            <span className="breakdown-item-body">
                              <span className="breakdown-item-title">{note}</span>
                              <small>{formatDateID(item.date)} · {wallet ? wallet.name : 'Deleted wallet'}</small>
                            </span>
                            <span className="breakdown-item-amount num">{formatCurrency(item.amount)}</span>
                          </button>
                        );
                      }) : <p className="breakdown-empty">No transactions to break down.</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="card">
            <div className="card-head">
              <div>
                <h3>Income vs expenses</h3>
                <p id="bar-label">
                  {period.mode === 'weekly' ? 'Per day · ' : 'Per week · '}{period.label}
                </p>
              </div>
            </div>
            <div className="chart-box tall">
              {hasSeries ? (
                <Bar
                  data={{
                    labels: report.series.map((row) => row.label),
                    datasets: [
                      {
                        label: 'Income',
                        data: report.series.map((row) => row.income),
                        backgroundColor: '#0b7a43',
                        borderRadius: 7,
                        maxBarThickness: 26
                      },
                      {
                        label: 'Expenses',
                        data: report.series.map((row) => row.expense),
                        backgroundColor: '#d93636',
                        borderRadius: 7,
                        maxBarThickness: 26
                      }
                    ]
                  }}
                  options={barOptions}
                />
              ) : (
                <div className="chart-empty">
                  <EmptyState
                    icon="receipt"
                    title="No transactions yet"
                    message="Add some income or expenses to see the comparison for this period."
                    actionLabel="Add transaction"
                    onAction={() => openModal({ kind: 'transaction' })}
                  />
                </div>
              )}
            </div>
            <div className="divider" style={{ margin: '18px 0' }} />
            <div id="stats-table">
              {hasSeries && (
                <>
                  <div className="legend">
                    {report.series.map((row) => (
                      <div className="legend-row" key={row.label}>
                        <i className="dot" style={{ background: '#0b7a43' }} aria-hidden="true" />
                        <span>{row.label}</span>
                        <strong className="num">
                          {formatCurrency(row.income)} / {formatCurrency(row.expense)}
                        </strong>
                      </div>
                    ))}
                  </div>
                  <p className="muted" style={{ fontSize: 11, margin: '12px 0 0' }}>
                    Shown as income / expenses
                  </p>
                </>
              )}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
