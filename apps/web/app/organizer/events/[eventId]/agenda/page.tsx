import AgendaEditor from './AgendaEditor';

export const dynamic = 'force-dynamic';

export default async function AgendaPage(props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  return <AgendaEditor eventId={eventId} />;
}
