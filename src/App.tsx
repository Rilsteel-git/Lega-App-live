import { lazy, Suspense, useEffect, useState, type ComponentType, type LazyExoticComponent } from 'react';
import { useAuth } from './context/AuthContext';
import { AppDataProvider, useAppData } from './context/AppDataContext';
import { UiProvider, ToastStack, useUi } from './context/UiContext';
import { AppShell, ShellFrame, getRoute, type Route } from './components/AppShell';
import { IconSprite, Icon } from './components/IconSprite';
import { ModalHost } from './components/Modals';
import { EmptyState, Loading, PageSkeleton } from './components/Ui';
import { AuthPage } from './pages/AuthPage';
import { t } from './i18n';
import { AppErrorBoundary } from './components/AppErrorBoundary';

/* Page chunks are fetched on first visit. After a deploy, the previous build's
 * chunks are gone from the server, so a session started before it fails to
 * open a page it hasn't visited yet. Retry once, then preload every page
 * shortly after start so navigation never has to reach the network. */
const PAGE_LOADERS = {
  dashboard: () => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
  wallets: () => import('./pages/WalletsPage').then((m) => ({ default: m.WalletsPage })),
  transactions: () => import('./pages/TransactionsPage').then((m) => ({ default: m.TransactionsPage })),
  categories: () => import('./pages/CategoriesPage').then((m) => ({ default: m.CategoriesPage })),
  statistics: () => import('./pages/StatisticsPage').then((m) => ({ default: m.StatisticsPage })),
  profile: () => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
  settings: () => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
} satisfies Record<Route, () => Promise<{ default: ComponentType }>>;

function retryOnce<T>(load: () => Promise<T>) {
  return () => load().catch(() => new Promise<T>((resolve, reject) => {
    window.setTimeout(() => load().then(resolve, reject), 600);
  }));
}

const PAGES = Object.fromEntries(
  Object.entries(PAGE_LOADERS).map(([route, load]) => [route, lazy(retryOnce(load))])
) as Record<Route, LazyExoticComponent<ComponentType>>;

function preloadPages() {
  for (const load of Object.values(PAGE_LOADERS)) void load().catch(() => {});
}

function AuthenticatedApp() {
  const [route, setRoute] = useState<Route>(getRoute());
  const { error, loading, syncing, initialized, refresh } = useAppData();
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

  // Fetch the other pages once the first one is up, while the build that
  // started this session is still the one on the server.
  useEffect(() => {
    if (!initialized) return;
    const timer = window.setTimeout(preloadPages, 1500);
    return () => window.clearTimeout(timer);
  }, [initialized]);

  const Page = PAGES[route];

  return (
    <>
      <AppShell route={route}>
        {error && initialized && (
          <div className="alert danger">
            <span><Icon name="alert" /></span>
            <div><strong>{t('Could not refresh your data')}</strong>{error}</div>
            <button type="button" className="btn secondary" disabled={syncing} onClick={() => void refresh().catch(() => {})}>{t('Try again')}</button>
          </div>
        )}
        <div aria-busy={loading}>
          {initialized ? (
            <AppErrorBoundary key={route} scope="page">
              <Suspense fallback={<><PageSkeleton />{!loading && <Loading />}</>}>
                <Page />
              </Suspense>
            </AppErrorBoundary>
          ) : error ? (
            <EmptyState
              icon="alert"
              title={t('Could not load your data')}
              message={error}
              actionLabel={syncing ? t('Retrying…') : t('Try again')}
              actionDisabled={syncing}
              onAction={() => void refresh().catch(() => {})}
            />
          ) : loading ? <PageSkeleton /> : null}
        </div>
      </AppShell>
      {loading && <Loading message={initialized ? t('Saving changes') : t('Loading data')} />}
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
