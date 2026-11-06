/* ============================================================
   format.ts — port dari js/utils.js: format uang, tanggal, angka.
   Perilaku dijaga identik dengan app vanilla.
   ============================================================ */

import type { Currency, TransactionType } from '../types';
import { fractionDigits } from './currency';
import { getLanguage, t, tp } from '../i18n';


export const MONTHS = [
  t('January'), t('February'), t('March'), t('April'), t('May'), t('June'),
  t('July'), t('August'), t('September'), t('October'), t('November'), t('December')
];

export const MONTHS_SHORT = [
  t('Jan'), t('Feb'), t('Mar'), t('Apr'), t('May'), t('Jun'),
  t('Jul'), t('Aug'), t('Sep'), t('Oct'), t('Nov'), t('Dec')
];

/* ---------- Uang ---------- */

export function formatCurrency(value: number, currency: Currency = 'IDR'): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency, currencyDisplay: currency === 'IDR' && getLanguage() === 'id' ? 'symbol' : 'code', minimumFractionDigits: fractionDigits(currency), maximumFractionDigits: fractionDigits(currency) }).format(Number(value) || 0);
}

function trimDecimal(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

/** Format ringkas untuk hero/stat: Rp1,2M, Rp850K */
export function formatCompact(value: number, currency: Currency = 'IDR'): string {
  if (currency !== 'IDR') return formatCurrency(value, currency);
  const n = Number(value) || 0;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1e9) return sign + 'Rp' + trimDecimal(abs / 1e9) + 'B';
  if (abs >= 1e6) return sign + 'Rp' + trimDecimal(abs / 1e6) + 'M';
  if (abs >= 1e3) return sign + 'Rp' + trimDecimal(abs / 1e3) + 'K';
  return formatCurrency(n);
}

/** Tanda + / − eksplisit supaya income/expense tidak dibedakan warna saja. */
export function formatSigned(value: number, type: TransactionType, currency: Currency = 'IDR'): string {
  const prefix = type === 'income' ? '+' : '−';
  return prefix + formatCurrency(Math.abs(Number(value) || 0), currency);
}

/** "Rp1.250.000" / "1.250.000" / "1250000" -> 1250000 */
export function parseAmount(raw: string | number): number {
  if (typeof raw === 'number') return raw;
  const cleaned = String(raw || '')
    .replace(/[^\d,-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? NaN : n;
}

/** Masking input nominal saat diketik: "1250000" -> "Rp1.250.000" */
export function maskAmount(value: string): string {
  const raw = value.replace(/[^\d]/g, '');
  if (!raw) return '';
  return 'Rp' + Number(raw).toLocaleString('id-ID');
}

/* ---------- Tanggal ---------- */

export function toIso(date: Date): string {
  return (
    date.getFullYear() +
    '-' +
    String(date.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(date.getDate()).padStart(2, '0')
  );
}

export function fromIso(iso: string): Date {
  const p = String(iso).split('-').map(Number);
  return new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
}

export function today(): string {
  return toIso(new Date());
}

/** dd/mm/yyyy */
export function formatDateShort(iso: string): string {
  if (!iso) return '';
  const p = String(iso).split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

/** 27 Aug 2026 */
export function formatDateID(iso: string): string {
  if (!iso) return '';
  const d = fromIso(iso);
  return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] + ' ' + d.getFullYear();
}

/** Today / Yesterday / 27 Aug 2026 */
export function formatDateRelative(iso: string): string {
  const now = new Date();
  const todayIso = toIso(now);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (iso === todayIso) return t('Today');
  if (iso === toIso(yesterday)) return t('Yesterday');
  return formatDateID(iso);
}

export function monthLabel(year: number, monthIndex: number): string {
  return MONTHS[monthIndex] + ' ' + year;
}

/** Minggu dimulai hari Senin (ISO 8601) */
export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d;
}

export function addDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/** Nomor minggu ISO — untuk label "Week 35" */
export function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/* ---------- Angka & teks ---------- */

export function percent(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export function formatPercent(value: number): string {
  return String(value) + '%';
}

/** "1 transaction" / "4 transactions" */
export function txCount(count: number): string {
  return tp(count, '{count} transaction', '{count} transactions');
}
