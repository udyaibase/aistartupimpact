import { randomUUID } from 'crypto';
import { changedListingFields, decideListingEdit, sameListingValue, websiteDomain, type ListingFields, type ListingType } from '@udyaibase/utils';
import { Prisma, prisma } from './index';

/**
 * Field-level review of listing edits, shared by the founder portal and the admin app:
 * - saveListingEdit: publishes what can go live and queues the rest. The live value stays public until approved.
 * - decideListingEdits: an admin approves or rejects queued fields. Rejecting never touches the live listing.
 * - restoreListingVersion: an admin puts back an earlier version.
 * Every published change saves the previous version first, and records who made it.
 */

export type EditActor = { type: 'FOUNDER' | 'ADMIN'; id: string; label: string };
type Tx = Prisma.TransactionClient;
const TX = { maxWait: 10_000, timeout: 30_000 };

const iso = (d: unknown) => (d ? new Date(d as string).toISOString().slice(0, 10) : null);
const num = (n: unknown) => (n === null || n === undefined ? null : Number(n));

/** The listing's editable fields, in the same shape the forms send. */
export async function readListingFields(type: ListingType, id: string, db: Tx | typeof prisma = prisma): Promise<ListingFields | null> {
  if (type === 'startup') {
    const s = await db.startup.findFirst({
      where: { id, deletedAt: null },
      select: {
        name: true, tagline: true, description: true, websiteUrl: true, linkedinUrl: true, twitterUrl: true, foundedYear: true,
        headquartersCity: true, stage: true, employeeCount: true, founders: true, logoUrl: true, totalFundingInr: true,
        category: true, businessType: true, status: true, socialLinks: true, foundersData: true,
      },
    });
    if (!s) return null;
    const [faqs, rounds] = await Promise.all([
      db.$queryRaw<{ question: string; answer: string }[]>`SELECT question, answer FROM "StartupFAQ" WHERE "startupId" = ${id} ORDER BY "order" ASC`,
      db.$queryRaw<Record<string, unknown>[]>`SELECT "roundType", "amountUsd", "amountInr", "announcedAt"::text AS "announcedAt", "leadInvestors", "allInvestors" FROM "FundingRound" WHERE "startupId" = ${id} ORDER BY "announcedAt" DESC`,
    ]);
    return {
      ...s,
      totalFundingInr: num(s.totalFundingInr),
      faqs: faqs.map((f, i) => ({ question: f.question, answer: f.answer, order: i })),
      fundingRounds: rounds.map(normalizeRound),
    };
  }

  const t = await db.aiTool.findFirst({
    where: { id, deletedAt: null },
    select: {
      name: true, tagline: true, description: true, websiteUrl: true, affiliateUrl: true, categoryId: true, pricingModel: true,
      pricingUrl: true, startingPrice: true, hasApi: true, hasMobileApp: true, launchYear: true, founderNames: true,
      headquartersCountry: true, headquartersCity: true, logoUrl: true, screenshotUrls: true, twitterUrl: true, linkedinUrl: true,
      socialLinks: true, demoVideoUrl: true, freeTrialDays: true,
    },
  });
  if (!t) return null;
  const [useCases, faqs, pros, cons, tags] = await Promise.all([
    db.$queryRaw<{ text: string; type: string }[]>`SELECT text, type FROM "ToolUseCase" WHERE "toolId" = ${id} ORDER BY id`,
    db.$queryRaw<{ question: string; answer: string }[]>`SELECT question, answer FROM "ToolFAQ" WHERE "toolId" = ${id} ORDER BY "order" ASC`,
    db.$queryRaw<{ text: string }[]>`SELECT text FROM "ToolPro" WHERE "toolId" = ${id} ORDER BY text`,
    db.$queryRaw<{ text: string }[]>`SELECT text FROM "ToolCon" WHERE "toolId" = ${id} ORDER BY text`,
    db.$queryRaw<{ tagId: string }[]>`SELECT "tagId" FROM "ToolSystemTagMapping" WHERE "toolId" = ${id} ORDER BY "tagId"`,
  ]);
  return {
    ...t,
    startingPrice: num(t.startingPrice),
    features: useCases.filter((u) => u.type === 'feature').map((u) => u.text),
    useCases: useCases.filter((u) => u.type !== 'feature').map((u) => u.text),
    faqs: faqs.map((f, i) => ({ question: f.question, answer: f.answer, order: i })),
    pros: pros.map((p) => p.text),
    cons: cons.map((c) => c.text),
    tagIds: tags.map((x) => x.tagId),
  };
}

function normalizeRound(r: Record<string, unknown>) {
  return {
    roundType: r.roundType, amountUsd: num(r.amountUsd), amountInr: num(r.amountInr), announcedAt: iso(r.announcedAt),
    leadInvestors: r.leadInvestors ?? [], allInvestors: r.allInvestors ?? [],
  };
}

/** Puts incoming values in the shape readListingFields returns, so only real changes count as changes. */
export function normalizeListingInput(type: ListingType, input: ListingFields): ListingFields {
  const out: ListingFields = { ...input };
  if (Array.isArray(out.faqs)) out.faqs = (out.faqs as { question: string; answer: string }[]).map((f, i) => ({ question: f.question, answer: f.answer, order: i }));
  if (type === 'startup' && Array.isArray(out.fundingRounds)) {
    out.fundingRounds = (out.fundingRounds as Record<string, unknown>[]).map(normalizeRound)
      .sort((a, b) => String(b.announcedAt ?? '').localeCompare(String(a.announcedAt ?? '')));
  }
  if (type === 'tool') {
    for (const key of ['pros', 'cons', 'tagIds'] as const) {
      if (Array.isArray(out[key])) out[key] = [...(out[key] as string[])].map((v) => v.trim()).filter(Boolean).sort();
    }
  }
  return out;
}

const json = (v: unknown) => (v === null || v === undefined || (Array.isArray(v) && v.length === 0) ? Prisma.DbNull : (v as Prisma.InputJsonValue));
const has = (f: ListingFields, k: string) => Object.prototype.hasOwnProperty.call(f, k);

async function applyStartupFields(tx: Tx, id: string, f: ListingFields) {
  const data: Prisma.StartupUncheckedUpdateInput = { updatedAt: new Date() };
  for (const key of ['name', 'tagline', 'description', 'websiteUrl', 'stage', 'status'] as const) {
    if (has(f, key) && f[key] !== null && f[key] !== undefined) (data as Record<string, unknown>)[key] = f[key];
  }
  for (const key of ['linkedinUrl', 'twitterUrl', 'logoUrl', 'category', 'businessType', 'foundedYear'] as const) {
    if (has(f, key)) (data as Record<string, unknown>)[key] = f[key] || null;
  }
  if (has(f, 'employeeCount')) data.employeeCount = (f.employeeCount as number) || null;
  if (has(f, 'totalFundingInr')) data.totalFundingInr = BigInt(Math.round(Number(f.totalFundingInr) || 0));
  if (has(f, 'socialLinks')) data.socialLinks = json(f.socialLinks);
  if (has(f, 'founders')) data.founders = (f.founders as string[]) ?? [];
  if (has(f, 'foundersData')) {
    const people = (f.foundersData as { name?: string }[] | null) ?? [];
    data.foundersData = json(people);
    data.founders = people.map((p) => p.name ?? '').filter((n) => n.trim());
  }
  if (has(f, 'headquartersCity')) {
    const city = (f.headquartersCity as string) || null;
    data.headquartersCity = city;
    const match = city ? await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "City" WHERE LOWER(name) = LOWER(${city}) OR ${city.toLowerCase()} = ANY(aliases) LIMIT 1` : [];
    data.cityId = match[0]?.id ?? null;
  }
  await tx.startup.update({ where: { id }, data, select: { id: true } });

  if (has(f, 'faqs')) {
    await tx.$executeRaw`DELETE FROM "StartupFAQ" WHERE "startupId" = ${id}`;
    const faqs = (f.faqs as { question: string; answer: string }[] | null) ?? [];
    for (const [i, faq] of faqs.entries()) {
      await tx.$executeRaw`INSERT INTO "StartupFAQ" (id, "startupId", question, answer, "order", "createdAt", "updatedAt") VALUES (gen_random_uuid(), ${id}, ${faq.question}, ${faq.answer}, ${i}, NOW(), NOW())`;
    }
  }
  if (has(f, 'fundingRounds')) {
    await tx.$executeRaw`DELETE FROM "FundingRound" WHERE "startupId" = ${id}`;
    for (const r of (f.fundingRounds as Record<string, unknown>[] | null) ?? []) {
      await tx.$executeRaw`INSERT INTO "FundingRound" (id, "startupId", "roundType", "amountUsd", "amountInr", "announcedAt", "leadInvestors", "allInvestors", "createdAt")
        VALUES (gen_random_uuid(), ${id}, ${r.roundType as string}, ${num(r.amountUsd)}, ${num(r.amountInr) ?? 0}, ${String(r.announcedAt)}::timestamp, ${(r.leadInvestors as string[]) ?? []}::text[], ${(r.allInvestors as string[]) ?? []}::text[], NOW())`;
    }
  }
}

async function replaceToolUseCases(tx: Tx, id: string, type: string, items: string[]) {
  await tx.$executeRaw`DELETE FROM "ToolUseCase" WHERE "toolId" = ${id} AND type = ${type}`;
  for (const [i, text] of items.entries()) {
    const orderedId = `${String(i).padStart(4, '0')}_${randomUUID()}`;
    await tx.$executeRaw`INSERT INTO "ToolUseCase" (id, "toolId", text, type) VALUES (${orderedId}, ${id}, ${text}, ${type})`;
  }
}

async function applyToolFields(tx: Tx, id: string, f: ListingFields) {
  const data: Prisma.AiToolUncheckedUpdateInput = { updatedAt: new Date() };
  for (const key of ['name', 'tagline', 'description', 'websiteUrl', 'categoryId', 'pricingModel', 'hasApi', 'hasMobileApp', 'launchYear'] as const) {
    if (has(f, key) && f[key] !== null && f[key] !== undefined) (data as Record<string, unknown>)[key] = f[key];
  }
  for (const key of ['affiliateUrl', 'pricingUrl', 'headquartersCountry', 'headquartersCity', 'logoUrl', 'twitterUrl', 'linkedinUrl', 'demoVideoUrl', 'freeTrialDays', 'startingPrice'] as const) {
    if (has(f, key)) (data as Record<string, unknown>)[key] = f[key] || null;
  }
  if (has(f, 'founderNames')) data.founderNames = (f.founderNames as string[]) ?? [];
  if (has(f, 'screenshotUrls')) data.screenshotUrls = (f.screenshotUrls as string[]) ?? [];
  if (has(f, 'socialLinks')) data.socialLinks = json(f.socialLinks);
  await tx.aiTool.update({ where: { id }, data, select: { id: true } });

  if (has(f, 'features')) await replaceToolUseCases(tx, id, 'feature', (f.features as string[]) ?? []);
  if (has(f, 'useCases')) await replaceToolUseCases(tx, id, 'use_case', (f.useCases as string[]) ?? []);
  if (has(f, 'faqs')) {
    await tx.$executeRaw`DELETE FROM "ToolFAQ" WHERE "toolId" = ${id}`;
    for (const [i, faq] of ((f.faqs as { question: string; answer: string }[] | null) ?? []).entries()) {
      await tx.$executeRaw`INSERT INTO "ToolFAQ" (id, "toolId", question, answer, "order", "createdAt", "updatedAt") VALUES (gen_random_uuid()::text, ${id}, ${faq.question}, ${faq.answer}, ${i}, NOW(), NOW())`;
    }
  }
  if (has(f, 'pros')) {
    await tx.$executeRaw`DELETE FROM "ToolPro" WHERE "toolId" = ${id}`;
    for (const text of (f.pros as string[] | null) ?? []) await tx.$executeRaw`INSERT INTO "ToolPro" (id, "toolId", text) VALUES (gen_random_uuid(), ${id}, ${text})`;
  }
  if (has(f, 'cons')) {
    await tx.$executeRaw`DELETE FROM "ToolCon" WHERE "toolId" = ${id}`;
    for (const text of (f.cons as string[] | null) ?? []) await tx.$executeRaw`INSERT INTO "ToolCon" (id, "toolId", text) VALUES (gen_random_uuid(), ${id}, ${text})`;
  }
  if (has(f, 'tagIds')) {
    const wanted = ((f.tagIds as string[] | null) ?? []).slice(0, 30);
    const current = (await tx.$queryRaw<{ tagId: string }[]>`SELECT "tagId" FROM "ToolSystemTagMapping" WHERE "toolId" = ${id}`).map((r) => r.tagId);
    const remove = current.filter((t) => !wanted.includes(t));
    const add = wanted.filter((t) => !current.includes(t));
    if (remove.length) {
      await tx.$executeRaw`DELETE FROM "ToolSystemTagMapping" WHERE "toolId" = ${id} AND "tagId" = ANY(${remove}::text[])`;
      await tx.$executeRaw`UPDATE "ToolSystemTag" SET "tagCount" = GREATEST("tagCount" - 1, 0), "updatedAt" = NOW() WHERE id = ANY(${remove}::text[])`;
    }
    if (add.length) {
      for (const tagId of add) {
        await tx.$executeRaw`INSERT INTO "ToolSystemTagMapping" (id, "toolId", "tagId", "addedBy", "createdAt") VALUES (gen_random_uuid(), ${id}, ${tagId}, 'founder', NOW()) ON CONFLICT ("toolId", "tagId") DO NOTHING`;
      }
      await tx.$executeRaw`UPDATE "ToolSystemTag" SET "tagCount" = "tagCount" + 1, "updatedAt" = NOW() WHERE id = ANY(${add}::text[])`;
    }
  }
}

/** The badge proves one domain. A website that's moved to another domain has to be proved again. Returns true if removed. */
async function removeBadgeIfDomainMoved(tx: Tx, type: ListingType, id: string, before: unknown, after: unknown): Promise<boolean> {
  if (websiteDomain(before as string) === websiteDomain(after as string)) return false;
  if (type === 'startup') {
    const { count } = await tx.startup.updateMany({ where: { id, isVerified: true }, data: { isVerified: false, verifiedAt: null, verifiedDomain: null, verificationToken: null } });
    if (count === 0) return false;
    // Jobs stop showing under the startup as verified until the new domain is proved.
    await tx.jobBoardEmployer.updateMany({
      where: { startupId: id, startupClaimMethod: { in: ['FOUNDER', 'DNS_TXT', 'DOMAIN_OTP'] } },
      data: { startupClaimMethod: 'LEGACY_UNVERIFIED', startupClaimVerifiedAt: null },
    });
    await tx.startup.updateMany({ where: { id, claimStatus: 'VERIFIED' }, data: { claimStatus: 'CLAIMED' } });
    return true;
  }
  const { count } = await tx.aiTool.updateMany({ where: { id, isUrlVerified: true }, data: { isUrlVerified: false } });
  if (count === 0) return false;
  await tx.aiTool.updateMany({ where: { id, claimStatus: 'VERIFIED' }, data: { claimStatus: 'CLAIMED' } });
  return true;
}

/** Saves the old version, then applies. The one way a listing's public fields change. */
async function publishFields(tx: Tx, type: ListingType, id: string, current: ListingFields, fields: ListingFields, actor: EditActor, note?: string): Promise<{ badgeRemoved: boolean }> {
  await tx.listingVersion.create({
    data: {
      entityType: type, entityId: id, fields: current as Prisma.InputJsonValue, changedFields: Object.keys(fields),
      actorType: actor.type, actorId: actor.id, actorLabel: actor.label, note: note ?? null,
    },
  });
  if (type === 'startup') await applyStartupFields(tx, id, fields);
  else await applyToolFields(tx, id, fields);
  const badgeRemoved = has(fields, 'websiteUrl') ? await removeBadgeIfDomainMoved(tx, type, id, current.websiteUrl, fields.websiteUrl) : false;
  return { badgeRemoved };
}

async function listingState(type: ListingType, id: string) {
  if (type === 'startup') {
    const s = await prisma.startup.findUnique({ where: { id }, select: { isApproved: true, isVerified: true, claimStatus: true } });
    return s && { isLive: s.isApproved, isVerified: s.isVerified, claimStatus: s.claimStatus };
  }
  const t = await prisma.aiTool.findUnique({ where: { id }, select: { status: true, isUrlVerified: true, claimStatus: true } });
  return t && { isLive: t.status === 'APPROVED' || t.status === 'FEATURED', isVerified: t.isUrlVerified, claimStatus: t.claimStatus };
}

export type ListingEditResult = { published: string[]; pending: string[]; resubmitted: boolean; badgeRemoved: boolean };

/** A founder saved the edit form. Unchanged fields are ignored, and a new value replaces an older one waiting for review. */
export async function saveListingEdit(type: ListingType, id: string, incomingRaw: ListingFields, actor: EditActor): Promise<ListingEditResult | null> {
  const current = await readListingFields(type, id);
  const state = await listingState(type, id);
  if (!current || !state) return null;

  const incoming = normalizeListingInput(type, incomingRaw);
  // Rupee amounts are worked out from dollars at today's rate, and rounds with no amount can't be shown on the form,
  // so neither counts as the founder changing anything.
  const comparable = (f: ListingFields) => (Array.isArray(f.fundingRounds)
    ? { ...f, fundingRounds: (f.fundingRounds as { amountUsd?: number | null; amountInr?: unknown }[]).filter((r) => (r.amountUsd ?? 0) > 0).map(({ amountInr: _inr, ...r }) => r) }
    : f);
  const changed = changedListingFields(comparable(current), comparable(incoming));
  const { publish, review } = decideListingEdit(state, changed);
  const resubmitted = state.claimStatus === 'REJECTED';

  const result = await prisma.$transaction(async (tx) => {
    // Going back to the live value withdraws what was waiting for that field.
    const untouched = Object.keys(incoming).filter((f) => incoming[f] !== undefined && !changed.includes(f));
    if (untouched.length) {
      await tx.listingPendingEdit.updateMany({
        where: { entityType: type, entityId: id, status: 'PENDING', field: { in: untouched }, submittedById: actor.id },
        data: { status: 'WITHDRAWN', reviewedAt: new Date() },
      });
    }

    let badgeRemoved = false;
    if (publish.length) {
      const fields = Object.fromEntries(publish.map((f) => [f, incoming[f]]));
      ({ badgeRemoved } = await publishFields(tx, type, id, current, fields, actor));
    }
    for (const field of review) {
      await tx.listingPendingEdit.updateMany({
        where: { entityType: type, entityId: id, status: 'PENDING', field },
        data: { status: 'REPLACED', reviewedAt: new Date() },
      });
      await tx.listingPendingEdit.create({
        data: {
          entityType: type, entityId: id, field, oldValue: json(current[field]), newValue: json(incoming[field]),
          submittedById: actor.id, submittedByName: actor.label,
        },
      });
    }

    if (resubmitted) {
      if (type === 'startup') await tx.startup.update({ where: { id }, data: { claimStatus: 'PENDING' }, select: { id: true } });
      else await tx.aiTool.update({ where: { id }, data: { claimStatus: 'PENDING', status: 'PENDING' }, select: { id: true } });
    }
    return { badgeRemoved };
  }, TX);

  return { published: publish, pending: review, resubmitted, badgeRemoved: result.badgeRemoved };
}

export type EditDecision = { approved: string[]; rejected: string[]; listing: { type: ListingType; id: string; name: string; ownerId: string | null; badgeRemoved: boolean } | null };

/** An admin approves or rejects waiting fields of one listing. A rejection only closes the request: the live listing stays. */
export async function decideListingEdits(editIds: string[], action: 'approve' | 'reject', admin: EditActor, note?: string): Promise<EditDecision> {
  const edits = await prisma.listingPendingEdit.findMany({ where: { id: { in: editIds }, status: 'PENDING' } });
  if (edits.length === 0) return { approved: [], rejected: [], listing: null };
  const type = edits[0].entityType as ListingType;
  const id = edits[0].entityId;
  const mine = edits.filter((e) => e.entityType === type && e.entityId === id);
  const fields = mine.map((e) => e.field);

  let badgeRemoved = false;
  await prisma.$transaction(async (tx) => {
    if (action === 'approve') {
      const current = await readListingFields(type, id, tx);
      if (current) {
        const values = Object.fromEntries(mine.map((e) => [e.field, e.newValue]));
        ({ badgeRemoved } = await publishFields(tx, type, id, current, values, admin, `Approved edit by ${mine[0].submittedByName ?? 'founder'}`));
      }
    }
    await tx.listingPendingEdit.updateMany({
      where: { id: { in: mine.map((e) => e.id) } },
      data: { status: action === 'approve' ? 'APPROVED' : 'REJECTED', reviewedById: admin.id, reviewNote: note ?? null, reviewedAt: new Date() },
    });
  }, TX);

  const owner = type === 'startup'
    ? await prisma.startup.findUnique({ where: { id }, select: { name: true, ownerId: true } })
    : await prisma.aiTool.findUnique({ where: { id }, select: { name: true, ownerId: true } });
  return {
    approved: action === 'approve' ? fields : [],
    rejected: action === 'reject' ? fields : [],
    listing: { type, id, name: owner?.name ?? 'Listing', ownerId: owner?.ownerId ?? null, badgeRemoved },
  };
}

/** Admin override: puts a listing back to an earlier version. The state it had just now is saved first, so this can be undone too. */
export async function restoreListingVersion(versionId: string, admin: EditActor): Promise<{ type: ListingType; id: string; name: string; ownerId: string | null } | null> {
  const version = await prisma.listingVersion.findUnique({ where: { id: versionId } });
  if (!version) return null;
  const type = version.entityType as ListingType;
  const id = version.entityId;
  await prisma.$transaction(async (tx) => {
    const current = await readListingFields(type, id, tx);
    if (!current) return;
    const old = version.fields as ListingFields;
    const changed = Object.keys(old).filter((f) => !sameListingValue(current[f], old[f]));
    if (changed.length) await publishFields(tx, type, id, current, Object.fromEntries(changed.map((f) => [f, old[f]])), admin, 'Restored an earlier version');
  }, TX);
  const owner = type === 'startup'
    ? await prisma.startup.findUnique({ where: { id }, select: { name: true, ownerId: true } })
    : await prisma.aiTool.findUnique({ where: { id }, select: { name: true, ownerId: true } });
  return { type, id, name: owner?.name ?? 'Listing', ownerId: owner?.ownerId ?? null };
}
