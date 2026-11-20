import SupportTicketList from '@/components/support/SupportTicketList';

export const metadata = { title: 'Your tickets' };

/** The list of this workspace's tickets. Asking for help happens in one place: the Help page. */
export default function EmployerSupportPage() {
  return <SupportTicketList apiBasePath="/api/employer/support" portalPath="/employer" newTicketHref="/employer/help#report-h" />;
}
