// =============================================================================
// Group Portal -- Soketi/Pusher client singleton for real-time events
// =============================================================================

import type Pusher from "pusher-js";
import { getGroupToken } from "./auth";
import { API_BASE } from "./api";

// Production Soketi config (ws.purealphahotel.pl via ALB)
const PUSHER_KEY = "d4842f35948bea2dc7d6";
const PUSHER_HOST = "ws.purealphahotel.pl";
const PUSHER_PORT = 443;
const PUSHER_USE_TLS = true;

let _pusher: Pusher | null = null;
let _PusherClass: typeof Pusher | null = null;
let _initPromise: Promise<Pusher | null> | null = null;

/**
 * Get or create the Soketi client singleton.
 * Async to ensure auth headers are set before returning.
 */
export async function getPortalPusher(): Promise<Pusher | null> {
  if (_pusher) return _pusher;
  if (_initPromise) return _initPromise;

  _initPromise = _initPusher();
  const result = await _initPromise;
  _initPromise = null;
  return result;
}

async function _initPusher(): Promise<Pusher | null> {
  try {
    if (!_PusherClass) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("pusher-js");
      _PusherClass = mod.default || mod;
    }

    const token = await getGroupToken();

    _pusher = new _PusherClass!(PUSHER_KEY, {
      cluster: "mt1", // required by types, ignored by Soketi
      wsHost: PUSHER_HOST,
      wsPort: PUSHER_PORT,
      wssPort: PUSHER_PORT,
      forceTLS: PUSHER_USE_TLS,
      disableStats: true,
      enabledTransports: ["ws", "wss"],
      authEndpoint: `${API_BASE}/api/portal/pusher-auth`,
      auth: token
        ? { headers: { Authorization: `Bearer ${token}` } }
        : undefined,
    });

    return _pusher;
  } catch {
    return null;
  }
}

/**
 * Update auth headers with current JWT (call after token refresh).
 */
export async function updatePusherAuth(): Promise<void> {
  if (!_pusher) return;
  const token = await getGroupToken();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = _pusher as any;
  cfg.config.auth = token
    ? { headers: { Authorization: `Bearer ${token}` } }
    : {};
}

/**
 * Disconnect and destroy the singleton. Call on logout.
 */
export function disconnectPusher(): void {
  if (_pusher) {
    _pusher.disconnect();
    _pusher = null;
  }
}
