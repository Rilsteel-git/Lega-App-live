import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { t } from '../i18n';
import { clearCachedData } from '../lib/dataCache';

const NATIVE_AUTH_CALLBACK = 'com.rilsteel.maniapp://login-callback';
const PASSWORD_RECOVERY_STORAGE_KEY = 'lega-password-recovery-session';

function hasPasswordRecoveryMarker(url = window.location.href) {
  const parsed = new URL(url);
  const hash = new URLSearchParams(parsed.hash.slice(1));
  return parsed.searchParams.get('mode') === 'recovery' || hash.get('type') === 'recovery';
}

function showPasswordResetPage() {
  window.history.replaceState(null, '', `${window.location.pathname}#/reset-password`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

function setStoredPasswordRecovery(value: boolean) {
  try {
    if (value) sessionStorage.setItem(PASSWORD_RECOVERY_STORAGE_KEY, '1');
    else sessionStorage.removeItem(PASSWORD_RECOVERY_STORAGE_KEY);
  } catch {
    // Keep the in-memory recovery flow working when browser storage is disabled.
  }
}

function hasStoredPasswordRecovery() {
  try {
    return sessionStorage.getItem(PASSWORD_RECOVERY_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export type SignUpResult =
  | 'signed-in'
  | 'confirmation-required'
  | 'already-confirmed'
  | 'already-pending'
  | 'already-exists';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  error: string;
  passwordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<SignUpResult>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  cancelPasswordRecovery: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [passwordRecovery, setPasswordRecovery] = useState(hasStoredPasswordRecovery);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setError(t('Supabase is not configured yet. Fill in the .env.local file first.'));
      return;
    }
    const client = supabase;
    const recoveryRequested = hasPasswordRecoveryMarker();
    void client.auth.getSession().then(({ data, error: result }) => {
      if (result) setError(result.message);
      setSession(data.session);
      if (!data.session && hasStoredPasswordRecovery()) {
        setStoredPasswordRecovery(false);
        setPasswordRecovery(false);
      }
      // A recovery redirect alone is not proof that its one-time token was
      // accepted. Supabase emits PASSWORD_RECOVERY only after it validates it.
      if (recoveryRequested) showPasswordResetPage();
      setLoading(false);
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : t('Could not restore your session.'));
      setLoading(false);
    });
    const { data: listener } = client.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') {
        setStoredPasswordRecovery(true);
        setPasswordRecovery(true);
        showPasswordResetPage();
      } else if (event === 'SIGNED_OUT') {
        // Financial data cached for fast starts must not outlive the session.
        clearCachedData();
        setStoredPasswordRecovery(false);
        setPasswordRecovery(false);
      }
    });

    let disposed = false;
    const handleNativeAuthUrl = async (url: string) => {
      try {
        const callback = new URL(url);
        const code = callback.searchParams.get('code');
        const hashParams = new URLSearchParams(callback.hash.slice(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const isRecovery = hasPasswordRecoveryMarker(url);

        if (code) {
          const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else if (accessToken && refreshToken) {
          const { error: sessionError } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (sessionError) throw sessionError;
        } else {
          const callbackError = hashParams.get('error_description') || callback.searchParams.get('error_description');
          if (callbackError) throw new Error(callbackError);
        }

        if (!disposed) {
          if (isRecovery) {
            if (!code && !(accessToken && refreshToken)) throw new Error(t('This password reset link is invalid or expired.'));
            setStoredPasswordRecovery(true);
            setPasswordRecovery(true);
            showPasswordResetPage();
          } else {
            window.history.replaceState(null, '', '#/login');
          }
        }
      } catch (reason) {
        if (!disposed) setError(reason instanceof Error ? reason.message : t('Could not complete email confirmation.'));
      }
    };

    let removeUrlListener: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      const urlListener = App.addListener('appUrlOpen', ({ url }) => {
        void handleNativeAuthUrl(url);
      });
      void urlListener.then((handle) => {
        if (disposed) void handle.remove();
        else removeUrlListener = () => { void handle.remove(); };
      });
      void App.getLaunchUrl().then((launch) => {
        if (launch?.url) void handleNativeAuthUrl(launch.url);
      });
    }

    return () => {
      disposed = true;
      removeUrlListener?.();
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    if (!isSupabaseConfigured || !supabase) throw new Error(t('Supabase is not configured.'));
    setError('');
    const { error: result } = await supabase.auth.signInWithPassword({ email, password });
    if (result) {
      if (result.code === 'email_not_confirmed') {
        throw new Error(t('Please confirm your email before logging in.'));
      }
      throw result;
    }
    window.history.replaceState(null, '', '#/dashboard');
  }

  async function signUp(name: string, email: string, password: string): Promise<SignUpResult> {
    if (!isSupabaseConfigured || !supabase) throw new Error(t('Supabase is not configured.'));
    setError('');
    const { data, error: result } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: Capacitor.isNativePlatform()
          ? NATIVE_AUTH_CALLBACK
          : `${window.location.origin}/#/login`
      }
    });
    if (result) throw result;
    if (data.session) return 'signed-in';

    // Checking a duplicate email must not create a session in this browser.
    if (data.user?.identities && data.user.identities.length === 0) {
      return 'already-exists';
    }

    return 'confirmation-required';
  }

  async function requestPasswordReset(email: string) {
    if (!isSupabaseConfigured || !supabase) throw new Error(t('Supabase is not configured.'));
    setError('');
    setStoredPasswordRecovery(false);
    setPasswordRecovery(false);
    const redirectTo = Capacitor.isNativePlatform()
      ? `${NATIVE_AUTH_CALLBACK}?mode=recovery`
      : `${window.location.origin}/?mode=recovery`;
    const { error: result } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo
    });
    if (result) throw result;
  }

  async function updatePassword(password: string) {
    if (!isSupabaseConfigured || !supabase) throw new Error(t('Supabase is not configured.'));
    setError('');
    const { error: result } = await supabase.auth.updateUser({ password });
    if (result) throw result;
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
    if (signOutError) throw signOutError;
    setStoredPasswordRecovery(false);
    setPasswordRecovery(false);
  }

  async function cancelPasswordRecovery() {
    if (supabase) {
      const { error: result } = await supabase.auth.signOut({ scope: 'local' });
      if (result) console.warn('Could not clear the password recovery session.', result);
    }
    setStoredPasswordRecovery(false);
    setPasswordRecovery(false);
    window.history.replaceState(null, '', '#/login');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  async function signOut() {
    if (!supabase) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user || null,
      loading,
      error,
      passwordRecovery,
      signIn,
      signUp,
      requestPasswordReset,
      updatePassword,
      cancelPasswordRecovery,
      signOut
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
