import SeriesList from './SeriesList';

export const metadata = { title: 'Event series' };

export const dynamic = 'force-dynamic';

export default function SeriesPage() {
  return <SeriesList />;
}
