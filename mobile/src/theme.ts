import { useColorScheme } from 'react-native';

import type { StatusCode } from './lib/api';

const light = {
  bg: '#F2F3F7',
  card: '#FFFFFF',
  text: '#0E1220',
  muted: '#6B7285',
  faint: '#A3A9B8',
  border: '#E4E6EE',
  accent: '#2F5BFF',
  accentSoft: '#E9EEFF',
  warnSoft: '#FFF4DC',
  warnText: '#8A5A00',
};

const dark: typeof light = {
  bg: '#0B0D12',
  card: '#161922',
  text: '#F2F4FA',
  muted: '#8A91A6',
  faint: '#5A6175',
  border: '#252A38',
  accent: '#7090FF',
  accentSoft: '#1C2440',
  warnSoft: '#3A2C0C',
  warnText: '#F5C35B',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const STATUS_COLORS: Record<StatusCode, string> = {
  on_time: '#16A34A',
  delayed: '#F59E0B',
  boarding: '#2F5BFF',
  departed: '#7C3AED',
  landed: '#6B7285',
  cancelled: '#DC2626',
};

export const mono = { fontVariant: ['tabular-nums' as const] };
