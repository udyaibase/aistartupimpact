const HOSTNAME_RE = /^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function validateAndNormalizeDomains(domains: string[]): string[] {
  return domains
    .map((d) => d.trim())
    .filter(Boolean)
    .map((raw) => {
      let domain = raw.toLowerCase();
      // Strip protocol if present
      domain = domain.replace(/^https?:\/\//, "");
      // Strip trailing slashes and paths
      domain = domain.split("/")[0];

      // Reject anything with dangerous characters (CSP injection)
      if (/[;\s'"<>]/.test(domain)) {
        throw new Error(`Invalid domain: "${raw}" contains forbidden characters`);
      }

      if (!HOSTNAME_RE.test(domain)) {
        throw new Error(`Invalid domain: "${raw}" is not a valid hostname`);
      }

      return domain;
    });
}

export function validateAccentColor(color: string): boolean {
  return HEX_COLOR_RE.test(color);
}

export function clampMaxEvents(n: number): number {
  return Math.max(1, Math.min(50, Math.floor(n) || 10));
}
