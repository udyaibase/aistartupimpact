import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createTicket } from '@/lib/support-tickets';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';
import { validateInput, sanitizeText } from '@/lib/validation';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { humanCheckFailed } from '@/lib/turnstile';

export const dynamic = 'force-dynamic';

const contactSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Please enter a valid email address'),
  category: z.enum(['ACCOUNT', 'BILLING', 'BUG_REPORT', 'FEATURE_REQUEST', 'LISTING', 'EVENT', 'JOB_BOARD', 'OTHER']),
  subject: z.string().min(3, 'Subject must be at least 3 characters').max(200),
  message: z.string().min(10, 'Message must be at least 10 characters').max(5000),
});

export async function POST(request: NextRequest) {
  try {
    const identifier = getClientIdentifier(request);
    const { success } = await checkRateLimit(strictRateLimit, identifier);
    if (!success) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const body = await request.json();

    // The bot check is required: checking it only when a token was sent let bots leave it out.
    const notHuman = await humanCheckFailed(body.turnstileToken);
    if (notHuman) return notHuman;

    const validation = validateInput(contactSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { name, email, category, subject, message } = validation.data;

    const ticket = await createTicket({
      subject: sanitizeText(subject),
      description: sanitizeText(message),
      category,
      priority: 'MEDIUM',
      portal: 'PUBLIC',
      submitterType: 'PUBLIC',
      submitterId: email,
      submitterEmail: email,
      submitterName: sanitizeText(name),
    });

    sendEmailFireAndForget({
      to: email,
      subject: `We received your message — ${ticket.ticketNumber}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px;">
          <h2 style="color: #1a1a2e;">Thanks for reaching out, ${sanitizeText(name)}!</h2>
          <p>We've received your message and created ticket <strong>${ticket.ticketNumber}</strong>.</p>
          <p><strong>Subject:</strong> ${sanitizeText(subject)}</p>
          <p><strong>Category:</strong> ${category.replace('_', ' ')}</p>
          <p>Our team typically responds within 24–48 hours. If your matter is urgent, email us directly at <a href="mailto:hello@udyaibase.com">hello@udyaibase.com</a>.</p>
          <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
          <p style="color: #888; font-size: 13px;">Udyaibase Technologies Pvt Ltd · Vijayawada, India</p>
        </div>
      `,
      from: process.env.RESEND_FROM_EMAIL || 'noreply@udyaibase.com',
    });

    const adminEmail = process.env.ADMIN_DIGEST_EMAIL || 'admin@udyaibase.com';
    sendEmailFireAndForget({
      to: adminEmail,
      subject: `New contact form: ${sanitizeText(subject)} [${ticket.ticketNumber}]`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px;">
          <h2>New Contact Form Submission</h2>
          <p><strong>Ticket:</strong> ${ticket.ticketNumber}</p>
          <p><strong>From:</strong> ${sanitizeText(name)} (${email})</p>
          <p><strong>Category:</strong> ${category}</p>
          <p><strong>Subject:</strong> ${sanitizeText(subject)}</p>
          <hr style="border: none; border-top: 1px solid #e5e5e5;" />
          <p>${sanitizeText(message).replace(/\n/g, '<br/>')}</p>
        </div>
      `,
      from: process.env.RESEND_FROM_EMAIL || 'noreply@udyaibase.com',
    });

    return NextResponse.json({
      success: true,
      ticketNumber: ticket.ticketNumber,
    });
  } catch (error) {
    console.error('[Contact] Error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Failed to submit. Please try again.' }, { status: 500 });
  }
}
