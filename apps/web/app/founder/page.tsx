import { jwtSecret } from '@/lib/jwt-secret';
import { redirect } from 'next/navigation';
import { getFounderSession } from '@/lib/founder-auth';
import { getUnifiedSession } from '@/lib/unified-auth';
import { prisma } from '@udyaibase/database';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

const USER_JWT_SECRET = jwtSecret(process.env.USER_JWT_SECRET, 'USER_JWT_SECRET');

export default async function FounderRootPage() {
  let founderId: string | null = null;

  const unifiedSession = await getUnifiedSession();
  if (unifiedSession?.founderId) {
    founderId = unifiedSession.founderId;
  }

  if (!founderId) {
    const session = await getFounderSession();
    if (session) founderId = session.userId;
  }

  if (!founderId) {
    try {
      const cookieStore = await cookies();
      const userToken = cookieStore.get('user-token')?.value;
      if (userToken) {
        const { payload } = await jwtVerify(userToken, USER_JWT_SECRET);
        const email = (payload as any).email;
        if (email) {
          const founder = await prisma.founderUser.findUnique({
            where: { email: email.toLowerCase() },
            select: { id: true, onboardingCompleted: true },
          });
          if (founder) {
            if (!founder.onboardingCompleted) {
              redirect('/founder/onboarding');
            }
            redirect('/founder/dashboard');
          }
        }
      }
    } catch {}
    redirect('/auth/login');
  }

  const founder = await prisma.founderUser.findUnique({
    where: { id: founderId },
    select: { onboardingCompleted: true },
  });

  if (!founder || !founder.onboardingCompleted) {
    redirect('/founder/onboarding');
  }

  redirect('/founder/dashboard');
}
