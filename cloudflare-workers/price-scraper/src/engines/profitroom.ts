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
const API_TIMEOUT_MS = 10_000;
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
  let roomCount: number | undefined;
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

  for (const g of groups) {
    for (const p of g.proposals) {
      const { proposal } = p;
      // Only compare proposals in the same (primary) currency
      if (proposal.price.currency !== primaryCurrency) continue;
      const minAllowed = proposal.price.currency === "PLN" ? MIN_PRICE_PLN : MIN_PRICE_EUR;
      if (proposal.price.amount >= minAllowed && proposal.price.amount < minPrice) {
        minPrice = proposal.price.amount;
        currency = proposal.price.currency;
        offerId = proposal.OfferID;
        roomId = proposal.RoomID;
        originalPrice = proposal.originalPrice?.amount ?? undefined;
        recentLowestPrice = proposal.recentLowestPrice?.amount ?? undefined;
        roomCount = p.roomCount ?? undefined;
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
    ? { minPrice, currency, offerId, roomId, originalPrice, recentLowestPrice, discountType, discountName, discountAmount, roomCount }
    : null;
}

// ── Rate limiting ─────────────────────────────────────────────────────────
// Minimum 200ms between Profitroom API calls to avoid IP bans.
const API_MIN_INTERVAL_MS = 200;
let lastApiCallAt = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastApiCallAt;
  if (elapsed < API_MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, API_MIN_INTERVAL_MS - elapsed));
  }
  lastApiCallAt = Date.now();
}

// ── API helpers ───────────────────────────────────────────────────────────

async function fetchProfitroomApi<T>(
  siteKey: string,
  endpoint: string,
  params?: Record<string, string>,
): Promise<T> {
  await throttle();

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
    const calendarPricesSupported = calendarPrices !== null;
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
          if (b > 0) await new Promise((r) => setTimeout(r, 500));
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

    // ── Build comprehensive result ────────────────────────────────────
    return {
      success: rooms.length > 0 || !!calendarPrices || !!offers,
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
