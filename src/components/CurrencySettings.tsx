import { useState } from 'react';
import type { Currency } from '../types';
import { useAppData } from '../context/AppDataContext';
import { useUi } from '../context/UiContext';
import { currencyLabel, currencyOptions, readDecimal, validRate } from '../lib/currency';
import { fetchLiveRate } from '../lib/exchangeRate';
import { Dropdown } from './Ui';
import { Icon } from './IconSprite';
import { t } from '../i18n';

export function CurrencySettings() {
  const { profile, saveCurrencySettings } = useAppData();
  const { toast } = useUi();
  const [currency, setCurrency] = useState<Currency>(profile?.reportCurrency || 'IDR');
  const [rate, setRate] = useState(String(profile?.reportRate || ''));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fetchingRate, setFetchingRate] = useState(false);
  async function useLiveRate() {
    setFetchingRate(true);
    try {
      const value = await fetchLiveRate(currency);
      setRate(String(value));
      setError('');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : t('Could not fetch the live rate.'), { variant: 'error' });
    } finally {
      setFetchingRate(false);
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const value = currency === 'IDR' ? 1 : readDecimal(rate);
    if (!validRate(value)) { setError(t('Enter a positive exchange rate.')); return; }
    setBusy(true);
    try {
      await saveCurrencySettings(currency, value);
      toast(t('Report currency updated'));
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : t('Could not save currency.'), { variant: 'error' });
    } finally { setBusy(false); }
  }
  return <article className="card">
    <div className="card-head"><div><h2>{t('Report currency')}</h2><p>{t('Dashboard, totals and statistics')}</p></div></div>
    <form onSubmit={save} className="stack">
      <Dropdown label={t('Report currency')} value={currency} options={currencyOptions} onChange={(value) => { setCurrency(value as Currency); setRate(''); setError(''); }} />
      {currency !== 'IDR' && <div className={`input${error ? ' error' : ''}`}>
        <label htmlFor="report-rate">{t('1 {currency} = … IDR', { currency: currencyLabel(currency) })}</label>
        <div className="rate-input-row">
          <input id="report-rate" inputMode="decimal" value={rate} onChange={(e) => { setRate(e.target.value); setError(''); }} placeholder={t('Your manual report rate')} />
          <button className="btn secondary rate-fetch-btn" type="button" disabled={fetchingRate} onClick={useLiveRate}>
            <Icon name="refresh" className={`svg-icon${fetchingRate ? ' spin' : ''}`} /> {fetchingRate ? t('Fetching…') : t('Get live rate')}
          </button>
        </div>
        {error && <small className="field-error">{error}</small>}
      </div>}
      <small className="hint-info">{t('Wallet totals use each wallet’s manual rate; income and expense reports use saved transaction rates. This display rate converts both to your chosen currency. Original amounts stay unchanged. Estimates only, not live quotes.')}</small>
      <button className="btn primary" disabled={busy} type="submit">{busy ? t('Saving…') : t('Save currency')}</button>
    </form>
  </article>;
}
