import SponsorsManager from './SponsorsManager';

export const metadata = { title: 'Sponsors' };

export const dynamic = 'force-dynamic';

export default async function SponsorsPage(props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  return <SponsorsManager eventId={eventId} />;
}
