import { existsSync } from 'fs';
import path from 'path';
import { ExpoConfig, ConfigContext } from 'expo/config';

const googleServicesPath = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';
const googleServicesResolved = path.resolve(__dirname, googleServicesPath);

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Hawk Nexa',
  slug: 'sms-parent',
  version: '1.0.2',
  orientation: 'portrait',
  scheme: 'smsparent',
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.hawknexa.student',
    icon: './assets/icon.png',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    package: 'com.hawknexa.student',
    versionCode: 10,
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
      'expo-splash-screen',
      {
        image: './assets/icon.png',
        backgroundColor: '#ffffff',
        imageWidth: 96,
        resizeMode: 'contain',
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
