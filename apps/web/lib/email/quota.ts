/** Resend errors that mean the plan's sending limit (or rate limit) was hit. */
export function isQuotaError(message: string) {
  return /quota|rate limit|too many requests|daily_quota|monthly_quota|429/i.test(message);
}
