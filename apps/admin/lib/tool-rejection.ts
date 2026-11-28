import { decideToolReview } from '@/lib/tool-review';

/**
 * Turn a tool down with a reason. Kept for the screens that already call it; the decision itself lives in
 * lib/tool-review, shared with the review queue. A tool that is already live is taken down instead.
 */
export async function rejectTool(id: string, reason: string, adminEmail?: string | null, role?: string | null): Promise<{ found: boolean; error?: string }> {
  let result = await decideToolReview(id, { action: 'reject', reasonCode: 'OTHER', note: reason }, { email: adminEmail, role });
  if (!result.success && /Take down/.test(result.error)) {
    result = await decideToolReview(id, { action: 'take_down', reasonCode: 'OTHER', note: reason }, { email: adminEmail, role });
  }
  if (!result.success) return { found: !/no longer exists/.test(result.error), error: result.error };
  return { found: true };
}
