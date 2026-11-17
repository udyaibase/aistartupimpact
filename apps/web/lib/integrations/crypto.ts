import crypto from 'crypto';

/**
 * Encryption for third-party tokens at rest (AES-256-GCM). The key is derived from ENCRYPTION_KEY with a purpose
 * label, so it never equals the key used for anything else.
 */

function key(): Buffer {
  const base = process.env.ENCRYPTION_KEY;
  if (!base) throw new Error('ENCRYPTION_KEY is not set');
  return Buffer.from(crypto.hkdfSync('sha256', base, 'udyaibase', 'meeting-integrations-v1', 32));
}

export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

export function decryptToken(stored: string): string {
  const [v, iv, tag, body] = stored.split('.');
  if (v !== 'v1' || !iv || !tag || !body) throw new Error('Unknown token format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
}
