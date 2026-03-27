// =============================================================================
// Group Portal — Shared Login Persistence Flow
// Used by: index.tsx (deep link), pin.tsx (PIN + no-PIN login)
// =============================================================================

import { setGroupToken, setGroupTrackingId, setAppMode, setRsvpToken, setGuestIdentity } from "./auth";
import { useAppStore } from "./store";

interface LoginData {
  token: string;
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
  const ops: Promise<void>[] = [
    setGroupToken(data.token),
    setGroupTrackingId(trackingId),
    setAppMode("group"),
  ];
  if (data.rsvpToken) ops.push(setRsvpToken(data.rsvpToken));
  if (data.guest) ops.push(setGuestIdentity(data.guest));
  await Promise.all(ops);

  const store = useAppStore.getState();
  store.setGroupTrackingId(trackingId);
  store.setAuthenticated(true);
  store.setMode("group");
  if (data.guest) store.setGuest(data.guest);
  if (data.rsvpToken) store.setRsvpTokenState(data.rsvpToken);
}
