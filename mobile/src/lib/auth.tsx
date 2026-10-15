/**
 * Sign-in for a native app without any native Google SDK.
 *
 * The app opens a system auth browser (ASWebAuthenticationSession on iOS, Chrome Custom Tabs
 * on Android) and waits for a redirect back to our own URL scheme. The client secret and Gmail
 * tokens never leave the backend.
 *
 *   app ──openAuthSessionAsync──▶ backend /auth/google/start ──▶ Google consent
 *   Google ──▶ static relay page on GitHub Pages (docs/oauth.html)
 *   app ◀── airbud://auth?google_code=…&state=… (exp://…/--/auth in Expo Go)
 *   app ──POST /auth/google/finish {code, state}──▶ { token } → Keychain/Keystore
 *
 * Because the app (not Google) carries the code to the backend, the backend never needs to be
 * reachable from the internet: no tunnel, no interstitial pages, works on home Wi-Fi.
 * (If the backend does have a real HTTPS address, the older flow via /auth/google/callback and a
 * one-time `code` still works; both are handled below.)
 *
 * Why this avoids the usual pain: no iOS/Android OAuth client IDs, no SHA-1 fingerprints, no
 * reversed-client-ID URL schemes, and it works the same in Expo Go and in a real build.
 */
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api, setApiToken, setUnauthorizedHandler } from './api';
import { API_URL } from './config';
import { storage } from './storage';

const TOKEN_KEY = 'session_token';

type Status = 'loading' | 'signedOut' | 'signedIn';

type AuthContextValue = {
  status: Status;
  signInWithGoogle: () => Promise<void>;
  signInDemo: () => Promise<void>;
  exchangeCode: (code: string) => Promise<void>;
  finishGoogle: (googleCode: string, state: string) => Promise<void>;
  signOut: (pushToken?: string | null) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const ERRORS: Record<string, string> = {
  access_denied: 'You cancelled the Google permission screen.',
  gmail_permission_not_granted: 'Airbud needs the "Read your email" permission. Tick that box on the Google screen.',
  google_exchange_failed: 'Google sign-in failed on the server. Check the backend logs.',
};

// On Android the redirect can arrive both as the auth-session result *and* as a deep link to
// app/auth.tsx. Codes are single-use, so make sure we only exchange each one once.
const inFlight = new Map<string, Promise<void>>();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');

  const clearLocal = useCallback(async () => {
    setApiToken(null);
    await storage.remove(TOKEN_KEY);
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
    setUnauthorizedHandler(() => void clearLocal());
    storage.get(TOKEN_KEY).then((token) => {
      setApiToken(token);
      setStatus(token ? 'signedIn' : 'signedOut');
    });
  }, [clearLocal]);

  const finish = useCallback(async (token: string) => {
    await storage.set(TOKEN_KEY, token);
    setApiToken(token);
    setStatus('signedIn');
  }, []);

  const exchangeCode = useCallback(
    (code: string) => {
      let p = inFlight.get(code);
      if (!p) {
        p = api<{ token: string }>('/auth/exchange', { method: 'POST', body: { code } }).then(({ token }) => finish(token));
        inFlight.set(code, p);
      }
      return p;
    },
    [finish],
  );

  const finishGoogle = useCallback(
    (googleCode: string, state: string) => {
      let p = inFlight.get(googleCode);
      if (!p) {
        p = api<{ token: string }>('/auth/google/finish', { method: 'POST', body: { code: googleCode, state } })
          .catch((e: Error) => {
            throw new Error(ERRORS[e.message] ?? e.message);
          })
          .then(({ token }) => finish(token));
        inFlight.set(googleCode, p);
      }
      return p;
    },
    [finish],
  );

  const signInWithGoogle = useCallback(async () => {
    const redirect = Linking.createURL('auth');
    const startUrl = `${API_URL}/auth/google/start?app_redirect=${encodeURIComponent(redirect)}`;
    const result = await WebBrowser.openAuthSessionAsync(startUrl, redirect);
    if (result.type !== 'success') return; // user closed the browser

    const { queryParams } = Linking.parse(result.url);
    const error = queryParams?.error;
    if (error) throw new Error(ERRORS[String(error)] ?? `Sign-in failed: ${error}`);
    const googleCode = queryParams?.google_code;
    if (googleCode) return finishGoogle(String(googleCode), String(queryParams?.state ?? ''));
    const code = queryParams?.code;
    if (!code) throw new Error('Sign-in returned without a code.');
    await exchangeCode(String(code));
  }, [exchangeCode, finishGoogle]);

  const signInDemo = useCallback(async () => {
    const { token } = await api<{ token: string }>('/auth/demo', { method: 'POST' });
    await finish(token);
  }, [finish]);

  const signOut = useCallback(
    async (pushToken?: string | null) => {
      try {
        await api('/auth/logout', { method: 'POST', body: { push_token: pushToken ?? null } });
      } catch {}
      await clearLocal();
    },
    [clearLocal],
  );

  const value = useMemo(
    () => ({ status, signInWithGoogle, signInDemo, exchangeCode, finishGoogle, signOut }),
    [status, signInWithGoogle, signInDemo, exchangeCode, finishGoogle, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
