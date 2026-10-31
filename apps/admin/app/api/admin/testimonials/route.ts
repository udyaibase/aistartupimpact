import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { requireApiAuth } from '@/lib/api-auth';
import { logAuditEvent } from '@/lib/audit-log';
import { withPublicRefresh } from '@/lib/refresh-public';

const sql = neon(process.env.DATABASE_URL!);

// GET - Fetch all testimonials
export async function GET() {
  const { error } = await requireApiAuth();
  if (error) return error;
  try {
    const testimonials = await sql`
      SELECT id, name, role, company, avatar, quote, subscribed_duration, is_active, display_order, created_at
      FROM newsletter_testimonials
      ORDER BY display_order ASC, created_at DESC
    `;

    return NextResponse.json({ success: true, testimonials });
  } catch (error) {
    console.error('Error fetching testimonials:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch testimonials' },
      { status: 500 }
    );
  }
}

// POST - Create new testimonial
async function postHandler(request: NextRequest) {
  const { error } = await requireApiAuth();
  if (error) return error;
  try {
    const body = await request.json();
    const { name, role, company, avatar, quote, subscribed_duration, is_active, display_order } = body;

    if (!name || !role || !avatar || !quote) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const result = await sql`
      INSERT INTO newsletter_testimonials (name, role, company, avatar, quote, subscribed_duration, is_active, display_order)
      VALUES (${name}, ${role}, ${company || null}, ${avatar}, ${quote}, ${subscribed_duration || null}, ${is_active !== false}, ${display_order || 0})
      RETURNING *
    `;

    logAuditEvent({ action: 'CREATE', resourceType: 'TESTIMONIAL', resourceId: result[0]?.id, resourceName: name });

    return NextResponse.json({ success: true, testimonial: result[0] });
  } catch (error) {
    console.error('Error creating testimonial:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create testimonial' },
      { status: 500 }
    );
  }
}

// PUT - Update testimonial
async function putHandler(request: NextRequest) {
  const { error } = await requireApiAuth();
  if (error) return error;
  try {
    const body = await request.json();
    const { id, name, role, company, avatar, quote, subscribed_duration, is_active, display_order } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Testimonial ID is required' },
        { status: 400 }
      );
    }

    const result = await sql`
      UPDATE newsletter_testimonials
      SET 
        name = ${name},
        role = ${role},
        company = ${company || null},
        avatar = ${avatar},
        quote = ${quote},
        subscribed_duration = ${subscribed_duration || null},
        is_active = ${is_active !== false},
        display_order = ${display_order || 0},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Testimonial not found' },
        { status: 404 }
      );
    }

    logAuditEvent({ action: 'UPDATE', resourceType: 'TESTIMONIAL', resourceId: id, resourceName: name });

    return NextResponse.json({ success: true, testimonial: result[0] });
  } catch (error) {
    console.error('Error updating testimonial:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update testimonial' },
      { status: 500 }
    );
  }
}

// DELETE - Delete testimonial
async function deleteHandler(request: NextRequest) {
  const { error } = await requireApiAuth(['SUPER_ADMIN']);
  if (error) return error;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Testimonial ID is required' },
        { status: 400 }
      );
    }

    await sql`
      DELETE FROM newsletter_testimonials
      WHERE id = ${id}
    `;

    logAuditEvent({ action: 'DELETE', resourceType: 'TESTIMONIAL', resourceId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting testimonial:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete testimonial' },
      { status: 500 }
    );
  }
}

export const POST = withPublicRefresh(['home'], postHandler);
export const PUT = withPublicRefresh(['home'], putHandler);
export const DELETE = withPublicRefresh(['home'], deleteHandler);
