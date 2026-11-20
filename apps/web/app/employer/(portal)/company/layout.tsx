import { requirePagePermission } from '@/lib/employer/page-guard';

export const metadata = { title: 'Company profile' };

export default async function Guard({ children }: { children: React.ReactNode }) {
  await requirePagePermission('company.manage');
  return <>{children}</>;
}
