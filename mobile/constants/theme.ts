export const colors = {
  primary: '#0f766e',
  primaryLight: '#14b8a6',
  primaryDark: '#115e59',
  accent: '#f59e0b',
  coral: '#e11d48',
  sky: '#0284c7',
  mint: '#2dd4bf',
  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate300: '#cbd5e1',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1e293b',
  slate900: '#0f172a',
  white: '#ffffff',
  error: '#dc2626',
  success: '#16a34a',
  warning: '#d97706',
  surfaceLavender: '#f0fdfa',
  surfaceYellow: '#fffbeb',
  surfaceMint: '#ecfdf5',
  surfaceBlue: '#f0f9ff',
};

export const typography = {
  family: 'serif',
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
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
    shadowColor: '#1e293b',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
  },
};
