import { signEventUnsubscribeToken, verifyEventUnsubscribeToken } from "@udyaibase/utils/event-campaigns";

/**
 * One-click unsubscribe tokens for event emails. The signing rules live in
 * packages/utils/event-campaigns.ts so the web and admin apps always issue the same format.
 */

export async function generateUnsubscribeToken(subscriberId: string, email: string): Promise<string> {
  return signEventUnsubscribeToken(subscriberId, email);
}

export async function verifyUnsubscribeToken(token: string): Promise<{ subscriberId: string; email: string } | null> {
  return verifyEventUnsubscribeToken(token);
}
