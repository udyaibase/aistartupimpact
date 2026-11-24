import { describe, it, expect } from 'vitest';
import { writeFileSync, readFileSync } from 'fs';
import { renderBadgesPdf } from '@/lib/events/badges';
import { BADGE_TEMPLATES, DEFAULT_BADGE_SETTINGS } from '@/lib/events/badge-settings';

const OUT = process.env.BADGE_SAMPLES_DIR;
const people = [
  { name: 'Meera Kulkarni', company: 'Krishi Mitra AI', occupation: 'Founder & CEO', tier: 'Speaker', tierId: 't1', qrToken: 'tok-1', answers: { q1: 'L', q2: 'Vegetarian' } },
  { name: 'Venkata Subramanian Raghavendran Iyer', company: 'A Very Long Company Name Private Limited', occupation: 'Principal Machine Learning Engineer', tier: 'General admission', tierId: 't2', qrToken: 'tok-2' },
  { name: 'Ana', company: null, occupation: null, tier: null, qrToken: null },
];

describe('badge PDFs render for every template, size and option', () => {
  for (const template of BADGE_TEMPLATES) {
    for (const layout of ['a4', 'label', 'a6', 'card'] as const) {
      it(`${template} / ${layout}`, async () => {
        const pdf = await renderBadgesPdf({
          eventTitle: 'Bengaluru AI Builders Meetup', eventDate: '14 December 2026', layout, people,
          design: { settings: { ...DEFAULT_BADGE_SETTINGS, template, accent: '#4F46E5' }, logoUrl: null, sponsorLogoUrls: [], questionLabels: {} },
        });
        expect(pdf.byteLength).toBeGreaterThan(1000);
        if (OUT) writeFileSync(`${OUT}/${template}-${layout}.pdf`, pdf);
      });
    }
  }

  it('Pro options: ticket colours, chosen fields, answers, text position', async () => {
    const pdf = await renderBadgesPdf({
      eventTitle: 'Bengaluru AI Builders Meetup', eventDate: '14 December 2026', layout: 'a6', people,
      design: {
        settings: { ...DEFAULT_BADGE_SETTINGS, template: 'conference', accent: '#0F766E', tierColors: { t1: '#DC2626', t2: '#2563EB' },
          fields: { company: true, role: true, tier: true, qr: true }, questionIds: ['q1', 'q2'], textPosition: 'center' },
        logoUrl: null, sponsorLogoUrls: [], questionLabels: { q1: 'T-shirt', q2: 'Food' },
      },
    });
    expect(pdf.byteLength).toBeGreaterThan(1000);
    if (OUT) writeFileSync(`${OUT}/pro-conference-a6.pdf`, pdf);
  });

  for (const qrPosition of ['left', 'right'] as const) {
    for (const layout of ['a6', 'label'] as const) {
      it(`QR ${qrPosition} / ${layout}`, async () => {
        const pdf = await renderBadgesPdf({
          eventTitle: 'Bengaluru AI Builders Meetup', eventDate: '14 December 2026', layout, people,
          design: { settings: { ...DEFAULT_BADGE_SETTINGS, template: 'classic', qrPosition }, logoUrl: null, sponsorLogoUrls: [], questionLabels: {} },
        });
        expect(pdf.byteLength).toBeGreaterThan(1000);
        if (OUT) writeFileSync(`${OUT}/qr-${qrPosition}-${layout}.pdf`, pdf);
      });
    }
  }

  const OWN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 298 420">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f172a"/><stop offset="1" stop-color="#312e81"/></linearGradient></defs>
    <rect width="298" height="420" fill="url(#g)"/><circle cx="260" cy="40" r="70" fill="#6366f1" opacity="0.35"/>
    <text x="24" y="40" font-size="12" fill="#c7d2fe" font-weight="700">{{event}}</text>
    <text x="24" y="56" font-size="10" fill="#a5b4fc">{{date}}</text>
    <text x="149" y="170" font-size="30" font-weight="700" fill="#ffffff" text-anchor="middle">{{name}}</text>
    <text x="149" y="196" font-size="13" fill="#e0e7ff" text-anchor="middle">{{role}} at {{company}}</text>
    <rect x="94" y="250" width="110" height="110" id="qr" fill="#ffffff"/>
    <text x="149" y="395" font-size="12" font-weight="700" fill="#fde68a" text-anchor="middle">{{ticket}}</text></svg>`;
  for (const layout of ['a6', 'a4', 'card'] as const) {
    it(`own design / ${layout}`, async () => {
      const pdf = await renderBadgesPdf({
        eventTitle: 'Bengaluru AI Builders Meetup', eventDate: '14 December 2026', layout, people,
        design: { settings: { ...DEFAULT_BADGE_SETTINGS, template: 'custom', customSvg: OWN }, logoUrl: null, sponsorLogoUrls: [], questionLabels: {} },
      });
      expect(pdf.byteLength).toBeGreaterThan(5000);
      if (OUT) writeFileSync(`${OUT}/own-${layout}.pdf`, pdf);
    });
  }
});
