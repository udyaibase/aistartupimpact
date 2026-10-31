import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const UA = "UdyaibaseBot/1.0 (+https://udyaibase.com)";

function isPrivateAddress(ip: string): boolean {
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

/** Public HTTPS on 443 only, no credentials, no IP literals, and every resolved address public. */
export async function isSafePublicUrl(url: URL): Promise<boolean> {
  if (url.protocol !== "https:" || (url.port && url.port !== "443")) return false;
  if (url.username || url.password) return false;
  if (isIP(url.hostname)) return false;
  try {
    const addrs = await lookup(url.hostname, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

export type FetchHtmlResult =
  | { ok: true; html: string; finalUrl: URL }
  | { ok: false; reason: "unsafe" | "unreachable" | "http_error"; status?: number };

/**
 * Fetches the start of a public HTML page. Redirects are followed manually (max 3)
 * so every hop is re-validated against private-network targets.
 */
export async function fetchPublicHtml(
  start: URL,
  opts: { maxBytes?: number; timeoutMs?: number; stopAt?: string } = {},
): Promise<FetchHtmlResult> {
  const maxBytes = opts.maxBytes ?? 200_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 6000);
  let url = start;
  try {
    for (let hop = 0; hop <= 3; hop++) {
      if (!(await isSafePublicUrl(url))) return { ok: false, reason: "unsafe" };
      const res = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return { ok: false, reason: "http_error", status: res.status };
        url = new URL(loc, url);
        if (url.protocol === "http:") url.protocol = "https:";
        continue;
      }
      if (!res.ok || !res.body) return { ok: false, reason: "http_error", status: res.status };
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let html = "";
      let received = 0;
      while (received < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        html += decoder.decode(value, { stream: true });
        if (opts.stopAt && html.includes(opts.stopAt)) break;
      }
      reader.cancel().catch(() => {});
      return { ok: true, html, finalUrl: url };
    }
    return { ok: false, reason: "unreachable" };
  } catch {
    return { ok: false, reason: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}
