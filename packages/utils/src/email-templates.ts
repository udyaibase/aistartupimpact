function getSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  return url && !url.includes('localhost') ? url : 'https://udyaibase.com';
}

function emailWrapper(content: string, accentColor = '#6366f1', brandName = 'Udyaibase'): string {
  const siteUrl = getSiteUrl();
  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
  <div style="border-bottom: 3px solid ${accentColor}; padding-bottom: 20px; margin-bottom: 30px;">
    <h1 style="color: #111827; font-size: 20px; font-weight: 700; margin: 0;">${brandName}</h1>
  </div>
  ${content}
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
  <p style="color: #6b7280; font-size: 13px; line-height: 1.5; margin: 0;">
    Best regards,<br/>
    The ${brandName} Team<br/>
    <a href="${siteUrl}" style="color: ${accentColor}; text-decoration: none;">${siteUrl}</a>
  </p>
  <p style="color: #9ca3af; font-size: 11px; margin-top: 16px;">
    <a href="${siteUrl}/privacy" style="color: #9ca3af; text-decoration: underline;">Privacy Policy</a>
    &nbsp;&middot;&nbsp;
    <a href="${siteUrl}/terms" style="color: #9ca3af; text-decoration: underline;">Terms</a>
  </p>
</div>`;
}

function eventsWrapper(content: string): string {
  return emailWrapper(content, '#FF3131', 'Udyaibase Events');
}

function eventsButton(href: string, label: string): string {
  return `<a href="${href}" style="background: #FF3131; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 10px; display: inline-block; font-size: 15px; font-weight: 700;">${label}</a>`;
}

function primaryButton(href: string, label: string): string {
  return `<a href="${href}" style="background: #111827; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-size: 14px; font-weight: 600;">${label}</a>`;
}

function secondaryButton(href: string, label: string): string {
  return `<a href="${href}" style="background: #ffffff; color: #374151; padding: 12px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-size: 14px; font-weight: 600; border: 1px solid #d1d5db; margin-left: 12px;">${label}</a>`;
}

function infoBox(label: string, content: string): string {
  return `<div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
  <p style="color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px 0; font-weight: 600;">${label}</p>
  ${content}
</div>`;
}

export function startupApprovalHtml(name: string, founderName: string, slug: string): string {
  const siteUrl = getSiteUrl();
  const liveUrl = `${siteUrl}/startups/${slug}`;
  const dashboardUrl = `${siteUrl}/founder/dashboard`;

  return emailWrapper(`
  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 8px;">Hi ${founderName || 'there'},</p>

  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
    Your startup <strong>"${name}"</strong> has been reviewed and approved by our editorial team. Your listing is now live and visible to investors, enterprise buyers, and the broader AI ecosystem.
  </p>

  ${infoBox('Your Live Listing', `<a href="${liveUrl}" style="color: #6366f1; font-size: 15px; font-weight: 600; text-decoration: none;">${liveUrl}</a>`)}

  <div style="margin: 32px 0;">
    ${primaryButton(liveUrl, 'View Your Listing')}
    ${secondaryButton(dashboardUrl, 'Founder Dashboard')}
  </div>

  <div style="background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <p style="color: #4338ca; font-size: 14px; font-weight: 700; margin: 0 0 8px 0;">Get Your Verified Badge</p>
    <p style="color: #374151; font-size: 14px; line-height: 1.5; margin: 0;">
      Verifying your startup through the DNS will help you get a verified badge and increase trust with investors and enterprise buyers. You can configure this easily from your <a href="${dashboardUrl}" style="color: #6366f1; font-weight: 600; text-decoration: none;">Founder Dashboard</a>.
    </p>
  </div>

  <p style="color: #374151; font-size: 15px; line-height: 1.6; margin-bottom: 8px;">
    To increase visibility, we recommend sharing your listing on LinkedIn and with your network.
  </p>`);
}

export function toolApprovalHtml(name: string, founderName: string, slug: string): string {
  const siteUrl = getSiteUrl();
  const liveUrl = `${siteUrl}/tools/${slug}`;
  const dashboardUrl = `${siteUrl}/founder/dashboard`;

  return emailWrapper(`
  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 8px;">Hi ${founderName || 'there'},</p>

  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
    Your AI tool <strong>"${name}"</strong> has been reviewed and approved by our editorial team. Your listing is now live and discoverable by developers, enterprise buyers, and the broader AI community.
  </p>

  ${infoBox('Your Live Listing', `<a href="${liveUrl}" style="color: #6366f1; font-size: 15px; font-weight: 600; text-decoration: none;">${liveUrl}</a>`)}

  <div style="margin: 32px 0;">
    ${primaryButton(liveUrl, 'View Your Listing')}
    ${secondaryButton(dashboardUrl, 'Founder Dashboard')}
  </div>

  <p style="color: #374151; font-size: 15px; line-height: 1.6; margin-bottom: 8px;">
    To increase visibility, we recommend sharing your listing on LinkedIn and with your network.
  </p>`);
}

export function startupRejectionHtml(
  name: string,
  founderName: string,
  reason: string,
  details: { tagline?: string; description?: string; stage?: string; websiteUrl?: string }
): string {
  const siteUrl = getSiteUrl();
  const dashboardUrl = `${siteUrl}/founder/dashboard`;

  return emailWrapper(`
  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 8px;">Hi ${founderName || 'there'},</p>

  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
    Thank you for submitting <strong>"${name}"</strong> to Udyaibase. We appreciate your patience while our editorial team reviewed your application.
  </p>

  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
    After careful review, we unfortunately cannot approve your listing in its current state. Please see the details of our review feedback below:
  </p>

  <div style="background: #fdf2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <p style="color: #b91c1c; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px 0; font-weight: 600;">Feedback from Editorial Team</p>
    <p style="color: #7f1d1d; font-size: 15px; line-height: 1.6; margin: 0; font-style: italic;">"${reason}"</p>
  </div>

  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 16px;">
    For your reference, here are the details that were submitted:
  </p>

  <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <p style="margin: 0 0 12px 0; color: #111827; font-weight: 600; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">Submitted Profile Details</p>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr><td style="padding: 6px 0; color: #6b7280; width: 35%; font-weight: 500;">Startup Name</td><td style="padding: 6px 0; color: #111827; font-weight: 600;">${name}</td></tr>
      <tr><td style="padding: 6px 0; color: #6b7280; font-weight: 500;">Tagline</td><td style="padding: 6px 0; color: #374151;">${details.tagline || 'N/A'}</td></tr>
      <tr><td style="padding: 6px 0; color: #6b7280; vertical-align: top; font-weight: 500;">Description</td><td style="padding: 6px 0; color: #374151; line-height: 1.4;">${details.description || 'N/A'}</td></tr>
      <tr><td style="padding: 6px 0; color: #6b7280; font-weight: 500;">Stage</td><td style="padding: 6px 0; color: #374151;">${details.stage || 'N/A'}</td></tr>
      <tr><td style="padding: 6px 0; color: #6b7280; font-weight: 500;">Website</td><td style="padding: 6px 0; color: #374151;">${details.websiteUrl ? `<a href="${details.websiteUrl}" style="color: #6366f1; text-decoration: none;">${details.websiteUrl}</a>` : 'N/A'}</td></tr>
    </table>
  </div>

  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
    Please verify the fields once, update any incorrect details or add missing information, and submit again for approval.
  </p>

  <div style="margin: 32px 0;">
    ${primaryButton(dashboardUrl, 'Edit & Re-submit Listing')}
  </div>`, '#ef4444');
}

export function userInvitationHtml(name: string, role: string): string {
  const adminUrl = process.env.NODE_ENV === 'production'
    ? (process.env.ADMIN_NEXTAUTH_URL || 'https://admin.udyaibase.com')
    : (process.env.ADMIN_NEXTAUTH_URL || 'http://localhost:3001');

  return emailWrapper(`
  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 8px;">Hi ${name},</p>

  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
    You have been invited to join the Udyaibase editorial team as <strong>${role.replace(/_/g, ' ')}</strong>.
  </p>

  <p style="color: #374151; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
    Sign in with the Google account associated with this email address to access the admin dashboard.
  </p>

  <div style="margin: 32px 0;">
    ${primaryButton(`${adminUrl}/login`, 'Sign In to Dashboard')}
  </div>`);
}

export function submissionReceivedHtml(name: string, entityType: 'startup' | 'tool', entityName: string): string {
  const siteUrl = getSiteUrl();

  return emailWrapper(`
  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 8px;">Hi ${name},</p>

  <p style="color: #374151; font-size: 16px; line-height: 1.6;">Thank you for submitting "${entityName}" to Udyaibase.</p>
  <p style="color: #374151; font-size: 16px; line-height: 1.6;">Our team will review your submission within 2-3 business days.</p>
  <p style="color: #374151; font-size: 16px; line-height: 1.6;"><strong>Status:</strong> Pending Review</p>

  <div style="margin: 30px 0;">
    ${primaryButton(`${siteUrl}/founder/dashboard`, 'View in Dashboard')}
  </div>`);
}

export function verificationEmailHtml(name: string, verifyUrl: string): string {
  return emailWrapper(`
  <h2 style="color: #1f2937;">Welcome to Udyaibase, ${name}!</h2>
  <p style="color: #4b5563; line-height: 1.6;">Please verify your email address by clicking the button below:</p>
  <div style="margin: 30px 0;">
    <a href="${verifyUrl}" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Verify Email</a>
  </div>
  <p style="color: #6b7280; font-size: 14px;">Or copy this link: ${verifyUrl}</p>
  <p style="color: #6b7280; font-size: 14px;">This link will expire in 24 hours.</p>
  <p style="color: #6b7280; font-size: 14px;">If you didn't create an account, please ignore this email.</p>`);
}

export function passwordResetHtml(name: string, resetUrl: string): string {
  return emailWrapper(`
  <h2 style="color: #1f2937;">Password Reset Request</h2>
  <p style="color: #4b5563; line-height: 1.6;">Hi ${name},</p>
  <p style="color: #4b5563; line-height: 1.6;">Click the button below to reset your password:</p>
  <div style="margin: 30px 0;">
    <a href="${resetUrl}" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a>
  </div>
  <p style="color: #6b7280; font-size: 14px;">Or copy this link: ${resetUrl}</p>
  <p style="color: #6b7280; font-size: 14px;">This link will expire in 1 hour.</p>
  <p style="color: #6b7280; font-size: 14px;">If you didn't request this, please ignore this email.</p>`);
}

export function jobApplicationHtml(name: string, role: string): string {
  return emailWrapper(`
  <h2 style="color: #1f2937;">Application Received</h2>
  <p style="color: #4b5563; line-height: 1.6;">Hi ${name},</p>
  <p style="color: #4b5563; line-height: 1.6;">Thank you for applying for the <strong>${role}</strong> position at Udyaibase.</p>
  <p style="color: #4b5563; line-height: 1.6;">We've received your application and will review it carefully. If your profile is a good match, we'll reach out to schedule the next steps.</p>
  <p style="color: #6b7280; font-size: 14px;">This is an automated confirmation — no reply needed.</p>`);
}

export function paymentSuccessHtml(toolName: string, founderName: string, tier: string): string {
  const siteUrl = getSiteUrl();
  const dashboardUrl = `${siteUrl}/founder/dashboard`;

  return emailWrapper(`
  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 8px;">Hi ${founderName || 'there'},</p>

  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
    Your payment has been successfully processed! Your AI tool <strong>"${toolName}"</strong> has been upgraded to the <strong>${tier}</strong> tier.
  </p>

  <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <p style="color: #166534; font-size: 14px; font-weight: 700; margin: 0 0 8px 0;">Payment Confirmed</p>
    <p style="color: #374151; font-size: 14px; line-height: 1.5; margin: 0;">
      Your listing now includes all ${tier} features. Changes are live immediately.
    </p>
  </div>

  <div style="margin: 32px 0;">
    ${primaryButton(dashboardUrl, 'View Dashboard')}
  </div>`);
}

export function newsletterConfirmHtml(confirmUrl: string): string {
  return emailWrapper(`
  <h2 style="color: #1f2937;">Confirm your subscription</h2>
  <p style="color: #4b5563; line-height: 1.6;">Thanks for signing up for the Udyaibase newsletter!</p>
  <p style="color: #4b5563; line-height: 1.6;">Please click the button below to confirm your email address and start receiving our weekly digest.</p>
  <div style="margin: 30px 0; text-align: center;">
    ${primaryButton(confirmUrl, 'Confirm Subscription')}
  </div>
  <p style="color: #6b7280; font-size: 14px;">Or copy this link: ${confirmUrl}</p>
  <p style="color: #6b7280; font-size: 14px;">This link expires in 7 days. If you didn't sign up, you can safely ignore this email.</p>`);
}

export function newsletterWelcomeHtml(isResubscribe = false): string {
  const siteUrl = getSiteUrl();

  if (isResubscribe) {
    return emailWrapper(`
    <h2 style="color: #1f2937;">Welcome Back!</h2>
    <p style="color: #4b5563; line-height: 1.6;">You've been re-subscribed to the Udyaibase newsletter.</p>
    <p style="color: #4b5563; line-height: 1.6;">You'll receive our weekly digest with the latest AI startups, tools, and industry insights.</p>
    <div style="margin: 30px 0;">
      ${primaryButton(siteUrl, 'Visit Udyaibase')}
    </div>`);
  }

  return emailWrapper(`
  <h2 style="color: #1f2937;">Welcome to Udyaibase!</h2>
  <p style="color: #4b5563; line-height: 1.6;">Thank you for subscribing to our newsletter.</p>
  <p style="color: #4b5563; line-height: 1.6;">Every week, you'll get curated updates on the most impactful AI startups, tools, funding rounds, and industry insights.</p>
  <div style="margin: 30px 0;">
    ${primaryButton(siteUrl, 'Explore AI Startups & Tools')}
  </div>`);
}

// ── Organizer: Verification ──────────────────────────────────────────────

export function organizerVerificationHtml(name: string, verifyUrl: string): string {
  return eventsWrapper(`
  <p style="color: #374151; font-size: 16px; line-height: 1.6;">Hi ${name},</p>
  <p style="color: #374151; font-size: 16px; line-height: 1.6;">Welcome! Please verify your email to start organizing AI events.</p>
  <div style="margin: 32px 0; text-align: center;">
    ${eventsButton(verifyUrl, 'Verify Email Address')}
  </div>
  <p style="color: #6b7280; font-size: 13px;">Or copy this link: <a href="${verifyUrl}" style="color: #FF3131;">${verifyUrl}</a></p>
  <p style="color: #6b7280; font-size: 13px;">This link expires in 24 hours.</p>
  <p style="color: #9ca3af; font-size: 11px;">If you didn't create an account, ignore this email.</p>`);
}

// ── Organizer: Password Reset ────────────────────────────────────────────

export function organizerPasswordResetHtml(name: string, resetUrl: string): string {
  return eventsWrapper(`
  <p style="color: #374151; font-size: 16px; line-height: 1.6;">Hi ${name},</p>
  <p style="color: #374151; font-size: 16px; line-height: 1.6;">We received a request to reset your password. Click below to set a new one:</p>
  <div style="margin: 32px 0; text-align: center;">
    ${primaryButton(resetUrl, 'Reset Password')}
  </div>
  <p style="color: #6b7280; font-size: 13px;">Or copy this link: <a href="${resetUrl}" style="color: #FF3131;">${resetUrl}</a></p>
  <p style="color: #6b7280; font-size: 13px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>`);
}

// ── Organizer: Team Invitation ───────────────────────────────────────────

export function teamInviteHtml(inviterName: string, role: string, acceptUrl: string): string {
  return eventsWrapper(`
  <p style="color: #374151; font-size: 16px; line-height: 1.6;">Hi,</p>
  <p style="color: #374151; font-size: 16px; line-height: 1.6;">
    <strong>${inviterName}</strong> has invited you as <strong>${role}</strong> to help manage events on Udyaibase.
  </p>
  <div style="margin: 32px 0; text-align: center;">
    ${eventsButton(acceptUrl, 'Accept Invitation')}
  </div>
  <p style="color: #6b7280; font-size: 13px;">This link expires in 7 days.</p>`);
}

export function founderTeamInviteHtml(inviterName: string, role: string, acceptUrl: string): string {
  return eventsWrapper(`
  <p style="color: #374151; font-size: 16px; line-height: 1.6;">Hi,</p>
  <p style="color: #374151; font-size: 16px; line-height: 1.6;">
    <strong>${inviterName}</strong> has invited you as <strong>${role}</strong> to their founder team on Udyaibase.
  </p>
  <div style="margin: 32px 0; text-align: center;">
    ${eventsButton(acceptUrl, 'Accept Invitation')}
  </div>
  <p style="color: #6b7280; font-size: 13px;">This link expires in 7 days.</p>`);
}

export function founderTeamOtpHtml(action: string, code: string): string {
  return eventsWrapper(`
  <p style="color: #374151; font-size: 16px; line-height: 1.6;">Security Verification</p>
  <p style="color: #374151; font-size: 14px; line-height: 1.6;">
    You requested to <strong>${action}</strong> on your founder team. Use this code to confirm:
  </p>
  <div style="margin: 24px 0; text-align: center;">
    <div style="display: inline-block; padding: 16px 32px; background: #f3f4f6; border-radius: 12px; letter-spacing: 8px; font-size: 32px; font-weight: 700; color: #111827; font-family: monospace;">${code}</div>
  </div>
  <p style="color: #6b7280; font-size: 13px;">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>`);
}

// ── Event: Registration Confirmation ─────────────────────────────────────

export interface EventEmailData {
  eventTitle: string;
  eventSlug: string;
  eventDate: string;
  eventTime: string;
  eventTimezone: string;
  venueName?: string;
  address?: string;
  format: string;
  qrToken: string;
  googleCalendarUrl: string;
  startAtIso?: string;
  endAtIso?: string;
}

export function eventRegistrationHtml(name: string, data: EventEmailData): string {
  const siteUrl = getSiteUrl();
  const eventUrl = `${siteUrl}/events/${data.eventSlug}`;
  const checkInUrl = `${siteUrl}/events/check-in?token=${data.qrToken}`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(checkInUrl)}`;

  const locationHtml = data.format === 'VIRTUAL'
    ? `<p style="color: #6b7280; font-size: 14px;">Location: Virtual Event — link will be shared before the event</p>`
    : data.venueName
    ? `<p style="color: #6b7280; font-size: 14px;">Location: ${data.venueName}${data.address ? `, ${data.address}` : ''}</p>`
    : '';

  return eventsWrapper(`
  <p style="color: #374151; font-size: 16px; line-height: 1.6;">Hi ${name},</p>
  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
    You're confirmed for <strong>${data.eventTitle}</strong>! Here are your event details:
  </p>

  <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
    <h2 style="color: #111827; font-size: 18px; font-weight: 700; margin: 0 0 12px 0;">${data.eventTitle}</h2>
    <p style="color: #6b7280; font-size: 14px; margin: 4px 0;">Date: ${data.eventDate}</p>
    <p style="color: #6b7280; font-size: 14px; margin: 4px 0;">Time: ${data.eventTime} (${data.eventTimezone})</p>
    ${locationHtml}
  </div>

  <div style="text-align: center; margin: 32px 0; padding: 24px; background: #ffffff; border: 2px dashed #e5e7eb; border-radius: 12px;">
    <p style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 16px 0; font-weight: 600;">Your Check-In QR Code</p>
    <img src="${qrImageUrl}" alt="Check-in QR Code" width="180" height="180" style="display: block; margin: 0 auto;" />
    <p style="color: #9ca3af; font-size: 11px; margin-top: 12px;">Show this at the event entrance</p>
  </div>

  <div style="text-align: center; margin: 32px 0;">
    ${primaryButton(data.googleCalendarUrl, 'Add to Calendar')}
    ${secondaryButton(eventUrl, 'View Event')}
  </div>

  <p style="color: #6b7280; font-size: 13px; line-height: 1.5;">See you there!</p>`);
}

// ── Event: Newsletter Welcome ────────────────────────────────────────────

export function eventNewsletterWelcomeHtml(name: string, unsubUrl: string): string {
  const siteUrl = getSiteUrl();

  return eventsWrapper(`
  <p style="color: #374151; font-size: 16px; line-height: 1.6;">Hi ${name},</p>
  <p style="color: #374151; font-size: 16px; line-height: 1.6;">
    You're now on the list! We'll notify you about upcoming AI events, conferences, and hackathons near you.
  </p>

  <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 20px; margin: 24px 0;">
    <p style="color: #991b1b; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">What you'll get:</p>
    <ul style="color: #374151; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
      <li>New AI events in your area</li>
      <li>Hackathon and workshop announcements</li>
      <li>Early access to popular events</li>
    </ul>
  </div>

  <p style="color: #6b7280; font-size: 14px;">
    Browse upcoming events: <a href="${siteUrl}/events" style="color: #FF3131; text-decoration: none; font-weight: 600;">${siteUrl}/events</a>
  </p>

  <p style="color: #9ca3af; font-size: 11px;">
    <a href="${unsubUrl}" style="color: #9ca3af; text-decoration: underline;">Unsubscribe</a> if you no longer want these updates.
  </p>`);
}

// ── Event: Registration Approved ─────────────────────────────────────────

export function registrationApprovedHtml(name: string, eventTitle: string, eventDate: string, eventSlug: string): string {
  const siteUrl = getSiteUrl();

  return eventsWrapper(`
  <p style="color: #374151; font-size: 16px; line-height: 1.6;">Hi ${name},</p>
  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
    Great news! Your registration for <strong>"${eventTitle}"</strong> on <strong>${eventDate}</strong> has been <strong>approved</strong>.
  </p>

  <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <p style="color: #166534; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">✓ Registration Confirmed</p>
    <p style="color: #374151; font-size: 14px; line-height: 1.5; margin: 0;">
      You're all set. We'll send you a confirmation email with your QR ticket closer to the event date.
    </p>
  </div>

  <div style="margin: 24px 0; text-align: center;">
    ${eventsButton(siteUrl + '/events/' + eventSlug, 'View Event Details')}
  </div>`);
}

// ── Event: Registration Rejected ─────────────────────────────────────────

export function registrationRejectedHtml(name: string, eventTitle: string, eventDate: string, reason?: string): string {
  return eventsWrapper(`
  <p style="color: #374151; font-size: 16px; line-height: 1.6;">Hi ${name},</p>
  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
    We're sorry, but your registration for <strong>"${eventTitle}"</strong> on <strong>${eventDate}</strong> was not approved.
  </p>

  <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <p style="color: #991b1b; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">Registration Not Approved</p>
    <p style="color: #374151; font-size: 14px; line-height: 1.5; margin: 0;">
      ${reason || 'The organizer has limited spots and was unable to approve your registration at this time. Please reach out to the organizer if you have questions.'}
    </p>
  </div>`);
}

// ── Event: Waitlist Promoted ─────────────────────────────────────────────

export function waitlistPromotedHtml(name: string, eventTitle: string, eventDate: string, eventSlug: string): string {
  const siteUrl = getSiteUrl();

  return eventsWrapper(`
  <p style="color: #374151; font-size: 16px; line-height: 1.6;">Hi ${name},</p>
  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
    A spot has opened up! You've been moved off the waitlist for <strong>"${eventTitle}"</strong> on <strong>${eventDate}</strong> and your registration is now <strong>confirmed</strong>.
  </p>

  <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <p style="color: #166534; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">✓ You're In!</p>
    <p style="color: #374151; font-size: 14px; line-height: 1.5; margin: 0;">
      Your waitlist registration has been promoted to confirmed. See you at the event!
    </p>
  </div>

  <div style="margin: 24px 0; text-align: center;">
    ${eventsButton(siteUrl + '/events/' + eventSlug, 'View Event Details')}
  </div>`);
}

// ── Event: Cancellation Notice ───────────────────────────────────────────

export function eventCancellationHtml(name: string, eventTitle: string, eventDate: string): string {
  const siteUrl = getSiteUrl();

  return eventsWrapper(`
  <p style="color: #374151; font-size: 16px; line-height: 1.6;">Hi ${name},</p>
  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
    We're sorry to inform you that <strong>"${eventTitle}"</strong> scheduled for <strong>${eventDate}</strong> has been cancelled.
  </p>

  <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <p style="color: #991b1b; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">Event Cancelled</p>
    <p style="color: #374151; font-size: 14px; line-height: 1.5; margin: 0;">
      If you had any questions, please reach out to the event organizer. We apologize for any inconvenience.
    </p>
  </div>

  <p style="color: #374151; font-size: 15px; line-height: 1.6;">Check out other upcoming events:</p>
  <div style="margin: 24px 0; text-align: center;">
    ${eventsButton(siteUrl + '/events', 'Browse Events')}
  </div>`);
}

// ── OTP Verification ─────────────────────────────────────────────────────

export function otpEmailHtml(code: string, context: 'default' | 'employer' = 'default'): string {
  const portalLabel = context === 'employer' ? 'Employer Portal' : '';
  const subtitle = context === 'employer'
    ? `Enter this code to complete your ${portalLabel} signup:`
    : 'Enter this code to continue. It expires in 10 minutes.';

  return emailWrapper(`
  <h2 style="color: #1f2937; font-size: 20px; margin-bottom: 8px;">Verify your email</h2>
  <p style="color: #6b7280; font-size: 15px; line-height: 1.5; margin-bottom: 24px;">${subtitle}</p>
  <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
    <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1a1a2e;">${code}</span>
  </div>
  <p style="color: #9ca3af; font-size: 13px; text-align: center;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>`);
}

// ── Company Email Verification OTP ──────────────────────────────────────

export function companyEmailOtpHtml(name: string, code: string): string {
  return emailWrapper(`
  <h2 style="color: #1f2937; font-size: 20px; margin-bottom: 8px;">Verify your company email</h2>
  <p style="color: #6b7280; font-size: 15px; line-height: 1.5; margin-bottom: 24px;">
    Hi ${name}, enter this code to verify your company email and earn a Verified badge on your profile:
  </p>
  <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
    <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1a1a2e;">${code}</span>
  </div>
  <p style="color: #9ca3af; font-size: 13px; text-align: center;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>`);
}

// ── Employer: Password Reset ─────────────────────────────────────────────

export function employerPasswordResetHtml(companyName: string, resetUrl: string): string {
  return emailWrapper(`
  <h2 style="color: #1f2937; font-size: 20px; margin-bottom: 8px;">Reset your password</h2>
  <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
    Hi ${companyName}, click below to reset your Employer Portal password:
  </p>
  <div style="margin: 32px 0; text-align: center;">
    ${primaryButton(resetUrl, 'Reset Password')}
  </div>
  <p style="color: #6b7280; font-size: 13px;">Or copy this link: <a href="${resetUrl}" style="color: #6366f1;">${resetUrl}</a></p>
  <p style="color: #6b7280; font-size: 13px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>`);
}

// ── Employer: Security Alert ─────────────────────────────────────────────

export function securityAlertHtml(companyName: string, attempts: number, lockoutMinutes: number, resetUrl: string): string {
  return emailWrapper(`
  <h2 style="color: #dc2626; font-size: 20px; margin-bottom: 8px;">Security Alert</h2>
  <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
    Someone attempted to sign in to your <strong>${companyName}</strong> Employer Portal account ${attempts} times with an incorrect password.
  </p>
  <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
    Your account has been temporarily locked for ${lockoutMinutes} minutes.
  </p>
  <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin-top: 16px;">
    If this wasn't you, we recommend <a href="${resetUrl}" style="color: #6366f1; font-weight: 600;">changing your password immediately</a>.
  </p>`, '#dc2626');
}

// ── Event: Promotion Campaign ────────────────────────────────────────────

export function eventPromotionHtml(subject: string, body: string, ctaUrl: string, ctaLabel: string, unsubUrl: string): string {
  return eventsWrapper(`
  <h2 style="margin: 0 0 16px; font-size: 20px; color: #111827;">${subject}</h2>
  <div style="font-size: 15px; line-height: 1.7; color: #374151; white-space: pre-wrap;">${body}</div>
  <div style="margin-top: 32px; text-align: center;">
    ${eventsButton(ctaUrl, ctaLabel)}
  </div>
  <p style="font-size: 11px; color: #9ca3af; margin-top: 32px;">
    <a href="${unsubUrl}" style="color: #9ca3af; text-decoration: underline;">Unsubscribe from event emails</a>
  </p>`);
}

// ── Admin: Daily Digest ──────────────────────────────────────────────────

export interface DigestData {
  date: string;
  pageViews: number;
  pageViewsChange: number;
  uniqueVisitors: number;
  topPages: Array<{ path: string; views: number }>;
  newSubscribers: number;
  totalSubscribers: number;
  newWebUsers: number;
  totalWebUsers: number;
  newFounders: number;
  totalFounders: number;
  toolClicks: number;
  topTools: Array<{ name: string; clicks: number }>;
  clickSources: Array<{ source: string; count: number }>;
  articlesPublished: number;
  articleViews: number;
}

export function dailyDigestHtml(data: DigestData): string {
  const changeIcon = data.pageViewsChange >= 0 ? '&#9650;' : '&#9660;';
  const changeColor = data.pageViewsChange >= 0 ? '#16a34a' : '#dc2626';

  const topPagesHtml = data.topPages.map(p =>
    `<tr><td style="padding:4px 0;color:#475569;font-size:14px">${p.path}</td><td style="padding:4px 0;color:#0f172a;font-size:14px;font-weight:600;text-align:right">${p.views}</td></tr>`
  ).join('');

  const topToolsHtml = data.topTools.map(t =>
    `<tr><td style="padding:4px 0;color:#475569;font-size:14px">${t.name}</td><td style="padding:4px 0;color:#0f172a;font-size:14px;font-weight:600;text-align:right">${t.clicks}</td></tr>`
  ).join('');

  const sourcesHtml = data.clickSources.map(s =>
    `<span style="display:inline-block;background:#f1f5f9;padding:4px 10px;border-radius:12px;font-size:12px;font-weight:600;color:#475569;margin:2px 4px 2px 0">${s.source} (${s.count})</span>`
  ).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table role="presentation" width="100%" style="background:#f8fafc;padding:24px 0"><tr><td align="center" style="padding:0 12px">
<table role="presentation" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td style="background:#0f172a;padding:24px 24px 20px">
<h1 style="color:#ffffff;font-size:20px;font-weight:700;margin:0 0 4px">Daily Digest</h1>
<p style="color:#94a3b8;font-size:13px;margin:0">${data.date}</p>
</td></tr>
<tr><td style="padding:24px 24px 0">
<h2 style="color:#0f172a;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 16px;padding-bottom:8px;border-bottom:2px solid #e2e8f0">Traffic</h2>
<table role="presentation" width="100%">
<tr><td style="padding:8px 0"><span style="color:#64748b;font-size:13px">Page Views</span></td><td style="text-align:right;padding:8px 0"><span style="color:#0f172a;font-size:18px;font-weight:700">${data.pageViews.toLocaleString()}</span> <span style="color:${changeColor};font-size:12px;font-weight:600">${changeIcon} ${Math.abs(data.pageViewsChange)}%</span></td></tr>
<tr><td style="padding:8px 0"><span style="color:#64748b;font-size:13px">Unique Visitors</span></td><td style="text-align:right;padding:8px 0"><span style="color:#0f172a;font-size:18px;font-weight:700">${data.uniqueVisitors.toLocaleString()}</span></td></tr>
</table>
${data.topPages.length > 0 ? `<p style="color:#64748b;font-size:12px;font-weight:600;margin:12px 0 4px">TOP PAGES</p><table role="presentation" width="100%">${topPagesHtml}</table>` : ''}
</td></tr>
<tr><td style="padding:24px 24px 0">
<h2 style="color:#0f172a;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 16px;padding-bottom:8px;border-bottom:2px solid #e2e8f0">Growth</h2>
<table role="presentation" width="100%">
<tr><td style="padding:6px 0;color:#64748b;font-size:13px">New Subscribers</td><td style="text-align:right;padding:6px 0"><span style="color:#0f172a;font-weight:700">${data.newSubscribers}</span> <span style="color:#94a3b8;font-size:12px">(Total: ${data.totalSubscribers.toLocaleString()})</span></td></tr>
<tr><td style="padding:6px 0;color:#64748b;font-size:13px">New Web Users</td><td style="text-align:right;padding:6px 0"><span style="color:#0f172a;font-weight:700">${data.newWebUsers}</span> <span style="color:#94a3b8;font-size:12px">(Total: ${data.totalWebUsers.toLocaleString()})</span></td></tr>
<tr><td style="padding:6px 0;color:#64748b;font-size:13px">New Founders</td><td style="text-align:right;padding:6px 0"><span style="color:#0f172a;font-weight:700">${data.newFounders}</span> <span style="color:#94a3b8;font-size:12px">(Total: ${data.totalFounders.toLocaleString()})</span></td></tr>
</table>
</td></tr>
<tr><td style="padding:24px 24px 0">
<h2 style="color:#0f172a;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 16px;padding-bottom:8px;border-bottom:2px solid #e2e8f0">Tool Clicks</h2>
<table role="presentation" width="100%">
<tr><td style="padding:6px 0;color:#64748b;font-size:13px">Total Clicks</td><td style="text-align:right;padding:6px 0;color:#0f172a;font-size:18px;font-weight:700">${data.toolClicks}</td></tr>
</table>
${data.topTools.length > 0 ? `<p style="color:#64748b;font-size:12px;font-weight:600;margin:12px 0 4px">TOP TOOLS</p><table role="presentation" width="100%">${topToolsHtml}</table>` : ''}
${data.clickSources.length > 0 ? `<p style="color:#64748b;font-size:12px;font-weight:600;margin:12px 0 6px">SOURCES</p><div>${sourcesHtml}</div>` : ''}
</td></tr>
<tr><td style="padding:24px 24px 24px">
<h2 style="color:#0f172a;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 16px;padding-bottom:8px;border-bottom:2px solid #e2e8f0">Content</h2>
<table role="presentation" width="100%">
<tr><td style="padding:6px 0;color:#64748b;font-size:13px">Articles Published</td><td style="text-align:right;padding:6px 0;color:#0f172a;font-weight:700">${data.articlesPublished}</td></tr>
<tr><td style="padding:6px 0;color:#64748b;font-size:13px">Article Views</td><td style="text-align:right;padding:6px 0;color:#0f172a;font-weight:700">${data.articleViews.toLocaleString()}</td></tr>
</table>
</td></tr>
<tr><td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
<p style="color:#94a3b8;font-size:11px;margin:0">Udyaibase - Daily Admin Digest</p>
<p style="color:#94a3b8;font-size:11px;margin:4px 0 0"><a href="https://udyaibase.com/admin/analytics" style="color:#6366f1;text-decoration:none">View Full Dashboard</a></p>
</td></tr>
</table>
</td></tr></table></body></html>`;
}
