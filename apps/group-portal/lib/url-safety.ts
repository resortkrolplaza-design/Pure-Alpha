// =============================================================================
// Group Portal — URL Safety (SSRF prevention for user-facing links)
// =============================================================================

const ALLOWED_IMAGE_HOSTS = [
  "purealphahotel.pl",
  "supabase.co",
  "supabase.in",
  "r.profitroom.com",
];

/** Check if a URL is safe to render as an image source */
export function isImageUrlSafe(urlStr: string | null | undefined): boolean {
  if (!urlStr) return false;
  try {
    const url = new URL(urlStr);
    return (
      url.protocol === "https:" &&
      ALLOWED_IMAGE_HOSTS.some(
        (h) => url.hostname === h || url.hostname.endsWith("." + h),
      )
    );
  } catch {
    return false;
  }
}

/** Check if a URL is safe to open externally (social links, websites) */
export function isExternalUrlSafe(urlStr: string | null | undefined): boolean {
  if (!urlStr) return false;
  try {
    const url = new URL(urlStr);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Sanitize phone number for tel: links */
export function sanitizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^+\d\s()-]/g, "");
  return cleaned.length >= 6 ? cleaned : null;
}

/** Sanitize email for mailto: links */
export function sanitizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}
