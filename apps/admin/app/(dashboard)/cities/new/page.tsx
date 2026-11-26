import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import { generateSlug } from '@udyaibase/utils';
import CityForm from '../CityForm';
import { requireFormAuth } from '@/lib/api-auth';
import { formFields } from '@/lib/form-fields';
import { logAuditEvent } from '@/lib/audit-log';
import { sectionRoles } from '@/lib/section-access';

export const metadata: Metadata = {
  title: 'Add City | Admin',
};

export default function NewCityPage() {
  async function createCity(formData: FormData) {
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

    // Create in IndiaAICity table (for dropdown display)
    await prisma.indiaAICity.create({
      data: {
        cityName,
        slug,
        state,
        latitude,
        longitude,
        isActive,
        source: 'standard',
        aliases,
        // Default other fields to safe empty values
        totalStartups: 0,
        totalFunding: BigInt(0),
        topSectors: [],
        keyAccelerators: [],
        notableCompanies: [],
        description: null,
        isFeatured: false,
        displayOrder: 99,
      },
    });

    // Also sync to City table (for cityId resolution in startups)
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
      }
    }

    await logAuditEvent({ action: 'CREATE', resourceType: 'CITY', resourceName: String(formData.get('name') ?? '').slice(0, 200) });

    redirect('/cities');
  }

  return (
    <div className="p-6">
      <div className="mb-6 font-jakarta">
        <h1 className="portal-title">
          Add Custom City
        </h1>
        <p className="portal-subtitle">
          Register a standard city name and state to make it selectable across forms.
        </p>
      </div>

      <CityForm action={createCity} />
    </div>
  );
}
