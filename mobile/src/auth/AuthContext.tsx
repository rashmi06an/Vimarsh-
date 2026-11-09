import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { authApi, usersApi } from '../api/endpoints';
import { setSessionExpiredHandler } from '../api/client';
import { tokenStore } from './storage';
import { Profile, TokenPair, PublicUser } from '../api/types';

interface AuthState {
  bootstrapping: boolean;
  user: Profile | null;
  signIn: (email: string, password: string) => Promise<Profile>;
  /** Called after OTP verification, which returns a token pair + user. */
  adoptSession: (pair: TokenPair, user: PublicUser) => Promise<void>;
  refreshProfile: () => Promise<Profile | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [user, setUser] = useState<Profile | null>(null);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // best-effort; proceed to clear locally
    }
    await tokenStore.clear();
    setUser(null);
  }, []);

  const refreshProfile = useCallback(async (): Promise<Profile | null> => {
    try {
      const me = await usersApi.me();
      setUser(me);
      return me;
    } catch {
      return null;
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<Profile> => {
    const res = await authApi.login({ email, password });
    await tokenStore.save(res.accessToken, res.refreshToken);
    const me = await usersApi.me();
    setUser(me);
    return me;
  }, []);

  const adoptSession = useCallback(async (pair: TokenPair, _user: PublicUser) => {
    await tokenStore.save(pair.accessToken, pair.refreshToken);
    const me = await usersApi.me();
    setUser(me);
  }, []);

  // Restore session on launch (Splash). Register a handler so an unrefreshable 401 logs out.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
    });
    (async () => {
      try {
        const access = await tokenStore.getAccess();
        if (access) {
          await refreshProfile();
        }
      } catch {
        // storage or network failure during restore — fall through to the signed-out state
        // rather than hanging on the splash screen.
      } finally {
        setBootstrapping(false);
      }
    })();
  }, [refreshProfile]);

  const value = useMemo<AuthState>(
    () => ({ bootstrapping, user, signIn, adoptSession, refreshProfile, signOut }),
    [bootstrapping, user, signIn, adoptSession, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
