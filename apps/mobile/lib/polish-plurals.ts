// =============================================================================
// Polish Pluralization — 3-form rule (SSOT copy from web)
// =============================================================================

type PluralCategory = "one" | "few" | "many";

function pluralCategory(n: number): PluralCategory {
  const abs = Math.abs(n);
  const lastDigit = abs % 10;
  const lastTwoDigits = abs % 100;

  if (abs === 1) return "one";
  if (lastDigit >= 2 && lastDigit <= 4 && !(lastTwoDigits >= 12 && lastTwoDigits <= 14)) return "few";
  return "many";
}

export function polishPlural(n: number, one: string, few: string, many: string): string {
  const cat = pluralCategory(n);
  if (cat === "one") return `${n} ${one}`;
  if (cat === "few") return `${n} ${few}`;
  return `${n} ${many}`;
}

export const nightsLabel = (n: number) => polishPlural(n, "noc", "noce", "nocy");
export const pointsLabel = (n: number) => polishPlural(n, "punkt", "punkty", "punktów");
export const daysLabel = (n: number) => polishPlural(n, "dzień", "dni", "dni");
export const staysLabel = (n: number) => polishPlural(n, "pobyt", "pobyty", "pobytów");
export const guestsLabel = (n: number) => polishPlural(n, "gość", "gości", "gości");
