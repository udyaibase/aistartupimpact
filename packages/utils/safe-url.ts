import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Server-only checks that a URL points at the public internet, for anything that fetches a URL a person typed or a
 * page linked to (embed detection on the website, the admin career scraper). The host name is resolved and every
 * address must be public, so names that point inside a network, numeric IP spellings and redirects to internal hosts
 * are all refused.
 */

export function isPrivateAddress(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateAddress(mapped[1]) : false;
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

/**
 * Public web address only: https (or http when allowed) on the default port, no credentials, no IP literals, and every
 * address the name resolves to is public.
 */
export async function isSafePublicUrl(url: URL, opts: { allowHttp?: boolean } = {}): Promise<boolean> {
  const httpOk = opts.allowHttp && url.protocol === "http:";
  if (url.protocol !== "https:" && !httpOk) return false;
  if (url.port && url.port !== (url.protocol === "https:" ? "443" : "80")) return false;
  if (url.username || url.password) return false;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) || /^[\d.]+$/.test(host) || /^0x/i.test(host)) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}
