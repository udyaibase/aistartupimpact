import { sendEmailFireAndForget } from '@/lib/email/send';
import { esc, shell } from '@/lib/jobs/apply-emails';

/** A 6-digit code for a job seeker: signing in, confirming their email, or a withdraw/delete from a private link. */
export function sendCandidateCode(opts: { to: string; code: string; purpose: 'sign_in' | 'verify' | 'app_action' }) {
  const what = opts.purpose === 'sign_in' ? 'sign in to Udyaibase'
    : opts.purpose === 'verify' ? 'confirm your email on Udyaibase'
    : 'confirm the change to your job application';
  sendEmailFireAndForget({
    to: opts.to,
    subject: 'Your Udyaibase code',
    type: `candidate_code_${opts.purpose}`,
    html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Your code</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Enter this code to ${esc(what)}:</p>
<p style="margin:0 0 16px;font-size:28px;font-weight:700;letter-spacing:6px">${esc(opts.code)}</p>
<p style="margin:0;font-size:13px;color:#6b7280">It expires in 10 minutes. If you didn’t ask for it, you can ignore this email.</p>`),
  });
}
