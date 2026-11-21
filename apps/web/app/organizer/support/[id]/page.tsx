import SupportTicketDetail from '@/components/support/SupportTicketDetail';

export const metadata = { title: 'Support request' };

export default async function OrganizerTicketPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <SupportTicketDetail apiBasePath="/api/organizer/support" portalPath="/organizer" ticketId={params.id} />;
}
