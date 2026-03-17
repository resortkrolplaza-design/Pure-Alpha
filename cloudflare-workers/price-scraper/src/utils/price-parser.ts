// ============================================================================
// PRICE PARSER - Polish & European price formats
// ============================================================================

/**
 * Parse Polish/European price text.
 *
 * Handles:
 * - "1 234,56 zł"  → 1234.56
 * - "1.234,56 EUR"  → 1234.56 (P1-1 FIX: European dot-as-thousands)
 * - "890 PLN"       → 890
 * - "€120.00"       → 120.00
 * - "od 450 zł"     → 450
 *
 * Returns price as number or null if unparseable.
 */
export function parsePrice(text: string): number | null {
  if (!text) return null;

  // Remove non-breaking spaces, trim
  const cleaned = text.replace(/\u00A0/g, " ").trim();

  // P1-1 FIX: Handle European "1.234,56" and English "1,234.56" formats
  // Strategy: find the longest number-like substring, then disambiguate
  // by checking which separator (dot or comma) appears LAST = decimal

  // Match any number with dots and/or commas
  const fullMatch = cleaned.match(/(\d[\d.,\s]*\d)/);
  if (fullMatch) {
    const numPart = fullMatch[1].replace(/\s/g, "");
    const lastDot = numPart.lastIndexOf(".");
    const lastComma = numPart.lastIndexOf(",");

    if (lastComma > lastDot) {
      // Comma is last → European format: dots are thousands, comma is decimal
      // "1.234,56" → 1234.56 | "999,99" → 999.99
      const numStr = numPart.replace(/\./g, "").replace(",", ".");
      const price = parseFloat(numStr);
      if (isFinite(price) && price > 0) return price;
    } else if (lastDot > lastComma) {
      // Dot is last → English format: commas are thousands, dot is decimal
      // "1,234.56" → 1234.56 | "120.00" → 120
      const numStr = numPart.replace(/,/g, "");
      const price = parseFloat(numStr);
      if (isFinite(price) && price > 0) return price;
    } else {
      // No dot or comma → simple integer
      const price = parseFloat(numPart);
      if (isFinite(price) && price > 0) return price;
    }
  }

  // Simple integer/float: "890" or "1234"
  const simpleMatch = cleaned.match(/(\d[\d\s]*)/);
  if (simpleMatch) {
    const numStr = simpleMatch[1].replace(/\s/g, "");
    const price = parseFloat(numStr);
    return isFinite(price) && price > 0 ? price : null;
  }

  return null;
}

/**
 * Detect currency from price text.
 */
export function detectCurrency(text: string): string {
  if (!text) return "PLN";
  // P2-2 FIX: Remove redundant case variants (using /i flag)
  if (/zł|pln|złot/i.test(text)) return "PLN";
  if (/€|eur|euro/i.test(text)) return "EUR";
  if (/\$|usd|dolar/i.test(text)) return "USD";
  if (/£|gbp/i.test(text)) return "GBP";
  if (/kč|czk/i.test(text)) return "CZK";
  return "PLN"; // Default for Polish hotels
}
