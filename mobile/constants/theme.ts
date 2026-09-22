import { Platform } from 'react-native';

export const colors = {
  primary: '#2a9d90',
  primaryLight: '#5eead4',
  primaryDark: '#1b655c',
  accent: '#d97706',
  accentSoft: '#eaf6f4',
  coral: '#dc2828',
  sky: '#0284c7',
  mint: '#2dd4bf',
  slate50: '#f9fafb',
  slate100: '#f0f2f4',
  slate200: '#dae0e7',
  slate300: '#cbd5e1',
  slate400: '#94a3b8',
  slate500: '#637083',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1d2530',
  slate900: '#1d2530',
  white: '#ffffff',
  error: '#dc2828',
  success: '#16a34a',
  warning: '#d97706',
  surfaceSoft: '#eaf6f4',
  surfaceYellow: '#fffbeb',
  surfaceMint: '#ecfdf5',
  surfaceBlue: '#f0f9ff',
  surfaceLilac: '#f5f3ff',
  tabBar: '#ffffff',
  tabBarBorder: '#dae0e7',
};

/** Three uniform text sizes across the app */
export const fontSizes = {
  title: 17,
  body: 14,
  caption: 12,
};

export const typography = {
  family: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

export const shadows = {
  card: {
    shadowColor: '#1d2530',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  tabBar: {
    shadowColor: '#1d2530',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 6,
  },
};

/** Bottom padding so scroll content clears the floating tab bar */
export const tabBarClearance = 88;
