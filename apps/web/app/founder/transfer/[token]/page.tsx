import Link from 'next/link';
import { lookupTransfer } from '@/app/founder/startups/transfer-actions';
import TransferRespond from './TransferRespond';

export const dynamic = 'force-dynamic';

export default async function TransferPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const t = await lookupTransfer(token);

  const box = (title: string, body: React.ReactNode) => (
    <div className="max-w-lg card p-6">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h1>
      <div className="text-sm text-gray-600 dark:text-gray-400">{body}</div>
      <Link href="/founder/dashboard" className="inline-block mt-5 text-sm font-semibold text-brand">Go to dashboard →</Link>
    </div>
  );

  if (t.state === 'invalid') return box('This link isn’t valid', 'Check you opened the full link from the email.');
  if (t.state === 'used') return box('This transfer is closed', 'It was already accepted, declined or cancelled. Ask the owner to send a new link if you still need it.');
  if (t.state === 'expired') return box('This link has expired', 'Transfer links last 7 days. Ask the owner to send a new one.');
  if (t.state === 'wrong-account') {
    return box('Sign in with the right email', <>This transfer was sent to <strong>{t.sentTo}</strong>. Sign out and sign in (or sign up) with that email, then open the link again.</>);
  }

  return (
    <div className="max-w-lg card p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand mb-1">Ownership transfer</p>
      <h1 className="text-xl font-bold font-sora text-gray-900 dark:text-white mb-2">Become the owner of {t.startupName}?</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
        {t.fromName} wants to hand {t.startupName} to you. As owner you can edit the listing, manage the team and verify the domain.
        {t.verified ? ' The listing keeps its verified tick; if your email isn’t on the startup’s domain, verify it yourself within 90 days to keep it.' : ''}
      </p>
      <TransferRespond token={token} atLimit={t.atLimit} limitMessage={t.limitMessage} />
    </div>
  );
}
