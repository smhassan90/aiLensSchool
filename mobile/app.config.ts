import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'HawkNexa Parent',
  slug: 'sms-parent',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'smsparent',
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.sms.parent',
    icon: './assets/icon.png',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0f766e',
    },
    package: 'com.sms.parent',
    versionCode: 2,
  },
  web: {
    bundler: 'metro',
    output: 'static',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-splash-screen',
      {
        image: './assets/splash.png',
        backgroundColor: '#042f2e',
        resizeMode: 'cover',
        enableFullScreenImage_legacy: true,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://ai-school-lens-backend.vercel.app/api/v1',
  },
});
