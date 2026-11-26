import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { requireApiAuth } from '@/lib/api-auth';
import { sectionRoles } from '@/lib/section-access';
import { logAuditEvent } from '@/lib/audit-log';

const sql = neon(process.env.DATABASE_URL!);

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error } = await requireApiAuth(sectionRoles('/web-users')); // same roles as the screen that calls it
  if (error) return error;

  try {
    const { isActive } = await request.json();

    const result = await sql`
      UPDATE "WebUser"
      SET "isActive" = ${isActive}
      WHERE id = ${params.id}
      RETURNING id, email, name, "isActive"
    `;

    if (result.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    logAuditEvent({ action: 'UPDATE', resourceType: 'WEB_USER', resourceId: params.id, after: { isActive } });

    return NextResponse.json({ user: result[0] });
  } catch (error) {
    console.error('Error updating web user:', error);
    return NextResponse.json(
      { error: 'Failed to update web user' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error } = await requireApiAuth(['SUPER_ADMIN']);
  if (error) return error;

  try {
    await sql`DELETE FROM "WebUserSession" WHERE "webUserId" = ${params.id}`;
    await sql`DELETE FROM "WebUser" WHERE id = ${params.id}`;

    logAuditEvent({ action: 'DELETE', resourceType: 'WEB_USER', resourceId: params.id });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting web user:', error);
    return NextResponse.json(
      { error: 'Failed to delete web user' },
      { status: 500 }
    );
  }
}
