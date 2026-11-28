import { NextRequest, NextResponse } from 'next/server';
import { looksLikeImage } from '@/lib/media/image-signature';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getFounderSession } from '@/lib/founder-auth';
import { getUserSession } from '@/lib/user-session';
import { getEmployerSession } from '@/lib/employer-auth';
import { getOrganizerSession } from '@/lib/organizer-auth';
import { apiRateLimit, mediaUploadRateLimit, getClientIdentifier, checkRateLimit, rateLimitMessage, retryAfterHeaders } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const isR2Configured = () => {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL
  );
};

const getS3Client = () => {
  if (!isR2Configured()) {
    return null;
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
};

export async function POST(request: NextRequest) {
  try {
    // Founders, employers and hosts upload logos, covers and story pictures; the main-site sign-in is accepted too
    // (onboarding can run on it). Each account has its own hourly limit on top of the per-IP one.
    const [founderSession, userSession, employerSession, organizerSession] = await Promise.all([
      getFounderSession(),
      getUserSession(),
      getEmployerSession().catch(() => null),
      getOrganizerSession().catch(() => null),
    ]);
    const account = founderSession ? `founder:${founderSession.userId}`
      : employerSession ? `employer:${employerSession.id}`
      : organizerSession ? `organizer:${organizerSession.id}`
      : userSession ? `user:${userSession.id}`
      : null;
    if (!account) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const perAccount = await checkRateLimit(mediaUploadRateLimit, account);
    if (!perAccount.success) {
      return NextResponse.json({ error: rateLimitMessage(perAccount.reset).replace('Too many attempts', 'Too many uploads') }, { status: 429, headers: retryAfterHeaders(perAccount.reset) });
    }

    // Rate limit uploads
    if (apiRateLimit) {
      const identifier = getClientIdentifier(request);
      const { success } = await checkRateLimit(apiRateLimit, identifier);
      if (!success) {
        return NextResponse.json({ error: 'Too many uploads. Please try again later.' }, { status: 429 });
      }
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const ALLOWED_MIME: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };

    if (!ALLOWED_MIME[file.type]) {
      return NextResponse.json({ error: 'Only JPEG, PNG, WebP, and GIF images are allowed' }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 5MB' }, { status: 400 });
    }

    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const extension = ALLOWED_MIME[file.type];
    // A folder per use, from a fixed list (anything else goes to logos/, as before).
    const FOLDERS = ['logos', 'covers', 'stories', 'screenshots', 'avatars'] as const;
    const asked = String(formData.get('folder') ?? '');
    const folder = (FOLDERS as readonly string[]).includes(asked) ? asked : 'logos';
    const filename = `${folder}/${timestamp}-${randomString}.${extension}`;

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    // The declared type is only a label: check the file's first bytes really are that kind of image.
    if (!looksLikeImage(buffer, file.type)) {
      return NextResponse.json({ error: 'That file isn’t a valid image. Upload a JPEG, PNG, WebP or GIF.' }, { status: 400 });
    }

    if (isR2Configured()) {
      try {
        const s3Client = getS3Client();
        if (s3Client) {
          const command = new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: filename,
            Body: buffer,
            ContentType: file.type,
          });

          await s3Client.send(command);
          const publicUrl = `${process.env.R2_PUBLIC_URL}/${filename}`;
          return NextResponse.json({ url: publicUrl, success: true });
        }
      } catch (r2Error) {
        console.error('[Upload] R2 upload failed:', r2Error instanceof Error ? r2Error.message : 'Unknown error');
      }
    }

    const { writeFile, mkdir } = await import('fs/promises');
    const { join } = await import('path');

    const uploadsDir = join(process.cwd(), 'public', 'uploads');
    // recursive: no error when it already exists, so there's no separate exists check to race against.
    await mkdir(uploadsDir, { recursive: true });

    const localFilename = `${timestamp}-${randomString}.${extension}`;
    const filepath = join(uploadsDir, localFilename);
    await writeFile(filepath, buffer);

    const url = `/uploads/${localFilename}`;
    return NextResponse.json({ url, success: true });

  } catch (error) {
    console.error('[Upload] Error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
