/* ============================================================
   stats.ts — port dari js/stats.js.
   Minggu dimulai Senin (ISO 8601). Periode = { mode, offset }:
   offset 0 = periode berjalan, -1 = sebelumnya, +1 = berikutnya.
   ============================================================ */

import type {
  BreakdownRow,
  Category,
  Comparison,
  Period,
  SeriesRow,
  StatsMode,
  StatsSummary,
  Totals,
  Transaction,
  TransactionType
} from '../types';
import {
  addDays,
  endOfMonth,
  formatDateID,
  isoWeekNumber,
  monthLabel,
  percent,
  startOfWeek,
  toIso
} from './format';
import { inRange, resolveCategory, totals } from './selectors';

/** Warna kategori berurutan sesuai design system (merah dicadangkan untuk expense). */
export const PALETTE = [
  '#0b7a43', '#31bc62', '#0284c7', '#d97706',
  '#7c3aed', '#08acc9', '#b45309', '#0f766e'
];

export function colorAt(index: number): string {
  return PALETTE[index % PALETTE.length];
}

export function range(mode: StatsMode, offset: number): Period {
  const now = new Date();

  if (mode === 'weekly') {
    const start = addDays(startOfWeek(now), (offset || 0) * 7);
    const end = addDays(start, 6);
    return {
      mode: 'weekly',
      offset: offset || 0,
      start,
      end,
      from: toIso(start),
      to: toIso(end),
      label: 'Week ' + isoWeekNumber(start),
      rangeLabel: formatDateID(toIso(start)) + ' – ' + formatDateID(toIso(end))
    };
  }

  const first = new Date(now.getFullYear(), now.getMonth() + (offset || 0), 1);
  const last = endOfMonth(first);
  return {
    mode: 'monthly',
    offset: offset || 0,
    start: first,
    end: last,
    from: toIso(first),
    to: toIso(last),
    label: monthLabel(first.getFullYear(), first.getMonth()),
    rangeLabel: formatDateID(toIso(first)) + ' – ' + formatDateID(toIso(last))
  };
}

export function transactionsIn(transactions: Transaction[], period: Period): Transaction[] {
  return inRange(transactions, period.from, period.to);
}

export function periodTotals(transactions: Transaction[], period: Period): Totals {
  return totals(transactionsIn(transactions, period));
}

/** Breakdown per kategori, urut dari nominal terbesar. */
export function breakdown(
  transactions: Transaction[],
  categories: Category[],
  period: Period,
  type: TransactionType = 'expense'
): BreakdownRow[] {
  const list = transactionsIn(transactions, period).filter((item) => item.type === type && !item.isTransfer);
  const total = list.reduce((sum, item) => sum + item.amount, 0);
  const map = new Map<string, Omit<BreakdownRow, 'percent' | 'color'>>();

  list.forEach((item) => {
    const key = item.categoryId || 'deleted';
    if (!map.has(key)) {
      const category = resolveCategory(categories, item.categoryId);
      map.set(key, { id: key, name: category.name, icon: category.icon, amount: 0, count: 0 });
    }
    const row = map.get(key)!;
    row.amount += item.amount;
    row.count += 1;
  });

  return Array.from(map.values())
    .sort((a, b) => b.amount - a.amount)
    .map((row, index) => ({
      ...row,
      percent: percent(row.amount, total),
      color: colorAt(index)
    }));
}

/** Deret bar chart: per hari (mingguan) atau per minggu (bulanan). */
export function series(transactions: Transaction[], period: Period): SeriesRow[] {
  const buckets: { label: string; from: string; to: string }[] = [];

  if (period.mode === 'weekly') {
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (let i = 0; i < 7; i++) {
      const day = addDays(period.start, i);
      buckets.push({ label: dayNames[i], from: toIso(day), to: toIso(day) });
    }
  } else {
    let cursor = new Date(period.start);
    let week = 1;
    while (cursor <= period.end) {
      let endOfBucket = addDays(cursor, 6);
      if (endOfBucket > period.end) endOfBucket = period.end;
      buckets.push({ label: 'Week ' + week, from: toIso(cursor), to: toIso(endOfBucket) });
      cursor = addDays(endOfBucket, 1);
      week += 1;
    }
  }

  return buckets.map((bucket) => {
    const result = totals(inRange(transactions, bucket.from, bucket.to));
    return { label: bucket.label, income: result.income, expense: result.expense };
  });
}

/** Perbandingan dengan periode sebelumnya (FR-4.5). */
export function comparison(transactions: Transaction[], period: Period): Comparison {
  const previous = range(period.mode, period.offset - 1);
  const current = periodTotals(transactions, period);
  const before = periodTotals(transactions, previous);

  function delta(now: number, prev: number): number {
    if (!prev) return now ? 100 : 0;
    return percent(now - prev, prev);
  }

  return {
    previous,
    current,
    before,
    expenseDelta: delta(current.expense, before.expense),
    incomeDelta: delta(current.income, before.income)
  };
}

export function summary(
  transactions: Transaction[],
  categories: Category[],
  period: Period
): StatsSummary {
  return {
    period,
    totals: periodTotals(transactions, period),
    breakdown: breakdown(transactions, categories, period, 'expense'),
    series: series(transactions, period),
    comparison: comparison(transactions, period),
    count: transactionsIn(transactions, period).length
  };
}
