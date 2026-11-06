import crypto from 'crypto';

/** Reset links carry the token; only its hash is stored, so a database leak exposes no working link. */
export const hashResetToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
