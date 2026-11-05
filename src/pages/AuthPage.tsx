/* ============================================================
   AuthPage.tsx — salinan halaman auth dari
   personal-wallet/index.html (#auth-screen) + css/auth.css.
   Panel login/register dipilih lewat hash, sama seperti vanilla:
   #/login dan #/register.
   ============================================================ */

import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/IconSprite';
import { useFormErrors } from '../hooks/useFormErrors';
import { t } from '../i18n';

type AuthRoute = 'login' | 'register' | 'forgot-password' | 'reset-password';

function getAuthRoute(): AuthRoute {
  const route = window.location.hash.replace('#/', '').split('?')[0];
  if (route === 'register' || route === 'forgot-password' || route === 'reset-password') return route;
  return 'login';
}

/** Input password dengan tombol lihat/sembunyikan. */
function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  minLength,
  error,
  hint,
  action
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder: string;
  minLength?: number;
  error?: string;
  hint?: string;
  action?: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={`input${error ? ' error' : ''}`} data-field="password">
      <div className="auth-field-heading">
        <label htmlFor={id}>{label}</label>
        {action}
      </div>
      <div className="auth-password">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          placeholder={placeholder}
          minLength={minLength}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
        />
        <button
          type="button"
          aria-label={visible ? t('Hide password') : t('Show password')}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          <Icon name={visible ? 'eye-off' : 'eye'} />
        </button>
      </div>
      {error && <small className="field-error">{error}</small>}
      {!error && hint && <small className="hint-info">{hint}</small>}
    </div>
  );
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return t('Enter your email address.');
  if (!EMAIL_PATTERN.test(trimmed)) return t('Enter a valid email address (e.g. name@example.com).');
  return null;
}

/** 8+ karakter, campuran huruf besar/kecil, angka, dan simbol. */
const PASSWORD_HINT = t('At least 8 characters, with uppercase, lowercase, a number, and a special character.');

function validatePassword(value: string): string | null {
  if (value.length < 8) return t('Use at least 8 characters.');
  if (!/[a-z]/.test(value)) return t('Add at least one lowercase letter.');
  if (!/[A-Z]/.test(value)) return t('Add at least one uppercase letter.');
  if (!/[0-9]/.test(value)) return t('Add at least one number.');
  if (!/[^A-Za-z0-9]/.test(value)) return t('Add at least one special character (e.g. ! @ # $ %).');
  return null;
}

export function AuthPage() {
  const {
    signIn,
    signUp,
    passwordRecovery,
    requestPasswordReset,
    updatePassword,
    cancelPasswordRecovery,
    error: configError
  } = useAuth();
  const [route, setRoute] = useState<AuthRoute>(getAuthRoute());
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState('');
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const { errors, setErrors, clearError } = useFormErrors();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const update = () => {
      setRoute(getAuthRoute());
      setStatus('');
      setErrors({});
      setPassword('');
      setConfirm('');
      setResetEmailSent(false);
      setPasswordUpdated(false);
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  // `body.auth-route` yang membuat .auth-screen tampil (lihat css/auth.css).
  useEffect(() => {
    document.body.classList.add('auth-route');
    return () => {
      document.body.classList.remove('auth-route');
      document.title = 'Lega';
    };
  }, []);

  useEffect(() => {
    const titles: Record<AuthRoute, string> = {
      login: t('Log in'),
      register: t('Register'),
      'forgot-password': t('Forgot password'),
      'reset-password': t('Create new password')
    };
    document.title = `${titles[route]} · Lega`;
  }, [route]);

  function showLoginAfterRegister(message: string) {
    window.history.replaceState(null, '', '#/login');
    setRoute('login');
    setErrors({});
    setPassword('');
    setConfirm('');
    setStatus(message);
  }

  async function submitLogin(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    const emailError = validateEmail(email);
    if (emailError) next.email = emailError;
    if (!password) next.password = t('Enter your password.');
    setErrors(next);
    if (Object.keys(next).length) return;

    setStatus('');
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : t('Could not log you in.'));
    } finally {
      setBusy(false);
    }
  }

  async function submitRegister(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = t('Tell us what to call you.');
    const emailError = validateEmail(email);
    if (emailError) next.email = emailError;
    const passwordError = validatePassword(password);
    if (passwordError) next.password = passwordError;
    if (confirm !== password) next.confirm = t('Both passwords must match.');
    setErrors(next);
    if (Object.keys(next).length) return;

    setStatus('');
    setBusy(true);
    try {
      const result = await signUp(name.trim(), email.trim(), password);
      if (result === 'confirmation-required') {
        showLoginAfterRegister(t('We sent a confirmation link to {email}. Confirm it, then log in below.', { email: email.trim() }));
      } else if (result === 'already-pending') {
        showLoginAfterRegister(t('This email is already registered but not confirmed. Check {email} for the confirmation link. Login is unavailable until you confirm it.', { email: email.trim() }));
      } else if (result === 'already-confirmed' || result === 'already-exists') {
        showLoginAfterRegister(t('This email is already registered. Please log in instead of creating another account.'));
      } else {
        setStatus('');
      }
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : t('Could not create your account.'));
    } finally {
      setBusy(false);
    }
  }

  async function submitForgotPassword(event: React.FormEvent) {
    event.preventDefault();
    const emailError = validateEmail(email);
    setErrors(emailError ? { email: emailError } : {});
    if (emailError) return;

    setStatus('');
    setBusy(true);
    try {
      await requestPasswordReset(email.trim());
      setResetEmailSent(true);
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : t('Could not send the reset link.'));
    } finally {
      setBusy(false);
    }
  }

  async function submitNewPassword(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    const passwordError = validatePassword(password);
    if (passwordError) next.password = passwordError;
    if (confirm !== password) next.confirm = t('Both passwords must match.');
    setErrors(next);
    if (Object.keys(next).length) return;

    setStatus('');
    setBusy(true);
    try {
      await updatePassword(password);
      setPasswordUpdated(true);
      setPassword('');
      setConfirm('');
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : t('Could not update your password.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen" id="auth-screen">
      <div className="auth-layout">
        <main className="auth-content">
          <div className="auth-mobile-brand">
            <img src="/brand/lega-app-icon.svg" alt="" width={46} height={46} />
            <span>Lega</span>
          </div>

          <section className={`auth-panel${route === 'login' ? ' active' : ''}`} id="page-login" aria-labelledby="login-title">
            <div className="auth-heading">
              <span className="auth-overline">{t('WELCOME BACK')}</span>
              <h1 id="login-title">{t('Log in to Lega')}</h1>
              <p>{t('Pick up where you left off with your money.')}</p>
            </div>
            <form className="auth-form" onSubmit={submitLogin} noValidate>
              <div className={`input${errors.email ? ' error' : ''}`} data-field="email">
                <label htmlFor="login-email">{t('Email address')}</label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder={t('you@example.com')}
                  value={email}
                  onChange={(event) => { setEmail(event.target.value); clearError('email'); setStatus(''); }}
                  required
                />
                {errors.email && <small className="field-error">{errors.email}</small>}
              </div>
              <PasswordField
                id="login-password"
                label={t('Password')}
                value={password}
                onChange={(value) => { setPassword(value); clearError('password', 'confirm'); setStatus(''); }}
                autoComplete="current-password"
                placeholder={t('Enter your password')}
                error={errors.password}
                action={<a className="auth-forgot-link" href="#/forgot-password">{t('Forgot password?')}</a>}
              />
              <p className="auth-status" id="login-status" role="status" aria-live="polite">
                {configError || status}
              </p>
              <button className="btn primary auth-submit" type="submit" disabled={busy}>
                {busy ? t('Please wait…') : <>{t('Log in')} <Icon name="arrow-right" /></>}
              </button>
            </form>
            <p className="auth-switch">{t('New to Lega?')} <a href="#/register">{t('Create an account')}</a></p>
            <p className="auth-local-note">
              {t('Your account is stored on the server, so the same email and password work on any device.')}
            </p>
          </section>

          <section className={`auth-panel${route === 'forgot-password' ? ' active' : ''}`} id="page-forgot-password" aria-labelledby="forgot-password-title">
            {resetEmailSent ? (
              <div className="auth-result" role="status" aria-live="polite">
                <div className="auth-result-icon"><Icon name="mail" /></div>
                <span className="auth-overline">{t('CHECK YOUR INBOX')}</span>
                <h1>{t('Reset link sent')}</h1>
                <p>{t('If an account exists for {email}, you will receive a password reset link shortly.', { email: '@@EMAIL@@' }).split('@@EMAIL@@').flatMap((part, index) => index === 0 ? [part] : [<strong key="email">{email.trim()}</strong>, part])}</p>
                <a className="btn primary auth-submit" href="#/login">{t('Back to log in')} <Icon name="arrow-right" /></a>
                <button className="auth-text-button" type="button" disabled={busy} onClick={() => setResetEmailSent(false)}>{t('Use another email')}</button>
              </div>
            ) : (
              <>
                <a className="auth-back" href="#/login"><Icon name="chevron-left" /> {t('Back to log in')}</a>
                <div className="auth-heading auth-heading-spaced">
                  <span className="auth-overline">{t('ACCOUNT RECOVERY')}</span>
                  <h1 id="forgot-password-title">{t('Forgot your password?')}</h1>
                  <p>{t('Enter the email linked to your Lega account. We will send you a secure reset link.')}</p>
                </div>
                <form className="auth-form" onSubmit={submitForgotPassword} noValidate>
                  <div className={`input${errors.email ? ' error' : ''}`} data-field="email">
                    <label htmlFor="forgot-email">{t('Email address')}</label>
                    <input
                      id="forgot-email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      placeholder={t('you@example.com')}
                      value={email}
                      onChange={(event) => { setEmail(event.target.value); clearError('email'); setStatus(''); }}
                      required
                      autoFocus
                    />
                    {errors.email && <small className="field-error">{errors.email}</small>}
                  </div>
                  <p className="auth-status" role="status" aria-live="polite">{configError || status}</p>
                  <button className="btn primary auth-submit" type="submit" disabled={busy}>
                    {busy ? t('Sending…') : <>{t('Send reset link')} <Icon name="arrow-right" /></>}
                  </button>
                </form>
                <p className="auth-security-note"><Icon name="lock" /> {t('The link is private and expires automatically.')}</p>
              </>
            )}
          </section>

          <section className={`auth-panel${route === 'reset-password' ? ' active' : ''}`} id="page-reset-password" aria-labelledby="reset-password-title">
            {passwordUpdated ? (
              <div className="auth-result" role="status" aria-live="polite">
                <div className="auth-result-icon success"><Icon name="check" /></div>
                <span className="auth-overline">{t('ALL SET')}</span>
                <h1>{t('Password updated')}</h1>
                <p>{t('Your password has been changed. Log in with the new password to continue.')}</p>
                <a className="btn primary auth-submit" href="#/login">{t('Log in to Lega')} <Icon name="arrow-right" /></a>
              </div>
            ) : passwordRecovery ? (
              <>
                <button className="auth-back auth-back-button" type="button" onClick={() => void cancelPasswordRecovery()}>
                  <Icon name="chevron-left" /> {t('Cancel')}
                </button>
                <div className="auth-heading auth-heading-spaced">
                  <span className="auth-overline">{t('SECURE YOUR ACCOUNT')}</span>
                  <h1 id="reset-password-title">{t('Create a new password')}</h1>
                  <p>{t('Choose a strong password you have not used for this account before.')}</p>
                </div>
                <form className="auth-form" onSubmit={submitNewPassword} noValidate>
                  <PasswordField
                    id="reset-new-password"
                    label={t('New password')}
                    value={password}
                    onChange={(value) => { setPassword(value); clearError('password', 'confirm'); setStatus(''); }}
                    autoComplete="new-password"
                    placeholder={t('Enter your new password')}
                    minLength={8}
                    error={errors.password}
                    hint={PASSWORD_HINT}
                  />
                  <PasswordField
                    id="reset-confirm-password"
                    label={t('Confirm new password')}
                    value={confirm}
                    onChange={(value) => { setConfirm(value); clearError('confirm'); setStatus(''); }}
                    autoComplete="new-password"
                    placeholder={t('Enter it again')}
                    error={errors.confirm}
                  />
                  <p className="auth-status" role="status" aria-live="polite">{configError || status}</p>
                  <button className="btn primary auth-submit" type="submit" disabled={busy}>
                    {busy ? t('Updating…') : <>{t('Change password')} <Icon name="arrow-right" /></>}
                  </button>
                </form>
                <p className="auth-security-note"><Icon name="lock" /> {t('Your password is updated through a secure Supabase session.')}</p>
              </>
            ) : (
              <div className="auth-result" role="alert">
                <div className="auth-result-icon warning"><Icon name="alert" /></div>
                <span className="auth-overline">{t('LINK UNAVAILABLE')}</span>
                <h1>{t('Reset link expired')}</h1>
                <p>{t('Request a new password reset link and open the latest email from Lega.')}</p>
                <a className="btn primary auth-submit" href="#/forgot-password">{t('Request a new link')} <Icon name="arrow-right" /></a>
              </div>
            )}
          </section>

          <section className={`auth-panel${route === 'register' ? ' active' : ''}`} id="page-register" aria-labelledby="register-title">
            <div className="auth-heading">
              <span className="auth-overline">{t('GET STARTED')}</span>
              <h1 id="register-title">{t('Create your account')}</h1>
              <p>{t('A simple start to a clearer money picture.')}</p>
            </div>
            <form className="auth-form" onSubmit={submitRegister} noValidate>
              <div className={`input${errors.name ? ' error' : ''}`} data-field="name">
                <label htmlFor="register-name">{t('Your name')}</label>
                <input
                  id="register-name"
                  type="text"
                  autoComplete="name"
                  maxLength={40}
                  placeholder={t('What should we call you?')}
                  value={name}
                  onChange={(event) => { setName(event.target.value); clearError('name'); setStatus(''); }}
                  required
                />
                {errors.name && <small className="field-error">{errors.name}</small>}
              </div>
              <div className={`input${errors.email ? ' error' : ''}`} data-field="email">
                <label htmlFor="register-email">{t('Email address')}</label>
                <input
                  id="register-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder={t('you@example.com')}
                  value={email}
                  onChange={(event) => { setEmail(event.target.value); clearError('email'); setStatus(''); }}
                  required
                />
                {errors.email && <small className="field-error">{errors.email}</small>}
              </div>
              <PasswordField
                id="register-password"
                label={t('Password')}
                value={password}
                onChange={(value) => { setPassword(value); clearError('password', 'confirm'); setStatus(''); }}
                autoComplete="new-password"
                placeholder={t('Enter your password')}
                minLength={8}
                error={errors.password}
                hint={PASSWORD_HINT}
              />
              <PasswordField
                id="register-confirm"
                label={t('Confirm password')}
                value={confirm}
                onChange={(value) => { setConfirm(value); clearError('confirm'); setStatus(''); }}
                autoComplete="new-password"
                placeholder={t('Enter your password again')}
                error={errors.confirm}
              />
              <p className="auth-status" id="register-status" role="status" aria-live="polite">
                {configError || status}
              </p>
              <button className="btn primary auth-submit" type="submit" disabled={busy}>
                {busy ? t('Please wait…') : <>{t('Create account')} <Icon name="arrow-right" /></>}
              </button>
            </form>
            <p className="auth-switch">{t('Already have an account?')} <a href="#/login">{t('Log in')}</a></p>
            <p className="auth-local-note">
              {t('One account per email. Your wallets, categories, and transactions are tied to this account.')}
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
