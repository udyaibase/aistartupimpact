/**
 * Candidate import from a CSV (from another hiring tool or a spreadsheet). Pure functions, shared by the browser
 * (mapping and preview) and the server (which re-checks everything before importing).
 */

export const IMPORT_MAX_ROWS = 5000;
export const IMPORT_MAX_BYTES = 4 * 1024 * 1024;
const MAX_COLUMNS = 60;
const MAX_CELL = 5000;

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and line breaks inside quotes, CRLF or LF, a leading BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows.map((r) => r.slice(0, MAX_COLUMNS).map((c) => c.trim().slice(0, MAX_CELL)));
}

/** The candidate fields a column can fill. */
export const IMPORT_FIELDS = [
  { key: 'fullName', label: 'Full name' },
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'email', label: 'Email', required: true },
  { key: 'phone', label: 'Phone' },
  { key: 'job', label: 'Job (title or ID)' },
  { key: 'stage', label: 'Stage' },
  { key: 'appliedAt', label: 'Applied on' },
  { key: 'linkedinUrl', label: 'LinkedIn' },
  { key: 'city', label: 'City' },
  { key: 'currentCompany', label: 'Current company' },
  { key: 'currentTitle', label: 'Current title' },
  { key: 'experienceYears', label: 'Years of experience' },
  { key: 'noticePeriodDays', label: 'Notice period (days)' },
  { key: 'expectedCtcLakh', label: 'Expected salary (₹ lakh)' },
  { key: 'notes', label: 'Notes' },
  { key: 'resumeFile', label: 'Resume file name' },
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number]['key'];
export type ColumnMapping = Partial<Record<ImportField, number>>;

const ALIASES: Record<ImportField, RegExp> = {
  fullName: /^(full ?name|name|candidate( name)?|applicant( name)?)$/,
  firstName: /^(first ?name|given name)$/,
  lastName: /^(last ?name|surname|family name)$/,
  email: /^(e-?mail|e-?mail address|candidate e-?mail|primary e-?mail)$/,
  phone: /^(phone|mobile|phone number|mobile number|contact( number)?)$/,
  job: /^(job|job title|role|position|requisition|job posting|opening|applied for|job id)$/,
  stage: /^(stage|status|current stage|pipeline stage|hiring stage)$/,
  appliedAt: /^(applied( on| at| date)?|application date|date applied|created( at| on)?|added on)$/,
  linkedinUrl: /^(linkedin|linkedin url|linkedin profile)$/,
  city: /^(city|location|current location)$/,
  currentCompany: /^(current company|company|current employer|employer)$/,
  currentTitle: /^(current title|current role|designation|title)$/,
  experienceYears: /^(experience|years of experience|total experience|experience \(years\))$/,
  noticePeriodDays: /^(notice|notice period|notice period \(days\))$/,
  expectedCtcLakh: /^(expected ctc|expected salary|expected ctc \(lpa\)|expected ctc \(lakh\))$/,
  notes: /^(notes?|comments?|remarks?)$/,
  resumeFile: /^(resume|cv|resume file|resume file ?name|attachment)$/,
};

/** A first guess at which column fills which field, from the header names. */
export function guessMapping(headers: string[]): ColumnMapping {
  const m: ColumnMapping = {};
  const used = new Set<number>();
  for (const f of IMPORT_FIELDS) {
    const i = headers.findIndex((h, idx) => !used.has(idx) && ALIASES[f.key].test(h.trim().toLowerCase().replace(/[_\s]+/g, ' ')));
    if (i >= 0) { m[f.key] = i; used.add(i); }
  }
  return m;
}

export const PIPELINE_STAGES = ['APPLIED', 'SHORTLISTED', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'ON_HOLD'] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export const STAGE_LABEL: Record<PipelineStage, string> = {
  APPLIED: 'New', SHORTLISTED: 'Screening', INTERVIEW: 'Interview', OFFER: 'Offer', HIRED: 'Hired', REJECTED: 'Rejected', ON_HOLD: 'On hold',
};

/** Our stage for another tool's stage name; New when unsure. */
export function guessStage(value: string): PipelineStage {
  const v = value.toLowerCase();
  if (/reject|declin|disqualif|archiv|not (a )?fit|dropped|withdr/.test(v)) return 'REJECTED';
  if (/hired|joined|onboard/.test(v)) return 'HIRED';
  if (/offer/.test(v)) return 'OFFER';
  if (/hold|parked|later/.test(v)) return 'ON_HOLD';
  if (/interview|round|technical|assignment|hr |^hr$|panel|onsite|culture/.test(v)) return 'INTERVIEW';
  if (/shortlist|screen|review|phone/.test(v)) return 'SHORTLISTED';
  return 'APPLIED';
}

/** Where a job value from the file goes: an existing job, a new closed job kept for history, or skip its rows. */
export type JobChoice = { kind: 'existing'; listingId: string } | { kind: 'new' } | { kind: 'skip' };

export interface CleanRow {
  row: number; fullName: string; email: string; jobKey: string; stage: PipelineStage; appliedAt: string | null;
  phone: string | null; linkedinUrl: string | null; city: string | null; currentCompany: string | null; currentTitle: string | null;
  experienceYears: number | null; noticePeriodDays: number | null; expectedCtcLakh: number | null; notes: string | null; resumeFile: string | null;
}
export interface RowProblem { row: number; email: string; reason: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const cut = (v: string | undefined, n: number) => (v ?? '').trim().replace(/\s+/g, ' ').slice(0, n) || null;
const num = (v: string | undefined, max: number) => {
  const n = Number((v ?? '').replace(/[^\d.]/g, ''));
  return (v ?? '').trim() && Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};

/** Dates from other tools: ISO, DD/MM/YYYY or DD-MM-YYYY (Indian order), or "12 Mar 2026". Never in the future. */
export function parseDate(v: string | undefined, now = new Date()): string | null {
  const s = (v ?? '').trim();
  if (!s) return null;
  let d: Date | null = null;
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (dmy) d = new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1], 6, 30));
  else if (/^\d{4}-\d{2}-\d{2}/.test(s) || /[a-z]{3}/i.test(s)) { const t = Date.parse(s); d = Number.isNaN(t) ? null : new Date(t); }
  if (!d || Number.isNaN(d.getTime()) || d.getTime() > now.getTime() || d.getUTCFullYear() < 2000) return null;
  return d.toISOString();
}

const linkedin = (v: string | undefined) => {
  const s = (v ?? '').trim();
  const u = /^https?:\/\//i.test(s) ? s : s ? `https://${s}` : '';
  return /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[^\s]+$/i.test(u.replace(/^http:/i, 'https:')) ? u.replace(/^http:/i, 'https:').slice(0, 300) : null;
};

/**
 * Turns the file's rows into candidates using the column mapping, the job choices and the stage choices.
 * Rows without a valid email, with a skipped job, or repeating an email for the same job are left out with a reason.
 * `defaultJob` is used when there's no job column.
 */
export function cleanRows(opts: {
  rows: string[][]; mapping: ColumnMapping; jobs: Record<string, JobChoice>; stages: Record<string, PipelineStage>; defaultJob?: string; now?: Date;
}): { rows: CleanRow[]; problems: RowProblem[] } {
  const { mapping: m } = opts;
  const get = (r: string[], f: ImportField) => (m[f] == null ? undefined : r[m[f]!]);
  const out: CleanRow[] = [];
  const problems: RowProblem[] = [];
  const seen = new Set<string>();
  opts.rows.forEach((r, i) => {
    const row = i + 2; // the header is row 1, as in a spreadsheet
    const email = (get(r, 'email') ?? '').trim().toLowerCase();
    if (!EMAIL.test(email) || email.length > 254) { problems.push({ row, email, reason: email ? 'Email doesn’t look right' : 'No email' }); return; }
    const jobKey = m.job != null ? (get(r, 'job') ?? '').trim() : opts.defaultJob ?? '';
    const choice = opts.jobs[jobKey];
    if (!jobKey || !choice) { problems.push({ row, email, reason: 'No job chosen for this row' }); return; }
    if (choice.kind === 'skip') { problems.push({ row, email, reason: `Skipped job “${jobKey}”` }); return; }
    const dup = `${jobKey}\u0000${email}`;
    if (seen.has(dup)) { problems.push({ row, email, reason: 'Same person twice for the same job (kept the first)' }); return; }
    seen.add(dup);
    const full = cut(get(r, 'fullName'), 120) ?? cut([get(r, 'firstName'), get(r, 'lastName')].filter(Boolean).join(' '), 120) ?? email.split('@')[0];
    const stageRaw = (get(r, 'stage') ?? '').trim();
    out.push({
      row, email, fullName: full, jobKey,
      stage: stageRaw ? opts.stages[stageRaw] ?? guessStage(stageRaw) : 'APPLIED',
      appliedAt: parseDate(get(r, 'appliedAt'), opts.now),
      phone: cut(get(r, 'phone')?.replace(/[^\d+\-\s()]/g, ''), 30),
      linkedinUrl: linkedin(get(r, 'linkedinUrl')),
      city: cut(get(r, 'city'), 80),
      currentCompany: cut(get(r, 'currentCompany'), 120),
      currentTitle: cut(get(r, 'currentTitle'), 120),
      experienceYears: num(get(r, 'experienceYears'), 60) == null ? null : Math.round(num(get(r, 'experienceYears'), 60)!),
      noticePeriodDays: num(get(r, 'noticePeriodDays'), 365) == null ? null : Math.round(num(get(r, 'noticePeriodDays'), 365)!),
      expectedCtcLakh: num(get(r, 'expectedCtcLakh'), 1000),
      notes: cut(get(r, 'notes'), 2000),
      resumeFile: cut(get(r, 'resumeFile')?.split(/[\\/]/).pop(), 200),
    });
  });
  return { rows: out, problems };
}

/** Distinct non-empty values of one column, most common first (for the job and stage choices). */
export function distinctValues(rows: string[][], col: number | undefined, limit = 200): { value: string; count: number }[] {
  if (col == null) return [];
  const counts = new Map<string, number>();
  for (const r of rows) { const v = (r[col] ?? '').trim(); if (v) counts.set(v, (counts.get(v) ?? 0) + 1); }
  return Array.from(counts, ([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count).slice(0, limit);
}
