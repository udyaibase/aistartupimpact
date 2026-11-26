import { verifyUserToken } from '@/lib/user-session';
import { jwtSecret } from '@/lib/jwt-secret';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
const JWT_SECRET = jwtSecret(process.env.USER_JWT_SECRET, 'USER_JWT_SECRET');

export async function PUT(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('user-token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ids = await verifyUserToken(token);
    if (!ids) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { userId, email } = ids;

    const { name, bio, twitter, linkedin, instagram, facebook, github, avatar } = await request.json();

    if (name && name.length < 2) {
      return NextResponse.json({ error: 'Name must be at least 2 characters' }, { status: 400 });
    }
    if (bio && bio.length > 500) {
      return NextResponse.json({ error: 'Bio must be less than 500 characters' }, { status: 400 });
    }

    // Update WebUser
    await sql`
      UPDATE "WebUser"
      SET 
        name = COALESCE(${name || null}, name),
        bio = ${bio !== undefined ? bio : null},
        twitter = ${twitter !== undefined ? twitter : null},
        linkedin = ${linkedin !== undefined ? linkedin : null},
        instagram = ${instagram !== undefined ? instagram : null},
        facebook = ${facebook !== undefined ? facebook : null},
        github = ${github !== undefined ? github : null},
        avatar = COALESCE(${avatar || null}, avatar)
      WHERE id = ${userId}
    `;

    // Sync name and avatar to linked workspace profiles (if they exist)
    if (email && (name || avatar)) {
      if (name) {
        await sql`UPDATE "FounderUser" SET name = ${name} WHERE email = ${email.toLowerCase()}`;
        await sql`UPDATE "EventOrganizer" SET name = ${name} WHERE email = ${email.toLowerCase()}`;
        await sql`UPDATE "UnifiedUser" SET name = ${name} WHERE email = ${email.toLowerCase()}`;
      }
      if (avatar) {
        await sql`UPDATE "FounderUser" SET avatar = ${avatar} WHERE email = ${email.toLowerCase()}`;
        await sql`UPDATE "EventOrganizer" SET avatar = ${avatar} WHERE email = ${email.toLowerCase()}`;
        await sql`UPDATE "UnifiedUser" SET avatar = ${avatar} WHERE email = ${email.toLowerCase()}`;
      }
    }

    // Fetch updated user
    const users = await sql`
      SELECT id, email, name, bio, twitter, linkedin, instagram, facebook, github, avatar, slug
      FROM "WebUser"
      WHERE id = ${userId}
      LIMIT 1
    `;

    if (users.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, user: users[0] });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
