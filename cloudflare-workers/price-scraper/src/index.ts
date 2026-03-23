// ============================================================================
// PURE ALPHA PRICE SCRAPER - Cloudflare Worker
// ============================================================================
// Extracts real-time room prices from hotel booking engines using
// Cloudflare Browser Rendering (Puppeteer binding).
//
// Endpoints:
//   POST /scrape  — Extract prices from a booking engine
//   GET  /health  — Health check
//
// Auth: Bearer token (shared secret with Pure Alpha backend)
// ============================================================================

import { scrapeProfitroomPrices, scrapeProfitroomFull, scrapeProfitroomOffers } from "./engines/profitroom";
import { scrapeGenericPrices } from "./engines/generic";
import type { ScrapeParams } from "./engines/types";

interface Env {
  BROWSER: Fetcher; // CF Browser Rendering binding
  AUTH_TOKEN: string; // Secret: shared token with Pure Alpha
}

// Supported booking engines
const SUPPORTED_ENGINES = ["PROFITROOM", "GENERIC"] as const;
type EngineType = (typeof SUPPORTED_ENGINES)[number];

function isValidEngine(engine: string): engine is EngineType {
  return (SUPPORTED_ENGINES as readonly string[]).includes(engine);
}

// ── P0-2 FIX: Timing-safe auth comparison ────────────────────────────────
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  return crypto.subtle.timingSafeEqual(bufA, bufB);
}

// ── P0-1 FIX: SSRF protection — block internal/private URLs ──────────────
function isBlockedUrl(urlStr: string): string | null {
  try {
    const url = new URL(urlStr);
    const hostname = url.hostname.toLowerCase();

    // Block private/internal networks
    const blockedPatterns = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^192\.168\./,
      /^169\.254\./, // AWS metadata
      /^0\./,
      /^\[/, // IPv6 brackets
      /^::/, // IPv6 loopback
      /^fc00:/i, // IPv6 private
      /^fe80:/i, // IPv6 link-local
      /\.internal$/i,
      /\.local$/i,
      /\.localhost$/i,
    ];

    for (const pattern of blockedPatterns) {
      if (pattern.test(hostname)) {
        return `Blocked hostname: ${hostname}`;
      }
    }

    // Only allow http/https
    if (!["http:", "https:"].includes(url.protocol)) {
      return `Blocked protocol: ${url.protocol}`;
    }

    return null; // URL is safe
  } catch {
    return "Invalid URL format";
  }
}

function validateScrapeRequest(
  body: Record<string, unknown>,
): { params: ScrapeParams & { engine: EngineType }; error?: never } | { params?: never; error: string } {
  const { hotelUrl, checkIn, checkOut, engine, adults, profitroomSiteKey, mode, calendarDays } = body;

  if (!hotelUrl || typeof hotelUrl !== "string") {
    return { error: "hotelUrl is required" };
  }

  if (!checkIn || typeof checkIn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) {
    return { error: "checkIn must be in YYYY-MM-DD format" };
  }

  if (!checkOut || typeof checkOut !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
    return { error: "checkOut must be in YYYY-MM-DD format" };
  }

  if (checkOut <= checkIn) {
    return { error: "checkOut must be after checkIn" };
  }

  // P2-4 FIX: Validate stay duration (max 30 nights)
  const ci = new Date(checkIn);
  const co = new Date(checkOut);
  const nights = Math.round((co.getTime() - ci.getTime()) / (1000 * 60 * 60 * 24));
  if (nights < 1 || nights > 30) {
    return { error: "Stay must be between 1 and 30 nights" };
  }

  const resolvedEngine = (engine as string) || "PROFITROOM";
  if (!isValidEngine(resolvedEngine)) {
    return { error: `Unsupported engine: ${resolvedEngine}. Supported: ${SUPPORTED_ENGINES.join(", ")}` };
  }

  // P0-1 FIX: SSRF validation
  const ssrfError = isBlockedUrl(hotelUrl as string);
  if (ssrfError) {
    return { error: `URL blocked: ${ssrfError}` };
  }

  return {
    params: {
      hotelUrl: hotelUrl as string,
      checkIn: checkIn as string,
      checkOut: checkOut as string,
      engine: resolvedEngine,
      adults: typeof adults === "number" && adults > 0 ? adults : 2,
      nights,
      profitroomSiteKey: typeof profitroomSiteKey === "string" && /^[a-zA-Z0-9._-]+$/.test(profitroomSiteKey)
        ? profitroomSiteKey
        : undefined,
      mode: mode === "full" ? "full" : mode === "offers" ? "offers" : "prices",
      calendarDays: typeof calendarDays === "number" && calendarDays > 0 && calendarDays <= 365
        ? calendarDays
        : undefined,
    },
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ── Health check (no auth required) ──────────────────────────────────
    if (url.pathname === "/health" && request.method === "GET") {
      return Response.json({
        status: "ok",
        service: "pure-alpha-price-scraper",
        version: "1.0.0",
        engines: SUPPORTED_ENGINES,
        timestamp: new Date().toISOString(),
      });
    }

    // ── Auth check (P0-2: timing-safe comparison) ────────────────────────
    if (!env.AUTH_TOKEN) {
      return Response.json(
        { success: false, error: "Service misconfigured" },
        { status: 500 },
      );
    }
    const authHeader = request.headers.get("Authorization") || "";
    const expected = `Bearer ${env.AUTH_TOKEN}`;
    if (!timingSafeEqual(authHeader, expected)) {
      return Response.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    // ── P2-3 FIX: Body size limit ───────────────────────────────────────
    const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
    if (contentLength > 10_000) {
      return Response.json(
        { success: false, error: "Request body too large" },
        { status: 413 },
      );
    }

    // ── POST /scrape ─────────────────────────────────────────────────────
    if (url.pathname === "/scrape" && request.method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return Response.json(
          { success: false, error: "Invalid JSON body" },
          { status: 400 },
        );
      }

      const validation = validateScrapeRequest(body);
      if (validation.error) {
        return Response.json(
          { success: false, error: validation.error },
          { status: 400 },
        );
      }

      const params = validation.params!;

      // Route to engine strategy
      switch (params.engine) {
        case "PROFITROOM": {
          // Profitroom engine uses direct REST API — no browser needed
          const scrapeFn = params.mode === "full"
            ? scrapeProfitroomFull
            : params.mode === "offers"
              ? scrapeProfitroomOffers
              : scrapeProfitroomPrices;
          const result = await scrapeFn(env.BROWSER, params);
          return Response.json(result);
        }
        case "GENERIC": {
          const result = await scrapeGenericPrices(env.BROWSER, params);

          // Re-dispatch: GENERIC detected Profitroom → use direct API
          // P1-1 FIX: honor original mode param (was always prices-only)
          if (!result.success && result.detectedEngine === "PROFITROOM" && result.profitroomSiteKey) {
            const reDispatchFn = params.mode === "full"
              ? scrapeProfitroomFull
              : scrapeProfitroomPrices;
            const profitroomResult = await reDispatchFn(env.BROWSER, {
              ...params,
              profitroomSiteKey: result.profitroomSiteKey,
            });
            return Response.json({
              ...profitroomResult,
              hotelMeta: profitroomResult.hotelMeta || result.hotelMeta,
              profitroomSiteKey: result.profitroomSiteKey,
            });
          }

          return Response.json(result);
        }
        default:
          return Response.json(
            { success: false, error: `Engine ${params.engine} not implemented` },
            { status: 400 },
          );
      }
    }

    // ── 404 for everything else ──────────────────────────────────────────
    return Response.json(
      { success: false, error: "Not found. Available: POST /scrape, GET /health" },
      { status: 404 },
    );
  },
};
