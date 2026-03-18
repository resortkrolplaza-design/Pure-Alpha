// ============================================================================
// GENERIC ENGINE - Universal booking engine price extraction
// ============================================================================
// Works with any hotel website by:
// 1. Navigating to URL, dismissing cookies, scrolling for lazy-load
// 2. Extracting room/price data from DOM using generic CSS selectors
// 3. If no prices → discovering booking page (iframes, links, buttons)
//    - Profitroom detected → returns detectedEngine for re-dispatch
//    - Other engines → navigates to booking page and re-extracts
// 4. If DOM extraction fails → returns pageText for GPT fallback
// ============================================================================

import puppeteer from "@cloudflare/puppeteer";
import type { ScrapeParams, RoomResult, ScrapeResult, HotelMeta } from "./types";
import { parsePrice, detectCurrency } from "../utils/price-parser";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Price element selectors (ordered by specificity) ──────────────────────

const PRICE_SELECTORS = [
  "[data-price]",
  "[class*='price']", "[class*='Price']",
  "[class*='cena']", "[class*='Cena']",
  "[class*='amount']", "[class*='rate']",
  "[class*='cost']", "[class*='total']",
  ".price", ".room-price", ".offer-price",
];

const ROOM_SELECTORS = [
  "[class*='room']", "[class*='Room']",
  "[class*='offer']", "[class*='Offer']",
  "[class*='accommodation']", "[class*='result']",
  "[class*='card']", "[class*='package']",
  "[class*='pokój']", "[class*='pokoi']",
];

const NAME_SELECTORS = [
  "[class*='name']", "[class*='title']",
  "[class*='nazwa']", "h2", "h3", "h4",
];

// ── Price thresholds ──────────────────────────────────────────────────────

const MIN_PRICE_PLN = 50;
const MIN_PRICE_EUR = 10;
const MAX_REASONABLE_PER_NIGHT_PLN = 3000;
const MAX_REASONABLE_PER_NIGHT_EUR = 800;

// ── Per-night detection ───────────────────────────────────────────────────

const PER_NIGHT_PATTERNS = [
  /za noc/i, /\/\s*noc/i, /per night/i, /\/\s*night/i,
  /pro nacht/i, /cena za 1 noc/i, /nightly/i,
];

const TOTAL_STAY_PATTERNS = [
  /za pobyt/i, /za cały pobyt/i, /total stay/i, /total price/i,
  /łącznie/i, /razem/i, /za \d+ noc/i, /for \d+ night/i,
];

function detectPriceType(contextText: string): "per-night" | "total" | "unknown" {
  for (const p of PER_NIGHT_PATTERNS) {
    if (p.test(contextText)) return "per-night";
  }
  for (const p of TOTAL_STAY_PATTERNS) {
    if (p.test(contextText)) return "total";
  }
  return "unknown";
}

// ── Per-person detection ──────────────────────────────────────────────────

const PER_PERSON_PATTERNS = [
  /\/\s*os\.?\s*\/\s*noc/i,    // /os./noc, /os/noc
  /\/\s*osob[aęy]/i,           // /osoba, /osobę, /osoby
  /\/\s*os\b/i,                // /os (word boundary)
  /os\.\s*\/\s*noc/i,          // os./noc
  /\/\s*person/i,              // /person
  /per\s*person/i,             // per person
  /za\s*osob[ęy]/i,           // za osobę
];

function detectPerPerson(priceText: string): boolean {
  for (const p of PER_PERSON_PATTERNS) {
    if (p.test(priceText)) return true;
  }
  return false;
}

// ── Cookie consent dismissal ──────────────────────────────────────────────

async function dismissCookies(page: puppeteer.Page): Promise<void> {
  try {
    await page.evaluate(() => {
      const selectors = [
        '[class*="cookie"] button', '[id*="cookie"] button',
        '[class*="consent"] button', '[id*="consent"] button',
        '[class*="gdpr"] button', '[class*="rodo"] button',
        '.cookie-bar button', '#cookie-bar button',
        '.cookies button', '#cookies button',
        'button[class*="accept"]', 'button[class*="agree"]',
      ];
      const acceptWords = [
        "akceptuj", "accept", "zgadzam", "agree", "rozumiem",
        "zamknij", "close", "zgoda", "ok", "akceptuję",
        "przyjmuję", "wszystkie",
      ];
      for (const sel of selectors) {
        try {
          const buttons = document.querySelectorAll(sel);
          for (const btn of buttons) {
            const text = (btn.textContent || "").trim().toLowerCase();
            if (acceptWords.some(w => text.includes(w)) || text.length < 15) {
              (btn as HTMLElement).click();
              return;
            }
          }
        } catch { /* skip */ }
      }
    });
    await delay(500);
  } catch { /* ignore */ }
}

// ── Scroll page for lazy loading ──────────────────────────────────────────

async function scrollPage(page: puppeteer.Page): Promise<void> {
  try {
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 3);
    });
    await delay(600);
    await page.evaluate(() => {
      window.scrollTo(0, (document.body.scrollHeight * 2) / 3);
    });
    await delay(600);
  } catch { /* ignore */ }
}

// ── Booking engine discovery ──────────────────────────────────────────────

interface EngineDiscovery {
  engine: "PROFITROOM" | "HOTRES" | "OTHER";
  siteKey?: string;
  url?: string;
}

async function discoverBookingEngine(page: puppeteer.Page): Promise<EngineDiscovery | null> {
  return page.evaluate(() => {
    const html = document.documentElement.outerHTML;

    // ── 1. Profitroom in page source ──────────────────────────────────
    const profitroomPatterns = [
      /upperbooking\.com\/\w+\/booking\/start\/([a-zA-Z0-9]+)/,
      /booking\.profitroom\.com\/\w+\/([a-zA-Z0-9]+)/,
      /siteKey=([a-zA-Z0-9]+)/,
      /wa-uploads\.profitroom\.com\/([a-zA-Z0-9]+)\//,
    ];
    for (const p of profitroomPatterns) {
      const match = html.match(p);
      if (match?.[1]) return { engine: "PROFITROOM" as const, siteKey: match[1] };
    }

    // ── 2. Booking engine iframes ─────────────────────────────────────
    const iframes = document.querySelectorAll("iframe");
    for (const iframe of iframes) {
      const src = iframe.src || iframe.getAttribute("data-src") || "";
      if (src.includes("profitroom") || src.includes("upperbooking")) {
        const match = src.match(
          /(?:booking\.profitroom\.com|upperbooking\.com)\/\w+\/(?:booking\/start\/)?([a-zA-Z0-9]+)/,
        );
        if (match?.[1]) return { engine: "PROFITROOM" as const, siteKey: match[1] };
      }
      if (src.includes("hotres")) return { engine: "HOTRES" as const, url: src };
      if (
        src.includes("kwhotel") || src.includes("visitonline") ||
        src.includes("booking") || src.includes("rezerwacja")
      ) return { engine: "OTHER" as const, url: src };
    }

    // ── 3. Profitroom in links ────────────────────────────────────────
    const profLinks = document.querySelectorAll(
      'a[href*="profitroom"], a[href*="upperbooking"]',
    );
    for (const link of profLinks) {
      const href = (link as HTMLAnchorElement).href;
      const match = href.match(
        /(?:booking\.profitroom\.com|upperbooking\.com)\/\w+\/(?:booking\/start\/)?([a-zA-Z0-9]+)/,
      );
      if (match?.[1]) return { engine: "PROFITROOM" as const, siteKey: match[1] };
    }

    // ── 4. Hotres ─────────────────────────────────────────────────────
    const hotresMatch = html.match(/https?:\/\/(?:panel\.)?hotres\.pl\/[^\s"'<>]+/i);
    if (hotresMatch) return { engine: "HOTRES" as const, url: hotresMatch[0] };

    const hotresLinks = document.querySelectorAll('a[href*="hotres"]');
    for (const link of hotresLinks) {
      const href = (link as HTMLAnchorElement).href;
      if (href && !href.startsWith("javascript:")) {
        return { engine: "HOTRES" as const, url: href };
      }
    }

    // ── 5. Other booking engine links ─────────────────────────────────
    const bookingLinkSels = [
      'a[href*="kwhotel"]', 'a[href*="visitonline"]',
      'a[href*="rezerwuj"]', 'a[href*="rezerwacja"]',
      'a[href*="booking."]', 'a[href*="reserve"]',
      'a[href*="sprawdz-dostepnosc"]',
    ];
    for (const sel of bookingLinkSels) {
      try {
        const link = document.querySelector(sel) as HTMLAnchorElement | null;
        if (link?.href && link.href !== "#" && !link.href.startsWith("javascript:")) {
          return { engine: "OTHER" as const, url: link.href };
        }
      } catch { /* skip */ }
    }

    // ── 6. "Rezerwuj" links by text content ───────────────────────────
    const bookingTextPatterns = [
      /^rezerwuj$/i, /^zarezerwuj$/i, /^rezerwacja$/i,
      /sprawdź.*dostępność/i, /sprawdź.*ceny/i,
      /^book\s*now$/i, /^reserve$/i,
      /rezerwuj\s*teraz/i, /zarezerwuj\s*teraz/i,
    ];
    const allLinks = document.querySelectorAll("a");
    for (const link of allLinks) {
      const text = (link.textContent || "").trim();
      for (const pattern of bookingTextPatterns) {
        if (pattern.test(text)) {
          const href = link.href;
          if (href && href !== "#" && !href.startsWith("javascript:") && href !== window.location.href) {
            return { engine: "OTHER" as const, url: href };
          }
        }
      }
    }

    // ── 7. Internal pages that might have prices ──────────────────────
    const pricePageSels = [
      'a[href*="cennik"]', 'a[href*="prices"]',
      'a[href*="/pokoje"]', 'a[href*="/rooms"]',
      'a[href*="oferty"]', 'a[href*="offers"]',
    ];
    for (const sel of pricePageSels) {
      try {
        const link = document.querySelector(sel) as HTMLAnchorElement | null;
        if (link?.href && link.href !== "#" && link.href !== window.location.href) {
          return { engine: "OTHER" as const, url: link.href };
        }
      } catch { /* skip */ }
    }

    return null;
  });
}

// ── Append date params to discovered booking URL ──────────────────────────

function appendDateParams(
  url: string,
  checkIn: string,
  checkOut: string,
  adults: number,
): string {
  try {
    const parsed = new URL(url);
    // Don't add if already has date params
    const hasDateParams = ["checkIn", "dateFrom", "from", "arrival", "checkin"].some(
      (k) => parsed.searchParams.has(k),
    );
    if (hasDateParams) return url;

    if (url.includes("profitroom") || url.includes("upperbooking")) {
      parsed.searchParams.set("dateFrom", checkIn);
      parsed.searchParams.set("dateTo", checkOut);
      parsed.searchParams.set("adults", String(adults));
    } else if (url.includes("hotres")) {
      parsed.searchParams.set("from", checkIn);
      parsed.searchParams.set("to", checkOut);
      parsed.searchParams.set("adults", String(adults));
    } else {
      parsed.searchParams.set("checkIn", checkIn);
      parsed.searchParams.set("checkOut", checkOut);
      parsed.searchParams.set("adults", String(adults));
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

// ── DOM price extraction ──────────────────────────────────────────────────

async function checkForPriceElements(page: puppeteer.Page): Promise<boolean> {
  return page.evaluate((selectors: string[]) => {
    for (const sel of selectors) {
      try {
        if (document.querySelector(sel)) return true;
      } catch { /* invalid selector */ }
    }
    return false;
  }, PRICE_SELECTORS);
}

async function extractRoomsFromDOM(
  page: puppeteer.Page,
): Promise<Array<{ name: string; priceText: string; contextText: string }>> {
  return page.evaluate(
    (roomSels: string[], nameSels: string[], priceSels: string[]) => {
      const results: Array<{ name: string; priceText: string; contextText: string }> = [];

      // Strategy 1: Find room cards with name + price
      for (const roomSel of roomSels) {
        try {
          const cards = document.querySelectorAll(roomSel);
          cards.forEach((card) => {
            let name = "";
            for (const ns of nameSels) {
              try {
                const nameEl = card.querySelector(ns);
                if (nameEl?.textContent?.trim()) {
                  name = nameEl.textContent.trim();
                  break;
                }
              } catch { /* skip */ }
            }

            let priceText = "";
            let contextText = "";
            for (const ps of priceSels) {
              try {
                const priceEl = card.querySelector(ps);
                if (priceEl?.textContent?.trim()) {
                  priceText = priceEl.textContent.trim();
                  const parent = priceEl.parentElement;
                  contextText = (parent?.textContent || priceEl.textContent || "")
                    .trim()
                    .substring(0, 200);
                  break;
                }
              } catch { /* skip */ }
            }

            if (contextText.length < 30) {
              contextText = (card.textContent || "").trim().substring(0, 300);
            }

            if (name && priceText) {
              results.push({ name, priceText, contextText });
            }
          });
        } catch { /* skip invalid selector */ }
      }

      // Strategy 2: Standalone prices without room cards
      if (results.length === 0) {
        for (const ps of priceSels) {
          try {
            const priceEls = document.querySelectorAll(ps);
            priceEls.forEach((el, idx) => {
              const priceText = (el.textContent || "").trim();
              if (!priceText) return;

              let name = "";
              let contextText = "";
              const parent = el.closest(
                "[class*='room'], [class*='offer'], [class*='card'], [class*='item']",
              );
              if (parent) {
                for (const ns of nameSels) {
                  try {
                    const nameEl = parent.querySelector(ns);
                    if (nameEl?.textContent?.trim()) {
                      name = nameEl.textContent.trim();
                      break;
                    }
                  } catch { /* skip */ }
                }
                contextText = (parent.textContent || "").trim().substring(0, 300);
              }
              if (!name) name = `Pokój ${idx + 1}`;
              if (!contextText) {
                contextText = (el.parentElement?.textContent || "")
                  .trim()
                  .substring(0, 200);
              }
              results.push({ name, priceText, contextText });
            });
          } catch { /* skip */ }
          if (results.length > 0) break;
        }
      }

      return results;
    },
    ROOM_SELECTORS,
    NAME_SELECTORS,
    PRICE_SELECTORS,
  );
}

// ── Parse raw room data → RoomResult[] ────────────────────────────────────

function parseRooms(
  rawRooms: Array<{ name: string; priceText: string; contextText: string }>,
  params: ScrapeParams,
): RoomResult[] {
  const rooms: RoomResult[] = [];
  const seen = new Set<string>();

  for (const raw of rawRooms) {
    const rawPrice = parsePrice(raw.priceText);
    if (rawPrice === null || rawPrice <= 0) continue;

    const currency = detectCurrency(raw.priceText);
    const minPrice = currency === "PLN" ? MIN_PRICE_PLN : MIN_PRICE_EUR;
    if (rawPrice < minPrice) continue;

    const key = `${raw.name}|${rawPrice}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const priceType = detectPriceType(raw.contextText);
    const isPerPerson = detectPerPerson(raw.priceText) || detectPerPerson(raw.contextText);
    const { nights } = params;
    let normalizedPrice = rawPrice;
    let isPerNight: boolean | undefined;

    if (priceType === "per-night") {
      normalizedPrice = rawPrice;
      isPerNight = true;
    } else if (priceType === "total" && nights > 1) {
      normalizedPrice = Math.round((rawPrice / nights) * 100) / 100;
      isPerNight = true;
    } else if (nights > 1) {
      const maxPerNight =
        currency === "PLN" ? MAX_REASONABLE_PER_NIGHT_PLN : MAX_REASONABLE_PER_NIGHT_EUR;
      const perNightEstimate = rawPrice / nights;
      if (rawPrice > maxPerNight && perNightEstimate >= minPrice) {
        normalizedPrice = Math.round(perNightEstimate * 100) / 100;
        isPerNight = true;
      }
    } else {
      isPerNight = true;
    }

    // Per-person → per-room normalization
    if (isPerPerson && params.adults > 1) {
      normalizedPrice = Math.round(normalizedPrice * params.adults * 100) / 100;
    }

    rooms.push({
      roomName: raw.name,
      price: normalizedPrice,
      currency,
      occupancy: params.adults,
      originalPriceText: raw.priceText,
      isPerNight,
      isPerPerson,
      nights,
    });
  }

  rooms.sort((a, b) => a.price - b.price);
  return rooms;
}

// ── Hotel metadata extraction ────────────────────────────────────────────

async function extractHotelMeta(page: puppeteer.Page): Promise<HotelMeta> {
  try {
    return await page.evaluate(() => {
      const meta: {
        description?: string;
        ogImage?: string;
        languages?: string[];
        rating?: number;
        ratingCount?: number;
      } = {};

      // ── Description ──────────────────────────────────────────
      const ogDesc = document.querySelector('meta[property="og:description"]');
      const metaDesc = document.querySelector('meta[name="description"]');
      const descContent =
        (ogDesc as HTMLMetaElement)?.content ||
        (metaDesc as HTMLMetaElement)?.content;
      if (descContent?.trim()) {
        meta.description = descContent.trim().substring(0, 500);
      }

      // ── OG Image ─────────────────────────────────────────────
      const ogImage = document.querySelector('meta[property="og:image"]');
      const ogImageContent = (ogImage as HTMLMetaElement)?.content;
      if (ogImageContent?.trim()) {
        meta.ogImage = ogImageContent.trim();
      }

      // ── Languages ────────────────────────────────────────────
      const langs = new Set<string>();
      const docLang = document.documentElement.lang;
      if (docLang) {
        langs.add(docLang.split("-")[0].toLowerCase());
      }
      const hreflangs = document.querySelectorAll('link[rel="alternate"][hreflang]');
      hreflangs.forEach((link) => {
        const hl = link.getAttribute("hreflang");
        if (hl && hl !== "x-default") {
          langs.add(hl.split("-")[0].toLowerCase());
        }
      });
      if (langs.size > 0) {
        meta.languages = Array.from(langs).sort();
      }

      // ── Rating from JSON-LD ──────────────────────────────────
      const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
      ldScripts.forEach((script) => {
        try {
          const data = JSON.parse(script.textContent || "");
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
            const type = item["@type"];
            if (
              (type === "Hotel" || type === "LodgingBusiness" || type === "LocalBusiness") &&
              item.aggregateRating
            ) {
              const ar = item.aggregateRating;
              const rVal = parseFloat(ar.ratingValue);
              const rCount = parseInt(ar.reviewCount || ar.ratingCount, 10);
              if (!isNaN(rVal) && rVal > 0 && rVal <= 5) {
                meta.rating = rVal;
              }
              if (!isNaN(rCount) && rCount > 0) {
                meta.ratingCount = rCount;
              }
            }
          }
        } catch {
          /* invalid JSON-LD */
        }
      });

      return meta;
    });
  } catch {
    return {};
  }
}

// ── MAIN FUNCTION ─────────────────────────────────────────────────────────

export async function scrapeGenericPrices(
  browserBinding: Fetcher,
  params: ScrapeParams,
): Promise<ScrapeResult> {
  const start = Date.now();
  let browser: puppeteer.Browser | undefined;

  try {
    browser = await puppeteer.launch(browserBinding);
    const page = await browser.newPage();

    await page.setViewport({ width: 1280, height: 720 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );

    // ── STEP 1: Navigate to hotel URL (with date params) ──────────────
    const dateUrl = (() => {
      const base = params.hotelUrl.replace(/\/$/, "");
      const sep = base.includes("?") ? "&" : "?";
      return `${base}${sep}checkIn=${params.checkIn}&checkOut=${params.checkOut}&adults=${params.adults}`;
    })();

    try {
      await page.goto(dateUrl, { waitUntil: "networkidle2", timeout: 15000 });
    } catch {
      try {
        await page.goto(params.hotelUrl, { waitUntil: "networkidle2", timeout: 15000 });
      } catch {
        return {
          success: false,
          error: "Could not load hotel website",
          durationMs: Date.now() - start,
          engine: "GENERIC",
        };
      }
    }

    // ── STEP 2: Dismiss cookies + wait for rendering ──────────────────
    await dismissCookies(page);
    await delay(1500);

    // ── STEP 3: Scroll for lazy-loaded content ────────────────────────
    await scrollPage(page);

    // ── STEP 4: Try extracting prices from main page ──────────────────
    let hasPrices = await checkForPriceElements(page);

    if (hasPrices) {
      const rawRooms = await extractRoomsFromDOM(page);
      const rooms = parseRooms(rawRooms, params);
      if (rooms.length > 0) {
        const hotelMeta = await extractHotelMeta(page);
        return {
          success: true,
          rooms,
          durationMs: Date.now() - start,
          engine: "GENERIC",
          hotelMeta,
        };
      }
    }

    // ── STEP 5: No prices on main page → discover booking page ────────
    const discovery = await discoverBookingEngine(page);

    // 5a. Profitroom detected → return for re-dispatch to PROFITROOM engine
    if (discovery?.engine === "PROFITROOM" && discovery.siteKey) {
      const hotelMeta = await extractHotelMeta(page);
      return {
        success: false,
        detectedEngine: "PROFITROOM",
        resolvedBookingUrl: `https://booking.profitroom.com/pl/${discovery.siteKey}/home`,
        error: "Detected Profitroom engine — re-dispatch to PROFITROOM",
        durationMs: Date.now() - start,
        engine: "GENERIC",
        hotelMeta,
      };
    }

    // 5b. Other booking engine → navigate to booking page with dates
    if (discovery?.url) {
      const bookingUrl = appendDateParams(
        discovery.url,
        params.checkIn,
        params.checkOut,
        params.adults,
      );

      try {
        await page.goto(bookingUrl, { waitUntil: "networkidle2", timeout: 15000 });
        await dismissCookies(page);
        await delay(2000);
        await scrollPage(page);

        // Re-try price extraction on booking page
        hasPrices = await checkForPriceElements(page);
        if (hasPrices) {
          const rawRooms = await extractRoomsFromDOM(page);
          const rooms = parseRooms(rawRooms, params);
          if (rooms.length > 0) {
            const hotelMeta = await extractHotelMeta(page);
            return {
              success: true,
              rooms,
              durationMs: Date.now() - start,
              engine: "GENERIC",
              hotelMeta,
            };
          }
        }
      } catch {
        // Navigation to booking page failed — continue to GPT fallback
      }
    }

    // ── STEP 6: GPT fallback with current page text ───────────────────
    const hotelMeta = await extractHotelMeta(page);
    const pageText = await page.evaluate(() => {
      return (document.body?.innerText || "").substring(0, 15000);
    });

    return {
      success: false,
      needsGptExtraction: true,
      pageText,
      error: "No prices found in DOM — returning page text for GPT extraction",
      durationMs: Date.now() - start,
      engine: "GENERIC",
      hotelMeta,
    };
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Unknown error";
    const safeMessage = rawMessage.length > 150 ? rawMessage.substring(0, 150) : rawMessage;
    console.error("[PriceScraper] Generic scrape failed:", rawMessage);

    return {
      success: false,
      error: safeMessage,
      durationMs: Date.now() - start,
      engine: "GENERIC",
    };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch { /* already closed */ }
    }
  }
}
