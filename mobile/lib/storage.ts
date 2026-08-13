import * as SecureStore from 'expo-secure-store';

const KEYS = {
  accessToken: 'sms_access_token',
  refreshToken: 'sms_refresh_token',
  selectedChildId: 'sms_selected_child_id',
} as const;

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.accessToken);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.refreshToken);
}

export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.accessToken, accessToken);
  await SecureStore.setItemAsync(KEYS.refreshToken, refreshToken);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.accessToken);
  await SecureStore.deleteItemAsync(KEYS.refreshToken);
}

export async function getSelectedChildId(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.selectedChildId);
}

export async function setSelectedChildId(childId: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.selectedChildId, childId);
}

export async function clearSelectedChildId(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.selectedChildId);
}

export async function clearAll(): Promise<void> {
  await clearTokens();
  await clearSelectedChildId();
}
