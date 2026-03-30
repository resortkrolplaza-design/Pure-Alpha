// ============================================================================
// PREMIUMHOTEL ENGINE - Direct API price extraction
// ============================================================================
// PremiumHotel (Betasi Sp. z o.o.) exposes a public REST API at
// api.premiumhotel.pl/apiV2/ for hotel booking.
//
// Flow (2 calls):
//   1. GET /dynamic-rest/book-stay/pre-booking-details → reservationId (session)
//   2. GET /dynamic-rest/book-stay/pre-booking-proposals → proposals[].price
//
// Detection: data-zuu-be-id="{tenant}.premiumhotel.pl" in hotel HTML
// Currently known tenant: "golebiewski" with contexts: bialystok, mikolajki,
// pobierowo, wisla, karpacz
//
// No authentication required. No browser rendering needed.
// ============================================================================

import type { ScrapeParams, RoomResult, ScrapeResult } from "./types";

const API_BASE = "https://api.premiumhotel.pl/apiV2";
const FETCH_TIMEOUT = 15000;

interface PremiumHotelProposal {
  checkIn: string;
  checkOut: string;
  roomStandardId: number;
  packageId: number;
  price: Record<string, number>; // e.g. { PLN: 424 }
  originalPrice: Record<string, number> | null;
  dates: unknown[];
}

interface PremiumHotelPackage {
  id: number;
  name: string;
  description?: string;
  hasVariants?: boolean;
}

interface PremiumHotelRoomStandard {
  id: number;
  name: string;
  description?: string;
}

interface PremiumHotelProposalsResponse {
  roomStandards: PremiumHotelRoomStandard[];
  packages: PremiumHotelPackage[];
  proposals: PremiumHotelProposal[];
  partiallyMatchedProposals?: PremiumHotelProposal[];
}

/**
 * Extract tenant and context from a premiumhotel.pl URL or data-zuu-be-id.
 * e.g. "golebiewski.premiumhotel.pl" → tenant="golebiewski"
 * Context comes from URL path or query param: /mikolajki or ?context=mikolajki
 */
function parsePremiumHotelId(hotelUrl: string): {
  tenant: string;
  context: string | null;
} | null {
  try {
    const url = new URL(hotelUrl);

    // Case 1: URL is on premiumhotel.pl subdomain
    // e.g. https://golebiewski.premiumhotel.pl/booking/find?context=bialystok
    if (url.hostname.endsWith(".premiumhotel.pl")) {
      const tenant = url.hostname.replace(".premiumhotel.pl", "");
      const context = url.searchParams.get("context") || null;
      return { tenant, context };
    }

    // Case 2: URL is hotel's own domain (e.g. www.golebiewski.pl/mikolajki)
    // Context from path segment
    const pathParts = url.pathname.split("/").filter(Boolean);
    const context = pathParts[0] || null;

    // Tenant must be resolved by caller (from data-zuu-be-id)
    return { tenant: "", context };
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string, tenant: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; PureAlpha/1.0; +https://purealphahotel.pl)",
      Accept: "application/json",
      Origin: `https://${tenant}.premiumhotel.pl`,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
  }
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("json")) {
    const text = await res.text().catch(() => "");
    throw new Error(`Expected JSON, got ${contentType}: ${text.substring(0, 100)}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Scrape prices from PremiumHotel API.
 *
 * @param _browser - unused (no browser needed, pure REST API)
 * @param params - scrape parameters
 * @param premiumHotelTenant - tenant slug (e.g. "golebiewski")
 * @param premiumHotelContext - context/location (e.g. "mikolajki")
 */
export async function scrapePremiumHotelPrices(
  _browser: unknown,
  params: ScrapeParams,
  premiumHotelTenant?: string,
  premiumHotelContext?: string,
): Promise<ScrapeResult> {
  const startTime = Date.now();

  // Resolve tenant and context
  let tenant = premiumHotelTenant || "";
  let context = premiumHotelContext || null;

  if (!tenant) {
    const parsed = parsePremiumHotelId(params.hotelUrl);
    if (parsed) {
      tenant = parsed.tenant;
      context = context || parsed.context;
    }
  }

  if (!tenant) {
    return {
      success: false,
      error: "Cannot resolve PremiumHotel tenant from URL",
      durationMs: Date.now() - startTime,
      engine: "PREMIUMHOTEL",
    };
  }

  try {
    // Step 1: Create booking session → get reservationId
    const roomsParam = encodeURIComponent(
      JSON.stringify([{ adults: params.adults, children: [] }]),
    );
    const contextParam = context ? `&context=${context}` : "";

    const detailsUrl =
      `${API_BASE}/dynamic-rest/book-stay/pre-booking-details` +
      `?checkIn=${params.checkIn}&checkOut=${params.checkOut}` +
      `&rooms=${roomsParam}&lang=pl${contextParam}`;

    const details = await fetchJson<{ reservationId?: string; message?: string }>(
      detailsUrl,
      tenant,
    );

    if (!details.reservationId) {
      const msg = details.message || "No reservationId returned";
      return {
        success: false,
        error: `PremiumHotel session failed: ${msg}`,
        durationMs: Date.now() - startTime,
        engine: "PREMIUMHOTEL",
      };
    }

    // Step 2: Get proposals (prices)
    const proposalsUrl =
      `${API_BASE}/dynamic-rest/book-stay/pre-booking-proposals` +
      `?checkIn=${params.checkIn}&checkOut=${params.checkOut}` +
      `&searchMode=strict&adults=${params.adults}` +
      `&rooms=${roomsParam}` +
      `&reservationId=${details.reservationId}` +
      `&lang=pl${contextParam}`;

    const data = await fetchJson<PremiumHotelProposalsResponse>(proposalsUrl, tenant);

    if (!data.proposals || data.proposals.length === 0) {
      return {
        success: false,
        error: "No proposals returned (sold out or technical break)",
        durationMs: Date.now() - startTime,
        engine: "PREMIUMHOTEL",
      };
    }

    // Build package/room name lookup
    const packageMap = new Map(data.packages.map((p) => [p.id, p.name]));
    const roomMap = new Map(data.roomStandards.map((r) => [r.id, r.name]));

    // Convert proposals to RoomResult[] with per-night normalization
    const nights = params.nights > 0 ? params.nights : 1;
    const rooms: RoomResult[] = data.proposals.map((proposal) => {
      const priceEntries = Object.entries(proposal.price);
      const [currency, totalAmount] = priceEntries[0] || ["PLN", 0];
      const perNight = Math.round((totalAmount / nights) * 100) / 100;
      const packageName = packageMap.get(proposal.packageId) || "Unknown";
      const roomName = roomMap.get(proposal.roomStandardId) || "Standard";

      let originalPrice: string | undefined;
      if (proposal.originalPrice) {
        const origAmount = Object.values(proposal.originalPrice)[0];
        if (origAmount && origAmount !== totalAmount) {
          const origPerNight = Math.round((origAmount / nights) * 100) / 100;
          originalPrice = `${origPerNight} ${currency}`;
        }
      }

      return {
        roomName,
        price: perNight,
        currency,
        mealPlan: packageName,
        occupancy: params.adults,
        originalPriceText: originalPrice,
        description: packageName,
        isPerNight: true,
        nights,
      };
    });

    return {
      success: true,
      rooms,
      durationMs: Date.now() - startTime,
      engine: "PREMIUMHOTEL",
      hotelMeta: {
        description: `${tenant} (${context || "default"})`,
      },
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "PremiumHotel scrape failed",
      durationMs: Date.now() - startTime,
      engine: "PREMIUMHOTEL",
    };
  }
}
