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
  MealPlanPrice,
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
    featured?: { fileName?: string };
    images?: Array<{ fileName?: string }>;
  };
  translations?: Array<{
    locale: string;
    messages: Array<{ fieldName: string; value: string }>;
  }>;
  attributes?: {
    area?: { from?: number; to?: number; unit?: string } | null;
    maxOccupancy?: { people?: number; extraBeds?: number | null } | null;
    bedsConfiguration?: {
      total?: number | null;
      singleBeds?: number | null;
      doubleBeds?: number | null;
      foldingBeds?: number | null;
      splitBeds?: number | null;
    } | null;
    facilities?: Record<string, number> | null;
  };
}

// ── Constants ─────────────────────────────────────────────────────────────

const API_BASE = "https://booking.profitroom.com/api";
// 15s per API call (some hotels like dunebeachresort are slow — 10s was too tight)
const API_TIMEOUT_MS = 15_000;
const MIN_PRICE_PLN = 50;
const MIN_PRICE_EUR = 10;
const SITE_KEY_RE = /^[a-zA-Z0-9._-]+$/;
const IMG_CDN = "https://r.profitroom.com";

function offerImageUrl(siteKey: string, fileName: string): string {
  return `${IMG_CDN}/${siteKey}/images/offers/thumbs/800x0/${fileName}`;
}

function roomImageUrl(siteKey: string, fileName: string): string {
  return `${IMG_CDN}/${siteKey}/images/rooms/thumbs/1200x0/${fileName}`;
}

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
  discountType?: string;
  discountName?: string;
  discountAmount?: number;
  roomCount?: number;
} | null {
  let minPrice = Infinity;
  let currency = "PLN";
  let offerId: number | undefined;
  let roomId: number | undefined;
  let originalPrice: number | undefined;
  let recentLowestPrice: number | undefined;
  let discountType: string | undefined;
  let discountName: string | undefined;
  let discountAmount: number | undefined;
  // Track the first currency seen — only compare within the same currency.
  // Mixed-currency proposals (rare) are filtered to the majority currency.
  const currencyCounts = new Map<string, number>();
  for (const g of groups) {
    for (const p of g.proposals) {
      const cur = p.proposal.price.currency;
      currencyCounts.set(cur, (currencyCounts.get(cur) || 0) + 1);
    }
  }
  // Use the most common currency (or first)
  let primaryCurrency = "PLN";
  let maxCount = 0;
  for (const [cur, count] of currencyCounts) {
    if (count > maxCount) { primaryCurrency = cur; maxCount = count; }
  }

  // Count total available rooms across ALL proposals (real availability indicator)
  let totalRoomCount = 0;

  for (const g of groups) {
    for (const p of g.proposals) {
      const { proposal } = p;
      // Only compare proposals in the same (primary) currency
      if (proposal.price.currency !== primaryCurrency) continue;
      const minAllowed = proposal.price.currency === "PLN" ? MIN_PRICE_PLN : MIN_PRICE_EUR;

      totalRoomCount += p.roomCount ?? 1;

      if (proposal.price.amount >= minAllowed && proposal.price.amount < minPrice) {
        minPrice = proposal.price.amount;
        currency = proposal.price.currency;
        offerId = proposal.OfferID;
        roomId = proposal.RoomID;
        originalPrice = proposal.originalPrice?.amount ?? undefined;
        recentLowestPrice = proposal.recentLowestPrice?.amount ?? undefined;
        // Extract first discount detail
        const d = proposal.discounts?.[0] as Record<string, unknown> | undefined;
        if (d) {
          discountType = typeof d.type === "string" ? d.type : undefined;
          discountName = typeof d.name === "string" ? d.name : undefined;
          discountAmount = typeof d.amount === "number" ? d.amount : undefined;
        } else {
          discountType = undefined;
          discountName = undefined;
          discountAmount = undefined;
        }
      }
    }
  }
  return minPrice < Infinity
    ? { minPrice, currency, offerId, roomId, originalPrice, recentLowestPrice, discountType, discountName, discountAmount, roomCount: totalRoomCount || undefined }
    : null;
}

// ── Rate limiting ─────────────────────────────────────────────────────────
// Minimum 200ms between Profitroom API calls to avoid IP bans.
// P1-8 FIX: per-siteKey throttle (module-level var was shared across concurrent isolate requests)
const API_MIN_INTERVAL_MS = 200;
const throttleMap = new Map<string, number>();

async function throttle(siteKey: string): Promise<void> {
  const now = Date.now();
  const lastCall = throttleMap.get(siteKey) ?? 0;
  const elapsed = now - lastCall;
  if (elapsed < API_MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, API_MIN_INTERVAL_MS - elapsed));
  }
  throttleMap.set(siteKey, Date.now());
}

// ── API helpers ───────────────────────────────────────────────────────────

async function fetchProfitroomApi<T>(
  siteKey: string,
  endpoint: string,
  params?: Record<string, string>,
  skipThrottle = false,
  timeoutMs = API_TIMEOUT_MS,
): Promise<T> {
  if (!skipThrottle) await throttle(siteKey);

  const url = new URL(`${API_BASE}/${siteKey}/${endpoint}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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

/**
 * Discover related siteKeys via Profitroom /api/{siteKey}/related-sites endpoint.
 * Hotel groups (e.g. "saltic") have multiple siteKeys under one umbrella.
 * The booking widget calls this endpoint to fetch rooms/offers from ALL related sites.
 * When the detected siteKey returns no valid prices, one of its related sites likely has them.
 */
export async function discoverRelatedSiteKeys(
  siteKey: string,
): Promise<string[]> {
  try {
    const raw = await fetchProfitroomApi<Array<{ key: string; siteKey?: string }>>(
      siteKey, "related-sites", undefined, true, 5000,
    );
    if (!Array.isArray(raw)) return [];
    const related = raw
      .map((r) => r.key || r.siteKey)
      .filter((k): k is string => typeof k === "string" && k !== siteKey && SITE_KEY_RE.test(k));
    if (related.length > 0) {
      console.log(`[Profitroom] related-sites for ${siteKey}: ${related.join(", ")}`);
    }
    return related;
  } catch {
    return [];
  }
}

// ── Room details resolution ───────────────────────────────────────────────

// Rooms = cosmetic (names/details only, not prices). Short timeout so it doesn't
// steal time budget from calendar fallback. 3s vs 15s default.
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
      false, // use throttle
      3_000, // 3s timeout (cosmetic data, not worth 15s)
    );
    for (const room of rooms) {
      // Resolve name: gallery.title → Polish translation → fallback
      let name = room.gallery?.title?.replace(/^Gallery for:\s*/i, "") || "";
      let description: string | undefined;
      let bedsDescription: string | undefined;

      if (room.translations) {
        const plTrans = room.translations.find((t) => t.locale === "pl");
        if (plTrans) {
          if (!name) {
            const nameMsg = plTrans.messages?.find((m) => m.fieldName === "name");
            name = nameMsg?.value || "";
          }
          const descMsg = plTrans.messages?.find((m) => m.fieldName === "description");
          description = descMsg?.value || undefined;
          const bedsMsg = plTrans.messages?.find((m) => m.fieldName === "bedsDescription");
          bedsDescription = bedsMsg?.value || undefined;
        }
      }
      if (!name) name = `Pokój #${room.id}`;

      // area: { from: 28, to: 30, unit: "m²" } → "28-30 m²" or "28 m²"
      const areaObj = room.attributes?.area;
      let area: string | undefined;
      if (areaObj?.from) {
        area = areaObj.from === areaObj.to
          ? `${areaObj.from} ${areaObj.unit || "m²"}`
          : `${areaObj.from}-${areaObj.to} ${areaObj.unit || "m²"}`;
      }

      // maxOccupancy: { people: 2, extraBeds: 2 } → 4
      const maxOcc = room.attributes?.maxOccupancy;
      const maxOccupancy = maxOcc?.people
        ? (maxOcc.people + (maxOcc.extraBeds ?? 0))
        : undefined;

      // facilities: { wifi: 1, airConditioning: 1, balcony: 0 } → ["wifi", "airConditioning"]
      const rawFacilities = room.attributes?.facilities;
      const facilities = rawFacilities
        ? Object.entries(rawFacilities).filter(([, v]) => v === 1).map(([k]) => k)
        : undefined;

      // Image: fileName → full URL via Profitroom CDN (correct path: /{siteKey}/images/rooms/thumbs/{WxH}/{fileName})
      const imgFile = room.gallery?.featured?.fileName || room.gallery?.images?.[0]?.fileName;
      const imageUrl = imgFile ? roomImageUrl(siteKey, imgFile) : undefined;

      // Full image gallery (up to 6 images)
      const images: string[] = [];
      if (room.gallery?.featured?.fileName) {
        images.push(roomImageUrl(siteKey, room.gallery.featured.fileName));
      }
      if (room.gallery?.images) {
        for (const img of room.gallery.images) {
          if (img.fileName && images.length < 6) {
            const url = roomImageUrl(siteKey, img.fileName);
            if (!images.includes(url)) images.push(url);
          }
        }
      }

      // Structured beds configuration
      const bedsConfiguration = room.attributes?.bedsConfiguration ?? undefined;

      nameMap.set(room.id, name);
      details.push({
        roomId: room.id,
        name,
        description,
        bedsDescription,
        area,
        maxOccupancy,
        facilities,
        imageUrl,
        images: images.length > 0 ? images : undefined,
        bedsConfiguration: bedsConfiguration ?? undefined,
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
  gallery?: {
    title?: string;
    featured?: { fileName?: string };
    images?: Array<{ fileName?: string }>;
  };
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

      // Extract offer cover image from gallery (correct path: /{siteKey}/images/offers/thumbs/{WxH}/{fileName})
      const offerImgFile = offer.gallery?.featured?.fileName || offer.gallery?.images?.[0]?.fileName;
      const imageUrl = offerImgFile ? offerImageUrl(siteKey, offerImgFile) : undefined;

      return {
        offerId: offer.id,
        name,
        description,
        mealPlanType,
        validFrom,
        validTo,
        minNights,
        imageUrl,
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
    let description: string | undefined;
    if (raw.translations) {
      const plTrans = raw.translations.find((t) => t.locale === "pl");
      const nameMsg = plTrans?.messages?.find((m) => m.fieldName === "name");
      name = nameMsg?.value || undefined;
      const descMsg = plTrans?.messages?.find((m) => m.fieldName === "description");
      description = descMsg?.value || undefined;
    }

    // Extract hotel policies from config
    const cfg = raw.config;
    const policies = cfg ? {
      animalsAllowed: cfg["Hotel.Animals"] === "1" ? true : cfg["Hotel.Animals"] === "0" ? false : undefined,
      childrenFreeAge: cfg["Children.FreeAge"] ? parseInt(cfg["Children.FreeAge"], 10) : undefined,
      maxAdvanceDays: cfg["Booking.MaxDaysAdvance"] ? parseInt(cfg["Booking.MaxDaysAdvance"], 10) : undefined,
    } : undefined;

    return {
      checkIn,
      checkOut,
      name,
      description,
      city: raw.address?.city ?? undefined,
      lat: raw.address?.coordinates?.lat ?? undefined,
      lng: raw.address?.coordinates?.lng ?? undefined,
      policies: policies && Object.values(policies).some((v) => v !== undefined) ? policies : undefined,
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
      // Add base currency with rate 1.0 (convention: base currency = 1)
      if (!map[entry.from]) {
        map[entry.from] = 1;
      }
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
    // rooms is OPTIONAL (some hotels like dunebeachresort don't have /rooms endpoint)
    // Use allSettled so rooms timeout doesn't block availability
    const availabilityParams: Record<string, string> = {
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      "occupancy[0][adults]": String(params.adults),
      lang: "pl",
    };

    const [availResult, roomResult] = await Promise.allSettled([
      fetchProfitroomApi<ProfitroomAvailabilityGroup[]>(
        siteKey,
        "availability",
        availabilityParams,
      ),
      fetchRoomDetails(siteKey),
    ]);
    const availability = availResult.status === "fulfilled" ? availResult.value : null;
    const roomData = roomResult.status === "fulfilled"
      ? roomResult.value
      : { nameMap: new Map<number, string>(), details: [] as ProfitroomRoomDetail[] };
    const roomNames = roomData.nameMap;

    if (!availability || availability.length === 0) {
      // Try related siteKeys (hotel groups like "saltic" → ["salticclubresort", "salticresortspaleba"])
      const related = await discoverRelatedSiteKeys(siteKey);
      for (const relKey of related) {
        try {
          const retryResult = await fetchProfitroomApi<ProfitroomAvailabilityGroup[]>(
            relKey, "availability", availabilityParams,
          );
          if (retryResult && retryResult.length > 0) {
            console.log(`[Profitroom] resolved ${siteKey} → ${relKey} via related-sites`);
            return scrapeProfitroomPrices(_browserBinding, {
              ...params,
              profitroomSiteKey: relKey,
            });
          }
        } catch { /* try next */ }
      }

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
      // Try related siteKeys — "saltic" has test prices, "salticresortspaleba" has real ones
      const related = await discoverRelatedSiteKeys(siteKey);
      for (const relKey of related) {
        try {
          const retryResult = await scrapeProfitroomPrices(_browserBinding, {
            ...params,
            profitroomSiteKey: relKey,
          });
          if (retryResult.success) {
            console.log(`[Profitroom] resolved ${siteKey} → ${relKey} via related-sites (no valid prices)`);
            return retryResult;
          }
        } catch { /* try next */ }
      }

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
      profitroomSiteKey: siteKey, // canonical siteKey (may differ from input after redirect resolution)
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

// ============================================================================
// OFFERS-ONLY MODE — lightweight fetch (1 API call instead of 8)
// Used by SEO Blog AI for topic recommendations
// ============================================================================

export async function scrapeProfitroomOffers(
  _browserBinding: Fetcher,
  params: ScrapeParams,
): Promise<ScrapeResult> {
  const start = Date.now();

  const siteKey = params.profitroomSiteKey;
  if (!siteKey || !SITE_KEY_RE.test(siteKey)) {
    return {
      success: false,
      error: "Valid Profitroom siteKey is required (alphanumeric)",
      durationMs: Date.now() - start,
      engine: "PROFITROOM",
    };
  }

  const offers = await fetchOffers(siteKey);

  return {
    success: true,
    offers: offers ?? [],
    durationMs: Date.now() - start,
    engine: "PROFITROOM",
  };
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
    const calendarPricesSupported = calendarPrices !== null;
    const unavailableDays = settled[3].status === "fulfilled" ? settled[3].value : null;

    // NOTE: Calendar fallback (per-day availability for hotels without calendar/prices)
    // has been MOVED to dedicated scrapeProfitroomCalendarFallback (Tier 3).
    // Full mode no longer does fallback — keeps it fast for ALL hotels.
    // Tier 3 is called separately by Next.js when calendarPricesSupported === false.
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

    // ── Cross-reference bestseller IDs + minPrice from availability ───
    const bestsellerSet = bestsellerIds ? new Set(bestsellerIds) : null;

    // Build per-offer cheapest price: availability proposals + calendar prices fallback
    const offerMinPrice = new Map<number, { price: number; currency: string }>();
    // Source 1: today's availability proposals (most accurate for current dates)
    if (availability) {
      for (const group of availability) {
        for (const { proposal } of group.proposals) {
          const existing = offerMinPrice.get(proposal.OfferID);
          const perNight = params.nights > 0
            ? Math.round((proposal.price.amount / params.nights) * 100) / 100
            : proposal.price.amount;
          if (!existing || perNight < existing.price) {
            offerMinPrice.set(proposal.OfferID, {
              price: perNight,
              currency: proposal.price.currency,
            });
          }
        }
      }
    }
    // Source 2: calendar prices (90d) — fill gaps only for offers without availability data
    if (calendarPrices) {
      for (const cp of calendarPrices) {
        if (cp.offerId != null && !offerMinPrice.has(cp.offerId)) {
          offerMinPrice.set(cp.offerId, {
            price: cp.minPrice,
            currency: cp.currency,
          });
        }
      }
    }

    const enrichedOffers = offers
      ? offers.map((offer) => {
          const priceData = offerMinPrice.get(offer.offerId);
          return {
            ...offer,
            isBestseller: bestsellerSet?.has(offer.offerId) ?? false,
            minPrice: priceData?.price ?? offer.minPrice,
            currency: priceData?.currency ?? offer.currency,
          };
        })
      : undefined;

    // ── Meal plan pricing: cheapest per-night price per mealPlanType ──
    // Cross-reference: offers (mealPlanType) × availability proposals (prices)
    // mealPlanType: 18=room-only (bez wyżywienia), 19=B&B (ze śniadaniem), 20=HB (półpensja)
    let pricesByMealPlan: Record<string, MealPlanPrice> | undefined;
    if (offers && availability && availability.length > 0) {
      const offerMealPlan = new Map<number, { mealPlanType: number; name: string }>();
      for (const o of offers) {
        if (o.mealPlanType != null) {
          offerMealPlan.set(o.offerId, { mealPlanType: o.mealPlanType, name: o.name });
        }
      }

      const mealPlanBest = new Map<number, MealPlanPrice>();
      for (const group of availability) {
        for (const { proposal } of group.proposals) {
          const offerInfo = offerMealPlan.get(proposal.OfferID);
          if (!offerInfo) continue;

          const minAllowed = proposal.price.currency === "PLN" ? MIN_PRICE_PLN : MIN_PRICE_EUR;
          if (proposal.price.amount < minAllowed) continue;

          const perNight = params.nights > 0
            ? Math.round((proposal.price.amount / params.nights) * 100) / 100
            : proposal.price.amount;

          const existing = mealPlanBest.get(offerInfo.mealPlanType);
          if (!existing || perNight < existing.price) {
            mealPlanBest.set(offerInfo.mealPlanType, {
              price: perNight,
              currency: proposal.price.currency,
              roomName: roomNames.get(proposal.RoomID) || undefined,
              offerName: offerInfo.name,
              offerId: proposal.OfferID,
            });
          }
        }
      }

      if (mealPlanBest.size > 0) {
        pricesByMealPlan = {};
        for (const [mealType, data] of mealPlanBest) {
          pricesByMealPlan[String(mealType)] = data;
        }
      }
    }

    // ── Build comprehensive result ────────────────────────────────────
    return {
      // Success if ANY data was fetched (not just rooms — calendar/offers/details count too)
      success: rooms.length > 0 || !!calendarPrices || !!offers || !!hotelDetails || !!unavailableDays,
      rooms: rooms.length > 0 ? rooms : undefined,
      durationMs: Date.now() - start,
      engine: "PROFITROOM",
      calendarPrices: calendarPrices ?? undefined,
      calendarPricesSupported,
      unavailableDays: unavailableDays ?? undefined,
      offers: enrichedOffers,
      hotelDetails: hotelDetails ?? undefined,
      exchangeRates: exchangeRates ?? undefined,
      roomDetails: roomDetails.length > 0 ? roomDetails : undefined,
      pricesByMealPlan,
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

// ── TIER 3: Dedicated calendar fallback — full 30s budget ──────────────
// For hotels WITHOUT calendar/prices endpoint (404). Fetches per-day
// availability with the ENTIRE CF Worker time budget (no competing calls).
// Called separately AFTER Tier 1+2 when calendarPricesSupported === false.

export async function scrapeProfitroomCalendarFallback(
  _browserBinding: Fetcher,
  params: ScrapeParams,
): Promise<ScrapeResult> {
  const start = Date.now();
  const siteKey = params.profitroomSiteKey;
  if (!siteKey) {
    return { success: false, error: "siteKey required", durationMs: 0, engine: "PROFITROOM" };
  }

  try {
    const TIME_BUDGET_MS = 27_000; // 27s of 30s CF Worker limit
    // P1-4 FIX: reduced from 5→3 concurrent (throttled at 200ms each, less burst pressure)
    const BATCH_SIZE = 3;
    const BATCH_DELAY = 300;
    const daysToFetch = params.calendarDays ?? 60;
    // Use checkIn from params as start date (supports offset for multi-call loop)
    const startDate = new Date(params.checkIn);

    // Fetch unavailable days first — skip them in fallback
    const calendarFrom = formatDate(startDate);
    const calendarTo = formatDate(new Date(startDate.getTime() + daysToFetch * 86_400_000));
    let unavailableSet = new Set<string>();
    try {
      const unavailable = await fetchUnavailableDays(siteKey, calendarFrom, calendarTo);
      if (unavailable) unavailableSet = new Set(unavailable);
    } catch { /* non-critical */ }

    // Start with 1-night stay for accurate pricing (multi-night stays have lower per-night rates).
    // If entire batch returns 0 results, escalate to 2+ nights (min-stay restriction).
    const availableDays = Array.from({ length: daysToFetch }, (_, i) => {
      const ci = new Date(startDate);
      ci.setUTCDate(ci.getUTCDate() + i);
      return formatDate(ci);
    }).filter(d => !unavailableSet.has(d));

    // Hotels have variable min-stay: off-season 1n, shoulder 2n, summer 3n, peak 5n
    // Start with 1-night to get accurate per-night price (2+ night stays have lower per-night rates)
    const STAY_LADDER = [1, 2, 3, 4, 5];
    let stayIdx = 0;
    let stayNights = STAY_LADDER[0];
    const calendarPrices: CalendarPrice[] = [];
    let consecutiveEmptyBatches = 0;

    for (let b = 0; b < availableDays.length; b += BATCH_SIZE) {
      if (Date.now() - start > TIME_BUDGET_MS) {
        console.log(`[PriceScraper] calendar-fallback time budget hit after ${calendarPrices.length} days for ${siteKey}`);
        break;
      }
      if (b > 0) await new Promise((r) => setTimeout(r, BATCH_DELAY));

      const batchDays = availableDays.slice(b, b + BATCH_SIZE);
      const results = await Promise.allSettled(
        batchDays.map((checkIn) => {
          const co = new Date(checkIn);
          co.setUTCDate(co.getUTCDate() + stayNights);
          return fetchProfitroomApi<ProfitroomAvailabilityGroup[]>(
            siteKey, "availability",
            { checkIn, checkOut: formatDate(co), "occupancy[0][adults]": "2", lang: "pl" },
            // P1-4 FIX: respect throttle (was skipThrottle=true → 5 concurrent unthrottled = IP ban risk)
          ).then((groups) => {
            if (!groups?.length) return null;
            const cheapest = cheapestFromGroups(groups);
            if (!cheapest) return null;
            // Normalize to per-night: Profitroom returns TOTAL STAY price
            const perNight = Math.round((cheapest.minPrice / stayNights) * 100) / 100;
            const origPerNight = cheapest.originalPrice
              ? Math.round((cheapest.originalPrice / stayNights) * 100) / 100
              : undefined;
            const recentPerNight = cheapest.recentLowestPrice
              ? Math.round((cheapest.recentLowestPrice / stayNights) * 100) / 100
              : undefined;
            return {
              date: checkIn,
              ...cheapest,
              minPrice: perNight,
              originalPrice: origPerNight,
              recentLowestPrice: recentPerNight,
            };
          });
        }),
      );

      let batchHits = 0;
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) {
          calendarPrices.push(r.value);
          batchHits++;
        }
      }

      // If batch returned 0 results, escalate stay length immediately
      // (don't wait for 2 consecutive — that loses 5 days of data)
      if (batchHits === 0 && stayIdx < STAY_LADDER.length - 1) {
        stayIdx++;
        stayNights = STAY_LADDER[stayIdx];
        b -= BATCH_SIZE; // retry this batch with longer stay
        console.log(`[PriceScraper] calendar-fallback escalating to ${stayNights}-night for ${siteKey}`);
      }
    }

    console.log(`[PriceScraper] calendar-fallback: ${calendarPrices.length}/${availableDays.length} days for ${siteKey} in ${Date.now() - start}ms`);

    return {
      success: calendarPrices.length > 0,
      durationMs: Date.now() - start,
      engine: "PROFITROOM",
      calendarPrices: calendarPrices.length > 0 ? calendarPrices : undefined,
      calendarPricesSupported: false,
      unavailableDays: unavailableSet.size > 0 ? [...unavailableSet] : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - start,
      engine: "PROFITROOM",
    };
  }
}
