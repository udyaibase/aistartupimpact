import SeriesEditor from './SeriesEditor';

export const metadata = { title: 'Series' };

export const dynamic = 'force-dynamic';

export default async function SeriesEditorPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return <SeriesEditor id={id} />;
}
