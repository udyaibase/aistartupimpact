import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { certificateSettings, CERTIFICATE_TEMPLATES, CERTIFICATE_PHRASES, MAX_CERTIFICATE_SKILLS } from '@/lib/events/after-event';
import { renderCertificatePdf } from '@/lib/events/certificate-pdf';

const base = {
  title: 'Certificate of Completion', recipientName: 'Priya Sharma', eventTitle: 'Bengaluru AI Builders Day', dateLine: '21 November 2026 · Bengaluru · 6 hours',
  hostName: 'Bengaluru AI Collective', logoUrl: null, signerName: 'Ritika Desai', signerTitle: 'Founder', signatureUrl: null,
  code: 'HE7GEC54UM3Y7B3N', verifyUrl: 'https://udyaibase.com/verify/HE7GEC54UM3Y7B3N', showBranding: false,
};
const isPdf = (b: Uint8Array) => Buffer.from(b.slice(0, 5)).toString() === '%PDF-';

describe('certificate designs', () => {
  it('there are six built in (plus the host’s own), and each draws a PDF with and without the extra details', async () => {
    expect([...CERTIFICATE_TEMPLATES]).toEqual(['classic', 'modern', 'minimal', 'executive', 'heritage', 'tech', 'custom']);
    for (const template of CERTIFICATE_TEMPLATES.filter((t) => t !== 'custom')) {
      const plain = await renderCertificatePdf({ ...base, template });
      const full = await renderCertificatePdf({ ...base, template, phrase: 'successfully completed', description: 'A hands-on day of building AI agents.', skills: ['Prompt design', 'RAG pipelines', 'Evaluation'] });
      expect(isPdf(plain), template).toBe(true);
      expect(isPdf(full), template).toBe(true);
      expect(full.length, template).toBeGreaterThan(plain.length);
    }
  });

  it('the longest allowed text still draws: long names, two-line titles, six topics', async () => {
    const pdf = await renderCertificatePdf({
      ...base, template: 'heritage', recipientName: 'Venkata Subramanian Ramachandran Krishnamurthy Iyer',
      eventTitle: 'International Conference on Applied Machine Learning, Generative AI and Responsible Deployment 2026',
      description: 'x'.repeat(40) + ' ' + 'word '.repeat(24), skills: Array.from({ length: 6 }, (_, i) => `A fairly long topic name ${i}`), showBranding: true,
    });
    expect(isPdf(pdf)).toBe(true);
  });

  it('a design saved before these fields existed still works', () => {
    const s = certificateSettings({ template: 'modern', title: 'Certificate of Participation', signerName: 'R' });
    expect(s).toMatchObject({ template: 'modern', phrase: 'participated', description: '', skills: [], duration: '' });
  });
});

describe('what the host may put on a certificate', () => {
  it('an unknown design falls back to Classic; an unknown wording to "participated in"', () => {
    const s = certificateSettings({ template: 'rainbow', phrase: 'invented' });
    expect(s.template).toBe('classic');
    expect(CERTIFICATE_PHRASES[s.phrase]).toBe('participated in');
  });

  it('topics: typed with commas or as a list, trimmed, no repeats, at most six, each short', () => {
    expect(certificateSettings({ skills: ' Prompt design , RAG,  rag , Evaluation,, ' }).skills).toEqual(['Prompt design', 'RAG', 'Evaluation']);
    expect(certificateSettings({ skills: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] }).skills).toHaveLength(MAX_CERTIFICATE_SKILLS);
    expect(certificateSettings({ skills: ['x'.repeat(80)] }).skills[0]).toHaveLength(32);
    expect(certificateSettings({ skills: 42 }).skills).toEqual([]);
  });

  it('the sentence about the event is one line of at most 160 characters; the duration is short', () => {
    const s = certificateSettings({ description: `  Line one\n\nline   two ${'z'.repeat(300)}`, duration: 'd'.repeat(60) });
    expect(s.description.startsWith('Line one line two')).toBe(true);
    expect(s.description.length).toBeLessThanOrEqual(160);
    expect(s.duration).toHaveLength(24);
  });

  it('the form offers every design and wording, and survives an older saved design', () => {
    const form = readFileSync(resolve(__dirname, '../../app/organizer/events/[eventId]/after/AfterEventClient.tsx'), 'utf8');
    for (const t of CERTIFICATE_TEMPLATES) expect(form).toContain(`id: '${t}'`);
    for (const p of Object.keys(CERTIFICATE_PHRASES)) expect(form).toContain(`id: '${p}'`);
    expect(form).toMatch(/\{ phrase: 'participated', description: '', skills: \[\], duration: '',[^}]*\.\.\.d\.certificates\.settings \}/);
  });
});
