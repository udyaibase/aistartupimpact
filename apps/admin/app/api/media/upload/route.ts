import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ALLOWED_ROLES, uploadToMediaLibrary } from "@/lib/media";
import { publicError } from '@/lib/public-error';

export async function POST(request: NextRequest) {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.user || !ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const result = await uploadToMediaLibrary(file, {
      prefix: "uploads",
      uploadedById: session.user.id,
    });

    return NextResponse.json({ success: true, url: result.url, mediaId: result.id });
  } catch (error: any) {
    console.error("API media upload error:", error);
    const status = error.message?.includes("not allowed") || error.message?.includes("too large") ? 400 : 500;
    return NextResponse.json({ error: publicError(error) || "Upload failed" }, { status });
  }
}
