import { CurrencySettings } from '../components/CurrencySettings';
import { Segmented } from '../components/Ui';
import { useAppData } from '../context/AppDataContext';
import { LANGUAGES, getLanguage, setLanguage, t, type Language } from '../i18n';

export function SettingsPage() {
  const { profile } = useAppData();
  const language = getLanguage();

  function changeLanguage(next: Language) {
    if (next === language) return;
    setLanguage(next);
    // Semua teks dibaca saat load; muat ulang supaya seluruh app ikut berganti.
    window.location.reload();
  }

  return (
    <section className="page active" id="page-settings" aria-label={t('Settings')}>
      <div className="stack">
        <article className="card">
          <div className="card-head">
            <div><h2>{t('Language')}</h2><p>{t('Choose the language used across the app')}</p></div>
          </div>
          <Segmented
            block
            id="settings-language"
            label={t('Language')}
            value={language}
            onChange={changeLanguage}
            options={LANGUAGES}
          />
        </article>
        <CurrencySettings key={`${profile?.reportCurrency}-${profile?.reportRate}`} />
      </div>
    </section>
  );
}
