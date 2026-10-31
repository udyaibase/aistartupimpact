/**
 * The real client IP, resistant to spoofed headers.
 *
 * On Vercel, `x-real-ip` / `x-forwarded-for` are set by the platform from the TCP connection, so a
 * client can't forge them. Traffic proxied by Cloudflare reaches Vercel from a Cloudflare edge IP; only
 * then is `cf-connecting-ip` trusted (anyone can send that header straight to *.vercel.app otherwise).
 * Locally there is no proxy, so the forwarded headers are used as-is (tests rely on that).
 */

const CF_V4 = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
  '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
];
const CF_V6_PREFIX = ['2400:cb00:', '2606:4700:', '2803:f800:', '2405:b500:', '2405:8100:', '2a06:98c', '2c0f:f248:'];

function v4ToInt(ip: string): number | null {
  const p = ip.split('.');
  if (p.length !== 4) return null;
  let n = 0;
  for (const part of p) {
    const x = Number(part);
    if (!Number.isInteger(x) || x < 0 || x > 255) return null;
    n = n * 256 + x;
  }
  return n;
}

export function isCloudflareIp(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  if (v.includes(':')) return CF_V6_PREFIX.some((p) => v.startsWith(p));
  const n = v4ToInt(v);
  if (n == null) return false;
  return CF_V4.some((cidr) => {
    const [base, bits] = cidr.split('/');
    const b = v4ToInt(base)!;
    const size = 2 ** (32 - Number(bits));
    return n >= b && n < b + size;
  });
}

export function clientIp(request: Request): string {
  return clientIpFromHeaders(request.headers);
}

/** Same as clientIp, for server components that only have `headers()`. */
export function clientIpFromHeaders(h: Headers): string {
  const first = (v: string | null) => v?.split(',')[0]?.trim() || null;
  if (process.env.VERCEL) {
    const edge = first(h.get('x-vercel-forwarded-for')) || first(h.get('x-real-ip')) || first(h.get('x-forwarded-for'));
    const cf = first(h.get('cf-connecting-ip'));
    if (edge && cf && isCloudflareIp(edge)) return cf;
    return edge || 'unknown';
  }
  return first(h.get('x-real-ip')) || first(h.get('x-forwarded-for')) || first(h.get('cf-connecting-ip')) || 'unknown';
}
