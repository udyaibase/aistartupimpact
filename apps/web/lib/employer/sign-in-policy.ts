/** Client-safe sign-in policy (used by the login page and the password route). */

/** Password sign-in ends at the start of this day (India time); afterwards the email code is the only way in. */
export const PASSWORD_SIGNIN_UNTIL = new Date('2026-12-31T00:00:00+05:30');
export const passwordSignInOpen = (now = Date.now()) => now < PASSWORD_SIGNIN_UNTIL.getTime();
