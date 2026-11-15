import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { resumeUploadRateLimit } from '@/lib/event-rate-limit';
import { putResume, resumeStorageReady } from '@/lib/jobs/resume-storage';
import { sniffResume } from '@/lib/jobs/resume-text';

export const dynamic = 'force-dynamic';

const MAX_SIZE = 500 * 1024; // 500KB strict limit

/**
 * Resume for an application to a role at Udyaibase. A resume is personal data, so it goes to the private
 * resumes bucket (never the public media bucket) and the response carries a reference ("private:careers/<id>.pdf"),
 * not a public link. Staff open it through the admin app, signed in.
 */
export async function POST(req: NextRequest) {
  try {
    const { success: allowed } = await checkRateLimit(resumeUploadRateLimit, `careers:${getClientIdentifier(req)}`);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many uploads. Please try again later.' }, { status: 429 });
    }
    if (!resumeStorageReady()) {
      return NextResponse.json({ error: 'Resume upload isn’t available right now. Paste a link to your resume instead.' }, { status: 503 });
    }

    const formData = await req.formData();
    const file = formData.get('resume');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({
        error: `File size must be less than 500KB (current: ${Math.round(file.size / 1024)}KB). Please compress your resume.`,
      }, { status: 400 });
    }

    // The real type, from the file's own bytes: the browser's "application/pdf" proves nothing.
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (sniffResume(bytes)?.ext !== 'pdf') {
      return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 });
    }

    const key = `careers/${crypto.randomUUID()}.pdf`;
    await putResume(key, bytes, 'application/pdf');

    return NextResponse.json({
      success: true,
      url: `private:${key}`,
      filename: file.name.replace(/[^\w.\- ]/g, '_').slice(0, 120),
      sizeBytes: file.size,
    });
  } catch (error) {
    console.error('Resume upload error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to upload resume. Please try again.' }, { status: 500 });
  }
}
