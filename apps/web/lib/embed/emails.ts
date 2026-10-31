import { sendEmail, sendEmailFireAndForget } from "@/lib/email/send";
import { buildDirectLink, buildSnippet, getPlatform, PLATFORMS, siteOrigin } from "./platforms";

const CRIMSON = "#A50F15";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function shell(body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#F7F7F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px">
<tr><td style="padding:32px">${body}</td></tr></table>
<p style="font-size:12px;color:#6b7280;margin:16px 0 0">Udyaibase &middot; Events for India's tech community</p>
</td></tr></table></body></html>`;
}

export async function sendDeveloperInstructions(opts: {
  to: string;
  widgetId: string;
  platformId: string | null;
  organizerName: string;
  organizerEmail: string;
  note?: string;
  /** "jobs" sends the careers widget code. */
  kind?: "events" | "jobs";
}) {
  const jobs = opts.kind === "jobs";
  const noun = (t: string) => (jobs ? t.replace(/\bevents\b/g, "jobs").replace(/\bEvents\b/g, "Careers") : t);
  const platform = getPlatform(opts.platformId) ?? PLATFORMS[0];
  const code = platform.mode === "link"
    ? (jobs ? `${siteOrigin()}/embed/jobs/${opts.widgetId}` : buildDirectLink(opts.widgetId))
    : (jobs ? buildSnippet(opts.widgetId).replace("data-udyaibase-widget", "data-udyaibase-jobs") : buildSnippet(opts.widgetId));
  const steps = platform.steps.map((s) => `<li style="margin:0 0 8px">${esc(noun(s))}</li>`).join("");
  const what = jobs ? "open jobs" : "events";
  const note = opts.note?.trim()
    ? `<p style="margin:0 0 20px;padding:12px 16px;background:#F7F7F9;border-radius:10px;font-size:14px">&ldquo;${esc(opts.note.trim().slice(0, 500))}&rdquo;</p>`
    : "";

  const html = shell(`
<h1 style="font-size:20px;margin:0 0 8px">Add ${esc(opts.organizerName)}'s ${what} to the website</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">${esc(opts.organizerName)} asked you to install their Udyaibase ${jobs ? "careers" : "events"} widget${platform.id !== "html" ? ` on ${esc(platform.label)}` : ""}. It takes about two minutes and you don't need an account.</p>
${note}
<p style="margin:0 0 8px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#6b7280">${platform.mode === "link" ? "Link" : "Code"}</p>
<pre style="margin:0 0 24px;padding:16px;background:#111827;color:#f9fafb;border-radius:10px;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-all">${esc(code)}</pre>
<p style="margin:0 0 8px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#6b7280">Steps for ${esc(platform.label)}</p>
<ol style="margin:0 0 20px;padding-left:20px;font-size:15px;line-height:1.6">${steps}</ol>
${platform.note ? `<p style="margin:0 0 20px;font-size:14px;color:#4b5563">${esc(noun(platform.note))}</p>` : ""}
<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#4b5563">The widget resizes itself and loads lazily, so it won't slow the page down. All styling is managed by ${esc(opts.organizerName)} from Udyaibase; you won't need to change the code later. ${esc(opts.organizerName)} will see it go live automatically once the page is published.</p>
<p style="margin:0;font-size:14px;color:#4b5563">Questions? Reply to this email to reach ${esc(opts.organizerName)}.</p>`);

  return sendEmail({
    to: opts.to,
    replyTo: opts.organizerEmail,
    subject: `Install the ${jobs ? "careers" : "events"} widget for ${opts.organizerName}`,
    html,
    type: "embed_developer_instructions",
  });
}

export function sendWidgetLiveEmail(opts: { to: string; name: string; host: string; widgetId: string }) {
  const manageUrl = `${siteOrigin()}/organizer/embed/${opts.widgetId}`;
  const html = shell(`
<h1 style="font-size:20px;margin:0 0 8px">Your events are live on ${esc(opts.host)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">Hi ${esc(opts.name.split(" ")[0] || opts.name)}, we just saw your Udyaibase widget load on <strong>${esc(opts.host)}</strong>. Visitors can now browse and register for your events without leaving your site.</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6">Registrations from your site show up in Attendees, tagged with the page they came from. New events you publish appear on your site automatically.</p>
<a href="${esc(manageUrl)}" style="display:inline-block;padding:12px 20px;background:${CRIMSON};color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px">View widget</a>`);

  sendEmailFireAndForget({
    to: opts.to,
    subject: `Your events are live on ${opts.host}`,
    html,
    type: "embed_widget_live",
  });
}
