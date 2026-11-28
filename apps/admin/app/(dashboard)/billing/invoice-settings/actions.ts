'use server';

import crypto from 'crypto';
import { prisma } from '@udyaibase/database';
import { requireActionAuth } from '@/lib/api-auth';
import { sectionRoles } from '@/lib/section-access';
import { logAuditEvent } from '@/lib/audit-log';
import { publicError } from '@/lib/public-error';
import { tooManyShared } from '@/lib/rate-limit';
import { callWeb, webLinkProblem } from '@/lib/web-internal';
import { INVOICE_PRODUCTS, INVOICE_SETTINGS_KEY, validateInvoiceSettings, type InvoiceField, type InvoiceProduct, type InvoiceSettings } from '@/lib/billing/invoice-settings';

const ROLES = sectionRoles('/billing');

async function readSaved(): Promise<InvoiceSettings> {
  const rows = await prisma.$queryRaw<Array<{ value: unknown }>>`SELECT value FROM "SiteSetting" WHERE key = ${INVOICE_SETTINGS_KEY} LIMIT 1`;
  const v = validateInvoiceSettings(rows[0]?.value);
  return v.ok ? v.data : {};
}

/** Invoices already issued that don't yet carry their own copy of the seller details. */
async function unfrozenInvoices(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT (
      (SELECT COUNT(*) FROM "JobBoardPayment" WHERE "invoiceNumber" IS NOT NULL AND "billingSnapshot" IS NOT NULL AND jsonb_typeof("billingSnapshot") = 'object' AND NOT jsonb_exists("billingSnapshot", 'seller')) +
      (SELECT COUNT(*) FROM "OrganizerPayment" WHERE "invoiceNumber" IS NOT NULL AND "billingSnapshot" IS NOT NULL AND jsonb_typeof("billingSnapshot") = 'object' AND NOT jsonb_exists("billingSnapshot", 'seller')) +
      (SELECT COUNT(*) FROM "FundingDataPurchase" WHERE "invoiceNumber" IS NOT NULL AND "billingSnapshot" IS NOT NULL AND jsonb_typeof("billingSnapshot") = 'object' AND NOT jsonb_exists("billingSnapshot", 'seller'))
    )::int AS n`;
  return rows[0]?.n ?? 0;
}

export interface InvoiceSettingsView {
  saved: InvoiceSettings;
  /** What an empty field falls back to (the web app's server settings); null when the web app could not be asked. */
  fallback: (Partial<Record<InvoiceField, string>> & { prefix?: string }) | null;
  /** Whether invoices are being issued today; null when the web app could not be asked. */
  enabled: boolean | null;
  /** Why the website could not be asked, when it could not. */
  linkProblem: string | null;
  updatedAt: string | null;
}

export async function getInvoiceSettingsAction(): Promise<{ success: true; data: InvoiceSettingsView } | { success: false; error: string }> {
  const { error } = await requireActionAuth(ROLES);
  if (error) return { success: false, error };
  try {
    const [saved, meta, res] = await Promise.all([
      readSaved(),
      prisma.$queryRaw<Array<{ updatedAt: Date }>>`SELECT "updatedAt" FROM "SiteSetting" WHERE key = ${INVOICE_SETTINGS_KEY} LIMIT 1`,
      callWeb('/api/webhooks/invoice-settings', { action: 'status' }, 8000),
    ]);
    const status = res?.ok ? ((await res.json().catch(() => null)) as { enabled?: boolean; fallback?: InvoiceSettingsView['fallback'] } | null) : null;
    return { success: true, data: { saved, fallback: status?.fallback ?? null, enabled: status?.enabled ?? null, linkProblem: status ? null : webLinkProblem(res) ?? 'The website answered with an error.', updatedAt: meta[0]?.updatedAt.toISOString() ?? null } };
  } catch (e) {
    return { success: false, error: publicError(e, "Couldn't load the invoice settings.") };
  }
}

/** A sample invoice PDF built from what is typed in the form. Nothing is saved. */
export async function previewInvoiceAction(draft: unknown, product: InvoiceProduct): Promise<{ success: true; pdfBase64: string } | { success: false; error: string; field?: InvoiceField }> {
  const { error, session } = await requireActionAuth(ROLES);
  if (error) return { success: false, error };
  const limited = await tooManyShared(session!.user.id, 'invoicePreview');
  if (limited) return { success: false, error: limited };
  const v = validateInvoiceSettings(draft);
  if (!v.ok) return { success: false, error: v.error, field: v.field };
  if (!INVOICE_PRODUCTS.some((p) => p.key === product)) return { success: false, error: 'Choose what the sample invoice is for.' };
  const res = await callWeb('/api/webhooks/invoice-settings', { action: 'preview', settings: v.data, product });
  const problem = webLinkProblem(res);
  if (problem || !res) return { success: false, error: `No preview: ${problem}` };
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    return { success: false, error: j?.error || "Couldn't build the preview. Try again." };
  }
  return { success: true, pdfBase64: Buffer.from(await res.arrayBuffer()).toString('base64') };
}

/**
 * Save the invoice settings. Invoices already issued are first given their own copy of today's seller details,
 * so what was sent never changes; if that can't be done, nothing is saved.
 */
export async function saveInvoiceSettingsAction(draft: unknown): Promise<{ success: true; protectedInvoices: number } | { success: false; error: string; field?: InvoiceField }> {
  const { error, session } = await requireActionAuth(ROLES);
  if (error) return { success: false, error };
  const limited = await tooManyShared(session!.user.id, 'planChange');
  if (limited) return { success: false, error: limited };
  const v = validateInvoiceSettings(draft);
  if (!v.ok) return { success: false, error: v.error, field: v.field };

  try {
    const before = await readSaved();
    const pending = await unfrozenInvoices();
    let protectedInvoices = 0;
    if (pending > 0) {
      const res = await callWeb('/api/webhooks/invoice-settings', { action: 'freeze' }, 30000);
      const j = res?.ok ? ((await res.json().catch(() => null)) as { frozen?: number; skipped?: string } | null) : null;
      // "invoices_off" means there are no seller details today, so there is nothing to keep those invoices as.
      const stillPending = j?.skipped === 'invoices_off' ? 0 : j ? await unfrozenInvoices() : pending;
      if (stillPending > 0) {
        return { success: false, error: `Not saved. ${stillPending.toLocaleString('en-IN')} invoice${stillPending === 1 ? '' : 's'} already issued could not be locked to the current seller details first, so saving now would change them. ${webLinkProblem(res ?? null) ?? 'Try again in a minute.'}` };
      }
      protectedInvoices = j?.frozen ?? 0;
    }

    const json = JSON.stringify(v.data);
    const id = `setting_${INVOICE_SETTINGS_KEY}_${crypto.randomUUID()}`;
    await prisma.$executeRaw`
      INSERT INTO "SiteSetting" (id, key, value, "updatedAt") VALUES (${id}, ${INVOICE_SETTINGS_KEY}, ${json}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = ${json}::jsonb, "updatedAt" = NOW()`;
    await logAuditEvent({ action: 'UPDATE', resourceType: 'SETTINGS', resourceName: 'Invoice settings', before, after: v.data });
    return { success: true, protectedInvoices };
  } catch (e) {
    return { success: false, error: publicError(e, "Couldn't save the invoice settings. Try again.") };
  }
}
