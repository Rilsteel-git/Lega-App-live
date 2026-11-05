/* ============================================================
   i18n — penerjemah ringan tanpa library.

   Teks sumber = bahasa Inggris, ditulis langsung di kode:
     t('Edit profile')
     t('Hello {name}', { name })
     tp(count, '{count} wallet', '{count} wallets')
   Kamus Indonesia (src/i18n/id/*.ts) memakai teks Inggris itu
   sebagai kunci. Teks yang belum ada di kamus tampil apa adanya
   (Inggris), jadi terjemahan bisa ditambah bertahap.

   Bahasa disimpan di localStorage `lega:language`. Mengganti
   bahasa memuat ulang halaman, jadi `t()` aman dipakai di mana
   saja, termasuk konstanta level modul.
   ============================================================ */

import { id } from './id';

export type Language = 'en' | 'id';

export const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'id', label: 'Bahasa Indonesia' }
];

const STORAGE_KEY = 'lega:language';

function readLanguage(): Language {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === 'en' || value === 'id') return value;
  } catch { /* storage diblokir */ }
  return 'en';
}

const current: Language = readLanguage();
const dictionaries: Record<Language, Record<string, string>> = { en: {}, id };

if (typeof document !== 'undefined') document.documentElement.lang = current;

export function getLanguage(): Language {
  return current;
}

/** Simpan pilihan bahasa. Pemanggil bertugas memuat ulang halaman setelahnya. */
export function setLanguage(language: Language) {
  try { window.localStorage.setItem(STORAGE_KEY, language); } catch { /* storage diblokir */ }
}

export function t(text: string, vars?: Record<string, string | number>): string {
  const raw = dictionaries[current][text] ?? text;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

/** Pilih bentuk tunggal/jamak berdasarkan jumlah; `{count}` terisi otomatis. */
export function tp(count: number, one: string, other: string, vars?: Record<string, string | number>): string {
  return t(count === 1 ? one : other, { count, ...vars });
}
