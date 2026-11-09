import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/** Secure token storage (Keychain on iOS, Keystore on Android; localStorage on web). */
const ACCESS = 'vimarsh.accessToken';
const REFRESH = 'vimarsh.refreshToken';

// expo-secure-store has no web implementation and throws there. For the browser demo we
// fall back to localStorage. This path is web-only; native still uses the Keychain/Keystore.
const isWeb = Platform.OS === 'web';

const webStore = {
  getItemAsync: async (key: string): Promise<string | null> => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  },
  setItemAsync: async (key: string, value: string): Promise<void> => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // storage unavailable (private mode); tokens just won't persist across reloads.
    }
  },
  deleteItemAsync: async (key: string): Promise<void> => {
    try {
      localStorage.removeItem(key);
    } catch {
      // no-op
    }
  },
};

const store = isWeb ? webStore : SecureStore;

export const tokenStore = {
  async save(access: string, refresh: string): Promise<void> {
    await store.setItemAsync(ACCESS, access);
    await store.setItemAsync(REFRESH, refresh);
  },
  async getAccess(): Promise<string | null> {
    return store.getItemAsync(ACCESS);
  },
  async getRefresh(): Promise<string | null> {
    return store.getItemAsync(REFRESH);
  },
  async setAccess(access: string): Promise<void> {
    await store.setItemAsync(ACCESS, access);
  },
  async clear(): Promise<void> {
    await store.deleteItemAsync(ACCESS);
    await store.deleteItemAsync(REFRESH);
  },
};
