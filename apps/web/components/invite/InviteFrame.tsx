import Link from 'next/link';
import Logo from '@/components/Logo';
import { CONTROL_FIELD } from '@/lib/ui/form-controls';

/**
 * One look for every team invitation (organizer, founder, employer): the logo, a centered card, the invited email
 * locked in, and the same footer. Pages fill in the heading, the fields and the button.
 */
export function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[400px] font-jakarta">
      <Link href="/" aria-label="Udyaibase home" className="mb-6 flex justify-center"><Logo height={40} /></Link>
      {children}
    </div>
  );
}

export function InviteCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-8 sm:px-8">{children}</div>;
}

/** "Join {team}" and who invited you, as what. `detail` says what the role can do. */
export function InviteHeading({ team, inviter, role, detail }: { team: string; inviter?: string | null; role: string; detail?: string | null }) {
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">Join {team}</h1>
      <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
        {inviter ? `${inviter} invited you` : 'You’ve been invited'} to join as <span className="font-medium text-gray-900 dark:text-white">{role}</span>.
        {detail ? ` ${detail}` : ''}
      </p>
    </>
  );
}

/** The invited address: fixed, and given to password managers as the username. */
export function InviteEmail({ email }: { email: string }) {
  return (
    <div>
      <label htmlFor="invite-email" className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1.5">Email</label>
      <input id="invite-email" type="email" name="username" autoComplete="username" value={email} readOnly
        className={`${CONTROL_FIELD} bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 cursor-default focus:ring-0 focus:border-gray-300 dark:focus:border-gray-700`} />
    </div>
  );
}

export function InviteFooter({ expiresAt }: { expiresAt?: string | Date | null }) {
  const expires = expiresAt ? new Date(expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : null;
  return (
    <p className="mt-5 px-2 text-center text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
      By continuing, you agree to the <Link href="/terms" className="underline underline-offset-2 hover:text-gray-700 dark:hover:text-gray-200">Terms</Link> and{' '}
      <Link href="/privacy" className="underline underline-offset-2 hover:text-gray-700 dark:hover:text-gray-200">Privacy Policy</Link>.
      {expires ? ` This invitation expires on ${expires}.` : ''} Not expecting it? You can ignore it.
    </p>
  );
}

/** Role names arrive as VIEWER / RECRUITER; show "Viewer". */
export const roleLabel = (r: string) => r.charAt(0).toUpperCase() + r.slice(1).toLowerCase().replace(/_/g, ' ');
