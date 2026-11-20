import { requirePagePermission } from '@/lib/employer/page-guard';

export const metadata = { title: 'Settings' };

export default async function Guard({ children }: { children: React.ReactNode }) {
  await requirePagePermission('account.manage');
  return <>{children}</>;
}
