import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/organizer-auth/require-permission";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * POST /api/organizer/upload
 * Direct file upload for organizer event covers.
 * Uploads original to R2, Next.js Image component handles resizing at serve-time.
 */
export async function POST(request: NextRequest) {
  const result = await requirePermission("upload");
  if (result instanceof NextResponse) return result;
  const session = result;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ success: false, error: "Only JPEG, PNG, and WebP are allowed." }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: "File too large. Maximum 5MB." }, { status: 400 });
    }

    const bucketName = process.env.R2_BUCKET_NAME;
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKey = process.env.R2_ACCESS_KEY_ID;
    const secretKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!bucketName || !accountId || !accessKey || !secretKey) {
      return NextResponse.json({ success: false, error: "Storage not configured. Contact admin." }, { status: 500 });
    }

    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });

    const uniqueId = crypto.randomUUID();
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileKey = `events/${session.organizerId}/${uniqueId}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate magic bytes match claimed content type
    if (!validateMagicBytes(buffer, file.type)) {
      return NextResponse.json({ success: false, error: "File content does not match its type." }, { status: 400 });
    }

    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: fileKey,
        ContentType: file.type,
        Body: buffer,
        CacheControl: "public, max-age=31536000, immutable",
      })
    );

    if (!process.env.R2_PUBLIC_URL) throw new Error("R2_PUBLIC_URL is not configured");
    const publicUrl = `${process.env.R2_PUBLIC_URL.replace(/\/$/, "")}/${fileKey}`;

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (error: any) {
    console.error("Upload error:", error?.message || error);
    return NextResponse.json({ success: false, error: "Upload failed. Please try again." }, { status: 500 });
  }
}

function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 4) return false;

  switch (mimeType) {
    case "image/jpeg":
      return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    case "image/png":
      return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
    case "image/webp":
      return buffer.length >= 12 &&
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
    default:
      return false;
  }
}
