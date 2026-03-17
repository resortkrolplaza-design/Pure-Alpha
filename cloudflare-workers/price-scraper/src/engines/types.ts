// ============================================================================
// PRICE SCRAPER - Shared Types
// ============================================================================

export interface ScrapeParams {
  hotelUrl: string;
  checkIn: string; // "YYYY-MM-DD"
  checkOut: string; // "YYYY-MM-DD"
  adults: number;
}

export interface RoomResult {
  roomName: string;
  price: number;
  currency: string;
  mealPlan?: string;
  occupancy: number;
  originalPriceText?: string;
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
}
