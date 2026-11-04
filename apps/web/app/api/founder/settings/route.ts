import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireFounderAuth } from '@/lib/founder-auth';
import { logFounderActivity } from '@/lib/founder/activity';

export const dynamic = 'force-dynamic';
/**
 * GET /api/founder/settings
 * Get user settings
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireFounderAuth();

    // Get settings
    const settings = await sql`
      SELECT 
        email_notifications,
        submission_updates,
        analytics_reports,
        public_profile,
        show_email
      FROM founder_settings
      WHERE user_id = ${session.userId}
    `;

    // If no settings exist, create default settings
    if (settings.length === 0) {
      await sql`
        INSERT INTO founder_settings (user_id)
        VALUES (${session.userId})
      `;

      return NextResponse.json({
        success: true,
        settings: {
          emailNotifications: true,
          submissionUpdates: true,
          analyticsReports: false,
          publicProfile: true,
          showEmail: false,
        },
      });
    }

    // Return settings (convert snake_case to camelCase)
    return NextResponse.json({
      success: true,
      settings: {
        emailNotifications: settings[0].email_notifications,
        submissionUpdates: settings[0].submission_updates,
        analyticsReports: settings[0].analytics_reports,
        publicProfile: settings[0].public_profile,
        showEmail: settings[0].show_email,
      },
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/founder/settings
 * Update user settings
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await requireFounderAuth();
    const body = await request.json();

    // Convert camelCase to snake_case
    const updates: any = {};
    if (typeof body.publicProfile === 'boolean') updates.public_profile = body.publicProfile;
    if (typeof body.emailNotifications === 'boolean') updates.email_notifications = body.emailNotifications;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No settings to update' },
        { status: 400 }
      );
    }

    // Check if settings exist
    const existing = await sql`
      SELECT id FROM founder_settings WHERE user_id = ${session.userId}
    `;

    if (existing.length === 0) {
      // Create settings with updates
      await sql`
        INSERT INTO founder_settings (
          user_id,
          email_notifications,
          submission_updates,
          analytics_reports,
          public_profile,
          show_email
        ) VALUES (
          ${session.userId},
          ${updates.email_notifications ?? true},
          ${updates.submission_updates ?? true},
          ${updates.analytics_reports ?? false},
          ${updates.public_profile ?? true},
          ${updates.show_email ?? false}
        )
      `;
    } else {
      // Build dynamic update query
      const setClauses = Object.keys(updates).map(key => `${key} = $${key}`).join(', ');
      const values = { ...updates, userId: session.userId };
      
      // Update settings
      await sql`
        UPDATE founder_settings
        SET 
          email_notifications = ${updates.email_notifications ?? sql`email_notifications`},
          submission_updates = ${updates.submission_updates ?? sql`submission_updates`},
          analytics_reports = ${updates.analytics_reports ?? sql`analytics_reports`},
          public_profile = ${updates.public_profile ?? sql`public_profile`},
          show_email = ${updates.show_email ?? sql`show_email`},
          updated_at = NOW()
        WHERE user_id = ${session.userId}
      `;
    }

    if ('public_profile' in updates) await logFounderActivity(session.userId, 'public_profile_changed', { request, metadata: { visible: updates.public_profile } });
    if ('email_notifications' in updates) await logFounderActivity(session.userId, 'email_tips_changed', { request, metadata: { on: updates.email_notifications } });

    return NextResponse.json({
      success: true,
      message: 'Settings updated successfully',
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
