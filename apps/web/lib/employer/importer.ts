import crypto from 'node:crypto';
import { prisma, Prisma } from '@udyaibase/database';
import { uniqueJobSlug } from '@/lib/jobs/slug';
import { deleteResume, putResume, resumeStorageReady } from '@/lib/jobs/resume-storage';
import { MAX_RESUME_BYTES, sniffResume } from '@/lib/jobs/resume-text';
import {
  cleanRows, IMPORT_FIELDS, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, parseCsv, PIPELINE_STAGES,
  type CleanRow, type ColumnMapping, type JobChoice, type PipelineStage, type RowProblem,
} from '@/lib/employer/import-csv';

/**
 * Importing candidates from a CSV. Rules: they come in with the source "Imported", nobody is emailed, nobody joins the
 * talent pool, and normal data retention applies (from the original applied date when the file has one). The import
 * runs in chunks the browser asks for one after another, and can be undone for 7 days.
 */

export const UNDO_DAYS = 7;
const CHUNK = 250;
const MAX_PROBLEMS = 1000;
const DAY = 864e5;

type StoredRow = Omit<CleanRow, 'jobKey'> & { listingId: string };
interface StoredMapping { columns: ColumnMapping; headers: string[]; jobs: Record<string, JobChoice>; stages: Record<string, PipelineStage>; createdJobIds: string[] }

export interface StartInput { fileName?: unknown; csv?: unknown; mapping?: unknown; jobs?: unknown; stages?: unknown; defaultJob?: unknown }

function cleanMapping(v: unknown, columns: number): ColumnMapping | null {
  if (!v || typeof v !== 'object') return null;
  const out: ColumnMapping = {};
  for (const f of IMPORT_FIELDS) {
    const i = (v as Record<string, unknown>)[f.key];
    if (typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < columns) out[f.key] = i;
  }
  return out.email == null ? null : out;
}

/** Checks the file and the choices, creates any "keep for history" jobs, and stores the rows ready to import. */
export async function startImport(opts: { employerId: string; actorEmail: string; input: StartInput; now?: Date }):
  Promise<{ ok: true; id: string; total: number; problems: number } | { ok: false; error: string; status: number }> {
  const now = opts.now ?? new Date();
  const i = opts.input;
  if (typeof i.csv !== 'string' || !i.csv.trim()) return { ok: false, error: 'Choose a CSV file.', status: 400 };
  if (Buffer.byteLength(i.csv) > IMPORT_MAX_BYTES) return { ok: false, error: 'The file is over 4 MB. Split it into smaller files.', status: 413 };
  const all = parseCsv(i.csv);
  if (all.length < 2) return { ok: false, error: 'The file needs a header row and at least one candidate.', status: 400 };
  const [headers, ...data] = all;
  if (data.length > IMPORT_MAX_ROWS) return { ok: false, error: `Up to ${IMPORT_MAX_ROWS.toLocaleString('en-IN')} candidates per file. Split it and import each part.`, status: 400 };
  const mapping = cleanMapping(i.mapping, headers.length);
  if (!mapping) return { ok: false, error: 'Choose the column with each candidate’s email.', status: 400 };

  // Job choices: existing jobs must be this workspace's own.
  const rawJobs = (i.jobs && typeof i.jobs === 'object' ? i.jobs : {}) as Record<string, unknown>;
  const jobs: Record<string, JobChoice> = {};
  const wanted = new Set<string>();
  for (const [k, v] of Object.entries(rawJobs).slice(0, 500)) {
    const c = v as { kind?: unknown; listingId?: unknown };
    if (c?.kind === 'existing' && typeof c.listingId === 'string') { jobs[k] = { kind: 'existing', listingId: c.listingId }; wanted.add(c.listingId); }
    else if (c?.kind === 'new') jobs[k] = { kind: 'new' };
    else jobs[k] = { kind: 'skip' };
  }
  const owned = new Set((await prisma.jobBoardListing.findMany({ where: { id: { in: [...wanted] }, employerId: opts.employerId, deletedAt: null, isGeneral: false }, select: { id: true } })).map((l) => l.id));
  for (const [k, c] of Object.entries(jobs)) if (c.kind === 'existing' && !owned.has(c.listingId)) return { ok: false, error: `The job chosen for “${k}” wasn’t found. Choose it again.`, status: 400 };

  const rawStages = (i.stages && typeof i.stages === 'object' ? i.stages : {}) as Record<string, unknown>;
  const stages: Record<string, PipelineStage> = {};
  for (const [k, v] of Object.entries(rawStages).slice(0, 500)) if ((PIPELINE_STAGES as readonly string[]).includes(String(v))) stages[k] = v as PipelineStage;

  const defaultJob = typeof i.defaultJob === 'string' ? i.defaultJob : undefined;
  const { rows, problems } = cleanRows({ rows: data, mapping, jobs, stages, defaultJob, now });
  if (!rows.length) return { ok: false, error: 'No rows can be imported. Check the email column and the job choices.', status: 400 };

  // Old roles from the other tool, kept closed and private so their candidates have a home.
  const listingFor = new Map<string, string>();
  const createdJobIds: string[] = [];
  for (const key of new Set(rows.map((r) => r.jobKey))) {
    const c = jobs[key];
    if (c.kind === 'existing') { listingFor.set(key, c.listingId); continue; }
    const title = key.slice(0, 120) || 'Imported candidates';
    const job = await prisma.jobBoardListing.create({
      data: {
        employerId: opts.employerId, title, slug: await uniqueJobSlug(`${title} imported`), status: 'CLOSED', isActive: false, closedAt: now, closeReason: 'MANUAL',
        description: `Candidates imported for ${title}. This job is kept closed and is not shown publicly.`,
        country: 'India', workType: 'REMOTE', showOnJobsPage: false, showOnCareers: false, showOnProfile: false,
      },
      select: { id: true },
    });
    listingFor.set(key, job.id);
    createdJobIds.push(job.id);
  }

  const stored: StoredRow[] = rows.map(({ jobKey, ...r }) => ({ ...r, listingId: listingFor.get(jobKey)! }));
  const fileName = (typeof i.fileName === 'string' ? i.fileName : 'candidates.csv').replace(/[^\w.\- ()]/g, '').slice(0, 120) || 'candidates.csv';
  const imp = await prisma.jobBoardImport.create({
    data: {
      employerId: opts.employerId, createdBy: opts.actorEmail, fileName, totalRows: stored.length, failed: problems.length,
      rows: stored as unknown as Prisma.InputJsonValue,
      mapping: { columns: mapping, headers: headers.slice(0, 60), jobs, stages, createdJobIds } as unknown as Prisma.InputJsonValue,
      problems: problems.slice(0, MAX_PROBLEMS) as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return { ok: true, id: imp.id, total: stored.length, problems: problems.length };
}

/** Imports the next chunk. Candidates already in that job are left as they are. */
export async function runImportChunk(importId: string, employerId: string, now = new Date()):
  Promise<{ ok: true; done: boolean; cursor: number; total: number; created: number; skipped: number } | { ok: false; error: string; status: number }> {
  const imp = await prisma.jobBoardImport.findFirst({ where: { id: importId, employerId } });
  if (!imp) return { ok: false, error: 'Import not found.', status: 404 };
  if (imp.status !== 'RUNNING') return { ok: true, done: true, cursor: imp.cursor, total: imp.totalRows, created: imp.created, skipped: imp.skipped };
  const rows = (imp.rows as unknown as StoredRow[] | null) ?? [];
  const slice = rows.slice(imp.cursor, imp.cursor + CHUNK);

  const existing = slice.length
    ? await prisma.jobBoardApplication.findMany({ where: { OR: slice.map((r) => ({ listingId: r.listingId, email: r.email })) }, select: { listingId: true, email: true } })
    : [];
  const taken = new Set(existing.map((e) => `${e.listingId}\u0000${e.email.toLowerCase()}`));
  const fresh = slice.filter((r) => !taken.has(`${r.listingId}\u0000${r.email}`));
  const newProblems: RowProblem[] = slice.filter((r) => taken.has(`${r.listingId}\u0000${r.email}`)).map((r) => ({ row: r.row, email: r.email, reason: 'Already a candidate for this job (left as is)' }));

  const created = fresh.length ? await prisma.jobBoardApplication.createManyAndReturn({
    data: fresh.map((r) => ({
      listingId: r.listingId, importId: imp.id, source: 'IMPORTED' as const, fullName: r.fullName, email: r.email, phone: r.phone, linkedinUrl: r.linkedinUrl,
      city: r.city, currentCompany: r.currentCompany, currentTitle: r.currentTitle, experienceYears: r.experienceYears,
      noticePeriodDays: r.noticePeriodDays, expectedCtcLakh: r.expectedCtcLakh, status: r.stage,
      appliedAt: r.appliedAt ? new Date(r.appliedAt) : now, statusChangedAt: now, reviewedAt: r.stage === 'APPLIED' ? null : now,
    })),
    skipDuplicates: true,
    select: { id: true, listingId: true, email: true },
  }) : [];

  const byKey = new Map(created.map((c) => [`${c.listingId}\u0000${c.email}`, c.id]));
  const notes = fresh.filter((r) => r.notes && byKey.has(`${r.listingId}\u0000${r.email}`))
    .map((r) => ({ applicationId: byKey.get(`${r.listingId}\u0000${r.email}`)!, authorEmail: imp.createdBy, authorName: `Imported from ${imp.fileName}`, body: r.notes! }));
  if (notes.length) await prisma.jobBoardApplicationNote.createMany({ data: notes });
  const perListing = new Map<string, number>();
  for (const c of created) perListing.set(c.listingId, (perListing.get(c.listingId) ?? 0) + 1);
  for (const [id, n] of perListing) await prisma.jobBoardListing.update({ where: { id }, data: { applicationsCount: { increment: n } } });

  const cursor = imp.cursor + slice.length;
  const done = cursor >= rows.length;
  const skipped = slice.length - created.length;
  const problems = [...((imp.problems as unknown as RowProblem[]) ?? []), ...newProblems].slice(0, MAX_PROBLEMS);
  const u = await prisma.jobBoardImport.update({
    where: { id: imp.id },
    data: {
      cursor, created: { increment: created.length }, skipped: { increment: skipped }, problems: problems as unknown as Prisma.InputJsonValue,
      ...(done ? { status: 'DONE', finishedAt: now, rows: Prisma.DbNull } : {}),
    },
    select: { created: true, skipped: true },
  });
  return { ok: true, done, cursor, total: rows.length, created: u.created, skipped: u.skipped };
}

/** Resumes from the ZIP, matched in the browser by file name: stored and attached to that person's imported application(s). */
export async function attachImportedResume(opts: { importId: string; employerId: string; email: string; bytes: Uint8Array }):
  Promise<{ ok: true; attached: number } | { ok: false; error: string; status: number }> {
  if (!resumeStorageReady()) return { ok: false, error: 'Resume storage isn’t set up.', status: 503 };
  if (opts.bytes.byteLength > MAX_RESUME_BYTES) return { ok: false, error: 'Resume is over 5 MB.', status: 413 };
  const kind = sniffResume(opts.bytes);
  if (!kind) return { ok: false, error: 'Only PDF or Word (.docx) resumes.', status: 415 };
  const imp = await prisma.jobBoardImport.findFirst({ where: { id: opts.importId, employerId: opts.employerId, status: { in: ['RUNNING', 'DONE'] } }, select: { id: true } });
  if (!imp) return { ok: false, error: 'Import not found.', status: 404 };
  const apps = await prisma.jobBoardApplication.findMany({ where: { importId: imp.id, email: opts.email.trim().toLowerCase(), resumeKey: null }, select: { id: true, listingId: true } });
  if (!apps.length) return { ok: false, error: 'No imported candidate with that email is waiting for a resume.', status: 404 };
  for (const a of apps) {
    const key = `resumes/${a.listingId}/${crypto.randomUUID()}.${kind.ext}`;
    await putResume(key, opts.bytes, kind.mime);
    await prisma.jobBoardApplication.update({ where: { id: a.id }, data: { resumeKey: key } });
  }
  await prisma.jobBoardImport.update({ where: { id: imp.id }, data: { resumes: { increment: 1 } } });
  return { ok: true, attached: apps.length };
}

/** Removes everything an import added (within 7 days): its candidates, their resumes, and the closed jobs it created. */
export async function undoImport(importId: string, employerId: string, now = new Date()): Promise<{ ok: true; removed: number } | { ok: false; error: string; status: number }> {
  const imp = await prisma.jobBoardImport.findFirst({ where: { id: importId, employerId } });
  if (!imp) return { ok: false, error: 'Import not found.', status: 404 };
  if (imp.status === 'UNDONE') return { ok: false, error: 'This import was already undone.', status: 409 };
  if (imp.finishedAt && now.getTime() - imp.finishedAt.getTime() > UNDO_DAYS * DAY) return { ok: false, error: `Imports can be undone for ${UNDO_DAYS} days.`, status: 409 };
  const apps = await prisma.jobBoardApplication.findMany({ where: { importId: imp.id }, select: { id: true, listingId: true, resumeKey: true } });
  for (const a of apps) if (a.resumeKey) await deleteResume(a.resumeKey).catch(() => undefined);
  const perListing = new Map<string, number>();
  for (const a of apps) perListing.set(a.listingId, (perListing.get(a.listingId) ?? 0) + 1);
  await prisma.jobBoardApplication.deleteMany({ where: { importId: imp.id } });
  for (const [id, n] of perListing) await prisma.jobBoardListing.updateMany({ where: { id, applicationsCount: { gte: n } }, data: { applicationsCount: { decrement: n } } });
  const createdJobIds = ((imp.mapping as unknown as StoredMapping).createdJobIds ?? []).filter((x) => typeof x === 'string');
  if (createdJobIds.length) {
    // Only the empty ones: someone may have added candidates to them since.
    const used = new Set((await prisma.jobBoardApplication.groupBy({ by: ['listingId'], where: { listingId: { in: createdJobIds } } })).map((g) => g.listingId));
    await prisma.jobBoardListing.updateMany({ where: { id: { in: createdJobIds.filter((id) => !used.has(id)) }, employerId }, data: { deletedAt: now } });
  }
  await prisma.jobBoardImport.update({ where: { id: imp.id }, data: { status: 'UNDONE', undoneAt: now, rows: Prisma.DbNull } });
  return { ok: true, removed: apps.length };
}

export async function listImports(employerId: string, now = new Date()) {
  const rows = await prisma.jobBoardImport.findMany({
    where: { employerId }, orderBy: { createdAt: 'desc' }, take: 20,
    select: { id: true, fileName: true, status: true, totalRows: true, cursor: true, created: true, skipped: true, failed: true, resumes: true, createdBy: true, createdAt: true, finishedAt: true, undoneAt: true },
  });
  return rows.map((r) => ({
    ...r, createdAt: r.createdAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null, undoneAt: r.undoneAt?.toISOString() ?? null,
    canUndo: r.status !== 'UNDONE' && (!r.finishedAt || now.getTime() - r.finishedAt.getTime() <= UNDO_DAYS * DAY),
  }));
}

/** The rows that weren't imported, as a CSV the team can fix and import again. */
export async function problemsCsv(importId: string, employerId: string): Promise<string | null> {
  const imp = await prisma.jobBoardImport.findFirst({ where: { id: importId, employerId }, select: { problems: true } });
  if (!imp) return null;
  const q = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = (imp.problems as unknown as RowProblem[]) ?? [];
  return ['Row,Email,Reason', ...rows.map((p) => [p.row, q(p.email), q(p.reason)].join(','))].join('\r\n');
}
