/**
 * The message it is safe to show an admin for a caught error.
 *
 * Messages we wrote ourselves ("Add a title first", "Unauthorized") pass through. Anything that looks like it came
 * from the database, the network or a library (table and column names, query text, connection strings, stack
 * traces) is logged on the server and replaced with a plain sentence, so internals never reach the browser.
 */
const GENERIC = 'Something went wrong on our side. Please try again.';

const INTERNAL = [
  /prisma/i, /\bsql\b/i, /\bquery\b/i, /relation ["“]/i, /column ["“]/i, /constraint/i, /violates/i, /syntax error/i,
  /invalid input/i, /\binvocation\b/i, /ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket|fetch failed/i, /postgres|neon\.tech|database/i,
  /\bat\s+\S+\s+\(/, /node_modules/, /undefined|null \(reading|is not a function|is not defined|Cannot read/i, /JSON/,
  /\bP\d{4}\b/, /:\/\/\S+:\S+@/, // Prisma error codes; anything shaped like a URL with credentials
];

export function publicError(error: unknown, fallback: string = GENERIC): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const name = error instanceof Error ? error.constructor.name : '';
  const internal = !message || message.length > 200 || message.includes('\n') || /Prisma|Neon|Database|Syntax|Type|Reference|Range/.test(name) || INTERNAL.some((re) => re.test(message));
  if (!internal) return message;
  console.error('[admin] internal error hidden from the response:', error);
  return fallback;
}
