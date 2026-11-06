/* ============================================================
   amountInput.ts — logika input nominal yang terformat otomatis.

   Nilai yang disimpan form tetap string polos dengan titik desimal
   ("1250000", "12.5", "-5000") supaya readDecimal()/validAmount()
   tidak berubah. Yang tampil di kotak input mengikuti format uang
   aplikasi: "Rp1.250.000", "USD 12,5", "-Rp5.000"
   (pemisah ribuan titik, desimal koma).
   ============================================================ */

import type { Currency } from '../types';
import { currencyLabel, fractionDigits } from './currency';

/** "Rp" menempel ke angka; kode mata uang lain diberi spasi ("USD 12"). */
export function amountPrefix(currency: Currency): string {
  const label = currencyLabel(currency);
  return label === 'Rp' ? 'Rp' : label + ' ';
}

/** Nilai polos -> teks tampilan. "1250000.5" -> "Rp1.250.000,5" */
export function displayAmount(raw: string, currency: Currency): string {
  if (!raw) return '';
  const negative = raw.startsWith('-');
  const [intPart = '', decPart] = raw.replace('-', '').split('.');
  const digits = intPart.replace(/^0+(?=\d)/, '');
  const grouped = digits
    ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    : decPart !== undefined ? '0' : '';
  return (negative ? '-' : '') + amountPrefix(currency) + grouped + (decPart !== undefined ? ',' + decPart : '');
}

/** Teks yang diketik/ditempel -> nilai polos. Titik dianggap pemisah ribuan, koma desimal. */
export function parseAmountText(text: string, currency: Currency, allowNegative = false): string {
  const decimals = fractionDigits(currency);
  const negative = allowNegative && text.includes('-');
  const cleaned = text.replace(decimals > 0 ? /[^\d,]/g : /\D/g, '');
  const commaAt = cleaned.indexOf(',');
  const hasDecimal = decimals > 0 && commaAt >= 0;
  const intPart = (commaAt >= 0 ? cleaned.slice(0, commaAt) : cleaned).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  const decPart = hasDecimal ? cleaned.slice(commaAt + 1).replace(/\D/g, '').slice(0, decimals) : '';
  if (!intPart && !hasDecimal) return negative ? '-' : '';
  return (negative ? '-' : '') + (intPart || '0') + (hasDecimal ? '.' + decPart : '');
}

/** Jumlah angka/koma sebelum posisi kursor — dipakai untuk menaruh kursor lagi setelah diformat. */
export function significantBefore(text: string, caret: number): number {
  return text.slice(0, caret).replace(/[^\d,]/g, '').length;
}

/** Posisi kursor di teks baru yang punya `count` angka/koma di depannya. */
export function caretForSignificant(text: string, count: number, minimum: number): number {
  if (count <= 0) return Math.min(minimum, text.length);
  let seen = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (/[\d,]/.test(text[i])) seen += 1;
    if (seen === count) return Math.max(i + 1, minimum);
  }
  return text.length;
}

export interface AmountEdit {
  /** Isi kotak input setelah diketik (event.target.value). */
  text: string;
  /** Posisi kursor setelah diketik (selectionStart). */
  caret: number;
  /** Teks yang tampil sebelum diketik. */
  previous: string;
  /** event.nativeEvent.inputType, bila ada. */
  inputType?: string;
}

/**
 * Terapkan satu ketikan: kembalikan nilai polos baru, teks tampilan,
 * dan posisi kursor. Menangani tiga kasus yang tidak bisa diserahkan
 * ke parse biasa:
 *  - titik yang diketik pada mata uang berdesimal = koma desimal;
 *  - menghapus titik pemisah ribuan ikut menghapus angka di sebelahnya;
 *  - menempel "12.50" pada mata uang berdesimal = 12,50.
 */
export function applyAmountEdit(edit: AmountEdit, currency: Currency, allowNegative = false) {
  const decimals = fractionDigits(currency);
  let { text, caret } = edit;
  const { previous, inputType } = edit;
  const inserted = text.length - previous.length;

  // Mata uang tanpa desimal (IDR/KRW/JPY): koma tidak berarti apa-apa.
  if (decimals === 0) {
    const before = text.slice(0, caret);
    caret -= before.length - before.replace(/,/g, '').length;
    text = text.replace(/,/g, '');
  } else if (!text.includes(',')) {
    if (inserted === 1 && text[caret - 1] === '.') {
      text = text.slice(0, caret - 1) + ',' + text.slice(caret);
    } else if (inserted > 1 && /^[^.]*\.\d{1,2}\D*$/.test(text)) {
      text = text.replace('.', ',');
    }
  }

  let raw = parseAmountText(text, currency, allowNegative);
  let count = significantBefore(text, caret);

  const previousRaw = parseAmountText(previous, currency, allowNegative);
  if (raw === previousRaw && inserted < 0 && (inputType === 'deleteContentBackward' || inputType === 'deleteContentForward')) {
    // Yang terhapus hanya titik/prefix: hapus angka di sebelahnya supaya tombol hapus tetap terasa bekerja.
    const target = inputType === 'deleteContentBackward' ? count - 1 : count;
    const chars = text.replace(/[^\d,]/g, '');
    if (target >= 0 && target < chars.length) {
      const sign = allowNegative && text.includes('-') ? '-' : '';
      raw = parseAmountText(sign + chars.slice(0, target) + chars.slice(target + 1), currency, allowNegative);
      if (inputType === 'deleteContentBackward') count -= 1;
    }
  }

  const display = displayAmount(raw, currency);
  const minimum = (raw.startsWith('-') ? 1 : 0) + amountPrefix(currency).length;
  return { raw, display, caret: display ? caretForSignificant(display, count, minimum) : 0 };
}
