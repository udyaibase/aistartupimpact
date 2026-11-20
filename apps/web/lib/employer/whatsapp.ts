/**
 * A wa.me link that opens the recruiter's own WhatsApp with a ready message. Udyaibase sends and stores nothing.
 * Indian 10-digit numbers get +91; anything that isn't 8–15 digits after cleaning gets no link.
 */
export function whatsappLink(phone: string | null | undefined, ctx: { firstName: string; jobTitle: string; company: string }): string | null {
  if (!phone) return null;
  const raw = phone.trim();
  let digits = raw.replace(/\D/g, '');
  if (!raw.startsWith('+') && digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (!raw.startsWith('+') && digits.length === 10) digits = `91${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  const from = ctx.company ? ` from ${ctx.company}` : '';
  const text = `Hi ${ctx.firstName}, this is the hiring team${from} about your application for ${ctx.jobTitle}.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
