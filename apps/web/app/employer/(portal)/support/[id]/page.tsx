import SupportTicketDetail from '@/components/support/SupportTicketDetail';

export const metadata = { title: 'Support request' };

export default async function EmployerTicketPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <SupportTicketDetail apiBasePath="/api/employer/support" portalPath="/employer" ticketId={params.id} />;
}
