import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Keychain / Keystore on the phone. The web preview falls back to localStorage.
const web = Platform.OS === 'web';

export const storage = {
  async get(key: string): Promise<string | null> {
    if (web) {
      try { return localStorage.getItem(key); } catch { return null; }
    }
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (web) {
      try { localStorage.setItem(key, value); } catch {}
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (web) {
      try { localStorage.removeItem(key); } catch {}
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};
