/* ============================================================
   DatePicker.tsx — port dari date picker di js/ui.js.
   Dua varian dengan markup yang sama seperti app vanilla:
     - RangeDatePicker  -> filter tanggal di halaman Transactions
     - SingleDatePicker -> field tanggal di modal transaksi
   Minggu dimulai hari Senin, sama seperti sisa aplikasi.
   ============================================================ */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n';
import {
  addDays,
  endOfMonth,
  formatDateID,
  formatDateShort,
  fromIso,
  monthLabel,
  startOfMonth,
  startOfWeek,
  toIso,
  today
} from '../lib/format';
import { Icon } from './IconSprite';
import { useOutsideClose } from './Ui';
import { useFloatingPopover } from '../lib/floating';

const WEEKDAYS = [t('Mon'), t('Tue'), t('Wed'), t('Thu'), t('Fri'), t('Sat'), t('Sun')];

/** 42 sel kalender untuk satu bulan (6 baris penuh). */
function monthDays(year: number, month: number): string[] {
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7; // Senin = 0
  const cells: string[] = [];
  for (let index = 0; index < 42; index++) {
    cells.push(toIso(new Date(year, month, index - firstDay + 1)));
  }
  return cells;
}

function Calendar({
  cursor,
  onCursorChange,
  onPick,
  className,
  isSelected,
  isInRange
}: {
  cursor: string; // YYYY-MM
  onCursorChange: (value: string) => void;
  onPick: (iso: string) => void;
  className: string;
  isSelected: (iso: string) => boolean;
  isInRange?: (iso: string) => boolean;
}) {
  const [year, month] = cursor.split('-').map(Number);
  const monthIndex = month - 1;
  const days = useMemo(() => monthDays(year, monthIndex), [year, monthIndex]);
  const todayIso = today();

  function shiftMonth(step: number) {
    const next = new Date(year, monthIndex + step, 1);
    onCursorChange(toIso(next).slice(0, 7));
  }

  return (
    <div className={className}>
      <div className="calendar-head">
        <strong className="calendar-month">{monthLabel(year, monthIndex)}</strong>
        <div className="calendar-nav">
          <button type="button" aria-label={t('Previous month')} onClick={() => shiftMonth(-1)}>
            <Icon name="chevron-left" />
          </button>
          <button type="button" aria-label={t('Next month')} onClick={() => shiftMonth(1)}>
            <Icon name="chevron-right" />
          </button>
        </div>
      </div>
      <div className="calendar-weekdays">
        {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="calendar-days">
        {days.map((iso) => {
          const classes = ['calendar-day'];
          if (fromIso(iso).getMonth() !== monthIndex) classes.push('muted');
          if (iso === todayIso) classes.push('today');
          if (isSelected(iso)) classes.push('selected');
          else if (isInRange && isInRange(iso)) classes.push('in-range');
          return (
            <button
              key={iso}
              type="button"
              className={classes.join(' ')}
              data-iso={iso}
              aria-label={formatDateID(iso)}
              onClick={() => onPick(iso)}
            >
              {fromIso(iso).getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   RANGE
   ============================================================ */
export function RangeDatePicker({
  id = 'tx-date-picker',
  from,
  to,
  onApply,
  onClear,
  onError
}: {
  id?: string;
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
  onClear: () => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [active, setActive] = useState<'from' | 'to'>('from');
  const [cursor, setCursor] = useState((from || today()).slice(0, 7));
  const root = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useOutsideClose(root, open, () => setOpen(false), popoverRef);
  useFloatingPopover(open, triggerRef, popoverRef, 'right');

  // Nilai filter dari luar (mis. tombol "Clear filters") ikut tersalin ke draft.
  useEffect(() => { setDraftFrom(from); setDraftTo(to); }, [from, to]);

  function pick(iso: string) {
    if (active === 'from' || !draftFrom || iso < draftFrom) {
      setDraftFrom(iso);
      setDraftTo('');
      setActive('to');
    } else {
      setDraftTo(iso);
      setActive('from');
    }
    setCursor(iso.slice(0, 7));
  }

  function preset(name: 'week' | 'month' | 'last-month') {
    const now = new Date();
    let start: Date;
    let end: Date;
    if (name === 'week') {
      start = startOfWeek(now);
      end = addDays(start, 6);
    } else if (name === 'month') {
      start = startOfMonth(now);
      end = endOfMonth(now);
    } else {
      const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      start = startOfMonth(previous);
      end = endOfMonth(previous);
    }
    setDraftFrom(toIso(start));
    setDraftTo(toIso(end));
    setActive('from');
    setCursor(toIso(start).slice(0, 7));
  }

  function apply() {
    if (!draftFrom || !draftTo) { onError(t('Pick a start and end date')); return; }
    if (draftFrom > draftTo) { onError(t('The start date must come before the end date')); return; }
    onApply(draftFrom, draftTo);
    setOpen(false);
  }

  function clear() {
    setDraftFrom('');
    setDraftTo('');
    setActive('from');
    onClear();
    setOpen(false);
  }

  const label = from && to
    ? formatDateShort(from) + ' – ' + formatDateShort(to)
    : t('Any date');

  return (
    <div className={`date-picker range-date-picker${open ? ' open' : ''}`} id={id} ref={root}>
      <button
        ref={triggerRef}
        className="btn secondary date-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name="calendar" /><span className="date-label">{label}</span>
      </button>
      {open && createPortal(
      <div ref={popoverRef} className="date-popover date-popover-portal" role="dialog" aria-label={t('Filter by date range')}>
        <div className="date-popover-head">
          <div><strong>{t('Date range')}</strong><small>{t('Pick the period you want to see')}</small></div>
          <button className="date-close" type="button" aria-label={t('Close date picker')} onClick={() => setOpen(false)}>
            <Icon name="close" />
          </button>
        </div>
        <div className="date-fields">
          <div className="date-field">
            <label htmlFor="tx-date-from">{t('From')}</label>
            <input
              id="tx-date-from"
              className={`range-date-value${active === 'from' ? ' active' : ''}`}
              type="text"
              placeholder={t('dd/mm/yyyy')}
              value={draftFrom ? formatDateShort(draftFrom) : ''}
              onFocus={() => setActive('from')}
              onClick={() => setActive('from')}
              readOnly
            />
          </div>
          <div className="date-field">
            <label htmlFor="tx-date-to">{t('To')}</label>
            <input
              id="tx-date-to"
              className={`range-date-value${active === 'to' ? ' active' : ''}`}
              type="text"
              placeholder={t('dd/mm/yyyy')}
              value={draftTo ? formatDateShort(draftTo) : ''}
              onFocus={() => setActive('to')}
              onClick={() => setActive('to')}
              readOnly
            />
          </div>
        </div>
        <Calendar
          className="range-calendar"
          cursor={cursor}
          onCursorChange={setCursor}
          onPick={pick}
          isSelected={(iso) => iso === draftFrom || iso === draftTo}
          isInRange={(iso) => Boolean(draftFrom && draftTo && iso > draftFrom && iso < draftTo)}
        />
        <div className="date-presets">
          <button className="date-preset" type="button" onClick={() => preset('week')}>{t('This week')}</button>
          <button className="date-preset" type="button" onClick={() => preset('month')}>{t('This month')}</button>
          <button className="date-preset" type="button" onClick={() => preset('last-month')}>{t('Last month')}</button>
        </div>
        <div className="date-popover-foot">
          <button className="btn ghost" type="button" onClick={clear}>{t('Clear')}</button>
          <button className="btn primary" type="button" onClick={apply}>{t('Apply')}</button>
        </div>
      </div>,
      document.body
      )}
    </div>
  );
}

/* ============================================================
   SINGLE
   ============================================================ */
export function SingleDatePicker({
  id = 'transaction-date-picker',
  triggerId = 'transaction-date',
  value,
  onChange
}: {
  id?: string;
  triggerId?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [cursor, setCursor] = useState((value || today()).slice(0, 7));
  const root = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useOutsideClose(root, open, () => setOpen(false), popoverRef);
  useFloatingPopover(open, triggerRef, popoverRef, 'right');
  useEffect(() => { setDraft(value); }, [value]);

  return (
    <div className={`date-picker single-date-picker${open ? ' open' : ''}`} id={id} ref={root}>
      <button
        ref={triggerRef}
        id={triggerId}
        className="filter-trigger date-trigger single-date-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="single-date-label">{value ? formatDateShort(value) : t('Pick a date')}</span>
        <span className="filter-chevron"><Icon name="chevron-down" /></span>
      </button>
      {open && createPortal(
      <div ref={popoverRef} className="date-popover single-date-popover date-popover-portal" role="dialog" aria-label={t('Pick the transaction date')}>
        <div className="date-popover-head">
          <div><strong>{t('Transaction date')}</strong><small>{t('When did this happen?')}</small></div>
          <button className="date-close" type="button" aria-label={t('Close date picker')} onClick={() => setOpen(false)}>
            <Icon name="close" />
          </button>
        </div>
        <div className="date-fields">
          <div className="date-field">
            <label htmlFor="transaction-date-value">{t('Date')}</label>
            <input
              id="transaction-date-value"
              className="single-date-value"
              type="text"
              placeholder={t('dd/mm/yyyy')}
              value={draft ? formatDateShort(draft) : ''}
              readOnly
            />
            <Calendar
              className="single-calendar"
              cursor={cursor}
              onCursorChange={setCursor}
              onPick={(iso) => { setDraft(iso); setCursor(iso.slice(0, 7)); }}
              isSelected={(iso) => iso === draft}
            />
          </div>
        </div>
        <div className="date-presets">
          <button
            className="date-preset"
            type="button"
            onClick={() => { const iso = today(); setDraft(iso); setCursor(iso.slice(0, 7)); }}
          >
            {t('Today')}
          </button>
        </div>
        <div className="date-popover-foot">
          <button className="btn ghost" type="button" onClick={() => { setDraft(''); onChange(''); setOpen(false); }}>{t('Clear')}</button>
          <button className="btn primary" type="button" onClick={() => { onChange(draft); setOpen(false); }}>{t('Apply')}</button>
        </div>
      </div>,
      document.body
      )}
    </div>
  );
}
