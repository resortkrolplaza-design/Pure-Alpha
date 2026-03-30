// ============================================================================
// PREMIUMHOTEL ENGINE - Direct API price extraction
// ============================================================================
// PremiumHotel (Betasi Sp. z o.o.) exposes a public REST API at
// api.premiumhotel.pl/apiV2/ for hotel booking.
//
// Endpoints used:
//   1. GET /dynamic-rest/book-stay/pre-booking-details       -> reservationId
//   2. GET /dynamic-rest/book-stay/pre-booking-proposals      -> prices + rooms + packages
//   3. GET /dynamic-rest/book-stay/packages-list              -> offer validity dates
//   4. GET /rest/application/config                           -> hotel name, address, settings
//   5. GET /dynamic-rest/book-stay/calendar                   -> per-day availability (no prices)
//
// Detection: data-zuu-be-id="{tenant}.premiumhotel.pl" in hotel HTML
//
// No authentication required. No browser rendering needed.
// ============================================================================

import type {
  ScrapeParams,
  RoomResult,
  ScrapeResult,
  ProfitroomOffer,
  ProfitroomRoomDetail,
  ProfitroomHotelDetails,
  CalendarPrice,
  MealPlanPrice,
} from "./types";

const API_BASE = "https://api.premiumhotel.pl/apiV2";
const FETCH_TIMEOUT = 15000;

// ── API response types ──────────────────────────────────────────────────────

interface PHProposal {
  checkIn: string;
  checkOut: string;
  roomStandardId: number;
  packageId: number;
  price: Record<string, number>;
  originalPrice: Record<string, number> | null;
  dates: unknown[];
}

interface PHPackage {
  id: number;
  name: string;
  description?: string;
  hasVariants?: boolean;
  attributes?: {
    main?: Array<{ name: string; icon?: string; iconFamily?: string }>;
    highlighted?: Array<{ name: string; color?: string }>;
    additional?: Array<{ name: string }>;
  };
  images?: Array<{ url: string }>;
}

interface PHRoomStandard {
  id: number;
  name: string;
  description?: string;
  attributes?: {
    main?: Array<{ name: string; icon?: string; iconFamily?: string }>;
    highlighted?: Array<{ name: string; color?: string }>;
    additional?: Array<{ name: string }>;
  };
  images?: Array<{ url: string }>;
}

interface PHProposalsResponse {
  roomStandards: PHRoomStandard[];
  packages: PHPackage[];
  proposals: PHProposal[];
  partiallyMatchedProposals?: PHProposal[];
}

interface PHPackageListItem {
  id: number;
  name: string;
  description?: string;
  availabilityFrom?: string;
  availabilityTo?: string;
  minNights?: number;
  maxNights?: number;
  priceFrom?: number;
  minAdults?: number;
  maxAdults?: number;
  type?: string;
  attributes?: {
    main?: Array<{ name: string; icon?: string }>;
    highlighted?: Array<{ name: string; color?: string }>;
    additional?: Array<{ name: string }>;
  };
  images?: Array<{ url: string }>;
}

interface PHAppConfig {
  name?: string;
  contexts?: Record<
    string,
    {
      name?: string;
      address?: {
        country?: string;
        city?: string;
        zip?: string;
        street?: string;
      };
      phone?: string;
      email?: string;
      logoURL?: string;
      defaultCurrency?: string;
    }
  >;
  bookStaySettings?: {
    maxChildAge?: number;
    childrenEnabled?: boolean;
    defaultStayLength?: number;
  };
}

interface PHCalendarDay {
  key: string; // "2026-04-01"
  availability: boolean;
  checkInAvailable: boolean;
  checkOutAvailable: boolean;
  minLOS?: number;
  maxLOS?: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const TENANT_RE = /^[a-zA-Z0-9._-]+$/;
const MIN_PRICE_PLN = 50;
const MIN_PRICE_EUR = 10;
const API_MIN_INTERVAL_MS = 200;
let lastApiCallMs = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastApiCallMs;
  if (elapsed < API_MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, API_MIN_INTERVAL_MS - elapsed));
  }
  lastApiCallMs = Date.now();
}

function isValidTenantOrContext(value: string): boolean {
  return TENANT_RE.test(value) && value.length <= 100;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parsePremiumHotelId(hotelUrl: string): {
  tenant: string;
  context: string | null;
} | null {
  try {
    const url = new URL(hotelUrl);
    if (url.hostname.endsWith(".premiumhotel.pl")) {
      const tenant = url.hostname.replace(/\.premiumhotel\.pl$/, "");
      const context = url.searchParams.get("context") || null;
      return { tenant, context };
    }
    const pathParts = url.pathname.split("/").filter(Boolean);
    const context = pathParts[0] || null;
    return { tenant: "", context };
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string, tenant: string): Promise<T> {
  await throttle();
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
    throw new Error(
      `Expected JSON, got ${contentType}: ${text.substring(0, 100)}`,
    );
  }
  return res.json() as Promise<T>;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseArea(description: string): string | undefined {
  const m = description.match(/(\d+)\s*m[²2]/i);
  return m ? `${m[1]} m\u00B2` : undefined;
}

function mapFacilities(
  attrs?: PHRoomStandard["attributes"],
): string[] | undefined {
  if (!attrs?.main?.length) return undefined;
  return attrs.main.map((a) => a.name).filter(Boolean);
}

// ── Core: create session + get proposals ─────────────────────────────────────

async function fetchProposals(
  tenant: string,
  context: string | null,
  checkIn: string,
  checkOut: string,
  adults: number,
): Promise<{ reservationId: string; data: PHProposalsResponse }> {
  // P0 FIX: validate tenant/context to prevent query string injection
  if (!isValidTenantOrContext(tenant)) {
    throw new Error(`Invalid tenant: ${tenant.substring(0, 20)}`);
  }
  if (context && !isValidTenantOrContext(context)) {
    throw new Error(`Invalid context: ${context.substring(0, 20)}`);
  }

  const roomsParam = encodeURIComponent(
    JSON.stringify([{ adults, children: [] }]),
  );
  const contextParam = context ? `&context=${context}` : "";

  const detailsUrl =
    `${API_BASE}/dynamic-rest/book-stay/pre-booking-details` +
    `?checkIn=${checkIn}&checkOut=${checkOut}` +
    `&rooms=${roomsParam}&lang=pl${contextParam}`;

  const details = await fetchJson<{
    reservationId?: string;
    message?: string;
  }>(detailsUrl, tenant);

  if (!details.reservationId) {
    throw new Error(
      `No reservationId: ${details.message || "unknown error"}`,
    );
  }
  // Validate reservationId format (prevent query injection from API response)
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(details.reservationId)) {
    throw new Error("Invalid reservationId format");
  }

  const proposalsUrl =
    `${API_BASE}/dynamic-rest/book-stay/pre-booking-proposals` +
    `?checkIn=${checkIn}&checkOut=${checkOut}` +
    `&searchMode=strict&adults=${adults}` +
    `&rooms=${roomsParam}` +
    `&reservationId=${encodeURIComponent(details.reservationId)}` +
    `&lang=pl${contextParam}`;

  const data = await fetchJson<PHProposalsResponse>(proposalsUrl, tenant);
  return { reservationId: details.reservationId, data };
}

// ── Meal plan detection from package name ────────────────────────────────────
// PremiumHotel has no structured mealPlanType -- derive from Polish package names
// 18=room-only, 19=breakfast (BB), 20=half-board (HB), 21=full-board (FB)
function detectMealPlanType(packageName: string): number {
  const lower = packageName.toLowerCase();
  if (/pe[łl]ne\s*wy[żz]ywienie|full\s*board|all\s*inclusive/i.test(lower)) return 21; // FB / AI
  if (/[śs]niadanie?\s*(i|oraz)\s*(obiad|kolacj)|p[oó][łl]pensj|half\s*board/i.test(lower)) return 20; // HB
  if (/[śs]niadani|breakfast|ze?\s*[śs]niad/i.test(lower)) return 19; // BB
  if (/bez\s*wy[żz]ywienia|room\s*only|nocleg\s*bez/i.test(lower)) return 18; // RO
  return 19; // Default: most PremiumHotel packages include breakfast
}

// ── Mappers: PremiumHotel -> shared types ────────────────────────────────────

function mapRoomDetails(
  roomStandards: PHRoomStandard[],
): ProfitroomRoomDetail[] {
  return roomStandards.map((rs) => ({
    roomId: rs.id,
    name: rs.name,
    description: rs.description ? stripHtml(rs.description) : undefined,
    area: rs.description ? parseArea(rs.description) : undefined,
    facilities: mapFacilities(rs.attributes),
    imageUrl: rs.images?.[0]?.url || undefined,
    images: rs.images?.map((img) => img.url).filter(Boolean),
  }));
}

function mapOffers(
  packages: PHPackage[],
  packageListItems?: PHPackageListItem[],
): ProfitroomOffer[] {
  // PRIMARY source: packages-list (ALL offers, not date-filtered)
  // ENRICHMENT: packages from proposals (description, images, attributes)
  const proposalPkgMap = new Map(
    (packages || []).map((p) => [p.id, p]),
  );

  if (packageListItems && packageListItems.length > 0) {
    return packageListItems.map((li) => {
      const proposalPkg = proposalPkgMap.get(li.id);
      // Prefer proposal package for description/images (richer data)
      const desc = proposalPkg?.description || li.description;
      const imgs = proposalPkg?.images || li.images;
      return {
        offerId: li.id,
        name: li.name,
        description: desc ? stripHtml(desc) : undefined,
        imageUrl: imgs?.[0]?.url || undefined,
        validFrom: li.availabilityFrom?.split("T")[0] || undefined,
        validTo: li.availabilityTo?.split("T")[0] || undefined,
        minNights: li.minNights ?? undefined,
        minPrice: li.priceFrom ?? undefined,
      };
    });
  }

  // Fallback: use packages from proposals (date-filtered, fewer results)
  return packages.map((pkg) => ({
    offerId: pkg.id,
    name: pkg.name,
    description: pkg.description ? stripHtml(pkg.description) : undefined,
    imageUrl: pkg.images?.[0]?.url || undefined,
  }));
}

function mapHotelDetails(
  config: PHAppConfig | null,
  tenant: string,
  context: string | null,
): ProfitroomHotelDetails | undefined {
  if (!config) return undefined;
  const ctx = context && config.contexts?.[context]
    ? config.contexts[context]
    : config.contexts
      ? Object.values(config.contexts)[0]
      : null;
  const name = ctx?.name || config.name || tenant;
  const city = ctx?.address?.city || undefined;
  // Build description from name + city (not raw address)
  const description = city ? `${name}, ${city}` : name;
  return {
    name,
    city,
    description,
    policies: {
      childrenFreeAge: config.bookStaySettings?.maxChildAge,
    },
  };
}

// ── Public API: prices mode ──────────────────────────────────────────────────

export async function scrapePremiumHotelPrices(
  _browser: unknown,
  params: ScrapeParams,
  premiumHotelTenant?: string,
  premiumHotelContext?: string,
): Promise<ScrapeResult> {
  const startTime = Date.now();

  let tenant = premiumHotelTenant || "";
  let context = premiumHotelContext || null;

  if (!tenant || !context) {
    const parsed = parsePremiumHotelId(params.hotelUrl);
    if (parsed) {
      tenant = tenant || parsed.tenant;
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
    const { data } = await fetchProposals(
      tenant,
      context,
      params.checkIn,
      params.checkOut,
      params.adults,
    );

    if (!data.proposals || data.proposals.length === 0) {
      return {
        success: false,
        error: "No proposals returned (sold out or technical break)",
        durationMs: Date.now() - startTime,
        engine: "PREMIUMHOTEL",
      };
    }

    const packageMap = new Map((data.packages || []).map((p) => [p.id, p.name]));
    const roomMap = new Map((data.roomStandards || []).map((r) => [r.id, r.name]));
    const nights = params.nights > 0 ? params.nights : 1;

    const rooms: RoomResult[] = data.proposals
      .map((proposal) => {
        const [currency, totalAmount] = Object.entries(proposal.price)[0] || [
          "PLN",
          0,
        ];
        const minAllowed = currency === "PLN" ? MIN_PRICE_PLN : MIN_PRICE_EUR;
        const perNight = Math.round((totalAmount / nights) * 100) / 100;
        if (perNight < minAllowed) return null;

        const packageName = packageMap.get(proposal.packageId) || "Unknown";
        const roomName = roomMap.get(proposal.roomStandardId) || "Standard";

        let originalPriceText: string | undefined;
        if (proposal.originalPrice) {
          const origAmount = Object.values(proposal.originalPrice)[0];
          if (origAmount && origAmount !== totalAmount) {
            const origPerNight = Math.round((origAmount / nights) * 100) / 100;
            originalPriceText = `${origPerNight} ${currency}`;
          }
        }

        return {
          roomName,
          price: perNight,
          currency,
          mealPlan: packageName,
          occupancy: params.adults,
          originalPriceText,
          description: packageName,
          isPerNight: true,
          nights,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => a.price - b.price);

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

// ── Public API: full mode (prices + rooms + offers + hotel meta) ─────────────

export async function scrapePremiumHotelFull(
  _browser: unknown,
  params: ScrapeParams,
  premiumHotelTenant?: string,
  premiumHotelContext?: string,
): Promise<ScrapeResult> {
  const startTime = Date.now();

  let tenant = premiumHotelTenant || "";
  let context = premiumHotelContext || null;

  if (!tenant || !context) {
    const parsed = parsePremiumHotelId(params.hotelUrl);
    if (parsed) {
      tenant = tenant || parsed.tenant;
      context = context || parsed.context;
    }
  }

  if (!tenant || !isValidTenantOrContext(tenant)) {
    return {
      success: false,
      error: "Cannot resolve PremiumHotel tenant from URL",
      durationMs: Date.now() - startTime,
      engine: "PREMIUMHOTEL",
    };
  }
  if (context && !isValidTenantOrContext(context)) {
    context = null;
  }

  try {
    const contextParam = context ? `&context=${encodeURIComponent(context)}` : "";

    // Fire all 3 requests in parallel:
    // 1. proposals (2-step: details then proposals)
    // 2. packages-list (validity dates)
    // 3. application/config (hotel meta)
    const [proposalsResult, packagesList, appConfig] = await Promise.all([
      fetchProposals(tenant, context, params.checkIn, params.checkOut, params.adults)
        .catch((e) => ({ error: e instanceof Error ? e.message : String(e) })),
      fetchJson<PHPackageListItem[]>(
        `${API_BASE}/dynamic-rest/book-stay/packages-list?lang=pl${contextParam}`,
        tenant,
      ).catch(() => [] as PHPackageListItem[]),
      fetchJson<PHAppConfig>(
        `${API_BASE}/rest/application/config?lang=pl${contextParam}`,
        tenant,
      ).catch(() => null),
    ]);

    // Handle proposals failure
    if ("error" in proposalsResult) {
      return {
        success: false,
        error: proposalsResult.error,
        durationMs: Date.now() - startTime,
        engine: "PREMIUMHOTEL",
        hotelDetails: mapHotelDetails(appConfig, tenant, context),
        offers: mapOffers([], Array.isArray(packagesList) ? packagesList : []),
      };
    }

    const { data } = proposalsResult;

    if (!data.proposals || data.proposals.length === 0) {
      return {
        success: false,
        error: "No proposals returned (sold out or technical break)",
        durationMs: Date.now() - startTime,
        engine: "PREMIUMHOTEL",
        hotelDetails: mapHotelDetails(appConfig, tenant, context),
        roomDetails: mapRoomDetails(data.roomStandards || []),
        offers: mapOffers(
          data.packages || [],
          Array.isArray(packagesList) ? packagesList : [],
        ),
      };
    }

    const packageMap = new Map((data.packages || []).map((p) => [p.id, p.name]));
    const roomMap = new Map((data.roomStandards || []).map((r) => [r.id, r.name]));
    const nights = params.nights > 0 ? params.nights : 1;

    const rooms: RoomResult[] = data.proposals
      .map((proposal) => {
        const [currency, totalAmount] = Object.entries(proposal.price)[0] || [
          "PLN",
          0,
        ];
        const minAllowed = currency === "PLN" ? MIN_PRICE_PLN : MIN_PRICE_EUR;
        const perNight = Math.round((totalAmount / nights) * 100) / 100;
        if (perNight < minAllowed) return null;

        const packageName = packageMap.get(proposal.packageId) || "Unknown";
        const roomName = roomMap.get(proposal.roomStandardId) || "Standard";

        let originalPriceText: string | undefined;
        if (proposal.originalPrice) {
          const origAmount = Object.values(proposal.originalPrice)[0];
          if (origAmount && origAmount !== totalAmount) {
            const origPerNight = Math.round((origAmount / nights) * 100) / 100;
            originalPriceText = `${origPerNight} ${currency}`;
          }
        }

        return {
          roomName,
          price: perNight,
          currency,
          mealPlan: packageName,
          occupancy: params.adults,
          originalPriceText,
          description: packageName,
          isPerNight: true,
          nights,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => a.price - b.price);

    // Map offers with minPrice from proposals
    const offerMinPrices = new Map<number, { price: number; currency: string }>();
    for (const proposal of data.proposals) {
      const [currency, totalAmount] = Object.entries(proposal.price)[0] || [
        "PLN",
        0,
      ];
      const perNight = Math.round((totalAmount / nights) * 100) / 100;
      const existing = offerMinPrices.get(proposal.packageId);
      if (!existing || perNight < existing.price) {
        offerMinPrices.set(proposal.packageId, { price: perNight, currency });
      }
    }

    const offers = mapOffers(
      data.packages || [],
      Array.isArray(packagesList) ? packagesList : [],
    );
    // Enrich offers with minPrice from proposals
    for (const offer of offers) {
      const mp = offerMinPrices.get(offer.offerId);
      if (mp) {
        offer.minPrice = mp.price;
        offer.currency = mp.currency;
      }
    }

    const roomDetails = mapRoomDetails(data.roomStandards || []);
    const hotelDetails = mapHotelDetails(appConfig, tenant, context);

    // Meal plan pricing: cheapest per-night price per mealPlanType
    let pricesByMealPlan: Record<string, MealPlanPrice> | undefined;
    if (rooms.length > 0) {
      const mealPlanBest = new Map<number, MealPlanPrice>();
      for (const room of rooms) {
        const mealType = detectMealPlanType(room.mealPlan || "");
        const existing = mealPlanBest.get(mealType);
        if (!existing || room.price < existing.price) {
          mealPlanBest.set(mealType, {
            price: room.price,
            currency: room.currency,
            roomName: room.roomName,
            offerName: room.mealPlan,
          });
        }
      }
      if (mealPlanBest.size > 0) {
        pricesByMealPlan = {};
        for (const [mealType, data] of mealPlanBest) {
          pricesByMealPlan[String(mealType)] = data;
        }
      }
    }

    return {
      success: true,
      rooms,
      durationMs: Date.now() - startTime,
      engine: "PREMIUMHOTEL",
      hotelMeta: {
        description: hotelDetails?.name || `${tenant} (${context || "default"})`,
      },
      roomDetails,
      offers,
      hotelDetails,
      pricesByMealPlan,
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "PremiumHotel full scrape failed",
      durationMs: Date.now() - startTime,
      engine: "PREMIUMHOTEL",
    };
  }
}

// ── Public API: calendar mode (per-day prices via iterative crawl) ───────────

export async function scrapePremiumHotelCalendar(
  _browser: unknown,
  params: ScrapeParams,
  premiumHotelTenant?: string,
  premiumHotelContext?: string,
): Promise<ScrapeResult> {
  const startTime = Date.now();

  let tenant = premiumHotelTenant || "";
  let context = premiumHotelContext || null;

  if (!tenant || !context) {
    const parsed = parsePremiumHotelId(params.hotelUrl);
    if (parsed) {
      tenant = tenant || parsed.tenant;
      context = context || parsed.context;
    }
  }

  if (!tenant || !isValidTenantOrContext(tenant)) {
    return {
      success: false,
      error: "Cannot resolve PremiumHotel tenant from URL",
      durationMs: Date.now() - startTime,
      engine: "PREMIUMHOTEL",
    };
  }
  if (context && !isValidTenantOrContext(context)) {
    context = null;
  }

  try {
    const contextParam = context ? `&context=${encodeURIComponent(context)}` : "";
    const calendarDays = params.calendarDays || 90;

    // Step 1: Get availability calendar (which dates are bookable)
    const fromDate = params.checkIn;
    const toDate = new Date(
      new Date(params.checkIn).getTime() + calendarDays * 86400000,
    )
      .toISOString()
      .split("T")[0];

    const calendar = await fetchJson<{ dates: PHCalendarDay[] }>(
      `${API_BASE}/dynamic-rest/book-stay/calendar?from=${fromDate}&to=${toDate}&lang=pl${contextParam}`,
      tenant,
    );

    const availableDates = (calendar.dates || [])
      .filter((d) => d.availability && d.checkInAvailable)
      .map((d) => d.key);

    const unavailableDays = (calendar.dates || [])
      .filter((d) => !d.availability)
      .map((d) => d.key);

    if (availableDates.length === 0) {
      return {
        success: true,
        rooms: [],
        calendarPrices: [],
        unavailableDays,
        durationMs: Date.now() - startTime,
        engine: "PREMIUMHOTEL",
      };
    }

    // Step 2: Get prices for available dates (batched parallel, time-budgeted)
    // Each date = 2 API calls (details + proposals). Run 3 concurrent batches.
    const TIME_BUDGET_MS = 20000;
    const BATCH_SIZE = 3;
    const MAX_DATES = 30;
    const datesToFetch = availableDates.slice(0, MAX_DATES);
    const calendarPrices: CalendarPrice[] = [];

    async function fetchDatePrice(date: string): Promise<CalendarPrice | null> {
      const d = new Date(date + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + 1);
      const nextDay = d.toISOString().split("T")[0];
      try {
        const { data } = await fetchProposals(
          tenant,
          context,
          date,
          nextDay,
          params.adults,
        );
        if (data.proposals && data.proposals.length > 0) {
          let minPrice = Infinity;
          let currency = "PLN";
          for (const p of data.proposals) {
            const [cur, amount] = Object.entries(p.price)[0] || ["PLN", 0];
            const minAllowed = cur === "PLN" ? MIN_PRICE_PLN : MIN_PRICE_EUR;
            if (amount >= minAllowed && amount < minPrice) {
              minPrice = amount;
              currency = cur;
            }
          }
          if (minPrice < Infinity) return { date, minPrice, currency };
        }
      } catch {
        // Skip failed dates
      }
      return null;
    }

    // Process in batches of BATCH_SIZE with time budget
    for (let i = 0; i < datesToFetch.length; i += BATCH_SIZE) {
      if (Date.now() - startTime > TIME_BUDGET_MS) break;
      const batch = datesToFetch.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(fetchDatePrice));
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) {
          calendarPrices.push(r.value);
        }
      }
    }

    return {
      success: true,
      rooms: [],
      calendarPrices,
      calendarPricesSupported: true,
      unavailableDays,
      durationMs: Date.now() - startTime,
      engine: "PREMIUMHOTEL",
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "PremiumHotel calendar scrape failed",
      durationMs: Date.now() - startTime,
      engine: "PREMIUMHOTEL",
    };
  }
}
