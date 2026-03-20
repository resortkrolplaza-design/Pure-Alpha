// ============================================================================
// PROFITROOM ENGINE - Direct API price extraction (NO BROWSER NEEDED)
// ============================================================================
// Profitroom exposes a public REST API at booking.profitroom.com/api/{siteKey}/
// that returns real-time room availability and prices as JSON.
//
// Endpoints used (prices mode):
//   GET /api/{siteKey}/availability?checkIn=...&checkOut=...&occupancy[0][adults]=N&lang=pl
//   GET /api/{siteKey}/rooms?lang=pl
//
// Additional endpoints (full mode):
//   GET /api/{siteKey}/calendar/prices?from=...&to=...&occupancy[0][adults]=2
//   GET /api/{siteKey}/unavailable-days?from=...&to=...&occupancy[0][adults]=2
//   GET /api/{siteKey}/offers?status=1&lang=pl
//   GET /api/{siteKey}/stats/bestseller-offers
//   GET /api/{siteKey}/details?lang=pl
//   GET /api/{siteKey}/exchange-rates
//
// No authentication required. No browser rendering needed.
// This replaces the previous iframe-based approach that couldn't work due to
// cross-origin restrictions in CF Workers' managed browser.
// ============================================================================

import type {
  ScrapeParams,
  RoomResult,
  ScrapeResult,
  CalendarPrice,
  ProfitroomOffer,
  ProfitroomHotelDetails,
  ProfitroomRoomDetail,
} from "./types";

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
    images?: Array<{ url?: string }>;
  };
  translations?: Array<{
    locale: string;
    messages: Array<{ fieldName: string; value: string }>;
  }>;
  attributes?: {
    area?: number;
    maxOccupancy?: number;
    bedsConfiguration?: Record<string, unknown>;
    facilities?: number[];
  };
}

// ── Constants ─────────────────────────────────────────────────────────────

const API_BASE = "https://booking.profitroom.com/api";
const API_TIMEOUT_MS = 10_000;
const MIN_PRICE_PLN = 50;
const MIN_PRICE_EUR = 10;
const SITE_KEY_RE = /^[a-zA-Z0-9]+$/;

// ── Shared: extract cheapest price from availability groups (SSOT) ────────

function cheapestFromGroups(
  groups: ProfitroomAvailabilityGroup[],
): {
  minPrice: number;
  currency: string;
  offerId?: number;
  roomId?: number;
  originalPrice?: number;
  recentLowestPrice?: number;
} | null {
  let minPrice = Infinity;
  let currency = "PLN";
  let offerId: number | undefined;
  let roomId: number | undefined;
  let originalPrice: number | undefined;
  let recentLowestPrice: number | undefined;
  for (const g of groups) {
    for (const { proposal } of g.proposals) {
      const minAllowed = proposal.price.currency === "PLN" ? MIN_PRICE_PLN : MIN_PRICE_EUR;
      if (proposal.price.amount >= minAllowed && proposal.price.amount < minPrice) {
        minPrice = proposal.price.amount;
        currency = proposal.price.currency;
        offerId = proposal.OfferID;
        roomId = proposal.RoomID;
        originalPrice = proposal.originalPrice?.amount ?? undefined;
        recentLowestPrice = proposal.recentLowestPrice?.amount ?? undefined;
      }
    }
  }
  return minPrice < Infinity
    ? { minPrice, currency, offerId, roomId, originalPrice, recentLowestPrice }
    : null;
}

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

// ── Room details resolution ───────────────────────────────────────────────

async function fetchRoomDetails(
  siteKey: string,
): Promise<{ nameMap: Map<number, string>; details: ProfitroomRoomDetail[] }> {
  const nameMap = new Map<number, string>();
  const details: ProfitroomRoomDetail[] = [];
  try {
    const rooms = await fetchProfitroomApi<ProfitroomRoom[]>(
      siteKey,
      "rooms",
      { lang: "pl" },
    );
    for (const room of rooms) {
      // Resolve name: gallery.title → Polish translation → fallback
      let name = room.gallery?.title?.replace(/^Gallery for:\s*/i, "") || "";
      if (!name && room.translations) {
        const plTrans = room.translations.find((t) => t.locale === "pl");
        const nameMsg = plTrans?.messages?.find((m) => m.fieldName === "name");
        name = nameMsg?.value || "";
      }
      if (!name) name = `Pokój #${room.id}`;

      nameMap.set(room.id, name);
      details.push({
        roomId: room.id,
        name,
        area: room.attributes?.area ?? undefined,
        maxOccupancy: room.attributes?.maxOccupancy ?? undefined,
        beds: room.attributes?.bedsConfiguration ?? undefined,
        imageUrl: room.gallery?.images?.[0]?.url ?? undefined,
      });
    }
  } catch {
    // Room details are nice-to-have, not critical
  }
  return { nameMap, details };
}

// ── Calendar prices ──────────────────────────────────────────────────────

interface ProfitroomCalendarPrice {
  amount: number;
  currency: string;
  offerId: number;
  roomId: number;
  originalPrice?: { amount: number; currency: string } | null;
  recentLowestPrice?: { amount: number; currency: string } | null;
}

async function fetchCalendarPrices(
  siteKey: string,
  from: string,
  to: string,
): Promise<CalendarPrice[] | null> {
  try {
    const raw = await fetchProfitroomApi<Record<string, ProfitroomCalendarPrice>>(
      siteKey,
      "calendar/prices",
      { from, to, "occupancy[0][adults]": "2" },
    );
    if (!raw || typeof raw !== "object") return null;

    return Object.entries(raw).map(([date, entry]) => ({
      date,
      minPrice: entry.amount,
      currency: entry.currency,
      offerId: entry.offerId ?? undefined,
      roomId: entry.roomId ?? undefined,
      originalPrice: entry.originalPrice?.amount ?? undefined,
      recentLowestPrice: entry.recentLowestPrice?.amount ?? undefined,
    }));
  } catch (err) {
    console.error("[PriceScraper] fetchCalendarPrices failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Unavailable days ────────────────────────────────────────────────────

async function fetchUnavailableDays(
  siteKey: string,
  from: string,
  to: string,
): Promise<string[] | null> {
  try {
    const raw = await fetchProfitroomApi<{ days: string[] }>(
      siteKey,
      "unavailable-days",
      { from, to, "occupancy[0][adults]": "2" },
    );
    return raw?.days ?? null;
  } catch (err) {
    console.error("[PriceScraper] fetchUnavailableDays failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Offers ──────────────────────────────────────────────────────────────

interface ProfitroomOfferTranslation {
  locale: string;
  messages: Array<{ fieldName: string; value: string }>;
}

interface ProfitroomOfferRaw {
  id: number;
  gallery?: { title?: string };
  translations?: ProfitroomOfferTranslation[];
  attributes?: {
    mealPlanType?: number;
    dateRange?: { from?: string; to?: string };
    minimumNights?: number;
  };
  restrictions?: {
    availableFrom?: string;
    availableTo?: string;
    minNights?: number;
  };
}

async function fetchOffers(siteKey: string): Promise<ProfitroomOffer[] | null> {
  try {
    const raw = await fetchProfitroomApi<ProfitroomOfferRaw[]>(
      siteKey,
      "offers",
      { status: "1", lang: "pl" },
    );
    if (!Array.isArray(raw)) return null;

    return raw.map((offer) => {
      // Resolve name: gallery.title (strip prefix) → translation → fallback
      let name = offer.gallery?.title?.replace(/^Gallery for:\s*/i, "") || "";
      let description: string | undefined;

      if (offer.translations) {
        const plTrans = offer.translations.find((t) => t.locale === "pl");
        if (plTrans) {
          if (!name) {
            const nameMsg = plTrans.messages?.find((m) => m.fieldName === "name");
            name = nameMsg?.value || "";
          }
          // Extract description + intro for full package content
          const introMsg = plTrans.messages?.find((m) => m.fieldName === "intro");
          const descMsg = plTrans.messages?.find((m) => m.fieldName === "description");
          description = [introMsg?.value, descMsg?.value].filter(Boolean).join("\n\n") || undefined;
        }
      }
      if (!name) name = `Oferta #${offer.id}`;

      const mealPlanType = offer.attributes?.mealPlanType ?? undefined;
      const validFrom =
        offer.restrictions?.availableFrom ||
        offer.attributes?.dateRange?.from ||
        undefined;
      const validTo =
        offer.restrictions?.availableTo ||
        offer.attributes?.dateRange?.to ||
        undefined;
      const minNights =
        offer.restrictions?.minNights ??
        offer.attributes?.minimumNights ??
        undefined;

      return {
        offerId: offer.id,
        name,
        description,
        mealPlanType,
        validFrom,
        validTo,
        minNights,
      };
    });
  } catch (err) {
    console.error("[PriceScraper] fetchOffers failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Bestseller offer IDs ────────────────────────────────────────────────

async function fetchBestsellerOfferIds(siteKey: string): Promise<number[] | null> {
  try {
    const raw = await fetchProfitroomApi<number[]>(
      siteKey,
      "stats/bestseller-offers",
    );
    return Array.isArray(raw) ? raw : null;
  } catch (err) {
    console.error("[PriceScraper] fetchBestsellerOfferIds failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Hotel details ───────────────────────────────────────────────────────

interface ProfitroomDetailsTranslation {
  locale: string;
  messages: Array<{ fieldName: string; value: string }>;
}

interface ProfitroomDetailsRaw {
  config?: Record<string, string>;
  translations?: ProfitroomDetailsTranslation[];
  address?: {
    city?: string;
    coordinates?: { lat?: number; lng?: number };
  };
}

async function fetchHotelDetails(siteKey: string): Promise<ProfitroomHotelDetails | null> {
  try {
    const raw = await fetchProfitroomApi<ProfitroomDetailsRaw>(
      siteKey,
      "details",
      { lang: "pl" },
    );
    if (!raw || typeof raw !== "object") return null;

    const checkIn = raw.config?.["Hotel.CheckinAfter"] ?? undefined;
    const checkOut = raw.config?.["Hotel.CheckoutBefore"] ?? undefined;

    let name: string | undefined;
    if (raw.translations) {
      const plTrans = raw.translations.find((t) => t.locale === "pl");
      const nameMsg = plTrans?.messages?.find((m) => m.fieldName === "name");
      name = nameMsg?.value || undefined;
    }

    return {
      checkIn,
      checkOut,
      name,
      city: raw.address?.city ?? undefined,
      lat: raw.address?.coordinates?.lat ?? undefined,
      lng: raw.address?.coordinates?.lng ?? undefined,
    };
  } catch (err) {
    console.error("[PriceScraper] fetchHotelDetails failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Exchange rates ──────────────────────────────────────────────────────

interface ProfitroomExchangeRate {
  from: string;
  to: string;
  rate: number;
}

async function fetchExchangeRates(siteKey: string): Promise<Record<string, number> | null> {
  try {
    const raw = await fetchProfitroomApi<ProfitroomExchangeRate[]>(
      siteKey,
      "exchange-rates",
    );
    if (!Array.isArray(raw)) return null;

    const map: Record<string, number> = {};
    for (const entry of raw) {
      map[entry.to] = entry.rate;
    }
    return map;
  } catch (err) {
    console.error("[PriceScraper] fetchExchangeRates failed:", err instanceof Error ? err.message : err);
    return null;
  }
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

    const [availability, roomData] = await Promise.all([
      fetchProfitroomApi<ProfitroomAvailabilityGroup[]>(
        siteKey,
        "availability",
        availabilityParams,
      ),
      fetchRoomDetails(siteKey),
    ]);
    const roomNames = roomData.nameMap;

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

// ── FULL: Scrape ALL Profitroom data via REST API ─────────────────────────

function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function scrapeProfitroomFull(
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

  // Calculate calendar date range
  const calendarDays = params.calendarDays ?? 90;
  const now = new Date();
  const calendarFrom = formatDate(now);
  const calendarTo = formatDate(new Date(now.getTime() + calendarDays * 86_400_000));

  try {
    // ── Fetch ALL 8 endpoints in parallel ─────────────────────────────
    const availabilityParams: Record<string, string> = {
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      "occupancy[0][adults]": String(params.adults),
      lang: "pl",
    };

    const settled = await Promise.allSettled([
      /* 0 */ fetchProfitroomApi<ProfitroomAvailabilityGroup[]>(siteKey, "availability", availabilityParams),
      /* 1 */ fetchRoomDetails(siteKey),
      /* 2 */ fetchCalendarPrices(siteKey, calendarFrom, calendarTo),
      /* 3 */ fetchUnavailableDays(siteKey, calendarFrom, calendarTo),
      /* 4 */ fetchOffers(siteKey),
      /* 5 */ fetchBestsellerOfferIds(siteKey),
      /* 6 */ fetchHotelDetails(siteKey),
      /* 7 */ fetchExchangeRates(siteKey),
    ]);

    // ── Unpack settled results ────────────────────────────────────────
    const availability = settled[0].status === "fulfilled" ? settled[0].value : null;
    const roomData = settled[1].status === "fulfilled"
      ? settled[1].value
      : { nameMap: new Map<number, string>(), details: [] as ProfitroomRoomDetail[] };
    const roomNames = roomData.nameMap;
    const roomDetails = roomData.details;
    let calendarPrices = settled[2].status === "fulfilled" ? settled[2].value : null;
    const unavailableDays = settled[3].status === "fulfilled" ? settled[3].value : null;

    // Fallback: if calendar/prices endpoint is missing (404 for some hotels),
    // build calendar prices from per-day availability API calls (SSOT: cheapestFromGroups)
    if (!calendarPrices && siteKey) {
      try {
        const daysToFetch = Math.min(calendarDays, 90);
        const startDate = new Date(); // Start from today (not tomorrow)

        const days = Array.from({ length: daysToFetch }, (_, i) => {
          const ci = new Date(startDate);
          ci.setUTCDate(ci.getUTCDate() + i);
          const co = new Date(ci);
          co.setUTCDate(co.getUTCDate() + 1);
          return { checkIn: formatDate(ci), checkOut: formatDate(co) };
        });

        const fallback: CalendarPrice[] = [];
        for (let b = 0; b < days.length; b += 5) {
          const results = await Promise.allSettled(
            days.slice(b, b + 5).map(({ checkIn, checkOut }) =>
              fetchProfitroomApi<ProfitroomAvailabilityGroup[]>(
                siteKey, "availability",
                { checkIn, checkOut, "occupancy[0][adults]": "2", lang: "pl" },
              ).then((groups) => {
                if (!groups?.length) return null;
                const cheapest = cheapestFromGroups(groups);
                return cheapest ? { date: checkIn, ...cheapest } : null;
              }),
            ),
          );
          for (const r of results) {
            if (r.status === "fulfilled" && r.value) fallback.push(r.value);
          }
        }

        if (fallback.length > 0) {
          calendarPrices = fallback;
          console.log(`[PriceScraper] calendar/prices fallback: ${fallback.length} days via availability for ${siteKey}`);
        }
      } catch (err) {
        console.error("[PriceScraper] calendar/prices fallback failed:", err instanceof Error ? err.message : err);
      }
    }
    const offers = settled[4].status === "fulfilled" ? settled[4].value : null;
    const bestsellerIds = settled[5].status === "fulfilled" ? settled[5].value : null;
    const hotelDetails = settled[6].status === "fulfilled" ? settled[6].value : null;
    const exchangeRates = settled[7].status === "fulfilled" ? settled[7].value : null;

    // Log partial failures (non-critical)
    for (let i = 0; i < settled.length; i++) {
      if (settled[i].status === "rejected") {
        const reason = (settled[i] as PromiseRejectedResult).reason;
        console.error(`[PriceScraper] Profitroom full endpoint #${i} failed:`, reason);
      }
    }

    // ── Parse availability into rooms (same logic as prices-only) ─────
    const rooms: RoomResult[] = [];
    if (availability && availability.length > 0) {
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

      rooms.sort((a, b) => a.price - b.price);
    }

    // ── Cross-reference bestseller IDs with offers ────────────────────
    const bestsellerSet = bestsellerIds ? new Set(bestsellerIds) : null;
    const enrichedOffers = offers
      ? offers.map((offer) => ({
          ...offer,
          isBestseller: bestsellerSet?.has(offer.offerId) ?? false,
        }))
      : undefined;

    // ── Build comprehensive result ────────────────────────────────────
    return {
      success: rooms.length > 0 || !!calendarPrices || !!offers,
      rooms: rooms.length > 0 ? rooms : undefined,
      durationMs: Date.now() - start,
      engine: "PROFITROOM",
      calendarPrices: calendarPrices ?? undefined,
      unavailableDays: unavailableDays ?? undefined,
      offers: enrichedOffers,
      hotelDetails: hotelDetails ?? undefined,
      exchangeRates: exchangeRates ?? undefined,
      roomDetails: roomDetails.length > 0 ? roomDetails : undefined,
    };
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Unknown error";
    const safeMessage = rawMessage.length > 150 ? rawMessage.substring(0, 150) : rawMessage;
    console.error("[PriceScraper] Profitroom full scrape failed:", rawMessage);

    return {
      success: false,
      error: safeMessage,
      durationMs: Date.now() - start,
      engine: "PROFITROOM",
    };
  }
}
