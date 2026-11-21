import { NextRequest, NextResponse } from 'next/server';
import { looksLikeImage } from '@/lib/media/image-signature';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getFounderSession } from '@/lib/founder-auth';
import { apiRateLimit, getClientIdentifier, checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getFounderSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
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
    const type = formData.get('type') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    const ALLOWED_MIME: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };

    if (!ALLOWED_MIME[file.type]) {
      return NextResponse.json(
        { error: 'Only JPEG, PNG, WebP, and GIF images are allowed' },
        { status: 400 }
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size must be less than 5MB' },
        { status: 400 }
      );
    }

    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const extension = ALLOWED_MIME[file.type];
    const folder = typeof type === 'string' && /^[a-z][a-z0-9-]{0,40}$/.test(type) ? type : 'upload'; // a plain folder name only
    const filename = `${folder}/${session.userId}/${timestamp}-${randomString}.${extension}`;

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    // The declared type is only a label: check the file's first bytes really are that kind of image.
    if (!looksLikeImage(buffer, file.type)) {
      return NextResponse.json({ error: 'That file isn’t a valid image. Upload a JPEG, PNG, WebP or GIF.' }, { status: 400 });
    }

    // Upload to R2
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: filename,
      Body: buffer,
      ContentType: file.type,
    });

    await s3Client.send(command);

    // Return public URL
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${filename}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      filename: filename,
    });

  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
