import { NextRequest, NextResponse } from 'next/server';
import { trackCronRoute } from '@/lib/ops/cron';
import { runSkillSuggestions } from '@/lib/jobs/skill-suggestions';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Weekly, Mondays 10:00 IST (04:30 UTC): AI suggestions for the most-seen unknown skills, for admin review. */
export async function GET(request: NextRequest) {
  return trackCronRoute('skill-suggestions', async () => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: true, results: await runSkillSuggestions() });
  });
}
