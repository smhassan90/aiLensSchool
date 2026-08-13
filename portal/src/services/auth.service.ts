import { apiClient } from "@/lib/api-client";
import type { AuthUser, LoginResponse, RoleName } from "@/lib/types";

export interface LoginPayload {
  email: string;
  password: string;
  expectedRole?: RoleName;
}

export const authService = {
  login(payload: LoginPayload) {
    return apiClient<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  me() {
    return apiClient<AuthUser>("/auth/me");
  },

  logout(refreshToken: string) {
    return apiClient<{ message: string }>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  },
};
