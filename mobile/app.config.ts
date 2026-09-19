import { existsSync } from 'fs';
import path from 'path';
import { ExpoConfig, ConfigContext } from 'expo/config';

const googleServicesPath = process.env.GOOGLE_SERVICES_JSON ?? './android/google-services.json';
const googleServicesResolved = path.resolve(__dirname, googleServicesPath);

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
      backgroundColor: '#ffffff',
    },
    package: 'com.sms.parent',
    versionCode: 4,
    ...(existsSync(googleServicesResolved) ? { googleServicesFile: googleServicesPath } : {}),
  },
  web: {
    bundler: 'metro',
    output: 'static',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-notifications',
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow HawkNexa to choose a student photo.',
        cameraPermission: 'Allow HawkNexa to take a student photo.',
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/splash.png',
        backgroundColor: '#2a9d90',
        resizeMode: 'cover',
        enableFullScreenImage_legacy: true,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://hawknexabackend.fynals.com/api/v1',
  },
});
