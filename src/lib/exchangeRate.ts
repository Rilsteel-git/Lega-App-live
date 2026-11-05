import type { Currency } from '../types';
import { t } from '../i18n';

// Free, no API key required, sourced from European Central Bank reference
// rates. Docs: https://www.frankfurter.dev
// Dipakai langsung domain .dev (bukan .app) karena .app redirect (301) ke
// domain ini tanpa header CORS, yang bikin fetch() dari browser gagal.
const API_BASE = 'https://api.frankfurter.dev/v1/latest';

/** Berapa IDR untuk 1 unit `currency`, ambil dari kurs harian live. */
export async function fetchLiveRate(currency: Currency): Promise<number> {
  if (currency === 'IDR') return 1;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}?from=${currency}&to=IDR`);
  } catch {
    throw new Error(t('Could not reach the exchange rate service. Check your connection.'));
  }
  if (!response.ok) throw new Error(t('Exchange rate service is unavailable right now.'));

  const data = await response.json();
  const rate = data?.rates?.IDR;
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(t('Exchange rate service returned an unexpected response.'));
  }
  return rate;
}
