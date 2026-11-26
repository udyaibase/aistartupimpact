import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { requireApiAuth } from '@/lib/api-auth';
import { sectionRoles } from '@/lib/section-access';

const sql = neon(process.env.DATABASE_URL!);

function getDateThreshold(dateRange: string): Date | null {
  const now = new Date();
  if (dateRange === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (dateRange === 'week') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (dateRange === 'month') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return null;
}

export async function GET(request: NextRequest) {
  const { error } = await requireApiAuth(sectionRoles('/consent-logs'));
  if (error) return error;

  try {
    const searchParams = request.nextUrl.searchParams;
    const filter = searchParams.get('filter') || 'all';
    const dateRange = searchParams.get('dateRange') || 'all';
    const dateThreshold = getDateThreshold(dateRange);

    let logs;
    if (dateThreshold) {
      if (filter === 'accepted') {
        logs = await sql`SELECT id, consent_id, timestamp, categories, method, policy_version, schema_version, ip_hash, user_agent, country, created_at FROM consent_logs WHERE timestamp >= ${dateThreshold.toISOString()} AND categories->>'analytics' = 'true' AND categories->>'marketing' = 'true' ORDER BY created_at DESC LIMIT 500`;
      } else if (filter === 'rejected') {
        logs = await sql`SELECT id, consent_id, timestamp, categories, method, policy_version, schema_version, ip_hash, user_agent, country, created_at FROM consent_logs WHERE timestamp >= ${dateThreshold.toISOString()} AND categories->>'analytics' = 'false' AND categories->>'marketing' = 'false' ORDER BY created_at DESC LIMIT 500`;
      } else if (filter === 'customized') {
        logs = await sql`SELECT id, consent_id, timestamp, categories, method, policy_version, schema_version, ip_hash, user_agent, country, created_at FROM consent_logs WHERE timestamp >= ${dateThreshold.toISOString()} AND NOT ((categories->>'analytics' = 'true' AND categories->>'marketing' = 'true') OR (categories->>'analytics' = 'false' AND categories->>'marketing' = 'false')) ORDER BY created_at DESC LIMIT 500`;
      } else {
        logs = await sql`SELECT id, consent_id, timestamp, categories, method, policy_version, schema_version, ip_hash, user_agent, country, created_at FROM consent_logs WHERE timestamp >= ${dateThreshold.toISOString()} ORDER BY created_at DESC LIMIT 500`;
      }
    } else {
      if (filter === 'accepted') {
        logs = await sql`SELECT id, consent_id, timestamp, categories, method, policy_version, schema_version, ip_hash, user_agent, country, created_at FROM consent_logs WHERE categories->>'analytics' = 'true' AND categories->>'marketing' = 'true' ORDER BY created_at DESC LIMIT 500`;
      } else if (filter === 'rejected') {
        logs = await sql`SELECT id, consent_id, timestamp, categories, method, policy_version, schema_version, ip_hash, user_agent, country, created_at FROM consent_logs WHERE categories->>'analytics' = 'false' AND categories->>'marketing' = 'false' ORDER BY created_at DESC LIMIT 500`;
      } else if (filter === 'customized') {
        logs = await sql`SELECT id, consent_id, timestamp, categories, method, policy_version, schema_version, ip_hash, user_agent, country, created_at FROM consent_logs WHERE NOT ((categories->>'analytics' = 'true' AND categories->>'marketing' = 'true') OR (categories->>'analytics' = 'false' AND categories->>'marketing' = 'false')) ORDER BY created_at DESC LIMIT 500`;
      } else {
        logs = await sql`SELECT id, consent_id, timestamp, categories, method, policy_version, schema_version, ip_hash, user_agent, country, created_at FROM consent_logs ORDER BY created_at DESC LIMIT 500`;
      }
    }

    let statsQuery;
    if (dateThreshold) {
      statsQuery = await sql`
        SELECT COUNT(*) as total,
          SUM(CASE WHEN categories->>'analytics' = 'true' AND categories->>'marketing' = 'true' THEN 1 ELSE 0 END) as accepted_all,
          SUM(CASE WHEN categories->>'analytics' = 'false' AND categories->>'marketing' = 'false' THEN 1 ELSE 0 END) as rejected_all,
          SUM(CASE WHEN categories->>'analytics' = 'true' THEN 1 ELSE 0 END) as analytics_accepted,
          SUM(CASE WHEN categories->>'marketing' = 'true' THEN 1 ELSE 0 END) as marketing_accepted,
          SUM(CASE WHEN method = 'banner' THEN 1 ELSE 0 END) as method_banner,
          SUM(CASE WHEN method = 'preferences' THEN 1 ELSE 0 END) as method_preferences,
          SUM(CASE WHEN method = 'link' THEN 1 ELSE 0 END) as method_link
        FROM consent_logs WHERE timestamp >= ${dateThreshold.toISOString()}
      `;
    } else {
      statsQuery = await sql`
        SELECT COUNT(*) as total,
          SUM(CASE WHEN categories->>'analytics' = 'true' AND categories->>'marketing' = 'true' THEN 1 ELSE 0 END) as accepted_all,
          SUM(CASE WHEN categories->>'analytics' = 'false' AND categories->>'marketing' = 'false' THEN 1 ELSE 0 END) as rejected_all,
          SUM(CASE WHEN categories->>'analytics' = 'true' THEN 1 ELSE 0 END) as analytics_accepted,
          SUM(CASE WHEN categories->>'marketing' = 'true' THEN 1 ELSE 0 END) as marketing_accepted,
          SUM(CASE WHEN method = 'banner' THEN 1 ELSE 0 END) as method_banner,
          SUM(CASE WHEN method = 'preferences' THEN 1 ELSE 0 END) as method_preferences,
          SUM(CASE WHEN method = 'link' THEN 1 ELSE 0 END) as method_link
        FROM consent_logs
      `;
    }

    const statsRow = statsQuery[0];
    const total = parseInt(statsRow.total as string);
    const acceptedAll = parseInt(statsRow.accepted_all as string);
    const rejectedAll = parseInt(statsRow.rejected_all as string);

    return NextResponse.json({
      logs,
      stats: {
        total,
        acceptedAll,
        rejectedAll,
        customized: total - acceptedAll - rejectedAll,
        analyticsAccepted: parseInt(statsRow.analytics_accepted as string),
        marketingAccepted: parseInt(statsRow.marketing_accepted as string),
        byMethod: {
          banner: parseInt(statsRow.method_banner as string),
          preferences: parseInt(statsRow.method_preferences as string),
          link: parseInt(statsRow.method_link as string),
        },
      },
    });
  } catch (error) {
    console.error('Failed to fetch consent logs:', error);
    return NextResponse.json({ error: 'Failed to fetch consent logs' }, { status: 500 });
  }
}
