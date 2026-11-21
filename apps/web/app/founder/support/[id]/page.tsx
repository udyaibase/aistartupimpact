import { requireFounderAuth } from '@/lib/founder-auth';
import SupportTicketDetail from '@/components/support/SupportTicketDetail';

export const metadata = { title: 'Support ticket' };

export default async function FounderTicketPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  await requireFounderAuth();
  return <SupportTicketDetail apiBasePath="/api/founder/support" portalPath="/founder" ticketId={params.id} />;
}
