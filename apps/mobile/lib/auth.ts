// =============================================================================
// Pure Alpha Mobile — Auth (SecureStore + token management)
// =============================================================================

import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "pa_auth_token";
const PORTAL_TOKEN_KEY = "pa_portal_token";
const MODE_KEY = "pa_app_mode";
const GROUP_ID_KEY = "pa_group_tracking_id";
const EMPLOYEE_TOKEN_KEY = "pa_employee_token";

// ── Token Storage ────────────────────────────────────────────────────────────

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// ── Portal Token (for guest portal — JWT from /p/[token]) ────────────────────

export async function getPortalToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(PORTAL_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setPortalToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(PORTAL_TOKEN_KEY, token);
}

export async function clearPortalToken(): Promise<void> {
  await SecureStore.deleteItemAsync(PORTAL_TOKEN_KEY);
}

// ── Employee Token ───────────────────────────────────────────────────────────

export async function getEmployeeToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(EMPLOYEE_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setEmployeeToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(EMPLOYEE_TOKEN_KEY, token);
}

export async function clearEmployeeToken(): Promise<void> {
  await SecureStore.deleteItemAsync(EMPLOYEE_TOKEN_KEY);
}

// ── Group Portal ─────────────────────────────────────────────────────────────

export async function getGroupTrackingId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(GROUP_ID_KEY);
  } catch {
    return null;
  }
}

export async function setGroupTrackingId(id: string): Promise<void> {
  await SecureStore.setItemAsync(GROUP_ID_KEY, id);
}

export async function clearGroupTrackingId(): Promise<void> {
  await SecureStore.deleteItemAsync(GROUP_ID_KEY);
}

// ── App Mode ─────────────────────────────────────────────────────────────────

export type AppMode = "guest" | "group" | "employee";

export async function getAppMode(): Promise<AppMode | null> {
  try {
    const mode = await SecureStore.getItemAsync(MODE_KEY);
    if (mode === "guest" || mode === "group" || mode === "employee") return mode;
    return null;
  } catch {
    return null;
  }
}

export async function setAppMode(mode: AppMode): Promise<void> {
  await SecureStore.setItemAsync(MODE_KEY, mode);
}

// ── Logout ───────────────────────────────────────────────────────────────────

export async function logout(): Promise<void> {
  await Promise.all([
    clearToken(),
    clearPortalToken(),
    clearEmployeeToken(),
    clearGroupTrackingId(),
    SecureStore.deleteItemAsync(MODE_KEY),
  ]);
}
