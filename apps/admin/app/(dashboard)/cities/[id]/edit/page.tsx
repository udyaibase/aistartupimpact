import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import { generateSlug } from '@udyaibase/utils';
import CityForm from '../../CityForm';
import { requireFormAuth } from '@/lib/api-auth';
import { formFields } from '@/lib/form-fields';
import { logAuditEvent } from '@/lib/audit-log';
import { sectionRoles } from '@/lib/section-access';

interface EditCityPageProps {
  params: Promise<{
    id: string;
  }>;
}

export const metadata: Metadata = {
  title: 'Edit City | Admin',
};

export default async function EditCityPage(props: EditCityPageProps) {
  const params = await props.params;
  const city = await prisma.indiaAICity.findUnique({
    where: { id: params.id }
  });

  if (!city) {
    notFound();
  }

  // Convert decimal properties to number for client compatibility
  const normalizedCity = {
    cityName: city.cityName,
    state: city.state,
    latitude: city.latitude ? Number(city.latitude) : null,
    longitude: city.longitude ? Number(city.longitude) : null,
    isActive: city.isActive || false,
    aliases: city.aliases || [],
  };

  async function updateCity(formData: FormData) {
    'use server';

    await requireFormAuth(sectionRoles('/cities'));
    const f = formFields(formData);

    const cityName = f.required('cityName', 300);
    if (!cityName) throw new Error('City Name is required');

    const slug = generateSlug(cityName);
    const state = f.optional('state');
    
    // Parse coordinates if provided
    const latitude = f.number('latitude', -90, 90);
    const longitude = f.number('longitude', -180, 180);

    const isActive = f.flag('isActive');

    const aliases = f.text('aliases')
      ?.split(',')
      ?.map(a => a.trim())
      ?.filter(Boolean) || [];

    await prisma.indiaAICity.update({
      where: { id: params.id },
      data: {
        cityName,
        slug,
        state,
        latitude,
        longitude,
        isActive,
        source: 'standard',
        aliases,
      },
    });

    // Also sync to City table when active
    if (isActive) {
      const existingCity = await prisma.$queryRaw<any[]>`
        SELECT id FROM "City"
        WHERE LOWER(name) = LOWER(${cityName})
          OR slug = ${slug}
        LIMIT 1
      `;

      if (existingCity.length === 0) {
        await prisma.$executeRaw`
          INSERT INTO "City" (id, slug, name, state, country, latitude, longitude, aliases, "createdAt", "updatedAt")
          VALUES (
            gen_random_uuid(),
            ${slug},
            ${cityName},
            ${state},
            'India',
            ${latitude},
            ${longitude},
            ${aliases},
            NOW(),
            NOW()
          )
          ON CONFLICT (slug) DO NOTHING
        `;
      } else {
        // Update existing City table entry
        await prisma.$executeRaw`
          UPDATE "City"
          SET name = ${cityName}, state = ${state}, aliases = ${aliases}, "updatedAt" = NOW()
          WHERE LOWER(name) = LOWER(${cityName}) OR slug = ${slug}
        `;
      }
    }

    await logAuditEvent({ action: 'UPDATE', resourceType: 'CITY', resourceName: String(formData.get('name') ?? '').slice(0, 200) });

    redirect('/cities');
  }

  return (
    <div className="p-6">
      <div className="mb-6 font-jakarta">
        <h1 className="portal-title">
          Edit City: {city.cityName}
        </h1>
        <p className="portal-subtitle">
          Update custom city name, state, active status, or coordinates.
        </p>
      </div>

      <CityForm action={updateCity} initialData={normalizedCity} />
    </div>
  );
}
