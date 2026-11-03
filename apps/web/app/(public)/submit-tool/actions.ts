'use server';

import { prisma } from '@udyaibase/database';
import { checkLocation } from '@/lib/locations';

export async function submitFreeToolAction(draft: any) {
  // The headquarters city from the standard list (with its country); anything else is left blank.
  const hq = await checkLocation({ city: typeof draft?.hqCity === 'string' ? draft.hqCity : '' });
  try {
    if (!draft.name || !draft.websiteUrl || !draft.tagline || !draft.description) {
      return { success: false, error: 'Please complete all required fields (Name, URL, Tagline, Description).' };
    }

    const slug = draft.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).substring(2, 6);

    // Fetch dynamic category or default
    const firstCategory = await prisma.toolCategory.findFirst();
    if (!firstCategory) throw new Error("No tool categories available in database.");

    // Parse pricing
    let startingPricePaise = null;
    if (draft.startingPrice && !isNaN(parseInt(draft.startingPrice))) {
      // Convert USD to INR roughly (* 83), then to Paise (* 100)
      startingPricePaise = parseInt(draft.startingPrice) * 83 * 100;
    }

    // Embed the extra data seamlessly into markdown format to ensure AI picks it up for scores
    const fullDescription = `${draft.description}
    
**Ideal Use Case:** ${draft.idealUseCase}

**Not a fit for:** ${draft.notAFitFor}`;

    const tool = await prisma.aiTool.create({
      data: {
        id: `tool_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name: draft.name,
        slug,
        tagline: draft.tagline,
        websiteUrl: draft.websiteUrl,
        logoUrl: draft.logoUrl || null,
        pricingUrl: draft.pricingUrl || null,
        description: fullDescription,
        pricingModel: draft.pricingModel,
        startingPrice: startingPricePaise,
        hasApi: draft.hasApi,
        hasMobileApp: draft.hasMobileApp,
        founderNames: draft.founderNames ? draft.founderNames.split(',').map((s: string) => s.trim()) : [],
        headquartersCity: hq.ok ? hq.city : null,
        headquartersCountry: hq.ok ? hq.country : null,
        categoryId: firstCategory.id,
        updatedAt: new Date(),

        status: 'PENDING',
        listingTier: 'FREE',
      }
    });

    // In a real flow, you'd trigger a background worker (e.g. BullMQ) for the AI Review step here.
    return { success: true, toolId: tool.id, toolSlug: tool.slug };
  } catch (error) {
    console.error('Submission Action Error:', error);
    return { success: false, error: 'Database error occurred while submitting tool.' };
  }
}
