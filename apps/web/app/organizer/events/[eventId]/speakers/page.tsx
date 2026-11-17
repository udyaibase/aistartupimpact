import CfpBoard from './CfpBoard';

export const dynamic = 'force-dynamic';

export default async function SpeakersPage(props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  return <CfpBoard eventId={eventId} />;
}
