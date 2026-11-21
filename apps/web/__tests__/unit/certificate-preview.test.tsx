import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CertificatePreview from '@/app/organizer/events/[eventId]/after/CertificatePreview';
import { CERTIFICATE_TEMPLATES } from '@/lib/events/after-event';
import { CERTIFICATE_THEMES } from '@/lib/events/certificate-themes';

const props = {
  title: 'Certificate of Completion', phrase: 'successfully completed', description: 'A hands-on day of building AI agents.',
  skills: ['Prompt design', ' RAG pipelines ', ''], dateLine: '21 November 2026 · Bengaluru · 6 hours', eventTitle: 'Bengaluru AI Builders Day',
  hostName: 'Bengaluru AI Collective', logoUrl: null, signerName: 'Ritika Desai', signerTitle: 'Founder', signatureUrl: null, sampleName: 'Priya Sharma',
};
const draw = (extra: Record<string, unknown>) => renderToStaticMarkup(createElement(CertificatePreview, { ...props, template: 'classic', ...extra } as never));

describe('live certificate preview in the host form', () => {
  it('draws every design with what the host typed', () => {
    for (const template of CERTIFICATE_TEMPLATES.filter((t) => t !== 'custom')) {
      const svg = draw({ template });
      expect(svg, template).toContain(`Preview of the certificate in the ${template} design`);
      for (const text of ['CERTIFICATE OF COMPLETION', 'Priya Sharma', 'successfully completed', 'Bengaluru AI Builders Day', '6 hours', 'A hands-on day of building AI agents.', 'TOPICS COVERED', 'Ritika Desai']) {
        expect(svg, `${template}: ${text}`).toContain(text);
      }
      expect(svg, template).toContain('Prompt design   ·   RAG pipelines');
    }
  });

  it('leaves out what the host left empty, and falls back like the PDF does', () => {
    const svg = draw({ description: '', skills: [], phrase: '', title: '', signerName: '', signerTitle: '' });
    expect(svg).not.toContain('TOPICS COVERED');
    expect(svg).toContain('participated in');
    expect(svg).toContain('CERTIFICATE OF PARTICIPATION');
    expect(svg).toContain('Organizer');
  });

  it('text the host types cannot become markup', () => {
    const svg = draw({ title: '<script>alert(1)</script>', description: '<img src=x onerror=alert(1)>' });
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('<img');
  });

  it('uses the same colours as the PDF: one shared list of designs', () => {
    expect(Object.keys(CERTIFICATE_THEMES).sort()).toEqual([...CERTIFICATE_TEMPLATES].sort());
    const pdf = readFileSync(resolve(__dirname, '../../lib/events/certificate-pdf.ts'), 'utf8');
    expect(pdf).toContain('Object.entries(CERTIFICATE_THEMES)');
    const navy = CERTIFICATE_THEMES.executive.bg.map((c) => Math.round(c * 255)).join(', ');
    expect(draw({ template: 'executive' })).toContain(`fill="rgb(${navy})"`);
  });

  it('is shown in the form and fed from the fields as they are typed', () => {
    const form = readFileSync(resolve(__dirname, '../../app/organizer/events/[eventId]/after/AfterEventClient.tsx'), 'utf8');
    expect(form).toContain('<CertificatePreview');
    expect(form).toContain("skills: (skillsText ?? '').split(','),");
    expect(form).toContain('<CertificatePreview {...previewProps} template={cert.template} />');
  });

  it('a host’s own design is shown as a picture, with example values in its markers', () => {
    const own = '<svg viewBox="0 0 842 595"><text>{{name}}</text><text>{{event}}</text><rect id="qr" x="700" y="440" width="80" height="80"/></svg>';
    const html = draw({ template: 'custom', customSvg: own });
    expect(html).toContain('alt="Preview of your custom certificate design"');
    expect(html).toContain('src="data:image/svg+xml');
    expect(decodeURIComponent(html)).toContain('<text>Priya Sharma</text>');
    expect(decodeURIComponent(html)).toContain('<text>Bengaluru AI Builders Day</text>');
    expect(html).not.toContain('<script');
    // Nothing pasted yet: a prompt to paste, not a broken picture.
    expect(draw({ template: 'custom', customSvg: '' })).toContain('Paste your design');
  });

  it('Tech design: the dark band grows to hold a logo, so the title is never left outside it', () => {
    const bandOf = (html: string) => Number(/<rect x="0" y="0" width="842" height="([\d.]+)" fill="rgb\(15, 23, 42\)"/.exec(html)?.[1]);
    const titleY = (html: string) => Number(/<text x="421" y="([\d.]+)"[^>]*>CERTIFICATE OF COMPLETION/.exec(html)?.[1]);
    const plain = draw({ template: 'tech' });
    const withLogo = draw({ template: 'tech', logoUrl: 'https://media.udyaibase.com/a.png', logoHeight: 74, showHostName: true, description: '', skills: [] });
    expect(bandOf(withLogo)).toBeGreaterThan(bandOf(plain));
    for (const html of [plain, withLogo]) expect(titleY(html)).toBeLessThan(bandOf(html));
    // A white plate sits behind the logo on the band; it can be switched off.
    expect(withLogo).toContain('rx="6" fill="#fff"');
    expect(draw({ template: 'tech', logoUrl: 'https://media.udyaibase.com/a.png', logoPlate: false })).not.toContain('rx="6" fill="#fff"');
    expect(draw({ template: 'classic', logoUrl: 'https://media.udyaibase.com/a.png' })).not.toContain('rx="6" fill="#fff"');
  });

  it('logo size and fine position move the logo in the preview', () => {
    const at = (extra: Record<string, unknown>) => { const m = /<image href="[^"]+" x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)"/.exec(draw({ template: 'classic', logoUrl: 'https://media.udyaibase.com/a.png', description: '', skills: [], ...extra }))!; return { x: +m[1], y: +m[2], h: +m[4] }; };
    const base = at({});
    expect(at({ logoHeight: 30 }).h).toBeLessThan(base.h);
    expect(at({ logoOffsetX: 40 }).x).toBeCloseTo(base.x + 40, 1);
    expect(at({ logoOffsetY: 12 }).y).toBeCloseTo(base.y + 12, 1);
    expect(at({ logoPosition: 'left' }).x).toBeLessThan(base.x);
    expect(at({ logoPosition: 'right' }).x).toBeGreaterThan(base.x);
  });

  it('shows the logo and a partner logo', () => {
    const svg = draw({ template: 'heritage', logoUrl: 'https://media.udyaibase.com/a.png', partnerLogoUrl: 'https://media.udyaibase.com/b.png', showHostName: true });
    expect(svg).toContain('href="https://media.udyaibase.com/a.png"');
    expect(svg).toContain('href="https://media.udyaibase.com/b.png"');
    expect(svg).toContain('BENGALURU AI COLLECTIVE');
    expect(draw({ template: 'heritage', logoUrl: 'https://media.udyaibase.com/a.png' })).not.toContain('BENGALURU AI COLLECTIVE');
  });
});
