// Design tokens for Airbud's “Pass” language. DESIGN.md explains each one; keep the two in step.
import { Easing } from 'react-native-reanimated';
import { useColorScheme, type TextStyle, type ViewStyle } from 'react-native';

const light = {
  ground: '#F1F2F2',
  surface: '#FFFFFF',
  sunk: '#F1F2F2',
  ink: '#16181A',
  muted: '#6C7176',
  faint: '#A2A7AB',
  line: '#E2E4E5',
  track: '#C5C9CC',
  stack1: '#E6E8E9',
  stack2: '#DCDFE0',
  good: '#4C7A26',
  goodSoft: '#EAF1E2',
  changed: '#B86E00',
  changedSoft: '#FBF0DF',
  alert: '#C2362B',
  alertSoft: '#FBE7E5',
  act: '#FFC400',
  onAct: '#111111',
  /** Behind any barcode. Never themed, so the code always scans. */
  barcode: '#FFFFFF',
};

const dark: typeof light = {
  ground: '#0E0F10',
  surface: '#1A1B1D',
  sunk: '#131415',
  ink: '#EDEEEF',
  muted: '#8D9297',
  faint: '#5C6166',
  line: '#2A2C2F',
  track: '#3A3D41',
  stack1: '#151617',
  stack2: '#121314',
  good: '#9CC46B',
  goodSoft: '#1F2A15',
  changed: '#F0A63A',
  changedSoft: '#2E2210',
  alert: '#FF7A6B',
  alertSoft: '#3A1A17',
  act: '#FFC400',
  onAct: '#111111',
  barcode: '#FFFFFF',
};

export type Palette = typeof light;

export function useTheme(): { c: Palette; dark: boolean } {
  const isDark = useColorScheme() === 'dark';
  return { c: isDark ? dark : light, dark: isDark };
}

/** Font family names, as registered by `useAppFonts`. Each weight is its own family. */
export const font = {
  serif: 'InstrumentSerif_400Regular',
  sans: 'InstrumentSans_400Regular',
  sansMedium: 'InstrumentSans_500Medium',
  sansSemi: 'InstrumentSans_600SemiBold',
  mono: 'DMMono_400Regular',
  monoMedium: 'DMMono_500Medium',
} as const;

const t = (fontFamily: string, fontSize: number, lineHeight: number, letterSpacing = 0, tabular = false): TextStyle => ({
  fontFamily, fontSize, lineHeight, letterSpacing, ...(tabular ? { fontVariant: ['tabular-nums'] } : {}),
});

export const type = {
  codeXL: t(font.serif, 64, 64),
  codeL: t(font.serif, 34, 36),
  codeS: t(font.serif, 18, 22),
  displayL: t(font.serif, 38, 40, -0.2),
  displayM: t(font.serif, 30, 34, -0.2),
  displayS: t(font.serif, 21, 26),
  numXL: t(font.mono, 34, 38, -1, true),
  numL: t(font.mono, 21, 26, -0.5, true),
  numM: t(font.monoMedium, 15, 20, -0.2, true),
  numS: t(font.mono, 13, 18, 0, true),
  title: t(font.sansSemi, 16, 22, -0.1),
  body: t(font.sans, 15, 21),
  bodyStrong: t(font.sansMedium, 15, 21),
  label: t(font.sansMedium, 12, 16, 0.1),
  caption: t(font.sans, 12, 16),
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

export const space = { xxs: 2, xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48, gutter: 16 } as const;

export const radius = { xs: 6, s: 10, m: 12, l: 18, xl: 22, pill: 999 } as const;

export function shadow(kind: 'card' | 'pass', isDark: boolean): ViewStyle {
  if (isDark) return {};
  return kind === 'card'
    ? { shadowColor: '#000', shadowOpacity: 0.09, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 }
    : { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 3 };
}

export const motion = {
  instant: 120,
  quick: 200,
  standard: 320,
  slow: 560,
  /** Fast start, long soft settle. */
  ease: Easing.bezier(0.2, 0.8, 0.2, 1),
  easeInOut: Easing.bezier(0.45, 0, 0.25, 1),
  spring: {
    press: { damping: 18, stiffness: 380, mass: 0.6 },
    settle: { damping: 20, stiffness: 190, mass: 1 },
    gentle: { damping: 26, stiffness: 120, mass: 1 },
  },
  stagger: 50,
  rise: 14,
  flapStep: 58,
  flapStagger: 90,
} as const;
