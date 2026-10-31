import type { EmployerRole } from '@/lib/employer-auth';

/**
 * Who can do what in a hiring workspace. Checked on the server for every request;
 * the UI only hides what a role can't use.
 */
export const PERMISSIONS = {
  'jobs.view': ['OWNER', 'RECRUITER', 'INTERVIEWER'],
  'jobs.manage': ['OWNER', 'RECRUITER'],
  'candidates.view': ['OWNER', 'RECRUITER', 'INTERVIEWER'],
  'candidates.note': ['OWNER', 'RECRUITER', 'INTERVIEWER'],
  'candidates.move': ['OWNER', 'RECRUITER'],
  'candidates.export': ['OWNER', 'RECRUITER'],
  'widget.manage': ['OWNER', 'RECRUITER'],
  'insights.view': ['OWNER', 'RECRUITER'],
  'company.manage': ['OWNER'],
  'team.manage': ['OWNER'],
  'account.manage': ['OWNER'],
} as const satisfies Record<string, readonly EmployerRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export const ROLE_LABEL: Record<EmployerRole, string> = { OWNER: 'Owner', RECRUITER: 'Recruiter', INTERVIEWER: 'Interviewer' };
export const ROLE_DESCRIPTION: Record<EmployerRole, string> = {
  OWNER: 'Everything, including team, company profile and account settings.',
  RECRUITER: 'Post and manage jobs, move and email candidates, export, website widget.',
  INTERVIEWER: 'See candidates and resumes, and add notes, for every job or only the jobs you choose. Can’t move, email or export.',
};

/** Pages that show the whole workspace, hidden from interviewers limited to specific jobs. */
export const WORKSPACE_WIDE_PAGES = ['/employer/dashboard', '/employer/talent'];

export function can(role: EmployerRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly EmployerRole[]).includes(role);
}
