import BadgesClient from './BadgesClient';

export const metadata = { title: 'Badges' };

export const dynamic = 'force-dynamic';

export default async function BadgesPage(props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  return <BadgesClient eventId={eventId} />;
}
