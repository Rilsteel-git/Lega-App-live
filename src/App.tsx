import { lazy, Suspense, useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { AppDataProvider, useAppData } from './context/AppDataContext';
import { UiProvider, ToastStack, useUi } from './context/UiContext';
import { AppShell, ShellFrame, getRoute, type Route } from './components/AppShell';
import { IconSprite, Icon } from './components/IconSprite';
import { ModalHost } from './components/Modals';
import { EmptyState, Loading, PageSkeleton } from './components/Ui';
import { AuthPage } from './pages/AuthPage';
import { t } from './i18n';

const PAGES = {
  dashboard: lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))),
  wallets: lazy(() => import('./pages/WalletsPage').then((m) => ({ default: m.WalletsPage }))),
  transactions: lazy(() => import('./pages/TransactionsPage').then((m) => ({ default: m.TransactionsPage }))),
  categories: lazy(() => import('./pages/CategoriesPage').then((m) => ({ default: m.CategoriesPage }))),
  statistics: lazy(() => import('./pages/StatisticsPage').then((m) => ({ default: m.StatisticsPage }))),
  profile: lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage }))),
  settings: lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
};

function AuthenticatedApp() {
  const [route, setRoute] = useState<Route>(getRoute());
  const { error, loading, initialized, refresh } = useAppData();
  const { closeModal, closeConfirm } = useUi();

  useEffect(() => {
    const update = () => setRoute(getRoute());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  // A modal/confirmation tidak boleh ikut terbawa ke halaman lain.
  useEffect(() => {
    closeModal();
    closeConfirm();
  }, [route, closeModal, closeConfirm]);

  const Page = PAGES[route];

  return (
    <>
      <AppShell route={route}>
        {error && initialized && (
          <div className="alert danger">
            <span><Icon name="alert" /></span>
            <div><strong>{t('Could not refresh your data')}</strong>{error}</div>
            <button type="button" className="btn secondary" disabled={loading} onClick={() => void refresh().catch(() => {})}>{t('Try again')}</button>
          </div>
        )}
        <div aria-busy={loading}>
          {initialized ? (
            <Suspense key={route} fallback={<><PageSkeleton />{!loading && <Loading />}</>}>
              <Page />
            </Suspense>
          ) : error ? (
            <EmptyState
              icon="alert"
              title={t('Could not load your data')}
              message={error}
              actionLabel={loading ? t('Retrying…') : t('Try again')}
              actionDisabled={loading}
              onAction={() => void refresh().catch(() => {})}
            />
          ) : loading ? <PageSkeleton /> : null}
        </div>
      </AppShell>
      {loading && <Loading message={initialized ? t('Updating data') : t('Loading data')} />}
      <ModalHost />
      <ToastStack />
    </>
  );
}

export function App() {
  const { session, loading, passwordRecovery } = useAuth();

  return (
    <>
      <IconSprite />
      {loading ? <>
        <div inert><ShellFrame route={getRoute()}><PageSkeleton /></ShellFrame></div>
        <Loading />
      </> : !session || passwordRecovery ? <AuthPage /> : (
        <AppDataProvider key={session.user.id}>
          <UiProvider>
            <AuthenticatedApp />
          </UiProvider>
        </AppDataProvider>
      )}
    </>
  );
}
