/* ============================================================
   Ui.tsx — primitif design system yang dipakai lintas halaman.
   Markup-nya sengaja dibuat identik dengan app vanilla
   (js/ui.js + index.html) supaya CSS yang sama menghasilkan
   tampilan yang sama persis.
   ============================================================ */

import {
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { t } from '../i18n';
import { Icon, type IconName } from './IconSprite';
import { createPortal } from 'react-dom';
import { useFloatingPopover } from '../lib/floating';
import { isImageIcon } from '../lib/categoryIcon';

const escapeLayers: (() => void)[] = [];
let modalCount = 0;
let previousOverflow = '';
function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    escapeLayers.at(-1)?.();
  }
}
function useEscapeLayer(active: boolean, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; }, [close]);
  useEffect(() => {
    if (!active) return;
    const layer = () => closeRef.current();
    if (!escapeLayers.length) document.addEventListener('keydown', handleEscape);
    escapeLayers.push(layer);
    return () => {
      escapeLayers.splice(escapeLayers.indexOf(layer), 1);
      if (!escapeLayers.length) document.removeEventListener('keydown', handleEscape);
    };
  }, [active]);
}

/* ============================================================
   EMPTY STATE — lihat PW.ui.emptyState()
   ============================================================ */
export function EmptyState({
  icon = 'receipt',
  title = t('Nothing here yet'),
  message = '',
  actionLabel,
  onAction,
  actionDisabled = false
}: {
  icon?: IconName;
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
}) {
  return (
    <div className="empty">
      <div className="empty-art" aria-hidden="true">
        <span className="empty-ring" />
        <span className="empty-ring" />
        <span className="empty-blob" />
        <div className="empty-icon"><Icon name={icon} /></div>
        <span className="empty-spark empty-spark-a" />
        <span className="empty-spark empty-spark-b" />
        <span className="empty-spark empty-spark-c" />
      </div>
      <h3>{title}</h3>
      <p>{message}</p>
      {actionLabel && onAction && (
        <button className="btn primary" type="button" disabled={actionDisabled} onClick={onAction}>{actionLabel}</button>
      )}
    </div>
  );
}

/* ============================================================
   MODAL — .modal-backdrop.open > .modal
   ============================================================ */
export function Modal({
  id,
  className = '',
  head,
  children,
  foot,
  onClose,
  labelledBy
}: {
  id?: string;
  className?: string;
  head: ReactNode;
  children?: ReactNode;
  foot?: ReactNode;
  onClose: () => void;
  labelledBy?: string;
}) {
  // Body dikunci selama modal terbuka, sama seperti PW.ui.openModal().
  useEscapeLayer(true, onClose);
  useEffect(() => {
    if (modalCount++ === 0) previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      if (--modalCount === 0) document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div
      className="modal-backdrop open"
      id={id}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className={`modal ${className}`.trim()}>
        {head}
        {children}
        {foot}
      </div>
    </div>
  );
}

/** Header modal standar: judul + deskripsi + tombol tutup. */
export function ModalHead({
  id,
  title,
  desc,
  onClose,
  closeLabel = t('Close dialog'),
  actions
}: {
  id?: string;
  title: string;
  desc?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="modal-head">
      <div><h2 id={id}>{title}</h2>{desc && <p>{desc}</p>}</div>
      {actions}
      <button className="icon-btn" type="button" aria-label={closeLabel} onClick={onClose}>
        <Icon name="close" />
      </button>
    </div>
  );
}

/* ============================================================
   SEGMENTED CONTROL
   ============================================================ */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  block = false,
  label,
  id
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  block?: boolean;
  label: string;
  id?: string;
}) {
  return (
    <div className={`segmented${block ? ' block' : ''}`} id={id} role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          className={`segment${option.value === value ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ============================================================
   DROPDOWN — .filter-dropdown, dipakai untuk filter & form select
   ============================================================ */
export interface DropdownOption {
  value: string;
  label: string;
  icon?: string;
}

export function Dropdown({
  id,
  options,
  value,
  onChange,
  label,
  placeholder,
  disabled = false
}: {
  id?: string;
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Chip filter (.filter-chips) di-scroll horizontal, yang ikut memotong menu
  // position: absolute di dalamnya — samakan dengan js/ui.js: melayang lewat
  // createPortal + position: fixed hanya untuk dropdown di baris chip itu.
  const insideFilterChips = Boolean(root.current?.closest('.filter-chips'));
  useOutsideClose(root, open, () => setOpen(false), insideFilterChips ? menuRef : undefined);
  useFloatingPopover(open && insideFilterChips, triggerRef, menuRef, 'left');

  const selected = options.find((option) => option.value === value);
  const text = selected ? optionLabel(selected) : (placeholder || (options[0] ? optionLabel(options[0]) : ''));

  const menu = (
    <div ref={menuRef} className={`filter-menu${insideFilterChips ? ' filter-menu-portal' : ''}`} role="listbox" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          className={`filter-option${option.value === value ? ' selected' : ''}`}
          type="button"
          role="option"
          aria-selected={option.value === value}
          data-value={option.value}
          onClick={() => { onChange(option.value); setOpen(false); }}
        >
          {optionLabel(option)}
        </button>
      ))}
    </div>
  );

  return (
    <div className={`filter-dropdown${open ? ' open' : ''}`} ref={root}>
      <button
        ref={triggerRef}
        id={id}
        className="filter-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={disabled ? false : open}
        data-value={value}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <span>{text}</span>
        <span className="filter-chevron"><Icon name="chevron-down" /></span>
      </button>
      {insideFilterChips ? (open && createPortal(menu, document.body)) : menu}
    </div>
  );
}

/** Ikon kategori: emoji sebagai teks, atau gambar custom (data URL). */
export function CategoryIcon({ icon, inline = false }: { icon: string; inline?: boolean }) {
  return isImageIcon(icon)
    ? <img className={inline ? 'icon-inline' : 'icon-img'} src={icon} alt="" draggable={false} />
    : <>{icon}</>;
}

function optionLabel(option: DropdownOption) {
  if (!option.icon) return option.label;
  // Satu elemen pembungkus: tombol opsi memakai flex, jadi gambar + teks tidak boleh jadi dua item.
  return <span><CategoryIcon icon={option.icon} inline />{isImageIcon(option.icon) ? ' ' : '  '}{option.label}</span>;
}

/** Tutup popover saat klik di luar atau tekan Escape.
 *  `portalRef` opsional: dipakai kalau isi popover-nya di-render lewat
 *  createPortal (mis. ke document.body) jadi bukan descendant `ref`
 *  secara DOM lagi — tanpa ini klik di dalam portal dianggap "di luar". */
export function useOutsideClose(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  close: () => void,
  portalRef?: React.RefObject<HTMLElement | null>
) {
  useEscapeLayer(active, close);
  useEffect(() => {
    if (!active) return;
    function onClick(event: MouseEvent) {
      const node = event.target as Node;
      const insideRoot = Boolean(ref.current && ref.current.contains(node));
      const insidePortal = Boolean(portalRef?.current && portalRef.current.contains(node));
      if (!insideRoot && !insidePortal) close();
    }
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('mousedown', onClick);
    };
  }, [ref, active, close, portalRef]);
}

/* ============================================================
   LOADING
   ============================================================ */

/** Logo mark Lega sebagai inline SVG. Memakai currentColor supaya bisa
 *  dipakai di atas kanvas terang (hijau) maupun di atas hijau (putih). */
export function LegaMark({ className }: { className?: string }) {
  return (
    <svg
      className={className ? `lega-mark ${className}` : 'lega-mark'}
      viewBox="28 16 76 88"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M36 24 V68 C36 84 48 96 64 96 C80 96 92 86 96 70"
        fill="none"
        stroke="currentColor"
        strokeWidth={16}
        strokeLinecap="round"
      />
      <circle cx={86} cy={34} r={13} fill="currentColor" />
    </svg>
  );
}

/** Versi animasi dari <LegaMark />: garisnya menggambar dirinya sendiri, lalu
 *  koinnya jatuh ke tempatnya. Animasi dimatikan saat prefers-reduced-motion. */
export function LegaLoader({ className }: { className?: string }) {
  return (
    <svg
      className={className ? `lega-loader ${className}` : 'lega-loader'}
      viewBox="16 4 100 112"
      aria-hidden="true"
      focusable="false"
    >
      <g className="lega-loader-fade">
        <path
          className="lega-loader-stroke"
          pathLength={100}
          d="M36 24 V68 C36 84 48 96 64 96 C80 96 92 86 96 70"
          fill="none"
          stroke="currentColor"
          strokeWidth={16}
          strokeLinecap="round"
        />
        <circle className="lega-loader-coin" cx={86} cy={34} r={13} fill="currentColor" />
      </g>
    </svg>
  );
}

export function PageSkeleton() {
  return (
    <div className="lega-page-skeleton" aria-hidden="true">
      {[0, 1, 2].map((item) => (
        <div className="card lega-skeleton-card" key={item}>
          <div className="lega-skeleton"><span /><span /><span /></div>
        </div>
      ))}
    </div>
  );
}

/** Loader kecil di ujung daftar yang dimuat bertahap (bukan overlay layar
 *  penuh seperti <Loading />). Pakai mark yang sama supaya konsisten. */
export function InlineLoader({ label = t('Loading more') }: { label?: string }) {
  return (
    <div className="lega-inline-loader" role="status" aria-label={label} aria-live="polite">
      <LegaLoader className="lega-inline-loader-mark" />
    </div>
  );
}

export function Loading({ message = t('Loading Lega') }: { message?: string }) {
  useEffect(() => {
    const root = document.getElementById('root');
    const wasInert = root?.inert ?? false;
    if (root) root.inert = true;
    if (modalCount++ === 0) previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      if (root) root.inert = wasInert;
      if (--modalCount === 0) document.body.style.overflow = previousOverflow;
    };
  }, []);
  return createPortal(
    <div className="lega-loading-overlay" role="status" aria-label={message} aria-live="polite">
      <LegaLoader className="lega-loading-mark" />
    </div>,
    document.body
  );
}
