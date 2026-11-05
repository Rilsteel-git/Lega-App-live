/* ============================================================
   AppShell.tsx — kerangka aplikasi: sidebar desktop, topbar,
   dan bottom nav mobile. Markup & class-nya mengikuti
   personal-wallet/index.html + js/render.js (topbar()).
   ============================================================ */

import { type ReactNode } from 'react';
import { t } from '../i18n';
import { useAppData } from '../context/AppDataContext';
import { Avatar } from './Avatar';
import type { Profile } from '../types';
import { Icon, type IconName } from './IconSprite';
import { LegaMark } from './Ui';

export type Route = 'dashboard' | 'wallets' | 'transactions' | 'categories' | 'statistics' | 'profile' | 'settings';

const ROUTES: Route[] = ['dashboard', 'wallets', 'transactions', 'categories', 'statistics', 'profile', 'settings'];

/** Judul & subjudul topbar per halaman — sama dengan TITLES di render.js. */
export const TITLES: Record<Route, { title: string; subtitle: string }> = {
  dashboard: { title: t('Dashboard'), subtitle: t('Track your wallets and understand where your money goes.') },
  wallets: { title: t('Wallets'), subtitle: t('Every place your money lives.') },
  transactions: { title: t('Transactions'), subtitle: t('Search, filter, and manage everything you have recorded.') },
  categories: { title: t('Categories'), subtitle: t('Group your transactions so the numbers mean something.') },
  statistics: { title: t('Statistics'), subtitle: t('See how your income and spending move over time.') },
  profile: { title: t('Profile'), subtitle: t('Your details, settings, and app data.') },
  settings: { title: t('Settings'), subtitle: t('Manage your app preferences and report currency.') }
};

/** Halaman yang dibuka dari profil: tampilkan tombol kembali di topbar. */
const PARENT_ROUTE: Partial<Record<Route, Route>> = { wallets: 'profile', categories: 'profile', settings: 'profile' };

const SIDE_NAV: { route: Route; label: string; icon: IconName }[] = [
  { route: 'dashboard', label: t('Dashboard'), icon: 'home' },
  { route: 'wallets', label: t('Wallets'), icon: 'wallet' },
  { route: 'transactions', label: t('Transactions'), icon: 'transfer' },
  { route: 'categories', label: t('Categories'), icon: 'category' },
  { route: 'statistics', label: t('Statistics'), icon: 'stats' },
  { route: 'profile', label: t('Profile'), icon: 'user' }
];

const MOBILE_NAV: { route: Route; label: string; icon: IconName }[] = [
  { route: 'dashboard', label: t('Home'), icon: 'home' },
  { route: 'transactions', label: t('Activity'), icon: 'transfer' },
  { route: 'statistics', label: t('Stats'), icon: 'stats' },
  { route: 'profile', label: t('Profile'), icon: 'user' }
];

export function getRoute(): Route {
  const value = window.location.hash.replace('#/', '') as Route;
  return ROUTES.includes(value) ? value : 'dashboard';
}

export function navigate(route: Route) {
  window.location.hash = `/${route}`;
}

export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const { profile } = useAppData();
  return <ShellFrame route={route} profile={profile}>{children}</ShellFrame>;
}

export function ShellFrame({ route, children, profile = null }: { route: Route; children: ReactNode; profile?: Profile | null }) {
  const meta = TITLES[route] || TITLES.dashboard;
  const parent = PARENT_ROUTE[route];

  return (
    <>
      <div className="shell">
        {/* ================= SIDEBAR (desktop) ================= */}
        <aside className="sidebar">
          <div className="brand"><span className="brand-mark"><LegaMark /></span>Lega</div>
          <div className="nav-caption">{t('Menu')}</div>
          <nav className="side-nav" id="side-nav" aria-label={t('Main navigation')}>
            {SIDE_NAV.map((item) => (
              <a
                key={item.route}
                href={`#/${item.route}`}
                data-route={item.route}
                className={route === item.route ? 'active' : undefined}
              >
                <span className="nav-icon"><Icon name={item.icon} /></span>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="sidebar-tip">
            <strong>{t('Synced to your account')}</strong>
            {t('Wallets and transactions are saved to your account, not just this browser.')}
          </div>
        </aside>

        <main>
          <div className="content">
            {/* ================= TOPBAR ================= */}
            <header className="topbar">
              <div className="topbar-bar">
                {parent && (
                  <button
                    className="topbar-back"
                    type="button"
                    id="topbar-back"
                    aria-label={t('Go back')}
                    onClick={() => navigate(parent)}
                  >
                    <Icon name="chevron-left" />
                  </button>
                )}
                <p className="eyebrow" id="topbar-eyebrow">Lega</p>
                <a className="topbar-profile" href="#/profile" aria-label={t('Open profile')}>
                  <Avatar
                    id="topbar-avatar"
                    className="topbar-avatar"
                    name={profile?.name}
                    photo={profile?.photoUrl}
                  />
                </a>
              </div>
              <div className="topbar-heading">
                <h1 id="topbar-title">{meta.title}</h1>
                <p id="topbar-subtitle">{meta.subtitle}</p>
              </div>
            </header>

            {children}
          </div>
        </main>
      </div>

      {/* ================= MOBILE NAV ================= */}
      <nav className="mobile-nav" id="mobile-nav" aria-label={t('Main navigation')}>
        {MOBILE_NAV.map((item) => (
          <a
            key={item.route}
            href={`#/${item.route}`}
            data-route={item.route}
            className={route === item.route || (route === 'settings' && item.route === 'profile') ? 'active' : undefined}
          >
            <b><Icon name={item.icon} /></b>
            {item.label}
          </a>
        ))}
      </nav>
    </>
  );
}
