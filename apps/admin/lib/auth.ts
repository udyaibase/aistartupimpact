import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { UserRole } from "@prisma/client";
import { prisma } from "@udyaibase/database";
import { randomUUID } from "crypto";
import { verifyTwoFactorProof } from "@/lib/two-factor";

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
/** How often an open session re-reads its 2FA state and the org-wide 2FA requirement. */
const TWO_FACTOR_REFRESH_MS = 5 * 60 * 1000;

async function isOrgWide2FARequired(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ value: string }>>(
      `SELECT value::text FROM "SiteSetting" WHERE key = $1 LIMIT 1`,
      "require2FA"
    );
    if (rows.length === 0) return false;
    try { return JSON.parse(rows[0].value) === true; } catch { return false; }
  } catch {
    return false;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.email) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { email: user.email },
            select: {
              id: true, role: true, slug: true, email: true,
              failedLoginAttempts: true, lockedUntil: true, isActive: true, twoFactorEnabled: true,
            },
          });

          if (!dbUser) {
            await recordFailedAttempt(user.email);
            return false;
          }

          if (!dbUser.isActive) return false;

          if (dbUser.lockedUntil && dbUser.lockedUntil > new Date()) {
            return `/login?error=locked&until=${dbUser.lockedUntil.toISOString()}`;
          }

          // With 2FA on, the counter tracks wrong codes — only a correct code clears it (or a sign-in would
          // hand out a fresh set of guesses).
          if (dbUser.failedLoginAttempts > 0 && !dbUser.twoFactorEnabled) {
            await prisma.user.update({
              where: { id: dbUser.id },
              data: { failedLoginAttempts: 0, lockedUntil: null },
            });
          }

          await prisma.user.update({
            where: { id: dbUser.id },
            data: { lastLoginAt: new Date() },
          });

          return true;
        } catch {
          return false;
        }
      }
      return false;
    },
    async jwt({ token, user, trigger, session }) {
      const emailToLookup = user?.email || token?.email;
      const now = Date.now();

      // One id per sign-in; the 2FA proof is bound to it. Sessions from before this existed get one now.
      if (user || !token.sid) token.sid = randomUUID();

      const due = !token.twoFactorCheckedAt || now - (token.twoFactorCheckedAt as number) > TWO_FACTOR_REFRESH_MS;
      if (emailToLookup && (user || trigger === "update" || due)) {
        const dbUser = await prisma.user.findUnique({
          where: { email: emailToLookup as string },
          select: { id: true, role: true, slug: true, twoFactorEnabled: true },
        });
        if (dbUser) {
          const wasEnabled = token.twoFactorEnabled === true;
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.slug = dbUser.slug;
          token.twoFactorEnabled = dbUser.twoFactorEnabled;

          if (!dbUser.twoFactorEnabled) {
            token.twoFactorVerified = true; // nothing to verify
          } else if (user || !wasEnabled) {
            // New sign-in, or 2FA was switched on since this session started: a code is owed.
            token.twoFactorVerified = false;
          }
        }
        token.require2FA = await isOrgWide2FARequired();
        token.twoFactorCheckedAt = now;
      }

      // The browser can send anything to update(); only a server-signed proof for this user + sign-in counts.
      if (trigger === "update" && session?.twoFactorProof && token.twoFactorEnabled) {
        if (verifyTwoFactorProof(session.twoFactorProof, token.id, token.sid)) {
          token.twoFactorVerified = true;
        }
      }

      token.lastActivity = now;
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
        session.user.slug = token.slug as string;
        (session as any).twoFactorEnabled = token.twoFactorEnabled ?? false;
        (session as any).twoFactorVerified = token.twoFactorVerified ?? !token.twoFactorEnabled;
        (session as any).require2FA = token.require2FA ?? false;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
  },
  secret: process.env.NEXTAUTH_SECRET,
};

async function recordFailedAttempt(email: string) {
  try {
    const dbUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, failedLoginAttempts: true },
    });
    if (!dbUser) return;

    const attempts = dbUser.failedLoginAttempts + 1;
    const data: any = { failedLoginAttempts: attempts };
    if (attempts >= LOCKOUT_THRESHOLD) {
      data.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
    }
    await prisma.user.update({ where: { id: dbUser.id }, data });
  } catch {}
}
