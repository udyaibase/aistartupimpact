import { describe, it, expect, vi, beforeEach } from 'vitest';

const ai = vi.hoisted(() => ({ openaiChat: vi.fn(), modelOptions: () => ({ temperature: 0 }) }));
const db = vi.hoisted(() => ({
  jobBoardApplication: { findUnique: vi.fn() },
  jobBoardResumeProfile: { findFirst: vi.fn(async (): Promise<any> => null), upsert: vi.fn(async () => ({})) },
}));
const files = vi.hoisted(() => ({ readResume: vi.fn() }));
vi.mock('@/lib/ops/ai', () => ai);
vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/jobs/resume-storage', () => files);

import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  buildProfile, checkStructure, detectSections, getResumeProfile, monthsOf, parseDatePoint, parseDateRange, redactLines, workExperience,
} from '@/lib/jobs/resume-profile';
import type { ExtractedResume } from '@/lib/jobs/resume-extract';

const NOW = { y: 2026, m: 11 };

const LINES = [
  'Asha Verma', 'asha@example.com | +91 98765 43210 | linkedin.com/in/asha', 'EXPERIENCE',
  'ML Engineer, Acme AI', 'Jan 2022 - Present', 'Built RAG search over 2M legal documents with PyTorch',
  'Data Analyst, Beta Corp', '2019 - 2021', 'Cut weekly report time by 40% using Python and SQL',
  'Summer Intern, Gamma Labs', 'May 2018 - Jul 2018', 'Labelled data', 'EDUCATION', 'B.Tech Computer Science, NIT Trichy', '2014 - 2018',
  'SKILLS', 'Python, PyTorch, SQL, Docker',
];
const extracted = (lines = LINES): ExtractedResume => ({
  version: 'x', format: 'pdf', lines, pageCount: 1, pagesRead: 1, lowTextPages: [], twoColumnPages: [], chars: lines.join('').length,
  contacts: { emails: ['asha@example.com'], phones: ['+91 98765 43210'], links: ['linkedin.com/in/asha'] },
});
const goodModelOutput = {
  sections: [{ kind: 'experience', start: 3, end: 12 }, { kind: 'education', start: 13, end: 15 }, { kind: 'skills', start: 16, end: 17 }],
  roles: [
    { title: 'ML Engineer', company: 'Acme AI', dateText: 'Jan 2022 - Present', headerLines: [4, 5], bulletLines: [6] },
    { title: 'Data Analyst', company: 'Beta Corp', dateText: '2019 - 2021', headerLines: [7, 8], bulletLines: [9] },
    { title: 'Summer Intern', company: 'Gamma Labs', dateText: 'May 2018 - Jul 2018', headerLines: [10, 11], bulletLines: [12] },
  ],
  projects: [], education: [{ degree: 'B.Tech Computer Science', institution: 'NIT Trichy', dateText: '2014 - 2018', lines: [14, 15] }],
  certifications: [], skillLines: [17],
};
const reply = (o: unknown) => ({ choices: [{ message: { content: JSON.stringify(o) } }] });

beforeEach(() => { vi.clearAllMocks(); db.jobBoardResumeProfile.findFirst.mockResolvedValue(null); });

describe('dates', () => {
  it('reads the common formats', () => {
    expect(parseDatePoint('Jan 2022')).toEqual({ y: 2022, m: 1 });
    expect(parseDatePoint("Sept '19")).toEqual({ y: 2019, m: 9 });
    expect(parseDatePoint('03/2020')).toEqual({ y: 2020, m: 3 });
    expect(parseDatePoint('2021-07')).toEqual({ y: 2021, m: 7 });
    expect(parseDatePoint('Till date')).toBe('present');
    expect(parseDatePoint('Acme')).toBeNull();
  });

  it('reads ranges, including unspaced hyphens, without breaking 2022-01 style dates', () => {
    expect(parseDateRange('Jan 2022 – Present')).toEqual({ start: { y: 2022, m: 1 }, end: 'present' });
    expect(parseDateRange('2019-2021')).toEqual({ start: { y: 2019, m: 1 }, end: { y: 2021, m: 12 } });
    expect(parseDateRange('Jan 2020-Mar 2021')).toEqual({ start: { y: 2020, m: 1 }, end: { y: 2021, m: 3 } });
    expect(parseDateRange('2022-01 to 2023-05')).toEqual({ start: { y: 2022, m: 1 }, end: { y: 2023, m: 5 } });
    expect(parseDateRange('03/2020 - 08/2022 (2 yrs 6 mos)')).toEqual({ start: { y: 2020, m: 3 }, end: { y: 2022, m: 8 } });
    expect(monthsOf(parseDateRange('Jan 2022 - Mar 2022'), NOW)).toBe(3);
  });
});

describe('experience from dates', () => {
  const role = (s: string, internship = false) => ({ range: parseDateRange(s), internship });

  it('counts overlapping jobs once and keeps internships apart', () => {
    const e = workExperience([role('Jan 2020 - Dec 2021'), role('Jun 2021 - Dec 2022'), role('May 2018 - Jul 2018', true)], NOW);
    expect(e.months).toBe(36); // Jan 2020 – Dec 2022
    expect(e.internMonths).toBe(3);
    expect(e.years).toBe(3);
  });

  it('lists gaps of 3+ months for the timeline only', () => {
    const e = workExperience([role('Jan 2018 - Dec 2019'), role('Jan 2021 - Present'), role('Jan 2020 - Feb 2020')], NOW);
    expect(e.gaps).toEqual([{ from: { y: 2020, m: 3 }, to: { y: 2020, m: 12 }, months: 10 }]);
  });

  it('roles without dates count as roles but add no months', () => {
    const e = workExperience([role(''), role('2020 - 2020')], NOW);
    expect(e).toMatchObject({ months: 12, roles: 2, datedRoles: 1 });
  });
});

describe('identity removal', () => {
  it('replaces the extractor’s contacts and the name, before any model call', () => {
    const out = redactLines(LINES.slice(0, 2), extracted().contacts, 'Asha Verma');
    expect(out).toEqual(['[name] [name]', '[email] | [phone] | [link]']);
  });
});

describe('sections by pattern', () => {
  it('finds headings and where each one ends', () => {
    expect(detectSections(LINES)).toEqual([
      { kind: 'experience', start: 3, end: 12 }, { kind: 'education', start: 13, end: 15 }, { kind: 'skills', start: 16, end: 17 },
    ]);
  });
});

describe('checking the model’s structure', () => {
  it('keeps what the lines back up and works out experience from the dates', () => {
    const p = checkStructure(goodModelOutput, LINES, NOW);
    expect(p.roles.map((r) => [r.title, r.company, r.months, r.internship])).toEqual([
      ['ML Engineer', 'Acme AI', 59, false], ['Data Analyst', 'Beta Corp', 36, false], ['Summer Intern', 'Gamma Labs', 3, true],
    ]);
    expect(p.experience).toMatchObject({ months: 95, internMonths: 3, years: 7.9 });
    expect(p.education[0]).toMatchObject({ degree: 'B.Tech Computer Science', institution: 'NIT Trichy', endYear: 2018 });
  });

  it('drops invented text and line numbers that don’t exist', () => {
    const p = checkStructure({
      ...goodModelOutput,
      roles: [
        // Title and company not on the cited lines, dates invented: all emptied; bad line numbers dropped.
        { title: 'Principal Scientist', company: 'Google', dateText: '2010 - Present', headerLines: [4, 99, -1], bulletLines: [6, 6, 1000] },
        // Points at nothing real: removed entirely.
        { title: 'CTO', company: 'Unicorn', dateText: '', headerLines: [500], bulletLines: [] },
      ],
      skillLines: [17, 0, 42],
    }, LINES, NOW);
    expect(p.roles).toHaveLength(1);
    expect(p.roles[0]).toMatchObject({ title: '', company: '', dateText: '', months: null, headerLines: [4], bulletLines: [6] });
    expect(p.skillLines).toEqual([17]);
    expect(p.experience.months).toBe(0);
  });

  it('keeps the company out of the title, whichever way the model returns it', () => {
    const lines = ['Backend Engineer, Razorpay', 'Jan 2021 - Present', 'Built APIs'];
    const both = checkStructure({ ...goodModelOutput, roles: [{ title: 'Backend Engineer, Razorpay', company: 'Razorpay', dateText: 'Jan 2021 - Present', headerLines: [1, 2], bulletLines: [3] }] }, lines, NOW);
    const noCompany = checkStructure({ ...goodModelOutput, roles: [{ title: 'Backend Engineer, Razorpay', company: '', dateText: 'Jan 2021 - Present', headerLines: [1, 2], bulletLines: [3] }] }, lines, NOW);
    for (const p of [both, noCompany]) expect(p.roles[0]).toMatchObject({ title: 'Backend Engineer', company: 'Razorpay' });
  });

  it('falls back to headings found by pattern when the model gives no sections', () => {
    expect(checkStructure({ ...goodModelOutput, sections: [] }, LINES, NOW).sections).toHaveLength(3);
  });
});

describe('building', () => {
  it('sends only numbered, redacted lines and returns a checked profile', async () => {
    ai.openaiChat.mockResolvedValueOnce(reply(goodModelOutput));
    const p = await buildProfile(extracted(), 'Asha Verma', new Date('2026-11-15'));
    const sent = ai.openaiChat.mock.calls[0]![1].messages[1].content as string;
    expect(sent).toContain('L4: ML Engineer, Acme AI');
    expect(sent).not.toMatch(/asha@example\.com|98765|linkedin\.com|Asha|Verma/);
    expect(p.roles).toHaveLength(3);
    expect(p.quality.readable).toBe(true);
    expect(p.quality.unplacedShare).toBeLessThan(0.2);
  });

  it('an unreadable (scanned) resume makes no model call', async () => {
    const p = await buildProfile({ ...extracted([]), chars: 0, lowTextPages: [1] }, 'Asha Verma');
    expect(ai.openaiChat).not.toHaveBeenCalled();
    expect(p.quality).toEqual({ readable: false, scannedPages: 1, unplacedShare: 1 });
  });
});

describe('cache', () => {
  async function pdf(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]);
    LINES.forEach((t, i) => page.drawText(t, { x: 40, y: 800 - i * 16, size: 10, font }));
    return doc.save();
  }

  it('builds once, then reuses the stored profile; the same file for another application is copied, not rebuilt', async () => {
    const bytes = await pdf();
    files.readResume.mockResolvedValue(bytes);
    ai.openaiChat.mockResolvedValue(reply(goodModelOutput));

    db.jobBoardApplication.findUnique.mockResolvedValueOnce({ resumeKey: 'k1', fullName: 'Asha Verma', ResumeProfile: null });
    const first = await getResumeProfile('app1');
    expect(first.status).toBe('built');
    expect(ai.openaiChat).toHaveBeenCalledTimes(1);
    const saved = (db.jobBoardResumeProfile.upsert.mock.calls[0] as any)[0].create;

    db.jobBoardApplication.findUnique.mockResolvedValueOnce({ resumeKey: 'k1', fullName: 'Asha Verma', ResumeProfile: { version: saved.version, resumeKey: 'k1', data: saved.data } });
    expect((await getResumeProfile('app1')).status).toBe('cached');

    // Same application, new resume file: not served from the old profile.
    db.jobBoardApplication.findUnique.mockResolvedValueOnce({ resumeKey: 'k1-new', fullName: 'Asha Verma', ResumeProfile: { version: saved.version, resumeKey: 'k1', data: saved.data } });
    db.jobBoardResumeProfile.findFirst.mockResolvedValueOnce({ data: saved.data, model: saved.model });
    expect((await getResumeProfile('app1')).status).toBe('reused');

    db.jobBoardApplication.findUnique.mockResolvedValueOnce({ resumeKey: 'k2', fullName: 'Asha Verma', ResumeProfile: null });
    db.jobBoardResumeProfile.findFirst.mockResolvedValueOnce({ data: saved.data, model: saved.model });
    expect((await getResumeProfile('app2')).status).toBe('reused');
    expect(ai.openaiChat).toHaveBeenCalledTimes(1);
  });

  it('no resume, or a file that isn’t a PDF/DOCX, makes no model call', async () => {
    db.jobBoardApplication.findUnique.mockResolvedValueOnce({ resumeKey: null, fullName: 'A', ResumeProfile: null });
    expect((await getResumeProfile('a')).status).toBe('no_resume');
    db.jobBoardApplication.findUnique.mockResolvedValueOnce({ resumeKey: 'k', fullName: 'A', ResumeProfile: null });
    files.readResume.mockResolvedValueOnce(new Uint8Array([1, 2, 3, 4]));
    expect((await getResumeProfile('a')).status).toBe('unreadable_file');
    expect(ai.openaiChat).not.toHaveBeenCalled();
  });
});
