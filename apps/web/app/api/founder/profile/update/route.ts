import { NextRequest, NextResponse } from 'next/server';
import { apiRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { isPublicWebUrl } from '@/lib/founder/listing-validation';
import { sql } from '@/lib/db';
import { founderApi } from '@/lib/founder/api-session';
import { z } from 'zod';
import { logFounderActivity } from '@/lib/founder/activity';

export const dynamic = 'force-dynamic';
const LINK_HELP = 'Links must be full web addresses, like https://example.com';
const link = z.string().trim().max(500).refine(isPublicWebUrl, LINK_HELP).optional().or(z.literal(''));
/** No angle brackets: these fields are shown on public pages and in emails. */
const plain = (label: string, max: number) => z.string().trim().max(max, `${label} must be ${max} characters or fewer`).refine((v) => !/[<>]/.test(v), `${label} can’t contain < or >`);

const updateProfileSchema = z.object({
  name: plain('Name', 100).refine((v) => v.length >= 2, 'Name must be at least 2 characters'),
  company: plain('Company', 100).optional(),
  role: plain('Role', 100).optional(),
  // Digits with the usual separators, or empty.
  phone: z.string().trim().refine((v) => v === '' || (/^\+?[0-9 ()-]{7,20}$/.test(v) && (v.match(/[0-9]/g)?.length ?? 0) >= 7), 'Enter a valid phone number, like +91 98765 43210').optional(),
  bio: z.string().trim().max(1000, 'Bio must be 1,000 characters or fewer').optional(),
  avatar: z.string().trim().max(1000).optional(),
  linkedin: link,
  twitter: link,
  website: link,
});

/**
 * A profile photo is one we host (uploaded here) or the one from the person's Google account. An address typed in by
 * hand could point anywhere, and it would be loaded by everyone who views the profile.
 */
function allowedAvatar(value: string): boolean {
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  const ours = ['media.udyaibase.com'];
  try { if (process.env.R2_PUBLIC_URL) ours.push(new URL(process.env.R2_PUBLIC_URL).hostname.toLowerCase()); } catch { /* not set */ }
  return ours.includes(host) || host === 'googleusercontent.com' || host.endsWith('.googleusercontent.com');
}

export async function POST(request: NextRequest) {
  const { success: withinLimit } = await checkRateLimit(apiRateLimit, getClientIdentifier(request));
  if (!withinLimit) return NextResponse.json({ success: false, error: 'Too many requests. Please try again later.' }, { status: 429 });

  try {
    // Check authentication
    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;

    const body = await request.json();
    const validated = updateProfileSchema.parse(body);

    // The photo already on the profile may stay; a new one must be an upload (or the Google photo).
    if (validated.avatar) {
      const [current] = await sql`SELECT avatar FROM "FounderUser" WHERE id = ${session.userId} LIMIT 1`;
      if (validated.avatar !== current?.avatar && !allowedAvatar(validated.avatar)) {
        return NextResponse.json({ error: 'Upload your photo here instead of pasting a link.' }, { status: 400 });
      }
    }

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

    await logFounderActivity(session.userId, 'profile_updated', { request });

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
