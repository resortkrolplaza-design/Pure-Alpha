// =============================================================================
// Group Portal — Shared Login Persistence Flow
// Used by: index.tsx (deep link), pin.tsx (PIN + no-PIN login)
// =============================================================================

import { setGroupToken, setGroupTrackingId, setAppMode, setRsvpToken, setGuestIdentity, setPersistedRole, setPersistedEmail } from "./auth";
import { useAppStore } from "./store";
import type { PortalRole } from "./types";

interface LoginData {
  token: string;
  role?: PortalRole | null;
  email?: string | null;
  rsvpToken?: string | null;
  guest?: {
    id: string;
    firstName: string;
    lastName?: string;
    rsvpStatus: string;
  } | null;
}

/**
 * Persist login data to SecureStore + Zustand store.
 * Call this after successful auth (PIN verify, auth-by-link, etc.)
 */
export async function persistLogin(trackingId: string, data: LoginData): Promise<void> {
  const role: PortalRole = data.role ?? "participant";

  const ops: Promise<void>[] = [
    setGroupToken(data.token),
    setGroupTrackingId(trackingId),
    setAppMode("group"),
    setPersistedRole(role),
  ];
  if (data.rsvpToken) ops.push(setRsvpToken(data.rsvpToken));
  if (data.guest) ops.push(setGuestIdentity(data.guest));
  if (data.email) ops.push(setPersistedEmail(data.email));
  await Promise.all(ops);

  const store = useAppStore.getState();
  store.setGroupTrackingId(trackingId);
  store.setAuthenticated(true);
  store.setMode("group");
  store.setPortalRole(role);
  if (data.guest) store.setGuest(data.guest);
  if (data.rsvpToken) store.setRsvpTokenState(data.rsvpToken);

  // Detect device language on first login only (don't override user preference)
  if (store.lang === "pl") {
    try {
      const rawLocale = Intl.DateTimeFormat().resolvedOptions().locale ?? "";
      if (!rawLocale.startsWith("pl")) store.setLang("en");
    } catch {
      // keep default
    }
  }
}
