/** "priya@acme.ai" → "pr***@acme.ai": shows where a code went without printing the whole address. */
export function maskEmail(email: string): string {
  const e = email.trim();
  const at = e.lastIndexOf('@');
  if (at < 1) return e;
  const local = e.slice(0, at);
  return `${local.slice(0, Math.min(2, local.length))}***${e.slice(at)}`;
}

/** 42 → "0:42", 75 → "1:15". */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
