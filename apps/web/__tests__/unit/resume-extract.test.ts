import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { zipSync, strToU8 } from 'fflate';
import { docxLines, dropRunningLines, extractResume, findContacts, findGutter, layoutLines, numberLines, type TextPiece } from '@/lib/jobs/resume-extract';
import { resumeText } from '@/lib/jobs/resume-text';

const PDF = { mime: 'application/pdf', ext: 'pdf' as const };
const DOCX = { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' as const };

/** A PDF with the given text at given positions, one array per page. */
async function makePdf(pages: { text: string; x: number; y: number }[][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const items of pages) {
    const page = doc.addPage([595, 842]); // A4
    for (const it of items) page.drawText(it.text, { x: it.x, y: it.y, size: 10, font });
  }
  return doc.save();
}

function makeDocx(body: string, header = ''): Uint8Array {
  const wrap = (inner: string) => `<?xml version="1.0"?><w:document xmlns:w="w" xmlns:mc="mc"><w:body>${inner}</w:body></w:document>`;
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8(wrap(body)),
  };
  if (header) files['word/header1.xml'] = strToU8(`<w:hdr xmlns:w="w">${header}</w:hdr>`);
  return zipSync(files);
}
const p = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;

describe('PDF layout', () => {
  it('reads a two-column resume column by column, with the full-width name banner first', async () => {
    const left = ['SKILLS', 'Python', 'PyTorch', 'SQL', 'Docker', 'EDUCATION', 'B.Tech, IIT', '2016 - 2020'];
    const right = ['EXPERIENCE', 'ML Engineer, Acme AI', 'Jan 2022 - Present', 'Built RAG search over 2M documents', 'Data Analyst, Beta Corp', '2020 - 2021', 'Cut report time by 40%', 'Led dashboard rollout'];
    const items = [
      { text: 'Asha Verma - Machine Learning Engineer - Bengaluru, India', x: 40, y: 800 },
      ...left.map((t, i) => ({ text: t, x: 40, y: 740 - i * 18 })),
      ...right.map((t, i) => ({ text: t, x: 260, y: 740 - i * 18 })),
    ];
    const r = await extractResume(await makePdf([items]), PDF);
    expect(r.lines[0]).toContain('Asha Verma');
    // Every left-column line comes before every right-column line, in their own order.
    expect(r.lines.slice(1, 1 + left.length)).toEqual(left);
    expect(r.lines.slice(1 + left.length)).toEqual(right);
    expect(r.twoColumnPages).toEqual([1]);
  });

  it('keeps a single-column resume in top-to-bottom order and joins pieces on one line', async () => {
    const items = [
      { text: 'Experience', x: 40, y: 780 },
      { text: 'Senior Engineer', x: 40, y: 760 }, { text: '2021 - 2024', x: 400, y: 760 },
      { text: 'Shipped payments API', x: 40, y: 742 },
    ];
    const r = await extractResume(await makePdf([items]), PDF);
    expect(r.lines).toEqual(['Experience', 'Senior Engineer 2021 - 2024', 'Shipped payments API']);
  });

  it('reads every page (not just the first 3), drops page numbers and repeated footers', async () => {
    const pages = Array.from({ length: 5 }, (_, i) => [
      { text: `Project ${i + 1}: built something real`, x: 40, y: 780 },
      { text: 'Asha Verma - Resume', x: 40, y: 30 },
      { text: `Page ${i + 1} of 5`, x: 500, y: 15 },
    ]);
    const r = await extractResume(await makePdf(pages), PDF);
    expect(r.pageCount).toBe(5);
    expect(r.pagesRead).toBe(5);
    expect(r.lines).toEqual([1, 2, 3, 4, 5].map((n) => `Project ${n}: built something real`));
  });

  it('drops a running footer that shares a baseline with the page number, even on a two-column page; keeps a one-off name banner', async () => {
    const col = (x: number, words: string[]) => words.map((t, i) => ({ text: t, x, y: 740 - i * 18 }));
    const page = (n: number) => [
      ...(n === 1 ? [{ text: 'Asha Verma', x: 40, y: 805 }] : []),
      ...col(40, ['SKILLS', 'Python', 'SQL', 'Docker', 'Spark', 'AWS', 'Kafka']),
      ...col(300, [`Role ${n}`, 'Built search', 'Cut costs 30%', 'Led 4 people', 'Shipped API', 'Ran on-call', 'Wrote docs']),
      { text: 'Asha Verma - Resume', x: 40, y: 30 }, { text: `Page ${n} of 2`, x: 500, y: 30 },
    ];
    const r = await extractResume(await makePdf([page(1), page(2)]), PDF);
    expect(r.lines[0]).toBe('Asha Verma');
    expect(r.lines.filter((l) => /resume|page/i.test(l))).toEqual([]);
    expect(r.lines).toContain('Role 2');
  });

  it('flags pages with almost no text as likely scans', async () => {
    const r = await extractResume(await makePdf([[{ text: 'Real text on the first page, a role and a project with results', x: 40, y: 780 }], [], [{ text: 'p3', x: 40, y: 780 }]]), PDF);
    expect(r.lowTextPages).toEqual([2, 3]);
  });

  it('a gutter needs text on both sides running side by side', () => {
    const col = (x: number, y0: number, n: number): TextPiece[] => Array.from({ length: n }, (_, i) => ({ str: 'word word', x, y: y0 - i * 15, w: 120, h: 10 }));
    expect(findGutter([...col(40, 780, 10), ...col(320, 780, 10)], 595)).not.toBeNull();
    // Same two blocks, one above the other: not columns.
    expect(findGutter([...col(40, 780, 10), ...col(320, 400, 10)], 595)).toBeNull();
    // Text only on the left: a margin, not a gutter.
    expect(findGutter(col(40, 780, 20), 595)).toBeNull();
  });

  it('layout with no pieces is empty', () => {
    expect(layoutLines([], 595)).toEqual([]);
  });

  it('running lines: only repeated edge lines go, body lines that repeat stay', () => {
    const page = (n: number) => ['Header X', `Role ${n}`, 'Python', 'Built things', `Result ${n}`, 'More detail', 'Footer'];
    const out = dropRunningLines([page(1), page(2)]);
    expect(out).toEqual([['Role 1', 'Python', 'Built things', 'Result 1', 'More detail'], ['Role 2', 'Python', 'Built things', 'Result 2', 'More detail']]);
  });
});

describe('DOCX', () => {
  it('reads tables as "a | b", text boxes once, headers, and skips tracked deletions', async () => {
    const body = [
      p('EXPERIENCE'),
      '<w:tbl><w:tr><w:tc>' + p('ML Engineer') + '</w:tc><w:tc>' + p('2022 - Present') + '</w:tc></w:tr></w:tbl>',
      '<mc:AlternateContent><mc:Choice><w:txbxContent>' + p('Skills: Python, SQL') + '</w:txbxContent></mc:Choice><mc:Fallback><w:txbxContent>' + p('Skills: Python, SQL') + '</w:txbxContent></mc:Fallback></mc:AlternateContent>',
      '<w:p><w:r><w:t>Built </w:t></w:r><w:del><w:r><w:delText>nothing</w:delText></w:r></w:del><w:r><w:t>search</w:t></w:r></w:p>',
    ].join('');
    const r = await extractResume(makeDocx(body, p('Asha Verma · asha@example.com')), DOCX);
    expect(r.lines).toEqual(['Asha Verma · asha@example.com', 'EXPERIENCE', 'ML Engineer | 2022 - Present', 'Skills: Python, SQL', 'Built search']);
    expect(r.contacts.emails).toEqual(['asha@example.com']);
  });

  it('line breaks inside a paragraph start a new line; entities decode once', () => {
    expect(docxLines('<w:p><w:r><w:t>A &amp;lt; B</w:t><w:br/><w:t>next</w:t></w:r></w:p>')).toEqual(['A &lt; B', 'next']);
  });
});

describe('contacts', () => {
  it('finds emails, Indian and international phones and profile links, not year ranges', () => {
    const c = findContacts([
      'asha.v@Mail.com | +91 98765 43210 | linkedin.com/in/asha-v',
      'Phone: (080) 4123-4567 · https://asha.dev',
      'Acme AI 2019 - 2023', 'github.com/ashav',
    ]);
    expect(c.emails).toEqual(['asha.v@mail.com']);
    expect(c.phones).toEqual(['+91 98765 43210', '(080) 4123-4567']);
    expect(c.links).toEqual(expect.arrayContaining(['linkedin.com/in/asha-v', 'https://asha.dev', 'github.com/ashav']));
  });
});

describe('numbered lines and the old reader', () => {
  it('numbers from L1', () => {
    expect(numberLines(['a', 'b'])).toBe('L1: a\nL2: b');
  });

  it('resumeText now returns the same ordered lines, joined', async () => {
    const bytes = await makePdf([[{ text: 'Line one', x: 40, y: 780 }, { text: 'Line two', x: 40, y: 760 }]]);
    expect(await resumeText(bytes, PDF)).toBe('Line one\nLine two');
  });
});
