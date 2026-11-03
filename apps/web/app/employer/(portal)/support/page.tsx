import SupportTicketList from '@/components/support/SupportTicketList';

export default function EmployerSupportPage() {
  return <SupportTicketList apiBasePath="/api/employer/support" portalPath="/employer" />;
}
