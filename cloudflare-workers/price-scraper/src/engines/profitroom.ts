// ============================================================================
// PROFITROOM ENGINE - Direct API price extraction (NO BROWSER NEEDED)
// ============================================================================
// Profitroom exposes a public REST API at booking.profitroom.com/api/{siteKey}/
// that returns real-time room availability and prices as JSON.
//
// Endpoints used:
//   GET /api/{siteKey}/availability?checkIn=...&checkOut=...&occupancy[0][adults]=N&lang=pl
//   GET /api/{siteKey}/rooms?lang=pl
//
// No authentication required. No browser rendering needed.
// This replaces the previous iframe-based approach that couldn't work due to
// cross-origin restrictions in CF Workers' managed browser.
// ============================================================================

import type { ScrapeParams, RoomResult, ScrapeResult } from "./types";

// ── Profitroom API types ──────────────────────────────────────────────────

interface ProfitroomPrice {
  amount: number;
  currency: string;
}

interface ProfitroomProposal {
  proposal: {
    OfferID: number;
    RoomID: number;
    price: ProfitroomPrice;
    originalPrice: ProfitroomPrice | null;
    recentLowestPrice: ProfitroomPrice | null;
    stay: { from: string; to: string };
    occupancy: { adults: number; children: number[] };
    discounts: unknown[];
  };
  roomCount: number;
}

interface ProfitroomAvailabilityGroup {
  occupancy: { adults: number; children: number[] };
  proposals: ProfitroomProposal[];
}

interface ProfitroomRoom {
  id: number;
  gallery?: {
    title?: string;
  };
}

// ── Constants ─────────────────────────────────────────────────────────────

const API_BASE = "https://booking.profitroom.com/api";
const API_TIMEOUT_MS = 10_000;
const MIN_PRICE_PLN = 50;
const MIN_PRICE_EUR = 10;
const SITE_KEY_RE = /^[a-zA-Z0-9]+$/;

// ── API helpers ───────────────────────────────────────────────────────────

async function fetchProfitroomApi<T>(
  siteKey: string,
  endpoint: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${API_BASE}/${siteKey}/${endpoint}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "PureAlpha-PriceScraper/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Profitroom API ${response.status}: ${response.statusText}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Room name resolution ──────────────────────────────────────────────────

async function fetchRoomNames(
  siteKey: string,
): Promise<Map<number, string>> {
  const roomMap = new Map<number, string>();
  try {
    const rooms = await fetchProfitroomApi<ProfitroomRoom[]>(
      siteKey,
      "rooms",
      { lang: "pl" },
    );
    for (const room of rooms) {
      const name = room.gallery?.title?.replace(/^Gallery for:\s*/i, "") || `Pokój #${room.id}`;
      roomMap.set(room.id, name);
    }
  } catch {
    // Room names are nice-to-have, not critical
  }
  return roomMap;
}

// ── MAIN: Scrape Profitroom prices via REST API ───────────────────────────

export async function scrapeProfitroomPrices(
  _browserBinding: Fetcher, // kept for interface compat — NOT USED
  params: ScrapeParams,
): Promise<ScrapeResult> {
  const start = Date.now();

  // Extract and validate siteKey
  const siteKey = params.profitroomSiteKey;
  if (!siteKey || !SITE_KEY_RE.test(siteKey)) {
    return {
      success: false,
      error: "Valid Profitroom siteKey is required (alphanumeric)",
      durationMs: Date.now() - start,
      engine: "PROFITROOM",
    };
  }

  try {
    // ── 1. Fetch availability + room names in parallel ────────────────
    const availabilityParams: Record<string, string> = {
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      "occupancy[0][adults]": String(params.adults),
      lang: "pl",
    };

    const [availability, roomNames] = await Promise.all([
      fetchProfitroomApi<ProfitroomAvailabilityGroup[]>(
        siteKey,
        "availability",
        availabilityParams,
      ),
      fetchRoomNames(siteKey),
    ]);

    if (!availability || availability.length === 0) {
      return {
        success: false,
        error: "No availability data returned from Profitroom API",
        durationMs: Date.now() - start,
        engine: "PROFITROOM",
      };
    }

    // ── 2. Parse proposals into RoomResult[] ──────────────────────────
    // Track cheapest price per room to avoid duplicates across offers
    const cheapestByRoom = new Map<number, {
      roomName: string;
      price: number;
      currency: string;
      originalPrice: number | null;
      offerID: number;
    }>();

    for (const group of availability) {
      for (const { proposal } of group.proposals) {
        const { RoomID, price, originalPrice, OfferID } = proposal;
        const amount = price.amount;
        const currency = price.currency;

        // Filter unreasonable prices
        const minPrice = currency === "PLN" ? MIN_PRICE_PLN : MIN_PRICE_EUR;
        if (amount < minPrice) continue;

        const existing = cheapestByRoom.get(RoomID);
        if (!existing || amount < existing.price) {
          cheapestByRoom.set(RoomID, {
            roomName: roomNames.get(RoomID) || `Pokój #${RoomID}`,
            price: amount,
            currency,
            originalPrice: originalPrice?.amount ?? null,
            offerID: OfferID,
          });
        }
      }
    }

    if (cheapestByRoom.size === 0) {
      return {
        success: false,
        error: "No valid room prices in availability response",
        durationMs: Date.now() - start,
        engine: "PROFITROOM",
      };
    }

    // ── 3. Build RoomResult[] ─────────────────────────────────────────
    // API prices are TOTAL STAY — normalize to per-night
    const rooms: RoomResult[] = [];
    for (const [, data] of cheapestByRoom) {
      const perNightPrice = params.nights > 0
        ? Math.round((data.price / params.nights) * 100) / 100
        : data.price;

      rooms.push({
        roomName: data.roomName,
        price: perNightPrice,
        currency: data.currency,
        occupancy: params.adults,
        originalPriceText: `${data.price} ${data.currency}`,
        isPerNight: true,
        nights: params.nights,
      });
    }

    // Sort by price ascending
    rooms.sort((a, b) => a.price - b.price);

    return {
      success: true,
      rooms,
      durationMs: Date.now() - start,
      engine: "PROFITROOM",
    };
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Unknown error";
    const safeMessage = rawMessage.length > 150 ? rawMessage.substring(0, 150) : rawMessage;
    console.error("[PriceScraper] Profitroom API failed:", rawMessage);

    return {
      success: false,
      error: safeMessage,
      durationMs: Date.now() - start,
      engine: "PROFITROOM",
    };
  }
}
