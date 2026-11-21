import AfterEventClient from './AfterEventClient';

export const metadata = { title: 'After the event' };

export const dynamic = 'force-dynamic';

export default async function AfterEventPage(props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  return <AfterEventClient eventId={eventId} />;
}
