import { redirect } from 'next/navigation';
import { getFounderSession } from '@/lib/founder-auth';
import { getUnifiedSession } from '@/lib/unified-auth';
import { prisma } from '@udyaibase/database';
import { cookies } from 'next/headers';
import { verifyUserTokenSession } from '@/lib/user-session';


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
      // Only a site sign-in whose session still exists (see verifyUserTokenSession).
      const live = await verifyUserTokenSession(userToken);
      if (live) {
        {
          const founder = await prisma.founderUser.findUnique({
            where: { email: live.email },
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
