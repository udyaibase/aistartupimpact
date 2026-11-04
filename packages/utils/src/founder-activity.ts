export type FounderActivity =
  | 'signed_in' | 'sign_in_failed'
  | 'password_changed' | 'password_reset' | 'email_change_requested'
  | '2fa_enabled' | '2fa_disabled'
  | 'data_exported' | 'account_deactivated' | 'account_reactivated' | 'account_deleted'
  | 'public_profile_changed' | 'startup_claim_verified' | 'verification_removed' | 'engagement_email' | 'email_tips_changed' | 'edit_submitted' | 'edit_approved' | 'edit_rejected' | 'team_invite_accepted' | 'team_invite_declined'
  | 'startup_submitted' | 'startup_updated' | 'tool_submitted' | 'tool_updated'
  | 'team_member_invited' | 'team_role_changed' | 'team_member_removed';

export type ActivityCategory = 'security' | 'listings' | 'team';
type Metadata = Record<string, unknown> | null;

const text = (m: Metadata, key: string) => (typeof m?.[key] === 'string' ? (m[key] as string) : '');

const SIGN_IN_METHOD: Record<string, string> = {
  password: 'with your password',
  password_2fa: 'with your password and 2FA code',
  google: 'with Google',
};

/** How each logged action reads to the founder. A Record, so a new action can't be forgotten here. */
const DISPLAY: Record<FounderActivity, { category: ActivityCategory; title: (m: Metadata) => string }> = {
  signed_in: { category: 'security', title: (m) => `Signed in ${SIGN_IN_METHOD[text(m, 'method')] ?? ''}`.trim() },
  sign_in_failed: { category: 'security', title: (m) => (text(m, 'reason') === 'wrong_2fa_code' ? 'Failed sign-in: wrong 2FA code' : 'Failed sign-in: wrong password') },
  password_changed: { category: 'security', title: () => 'Changed your password' },
  password_reset: { category: 'security', title: () => 'Reset your password' },
  email_change_requested: { category: 'security', title: () => 'Asked to change your email address' },
  '2fa_enabled': { category: 'security', title: () => 'Turned on two-factor login' },
  '2fa_disabled': { category: 'security', title: () => 'Turned off two-factor login' },
  data_exported: { category: 'security', title: () => 'Downloaded your data' },
  account_deactivated: { category: 'security', title: () => 'Deactivated your account' },
  account_reactivated: { category: 'security', title: () => 'Reactivated your account' },
  account_deleted: { category: 'security', title: () => 'Deleted your account' },
  public_profile_changed: { category: 'security', title: (m) => (m?.visible === false ? 'Hid you from your startup’s profile' : 'Showed you on your startup’s profile') },
  startup_claim_verified: { category: 'listings', title: (m) => `Proved ownership of your startup${text(m, 'method') === 'email' ? ' by work email' : text(m, 'method') === 'dns' ? ' by DNS record' : ''}` },
  verification_removed: { category: 'listings', title: (m) => `Verified badge removed from ${text(m, 'name') || 'your listing'} because its website changed` },
  engagement_email: { category: 'security', title: () => 'We emailed you a tip about your listing' },
  email_tips_changed: { category: 'security', title: (m) => (m?.on === false ? 'Turned off tips and reports by email' : 'Turned on tips and reports by email') },
  edit_submitted: { category: 'listings', title: (m) => `Sent ${text(m, 'fields') || 'changes'} for review${text(m, 'by') ? ` (by ${text(m, 'by')})` : ''}` },
  edit_approved: { category: 'listings', title: (m) => `Our team approved your ${text(m, 'fields') || 'changes'}` },
  edit_rejected: { category: 'listings', title: (m) => `Our team didn’t approve your ${text(m, 'fields') || 'changes'}` },
  team_invite_accepted: { category: 'team', title: (m) => `${text(m, 'member') || 'A teammate'} joined your team` },
  team_invite_declined: { category: 'team', title: (m) => `${text(m, 'member') || 'Someone'} declined your team invite` },
  startup_submitted: { category: 'listings', title: (m) => `Submitted ${text(m, 'name') || 'your startup'} for review` },
  startup_updated: { category: 'listings', title: (m) => `Edited ${text(m, 'name') || 'your startup'}${text(m, 'by') ? ` (by ${text(m, 'by')})` : ''}` },
  tool_submitted: { category: 'listings', title: (m) => `Submitted ${text(m, 'name') || 'your AI tool'} for review` },
  tool_updated: { category: 'listings', title: (m) => `Edited ${text(m, 'name') || 'your AI tool'}${text(m, 'by') ? ` (by ${text(m, 'by')})` : ''}` },
  team_member_invited: { category: 'team', title: (m) => `Invited ${text(m, 'member') || 'a team member'}${text(m, 'role') ? ` as ${text(m, 'role').toLowerCase()}` : ''}` },
  team_role_changed: { category: 'team', title: (m) => `Changed ${text(m, 'member') || 'a team member'}’s role${text(m, 'role') ? ` to ${text(m, 'role').toLowerCase()}` : ''}` },
  team_member_removed: { category: 'team', title: (m) => `Removed ${text(m, 'member') || 'a team member'} from your team` },
};

export function describeActivity(action: string, metadata: unknown): { title: string; category: ActivityCategory } {
  const entry = Object.prototype.hasOwnProperty.call(DISPLAY, action) ? DISPLAY[action as FounderActivity] : null;
  if (!entry) return { title: 'Account activity', category: 'security' };
  const m = metadata && typeof metadata === 'object' ? (metadata as Metadata) : null;
  return { title: entry.title(m), category: entry.category };
}

export function actionsIn(category: ActivityCategory): string[] {
  return Object.entries(DISPLAY).filter(([, d]) => d.category === category).map(([action]) => action);
}

/** "Chrome on Mac" from a user agent, or null when it can't be told. */
export function describeDevice(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const ua = userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null;
  const os = /iPhone|iPad/.test(ua) ? 'iPhone or iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac'
    : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os;
}
