// ============================================================================
// PRICE SCRAPER - Shared Types
// ============================================================================

export interface ScrapeParams {
  hotelUrl: string;
  checkIn: string; // "YYYY-MM-DD"
  checkOut: string; // "YYYY-MM-DD"
  adults: number;
  nights: number; // calculated from checkIn/checkOut
}

export interface RoomResult {
  roomName: string;
  price: number;
  currency: string;
  mealPlan?: string;
  occupancy: number;
  originalPriceText?: string;
  isPerNight?: boolean; // true = confirmed per-night, false = total stay, undefined = unknown
  isPerPerson?: boolean; // true = price is per person (needs ×adults for per-room)
  nights?: number; // number of nights the price covers (for normalization)
}

export interface HotelMeta {
  description?: string;    // meta description or og:description
  ogImage?: string;        // og:image URL
  languages?: string[];    // ["pl", "en", "de", "ru"]
  rating?: number;         // Google/schema.org rating (e.g. 4.7)
  ratingCount?: number;    // number of reviews
}

export interface ScrapeResult {
  success: boolean;
  rooms?: RoomResult[];
  error?: string;
  durationMs: number;
  engine: string;
  // GPT fallback: when DOM heuristics fail, return page text for server-side GPT extraction
  needsGptExtraction?: boolean;
  pageText?: string;
  // Engine detection: GENERIC discovered a known engine → caller should re-dispatch
  detectedEngine?: string;
  resolvedBookingUrl?: string;
  // Hotel metadata extracted from the same page load
  hotelMeta?: HotelMeta;
}
