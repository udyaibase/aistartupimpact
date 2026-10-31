import { fetchPublicHtml } from "./safe-fetch";

function normalizeHex(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return null;
}

function isUsableAccent(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const lightness = (max + min) / 2 / 255;
  return lightness > 0.12 && lightness < 0.85 && max - min > 30;
}

/** Best-effort accent colour from <meta name="theme-color"> on the organizer's site. */
export async function detectAccentFromWebsite(website: string | null | undefined): Promise<string | null> {
  if (!website) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
    url.protocol = "https:";
  } catch {
    return null;
  }
  const res = await fetchPublicHtml(url, { timeoutMs: 4000, stopAt: "</head>" });
  if (!res.ok) return null;
  const match =
    res.html.match(/<meta[^>]+name=["']theme-color["'][^>]*content=["']([^"']+)["']/i) ||
    res.html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']theme-color["']/i);
  const hex = match ? normalizeHex(match[1]) : null;
  return hex && isUsableAccent(hex) ? hex : null;
}
