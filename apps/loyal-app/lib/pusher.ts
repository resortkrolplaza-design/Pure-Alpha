// =============================================================================
// Loyal App -- Soketi/Pusher client singleton for real-time messaging
// =============================================================================

import type Pusher from "pusher-js";
import { Platform } from "react-native";

// Production Soketi config (ws.purealphahotel.pl via ALB)
const PUSHER_KEY = "d4842f35948bea2dc7d6";
const PUSHER_HOST = "ws.purealphahotel.pl";
const PUSHER_PORT = 443;
const PUSHER_USE_TLS = true;

const API_BASE =
  __DEV__ && Platform.OS === "web"
    ? "http://localhost:3999"
    : "https://purealphahotel.pl";

let _pusher: Pusher | null = null;
let _PusherClass: typeof Pusher | null = null;
let _initPromise: Promise<Pusher | null> | null = null;
let _currentToken: string | null = null;

/**
 * Get or create the Soketi client singleton.
 * Async because Pusher-JS is loaded via require() for RN compatibility.
 *
 * Auth uses token-in-URL pattern (same as all other loyal portal routes).
 * No Authorization header needed -- the portal token IS the auth.
 */
export async function getLoyalPusher(token: string): Promise<Pusher | null> {
  // If token changed (switched hotel), disconnect old and create new
  if (_pusher && _currentToken !== token) {
    disconnectPusher();
  }
  if (_pusher) return _pusher;
  if (_initPromise) return _initPromise;

  _currentToken = token;
  _initPromise = _initPusher(token);
  const result = await _initPromise;
  _initPromise = null;
  return result;
}

async function _initPusher(token: string): Promise<Pusher | null> {
  try {
    if (!_PusherClass) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("pusher-js");
      _PusherClass = mod.default || mod;
    }

    _pusher = new _PusherClass!(PUSHER_KEY, {
      cluster: "mt1", // required by types, ignored by Soketi
      wsHost: PUSHER_HOST,
      wsPort: PUSHER_PORT,
      wssPort: PUSHER_PORT,
      forceTLS: PUSHER_USE_TLS,
      disableStats: true,
      enabledTransports: ["ws", "wss"],
      authEndpoint: `${API_BASE}/api/loyal/portal/${token}/pusher-auth`,
      // No auth headers -- token-in-URL is the auth mechanism
    });

    return _pusher;
  } catch {
    return null;
  }
}

/**
 * Disconnect and destroy the singleton. Call on logout / hotel switch.
 */
export function disconnectPusher(): void {
  if (_pusher) {
    _pusher.disconnect();
    _pusher = null;
  }
  _currentToken = null;
}
