import { prisma } from '@udyaibase/database';
import { CHECKBOX_NO, CHECKBOX_YES, EMAIL_PATTERN, OCCUPATIONS, phoneProblem } from '@/lib/events/registration-fields';

/**
 * Server-side cleanup of what someone typed when registering, shared by the event page, the website widget and
 * paid checkout, so organizers get the same data whichever way people signed up. Throws RegistrationInputError
 * (with the field) instead of saving anything inconsistent.
 */

export class RegistrationInputError extends Error {
  constructor(message: string, readonly field: string) {
    super(message);
  }
}

export interface RawRegistrationInput {
  eventId: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  occupation?: string | null;
  answers?: { questionId: string; answerText: string }[] | null;
}

export interface CleanRegistrationInput {
  /** Trimmed and lowercase, so the same person can't register twice with different capitals. */
  email: string;
  /** "+91 9876543210", or null. */
  phone: string | null;
  company: string | null;
  occupation: string | null;
  /** Only this event's questions; yes/no answers stored as "Yes"/"No"; required questions checked. */
  answers: { questionId: string; answerText: string }[];
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

/** Accepts "+91 98765 43210", "+91-9876543210", "9876543210" (India) or "+447700900123"; returns "+91 9876543210". */
export function cleanPhone(raw: unknown): string | null {
  const s = text(raw, 40);
  if (!s) return null;
  const split = /^\+(\d{1,4})[\s-]+([\d\s-]+)$/.exec(s);
  if (split) {
    const cc = `+${split[1]}`;
    const digits = split[2].replace(/\D/g, '');
    if (phoneProblem(cc, digits)) throw new RegistrationInputError(phoneProblem(cc, digits), 'phone');
    return `${cc} ${digits}`;
  }
  const digits = s.replace(/\D/g, '');
  if (!s.startsWith('+') && digits.length === 10) return `+91 ${digits}`;
  if (s.startsWith('+') && digits.length >= 8 && digits.length <= 16) return `+${digits}`;
  throw new RegistrationInputError('Enter a valid phone number, like +91 98765 43210.', 'phone');
}

export async function cleanRegistrationInput(
  input: RawRegistrationInput,
  opts: { enforceRequired?: boolean } = {},
): Promise<CleanRegistrationInput> {
  // Walk-ins are added by the host at the door, where the online questions aren't asked.
  const enforce = opts.enforceRequired !== false;
  const email = text(input.email, 254).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw new RegistrationInputError('Enter a valid email address.', 'email');

  const phone = cleanPhone(input.phone);
  const company = text(input.company, 100) || null;
  // The list in the form, or a short free answer from older clients.
  const occ = text(input.occupation, 100);
  const occupation = occ ? ((OCCUPATIONS as readonly string[]).find((o) => o.toLowerCase() === occ.toLowerCase()) ?? occ) : null;

  const questions = await prisma.eventCustomQuestion.findMany({
    where: { eventId: input.eventId, hiddenAt: null },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, questionText: true, questionType: true, required: true, options: true },
  });
  const given = new Map<string, string>();
  for (const a of Array.isArray(input.answers) ? input.answers.slice(0, 50) : []) {
    if (a && typeof a.questionId === 'string' && typeof a.answerText === 'string') given.set(a.questionId, a.answerText);
  }

  const answers: CleanRegistrationInput['answers'] = [];
  for (const q of questions) {
    const raw = given.get(q.id) ?? '';
    const field = `q_${q.id}`;
    if (q.questionType === 'CHECKBOX') {
      const yes = /^(yes|true|on|1)$/i.test(raw.trim());
      if (enforce && q.required && !yes) throw new RegistrationInputError(`Please confirm: ${q.questionText}`, field);
      answers.push({ questionId: q.id, answerText: yes ? CHECKBOX_YES : CHECKBOX_NO });
      continue;
    }
    const value = raw.trim().slice(0, 2000);
    if (!value) {
      if (enforce && q.required) throw new RegistrationInputError(`Please answer: ${q.questionText}`, field);
      continue;
    }
    if (q.questionType === 'SELECT') {
      const options = Array.isArray(q.options) ? (q.options as unknown[]).filter((o): o is string => typeof o === 'string') : [];
      const match = options.find((o) => o === value) ?? options.find((o) => o.toLowerCase() === value.toLowerCase());
      if (!match) throw new RegistrationInputError(`Choose one of the options for: ${q.questionText}`, field);
      answers.push({ questionId: q.id, answerText: match });
      continue;
    }
    answers.push({ questionId: q.id, answerText: value });
  }

  return { email, phone, company, occupation, answers };
}
