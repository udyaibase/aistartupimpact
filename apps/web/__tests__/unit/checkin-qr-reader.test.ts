import { describe, it, expect } from 'vitest';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { parseScanValue } from '@/lib/events/checkin-rules';

/** The fallback reader used on iPhone and iPad (no BarcodeDetector) reads our ticket QR codes. */
function toPixels(text: string, scale = 6) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size, quiet = 4, size = (n + quiet * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!qr.modules.get(y, x)) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const i = (((y + quiet) * scale + dy) * size + (x + quiet) * scale + dx) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
  }
  return { data, size };
}

describe('check-in QR fallback reader (jsQR)', () => {
  it('reads a ticket QR and the scan value parses to the same token', () => {
    const token = '0b8f2c6e-6a1d-4c49-9d8e-3f0a7b5c2e11';
    for (const content of [token, `https://udyaibase.com/check-in/${token}`]) {
      const { data, size } = toPixels(content);
      const hit = jsQR(data, size, size, { inversionAttempts: 'dontInvert' });
      expect(hit?.data).toBe(content);
      expect(parseScanValue(hit!.data)).toBe(parseScanValue(content));
    }
  });
  it('returns nothing for a frame without a code', () => {
    const blank = new Uint8ClampedArray(200 * 200 * 4).fill(255);
    expect(jsQR(blank, 200, 200)).toBeNull();
  });
});
