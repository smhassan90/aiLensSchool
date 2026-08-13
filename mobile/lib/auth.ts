import { loginRequest, logoutRequest, fetchMe } from '@/lib/api';
import { clearAll, getRefreshToken, setTokens } from '@/lib/storage';
import { AuthUser, LoginResponse, MeResponse } from '@/types/api';

export async function login(username: string, password: string): Promise<LoginResponse> {
  const response = await loginRequest(username, password);
  await setTokens(response.accessToken, response.refreshToken);
  return response;
}

export async function logout(): Promise<void> {
  const refreshToken = await getRefreshToken();
  await logoutRequest(refreshToken);
  await clearAll();
}

export async function getCurrentUser(): Promise<MeResponse> {
  return fetchMe();
}

export function getDisplayName(user: AuthUser | MeResponse | null | undefined): string {
  if (!user) return 'Parent';
  return `${user.firstName} ${user.lastName}`.trim() || user.username || user.email;
}
