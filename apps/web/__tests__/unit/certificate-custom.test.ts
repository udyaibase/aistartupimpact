import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { sanitizeCustomSvg } from '@/lib/events/certificate-custom-server';
import { CERTIFICATE_MARKERS, certificatePrompt, checkCustomSvg, fillMarkers, qrBox, viewBoxOf, MAX_CUSTOM_SVG } from '@/lib/events/certificate-custom';
import { certificateSettings } from '@/lib/events/after-event';
import { renderCertificatePdf } from '@/lib/events/certificate-pdf';

const GOOD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 842 595"><defs><linearGradient id="g"><stop offset="0" stop-color="#123"/></linearGradient></defs>
<rect width="842" height="595" fill="url(#g)"/><text x="421" y="300" text-anchor="middle" font-size="40">{{name}}</text><text x="421" y="340">{{event}}</text><rect id="qr" x="700" y="440" width="80" height="80" fill="none"/></svg>`;
const base = {
  title: 'Certificate of Completion', recipientName: 'Priya Sharma', eventTitle: 'Builders Day', dateLine: '21 November 2026', hostName: 'BAIC', logoUrl: null,
  signerName: 'Ritika', signerTitle: 'Founder', signatureUrl: null, code: 'HE7GEC54UM3Y7B3N', verifyUrl: 'https://udyaibase.com/verify/HE7GEC54UM3Y7B3N', showBranding: false,
};
const isPdf = (b: Uint8Array) => Buffer.from(b.slice(0, 5)).toString() === '%PDF-';
const errors = (svg: string) => checkCustomSvg(svg).filter((p) => p.level === 'error').map((p) => p.message);
const warnings = (svg: string) => checkCustomSvg(svg).filter((p) => p.level === 'warning').map((p) => p.message).join(' | ');

describe('a host’s own certificate design: cleaning pasted code', () => {
  it('keeps a plain drawing as it is: shapes, gradients, text, markers, SVG’s own spelling', () => {
    const clean = sanitizeCustomSvg(GOOD);
    for (const kept of ['viewBox="0 0 842 595"', '<linearGradient id="g">', 'url(#g)', 'text-anchor="middle"', '{{name}}', 'id="qr"']) expect(clean).toContain(kept);
    expect(clean.startsWith('<svg')).toBe(true);
    expect(clean.endsWith('</svg>')).toBe(true);
  });

  it('removes anything that could run', () => {
    const clean = sanitizeCustomSvg(GOOD.replace('<rect width', '<script>alert(1)</script><rect onclick="alert(2)" onload="x()" width').replace('<svg ', '<svg onload="alert(3)" '));
    expect(clean).not.toMatch(/<script|alert\(|onclick|onload/i);
    expect(clean).toContain('{{name}}');
  });

  it('removes embedded pages, animations and links', () => {
    const clean = sanitizeCustomSvg(GOOD.replace('</svg>', '<foreignObject><iframe src="https://evil.example"></iframe></foreignObject><a href="https://evil.example"><text>x</text></a><animate attributeName="x" to="9"/><set attributeName="y" to="1"/></svg>'));
    expect(clean).not.toMatch(/foreignObject|iframe|<a\b|animate|<set\b|evil\.example/i);
  });

  it('removes everything that reaches outside the design: other sites, files, fonts, styles', () => {
    const dirty = GOOD.replace('</svg>', `<image href="https://evil.example/a.png" width="5" height="5"/><image xlink:href="file:///etc/passwd" width="5" height="5"/>
      <use href="https://evil.example/x.svg#a"/><rect fill="url(https://evil.example/p.svg#g)" width="5" height="5"/><rect style="background:url(//evil.example/b)" width="5" height="5"/>
      <style>@import url(https://evil.example/f.css); text{font-family:x}</style></svg>`);
    const clean = sanitizeCustomSvg(dirty);
    expect(clean).not.toMatch(/evil\.example|file:|@import|\/etc\/passwd/i);
    expect(clean).toContain('url(#g)');
  });

  it('allows a small embedded PNG or JPEG, and links inside the design', () => {
    const clean = sanitizeCustomSvg(GOOD.replace('</svg>', '<image href="data:image/png;base64,iVBORw0KGgo=" width="5" height="5"/><use href="#g"/><image href="data:image/svg+xml;base64,PHN2Zz4=" width="5" height="5"/></svg>'));
    expect(clean).toContain('href="data:image/png;base64,iVBORw0KGgo="');
    expect(clean).toContain('href="#g"');
    expect(clean).not.toContain('image/svg+xml');
  });

  it('refuses entity tricks and things that aren’t SVG', () => {
    expect(sanitizeCustomSvg('<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg viewBox="0 0 1 1"><text>&xxe;{{name}}</text></svg>')).toBe('');
    expect(sanitizeCustomSvg('<div>hello</div>')).toBe('');
    expect(sanitizeCustomSvg('')).toBe('');
    expect(sanitizeCustomSvg(42)).toBe('');
    expect(sanitizeCustomSvg(`<svg viewBox="0 0 1 1">${'x'.repeat(MAX_CUSTOM_SVG + 10)}</svg>`)).toBe(''); // too large: refused whole, never cut short
  });
});

describe('a host’s own certificate design: telling the host what is wrong', () => {
  it('a good design has no errors', () => {
    expect(errors(GOOD)).toEqual([]);
    expect(warnings(GOOD)).toBe('');
  });
  it('explains each thing that stops a design being saved', () => {
    expect(errors('')[0]).toMatch(/Paste your design/);
    expect(errors('<html><body>cert</body></html>')[0]).toMatch(/isn’t SVG code/);
    expect(errors(GOOD.replace('{{name}}', 'Name'))[0]).toMatch(/Add \{\{name\}\}/);
    expect(errors(GOOD.replace(' viewBox="0 0 842 595"', ''))[0]).toMatch(/viewBox/);
    expect(errors(`<!DOCTYPE svg>${GOOD}`)[0]).toMatch(/DOCTYPE/);
  });
  it('warns about what will be removed or may look off', () => {
    expect(warnings(GOOD.replace('<rect width', '<script>x</script><rect width'))).toMatch(/Scripts are removed/);
    expect(warnings(GOOD.replace('</svg>', '<image href="https://x.example/a.png"/></svg>'))).toMatch(/other websites/);
    expect(warnings(GOOD.replace('0 0 842 595', '0 0 600 600'))).toMatch(/A4 landscape/);
    expect(warnings(GOOD.replace('{{event}}', '{{evnt}}'))).toMatch(/Unknown marker \{\{evnt\}\}/);
    expect(warnings(GOOD.replace(' id="qr"', ''))).toMatch(/QR code/);
  });
});

describe('a host’s own certificate design: filling it in', () => {
  it('every value is escaped, so a name can never add markup', () => {
    const out = fillMarkers('<text>{{name}}</text><text>{{ event }}</text><text>{{nope}}</text>', { name: '<script>alert(1)</script> & "Co"', event: 'A & B' });
    expect(out).toBe('<text>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Co&quot;</text><text>A &amp; B</text><text></text>');
  });
  it('finds where the design wants the QR code', () => {
    expect(qrBox(GOOD)).toEqual({ x: 700, y: 440, size: 80 });
    expect(qrBox(GOOD.replace(' id="qr"', ''))).toBeNull();
    expect(qrBox('<svg><rect id="qr" x="1" y="1" width="5" height="5"/></svg>')).toBeNull(); // too small to scan
    expect(viewBoxOf(GOOD)).toEqual({ x: 0, y: 0, width: 842, height: 595 });
    expect(viewBoxOf('<svg>')).toMatchObject({ width: 842, height: 595 });
  });
  it('the prompt names every rule the cleaner enforces, and the markers', () => {
    const prompt = certificatePrompt('Builders Day');
    for (const need of ['viewBox="0 0 842 595"', '{{name}}', '{{event}}', 'id="qr"', 'No <script>', 'Builders Day']) expect(prompt).toContain(need);
    for (const m of prompt.match(/\{\{([a-z_]+)\}\}/g) ?? []) expect(Object.keys(CERTIFICATE_MARKERS)).toContain(m.slice(2, -2));
  });
});

describe('a host’s own certificate design: the certificate', () => {
  it('draws a PDF from the design, and a larger one than a built-in design (it is a picture)', async () => {
    const custom = await renderCertificatePdf({ ...base, template: 'custom', customSvg: GOOD });
    const classic = await renderCertificatePdf({ ...base, template: 'classic' });
    expect(isPdf(custom)).toBe(true);
    expect(custom.length).toBeGreaterThan(classic.length);
  });
  it('falls back to Classic when the design can’t be drawn, rather than failing', async () => {
    const pdf = await renderCertificatePdf({ ...base, template: 'custom', customSvg: '<div>not a design</div>' });
    expect(isPdf(pdf)).toBe(true);
  });
  it('“Your own” with nothing pasted is saved as Classic', () => {
    expect(certificateSettings({ template: 'custom' }).template).toBe('classic');
    expect(certificateSettings({ template: 'custom', customSvg: GOOD }).template).toBe('custom');
  });
  it('the save route cleans the design and refuses one with errors', () => {
    const route = readFileSync(resolve(__dirname, '../../app/api/organizer/events/[eventId]/after-event/route.ts'), 'utf8');
    expect(route).toContain('sanitizeCustomSvg(pasted)');
    expect(route).toContain("field: 'customSvg'");
  });
});

describe('brand logo on certificates', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('settings: position and size from a fixed list; logos must be https', () => {
    const s = certificateSettings({ logoUrl: 'https://media.udyaibase.com/l.png', partnerLogoUrl: 'http://x/p.png', logoPosition: 'diagonal', logoSize: 'huge', showHostName: 'yes' });
    expect(s).toMatchObject({ logoUrl: 'https://media.udyaibase.com/l.png', partnerLogoUrl: null, logoPosition: 'center', logoSize: 'medium', showHostName: false });
    expect(certificateSettings({ logoPosition: 'left', logoSize: 'large', showHostName: true })).toMatchObject({ logoPosition: 'left', logoSize: 'large', showHostName: true });
  });

  it('settings: the size slider and fine position are kept inside their limits', () => {
    expect(certificateSettings({})).toMatchObject({ logoHeight: null, logoOffsetX: 0, logoOffsetY: 0, logoPlate: true });
    expect(certificateSettings({ logoHeight: 500, logoOffsetX: -999, logoOffsetY: 999, logoPlate: false })).toMatchObject({ logoHeight: 74, logoOffsetX: -140, logoOffsetY: 40, logoPlate: false });
    expect(certificateSettings({ logoHeight: 3, logoOffsetX: 12.6, logoOffsetY: 'abc' })).toMatchObject({ logoHeight: 24, logoOffsetX: 13, logoOffsetY: 0 });
    expect(certificateSettings({ logoHeight: 'big' }).logoHeight).toBeNull();
  });

  it('a logo from another website is dropped when the host saves', () => {
    const route = readFileSync(resolve(__dirname, '../../app/api/organizer/events/[eventId]/after-event/route.ts'), 'utf8');
    expect(route).toContain("for (const key of ['logoUrl', 'partnerLogoUrl', 'signatureUrl'] as const)");
    expect(route).toContain('!isOwnMediaUrl(asked[key] as string)) asked[key] = null');
  });

  it('draws one or two logos in each position on every design, fetching only from our own media', async () => {
    const png = await sharp({ create: { width: 300, height: 120, channels: 4, background: '#1d4ed8' } }).png().toBuffer();
    const asked: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { asked.push(url); return new Response(png, { status: 200 }); }));
    const own = 'https://media.udyaibase.com/logo.png';
    const plain = await renderCertificatePdf({ ...base, template: 'heritage' });
    for (const logoPosition of ['center', 'left', 'right'] as const) {
      const pdf = await renderCertificatePdf({ ...base, template: 'heritage', logoUrl: own, partnerLogoUrl: own, logoPosition, logoSize: 'large', showHostName: true });
      expect(isPdf(pdf), logoPosition).toBe(true);
      expect(pdf.length, logoPosition).toBeGreaterThan(plain.length);
    }
    const onCustom = await renderCertificatePdf({ ...base, template: 'custom', customSvg: GOOD, logoUrl: own });
    expect(isPdf(onCustom)).toBe(true);
    asked.length = 0;
    await renderCertificatePdf({ ...base, template: 'classic', logoUrl: 'https://evil.example/logo.png', partnerLogoUrl: 'http://media.udyaibase.com/x.png' });
    expect(asked).toEqual([]);
  });
});

describe('uploading a logo or signature: the cropper', () => {
  it('says plainly why a file can’t be used', async () => {
    const { imageFileProblem } = await import('@/components/ui/ImageDropField');
    expect(imageFileProblem({ type: 'image/png', size: 1000 })).toBe('');
    expect(imageFileProblem({ type: 'application/pdf', size: 1000 })).toMatch(/PNG, JPG or WebP/);
    expect(imageFileProblem({ type: 'image/svg+xml', size: 1000 })).toMatch(/PNG, JPG or WebP/);
    expect(imageFileProblem({ type: 'image/jpeg', size: 6 * 1024 * 1024 })).toMatch(/5 MB/);
  });

  it('“make white see-through” clears white paper, softens the edge, and leaves ink alone', async () => {
    const { whiteToAlpha } = await import('@/components/ui/ImageDropField');
    expect(whiteToAlpha(255, 255, 255, 255)).toBe(0);
    expect(whiteToAlpha(250, 248, 246, 255)).toBe(0);
    expect(whiteToAlpha(20, 20, 60, 255)).toBe(255);           // dark ink
    expect(whiteToAlpha(255, 255, 40, 255)).toBe(255);         // a bright colour is not white
    const edge = whiteToAlpha(225, 225, 225, 255);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
    expect(whiteToAlpha(10, 10, 10, 120)).toBe(120);           // already part see-through stays so
  });

  it('starts on the picture’s content, not its empty edges', async () => {
    const { contentBox } = await import('@/components/ui/ImageDropField');
    const w = 20, h = 10;
    const px = new Uint8ClampedArray(w * h * 4).fill(255);     // a white page
    for (let y = 3; y <= 6; y++) for (let x = 5; x <= 14; x++) { const i = (y * w + x) * 4; px[i] = 20; px[i + 1] = 30; px[i + 2] = 200; }
    expect(contentBox(px, w, h)).toEqual({ x: 5, y: 3, w: 10, h: 4 });
    expect(contentBox(new Uint8ClampedArray(w * h * 4).fill(255), w, h)).toBeNull();   // nothing but white
    expect(contentBox(new Uint8ClampedArray(w * h * 4), w, h)).toBeNull();             // nothing but see-through
  });

  it('the form uses the drop-and-crop field for both logos and the signature, with a red remove icon', () => {
    const form = readFileSync(resolve(__dirname, '../../app/organizer/events/[eventId]/after/AfterEventClient.tsx'), 'utf8');
    expect((form.match(/<ImageDropField /g) ?? []).length).toBe(3);
    expect(form).toContain('removeWhiteByDefault');
    expect(form).not.toContain('>Remove</button>');
    const field = readFileSync(resolve(__dirname, '../../components/ui/ImageDropField.tsx'), 'utf8');
    expect(field).toContain('<Trash2');
    expect(field).toContain('text-red-600');
    expect(field).toContain('onDrop=');
    expect(field).toContain('onPaste=');
  });

  it('the design choice is called Custom and every choice shows the real design', () => {
    const form = readFileSync(resolve(__dirname, '../../app/organizer/events/[eventId]/after/AfterEventClient.tsx'), 'utf8');
    expect(form).toContain("{ id: 'custom', name: 'Custom'");
    expect(form).not.toContain('Your own');
    expect(form).toContain('<CertificatePreview {...previewProps} template={t.id} />');
  });
});
