/* ============================================================
   AmountInput — kotak input nominal yang terformat saat diketik
   ("5000" tampil "Rp5.000"). `value`/`onChange` memakai string
   polos ("5000", "12.5"), jadi validasi form tidak berubah.
   ============================================================ */

import { useLayoutEffect, useRef } from 'react';
import type { Currency } from '../types';
import { fractionDigits } from '../lib/currency';
import { amountPrefix, applyAmountEdit, displayAmount } from '../lib/amountInput';

export function AmountInput({
  id,
  name,
  value,
  currency,
  allowNegative = false,
  onChange
}: {
  id: string;
  name?: string;
  value: string;
  currency: Currency;
  /** Saldo awal dompet boleh minus; nominal transaksi/transfer tidak. */
  allowNegative?: boolean;
  onChange: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const display = displayAmount(value, currency);

  useLayoutEffect(() => {
    const element = input.current;
    if (pendingCaret.current === null || !element || document.activeElement !== element) return;
    element.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  });

  return (
    <input
      ref={input}
      id={id}
      name={name}
      type="text"
      inputMode={fractionDigits(currency) > 0 || allowNegative ? 'decimal' : 'numeric'}
      autoComplete="off"
      placeholder={amountPrefix(currency) + '0'}
      value={display}
      onChange={(event) => {
        const next = applyAmountEdit({
          text: event.target.value,
          caret: event.target.selectionStart ?? event.target.value.length,
          previous: display,
          inputType: (event.nativeEvent as InputEvent).inputType
        }, currency, allowNegative);
        pendingCaret.current = next.caret;
        if (next.raw === value) {
          // React tidak me-render ulang kalau nilainya sama; kembalikan teks & kursor sendiri.
          event.target.value = next.display;
          event.target.setSelectionRange(next.caret, next.caret);
          pendingCaret.current = null;
          return;
        }
        onChange(next.raw);
      }}
    />
  );
}
