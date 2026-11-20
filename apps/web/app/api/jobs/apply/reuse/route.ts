import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@udyaibase/database';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { resumeUploadRateLimit } from '@/lib/event-rate-limit';
import { applyableListingWhere } from '@/lib/jobs/public';
import { hashIp, signApplySession } from '@/lib/jobs/apply-session';
import { putResume, readResume, resumeStorageReady } from '@/lib/jobs/resume-storage';
import { sniffResume } from '@/lib/jobs/resume-text';
import { getCandidate, lastResume, lastResumeLabel } from '@/lib/jobs/candidate-account';

export const dynamic = 'force-dynamic';

/**
 * Step 1 of applying, for a signed-in job seeker: use the resume from their last application instead of uploading.
 * Same bot check and result as /api/jobs/apply/session. The file is copied, so this application gets its own copy
 * (deleting either application never removes the other's resume).
 * JSON: { slug, turnstileToken }
 */
export async function POST(request: NextRequest) {
  const ip = getClientIdentifier(request);
  const { success } = await checkRateLimit(resumeUploadRateLimit, ip);
  if (!success) return NextResponse.json({ error: 'Too many uploads. Try again in a while.' }, { status: 429 });
  if (!resumeStorageReady()) return NextResponse.json({ error: 'Resume upload is temporarily unavailable. Please try again later.' }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  if (!(await verifyTurnstileToken(String(body.turnstileToken ?? '')))) {
    return NextResponse.json({ error: 'Please complete the security check and try again.', code: 'captcha' }, { status: 400 });
  }
  const me = await getCandidate().catch(() => null);
  if (!me) return NextResponse.json({ error: 'Sign in to use your last resume.' }, { status: 401 });

  const listing = await prisma.jobBoardListing.findFirst({
    where: { ...applyableListingWhere(), slug: String(body.slug ?? ''), applicationType: 'INTERNAL' },
    select: { id: true },
  });
  if (!listing) return NextResponse.json({ error: 'This job is no longer accepting applications.' }, { status: 404 });

  const last = await lastResume(me.id);
  const bytes = last ? await readResume(last.key).catch(() => null) : null;
  const kind = bytes ? sniffResume(bytes) : null;
  if (!last || !bytes || !kind) return NextResponse.json({ error: 'Your last resume isn’t available any more. Upload it again.', code: 'gone' }, { status: 410 });

  const key = `resumes/${listing.id}/${crypto.randomUUID()}.${kind.ext}`;
  await putResume(key, bytes, kind.mime);
  const upload = await prisma.jobBoardResumeUpload.create({
    data: {
      key, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.length, mime: kind.mime,
      listingId: listing.id, ipHash: hashIp(ip),
    },
    select: { id: true },
  });

  return NextResponse.json({
    success: true,
    token: signApplySession(upload.id, listing.id),
    file: { name: lastResumeLabel(last), sizeBytes: bytes.length, type: kind.ext },
  });
}
