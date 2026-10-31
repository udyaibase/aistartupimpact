import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@udyaibase/database';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { resumeUploadRateLimit } from '@/lib/event-rate-limit';
import { publicListingWhere } from '@/lib/jobs/public';
import { hashIp, signApplySession } from '@/lib/jobs/apply-session';
import { putResume, resumeStorageReady } from '@/lib/jobs/resume-storage';
import { MAX_RESUME_BYTES, sniffResume } from '@/lib/jobs/resume-text';

export const dynamic = 'force-dynamic';

/**
 * Step 1 of applying: bot check (once), then the resume goes to private storage.
 * Returns a signed 30-minute apply session used by autofill and submit.
 * multipart/form-data: slug, turnstileToken, file
 */
export async function POST(request: NextRequest) {
  const ip = getClientIdentifier(request);
  const { success } = await checkRateLimit(resumeUploadRateLimit, ip);
  if (!success) return NextResponse.json({ error: 'Too many uploads. Try again in a while.' }, { status: 429 });

  if (!resumeStorageReady()) {
    return NextResponse.json({ error: 'Resume upload is temporarily unavailable. Please try again later.' }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Upload a PDF or Word resume.' }, { status: 400 });
  }
  const slug = String(form.get('slug') ?? '');
  const turnstileToken = String(form.get('turnstileToken') ?? '');
  const file = form.get('file');

  if (!(await verifyTurnstileToken(turnstileToken))) {
    return NextResponse.json({ error: 'Please complete the security check and try again.', code: 'captcha' }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Choose your resume to upload.' }, { status: 400 });
  if (file.size > MAX_RESUME_BYTES) return NextResponse.json({ error: 'Resume must be 5 MB or smaller.' }, { status: 413 });

  const listing = await prisma.jobBoardListing.findFirst({
    where: { ...publicListingWhere(), slug, applicationType: 'INTERNAL' },
    select: { id: true },
  });
  if (!listing) return NextResponse.json({ error: 'This job is no longer accepting applications.' }, { status: 404 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffResume(bytes);
  if (!kind) return NextResponse.json({ error: 'Upload your resume as a PDF or Word (.docx) file.' }, { status: 415 });

  const key = `resumes/${listing.id}/${crypto.randomUUID()}.${kind.ext}`;
  await putResume(key, bytes, kind.mime);
  const upload = await prisma.jobBoardResumeUpload.create({
    data: {
      key,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      sizeBytes: bytes.length,
      mime: kind.mime,
      listingId: listing.id,
      ipHash: hashIp(ip),
    },
    select: { id: true },
  });

  return NextResponse.json({
    success: true,
    token: signApplySession(upload.id, listing.id),
    file: { name: file.name.slice(0, 120), sizeBytes: bytes.length, type: kind.ext },
  });
}
