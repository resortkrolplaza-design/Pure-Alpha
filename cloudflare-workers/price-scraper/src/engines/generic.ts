// ============================================================================
// GENERIC ENGINE - Universal booking engine price extraction
// ============================================================================
// Works with any hotel website by:
// 1. Navigating to URL with date params in common formats
// 2. Waiting for price elements to render
// 3. Extracting room/price data using generic CSS selectors
// 4. If DOM extraction fails → returns pageText for GPT fallback
// ============================================================================

import puppeteer from "@cloudflare/puppeteer";
import type { ScrapeParams, RoomResult, ScrapeResult } from "./types";
import { parsePrice, detectCurrency } from "../utils/price-parser";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Common date query param formats hotels use
function buildDateUrls(baseUrl: string, checkIn: string, checkOut: string): string[] {
  const urls: string[] = [];
  const base = baseUrl.replace(/\/$/, "");
  const sep = base.includes("?") ? "&" : "?";

  // Format 1: checkIn/checkOut (most common)
  urls.push(`${base}${sep}checkIn=${checkIn}&checkOut=${checkOut}`);
  // Format 2: checkin/checkout
  urls.push(`${base}${sep}checkin=${checkIn}&checkout=${checkOut}`);
  // Format 3: arrival/departure
  urls.push(`${base}${sep}arrival=${checkIn}&departure=${checkOut}`);
  // Format 4: from/to
  urls.push(`${base}${sep}from=${checkIn}&to=${checkOut}`);

  return urls;
}

// Price selectors ordered by specificity
const PRICE_SELECTORS = [
  "[data-price]",
  "[class*='price']",
  "[class*='Price']",
  "[class*='cena']",
  "[class*='Cena']",
  "[class*='amount']",
  "[class*='rate']",
  "[class*='cost']",
  "[class*='total']",
  ".price",
  ".room-price",
  ".offer-price",
];

// Room card container selectors
const ROOM_SELECTORS = [
  "[class*='room']",
  "[class*='Room']",
  "[class*='offer']",
  "[class*='Offer']",
  "[class*='accommodation']",
  "[class*='result']",
  "[class*='card']",
  "[class*='package']",
  "[class*='pokój']",
  "[class*='pokoi']",
];

// Room name selectors within a card
const NAME_SELECTORS = [
  "[class*='name']",
  "[class*='title']",
  "[class*='nazwa']",
  "h2",
  "h3",
  "h4",
];

const MIN_PRICE_PLN = 50;
const MIN_PRICE_EUR = 10;

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

    // 1. Try navigating with date params
    const dateUrls = buildDateUrls(params.hotelUrl, params.checkIn, params.checkOut);
    let navigated = false;

    // Try first URL format (most common)
    try {
      await page.goto(dateUrls[0], { waitUntil: "networkidle2", timeout: 20000 });
      navigated = true;
    } catch {
      // Fallback: navigate to base URL without date params
      try {
        await page.goto(params.hotelUrl, { waitUntil: "networkidle2", timeout: 20000 });
        navigated = true;
      } catch {
        return {
          success: false,
          error: "Could not load hotel website",
          durationMs: Date.now() - start,
          engine: "GENERIC",
        };
      }
    }

    // 2. Wait for page to settle
    await delay(3000);

    // 3. Check if any price elements exist
    const hasPrices = await page.evaluate((selectors: string[]) => {
      for (const sel of selectors) {
        try {
          if (document.querySelector(sel)) return true;
        } catch { /* invalid selector */ }
      }
      return false;
    }, PRICE_SELECTORS);

    if (!hasPrices) {
      // No price elements found — return page text for GPT fallback
      const pageText = await page.evaluate(() => {
        return (document.body?.innerText || "").substring(0, 15000);
      });

      return {
        success: false,
        needsGptExtraction: true,
        pageText,
        error: "No price elements found in DOM",
        durationMs: Date.now() - start,
        engine: "GENERIC",
      };
    }

    // 4. Extract room data using generic selectors
    const rawRooms = await page.evaluate(
      (roomSels: string[], nameSels: string[], priceSels: string[]) => {
        const results: Array<{ name: string; priceText: string }> = [];

        // Strategy 1: Find room cards with name + price
        for (const roomSel of roomSels) {
          try {
            const cards = document.querySelectorAll(roomSel);
            cards.forEach((card) => {
              // Find name
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

              // Find price
              let priceText = "";
              for (const ps of priceSels) {
                try {
                  const priceEl = card.querySelector(ps);
                  if (priceEl?.textContent?.trim()) {
                    priceText = priceEl.textContent.trim();
                    break;
                  }
                } catch { /* skip */ }
              }

              if (name && priceText) {
                results.push({ name, priceText });
              }
            });
          } catch { /* skip invalid selector */ }
        }

        // Strategy 2: If no card-based results, collect standalone prices
        if (results.length === 0) {
          for (const ps of priceSels) {
            try {
              const priceEls = document.querySelectorAll(ps);
              priceEls.forEach((el, idx) => {
                const priceText = (el.textContent || "").trim();
                if (!priceText) return;

                // Try to find a parent card with a name
                let name = "";
                const parent = el.closest("[class*='room'], [class*='offer'], [class*='card'], [class*='item']");
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
                }
                if (!name) name = `Pokój ${idx + 1}`;
                results.push({ name, priceText });
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

    // 5. Parse extracted data
    const rooms: RoomResult[] = [];
    const seen = new Set<string>();

    for (const raw of rawRooms) {
      const price = parsePrice(raw.priceText);
      if (price === null || price <= 0) continue;

      const currency = detectCurrency(raw.priceText);
      const minPrice = currency === "PLN" ? MIN_PRICE_PLN : MIN_PRICE_EUR;
      if (price < minPrice) continue;

      const key = `${raw.name}|${price}`;
      if (seen.has(key)) continue;
      seen.add(key);

      rooms.push({
        roomName: raw.name,
        price,
        currency,
        occupancy: params.adults,
        originalPriceText: raw.priceText,
      });
    }

    rooms.sort((a, b) => a.price - b.price);

    // 6. If DOM extraction found rooms → return them
    if (rooms.length > 0) {
      return {
        success: true,
        rooms,
        durationMs: Date.now() - start,
        engine: "GENERIC",
      };
    }

    // 7. DOM extraction failed — return page text for GPT fallback
    const pageText = await page.evaluate(() => {
      return (document.body?.innerText || "").substring(0, 15000);
    });

    return {
      success: false,
      needsGptExtraction: true,
      pageText,
      error: "DOM extraction found price elements but could not parse valid rooms",
      durationMs: Date.now() - start,
      engine: "GENERIC",
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
