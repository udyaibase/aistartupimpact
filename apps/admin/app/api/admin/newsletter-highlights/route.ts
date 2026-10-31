import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { requireApiAuth } from '@/lib/api-auth';
import { withPublicRefresh } from '@/lib/refresh-public';

const sql = neon(process.env.DATABASE_URL!);

// GET - Fetch all highlights
export async function GET() {
  const { error } = await requireApiAuth();
  if (error) return error;
  try {
    const highlights = await sql`
      SELECT id, title, description, date, link, is_active, display_order, created_at
      FROM newsletter_highlights
      ORDER BY display_order ASC, created_at DESC
    `;

    return NextResponse.json({ success: true, highlights });
  } catch (error) {
    console.error('Error fetching highlights:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch highlights' },
      { status: 500 }
    );
  }
}

// POST - Create new highlight
async function postHandler(request: NextRequest) {
  const { error } = await requireApiAuth();
  if (error) return error;
  try {
    const body = await request.json();
    const { title, description, date, link, is_active, display_order } = body;

    if (!title || !description || !date) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const result = await sql`
      INSERT INTO newsletter_highlights (title, description, date, link, is_active, display_order)
      VALUES (${title}, ${description}, ${date}, ${link || null}, ${is_active !== false}, ${display_order || 0})
      RETURNING *
    `;

    return NextResponse.json({ success: true, highlight: result[0] });
  } catch (error) {
    console.error('Error creating highlight:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create highlight' },
      { status: 500 }
    );
  }
}

// PUT - Update highlight
async function putHandler(request: NextRequest) {
  const { error } = await requireApiAuth();
  if (error) return error;
  try {
    const body = await request.json();
    const { id, title, description, date, link, is_active, display_order } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Highlight ID is required' },
        { status: 400 }
      );
    }

    const result = await sql`
      UPDATE newsletter_highlights
      SET 
        title = ${title},
        description = ${description},
        date = ${date},
        link = ${link || null},
        is_active = ${is_active !== false},
        display_order = ${display_order || 0},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Highlight not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, highlight: result[0] });
  } catch (error) {
    console.error('Error updating highlight:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update highlight' },
      { status: 500 }
    );
  }
}

// DELETE - Delete highlight
async function deleteHandler(request: NextRequest) {
  const { error } = await requireApiAuth(['SUPER_ADMIN']);
  if (error) return error;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Highlight ID is required' },
        { status: 400 }
      );
    }

    await sql`
      DELETE FROM newsletter_highlights
      WHERE id = ${id}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting highlight:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete highlight' },
      { status: 500 }
    );
  }
}

export const POST = withPublicRefresh(['home'], postHandler);
export const PUT = withPublicRefresh(['home'], putHandler);
export const DELETE = withPublicRefresh(['home'], deleteHandler);
