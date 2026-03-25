// ============================================================================
// PRICE SCRAPER - Shared Types
// ============================================================================

export interface ScrapeParams {
  hotelUrl: string;
  checkIn: string; // "YYYY-MM-DD"
  checkOut: string; // "YYYY-MM-DD"
  adults: number;
  nights: number; // calculated from checkIn/checkOut
  profitroomSiteKey?: string; // Profitroom siteKey (discovered by GENERIC or passed from DB)
  mode?: "prices" | "full" | "offers" | "calendar-fallback"; // calendar-fallback = dedicated 30s for per-day availability
  calendarDays?: number; // days ahead for calendar (default 90)
}

export interface RoomResult {
  roomName: string;
  price: number;
  currency: string;
  mealPlan?: string;
  occupancy: number;
  originalPriceText?: string;
  description?: string; // package description (what's included)
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

export interface CalendarPrice {
  date: string;
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
}

export interface ProfitroomOffer {
  offerId: number;
  name: string;
  description?: string;
  mealPlanType?: number;
  minPrice?: number;
  currency?: string;
  validFrom?: string;
  validTo?: string;
  minNights?: number;
  isBestseller?: boolean;
  imageUrl?: string;
}

export interface ProfitroomRoomDetail {
  roomId: number;
  name: string;
  description?: string;
  bedsDescription?: string;
  area?: string;           // "28-30 m²" or "28 m²"
  maxOccupancy?: number;   // people + extraBeds
  facilities?: string[];   // ["wifi", "airConditioning", "balcony"]
  imageUrl?: string;
  images?: string[];       // full gallery URLs
  bedsConfiguration?: {
    total?: number | null;
    singleBeds?: number | null;
    doubleBeds?: number | null;
    foldingBeds?: number | null;
    splitBeds?: number | null;
  };
}

export interface ProfitroomHotelDetails {
  checkIn?: string;
  checkOut?: string;
  name?: string;
  city?: string;
  lat?: number;
  lng?: number;
  description?: string;
  policies?: {
    animalsAllowed?: boolean;
    childrenFreeAge?: number;
    maxAdvanceDays?: number;
  };
}

export interface MealPlanPrice {
  price: number;        // per-night, cheapest for this meal plan
  currency: string;
  roomName?: string;    // which room had this price
  offerName?: string;   // which offer had this price
  offerId?: number;
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
  profitroomSiteKey?: string;
  // Hotel metadata extracted from the same page load
  hotelMeta?: HotelMeta;
  // Profitroom full-mode data
  calendarPrices?: CalendarPrice[];
  calendarPricesSupported?: boolean;
  unavailableDays?: string[];
  offers?: ProfitroomOffer[];
  hotelDetails?: ProfitroomHotelDetails;
  exchangeRates?: Record<string, number>;
  roomDetails?: ProfitroomRoomDetail[];
  // Meal plan pricing: cheapest per-night price per mealPlanType (18=room-only, 19=breakfast, 20=half-board)
  pricesByMealPlan?: Record<string, MealPlanPrice>;
}
