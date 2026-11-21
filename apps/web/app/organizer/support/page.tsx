import SupportTicketList from '@/components/support/SupportTicketList';

export const metadata = { title: 'Support' };

export default function OrganizerSupportPage() {
  return <SupportTicketList apiBasePath="/api/organizer/support" portalPath="/organizer" />;
}
