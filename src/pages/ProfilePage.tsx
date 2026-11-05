/* ============================================================
   ProfilePage.tsx — salinan section #page-profile dari
   personal-wallet/index.html + logika render.profile().
   ============================================================ */

import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { useUi } from '../context/UiContext';
import { activeCategories } from '../lib/selectors';
import { MONTHS } from '../lib/format';
import { Avatar } from '../components/Avatar';
import { Icon, type IconName } from '../components/IconSprite';
import { navigate } from '../components/AppShell';
import { t, tp } from '../i18n';

/** "Tracking since March 2026" — dihitung dari saat profil dibuat. */
function memberSince(iso?: string) {
  const date = iso ? new Date(iso) : null;
  if (!date || isNaN(date.getTime())) return t('Your money, tracked in one place');
  return t('Tracking since {month} {year}', { month: MONTHS[date.getMonth()], year: date.getFullYear() });
}

function MenuRow({
  icon,
  title,
  meta,
  danger = false,
  onClick
}: {
  icon: IconName;
  title: string;
  meta: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`menu-row${danger ? ' danger' : ''}`} type="button" onClick={onClick}>
      <span className="menu-icon"><Icon name={icon} /></span>
      <span className="menu-body"><strong>{title}</strong><small>{meta}</small></span>
      <span className="menu-chevron" aria-hidden="true"><Icon name="chevron-right" /></span>
    </button>
  );
}

export function ProfilePage() {
  const { signOut } = useAuth();
  const { profile, wallets, categories, transactions, deleteAccount } = useAppData();
  const { openModal, confirm, toast } = useUi();

  const categoryCount = activeCategories(categories).length;
  const name = profile?.name || '';


  function logout() {
    confirm({
      title: t('Log out?'),
      message: t('Your session will end. Wallets, categories, and transactions stay in your account.'),
      confirmLabel: t('Log out'),
      onConfirm: () => { void signOut().catch(() => toast(t('Could not log out. Please try again.'), { variant: 'error' })); }
    });
  }

  function deleteAccountFlow() {
    confirm({
      title: t('Delete your account?'),
      message: t('This permanently deletes your profile, wallets, categories, and every transaction. This cannot be undone.'),
      confirmLabel: t('Delete account'),
      onConfirm: () => {
        void (async () => {
          try {
            await deleteAccount();
          } catch {
            toast(t('Could not delete your account. Please try again.'), { variant: 'error' });
            return;
          }
          // The account is already gone server-side at this point; if
          // signOut() itself fails (e.g. the now-invalid session can't be
          // revoked remotely), there's nothing left to roll back.
          try {
            await signOut();
          } catch {
            /* ignore */
          }
        })();
      }
    });
  }

  return (
    <section className="page active" id="page-profile" aria-label={t('Profile')}>
      <div className="grid-2">
        <article className="card">
          <div className="profile-summary">
            <button
              className="profile-photo"
              type="button"
              aria-label={t('Change profile photo')}
              onClick={() => openModal({ kind: 'profile' })}
            >
              <Avatar
                id="profile-avatar"
                className="profile-avatar"
                name={name}
                photo={profile?.photoUrl}
              />
              <span className="profile-photo-badge" aria-hidden="true"><Icon name="camera" /></span>
            </button>
            <div className="profile-identity">
              <strong id="profile-name" className={name ? undefined : 'is-placeholder'}>
                {name || t('Add your name')}
              </strong>
              <small id="profile-meta">{memberSince(profile?.createdAt)}</small>
            </div>
            <button
              className="icon-btn"
              type="button"
              aria-label={t('Edit profile')}
              title={t('Edit profile')}
              onClick={() => openModal({ kind: 'profile' })}
            >
              <Icon name="edit" />
            </button>
          </div>
          <div className="profile-stats">
            <div className="profile-stat"><small>{t('Wallets')}</small><strong className="num" id="profile-wallets">{wallets.length}</strong></div>
            <div className="profile-stat"><small>{t('Transactions')}</small><strong className="num" id="profile-tx">{transactions.length}</strong></div>
            <div className="profile-stat"><small>{t('Categories')}</small><strong className="num" id="profile-categories">{categoryCount}</strong></div>
          </div>
        </article>

        <article className="card manage-account-card">
          <div className="card-head">
            <div><h2>{t('Manage account')}</h2><p>{t('Your profile, money sources, and app data')}</p></div>
          </div>
          <div className="menu-list">
            <MenuRow
              icon="user"
              title={t('Edit profile')}
              meta={t('Change your name and photo')}
              onClick={() => openModal({ kind: 'profile' })}
            />
            <MenuRow
              icon="wallet"
              title={t('Wallets')}
              meta={wallets.length ? tp(wallets.length, '{count} wallet', '{count} wallets') : t('Nothing added yet')}
              onClick={() => navigate('wallets')}
            />
            <MenuRow
              icon="category"
              title={t('Categories')}
              meta={tp(categoryCount, '{count} category', '{count} categories')}
              onClick={() => navigate('categories')}
            />

            <MenuRow
              icon="settings"
              title={t('Settings')}
              meta={t('Language and report currency · {currency}', { currency: profile?.reportCurrency || 'IDR' })}
              onClick={() => navigate('settings')}
            />
            <MenuRow
              icon="logout"
              title={t('Log out')}
              meta={t('End this session')}
              danger
              onClick={logout}
            />
            <MenuRow
              icon="trash"
              title={t('Delete account')}
              meta={t('Permanently erase your profile and data')}
              danger
              onClick={deleteAccountFlow}
            />
          </div>
        </article>
      </div>
    </section>
  );
}
