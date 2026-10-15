import Constants from 'expo-constants';
import { Platform } from 'react-native';

function guessApiUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  if (Platform.OS === 'web') return 'http://localhost:8000';
  // In development the phone loads the JS bundle from your computer, so the backend
  // (port 8000) is on that same machine. hostUri looks like "192.168.1.20:8081".
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:8000`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';
}

export const API_URL = guessApiUrl().replace(/\/$/, '');
