import { prisma } from '@udyaibase/database';
import { GSTIN_RE, panFromGstin } from '@/lib/billing/details';

/**
 * Who issues our GST invoices, and the SAC code printed on them.
 *
 * Set in Admin → Billing → Invoice settings (stored as the `invoiceSettings` site setting). Any field left empty
 * there falls back to the server setting it replaced (INVOICE_SELLER_NAME, INVOICE_SELLER_GSTIN,
 * INVOICE_SELLER_ADDRESS, INVOICE_SAC, INVOICE_SELLER_EMAIL, INVOICE_SELLER_CIN, INVOICE_SELLER_PHONE,
 * INVOICE_SELLER_WEBSITE), so nothing changes until someone
 * saves the screen. The invoice number prefix stays a server setting: changing it mid-year would break the series.
 *
 * These are the details for NEW invoices. An issued invoice carries its own frozen copy (see `freezeSeller`).
 */

export const INVOICE_SETTINGS_KEY = 'invoiceSettings';

/** What we sell and invoice. Each can have its own SAC code. */
export const INVOICE_PRODUCTS = ['employer', 'organizer', 'funding'] as const;
export type InvoiceProduct = (typeof INVOICE_PRODUCTS)[number];

/** A Services Accounting Code (or HSN code for goods): 4, 6 or 8 digits. */
export const SAC_RE = /^(\d{4}|\d{6}|\d{8})$/;
export const FOOTER_NOTE_MAX = 200;

/** The saved screen. Every field is optional; empty means "use the server setting". */
export interface InvoiceSettings {
  sellerName?: string;
  gstin?: string;
  address?: string;
  email?: string;
  /** Company law asks a company to print its phone number and website on bills, with its CIN and registered office. */
  phone?: string;
  website?: string;
  cin?: string;
  sac?: string;
  sacEmployer?: string;
  sacOrganizer?: string;
  sacFunding?: string;
  footerNote?: string;
}

export interface Seller {
  name: string;
  gstin: string;
  address: string;
  /** The SAC used when a product has none of its own. */
  sac: string;
  sacBy: Partial<Record<InvoiceProduct, string>>;
  stateCode: string;
  pan: string;
  email: string;
  phone: string | null;
  website: string | null;
  cin: string | null;
  prefix: string;
  footerNote: string | null;
}

/** The seller exactly as printed on one invoice; stored with the invoice so later edits never change it. */
export interface FrozenSeller {
  name: string;
  gstin: string;
  address: string;
  sac: string;
  stateCode: string;
  pan: string;
  email: string;
  phone?: string | null;
  website?: string | null;
  cin: string | null;
  footerNote: string | null;
}

/** +91 98765 43210, 080-4123-4567: digits with optional +, spaces and hyphens. */
export const PHONE_RE = /^\+?[0-9][0-9 -]{6,18}[0-9]$/;
/** udyaibase.com or www.udyaibase.com: a bare host, as printed. */
export const WEBSITE_RE = /^([a-z0-9-]+\.)+[a-z]{2,}$/;
const host = (v: string) => v.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Keep only well-formed values from whatever was stored; a bad value is dropped, not printed. */
export function sanitizeInvoiceSettings(raw: unknown): InvoiceSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const gstin = clean(r.gstin, 15).toUpperCase();
  const sac = (k: string) => { const v = clean(r[k], 8); return SAC_RE.test(v) ? v : ''; };
  const email = clean(r.email, 120);
  const out: InvoiceSettings = {
    sellerName: clean(r.sellerName, 120),
    gstin: GSTIN_RE.test(gstin) ? gstin : '',
    address: clean(r.address, 300),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
    phone: PHONE_RE.test(clean(r.phone, 20)) ? clean(r.phone, 20) : '',
    website: WEBSITE_RE.test(host(clean(r.website, 80))) ? host(clean(r.website, 80)) : '',
    cin: clean(r.cin, 21).toUpperCase(),
    sac: sac('sac'), sacEmployer: sac('sacEmployer'), sacOrganizer: sac('sacOrganizer'), sacFunding: sac('sacFunding'),
    footerNote: clean(r.footerNote, FOOTER_NOTE_MAX),
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v)) as InvoiceSettings;
}

/**
 * The start of every invoice number (UTPL/26-27/0001). A server setting, never edited from the admin.
 * At most 4 characters, so the whole number stays inside GST's 16-character limit.
 */
export const invoicePrefix = (env: Record<string, string | undefined> = process.env) =>
  (env.INVOICE_PREFIX || 'UTPL').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 4) || 'UTPL';

/** The seller for new invoices: saved settings over server settings. Null while a required detail is missing. */
export function sellerFrom(settings: InvoiceSettings, env: Record<string, string | undefined> = process.env): Seller | null {
  const s = sanitizeInvoiceSettings(settings);
  const name = s.sellerName || env.INVOICE_SELLER_NAME?.trim();
  const gstin = s.gstin || env.INVOICE_SELLER_GSTIN?.trim().toUpperCase();
  const address = s.address || env.INVOICE_SELLER_ADDRESS?.trim();
  const sac = s.sac || env.INVOICE_SAC?.trim();
  if (!name || !gstin || !address || !sac || !GSTIN_RE.test(gstin)) return null;
  const sacBy: Seller['sacBy'] = {};
  if (s.sacEmployer) sacBy.employer = s.sacEmployer;
  if (s.sacOrganizer) sacBy.organizer = s.sacOrganizer;
  if (s.sacFunding) sacBy.funding = s.sacFunding;
  return {
    name, gstin, address, sac, sacBy, stateCode: gstin.slice(0, 2), pan: panFromGstin(gstin),
    email: s.email || env.INVOICE_SELLER_EMAIL || 'billing@udyaibase.com',
    phone: s.phone || env.INVOICE_SELLER_PHONE?.trim() || null,
    website: s.website || env.INVOICE_SELLER_WEBSITE?.trim() || 'udyaibase.com',
    cin: s.cin || env.INVOICE_SELLER_CIN || null,
    prefix: invoicePrefix(env),
    footerNote: s.footerNote || null,
  };
}

export const sacFor = (seller: Seller, product: InvoiceProduct) => seller.sacBy[product] || seller.sac;

export function freezeSeller(seller: Seller, product: InvoiceProduct): FrozenSeller {
  return {
    name: seller.name, gstin: seller.gstin, address: seller.address, sac: sacFor(seller, product),
    stateCode: seller.stateCode, pan: seller.pan, email: seller.email, phone: seller.phone, website: seller.website, cin: seller.cin, footerNote: seller.footerNote,
  };
}

/** A frozen seller read back from a stored invoice, or null when the invoice predates freezing. */
export function frozenSellerOf(snapshot: unknown): FrozenSeller | null {
  const s = (snapshot && typeof snapshot === 'object' ? (snapshot as { seller?: unknown }).seller : null) as Partial<FrozenSeller> | null;
  if (!s || typeof s.name !== 'string' || typeof s.gstin !== 'string' || typeof s.address !== 'string' || typeof s.sac !== 'string') return null;
  return {
    name: s.name, gstin: s.gstin, address: s.address, sac: s.sac, stateCode: s.stateCode || s.gstin.slice(0, 2), pan: s.pan || panFromGstin(s.gstin),
    email: s.email || 'billing@udyaibase.com', phone: s.phone ?? null, website: s.website ?? null, cin: s.cin ?? null, footerNote: s.footerNote ?? null,
  };
}

export async function loadInvoiceSettings(): Promise<InvoiceSettings> {
  try {
    const rows = await prisma.$queryRaw<Array<{ value: unknown }>>`SELECT value FROM "SiteSetting" WHERE key = ${INVOICE_SETTINGS_KEY} LIMIT 1`;
    return sanitizeInvoiceSettings(rows[0]?.value);
  } catch {
    // Settings unreadable: fall back to the server settings rather than stop invoicing.
    return {};
  }
}

export async function loadSeller(): Promise<Seller | null> {
  return sellerFrom(await loadInvoiceSettings());
}
