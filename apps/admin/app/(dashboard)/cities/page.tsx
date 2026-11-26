import { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { prisma } from '@udyaibase/database';
import CitiesList from './CitiesList';

export const metadata: Metadata = {
  title: 'Cities Registry | Admin',
  description: 'Manage custom cities and map configurations',
};

export const dynamic = 'force-dynamic';

async function getCities() {
  return await prisma.indiaAICity.findMany({
    orderBy: [
      { source: 'asc' },
      { displayOrder: 'asc' },
      { totalStartups: 'desc' }
    ]
  });
}

export default async function CitiesPage() {
  const cities = await getCities();
  
  // Serialize Decimals, BigInts, and Dates to plain JS values for the client component
  const serializedCities = cities.map(city => ({
    id: city.id,
    cityName: city.cityName,
    slug: city.slug,
    state: city.state,
    latitude: city.latitude ? Number(city.latitude) : null,
    longitude: city.longitude ? Number(city.longitude) : null,
    totalStartups: city.totalStartups,
    totalFunding: city.totalFunding ? Number(city.totalFunding) : 0,
    topSectors: city.topSectors,
    keyAccelerators: city.keyAccelerators,
    notableCompanies: city.notableCompanies,
    description: city.description,
    isFeatured: city.isFeatured,
    displayOrder: city.displayOrder,
    isActive: city.isActive,
    source: city.source || 'standard',
    aliases: city.aliases,
    createdAt: city.createdAt ? city.createdAt.toISOString() : null,
    updatedAt: city.updatedAt ? city.updatedAt.toISOString() : null,
  }));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="portal-title">
            Cities Registry
          </h1>
          <p className="portal-subtitle">
            Manage system-wide cities registry, aliases, and locations
          </p>
        </div>
        <Link
          href="/cities/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Custom City
        </Link>
      </div>

      <CitiesList initialCities={serializedCities} />
    </div>
  );
}
