import crypto from "crypto";
import { jwtSecret } from "@/lib/jwt-secret";

/**
 * Proof that a meeting id came from this workspace's own "Create meeting" call. An event only takes a Zoom/Google
 * meeting id with this proof (or the id it already had), so nobody can attach another meeting to an event and have
 * later time changes edit that meeting on the workspace's connected account.
 */
const KEY = () => Buffer.from(jwtSecret(process.env.ORGANIZER_JWT_SECRET || process.env.USER_JWT_SECRET, "ORGANIZER_JWT_SECRET"));

export function meetingProof(organizerId: string, provider: string, externalId: string): string {
  return crypto.createHmac("sha256", KEY()).update(`meeting:${organizerId}:${provider}:${externalId}`).digest("base64url");
}

export function meetingProofValid(organizerId: string, provider: unknown, externalId: unknown, proof: unknown): boolean {
  if (typeof provider !== "string" || typeof externalId !== "string" || typeof proof !== "string" || !proof) return false;
  const want = Buffer.from(meetingProof(organizerId, provider, externalId));
  const got = Buffer.from(proof);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
