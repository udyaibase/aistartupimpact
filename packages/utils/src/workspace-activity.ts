/**
 * Activity log of an employer (hiring) or event-host workspace: the actions recorded, the filters they belong to,
 * and how each reads in the portal. Shared by the writer (apps/web/lib/workspace-activity.ts) and the two pages.
 * A Record per action, so adding one without wording fails the type check.
 */

export type WorkspaceKind = 'EMPLOYER' | 'ORGANIZER';

type Common =
  | 'signed_in' | 'sign_in_failed' | 'password_changed' | 'password_reset' | 'email_change_requested'
  | '2fa_enabled' | '2fa_disabled' | 'data_exported' | 'account_deactivated' | 'account_reactivated'
  | 'team_member_invited' | 'team_invite_accepted' | 'team_role_changed' | 'team_member_removed'
  | 'plan_purchased' | 'billing_details_changed' | 'profile_updated';

export type EmployerActivity = Common
  | 'job_posted' | 'job_updated' | 'job_status_changed' | 'job_deleted' | 'applications_exported';

export type OrganizerActivity = Common
  | 'boost_purchased' | 'event_created' | 'event_updated' | 'event_published' | 'event_cancelled' | 'event_deleted'
  | 'ticket_refunded' | 'payout_details_changed' | 'attendees_exported';

export type WorkspaceActivity = EmployerActivity | OrganizerActivity;
export type WorkspaceActivityCategory = 'security' | 'team' | 'billing' | 'work';

type Metadata = Record<string, unknown> | null;
const text = (m: Metadata, key: string) => (typeof m?.[key] === 'string' ? (m[key] as string) : '');
const quoted = (m: Metadata, key: string, fallback: string) => (text(m, key) ? `“${text(m, key)}”` : fallback);

const SIGN_IN_METHOD: Record<string, string> = {
  password: 'with a password',
  password_2fa: 'with a password and 2FA code',
  code: 'with an email code',
  google: 'with Google',
  founder: 'with the founder account',
};

type Display = { category: WorkspaceActivityCategory; title: (m: Metadata) => string };

const COMMON: Record<Common, Display> = {
  signed_in: { category: 'security', title: (m) => `Signed in ${SIGN_IN_METHOD[text(m, 'method')] ?? ''}`.trim() },
  sign_in_failed: { category: 'security', title: (m) => (text(m, 'reason') === 'wrong_2fa_code' ? 'Failed sign-in: wrong 2FA code' : 'Failed sign-in: wrong password') },
  password_changed: { category: 'security', title: () => 'Changed the password' },
  password_reset: { category: 'security', title: () => 'Reset the password' },
  email_change_requested: { category: 'security', title: () => 'Asked to change the sign-in email' },
  '2fa_enabled': { category: 'security', title: () => 'Turned on two-factor login' },
  '2fa_disabled': { category: 'security', title: () => 'Turned off two-factor login' },
  data_exported: { category: 'security', title: () => 'Downloaded the account data' },
  account_deactivated: { category: 'security', title: () => 'Deactivated the account' },
  account_reactivated: { category: 'security', title: () => 'Reactivated the account' },
  team_member_invited: { category: 'team', title: (m) => `Invited ${text(m, 'member') || 'a team member'}${text(m, 'role') ? ` as ${text(m, 'role').toLowerCase()}` : ''}` },
  team_invite_accepted: { category: 'team', title: (m) => `${text(m, 'member') || 'A teammate'} joined the team` },
  team_role_changed: { category: 'team', title: (m) => `Changed ${text(m, 'member') || 'a team member'}’s role${text(m, 'role') ? ` to ${text(m, 'role').toLowerCase()}` : ''}` },
  team_member_removed: { category: 'team', title: (m) => `Removed ${text(m, 'member') || 'a team member'} from the team` },
  plan_purchased: { category: 'billing', title: (m) => `Paid for the ${text(m, 'plan') || 'plan'}${text(m, 'amount') ? ` (${text(m, 'amount')})` : ''}` },
  billing_details_changed: { category: 'billing', title: () => 'Updated the invoice details' },
  profile_updated: { category: 'work', title: (m) => `Updated the ${text(m, 'what') || 'profile'}` },
};

const EMPLOYER: Record<EmployerActivity, Display> = {
  ...COMMON,
  job_posted: { category: 'work', title: (m) => `Posted the job ${quoted(m, 'title', '')}`.trim() },
  job_updated: { category: 'work', title: (m) => `Edited the job ${quoted(m, 'title', '')}`.trim() },
  job_status_changed: { category: 'work', title: (m) => `${text(m, 'status') === 'OPEN' ? 'Reopened' : text(m, 'status') === 'PAUSED' ? 'Paused' : 'Closed'} the job ${quoted(m, 'title', '')}`.trim() },
  job_deleted: { category: 'work', title: (m) => `Deleted the job ${quoted(m, 'title', '')}`.trim() },
  applications_exported: { category: 'security', title: (m) => `Exported ${text(m, 'count') || ''} applications`.replace('  ', ' ') },
};

const ORGANIZER: Record<OrganizerActivity, Display> = {
  ...COMMON,
  boost_purchased: { category: 'billing', title: (m) => `Boosted ${quoted(m, 'event', 'an event')}${text(m, 'amount') ? ` (${text(m, 'amount')})` : ''}` },
  event_created: { category: 'work', title: (m) => `Created the event ${quoted(m, 'title', '')}`.trim() },
  event_updated: { category: 'work', title: (m) => `Edited the event ${quoted(m, 'title', '')}`.trim() },
  event_published: { category: 'work', title: (m) => `Published the event ${quoted(m, 'title', '')}`.trim() },
  event_cancelled: { category: 'work', title: (m) => `Cancelled the event ${quoted(m, 'title', '')}`.trim() },
  event_deleted: { category: 'work', title: (m) => `Deleted the event ${quoted(m, 'title', '')}`.trim() },
  ticket_refunded: { category: 'billing', title: (m) => `Refunded ${text(m, 'attendee') || 'a ticket'}${text(m, 'event') ? ` for “${text(m, 'event')}”` : ''}${text(m, 'amount') ? ` (${text(m, 'amount')})` : ''}` },
  payout_details_changed: { category: 'billing', title: () => 'Updated the payout bank details' },
  attendees_exported: { category: 'security', title: (m) => `Exported the attendee list${text(m, 'event') ? ` for “${text(m, 'event')}”` : ''}` },
};

const TABLE: Record<WorkspaceKind, Record<string, Display>> = { EMPLOYER, ORGANIZER };

export function describeWorkspaceActivity(kind: WorkspaceKind, action: string, metadata: unknown): { title: string; category: WorkspaceActivityCategory } {
  const table = TABLE[kind];
  const entry = Object.prototype.hasOwnProperty.call(table, action) ? table[action] : null;
  if (!entry) return { title: 'Account activity', category: 'security' };
  const m = metadata && typeof metadata === 'object' ? (metadata as Metadata) : null;
  return { title: entry.title(m), category: entry.category };
}

export function workspaceActionsIn(kind: WorkspaceKind, category: WorkspaceActivityCategory): string[] {
  return Object.entries(TABLE[kind]).filter(([, d]) => d.category === category).map(([action]) => action);
}
