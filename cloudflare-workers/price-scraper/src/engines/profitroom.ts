// ============================================================================
// PROFITROOM ENGINE - Booking widget price extraction
// ============================================================================
// Flow verified via Playwright PoC:
// 1. Navigate to upperbooking.com/{slug} → redirects to booking.profitroom.com
// 2. Select check-in date: [data-test="YYYY-MM-DD"]
// 3. Select check-out date: [data-test="YYYY-MM-DD"]
// 4. Click apply: .datepicker-apply
// 5. Wait for price elements to render
// 6. Extract room names + prices from result cards
// ============================================================================

import puppeteer from "@cloudflare/puppeteer";
import type { ScrapeParams, RoomResult, ScrapeResult } from "./types";
import { parsePrice, detectCurrency } from "../utils/price-parser";

// P0-3 FIX: @cloudflare/puppeteer may not have page.waitForTimeout()
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// P1-5 FIX: Validate date format before using in CSS selector
const SAFE_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Resolve hotel URL to Profitroom booking engine URL.
 *
 * Strategy:
 * - If URL is already booking.profitroom.com or upperbooking.com → use as-is
 * - Otherwise: navigate to hotel website, find Profitroom iframe/script, extract siteKey
 *   and build direct URL: booking.profitroom.com/pl/{siteKey}/home
 *
 * The siteKey cannot be guessed from the domain name (e.g. grandlubicz.pl →
 * grandlubiczuzdrowiskoustka3, not "grandlubicz").
 */
async function resolveProfitroomUrl(
  page: puppeteer.Page,
  hotelUrl: string,
): Promise<string> {
  // Already a Profitroom URL
  if (hotelUrl.includes("booking.profitroom.com")) {
    return hotelUrl;
  }
  if (hotelUrl.includes("upperbooking.com")) {
    // Convert upperbooking to booking.profitroom.com
    // upperbooking.com/pl/booking/start/{siteKey} → booking.profitroom.com/pl/{siteKey}/home
    const match = hotelUrl.match(/\/([^/?]+?)(?:\?|$)/);
    if (match) {
      return `https://booking.profitroom.com/pl/${match[1]}/home`;
    }
    return hotelUrl;
  }

  // Navigate to hotel website to discover Profitroom siteKey
  await page.goto(hotelUrl, { waitUntil: "networkidle2", timeout: 15000 });

  // Strategy 1: Find siteKey in page source (scripts, iframes, links)
  const siteKey = await page.evaluate(() => {
    const html = document.documentElement.outerHTML;

    // Look for upperbooking.com/{lang}/booking/start/{siteKey}
    const upperMatch = html.match(
      /upperbooking\.com\/\w+\/booking\/start\/([a-zA-Z0-9]+)/,
    );
    if (upperMatch) return upperMatch[1];

    // Look for booking.profitroom.com/{lang}/{siteKey}
    const bookingMatch = html.match(
      /booking\.profitroom\.com\/\w+\/([a-zA-Z0-9]+)/,
    );
    if (bookingMatch) return bookingMatch[1];

    // Look for cart.profitroom.com/abandoned?siteKey={siteKey}
    const cartMatch = html.match(/siteKey=([a-zA-Z0-9]+)/);
    if (cartMatch) return cartMatch[1];

    // Look for profitroom template references
    const templateMatch = html.match(
      /wa-uploads\.profitroom\.com\/([a-zA-Z0-9]+)\//,
    );
    if (templateMatch) return templateMatch[1];

    return null;
  });

  if (siteKey) {
    return `https://booking.profitroom.com/pl/${siteKey}/home`;
  }

  // Strategy 2: Click "Rezerwuj" button and capture iframe src
  const reserveBtn = await page.$(
    'a[href*="profitroom"], a[href*="upperbooking"], [class*="reserv"], [class*="book"]',
  );
  if (reserveBtn) {
    await reserveBtn.click();
    await delay(3000);

    const iframeSrc = await page.evaluate(() => {
      const iframes = document.querySelectorAll("iframe");
      for (const iframe of iframes) {
        if (
          iframe.src.includes("upperbooking") ||
          iframe.src.includes("profitroom")
        ) {
          const match = iframe.src.match(
            /(?:upperbooking\.com\/\w+\/booking\/start\/|booking\.profitroom\.com\/\w+\/)([a-zA-Z0-9]+)/,
          );
          if (match) return match[1];
        }
      }
      return null;
    });

    if (iframeSrc) {
      return `https://booking.profitroom.com/pl/${iframeSrc}/home`;
    }
  }

  // Fallback: can't determine siteKey
  throw new Error("Could not find Profitroom siteKey on hotel website");
}

/**
 * Navigate month in datepicker if target date is not visible.
 * Profitroom datepicker shows 2 months at a time.
 */
async function navigateToMonth(
  page: puppeteer.Page,
  targetDate: string,
): Promise<boolean> {
  if (!SAFE_DATE.test(targetDate)) return false;

  const maxAttempts = 12; // Max 12 months forward

  for (let i = 0; i < maxAttempts; i++) {
    const dateCell = await page.$(`[data-test="${targetDate}"]`);
    if (dateCell) return true;

    // Click next month arrow
    const nextBtn = await page.$(
      '.datepicker-next, [class*="next"], button[aria-label*="next"], button[aria-label*="Next"]',
    );
    if (!nextBtn) return false;

    await nextBtn.click();
    await delay(300); // P0-3 FIX
  }

  return false;
}

// P1-7 FIX: Filter out obviously wrong prices (below 50 PLN for a hotel room)
const MIN_ROOM_PRICE_PLN = 50;
const MIN_ROOM_PRICE_EUR = 10;

// Per-person detection patterns
const PER_PERSON_PATTERNS = [
  /\/\s*os\.?\s*\/\s*noc/i,    // /os./noc
  /\/\s*osob[aęy]/i,           // /osoba, /osobę
  /\/\s*os\b/i,                // /os
  /os\.\s*\/\s*noc/i,          // os./noc
  /\/\s*person/i,              // /person
  /per\s*person/i,             // per person
  /za\s*osob[ęy]/i,           // za osobę
];

function isPerPersonPrice(priceText: string): boolean {
  for (const p of PER_PERSON_PATTERNS) {
    if (p.test(priceText)) return true;
  }
  return false;
}

function isReasonablePrice(price: number, currency: string): boolean {
  if (currency === "PLN") return price >= MIN_ROOM_PRICE_PLN;
  if (currency === "EUR") return price >= MIN_ROOM_PRICE_EUR;
  return price >= MIN_ROOM_PRICE_EUR;
}

export async function scrapeProfitroomPrices(
  browserBinding: Fetcher,
  params: ScrapeParams,
): Promise<ScrapeResult> {
  const start = Date.now();
  let browser: puppeteer.Browser | undefined;

  try {
    browser = await puppeteer.launch(browserBinding);
    const page = await browser.newPage();

    // Set viewport and user agent
    await page.setViewport({ width: 1280, height: 720 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );

    // 1. Resolve hotel URL → Profitroom booking engine URL
    //    This may navigate to the hotel website first to discover the siteKey
    const bookingUrl = await resolveProfitroomUrl(page, params.hotelUrl);

    // 2. Navigate to Profitroom booking page
    await page.goto(bookingUrl, {
      waitUntil: "networkidle2",
      timeout: 20000,
    });

    // Wait for datepicker to render
    try {
      await page.waitForSelector(".datepicker__day, [data-test]", {
        timeout: 10000,
      });
    } catch {
      return {
        success: false,
        error: "Datepicker not found on booking page",
        durationMs: Date.now() - start,
        engine: "PROFITROOM",
      };
    }

    // 3. Select check-in date
    const checkInFound = await navigateToMonth(page, params.checkIn);
    if (!checkInFound) {
      return {
        success: false,
        error: `Check-in date not found in datepicker`,
        durationMs: Date.now() - start,
        engine: "PROFITROOM",
      };
    }

    // Use evaluate to click (bypasses overlay issues with action-buttons)
    await page.evaluate(
      (sel: string) => {
        const el = document.querySelector(sel);
        if (el instanceof HTMLElement) el.click();
      },
      `[data-test="${params.checkIn}"]`,
    );
    await delay(500);

    // 4. Select check-out date
    const checkOutFound = await navigateToMonth(page, params.checkOut);
    if (!checkOutFound) {
      return {
        success: false,
        error: `Check-out date not found in datepicker`,
        durationMs: Date.now() - start,
        engine: "PROFITROOM",
      };
    }

    await page.evaluate(
      (sel: string) => {
        const el = document.querySelector(sel);
        if (el instanceof HTMLElement) el.click();
      },
      `[data-test="${params.checkOut}"]`,
    );
    await delay(500);

    // 5. Click apply/search button
    const applyBtn = await page.$(
      '.datepicker-apply, [class*="apply"], [class*="search"], button[type="submit"]',
    );
    if (applyBtn) {
      await applyBtn.click();
    }

    // 5. Wait for prices to load
    try {
      await page.waitForSelector('[class*="price"], [class*="cena"]', {
        timeout: 15000,
      });
    } catch {
      return {
        success: false,
        error: "No price elements found after search",
        durationMs: Date.now() - start,
        engine: "PROFITROOM",
      };
    }

    // Extra wait for SPA rendering to complete
    await delay(2000); // P0-3 FIX

    // 6. Extract room data from DOM
    const rawRooms = await page.evaluate(() => {
      const results: Array<{ name: string; priceText: string }> = [];

      // Strategy 1: Room cards with name + price
      const roomCards = document.querySelectorAll(
        '[class*="room"], [class*="offer"], [class*="accommodation"], [class*="result"]',
      );

      roomCards.forEach((card) => {
        const nameEl = card.querySelector(
          '[class*="name"], [class*="title"], [class*="nazwa"], h2, h3',
        );
        const priceEl = card.querySelector(
          '[class*="price"], [class*="cena"], [class*="amount"]',
        );

        if (nameEl && priceEl) {
          const name = (nameEl.textContent || "").trim();
          const priceText = (priceEl.textContent || "").trim();
          if (name && priceText) {
            results.push({ name, priceText });
          }
        }
      });

      // Strategy 2: If no room cards found, try generic price elements
      if (results.length === 0) {
        const priceElements = document.querySelectorAll(
          '[class*="price"], [data-price]',
        );
        priceElements.forEach((el, idx) => {
          const priceText = (el.textContent || "").trim();
          if (priceText) {
            const parent = el.closest(
              '[class*="room"], [class*="offer"], [class*="item"], [class*="card"]',
            );
            const nameEl = parent?.querySelector(
              '[class*="name"], [class*="title"], h2, h3, h4',
            );
            const name = nameEl
              ? (nameEl.textContent || "").trim()
              : `Pokój ${idx + 1}`;
            results.push({ name, priceText });
          }
        });
      }

      return results;
    });

    // 7. Parse extracted data
    const rooms: RoomResult[] = [];
    const seen = new Set<string>();

    for (const raw of rawRooms) {
      const price = parsePrice(raw.priceText);
      if (price === null || price <= 0) continue;

      const currency = detectCurrency(raw.priceText);

      // P1-7 FIX: Filter out obviously wrong prices (taxes, fees, etc.)
      if (!isReasonablePrice(price, currency)) continue;

      // Deduplicate by name+price
      const key = `${raw.name}|${price}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const perPerson = isPerPersonPrice(raw.priceText);
      const normalizedPrice = perPerson && params.adults > 1
        ? Math.round(price * params.adults * 100) / 100
        : price;

      rooms.push({
        roomName: raw.name,
        price: normalizedPrice,
        currency,
        occupancy: params.adults,
        originalPriceText: raw.priceText,
        isPerNight: true, // Profitroom always shows per-night prices
        isPerPerson: perPerson || undefined,
        nights: params.nights,
      });
    }

    // Sort by price ascending
    rooms.sort((a, b) => a.price - b.price);

    return {
      success: rooms.length > 0,
      rooms: rooms.length > 0 ? rooms : undefined,
      error: rooms.length === 0 ? "No valid prices found in DOM" : undefined,
      durationMs: Date.now() - start,
      engine: "PROFITROOM",
    };
  } catch (error) {
    // P1-6 FIX: Don't leak internal paths/stack traces
    const rawMessage =
      error instanceof Error ? error.message : "Unknown error";
    const safeMessage =
      rawMessage.length > 150 ? rawMessage.substring(0, 150) : rawMessage;
    console.error("[PriceScraper] Scrape failed:", rawMessage);

    return {
      success: false,
      error: safeMessage,
      durationMs: Date.now() - start,
      engine: "PROFITROOM",
    };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Browser may already be closed
      }
    }
  }
}
