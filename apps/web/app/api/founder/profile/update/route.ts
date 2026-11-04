import { NextRequest, NextResponse } from 'next/server';
import { apiRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { isPublicWebUrl } from '@/lib/founder/listing-validation';
import { sql } from '@/lib/db';
import { getFounderSession } from '@/lib/founder-auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
const updateProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  company: z.string().max(100).optional(),
  role: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  bio: z.string().max(1000).optional(),
  avatar: z.string().url().optional().or(z.literal('')),
  linkedin: z.string().refine(isPublicWebUrl, 'Links must be full web addresses, like https://example.com').optional().or(z.literal('')),
  twitter: z.string().refine(isPublicWebUrl, 'Links must be full web addresses, like https://example.com').optional().or(z.literal('')),
  website: z.string().refine(isPublicWebUrl, 'Links must be full web addresses, like https://example.com').optional().or(z.literal('')),
});

export async function POST(request: NextRequest) {
  const { success: withinLimit } = await checkRateLimit(apiRateLimit, getClientIdentifier(request));
  if (!withinLimit) return NextResponse.json({ success: false, error: 'Too many requests. Please try again later.' }, { status: 429 });

  try {
    // Check authentication
    const session = await getFounderSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validated = updateProfileSchema.parse(body);

    // Update profile with raw SQL
    await sql`
      UPDATE "FounderUser"
      SET 
        name = ${validated.name},
        company = ${validated.company || null},
        role = ${validated.role || null},
        phone = ${validated.phone || null},
        bio = ${validated.bio || null},
        avatar = ${validated.avatar || null},
        linkedin = ${validated.linkedin || null},
        twitter = ${validated.twitter || null},
        website = ${validated.website || null},
        "updatedAt" = NOW()
      WHERE id = ${session.userId}
    `;

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully'
    });

  } catch (error: any) {
    console.error('Profile update error:', error);

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: error.errors[0]?.message || 'Invalid input data' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update profile. Please try again.' },
      { status: 500 }
    );
  }
}
