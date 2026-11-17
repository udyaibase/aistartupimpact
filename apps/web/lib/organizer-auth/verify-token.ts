import crypto from "crypto";

/**
 * Email-confirmation links for organizer accounts. The link carries `<random>.<issued-at ms>`; the database keeps
 * only `verify:<sha256(random)>.<issued-at ms>`, so someone who can read the table can't confirm an account.
 * (Password-reset tokens share the column with a "reset:" prefix and never match this form.)
 */

const sha = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

/** A fresh link token and the form to store. */
export function newVerifyToken(now = Date.now()): { link: string; stored: string } {
  const random = crypto.randomBytes(32).toString("hex");
  return { link: `${random}.${now}`, stored: `verify:${sha(random)}.${now}` };
}

/** The stored form of a token taken from a link, or null when it isn't one. */
export function storedVerifyToken(link: string): string | null {
  const [random, stamp, extra] = link.split(".");
  if (extra !== undefined || !/^[a-f0-9]{64}$/.test(random || "") || !/^\d{10,16}$/.test(stamp || "")) return null;
  return `verify:${sha(random)}.${stamp}`;
}

/** When the link was issued (ms), or null. */
export function verifyTokenIssuedAt(link: string): number | null {
  const stamp = Number(link.split(".")[1]);
  return Number.isFinite(stamp) && stamp > 0 ? stamp : null;
}
